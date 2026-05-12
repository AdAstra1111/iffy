const fs = require('fs');
const https = require('https');

// Read the migration SQL
const migrationSql = fs.readFileSync(
  '/Users/laralane/code/iffy/supabase/migrations/20260512000000_merge_duplicate_yeti_characters.sql',
  'utf8'
);

const url = 'https://hdfderbphdobomkdjypc.supabase.co';
const projectRef = 'hdfderbphdobomkdjypc';

// Read service role key
const loginTs = fs.readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = loginTs.match(/SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : '';

async function tryMgmtApi() {
  // Try Management API with service_role key
  const url2 = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  
  // Simple test query first
  const testQuery = "SELECT 1 as test;";
  
  try {
    const response = await fetch(url2, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${srKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: testQuery }),
    });
    
    console.log('MGMT_API_STATUS:', response.status);
    const text = await response.text();
    console.log('MGMT_API_RESPONSE:', text.substring(0, 500));
  } catch(e) {
    console.log('MGMT_API_ERROR:', e.message);
  }
}

tryMgmtApi().catch(e => console.error(e));
