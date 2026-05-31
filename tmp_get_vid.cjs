const { createClient } = require('@supabase/supabase-js');
async function main() {
  const env = require('fs').readFileSync('/Users/laralane/code/iffy/.env.local','utf8');
  const srk = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim().replace(/"/g,'');
  const supabase = createClient('https://hdfderbphdobomkdjypc.supabase.co', srk);
  const pid = 'b6ae36fb-805b-4ff5-84ba-91fbccd46334';
  const { data: doc } = await supabase.from('project_documents').select('id, latest_version_id').eq('project_id', pid).eq('doc_type', 'feature_script').single();
  console.log(doc.latest_version_id);
}
main();
