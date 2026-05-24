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

async function main() {
  // Check job state
  const { data: jobs } = await sb.from('auto_run_jobs').select('*').eq('id', JOB_ID);
  const j = jobs?.[0];
  console.log("=== JOB ===");
  console.log("status:", j.status, "| doc:", j.current_document, "| steps:", j.step_count);
  console.log("processing:", j.is_processing, "| started:", j.processing_started_at);
  console.log("updated:", j.updated_at);
  console.log("last_error:", j.last_error);
  console.log("last_heartbeat:", j.last_heartbeat_at);
  console.log("lock_expires:", j.lock_expires_at);
  
  // Get latest 5 steps
  const { data: steps } = await sb.from('auto_run_steps')
    .select('step_index, document, action, summary, created_at')
    .eq('job_id', JOB_ID)
    .order('step_index', { ascending: false })
    .limit(5);
  console.log("\n=== LATEST 5 STEPS ===");
  for (const s of (steps || []).reverse()) {
    console.log(`[${s.step_index}] ${s.document} → ${s.action} | ${(s.summary||'').slice(0,80)}`);
  }
  
  // Check vertical_episode_beats doc versions
  const { data: docs } = await sb.from('project_documents')
    .select('id, doc_type')
    .eq('project_id', '27c9ab7a-6d3d-40bd-adab-a4aa5fd0c9fd')
    .eq('doc_type', 'vertical_episode_beats');
  if (docs && docs.length > 0) {
    const { data: versions } = await sb.from('project_document_versions')
      .select('id, version_number, is_current, approval_status')
      .eq('document_id', docs[0].id)
      .order('version_number', { ascending: false })
      .limit(3);
    console.log(`\n=== VERTICAL EPISODE BEATS: ${versions?.length || 0} versions ===`);
    for (const v of (versions || [])) console.log(`  v${v.version_number} | ${v.approval_status}`);
  }
}
main().catch(e => console.error('FATAL:', e));