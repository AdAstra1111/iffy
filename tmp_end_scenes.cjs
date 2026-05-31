const { createClient } = require('@supabase/supabase-js');
async function main() {
  const env = require('fs').readFileSync('/Users/laralane/code/iffy/.env/local','utf8');
    for line in f:
        if 'SUPABASE_SERVICE_ROLE_KEY' in line:
            srk = line.split('=', 1)[1].strip().strip('"').strip("'")
            break
  const supabase = createClient('https://hdfderbphdobomkdjypc.supabase.co', srk);
  const pid = 'b6ae36fb-805b-4ff5-84ba-91fbccd46334';
  const { data: doc } = await supabase.from('project_documents').select('id, latest_version_id').eq('project_id', pid).eq('doc_type', 'feature_script').single();
  const { data: v } = await supabase.from('project_document_versions').select('plaintext').eq('id', doc.latest_version_id).single();
  const pt = v.plaintext || '';

  // Print the final 3 scenes (for climax evaluation)
  const parts = pt.split(/\n(?=INT\.|EXT\.)/);
  const last = parts.slice(-5);
  for (const s of last) {
    console.log(s.substring(0, 600));
    console.log('---END SCENE---');
  }
}
main();
