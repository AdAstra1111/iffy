#!/usr/bin/env python3
"""Test generate-document function directly with the same params dev-engine-v2 sends."""
import subprocess
import json
import os

# Get service role key from the supabase config
with open('/Users/laralane/code/iffy/supabase/config.toml') as f:
    for line in f:
        line = line.strip()
        if line.startswith('service_role_key'):
            svc_key = line.split('=')[1].strip().strip('"').strip("'")
            break

project_id = "9348adc6-a22c-4ef4-82c0-eb39dc6e0143"
supabase_url = "https://hdfderbphdobomkdjypc.supabase.co"

# Test payload matching dev-engine-v2's call at line 12568-12577
payload = {
    "projectId": project_id,
    "docType": "feature_script"
}

result = subprocess.run(
    ["curl", "-s", "-w", "\\n%{http_code}", "-X", "POST",
     f"{supabase_url}/functions/v1/generate-document",
     "-H", "Content-Type: application/json",
     "-H", f"Authorization: Bearer {svc_key}",
     "-d", json.dumps(payload)],
    capture_output=True, text=True, timeout=60
)

lines = result.stdout.strip().split('\n')
status = lines[-1]
body = '\n'.join(lines[:-1])

print(f"Status: {status}")
print(f"Response: {body[:2000]}")