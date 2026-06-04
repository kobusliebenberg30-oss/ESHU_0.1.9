// One-time backfill for the F3.2 timing-model split:
//   - Copy `data.timingOffsets` (the {weeks,days,hours,mins} triples) into
//     the three new Int columns `timing*OffsetMs` on Game.
//   - Copy `data.timingExtensions[]` into the new GameTimingExtension rows.
//
// Idempotent and safe to run multiple times:
//   - Offsets are only written when the column is currently 0 (the default
//     after migration). If a row already has a non-zero column, we trust it
//     was written correctly post-cutover and skip.
//   - Extensions are deduped by (type, prevTime, nextTime, happenedAt) so
//     re-running this script never inserts duplicates.
//
// Usage:
//   node scripts/backfill-timing.mjs            # uses .env (dev DB)
//   DOTENV=.env.test node scripts/backfill-timing.mjs

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const which = process.env.DOTENV ?? '.env';
const envPath = resolve(process.cwd(), which);
if (existsSync(envPath)) loadDotenv({ path: envPath, override: true });

const prisma = new PrismaClient();

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

const asInt = (v) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

const tripleToMs = (t) => {
  if (!t || typeof t !== 'object') return 0;
  return (
    asInt(t.weeks) * WEEK_MS +
    asInt(t.days) * DAY_MS +
    asInt(t.hours) * HOUR_MS +
    asInt(t.mins) * MIN_MS
  );
};

const VALID_TYPES = new Set([
  'start_extended',
  'submission_extended',
  'end_extended',
  'future_start',
]);

const toDate = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (v instanceof Date) return v;
  return null;
};

async function backfillOffsets() {
  // Only consider rows that haven't been written yet (still all-zeros).
  const rows = await prisma.game.findMany({
    where: {
      timingStartOffsetMs: 0,
      timingSubmissionOffsetMs: 0,
      timingEndOffsetMs: 0,
    },
    select: { id: true, data: true },
  });
  let updated = 0;
  for (const r of rows) {
    const data = r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : null;
    const t = data?.timingOffsets;
    if (!t || typeof t !== 'object') continue;
    const startMs = tripleToMs(t.start);
    const submissionMs = tripleToMs(t.submission);
    const endMs = tripleToMs(t.end);
    if (startMs === 0 && submissionMs === 0 && endMs === 0) continue;
    await prisma.game.update({
      where: { id: r.id },
      data: {
        timingStartOffsetMs: startMs,
        timingSubmissionOffsetMs: submissionMs,
        timingEndOffsetMs: endMs,
      },
    });
    updated += 1;
  }
  console.log(`[backfill] offsets: rows_scanned=${rows.length} rows_updated=${updated}`);
}

async function backfillExtensions() {
  const rows = await prisma.game.findMany({ select: { id: true, data: true } });
  let inserted = 0;
  let scanned = 0;
  for (const r of rows) {
    scanned += 1;
    const data = r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data : null;
    const arr = data?.timingExtensions;
    if (!Array.isArray(arr) || arr.length === 0) continue;

    // Normalise each entry to the storage shape.
    const incoming = [];
    for (const raw of arr) {
      if (!raw || typeof raw !== 'object') continue;
      const type = raw.type;
      if (typeof type !== 'string' || !VALID_TYPES.has(type)) continue;
      const happenedAt = toDate(raw.extendedAt) ?? toDate(raw.setAt);
      if (!happenedAt) continue;
      const prevTime = toDate(raw.originalTime);
      const nextTime = toDate(raw.newTime) ?? toDate(raw.scheduledFor);
      incoming.push({ type, prevTime, nextTime, happenedAt });
    }
    if (!incoming.length) continue;

    // Dedupe against existing rows for this game.
    const existing = await prisma.gameTimingExtension.findMany({
      where: { gameId: r.id },
      select: { type: true, prevTime: true, nextTime: true, happenedAt: true },
    });
    const keyOf = (e) =>
      [
        e.type,
        e.prevTime?.getTime() ?? '',
        e.nextTime?.getTime() ?? '',
        e.happenedAt.getTime(),
      ].join('|');
    const seen = new Set(existing.map(keyOf));
    const fresh = incoming.filter((e) => !seen.has(keyOf(e)));
    if (!fresh.length) continue;

    await prisma.gameTimingExtension.createMany({
      data: fresh.map((e) => ({
        gameId: r.id,
        type: e.type,
        prevTime: e.prevTime,
        nextTime: e.nextTime,
        happenedAt: e.happenedAt,
      })),
    });
    inserted += fresh.length;
  }
  console.log(`[backfill] extensions: games_scanned=${scanned} rows_inserted=${inserted}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set.');
    process.exit(1);
  }
  console.log('[backfill] DB =', process.env.DATABASE_URL);
  await backfillOffsets();
  await backfillExtensions();
  await prisma.$disconnect();
  console.log('[backfill] done.');
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
