// Vercel build: compile server, generate Prisma client, apply migrations when configured.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SERVER = resolve(ROOT, 'server');

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: opts.cwd ?? ROOT, env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const runSoft = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: opts.cwd ?? ROOT, env: process.env });
  if (r.status !== 0) {
    console.warn(`\n[vercel-build] Warning: "${cmd} ${args.join(' ')}" exited ${r.status} — continuing build.\n`);
  }
};

run('npm', ['run', 'build'], { cwd: SERVER });
run('npm', ['run', 'db:generate'], { cwd: SERVER });

if (process.env.DATABASE_URL && process.env.DIRECT_URL) {
  runSoft('npm', ['run', 'db:deploy'], { cwd: SERVER });
} else {
  console.warn(
    '\n[vercel-build] DATABASE_URL and/or DIRECT_URL not set — skipping prisma migrate deploy.\n' +
      'Add both in Vercel → Settings → Environment Variables, then redeploy.\n',
  );
}
