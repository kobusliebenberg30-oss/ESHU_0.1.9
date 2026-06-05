import { Prisma } from '@prisma/client';
import type {
  Creation,
  Game,
  GameTimingExtension,
  Group,
  Profile,
  UserSetting,
} from '@prisma/client';
import { prisma } from '../../db/client.js';
import { statusFromWire, statusToWire } from '../../lib/status.js';
import {
  DEFAULT_GAME_ID,
  DEFAULT_GROUP_ID,
  ensureDefaultOnboardingContent,
} from '../groups/groups.service.js';
import { awardToProfile as xpAwardToProfile } from '../xp/xp.service.js';

/**
 * Bulk replace within the scope of a User + active Profile.
 *
 * Semantics:
 * - Each entity carries an `id`. We upsert by id.
 * - Entities present in the payload are created/updated.
 * - Entities NOT in the payload are LEFT UNTOUCHED on the server (we never
 *   hard-delete, and clients use status='deleted'|'burned' to soft-delete).
 *   This avoids the "device with stale state wipes server" failure mode.
 * - All ownership is forced to the user's active profile, so a malicious or
 *   stale payload cannot reattribute another profile's data.
 */
export interface SyncPayload {
  tables?: {
    groups?: unknown[];
    games?: unknown[];
    creations?: unknown[];
    profiles?: unknown[];
  };
  values?: {
    uiTheme?: 'light' | 'dark';
    primaryGroupId?: string | null;
    currentProfileId?: string | null;
    data?: Record<string, unknown>;
  };
}

const asString = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

const asNullableString = (v: unknown): string | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === 'string') return v;
  return undefined;
};

const asInt = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const asBool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const asStringArray = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const x of v) if (typeof x === 'string' && x.length > 0) out.push(x);
  return out;
};

/**
 * Replace the membership set for a parent (group or game) with the provided
 * profile ids. Only profiles that actually exist are linked. No-op if
 * `nextIds` is undefined (caller didn't include the field).
 */
const reconcileMembership = async (
  tx: Prisma.TransactionClient,
  kind: 'group' | 'game',
  parentId: string,
  nextIds: string[] | undefined,
): Promise<number | undefined> => {
  if (nextIds === undefined) return undefined;
  const unique = Array.from(new Set(nextIds));
  // Only link to profiles that exist (silently drop dangling ids).
  const existing = unique.length
    ? await tx.profile.findMany({
        where: { id: { in: unique } },
        select: { id: true },
      })
    : [];
  const validIds = new Set(existing.map((p: { id: string }) => p.id));

  if (kind === 'group') {
    await tx.groupMember.deleteMany({ where: { groupId: parentId } });
    if (validIds.size) {
      await tx.groupMember.createMany({
        data: Array.from(validIds).map((profileId) => ({ groupId: parentId, profileId })),
        skipDuplicates: true,
      });
    }
  } else {
    await tx.gameMember.deleteMany({ where: { gameId: parentId } });
    if (validIds.size) {
      await tx.gameMember.createMany({
        data: Array.from(validIds).map((profileId) => ({ gameId: parentId, profileId })),
        skipDuplicates: true,
      });
    }
  }
  return validIds.size;
};

// ---------- Timing helpers ----------
//
// Wire shape (legacy frontend):
//   timingOffsets: {
//     start:      { weeks, days, hours, mins },
//     submission: { weeks, days, hours, mins },
//     end:        { weeks, days, hours, mins },
//   }
// Storage: three Int columns holding the durations in milliseconds.

interface TimingOffset {
  weeks: number;
  days: number;
  hours: number;
  mins: number;
}
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

/** Coerce a possibly-malformed { weeks, days, hours, mins } triple to a non-negative ms total. */
const offsetTripleToMs = (raw: unknown): number => {
  const o = asObject(raw);
  const ms =
    Math.max(0, asInt(o.weeks, 0)) * WEEK_MS +
    Math.max(0, asInt(o.days, 0)) * DAY_MS +
    Math.max(0, asInt(o.hours, 0)) * HOUR_MS +
    Math.max(0, asInt(o.mins, 0)) * MIN_MS;
  return ms;
};

