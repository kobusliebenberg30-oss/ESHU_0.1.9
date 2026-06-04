import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');
const envPath = path.join(rootDir, '.env');

if (!existsSync(envPath)) {
  console.error(`Missing .env file at ${envPath}`);
  console.error('Create a root .env file with SUPABASE_URL and SUPABASE_ANON_KEY before running this script.');
  process.exit(1);
}

const result = config({ path: envPath });

if (result.error) {
  throw result.error;
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing SUPABASE_URL and/or SUPABASE_ANON_KEY in the root .env file.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
});

export function createSupabaseClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
  });
}

export { supabase };
export default supabase;

if (process.argv[1] === __filename) {
  console.log('Supabase client initialized successfully.');
}
