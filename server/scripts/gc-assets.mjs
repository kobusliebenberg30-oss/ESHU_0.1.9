// Ops-wide orphaned-asset reaper. Sweeps every user's assets, deleting the
// row + blob for any asset whose four back-references (User.avatarAssetId,
// Profile.avatarAssetId, Group.coverAssetId, Creation.imageAssetId) are all
// null AND whose createdAt is older than the grace window.
//
// Idempotent. Safe to schedule (e.g. nightly cron). For one-user-only,
// prefer `POST /api/assets/gc` from the authenticated session.
//
// Usage:
//   node scripts/gc-assets.mjs                 # default 1h grace window
//   node scripts/gc-assets.mjs --grace=0       # reap immediately
//   node scripts/gc-assets.mjs --dry-run       # report only
//   DOTENV=.env.test node scripts/gc-assets.mjs

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const which = process.env.DOTENV ?? '.env';
const envPath = resolve(process.cwd(), which);
if (existsSync(envPath)) loadDotenv({ path: envPath, override: true });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set.');
  process.exit(1);
}

// Args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const graceArg = args.find((a) => a.startsWith('--grace='));
const graceMs = graceArg ? Number(graceArg.split('=')[1]) : undefined;

if (graceArg && (!Number.isFinite(graceMs) || graceMs < 0)) {
  console.error(`Invalid --grace value: "${graceArg}". Expected a non-negative integer (ms).`);
  process.exit(1);
}

// Self-contained reimplementation of the GC routine (kept in sync with
// `gcOrphanedAssets` in src/modules/assets/assets.service.ts). We avoid
// importing the .ts service from this .mjs script so the CLI doesn't need
// tsx/transpilation; only @prisma/client + node:fs are used.
const DEFAULT_GRACE_MS = 60 * 60 * 1000;
const effectiveGraceMs = graceMs ?? DEFAULT_GRACE_MS;
const cutoff = new Date(Date.now() - effectiveGraceMs);

const storageRoot = resolve(
  process.cwd(),
  process.env.STORAGE_ROOT ?? './storage/assets',
);
const blobPath = (key) => join(storageRoot, key.slice(0, 2), key);

const prisma = new PrismaClient();

console.log(
  `[gc-assets] DB=${process.env.DATABASE_URL} graceMs=${effectiveGraceMs} dryRun=${dryRun} storageRoot=${storageRoot}`,
);

const candidates = await prisma.asset.findMany({
  where: {
    createdAt: { lt: cutoff },
    AND: [
      { avatarOf: { is: null } },
      { profileAvatar: { is: null } },
      { groupCover: { is: null } },
      { creationImage: { is: null } },
    ],
  },
  select: { id: true, storageKey: true, byteSize: true },
});

let rowsDeleted = 0;
let blobsDeleted = 0;
let bytesReclaimed = 0;

if (!dryRun) {
  for (const a of candidates) {
    try {
      await prisma.asset.delete({ where: { id: a.id } });
      rowsDeleted += 1;
      bytesReclaimed += a.byteSize;
      const sibling = await prisma.asset.findFirst({
        where: { storageKey: a.storageKey },
        select: { id: true },
      });
      if (!sibling) {
        try {
          await unlink(blobPath(a.storageKey));
          blobsDeleted += 1;
        } catch (err) {
          if (err?.code !== 'ENOENT') throw err;
        }
      }
    } catch (err) {
      console.error(`[gc-assets] failed to reap ${a.id}:`, err?.message ?? err);
    }
  }
}

console.log(
  `[gc-assets] ${dryRun ? 'DRY RUN ' : ''}candidates=${candidates.length} rowsDeleted=${rowsDeleted} blobsDeleted=${blobsDeleted} bytesReclaimed=${bytesReclaimed}`,
);

await prisma.$disconnect();
