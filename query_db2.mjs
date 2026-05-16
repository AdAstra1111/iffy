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
  // Check project_notes schema
  const { data: pn } = await sb.from('project_notes').select('*').limit(1);
  if (pn && pn.length > 0) {
    console.log("=== project_notes columns ===");
    console.log(Object.keys(pn[0]).join(', '));
    console.log("Sample:", JSON.stringify(pn[0], null, 2));
  }

  // Check auto_run_steps
  const { data: ars } = await sb.from('auto_run_steps').select('*').limit(1);
  if (ars && ars.length > 0) {
    console.log("\n=== auto_run_steps columns ===");
    console.log(Object.keys(ars[0]).join(', '));
  }

  // Check auto_run_jobs
  const { data: arj } = await sb.from('auto_run_jobs').select('*').limit(1);
  if (arj && arj.length > 0) {
    console.log("\n=== auto_run_jobs columns ===");
    console.log(Object.keys(arj[0]).join(', '));
  }

  console.log("\n\n========== NOW THE REAL QUERIES ==========\n");

  // 1. character_bible document
  const { data: docs } = await sb
    .from('project_documents')
    .select('id, doc_type, title, latest_version_id')
    .eq('project_id', PID)
    .eq('doc_type', 'character_bible');
  console.log("Document:", JSON.stringify(docs));
  if (!docs || docs.length === 0) return;

  const docId = docs[0].id;
  const latestVerId = docs[0].latest_version_id;

  // 2. All versions for this document
  const { data: versions } = await sb
    .from('project_document_versions')
    .select('id, version_number, label, measured_metrics_json, created_at, approval_status, is_current, status, change_summary')
    .eq('document_id', docId)
    .order('version_number', { ascending: true });
  
  console.log(`\n=== VERSIONS (${versions.length}) ===`);
  versions.forEach(v => {
    const ci = v.measured_metrics_json?.ci_score ?? v.measured_metrics_json?.scores?.ci_score ?? 'N/A';
    console.log(`  V${v.version_number} id=${v.id.slice(0,8)} ci=${JSON.stringify(ci)} current=${v.is_current} approval=${v.approval_status} created=${v.created_at}`);
    if (v.label) console.log(`    label=${v.label}`);
    if (v.change_summary) console.log(`    change_summary=${v.change_summary.substring(0, 120)}`);
  });

  // 3. Plot CI trajectory
  console.log("\nCI TRAJECTORY:");
  versions.forEach(v => {
    const m = v.measured_metrics_json || {};
    // Try different ci_score locations
    const ci = m.ci_score ?? m.scores?.ci_score ?? m.overall_ci ?? null;
    console.log(`  V${v.version_number}: ci=${ci}`);
  });

  // 4. NOTES for this project
  console.log("\n=== ALL NOTES ===");
  const { data: notes } = await sb
    .from('project_notes')
    .select('id, note_key, note_type, timing, category, priority, title, description, source, created_at, resolved_at, document_id, version_bound, auto_resolved')
    .eq('project_id', PID)
    .order('created_at', { ascending: false })
    .limit(200);
  
  if (notes) {
    console.log(`Total notes for project: ${notes.length}`);
    
    // Group by note_key (case-insensitive)
    const byKey = {};
    notes.forEach(n => {
      const k = (n.note_key || '(null)').toLowerCase();
      if (!byKey[k]) byKey[k] = [];
      byKey[k].push(n);
    });
    
    const sorted = Object.entries(byKey).sort((a, b) => b[1].length - a[1].length);
    sorted.forEach(([key, items]) => {
      console.log(`\n  === ${key} (${items.length}x) ===`);
      items.forEach(n => {
        console.log(`    [${n.id.slice(0,8)}] timing=${n.timing} pri=${n.priority} doc=${(n.document_id||'').slice(0,8)} vb=${n.version_bound?.slice(0,8)} ar=${n.auto_resolved} created=${n.created_at?.substring(0,19)} resolved=${n.resolved_at?.substring(0,19)||'null'}`);
        console.log(`      title: ${n.title?.substring(0, 100)}`);
        const desc = n.description ? n.description.substring(0, 150).replace(/\n/g, '\\n') : '(empty)';
        console.log(`      desc: ${desc}`);
        console.log(`      source: ${n.source} note_type=${n.note_type} category=${n.category}`);
      });
    });
  }

  // 5. DEVELOPMENT RUNS
  console.log("\n\n=== DEVELOPMENT RUNS ===");
  const { data: devRuns } = await sb
    .from('development_runs')
    .select('id, document_id, run_type, analysis_mode, output_json, created_at, iteration_count, source')
    .eq('project_id', PID)
    .eq('document_id', docId)
    .order('created_at', { ascending: true })
    .limit(30);
  
  if (devRuns) {
    console.log(`Total dev runs: ${devRuns.length}`);
    devRuns.forEach(r => {
      const o = r.output_json || {};
      const ci = o.ci_score ?? o.scores?.ci_score ?? '?';
      const gp = o.gp_score ?? o.scores?.gp_score ?? '?';
      const convergence = o.convergence?.status ?? '?';
      console.log(`  Run ${r.id.slice(0,8)}: type=${r.run_type} mode=${r.analysis_mode} ci=${ci} gp=${gp} conv=${convergence} iters=${r.iteration_count} created=${r.created_at?.substring(0,19)} source=${r.source}`);
      
      // Extract notes from output_json
      if (o.polish_notes && o.polish_notes.length > 0) {
        console.log(`    polish_notes (${o.polish_notes.length}):`, o.polish_notes.map(n => n.note_key || n.key || n.id).slice(0,10).join(', '));
      }
      if (o.deferred_notes && o.deferred_notes.length > 0) {
        console.log(`    deferred_notes (${o.deferred_notes.length}):`, o.deferred_notes.map(n => n.note_key || n.key || n.id).slice(0,10).join(', '));
      }
      if (o.blocking_issues && o.blocking_issues.length > 0) {
        console.log(`    blocking_issues (${o.blocking_issues.length}):`, o.blocking_issues.map(n => n.note_key || n.key || n.id).slice(0,10).join(', '));
      }
      if (o.rewrite_plan) console.log(`    rewrite_plan: ${JSON.stringify(o.rewrite_plan).substring(0, 200)}`);
    });
  }

  // 6. Also check if ci_score column exists somewhere else
  console.log("\n\n=== CI SCORE IN MEASURED_METRICS_JSON ===");
  versions.forEach(v => {
    const m = v.measured_metrics_json || {};
    console.log(`V${v.version_number}: all keys in measured_metrics_json: ${Object.keys(m).join(', ')}`);
    console.log(`  raw: ${JSON.stringify(m).substring(0, 200)}`);
  });

  // 7. Get last 5 versions plaintext for voice content search
  console.log("\n\n=== LAST 5 VERSIONS PLAINTEXT (voice search) ===");
  const { data: lastVersions } = await sb
    .from('project_document_versions')
    .select('id, version_number, plaintext, created_at')
    .eq('document_id', docId)
    .order('version_number', { ascending: false })
    .limit(5);
  
  if (lastVersions) {
    lastVersions.reverse().forEach(v => {
      const text = v.plaintext || '';
      const voiceMentions = (text.match(/voice/gi) || []).length;
      const preview = text.substring(0, 200).replace(/\n/g, '\\n');
      console.log(`\n  V${v.version_number} (${v.created_at?.substring(0,19)}): ${text.length} chars, "voice" x${voiceMentions}`);
      console.log(`  Preview: ${preview}`);
      if (text.includes('voice')) {
        // Find voice context
        const idx = text.indexOf('voice');
        console.log(`  Context around first 'voice': ...${text.substring(Math.max(0,idx-40), idx+60)}...`);
      }
    });
  }
}

main().catch(e => console.error(e));
