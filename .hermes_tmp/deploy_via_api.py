#!/usr/bin/env python3
"""Deploy dev-engine-v2 via Supabase Management API."""
import json
import urllib.request
import os

SUPABASE_PROJECT = "hdfderbphdobomkdjypc"
TOKEN_PATH="/Users/laralane/.config/supabase/access-token"

with open(TOKEN_PATH) as f:
    token = f.read().strip()

url = f"https://api.supabase.com/v1/projects/{SUPABASE_PROJECT}/functions"
req = urllib.request.Request(url)
req.add_header("Authorization", f"Bearer {token}")

try:
    with urllib.request.urlopen(req) as resp:
        functions = json.loads(resp.read())
        for fn in functions:
            if fn["name"] == "dev-engine-v2":
                print(f"Name: {fn['name']}")
                print(f"Status: {fn['status']}")
                print(f"Updated: {fn['updated_at']}")
                print(f"Slug: {fn.get('slug', 'N/A')}")
                print(f"Entry: {fn.get('entry_path', 'N/A')}")
except Exception as e:
    print(f"Error: {e}")
