#!/usr/bin/env python3
"""Count V6 chunk statuses for Ghost Frequency PD."""
import json
import urllib.request
import re

SUPABASE_URL = "https://hdfderbphdobomkdjypc.supabase.co"
DOC_ID = "03ba576b-42cf-46a6-b725-a35fd51563f1"
V6_ID = "c36d3907-ec84-45c1-8b35-4bfbfd9ac8ce"

with open("/Users/laralane/code/iffy/.env.local") as f:
    env = f.read()
m = re.search(r'SUPABASE_SERVICE_ROLE_KEY="([^"]+)"', env)
KEY = m.group(1)

url = f"{SUPABASE_URL}/rest/v1/project_document_chunks?select=chunk_index,chunk_key,status,char_count&document_id=eq.{DOC_ID}&version_id=eq.{V6_ID}&order=chunk_index.asc&limit=50"
req = urllib.request.Request(url)
req.add_header("apikey", KEY)
req.add_header("Authorization", f"Bearer {KEY}")
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read())

done = [c for c in data if c["status"] == "done" and c.get("char_count")]
running = [c for c in data if c["status"] == "running"]
pending = [c for c in data if c["status"] == "pending"]
failed = [c for c in data if c["status"] == "failed_validation"]
total_chars = sum(c.get("char_count") or 0 for c in done)

print(f"V6 Production Draft status:")
print(f"  Total chunks: {len(data)}")
print(f"  Done (with content): {len(done)}")
print(f"  Running: {len(running)}")
print(f"  Pending: {len(pending)}")
print(f"  Failed: {len(failed)}")
print(f"  Total chars: {total_chars}")
print(f"  Est runtime @220: {total_chars/5/220:.1f} min")
if done:
    print(f"  Scene range: {done[0]['chunk_key']} → {done[-1]['chunk_key']}")
if pending:
    print(f"  First pending: {pending[0]['chunk_key']}")
if running:
    print(f"  Stuck at: {running[0]['chunk_key']}")
if failed:
    print(f"  Failed: {[c['chunk_key'] for c in failed]}")
