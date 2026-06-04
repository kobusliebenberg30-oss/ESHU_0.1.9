import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const tableName = process.argv[2];

if (!tableName) {
  console.error('Usage: node scripts/test-supabase-query.mjs <table-name>');
  console.error('Example: node scripts/test-supabase-query.mjs profiles');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing SUPABASE_URL and/or SUPABASE_ANON_KEY in the root .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
});

const { data, error } = await supabase
  .from(tableName)
  .select('*')
  .limit(1);

if (error) {
  console.error('Supabase query error:', error.message);
  console.error(JSON.stringify(error, null, 2));
  process.exitCode = 1;
} else {
  console.log('Query result:');
  console.log(JSON.stringify(data, null, 2));
}