/** Inverse: ms total → { weeks, days, hours, mins }, lossless for whole-minute values. */
export const msToOffsetTriple = (ms: number): TimingOffset => {
  let remaining = Math.max(0, ms || 0);
  const weeks = Math.floor(remaining / WEEK_MS);
  remaining -= weeks * WEEK_MS;
  const days = Math.floor(remaining / DAY_MS);
  remaining -= days * DAY_MS;
  const hours = Math.floor(remaining / HOUR_MS);
  remaining -= hours * HOUR_MS;
  const mins = Math.floor(remaining / MIN_MS);
  return { weeks, days, hours, mins };
};

/**
 * Read the legacy `timingOffsets` payload from a wire game and return
 * `{ start, submission, end }` ms tuples. Returns `undefined` when the
 * caller didn't include the field at all (no-op upsert), and `null`-ish
 * tuple when the value is malformed (treated as zeros).
 */
const readTimingOffsetsMs = (
  raw: unknown,
):
  | { start: number; submission: number; end: number }
  | undefined => {
  if (raw === undefined) return undefined;
  const o = asObject(raw);
  return {
    start: offsetTripleToMs(o.start),
    submission: offsetTripleToMs(o.submission),
    end: offsetTripleToMs(o.end),
  };
};

/**
 * Append-only reconciliation for `timingExtensions`. The legacy frontend
 * re-PUTs the entire array on every save, but each entry is a once-only
 * historical event — we must NOT lose history if a payload accidentally
 * omits older entries, and we must NOT duplicate entries on re-PUT. Strategy:
 *
 *  1. Read existing extension rows for this game.
 *  2. Build a content-key for each (type + happenedAt + prevTime + nextTime).
 *  3. Insert only entries from the payload whose key isn't already present.
 *
 * `nextEntries === undefined` means the caller didn't include the field at
 * all → no-op. An explicit empty array also means no-op (frontend setting
 * extensions to [] should not wipe server history).
 */
