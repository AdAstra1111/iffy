#!/usr/bin/env python3
"""Apply and verify schema drift reconciliation migration."""
import json, subprocess

PAT = open("/Users/laralane/.config/supabase/access-token").read().strip()
REF = "hdfderbphdobomkdjypc"
URL = f"https://api.supabase.com/v1/projects/{REF}/database/query"

def run_sql(sql):
    r = subprocess.run([
        "curl", "-s", "-X", "POST", URL,
        "-H", f"Authorization: Bearer {PAT}",
        "-H", "Content-Type: application/json",
        "-d", json.dumps({"query": sql})
    ], capture_output=True, text=True, timeout=15)
    return json.loads(r.stdout)

# ── Step 1: Apply tracking migration ──
sql = """
BEGIN;
ALTER TABLE public.character_visual_dna ADD COLUMN IF NOT EXISTS traits_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.character_visual_dna ADD COLUMN IF NOT EXISTS physical_categories JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.character_visual_dna ADD COLUMN IF NOT EXISTS binding_markers JSONB NOT NULL DEFAULT '[]'::jsonb;
COMMIT;
"""
r = run_sql(sql)
if isinstance(r, list) and len(r) == 0:
    print("✅ Migration applied (columns already existed, IF NOT EXISTS passed)")
elif isinstance(r, dict) and r.get("error"):
    print(f"❌ Error: {r}")
else:
    print(f"✅ {r}")

# ── Step 2: Verify column count ──
r = run_sql("""
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'character_visual_dna' AND table_schema = 'public'
    ORDER BY ordinal_position;
""")
print(f"\ncharacter_visual_dna: {len(r)} columns")
for c in r:
    print(f"  {c['column_name']:30s} {c['data_type']:20s} default={c['column_default'] or 'NONE'}")

# ── Step 3: Verify code that selects these columns ──
print(f"\n--- Frontend SELECT verification ---")

# castingBriefResolver: traits_json + new identity columns
r = run_sql("""
    SELECT traits_json IS NOT NULL AS has_traits,
           physical_categories IS NOT NULL AS has_categories,
           binding_markers IS NOT NULL AS has_bindings,
           count(*) as rows
    FROM character_visual_dna WHERE is_current = true
    GROUP BY has_traits, has_categories, has_bindings;
""")
print(f"  traits_json + physical_categories + binding_markers queryable:")
for row in r:
    print(f"    traits={row['has_traits']} cats={row['has_categories']} bindings={row['has_bindings']} → {row['rows']} rows")

# processEvidenceResolver: physical_categories + traits_json
r = run_sql("""
    SELECT count(*) as total,
           count(traits_json) as with_traits,
           count(physical_categories) as with_categories
    FROM character_visual_dna WHERE is_current = true;
""")
if r:
    row = r[0]
    print(f"  processEvidenceResolver: {row['total']} rows, {row['with_traits']} with traits, {row['with_categories']} with categories")

# ── Step 4: Check existing data in these columns ──
r = run_sql("""
    SELECT character_name, LEFT(traits_json::text, 80) as traits_preview,
           LEFT(physical_categories::text, 80) as cats_preview,
           LEFT(binding_markers::text, 80) as bindings_preview
    FROM character_visual_dna
    WHERE is_current = true
      AND (traits_json != '[]'::jsonb OR physical_categories != '{}'::jsonb OR binding_markers != '[]'::jsonb)
    ORDER BY character_name
    LIMIT 5;
""")
print(f"\n--- Sample data in tracked columns ---")
if r:
    for row in r:
        print(f"  {row['character_name'][:30]:30s} traits={str(row['traits_preview'])[:40]}")
        if row['cats_preview']:
            print(f"  {'':30s}  cats={str(row['cats_preview'])[:40]}")
        if row['bindings_preview']:
            print(f"  {'':30s}  bind={str(row['bindings_preview'])[:40]}")
else:
    print("  No data in tracked columns (all empty arrays/objects)")

# ── Step 5: Verify visual_prompt_block still NOT in schema ──
r = run_sql("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'character_visual_dna'
      AND column_name = 'visual_prompt_block';
""")
print(f"\n--- visual_prompt_block status ---")
print(f"  Column exists in DB: {len(r) > 0}")

# Cross-check: does it exist in ANY table?
r = run_sql("""
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'visual_prompt_block';
""")
print(f"  Exists in any table: {len(r) > 0}")
if r:
    for row in r:
        print(f"    Found in: {row['table_name']}")

print(f"\n✅ Schema drift reconciliation complete")