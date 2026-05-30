const { createClient } = require('@supabase/supabase-js');

async function main() {
  const env = require('fs').readFileSync('/Users/laralane/code/iffy/.env.local','utf8');
  const srk = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim().replace(/"/g,'');
  const supabase = createClient('https://hdfderbphdobomkdjypc.supabase.co', srk);
  const pid = 'b6ae36fb-805b-4ff5-84ba-91fbccd46334';

  // Check documents
  const { data: docs } = await supabase.from('project_documents').select('id, doc_type, status').eq('project_id', pid);
  console.log('=== Documents ===');
  if (docs) for (const d of docs) {
    const { data: vers } = await supabase.from('project_document_versions')
      .select('id, version_number, status')
      .eq('document_id', d.id)
      .order('version_number', { ascending: false })
      .limit(1);
    const v = vers && vers[0];
    console.log(`${d.doc_type.padEnd(20)} | ${d.status.padEnd(10)} | v${v ? v.version_number : '?'} id=${v ? v.id.slice(0,8) : 'none'}`);
  }

  console.log('\n=== Generating beat_sheet ===');
  // Generate beat_sheet - should auto-resolve dependencies
  const { data, error } = await supabase.functions.invoke('generate-document', {
    body: { projectId: pid, docType: 'beat_sheet', mode: 'draft' }
  });
  
  if (error) {
    const ctx = error.context || {};
    console.log('Error:', error.message);
    if (ctx.data) console.log('Body:', JSON.stringify(ctx.data).slice(0,500));
  } else {
    console.log('Result:', JSON.stringify(data).slice(0,500));
  }
}
main();
