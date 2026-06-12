import pg from 'pg';
const { Client } = pg;
const password = process.env.SUPABASE_DB_PASSWORD;

if (!password) {
  console.error('Set SUPABASE_DB_PASSWORD before running this script.');
  process.exit(1);
}

const candidates = [
  // Raw IPv6 resolved by PowerShell for db.shkoazonbwjplrsjtkne.supabase.co
  { host: '2a05:d014:14a4:4002:5de3:b37e:847a:d531', port: 5432, user: 'postgres' },
  // Pooler IPs resolved by PowerShell for aws-0-eu-central-1.pooler.supabase.com
  { host: '18.198.145.223', port: 6543, user: 'postgres.shkoazonbwjplrsjtkne' },
  { host: '18.198.30.239',  port: 6543, user: 'postgres.shkoazonbwjplrsjtkne' },
];

for (const c of candidates) {
  const client = new Client({
    host: c.host, port: c.port, database: 'postgres',
    user: c.user,
    password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 6000,
  });
  try {
    await client.connect();
    console.log('SUCCESS host:', c.host, 'port:', c.port, 'user:', c.user);
    await client.end();
    process.exit(0);
  } catch (e) {
    console.log('skip', c.host, c.port, c.user, '-', e.message.slice(0, 80));
  }
}
console.log('None worked. Get exact URI from Supabase dashboard → Settings → Database → URI tab.');
