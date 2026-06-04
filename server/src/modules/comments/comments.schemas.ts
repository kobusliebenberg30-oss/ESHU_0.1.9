import { z } from 'zod';

const TARGET_KIND = z.enum(['creation', 'game', 'group']);
const STATUS = z.enum(['active', 'deleted', 'burned']).optional();
const JSON_BAG = z.record(z.unknown()).optional();

export const createCommentSchema = z.object({
  // Discriminator + parent row id. The server doesn't enforce existence of
  // the parent (the legacy frontend can post a comment on a soft-deleted
  // parent), but it does validate the kind enum + non-empty id.
  targetKind: TARGET_KIND,
  targetId: z.string().min(1).max(120),
  text: z.string().min(1).max(4000),
  status: STATUS,
  likedBy: z.array(z.string()).optional(),
  followedBy: z.array(z.string()).optional(),
  // Animation payload. The frontend's existing shape is `{ frames, ...,
  // imageAssetId?, imageRef? }`; we accept anything and let the client
  // interpret it. Heavy bitmap data should go through POST /api/assets and
  // be referenced by id from inside this object.
  animation: z.unknown().optional(),
  data: JSON_BAG,
});

export const updateCommentSchema = z.object({
  text: z.string().min(1).max(4000).optional(),
  status: STATUS,
  likedBy: z.array(z.string()).optional(),
  followedBy: z.array(z.string()).optional(),
  animation: z.unknown().optional(),
  data: JSON_BAG,
});

export const listCommentsQuerySchema = z.object({
  targetKind: TARGET_KIND,
  targetId: z.string().min(1).max(120),
  status: z.enum(['active', 'deleted', 'burned', 'all']).default('active'),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;
