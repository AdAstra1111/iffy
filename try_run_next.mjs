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
  const JOB_ID = 'e1a84669-2cd8-497a-88e4-8b7f19d49a2d';
  
  // Get job with user_id
  const { data: jobs } = await sb.from('auto_run_jobs').select('id, user_id, status, current_document, is_processing, processing_started_at').eq('id', JOB_ID);
  console.log("Job:", JSON.stringify(jobs?.[0], null, 2));
  
  // Now try status with userId in body
  if (jobs?.[0]) {
    const userId = jobs[0].user_id;
    console.log("\nUser ID:", userId);
    
    // Try status with userId
    const response = await fetch(
      "https://hdfderbphdobomkdjypc.supabase.co/functions/v1/auto-run",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${srKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "status",
          projectId: "27c9ab7a-6d3d-40bd-adab-a4aa5fd0c9fd",
          userId: userId  // forwarded userId
        })
      }
    );
    const data = await response.json();
    console.log("\nStatus with userId:");
    console.log("Status:", response.status);
    console.log("Job:", data.job ? `${data.job.status} / ${data.job.current_document} / ${data.job.step_count} steps` : "null");
    
    // Now try run-next
    console.log("\n\n=== TRYING RUN-NEXT ===");
    const runNextResp = await fetch(
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
          userId: userId
        })
      }
    );
    const rnData = await runNextResp.json();
    console.log("Status:", runNextResp.status);
    console.log("Response:", JSON.stringify(rnData, null, 2).substring(0, 500));
  }
}
main().catch(e => console.error('FATAL:', e));