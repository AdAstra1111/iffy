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
const CB_DOC_ID = '795c377f-25a6-4a6f-83e2-b5210b3703ab';

async function main() {
  // 1. Get ALL dev runs for this project
  const { data: allRuns } = await sb
    .from('development_runs')
    .select('id, document_id, run_type, output_json, created_at, iteration_count')
    .eq('project_id', PID)
    .order('created_at', { ascending: true })
    .limit(200);

  if (!allRuns) { console.log("No runs"); return; }
  console.log(`Total dev runs: ${allRuns.length}`);

  // Group by document_id to see which docs have runs
  const byDoc = {};
  allRuns.forEach(r => {
    const did = r.document_id || 'null';
    if (!byDoc[did]) byDoc[did] = [];
    byDoc[did].push(r);
  });

  console.log("\nDocument IDs with dev runs:");
  for (const [did, runs] of Object.entries(byDoc)) {
    console.log(`  ${did.slice(0,8)}: ${runs.length} runs`);
    runs.forEach(r => console.log(`    [${r.created_at?.substring(0,19)}] ${r.id.slice(0,8)} type=${r.run_type}`));
  }

  // 2. Get ALL output_json with notes for runs on the document IDs that have many runs
  // Most runs seem to be on doc 5cc11444 and 5a23cf13 - let me check which docs those are
  const docIdsWithRuns = Object.keys(byDoc).filter(k => k !== 'null');
  const { data: docs } = await sb
    .from('project_documents')
    .select('id, doc_type, title')
    .in('id', docIdsWithRuns);
  console.log("\nDocuments identified:");
  if (docs) {
    docs.forEach(d => console.log(`  ${d.id.slice(0,8)}: type=${d.doc_type} title="${d.title}"`));
  }

  // 3. Extract all notes from output_json for the document that has the character_bible runs
  // First find which document is character_bible
  const cbDoc = docs?.find(d => d.id === CB_DOC_ID);
  console.log(`\nCharacter Bible doc found: ${cbDoc?.title}`);

  // Find the correct document - let me check the docs that have the most ANALYZE + NOTES runs
  // The task mentions character_bible is on v17 - so each iteration generates a version
  // Let me check the documents referenced by the version history
  console.log("\n=== DOCUMENTS LINKED TO CHARACTER BIBLE VERSIONS ===");
  const { data: versions } = await sb
    .from('project_document_versions')
    .select('id, version_number, source_run_id, created_at')
    .eq('document_id', CB_DOC_ID)
    .order('version_number', { ascending: true });
  
  if (versions) {
    const runIds = versions.filter(v => v.source_run_id).map(v => v.source_run_id);
    console.log(`Versions with source_run_id: ${runIds.length}`);
    
    // Look up those runs
    const { data: sourceRuns } = await sb
      .from('development_runs')
      .select('id, run_type, document_id, output_json, created_at')
      .in('id', runIds);
    
    if (sourceRuns) {
      sourceRuns.forEach(r => {
        console.log(`  Run ${r.id.slice(0,8)}: type=${r.run_type} doc=${(r.document_id||'').slice(0,8)} created=${r.created_at?.substring(0,19)}`);
        const o = r.output_json || {};
        const polish = o.polish_notes || [];
        const deferred = o.deferred_notes || [];
        const blocking = o.blocking_issues || [];
        if (polish.length > 0 || deferred.length > 0 || blocking.length > 0) {
          console.log(`    notes: polish=${polish.length} deferred=${deferred.length} blocking=${blocking.length}`);
          [...polish, ...deferred, ...blocking].forEach(n => {
            console.log(`      key=${n.note_key || n.key || n.id} timing=${n.apply_timing || n.timing} title="${(n.title || n.description || '').substring(0, 80)}"`);
          });
        }
      });
    }
  }

  // 4. Let me now look at the dev-engine-v2 source code for character_bible pipeline
  // to understand where notes come from
  console.log("\n\n=== SEARCHING DEV ENGINE V2 FOR 'voice_samples' ===");
  // Read dev-engine-v2 source
  const devEngineContent = fs.readFileSync('/Users/laralane/code/iffy/supabase/functions/dev-engine-v2/index.ts', 'utf8');
  const lines = devEngineContent.split('\n');
  const voiceLines = lines.filter((l, i) => l.toLowerCase().includes('voice_sample') || l.toLowerCase().includes('voice samples'));
  console.log(`Found ${voiceLines.length} references to 'voice_sample' in dev-engine-v2:`);
  voiceLines.forEach(l => {
    const idx = lines.indexOf(l);
    console.log(`  Line ${idx+1}: ${l.substring(0, 150)}`);
  });

  // Also check for "note_key" related patterns
  const noteKeyLines = lines.filter((l, i) => l.includes('voice') && (l.includes('note_key') || l.includes('noteKey')));
  console.log(`\nFound ${noteKeyLines.length} 'voice' + note_key lines:`);
  noteKeyLines.forEach(l => {
    const idx = lines.indexOf(l);
    console.log(`  Line ${idx+1}: ${l.substring(0, 200)}`);
  });

  console.log("\n=== Also check the auto-run index ===");
  const autoRunContent = fs.readFileSync('/Users/laralane/code/iffy/supabase/functions/auto-run/index.ts', 'utf8');
  const autoLines = autoRunContent.split('\n');
  const voiceAuto = autoLines.filter((l, i) => l.toLowerCase().includes('voice'));
  console.log(`Found ${voiceAuto.length} voice references in auto-run:`);
  voiceAuto.forEach(l => {
    const idx = autoLines.indexOf(l);
    console.log(`  Line ${idx+1}: ${l.substring(0, 200)}`);
  });
}

main().catch(e => console.error(e));