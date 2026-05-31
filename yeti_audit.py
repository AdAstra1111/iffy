#!/usr/bin/env python3
"""YETI Audit — query all tables for pipeline certification."""
import json, subprocess, re, sys

def api(path):
    """Call Supabase REST API and return parsed JSON."""
    with open('/Users/laralane/code/iffy/.env.local') as f:
        env = f.read()
    srk = re.search(r'SUPABASE_SERVICE_ROLE_KEY="([^"]+)"', env).group(1)
    url = "https://hdfderbphdobomkdjypc.supabase.co"
    full_url = f"{url}/rest/v1/{path}"
    cmd = f"""curl -s '{full_url}' -H 'apikey: {srk}' -H 'Authorization: Bearer {srk}'"""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=15)
    try:
        return json.loads(result.stdout) if result.stdout.strip() else []
    except:
        print(f"  PARSE ERROR: {result.stdout[:200]}", file=sys.stderr)
        return []

PID = "9404a383-5cdc-4f06-92aa-2ca70973c556"

def q(table, params=""):
    """Query table with project_id filter."""
    sep = "&" if params else ""
    return api(f"{table}?project_id=eq.{PID}{sep}{params}")

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

# ========================================================
section("PHASE 1: VISUAL GOVERNANCE INVENTORY")
# ========================================================

print("\n--- Governance Snapshots ---")
gov = q("project_visual_stage_governance", "select=stage_id,computed_status,last_evaluated_at,eligibility_state")
for s in gov:
    el = s.get("eligibility_state", {})
    print(f"  {s['stage_id']:20s} → status={s.get('computed_status','?'):15s} eligible={el.get('eligible',False)} last={s.get('last_evaluated_at','?')[:19]}")

print("\n--- Character Visual DNA ---")
dna = q("character_visual_dna", "select=id,character_key,is_current&order=character_key")
print(f"  Total: {len(dna)}")
current_dna = [d for d in dna if d.get('is_current')]
print(f"  Current: {len(current_dna)}")
for d in current_dna[:5]:
    print(f"    {d['character_key']}")

print("\n--- AI Cast ---")
cast = q("project_ai_cast", "select=character_key,ai_actor_id,character_status")
print(f"  Total: {len(cast)}")
bound = [c for c in cast if c.get('ai_actor_id')]
print(f"  With ai_actor_id: {len(bound)}")
for c in cast[:5]:
    print(f"    {c['character_key']:30s} actor={c.get('ai_actor_id','NONE')[:8] if c.get('ai_actor_id') else 'NONE'}")

print("\n--- AI Actors (anchor status) ---")
actors = q("ai_actors", "select=id,anchor_coverage_status,anchor_coherence_status")
complete = [a for a in actors if a.get('anchor_coverage_status') == 'complete']
coherent = [a for a in actors if a.get('anchor_coherence_status') == 'coherent']
print(f"  Total actors: {len(actors)}")
print(f"  With complete coverage: {len(complete)}")
print(f"  With coherent anchors: {len(coherent)}")

print("\n--- Character Wardrobe Profiles ---")
wardrobe = q("character_wardrobe_profiles", "select=character_key,wardrobe_state,id,character_name&order=character_key")
print(f"  Total profiles: {len(wardrobe)}")
for w in wardrobe:
    print(f"    {w.get('character_name','?'):25s} key={w['character_key']:30s} state={w.get('wardrobe_state','?')}")

print("\n--- Character Identity Packages ---")
cip = q("character_identity_packages", "select=id,character_key,is_current,enabled")
print(f"  Total: {len(cip)}")
for c in cip:
    print(f"    {c['character_key']:30s} is_current={c.get('is_current')} enabled={c.get('enabled')}")

# ========================================================
section("PHASE 2: CANON COVERAGE")
# ========================================================

print("\n--- Project Characters ---")
chars = q("project_characters", "select=id,name,role&order=name")
print(f"  Total characters: {len(chars)}")
for c in chars:
    print(f"    {c['name']:30s} role={c.get('role','?')}")

