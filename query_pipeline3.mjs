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
  // 1. Check reverse engineer job
  console.log("=== NARRATIVE UNITS (async jobs for RE) ===");
  const { data: units, error: uErr } = await sb
    .from('narrative_units')
    .select('id, project_id, unit_type, payload_json, status, created_at')
    .eq('project_id', PID)
    .eq('unit_type', 'async_job')
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (uErr) console.log("NU ERR:", uErr.message);
  else if (units) {
    console.log(`Found ${units.length} async_job units`);
    units.forEach(u => {
      console.log(`\n  Unit ${u.id.slice(0,12)}: created=${u.created_at?.slice(0,19)}`);
      if (u.payload_json) {
        const pj = typeof u.payload_json === 'string' ? JSON.parse(u.payload_json) : u.payload_json;
        console.log(`    status: ${pj.status || pj.job_status || '?'}`);
        console.log(`    stage: ${pj.stage || '?'}`);
        console.log(`    error: ${pj.error || 'none'}`);
        console.log(`    created_docs: ${pj.created_docs ? JSON.stringify(pj.created_docs) : 'none'}`);
        console.log(`    report: ${pj.report ? (typeof pj.report === 'string' ? pj.report.substring(0,200) : JSON.stringify(pj.report).substring(0,200)) : 'none'}`);
      }
    });
  }
  
  // 2. Check for any job-running status indicators
  console.log("\n\n=== PROJECT NOTES (recent, checking for system notes) ===");
  const { data: notes, error: nErr } = await sb
    .from('project_notes')
    .select('id, note_key, note_type, timing, category, priority, title, description, source, created_at, resolved_at, document_id')
    .eq('project_id', PID)
    .eq('source', 'system')
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (nErr) console.log("NOTES ERR:", nErr.message);
  else if (notes) {
    console.log(`Found ${notes.length} system notes`);
    notes.forEach(n => {
      console.log(`\n  Note ${n.id.slice(0,8)}: key=${n.note_key} type=${n.note_type} timing=${n.timing} pri=${n.priority}`);
      console.log(`    title: ${(n.title||'').substring(0,120)}`);
      console.log(`    desc: ${(n.description||'').substring(0,200)}`);
      console.log(`    resolved: ${n.resolved_at || 'no'} | doc_id: ${(n.document_id||'').slice(0,12) || 'none'}`);
    });
  }
  
  // 3. Check the project's update history to see what's been changing
  console.log("\n\n=== RECENT VERSIONS PER DOC TYPE ===");
  const docs = [
    { type: 'concept_brief', id: '' },
    { type: 'market_sheet', id: '' },
    { type: 'character_bible', id: '' },
    { type: 'treatment', id: '' },
    { type: 'story_outline', id: '' },
    { type: 'beat_sheet', id: '' },
    { type: 'feature_script', id: '' },
    { type: 'idea', id: '' },
  ];
  
  // First get the doc IDs
  const { data: allDocs } = await sb
    .from('project_documents')
    .select('id, doc_type')
    .eq('project_id', PID);
  
  if (allDocs) {
    for (const d of allDocs) {
      const { data: versions, error: vErr } = await sb
        .from('project_document_versions')
        .select('id, version_number, created_at, ci_score, approval_status, is_current')
        .eq('document_id', d.id)
        .order('version_number', { ascending: false })
        .limit(5);
      
      if (!vErr && versions) {
        console.log(`\n${d.doc_type} (${d.id.slice(0,8)}): ${versions.length} recent versions`);
        versions.forEach(v => {
          console.log(`  V${v.version_number} | ci=${v.ci_score} | approval=${v.approval_status} | current=${v.is_current} | created=${v.created_at?.slice(0,19)}`);
        });
      }
    }
  }
  
  // 4. Check feature_script specifically (the uploaded script)
  console.log("\n\n=== FEATURE SCRIPT DETAILS ===");
  const { data: scriptDocs } = await sb
    .from('project_documents')
    .select('id, doc_type, title, source, ingestion_source, updated_at')
    .eq('project_id', PID)
    .eq('doc_type', 'feature_script');
  
  if (scriptDocs) {
    scriptDocs.forEach(d => {
      console.log(`  id=${d.id.slice(0,12)} title=${d.title} source=${d.source} ingest=${d.ingestion_source} updated=${d.updated_at?.slice(0,19)}`);
      
      const { data: versions } = await sb
        .from('project_document_versions')
        .select('id, version_number, created_at, content_length, ci_score, approval_status')
        .eq('document_id', d.id)
        .order('version_number', { ascending: false })
        .limit(3);
      
      if (versions) {
        versions.forEach(v => {
          console.log(`    V${v.version_number} | ci=${v.ci_score} | approval=${v.approval_status} | content_len=${v.content_length} | created=${v.created_at?.slice(0,19)}`);
        });
      }
    });
  }
  
  // 5. Check stage_ladders for film format
  console.log("\n\n=== STAGE LADDERS ===");
  const { data: ladders } = await sb
    .from('stage_ladders')
    .select('format, ladder')
    .limit(10);
  
  if (ladders) {
    ladders.forEach(l => {
      console.log(`  ${l.format}: ${JSON.stringify(l.ladder).substring(0,200)}`);
    });
  }
}

main().catch(e => console.error(e));
