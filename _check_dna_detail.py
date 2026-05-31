#!/usr/bin/env python3
"""Check DNA data for specific characters - using enn var passthrough"""
import json, subprocess, os, sys

os.chdir("/Users/laralane/code/iffy")

with open(".env.local") as f:
    for line in f:
        if "SUPABASE_SERVICE_ROLE_KEY" in line and "VITE" not in line and "PUBLIC" not in line:
            k = line.split("=", 1)[1].strip().strip('"')
            os.environ["SVC_KEY"] = k
            break

BASE = "https://hdfderbphdobomkdjypc.supabase.co/rest/v1"

def rest_json(path):
    cmd = ["curl", "-s",
           "-H", "apikey: $SVC_KEY",
           "-H", "Authorization: Bearer ***           "-H", "Accept: application/json",
           BASE + "/" + path]
    result = subprocess.run(["bash", "-c", " ".join(cmd + ["2>&1"])], capture_output=True, text=True, timeout=15, env=os.environ)
    try:
        return json.loads(result.stdout)
    except:
        print("PARSE ERROR:", result.stdout[:300])
        return []

pid = "b6ae36fb-805b-4ff5-84ba-91fbccd46334"

# Get ALL fields for Sarah Chen
sc = rest_json("character_visual_dna?project_id=eq." + pid + "&character_name=eq.Sarah%20Chen&is_current=eq.true&limit=1")
print("=== SARAH CHEN FULL DNA ===")
for row in sc:
    for k, v in row.items():
        if k not in ["id", "project_id", "created_at", "created_by", "is_current", "version_number", "character_name"]:
            val = json.dumps(v) if not isinstance(v, str) else v
            if len(val) > 600:
                val = val[:600] + "..."
            print("  " + k + ": " + val)

# Get ALL fields for The Architect
ta = rest_json("character_visual_dna?project_id=eq." + pid + "&character_name=eq.The%20Architect&is_current=eq.true&limit=1")
print("\n=== THE ARCHITECT FULL DNA ===")
for row in ta:
    for k, v in row.items():
        if k not in ["id", "project_id", "created_at", "created_by", "is_current", "version_number", "character_name"]:
            val = json.dumps(v) if not isinstance(v, str) else v
            if len(val) > 600:
                val = val[:600] + "..."
            print("  " + k + ": " + val)