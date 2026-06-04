import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Use the production environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Read and execute the schema
const schemaPath = resolve(import.meta.dirname, '../prisma/init_schema.sql');
const sqlScript = readFileSync(schemaPath, 'utf-8');

// Note: Direct SQL execution via the REST API is not available.
// You'll need to use the Supabase SQL Editor or direct psql connection.
// Instructions printed below.
console.log('To execute the schema, use one of these methods:\n');
console.log('1. Supabase Dashboard (recommended):');
console.log('   - Go to: https://app.supabase.com');
console.log('   - Select your project: shkoazonbwjplrsjtkne');
console.log('   - SQL Editor → New Query → Paste the contents of server/prisma/init_schema.sql');
console.log('   - Click "Run"');
console.log('\n2. Using psql (if you have PostgreSQL installed):');
console.log('   - From server/.env.production, get DIRECT_URL');
console.log('   - Run: psql "DIRECT_URL_HERE" -f server/prisma/init_schema.sql');
console.log('\n3. Supabase CLI:');
console.log('   - Run: supabase db push');
console.log('\nSchema file is ready at: server/prisma/init_schema.sql');
