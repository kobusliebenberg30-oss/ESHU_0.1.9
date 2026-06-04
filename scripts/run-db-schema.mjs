import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import 'dotenv/config';

const { Client } = pg;

// Get connection URL - use DIRECT_URL for direct connection to avoid pgBouncer issues with migrations
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Missing DATABASE_URL or DIRECT_URL in environment');
  process.exit(1);
}

async function runSchema() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('✓ Connected to Supabase PostgreSQL');
    
    // Read the schema file
    const schemaPath = resolve(import.meta.dirname, '../prisma/init_schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Execute the schema
    console.log('Creating schema and tables...');
    await client.query(schema);
    console.log('✓ Schema created successfully!\n');
    
    // List created tables
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('✓ Created tables:');
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runSchema();
