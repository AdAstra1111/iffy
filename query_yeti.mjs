import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const lines = env.split('\n').filter(l => l.trim());
const url = lines.find(l => l.startsWith('VITE_SUPABASE_URL=')).split('=').slice(1).join('=').replace(/["']/g,'').trim();
const srLine = lines.find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY='));
const sr = srLine.split('=').slice(1).join('=').replace(/["']/g,'').trim();
const pid = '9404a383-5cdc-4f06-92aa-2ca70973c556';
const sb = createClient(url, sr, { auth: { persistSession: false } });

async function main() {
  // Get governance eligibility_state fully
  const { data: gov } = await sb.from('project_visual_stage_governance').select('*').eq('project_id', pid).order('stage_id');
  console.log('=== FULL GOVERNANCE ===');
  for (const g of gov || []) {
    console.log('\nStage: ' + (g.stage_id || '?'));
    console.log('  computed_status: ' + g.computed_status);
    console.log('  eligibility_state: ' + JSON.stringify(g.eligibility_state).slice(0,200));
    console.log('  stale_risk: ' + g.stale_risk);
    console.log('  blocker_codes: ' + (g.blocker_codes || '-'));
    console.log('  last_evaluated: ' + g.last_evaluated_at);
    console.log('  source_snapshot: ' + JSON.stringify(g.source_snapshot_hash || {}).slice(0,200));
  }

  // Get actor data - they don't have project_id so query all
  const { data: actors } = await sb.from('ai_actors').select('id,name').limit(50);
  console.log('\n=== AI ACTORS (all, no project_id filter) ===');
  if (actors) {
    console.log('Total: ' + actors.length);
    for (const a of actors) {
      console.log('  ' + a.id.slice(0,12) + ' | ' + (a.name || '?'));
    }
  }

  // Get visual_set_slots via join
  const { data: vsets } = await sb.from('visual_sets').select('id,domain,target_name').eq('project_id', pid).eq('domain', 'character_costume_look').limit(5);
  if (vsets && vsets.length > 0) {
    const firstSetId = vsets[0].id;
    const { data: slots } = await sb.from('visual_set_slots').select('*').eq('visual_set_id', firstSetId).limit(10);
    console.log('\n=== VISUAL SET SLOTS (sample, for set ' + firstSetId.slice(0,12) + ') ===');
    if (slots) {
      console.log('Slots: ' + slots.length);
      for (const s of slots) {
        console.log('  ' + (s.slot_type || '?') + ' | status=' + (s.status || '?') + ' | img=' + (s.image_url ? 'YES' : 'NO'));
      }
    }
  }

  // Find a top-level slot count by joining
  const { data: allSets } = await sb.from('visual_sets').select('id,domain').eq('project_id', pid).limit(200);
  if (allSets) {
    // Get all slots for just character sets
    let totalFilled = 0; let totalSlots = 0;
    for (const s of allSets.slice(0, 20)) {
      const { data: slots } = await sb.from('visual_set_slots').select('status,image_url').eq('visual_set_id', s.id);
      if (slots) {
        totalSlots += slots.length;
        totalFilled += slots.filter(x => x.image_url).length;
      }
    }
    console.log('\n=== VISUAL SET SLOTS (sampled 20 sets) ===');
    console.log('  Slots: ' + totalSlots + ', Filled: ' + totalFilled);
  }
}

main().catch(e => console.error('FATAL:', e.message, e.stack?.slice(0,500)));