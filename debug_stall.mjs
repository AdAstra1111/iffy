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
  // 1. Check job error field properly
  const { data: jobs } = await sb.from('auto_run_jobs').select('id, status, current_document, step_count, pause_reason, stop_reason, error, pause_phase').eq('id', JOB_ID);
  const j = jobs?.[0];
  console.log("=== FULL ERROR CHECK ===");
  console.log("error type:", typeof j?.error);
  console.log("error value:", JSON.stringify(j?.error));
  console.log("pause_reason:", JSON.stringify(j?.pause_reason));
  console.log("stop_reason:", JSON.stringify(j?.stop_reason));
  console.log("pause_phase:", JSON.stringify(j?.pause_phase));
  
  // 2. Check ALL episode_grid steps with their message field
  const { data: steps } = await sb.from('auto_run_steps')
    .select('step_index, document, action, message, created_at')
    .eq('job_id', JOB_ID)
    .eq('document', 'episode_grid')
    .order('step_index', { ascending: true });
  
  console.log("\n=== ALL EPISODE_GRID STEPS ===");
  for (const s of (steps || [])) {
    console.log(`[${s.step_index}] ${s.action} | msg: ${(s.message||'').slice(0,300)} | ${s.created_at}`);
  }
  
  // 3. Check if episode_grid document has versions
  const { data: docs } = await sb.from('project_documents')
    .select('id, doc_type, title')
    .eq('project_id', PROJECT)
    .eq('doc_type', 'episode_grid');
  
  console.log("\n=== EPISODE GRID DOCUMENT ===");
  if (docs && docs.length > 0) {
    const d = docs[0];
    console.log("ID:", d.id);
    const { data: versions } = await sb.from('project_document_versions')
      .select('id, version_number, is_current, approval_status, ci_score, gp_score, created_at')
      .eq('document_id', d.id)
      .order('version_number', { ascending: false })
      .limit(5);
    console.log(`Versions: ${versions?.length || 0}`);
    for (const v of (versions || [])) {
      console.log(`  v${v.version_number} | ${v.approval_status} | CI:${v.ci_score} GP:${v.gp_score} | current:${v.is_current} | ${v.created_at}`);
    }
  } else {
    console.log("No episode_grid document found!");
  }

  // 4. Check all documents for version counts
  console.log("\n=== ALL DOCUMENTS VERSION COUNTS ===");
  const { data: allDocs } = await sb.from('project_documents')
    .select('id, doc_type')
    .eq('project_id', PROJECT);
  for (const d of (allDocs || [])) {
    const { count } = await sb.from('project_document_versions')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', d.id);
    console.log(`${d.doc_type}: ${count} versions`);
  }
}
main().catch(e => console.error('FATAL:', e));