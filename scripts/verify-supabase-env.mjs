import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const required = [
  'DATABASE_URL',
  'DIRECT_URL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SESSION_SECRET',
  'CORS_ORIGIN',
];

const root = process.cwd();
const envPath = path.join(root, '.env');
const hasEnvFile = fs.existsSync(envPath);

console.log('ESHU env verification');
console.log(`- .env file present: ${hasEnvFile ? 'yes' : 'no'}`);

for (const key of required) {
  const value = process.env[key];
  const ok = typeof value === 'string' && value.trim().length > 0 && !value.includes('[replace') && !value.includes('<your');
  console.log(`- ${key}: ${ok ? 'OK' : 'MISSING/PLACEHOLDER'}`);
}

if (!hasEnvFile) {
  console.log('\nTip: copy .env.example to .env and fill the real Supabase / Vercel values before deployment.');
}
