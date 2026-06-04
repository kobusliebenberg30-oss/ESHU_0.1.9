// Apply Prisma migrations against the test database.
// Reads DATABASE_URL from .env.test (override semantics).

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const envFile = resolve(process.cwd(), '.env.test');
if (!existsSync(envFile)) {
  console.error('\n.env.test not found. Copy .env.test.example to .env.test first.\n');
  process.exit(1);
}

loadDotenv({ path: envFile, override: true });

if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('test')) {
  console.error('\nDATABASE_URL in .env.test must point at a database whose name contains "test".\n');
  process.exit(1);
}

const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});
process.exit(r.status ?? 0);
