// Push server/.env.production to Vercel (production + preview).
// Copy server/.env.production.example → server/.env.production and fill in secrets first.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const envFile = resolve(import.meta.dirname, '../server/.env.production');
if (!existsSync(envFile)) {
  console.error(`Missing ${envFile}`);
  console.error('Copy server/.env.production.example → server/.env.production and fill in values.');
  process.exit(1);
}

const lines = readFileSync(envFile, 'utf8').split(/\r?\n/);
const vars = new Map();
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const i = trimmed.indexOf('=');
  if (i === -1) continue;
  vars.set(trimmed.slice(0, i), trimmed.slice(i + 1));
}

const required = [
  'DATABASE_URL',
  'DIRECT_URL',
  'SESSION_SECRET',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'CORS_ORIGIN',
];
for (const key of required) {
  if (!vars.get(key) || vars.get(key).includes('replace-with')) {
    console.error(`Set ${key} in server/.env.production before pushing.`);
    process.exit(1);
  }
}

for (const envName of ['production', 'preview']) {
  for (const [name, value] of vars) {
    const r = spawnSync('npx', ['vercel', 'env', 'add', name, envName, '--force'], {
      input: value,
      stdio: ['pipe', 'inherit', 'inherit'],
      shell: true,
    });
    if (r.status !== 0) {
      console.error(`Failed to set ${name} for ${envName}`);
      process.exit(r.status ?? 1);
    }
    console.log(`Set ${name} (${envName})`);
  }
}

console.log('\nDone. Run: npx vercel deploy --prod\n');
