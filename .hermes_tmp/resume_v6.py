#!/usr/bin/env python3
"""Clear stuck chunks in V6 and call generate-document resume."""
import json
import urllib.request
import re

SUPABASE_URL = "https://hdfderbphdobomkdjypc.supabase.co"
DOC_ID = "03ba576b-42cf-46a6-b725-a35fd51563f1"
V6_ID = "c36d3907-ec84-45c1-8b35-4bfbfd9ac8ce"

with open("/Users/laralane/code/iffy/.env.local") as f:
    env = f.read()
m = re.search(r'SUPABASE_SERVICE_ROLE_KEY="([^"]+)"', env)
SERVICE_KEY = m.group(1)

def req(method, path, data=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    r = urllib.request.Request(url, method=method)
    r.add_header("apikey", SERVICE_KEY)
    r.add_header("Authorization", f"Bearer {SERVICE_KEY}")
    r.add_header("Content-Type", "application/json")
    if data is not None:
        r.data = json.dumps(data).encode()
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.read().decode()
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}: {e.read().decode()[:200]}"

# Step 1: Clear scene_020 (running → pending)
print("Step 1: Resetting stuck scene_020...")
r = req("PATCH", f"project_document_chunks?document_id=eq.{DOC_ID}&version_id=eq.{V6_ID}&chunk_key=eq.scene_020", {
    "status": "pending",
    "attempts": 0,
    "error": None
})
print(f"  Result: {r[:100]}")

# Step 2: Reset scene_006 failed_validation → pending so it retries
print("Step 2: Resetting failed scene_006...")
r = req("PATCH", f"project_document_chunks?document_id=eq.{DOC_ID}&version_id=eq.{V6_ID}&chunk_key=eq.scene_006", {
    "status": "pending",
    "attempts": 0,
    "error": None
})
print(f"  Result: {r[:100]}")

# Step 3: Update V6 to have bg_generating=true so resume handler picks it up
print("Step 3: Verifying V6 bg_generating flag...")
r = req("PATCH", f"project_document_versions?id=eq.{V6_ID}", {
    "meta_json": {
        "bg_generating": True,
        "bg_started_at": "2026-05-31T20:30:32.996Z",
        "pd_state": "resume_requested",
        "doc_type": "production_draft"
    }
})
print(f"  Result: {r[:100]}")

# Step 4: Update doc to point to V6
print("Step 4: Pointing document to V6...")
r = req("PATCH", f"project_documents?doc_type=eq.production_draft&project_id=eq.8a62605d-a239-438d-9b31-7c83429cb17c", {
    "latest_version_id": V6_ID
})
print(f"  Result: {r[:100]}")

# Count done chars in V6
r = req("GET", f"project_document_chunks?select=chunk_index,char_count&document_id=eq.{DOC_ID}&version_id=eq.{V6_ID}&status=eq.done&limit=50")
done_chunks = json.loads(r) if r.startswith("[") else []
total = sum(c.get("char_count") or 0 for c in done_chunks)
print(f"\nV6 status: {len(done_chunks)} done chunks, {total} chars, ~{total//5} words, ~{total/5/220:.1f} min")
print(f"Pending: 22 scenes + 1 failed + 1 running (cleared) = 24 to generate")
print(f"\nNext: Call generate-document to resume V6")
print(f"The resume handler will process chunks within 120s budget.")
print(f"Multiple calls may be needed for all 43 scenes.")
