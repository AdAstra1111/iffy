// Check which NEC documents are missing "Blackmail" in their Tension Source Matrix
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = 'https://hdfderbphdobomkdjypc.supabase.co';

// Read the service role key from api/auth/login.ts
const loginTs = await Deno.readTextFile('/Users/laralane/code/iffy/api/auth/login.ts');
const srMatch = loginTs.match(/SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'/);
const SR_KEY = srMatch ? srMatch[1] : null;

if (!SR_KEY) {
  console.error('Could not extract service role key');
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SR_KEY);

console.log('=== Step 1: Find all existing projects ===');
const { data: projects, error: pErr } = await supabase
  .from('projects')
  .select('id, title')
  .order('created_at', { ascending: false });

if (pErr) { console.error('Projects query failed:', pErr); Deno.exit(1); }
console.log(`Found ${projects.length} projects`);
projects.forEach(p => console.log(`  ${p.id} — ${p.title}`));

console.log('\n=== Step 2: Find NEC documents for existing projects ===');
const projectIds = projects.map(p => p.id);
const { data: necDocs, error: ndErr } = await supabase
  .from('project_documents')
  .select('id, project_id, doc_type')
  .eq('doc_type', 'nec')
  .in('project_id', projectIds);

if (ndErr) { console.error('NEC docs query failed:', ndErr); Deno.exit(1); }
console.log(`Found ${necDocs.length} NEC documents for existing projects`);
necDocs.forEach(d => {
  const proj = projects.find(p => p.id === d.project_id);
  console.log(`  ${d.id} — project: ${proj?.title || d.project_id}`);
});

if (necDocs.length === 0) {
  console.log('\n=== No NEC docs for existing projects. Checking all NEC docs... ===');
  const { data: allNec, error: anErr } = await supabase
    .from('project_documents')
    .select('id, project_id, doc_type')
    .eq('doc_type', 'nec');

  if (anErr) { console.error('All NEC query failed:', anErr); Deno.exit(1); }
  console.log(`Found ${allNec.length} total NEC documents in DB`);
  
  for (const doc of allNec) {
    const { data: ver } = await supabase
      .from('project_document_versions')
      .select('id, plaintext')
      .eq('document_id', doc.id)
      .eq('is_current', true)
      .maybeSingle();
    
    if (ver) {
      const hasBlackmail = /blackmail/i.test(ver.plaintext);
      const hasTSM = /tension\s+source\s+matrix/i.test(ver.plaintext);
      console.log(`  Doc ${doc.id} (project: ${doc.project_id}): TSM=${hasTSM}, Blackmail=${hasBlackmail}, preview='${ver.plaintext.slice(0, 120).replace(/\n/g, ' ')}'`);
    }
  }
  
  // Also check dev_seed_v2_projects for the ORPHANED project
  console.log('\n=== Step 3: Check dev_seed_v2_projects ===');
  const { data: devSeeds } = await supabase
    .from('dev_seed_v2_projects')
    .select('*');
  console.log('dev_seed_v2_projects:', JSON.stringify(devSeeds, null, 2));
  
  // Check if the orphaned project has any NEC
  if (devSeeds && devSeeds.length > 0) {
    for (const ds of devSeeds) {
      const { data: orphanDocs } = await supabase
        .from('project_documents')
        .select('id, doc_type')
        .eq('project_id', ds.project_id);
      console.log(`  Orphaned project ${ds.project_id}: ${orphanDocs?.length || 0} docs`);
      if (orphanDocs && orphanDocs.length > 0) {
        for (const od of orphanDocs) {
          const { data: ov } = await supabase
            .from('project_document_versions')
            .select('id, plaintext, is_current')
            .eq('document_id', od.id)
            .maybeSingle();
          if (ov) {
            console.log(`    Doc ${od.id} (${od.doc_type}): is_current=${ov.is_current}, hasBlackmail=${/blackmail/i.test(ov.plaintext)}`);
            console.log(`    Preview: ${ov.plaintext.slice(0, 200).replace(/\n/g, ' ')}`);
          }
        }
      }
    }
  }
} else {
  console.log('\n=== Step 3: Check current NEC versions for TSM content ===');
  for (const doc of necDocs) {
    const { data: ver, error: vErr } = await supabase
      .from('project_document_versions')
      .select('id, version_number, plaintext')
      .eq('document_id', doc.id)
      .eq('is_current', true)
      .maybeSingle();
    
    if (ver) {
      const hasTSM = /tension\s+source\s+matrix/i.test(ver.plaintext);
      const hasBlackmail = /blackmail/i.test(ver.plaintext);
      const proj = projects.find(p => p.id === doc.project_id);
      console.log(`  ${proj?.title || doc.project_id} — ${doc.id} v${ver.version_number}:`);
      console.log(`    TSM present: ${hasTSM}, Blackmail present: ${hasBlackmail}`);
      
      // Find TSM section
      const tsmMatch = ver.plaintext.match(/tension\s+source\s+matrix[;:\s]+(.+?)(?:\n|$)/i);
      if (tsmMatch) {
        console.log(`    TSM value: "${tsmMatch[1].trim()}"`);
      } else {
        const tsmLine = ver.plaintext.split('\n').find(l => /tension\s+source/i.test(l));
        console.log(`    TSM line: "${tsmLine || 'NOT FOUND'}"`);
      }
    }
  }
}