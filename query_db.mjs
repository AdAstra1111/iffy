import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const anonKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const url = envContent.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();

const loginTs = fs.readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = loginTs.match(/SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : anonKey;

const sb = createClient(url, srKey, { auth: { persistSession: false } });

const PROJECT_ID = '1983a0ee-bf30-42d1-ae49-d8a272538993';

async function main() {
  // 1. Find character_bible document
  console.log("\n=== CHARACTER BIBLE DOCUMENT ===");
  const { data: docs, error: docsErr } = await sb
    .from('project_documents')
    .select('id, doc_type, title, latest_version_id, created_at')
    .eq('project_id', PROJECT_ID)
    .eq('doc_type', 'character_bible');

  if (docsErr) { console.error("ERROR:", docsErr); return; }
  console.log(JSON.stringify(docs, null, 2));
  if (!docs || docs.length === 0) {
    console.log("No character_bible found. Trying all doc_types...");
    const { data: all } = await sb.from('project_documents').select('id, doc_type, title, latest_version_id, created_at').eq('project_id', PROJECT_ID);
    console.log("All doc_types:", JSON.stringify(all, null, 2));
    return;
  }

  const docId = docs[0].id;
  console.log(`\nUsing document ID: ${docId}`);

  // 2. All versions of character_bible
  console.log(`\n=== DOCUMENT VERSIONS ===`);
  const { data: versions, error: verErr } = await sb
    .from('project_document_versions')
    .select('id, version_number, ci_score, ci_score_breakdown, created_at, updated_at, is_current, approval_status')
    .eq('document_id', docId)
    .order('version_number', { ascending: true });

  if (verErr) { console.error("ERROR:", verErr); } else {
    console.log(`Total versions: ${versions.length}`);
    versions.forEach(v => {
      console.log(`  V${v.version_number} id=${v.id.slice(0,8)} ci=${v.ci_score} is_current=${v.is_current} approval=${v.approval_status} created=${v.created_at}`);
    });
    console.log("\nCI trajectory:");
    console.log(versions.map(v => `  V${v.version_number}: ci=${v.ci_score}`).join('\n'));
  }

  // 3. project_notes - ALL notes for this project
  console.log(`\n=== ALL PROJECT NOTES (grouped by note_key) ===`);
  const { data: allNotes, error: nErr } = await sb
    .from('project_notes')
    .select('id, note_key, note_type, timing, category, priority, title, description, source, created_at, resolved_at, document_id, version_bound, auto_resolved')
    .eq('project_id', PROJECT_ID)
    .order('created_at', { ascending: false })
    .limit(200);

  if (nErr) { console.error("ERROR:", nErr); } else {
    console.log(`Total notes: ${allNotes.length}`);
    // Group by note_key
    const byKey = {};
    allNotes.forEach(n => {
      const k = n.note_key || '(null)';
      if (!byKey[k]) byKey[k] = [];
      byKey[k].push(n);
    });
    // Print grouped by key, sorted by count desc
    const sorted = Object.entries(byKey).sort((a, b) => b[1].length - a[1].length);
    sorted.forEach(([key, items]) => {
      console.log(`\n  --- ${key} (${items.length}x) ---`);
      items.forEach(n => {
        const d = n.document_id ? n.document_id.slice(0,8) : 'none';
        console.log(`    [${n.id.slice(0,8)}] timing=${n.timing} pri=${n.priority} doc=${d} ver_bound=${n.version_bound} auto_resolved=${n.auto_resolved} created=${n.created_at} resolved=${n.resolved_at}`);
        console.log(`      title: ${n.title?.substring(0,80)}`);
        console.log(`      desc: ${n.description?.substring(0,120)}`);
        if (n.description && n.description.length > 120) console.log(`      desc(cont): ${n.description.substring(120,240)}`);
        console.log(`      source: ${n.source} note_type=${n.note_type} category=${n.category}`);
      });
    });
  }

  // 4. development_runs for this doc
  console.log(`\n=== DEVELOPMENT RUNS ===`);
  const { data: devRuns, error: drErr } = await sb
    .from('development_runs')
    .select('id, document_id, status, context, ci_scores, iteration_count, created_at, updated_at, source')
    .eq('project_id', PROJECT_ID)
    .order('created_at', { ascending: true })
    .limit(50);

  if (drErr) { console.error("ERROR:", drErr); } else {
    console.log(`Total runs: ${devRuns.length}`);
    devRuns.forEach(r => {
      console.log(`\n  Run ${r.id.slice(0,8)}: doc=${(r.document_id||'').slice(0,8)} status=${r.status} iters=${r.iteration_count} source=${r.source} created=${r.created_at}`);
      if (r.ci_scores) {
        const cs = typeof r.ci_scores === 'string' ? JSON.parse(r.ci_scores) : r.ci_scores;
        console.log(`    ci_scores: ${JSON.stringify(cs)}`);
      }
      if (r.context) {
        const ctx = typeof r.context === 'string' ? JSON.parse(r.context) : r.context;
        const keys = Object.keys(ctx).slice(0, 15);
        console.log(`    context keys: ${keys.join(', ')}`);
        // Show iteration_state if present
        if (ctx.iteration_state) {
          const its = typeof ctx.iteration_state === 'string' ? JSON.parse(ctx.iteration_state) : ctx.iteration_state;
          console.log(`    iteration_state: ${JSON.stringify(its).substring(0, 300)}`);
        }
        if (ctx.analytics) {
          console.log(`    analytics: ${JSON.stringify(ctx.analytics).substring(0, 300)}`);
        }
        if (ctx.notes) {
          console.log(`    notes: ${JSON.stringify(ctx.notes).substring(0, 300)}`);
        }
      }
    });
  }

  // 5. auto_run_steps for this project
  console.log(`\n=== AUTO RUN STEPS ===`);
  const { data: arSteps, error: arsErr } = await sb
    .from('auto_run_steps')
    .select('id, auto_run_job_id, step_type, status, stage_key, step_number, result, error_message, started_at, completed_at, created_at')
    .eq('project_id', PROJECT_ID)
    .order('created_at', { ascending: true })
    .limit(100);

  if (arsErr) { console.log("auto_run_steps not found or error:", arsErr.message); } else if (arSteps) {
    console.log(`Total steps: ${arSteps.length}`);
    arSteps.forEach(s => {
      console.log(`  Step ${s.id.slice(0,8)}: type=${s.step_type} status=${s.status} stage=${s.stage_key} num=${s.step_number} started=${s.started_at}`);
      if (s.result) {
        const res = typeof s.result === 'string' ? s.result.substring(0,200) : JSON.stringify(s.result).substring(0,200);
        console.log(`    result: ${res}`);
      }
      if (s.error_message) console.log(`    error: ${s.error_message}`);
    });
  }

  // 6. Check auto_run_jobs
  console.log(`\n=== AUTO RUN JOBS ===`);
  const { data: arJobs, error: arjErr } = await sb
    .from('auto_run_jobs')
    .select('id, status, job_type, stages_completed, stages_total, started_at, completed_at, created_at')
    .eq('project_id', PROJECT_ID)
    .order('created_at', { ascending: true })
    .limit(20);

  if (arjErr) { console.log("auto_run_jobs:", arjErr.message); } else if (arJobs) {
    console.log(`Total jobs: ${arJobs.length}`);
    arJobs.forEach(j => {
      console.log(`  Job ${j.id.slice(0,8)}: type=${j.job_type} status=${j.status} stages=${j.stages_completed}/${j.stages_total} started=${j.started_at} completed=${j.completed_at}`);
    });
  }

  // 7. Get the actual version content for comparison
  console.log(`\n=== VERSION CONTENT (last 5 versions, first 500 chars) ===`);
  const { data: versionsContent, error: vcErr } = await sb
    .from('project_document_versions')
    .select('id, version_number, content, created_at')
    .eq('document_id', docId)
    .order('version_number', { ascending: false })
    .limit(5);

  if (vcErr) { console.error("ERROR:", vcErr); } else {
    versionsContent.reverse().forEach(v => {
      const contentPreview = v.content ? v.content.substring(0, 300).replace(/\n/g, '\\n') : '(no content)';
      console.log(`\n  V${v.version_number} (${v.created_at}):`);
      console.log(`    ${contentPreview}`);
      if (v.content && v.content.length > 300) {
        // Check if "voice" appears
        const voiceRefs = (v.content.match(/voice/gi) || []).length;
        console.log(`    "voice" mentions: ${voiceRefs}`);
      }
    });
  }
}

main().catch(e => console.error(e));
