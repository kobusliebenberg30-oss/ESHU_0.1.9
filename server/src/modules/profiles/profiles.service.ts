import { prisma } from '../../db/client.js';
import { EntityStatus } from '@prisma/client';
import {
  creationToLegacy,
  gameToLegacy,
  groupToLegacy,
  loadGameMembers,
  loadGameTimingExtensions,
  loadGroupMembers,
  profileToLegacy,
} from '../sync/sync.service.js';
import { toWire as commentToWire } from '../comments/comments.service.js';
import { HttpError } from '../../middleware/error.js';
import {
  DEFAULT_GROUP_ID,
  ensureDefaultOnboardingContent,
  grantDefaultOnboardingXp,
} from '../groups/groups.service.js';

const selectProfileFields = {
  id: true,
  name: true,
  description: true,
  avatarAssetId: true,
  xpPoints: true,
  data: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PLAYERBASE_MAX_LIMIT = 200;

type ProfileDataShape = {
  image?: unknown;
  avatarUrl?: unknown;
};

export type PlayerbaseProfile = {
  id: string;
  userId: string;
  name: string;
  description: string;
  xpPoints: number;
  image: string | null;
  avatarAssetId: string | null;
  createdAt: string;
  updatedAt: string;
  stats: {
    groups: number;
    games: number;
    creations: number;
  };
};

const findCanonicalProfile = (userId: string) =>
  prisma.profile.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: selectProfileFields,
  });

const ensureDefaultMembershipForAccount = async (userId: string, profileId: string) => {
  try {
    await ensureDefaultOnboardingContent(profileId);
    const setting = await prisma.userSetting.findUnique({
      where: { userId },
      select: { primaryGroupId: true },
    });
    if (!setting || !setting.primaryGroupId) {
      await prisma.userSetting.upsert({
        where: { userId },
        create: { userId, currentProfileId: profileId, primaryGroupId: DEFAULT_GROUP_ID },
        update: { primaryGroupId: DEFAULT_GROUP_ID },
      });
    }
    await grantDefaultOnboardingXp(profileId);
  } catch (err) {
    console.warn('[profiles.ensureActiveProfileId] failed to provision default membership:', err);
  }
};

/**
 * Returns the active Profile id for a User, creating one + a UserSetting row
 * on first access. Mirrors the legacy `db.values.currentProfileId` behaviour.
 */
export const ensureActiveProfileId = async (userId: string): Promise<string> => {
  const existing = await findCanonicalProfile(userId);
  if (existing) {
    if (existing.name === 'Player') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true, username: true },
      });
      const profileName = user?.displayName ?? user?.username ?? null;
      if (profileName && profileName !== 'Player') {
        await prisma.profile.update({
          where: { id: existing.id },
          data: { name: profileName },
        });
      }
    }
    try {
      await prisma.userSetting.upsert({
        where: { userId },
        create: { userId, currentProfileId: existing.id, primaryGroupId: DEFAULT_GROUP_ID },
        update: { currentProfileId: existing.id },
      });
    } catch (err) {
      console.warn('[profiles.ensureActiveProfileId] failed to persist currentProfileId for existing profile:', err);
    }
    await ensureDefaultMembershipForAccount(userId, existing.id);
    return existing.id;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, username: true },
  });
  if (!user) {
    throw new HttpError(401, 'Unauthorized');
  }

  const created = await prisma.profile.create({
    data: {
      userId,
      name: user?.displayName ?? user?.username ?? 'Player',
    },
    select: { id: true },
  });

  try {
    await prisma.userSetting.upsert({
      where: { userId },
      create: { userId, currentProfileId: created.id, primaryGroupId: DEFAULT_GROUP_ID },
      update: { currentProfileId: created.id },
    });
  } catch (err) {
    console.warn('[profiles.ensureActiveProfileId] failed to persist currentProfileId for new profile:', err);
  }

  await ensureDefaultMembershipForAccount(userId, created.id);
  return created.id;
};

export const listProfiles = (userId: string) =>
  findCanonicalProfile(userId).then((profile) => (profile ? [profile] : []));

