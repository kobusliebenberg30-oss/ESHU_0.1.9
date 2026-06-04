// One-command bootstrap for a fresh clone OR a partially-initialized repo.
// Every step is idempotent: if the prerequisite already holds, the step is a
// silent no-op. Designed to run from the repository root via `npm run setup`.
//
// Pipeline:
//   1. Ensure server/.env       (template + fresh SESSION_SECRET)
//   2. Ensure server/.env.test  (test template + fresh SESSION_SECRET)
//   3. Ensure docker is on PATH  (clear instruction if not)
//   4. `docker compose up -d`    (starts postgres in detached mode)
//   5. Wait for the container to report healthy (~30s budget)
//   6. Create the eshu_test database if missing
//   7. Apply migrations to the dev database  (prisma migrate deploy)
//   8. Apply migrations to the test database (db:test:setup)
//
// Any step that fails prints a focused error and exits non-zero. Steps that
// can be skipped print a SKIP line so it's obvious what work was done.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SERVER = resolve(ROOT, 'server');
const PG_CONTAINER = 'eshu-postgres';
const TEST_DB = 'eshu_test';

const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

const step = (n, msg) => console.log(`\n${bold(cyan(`[${n}/8]`))} ${msg}`);
const ok = (msg) => console.log(`  ${green('OK')}    ${msg}`);
const skip = (msg) => console.log(`  ${yellow('SKIP')}  ${msg}`);
const die = (msg, hint) => {
  console.error(`  ${red('FAIL')}  ${msg}`);
  if (hint) console.error(`        ${hint}`);
  process.exit(1);
};

// NOTE: we never set `shell: true`. On Windows, that would route through
// cmd.exe and re-tokenise our pre-structured argv on whitespace, which
// shreds quoted SQL like `CREATE DATABASE eshu_test OWNER eshu`. All commands
// we invoke (`docker`, `node`) are real executables on PATH, not shell shims,
// so direct spawn works the same on every platform.
const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { stdio: 'inherit', ...opts });

const capture = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    ...opts,
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- step 1 + 2
const bootstrapEnv = (variant /* '' | '--test' */, label) => {
  const args = ['scripts/bootstrap-env.mjs'];
  if (variant) args.push(variant);
  const r = capture('node', args, { cwd: SERVER });
  if (r.status !== 0) {
    die(`${label}: bootstrap-env exited ${r.status}`, r.stderr?.trim());
  }
  // bootstrap-env writes either "wrote ..." or "already exists, leaving ..."
  if (r.stdout.includes('already exists')) skip(`${label} already present`);
  else ok(`${label} written with fresh SESSION_SECRET`);
};

step(1, 'Bootstrap server/.env');
bootstrapEnv('', 'server/.env');

step(2, 'Bootstrap server/.env.test');
bootstrapEnv('--test', 'server/.env.test');

// ----------------------------------------------------------------- step 3
step(3, 'Verify Docker is available');
{
  const r = capture('docker', ['--version']);
  if (r.status !== 0) {
    die(
      'Docker is not on PATH.',
      'Install Docker Desktop (https://www.docker.com/products/docker-desktop) and ensure it is running, then re-run `npm run setup`.',
    );
  }
  ok(r.stdout.trim());
}

// ----------------------------------------------------------------- step 4
step(4, 'Start Postgres via docker compose');
{
  const r = run('docker', ['compose', '-f', 'server/docker-compose.yml', 'up', '-d'], {
    cwd: ROOT,
  });
  if (r.status !== 0) {
    die('docker compose up failed.', 'Make sure Docker Desktop is running.');
  }
  ok(`container ${PG_CONTAINER} started (or already running)`);
}

// ----------------------------------------------------------------- step 5
step(5, `Wait for ${PG_CONTAINER} to report healthy`);
{
  const deadline = Date.now() + 60_000;
  let last = '';
  while (Date.now() < deadline) {
    const r = capture('docker', [
      'inspect',
      '--format',
      '{{.State.Health.Status}}',
      PG_CONTAINER,
    ]);
    last = (r.stdout || '').trim();
    if (last === 'healthy') break;
    await sleep(1_000);
  }
  if (last !== 'healthy') {
    die(`container did not become healthy within 60s (last status: "${last || 'unknown'}")`, 'Run `docker logs eshu-postgres` to investigate.');
  }
  ok('container is healthy');
}

// ----------------------------------------------------------------- step 6
step(6, `Ensure database "${TEST_DB}" exists`);
{
  const check = capture('docker', [
    'exec',
    PG_CONTAINER,
    'psql', '-U', 'eshu', '-d', 'eshu', '-tAc',
    `SELECT 1 FROM pg_database WHERE datname='${TEST_DB}'`,
  ]);
  if ((check.stdout || '').trim() === '1') {
    skip(`${TEST_DB} already exists`);
  } else {
    const create = run('docker', [
      'exec',
      PG_CONTAINER,
      'psql', '-U', 'eshu', '-d', 'eshu', '-c',
      `CREATE DATABASE ${TEST_DB} OWNER eshu`,
    ]);
    if (create.status !== 0) die(`failed to create ${TEST_DB}`);
    ok(`${TEST_DB} created`);
  }
}

// ----------------------------------------------------------------- step 7
step(7, 'Apply migrations to the development database');
{
  const prismaBin = resolve(SERVER, 'node_modules/prisma/build/index.js');
  if (!existsSync(prismaBin)) {
    die('prisma is not installed in server/.', 'Run `npm install` from the repo root, then `npm install --prefix server`.');
  }
  const r = run('node', [prismaBin, 'migrate', 'deploy'], { cwd: SERVER });
  if (r.status !== 0) die('prisma migrate deploy failed for dev database');
  ok('dev database migrated');
}

// ----------------------------------------------------------------- step 8
step(8, 'Apply migrations to the test database');
{
  const r = run('node', ['scripts/db-test-setup.mjs'], { cwd: SERVER });
  if (r.status !== 0) die('db-test-setup failed');
  ok('test database migrated');
}

console.log(
  `\n${bold(green('All set.'))} Run ${bold('npm run dev')} from the repo root to start the website and API on ${bold('http://localhost:3000')}.\n`,
);
