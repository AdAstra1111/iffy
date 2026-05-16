import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const anonKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1]?.trim();
const url = envContent.match(/VITE_SUPABASE_URL=(.+)/)[1]?.trim();
console.log("ANON_KEY exists:", !!anonKey, "URL:", url);

const loginTs = fs.readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = loginTs.match(/SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : anonKey;
console.log("SR_KEY exists:", !!srKey);

const sb = createClient(url, srKey, { auth: { persistSession: false } });

const PID = '1983a0ee-bf30-42d1-ae49-d8a272538993';

async function main() {
  // Get the actual schema by listing available columns
  // Query the tables with a limit 1 to discover columns
  
  // 1. auto_run_jobs - just get 1 record to see columns
  console.log("\n=== AUTO_RUN_JOBS columns ===");
  const { data: arj, error: arjErr } = await sb
    .from('auto_run_jobs')
    .select('*')
    .limit(1);
  
  if (arjErr) console.log("ARJ ERR:", arjErr.message);
  else if (arj.length > 0) {
    console.log("Columns:", Object.keys(arj[0]).join(', '));
  } else {
    console.log("No auto_run_jobs found. Table may be empty or named differently.");
    // Try alternate name
    const { data: alt, error: altErr } = await sb
      .from('auto_run')
      .select('*')
      .limit(1);
    console.log("auto_run table exists:", !altErr, "data:", alt?.length);
  }
  
  // 2. development_runs
  console.log("\n=== DEVELOPMENT_RUNS columns ===");
  const { data: dr, error: drErr } = await sb
    .from('development_runs')
    .select('*')
    .limit(1);
  
  if (drErr) console.log("DR ERR:", drErr.message);
  else if (dr.length > 0) {
    console.log("Columns:", Object.keys(dr[0]).join(', '));
  } else {
    console.log("No development_runs found (just empty).");
  }
  
  // 3. project_documents
  console.log("\n=== PROJECT_DOCUMENTS columns ===");
  const { data: pd, error: pdErr } = await sb
    .from('project_documents')
    .select('*')
    .limit(1);
  
  if (pdErr) console.log("PD ERR:", pdErr.message);
  else if (pd.length > 0) {
    console.log("Columns:", Object.keys(pd[0]).join(', '));
  }
  
  // 4. projects
  console.log("\n=== PROJECTS columns ===");
  const { data: pj, error: pjErr } = await sb
    .from('projects')
    .select('*')
    .eq('id', PID)
    .limit(1);
  
  if (pjErr) console.log("PJ ERR:", pjErr.message);
  else if (pj && pj.length > 0) {
    console.log("Columns:", Object.keys(pj[0]).join(', '));
  } else {
    console.log("Project not found with that ID.");
  }
  
  // 5. auto_run_steps
  console.log("\n=== AUTO_RUN_STEPS columns ===");
  const { data: ars, error: arsErr } = await sb
    .from('auto_run_steps')
    .select('*')
    .limit(1);
  
  if (arsErr) console.log("ARS ERR:", arsErr.message);
  else if (ars.length > 0) {
    console.log("Columns:", Object.keys(ars[0]).join(', '));
  } else {
    console.log("No auto_run_steps found (just empty).");
  }
  
  // 6. Now also try querying for project 1983a0ee more broadly
  console.log("\n\n=== QUERYING FOR PROJECT 1983a0ee across all relevant tables ===");
  
  // First verify the project exists
  const { data: proj, error: projErr } = await sb
    .from('projects')
    .select('*')
    .eq('id', PID);
  
  if (projErr) console.log("PROJ QUERY ERR:", projErr.message);
  else console.log("Project found:", JSON.stringify(proj, null, 2));
  
  // Try alternate project id format (shorter UUID)
  const shortPid = PID.substring(0, 8);
  console.log(`\nTrying short project ID: ${shortPid}`);
  const { data: proj2 } = await sb
    .from('projects')
    .select('id, title, created_at')
    .limit(5);
  
  if (proj2) {
    console.log("All projects:", JSON.stringify(proj2.map(p => ({id: p.id, title: p.title})), null, 2));
  }
}

main().catch(e => console.error(e));