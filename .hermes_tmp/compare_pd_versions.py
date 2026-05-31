#!/usr/bin/env python3
"""Compare system-generated PD versions vs user's FS for Ghost Frequency."""
import json
import urllib.request
import re

SUPABASE_URL = "https://hdfderbphdobomkdjypc.supabase.co"
PROJECT_ID = "8a62605d-a239-438d-9b31-7c83429cb17c"
DOC_ID = "03ba576b-42cf-46a6-b725-a35fd51563f1"

with open("/Users/laralane/code/iffy/.env.local") as f:
    env = f.read()
m = re.search(r'SUPABASE_SERVICE_ROLE_KEY="([^"]+)"', env)
KEY = m.group(1)

def get_data(path):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    req = urllib.request.Request(url)
    req.add_header("apikey", KEY)
    req.add_header("Authorization", f"Bearer {KEY}")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

# Version 1 - earliest system generation
v1 = get_data(f"project_document_chunks?select=chunk_index,chunk_key,char_count,status,error&document_id=eq.{DOC_ID}&version_id=eq.5d5e5131-ecf8-4f62-9b82-cb3739b3a81c&order=chunk_index.asc&limit=50")
v1_done = sum(c.get("char_count") or 0 for c in v1 if c["status"] == "done")
print(f"=== SYSTEM-GENERATED PD VERSIONS ===")
print(f"V1 (oldest): {len(v1)} chunks, {v1_done} chars done, {sum(1 for c in v1 if c['error'])} failed")

# Version 2 - middle
v2 = get_data(f"project_document_chunks?select=chunk_index,chunk_key,char_count,status,error&document_id=eq.{DOC_ID}&version_id=eq.febee728-8104-4010-afba-aa86b34f5f44&order=chunk_index.asc&limit=50")
v2_total = sum(c.get("char_count") or 0 for c in v2)
v2_done = [c for c in v2 if c["status"] == "done"]
v2_failed = [c for c in v2 if c["error"]]
v2_pending = [c for c in v2 if c["status"] == "pending"]
print(f"\nV2 (middle):")
print(f"  Chunks: {len(v2)} total")
print(f"  Done: {len(v2_done)}, Failed: {len(v2_failed)}, Pending: {len(v2_pending)}")
print(f"  Total chars: {v2_total}")
print(f"  Indices: {[c['chunk_index'] for c in v2_done]}")
for c in v2_failed:
    print(f"  FAILED idx {c['chunk_index']} ({c['chunk_key']}): {c['error']}")

# Version 3 - last system attempt
v3 = get_data(f"project_document_chunks?select=chunk_index,chunk_key,char_count,status,error&document_id=eq.{DOC_ID}&version_id=eq.5bab6de5-02e4-42b0-878b-98e8973552cd&order=chunk_index.asc&limit=50")
v3_done = [c for c in v3 if c["status"] == "done"]
v3_running = [c for c in v3 if c["status"] == "running"]
v3_pending = [c for c in v3 if c["status"] == "pending"]
v3_total = sum(c.get("char_count") or 0 for c in v3_done)
print(f"\nV3 (last system attempt):")
print(f"  Chunks: {len(v3)} total")
print(f"  Done: {len(v3_done)}, Running: {len(v3_running)}, Pending: {len(v3_pending)}")
print(f"  Total chars (done): {v3_total}")
print(f"  Est words (done): ~{v3_total // 5}")
print(f"  Est runtime: ~{v3_total / 5 / 220:.1f} min")

# User-loaded V4
v4 = get_data(f"project_document_chunks?select=chunk_index,chunk_key,char_count,status&document_id=eq.{DOC_ID}&version_id=eq.5bdb47bc-39ee-4dc2-b5dd-d63475192b30&order=chunk_index.asc&limit=50")
v4_total = sum(c.get("char_count") or 0 for c in v4)
v4_done = [c for c in v4 if c["status"] == "done"]
print(f"\nV4 (user-loaded):")
print(f"  Chunks: {len(v4_done)} done")
print(f"  Total chars: {v4_total}")
print(f"  Est words: ~{v4_total // 5}")
print(f"  Est runtime: ~{v4_total / 5 / 220:.1f} min")

# Compare with FS
with open("/Users/laralane/.hermes/profiles/trinity/cache/documents/doc_385c4e90f2bc_Ghost_Frequency_Feature_Script-2026-05-31.md") as f:
    fs = f.read()
fs_words = len(fs.split())
fs_chars = len(fs)
fs_scenes = len(re.findall(r"^(?:INT\.|EXT\.)", fs, re.MULTILINE))

print(f"\n=== FEATURE SCRIPT (reference) ===")
print(f"  Words: {fs_words}")
print(f"  Chars: {fs_chars}")
print(f"  INT/EXT scenes: {fs_scenes}")
print(f"  Runtime @220: {fs_words/220:.1f} min")

# What the PD SHOULD be
print(f"\n=== EXPECTATION ===")
print(f"PD should contain ALL {fs_scenes} FS scenes + beat structure")
print(f"PD should have >= {fs_words} words (more with beat markers)")
print(f"PD runtime should be >= {fs_words/220:.1f} min")
print(f"V4 PD has {v4_total // 5} est words -- {100*(v4_total//5)/fs_words:.0f}% of FS")
