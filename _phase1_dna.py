#!/usr/bin/env python3
"""Phase 1 — DNA detail and document audit."""
import json, subprocess, os

os.chdir("/Users/laralane/code/iffy")

# Read service key
svc_key = None
with open(".env.local") as f:
    for line in f:
        if "SUPABASE_SERVICE_ROLE_KEY" in line and "VITE" not in line and "PUBLIC" not in line:
            svc_key = line.split("=", 1)[1].strip().strip('"')
            break
if not svc_key:
    print("ERROR: Could not read service key")
    exit(1)

BASE = "https://hdfderbphdobomkdjypc.supabase.co/rest/v1"

def rest_json(path):
    cmd = ["curl", "-s",
           "-H", "apikey: " + svc_key,
           "-H", "Authorization: Bearer " + svc_key,
           "-H", "Accept: application/json",
           BASE + "/" + path]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    try:
        return json.loads(result.stdout)
    except:
        print("JSON parse error for:", path[:80])
        print(result.stdout[:500])
        return []

pid = "b6ae36fb-805b-4ff5-84ba-91fbccd46334"

# 1. Get ALL visual DNA
cvd = rest_json("character_visual_dna?project_id=eq." + pid + "&limit=10")
print("=== ALL VISUAL DNA RAW ===")
for row in cvd:
    name = row.get("character_name", "?")
    strength = row.get("identity_strength", "?")
    print("\n--- " + name + " (strength=" + strength + ") ---")
    for k, v in row.items():
        if v and v not in ([], {}, "", None):
            val_str = json.dumps(v) if not isinstance(v, str) else v
            if len(val_str) > 500:
                val_str = val_str[:500] + "..."
            print("  " + k + ": " + val_str)

# 2. Check doc types
docs = rest_json("project_documents?project_id=eq." + pid + "&select=doc_type,title,char_count&limit=50")
print("\n\n=== DOC TYPES ===")
seen = set()
for d in docs:
    dt = d.get("doc_type", "?")
    if dt not in seen:
        seen.add(dt)
        cc = d.get("char_count", "?")
        print("  " + dt + " (char_count=" + str(cc) + ")")

# 3. Check for pipeline tables
for tbl in ["nel_orchestrations", "nel_runs", "project_nel_runs", "pipeline_runs", "pipeline_executions"]:
    result = rest_json(tbl + "?limit=1")
    if isinstance(result, list):
        print("\n=== " + tbl + " EXISTS ===")
        if result:
            print("  Columns: " + str(list(result[0].keys())))
        else:
            print("  (empty)")
        break

print("\n=== Done ===")