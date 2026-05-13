import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const anonKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const url = envContent.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();

const loginTs = fs.readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = loginTs.match(/SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : anonKey;

const sb = createClient(url, srKey, { auth: { persistSession: false } });

const PID = '1983a0ee-bf30-42d1-ae49-d8a272538993';

async function main() {
  // 1. Character bible versions
  const { data: docs } = await sb
    .from('project_documents')
    .select('id')
    .eq('project_id', PID)
    .eq('doc_type', 'character_bible');
  
  if (docs && docs.length > 0) {
    const docId = docs[0].id;
    console.log("Character bible doc ID:", docId);
    
    // Check the actual columns
    const { data: sample } = await sb
      .from('project_document_versions')
      .select('*')
      .eq('document_id', docId)
      .limit(1);
    
    if (sample && sample.length > 0) {
      console.log("Available columns:", Object.keys(sample[0]).join(', '));
    }
    
    // Try with proper columns
    const { data: versions } = await sb
      .from('project_document_versions')
      .select('id, version_number, ci_score, approval_status, is_current, created_at')
      .eq('document_id', docId)
      .order('version_number', { ascending: true });
    
    if (versions) {
      console.log(`Total versions: ${versions.length}`);
      for (const v of versions) {
        console.log(`  V${v.version_number} | ci=${v.ci_score} | approval=${v.approval_status} | current=${v.is_current} | ${(v.created_at||'').slice(0,19)}`);
      }
    }
  }
  
  // 2. Treatment versions
  const { data: treatDocs } = await sb
    .from('project_documents')
    .select('id')
    .eq('project_id', PID)
    .eq('doc_type', 'treatment');
  
  if (treatDocs && treatDocs.length > 0) {
    const { data: versions } = await sb
      .from('project_document_versions')
      .select('id, version_number, ci_score, approval_status, is_current, created_at')
      .eq('document_id', treatDocs[0].id)
      .order('version_number', { ascending: true });
    
    console.log(`\nTreatment (${treatDocs[0].id.slice(0,8)}):`);
    if (versions) {
      for (const v of versions) {
        console.log(`  V${v.version_number} | ci=${v.ci_score} | approval=${v.approval_status} | current=${v.is_current} | ${(v.created_at||'').slice(0,19)}`);
      }
    }
  }
  
  // 3. Concept brief versions
  const { data: cbDocs } = await sb
    .from('project_documents')
    .select('id')
    .eq('project_id', PID)
    .eq('doc_type', 'concept_brief');
  
  if (cbDocs && cbDocs.length > 0) {
    const { data: versions } = await sb
      .from('project_document_versions')
      .select('id, version_number, ci_score, approval_status, is_current, created_at')
      .eq('document_id', cbDocs[0].id)
      .order('version_number', { ascending: true });
    
    console.log(`\nConcept brief (${cbDocs[0].id.slice(0,8)}):`);
    if (versions) {
      for (const v of versions) {
        console.log(`  V${v.version_number} | ci=${v.ci_score} | approval=${v.approval_status} | current=${v.is_current} | ${(v.created_at||'').slice(0,19)}`);
      }
    }
  }
  
  // 4. Idea versions
  const { data: ideaDocs } = await sb
    .from('project_documents')
    .select('id')
    .eq('project_id', PID)
    .eq('doc_type', 'idea');
  
  if (ideaDocs && ideaDocs.length > 0) {
    const { data: versions } = await sb
      .from('project_document_versions')
      .select('id, version_number, ci_score, approval_status, is_current, created_at')
      .eq('document_id', ideaDocs[0].id)
      .order('version_number', { ascending: true });
    
    console.log(`\nIdea (${ideaDocs[0].id.slice(0,8)}):`);
    if (versions) {
      for (const v of versions) {
        console.log(`  V${v.version_number} | ci=${v.ci_score} | approval=${v.approval_status} | current=${v.is_current} | ${(v.created_at||'').slice(0,19)}`);
      }
    }
  }
}

main().catch(e => console.error(e));