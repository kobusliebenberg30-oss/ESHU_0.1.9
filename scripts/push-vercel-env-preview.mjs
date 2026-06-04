import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const envFile = resolve(import.meta.dirname, '../server/.env.production');
const raw = readFileSync(envFile, 'utf8');
const lines = raw.split(/\r?\n/);
const vars = [];
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  vars.push({ name: trimmed.slice(0, idx), value: trimmed.slice(idx + 1) });
}
for (const { name, value } of vars) {
  const r = spawnSync('npx', ['vercel', 'env', 'add', name, 'preview', '--force', '--value', value, '--yes'], {
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: false,
    cwd: resolve(import.meta.dirname, '..'),
    input: '\n',
  });
  if (r.status !== 0) {
    console.error(`Failed to set preview env ${name}`);
    process.exit(r.status ?? 1);
  }
  console.log(`Set ${name} (preview)`);
}
