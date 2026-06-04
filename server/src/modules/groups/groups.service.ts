import type { Group, Prisma } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { HttpError } from '../../middleware/error.js';
import { statusFromWire, statusToWire } from '../../lib/status.js';
import { awardToProfile as xpAwardToProfile } from '../xp/xp.service.js';
import type { CreateGroupInput, UpdateGroupInput } from './groups.schemas.js';

export const DEFAULT_GROUP_ID = 'group_default';
export const DEFAULT_GAME_ID = 'game_default';

export const ensureDefaultOnboardingContent = async (
  profileId?: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) => {
  await client.group.upsert({
    where: { id: DEFAULT_GROUP_ID },
    create: {
      id: DEFAULT_GROUP_ID,
      ownerProfileId: null,
      name: 'GROUP',
      description: 'Default Group',
      type: 'social',
      privacy: 'public',
      status: 'ACTIVE',
      isSystemDefault: true,
      members: 0,
      data: {},
    },
    update: {
      ownerProfileId: null,
      name: 'GROUP',
      description: 'Default Group',
      type: 'social',
      privacy: 'public',
      status: 'ACTIVE',
      isSystemDefault: true,
    },
  });

  await client.game.upsert({
    where: { id: DEFAULT_GAME_ID },
    create: {
      id: DEFAULT_GAME_ID,
      ownerProfileId: null,
      hostGroupId: DEFAULT_GROUP_ID,
      hostGroupName: 'GROUP',
      name: 'Default Game',
      description: 'Upload your first onboarding creations here.',
      rules: 'Upload image assets. Each upload awards XP toward the next unlock.',
      privacy: 'public',
      gameType: 'book',
      timingMode: 'infinite',
      status: 'ACTIVE',
      data: {
        isSystemDefault: true,
        isOnboardingDefault: true,
        fixedSettings: true,
        awardsXp: true,
      },
    },
    update: {
      ownerProfileId: null,
      hostGroupId: DEFAULT_GROUP_ID,
      hostGroupName: 'GROUP',
      name: 'Default Game',
      description: 'Upload your first onboarding creations here.',
      rules: 'Upload image assets. Each upload awards XP toward the next unlock.',
      privacy: 'public',
      gameType: 'book',
      timingMode: 'infinite',
      status: 'ACTIVE',
      data: {
        isSystemDefault: true,
        isOnboardingDefault: true,
        fixedSettings: true,
        awardsXp: true,
      },
    },
  });

  if (profileId) {
    await client.gameMember.upsert({
      where: { gameId_profileId: { gameId: DEFAULT_GAME_ID, profileId } },
      create: { gameId: DEFAULT_GAME_ID, profileId },
      update: {},
    });
  }
};

// Pull a legacy inline image out of `Group.data.image` so the wire format
// matches what the frontend has historically read. New clients should prefer
// `coverAssetId` once asset uploads ship; until then this keeps round-tripping
// through /api/sync stable.
const extractDataImage = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') return null;
  const v = (data as Record<string, unknown>).image;
  return typeof v === 'string' && v.length > 0 ? v : null;
};

export const toWire = (g: Group, memberProfileIds: string[] = []) => ({
  id: g.id,
  name: g.name,
  description: g.description,
  type: g.type,
  privacy: g.privacy,
  status: statusToWire(g.status),
  isSystemDefault: g.isSystemDefault,
  coverAssetId: g.coverAssetId,
  image: extractDataImage(g.data),
  members: g.members,
  memberProfileIds,
  ownerProfileId: g.ownerProfileId,
  data: g.data,
  createdAt: g.createdAt.toISOString(),
  updatedAt: g.updatedAt.toISOString(),
});

const loadMemberIds = async (groupId: string): Promise<string[]> => {
  const rows = await prisma.groupMember.findMany({
    where: { groupId },
    select: { profileId: true },
  });
  return rows.map((r) => r.profileId);
};

/**
 * Replace the membership set for a group with `nextIds`. Drops dangling ids
 * (profiles that no longer exist) silently.
 */
const replaceMembers = async (groupId: string, nextIds: string[]): Promise<string[]> => {
  const unique = Array.from(new Set(nextIds));
  const existing = unique.length
    ? await prisma.profile.findMany({
        where: { id: { in: unique } },
        select: { id: true },
      })
    : [];
  const valid = existing.map((p) => p.id);
  await prisma.$transaction([
    prisma.groupMember.deleteMany({ where: { groupId } }),
    ...(valid.length
      ? [
          prisma.groupMember.createMany({
            data: valid.map((profileId) => ({ groupId, profileId })),
            skipDuplicates: true,
          }),
        ]
      : []),
    prisma.group.update({ where: { id: groupId }, data: { members: valid.length } }),
  ]);
  return valid;
};

