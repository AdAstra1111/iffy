import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const anonKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const url = envContent.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();

// Service role key
const loginTs = fs.readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = loginTs.match(/SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : '';

const sb = createClient(url, srKey, { auth: { persistSession: false } });

const YETI_PROJECT = '1983a0ee-bf30-42d1-ae49-d8a272538993';
const ENKI_ID = '00f6e8fc-a0c7-4f51-8cfb-2a2383634a5e';
const SISTER_ID = '2e5c1176-aa8a-48d9-8946-b95889caac32';
const BOY_ID = 'b0c712f9-04bb-41b5-9373-153e0d062531';
const BROTHER_ID = '219b017d-bb25-4717-824c-ce571ca0bdff';

async function run() {
  console.log('=== PHASE 1: VALIDATION ===\n');

  // 1. Entity state
  console.log('--- Entity State ---');
  const { data: entities } = await sb
    .from('narrative_entities')
    .select('id, entity_key, canonical_name, status, created_at')
    .eq('project_id', YETI_PROJECT)
    .in('entity_key', ['char_enki', 'char_brother', 'char_boy', 'char_sister', 'char_girl']);
  
  for (const e of entities) {
    console.log(`  ${e.canonical_name} (key=${e.entity_key}, status=${e.status}, id=${e.id.substring(0,8)}...)`);
  }

  // 2. Scene entity links
  console.log('\n--- Scene Entity Links ---');
  const allIds = [ENKI_ID, SISTER_ID, BOY_ID, BROTHER_ID];
  const { data: links } = await sb
    .from('narrative_scene_entity_links')
    .select('entity_id, scene_id')
    .in('entity_id', allIds);
  
  const linkCounts = {};
  for (const l of (links || [])) linkCounts[l.entity_id] = (linkCounts[l.entity_id] || 0) + 1;
  for (const id of allIds) {
    console.log(`  ${id.substring(0,8)}...: ${linkCounts[id] || 0} links`);
    if (linkCounts[id] > 0) {
      const sample = (links || []).filter(l => l.entity_id === id).map(l => l.scene_id.substring(0,8)).join(', ');
      console.log(`    scene_ids: ${sample}`);
    }
  }

  // 3. Atoms
  console.log('\n--- Atoms ---');
  const { data: atoms } = await sb
    .from('atoms')
    .select('id, atom_key, entity_id, status')
    .in('entity_id', allIds);
  
  const atomCounts = {};
  for (const a of (atoms || [])) {
    atomCounts[a.entity_id] = (atomCounts[a.entity_id] || 0) + 1;
  }
  for (const id of allIds) {
    console.log(`  ${id.substring(0,8)}...: ${atomCounts[id] || 0} atoms`);
  }

  // 4. project_canon for YETI project specifically
  console.log('\n--- project_canon (YETI) ---');
  const { data: canons } = await sb
    .from('project_canon')
    .select('project_id, canon_json')
    .eq('project_id', YETI_PROJECT);
  
  for (const row of (canons || [])) {
    const chars = row.canon_json?.characters || [];
    console.log(`  Characters in canon_json: ${JSON.stringify(chars.map(c => c.name))}`);
    const entries = row.canon_json?.entries || row.canon_json?.story_entries || [];
    if (Array.isArray(entries)) {
      console.log(`  Entry count: ${entries.length}`);
    }
  }

  // 5. Check for Girl entity (might not exist)
  console.log('\n--- Girl entity check ---');
  const { data: girlEntities } = await sb
    .from('narrative_entities')
    .select('id, entity_key, canonical_name, status')
    .eq('project_id', YETI_PROJECT)
    .in('entity_key', ['char_girl']);
  console.log(`  Girl entities found: ${(girlEntities || []).length}`);

  // 6. Check all entities for YETI
  console.log('\n--- ALL narrative_entities for YETI ---');
  const { data: allEnts } = await sb
    .from('narrative_entities')
    .select('id, entity_key, canonical_name, status')
    .eq('project_id', YETI_PROJECT);
  console.log(`  Total entities: ${(allEnts || []).length}`);
  for (const e of (allEnts || [])) {
    console.log(`  ${e.canonical_name} (${e.entity_key}) [${e.status.substring(0,8)}]`);
  }

  console.log('\n=== PHASE 1 COMPLETE ===');
}

run().catch(e => console.error('FATAL:', e.message));
