import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const anonKey = env.match(/VITE_SUPABASE_ANON_KEY="(.+)"/)[1];
const url = env.match(/VITE_SUPABASE_URL="(.+)"/)[1];

const login = readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = login.match(/SUPABASE_SERVICE_ROLE_KEY.*\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : anonKey;

console.log("URL:", url);
console.log("SR key length:", srKey.length);
console.log("SR key prefix:", srKey.substring(0, 10) + "...");
console.log("Anon key length:", anonKey.length);

const sb = createClient(url, srKey, { auth: { persistSession: false } });

const PROJECT = '27c9ab7a-6d3d-40bd-adab-a4aa5fd0c9fd';

async function main() {
  // Check auto-run jobs for our project
  const { data: jobs, error: je } = await sb.from('auto_run_jobs')
    .select('*')
    .eq('project_id', PROJECT)
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (je) {
    console.log("\nERROR querying auto_run_jobs:", je.message, je.details, je.hint);
    // Maybe need to use the direct DB connection
    console.log("\nTrying auth.getUser with SR key...");
    const { data: au, error: ae } = await sb.auth.getUser();
    console.log("Auth user:", au?.user?.id || "none", "Error:", ae?.message || "none");
    return;
  }
  
  console.log("\n=== AUTO-RUN JOBS ===");
  if (!jobs || jobs.length === 0) {
    console.log("No existing jobs");
    return;
  }
  for (const j of jobs) {
    console.log(JSON.stringify({
      id: j.id, status: j.status, current_document: j.current_document,
      step_count: j.step_count, pause_reason: j.pause_reason, error: j.error?.slice(0,200),
      created_at: j.created_at, updated_at: j.updated_at
    }, null, 2));
  }
  
  // Check steps for latest job
  if (jobs.length > 0) {
    const jobId = jobs[0].id;
    const { data: steps, error: se } = await sb.from('auto_run_steps')
      .select('*')
      .eq('job_id', jobId)
      .order('step_number', { ascending: true })
      .limit(50);
    console.log("\n=== AUTO-RUN STEPS ===");
    for (const s of (steps || [])) {
      console.log(JSON.stringify({ step: s.step_number, action: s.action, doc: s.doc_type, msg: s.message?.slice(0,200) }));
    }
  }
}
main().catch(e => console.error('FATAL:', e));