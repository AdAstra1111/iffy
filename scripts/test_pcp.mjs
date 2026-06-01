import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  console.log(`URL: ${SUPABASE_URL}`);
  console.log(`Key length: ${SERVICE_KEY?.length || 0}`);

  for (const [label, pid] of [
    ['Concrete Angels', 'b6ae36fb-805b-4ff5-84ba-91fbccd46334'],
    ['Event Horizon Protocol', '6c4e2f48-fe9c-47b6-aac8-656a3ed4274b'],
  ]) {
    console.log(`\n=== ${label} (${pid}) ===`);
    
    const res = await fetch(`${SUPABASE_URL}/functions/v1/pcp-resolver`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        project_id: pid,
        project_metadata: {},
        canon_json: {},
      }),
    });
    
    const data = await res.json();
    console.log(JSON.stringify({
      status: data.status,
      persisted: data.persisted,
      canon_source: data.canon_source,
      version: data.version,
      persist_error: data.persist_error,
    }, null, 2));
    
    // Show genre and period from resolved profile
    if (data.profile?.categories) {
      const g = data.profile.categories.project_identity?.genre?.value;
      const p = data.profile.categories.temporal_context?.period?.value;
      const profCount = Object.keys(data.profile.categories.professional_context?.profession_map?.value || {}).length;
      console.log(`  Genre: ${JSON.stringify(g)}`);
      console.log(`  Period: ${p}`);
      console.log(`  Characters in profession_map: ${profCount}`);
    }
  }
}

main().catch(console.error);