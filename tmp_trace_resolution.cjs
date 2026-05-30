const { createClient } = require('@supabase/supabase-js');

async function main() {
  const env = require('fs').readFileSync('/Users/laralane/code/iffy/.env.local','utf8');
  const srk = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim().replace(/"/g,'');
  const supabase = createClient('https://hdfderbphdobomkdjypc.supabase.co', srk);
  const pid = 'b6ae36fb-805b-4ff5-84ba-91fbccd46334';

  // 1. Get ALL upstream docs for feature_script
  const upstreamTypes = ['beat_sheet', 'character_bible', 'treatment', 'story_outline'];
  const { data: docs } = await supabase.from('project_documents')
    .select('id, doc_type, latest_version_id')
    .eq('project_id', pid)
    .in('doc_type', upstreamTypes);
  
  console.log('=== UPSTREAM DOCS ===');
  for (const d of docs || []) {
    console.log(d.doc_type, '| doc_id:', d.id.slice(0,8), '| latest_version_id:', (d.latest_version_id || 'NULL').slice(0,8));
  }

  // 2. Get ALL versions for these docs
  const docIds = (docs || []).map(d => d.id);
  const { data: versions } = await supabase.from('project_document_versions')
    .select('id, document_id, version_number, approval_status, is_current, status, plaintext')
    .in('document_id', docIds)
    .order('version_number', { ascending: false });

  console.log('\n=== ALL VERSIONS ===');
  for (const v of versions || []) {
    const doc = (docs || []).find(d => d.id === v.document_id);
    const docType = doc ? doc.doc_type : '?';
    const ptLen = (v.plaintext || '').length;
    console.log(docType.padEnd(18), 'v' + v.version_number,
      '| status:', (v.status || '?').padEnd(8),
      '| approval:', v.approval_status || 'null',
      '| current:', v.is_current,
      '| plaintext:', ptLen + ' chars',
      '| id:', v.id.slice(0,8));
  }

  // 3. For beat_sheet specifically: check which version latest_version_id points to
  const beatDoc = (docs || []).find(d => d.doc_type === 'beat_sheet');
  if (beatDoc) {
    console.log('\n=== BEAT SHEET RESOLUTION ===');
    const candidates = (versions || []).filter(v => v.document_id === beatDoc.id);
    console.log('Candidates:', candidates.length);
    
    // Step through the selection chain
    const step2 = candidates.find(v => v.approval_status === 'approved' && v.is_current === true);
    console.log('Step 2 (approved+current):', step2 ? step2.id.slice(0,8) + ' pt=' + (step2.plaintext||'').length : 'NONE');
    
    const step3 = candidates.find(v => v.approval_status === 'approved');
    console.log('Step 3 (any approved):', step3 ? step3.id.slice(0,8) + ' pt=' + (step3.plaintext||'').length : 'NONE');
    
    const step4 = beatDoc.latest_version_id 
      ? candidates.find(v => v.id === beatDoc.latest_version_id)
      : null;
    console.log('Step 4 (latest_version_id):', beatDoc.latest_version_id ? (step4 ? step4.id.slice(0,8) + ' pt=' + (step4.plaintext||'').length : 'NOT FOUND in candidates') : 'latest_version_id is NULL');
    if (step4) {
      const pt = step4.plaintext || '';
      console.log('  plaintext length:', pt.length);
      console.log('  !pt:', !pt, '| pt.trim().length:', pt.trim().length, '| < 200:', pt.trim().length < 200);
    }
    
    // Fallback: longest version
    const fallback = candidates.reduce((best, v) => {
      if (!v.plaintext || v.plaintext.trim().length < 200) return best;
      if (!best || v.plaintext.length > best.plaintext.length) return v;
      return best;
    }, null);
    console.log('Fallback (longest):', fallback ? (fallback.id.slice(0,8) + ' pt=' + (fallback.plaintext||'').length) : 'NONE');
    
    // Check if any candidate has usable text at all
    const withText = candidates.filter(v => v.plaintext && v.plaintext.trim().length >= 200);
    console.log('Candidates with 200+ chars:', withText.length);
    for (const v of withText) {
      console.log('  v' + v.version_number, 'approval:', v.approval_status || 'null', 'current:', v.is_current, 'pt:', (v.plaintext||'').length);
    }
  }
}
main();
