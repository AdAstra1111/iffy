// Find which project was created from dev seed, and check its NEC
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = 'https://hdfderbphdobomkdjypc.supabase.co';
const loginTs = await Deno.readTextFile('/Users/laralane/code/iffy/api/auth/login.ts');
const srMatch = loginTs.match(/SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'/);
const SR_KEY = srMatch ? srMatch[1] : null;
const supabase = createClient(SUPABASE_URL, SR_KEY);

// 1. Get all dev seed projects
const { data: devSeeds } = await supabase.from('dev_seed_v2_projects').select('*');
console.log('=== Dev Seed v2 Projects ===');
console.log(JSON.stringify(devSeeds, null, 2));

// 2. Check which existing projects have foundation docs (beat_sheet, treatment, character_bible, story_outline, nec)
console.log('\n=== Projects with ANY docs ===');
const { data: docTypes } = await supabase
  .from('project_documents')
  .select('project_id, doc_type');

if (docTypes) {
  const grouped = {};
  for (const d of docTypes) {
    if (!grouped[d.project_id]) grouped[d.project_id] = [];
    grouped[d.project_id].push(d.doc_type);
  }
  for (const [pid, types] of Object.entries(grouped)) {
    console.log(`  ${pid}: [${types.join(', ')}]`);
  }
}

// 3. For projects with NEC but no Blackmail, check project content
console.log('\n=== NECs missing Blackmail ===');
const projectsWithNec = docTypes?.filter(d => d.doc_type === 'nec') || [];
for (const nd of projectsWithNec) {
  const { data: ver } = await supabase
    .from('project_document_versions')
    .select('id, plaintext, version_number, is_current')
    .eq('document_id', nd.id)
    .eq('is_current', true)
    .maybeSingle();
  
  if (!ver) continue;
  
  const hasBlackmail = /blackmail/i.test(ver.plaintext);
  
  if (!hasBlackmail) {
    // Check the project's other docs for blackmail content
    const { data: otherDocs } = await supabase
      .from('project_documents')
      .select('id, doc_type')
      .eq('project_id', nd.project_id)
      .neq('doc_type', 'nec');
    
    console.log(`\n  Project ${nd.project_id} — NEC missing Blackmail:`);
    console.log(`    NEC version ${ver.version_number}, is_current=${ver.is_current}`);
    
    let hasBlackmailInDocs = false;
    for (const od of otherDocs || []) {
      const { data: ov } = await supabase
        .from('project_document_versions')
        .select('plaintext')
        .eq('document_id', od.id)
        .eq('is_current', true)
        .maybeSingle();
      if (ov && /blackmail/i.test(ov.plaintext)) {
        hasBlackmailInDocs = true;
        console.log(`    BLACKMAIL FOUND in ${od.doc_type} (${od.id})`);
      }
    }
    
    if (!hasBlackmailInDocs) {
      console.log(`    No blackmail found in any foundation docs`);
    }
  }
}

// 4. Check YETI projects for dev seed link
console.log('\n=== Check all projects for blackmail-related content ===');
const { data: allProjects } = await supabase.from('projects').select('id, title, format, premise');
if (allProjects) {
  for (const p of allProjects) {
    const premise = (p.premise || '').toLowerCase();
    if (premise.includes('blackmail') || premise.includes('blackmailed') || premise.includes('extortion')) {
      console.log(`  BLACKMAIL PREMISE: ${p.id} — ${p.title} (${p.format})`);
    }
  }
}

// 5. Get the title of the orphaned dev seed project
console.log('\n=== Check for deleted project by ID ===');
const { data: delProj } = await supabase
  .from('projects')
  .select('id, title')
  .eq('id', '721f9035-703c-4a9d-b3c6-effa1a9f5922');
console.log(`Orphaned dev seed project exists in projects table: ${delProj?.length > 0 ? 'YES' : 'NO'}`);

// 6. Check if the orphaned project has docs
const { data: orphanDocs } = await supabase
  .from('project_documents')
  .select('id, doc_type')
  .eq('project_id', '721f9035-703c-4a9d-b3c6-effa1a9f5922');
console.log(`Orphaned project docs: ${orphanDocs?.length || 0}`);
if (orphanDocs && orphanDocs.length > 0) {
  for (const od of orphanDocs) {
    console.log(`  ${od.id}: ${od.doc_type}`);
  }
}