const reconcileTimingExtensions = async (
  tx: Prisma.TransactionClient,
  gameId: string,
  nextEntries: unknown,
): Promise<void> => {
  if (!Array.isArray(nextEntries) || nextEntries.length === 0) return;

  const VALID_TYPES = new Set([
    'start_extended',
    'submission_extended',
    'end_extended',
    'future_start',
  ]);

  const incoming: Array<{
    type: string;
    prevTime: Date | null;
    nextTime: Date | null;
    happenedAt: Date;
  }> = [];

  for (const raw of nextEntries) {
    const o = asObject(raw);
    const type = asString(o.type);
    if (!type || !VALID_TYPES.has(type)) continue;

    // happenedAt is `extendedAt` for *_extended events, `setAt` for future_start.
    const happenedAt = asDate(o.extendedAt) ?? asDate(o.setAt);
    if (!happenedAt) continue;

    const prevTime = asDate(o.originalTime);
    const nextTime = asDate(o.newTime) ?? asDate(o.scheduledFor);

    incoming.push({ type, prevTime, nextTime, happenedAt });
  }

  if (!incoming.length) return;

  const existing = await tx.gameTimingExtension.findMany({
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

  await tx.gameTimingExtension.createMany({
    data: fresh.map((e) => ({
      gameId,
      type: e.type as Prisma.GameTimingExtensionCreateManyInput['type'],
      prevTime: e.prevTime,
      nextTime: e.nextTime,
      happenedAt: e.happenedAt,
    })),
  });
};

/**
 * Pick everything from `o` that is NOT in `known` and merge it with `o.data`
 * (if any). This preserves legacy frontend fields like `image`, `liked`,
 * `followed`, `memberProfileIds`, `timingOffsets`, etc. without forcing them
 * to be modeled as columns.
 */
const collectExtras = (
  o: Record<string, unknown>,
  known: ReadonlySet<string>,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...asObject(o.data) };
  for (const [k, v] of Object.entries(o)) {
    if (k === 'data') continue;
    if (known.has(k)) continue;
    merged[k] = v;
  }
  return merged;
};

/**
 * Layer the bulk-sync incoming `data` blob on top of whatever is already
 * stored, so partial snapshots can never wipe pre-existing keys.
 *
 * Why this exists: the frontend pushes whole-table snapshots through PUT
 * /api/sync. Different pages / different code paths construct rows with
 * different subsets of legacy fields (e.g. one screen sends `image`,
 * another doesn't). If we replaced `data` wholesale on every upsert, the
 * narrower snapshot would silently clobber the richer one — which is
 * exactly the "image disappears after save" platform-wide bug.
 *
 * Merge semantics:
 *   - existingData provides the baseline.
 *   - incomingData (from `collectExtras`) wins per-key, including explicit
 *     `null` / `''` clears (still useful for the "remove this image" flow).
 */
const mergeRowData = (
  existingData: unknown,
  incomingData: Record<string, unknown>,
): Record<string, unknown> => {
  const existing =
    existingData && typeof existingData === 'object' && !Array.isArray(existingData)
      ? (existingData as Record<string, unknown>)
      : {};
  return { ...existing, ...incomingData };
};

const GROUP_KNOWN: ReadonlySet<string> = new Set([
  'id', 'data', 'name', 'description', 'type', 'privacy', 'status',
  'isSystemDefault', 'members', 'ownerProfileId', 'createdAt', 'updatedAt',
  'coverAssetId',
  // Members live in their own table now; exclude from JSON catch-all.
  'memberProfileIds',
]);
const GAME_KNOWN: ReadonlySet<string> = new Set([
  'id', 'data', 'name', 'description', 'rules', 'hostGroupId', 'hostGroupName',
  'privacy', 'gameType', 'timingMode', 'status', 'startTime', 'submissionCloseTime',
  'endTime', 'ownerProfileId', 'createdAt', 'updatedAt',
  'memberProfileIds',
  // Members live in GameMember; offsets in dedicated columns; extensions in
  // GameTimingExtension. Exclude from the JSON catch-all so they don't leak
  // back into `data` and double-up.
  'timingOffsets',
  'timingExtensions',
]);
const CREATION_KNOWN: ReadonlySet<string> = new Set([
  'id', 'data', 'name', 'description', 'devices', 'tags', 'dateMade',
  'hostGameId', 'imageAssetId', 'status', 'timestamp', 'ownerProfileId',
  'createdAt', 'updatedAt',
]);
const PROFILE_KNOWN: ReadonlySet<string> = new Set([
  'id', 'data', 'userId', 'name', 'description', 'xpPoints', 'avatarAssetId',
  'createdAt', 'updatedAt',
]);

const asDate = (v: unknown): Date | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

export const bulkReplace = async (userId: string, profileId: string, payload: SyncPayload) => {
  const groups = Array.isArray(payload.tables?.groups) ? payload.tables!.groups! : [];
  const games = Array.isArray(payload.tables?.games) ? payload.tables!.games! : [];
  const creations = Array.isArray(payload.tables?.creations) ? payload.tables!.creations! : [];
  const profiles = Array.isArray(payload.tables?.profiles) ? payload.tables!.profiles! : [];

  // Onboarding XP parity: when the bulk sync path materialises default-group
  // or default-game membership for the caller, mirror the XP award the
  // explicit `/api/groups/group_default/join` endpoint performs. Without
  // this, a user joined via legacy snapshot push would end up at 0 XP and
  // the `comments` unlock would never trigger after a single creation
  // upload (1 XP). Idempotent on (game_created, game_default).
  let touchedDefaultMembership = false;

  // The bulk apply runs as a single interactive transaction with many
  // sequential per-row queries (profiles → groups → games → creations →
  // settings, plus membership reconciliation and onboarding healing). On
  // Vercel + the Supabase pooler each round-trip carries real network
  // latency (a plain GET /api/sync already takes ~3–4s), so Prisma's DEFAULT
  // 5s interactive-transaction timeout is easily exceeded once an account has
  // accumulated a handful of groups/games/creations. When it expires
  // mid-flight the next query fails with "Transaction already closed /
  // Transaction not found", the PUT 500s, and the save is silently lost —
  // the "new groups/games don't show up in YOUR GAMES/GROUPS" report. The
  // function's maxDuration is 60s, so a 30s transaction budget leaves ample
  // headroom while preventing runaway holds.
  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
    // ---------- profiles (only those owned by this user) ----------
    for (const raw of profiles) {
      const o = asObject(raw);
      const id = asString(o.id);
      if (!id) continue;
      // Verify ownership before touch; never reassign profiles cross-user.
      const existing = await tx.profile.findFirst({
        where: { id, userId },
        select: { id: true, xpPoints: true, data: true },
      });
      if (!existing) continue;
      await tx.profile.update({
        where: { id },
        data: {
          name: asString(o.name) ?? 'Player',
          description: asNullableString(o.description) ?? null,
          // XP is server-authoritative. Bulk sync may replay a stale local
          // profile with xpPoints=0 during login hydration; never let that
          // clobber XP already awarded by /api/xp/award.
          xpPoints: Math.max(existing.xpPoints, asInt(o.xpPoints, existing.xpPoints)),
          // Only touch avatarAssetId when the caller actually sent it (incl.
          // null for explicit clear). Omitting the field leaves the existing
          // attached avatar intact — mirrors the granular PATCH contract.
          ...(o.avatarAssetId !== undefined
            ? { avatarAssetId: asNullableString(o.avatarAssetId) ?? null }
            : {}),
          data: mergeRowData(existing.data, collectExtras(o, PROFILE_KNOWN)) as object,
        },
      });
    }

    // ---------- groups ----------
    for (const raw of groups) {
      const o = asObject(raw);
      const id = asString(o.id);
      if (!id) continue;

      // Resolve the existing row up-front; we also need to know whether this
      // is a system-default group so we can apply the multi-user safe path
      // (no single user can own it, membership reconciles additively).
      const existingGroup = await tx.group.findUnique({
        where: { id },
        select: { ownerProfileId: true, isSystemDefault: true, data: true },
      });
      const incomingSystemDefault = asBool(o.isSystemDefault, false) || id === DEFAULT_GROUP_ID;
      const isSystemGroup =
        (existingGroup?.isSystemDefault ?? false) ||
        (existingGroup ? existingGroup.ownerProfileId === null : false) ||
        incomingSystemDefault;

      // Cross-profile takeover guard: only applies to NON-system groups.
      if (
        !isSystemGroup &&
        existingGroup &&
        existingGroup.ownerProfileId &&
        existingGroup.ownerProfileId !== profileId
      ) {
        continue;
      }

      const memberIdsInput = asStringArray(o.memberProfileIds);
      const baseFields = {
        name: asString(o.name) ?? 'Untitled',
        description: asNullableString(o.description) ?? null,
        type: asString(o.type) ?? 'social',
        privacy: asString(o.privacy) ?? 'public',
        status: statusFromWire(asString(o.status) ?? 'active'),
        // Only touch coverAssetId when the caller actually sent it. Same
        // partial-update semantics as the granular PATCH.
        ...(o.coverAssetId !== undefined
          ? { coverAssetId: asNullableString(o.coverAssetId) ?? null }
          : {}),
        data: mergeRowData(existingGroup?.data, collectExtras(o, GROUP_KNOWN)) as object,
      };

      if (isSystemGroup) {
        // System-default groups have no single owner; every user can join.
        // The membership table is the source of truth and is reconciled
        // ADDITIVELY so one user's sync push cannot wipe another user's
        // membership. Per-row ownership/identity fields are NOT overwritten.
        if (!existingGroup) {
          await tx.group.create({
            data: {
              id,
              ...baseFields,
              ownerProfileId: null,
              isSystemDefault: true,
              members: 0,
            },
          });
        } else {
          await tx.group.update({
            where: { id },
            data: {
              ...baseFields,
              // Force the system flag true once we treat it as system; never
              // demote it. ownerProfileId stays null.
              isSystemDefault: true,
            },
          });
        }
        if (memberIdsInput && memberIdsInput.includes(profileId)) {
          if (id === DEFAULT_GROUP_ID) {
            await ensureDefaultOnboardingContent(profileId, tx);
            touchedDefaultMembership = true;
          }
          // Idempotent join for the caller; never touches anyone else.
          await tx.groupMember.upsert({
            where: { groupId_profileId: { groupId: id, profileId } },
            create: { groupId: id, profileId },
            update: {},
          });
        }
        const total = await tx.groupMember.count({ where: { groupId: id } });
        await tx.group.update({ where: { id }, data: { members: total } });
      } else {
        const data = {
          ...baseFields,
          ownerProfileId: profileId,
          isSystemDefault: false,
          members: memberIdsInput ? memberIdsInput.length : Math.max(0, asInt(o.members, 0)),
        };
        await tx.group.upsert({ where: { id }, create: { id, ...data }, update: data });
        const reconciled = await reconcileMembership(tx, 'group', id, memberIdsInput);
        if (reconciled !== undefined) {
          await tx.group.update({ where: { id }, data: { members: reconciled } });
        }
      }
    }

    // ---------- games ----------
    for (const raw of games) {
      const o = asObject(raw);
      const id = asString(o.id);
      if (!id) continue;
      const memberIdsInput = asStringArray(o.memberProfileIds);
      if (id === DEFAULT_GAME_ID) {
        const callerIsMember = !!(memberIdsInput && memberIdsInput.includes(profileId));
        await ensureDefaultOnboardingContent(
          callerIsMember ? profileId : undefined,
          tx,
        );
        if (callerIsMember) touchedDefaultMembership = true;
        continue;
      }
      const existingGame = await tx.game.findUnique({
        where: { id },
        select: { ownerProfileId: true, data: true },
      });
      if (existingGame && existingGame.ownerProfileId && existingGame.ownerProfileId !== profileId) continue;

      const offsetsMs = readTimingOffsetsMs(o.timingOffsets);

      const data: Prisma.GameUncheckedCreateInput = {
        ownerProfileId: profileId,
        hostGroupId: asNullableString(o.hostGroupId) ?? null,
        hostGroupName: asNullableString(o.hostGroupName) ?? null,
        name: asString(o.name) ?? 'Untitled',
        description: asNullableString(o.description) ?? null,
        rules: asNullableString(o.rules) ?? null,
        privacy: asString(o.privacy) ?? 'public',
        gameType: asString(o.gameType) ?? 'book',
        timingMode: asString(o.timingMode) ?? 'infinite',
        status: statusFromWire(asString(o.status) ?? 'active'),
        startTime: asDate(o.startTime),
        submissionCloseTime: asDate(o.submissionCloseTime),
        endTime: asDate(o.endTime),
        // Only write offset columns when the caller actually included them;
        // otherwise let the column @default(0) stand on create and leave the
        // existing values untouched on update.
        ...(offsetsMs && {
          timingStartOffsetMs: offsetsMs.start,
          timingSubmissionOffsetMs: offsetsMs.submission,
          timingEndOffsetMs: offsetsMs.end,
        }),
        data: mergeRowData(existingGame?.data, collectExtras(o, GAME_KNOWN)) as object,
      };
      await tx.game.upsert({ where: { id }, create: { id, ...data }, update: data });
      await reconcileMembership(tx, 'game', id, memberIdsInput);
      await reconcileTimingExtensions(tx, id, o.timingExtensions);
    }

    // ---------- creations ----------
    for (const raw of creations) {
      const o = asObject(raw);
      const id = asString(o.id);
      if (!id) continue;
      const existingCreation = await tx.creation.findUnique({
        where: { id },
        select: { ownerProfileId: true, data: true },
      });
      if (existingCreation && existingCreation.ownerProfileId && existingCreation.ownerProfileId !== profileId) continue;
      const data = {
        ownerProfileId: profileId,
        hostGameId: asNullableString(o.hostGameId) ?? null,
        name: asString(o.name) ?? 'Untitled',
        description: asNullableString(o.description) ?? null,
        devices: asNullableString(o.devices) ?? null,
        tags: asNullableString(o.tags) ?? null,
        dateMade: asNullableString(o.dateMade) ?? null,
        imageAssetId: asNullableString(o.imageAssetId) ?? null,
        status: statusFromWire(asString(o.status) ?? 'active'),
        timestamp: BigInt(asInt(o.timestamp, Date.now())),
        data: mergeRowData(existingCreation?.data, collectExtras(o, CREATION_KNOWN)) as object,
      };
      await tx.creation.upsert({ where: { id }, create: { id, ...data }, update: data });
    }

    // ---------- values / settings ----------
    if (payload.values) {
      const v = payload.values as Record<string, unknown>;
      // Top-level fields explicitly modeled as columns.
      const KNOWN_VALUE_KEYS = new Set([
        'uiTheme',
        'primaryGroupId',
        'currentProfileId',
        'data',
      ]);
      // Any other top-level value (e.g. readMessageIds_<pid>,
      // earnedMilestones_<pid>, creationUploadUnlocked_<pid>,
      // xpHistoryByProfileId, primaryGroupByProfileId, etc.) is merged into
      // UserSetting.data so it round-trips on the next /api/sync pull. Without
      // this, those flat keys are silently dropped by the zod schema or by the
      // upsert payload, causing onboarding messages to "reset" on reload.
      const incomingData = (v.data && typeof v.data === 'object' && !Array.isArray(v.data))
        ? (v.data as Record<string, unknown>)
        : {};
      const extras: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(v)) {
        if (KNOWN_VALUE_KEYS.has(key)) continue;
        extras[key] = value;
      }
      const existing = await tx.userSetting.findUnique({ where: { userId }, select: { data: true } });
      const existingData = (existing?.data && typeof existing.data === 'object' && !Array.isArray(existing.data))
        ? (existing.data as Record<string, unknown>)
        : {};
      const mergedData: Record<string, unknown> = {
        ...existingData,
        ...extras,
        ...incomingData,
      };
      await tx.userSetting.upsert({
        where: { userId },
        create: {
          userId,
          uiTheme: (v.uiTheme as 'light' | 'dark') ?? 'light',
          primaryGroupId: (v.primaryGroupId as string | null | undefined) ?? null,
          currentProfileId: profileId,
          data: mergedData as object,
        },
        update: {
          ...(v.uiTheme !== undefined ? { uiTheme: v.uiTheme as 'light' | 'dark' } : {}),
          ...(v.primaryGroupId !== undefined ? { primaryGroupId: v.primaryGroupId as string | null } : {}),
          currentProfileId: profileId,
          data: mergedData as object,
        },
      });
    }
    },
    { maxWait: 15000, timeout: 30000 },
  );

  // Onboarding XP parity (post-commit). Mirrors `groups.service.join` so a
  // user who lands in `group_default` via a bulk snapshot push reaches the
  // same XP total as one who used the explicit `/api/groups/.../join`
  // endpoint. Idempotent ledger key on (game_created, game_default) means
  // repeat syncs and concurrent join calls converge to a single 2-XP grant.
  // Failures are swallowed: XP is a UX layer, not a sync correctness gate.
  if (touchedDefaultMembership) {
    try {
      await xpAwardToProfile(profileId, 'game_created', DEFAULT_GAME_ID);
    } catch (err) {
      console.warn('[sync.bulkReplace] onboarding XP grant failed:', err);
    }
  }

  return { ok: true };
};

