import https from 'node:https';

const TOKEN = 'vcp_7Sh5gn04dTINTS9iBqTXgT3Lk5zCJ4meDs7QSQuve4GIVM2GS90IgtPX';
const TEAM_SLUG = 'eshu002';

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
const project = projects.body.projects?.find(p => p.name === 'eshu-0-1-6b');
if (!project) {
  console.log('Projects found:', projects.body.projects?.map(p => p.name + ' / ' + p.id));
  process.exit(1);
}
console.log('Project:', project.name, project.id);

const envVars = [
  { key: 'DATABASE_URL',             value: 'postgresql://postgres.shkoazonbwjplrsjtkne:Openthedoor1!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true' },
  { key: 'DIRECT_URL',               value: 'postgresql://postgres.shkoazonbwjplrsjtkne:Openthedoor1!@aws-1-eu-central-1.pooler.supabase.com:5432/postgres' },
  { key: 'SESSION_SECRET',           value: '7f0f1f75743ff8315c996acf3cba1df67ebd794381eaf2aa24d84d09cfd9c52d804ad2449f39f3b0871c15193306405a' },
  { key: 'SESSION_COOKIE_NAME',      value: 'eshu.sid' },
  { key: 'SESSION_MAX_AGE_MS',       value: '2592000000' },
  { key: 'SESSION_COOKIE_SAME_SITE', value: 'lax' },
  { key: 'SUPABASE_URL',             value: 'https://shkoazonbwjplrsjtkne.supabase.co' },
  { key: 'SUPABASE_ANON_KEY',        value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoa29hem9uYndqcGxyc2p0a25lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTk1MDYsImV4cCI6MjA5NTM5NTUwNn0.4zXRj6gTPkXCVMuZZ6J6gnSCWZ6DW57sfTjLsoTz014' },
  { key: 'CORS_ORIGIN',              value: 'https://eshu-0-1-6b.vercel.app' },
  { key: 'NODE_ENV',                 value: 'production' },
  { key: 'STORAGE_DRIVER',           value: 'local' },
  { key: 'STORAGE_LOCAL_DIR',        value: '/tmp/eshu-assets' },
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
