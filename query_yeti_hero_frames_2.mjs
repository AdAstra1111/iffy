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
const HERO_GROUP = 'hero_frame';

async function main() {
  // Check project_scenes table
  console.log('=== project_scenes schema ===');
  const { data: psSchema } = await sb.from('project_scenes').select('*').limit(1);
  if (psSchema && psSchema.length > 0) {
    console.log('Columns:', Object.keys(psSchema[0]).join(', '));
  }

  // Also check how project_images connects to project_scenes
  console.log('\n=== YETI project_scenes rows ===');
  const { data: yetiScenes } = await sb.from('project_scenes').select('*').eq('project_id', YETI_PID);
  console.log(`Count: ${yetiScenes?.length || 0}`);
  if (yetiScenes && yetiScenes.length > 0) {
    yetiScenes.slice(0, 3).forEach((r, i) => console.log(`  ${i+1}: ${JSON.stringify(r).substring(0, 300)}`));
  }

  // Check if hero frames reference scenes via a column
  console.log('\n=== Check for scene_id or similar in hero frames ===');
  const { data: hfCols } = await sb
    .from('project_images')
    .select('id, scene_id, shot_list_id, source_feature, asset_group')
    .eq('project_id', YETI_PID)
    .eq('asset_group', HERO_GROUP)
    .limit(5);
  if (hfCols) {
    hfCols.forEach((r, i) => console.log(`  ${i+1}: id=${r.id?.substring(0,8)}, scene_id=${r.scene_id}, shot_list_id=${r.shot_list_id}, source_feature=${r.source_feature}`));
  }

  // Check for other project_images asset_groups for YETI
  console.log('\n=== All asset_groups for YETI project ===');
  const { data: groups } = await sb
    .from('project_images')
    .select('asset_group, count')
    .eq('project_id', YETI_PID);
  // Can't do count in select, use separate approach
  const { data: allGroups } = await sb
    .from('project_images')
    .select('asset_group')
    .eq('project_id', YETI_PID);
  if (allGroups) {
    const groupCounts = {};
    for (const r of allGroups) {
      const g = r.asset_group ?? 'NULL';
      groupCounts[g] = (groupCounts[g] || 0) + 1;
    }
    for (const [g, c] of Object.entries(groupCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${g}: ${c}`);
    }
    console.log(`\n  Total project_images for YETI: ${allGroups.length}`);
  }

  // Check for any 'curated' or 'approved' frames
  console.log('\n=== Hero frames with curation_state = active (39 rows): quality_status breakdown ===');
  const { data: activeFrames } = await sb
    .from('project_images')
    .select('quality_status, count')
    .eq('project_id', YETI_PID)
    .eq('asset_group', HERO_GROUP)
    .eq('curation_state', 'active');
  if (activeFrames) {
    const qCounts = {};
    for (const r of activeFrames) {
      // Can't do count in select, fetch and count manually
    }
    const { data: activeAll } = await sb
      .from('project_images')
      .select('quality_status, premium_eligible, quality_score, subject_type')
      .eq('project_id', YETI_PID)
      .eq('asset_group', HERO_GROUP)
      .eq('curation_state', 'active');
    if (activeAll) {
      const qsCounts = {};
      const peCounts = {};
      const stCounts = {};
      const scoreBuckets = { '0-49': 0, '50-69': 0, '70-84': 0, '85-100': 0 };
      for (const r of activeAll) {
        const qs = r.quality_status ?? 'NULL';
        qsCounts[qs] = (qsCounts[qs] || 0) + 1;
        const pe = String(r.premium_eligible);
        peCounts[pe] = (peCounts[pe] || 0) + 1;
        const st = r.subject_type ?? 'NULL';
        stCounts[st] = (stCounts[st] || 0) + 1;
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
      console.log('  quality_score buckets:', JSON.stringify(scoreBuckets));
    }
  }

  // Check candidate frames
  console.log('\n=== Hero frames with curation_state = candidate (10 rows): quality_status breakdown ===');
  const { data: candidateAll } = await sb
    .from('project_images')
    .select('quality_status, premium_eligible, quality_score, subject_type')
    .eq('project_id', YETI_PID)
    .eq('asset_group', HERO_GROUP)
    .eq('curation_state', 'candidate');
  if (candidateAll) {
    const qsCounts = {};
    const peCounts = {};
    const stCounts = {};
    for (const r of candidateAll) {
      const qs = r.quality_status ?? 'NULL';
      qsCounts[qs] = (qsCounts[qs] || 0) + 1;
      const pe = String(r.premium_eligible);
      peCounts[pe] = (peCounts[pe] || 0) + 1;
      const st = r.subject_type ?? 'NULL';
      stCounts[st] = (stCounts[st] || 0) + 1;
    }
    console.log('  quality_status:', JSON.stringify(qsCounts));
    console.log('  premium_eligible:', JSON.stringify(peCounts));
    console.log('  subject_type:', JSON.stringify(stCounts));
  }

  // Check public URL for one image — are they accessible?
  console.log('\n=== Public URL check (2 representative frames) ===');
  const { data: urlRows } = await sb
    .from('project_images')
    .select('storage_bucket, storage_path, id')
    .eq('project_id', YETI_PID)
    .eq('asset_group', HERO_GROUP)
    .limit(2);
  if (urlRows) {
    for (const r of urlRows) {
      const { data: pubData } = sb.storage.from(r.storage_bucket).getPublicUrl(r.storage_path);
      console.log(`  ID ${r.id.substring(0,8)}: bucket=${r.storage_bucket}, path=${r.storage_path}`);
      console.log(`    Public URL: ${pubData?.publicUrl || 'N/A'}`);
    }
  }

  // Check if there's a join table for project_images grouping
  console.log('\n=== Check for any foreign key relationships ===');
  const { data: fkTest } = await sb
    .from('project_images')
    .select('id, project_id, scene_id, shot_list_id, target_requirement_id')
    .eq('project_id', YETI_PID)
    .eq('asset_group', HERO_GROUP)
    .not('scene_id', 'is', null)
    .limit(3);
  if (fkTest && fkTest.length > 0) {
    console.log('  scene_id populated on hero frames:', fkTest.length);
    fkTest.forEach(r => console.log(`    id=${r.id.substring(0,8)}, scene_id=${r.scene_id}, shot_list_id=${r.shot_list_id}`));
  } else {
    console.log('  scene_id: all NULL on hero frames');
  }

  const { data: reqIdPopulated } = await sb
    .from('project_images')
    .select('id, target_requirement_id')
    .eq('project_id', YETI_PID)
    .eq('asset_group', HERO_GROUP)
    .not('target_requirement_id', 'is', null)
    .limit(3);
  if (reqIdPopulated && reqIdPopulated.length > 0) {
    console.log('  target_requirement_id populated on hero frames:', reqIdPopulated.length);
    reqIdPopulated.forEach(r => console.log(`    id=${r.id.substring(0,8)}, target_requirement_id=${r.target_requirement_id}`));
  } else {
    console.log('  target_requirement_id: all NULL on hero frames');
  }
}

main().catch(e => console.error('FATAL:', e));
