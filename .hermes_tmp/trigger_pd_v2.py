#!/usr/bin/env python3
"""Trigger Ghost Frequency PD generation via auto-run job route."""
import json
import urllib.request
import re

SUPABASE_URL = "https://hdfderbphdobomkdjypc.supabase.co"

with open("/Users/laralane/code/iffy/.env.local") as f:
    env = f.read()
m = re.search(r'SUPABASE_SERVICE_ROLE_KEY="([^"]+)"', env)
SERVICE_KEY = m.group(1)

PROJECT_ID = "8a62605d-a239-438d-9b31-7c83429cb17c"

# Step 1: Enable autorun so the pipeline runs
# Step 2: Call generate-document with service key in bg mode

body = json.dumps({
    "projectId": PROJECT_ID,
    "docType": "production_draft",
    "bg": True  # Try background mode hint
}).encode()

req = urllib.request.Request(
    f"{SUPABASE_URL}/functions/v1/generate-document",
    data=body,
    headers={
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
)

try:
    with urllib.request.urlopen(req, timeout=180) as resp:
        result = json.loads(resp.read())
        print("RESULT:")
        print(json.dumps(result, indent=2))
except urllib.error.HTTPError as e:
    error_body = e.read().decode()
    print(f"HTTP {e.code}: {error_body[:2000]}")
except Exception as e:
    print(f"Error: {e}")
