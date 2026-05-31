#!/usr/bin/env python3
"""Call edge function directly via urllib/requests."""
import json, urllib.request, os

os.chdir("/Users/laralane/code/iffy")

with open(".env.local") as f:
    for line in f:
        if "SUPABASE_SERVICE_ROLE_KEY" in line and "VITE" not in line and "PUBLIC" not in line:
            svc_key = line.split("=", 1)[1].strip().strip('"')
            break

pid = "b6ae36fb-805b-4ff5-84ba-91fbccd46334"
payload = json.dumps({"project_id": pid, "target": "all_characters", "mode": "refresh_stale"}).encode()

req = urllib.request.Request(
    "https://hdfderbphdobomkdjypc.supabase.co/functions/v1/generate-visual-dna-from-canon",
    data=payload,
    headers={
        "apikey": svc_key,
        "Authorization": "Bearer *** + svc_key,
        "Content-Type": "application/json",
    },
    method="POST",
)

try:
    with urllib.request.urlopen(req, timeout=150) as resp:
        body = resp.read().decode()
        print("STATUS:", resp.status)
        print("BODY:", body[:5000])
except urllib.error.HTTPError as e:
    print("HTTP ERROR:", e.code)
    print("BODY:", e.read().decode()[:3000])
except Exception as e:
    print("ERROR:", str(e)[:500])