#!/usr/bin/env python3
"""Call generate-visual-dna-from-canon."""
import json, subprocess, os

os.chdir("/Users/laralane/code/iffy")

svc_key = None
with open(".env.local") as f:
    for line in f:
        if "SUPABASE_SERVICE_ROLE_KEY" in line and "VITE" not in line and "PUBLIC" not in line:
            svc_key = line.split("=", 1)[1].strip().strip('"')
            break

if not svc_key:
    print("ERROR: no svc_key")
    exit(1)

pid = "b6ae36fb-805b-4ff5-84ba-91fbccd46334"
payload = json.dumps({"project_id": pid, "target": "all_characters", "mode": "generate_missing"})

auth_hdr = "Authorization: Bearer " + svc_key
cmd = ["curl", "-s", "-X", "POST",
       "-H", "apikey: " + svc_key,
       "-H", auth_hdr,
       "-H", "Content-Type: application/json",
       "-d", payload,
       "https://hdfderbphdobomkdjypc.supabase.co/functions/v1/generate-visual-dna-from-canon"]

result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
print("EXIT:", result.returncode)
print("STDOUT:", result.stdout[:4000])
if result.stderr:
    print("STDERR:", result.stderr[:500])