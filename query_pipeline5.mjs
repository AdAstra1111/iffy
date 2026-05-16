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
  // 1. Check the existing narrative_unit in full
  console.log("=== NARRATIVE UNIT FULL PAYLOAD ===");
  const { data: units } = await sb
    .from('narrative_units')
    .select('id, unit_type, payload_json')
    .eq('project_id', PID)
    .eq('unit_type', 'async_job');
  
  if (units && units.length > 0) {
    const u = units[0];
    console.log(`ID: ${u.id}`);
    console.log(`Type: ${u.unit_type}`);
    const pj = typeof u.payload_json === 'string' ? JSON.parse(u.payload_json) : u.payload_json;
    console.log("Full payload:");
    console.log(JSON.stringify(pj, null, 2));
  }
  
  // 2. Check project_notes with correct column names
  console.log("\n\n=== PROJECT NOTES (recent 30, all sources) ===");
  const { data: notes, error: nErr } = await sb
    .from('project_notes')
    .select('id, note_type, timing, category, priority, title, description, source, created_at, resolved_at, document_id, auto_resolved')
    .eq('project_id', PID)
    .order('created_at', { ascending: false })
    .limit(30);
  
  if (nErr) console.log("NOTES ERR:", nErr.message);
  else if (notes) {
    console.log(`Found ${notes.length} notes`);
    const unresolved = notes.filter(n => !n.resolved_at);
    console.log(`Unresolved: ${unresolved.length}`);
    
    // Group by note_type
    const byType = {};
    for (const n of notes) {
      const t = n.note_type || 'null';
      if (!byType[t]) byType[t] = [];
      byType[t].push(n);
    }
    for (const [type, items] of Object.entries(byType)) {
      console.log(`\n  --- ${type} (${items.length}x) ---`);
      for (const n of items) {
        console.log(`    [${n.id.slice(0,8)}] timing=${n.timing} pri=${n.priority} resolved=${n.resolved_at ? n.resolved_at.slice(0,19) : 'no'}`);
        console.log(`      title: ${(n.title||'').substring(0,100)}`);
        console.log(`      desc: ${(n.description||'').substring(0,150)}`);
      }
    }
  }
  
  // 3. Check project_documents version counts in detail
  console.log("\n\n=== ALL DOCUMENTS WITH FULL VERSION HISTORY ===");
  const { data: docs } = await sb
    .from('project_documents')
    .select('id, doc_type, doc_role, updated_at, latest_version_id')
    .eq('project_id', PID);
  
  if (docs) {
    for (const d of docs) {
      const { data: versions, count } = await sb
        .from('project_document_versions')
        .select('id, version_number, created_at, ci_score, approval_status, is_current', { count: 'exact' })
        .eq('document_id', d.id)
        .order('version_number', { ascending: false })
        .limit(10);
      
      console.log(`\n${d.doc_type} (${d.id.slice(0,8)}): ${count} total versions`);
      if (versions) {
        for (const v of versions) {
          console.log(`  V${v.version_number} | ci=${v.ci_score} | approval=${v.approval_status} | current=${v.is_current} | ${(v.created_at||'').slice(0,19)}`);
        }
        // Check if latest is approved
        const auth = versions.find(v => v.approval_status === 'approved' && v.is_current === true);
        console.log(`  Authoritative version: ${auth ? 'V' + auth.version_number : 'NONE'}`);
      }
    }
  }
  
  // 4. Check development_runs more carefully - what docs are they for?
  console.log("\n\n=== DEVELOPMENT RUNS WITH DOC TYPES ===");
  const { data: druns } = await sb
    .from('development_runs')
    .select('id, document_id, run_type, production_type, source, development_stage, created_at')
    .eq('project_id', PID)
    .order('created_at', { ascending: false })
    .limit(50);
  
  if (druns) {
    console.log(`Total: ${druns.length} runs`);
    
    // Count by doc_id and run_type
    const byDoc = {};
    for (const r of druns) {
      const key = `${r.document_id || 'none'}__${r.run_type}`;
      byDoc[key] = (byDoc[key] || 0) + 1;
    }
    
    // Match docs
    const docMap = {};
    if (docs) {
      for (const d of docs) docMap[d.id] = d.doc_type;
    }
    
    console.log("\nBreakdown by document:");
    for (const [key, count] of Object.entries(byDoc)) {
      const [docId, runType] = key.split('__');
      const docType = docMap[docId] || docId.slice(0,8);
      console.log(`  ${docType.padEnd(22)} | ${(runType||'').padEnd(20)} | ${count}x`);
    }
    
    // Show all runs chronologically for the most-run doc
    console.log("\nMost recent runs:");
    for (const r of druns.slice(0, 15)) {
      const docType = docMap[r.document_id] || (r.document_id || '').slice(0,8) || 'none';
      console.log(`  ${(r.created_at||'').slice(0,19)} | ${docType.padEnd(22)} | run_type=${r.run_type}`);
    }
  }
  
  // 5. Check if there's a "generate pending" flag or anything
  console.log("\n\n=== PROJECT FLAGS & STATE ===");
  const { data: proj } = await sb
    .from('projects')
    .select('id, title, format, pipeline_stage, lifecycle_stage, current_stage, autorun_enabled, autorun_trigger, ai_production_mode, development_behavior')
    .eq('id', PID)
    .single();
  
  if (proj) {
    console.log(JSON.stringify(proj, null, 2));
  }
  
  // 6. Check the latest development_runs output_json for clues
  console.log("\n\n=== LATEST DEVELOPMENT_RUNS OUTPUT_JSON ===");
  const { data: recentRuns } = await sb
    .from('development_runs')
    .select('id, document_id, run_type, output_json, source')
    .eq('project_id', PID)
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (recentRuns) {
    for (const r of recentRuns) {
      console.log(`\nRun ${r.id.slice(0,8)} | doc=${(r.document_id||'').slice(0,12)} | type=${r.run_type} | source=${r.source}`);
      if (r.output_json) {
        const oj = typeof r.output_json === 'string' ? JSON.parse(r.output_json) : r.output_json;
        console.log(`  output_json: ${JSON.stringify(oj).substring(0,500)}`);
      }
    }
  }
}

main().catch(e => console.error(e));