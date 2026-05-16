import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const anonKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const url = envContent.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();

const loginTs = fs.readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = loginTs.match(/SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : anonKey;

const sb = createClient(url, srKey, { auth: { persistSession: false } });

const PROJECT_ID = '1983a0ee-bf30-42d1-ae49-d8a272538993';

async function main() {
  // First, let's discover the actual schema by running raw SQL queries
  console.log("=== SCHEMA DISCOVERY ===\n");

  // Query what columns exist on project_document_versions
  let { data, error } = await sb.rpc('exec_sql', {
    query: `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='project_document_versions' ORDER BY ordinal_position`
  });
  if (error) {
    console.log("RPC not available, using SDQL reflection instead");
    // Try a select with limit 1 and see what we get back
    const { data: sample } = await sb.from('project_document_versions').select('*').limit(1);
    if (sample && sample.length > 0) {
      console.log("project_document_versions columns:", Object.keys(sample[0]).join(', '));
      console.log("Sample row:", JSON.stringify(sample[0], null, 2));
    } else {
      console.log("Empty or error:", sample);
    }
  } else {
    console.log("project_document_versions:", data);
  }

  // project_notes
  const { data: noteSample } = await sb.from('project_notes').select('*').limit(1);
  if (noteSample && noteSample.length > 0) {
    console.log("\nproject_notes columns:", Object.keys(noteSample[0]).join(', '));
    console.log("Sample row:", JSON.stringify(noteSample[0], null, 2));
  }

  // development_runs
  const { data: devSample } = await sb.from('development_runs').select('*').limit(1);
  if (devSample && devSample.length > 0) {
    console.log("\ndevelopment_runs columns:", Object.keys(devSample[0]).join(', '));
    console.log("Sample row:", JSON.stringify(devSample[0], null, 2));
  }

  // project_documents
  const { data: docSample } = await sb.from('project_documents').select('*').limit(1);
  if (docSample && docSample.length > 0) {
    console.log("\nproject_documents columns:", Object.keys(docSample[0]).join(', '));
    console.log("Sample row:", JSON.stringify(docSample[0], null, 2));
  }

  // auto_run_jobs
  const { data: arjSample } = await sb.from('auto_run_jobs').select('*').limit(1);
  if (arjSample && arjSample.length > 0) {
    console.log("\nauto_run_jobs columns:", Object.keys(arjSample[0]).join(', '));
    console.log("Sample row:", JSON.stringify(arjSample[0], null, 2));
  }

  // auto_run_steps
  const { data: arsSample } = await sb.from('auto_run_steps').select('*').limit(1);
  if (arsSample && arsSample.length > 0) {
    console.log("\nauto_run_steps columns:", Object.keys(arsSample[0]).join(', '));
    console.log("Sample row:", JSON.stringify(arsSample[0], null, 2));
  }
}

main().catch(e => console.error(e));
