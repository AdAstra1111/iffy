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
  const { count: devCount, error: devErr } = await sb.from('development_runs').select('*', { count: 'exact', head: true });
  console.log("dev_runs total:", devCount, "err:", devErr?.message);
  const { count: noteCount, error: noteErr } = await sb.from('project_notes').select('*', { count: 'exact', head: true });
  console.log("project_notes total:", noteCount, "err:", noteErr?.message);
  const { count: docCount, error: docErr } = await sb.from('project_documents').select('*', { count: 'exact', head: true });
  console.log("project_documents total:", docCount, "err:", docErr?.message);
  const { data: dr } = await sb.from('development_runs').select('id, project_id').eq('project_id', PID).limit(5);
  console.log("Dev runs for PID:", dr?.length, dr ? dr.map(d => d.id.slice(0,8) + " proj=" + d.project_id.slice(0,8)) : null);
  // Also try getting ALL fields
  const { data: drAll } = await sb.from('development_runs').select('id, project_id, document_id, run_type, output_json, created_at').eq('project_id', PID).order('created_at', { ascending: true }).limit(3);
  console.log("DR with fields:", JSON.stringify(drAll?.map(d => ({id:d.id.slice(0,8), proj:d.project_id?.slice(0,8), doc:d.document_id?.slice(0,8), type:d.run_type, created:d.created_at}))));
}
main().catch(e => console.error(e));