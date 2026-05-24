const { readFileSync } = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.+?)"/)[1];
const srRaw = env.match(/SUPABASE_SERVICE_ROLE_KEY="(.+?)"/)[1];
const sb = createClient(url, srRaw, { auth: { persistSession: false } });

const pid = 'd4b992ad-603f-4599-848b-8275fc7584c4';

async function main() {
  // 1. Project info
  const { data: proj } = await sb.rpc('exec_sql', {
    query: "SELECT id, title, format, created_at, current_stage, pipeline_stage FROM public.projects WHERE id = '" + pid + "'"
  });
  console.log('=== PROJECT ===');
  console.log(JSON.stringify(proj, null, 2));

  // 2. All project_documents
  const { data: docs } = await sb.rpc('exec_sql', {
    query: "SELECT id, document_type, deliverable_type, current_version_id FROM public.project_documents WHERE project_id = '" + pid + "' ORDER BY created_at DESC"
  });
  console.log('\n=== PROJECT DOCUMENTS ===');
  if (docs) {
    console.log('Count: ' + docs.length);
    docs.forEach(function(d) {
      console.log(d.id.substring(0,8) + ' | doc_type: ' + (d.document_type || 'null') + ' | deliv: ' + (d.deliverable_type || 'null') + ' | ver: ' + (d.current_version_id || 'null'));
    });
  } else {
    console.log('No documents found (null)');
  }

  // 3. All doc versions (top 5)
  const { data: vers } = await sb.rpc('exec_sql', {
    query: "SELECT deliverable_type, COUNT(*)::text as cnt FROM public.project_document_versions WHERE project_id = '" + pid + "' GROUP BY deliverable_type ORDER BY cnt DESC"
  });
  console.log('\n=== DOC VERSION DELIVERABLE TYPES ===');
  if (vers) {
    vers.forEach(function(t) {
      console.log(t.deliverable_type + ' (' + t.cnt + ')');
    });
  } else {
    console.log('No versions found');
  }

  // 4. Development notes
  const { data: notes } = await sb.rpc('exec_sql', {
    query: "SELECT id, note_type, category, LEFT(content::text, 100) as content_preview, created_at, resolved FROM public.development_notes WHERE project_id = '" + pid + "' ORDER BY created_at DESC LIMIT 20"
  });
  console.log('\n=== DEVELOPMENT NOTES (last 20) ===');
  if (notes) {
    console.log('Count: ' + notes.length);
    notes.forEach(function(n) {
      console.log(n.id.substring(0,8) + ' | type: ' + (n.note_type || 'null') + ' | cat: ' + (n.category || 'null') + ' | resolved: ' + n.resolved + ' | ' + (n.content_preview || ''));
    });
  } else {
    console.log('No development notes found');
  }

  // 5. Project notes
  const { data: pnotes } = await sb.rpc('exec_sql', {
    query: "SELECT id, note_type, category, LEFT(content, 100) as preview, created_at, resolved FROM public.project_notes WHERE project_id = '" + pid + "' ORDER BY created_at DESC LIMIT 20"
  });
  console.log('\n=== PROJECT NOTES (last 20) ===');
  if (pnotes) {
    console.log('Count: ' + pnotes.length);
    pnotes.forEach(function(n) {
      console.log(n.id.substring(0,8) + ' | type: ' + (n.note_type || 'null') + ' | cat: ' + (n.category || 'null') + ' | resolved: ' + n.resolved + ' | ' + (n.preview || ''));
    });
  } else {
    console.log('No project notes found');
  }
  
  // 6. Note threads
  const { data: threads } = await sb.rpc('exec_sql', {
    query: "SELECT id, title, status, note_type, LEFT(content, 100) as preview, created_at FROM public.note_threads WHERE project_id = '" + pid + "' ORDER BY created_at DESC LIMIT 10"
  });
  console.log('\n=== NOTE THREADS ===');
  if (threads) {
    console.log('Count: ' + threads.length);
    threads.forEach(function(t) {
      console.log(t.id.substring(0,8) + ' | title: ' + (t.title || 'null') + ' | status: ' + (t.status || 'null') + ' | type: ' + (t.note_type || 'null') + ' | ' + (t.preview || ''));
    });
  } else {
    console.log('No note threads found');
  }

  // 7. Character atomiser results
  const { data: atoms } = await sb.rpc('exec_sql', {
    query: "SELECT id, entity_type, entity_value, status, confidence, category FROM public.atoms WHERE project_id = '" + pid + "' AND entity_type ILIKE '%character%' ORDER BY created_at DESC LIMIT 20"
  });
  console.log('\n=== CHARACTER ATOMS ===');
  if (atoms) {
    console.log('Count: ' + atoms.length);
    atoms.forEach(function(a) {
      console.log(a.id.substring(0,8) + ' | type: ' + (a.entity_type || 'null') + ' | val: ' + (a.entity_value || 'null') + ' | status: ' + (a.status || 'null') + ' | conf: ' + (a.confidence || 'null'));
    });
  } else {
    console.log('No character atoms found');
  }

  // 8. Character entities
  const { data: entities } = await sb.rpc('exec_sql', {
    query: "SELECT id, entity_type, name, role, status FROM public.narrative_entities WHERE project_id = '" + pid + "' ORDER BY created_at DESC LIMIT 20"
  });
  console.log('\n=== NARRATIVE ENTITIES ===');
  if (entities) {
    console.log('Count: ' + entities.length);
    entities.forEach(function(e) {
      console.log(e.id.substring(0,8) + ' | type: ' + (e.entity_type || 'null') + ' | name: ' + (e.name || 'null') + ' | role: ' + (e.role || 'null') + ' | status: ' + (e.status || 'null'));
    });
  } else {
    console.log('No narrative entities found');
  }
}
main().catch(function(e) { console.error('ERROR:', e.message); });