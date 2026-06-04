import { z } from 'zod';

/**
 * The full set of XP-earning events the server is willing to grant. Anything
 * not in this enum is a 400 from the validation layer — no client-defined
 * "kinds" allowed, which is the whole point of moving XP to the server.
 */
export const XP_KINDS = [
  'creation_uploaded',
  'comment_posted',
  'comment_animated',
  'game_created',
  'placement_1',
  'placement_2',
  'placement_3',
] as const;

export type XpKind = (typeof XP_KINDS)[number];

export const awardSchema = z.object({
  kind: z.enum(XP_KINDS),
  /**
   * Stable reference id for the thing being rewarded (creation id, comment id,
   * game id for placements, ...). Used both to compose the human-readable
   * `reason` and to make awards idempotent: the same (kind, refId) pair will
   * not double-award.
   */
  refId: z.string().min(1).max(120).optional(),
});

export type AwardInput = z.infer<typeof awardSchema>;
