const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const url = 'https://hdfderbphdobomkdjypc.supabase.co';
const loginTs = fs.readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = loginTs.match(/SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : '';

const client = createClient(url, srKey, { auth: { persistSession: false } });

async function run() {
  const projectId = '1983a0ee-bf30-42d1-ae49-d8a272538993';
  const docId = '795c377f-25a6-4a6f-83e2-b5210b3703ab';
  
  // Get the latest version
  const { data: versions } = await client
    .from('project_document_versions')
    .select('id, version_number, approval_status, status')
    .eq('document_id', docId)
    .order('version_number', { ascending: false })
    .limit(3);
  
  const latestVer = versions?.[0];
  console.log('Latest version:', JSON.stringify(latestVer, null, 2));
  
  // Create an approved note for character consolidation
  const notePayload = {
    project_id: projectId,
    source: 'system',
    doc_type: 'character_bible',
    document_id: docId,
    version_id: latestVer?.id,
    category: 'story',
    severity: 'high',
    timing: 'now',
    status: 'approved',
    title: 'Consolidate duplicate characters: Brother and Boy are Enki',
    summary: `The characters Brother and Boy have been consolidated into Enki. Remove Brother and Boy sections from the Character Bible and merge their character content into Enki's profile. Enki now encompasses the role of the lone survivor in the 12,000 BCE prologue. Update Enki's section to reflect that he is the sole character representing the ancient encounter with the Yeti.`,
    detail: `Entity consolidation complete: Brother and Boy entities have been marked as 'stale' and their names are now aliases for Enki. The Character Bible needs to reflect this consolidation by: 1) Removing the Brother section (13) and Boy section (15), 2) Expanding Enki's section (17) to incorporate their narrative roles (the lone survivor and the innocent witness), 3) Updating the character count and section numbering accordingly. Sister remains as-is.`,
  };
  
  const { data: note, error: noteErr } = await client
    .from('project_notes')
    .insert(notePayload)
    .select()
    .single();
  
  if (noteErr) {
    console.error('NOTE_CREATE_ERROR:', noteErr.message);
  } else {
    console.log('NOTE_CREATED:', note.id);
  }
  
  // Invoke dev-engine-v2 rewrite with the synthetic note
  console.log('\nInvoking dev-engine-v2 rewrite...');
  
  const invokeResponse = await fetch(
    `${url}/functions/v1/dev-engine-v2`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${srKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'rewrite',
        projectId,
        documentId: docId,
        versionId: latestVer?.id,
        deliverableType: 'character_bible',
        approvedNotes: [{
          id: note?.id || 'synthetic',
          note: 'Consolidate Brother and Boy into Enki. Remove Brother and Boy sections from the Character Bible and merge their content into Enki. Sister remains as-is.',
          title: 'Consolidate duplicate characters: Brother and Boy are Enki',
          summary: 'Consolidate duplicate characters: Brother and Boy are Enki',
          note_key: 'consolidate_brother_boy_into_enki',
        }],
      }),
    }
  );
  
  const result = await invokeResponse.text();
  console.log('INVOKE_STATUS:', invokeResponse.status);
  console.log('INVOKE_RESULT:', result.substring(0, 1000));
}

run().catch(e => console.error('FATAL:', e));
