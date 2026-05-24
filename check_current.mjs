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
const PROJECT = '27c9ab7a-6d3d-40bd-adab-a4aa5fd0c9fd';

async function main() {
  // 1. Check job status NOW
  const { data: jobs } = await sb.from('auto_run_jobs').select('*').eq('id', JOB_ID);
  const j = jobs?.[0];
  if (!j) { console.log("Job not found"); return; }
  
  console.log("=== CURRENT STATUS ===");
  console.log("status:", j.status);
  console.log("current_document:", j.current_document);
  console.log("step_count:", j.step_count);
  console.log("pause_reason:", j.pause_reason);
  console.log("stop_reason:", j.stop_reason);
  console.log("error:", j.error?.slice(0,500));
  console.log("updated_at:", j.updated_at);
  
  // 2. Get latest steps (last 10)
  const { data: steps } = await sb.from('auto_run_steps')
    .select('step_index, document, action, created_at')
    .eq('job_id', JOB_ID)
    .order('step_index', { ascending: false })
    .limit(10);
  console.log("\n=== LATEST 10 STEPS ===");
  for (const s of (steps || []).reverse()) {
    console.log(`[${s.step_index}] ${s.document} → ${s.action} @ ${s.created_at}`);
  }

  // 3. Check document versions (what content has been generated)
  const { data: docs } = await sb.from('project_documents')
    .select('id, doc_type')
    .eq('project_id', PROJECT);
  
  console.log("\n=== DOCUMENT VERSIONS WITH CONTENT ===");
  for (const d of (docs || [])) {
    const { data: versions } = await sb.from('project_document_versions')
      .select('id, version_number, is_current, approval_status, ci_score, gp_score')
      .eq('document_id', d.id)
      .order('version_number', { ascending: false })
      .limit(2);
    if (versions && versions.length > 0) {
      console.log(`${d.doc_type}: ${versions.length} versions, latest v${versions[0].version_number} (${versions[0].approval_status}, CI:${versions[0].ci_score})`);
    }
  }
}
main().catch(e => console.error('FATAL:', e));