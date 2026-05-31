#!/usr/bin/env python3
"""Phase 1 — Concrete Angels Visual DNA Audit."""
import json, subprocess, os

os.chdir("/Users/laralane/code/iffy")

with open(".env.local") as f:
    for line in f:
        if "SUPABASE_SERVICE_ROLE_KEY" in line and "VITE" not in line and "PUBLIC" not in line:
            svc_key = line.split("=", 1)[1].strip().strip('"')
            break

BASE = "https://hdfderbphdobomkdjypc.supabase.co/rest/v1"

def rest_json(path):
    cmd = ["curl", "-s", "-H", f"apikey: {svc_key}", "-H", f"Authorization: Bearer {svc_key}", "-H", "Accept: application/json",
           f"{BASE}/{path}"]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    try:
        return json.loads(result.stdout)
    except:
        return {"raw": result.stdout[:2000]}

pid = "b6ae36fb-805b-4ff5-84ba-91fbccd46334"

# 1. Check character_visual_dna
cvd = rest_json(f"character_visual_dna?project_id=eq.{pid}&select=id,character_name,version_number,is_current,identity_strength,created_at")
print("=== CHARACTER VISUAL DNA ===")
print(json.dumps(cvd, indent=2, default=str))

# 2. Check project_characters for this project
chars = rest_json(f"project_characters?project_id=eq.{pid}&select=id,name,role,archetype,created_at")
print("\n=== PROJECT CHARACTERS ===")
print(json.dumps(chars, indent=2, default=str))

# 3. Check what documents exist
docs = rest_json(f"project_documents?project_id=eq.{pid}&select=id,doc_type,version_number,is_current,approval_status,created_at&order=created_at.desc&limit=50")
print("\n=== PROJECT DOCUMENTS ===")
print(json.dumps(docs, indent=2, default=str))

# 4. Check NEL orchestrator runs
nel = rest_json(f"nel_orchestration?project_id=eq.{pid}&select=id,status,stage,created_at,completed_at&order=created_at.desc&limit=20")
print("\n=== NEL ORCHESTRATION ===")
print(json.dumps(nel, indent=2, default=str))