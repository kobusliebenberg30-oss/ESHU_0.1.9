#!/usr/bin/env node
/**
 * lint-sql.mjs
 *
 * Lightweight, dependency-free linter for Prisma migration SQL files. Catches
 * common foot-guns *before* a migration is committed:
 *
 *   - Missing trailing newline.
 *   - DROP TABLE / DROP COLUMN in non-init migrations without an explicit
 *     opt-in marker (-- @allow-destructive on the line above).
 *   - Use of `CASCADE` on DROP without explicit opt-in.
 *   - Tabs (Prisma generates spaces; mixing tabs makes review noisy).
 *   - Trailing whitespace.
 *
 * Exit codes:
 *   0 -> all migrations clean
 *   1 -> at least one violation
 *
 * Run via `npm run db:lint:sql`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'prisma', 'migrations');

/** @type {Array<{ file: string; line: number; rule: string; message: string }>} */
const violations = [];

function violate(file, line, rule, message) {
  violations.push({ file, line, rule, message });
}

function lintFile(absPath, relPath, isInitMigration) {
  const text = readFileSync(absPath, 'utf8');
  if (!text.endsWith('\n')) {
    violate(relPath, text.split('\n').length, 'trailing-newline', 'file must end with a newline');
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    const prev = i > 0 ? lines[i - 1] : '';
    const optIn = /@allow-destructive/i.test(prev);

    if (/\t/.test(line)) {
      violate(relPath, lineNo, 'no-tabs', 'tab character; use spaces');
    }
    if (/[ \t]+$/.test(line)) {
      violate(relPath, lineNo, 'trailing-whitespace', 'trailing whitespace');
    }

    if (!isInitMigration) {
      if (/\bDROP\s+TABLE\b/i.test(line) && !optIn) {
        violate(
          relPath,
          lineNo,
          'no-implicit-drop-table',
          'DROP TABLE without `-- @allow-destructive` opt-in on previous line',
        );
      }
      if (/\bDROP\s+COLUMN\b/i.test(line) && !optIn) {
        violate(
          relPath,
          lineNo,
          'no-implicit-drop-column',
          'DROP COLUMN without `-- @allow-destructive` opt-in on previous line',
        );
      }
      if (/\bCASCADE\b/i.test(line) && /\bDROP\b/i.test(line) && !optIn) {
        violate(
          relPath,
          lineNo,
          'no-implicit-cascade-drop',
          'DROP ... CASCADE without `-- @allow-destructive` opt-in on previous line',
        );
      }
    }
  }
}

function main() {
  let stat;
  try {
    stat = statSync(migrationsDir);
  } catch {
    console.error(`[lint-sql] migrations dir not found: ${migrationsDir}`);
    process.exit(2);
  }
  if (!stat.isDirectory()) {
    console.error(`[lint-sql] not a directory: ${migrationsDir}`);
    process.exit(2);
  }

  const entries = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  if (entries.length === 0) {
    console.log('[lint-sql] no migrations found, nothing to lint');
    return;
  }

  // Init migration = the chronologically first directory. Drops there are
  // expected (table replaces / renames during initial schema design).
  const initName = entries[0];

  let filesLinted = 0;
  for (const dir of entries) {
    const sql = join(migrationsDir, dir, 'migration.sql');
    try {
      const s = statSync(sql);
      if (!s.isFile()) continue;
    } catch {
      continue;
    }
    lintFile(sql, `${dir}/migration.sql`, dir === initName);
    filesLinted++;
  }

  if (violations.length === 0) {
    console.log(`[lint-sql] ok — ${filesLinted} migration file(s) linted`);
    return;
  }

  for (const v of violations) {
    console.error(`${v.file}:${v.line} [${v.rule}] ${v.message}`);
  }
  console.error(`[lint-sql] ${violations.length} violation(s) across ${filesLinted} file(s)`);
  process.exit(1);
}

main();
