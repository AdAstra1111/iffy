#!/usr/bin/env python3
"""Iterative PD generation — fixed logic. Clear stuck, resume, repeat until all 43 done."""
import json
import urllib.request
import re
import time
import sys

SUPABASE_URL = "https://hdfderbphdobomkdjypc.supabase.co"
DOC_ID = "03ba576b-42cf-46a6-b725-a35fd51563f1"
V6_ID = "c36d3907-ec84-45c1-8b35-4bfbfd9ac8ce"

with open("/Users/laralane/code/iffy/.env.local") as f:
    env = f.read()
m = re.search(r'SUPABASE_SERVICE_ROLE_KEY="([^"]+)"', env)
SERVICE_KEY = m.group(1)

def rest(method, path, data=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    r = urllib.request.Request(url, method=method)
    r.add_header("apikey", SERVICE_KEY)
    r.add_header("Authorization", f"Bearer {SERVICE_KEY}")
    r.add_header("Content-Type", "application/json")
    if data is not None:
        r.data = json.dumps(data).encode()
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            body = resp.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        return None

def call_generate():
    body = json.dumps({"projectId":"8a62605d-a239-438d-9b31-7c83429cb17c","docType":"production_draft"}).encode()
    r = urllib.request.Request(f"{SUPABASE_URL}/functions/v1/generate-document", data=body, headers={
        "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(r, timeout=180) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}"
    except Exception as e:
        return str(e)

def get_status():
    chunks = rest("GET", f"project_document_chunks?select=chunk_index,chunk_key,status,char_count&document_id=eq.{DOC_ID}&version_id=eq.{V6_ID}&order=chunk_index.asc&limit=50")
    if not chunks:
        return None
    done = [c for c in chunks if c["status"] == "done" and c.get("char_count")]
    running = [c for c in chunks if c["status"] == "running"]
    pending = [c for c in chunks if c["status"] == "pending"]
    failed = [c for c in chunks if c["status"] == "failed_validation"]
    total_chars = sum(c.get("char_count") or 0 for c in done)
    return {
        "total": len(chunks), "done": len(done), "running": len(running),
        "pending": len(pending), "failed": len(failed),
        "total_chars": total_chars,
        "est_runtime": total_chars / 5 / 220,
        "running_chunks": [c["chunk_key"] for c in running],
    }

# Keep running until all chunks are done or failed
for i in range(15):
    s = get_status()
    if not s:
        print("ERROR: Cannot read status")
        break
    
    remaining = s["running"] + s["pending"] + s["failed"]
    print(f"\nIter {i+1}: {s['done']}/{s['total']} done ({s['done']/s['total']*100:.0f}%), ~{s['est_runtime']:.1f} min. Remaining: {remaining}")
    
    # DONE CHECK: done + failed >= total
    if s["done"] + s["failed"] >= s["total"]:
        print(f"\n✅ GENERATION COMPLETE: {s['total']} scenes")
        print(f"   Runtime: {s['est_runtime']:.1f} min")
        break
    
    # Clear any running chunks (stuck)
    if s["running"] > 0:
        running_chunks = rest("GET", f"project_document_chunks?select=id,chunk_key&document_id=eq.{DOC_ID}&version_id=eq.{V6_ID}&status=eq.running&limit=10")
        if running_chunks:
            for c in running_chunks:
                rest("PATCH", f"project_document_chunks?id=eq.{c['id']}", {"status":"pending","attempts":0,"error":None})
                print(f"  Unstuck: {c['chunk_key']}")
    
    # Call generate-document
    sys.stdout.flush()
    result = call_generate()
    print(f"  generate-document returned (likely 504)")
    time.sleep(1)

# Final report
s = get_status()
if s:
    done_chars = s["total_chars"]
    print(f"\n{'='*50}")
    print(f"FINAL: {s['done']}/{s['total']} scenes, ~{s['est_runtime']:.1f} min")
    print(f"Done: {s['done']}, Running: {s['running']}, Pending: {s['pending']}, Failed: {s['failed']}")
    if s["done"] >= s["total"]:
        print(f"\n✅ ALL SCENES GENERATED")
