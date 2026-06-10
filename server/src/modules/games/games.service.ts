import type { Game, GameTimingExtension } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { HttpError } from '../../middleware/error.js';
import { statusFromWire, statusToWire } from '../../lib/status.js';
import { msToOffsetTriple } from '../sync/sync.service.js';
import * as groupsSvc from '../groups/groups.service.js';
import { DEFAULT_GAME_ID } from '../groups/groups.service.js';
import * as xpSvc from '../xp/xp.service.js';
import type {
  CreateGameInput,
  FinalizeGameInput,
  UpdateGameInput,
} from './games.schemas.js';

const toDate = (v: string | number | null | undefined): Date | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === 'number') return new Date(v);
  return new Date(v);
};

// Local mirror of sync.service's `offsetTripleToMs` — kept private to this
// module and intentionally tiny rather than exporting cross-module plumbing.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const tripleToMs = (t: { weeks: number; days: number; hours: number; mins: number }) =>
  t.weeks * WEEK_MS + t.days * DAY_MS + t.hours * HOUR_MS + t.mins * MIN_MS;

const offsetsFromInput = (
  raw: CreateGameInput['timingOffsets'] | UpdateGameInput['timingOffsets'],
):
  | {
      timingStartOffsetMs: number;
      timingSubmissionOffsetMs: number;
      timingEndOffsetMs: number;
    }
  | undefined => {
  if (!raw) return undefined;
  return {
    timingStartOffsetMs: tripleToMs(raw.start),
    timingSubmissionOffsetMs: tripleToMs(raw.submission),
    timingEndOffsetMs: tripleToMs(raw.end),
  };
};

const timingExtensionToWire = (
  e: Pick<GameTimingExtension, 'type' | 'prevTime' | 'nextTime' | 'happenedAt'>,
): Record<string, unknown> => {
  if (e.type === 'future_start') {
    return {
      type: e.type,
      scheduledFor: e.nextTime?.getTime() ?? null,
      setAt: e.happenedAt.getTime(),
    };
  }
  return {
    type: e.type,
    originalTime: e.prevTime?.getTime() ?? null,
    newTime: e.nextTime?.getTime() ?? null,
    extendedAt: e.happenedAt.getTime(),
  };
};

// Pull a legacy inline image out of `Game.data.image` so the wire format
// matches what the frontend has historically read. New clients should prefer
// a future `coverAssetId` once asset uploads ship; until then this keeps
// round-tripping through /api/sync stable.
const extractDataImage = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') return null;
  const v = (data as Record<string, unknown>).image;
  return typeof v === 'string' && v.length > 0 ? v : null;
};

export const toWire = (
  g: Game,
  memberProfileIds: string[] = [],
  timingExtensionRows: Array<
    Pick<GameTimingExtension, 'type' | 'prevTime' | 'nextTime' | 'happenedAt'>
  > = [],
) => ({
  id: g.id,
  name: g.name,
  description: g.description,
  rules: g.rules,
  hostGroupId: g.hostGroupId,
  hostGroupName: g.hostGroupName,
  privacy: g.privacy,
  gameType: g.gameType,
  timingMode: g.timingMode,
  status: statusToWire(g.status),
  image: extractDataImage(g.data),
  ownerProfileId: g.ownerProfileId,
  memberProfileIds,
  startTime: g.startTime?.getTime() ?? null,
  submissionCloseTime: g.submissionCloseTime?.getTime() ?? null,
  endTime: g.endTime?.getTime() ?? null,
  timingOffsets: {
    start: msToOffsetTriple(g.timingStartOffsetMs),
    submission: msToOffsetTriple(g.timingSubmissionOffsetMs),
    end: msToOffsetTriple(g.timingEndOffsetMs),
  },
  timingExtensions: timingExtensionRows.map(timingExtensionToWire),
  data: g.data,
  createdAt: g.createdAt.toISOString(),
  updatedAt: g.updatedAt.toISOString(),
});

