import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.+)"/)[1];
const login = readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const anonKey = env.match(/VITE_SUPABASE_ANON_KEY="(.+)"/)[1];
const srMatch = login.match(/SUPABASE_SERVICE_ROLE_KEY.*\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : anonKey;
const sb = createClient(url, srKey, { auth: { persistSession: false } });

const JOB_ID = 'e1a84669-2cd8-497a-88e4-8b7f19d49a2d';
const USER_ID = 'a6c31c79-7837-47d8-b2f0-91d2e0febd76';

async function checkJob(): Promise<string> {
  const { data: jobs } = await sb.from('auto_run_jobs').select('id, status, current_document, step_count, is_processing, processing_started_at, lock_expires_at, pause_reason, stop_reason, error').eq('id', JOB_ID);
  const j = jobs?.[0];
  if (!j) return "job_not_found";
  
  const now = Date.now();
  const lockAlive = j.is_processing && j.processing_started_at && 
    (now - new Date(j.processing_started_at).getTime()) < 120_000;
  const paused = j.pause_reason || j.stop_reason;
  
  console.log(`[${new Date().toISOString().slice(11,19)}] ${j.status} | ${j.current_document} | steps:${j.step_count} | processing:${j.is_processing} | lock_alive:${lockAlive} | pause:${paused?.slice(0,30) || 'none'}`);
  
  // Get latest step
  const { data: steps } = await sb.from('auto_run_steps')
    .select('step_index, document, action, summary')
    .eq('job_id', JOB_ID)
    .order('step_index', { ascending: false })
    .limit(3);
  if (steps && steps.length > 0) {
    console.log(`  last: [${steps[0].step_index}] ${steps[0].document} → ${steps[0].action} | ${(steps[0].summary||'').slice(0,60)}`);
  }
  
  // Check versions of current doc
  const currentDoc = j.current_document;
  const { data: docs } = await sb.from('project_documents')
    .select('id')
    .eq('project_id', '27c9ab7a-6d3d-40bd-adab-a4aa5fd0c9fd')
    .eq('doc_type', currentDoc);
  if (docs && docs.length > 0) {
    const { count } = await sb.from('project_document_versions')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', docs[0].id);
    console.log(`  ${currentDoc}: ${count} versions`);
  } else {
    console.log(`  ${currentDoc}: doc slot not created`);
  }
  
  if (paused) return "paused";
  if (!lockAlive && j.step_count > 0) return "needs_kick";
  if (j.status === "completed" || j.status === "stopped") return "completed";
  if (currentDoc === "season_script" || currentDoc === "vertical_episode_beats" && j.step_count >= 32) 
    return "complete_check";
  return "running";
}

async function kick() {
  console.log("  → Kicking run-next...");
  try {
    const resp = await fetch(
      "https://hdfderbphdobomkdjypc.supabase.co/functions/v1/auto-run",
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${srKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run-next", jobId: JOB_ID, userId: USER_ID })
      }
    );
    const data = await resp.json();
    console.log(`  → Kick result: ${resp.status} | hint:${data.next_action_hint} | processing:${data.job?.is_processing}`);
  } catch(e) {
    console.log(`  → Kick error: ${e.message}`);
  }
}

async function main() {
  const maxLoops = 60; // ~30 min of monitoring
  let loops = 0;
  
  while (loops < maxLoops) {
    const state = await checkJob();
    
    if (state === "completed") {
      console.log("\n=== PIPELINE COMPLETE ===");
      break;
    }
    if (state === "paused") {
      console.log("\n=== PIPELINE PAUSED ===");
      break;
    }
    if (state === "needs_kick") {
      await kick();
    }
    
    loops++;
    // Wait 30s between checks
    await new Promise(r => setTimeout(r, 30000));
  }
  
  if (loops >= maxLoops) {
    console.log("\n=== MAX LOOPS REACHED ===");
  }
  
  // Final state
  const { data: jobs } = await sb.from('auto_run_jobs').select('*').eq('id', JOB_ID);
  const j = jobs?.[0];
  console.log("\nFINAL STATE:");
  console.log(JSON.stringify({
    status: j?.status, doc: j?.current_document, steps: j?.step_count,
    pause_reason: j?.pause_reason, stop_reason: j?.stop_reason, error: j?.error?.slice(0,200)
  }, null, 2));
}
main().catch(e => console.error('FATAL:', e));