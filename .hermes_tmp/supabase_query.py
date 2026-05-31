#!/usr/bin/env python3
"""Query Supabase database via Management API."""
import json
import urllib.request
import sys

PROJECT_REF = "hdfderbphdobomkdjypc"

with open("/Users/laralane/.config/supabase/access-token") as f:
    token = f.read().strip()

query = sys.argv[1] if len(sys.argv) > 1 else "SELECT 1;"

req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
    data=json.dumps({"query": query}).encode(),
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    },
)

try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        print(json.dumps(data, indent=2))
except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}: {e.read().decode()}")
except Exception as e:
    print(f"Error: {e}")
