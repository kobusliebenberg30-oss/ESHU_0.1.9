/**
 * Test runtime setup. Runs ONCE per worker before any test file imports the
 * application. Loads `.env.test` (if present) so that `src/env.ts` parses
 * with test-scoped values, then verifies it's actually pointing at a `test`
 * database to avoid accidental data loss.
 */
import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(process.cwd(), '.env.test');
if (existsSync(envFile)) {
  loadDotenv({ path: envFile, override: true });
}

if (process.env.NODE_ENV !== 'test') {
  process.env.NODE_ENV = 'test';
}

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('test')) {
  // eslint-disable-next-line no-console
  console.error(
    '\n[test/setup] DATABASE_URL must point at a database whose name contains "test".\n' +
      'Set it in .env.test (see .env.test.example).\n',
  );
  process.exit(1);
}

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  process.env.SESSION_SECRET = 'test-test-test-test-test-test-test-test';
}
