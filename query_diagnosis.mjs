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

async function main() {
  // 1. Get all character_bible versions with timing
  console.log("=== CHARACTER BIBLE VERSIONS ===");
  const { data: docs } = await sb
    .from('project_documents')
    .select('id, doc_type')
    .eq('project_id', PID)
    .eq('doc_type', 'character_bible');
  
  if (docs && docs.length > 0) {
    const docId = docs[0].id;
    console.log(`Document ID: ${docId}`);
    
    const { data: versions } = await sb
      .from('project_document_versions')
      .select('id, version_number, ci_score, gp_score, gap_score, approval_status, is_current, created_at, content_length')
      .eq('document_id', docId)
      .order('version_number', { ascending: true });
    
    if (versions) {
      console.log(`Total versions: ${versions.length}`);
      for (const v of versions) {
        console.log(`  V${v.version_number} | ci=${v.ci_score} | gp=${v.gp_score} | gap=${v.gap_score} | approval=${v.approval_status} | current=${v.is_current} | created=${(v.created_at||'').slice(0,19)} | len=${v.content_length}`);
      }
    }
  }
  
  // 2. ALL version counts for all documents
  console.log("\n\n=== ALL VERSION COUNTS ===");
  const { data: allDocs } = await sb
    .from('project_documents')
    .select('id, doc_type')
    .eq('project_id', PID);
  
  if (allDocs) {
    for (const d of allDocs) {
      const { count, error: vErr } = await sb
        .from('project_document_versions')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', d.id);
      
      if (!vErr) {
        console.log(`  ${(d.doc_type||'?').padEnd(22)} ${count} versions`);
      }
    }
  }
  
  // 3. Check ALL narrative_units for this project (not just async_job)
  console.log("\n\n=== ALL NARRATIVE UNITS ===");
  const { data: allUnits, error: nuErr } = await sb
    .from('narrative_units')
    .select('id, project_id, unit_type, created_at')
    .eq('project_id', PID)
    .order('created_at', { ascending: false })
    .limit(30);
  
  if (nuErr) console.log("NU ERR:", nuErr.message);
  else if (allUnits) {
    console.log(`Found ${allUnits.length} units`);
    for (const u of allUnits) {
      console.log(`  ${u.id.slice(0,12)} | type=${u.unit_type} | created=${(u.created_at||'').slice(0,19)}`);
    }
  }
  
  // 4. Check for any processing lock
  console.log("\n\n=== PROCESSING LOCKS OR PENDING FLAGS ===");
  const { data: proj } = await sb
    .from('projects')
    .select('id, autorun_enabled, autorun_trigger, development_behavior, pipeline_stage, lifecycle_stage, current_stage, ui_mode_override')
    .eq('id', PID)
    .single();
  
  if (proj) {
    console.log(JSON.stringify(proj, null, 2));
  }
  
  // 5. Check other YETI projects for auto-run jobs
  console.log("\n\n=== OTHER YETI PROJECTS AUTO_RUN ===");
  const yetiProjects = ['d783e45d-6380-4896-845b-d799f6547777', '42bcdae0-a63f-474c-8b4d-af53b6d102fe', '6e4d1de9-390d-48cb-90f8-34bc6dcc7881', '5f42747b-90c7-4185-b70d-3dd9d790dbb7'];
  
  for (const pid of yetiProjects) {
    const { data: jobs } = await sb
      .from('auto_run_jobs')
      .select('id, status, mode, step_count, created_at, updated_at, error')
      .eq('project_id', pid)
      .order('created_at', { ascending: false })
      .limit(3);
    
    if (jobs && jobs.length > 0) {
      console.log(`\n  Project ${pid.slice(0,8)}: ${jobs.length} auto_run_jobs`);
      for (const j of jobs) {
        console.log(`    Job ${j.id.slice(0,12)}: status=${j.status} mode=${j.mode} steps=${j.step_count} created=${(j.created_at||'').slice(0,19)}`);
        if (j.error) console.log(`      error: ${j.error.substring(0,200)}`);
      }
    }
  }
  
  // 6. Check the LLM invocation records if they exist
  console.log("\n\n=== LLM CALL STATS (if available) ===");
  // Try to find any log table
  const tables = ['ai_logs', 'llm_logs', 'function_logs', 'edge_function_logs'];
  for (const table of tables) {
    const { data: logs, error } = await sb
      .from(table)
      .select('*')
      .eq('project_id', PID)
      .order('created_at', { ascending: false })
      .limit(3);
    
    if (!error && logs && logs.length > 0) {
      console.log(`  ${table}: ${logs.length} records`);
      for (const l of logs) {
        console.log(`    ${JSON.stringify(l).substring(0,300)}`);
      }
    }
  }
}

main().catch(e => console.error(e));