#!/usr/bin/env python3
"""Load Ghost Frequency Production Draft into Supabase."""
import json
import urllib.request
import re
import sys

SUPABASE_URL = "https://hdfderbphdobomkdjypc.supabase.co"
PROJECT_ID = "8a62605d-a239-438d-9b31-7c83429cb17c"
DOC_ID = "03ba576b-42cf-46a6-b725-a35fd51563f1"
USER_ID = "a6c31c79-7837-47d8-b2f0-91d2e0febd76"

# Read service key
with open("/Users/laralane/code/iffy/.env.local") as f:
    env = f.read()
m = re.search(r'SUPABASE_SERVICE_ROLE_KEY="([^"]+)"', env)
SERVICE_KEY = m.group(1)

def supabase(path, method="GET", data=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    req = urllib.request.Request(url, method=method)
    req.add_header("apikey", SERVICE_KEY)
    req.add_header("Authorization", f"Bearer {SERVICE_KEY}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "return=representation")
    if data is not None:
        req.data = json.dumps(data).encode()
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code} on {path}: {e.read().decode()}")
        return None

# Read the production draft
with open("/Users/laralane/.hermes/profiles/trinity/cache/documents/doc_5390e2369df7_Ghost_Frequency_Production_Draft-2026-05-31.md") as f:
    content = f.read()

# Split into scenes by "## BEAT scene_"
scenes_raw = re.split(r'\n(?=## BEAT scene_)', content)

scene_chunks = []
for s in scenes_raw:
    if not s.strip() or not s.startswith("## BEAT scene_"):
        continue
    m = re.search(r'## BEAT scene_(\d+):\s*(.*?)(?:\n|$)', s)
    if m:
        scene_num = m.group(1)
        scene_title = m.group(2).strip()
        # Clean deliverable headers that sometimes appear
        clean = re.sub(r'Deliverable Type:.*?$', '', s, flags=re.MULTILINE)
        clean = re.sub(r'Completion Status:.*?$', '', clean, flags=re.MULTILINE)
        clean = re.sub(r'Completeness Check:.*?$', '', clean, flags=re.MULTILINE)
        clean = clean.strip()
        scene_chunks.append({
            "chunk_key": f"scene_{scene_num}",
            "chunk_index": int(scene_num),
            "content": clean,
            "char_count": len(clean),
            "label": f"Scene {scene_num}: {scene_title}"
        })

# Build full plaintext
full_plaintext = "\n\n".join(sc['content'] for sc in scene_chunks)

print(f"Parsed {len(scene_chunks)} scenes, {len(full_plaintext)} total chars")

# STEP 1: Create version 4
new_version = supabase("project_document_versions", method="POST", data={
    "document_id": DOC_ID,
    "version_number": 4,
    "plaintext": full_plaintext,
    "created_by": USER_ID,
    "label": "Production Draft v4 (Human-written)",
    "deliverable_type": "production_draft",
    "change_summary": "Human-written production draft - 23 scenes"
})
if not new_version or len(new_version) == 0:
    print("FAILED: Version creation")
    sys.exit(1)

version_id = new_version[0]["id"]
print(f"Created version 4: {version_id}")

# STEP 2: Write scene chunks
for sc in scene_chunks:
    chunk_data = {
        "document_id": DOC_ID,
        "version_id": version_id,
        "chunk_index": sc["chunk_index"],
        "chunk_key": sc["chunk_key"],
        "content": sc["content"],
        "char_count": sc["char_count"],
        "status": "done"
    }
    result = supabase("project_document_chunks", method="POST", data=chunk_data)
    if result:
        ok = "✓"
    else:
        ok = "✗"
    print(f"  {ok} {sc['chunk_key']} ({sc['char_count']} chars)")

# STEP 3: Update document's latest_version_id and char_count
update_data = {
    "latest_version_id": version_id,
    "char_count": len(full_plaintext),
    "plaintext": full_plaintext
}
result = supabase(f"project_documents?id=eq.{DOC_ID}", method="PATCH", data=update_data)
if result is not None:
    # PATCH with return=representation returns nothing on success
    print("\n✓ Document updated (latest_version_id, char_count)")
    
    # Verify
    doc = supabase(f"project_documents?id=eq.{DOC_ID}&select=id,doc_type,char_count,latest_version_id")
    if doc:
        print(f"  Verified: char_count={doc[0]['char_count']}, latest_version_id={doc[0]['latest_version_id']}")
else:
    print("\n✗ Document update failed")

print(f"\n✅ DONE. Ghost Frequency Production Draft loaded (v4, {len(full_plaintext)} chars, {len(scene_chunks)} scenes)")
