#!/usr/bin/env node
import https from 'node:https';

const token = process.env.VERCEL_TOKEN;
if (!token) {
  console.error('Set VERCEL_TOKEN');
  process.exit(1);
}

function req(path) {
  return new Promise((resolve, reject) => {
    https.get(
      { hostname: 'api.vercel.com', path, headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
      },
    ).on('error', reject);
  });
}

const teams = await req('/v2/teams?limit=20');
console.log('teams', teams.status, teams.body?.teams?.map((t) => ({ slug: t.slug, id: t.id, name: t.name })));

const personal = await req('/v9/projects?limit=50');
console.log('personal projects', personal.status, personal.body?.projects?.map((p) => p.name));

if (teams.body?.teams?.length) {
  for (const t of teams.body.teams) {
    const r = await req(`/v9/projects?teamId=${t.id}&limit=50`);
    console.log(`team ${t.slug}:`, r.body?.projects?.map((p) => p.name));
  }
}
