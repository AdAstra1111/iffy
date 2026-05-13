// Proper NEC audit — get document IDs and check TSM for Blackmail
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = 'https://hdfderbphdobomkdjypc.supabase.co';
const loginTs = await Deno.readTextFile('/Users/laralane/code/iffy/api/auth/login.ts');
const srMatch = loginTs.match(/SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'/);
const SR_KEY = srMatch ? srMatch[1] : null;
const supabase = createClient(SUPABASE_URL, SR_KEY);

// Get ALL NEC documents with their IDs
const { data: necDocs } = await supabase
  .from('project_documents')
  .select('id, project_id')
  .eq('doc_type', 'nec');

console.log(`Found ${necDocs?.length || 0} total NEC documents`);

let blackmailCount = 0;
let noBlackmailCount = 0;

for (const doc of necDocs || []) {
  // Get current version
  const { data: ver } = await supabase
    .from('project_document_versions')
    .select('id, version_number, plaintext')
    .eq('document_id', doc.id)
    .eq('is_current', true)
    .maybeSingle();
  
  if (!ver) {
    continue;
  }
  
  const hasBlackmail = /blackmail/i.test(ver.plaintext);
  const hasTSM = /tension\s+source\s+matrix/i.test(ver.plaintext);
  
  // Get project title
  const { data: proj } = await supabase
    .from('projects')
    .select('title')
    .eq('id', doc.project_id)
    .maybeSingle();
  
  const title = proj?.title || '(deleted project)';
  
  // Find TSM value
  let tsm = '(not found)';
  const tsmMatch = ver.plaintext.match(/tension\s+source\s+matrix[;:\s]+(.+?)(?:\n|$)/i);
  if (tsmMatch) {
    tsm = tsmMatch[1].trim().slice(0, 150);
  }
  
  const label = `${title} (${doc.project_id.slice(0, 8)}...) — doc ${doc.id.slice(0, 8)}... v${ver.version_number}`;
  
  if (hasBlackmail) {
    blackmailCount++;
  } else {
    noBlackmailCount++;
    console.log(`\n[MISSING BLACKMAIL] ${label}`);
    console.log(`  TSM present: ${hasTSM}, TSM: "${tsm}"`);
    
    // Check premise for blackmail
    const { data: premProj } = await supabase
      .from('projects')
      .select('premise')
      .eq('id', doc.project_id)
      .maybeSingle();
    if (premProj?.premise) {
      console.log(`  Premise has blackmail: ${/blackmail/i.test(premProj.premise)}`);
      if (/blackmail/i.test(premProj.premise)) {
        console.log(`  Premise excerpt: "${premProj.premise.slice(0, 200)}"`);
      }
    }
  }
}

console.log(`\n\nSummary: ${blackmailCount} have Blackmail, ${noBlackmailCount} missing Blackmail`);