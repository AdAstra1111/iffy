import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const anonKey = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const url = env.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
const login = readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = login.match(/SUPABASE_SERVICE_ROLE_KEY.*\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : anonKey;
const sb = createClient(url, srKey, { auth: { persistSession: false } });

const PROJECT = '59f413c1-d60d-42b2-8035-e386018f35db';

async function main() {
  // Get auto-run jobs
  const { data: jobs, error: je } = await sb.from('auto_run_jobs')
    .select('*')
    .eq('project_id', PROJECT)
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('=== AUTO-RUN JOBS ===');
  for (const j of (jobs || [])) {
    console.log(JSON.stringify({
      id: j.id, status: j.status, current_document: j.current_document,
      step_count: j.step_count, stop_reason: j.stop_reason, pause_reason: j.pause_reason,
      error: j.error?.slice(0,200), awaiting_approval: j.awaiting_approval,
      approval_type: j.approval_type, last_ui_message: j.last_ui_message?.slice(0,200),
      created_at: j.created_at, updated_at: j.updated_at
    }));
  }

  // Get auto-run steps for the latest job
  if (jobs && jobs.length > 0) {
    const jobId = jobs[0].id;
    const { data: steps, error: se } = await sb.from('auto_run_steps')
      .select('*')
      .eq('job_id', jobId)
      .order('step_number', { ascending: true })
      .limit(50);
    console.log('\n=== AUTO-RUN STEPS ===');
    for (const s of (steps || [])) {
      console.log(JSON.stringify({ step: s.step_number, action: s.action, doc: s.doc_type, msg: s.message?.slice(0,200) }));
    }
    
    // Check last_activity / last_polled
    console.log('\n=== JOB DETAIL ===');
    console.log('stop_reason:', jobs[0].stop_reason);
    console.log('pause_reason:', jobs[0].pause_reason);
    console.log('error:', jobs[0].error?.slice(0,300));
  }
}
main().catch(e => console.error('ERROR:', e));
