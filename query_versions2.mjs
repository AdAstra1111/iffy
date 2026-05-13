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
  // Debug: check character_bible versions directly
  const docId = '795c377f-25a6-4a6f-83e2-b5210b3703ab';
  
  const { data: versions, error: vErr } = await sb
    .from('project_document_versions')
    .select('id, version_number, ci_score, approval_status, is_current, created_at')
    .eq('document_id', docId)
    .order('version_number', { ascending: true });
  
  if (vErr) {
    console.log("SELECT ERR:", vErr.message);
  } else {
    console.log(`Character bible: ${versions.length} versions`);
    for (const v of versions) {
      console.log(`  V${v.version_number} | ci=${v.ci_score} | approval=${v.approval_status} | current=${v.is_current} | ${(v.created_at||'').slice(0,19)}`);
    }
  }
  
  // Concept brief
  const { data: cbDocs } = await sb
    .from('project_documents')
    .select('id')
    .eq('project_id', PID)
    .eq('doc_type', 'concept_brief');
  
  if (cbDocs && cbDocs.length > 0) {
    console.log(`\nConcept brief doc: ${cbDocs[0].id}`);
    const { data: versions } = await sb
      .from('project_document_versions')
      .select('id, version_number, ci_score, approval_status, is_current, created_at')
      .eq('document_id', cbDocs[0].id)
      .order('version_number', { ascending: true });
    
    if (versions) {
      console.log(`  ${versions.length} versions`);
      for (const v of versions) {
        console.log(`  V${v.version_number} | ci=${v.ci_score} | approval=${v.approval_status} | current=${v.is_current} | ${(v.created_at||'').slice(0,19)}`);
      }
    }
  }
  
  // Treatment
  const { data: tDocs } = await sb
    .from('project_documents')
    .select('id')
    .eq('project_id', PID)
    .eq('doc_type', 'treatment');
  
  if (tDocs && tDocs.length > 0) {
    console.log(`\nTreatment doc: ${tDocs[0].id}`);
    const { data: versions } = await sb
      .from('project_document_versions')
      .select('id, version_number, ci_score, approval_status, is_current, created_at')
      .eq('document_id', tDocs[0].id)
      .order('version_number', { ascending: true });
    
    if (versions) {
      console.log(`  ${versions.length} versions`);
      for (const v of versions) {
        console.log(`  V${v.version_number} | ci=${v.ci_score} | approval=${v.approval_status} | current=${v.is_current} | ${(v.created_at||'').slice(0,19)}`);
      }
    }
  }
  
  // Idea
  const { data: iDocs } = await sb
    .from('project_documents')
    .select('id')
    .eq('project_id', PID)
    .eq('doc_type', 'idea');
  
  if (iDocs && iDocs.length > 0) {
    console.log(`\nIdea doc: ${iDocs[0].id}`);
    const { data: versions } = await sb
      .from('project_document_versions')
      .select('id, version_number, ci_score, approval_status, is_current, created_at')
      .eq('document_id', iDocs[0].id)
      .order('version_number', { ascending: true });
    
    if (versions) {
      console.log(`  ${versions.length} versions`);
      for (const v of versions) {
        console.log(`  V${v.version_number} | ci=${v.ci_score} | approval=${v.approval_status} | current=${v.is_current} | ${(v.created_at||'').slice(0,19)}`);
      }
    }
  }
}

main().catch(e => console.error(e));