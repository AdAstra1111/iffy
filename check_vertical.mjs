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
  // 1. Check job lock state
  const { data: jobs } = await sb.from('auto_run_jobs').select('status, current_document, step_count, is_processing, processing_started_at, updated_at, last_error').eq('id', JOB_ID);
  const j = jobs?.[0];
  console.log("=== JOB STATE ===");
  console.log(JSON.stringify({
    status: j.status, doc: j.current_document, steps: j.step_count,
    processing: j.is_processing, processing_started: j.processing_started_at,
    updated: j.updated_at, last_error: j.last_error,
    now: new Date().toISOString()
  }, null, 2));
  
  if (j.is_processing && j.processing_started_at) {
    const age = Date.now() - new Date(j.processing_started_at).getTime();
    console.log(`\nLock age: ${Math.round(age/1000)}s`);
  }
  
  // Check if vertical_episode_beats doc exists and has versions
  const { data: docs } = await sb.from('project_documents')
    .select('id, doc_type')
    .eq('project_id', PROJECT_ID)
    .eq('doc_type', 'vertical_episode_beats');
  console.log("\n=== VERTICAL EPISODE BEATS DOC ===");
  if (docs && docs.length > 0) {
    const d = docs[0];
    console.log("Exists, ID:", d.id);
    const { data: versions } = await sb.from('project_document_versions')
      .select('id, version_number, is_current, approval_status, ci_score, gp_score')
      .eq('document_id', d.id)
      .order('version_number', { ascending: false })
      .limit(3);
    console.log(`Versions: ${versions?.length || 0}`);
    for (const v of (versions || [])) console.log(`  v${v.version_number} ${v.approval_status} CI:${v.ci_score}`);
  } else {
    console.log("Document slot not created yet");
  }

  // 3. Check for episode_grid document content
  const { data: egDocs } = await sb.from('project_documents')
    .select('id, doc_type')
    .eq('project_id', PROJECT_ID)
    .eq('doc_type', 'episode_grid');
  if (egDocs && egDocs.length > 0) {
    const { data: versions } = await sb.from('project_document_versions')
      .select('id, version_number, is_current, approval_status, ci_score, gp_score, content_text')
      .eq('document_id', egDocs[0].id)
      .order('version_number', { ascending: false })
      .limit(2);
    console.log("\n=== EPISODE GRID VERSIONS ===");
    for (const v of (versions || [])) {
      const contentLen = v.content_text ? v.content_text.length : 0;
      console.log(`v${v.version_number} | ${v.approval_status} | CI:${v.ci_score} GP:${v.gp_score} | ${contentLen} chars`);
    }
  }
}
main().catch(e => console.error('FATAL:', e));