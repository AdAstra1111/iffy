#!/usr/bin/env python3
"""Check pipeline state."""
import json, subprocess, os

os.chdir("/Users/laralane/code/iffy")

svc_key = None
with open(".env.local") as f:
    for line in f:
        if "SUPABASE_SERVICE_ROLE_KEY" in line and "VITE" not in line and "PUBLIC" not in line:
            svc_key = line.split("=", 1)[1].strip().strip('"')
            break

BASE = "https://hdfderbphdobomkdjypc.supabase.co/rest/v1"
AUTH = "Authorization: Bearer " + svc_key

def rest_json(path):
    cmd = ["curl", "-s",
           "-H", "apikey: " + svc_key,
           "-H", AUTH,
           "-H", "Accept: application/json",
           BASE + "/" + path]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    try:
        return json.loads(result.stdout)
    except:
        print("JSON parse error:", result.stdout[:300])
        return []

pid = "b6ae36fb-805b-4ff5-84ba-91fbccd46334"

iters = rest_json("dev_engine_iterations?project_id=eq." + pid + "&order=created_at.desc&limit=5")
print("=== DEV ENGINE ITERATIONS ===")
print(json.dumps(iters, indent=2, default=str)[:3000])

for tbl in ["project_pipeline_state", "pipeline_state", "project_stages", "pipeline_stages"]:
    result = rest_json(tbl + "?limit=1")
    if isinstance(result, list):
        print("\n=== " + tbl + " ===")
        print(json.dumps(result[:2], indent=2, default=str)[:1000])
        break