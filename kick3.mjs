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
  console.log("=== CALL RUN-NEXT ===");
  const resp = await fetch(
    "https://hdfderbphdobomkdjypc.supabase.co/functions/v1/auto-run",
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${srKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run-next", jobId: JOB_ID, userId: USER_ID })
    }
  );
  const data = await resp.json();
  console.log("HTTP:", resp.status);
  console.log("Status:", data.job?.status, "Doc:", data.job?.current_document, "Steps:", data.job?.step_count);
  console.log("Processing:", data.job?.is_processing, "Hint:", data.next_action_hint);
  console.log("Error:", data.job?.error);
  console.log("Pause:", data.job?.pause_reason);
  
  const latest = (data.latest_steps || []).slice(-4);
  for (const s of latest) console.log(`[${s.step_index}] ${s.document} → ${s.action}: ${(s.summary||'').slice(0,80)}`);
}
main().catch(e => console.error('FATAL:', e));