#!/usr/bin/env node
/**
 * yeti-character-merge-migration.js
 * One-time data migration for the YETI project.
 * Merges duplicate character entities (Brother/Boy/Enki, Sister/Girl).
 *
 * Usage:
 *   node scripts/yeti-character-merge-migration.js [--execute]
 *
 * Without --execute: runs status + plan only (dry run).
 * With --execute:    runs status + plan + execute (performs the merge).
 *
 * This calls the character-entity-merge edge function via the Supabase REST API
 * using the service_role key from .env.local or .env.production.local.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// ─── Load env ─────────────────────────────────────────────────────────────────
function loadEnvVar(name) {
  // Try .env.production.local first, then .env.local, then .env
  const files = ['.env.production.local', '.env.local', '.env'];
  for (const file of files) {
    const path = resolve(projectRoot, file);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key === name) return value;
    }
  }
  return null;
}

const SUPABASE_URL = loadEnvVar('VITE_SUPABASE_URL') || loadEnvVar('SUPABASE_URL');
const SERVICE_ROLE_KEY = loadEnvVar('SUPABASE_SERVICE_ROLE_KEY') || loadEnvVar('VITE_SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: Could not load SUPABASE_URL and SERVICE_ROLE_KEY from env files.');
  console.error('Make sure .env.local or .env.production.local exists with these variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ─── YETI project ID ──────────────────────────────────────────────────────────
const YETI_PROJECT_NAME = 'YETI';

async function findYetiProjectId() {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .ilike('name', `%${YETI_PROJECT_NAME}%`)
    .maybeSingle();

  if (error) {
    console.error('ERROR finding YETI project:', error.message);
    process.exit(1);
  }
  if (!data) {
    console.error(`ERROR: Could not find project matching "${YETI_PROJECT_NAME}"`);
    process.exit(1);
  }
  console.log(`Found project: ${data.name} (${data.id})`);
  return data.id;
}

// ─── Edge function call ───────────────────────────────────────────────────────
async function callMergeFunction(action, projectId, extra = {}) {
  const body = { action, projectId, ...extra };
  console.log(`\n── [${action}] ───────────────────────────────────────────────`);
  console.log(JSON.stringify(body, null, 2));

  const { data, error } = await supabase.functions.invoke('character-entity-merge', {
    body,
  });

  if (error) {
    console.error(`\n✖ ERROR (${action}):`, error.message);
    return null;
  }

  // The invoke wrapper returns the function result directly
  console.log(`\n✓ Result (${action}):`);
  console.log(JSON.stringify(data, null, 2));
  return data;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const shouldExecute = process.argv.includes('--execute');

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   YETI Character Merge Migration                         ║');
  console.log(`║   Mode: ${shouldExecute ? 'EXECUTE (will modify data!)' : 'DRY RUN (no changes)'}        ║`);
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');

  // Step 1: Find the YETI project
  const projectId = await findYetiProjectId();

  // Step 2: Status — detect duplicates
  const statusResult = await callMergeFunction('status', projectId);
  if (!statusResult) process.exit(1);

  const duplicates = statusResult.potential_duplicates || [];
  console.log(`\nDetected ${duplicates.length} duplicate cluster(s).`);

  if (duplicates.length === 0) {
    console.log('\nNo duplicates found. Nothing to merge. ✓');
    process.exit(0);
  }

  // Print a summary table
  console.log('\n── Duplicate Clusters ───────────────────────────────────────');
  for (const cluster of duplicates) {
    console.log(`  Cluster: ${cluster.names.join(' / ')}`);
    console.log(`    Entity IDs: ${cluster.entity_ids.join(', ')}`);
    console.log(`    Reason: ${cluster.reason}`);
    console.log(`    Scene links: ${cluster.scene_links_count}`);
    console.log(`    Relations: ${cluster.relation_count}`);
    console.log('');
  }

  // Step 3: Plan — generate merge plan
  const planResult = await callMergeFunction('plan', projectId);
  if (!planResult) process.exit(1);

  const merges = planResult.merges || [];
  console.log(`\nGenerated ${merges.length} merge plan(s).`);

  if (merges.length === 0) {
    console.log('\nNo merges in plan. Nothing to execute. ✓');
    process.exit(0);
  }

  // Print plan summary
  console.log('\n── Merge Plan ─────────────────────────────────────────────');
  for (const merge of merges) {
    console.log(`  Keep: "${merge.canonical_name}" (${merge.canonical_entity_id})`);
    console.log(`  Absorb: ${merge.absorbed_names.join(', ')} (${merge.absorbed_entity_ids.join(', ')})`);
    console.log(`  Scene links to repair: ${merge.scene_links_to_repair}`);
    console.log(`  Relations to repair: ${merge.relations_to_repair}`);
    console.log(`  Aliases to insert: ${merge.aliases_to_insert.join(', ') || '(none — already aliased)'}`);
    console.log(`  Document sections to update: ${merge.document_sections_to_merge.length}`);
    console.log('');
  }

  // Step 4: Execute (only if --execute is passed)
  if (shouldExecute) {
    console.log('\n── Executing merge... ───────────────────────────────────');

    // Confirmation prompt
    console.log('\n⚠  WARNING: This will MODIFY DATA in the database.');
    console.log('   Press Ctrl+C within 5 seconds to cancel, or wait to continue...');
    await new Promise(r => setTimeout(r, 5000));

    const executeResult = await callMergeFunction('execute', projectId, { merges });
    if (!executeResult) process.exit(1);

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║   MERGE EXECUTION COMPLETE                                ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`  Merges completed: ${executeResult.merges_completed}`);
    console.log(`  Scene links repaired: ${executeResult.scene_links_repaired}`);
    console.log(`  Relations repaired: ${executeResult.relations_repaired}`);
    console.log(`  Aliases inserted: ${executeResult.aliases_inserted}`);
    console.log(`  Entities deleted: ${executeResult.entities_deleted}`);

    if (executeResult.document_ids_to_regenerate?.length > 0) {
      console.log(`\n  Documents that need regeneration:`);
      for (const docId of executeResult.document_ids_to_regenerate) {
        console.log(`    - ${docId}`);
      }
    }
  } else {
    console.log('\n── Dry run complete. ─────────────────────────────────────');
    console.log('To execute the merge, run:');
    console.log('  node scripts/yeti-character-merge-migration.js --execute');
  }

  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
