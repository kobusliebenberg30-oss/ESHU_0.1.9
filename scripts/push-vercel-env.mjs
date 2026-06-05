#!/usr/bin/env node
/**
 * Push server/.env values to Vercel (production + preview).
 *
 * Option A — API (recommended in CI):
 *   set VERCEL_TOKEN=...  (Vercel → Account → Tokens)
 *   set VERCEL_TEAM=eshu002   (optional team slug)
 *   node scripts/push-vercel-env.mjs --project=eshu-0-1-9
 *
 * Option B — CLI (interactive login):
 *   npx vercel login
 *   npx vercel link   # pick echo-0-1-9
 *   node scripts/push-vercel-env.mjs
 */
import { spawnSync } from 'node:child_process';
import https from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const envPath = resolve(ROOT, 'server', '.env');

if (!existsSync(envPath)) {
  console.error('Missing server/.env — run wire-supabase setup first.');
  process.exit(1);
}

const raw = readFileSync(envPath, 'utf8');
const parsed = {};
for (const line of raw.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i < 0) continue;
  parsed[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const targets = ['production', 'preview'];
const vars = {
  NODE_ENV: 'production',
  LOG_LEVEL: 'info',
  DATABASE_URL: parsed.DATABASE_URL,
  DIRECT_URL: parsed.DIRECT_URL,
  SESSION_SECRET: parsed.SESSION_SECRET,
  SESSION_COOKIE_NAME: parsed.SESSION_COOKIE_NAME || 'eshu.sid',
  SESSION_MAX_AGE_MS: parsed.SESSION_MAX_AGE_MS || '2592000000',
  SESSION_COOKIE_SAME_SITE: parsed.SESSION_COOKIE_SAME_SITE || 'lax',
  SUPABASE_URL: parsed.SUPABASE_URL,
  SUPABASE_ANON_KEY: parsed.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: parsed.SUPABASE_SERVICE_ROLE_KEY,
  CORS_ORIGIN: parsed.CORS_ORIGIN || 'https://eshu-0-1-9.vercel.app',
  STORAGE_DRIVER: parsed.STORAGE_DRIVER || 'supabase',
  STORAGE_SUPABASE_BUCKET: parsed.STORAGE_SUPABASE_BUCKET || 'eshu-assets',
  STORAGE_MAX_BYTES: parsed.STORAGE_MAX_BYTES || '26214400',
};

const missing = Object.entries(vars).filter(([, v]) => !v || String(v).includes('replace'));
if (missing.length) {
  console.error('Missing or placeholder values:', missing.map(([k]) => k).join(', '));
  process.exit(1);
}

const projectArg = process.argv.find((a) => a.startsWith('--project='));
const projectName = projectArg ? projectArg.split('=')[1] : 'eshu-0-1-9';
const token = process.env.VERCEL_TOKEN;
const team = process.env.VERCEL_TEAM || process.env.VERCEL_ORG_ID || 'team_phmxFS3tS7bSRiG8ta7pqkGN';

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: 'api.vercel.com',
        path,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => {
          let parsed = buf;
          try { parsed = JSON.parse(buf); } catch {}
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function pushViaApi() {
  const teamQ = team ? `teamId=${encodeURIComponent(team)}&` : '';
  const list = await apiRequest('GET', `/v9/projects?${teamQ}limit=50`);
  if (list.status !== 200) {
    console.error('List projects failed:', list.status, list.body);
    process.exit(1);
  }
  const project = list.body.projects?.find((p) => p.name === projectName);
  if (!project) {
    console.error(`Project "${projectName}" not found. Names:`, list.body.projects?.map((p) => p.name).join(', '));
    process.exit(1);
  }
  console.log(`Project: ${project.name} (${project.id})`);

  const payload = Object.entries(vars).map(([key, value]) => ({
    key,
    value,
    type: 'encrypted',
    target: targets,
  }));

  const teamPath = team ? `?teamId=${encodeURIComponent(team)}&upsert=true` : '?upsert=true';
  const result = await apiRequest('POST', `/v10/projects/${project.id}/env${teamPath}`, payload);
  if (result.status !== 200 && result.status !== 201) {
    console.error('Push failed:', result.status, result.body);
    process.exit(1);
  }
  console.log(`\nPushed ${payload.length} variables to production + preview.`);
}

const runCli = (args, input) => {
  const r = spawnSync('npx', ['vercel', ...args], {
    cwd: ROOT,
    input,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: true,
    env: process.env,
  });
  return r.status ?? 1;
};

async function pushViaCli() {
  console.log('Pushing env vars via Vercel CLI (production + preview)…\n');
  for (const [name, value] of Object.entries(vars)) {
    for (const target of targets) {
      const code = runCli(['env', 'add', name, target, '--force'], value);
      if (code !== 0) {
        console.error(`Failed: ${name} (${target})`);
        process.exit(code);
      }
      console.log(`✓ ${name} → ${target}`);
    }
  }
  console.log('\nDone.');
}

if (token) {
  await pushViaApi();
} else {
  console.log('VERCEL_TOKEN not set — using CLI (requires npx vercel login + vercel link).\n');
  await pushViaCli();
}

console.log('Redeploy: npx vercel deploy --prod');
