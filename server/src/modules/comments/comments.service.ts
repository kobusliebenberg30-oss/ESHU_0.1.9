import type { Comment, CommentTargetKind } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { HttpError } from '../../middleware/error.js';
import { statusFromWire, statusToWire } from '../../lib/status.js';
import type {
  CreateCommentInput,
  UpdateCommentInput,
  ListCommentsQuery,
} from './comments.schemas.js';

const TARGET_KIND_FROM_WIRE: Record<'creation' | 'game' | 'group', CommentTargetKind> = {
  creation: 'CREATION',
  game: 'GAME',
  group: 'GROUP',
};
const TARGET_KIND_TO_WIRE: Record<CommentTargetKind, 'creation' | 'game' | 'group'> = {
  CREATION: 'creation',
  GAME: 'game',
  GROUP: 'group',
};

const asStringArray = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
};

export const toWire = (c: Comment) => ({
  id: c.id,
  authorProfileId: c.authorProfileId,
  targetKind: TARGET_KIND_TO_WIRE[c.targetKind],
  targetId: c.targetId,
  text: c.text,
  status: statusToWire(c.status),
  likedBy: asStringArray(c.likedBy),
  followedBy: asStringArray(c.followedBy),
  animation: c.animation ?? null,
  data: c.data,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
  editedAt: c.editedAt ? c.editedAt.toISOString() : null,
});

const ensureAuthored = async (id: string, profileId: string): Promise<Comment> => {
  const row = await prisma.comment.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, 'Comment not found');
  if (row.authorProfileId && row.authorProfileId !== profileId) {
    // 403 instead of 404 here is intentional — we don't want to leak that a
    // comment id exists, but the ownership semantics ARE clearer than for
    // private groups since comments don't have privacy. Keep aligned with
    // the rest of the platform: callers see Forbidden.
    throw new HttpError(403, 'Forbidden');
  }
  return row;
};

/**
 * List comments for a single (targetKind, targetId). Always sorted oldest
 * first to match the frontend's render order. Status filter mirrors the
 * other entity list endpoints.
 */
export const list = async (filters: ListCommentsQuery) => {
  const where: Prisma.CommentWhereInput = {
    targetKind: TARGET_KIND_FROM_WIRE[filters.targetKind],
    targetId: filters.targetId,
  };
  if (filters.status !== 'all') where.status = statusFromWire(filters.status);
  const rows = await prisma.comment.findMany({ where, orderBy: { createdAt: 'asc' } });
  return rows.map(toWire);
};

export const getById = async (id: string) => {
  const row = await prisma.comment.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, 'Comment not found');
  return toWire(row);
};

export const create = async (profileId: string, input: CreateCommentInput) => {
  const created = await prisma.comment.create({
    data: {
      authorProfileId: profileId,
      targetKind: TARGET_KIND_FROM_WIRE[input.targetKind],
      targetId: input.targetId,
      text: input.text,
      status: statusFromWire(input.status),
      likedBy: (input.likedBy ?? []) as Prisma.InputJsonValue,
      followedBy: (input.followedBy ?? []) as Prisma.InputJsonValue,
      animation: (input.animation ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      data: ((input.data ?? {}) as object) as Prisma.InputJsonValue,
    },
  });
  return toWire(created);
};

export const update = async (id: string, profileId: string, input: UpdateCommentInput) => {
  await ensureAuthored(id, profileId);
  const data: Prisma.CommentUpdateInput = {};
  if (input.text !== undefined) {
    data.text = input.text;
    data.editedAt = new Date();
  }
  if (input.status !== undefined) data.status = statusFromWire(input.status);
  if (input.likedBy !== undefined) data.likedBy = input.likedBy as Prisma.InputJsonValue;
  if (input.followedBy !== undefined) data.followedBy = input.followedBy as Prisma.InputJsonValue;
  if (input.animation !== undefined) data.animation = input.animation as Prisma.InputJsonValue;
  if (input.data !== undefined) data.data = input.data as Prisma.InputJsonValue;
  const updated = await prisma.comment.update({ where: { id }, data });
  return toWire(updated);
};

/**
 * Toggle the author profile in `likedBy` (no-arg "like/unlike" idempotency).
 * Returns the updated wire-shape row. We do this server-side rather than
 * forcing the client to read-modify-write because the array is per-row state
 * and concurrent likes from two devices could otherwise lose updates.
 */
export const toggleLike = async (id: string, profileId: string) => {
  const row = await prisma.comment.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, 'Comment not found');
  const current = asStringArray(row.likedBy);
  const next = current.includes(profileId)
    ? current.filter((p) => p !== profileId)
    : [...current, profileId];
  const updated = await prisma.comment.update({
    where: { id },
    data: { likedBy: next as Prisma.InputJsonValue },
  });
  return toWire(updated);
};

/** Same shape for follow. */
export const toggleFollow = async (id: string, profileId: string) => {
  const row = await prisma.comment.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, 'Comment not found');
  const current = asStringArray(row.followedBy);
  const next = current.includes(profileId)
    ? current.filter((p) => p !== profileId)
    : [...current, profileId];
  const updated = await prisma.comment.update({
    where: { id },
    data: { followedBy: next as Prisma.InputJsonValue },
  });
  return toWire(updated);
};

export const softRemove = async (
  id: string,
  profileId: string,
  mode: 'deleted' | 'burned' = 'deleted',
) => {
  await ensureAuthored(id, profileId);
  const updated = await prisma.comment.update({
    where: { id },
    data: { status: statusFromWire(mode) },
  });
  return toWire(updated);
};
