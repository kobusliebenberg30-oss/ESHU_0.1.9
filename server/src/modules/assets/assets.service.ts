import { createHash } from 'node:crypto';
import type { AssetKind } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { storage } from '../../storage/index.js';
import { HttpError } from '../../middleware/error.js';
import { logger } from '../../lib/logger.js';

const MIME_TO_KIND: Record<string, AssetKind> = {
  'image/png': 'IMAGE',
  'image/jpeg': 'IMAGE',
  'image/webp': 'IMAGE',
  'image/gif': 'IMAGE',
  'image/avif': 'IMAGE',
  'image/svg+xml': 'IMAGE',
  'video/mp4': 'VIDEO',
  'video/webm': 'VIDEO',
  'audio/mpeg': 'AUDIO',
  'audio/ogg': 'AUDIO',
  'audio/wav': 'AUDIO',
  'application/pdf': 'DOCUMENT',
};

export interface UploadInput {
  ownerId: string;
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
}

export const uploadAsset = async (input: UploadInput) => {
  const kind: AssetKind = MIME_TO_KIND[input.mimeType] ?? 'OTHER';
  const sha256 = createHash('sha256').update(input.buffer).digest('hex');

  const existing = await prisma.asset.findUnique({
    where: { ownerId_sha256: { ownerId: input.ownerId, sha256 } },
  });
  if (existing) {
    logger.info(
      {
        event: 'asset.upload.dedup',
        assetId: existing.id,
        ownerId: input.ownerId,
        byteSize: existing.byteSize,
        mimeType: existing.mimeType,
      },
      'asset upload deduped',
    );
    return existing;
  }

  const driver = storage();
  if (!(await driver.exists(sha256))) {
    await driver.put(sha256, input.buffer, input.mimeType);
  }

  const asset = await prisma.asset.create({
    data: {
      ownerId: input.ownerId,
      kind,
      mimeType: input.mimeType,
      byteSize: input.buffer.byteLength,
      sha256,
      storageKey: sha256,
      originalName: input.originalName ?? null,
    },
  });
  logger.info(
    {
      event: 'asset.upload.created',
      assetId: asset.id,
      ownerId: asset.ownerId,
      byteSize: asset.byteSize,
      mimeType: asset.mimeType,
      kind: asset.kind,
    },
    'asset upload completed',
  );
  return asset;
};

/**
 * Asset visibility rules:
 *   - The owner can always read their own assets (including orphaned ones).
 *   - Any authenticated user can read an asset that is *attached* to at
 *     least one referencing entity — a User/Profile avatar, a Group cover,
 *     or a Creation image. This is required for the platform's core SU /
 *     versus mechanic where players display each other's creations.
 *   - Orphaned assets (not attached to anything) stay owner-only so a stale
 *     upload can't be probed.
 *
 * Returns the asset row when readable, throws 403/404 otherwise.
 */
export const getAssetForUser = async (assetId: string, userId: string | undefined) => {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: {
      avatarOf: { select: { id: true } },
      profileAvatar: { select: { id: true } },
      groupCover: { select: { id: true } },
      creationImage: { select: { id: true } },
    },
  });
  if (!asset) throw new HttpError(404, 'Asset not found');
  if (asset.ownerId === userId) return asset;
  const isAttached = Boolean(
    asset.avatarOf || asset.profileAvatar || asset.groupCover || asset.creationImage,
  );
  if (!isAttached) throw new HttpError(403, 'Forbidden');
  return asset;
};

// Default grace window: assets younger than this are NEVER GC'd, even if
// they appear orphaned. Protects the brief gap between `POST /api/assets`
// (asset row created) and the follow-up `PATCH /api/profiles/:id` (or any
// other call that attaches the asset to a referrer). One hour is plenty for
// typical client retry strategies.
const DEFAULT_GRACE_MS = 60 * 60 * 1000;

export interface GcOptions {
  /** Restrict to a single owner (per-user GC). Omit to sweep all users. */
  ownerId?: string;
  /** Override the grace window in ms. Tests pass `0` for an instant sweep. */
  graceMs?: number;
  /** Don't actually delete; just count what would be deleted. */
  dryRun?: boolean;
}

export interface GcResult {
  rowsDeleted: number;
  blobsDeleted: number;
  bytesReclaimed: number;
  /** Asset ids that were targeted (for logging / test assertions). */
  ids: string[];
}

/**
 * Reap orphaned Asset rows + their blobs.
 *
 * "Orphaned" means none of the four back-references point to the row:
 *   - User.avatarAssetId   (auth-level avatar)
 *   - Profile.avatarAssetId
 *   - Group.coverAssetId
 *   - Creation.imageAssetId
 *
 * Blob deletion is content-aware: we only `storage.delete(storageKey)` when
 * no surviving Asset row shares that key. This makes the GC safe even if
 * the upload path later starts deduping across owners.
 *
 * The whole sweep is a sequence of independent per-asset steps; a transient
 * failure on one asset (e.g. the storage driver hiccups) doesn't roll back
 * earlier deletes. We log+continue.
 */
export const gcOrphanedAssets = async (opts: GcOptions = {}): Promise<GcResult> => {
  const graceMs = opts.graceMs ?? DEFAULT_GRACE_MS;
  const cutoff = new Date(Date.now() - graceMs);

  const candidates = await prisma.asset.findMany({
    where: {
      ...(opts.ownerId ? { ownerId: opts.ownerId } : {}),
      createdAt: { lt: cutoff },
      // All four 1:1 back-references must be null. `is: null` is Prisma's
      // canonical form for filtering on the non-FK side of an optional
      // one-to-one relation.
      AND: [
        { avatarOf: { is: null } },
        { profileAvatar: { is: null } },
        { groupCover: { is: null } },
        { creationImage: { is: null } },
      ],
    },
    select: { id: true, storageKey: true, byteSize: true },
  });

  const result: GcResult = {
    rowsDeleted: 0,
    blobsDeleted: 0,
    bytesReclaimed: 0,
    ids: candidates.map((c) => c.id),
  };

  if (opts.dryRun || candidates.length === 0) return result;

  const driver = storage();
  for (const a of candidates) {
    try {
      await prisma.asset.delete({ where: { id: a.id } });
      result.rowsDeleted += 1;
      result.bytesReclaimed += a.byteSize;
      // Only nuke the blob if no sibling row still uses this storageKey.
      const sibling = await prisma.asset.findFirst({
        where: { storageKey: a.storageKey },
        select: { id: true },
      });
      if (!sibling) {
        await driver.delete(a.storageKey);
        result.blobsDeleted += 1;
      }
    } catch {
      // Swallow per-asset errors so one bad row can't poison the whole
      // sweep. Caller can re-run; the surviving rows will be picked up.
    }
  }
  return result;
};
