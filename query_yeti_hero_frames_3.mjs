import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('/Users/laralane/code/iffy/.env.local', 'utf8');
const anonKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim().replace(/^"/, '').replace(/"$/, '');
const url = envContent.match(/VITE_SUPABASE_URL=(.+)/)[1].trim().replace(/^"/, '').replace(/"$/, '');
const loginTs = fs.readFileSync('/Users/laralane/code/iffy/api/auth/login.ts', 'utf8');
const srMatch = loginTs.match(/SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'/);
const srKey = srMatch ? srMatch[1] : anonKey;
const sb = createClient(url, srKey, { auth: { persistSession: false } });

const YETI_PID = '9404a383-5cdc-4f06-92aa-2ca70973c556';

async function main() {
  // Active frames data
  console.log('=== Active hero frames (curation_state = active) breakdown ===');
  const { data: activeAll, error: ae } = await sb
    .from('project_images')
    .select('quality_status, premium_eligible, quality_score, subject_type, role, shot_type, freshness_status')
    .eq('project_id', YETI_PID)
    .eq('asset_group', 'hero_frame')
    .eq('curation_state', 'active');
  if (ae) {
    console.log('ERROR:', ae.message);
  } else if (activeAll) {
    console.log(`Count: ${activeAll.length}`);
    const qsCounts = {};
    const peCounts = {};
    const stCounts = {};
    const roleCounts = {};
    const shotCounts = {};
    const freshCounts = {};
    const scoreBuckets = { '0-49': 0, '50-69': 0, '70-84': 0, '85-100': 0 };
    for (const r of activeAll) {
      const qs = r.quality_status ?? 'NULL';
      qsCounts[qs] = (qsCounts[qs] || 0) + 1;
      const pe = String(r.premium_eligible);
      peCounts[pe] = (peCounts[pe] || 0) + 1;
      const st = r.subject_type ?? 'NULL';
      stCounts[st] = (stCounts[st] || 0) + 1;
      const role = r.role ?? 'NULL';
      roleCounts[role] = (roleCounts[role] || 0) + 1;
      const shot = r.shot_type ?? 'NULL';
      shotCounts[shot] = (shotCounts[shot] || 0) + 1;
      const fr = r.freshness_status ?? 'NULL';
      freshCounts[fr] = (freshCounts[fr] || 0) + 1;
      if (r.quality_score !== null) {
        if (r.quality_score < 50) scoreBuckets['0-49']++;
        else if (r.quality_score < 70) scoreBuckets['50-69']++;
        else if (r.quality_score < 85) scoreBuckets['70-84']++;
        else scoreBuckets['85-100']++;
      }
    }
    console.log('  quality_status:', JSON.stringify(qsCounts));
    console.log('  premium_eligible:', JSON.stringify(peCounts));
    console.log('  subject_type:', JSON.stringify(stCounts));
    console.log('  role:', JSON.stringify(roleCounts));
    console.log('  shot_type:', JSON.stringify(shotCounts));
    console.log('  freshness_status:', JSON.stringify(freshCounts));
    console.log('  quality_score buckets:', JSON.stringify(scoreBuckets));
  }

  // Check if COLUMNS exist: scene_id
  console.log('\n=== Check column existence on project_images for hero frames ===');
  const { data: colCheck } = await sb
    .from('project_images')
    .select('id')
    .eq('project_id', YETI_PID)
    .eq('asset_group', 'hero_frame')
    .limit(1);
  if (colCheck && colCheck.length > 0) {
    const colNames = Object.keys(colCheck[0]).join(', ');
    // Check for scene-related columns
    const sceneCols = Object.keys(colCheck[0]).filter(k => k.includes('scene') || k.includes('shot_list') || k.includes('requirement'));
    console.log('  Scene/shot/requirement columns present:', sceneCols.join(', ') || 'NONE');
    const allCols = Object.keys(colCheck[0]);
    console.log(`  Total columns: ${allCols.length}`);
  }

  // Look for related tables via information_schema
  console.log('\n=== Search for any grouping/collection tables (information_schema) ===');
  // This won't work via the JS client directly, so let's try some known table patterns
  const tablesToTry = [
    'project_image_groups',
    'project_image_collections',
    'image_groups',
    'image_collections',
    'project_image_tags',
    'project_image_labels',
    'poster_groups',
    'poster_sets',
    'project_asset_collections',
    'project_hero_frames',
  ];
  for (const tbl of tablesToTry) {
    const { data: td, error: te } = await sb.from(tbl).select('id').limit(1);
    if (te?.message?.includes('relation') || te?.message?.includes('does not exist')) {
      // doesn't exist - skip
    } else if (te) {
      console.log(`  Table "${tbl}": error - ${te.message}`);
    } else {
      const { count: tc } = await sb.from(tbl).select('*', { count: 'exact', head: true });
      console.log(`  Table "${tbl}": EXISTS (${tc ?? '?'} total rows)`);
    }
  }

  // Check the source_poster_id and entity_id columns specifically
  console.log('\n=== entity_id and source_poster_id check on hero frames ===');
  const { data: refCheck } = await sb
    .from('project_images')
    .select('entity_id, source_poster_id, target_requirement_id, shot_list_id, requirement_ids')
    .eq('project_id', YETI_PID)
    .eq('asset_group', 'hero_frame')
    .limit(5);
  if (refCheck) {
    console.log('  Sample reference columns:');
    refCheck.forEach((r, i) => {
      console.log(`    ${i+1}: entity_id=${r.entity_id}, source_poster_id=${r.source_poster_id}, target_requirement_id=${r.target_requirement_id}, shot_list_id=${r.shot_list_id}, requirement_ids=${JSON.stringify(r.requirement_ids)}`);
    });
  }

  // Check all distinct quality_status values across ALL hero frames
  console.log('\n=== DISTINCT quality_status with count (all hero frames) ===');
  const { data: allQual } = await sb
    .from('project_images')
    .select('quality_status')
    .eq('project_id', YETI_PID)
    .eq('asset_group', 'hero_frame');
  if (allQual) {
    const counts = {};
    for (const r of allQual) { const k = r.quality_status ?? 'NULL'; counts[k] = (counts[k] || 0) + 1; }
    for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  }

  // Also check distinct subject_types across all hero frames
  console.log('\n=== DISTINCT subject_type with count (all hero frames) ===');
  const { data: allSubj } = await sb
    .from('project_images')
    .select('subject_type')
    .eq('project_id', YETI_PID)
    .eq('asset_group', 'hero_frame');
  if (allSubj) {
    const counts = {};
    for (const r of allSubj) { const k = r.subject_type ?? 'NULL'; counts[k] = (counts[k] || 0) + 1; }
    for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  }

  // Check distinct shot_type
  console.log('\n=== DISTINCT shot_type (all hero frames) ===');
  const { data: allShot } = await sb
    .from('project_images')
    .select('shot_type')
    .eq('project_id', YETI_PID)
    .eq('asset_group', 'hero_frame');
  if (allShot) {
    const counts = {};
    for (const r of allShot) { const k = r.shot_type ?? 'NULL'; counts[k] = (counts[k] || 0) + 1; }
    for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  }
}

main().catch(e => console.error('FATAL:', e));
