// ============================================================
// Focussive — Database Connection Test Utility
// ============================================================

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables from root and backend packages
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('--- Focussive DB Test Utility ---');
console.log(`SUPABASE_URL: ${supabaseUrl || 'Not set'}`);
console.log(`SUPABASE_SECRET_KEY / SERVICE_ROLE_KEY: ${supabaseServiceKey ? '****** (Set)' : 'Not set'}`);

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('\nError: Missing SUPABASE_URL or SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY in your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function runTest() {
  try {
    console.log('\nConnecting to Supabase database...');
    
    // Attempt to query the users table
    const { data, error } = await supabase
      .from('users')
      .select('count', { count: 'exact', head: true });

    if (error) {
      throw error;
    }

    console.log('✅ Connection Successful!');
    console.log(`Successfully connected to database. 'users' table count: ${data?.[0]?.count ?? 0}`);
  } catch (err: any) {
    console.error('❌ Connection Failed!');
    console.error(err.message || err);
    console.error('\nTroubleshooting tips:');
    console.error('1. Double check your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.');
    console.error('2. Make sure you ran packages/backend/src/db/schema.sql in the Supabase SQL Editor.');
    process.exit(1);
  }
}

runTest();
