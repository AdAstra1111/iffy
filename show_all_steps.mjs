import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const anonKey = env.match(/VITE_SUPABASE_ANON_KEY="(.+)"/)[1];
const url = env.match(/VITE_SUPABASE_URL="(.+)"/)[1];
const login = readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = login.match(/SUPABASE_SERVICE_ROLE_KEY.*\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : anonKey;
const sb = createClient(url, srKey, { auth: { persistSession: false } });

const JOB_ID = 'e1a84669-2cd8-497a-88e4-8b7f19d49a2d';

async function main() {
  // Get ALL steps to see actual document values
  const { data: steps } = await sb.from('auto_run_steps')
    .select('*')
    .eq('job_id', JOB_ID)
    .order('step_index', { ascending: true });
  
  console.log(`Total steps: ${steps?.length || 0}`);
  for (const s of (steps || [])) {
    console.log(`${s.step_index} | doc:${s.document} | action:${s.action} | msg:${(s.message||'').substring(0,200)}`);
  }
}
main().catch(e => console.error('FATAL:', e));