import { prisma } from '../../db/client.js';
import { HttpError } from '../../middleware/error.js';
import { ensureActiveProfileId } from '../profiles/profiles.service.js';
import type { AwardInput, XpKind } from './xp.schemas.js';

/**
 * Single source of truth for XP rules. Adding a new earning event = adding a
 * row here and adding the kind to xp.schemas.ts. The frontend never decides
 * how much XP an action is worth.
 */
const RULES: Record<XpKind, { amount: number; reason: string }> = {
  creation_uploaded: { amount: 1, reason: 'Uploaded creation' },
  comment_posted:    { amount: 1, reason: 'Comment posted' },
  comment_animated:  { amount: 2, reason: 'Animated comment' },
  game_created:      { amount: 2, reason: 'Created a game' },
  placement_1:       { amount: 5, reason: '1st place' },
  placement_2:       { amount: 4, reason: '2nd place' },
  placement_3:       { amount: 3, reason: '3rd place' },
};

/**
 * Cumulative XP thresholds that unlock features. The response includes any
 * unlocks that were just crossed by this award, so the client can light up
 * the UI immediately without recomputing locally.
 */
const UNLOCK_THRESHOLDS: Record<string, number> = {
  upload_creations: 2,
  comments: 3,
};

const unlocksAt = (xp: number): string[] =>
  Object.entries(UNLOCK_THRESHOLDS)
    .filter(([, t]) => xp >= t)
    .map(([k]) => k);

/**
 * Internal: apply a single XP award to a specific profile, idempotent on
 * (kind, refId). Uses the XpAward table's unique constraint for DB-level
 * idempotency — no read-modify-write transaction needed.
 */
const _awardCore = async (profileId: string, kind: XpKind, refId: string | undefined) => {
  const rule = RULES[kind];
  if (!rule) throw new HttpError(400, 'UNKNOWN_XP_KIND');

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { xpPoints: true },
  });
  if (!profile) throw new HttpError(404, 'Profile not found');

  try {
    await prisma.$transaction([
      prisma.xpAward.create({
        data: { profileId, kind, refId: refId ?? null, amount: rule.amount, reason: rule.reason },
      }),
      prisma.profile.update({
        where: { id: profileId },
        data: { xpPoints: { increment: rule.amount } },
      }),
    ]);
  } catch (err: unknown) {
    // Unique constraint violation = already awarded — idempotent no-op.
    const code = (err as { code?: string }).code;
    if (code === 'P2002') {
      return { xpPoints: profile.xpPoints, delta: 0, alreadyAwarded: true };
    }
    throw err;
  }

  const updated = await prisma.profile.findUniqueOrThrow({
    where: { id: profileId },
    select: { xpPoints: true },
  });
  return { xpPoints: updated.xpPoints, delta: rule.amount, alreadyAwarded: false };
};

/**
 * Public: award XP to the session's active profile.
 */
export const award = async (userId: string, input: AwardInput) => {
  const profileId = await ensureActiveProfileId(userId);
  const result = await _awardCore(profileId, input.kind, input.refId);
  const rule = RULES[input.kind];
  return {
    ...result,
    unlocks: unlocksAt(result.xpPoints),
    reason: rule.reason,
  };
};

/**
 * Public (server-internal): award XP to an arbitrary profile by id. Used by
 * services that need to award on someone else's behalf — e.g. game
 * finalization awards placement XP to the creation owner, not the caller.
 *
 * Caller is responsible for any authorization checks. Idempotent on
 * (kind, refId).
 */
export const awardToProfile = async (
  profileId: string,
  kind: XpKind,
  refId: string | undefined,
) => {
  const result = await _awardCore(profileId, kind, refId);
  const rule = RULES[kind];
  return {
    ...result,
    unlocks: unlocksAt(result.xpPoints),
    reason: rule.reason,
    profileId,
  };
};

/**
 * Read the award history for the session's active profile, most-recent first.
 */
export const history = async (userId: string, limit = 50) => {
  const profileId = await ensureActiveProfileId(userId);
  const rows = await prisma.xpAward.findMany({
    where: { profileId },
    orderBy: { awardedAt: 'desc' },
    take: limit,
    select: { id: true, kind: true, refId: true, amount: true, reason: true, awardedAt: true },
  });
  return { profileId, awards: rows };
};

/**
 * Read-only "what gates are open for this user right now" — used by the
 * client to configure UI without recomputing thresholds locally.
 */
export const gates = async (userId: string) => {
  const profileId = await ensureActiveProfileId(userId);
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { xpPoints: true },
  });
  const xp = profile?.xpPoints ?? 0;
  return {
    profileId,
    xpPoints: xp,
    unlocks: unlocksAt(xp),
    thresholds: UNLOCK_THRESHOLDS,
  };
};
