import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const anonKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const url = envContent.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
const srKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim();
const cleanUrl = url.replace(/^"|"$/g, '');
const cleanKey = srKey.replace(/^"|"$/g, '');

const sb = createClient(cleanUrl, cleanKey, { auth: { persistSession: false } });
const PID = '8614bec0-643f-4b83-afed-60cad67ac3d6';

async function main() {
  console.log('=== PROJECT DATA: 8614bec0 ===\n');

  // 1. Project details
  const { data: proj } = await sb.from('projects').select('id, title, format, pipeline_stage, lifecycle_stage, current_stage, created_at').eq('id', PID).single();
  console.log('PROJECT:', proj ? JSON.stringify(proj, null, 2) : '❌ Not found');

  // 2. Scenes
  const { data: scenes } = await sb.from('scene_graph_scenes').select('*').eq('project_id', PID).order('scene_key');
  console.log(`\nSCENES: ${scenes?.length || 0}`);
  if (scenes && scenes.length) {
    const withSlug = scenes.filter(s => s.slugline && s.slugline.trim()).length;
    const withAct = scenes.filter(s => s.act || s.provenance?.act).length;
    console.log(`  Sluglines: ${withSlug}/${scenes.length}`);
    console.log(`  Acts: ${withAct}/${scenes.length}`);
    console.log(`  Sample: ${scenes[0].scene_key} → slug="${(scenes[0].slugline || '').substring(0, 40)}" act=${scenes[0].act} provenance=${JSON.stringify(scenes[0].provenance).substring(0, 100)}`);
  }

  // 3. Entity links
  const { data: ents } = await sb.from('scene_entity_links').select('*').eq('project_id', PID).limit(2000);
  console.log(`\nENTITY LINKS: ${ents?.length || 0}`);
  if (ents && ents.length) {
    const uniqueEntities = new Set(ents.map(e => e.entity_id || e.entity_type || e.id));
    console.log(`  Unique entities: ${uniqueEntities.size}`);
    const types = {};
    ents.forEach(e => { types[e.entity_type] = (types[e.entity_type] || 0) + 1; });
    console.log(`  Entity types:`, JSON.stringify(types));
    
    // Scenes per entity
    const entityScenes = {};
    ents.forEach(e => {
      const eid = e.entity_id || e.entity_type || e.id;
      if (!entityScenes[eid]) entityScenes[eid] = new Set();
      entityScenes[eid].add(e.scene_id);
    });
    const topEntities = Object.entries(entityScenes).sort((a, b) => b[1].size - a[1].size).slice(0, 10);
    console.log(`\n  Top entities by scene appearance:`);
    topEntities.forEach(([eid, scenes]) => console.log(`    ${eid.substring(0, 30)}: ${scenes.size} scenes`));
    
    // Entity density per scene
    const sceneEntityCount = {};
    ents.forEach(e => {
      if (!sceneEntityCount[e.scene_id]) sceneEntityCount[e.scene_id] = new Set();
      sceneEntityCount[e.scene_id].add(e.entity_id || e.entity_type || e.id);
    });
    const densities = Object.values(sceneEntityCount).map(s => s.size);
    const avg = densities.reduce((a, b) => a + b, 0) / densities.length;
    const max = Math.max(...densities);
    const min = Math.min(...densities);
    console.log(`\n  Density: avg=${avg.toFixed(1)} entities/scene, max=${max}, min=${min}`);
  }

  // 4. Character entities
  const { data: chars } = await sb.from('character_entities').select('id, name, role, archetype').eq('project_id', PID).limit(50);
  console.log(`\nCHARACTERS: ${chars?.length || 0}`);
  if (chars && chars.length) chars.slice(0, 10).forEach(c => console.log(`  ${c.name}: ${c.role || '?'} ${c.archetype ? `(${c.archetype})` : ''}`));

  // 5. Scene order
  const { data: order } = await sb.from('scene_graph_order').select('*').eq('project_id', PID).order('sort_order');
  console.log(`\nSCENE ORDER: ${order?.length || 0}`);
  if (order && order.length) {
    const actCounts = {};
    order.forEach(o => {
      const a = o.act || o.assigned_lane || '?';
      actCounts[a] = (actCounts[a] || 0) + 1;
    });
    console.log('  Act distribution:', JSON.stringify(actCounts));
    console.log(`  Sample: ${order[0]?.scene_key || '?'} → act=${order[0]?.act}`);
  }

  // 6. Narrative units
  const { data: units } = await sb.from('narrative_units').select('id, unit_type, title, description, scene_ids, scene_refs').eq('project_id', PID).limit(100);
  console.log(`\nNARRATIVE UNITS: ${units?.length || 0}`);
  if (units && units.length) {
    const types = {};
    units.forEach(u => { types[u.unit_type] = (types[u.unit_type] || 0) + 1; });
    console.log('  Types:', JSON.stringify(types));
    units.slice(0, 5).forEach(u => console.log(`  ${u.unit_type}: ${(u.title || '').substring(0, 50)}`));
  }

  // 7. Document versions
  const { data: docs } = await sb.from('project_document_versions').select('id, document_type, format_type, version_number, document_name').eq('project_id', PID).order('version_number', { ascending: false }).limit(20);
  console.log(`\nDOCUMENTS: ${docs?.length || 0}`);
  if (docs && docs.length) {
    docs.forEach(d => console.log(`  ${d.document_type} (${d.format_type}) v${d.version_number} — ${d.document_name || ''}`));
  }

  // 8. Story spine
  const { data: spine } = await sb.from('story_spine_nodes').select('id, title, node_type, description').eq('project_id', PID).limit(50);
  console.log(`\nSPINE NODES: ${spine?.length || 0}`);
  if (spine && spine.length) {
    const types = {};
    spine.forEach(s => { types[s.node_type] = (types[s.node_type] || 0) + 1; });
    console.log('  Types:', JSON.stringify(types));
    spine.slice(0, 5).forEach(s => console.log(`  ${s.node_type}: ${(s.title || '').substring(0, 50)}`));
  }

  // 9. Blueprint bindings
  const { data: bp } = await sb.from('blueprint_bindings').select('id, binding_type, source_id, target_id').eq('project_id', PID).limit(50);
  console.log(`\nBLUEPRINT BINDINGS: ${bp?.length || 0}`);

  // 10. Intake runs
  const { data: intake } = await sb.from('intake_runs').select('id, status, scene_count, started_at, completed_at').eq('project_id', PID).order('started_at', { ascending: false }).limit(5);
  console.log(`\nINTAKE RUNS: ${intake?.length || 0}`);
  if (intake && intake.length) intake.forEach(r => console.log(`  ${r.id?.substring(0, 12)}... status=${r.status} scenes=${r.scene_count} ${r.completed_at ? '✅' : '🔄'}`));
}

main().catch(e => console.error('Fatal:', e));