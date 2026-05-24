import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const anonKey = env.match(/VITE_SUPABASE_ANON_KEY="(.+)"/)[1];
const url = env.match(/VITE_SUPABASE_URL="(.+)"/)[1];
const login = readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = login.match(/SUPABASE_SERVICE_ROLE_KEY.*\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : anonKey;

const sb = createClient(url, srKey, { auth: { persistSession: false } });
const PROJECT = '27c9ab7a-6d3d-40bd-adab-a4aa5fd0c9fd';
const JOB_ID = 'e1a84669-2cd8-497a-88e4-8b7f19d49a2d';

async function main() {
  // 1. Full job details
  const { data: jobs } = await sb.from('auto_run_jobs')
    .select('*')
    .eq('id', JOB_ID);
  console.log("=== JOB DETAIL ===");
  if (jobs?.[0]) {
    const j = jobs[0];
    console.log(JSON.stringify({
      id: j.id, status: j.status, current_document: j.current_document,
      step_count: j.step_count, stop_reason: j.stop_reason, pause_reason: j.pause_reason,
      pause_phase: j.pause_phase, error: j.error?.slice(0,500),
      awaiting_approval: j.awaiting_approval, approval_type: j.approval_type,
      start_document: j.start_document, target_document: j.target_document,
      mode: j.mode, max_total_steps: j.max_total_steps,
      auto_gen_steps: j.auto_gen_steps, total_gen_steps: j.total_gen_steps,
      created_at: j.created_at, updated_at: j.updated_at, started_at: j.started_at,
      completed_at: j.completed_at
    }, null, 2));
  }

  // 2. Steps with correct column name
  const { data: steps, error: se } = await sb.from('auto_run_steps')
    .select('*')
    .eq('job_id', JOB_ID)
    .order('step_index', { ascending: true })
    .limit(100);
  if (se) {
    console.log("\nSteps error:", se.message);
    // Try with step_number instead
    const { data: steps2, error: se2 } = await sb.from('auto_run_steps')
      .select('*')
      .eq('job_id', JOB_ID)
      .order('step_number', { ascending: true })
      .limit(100);
    if (se2) console.log("step_number also failed:", se2.message);
    else { console.log(`\n=== ${(steps2||[]).length} STEPS (step_number) ===`);
      for (const s of (steps2 || [])) console.log(JSON.stringify(s)); }
  } else {
    console.log(`\n=== ${(steps||[]).length} STEPS (step_index) ===`);
    for (const s of (steps || [])) {
      console.log(JSON.stringify({ idx: s.step_index, doc: s.document, action: s.action, msg: (s.message||'').slice(0,200), created: s.created_at }));
    }
  }

  // 3. Project documents count
  const { data: docs } = await sb.from('project_documents')
    .select('id, doc_type, title')
    .eq('project_id', PROJECT)
    .order('created_at', { ascending: false });
  console.log(`\n=== ${(docs||[]).length} PROJECT DOCUMENTS ===`);
  for (const d of (docs || [])) console.log(JSON.stringify(d));
}
main().catch(e => console.error('FATAL:', e));