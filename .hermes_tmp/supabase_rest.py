#!/usr/bin/env python3
"""Query Supabase via PostgREST (Data API).
Usage: ./supabase_rest.py "projects?select=id,title,pipeline_stage&order=created_at.desc&limit=10"
       ./supabase_rest.py "rpc/function_name" -- POST
"""
import json
import urllib.request
import sys
import re

SUPABASE_URL = "https://hdfderbphdobomkdjypc.supabase.co"

# Read service_role key from .env.local
with open("/Users/laralane/code/iffy/.env.local") as f:
    env = f.read()

m = re.search(r'SUPABASE_SERVICE_ROLE_KEY="([^"]+)"', env)
if not m:
    print("ERROR: Could not find service role key")
    sys.exit(1)

SERVICE_KEY = m.group(1)

path = sys.argv[1] if len(sys.argv) > 1 else "projects?select=id,title&limit=5"
method = "POST" if len(sys.argv) > 2 and sys.argv[2] == "--post" else "GET"

url = f"{SUPABASE_URL}/rest/v1/{path}"
req = urllib.request.Request(url, method=method)
req.add_header("apikey", SERVICE_KEY)
req.add_header("Authorization", f"Bearer {SERVICE_KEY}")
req.add_header("Content-Type", "application/json")

if method == "POST" and len(sys.argv) > 3:
    body = json.dumps(json.loads(sys.argv[3])).encode()
    req.data = body

try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        print(json.dumps(data, indent=2))
except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}: {e.read().decode()}")
except Exception as e:
    print(f"Error: {e}")
