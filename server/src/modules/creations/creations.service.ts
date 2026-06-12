import type { Creation } from '@prisma/client';
import { Prisma } from '@prisma/client';
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

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const toggleDataProfileId = (data: unknown, field: 'likedBy' | 'followedBy', profileId: string) => {
  const nextData = data && typeof data === 'object' && !Array.isArray(data)
    ? { ...(data as Record<string, unknown>) }
    : {};
  const current = asStringArray(nextData[field]);
  nextData[field] = current.includes(profileId)
    ? current.filter((id) => id !== profileId)
    : [...current, profileId];
  return nextData;
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
  const hostGame = await prisma.game.findUnique({
    where: { id: input.hostGameId },
    select: {
      id: true,
      ownerProfileId: true,
      privacy: true,
      status: true,
      memberships: {
        where: { profileId },
        select: { profileId: true },
      },
    },
  });
  if (!hostGame) throw new HttpError(404, 'Host game not found');
  if (hostGame.status !== 'ACTIVE') throw new HttpError(409, 'Host game is not active');
  const canCreateInGame =
    hostGame.privacy === 'public' ||
    hostGame.ownerProfileId === profileId ||
    hostGame.memberships.length > 0;
  if (!canCreateInGame) throw new HttpError(403, 'GAME_PRIVATE');

  const created = await prisma.creation.create({
    data: {
      ownerProfileId: profileId,
      name: input.name,
      description: input.description ?? null,
      devices: input.devices ?? null,
      tags: input.tags ?? null,
      dateMade: input.dateMade ?? null,
      hostGameId: input.hostGameId,
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

const toggleReaction = async (id: string, profileId: string, field: 'likedBy' | 'followedBy') => {
  const existing = await prisma.creation.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Creation not found');
  if (existing.status !== 'ACTIVE') throw new HttpError(409, 'Creation is not active');
  const updated = await prisma.creation.update({
    where: { id },
    data: {
      data: toggleDataProfileId(existing.data, field, profileId) as Prisma.InputJsonValue,
    },
  });
  return toWire(updated);
};

export const toggleLike = (id: string, profileId: string) => toggleReaction(id, profileId, 'likedBy');
export const toggleFollow = (id: string, profileId: string) => toggleReaction(id, profileId, 'followedBy');

export const softRemove = async (id: string, profileId: string, mode: 'deleted' | 'burned' = 'deleted') => {
  await ensureOwned(id, profileId);
  const updated = await prisma.creation.update({
    where: { id },
    data: { status: statusFromWire(mode) },
  });
  return toWire(updated);
};
