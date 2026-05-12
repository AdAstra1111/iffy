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
  // 1. Check project_notes table MORE carefully - list all tables
  console.log("=== LIST ALL project_notes columns from a sample ===");
  const { data: allNotes } = await sb
    .from('project_notes')
    .select('*')
    .neq('id', '00000000-0000-0000-0000-000000000000')
    .limit(3);
  console.log("Type of allNotes:", typeof allNotes);
  console.log("Is array:", Array.isArray(allNotes));
  console.log("Length:", allNotes?.length);
  if (allNotes && allNotes.length > 0) {
    console.log("Columns:", Object.keys(allNotes[0]).join(', '));
    console.log("First record:", JSON.stringify(allNotes[0], null, 2));
  } else {
    console.log("No notes found - table may be empty or we don't have access");
    // Check what rows exist
    const { count } = await sb.from('project_notes').select('*', { count: 'exact', head: true });
    console.log("Total count:", count);
  }

  // 2. Search for notes by different column names
  const { data: notesByProj } = await sb
    .from('project_notes')
    .select('id, note_key, note_type, timing, category, priority, title, description, source, created_at, resolved_at')
    .eq('project_id', PID);
  console.log("\nBy project_id:", notesByProj?.length || 0);

  // 3. Check if it's a permissions issue by trying with the anon key
  const sbAnon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: notesAnon } = await sbAnon
    .from('project_notes')
    .select('id, note_key, title')
    .limit(3);
  console.log("\nNotes with anon key:", notesAnon?.length || 0, JSON.stringify(notesAnon));

  // 4. Check the dev-engine-v2 to see how notes are stored for character_bible
  console.log("\n=== Dev runs for the character_bible doc_id ===");
  const { data: cbRuns } = await sb
    .from('development_runs')
    .select('id, project_id, document_id, run_type, output_json, created_at, iteration_count')
    .eq('project_id', PID)
    .eq('document_id', DOC_ID)
    .limit(20);
  console.log("Count:", cbRuns?.length || 0);
  if (cbRuns && cbRuns.length > 0) {
    cbRuns.forEach(r => {
      const o = r.output_json || {};
      const notes = o.polish_notes || o.deferred_notes || o.blocking_issues || [];
      console.log(`  Run ${r.id.slice(0,8)}: type=${r.run_type} iters=${r.iteration_count} created=${r.created_at?.substring(0,19)}`);
      console.log(`    notes keys: polish=${o.polish_notes?.length || 0} deferred=${o.deferred_notes?.length || 0} blocking=${o.blocking_issues?.length || 0}`);
      if (o.polish_notes) o.polish_notes.forEach(n => {
        console.log(`      [polish] key=${n.note_key || n.key || n.id} title=${n.title?.substring(0,60)}`);
      });
      if (o.deferred_notes) o.deferred_notes.forEach(n => {
        console.log(`      [deferred] key=${n.note_key || n.key || n.id} timing=${n.apply_timing} title=${n.title?.substring(0,60)}`);
      });
      if (o.blocking_issues) o.blocking_issues.forEach(n => {
        console.log(`      [blocker] key=${n.note_key || n.key || n.id} title=${n.title?.substring(0,60)}`);
      });
    });
  }

  // 5. Get ALL dev runs for the project sorted to find the character_bible ones
  console.log("\n=== ALL DEV RUNS FOR PROJECT (all document_ids) ===");
  const { data: allDev } = await sb
    .from('development_runs')
    .select('id, document_id, run_type, output_json, created_at, iteration_count')
    .eq('project_id', PID)
    .order('created_at', { ascending: true })
    .limit(100);
  
  if (allDev) {
    const cbRuns2 = allDev.filter(r => r.document_id === DOC_ID);
    console.log(`Total runs: ${allDev.length}, CB-specific: ${cbRuns2.length}`);
    
    if (cbRuns2.length === 0) {
      // Find which docs the runs belong to
      const docIds = [...new Set(allDev.map(r => r.document_id))];
      console.log("Document IDs with dev runs:", docIds.map(d => d?.slice(0,8)));
      
      // All runs sorted
      cbRuns2.length = 0;
      allDev.forEach(r => {
        console.log(`  [${r.created_at?.substring(0,19)}] Run ${r.id.slice(0,8)}: doc=${(r.document_id||'').slice(0,8)} type=${r.run_type}`);
      });
    } else {
      cbRuns2.forEach(r => {
        const o = r.output_json || {};
        console.log(`  Run ${r.id.slice(0,8)}: type=${r.run_type} iters=${r.iteration_count} created=${r.created_at?.substring(0,19)}`);
        if (o.polish_notes) o.polish_notes.forEach(n => 
          console.log(`    [polish] key=${n.note_key || n.key || n.id}`)
        );
        if (o.deferred_notes) o.deferred_notes.forEach(n => 
          console.log(`    [deferred] key=${n.note_key || n.key || n.id}`)
        );
        if (o.blocking_issues) o.blocking_issues.forEach(n => 
          console.log(`    [blocker] key=${n.note_key || n.key || n.id}`)
        );
      });
    }
  }

  // 6. Check what documents the dev runs reference
  console.log("\n=== DOCUMENTS WITH DEV RUNS ===");
  const docIdsWithRuns = [...new Set((allDev || []).map(r => r.document_id))];
  if (docIdsWithRuns.length > 0) {
    const { data: runDocs } = await sb
      .from('project_documents')
      .select('id, doc_type, title')
      .in('id', docIdsWithRuns);
    console.log(JSON.stringify(runDocs?.map(d => ({id: d.id.slice(0,8), type: d.doc_type, title: d.title})), null, 2));
  }
}

main().catch(e => console.error(e));