import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { prisma } from '../../db/client.js';
import { ensureActiveProfileId } from '../profiles/profiles.service.js';
import {
  DEFAULT_GAME_ID,
  DEFAULT_GROUP_ID,
  ensureDefaultOnboardingContent,
} from '../groups/groups.service.js';
import {
  bulkReplace,
  creationToLegacy,
  gameToLegacy,
  groupToLegacy,
  loadGameMembers,
  loadGameTimingExtensions,
  loadGroupMembers,
  profileToLegacy,
  settingToLegacyValues,
} from './sync.service.js';

const bulkSchema = z.object({
  tables: z
    .object({
      groups: z.array(z.record(z.unknown())).optional(),
      games: z.array(z.record(z.unknown())).optional(),
      creations: z.array(z.record(z.unknown())).optional(),
      profiles: z.array(z.record(z.unknown())).optional(),
    })
    .optional(),
  values: z
    .object({
      uiTheme: z.enum(['light', 'dark']).optional(),
      primaryGroupId: z.string().nullable().optional(),
      currentProfileId: z.string().nullable().optional(),
      data: z.record(z.unknown()).optional(),
    })
    .passthrough()
    .optional(),
});

const router: Router = Router();
router.use(requireAuth);

/**
 * GET /api/sync
 * Single bulk-pull endpoint the frontend uses on first load to hydrate the
 * legacy local-DB shape from the server. Mirrors `db.tables.* + db.values`.
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const profileId = await ensureActiveProfileId(userId);

    // Visibility model: a profile sees a group/game if it OWNS it or is a
    // MEMBER of it (via the GroupMember / GameMember join tables). Filtering
    // by ownerProfileId only would silently drop joined-but-not-owned rows on
    // every sync pull, causing client snapshots to "forget" memberships and
    // forcing the user to re-join every page navigation. Public active rows
    // are also hydrated so the frontend's All filters can work as discovery
    // surfaces for new profiles while the default view remains "mine".
    const [memberGroupRows, memberGameRows] = await Promise.all([
      prisma.groupMember.findMany({ where: { profileId }, select: { groupId: true } }),
      prisma.gameMember.findMany({ where: { profileId }, select: { gameId: true } }),
    ]);
    const memberGroupIds = memberGroupRows.map((r) => r.groupId);
    const memberGameIds = memberGameRows.map((r) => r.gameId);
    if (memberGroupIds.includes(DEFAULT_GROUP_ID) && !memberGameIds.includes(DEFAULT_GAME_ID)) {
      await ensureDefaultOnboardingContent(profileId);
      memberGameIds.push(DEFAULT_GAME_ID);
    }

    // Pre-resolve the full set of games visible to this profile so we can
    // also pull every PUBLIC creation hosted in those games — not only the
    // ones this profile owns. Without this, the ESHU compare engine renders
    // empty panels for fresh profiles in shared games like `game_default`
    // because they own no creations yet.
    const [ownedGames, publicGames] = await Promise.all([
      prisma.game.findMany({
        where: { ownerProfileId: profileId },
        select: { id: true },
      }),
      prisma.game.findMany({
        where: { privacy: 'public', status: 'ACTIVE' },
        select: { id: true },
      }),
    ]);
    const visibleGameIds = Array.from(
      new Set([...ownedGames.map((g) => g.id), ...memberGameIds, ...publicGames.map((g) => g.id)]),
    );

    const [groups, games, creationsRaw, profiles, setting] = await Promise.all([
      prisma.group.findMany({
        where: {
          OR: [
            { ownerProfileId: profileId },
            { id: { in: memberGroupIds } },
            { privacy: 'public', status: 'ACTIVE' },
          ],
        },
        orderBy: [{ isSystemDefault: 'desc' }, { createdAt: 'asc' }],
      }),
      prisma.game.findMany({
        where: {
          OR: [
            { ownerProfileId: profileId },
            { id: { in: memberGameIds } },
            { privacy: 'public', status: 'ACTIVE' },
          ],
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.creation.findMany({
        where: {
          OR: [
            { ownerProfileId: profileId },
            { hostGameId: { in: visibleGameIds } },
          ],
        },
        orderBy: [{ timestamp: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.profile.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      prisma.userSetting.upsert({
        where: { userId },
        create: { userId, currentProfileId: profileId },
        update: { currentProfileId: profileId },
      }),
    ]);

    const gameIds = games.map((g) => g.id);
    const [groupMembersMap, gameMembersMap, gameTimingExtensionsMap] = await Promise.all([
      loadGroupMembers(groups.map((g) => g.id)),
      loadGameMembers(gameIds),
      loadGameTimingExtensions(gameIds),
    ]);

    // Shape matches legacy `db` blob expected by pages/assets/eshu-db.js so
    // the remote storage driver can return JSON.stringify(this) verbatim.
    res.json({
      schemaVersion: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tables: {
        groups: groups.map((g) => groupToLegacy(g, groupMembersMap.get(g.id) ?? [])),
        games: games.map((g) =>
          gameToLegacy(
            g,
            gameMembersMap.get(g.id) ?? [],
            gameTimingExtensionsMap.get(g.id) ?? [],
          ),
        ),
        creations: creationsRaw
          .filter((c) => {
            // Always include creations this profile owns. For creations
            // owned by OTHER profiles, drop any that are marked private in
            // the JSON `data` blob (privacy isn't a DB column yet).
            if (c.ownerProfileId === profileId) return true;
            const data = (c.data && typeof c.data === 'object' ? c.data : {}) as Record<string, unknown>;
            return data.privacy !== 'private';
          })
          .map(creationToLegacy),
        profiles: profiles.map(profileToLegacy),
      },
      values: settingToLegacyValues(setting),
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * PUT /api/sync
 * Bulk replace within the user's active profile. Used by the remote storage
 * driver in the legacy frontend to push the in-memory DB blob.
 *
 * NOT designed for concurrent multi-device editing. Granular endpoints
 * (/api/groups, /api/games, /api/creations) should be preferred for that.
 */
router.put('/', validate(bulkSchema), async (req, res, next) => {
  try {
    const userId = req.session.userId!;
    const profileId = await ensureActiveProfileId(userId);
    const result = await bulkReplace(userId, profileId, req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

export default router;
