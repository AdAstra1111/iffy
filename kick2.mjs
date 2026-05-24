import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const anonKey = env.match(/VITE_SUPABASE_ANON_KEY="(.+)"/)[1];
const url = env.match(/VITE_SUPABASE_URL="(.+)"/)[1];
const login = readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = login.match(/SUPABASE_SERVICE_ROLE_KEY.*\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : anonKey;

const JOB_ID = 'e1a84669-2cd8-497a-88e4-8b7f19d49a2d';
const USER_ID = 'a6c31c79-7837-47d8-b2f0-91d2e0febd76';

async function main() {
  console.log("=== CALLING RUN-NEXT ===");
  try {
    const response = await fetch(
      "https://hdfderbphdobomkdjypc.supabase.co/functions/v1/auto-run",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${srKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "run-next", jobId: JOB_ID, userId: USER_ID })
      }
    );
    const data = await response.json();
    console.log("Status:", response.status);
    console.log("Job status:", data.job?.status);
    console.log("Current doc:", data.job?.current_document);
    console.log("Step count:", data.job?.step_count);
    console.log("Next hint:", data.next_action_hint);
    console.log("Is processing:", data.job?.is_processing);
    
    // Show latest steps summary
    const latest = (data.latest_steps || []).slice(-3);
    for (const s of latest) {
      console.log(`[${s.step_index}] ${s.document} → ${s.action}: ${s.summary?.slice(0,100)}`);
    }
  } catch(e) {
    console.error("Fetch error:", e);
  }
}
main().catch(e => console.error('FATAL:', e));