const loadMemberIds = async (gameId: string): Promise<string[]> => {
  const rows = await prisma.gameMember.findMany({
    where: { gameId },
    select: { profileId: true },
  });
  return rows.map((r) => r.profileId);
};

const replaceMembers = async (gameId: string, nextIds: string[]): Promise<string[]> => {
  const unique = Array.from(new Set(nextIds));
  const existing = unique.length
    ? await prisma.profile.findMany({
        where: { id: { in: unique } },
        select: { id: true },
      })
    : [];
  const valid = existing.map((p) => p.id);
  await prisma.$transaction([
    prisma.gameMember.deleteMany({ where: { gameId } }),
    ...(valid.length
      ? [
          prisma.gameMember.createMany({
            data: valid.map((profileId) => ({ gameId, profileId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
  return valid;
};

const loadTimingExtensions = async (gameId: string) =>
  prisma.gameTimingExtension.findMany({
    where: { gameId },
    select: { type: true, prevTime: true, nextTime: true, happenedAt: true },
    orderBy: { happenedAt: 'asc' },
  });

/**
 * Append-only reconciliation for the granular endpoints. Same semantics as
 * the sync.service version: dedupe by content key, never delete history.
 */
const appendTimingExtensions = async (
  gameId: string,
  entries: NonNullable<CreateGameInput['timingExtensions']>,
): Promise<void> => {
  if (!entries.length) return;
  const incoming = entries
    .map((e) => {
      const happenedAt =
        toDate(e.extendedAt ?? null) ?? toDate(e.setAt ?? null) ?? null;
      if (!happenedAt) return null;
      const prevTime = toDate(e.originalTime ?? null) ?? null;
      const nextTime =
        toDate(e.newTime ?? null) ?? toDate(e.scheduledFor ?? null) ?? null;
      return { type: e.type, prevTime, nextTime, happenedAt };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  if (!incoming.length) return;

  const existing = await prisma.gameTimingExtension.findMany({
    where: { gameId },
    select: { type: true, prevTime: true, nextTime: true, happenedAt: true },
  });
  const keyOf = (e: {
    type: string;
    prevTime: Date | null;
    nextTime: Date | null;
    happenedAt: Date;
  }) =>
    [
      e.type,
      e.prevTime?.getTime() ?? '',
      e.nextTime?.getTime() ?? '',
      e.happenedAt.getTime(),
    ].join('|');
  const seen = new Set(existing.map(keyOf));
  const fresh = incoming.filter((e) => !seen.has(keyOf(e)));
  if (!fresh.length) return;
  await prisma.gameTimingExtension.createMany({
    data: fresh.map((e) => ({
      gameId,
      type: e.type as Prisma.GameTimingExtensionCreateManyInput['type'],
      prevTime: e.prevTime,
      nextTime: e.nextTime,
      happenedAt: e.happenedAt,
    })),
  });
};

const ensureOwned = async (id: string, profileId: string): Promise<Game> => {
  const game = await prisma.game.findUnique({ where: { id } });
  if (!game) throw new HttpError(404, 'Game not found');
  if (game.ownerProfileId && game.ownerProfileId !== profileId) {
    throw new HttpError(403, 'Forbidden');
  }
  return game;
};

export const list = async (
  profileId: string,
  filters: { status: string; hostGroupId?: string },
) => {
  const where: Record<string, unknown> = {
    OR: [
      { ownerProfileId: profileId },
      { memberships: { some: { profileId } } },
      { privacy: 'public', status: 'ACTIVE' },
    ],
  };
  if (filters.status !== 'all') where.status = statusFromWire(filters.status);
  if (filters.hostGroupId) where.hostGroupId = filters.hostGroupId;
  const rows = await prisma.game.findMany({ where, orderBy: { createdAt: 'asc' } });
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);

  const [memberRows, extensionRows] = await Promise.all([
    prisma.gameMember.findMany({
      where: { gameId: { in: ids } },
      select: { gameId: true, profileId: true },
    }),
    prisma.gameTimingExtension.findMany({
      where: { gameId: { in: ids } },
      select: {
        gameId: true,
        type: true,
        prevTime: true,
        nextTime: true,
        happenedAt: true,
      },
      orderBy: { happenedAt: 'asc' },
    }),
  ]);

  const membersByGame = new Map<string, string[]>();
  for (const m of memberRows) {
    const arr = membersByGame.get(m.gameId);
    if (arr) arr.push(m.profileId);
    else membersByGame.set(m.gameId, [m.profileId]);
  }
  const extensionsByGame = new Map<
    string,
    Array<Pick<GameTimingExtension, 'type' | 'prevTime' | 'nextTime' | 'happenedAt'>>
  >();
  for (const e of extensionRows) {
    const { gameId, ...rest } = e;
    const arr = extensionsByGame.get(gameId);
    if (arr) arr.push(rest);
    else extensionsByGame.set(gameId, [rest]);
  }

  return rows.map((r) =>
    toWire(r, membersByGame.get(r.id) ?? [], extensionsByGame.get(r.id) ?? []),
  );
};

export const getById = async (id: string, profileId: string) => {
  const game = await prisma.game.findUnique({ where: { id } });
  if (!game) throw new HttpError(404, 'Game not found');
  if (game.privacy === 'private' && game.ownerProfileId !== profileId) {
    const member = await prisma.gameMember.findUnique({
      where: { gameId_profileId: { gameId: id, profileId } },
      select: { gameId: true },
    });
    if (!member) throw new HttpError(403, 'Forbidden');
  }
  const [memberIds, extensions] = await Promise.all([
    loadMemberIds(id),
    loadTimingExtensions(id),
  ]);
  return toWire(game, memberIds, extensions);
};

export const join = async (id: string, profileId: string) => {
  const game = await prisma.game.findUnique({ where: { id } });
  if (!game) throw new HttpError(404, 'Game not found');
  if (game.status !== 'ACTIVE') throw new HttpError(409, 'Game is not active');
  if (game.privacy === 'private' && game.ownerProfileId !== profileId) {
    throw new HttpError(403, 'GAME_PRIVATE');
  }

  await prisma.gameMember.upsert({
    where: { gameId_profileId: { gameId: id, profileId } },
    create: { gameId: id, profileId },
    update: {},
  });

  const [memberIds, extensions] = await Promise.all([
    loadMemberIds(id),
    loadTimingExtensions(id),
  ]);
  return toWire(game, memberIds, extensions);
};

export const create = async (profileId: string, input: CreateGameInput) => {
  // Phase 2 gate: if a hostGroupId is supplied, the caller's profile must be
  // a member of that group (owner counts implicitly). Prevents a stale or
  // tampered client from creating games inside groups it hasn't joined.
  if (input.hostGroupId) {
    const allowed = await groupsSvc.isMember(input.hostGroupId, profileId);
    if (!allowed) {
      throw new HttpError(403, 'NOT_GROUP_MEMBER');
    }
  }

  const offsets = offsetsFromInput(input.timingOffsets);
  // Fold the legacy top-level `image` into `data.image` so it persists in
  // a real column and survives /api/sync snapshot refreshes.
  const mergedData: Record<string, unknown> = { ...((input.data as Record<string, unknown>) ?? {}) };
  if (input.image !== undefined) {
    if (input.image === null || input.image === '') delete mergedData.image;
    else mergedData.image = input.image;
  }
  const created = await prisma.game.create({
    data: {
      ownerProfileId: profileId,
      name: input.name,
      description: input.description ?? null,
      rules: input.rules ?? null,
      hostGroupId: input.hostGroupId ?? null,
      hostGroupName: input.hostGroupName ?? null,
      privacy: input.privacy ?? 'public',
      gameType: input.gameType ?? 'book',
      timingMode: input.timingMode ?? 'infinite',
      status: statusFromWire(input.status),
      startTime: toDate(input.startTime) ?? null,
      submissionCloseTime: toDate(input.submissionCloseTime) ?? null,
      endTime: toDate(input.endTime) ?? null,
      ...(offsets ?? {}),
      data: mergedData as object,
    },
  });
  let memberIds: string[] = [];
  if (input.memberProfileIds) {
    memberIds = await replaceMembers(created.id, input.memberProfileIds);
  }
  if (input.timingExtensions?.length) {
    await appendTimingExtensions(created.id, input.timingExtensions);
  }
  const extensions = await loadTimingExtensions(created.id);
  // Re-read to pick up updated offset columns even when caller omitted them
  // (column defaults of 0). Avoids one extra query in the common path.
  return toWire(created, memberIds, extensions);
};

export const update = async (id: string, profileId: string, input: UpdateGameInput) => {
  if (id === DEFAULT_GAME_ID) {
    throw new HttpError(403, 'SYSTEM_DEFAULT_IMMUTABLE');
  }
  const existing = await ensureOwned(id, profileId);
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.rules !== undefined) data.rules = input.rules;
  if (input.hostGroupId !== undefined) data.hostGroupId = input.hostGroupId;
  if (input.hostGroupName !== undefined) data.hostGroupName = input.hostGroupName;
  if (input.privacy !== undefined) data.privacy = input.privacy;
  if (input.gameType !== undefined) data.gameType = input.gameType;
  if (input.timingMode !== undefined) data.timingMode = input.timingMode;
  if (input.status !== undefined) data.status = statusFromWire(input.status);
  if (input.startTime !== undefined) data.startTime = toDate(input.startTime);
  if (input.submissionCloseTime !== undefined) data.submissionCloseTime = toDate(input.submissionCloseTime);
  if (input.endTime !== undefined) data.endTime = toDate(input.endTime);
  // Build the next data blob layering legacy `image` over the existing or
  // caller-provided base, so a save that only edits text fields cannot
  // accidentally clobber the stored image.
  let nextData: Record<string, unknown> | undefined;
  if (input.data !== undefined) {
    nextData = { ...(input.data as Record<string, unknown>) };
  }
  if (input.image !== undefined) {
    if (!nextData) nextData = { ...((existing.data as Record<string, unknown>) ?? {}) };
    if (input.image === null || input.image === '') delete nextData.image;
    else nextData.image = input.image;
  }
  if (nextData !== undefined) data.data = nextData;
  const offsets = offsetsFromInput(input.timingOffsets);
  if (offsets) Object.assign(data, offsets);

  const updated = await prisma.game.update({ where: { id }, data });
  if (input.memberProfileIds) {
    await replaceMembers(id, input.memberProfileIds);
  }
  if (input.timingExtensions?.length) {
    await appendTimingExtensions(id, input.timingExtensions);
  }
  const [memberIds, extensions] = await Promise.all([
    loadMemberIds(id),
    loadTimingExtensions(id),
  ]);
  return toWire(updated, memberIds, extensions);
};

export const softRemove = async (id: string, profileId: string, mode: 'deleted' | 'burned' | 'finished' = 'deleted') => {
  if (id === DEFAULT_GAME_ID) {
    throw new HttpError(403, 'SYSTEM_DEFAULT_IMMUTABLE');
  }
  await ensureOwned(id, profileId);
  const updated = await prisma.game.update({
    where: { id },
    data: { status: statusFromWire(mode) },
  });
  const [memberIds, extensions] = await Promise.all([
    loadMemberIds(id),
    loadTimingExtensions(id),
  ]);
  return toWire(updated, memberIds, extensions);
};

type Placement = {
  rank: 1 | 2 | 3;
  creationId: string;
  ownerProfileId: string | null;
  voteCount: number;
  xpAwarded: number;
  alreadyAwarded: boolean;
};

const PLACEMENT_KIND = ['placement_1', 'placement_2', 'placement_3'] as const;

/**
 * Finalize a game: pick top-3 creations by vote count, award placement XP
 * to each creation's owner atomically, mark the creations with award
 * metadata, and persist the placements on the game itself.
 *
 * Authorization: only the game owner may finalize.
 *
 * Idempotent: a second call returns the existing placements without
 * re-awarding (server-side via Game.data.finalizedAt; XP layer also
 * idempotent on (kind, refId) where refId = `${gameId}:${creationId}`).
 *
 * Trust boundary: caller submits vote counts. Until votes migrate to the
 * server, the contract is "the game owner doesn't lie about votes". XP
 * itself is still tamper-proof on the recipient side because the awards
 * go through the same xp ledger as everything else.
 */
export const finalize = async (
  gameId: string,
  callerProfileId: string,
  input: FinalizeGameInput,
) => {
  const game = await ensureOwned(gameId, callerProfileId);

  // Idempotency check via the existing Json bag — avoids a schema migration.
  const existingData = (game.data && typeof game.data === 'object' ? (game.data as Record<string, unknown>) : {}) as {
    finalizedAt?: number;
    placements?: Placement[];
    [k: string]: unknown;
  };
  if (existingData.finalizedAt && Array.isArray(existingData.placements)) {
    return {
      gameId,
      finalizedAt: existingData.finalizedAt,
      placements: existingData.placements,
      alreadyFinalized: true,
    };
  }

  // Validate creation ids and load owner ids in one pass. The frontend may
  // submit creations that have been deleted or that don't actually belong to
  // this game; we silently drop those rather than 400-ing the whole call.
  const submittedIds = input.rankings.map((r) => r.creationId);
  const creationRows = submittedIds.length
    ? await prisma.creation.findMany({
        where: { id: { in: submittedIds }, hostGameId: gameId },
        select: { id: true, ownerProfileId: true, status: true },
      })
    : [];
  const validCreations = new Map(
    creationRows
      .filter((c) => c.status !== 'DELETED' && c.status !== 'BURNED')
      .map((c) => [c.id, c]),
  );

  const ranked = input.rankings
    .filter((r) => validCreations.has(r.creationId))
    .sort((a, b) => b.voteCount - a.voteCount)
    .slice(0, 3);

  const placements: Placement[] = [];
  for (let i = 0; i < ranked.length; i += 1) {
    const r = ranked[i]!;
    const c = validCreations.get(r.creationId)!;
    const kind = PLACEMENT_KIND[i]!;
    const xpAmount = [5, 4, 3][i]!;
    let alreadyAwarded = false;
    if (c.ownerProfileId) {
      const result = await xpSvc.awardToProfile(c.ownerProfileId, kind, `${gameId}:${c.id}`);
      alreadyAwarded = result.alreadyAwarded;
    }
    placements.push({
      rank: (i + 1) as 1 | 2 | 3,
      creationId: c.id,
      ownerProfileId: c.ownerProfileId,
      voteCount: r.voteCount,
      xpAwarded: c.ownerProfileId && !alreadyAwarded ? xpAmount : 0,
      alreadyAwarded,
    });
  }

  const finalizedAt = Date.now();
  const updatedData = { ...existingData, finalizedAt, placements };

  // Persist on the game and decorate the creations in a single transaction.
  await prisma.$transaction([
    prisma.game.update({
      where: { id: gameId },
      data: { data: updatedData },
    }),
    ...placements.map((p) =>
      prisma.creation.update({
        where: { id: p.creationId },
        data: {
          data: {
            // Merge into existing creation.data — Prisma doesn't deep-merge
            // Json automatically, so the caller-side reconciliation also
            // sets these on the wire. Acceptable: read paths use these
            // top-level keys regardless.
            awardRank: p.rank,
            awardCompetition: game.name,
            awardedAt: finalizedAt,
            awardGameId: gameId,
          },
        },
      }),
    ),
  ]);

  return {
    gameId,
    finalizedAt,
    placements,
    alreadyFinalized: false,
  };
};