const ensureOwned = async (id: string, profileId: string): Promise<Group> => {
  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) throw new HttpError(404, 'Group not found');
  if (group.ownerProfileId && group.ownerProfileId !== profileId) {
    throw new HttpError(403, 'Forbidden');
  }
  return group;
};

export const list = async (
  profileId: string,
  filters: { status: string; privacy: string },
) => {
  const where: Record<string, unknown> = {
    OR: [
      { ownerProfileId: profileId },
      { memberships: { some: { profileId } } },
    ],
  };
  if (filters.status !== 'all') where.status = statusFromWire(filters.status);
  if (filters.privacy !== 'all') where.privacy = filters.privacy;
  const rows = await prisma.group.findMany({
    where,
    orderBy: [{ isSystemDefault: 'desc' }, { createdAt: 'asc' }],
  });
  if (!rows.length) return [];
  const memberRows = await prisma.groupMember.findMany({
    where: { groupId: { in: rows.map((r) => r.id) } },
    select: { groupId: true, profileId: true },
  });
  const byGroup = new Map<string, string[]>();
  for (const m of memberRows) {
    const arr = byGroup.get(m.groupId);
    if (arr) arr.push(m.profileId);
    else byGroup.set(m.groupId, [m.profileId]);
  }
  return rows.map((r) => toWire(r, byGroup.get(r.id) ?? []));
};

export const getById = async (id: string, profileId: string) => {
  const g = await ensureOwned(id, profileId);
  return toWire(g, await loadMemberIds(g.id));
};

export const create = async (profileId: string, input: CreateGroupInput) => {
  // Fold the legacy top-level `image` into `data.image` so it persists in
  // a real column and survives the next /api/sync snapshot refresh. Explicit
  // top-level `image` wins over any value already in `data.image`.
  const mergedData: Record<string, unknown> = { ...((input.data as Record<string, unknown>) ?? {}) };
  if (input.image !== undefined) {
    if (input.image === null || input.image === '') delete mergedData.image;
    else mergedData.image = input.image;
  }
  const created = await prisma.group.create({
    data: {
      ownerProfileId: profileId,
      name: input.name,
      description: input.description ?? null,
      type: input.type ?? 'social',
      privacy: input.privacy ?? 'public',
      status: statusFromWire(input.status),
      isSystemDefault: input.isSystemDefault ?? false,
      coverAssetId: input.coverAssetId ?? null,
      members: input.members ?? (input.memberProfileIds?.length ?? 0),
      data: mergedData as object,
    },
  });
  let memberIds: string[] = [];
  if (input.memberProfileIds) {
    memberIds = await replaceMembers(created.id, input.memberProfileIds);
  }
  // Re-read so denormalized members count reflects reconcile.
  const fresh = (await prisma.group.findUnique({ where: { id: created.id } })) ?? created;
  return toWire(fresh, memberIds);
};

export const update = async (id: string, profileId: string, input: UpdateGroupInput) => {
  if (id === DEFAULT_GROUP_ID) {
    throw new HttpError(403, 'SYSTEM_DEFAULT_IMMUTABLE');
  }
  const existing = await ensureOwned(id, profileId);
  // Build the next `data` blob:
  //   - if caller sent `data`, that becomes the base (full replace semantics
  //     to match the existing contract);
  //   - otherwise keep the existing data;
  //   - then layer the legacy top-level `image` on top so a save that only
  //     edits text fields cannot accidentally clobber the stored image and
  //     a save that explicitly sets/clears the image takes effect.
  let nextData: Record<string, unknown> | undefined;
  if (input.data !== undefined) {
    nextData = { ...(input.data as Record<string, unknown>) };
  }
  if (input.image !== undefined) {
    if (!nextData) nextData = { ...((existing.data as Record<string, unknown>) ?? {}) };
    if (input.image === null || input.image === '') delete nextData.image;
    else nextData.image = input.image;
  }
  await prisma.group.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.privacy !== undefined ? { privacy: input.privacy } : {}),
      ...(input.status !== undefined ? { status: statusFromWire(input.status) } : {}),
      ...(input.isSystemDefault !== undefined ? { isSystemDefault: input.isSystemDefault } : {}),
      ...(input.coverAssetId !== undefined ? { coverAssetId: input.coverAssetId } : {}),
      ...(input.members !== undefined ? { members: input.members } : {}),
      ...(nextData !== undefined ? { data: nextData as object } : {}),
    },
  });
  if (input.memberProfileIds) {
    await replaceMembers(id, input.memberProfileIds);
  }
  const fresh = await prisma.group.findUniqueOrThrow({ where: { id } });
  return toWire(fresh, await loadMemberIds(id));
};