export const listPlayerbase = async (limit = 60): Promise<PlayerbaseProfile[]> => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 60, PLAYERBASE_MAX_LIMIT));
  const rows = await prisma.profile.findMany({
    distinct: ['userId'],
    orderBy: [{ userId: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      userId: true,
      name: true,
      description: true,
      xpPoints: true,
      avatarAssetId: true,
      data: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          ownedGroups: true,
          ownedGames: true,
          ownedCreations: true,
        },
      },
    },
  });

  const canonicalRows = [...rows]
    .sort((a, b) => {
      const xpDelta = b.xpPoints - a.xpPoints;
      if (xpDelta !== 0) return xpDelta;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    })
    .slice(0, safeLimit);

  return canonicalRows.map((row) => {
    const data = (row.data || {}) as ProfileDataShape;
    const image = typeof data.image === 'string'
      ? data.image
      : (typeof data.avatarUrl === 'string' ? data.avatarUrl : null);

    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      description: row.description ?? '',
      xpPoints: row.xpPoints,
      image,
      avatarAssetId: row.avatarAssetId ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      stats: {
        groups: row._count.ownedGroups,
        games: row._count.ownedGames,
        creations: row._count.ownedCreations,
      },
    };
  });
};

export const getPublicProfileContent = async (profileId: string) => {
  const profile = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!profile) return null;

  const groups = await prisma.group.findMany({
    where: {
      ownerProfileId: profileId,
      privacy: { not: 'private' },
    },
    orderBy: [{ isSystemDefault: 'desc' }, { createdAt: 'asc' }],
  });
  const groupIds = groups.map((g) => g.id);

  const games = await prisma.game.findMany({
    where: {
      ownerProfileId: profileId,
      privacy: { not: 'private' },
    },
    orderBy: { createdAt: 'asc' },
  });
  const gameIds = games.map((g) => g.id);

  const creations = await prisma.creation.findMany({
    where: { ownerProfileId: profileId },
    orderBy: [{ timestamp: 'desc' }, { createdAt: 'desc' }],
  });

  const comments = await prisma.comment.findMany({
    where: {
      authorProfileId: profileId,
      status: EntityStatus.ACTIVE,
    },
    orderBy: { createdAt: 'desc' },
  });

  const [groupMembersMap, gameMembersMap, gameTimingExtensionsMap] = await Promise.all([
    loadGroupMembers(groupIds),
    loadGameMembers(gameIds),
    loadGameTimingExtensions(gameIds),
  ]);

  return {
    profile: profileToLegacy(profile),
    groups: groups.map((g) => groupToLegacy(g, groupMembersMap.get(g.id) ?? [])),
    games: games.map((g) =>
      gameToLegacy(
        g,
        gameMembersMap.get(g.id) ?? [],
        gameTimingExtensionsMap.get(g.id) ?? [],
      ),
    ),
    creations: creations.map(creationToLegacy),
    comments: comments.map(commentToWire),
  };
};

export const createProfile = async (userId: string, input: { name: string; description?: string }) => {
  const activeProfileId = await ensureActiveProfileId(userId);
  return prisma.profile.update({
    where: { id: activeProfileId },
    data: { name: input.name, description: input.description ?? null },
  });
};

export const updateProfile = async (
  userId: string,
  id: string,
  input: {
    name?: string;
    description?: string;
    xpPoints?: number;
    avatarAssetId?: string | null;
    data?: unknown;
  },
) => {
  const activeProfileId = await ensureActiveProfileId(userId);
  if (id !== activeProfileId) return null;

  // Merge `data` against the existing row instead of wholesale replace.
  // The legacy frontend sends partial blobs (e.g. `{ image }` only), and a
  // straight overwrite was silently dropping every other key on every save
  // — including the profile avatar itself on the next non-image edit.
  let nextData: Record<string, unknown> | undefined;
  if (input.data !== undefined) {
    const existing = await prisma.profile.findUnique({
      where: { id: activeProfileId },
      select: { data: true },
    });
    const existingData =
      existing?.data && typeof existing.data === 'object' && !Array.isArray(existing.data)
        ? (existing.data as Record<string, unknown>)
        : {};
    nextData = {
      ...existingData,
      ...((input.data as Record<string, unknown>) ?? {}),
    };
  }

  const profileUpdate = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.xpPoints !== undefined ? { xpPoints: input.xpPoints } : {}),
    ...(input.avatarAssetId !== undefined ? { avatarAssetId: input.avatarAssetId } : {}),
    ...(nextData !== undefined ? { data: nextData as object } : {}),
  };

  if (input.name !== undefined) {
    const [, profile] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { displayName: input.name },
      }),
      prisma.profile.update({
        where: { id: activeProfileId },
        data: profileUpdate,
      }),
    ]);
    return profile;
  }

  return prisma.profile.update({
    where: { id: activeProfileId },
    data: profileUpdate,
  });
};