print("\n--- Atoms ---")
atoms = q("atoms", "select=atom_type&select=count:atom_type")
# Group by atom_type
from collections import Counter
atom_counts = Counter()
for a in (q("atoms", "select=atom_type&limit=1000")):
    atom_counts[a.get('atom_type','?')] += 1
for atype, count in sorted(atom_counts.items()):
    print(f"    {atype:20s}: {count}")

print("\n--- Project Documents ---")
docs = q("project_documents", "select=id,doc_type,title,approval_status,is_current")
current_docs = [d for d in docs if d.get('is_current')]
print(f"  Total: {len(docs)}")
print(f"  Current: {len(current_docs)}")
for d in current_docs:
    print(f"    {d.get('title','?')[:40]:40s} type={d['doc_type']:20s} approval={d.get('approval_status','?')}")

# ========================================================
section("PHASE 4: LOCATION COVERAGE")
# ========================================================

print("\n--- PD Canon Tables ---")
for table in ["pd_world_rules", "pd_design_templates", "pd_location_design", "pd_creature_design", "pd_location_props"]:
    data = q(table, "select=id&limit=10")
    print(f"    {table:25s}: {len(data)} rows")
    if data and len(data) > 0:
        print(f"      IDs: {[d['id'] for d in data[:3]]}")

print("\n--- Visual Sets (all) ---")
sets = q("visual_sets", "select=id,domain,status,target_name&order=domain")
for s in sets:
    print(f"    {s['domain']:35s} status={s['status']:20s} target={s.get('target_name','?')[:25]}")

# ========================================================
section("PHASE 9-12: HERO FRAMES")
# ========================================================

print("\n--- Project Images ---")
images = q("project_images", "select=id,role,asset_group,generation_purpose,curation_state,subject_type,subject,is_active,is_primary&order=asset_group&limit=200")
# Group by asset_group
from collections import Counter
ag_counts = Counter()
for img in images:
    ag = img.get('asset_group', 'none')
    ag_counts[ag] += 1

print(f"  Total images: {len(images)}")
for ag, count in sorted(ag_counts.items()):
    print(f"    {ag:20s}: {count}")

# Hero frames specifically
hf = [i for i in images if i.get('asset_group') == 'hero_frame']
print(f"\n  Hero frames: {len(hf)}")
curated = [i for i in hf if i.get('curation_state') == 'active']
print(f"  Active (curated): {len(curated)}")
for h in hf:
    print(f"    role={h.get('role','?'):20s} curation={h.get('curation_state','?'):15s} subject={h.get('subject','?')[:20]} active={h.get('is_active',False)} primary={h.get('is_primary',False)}")

# ========================================================
section("PLUS: CHARACTER LINKAGE")
# ========================================================

# Check character_visual_dna per character
print("\n--- DNA per character ---")
char_names = {c['name']: c for c in chars}
dna_by_char = {}
for d in current_dna:
    dna_by_char[d['character_key']] = d
for c in chars:
    has_dna = "✅" if c['name'] in dna_by_char else "❌"
    print(f"    {c['name']:30s} DNA={has_dna}")

print(f"\n--- Cast bindings per character ---")
cast_by_char = {}
for c in cast:
    if c.get('ai_actor_id'):
        cast_by_char[c['character_key']] = c['ai_actor_id']
for c in chars:
    has_cast = "YES" if c['name'] in cast_by_char else "NO"
    actor_id = cast_by_char.get(c['name'],'')[:8]
    print(f"    {c['name']:30s} Cast={has_cast} actor={actor_id}")

print(f"\n--- Wardrobe profiles per character ---")
wp_by_char = {}
for w in wardrobe:
    wp_by_char[w['character_key']] = w
for c in chars:
    has_wp = "✅" if c['name'] in wp_by_char else "❌"
    state = wp_by_char.get(c['name'],{}).get('wardrobe_state','')
    print(f"    {c['name']:30s} Wardrobe={has_wp} state={state}")
