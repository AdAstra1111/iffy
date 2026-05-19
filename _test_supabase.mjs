import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envContent = readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const anonKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const url = envContent.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
const loginTs = readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = loginTs.match(/SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : anonKey;

const sb = createClient(url, srKey, { auth: { persistSession: false } });

async function main() {
  console.log('=== Testing Supabase Connection ===');
  
  // Test basic query
  const { data, error } = await sb.from('project_document_versions').select('id').limit(1);
  console.log('Query result:', error ? 'ERROR: ' + error.message : 'OK, rows: ' + (data?.length || 0));

  // Check for exec_sql RPC
  console.log('\n=== Checking exec_sql ===');
  const r1 = await sb.rpc('exec_sql', { query: 'SELECT 1' });
  console.log('exec_sql:', r1.error?.message || 'EXISTS!');

  // Also try via direct REST API without supabase-js
  // The Management API with service_role_key for database/query
  const projectRef = 'hdfderbphdobomkdjypc';
  
  console.log('\n=== Trying Management API database/query ===');
  const testQuery = "SELECT 1 as test;";
  const mgmtRes = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${srKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: testQuery }),
    }
  );
  
  const mgmtStatus = mgmtRes.status;
  const mgmtBody = await mgmtRes.text();
  console.log(`Status: ${mgmtStatus}`);
  console.log(`Response: ${mgmtBody.substring(0, 500)}`);
  
  if (mgmtStatus === 401) {
    // Management API requires a PAT, not service role key
    // Let's try with the PAT format sbp_*
    console.log('\n=== Management API rejected service role key ===');
  } else if (mgmtStatus === 200) {
    console.log('\n✓ Management API works with service role key!');
  }

  // Try direct database connection info
  console.log('\n=== Checking what we can access ===');
  
  // Try to query pg_database or pg_extension info via PostgREST
  // Can try common patterns
  const endpoints = [
    { name: 'pgbouncer', url: `${url}:6543` },
  ];
  
  for (const ep of endpoints) {
    console.log(`${ep.name}: ${ep.url}`);
  }
}

main().catch(console.error);