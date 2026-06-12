import https from 'node:https';

const TOKEN = process.env.VERCEL_TOKEN;
const TEAM_SLUG = process.env.VERCEL_TEAM || 'eshu002';
const PROJECT_NAME = process.env.VERCEL_PROJECT || 'eshu-0-2-1';

if (!TOKEN) {
  console.error('Set VERCEL_TOKEN before running this script.');
  process.exit(1);
}

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = https.request({
      hostname: 'api.vercel.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// 1. Find project
const projects = await req('GET', `/v9/projects?teamId=${TEAM_SLUG}&limit=20`);
const project = projects.body.projects?.find(p => p.name === PROJECT_NAME);
if (!project) {
  console.log('Projects found:', projects.body.projects?.map(p => p.name + ' / ' + p.id));
  process.exit(1);
}
console.log('Project:', project.name, project.id);

const requiredEnv = [
  'DATABASE_URL',
  'DIRECT_URL',
  'SESSION_SECRET',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];
const missing = requiredEnv.filter((name) => !process.env[name]);
if (missing.length) {
  console.error('Set required env before running this script:', missing.join(', '));
  process.exit(1);
}

const envVars = [
  { key: 'DATABASE_URL',             value: process.env.DATABASE_URL },
  { key: 'DIRECT_URL',               value: process.env.DIRECT_URL },
  { key: 'SESSION_SECRET',           value: process.env.SESSION_SECRET },
  { key: 'SESSION_COOKIE_NAME',      value: 'eshu.sid' },
  { key: 'SESSION_MAX_AGE_MS',       value: '2592000000' },
  { key: 'SESSION_COOKIE_SAME_SITE', value: 'lax' },
  { key: 'SUPABASE_URL',             value: process.env.SUPABASE_URL },
  { key: 'SUPABASE_ANON_KEY',        value: process.env.SUPABASE_ANON_KEY },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', value: process.env.SUPABASE_SERVICE_ROLE_KEY },
  { key: 'CORS_ORIGIN',              value: process.env.CORS_ORIGIN || 'https://eshu-0-2-1.vercel.app' },
  { key: 'NODE_ENV',                 value: 'production' },
  { key: 'STORAGE_DRIVER',           value: 'supabase' },
  { key: 'STORAGE_SUPABASE_BUCKET',  value: process.env.STORAGE_SUPABASE_BUCKET || 'eshu-assets' },
  { key: 'STORAGE_MAX_BYTES',        value: '26214400' },
];

// 2. Push env vars (upsert all at once)
const payload = envVars.map(e => ({
  key: e.key,
  value: e.value,
  type: 'encrypted',
  target: ['production', 'preview', 'development'],
}));

const result = await req('POST', `/v10/projects/${project.id}/env?teamId=${TEAM_SLUG}&upsert=true`, payload);
if (result.status === 200 || result.status === 201) {
  console.log(`\nAll ${envVars.length} env vars pushed successfully.`);
} else {
  console.log('Status:', result.status);
  console.log(JSON.stringify(result.body, null, 2));
}
