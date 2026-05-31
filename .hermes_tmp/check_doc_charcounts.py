#!/usr/bin/env python3
"""Check Ghost Frequency document char_counts and runtimes."""
import json
import urllib.request
import re

SUPABASE_URL = "https://hdfderbphdobomkdjypc.supabase.co"
PROJECT_ID = "8a62605d-a239-438d-9b31-7c83429cb17c"

with open("/Users/laralane/code/iffy/.env.local") as f:
    env = f.read()
m = re.search(r'SUPABASE_SERVICE_ROLE_KEY="([^"]+)"', env)
KEY = m.group(1)

# All project docs
req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/project_documents?select=id,doc_type,title,char_count&project_id=eq.{PROJECT_ID}&order=doc_type.asc"
)
req.add_header("apikey", KEY)
req.add_header("Authorization", f"Bearer {KEY}")
with urllib.request.urlopen(req) as resp:
    docs = json.loads(resp.read())

print("=== GHOST FREQUENCY — ALL DOCUMENTS ===")
for d in docs:
    words_est = d["char_count"] // 5 if d["char_count"] else 0
    runtime = d["char_count"] / 5 / 220 if d["char_count"] else 0
    print(f"  {d['doc_type']:25s}  chars={d['char_count']:>7d}  words~{words_est:>5d}  runtime~{runtime:.1f}min")

# Production Draft versions
req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/project_document_versions?select=id,version_number,char_count&document_id=eq.03ba576b-42cf-46a6-b725-a35fd51563f1&order=version_number.asc&limit=5"
)
req.add_header("apikey", KEY)
req.add_header("Authorization", f"Bearer {KEY}")
with urllib.request.urlopen(req) as resp:
    versions = json.loads(resp.read())

print("\n=== PRODUCTION DRAFT VERSIONS ===")
for v in versions:
    words_est = v["char_count"] // 5 if v.get("char_count") else 0
    runtime = v["char_count"] / 5 / 220 if v.get("char_count") else 0
    brief_id = v["id"][:12]
    print(f"  v{v['version_number']}: {brief_id}... chars={v.get('char_count','?')} words~{words_est} runtime~{runtime:.1f}min")

# Feature Script version info
req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/project_documents?select=id,doc_type,char_count&project_id=eq.{PROJECT_ID}&doc_type=eq.feature_script"
)
req.add_header("apikey", KEY)
req.add_header("Authorization", f"Bearer {KEY}")
with urllib.request.urlopen(req) as resp:
    fs_docs = json.loads(resp.read())
print("\n=== FEATURE SCRIPT ===")
for d in fs_docs:
    print(f"  {d['doc_type']}: {d['char_count']} chars ~ {d['char_count']/5/220:.1f} min")

# Also check the actual version that's the latest
req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/project_documents?select=id,doc_type,latest_version_id,char_count&id=eq.03ba576b-42cf-46a6-b725-a35fd51563f1"
)
req.add_header("apikey", KEY)
req.add_header("Authorization", f"Bearer {KEY}")
with urllib.request.urlopen(req) as resp:
    pd_doc = json.loads(resp.read())
print("\n=== PRODUCTION DRAFT DOCUMENT RECORD ===")
for d in pd_doc:
    print(f"  latest_version_id: {d['latest_version_id']}")
    print(f"  char_count: {d['char_count']}")

# Sum chars from ALL done chunks in v3
req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/project_document_chunks?select=chunk_index,char_count,status&document_id=eq.03ba576b-42cf-46a6-b725-a35fd51563f1&version_id=eq.5bab6de5-02e4-42b0-878b-98e8973552cd&status=eq.done&limit=50"
)
req.add_header("apikey", KEY)
req.add_header("Authorization", f"Bearer {KEY}")
with urllib.request.urlopen(req) as resp:
    v3_done = json.loads(resp.read())

v3_total_chars = sum(c.get("char_count") or 0 for c in v3_done)
print(f"\nV3 actual done chars: {v3_total_chars}")
print(f"V3 est words: {v3_total_chars // 5}")
print(f"V3 runtime @220: {v3_total_chars / 5 / 220:.1f} min")
print(f"V3 scenes done: {len(v3_done)}")
