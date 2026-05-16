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
  console.log(`Found ${jobs.length} jobs`);
  
  jobs.forEach(j => {
    console.log(`\nJob ${j.id.slice(0,12)}:`);
    console.log(`  type: ${j.job_type} | status: ${j.status}`);
    console.log(`  stages: ${j.stages_completed}/${j.stages_total} | current_stage: ${j.current_stage}`);
    console.log(`  started: ${j.started_at || 'never'}`);
    console.log(`  completed: ${j.completed_at || 'never'}`);
    if (j.started_at && j.completed_at) {
      console.log(`  duration: ${(new Date(j.completed_at) - new Date(j.started_at))/1000}s`);
    } else if (j.started_at && !j.completed_at) {
      console.log(`  elapsed: ${(Date.now() - new Date(j.started_at))/1000}s (still running)`);
    }
    if (j.error_message) console.log(`  error: ${j.error_message}`);
    if (j.payload) console.log(`  payload keys: ${Object.keys(typeof j.payload === 'string' ? JSON.parse(j.payload) : j.payload).join(', ')}`);
  });

  // 2. STEPS for most recent job
  if (jobs.length > 0) {
    const latestJob = jobs[0];
    console.log(`\n\n=== STEPS for job ${latestJob.id.slice(0,12)} (${latestJob.job_type}) ===`);
    const { data: steps, error: sErr } = await sb
      .from('auto_run_steps')
      .select('*')
      .eq('auto_run_job_id', latestJob.id)
      .order('step_index', { ascending: true })
      .limit(200);
    
    if (sErr) console.log("STEPS ERR:", sErr.message);
    else {
      console.log(`Found ${steps.length} steps`);
      
      steps.forEach(s => {
        const started = s.started_at || '---';
        const completed = s.completed_at || '---';
        const dur = s.started_at && s.completed_at
          ? ((new Date(s.completed_at) - new Date(s.started_at))/1000).toFixed(1) + 's'
          : s.started_at && !s.completed_at
            ? ((Date.now() - new Date(s.started_at))/1000).toFixed(0) + 's (still running)'
            : '---';
        
        console.log(`\n  step#${s.step_index} | action=${s.action} | status=${s.status} | doc=${(s.document||'').slice(0,14)}`);
        console.log(`    doc_type=${s.doc_type} | stage=${s.stage_key} | started=${started} | completed=${completed} | dur=${dur}`);
        if (s.error_message) console.log(`    ERROR: ${s.error_message.substring(0,300)}`);
        if (s.result) {
          const res = typeof s.result === 'string' ? s.result : JSON.stringify(s.result);
          console.log(`    result: ${res.substring(0,350)}`);
        }
      });
    }
    
    // Also check ALL steps for FAILED ones
    console.log(`\n\n=== FAILED STEPS (any job) ===`);
    const { data: allSteps, error: asErr } = await sb
      .from('auto_run_steps')
      .select('*')
      .eq('project_id', PID)
      .in('status', ['failed', 'error'])
      .limit(50);
    
    if (!asErr && allSteps.length > 0) {
      allSteps.forEach(s => {
        console.log(`  FAILED: job=${(s.auto_run_job_id||'').slice(0,12)} step#${s.step_index} action=${s.action} doc_type=${s.doc_type}`);
        console.log(`    error: ${(s.error_message||'').substring(0,300)}`);
      });
    } else {
      console.log("  No failed steps found.");
    }
    
    // Stalled steps
    console.log(`\n=== STALLED STEPS (running, no completion) ===`);
    const { data: runningSteps, error: rsErr } = await sb
      .from('auto_run_steps')
      .select('*')
      .eq('project_id', PID)
      .eq('status', 'running')
      .is('completed_at', null)
      .not('started_at', 'is', null)
      .limit(20);
    
    if (!rsErr && runningSteps.length > 0) {
      runningSteps.forEach(s => {
        console.log(`\n  STALLED: job=${(s.auto_run_job_id||'').slice(0,12)} step#${s.step_index} action=${s.action} doc=${(s.document||'').slice(0,14)}`);
        console.log(`    started: ${s.started_at} | elapsed: ${(Date.now() - new Date(s.started_at))/1000}s`);
      });
    } else {
      console.log("  No stalled steps found.");
    }
  }

  // 3. DEVELOPMENT_RUNS
  console.log(`\n\n=== DEVELOPMENT_RUNS (recent 30) ===`);
  const { data: druns, error: dErr } = await sb
    .from('development_runs')
    .select('id, document_id, doc_type, status, run_type, iteration_count, ci_scores, process_type, source, started_at, completed_at, updated_at, progress_json')
    .eq('project_id', PID)
    .order('created_at', { ascending: false })
    .limit(30);
  
  if (dErr) console.log("DRUNS ERR:", dErr.message);
  else {
    console.log(`Found ${druns.length} runs`);
    
    // Unfinished runs
    const unfinished = druns.filter(r => r.started_at && !r.completed_at);
    console.log(`UNFINISHED runs: ${unfinished.length}`);
    unfinished.forEach(r => {
      const elapsed = (Date.now() - new Date(r.started_at))/1000;
      console.log(`  ${r.id.slice(0,8)} | doc_type=${(r.doc_type||'').slice(0,20)} | status=${r.status} | src=${r.source} | iters=${r.iteration_count} | elapsed=${elapsed}s`);
      if (r.progress_json) {
        console.log(`    progress: ${JSON.stringify(r.progress_json).substring(0,200)}`);
      }
    });
    
    // Show all with duration
    druns.forEach(r => {
      const dur = r.started_at && r.completed_at
        ? ((new Date(r.completed_at) - new Date(r.started_at))/1000).toFixed(0) + 's'
        : r.started_at && !r.completed_at
          ? ((Date.now() - new Date(r.started_at))/1000).toFixed(0) + 's (RUNNING)'
          : '---';
      console.log(`  ${r.id.slice(0,8)} | doc_type=${(r.doc_type||'').slice(0,20).padEnd(20)} | status=${(r.status||'').padEnd(10)} | src=${(r.source||'').padEnd(12)} | iters=${r.iteration_count} | dur=${dur}`);
    });
  }
  
  // 4. DOCUMENTS
  console.log(`\n\n=== DOCUMENTS ===`);
  const { data: docs, error: dgErr } = await sb
    .from('project_documents')
    .select('id, doc_type, title, bg_generating, is_locked, latest_version_id, current_stage')
    .eq('project_id', PID);
  
  if (dgErr) console.log("DOCS ERR:", dgErr.message);
  else {
    docs.forEach(d => {
      const gen = d.bg_generating ? 'GEN' : 'idle';
      const lock = d.is_locked ? 'LOCK' : 'unlock';
      console.log(`  ${(d.doc_type||'?').padEnd(22)} ${gen.padEnd(5)} ${lock.padEnd(6)} stage=${d.current_stage || '-'} ver=${(d.latest_version_id||'none').slice(0,8)}`);
    });
  }
  
  // 5. PROJECT
  console.log(`\n\n=== PROJECT ===`);
  const { data: proj, error: pErr } = await sb
    .from('projects')
    .select('id, title, lane, format, status, current_stage')
    .eq('id', PID)
    .single();
  
  if (pErr) console.log("PROJ ERR:", pErr.message);
  else {
    console.log(`  title: ${proj.title}`);
    console.log(`  lane: ${proj.lane} | format: ${proj.format}`);
    console.log(`  status: ${proj.status} | current_stage: ${proj.current_stage}`);
  }
  
  // 6. Longest dev runs
  console.log(`\n\n=== LONGEST DEVELOPMENT RUNS (top 10) ===`);
  const completed = druns.filter(r => r.started_at && r.completed_at);
  completed.sort((a, b) => {
    return (new Date(b.completed_at) - new Date(b.started_at)) - (new Date(a.completed_at) - new Date(a.started_at));
  });
  
  completed.slice(0, 10).forEach(r => {
    const dur = ((new Date(r.completed_at) - new Date(r.started_at))/1000).toFixed(0);
    console.log(`  ${dur}s | ${r.id.slice(0,8)} | ${(r.doc_type||'').slice(0,20).padEnd(20)} | iters=${r.iteration_count} | src=${r.source}`);
  });
}

main().catch(e => console.error(e));