/**
 * Idempotent membership join. Inserts a GroupMember row for `profileId` if
 * not already present and keeps the denormalized `Group.members` count in
 * sync. Enforces:
 *   - Group must exist and be ACTIVE.
 *   - Private groups can only be joined by the owner (no invite system yet).
 *
 * Returns the up-to-date group with the resolved member list.
 */
export const join = async (id: string, profileId: string) => {
  if (id === DEFAULT_GROUP_ID) {
    await prisma.$transaction(async (tx) => {
      await ensureDefaultOnboardingContent(profileId, tx);
      await tx.groupMember.upsert({
        where: { groupId_profileId: { groupId: id, profileId } },
        create: { groupId: id, profileId },
        update: {},
      });
      const total = await tx.groupMember.count({ where: { groupId: id } });
      await tx.group.update({ where: { id }, data: { members: total } });
    });

    // Onboarding XP calibration: a player who joins the default group has
    // effectively completed the "set up your first game" step (they get the
    // pre-existing `game_default` materialised into their membership list).
    // Grant the same XP they would have received from creating their own
    // first game, so the progression to the `upload_creations` and
    // `comments` thresholds proceeds identically on both onboarding paths.
    //
    // Idempotent on (profileId, kind=game_created, refId=DEFAULT_GAME_ID),
    // so repeated joins, bulk-sync reconciliations, and page reloads never
    // double-award. Failures are swallowed: XP is a UX bonus, not a
    // correctness constraint on group membership.
    try {
      await xpAwardToProfile(profileId, 'game_created', DEFAULT_GAME_ID);
    } catch (err) {
      console.warn('[groups.join] onboarding XP grant failed:', err);
    }

    const fresh = await prisma.group.findUniqueOrThrow({ where: { id } });
    return toWire(fresh, await loadMemberIds(id));
  }

  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) throw new HttpError(404, 'Group not found');
  if (group.status !== 'ACTIVE') throw new HttpError(409, 'Group is not active');
  if (group.privacy === 'private' && group.ownerProfileId !== profileId) {
    throw new HttpError(403, 'GROUP_PRIVATE');
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.groupMember.findUnique({
      where: { groupId_profileId: { groupId: id, profileId } },
    });
    if (existing) return;
    await tx.groupMember.create({ data: { groupId: id, profileId } });
    const total = await tx.groupMember.count({ where: { groupId: id } });
    await tx.group.update({ where: { id }, data: { members: total } });
  });

  const fresh = await prisma.group.findUniqueOrThrow({ where: { id } });
  return toWire(fresh, await loadMemberIds(id));
};

/**
 * Idempotent leave. Removes the GroupMember row if present and resyncs the
 * denormalized count. Owners are not permitted to leave their own group via
 * this endpoint (use delete/transfer instead) — surface a clear error.
 */
export const leave = async (id: string, profileId: string) => {
  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) throw new HttpError(404, 'Group not found');
  if (group.ownerProfileId === profileId) {
    throw new HttpError(409, 'OWNER_CANNOT_LEAVE');
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.groupMember.findUnique({
      where: { groupId_profileId: { groupId: id, profileId } },
    });
    if (!existing) return;
    await tx.groupMember.delete({
      where: { groupId_profileId: { groupId: id, profileId } },
    });
    const total = await tx.groupMember.count({ where: { groupId: id } });
    await tx.group.update({ where: { id }, data: { members: total } });
  });

  const fresh = await prisma.group.findUniqueOrThrow({ where: { id } });
  return toWire(fresh, await loadMemberIds(id));
};

/**
 * Predicate used by other services to enforce membership-gated actions
 * (e.g. game creation). Owner is always treated as a member.
 */
export const isMember = async (groupId: string, profileId: string): Promise<boolean> => {
  if (!groupId || !profileId) return false;
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { ownerProfileId: true },
  });
  if (!group) return false;
  if (group.ownerProfileId === profileId) return true;
  const row = await prisma.groupMember.findUnique({
    where: { groupId_profileId: { groupId, profileId } },
    select: { groupId: true },
  });
  return !!row;
};

// Soft-delete: matches frontend semantics (status 'deleted' or 'burned')
export const softRemove = async (id: string, profileId: string, mode: 'deleted' | 'burned' = 'deleted') => {
  if (id === DEFAULT_GROUP_ID) {
    throw new HttpError(403, 'SYSTEM_DEFAULT_IMMUTABLE');
  }
  await ensureOwned(id, profileId);
  const updated = await prisma.group.update({
    where: { id },
    data: { status: statusFromWire(mode) },
  });
  return toWire(updated, await loadMemberIds(id));
};
