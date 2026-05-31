#!/usr/bin/env python3
"""Create V5 with all 43 scene chunks from V3 structure, pre-populate done chunks."""
import json
import urllib.request
import re

SUPABASE_URL = "https://hdfderbphdobomkdjypc.supabase.co"
DOC_ID = "03ba576b-42cf-46a6-b725-a35fd51563f1"
V3_ID = "5bab6de5-02e4-42b0-878b-98e8973552cd"
USER_ID = "a6c31c79-7837-47d8-b2f0-91d2e0febd76"

with open("/Users/laralane/code/iffy/.env.local") as f:
    env = f.read()
m = re.search(r'SUPABASE_SERVICE_ROLE_KEY="([^"]+)"', env)
KEY = m.group(1)

def reql(method, path, data=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    r = urllib.request.Request(url, method=method)
    r.add_header("apikey", KEY)
    r.add_header("Authorization", f"Bearer {KEY}")
    r.add_header("Content-Type", "application/json")
    r.add_header("Prefer", "return=representation")
    if data is not None:
        r.data = json.dumps(data).encode()
    try:
        with urllib.request.urlopen(r) as resp:
            body = resp.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f"  HTTP {e.code}: {err[:200]}")
        return None

# Step 1: Get all V3 chunks with their content and metadata
print("Step 1: Fetching V3 chunks...")
v3_chunks = reql("GET", f"project_document_chunks?select=chunk_index,chunk_key,content,char_count,status,meta_json&version_id=eq.{V3_ID}&document_id=eq.{DOC_ID}&order=chunk_index.asc&limit=60")
if not v3_chunks:
    print("ERROR: Could not fetch V3 chunks")
    exit(1)
print(f"  Found {len(v3_chunks)} chunks")

# Count done/pending
done = [c for c in v3_chunks if c["status"] == "done" and c.get("content")]
pending = [c for c in v3_chunks if c["status"] != "done" or not c.get("content")]
print(f"  Done: {len(done)}, Pending: {len(pending)}")
total_done_chars = sum(c.get("char_count") or 0 for c in done)
print(f"  Total chars in done chunks: {total_done_chars}")

# Step 2: Create V5 version
print("\nStep 2: Creating V5 version...")
v5 = reql("POST", "project_document_versions", {
    "document_id": DOC_ID,
    "version_number": 5,
    "plaintext": "",
    "created_by": USER_ID,
    "deliverable_type": "production_draft",
    "change_summary": "Fresh PD generation from feature script",
    "meta_json": {
        "bg_generating": True,
        "bg_started_at": None,
        "pd_state": "setup",
        "doc_type": "production_draft"
    }
})
if not v5:
    print("ERROR: V5 creation failed")
    exit(1)
v5_id = v5[0]["id"]
print(f"  Created V5: {v5_id}")

# Step 3: Copy all done V3 chunks to V5
print(f"\nStep 3: Copying {len(done)} done chunks with content...")
for i, c in enumerate(done):
    result = reql("POST", "project_document_chunks", {
        "document_id": DOC_ID,
        "version_id": v5_id,
        "chunk_index": c["chunk_index"],
        "chunk_key": c["chunk_key"],
        "content": c["content"],
        "char_count": c.get("char_count") or len(c.get("content","")),
        "status": "done",
        "meta_json": c.get("meta_json") or {
            "label": f"Scene {c['chunk_index']+1}",
            "strategy": "beat_sequential"
        }
    })
    if i < 3 or i >= len(done) - 2:
        print(f"  ✓ scene_{str(c['chunk_index']+1).zfill(3)} (done)")
print(f"  ... {len(done)} chunks copied")

# Step 4: Create pending chunks for scenes not yet generated
print(f"\nStep 4: Creating {len(pending)} pending chunks...")
for c in pending:
    scene_num = c["chunk_index"] + 1
    label = f"Scene {scene_num}"
    if c.get("meta_json") and c["meta_json"].get("label"):
        label = c["meta_json"]["label"]
    
    result = reql("POST", "project_document_chunks", {
        "document_id": DOC_ID,
        "version_id": v5_id,
        "chunk_index": c["chunk_index"],
        "chunk_key": c["chunk_key"],
        "content": None,
        "char_count": None,
        "status": "pending",
        "meta_json": {
            "label": label,
            "strategy": "beat_sequential"
        }
    })
    if c["chunk_index"] <= 26 or c["chunk_index"] >= len(v3_chunks) - 2:
        print(f"  ○ scene_{str(scene_num).zfill(3)} (pending, {label[:50]})")

# Step 5: Update doc record to point to V5
print("\nStep 5: Updating document to point to V5...")
# First build the assembled plaintext from done chunks
done_sorted = sorted(done, key=lambda x: x["chunk_index"])
plaintext_parts = []
for c in done_sorted:
    pt = c.get("content") or ""
    if pt.strip():
        plaintext_parts.append(pt)
partial_plaintext = "\n\n=====\n\n".join(plaintext_parts)

reql("PATCH", f"project_documents?id=eq.{DOC_ID}", {
    "latest_version_id": v5_id,
    "char_count": len(partial_plaintext)
})

# Also update V5's plaintext with what we have so far
reql("PATCH", f"project_document_versions?id=eq.{v5_id}", {
    "plaintext": partial_plaintext
})

print(f"  V5 set as latest. Partial plaintext: {len(partial_plaintext)} chars")

# Step 6: Clear V3's bg_generating flag
print("\nStep 6: Clearing V3 bg_generating...")
reql("PATCH", f"project_document_versions?id=eq.{V3_ID}", {
    "meta_json": {
        "bg_generating": False,
        "bg_stale": True,
        "pd_state": "superseded_by_v5",
        "doc_type": "production_draft"
    }
})

print(f"\n✅ V5 ready with {len(done)} done chunks + {len(pending)} pending chunks")
print(f"   Version ID: {v5_id}")
print(f"   Next: Call generate-document to resume V5")
print(f"   The resume handler will process the {len(pending)} pending chunks within 120s budget")
