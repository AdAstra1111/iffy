#!/usr/bin/env python3
"""Trigger Ghost Frequency Production Draft generation via edge function (service role)."""
import json
import urllib.request
import re

SUPABASE_URL = "https://hdfderbphdobomkdjypc.supabase.co"

with open("/Users/laralane/code/iffy/.env.local") as f:
    env = f.read()
m = re.search(r'SUPABASE_SERVICE_ROLE_KEY="([^"]+)"', env)
SERVICE_KEY = m.group(1)

body = json.dumps({
    "projectId": "8a62605d-a239-438d-9b31-7c83429cb17c",
    "docType": "production_draft"
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
    with urllib.request.urlopen(req, timeout=300) as resp:
        result = json.loads(resp.read())
        print("RESULT:")
        print(json.dumps(result, indent=2))
except urllib.error.HTTPError as e:
    error_body = e.read().decode()
    print(f"HTTP {e.code}: {error_body[:2000]}")
except Exception as e:
    print(f"Error: {e}")
