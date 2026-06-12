import { z } from 'zod';

const STATUS = z.enum(['active', 'deleted', 'burned', 'finished']).optional();
const JSON_BAG = z.record(z.unknown()).optional();
const ISO_OR_MS = z.union([z.string().datetime(), z.number().int()]).nullable().optional();

// Editor-time durations: { weeks, days, hours, mins } per slot.
const offsetTriple = z.object({
  weeks: z.number().int().min(0).max(520).default(0),       // ~10 years cap
  days: z.number().int().min(0).max(365).default(0),
  hours: z.number().int().min(0).max(23).default(0),
  mins: z.number().int().min(0).max(59).default(0),
});

const timingOffsetsSchema = z
  .object({
    start: offsetTriple,
    submission: offsetTriple,
    end: offsetTriple,
  })
  .optional();

// One audit entry. The frontend produces two flavours; both fields are
// optional so either flavour passes validation. The service layer normalises.
const timingExtensionEntry = z
  .object({
    type: z.enum(['start_extended', 'submission_extended', 'end_extended', 'future_start']),
    originalTime: ISO_OR_MS,
    newTime: ISO_OR_MS,
    extendedAt: ISO_OR_MS,
    scheduledFor: ISO_OR_MS,
    setAt: ISO_OR_MS,
  })
  .passthrough();

export const createGameSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  rules: z.string().max(4000).optional(),
  hostGroupId: z.string().min(1),
  hostGroupName: z.string().max(120).optional(),
  privacy: z.enum(['public', 'private']).optional(),
  gameType: z.string().max(40).optional(),
  timingMode: z.string().max(40).optional(),
  status: STATUS,
  startTime: ISO_OR_MS,
  submissionCloseTime: ISO_OR_MS,
  endTime: ISO_OR_MS,
  // Legacy inline image (base64 data URL or external URL). Stored in
  // Game.data.image; survives /api/sync round trips without a schema migration.
  image: z.string().nullable().optional(),
  memberProfileIds: z.array(z.string()).optional(),
  timingOffsets: timingOffsetsSchema,
  timingExtensions: z.array(timingExtensionEntry).optional(),
  data: JSON_BAG,
});

export const updateGameSchema = createGameSchema.partial();

export const listGamesQuerySchema = z.object({
  status: z.enum(['active', 'deleted', 'burned', 'finished', 'all']).default('active'),
  hostGroupId: z.string().optional(),
});

/**
 * Body for POST /api/games/:id/finalize. The caller (game owner) submits
 * vote counts for each creation in the game; the server picks the top three
 * server-side and awards XP atomically. Vote counts are still client-tracked
 * for now — until votes themselves migrate server-side, the trust boundary
 * for placement integrity is "the game owner doesn't lie about votes".
 */
export const finalizeGameSchema = z.object({
  rankings: z
    .array(
      z.object({
        creationId: z.string().min(1),
        voteCount: z.number().int().min(0).default(0),
      }),
    )
    .min(0)
    .max(500),
});

export type CreateGameInput = z.infer<typeof createGameSchema>;
export type UpdateGameInput = z.infer<typeof updateGameSchema>;
export type FinalizeGameInput = z.infer<typeof finalizeGameSchema>;
