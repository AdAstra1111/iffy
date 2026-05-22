import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.+)/)[1].replace(/\"/g,'').trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/\"/g,'').trim();
const sb = createClient(url, key, { auth: { persistSession: false } });
const pid = '9404a383-5cdc-4f06-92aa-2ca70973c556';

async function main() {
  // 1. Scenes
  const { data: scenes } = await sb.from('scene_graph_scenes').select('*').eq('project_id', pid).limit(200);
  const withSlug = (scenes||[]).filter(s => s.slugline && s.slugline.trim());
  console.log('=== SCENES ===');
  console.log('Total:', scenes?.length || 0);
  console.log('Sluglines on scenes table:', withSlug.length + '/' + (scenes?.length || 0));
  if (withSlug.length > 0) {
    withSlug.slice(0, 5).forEach(s => console.log('  ' + s.scene_key + ': "' + s.slugline.substring(0, 60) + '"'));
  }
  
  // 2. Entity links
  const { data: ents } = await sb.from('narrative_scene_entity_links').select('*').eq('project_id', pid).limit(5000);
  const entityIds = [...new Set((ents||[]).map(e => e.entity_id))];
  console.log('\n=== ENTITIES ===');
  console.log('Entity links:', ents?.length || 0);
  console.log('Unique entities:', entityIds.length);
  
  // 3. Narrative units (check reverse engineering completed)
  const { data: nu } = await sb.from('narrative_units').select('*').eq('project_id', pid).limit(100);
  const revJob = (nu||[]).find(u => u.unit_type === 'async_job');
  if (revJob && revJob.payload_json?.result?.documents_created) {
    console.log('\n=== REVERSE ENGINEERING ===');
    console.log('Docs created:', revJob.payload_json.result.documents_created.join(', '));
    const stages = revJob.payload_json.stages || {};
    const allDone = Object.values(stages).every(s => s.status === 'done');
    console.log('All stages done:', allDone ? '✅ YES' : '❌ NO');
    if (!allDone) {
      Object.entries(stages).filter(([_, s]) => s.status !== 'done').forEach(([k, s]) => console.log('  ⏳ ' + k + ': ' + s.status));
    }
  }
  
  // 4. Documents via project_documents + versions
  const { data: dv } = await sb.from('project_document_versions').select('id, document_id, version_number, status, approval_status, is_current').limit(500);
  const { data: docs } = await sb.from('project_documents').select('*').eq('project_id', pid).limit(50);
  
  if (docs) {
    console.log('\n=== DOCUMENTS (' + docs.length + ') ===');
    docs.forEach(d => {
      const versions = (dv||[]).filter(v => v.document_id === d.id);
      const latest = versions.sort((a,b) => b.version_number - a.version_number)[0];
      const docType = d.document_type || d.doc_role || d.display_name || '(unknown)';
      console.log('  ' + docType + ' v' + (latest?.version_number||'?') + ' status=' + (latest?.status||'?') + ' current=' + (latest?.is_current||false));
    });
  }
  
  // 5. Scene order
  const { data: order } = await sb.from('scene_graph_order').select('*').eq('project_id', pid).order('sort_order').limit(200);
  console.log('\n=== SCENE ORDER ===');
  console.log('Entries:', order?.length || 0);
  if (order && order.length) {
    const acts = {};
    order.forEach(o => { const a = o.act || '?'; acts[a] = (acts[a]||0)+1; });
    console.log('Act distribution:', JSON.stringify(acts));
  }

  // 6. scene_graph_versions (verify sluglines in versions too)
  const { data: sgs } = await sb.from('scene_graph_versions').select('id, scene_key, slugline').eq('project_id', pid).limit(10);
  console.log('\n=== SCENE VERSIONS (sample) ===');
  if (sgs && sgs.length) sgs.slice(0, 5).forEach(v => console.log('  ' + v.scene_key + ': "' + (v.slugline||'').substring(0, 60) + '"'));

  // Summary
  console.log('\n=== VERDICT ===');
  const slugOK = withSlug.length > 0;
  const entsOK = (ents?.length || 0) > 0;
  const revOK = revJob?.payload_json?.stages && Object.values(revJob.payload_json.stages).every(s => s.status === 'done');
  const docsOK = (docs?.length || 0) > 0;
  const orderOK = (order?.length || 0) > 0;
  
  console.log('Sluglines on scenes:', slugOK ? '✅' : '❌');
  console.log('Entity extraction:', entsOK ? '✅' : '❌');
  console.log('Reverse engineering:', revOK ? '✅' : '❌');
  console.log('Documents generated:', docsOK ? '✅' : '❌');
  console.log('Scene order:', orderOK ? '✅' : '❌');
  console.log('');
  console.log(slugOK && entsOK && revOK && docsOK && orderOK ? '✅ EVERYTHING PRESENT — pipeline is fully operational' : '❌ SOMETHING MISSING');
}

main().catch(e => console.error('Fatal:', e));