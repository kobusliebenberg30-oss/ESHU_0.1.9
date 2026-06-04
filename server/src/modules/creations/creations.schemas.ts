import { z } from 'zod';

const STATUS = z.enum(['active', 'deleted', 'burned', 'finished']).optional();
const JSON_BAG = z.record(z.unknown()).optional();

export const createCreationSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(4000).optional(),
  devices: z.string().max(500).optional(),
  tags: z.string().max(500).optional(),
  dateMade: z.string().max(40).optional(),
  hostGameId: z.string().nullable().optional(),
  imageAssetId: z.string().nullable().optional(),
  status: STATUS,
  timestamp: z.number().int().optional(),
  data: JSON_BAG,
});

export const updateCreationSchema = createCreationSchema.partial();

export const listCreationsQuerySchema = z.object({
  status: z.enum(['active', 'deleted', 'burned', 'finished', 'all']).default('active'),
  hostGameId: z.string().optional(),
});

export type CreateCreationInput = z.infer<typeof createCreationSchema>;
export type UpdateCreationInput = z.infer<typeof updateCreationSchema>;
