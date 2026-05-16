import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const anonKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const url = envContent.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();

const loginTs = fs.readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = loginTs.match(/SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : anonKey;

const sb = createClient(url, srKey, { auth: { persistSession: false } });

const PID = '1983a0ee-bf30-42d1-ae49-d8a272538993';
const DOC_ID = '795c377f-25a6-4a6f-83e2-b5210b3703ab';

async function main() {
  // 1. Get ALL notes for the project - try different filters
  console.log("=== NOTES: ALL rows ===");
  const { data: allNotes } = await sb
    .from('project_notes')
    .select('*')
    .limit(5);
  console.log("Sample notes:", JSON.stringify(allNotes?.map(n => ({id: n.id.slice(0,8), keys: Object.keys(n), ...n})), null, 2)?.substring(0, 2000));

  // Check if project_id column exists
  const { data: noteByProj } = await sb
    .from('project_notes')
    .select('id, note_key, title')
    .eq('project_id', PID)
    .limit(10);
  console.log("By project_id:", JSON.stringify(noteByProj));

  // Check by document_id
  const { data: noteByDoc } = await sb
    .from('project_notes')
    .select('id, note_key, title')
    .eq('document_id', DOC_ID)
    .limit(10);
  console.log("By document_id:", JSON.stringify(noteByDoc));

  // Without any filter
  const { data: notesAny } = await sb
    .from('project_notes')
    .select('id, note_key, title, created_at')
    .limit(10);
  console.log("Any notes:", JSON.stringify(notesAny?.map(n => ({id: n.id.slice(0,8), key: n.note_key, title: n.title}))));

  // 2. DEVELOPMENT RUNS - check all for this project
  console.log("\n\n=== DEVRUNS: all for project ===");
  const { data: devAll } = await sb
    .from('development_runs')
    .select('id, project_id, document_id, run_type, created_at')
    .eq('project_id', PID)
    .limit(20);
  console.log("All dev runs:", JSON.stringify(devAll));

  // Also check without project filter
  const { data: devAny } = await sb
    .from('development_runs')
    .select('id, project_id, run_type, created_at')
    .limit(5);
  console.log("Any dev runs:", JSON.stringify(devAny?.map(d => ({id: d.id.slice(0,8), proj: d.project_id.slice(0,8), type: d.run_type}))));

  // 3. Check auto_run_jobs
  console.log("\n\n=== AUTO RUN JOBS ===");
  const { data: arjAll } = await sb
    .from('auto_run_jobs')
    .select('id, project_id, status, created_at')
    .eq('project_id', PID)
    .limit(20);
  console.log("Jobs for project:", JSON.stringify(arjAll?.map(j => ({id: j.id.slice(0,8), status: j.status}))));

  // 4. Versions but with full measured_metrics_json
  console.log("\n\n=== FULL MEASURED METRICS ===");
  const { data: versions } = await sb
    .from('project_document_versions')
    .select('id, version_number, measured_metrics_json, created_at, criteria_json, change_summary')
    .eq('document_id', DOC_ID)
    .order('version_number', { ascending: true });
  
  versions?.forEach(v => {
    console.log(`\nV${v.version_number} (${v.created_at?.substring(0,19)}):`);
    console.log(`  measured: ${JSON.stringify(v.measured_metrics_json)}`);
    console.log(`  criteria: ${JSON.stringify(v.criteria_json)?.substring(0, 300)}`);
    console.log(`  change: ${v.change_summary?.substring(0, 120)}`);
  });

  // 5. Check criteria_json for CI scores
  console.log("\n\n=== CRITERIA_JSON ANALYSIS ===");
  versions?.forEach(v => {
    const cj = v.criteria_json || {};
    console.log(`V${v.version_number}: criteria keys: ${Object.keys(cj).join(', ')}`);
    if (cj.scores) console.log(`  scores: ${JSON.stringify(cj.scores)}`);
    if (cj.ci_score !== undefined) console.log(`  ci_score: ${cj.ci_score}`);
  });
}

main().catch(e => console.error(e));