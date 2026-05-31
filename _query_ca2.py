#!/usr/bin/env python3
"""Query Concrete Angels project state - fixed column names."""
import json, subprocess, os, urllib.parse

os.chdir("/Users/laralane/code/iffy")

with open(".env.local") as f:
    for line in f:
        if "SUPABASE_SERVICE_ROLE_KEY" in line and "VITE" not in line and "PUBLIC" not in line:
            svc_key = line.split("=", 1)[1].strip().strip('"')
            break

headers = [
    "apikey: " + svc_key,
    "Authorization: Bearer " + svc_key,
    "Accept: application/json",
]

headers_args = []
for h in headers:
    headers_args.extend(["-H", h])

def rest_get(path):
    url = "https://hdfderbphdobomkdjypc.supabase.co/rest/v1/" + path
    cmd = ["curl", "-s"] + headers_args + [url]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    return result.stdout

def rest_json(path):
    raw = rest_get(path)
    return json.loads(raw)

pid = "b6ae36fb-805b-4ff5-84ba-91fbccd46334"

# 1. Check character_visual_dna schema
cvd = rest_get(f"character_visual_dna?project_id=eq.{pid}&limit=5")
print("=== CHARACTER VISUAL DNA ===")
print(cvd[:2000] if len(cvd) > 2000 else cvd)

# 2. Check project_documents
pdocs = rest_get(f"project_documents?project_id=eq.{pid}&select=id,doc_type,created_at,is_current,approval_status&limit=20")
print("\n=== PROJECT DOCUMENTS (select fields) ===")
try:
    data = json.loads(pdocs)
    print(json.dumps(data, indent=2, default=str)[:3000])
except:
    print(pdocs[:2000])

# 3. Check what tables exist - query pg_catalog
tables = rest_get(f"project_documents?project_id=eq.{pid}&select=doc_type&limit=20&distinct=on(doc_type)")
print("\n=== DOCUMENT TYPES ===")
try:
    data = json.loads(tables)
    print(json.dumps(data, indent=2, default=str))
except:
    print(tables[:2000])
