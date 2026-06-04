// Manual admin deletion of a user account. Use when a person asks us to
// permanently delete their account and you need to action it directly
// (no password, no signed-in session required).
//
// This uses `prisma.user.delete`, which cascades to:
//   - Session   (all sessions for the user — effectively forces a logout)
//   - Profile   (every in-app profile the user owned)
//   - Asset     (every blob the user uploaded)
//   - UserSetting
//
// Groups / Games / Creations the user owned via a Profile keep existing
// but have `ownerProfileId` set to null. They're reaped lazily by future
// cleanup logic. If you want them gone too, delete them by hand before
// deleting the user (see --with-owned flag below — intentionally NOT
// implemented here; prefer a manual review rather than a big destructive
// flag).
//
// Safety:
//   - Dry-run by default. Prints what will be deleted.
//   - Requires --confirm to actually run the delete.
//   - Looks up by --email, --username, or --id. At least one is required.
//   - All comparisons are exact (no LIKE / no partial match) to avoid
//     accidentally nuking the wrong account.
//
// Usage (from the server/ directory):
//   node scripts/delete-user.mjs --email=alice@example.com
//   node scripts/delete-user.mjs --username=alice
//   node scripts/delete-user.mjs --id=ckxxxx...
//   node scripts/delete-user.mjs --email=alice@example.com --confirm
//   DOTENV=.env.test node scripts/delete-user.mjs --email=...
//
// After running with --confirm you should also run the orphaned-asset
// sweeper so any blobs the user owned that weren't referenced elsewhere
// get fully released from disk:
//
//   node scripts/gc-assets.mjs --grace=0

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ----- env -----------------------------------------------------------------
const which = process.env.DOTENV ?? '.env';
const envPath = resolve(process.cwd(), which);
if (existsSync(envPath)) loadDotenv({ path: envPath, override: true });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set.');
  process.exit(1);
}

// ----- args ----------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const idx = hit.indexOf('=');
  return idx === -1 ? true : hit.slice(idx + 1);
};

const email = flag('email');
const username = flag('username');
const id = flag('id');
const confirm = flag('confirm') === true;

const selectors = [email && 'email', username && 'username', id && 'id'].filter(Boolean);
if (selectors.length === 0) {
  console.error(
    'Missing selector. Provide exactly one of:\n' +
      '  --email=<address>\n' +
      '  --username=<name>\n' +
      '  --id=<cuid>',
  );
  process.exit(1);
}
if (selectors.length > 1) {
  console.error(`Provide only one selector. Got: ${selectors.join(', ')}`);
  process.exit(1);
}

// ----- look up -------------------------------------------------------------
const prisma = new PrismaClient();

const where = email ? { email } : username ? { username } : { id };

const user = await prisma.user.findUnique({
  where,
  select: {
    id: true,
    email: true,
    username: true,
    displayName: true,
    createdAt: true,
    lastLoginAt: true,
    _count: {
      select: {
        sessions: true,
        profiles: true,
        assets: true,
      },
    },
  },
});

if (!user) {
  console.error(`[delete-user] No user matched ${JSON.stringify(where)}`);
  await prisma.$disconnect();
  process.exit(2);
}

// Count downstream rows we'd set-null (not cascade) — just informational.
const profileIds = (
  await prisma.profile.findMany({ where: { userId: user.id }, select: { id: true } })
).map((p) => p.id);

const [ownedGroups, ownedGames, ownedCreations] = await Promise.all([
  prisma.group.count({ where: { ownerProfileId: { in: profileIds } } }),
  prisma.game.count({ where: { ownerProfileId: { in: profileIds } } }),
  prisma.creation.count({ where: { ownerProfileId: { in: profileIds } } }),
]);

// ----- report --------------------------------------------------------------
console.log(`\n[delete-user] Target`);
console.log(`  id          : ${user.id}`);
console.log(`  email       : ${user.email}`);
console.log(`  username    : ${user.username}`);
console.log(`  displayName : ${user.displayName ?? '(none)'}`);
console.log(`  createdAt   : ${user.createdAt.toISOString()}`);
console.log(`  lastLoginAt : ${user.lastLoginAt ? user.lastLoginAt.toISOString() : '(never)'}`);

console.log(`\n[delete-user] Will be deleted by cascade`);
console.log(`  sessions    : ${user._count.sessions}`);
console.log(`  profiles    : ${user._count.profiles}`);
console.log(`  assets      : ${user._count.assets}`);
console.log(`  userSetting : 0 or 1 (cascades automatically)`);

console.log(`\n[delete-user] Will be orphaned (ownerProfileId → NULL)`);
console.log(`  groups      : ${ownedGroups}`);
console.log(`  games       : ${ownedGames}`);
console.log(`  creations   : ${ownedCreations}`);
console.log(
  '  (These survive and become ownerless. Delete them manually first if you\n' +
    '   want them purged with the user.)',
);

if (!confirm) {
  console.log('\n[delete-user] DRY RUN. Re-run with --confirm to actually delete.\n');
  await prisma.$disconnect();
  process.exit(0);
}

// ----- delete --------------------------------------------------------------
try {
  await prisma.user.delete({ where: { id: user.id } });
  console.log(`\n[delete-user] Deleted user ${user.id} (${user.email}).`);
  console.log(
    '[delete-user] Recommend running `node scripts/gc-assets.mjs --grace=0`\n' +
      '              to reclaim any now-unreferenced blobs on disk.',
  );
} catch (err) {
  console.error(`\n[delete-user] Delete failed:`, err?.message ?? err);
  await prisma.$disconnect();
  process.exit(1);
}

await prisma.$disconnect();
