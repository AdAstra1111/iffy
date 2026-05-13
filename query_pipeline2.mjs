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
  // 1. AUTO_RUN_JOBS
  console.log("=== AUTO_RUN_JOBS ===");
  const { data: jobs, error: jErr } = await sb
    .from('auto_run_jobs')
    .select('*')
    .eq('project_id', PID)
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (jErr) { console.log("JOBS ERR:", jErr.message); return; }
  console.log(`Found ${jobs.length} jobs\n`);
  
  jobs.forEach(j => {
    console.log(`Job ${j.id.slice(0,12)}:`);
    console.log(`  mode: ${j.mode} | status: ${j.status} | pipeline_key: ${j.pipeline_key}`);
    console.log(`  start_doc: ${(j.start_document||'').slice(0,16)} | target_doc: ${(j.target_document||'').slice(0,16)} | current_doc: ${(j.current_document||'').slice(0,16)}`);
    console.log(`  steps: ${j.step_count} | stage_loop: ${j.stage_loop_count}`);
    console.log(`  created: ${j.created_at} | last_step: ${j.last_step_at} | last_heartbeat: ${j.last_heartbeat_at}`);
    console.log(`  is_processing: ${j.is_processing} | processing_started: ${j.processing_started_at}`);
    console.log(`  stop_reason: ${j.stop_reason} | error: ${j.error || 'none'}`);
    if (j.last_ui_message) console.log(`  last_ui_message: ${j.last_ui_message}`);
    if (j.pause_reason) console.log(`  pause_reason: ${j.pause_reason}`);
    console.log(`  current_stage_index: ${j.current_stage_index}`);
    if (j.stage_history) {
      const sh = typeof j.stage_history === 'string' ? JSON.parse(j.stage_history) : j.stage_history;
      console.log(`  stage_history: ${JSON.stringify(sh).substring(0,300)}`);
    }
    console.log('');
  });

  // 2. AUTO_RUN_STEPS for most recent job
  if (jobs.length > 0) {
    // Find the most recent job that isn't just a review
    const targetJob = jobs[0]; // most recent
    console.log(`\n=== STEPS for job ${targetJob.id.slice(0,12)} ===`);
    const { data: steps, error: sErr } = await sb
      .from('auto_run_steps')
      .select('*')
      .eq('job_id', targetJob.id)
      .order('step_index', { ascending: true })
      .limit(200);
    
    if (sErr) console.log("STEPS ERR:", sErr.message);
    else {
      console.log(`Found ${steps.length} steps`);
      
      steps.forEach(s => {
        console.log(`  step#${s.step_index} | action=${s.action} | doc=${(s.document||'').slice(0,14)} | ci=${s.ci} | gp=${s.gap} | created=${s.created_at}`);
        if (s.summary) console.log(`    summary: ${s.summary.substring(0,200)}`);
        if (s.output_text) console.log(`    output_text: ${s.output_text.substring(0,250)}`);
      });
    }
    
    // Also look at ALL steps across all jobs for this project (steps don't have project_id, 
    // so join via job_id)
    console.log(`\n=== ALL STEPS (all jobs) ===`);
    for (const job of jobs) {
      const { data: jobSteps, error: jsErr } = await sb
        .from('auto_run_steps')
        .select('*')
        .eq('job_id', job.id)
        .order('step_index', { ascending: true })
        .limit(200);
      
      if (!jsErr && jobSteps.length > 0) {
        console.log(`\nJob ${job.id.slice(0,12)} (${job.mode}, ${job.status}): ${jobSteps.length} steps`);
        jobSteps.forEach(s => {
          console.log(`  step#${s.step_index} | action=${s.action} | doc=${(s.document||'').slice(0,16)} | ci=${s.ci}`);
        });
      }
    }
  }

  // 3. DOCUMENTS — check what docs exist for this project
  console.log(`\n\n=== PROJECT DOCUMENTS ===`);
  const { data: docs, error: dgErr } = await sb
    .from('project_documents')
    .select('id, doc_type, title, doc_role, latest_version_id, updated_at')
    .eq('project_id', PID);
  
  if (dgErr) console.log("DOCS ERR:", dgErr.message);
  else {
    console.log(`Found ${docs.length} documents`);
    docs.forEach(d => {
      console.log(`  ${(d.doc_type||'?').padEnd(22)} role=${(d.doc_role||'-').padEnd(12)} ver=${(d.latest_version_id||'none').slice(0,8)} updated=${(d.updated_at||'').slice(0,19)}`);
    });
  }
  
  // 4. DEVELOPMENT_RUNS
  console.log(`\n\n=== DEVELOPMENT_RUNS ===`);
  const { data: druns, error: drErr } = await sb
    .from('development_runs')
    .select('id, project_id, document_id, run_type, production_type, source, deliverable_type, development_stage, created_at')
    .eq('project_id', PID)
    .order('created_at', { ascending: false })
    .limit(30);
  
  if (drErr) console.log("DR ERR:", drErr.message);
  else {
    console.log(`Found ${druns.length} runs`);
    druns.forEach(r => {
      console.log(`  ${r.id.slice(0,8)} | run_type=${(r.run_type||'?').padEnd(18)} | prod_type=${(r.production_type||'-').padEnd(12)} | src=${(r.source||'').padEnd(12)} | dev_stage=${(r.development_stage||'-')} | created=${r.created_at.slice(0,19)}`);
    });
  }
  
  // 5. Check if this project has any generate-seed-pack related docs
  console.log(`\n\n=== SEED-RELATED DOCS ===`);
  const seedTypes = ['project_overview', 'creative_brief', 'market_positioning', 'canon', 'nec', 'concept_brief', 'market_sheet', 'character_bible', 'story_architecture'];
  const { data: seedDocs, error: sdErr } = await sb
    .from('project_documents')
    .select('id, doc_type, title, doc_role, latest_version_id, updated_at')
    .eq('project_id', PID)
    .in('doc_type', seedTypes);
  
  if (sdErr) console.log("SEED DOCS ERR:", sdErr.message);
  else {
    console.log(`Total ${seedDocs.length} seed-type docs`);
    seedDocs.forEach(d => {
      console.log(`  ${(d.doc_type||'?').padEnd(22)} role=${(d.doc_role||'-').padEnd(12)} ver=${(d.latest_version_id||'none').slice(0,8)} updated=${(d.updated_at||'').slice(0,19)}`);
    });
  }
}

main().catch(e => console.error(e));