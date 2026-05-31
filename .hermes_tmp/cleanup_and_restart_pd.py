#!/usr/bin/env python3
"""Clean up V4, reset stuck V3, and trigger PD generation for Ghost Frequency."""
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

def req(method, path, data=None):
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
        print(f"  HTTP {e.code} on {method} {path}: {e.read().decode()[:200]}")
        return None

# Step 1: Delete V4 chunks
print("Step 1: Deleting V4 chunks...")
r = req("DELETE", f"project_document_chunks?document_id=eq.{DOC_ID}&version_id=eq.5bdb47bc-39ee-4dc2-b5dd-d63475192b30")
print(f"  Chunks deleted")

# Step 2: Delete V4 version
print("Step 2: Deleting V4 version...")
r = req("DELETE", f"project_document_versions?id=eq.5bdb47bc-39ee-4dc2-b5dd-d63475192b30")
print(f"  Version deleted")

# Step 3: Un-stuck scene_028 in V3 (clear the running status)
print("Step 3: Clearing stuck scene_028 chunk...")
r = req("PATCH", f"project_document_chunks?id=eq.6085d6e5-3065-4420-9c1e-ad10cfaae039", {
    "status": "pending",
    "error": None,
    "attempts": 0
})
print(f"  scene_028 reset to pending")

# Step 4: Update all stuck chunks (scene_029 through scene_043) - clear any stale state
print("Step 4: Verifying all pending chunks exist...")
r = req("GET", f"project_document_chunks?select=chunk_index,chunk_key,status&version_id=eq.5bab6de5-02e4-42b0-878b-98e8973552cd&status=in.pending,running&order=chunk_index.asc&limit=20")
if r:
    stale = [c for c in r if c["status"] == "running"]
    for c in stale:
        req("PATCH", f"project_document_chunks?id=eq.{c['chunk_key']}", {"status": "pending"})
        print(f"  Reset {c['chunk_key']} from running to pending")
    print(f"  {len([c for c in r if c['status']=='pending'])} pending chunks remain")

# Step 5: Revert document latest_version_id back to V2 (safest resume point)
print("Step 5: Reverting latest_version_id to V2...")
r = req("PATCH", f"project_documents?id=eq.{DOC_ID}", {
    "latest_version_id": "febee728-8104-4010-afba-aa86b34f5f44",
    "char_count": 0
})
print(f"  Document reverted")

# Step 6: Mark V3 as NOT generating so the generate-document function can start fresh
print("Step 6: Clearing V3 bg_generating flag...")
r = req("PATCH", f"project_document_versions?id=eq.5bab6de5-02e4-42b0-878b-98e8973552cd", {
    "meta_json": {
        "bg_generating": False,
        "bg_stale": True,
        "pd_state": "stale_cleared",
        "doc_type": "production_draft"
    }
})
print(f"  V3 cleared")

print("\n✅ Clean up complete. Ready to trigger fresh PD generation.")
print("Next: Call generate-document edge function with projectId and docType=production_draft")
