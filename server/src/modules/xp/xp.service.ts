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

type AwardLedger = Record<string, { amount: number; at: number; reason: string }>;

/**
 * Internal: apply a single XP award to a specific profile, idempotent on
 * (kind, refId). Used by both the session-bound `award()` and by other
 * services (e.g. game finalization awarding placement XP to creation owners).
 *
 * Idempotency ledger lives in `Profile.data.xpAwards` for now (no schema
 * migration needed). For high-volume production this should move to a proper
 * `XpAward` table with a unique constraint on (profileId, kind, refId).
 *
 * Concurrency: read-modify-write inside a transaction. Postgres' default
 * READ COMMITTED isolation means two concurrent awards of the SAME (kind,
 * refId) for the SAME profile could both pass the existence check and
 * double-award. For the prototype's traffic this is acceptable; tighten with
 * `SELECT ... FOR UPDATE` (or the proper ledger table) when traffic warrants.
 */
const _awardCore = async (profileId: string, kind: XpKind, refId: string | undefined) => {
  const rule = RULES[kind];
  if (!rule) throw new HttpError(400, 'UNKNOWN_XP_KIND');
  const ledgerKey = `${kind}:${refId ?? ''}`;

  return prisma.$transaction(async (tx) => {
    const profile = await tx.profile.findUnique({
      where: { id: profileId },
      select: { xpPoints: true, data: true },
    });
    if (!profile) throw new HttpError(404, 'Profile not found');

    const data: { xpAwards?: AwardLedger; [k: string]: unknown } =
      (profile.data && typeof profile.data === 'object' ? { ...(profile.data as object) } : {}) as {
        xpAwards?: AwardLedger;
      };
    const ledger: AwardLedger = { ...(data.xpAwards ?? {}) };

    if (refId && ledger[ledgerKey]) {
      return { xpPoints: profile.xpPoints, delta: 0, alreadyAwarded: true };
    }

    ledger[ledgerKey] = { amount: rule.amount, at: Date.now(), reason: rule.reason };
    data.xpAwards = ledger;

    const updated = await tx.profile.update({
      where: { id: profileId },
      data: { xpPoints: { increment: rule.amount }, data: data as object },
      select: { xpPoints: true },
    });

    return { xpPoints: updated.xpPoints, delta: rule.amount, alreadyAwarded: false };
  });
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
