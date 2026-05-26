#!/usr/bin/env python3
"""
CHARACTER IDENTITY PIPELINE VERIFICATION

Checks:
1. Structured identity fields on character_visual_dna for 4 YETI characters
2. buildVisualPromptBlock output derived from structured fields
3. No visual_prompt_block references remain
4. No image/actor side effects

Project: 9404a383-5cdc-4f06-92aa-2ca70973c556 (YETI)
"""
import json, subprocess, sys

PAT = open("/Users/laralane/.config/supabase/access-token").read().strip()
REF = "hdfderbphdobomkdjypc"
URL = f"https://api.supabase.com/v1/projects/{REF}/database/query"
YETI = "9404a383-5cdc-4f06-92aa-2ca70973c556"

def sql(q):
    r = subprocess.run([
        "curl", "-s", "-X", "POST", URL,
        "-H", f"Authorization: Bearer {PAT}",
        "-H", "Content-Type: application/json",
        "-d", json.dumps({"query": q})
    ], capture_output=True, text=True, timeout=15)
    return json.loads(r.stdout)

# ── 1. Structured identity fields ──
chars = ["Bill Blackstone", "Kristina Pavlichenko", "Yeti", "Enki"]
print("=" * 70)
print("  1. STRUCTURED IDENTITY FIELDS ON character_visual_dna")
print("=" * 70)

for cname in chars:
    rows = sql(f"""
        SELECT biological_sex, gender_presentation, age_range, ethnicity,
               body_type, height_class, facial_archetype, voice_quality,
               wardrobe_signals, social_class, role_archetype,
               identity_strength, identity_evidence, identity_confidence,
               identity_inference_type, user_override
        FROM character_visual_dna
        WHERE project_id = '{YETI}'
          AND character_name ILIKE '%{cname.replace(' ','%')}%'
          AND is_current = true
        ORDER BY version_number DESC;
    """)
    
    # Find the most specific match (longest name match)
    if not rows:
        print(f"\n  ❌ {cname}: NOT FOUND")
        continue
    
    matched = None
    for r in rows:
        # Check against DB — the raw name isn't in the result, need separate query
        pass
    
    # Re-query with exact name from a name lookup
    names = sql(f"""
        SELECT character_name FROM character_visual_dna
        WHERE project_id = '{YETI}'
          AND character_name ILIKE '%{cname.replace(' ','%')}%'
          AND is_current = true
        ORDER BY CASE WHEN character_name = '{cname}' THEN 0 ELSE 1 END, LENGTH(character_name) DESC
        LIMIT 1;
    """)
    
    if not names:
        print(f"\n  ❌ {cname}: NOT FOUND")
        continue
    
    exact_name = names[0]['character_name']
    
    row = sql(f"""
        SELECT biological_sex, gender_presentation, age_range, ethnicity,
               body_type, height_class, facial_archetype, voice_quality,
               wardrobe_signals, social_class, role_archetype,
               identity_strength, identity_evidence, identity_confidence,
               identity_inference_type
        FROM character_visual_dna
        WHERE project_id = '{YETI}'
          AND character_name = '{exact_name.replace("'","''")}'
          AND is_current = true
        LIMIT 1;
    """)
    
    if not row:
        print(f"\n  ❌ {cname}: NOT FOUND (resolved to '{exact_name}')")
        continue
    
    r = row[0]
    print(f"\n  ── {cname} (resolved: '{exact_name}') [strength={r['identity_strength']}] ──")
    
    # Structured fields
    fields = [
        ("biological_sex", "Sex"), ("gender_presentation", "Gender"),
        ("age_range", "Age"), ("ethnicity", "Ethnicity"),
        ("body_type", "Body"), ("height_class", "Height"),
        ("facial_archetype", "Face"), ("voice_quality", "Voice"),
        ("wardrobe_signals", "Wardrobe"), ("social_class", "Class"),
        ("role_archetype", "Role"),
    ]
    for key, label in fields:
        val = r.get(key)
        if val is None or val == [] or val == {}:
            print(f"    {label:12s} ❌ NULL")
        elif isinstance(val, list):
            print(f"    {label:12s} ✅ {', '.join(str(v) for v in val)}")
        elif isinstance(val, dict) and len(val) > 0:
            items = ", ".join(f"{k}={v.get('value','?')}" for k, v in val.items() if isinstance(v, dict))
            print(f"    {label:12s} ✅ {items[:80]}")
        else:
            print(f"    {label:12s} ✅ {str(val)[:60]}")
    
    # Evidence tracking
    ev = r.get('identity_evidence') or {}
    conf = r.get('identity_confidence') or {}
    inf = r.get('identity_inference_type') or {}
    
    if ev:
        print(f"    Evidence:     {json.dumps(ev)[:80]}")
    if conf:
        print(f"    Confidence:   {json.dumps(conf)[:80]}")
    if inf:
        print(f"    Inference:    {json.dumps(inf)[:80]}")
    
    # Check for weak mappings
    weaknesses = []
    if r.get('age_range') and r['age_range'] in ('age', 'age estimate', 'ancient age', 'eyes'):
        weaknesses.append(f"age='{r['age_range']}' generic")
    if r.get('facial_archetype') and r['facial_archetype'] in ('eyes', 'eyes.', 'eyes hold wisdom'):
        weaknesses.append(f"face='{r['facial_archetype']}' generic")
    
    if weaknesses:
        print(f"    ⚠️  Weak mappings: {'; '.join(weaknesses)}")

