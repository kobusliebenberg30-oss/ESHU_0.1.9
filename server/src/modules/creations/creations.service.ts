import type { Creation } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { HttpError } from '../../middleware/error.js';
import { statusFromWire, statusToWire } from '../../lib/status.js';
import type { CreateCreationInput, UpdateCreationInput } from './creations.schemas.js';

export const toWire = (c: Creation) => ({
  ...(c.data as Record<string, unknown>),
  id: c.id,
  name: c.name,
  description: c.description,
  devices: c.devices,
  tags: c.tags,
  dateMade: c.dateMade,
  hostGameId: c.hostGameId,
  ownerProfileId: c.ownerProfileId,
  imageAssetId: c.imageAssetId,
  status: statusToWire(c.status),
  timestamp: Number(c.timestamp),
  data: c.data,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

const ensureOwned = async (id: string, profileId: string): Promise<Creation> => {
  const cr = await prisma.creation.findUnique({ where: { id } });
  if (!cr) throw new HttpError(404, 'Creation not found');
  if (cr.ownerProfileId && cr.ownerProfileId !== profileId) {
    throw new HttpError(403, 'Forbidden');
  }
  return cr;
};

export const list = async (
  profileId: string,
  filters: { status: string; hostGameId?: string },
) => {
  const where: Record<string, unknown> = { ownerProfileId: profileId };
  if (filters.status !== 'all') where.status = statusFromWire(filters.status);
  if (filters.hostGameId) where.hostGameId = filters.hostGameId;
  const rows = await prisma.creation.findMany({
    where,
    orderBy: [{ timestamp: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map(toWire);
};

export const getById = async (id: string, profileId: string) =>
  toWire(await ensureOwned(id, profileId));

export const create = async (profileId: string, input: CreateCreationInput) => {
  const created = await prisma.creation.create({
    data: {
      ownerProfileId: profileId,
      name: input.name,
      description: input.description ?? null,
      devices: input.devices ?? null,
      tags: input.tags ?? null,
      dateMade: input.dateMade ?? null,
      hostGameId: input.hostGameId ?? null,
      imageAssetId: input.imageAssetId ?? null,
      status: statusFromWire(input.status),
      timestamp: BigInt(input.timestamp ?? Date.now()),
      data: (input.data ?? {}) as object,
    },
  });
  return toWire(created);
};

export const update = async (id: string, profileId: string, input: UpdateCreationInput) => {
  await ensureOwned(id, profileId);
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.devices !== undefined) data.devices = input.devices;
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.dateMade !== undefined) data.dateMade = input.dateMade;
  if (input.hostGameId !== undefined) data.hostGameId = input.hostGameId;
  if (input.imageAssetId !== undefined) data.imageAssetId = input.imageAssetId;
  if (input.status !== undefined) data.status = statusFromWire(input.status);
  if (input.timestamp !== undefined) data.timestamp = BigInt(input.timestamp);
  if (input.data !== undefined) data.data = input.data;
  const updated = await prisma.creation.update({ where: { id }, data });
  return toWire(updated);
};

export const softRemove = async (id: string, profileId: string, mode: 'deleted' | 'burned' = 'deleted') => {
  await ensureOwned(id, profileId);
  const updated = await prisma.creation.update({
    where: { id },
    data: { status: statusFromWire(mode) },
  });
  return toWire(updated);
};
