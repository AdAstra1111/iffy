/**
 * One-time migration: NameCanonicalizer retro-scan for YETI project
 * 
 * Scans existing character entities for:
 * 1. Suffix variants → merge to base (JOCK O.S. → JOCK, KRISTINA O.S. → KRISTINA)
 * 2. Fragment → full name merges (BI → BILL BLACKSTONE, LACKSTONE → BILL BLACKSTONE, etc.)
 * 3. OCR typos (BILL BLACKSTOSNE → BILL BLACKSTONE)
 * 
 * Project: 721f9035-703c-4a9d-b3c6-effa1a9f5922 (YETI)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://hdfderbphdobomkdjypc.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkZmRlcmJwaGRvYm9ta2RqeXBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM4ODY2MSwiZXhwIjoyMDkwOTY0NjYxfQ.DhQvyzYRsh7sjKC2_yjn3nzFWzJlzm4d7Tgg90fYSVo';

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);

const PROJECT_ID = '721f9035-703c-4a9d-b3c6-effa1a9f5922';

// ── Levenshtein helpers ──────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}
function levenshteinRatio(a: string, b: string): number {
  const dist = levenshtein(a, b);
  return dist / Math.max(a.length, b.length);
}

// ── Merge plan ────────────────────────────────────────────────────────────────
interface Merge {
  aliasEntityId: string;    // the one to absorb into canonical
  aliasName: string;        // its name → becomes a variant
  canonicalEntityId: string;
  canonicalName: string;
  reason: string;
  aliasType: string;
}

function buildMergePlan(entities: any[]): Merge[] {
  const merges: Merge[] = [];

  for (const e of entities) {
    const name = (e.canonical_name || '').toUpperCase().trim();
    const id = e.id;

    // Rule 1: Suffix variants (O.S.), (V.O.), (O.C.) — strip and merge to base
    const baseName = name.replace(/\s*\(O\.S\.\)\s*$/i, '')
      .replace(/\s*\(V\.O\.\)\s*$/i, '')
      .replace(/\s*\(O\.C\.\)\s*$/i, '')
      .replace(/\s*\(CONT'D\)\s*$/i, '')
      .trim();

    if (baseName !== name) {
      const baseEntity = entities.find(ent =>
        (ent.canonical_name || '').toUpperCase().trim() === baseName
      );
      if (baseEntity) {
        merges.push({
          aliasEntityId: id,
          aliasName: name,
          canonicalEntityId: baseEntity.id,
          canonicalName: baseName,
          reason: `Suffix variant merge: "${name}" → "${baseName}"`,
          aliasType: 'ocr_variant',
        });
        continue;
      }
    }

    // Rule 2: Substring / fragment matches with BILL BLACKSTONE
    // BI, LACKSTONE, LL BLACKSTONE → BILL BLACKSTONE
    const billBlackstone = entities.find(ent =>
      (ent.canonical_name || '').toUpperCase().trim() === 'BILL BLACKSTONE'
    );
    if (billBlackstone && id !== billBlackstone.id) {
      // BI → BILL BLACKSTONE (substring match)
      if (name === 'BI') {
        merges.push({
          aliasEntityId: id,
          aliasName: name,
          canonicalEntityId: billBlackstone.id,
          canonicalName: 'BILL BLACKSTONE',
          reason: `Fragment → BILL BLACKSTONE: "${name}" is a partial OCR extraction`,
          aliasType: 'fragment',
        });
        continue;
      }
      // LACKSTONE → BILL BLACKSTONE (surname match + fragment)
      if (name === 'LACKSTONE') {
        merges.push({
          aliasEntityId: id,
          aliasName: name,
          canonicalEntityId: billBlackstone.id,
          canonicalName: 'BILL BLACKSTONE',
          reason: `Fragment → BILL BLACKSTONE: "${name}" is a partial extraction of LACKSTONE surname`,
          aliasType: 'fragment',
        });
        continue;
      }
      // LL BLACKSTONE → BILL BLACKSTONE (OCR double-L)
      if (name === 'LL BLACKSTONE') {
        merges.push({
          aliasEntityId: id,
          aliasName: name,
          canonicalEntityId: billBlackstone.id,
          canonicalName: 'BILL BLACKSTONE',
          reason: `OCR variant → BILL BLACKSTONE: "${name}" (double-L typo)`,
          aliasType: 'ocr_variant',
        });
        continue;
      }
    }

    // Rule 3: BILL BLACKSTOSNE → BILL BLACKSTONE (OCR typo)
    const billCorrect = entities.find(ent =>
      (ent.canonical_name || '').toUpperCase().trim() === 'BILL BLACKSTONE'
    );
    if (billCorrect && name === 'BILL BLACKSTOSNE') {
      merges.push({
        aliasEntityId: id,
        aliasName: name,
        canonicalEntityId: billCorrect.id,
        canonicalName: 'BILL BLACKSTONE',
        reason: `OCR typo → BILL BLACKSTONE: "${name}" (TOSNE vs STONE)`,
        aliasType: 'ocr_variant',
      });
      continue;
    }

    // Rule 4: Duplicate ABETH entries (both 26 scenes) → pick longer/more-complete as canonical
    // Already handled above — merge to canonical

    // Rule 5: HEINRICH KLAUSMAN vs ALFRED KLAUSMAN → KLAUSMAN surname-only is a fragment
    const heinrich = entities.find(ent =>
      (ent.canonical_name || '').toUpperCase().trim() === 'HEINRICH KLAUSMAN'
    );
    const alfred = entities.find(ent =>
      (ent.canonical_name || '').toUpperCase().trim() === 'ALFRED KLAUSMAN'
    );
    const klausman = entities.find(ent =>
      (ent.canonical_name || '').toUpperCase().trim() === 'KLAUSMAN'
    );
    if (klausman) {
      if (heinrich && heinrich.id !== klausman.id) {
        merges.push({
          aliasEntityId: heinrich.id,
          aliasName: 'HEINRICH KLAUSMAN',
          canonicalEntityId: klausman.id,
          canonicalName: 'KLAUSMAN',
          reason: `Fragment → HEINRICH KLAUSMAN: "KLAUSMAN" is a surname-only mention`,
          aliasType: 'fragment',
        });
      }
      if (alfred && alfred.id !== klausman.id) {
        merges.push({
          aliasEntityId: alfred.id,
          aliasName: 'ALFRED KLAUSMAN',
          canonicalEntityId: klausman.id,
          canonicalName: 'KLAUSMAN',
          reason: `Fragment → ALFRED KLAUSMAN: "KLAUSMAN" is a surname-only mention`,
          aliasType: 'fragment',
        });
      }
    }

    // Rule 6: ELIZ → ELIZABETH (nickname match via NameCanonicalizer NICKNAME_MAP)
    const elizabeth = entities.find(ent =>
      (ent.canonical_name || '').toUpperCase().trim() === 'ELIZABETH'
    );
    const elizEntity = entities.find(ent =>
      (ent.canonical_name || '').toUpperCase().trim() === 'ELIZ'
    );
    if (elizabeth && elizEntity && elizEntity.id !== elizabeth.id) {
      merges.push({
        aliasEntityId: elizEntity.id,
        aliasName: 'ELIZ',
        canonicalEntityId: elizabeth.id,
        canonicalName: 'ELIZABETH',
        reason: `Nickname: "ELIZ" → "ELIZABETH" (NICKNAME_MAP)`,
        aliasType: 'nickname',
      });
    }

    // Rule 7: ALFRED KLAUSMAN → HEINRICH KLAUSMAN? No — these are different characters.
    // But KLAUSMAN alone is ambiguous — leave as-is for now (both are named Klausman in YETI).
  }

  return merges;
}

async function run() {
  console.log('Fetching existing entities...');
  const { data: entities, error } = await adminClient
    .from('narrative_entities')
    .select('id, canonical_name, entity_type, meta_json, scene_count')
    .eq('project_id', PROJECT_ID)
    .eq('entity_type', 'character');

  if (error) throw new Error(`Fetch failed: ${error.message}`);
  console.log(`Found ${entities?.length ?? 0} character entities`);

  const merges = buildMergePlan(entities || []);
  console.log(`\nMerge plan (${merges.length} merges):`);
  for (const m of merges) {
    console.log(`  "${m.aliasName}" (${m.aliasEntityId}) → "${m.canonicalName}" (${m.canonicalEntityId})`);
    console.log(`    Reason: ${m.reason} [${m.aliasType}]`);
  }

  if (merges.length === 0) {
    console.log('No merges needed.');
    return;
  }

  // Execute merges
  for (const m of merges) {
    // 1. Add alias_name to canonical entity's variant_names
    const { data: canonicalData } = await adminClient
      .from('narrative_entities')
      .select('id, meta_json')
      .eq('id', m.canonicalEntityId)
      .single();

    if (!canonicalData) {
      console.error(`Canonical not found: ${m.canonicalEntityId}`);
      continue;
    }

    const meta = (canonicalData.meta_json || {}) as Record<string, any>;
    const variants: string[] = meta.variant_names || [];
    const upperAlias = m.aliasName.toUpperCase().trim();
    if (!variants.includes(upperAlias)) {
      variants.push(upperAlias);
    }
    meta.variant_names = variants;

    await adminClient
      .from('narrative_entities')
      .update({ meta_json: meta })
      .eq('id', m.canonicalEntityId);

    // 2. Insert into narrative_entity_aliases
    await adminClient
      .from('narrative_entity_aliases')
      .upsert({
        project_id: PROJECT_ID,
        canonical_entity_id: m.canonicalEntityId,
        alias_name: upperAlias,
        source: 'retro_migration',
        alias_type: m.aliasType,
        confidence: 1.0,
        reason: m.reason,
      }, { onConflict: 'project_id,alias_name' });

    // 3. Delete the absorbed alias entity
    await adminClient
      .from('narrative_entities')
      .delete()
      .eq('id', m.aliasEntityId);

    console.log(`✓ Merged "${m.aliasName}" → "${m.canonicalName}"`);
  }

  // 4. Write to name_review_suggestions for record
  const suggestions = merges.map(m => ({
    project_id: PROJECT_ID,
    extracted_name: m.aliasName,
    matched_entity_id: m.canonicalEntityId,
    suggested_canonical: m.canonicalName,
    confidence: 'high' as const,
    reason: m.reason,
    action: 'merge' as const,
    status: 'approved' as const,
  }));

  await adminClient
    .from('name_review_suggestions')
    .upsert(suggestions, { onConflict: 'project_id,extracted_name' });

  console.log(`\n✅ Migration complete. ${merges.length} entities merged.`);
}

run().catch(err => {
  console.error('Migration failed:', err);
  Deno.exit(1);
});