// ---------- Legacy formatters (flatten data → top-level) ----------
//
// The legacy frontend expects fields like `image`, `liked`, `followed`,
// `memberProfileIds` at the top level of each row. Our schema keeps those in
// the `data` JSON column. Spread `data` first so explicit columns win.

export const groupToLegacy = (g: Group, memberProfileIds: string[] = []) => ({
  ...(g.data as Record<string, unknown>),
  id: g.id,
  name: g.name,
  description: g.description ?? '',
  type: g.type,
  privacy: g.privacy,
  status: statusToWire(g.status),
  isSystemDefault: g.isSystemDefault,
  members: g.members,
  memberProfileIds,
  ownerProfileId: g.ownerProfileId,
  coverAssetId: g.coverAssetId,
  createdAt: g.createdAt.getTime(),
  updatedAt: g.updatedAt.getTime(),
});

/**
 * Map a stored GameTimingExtension row back to the legacy frontend's union
 * shape. *_extended events use originalTime/newTime/extendedAt; future_start
 * uses scheduledFor/setAt.
 */
const timingExtensionToLegacy = (
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

export const gameToLegacy = (
  g: Game,
  memberProfileIds: string[] = [],
  timingExtensionRows: Array<
    Pick<GameTimingExtension, 'type' | 'prevTime' | 'nextTime' | 'happenedAt'>
  > = [],
) => ({
  ...(g.data as Record<string, unknown>),
  id: g.id,
  name: g.name,
  description: g.description ?? '',
  rules: g.rules ?? '',
  hostGroupId: g.hostGroupId,
  hostGroupName: g.hostGroupName ?? '',
  privacy: g.privacy,
  gameType: g.gameType,
  timingMode: g.timingMode,
  status: statusToWire(g.status),
  ownerProfileId: g.ownerProfileId,
  memberProfileIds,
  startTime: g.startTime?.getTime() ?? null,
  submissionCloseTime: g.submissionCloseTime?.getTime() ?? null,
  endTime: g.endTime?.getTime() ?? null,
  // Re-expand stored ms back to the legacy {weeks,days,hours,mins} triple.
  timingOffsets: {
    start: msToOffsetTriple(g.timingStartOffsetMs),
    submission: msToOffsetTriple(g.timingSubmissionOffsetMs),
    end: msToOffsetTriple(g.timingEndOffsetMs),
  },
  timingExtensions: timingExtensionRows.map(timingExtensionToLegacy),
  createdAt: g.createdAt.getTime(),
  updatedAt: g.updatedAt.getTime(),
});

/**
 * Helper: bulk-load membership maps for a set of group / game ids in two
 * queries. Returns Map<parentId, string[]>.
 */
export const loadGroupMembers = async (
  groupIds: string[],
): Promise<Map<string, string[]>> => {
  const map = new Map<string, string[]>();
  if (!groupIds.length) return map;
  const rows = await prisma.groupMember.findMany({
    where: { groupId: { in: groupIds } },
    select: { groupId: true, profileId: true },
  });
  for (const r of rows) {
    const arr = map.get(r.groupId);
    if (arr) arr.push(r.profileId);
    else map.set(r.groupId, [r.profileId]);
  }
  return map;
};

export const loadGameMembers = async (
  gameIds: string[],
): Promise<Map<string, string[]>> => {
  const map = new Map<string, string[]>();
  if (!gameIds.length) return map;
  const rows = await prisma.gameMember.findMany({
    where: { gameId: { in: gameIds } },
    select: { gameId: true, profileId: true },
  });
  for (const r of rows) {
    const arr = map.get(r.gameId);
    if (arr) arr.push(r.profileId);
    else map.set(r.gameId, [r.profileId]);
  }
  return map;
};

/**
 * Bulk-load timing-extension rows grouped by gameId, ordered chronologically
 * by happenedAt for stable wire output. Single query.
 */
export const loadGameTimingExtensions = async (
  gameIds: string[],
): Promise<
  Map<
    string,
    Array<Pick<GameTimingExtension, 'type' | 'prevTime' | 'nextTime' | 'happenedAt'>>
  >
> => {
  const map = new Map<
    string,
    Array<Pick<GameTimingExtension, 'type' | 'prevTime' | 'nextTime' | 'happenedAt'>>
  >();
  if (!gameIds.length) return map;
  const rows = await prisma.gameTimingExtension.findMany({
    where: { gameId: { in: gameIds } },
    select: {
      gameId: true,
      type: true,
      prevTime: true,
      nextTime: true,
      happenedAt: true,
    },
    orderBy: { happenedAt: 'asc' },
  });
  for (const r of rows) {
    const { gameId, ...rest } = r;
    const arr = map.get(gameId);
    if (arr) arr.push(rest);
    else map.set(gameId, [rest]);
  }
  return map;
};

export const creationToLegacy = (c: Creation) => ({
  ...(c.data as Record<string, unknown>),
  id: c.id,
  name: c.name,
  description: c.description ?? '',
  devices: c.devices ?? '',
  tags: c.tags ?? '',
  dateMade: c.dateMade ?? '',
  hostGameId: c.hostGameId,
  ownerProfileId: c.ownerProfileId,
  imageAssetId: c.imageAssetId,
  status: statusToWire(c.status),
  timestamp: Number(c.timestamp),
  createdAt: c.createdAt.getTime(),
  updatedAt: c.updatedAt.getTime(),
});

export const profileToLegacy = (p: Profile) => ({
  ...(p.data as Record<string, unknown>),
  id: p.id,
  name: p.name,
  description: p.description ?? '',
  xpPoints: p.xpPoints,
  avatarAssetId: p.avatarAssetId,
  createdAt: p.createdAt.getTime(),
  updatedAt: p.updatedAt.getTime(),
});

export const settingToLegacyValues = (s: UserSetting) => ({
  ...(s.data as Record<string, unknown>),
  uiTheme: s.uiTheme,
  primaryGroupId: s.primaryGroupId,
  currentProfileId: s.currentProfileId,
});
