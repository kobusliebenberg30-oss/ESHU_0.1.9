import { z } from 'zod';

const STATUS = z.enum(['active', 'deleted', 'burned', 'finished']).optional();
const PRIVACY = z.enum(['public', 'private']).optional();
const JSON_BAG = z.record(z.unknown()).optional();

export const createGroupSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  type: z.string().max(40).optional(),
  privacy: PRIVACY,
  status: STATUS,
  isSystemDefault: z.boolean().optional(),
  coverAssetId: z.string().nullable().optional(),
  // Legacy inline image (base64 data URL or external URL). Stored in
  // Group.data.image; survives /api/sync round trips without a schema migration.
  image: z.string().nullable().optional(),
  members: z.number().int().min(0).optional(),
  memberProfileIds: z.array(z.string()).optional(),
  data: JSON_BAG,
});

export const updateGroupSchema = createGroupSchema.partial();

export const listGroupsQuerySchema = z.object({
  status: z.enum(['active', 'deleted', 'burned', 'finished', 'all']).default('active'),
  privacy: z.enum(['public', 'private', 'all']).default('all'),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
