// One-time backfill: copy `data.memberProfileIds` from Group / Game rows
// into the new GroupMember / GameMember join tables.
//
// Idempotent: skips entries that already have rows in the join table.
// Safe: only inserts links to profiles that actually exist.
//
// Usage:
//   node scripts/backfill-members.mjs           # uses .env
//   DOTENV=.env.test node scripts/backfill-members.mjs

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const which = process.env.DOTENV ?? '.env';
const envPath = resolve(process.cwd(), which);
if (existsSync(envPath)) loadDotenv({ path: envPath, override: true });

const prisma = new PrismaClient();

const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

async function backfillKind(kind /* 'group' | 'game' */) {
  const rows =
    kind === 'group'
      ? await prisma.group.findMany({ select: { id: true, data: true } })
      : await prisma.game.findMany({ select: { id: true, data: true } });

  let linked = 0;
  let scanned = 0;
  for (const r of rows) {
    scanned += 1;
    const ids =
      r.data && typeof r.data === 'object' && !Array.isArray(r.data)
        ? r.data.memberProfileIds
        : null;
    if (!isStringArray(ids) || ids.length === 0) continue;

    const valid = await prisma.profile.findMany({
      where: { id: { in: Array.from(new Set(ids)) } },
      select: { id: true },
    });
    if (!valid.length) continue;

    if (kind === 'group') {
      await prisma.groupMember.createMany({
        data: valid.map((p) => ({ groupId: r.id, profileId: p.id })),
        skipDuplicates: true,
      });
      await prisma.group.update({ where: { id: r.id }, data: { members: valid.length } });
    } else {
      await prisma.gameMember.createMany({
        data: valid.map((p) => ({ gameId: r.id, profileId: p.id })),
        skipDuplicates: true,
      });
    }
    linked += valid.length;
  }
  console.log(`[backfill] ${kind}s scanned=${scanned} links_created=${linked}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set.');
    process.exit(1);
  }
  console.log('[backfill] DB =', process.env.DATABASE_URL);
  await backfillKind('group');
  await backfillKind('game');
  await prisma.$disconnect();
  console.log('[backfill] done.');
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
