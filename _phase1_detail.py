#!/usr/bin/env python3
"""Phase 1 continued — Detailed audit."""
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

# 1. Full visual DNA data for each character
for char_name in ["Sarah Chen", "Marcus Cole", "Captain Reyes", "The Architect"]:
    dna = rest_json(f"character_visual_dna?project_id=eq.{pid}&character_name=eq.{char_name}&is_current=eq.true&select=id,character_name,identity_strength,inferred_guidance,locked_invariants,flexible_axes,identity_signature&limit=1")
    print(f"=== FULL DNA: {char_name} ===")
    print(json.dumps(dna, indent=2, default=str)[:2000])
    print()

# 2. Check character_identity_packages
cip = rest_json(f"character_identity_packages?project_id=eq.{pid}")
print("=== CHARACTER IDENTITY PACKAGES ===")
print(json.dumps(cip, indent=2, default=str))

# 3. Check project_characters columns
chars = rest_json(f"project_characters?project_id=eq.{pid}&limit=3")
print("\n=== PROJECT CHARACTERS (raw, no column filter) ===")
print(json.dumps(chars, indent=2, default=str)[:2000])

# 4. Check project_documents columns
pdocs = rest_json(f"project_documents?project_id=eq.{pid}&limit=3")
print("\n=== PROJECT DOCUMENTS (raw) ===")
print(json.dumps(pdocs, indent=2, default=str)[:3000])