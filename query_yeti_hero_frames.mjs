import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
console.log("ENV LENGTH:", envContent.length);
console.log("ENV LINES:", envContent.split('\n').length);

const anonMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
console.log("ANON MATCH:", anonMatch ? "found" : "NOT FOUND");
const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.+)/);
console.log("URL MATCH:", urlMatch ? "found" : "NOT FOUND");

// The issue might be trailing whitespace or quoted values
const anonKey = anonMatch ? anonMatch[1].trim().replace(/^"/, '').replace(/"$/, '') : null;
const url = urlMatch ? urlMatch[1].trim().replace(/^"/, '').replace(/"$/, '') : null;

console.log("URL:", url);
console.log("ANON KEY (first 20):", anonKey?.substring(0, 20));

const loginTs = fs.readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = loginTs.match(/SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : anonKey;
console.log("SR KEY:", srMatch ? "found in login.ts" : "falling back to anon key");

const sb = createClient(url, srKey, { auth: { persistSession: false } });

const YETI_PID = '9404a383-5cdc-4f06-92aa-2ca70973c556';
const HERO_GROUP = 'hero_frame';

async function main() {
  console.log('\n=== YETI HERO FRAME QUERIES ===');
  console.log(`Project ID: ${YETI_PID}\n`);

  // ── Query 1: Sample rows with ALL columns ──
  console.log('--- QUERY 1: Sample rows (ALL columns, LIMIT 5) ---');
  const { data: sampleRows, error: err1 } = await sb
    .from('project_images')
    .select('*')
    .eq('project_id', YETI_PID)
    .eq('asset_group', HERO_GROUP)
    .limit(5);
  if (err1) {
    console.error('ERROR:', err1.message);
    return;
  } else if (sampleRows && sampleRows.length > 0) {
    const keys = Object.keys(sampleRows[0]);
    console.log(`Columns (${keys.length}): ${keys.join(', ')}`);
    sampleRows.forEach((row, i) => {
      console.log(`\nRow ${i + 1}:`);
      for (const k of keys) {
        let val = row[k];
        if (val === null) val = 'NULL';
        else if (typeof val === 'object') val = JSON.stringify(val);
        else if (typeof val === 'string' && val.length > 120) val = val.substring(0, 120) + '...';
        console.log(`  ${k}: ${val}`);
      }
    });
  } else {
    console.log('No rows found.');
    // Try counting without asset_group filter
    const { count: totalAll, error: allErr } = await sb
      .from('project_images')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', YETI_PID);
    console.log(`Total project_images for YETI: ${totalAll}${allErr ? ' err: ' + allErr.message : ''}`);
    
    const { data: sampleAny } = await sb
      .from('project_images')
      .select('asset_group')
      .eq('project_id', YETI_PID)
      .limit(10);
    console.log('Sample asset_groups:', [...new Set((sampleAny || []).map(r => r.asset_group))].join(', '));
  }

  // ── Query 2: DISTINCT role ──
  console.log('\n--- QUERY 2: DISTINCT role ---');
  const { data: roles, error: err2 } = await sb
    .from('project_images')
    .select('role')
    .eq('project_id', YETI_PID)
    .eq('asset_group', HERO_GROUP);
  if (err2) { console.error('ERROR:', err2.message); return; }
  const roleCounts = {};
  for (const r of roles) { const key = r.role ?? 'NULL'; roleCounts[key] = (roleCounts[key] || 0) + 1; }
  for (const [val, cnt] of Object.entries(roleCounts).sort((a, b) => b[1] - a[1])) { console.log(`  ${val}: ${cnt}`); }

  // ── Query 3: DISTINCT curation_state ──
  console.log('\n--- QUERY 3: DISTINCT curation_state ---');
  const { data: curStates, error: err3 } = await sb
    .from('project_images')
    .select('curation_state')
    .eq('project_id', YETI_PID)
    .eq('asset_group', HERO_GROUP);
  if (err3) { console.error('ERROR:', err3.message); return; }
  const curCounts = {};
  for (const r of curStates) { const key = r.curation_state ?? 'NULL'; curCounts[key] = (curCounts[key] || 0) + 1; }
  for (const [val, cnt] of Object.entries(curCounts).sort((a, b) => b[1] - a[1])) { console.log(`  ${val}: ${cnt}`); }

  // ── Query 4: DISTINCT strategy_key ──
  console.log('\n--- QUERY 4: DISTINCT strategy_key ---');
  const { data: stratKeys, error: err4 } = await sb
    .from('project_images')
    .select('strategy_key')
    .eq('project_id', YETI_PID)
    .eq('asset_group', HERO_GROUP);
  if (err4) { console.error('ERROR:', err4.message); return; }
  const stratCounts = {};
  for (const r of stratKeys) { const key = r.strategy_key ?? 'NULL'; stratCounts[key] = (stratCounts[key] || 0) + 1; }
  for (const [val, cnt] of Object.entries(stratCounts).sort((a, b) => b[1] - a[1])) { console.log(`  ${val}: ${cnt}`); }

  // ── Query 5: DISTINCT generation_purpose ──
  console.log('\n--- QUERY 5: DISTINCT generation_purpose ---');
  const { data: genPurposes, error: err5 } = await sb
    .from('project_images')
    .select('generation_purpose')
    .eq('project_id', YETI_PID)
    .eq('asset_group', HERO_GROUP);
  if (err5) { console.error('ERROR:', err5.message); return; }
  const genCounts = {};
  for (const r of genPurposes) { const key = r.generation_purpose ?? 'NULL'; genCounts[key] = (genCounts[key] || 0) + 1; }
  for (const [val, cnt] of Object.entries(genCounts).sort((a, b) => b[1] - a[1])) { console.log(`  ${val}: ${cnt}`); }

  // ── Query 6: DISTINCT is_active ──
  console.log('\n--- QUERY 6: DISTINCT is_active ---');
  const { data: isActiveVals, error: err6 } = await sb
    .from('project_images')
    .select('is_active')
    .eq('project_id', YETI_PID)
    .eq('asset_group', HERO_GROUP);
  if (err6) { console.error('ERROR:', err6.message); return; }
  const activeCounts = {};
  for (const r of isActiveVals) { const key = String(r.is_active); activeCounts[key] = (activeCounts[key] || 0) + 1; }
  for (const [val, cnt] of Object.entries(activeCounts).sort((a, b) => b[1] - a[1])) { console.log(`  ${val}: ${cnt}`); }

  // ── Query 7: storage_bucket, storage_path, image_url (LIMIT 3) ──
  console.log('\n--- QUERY 7: Storage info (LIMIT 3) ---');
  const { data: storageRows, error: err7 } = await sb
    .from('project_images')
    .select('storage_bucket, storage_path, image_url')
    .eq('project_id', YETI_PID)
    .eq('asset_group', HERO_GROUP)
    .limit(3);
  if (err7) { console.error('ERROR:', err7.message); return; }
  if (storageRows && storageRows.length > 0) {
    storageRows.forEach((r, i) => {
      console.log(`  Row ${i+1}: bucket=${r.storage_bucket}, path=${r.storage_path}, url=${r.image_url}`);
    });
  } else { console.log('  No rows found.'); }

  // ── Query 8: Check for section/gallery tables ──
  console.log('\n--- QUERY 8: Check for section/gallery/reel tables ---');
  const relevantTables = [
    'project_image_sections',
    'project_image_galleries',
    'project_sections',
    'project_reels',
    'project_scenes',
    'scene_assets',
    'project_image_reels',
    'project_image_groupings',
    'project_asset_galleries',
    'project_galleries',
  ];
  for (const tbl of relevantTables) {
    const { data: td, error: te } = await sb.from(tbl).select('id').limit(1);
    if (te && (te.message?.includes('relation') || te.message?.includes('does not exist'))) {
      console.log(`  Table "${tbl}": DOES NOT EXIST`);
    } else if (te) {
      console.log(`  Table "${tbl}": error - ${te.message}`);
    } else {
      const { count: tc, error: tce } = await sb
        .from(tbl)
        .select('*', { count: 'exact', head: true });
      console.log(`  Table "${tbl}": EXISTS (${tc ?? '?'} total rows)`);
      const { data: yetiRows } = await sb
        .from(tbl)
        .select('*')
        .eq('project_id', YETI_PID)
        .limit(3);
      if (yetiRows && yetiRows.length > 0) {
        console.log(`    ${yetiRows.length} rows for YETI project.`);
        yetiRows.forEach((r, i) => {
          const cleaned = {};
          for (const [k, v] of Object.entries(r)) {
            cleaned[k] = typeof v === 'string' && v.length > 100 ? v.substring(0, 100) + '...' : v;
          }
          console.log(`      Row ${i+1}: ${JSON.stringify(cleaned)}`);
        });
      } else {
        console.log(`    No rows for YETI project.`);
      }
    }
  }

  // ── Total count ──
  console.log('\n--- TOTAL HERO FRAME COUNT ---');
  const { count: totalCount, error: totalErr } = await sb
    .from('project_images')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', YETI_PID)
    .eq('asset_group', HERO_GROUP);
  if (totalErr) { console.error('ERROR:', totalErr.message); }
  else { console.log(`  Total hero_frame rows: ${totalCount}`); }

  console.log('\n=== DONE ===');
}

main().catch(e => console.error('FATAL:', e));
