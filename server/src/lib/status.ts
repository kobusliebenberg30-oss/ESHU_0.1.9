import { EntityStatus } from '@prisma/client';

// Frontend uses lowercase strings ('active' | 'deleted' | 'burned' | 'finished').
// Database uses Prisma's enum (uppercase). Map at the boundary.

const FROM_DB: Record<EntityStatus, 'active' | 'deleted' | 'burned' | 'finished'> = {
  ACTIVE: 'active',
  DELETED: 'deleted',
  BURNED: 'burned',
  FINISHED: 'finished',
};

const TO_DB: Record<string, EntityStatus> = {
  active: EntityStatus.ACTIVE,
  deleted: EntityStatus.DELETED,
  burned: EntityStatus.BURNED,
  finished: EntityStatus.FINISHED,
};

export const statusToWire = (s: EntityStatus): string => FROM_DB[s] ?? 'active';
export const statusFromWire = (
  s: string | null | undefined,
  fallback: EntityStatus = EntityStatus.ACTIVE,
): EntityStatus => {
  if (!s) return fallback;
  const mapped = TO_DB[s.toLowerCase()];
  return mapped ?? fallback;
};