# ── 2. Prompt block derivation ──
print(f"\n{'='*70}")
print("  2. PROMPT BLOCK DERIVATION (via buildVisualPromptBlock)")
print("="*70)

# Read and execute the TypeScript function via Node
print("\n  Testing buildVisualPromptBlock via Node import...")
r = subprocess.run([
    "node", "-e", """
const { buildVisualPromptBlock } = require('./src/lib/visual/buildVisualPromptBlock');

// Test with structured data
const testCases = [
  {
    name: 'Full structured',
    row: {
      gender_presentation: 'female',
      age_range: '30s-40s',
      body_type: 'athletic',
      facial_archetype: 'sharp features',
      voice_quality: 'melodic',
      wardrobe_signals: { style: { value: 'tailored formal' } },
      role_archetype: 'protector',
      traits_json: [{ label: 'determined', category: 'personality' }],
      identity_signature: { hair: 'dark brown', skin: 'fair' }
    }
  },
  {
    name: 'Minimal (empty)',
    row: {}
  },
  {
    name: 'Null row',
    row: null
  },
  {
    name: 'Legacy-only',
    row: {
      identity_signature: { face: 'weathered', body: { build: 'lean' }, silhouette: { posture: 'erect' } }
    }
  }
];

for (const tc of testCases) {
  const result = buildVisualPromptBlock(tc.row);
  console.log(`\\n  ── ${tc.name} ──`);
  console.log(`  Output: "${result}"`);
  console.log(`  Length: ${result.length}`);
}
"""], capture_output=True, text=True, timeout=15, cwd="/Users/laralane/code/iffy")
print(r.stdout)
if r.stderr:
    print(f"  STDERR: {r.stderr[:300]}")

# ── 3. visual_prompt_block grep ──
print(f"\n{'='*70}")
print("  3. VISUAL_PROMPT_BLOCK LEFTOVERS")
print("="*70)

r = subprocess.run([
    "grep", "-rn", "visual_prompt_block", "--include=*.ts", "--include=*.tsx",
    "/Users/laralane/code/iffy/src"
], capture_output=True, text=True, timeout=10)
lines = [l for l in r.stdout.split('\n') if l.strip() and 'comment' not in l.lower() and 'replaces phantom' not in l.lower()]
print(f"  Live references: {len(lines)}")
for l in lines:
    print(f"    {l[:120]}")

# ── 4. Side effects check ──
print(f"\n{'='*70}")
print("  4. NO IMAGE/ACTOR SIDE EFFECTS")
print("="*70)

r = sql(f"SELECT count(*) as n FROM project_ai_cast WHERE project_id = '{YETI}';")
print(f"  AI Cast bindings: {r[0]['n']}")

r = sql(f"SELECT count(*) as n FROM project_images WHERE project_id = '{YETI}' AND created_at > now() - interval '2 hours';")
print(f"  Images created (last 2h): {r[0]['n']}")

r = sql(f"SELECT count(*) as n FROM character_visual_dna WHERE project_id = '{YETI}' AND created_at > now() - interval '2 hours';")
print(f"  DNA rows created (last 2h): {r[0]['n']}")

# ── 5. Total field population stats ──
print(f"\n{'='*70}")
print("  5. FIELD POPULATION (54 current rows, all projects)")
print("="*70)

stats = sql("""
    SELECT
        COUNT(*) AS total,
        COUNT(biological_sex) AS sex,
        COUNT(NULLIF(gender_presentation, '')) AS gender,
        COUNT(NULLIF(age_range, '')) AS age,
        COUNT(ethnicity) AS ethnicity,
        COUNT(NULLIF(body_type, '')) AS body,
        COUNT(NULLIF(height_class, '')) AS height,
        COUNT(NULLIF(facial_archetype, '')) AS face,
        COUNT(NULLIF(voice_quality, '')) AS voice,
        COUNT(NULLIF(wardrobe_signals::text, '{}')) AS wardrobe,
        COUNT(NULLIF(social_class, '')) AS social,
        COUNT(NULLIF(role_archetype, '')) AS role,
        COUNT(NULLIF(identity_evidence::text, '{}')) AS evidence
    FROM character_visual_dna WHERE is_current = true
""")[0]

for k, v in stats.items():
    print(f"  {k:15s} {v}")

print(f"\n{'='*70}")
print("  VERIFICATION COMPLETE")
print("="*70)