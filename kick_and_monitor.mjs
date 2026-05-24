import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const anonKey = env.match(/VITE_SUPABASE_ANON_KEY="(.+)"/)[1];
const url = env.match(/VITE_SUPABASE_URL="(.+)"/)[1];
const login = readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = login.match(/SUPABASE_SERVICE_ROLE_KEY.*\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : anonKey;
const sb = createClient(url, srKey, { auth: { persistSession: false } });

const JOB_ID = 'e1a84669-2cd8-497a-88e4-8b7f19d49a2d';
const PROJECT_ID = '27c9ab7a-6d3d-40bd-adab-a4aa5fd0c9fd';
const USER_ID = 'a6c31c79-7837-47d8-b2f0-91d2e0febd76';

async function main() {
  // Call run-next
  console.log("=== CALLING RUN-NEXT ===");
  const response = await fetch(
    "https://hdfderbphdobomkdjypc.supabase.co/functions/v1/auto-run",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${srKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "run-next",
        jobId: JOB_ID,
        userId: USER_ID
      })
    }
  );
  const data = await response.json();
  console.log("Response status:", response.status);
  console.log("Full response:");
  console.log(JSON.stringify(data, null, 2));
  
  // Wait a few seconds then check for new steps
  console.log("\n=== WAITING 10s THEN CHECKING ===");
  await new Promise(r => setTimeout(r, 10000));
  
  // Check new steps
  const { data: steps } = await sb.from('auto_run_steps')
    .select('step_index, document, action, message, created_at')
    .eq('job_id', JOB_ID)
    .order('step_index', { ascending: false })
    .limit(10);
  
  console.log(`\nLatest steps (${steps?.length || 0}):`);
  for (const s of (steps || []).reverse()) {
    console.log(`[${s.step_index}] ${s.document} → ${s.action} @ ${s.created_at}`);
  }
  
  // Check job status
  const { data: jobs } = await sb.from('auto_run_jobs').select('status, current_document, step_count, is_processing, processing_started_at, updated_at').eq('id', JOB_ID);
  const j = jobs?.[0];
  console.log(`\nJob: status=${j?.status}, doc=${j?.current_document}, steps=${j?.step_count}, processing=${j?.is_processing}, updated=${j?.updated_at}`);
}
main().catch(e => console.error('FATAL:', e));