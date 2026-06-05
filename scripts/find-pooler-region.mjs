#!/usr/bin/env node
/** Discover pooler host for a Supabase project ref. Reads password from argv only. */
import pg from '../server/node_modules/pg/lib/index.js';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../server/.env') });

const ref = process.argv[2] || 'vmnaybsaigsepckfxqsy';
let password = process.argv[3];
if (!password && process.env.DIRECT_URL) {
  try {
    password = decodeURIComponent(new URL(process.env.DIRECT_URL).password);
  } catch {}
}
if (!password && process.env.DATABASE_URL) {
  try {
    password = decodeURIComponent(new URL(process.env.DATABASE_URL).password);
  } catch {}
}
if (!password) {
  console.error('Usage: node scripts/find-pooler-region.mjs [project-ref] [db-password]');
  console.error('Or set DIRECT_URL in server/.env');
  process.exit(1);
}

const regions = [
  'eu-central-1', 'eu-central-2', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-north-1',
  'us-east-1', 'us-east-2', 'us-west-1', 'ap-southeast-1', 'ap-northeast-1', 'sa-east-1',
];
const prefixes = ['aws-0', 'aws-1'];

for (const prefix of prefixes) {
  for (const region of regions) {
    for (const port of [5432, 6543]) {
      const host = `${prefix}-${region}.pooler.supabase.com`;
      const client = new pg.Client({
        host,
        port,
        database: 'postgres',
        user: `postgres.${ref}`,
        password,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 6000,
      });
      try {
        await client.connect();
        const q = port === 6543
          ? `postgresql://postgres.${ref}:****@${host}:${port}/postgres?pgbouncer=true&sslmode=require`
          : `postgresql://postgres.${ref}:****@${host}:${port}/postgres?sslmode=require`;
        console.log('FOUND', { prefix, region, port, DATABASE_URL: q });
        await client.end();
        process.exit(0);
      } catch {
        await client.end().catch(() => {});
      }
    }
  }
}
console.error('No pooler host matched. Copy URI from Supabase Connect → Transaction pooler.');
process.exit(1);
