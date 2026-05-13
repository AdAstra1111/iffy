// Check active projects with NECs missing Blackmail
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = 'https://hdfderbphdobomkdjypc.supabase.co';
const loginTs = await Deno.readTextFile('/Users/laralane/code/iffy/api/auth/login.ts');
const srMatch = loginTs.match(/SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'/);
const SR_KEY = srMatch ? srMatch[1] : null;
const supabase = createClient(SUPABASE_URL, SR_KEY);

const targets = [
  { pid: '9b641d7c-18e4-42ed-931a-d9956dcc57f2', title: 'Crimson Shadow' },
  { pid: '17c4ccc3-78ad-4fff-8564-35fed623be65', title: 'Quantum Cupid' },
];

for (const t of targets) {
  console.log(`\n=== ${t.title} (${t.pid}) ===`);
  
  const { data: proj } = await supabase.from('projects').select('*').eq('id', t.pid).maybeSingle();
  if (!proj) { console.log(`Project not found`); continue; }
  
  console.log(`Title: ${proj.title}`);
  console.log(`Format: ${proj.format}`);
  console.log(`Premise: ${(proj.premise || '').slice(0, 300)}`);
  console.log(`Premise has blackmail: ${/blackmail/i.test(proj.premise || '')}`);
  
  // Get the NEC document
  const { data: necDocs } = await supabase
    .from('project_documents')
    .select('id')
    .eq('project_id', t.pid)
    .eq('doc_type', 'nec');
  
  if (necDocs && necDocs.length > 0) {
    const necDoc = necDocs[0];
    const { data: ver } = await supabase
      .from('project_document_versions')
      .select('plaintext')
      .eq('document_id', necDoc.id)
      .eq('is_current', true)
      .maybeSingle();
    
    if (ver) {
      console.log(`\nNEC doc: ${necDoc.id}`);
      console.log(`NEC plaintext preview:`);
      console.log(ver.plaintext.slice(0, 1000));
      
      // Check ALL foundation docs for blackmail
      console.log(`\n--- Foundation docs blackmail check ---`);
      const { data: allDocs } = await supabase
        .from('project_documents')
        .select('id, doc_type')
        .eq('project_id', t.pid)
        .in('doc_type', ['beat_sheet', 'treatment', 'character_bible', 'story_outline']);
      
      for (const d of allDocs || []) {
        const { data: dv } = await supabase
          .from('project_document_versions')
          .select('plaintext')
          .eq('document_id', d.id)
          .eq('is_current', true)
          .maybeSingle();
        
        if (dv) {
          const hasBM = /blackmail/i.test(dv.plaintext);
          console.log(`  ${d.doc_type}: ${hasBM ? 'HAS BLACKMAIL' : 'no blackmail'} (${dv.plaintext.length} chars)`);
          
          if (hasBM) {
            const idx = dv.plaintext.toLowerCase().indexOf('blackmail');
            if (idx >= 0) {
              console.log(`    Context: "...${dv.plaintext.slice(Math.max(0, idx - 60), idx + 80)}..."`);
            }
          }
        }
      }
    }
  }
  
  // Check if this project was a dev seed
  const { data: devSeed } = await supabase
    .from('dev_seed_v2_projects')
    .select('*')
    .eq('project_id', t.pid);
  console.log(`\nIs dev seed project: ${devSeed && devSeed.length > 0 ? 'YES' : 'NO'}`);
}

// Also check which CURRENT projects have blackmail-relevant content via their premise
console.log(`\n=== All current projects with blackmail in premise ===`);
const { data: allProjs } = await supabase.from('projects').select('id, title, premise');
if (allProjs) {
  for (const p of allProjs) {
    if (p.premise && /blackmail/i.test(p.premise)) {
      console.log(`  ${p.id} — ${p.title}`);
      console.log(`    Premise: ${p.premise.slice(0, 200)}`);
    }
  }
}