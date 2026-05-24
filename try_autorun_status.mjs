import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const anonKey = env.match(/VITE_SUPABASE_ANON_KEY="(.+)"/)[1];
const url = env.match(/VITE_SUPABASE_URL="(.+)"/)[1];
const login = readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = login.match(/SUPABASE_SERVICE_ROLE_KEY.*\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : anonKey;
const sb = createClient(url, srKey, { auth: { persistSession: false } });

async function main() {
  // Call auto-run with action=status first
  console.log("=== CALLING AUTO-RUN STATUS ===\n");
  
  const statusBody = JSON.stringify({
    action: "status",
    projectId: "27c9ab7a-6d3d-40bd-adab-a4aa5fd0c9fd"
  });
  console.log("Request body:", statusBody);
  
  try {
    const response = await fetch(
      "https://hdfderbphdobomkdjypc.supabase.co/functions/v1/auto-run",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${srKey}`,
          "Content-Type": "application/json"
        },
        body: statusBody
      }
    );
    const data = await response.json();
    console.log("Status response:", response.status, JSON.stringify(data, null, 2));
  } catch(e) {
    console.error("Fetch error:", e);
  }
}
main().catch(e => console.error('FATAL:', e));