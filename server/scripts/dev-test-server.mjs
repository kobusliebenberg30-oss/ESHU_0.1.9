#!/usr/bin/env node
/**
 * dev-test-server.mjs
 *
 * Launches the ESHU server in TEST mode using `.env.test` overrides, so the
 * smoke scripts (`npm run smoke:onboarding`, `npm run smoke:account-cycle`)
 * have a safe target that never touches the dev database.
 *
 *   - Loads `.env.test` BEFORE `tsx` imports `src/env.ts`, so DATABASE_URL,
 *     NODE_ENV, SESSION_SECRET, and friends come from the test env.
 *   - Defaults PORT to 3100 (vs dev's 3000) so the two servers can run
 *     side-by-side.
 *   - Refuses to start if .env.test is missing or DATABASE_URL doesn't look
 *     like a test database. Mirrors the guard in db-test-setup.mjs.
 *
 * Run: `npm run dev:test`
 */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const envFile = resolve(process.cwd(), '.env.test');
if (!existsSync(envFile)) {
  console.error('\n.env.test not found. Copy .env.test.example to .env.test first.\n');
  process.exit(1);
}

loadDotenv({ path: envFile, override: true });

if (!process.env.DATABASE_URL || !/test/i.test(process.env.DATABASE_URL)) {
  console.error(
    '\nDATABASE_URL in .env.test must point at a database whose name contains "test".\n' +
      'Refusing to start to avoid clobbering the dev DB.\n',
  );
  process.exit(1);
}

if (process.env.NODE_ENV !== 'test') {
  console.error('\nNODE_ENV in .env.test must be "test".\n');
  process.exit(1);
}

// .env.test ships with PORT=0 (used by Vitest for ephemeral ports). For a
// long-running smoke target we want a stable port that doesn't clash with
// the dev server on 3000.
if (!process.env.PORT || process.env.PORT === '0') {
  process.env.PORT = '3100';
}

console.log(
  `[dev:test] starting test server on port ${process.env.PORT} ` +
    `(DATABASE_URL=${process.env.DATABASE_URL.replace(/:[^:@/]*@/, ':***@')})`,
);

const tsxCli = resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
const child = spawn(process.execPath, [tsxCli, 'watch', 'src/index.ts'], {
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 0));
