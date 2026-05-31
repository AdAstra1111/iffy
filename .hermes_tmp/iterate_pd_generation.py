#!/usr/bin/env python3
"""Iterative PD generation — clear stuck running chunks and call resume until all 43 done."""
import json
import urllib.request
import re
import time

SUPABASE_URL = "https://hdfderbphdobomkdjypc.supabase.co"
DOC_ID = "03ba576b-42cf-46a6-b725-a35fd51563f1"
V6_ID = "c36d3907-ec84-45c1-8b35-4bfbfd9ac8ce"

with open("/Users/laralane/code/iffy/.env.local") as f:
    env = f.read()
m = re.search(r'SUPABASE_SERVICE_ROLE_KEY="([^"]+)"', env)
SERVICE_KEY = m.group(1)

def req(method, path, data=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    r = urllib.request.Request(url, method=method)
    r.add_header("apikey", SERVICE_KEY)
    r.add_header("Authorization", f"Bearer {SERVICE_KEY}")
    r.add_header("Content-Type", "application/json")
    if data is not None:
        r.data = json.dumps(data).encode()
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return None

def call_generate_doc():
    """Call generate-document edge function (will likely 504 but may process chunks)."""
    body = json.dumps({
        "projectId": "8a62605d-a239-438d-9b31-7c83429cb17c",
        "docType": "production_draft"
    }).encode()
    req2 = urllib.request.Request(
        f"{SUPABASE_URL}/functions/v1/generate-document",
        data=body,
        headers={
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
        }
    )
    try:
        with urllib.request.urlopen(req2, timeout=180) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}"
    except Exception as e:
        return str(e)

def get_v6_status():
    chunks = req("GET", f"project_document_chunks?select=chunk_index,chunk_key,status,char_count&document_id=eq.{DOC_ID}&version_id=eq.{V6_ID}&order=chunk_index.asc&limit=50")
    if not chunks:
        return None
    done = [c for c in chunks if c["status"] == "done" and c.get("char_count")]
    running = [c for c in chunks if c["status"] == "running"]
    failed = [c for c in chunks if c["status"] == "failed_validation"]
    pending = [c for c in chunks if c["status"] == "pending" or (c["status"] == "done" and not c.get("char_count"))]
    total_chars = sum(c["char_count"] for c in done)
    return {
        "total": len(chunks),
        "done": len(done),
        "running": len(running),
        "failed": len(failed),
        "pending": len(pending),
        "total_chars": total_chars,
        "est_words": total_chars // 5,
        "est_runtime": total_chars / 5 / 220,
        "done_chunks": [c["chunk_key"] for c in done],
        "running_chunks": [c["chunk_key"] for c in running],
    }

def clear_stuck():
    """Reset all running chunks to pending."""
    running = req("GET", f"project_document_chunks?select=id,chunk_key,status&document_id=eq.{DOC_ID}&version_id=eq.{V6_ID}&status=eq.running&limit=20")
    if running:
        for c in running:
            req("PATCH", f"project_document_chunks?id=eq.{c['id']}", {"status": "pending", "attempts": 0, "error": None})
            print(f"  Cleared stuck: {c['chunk_key']}")

# Main loop
max_iterations = 10
for i in range(max_iterations):
    print(f"\n{'='*50}")
    print(f"Iteration {i+1}/{max_iterations}")
    print(f"{'='*50}")
    
    # Check status
    status = get_v6_status()
    if not status:
        print("ERROR: Could not get V6 status")
        break
    
    done_pct = status["done"] / status["total"] * 100
    print(f"  Done: {status['done']}/{status['total']} scenes ({done_pct:.0f}%)")
    print(f"  Runtime: {status['est_runtime']:.1f} min")
    print(f"  Running: {status['running']}, Failed: {status['failed']}, Pending: {status['pending']}")
    
    if status["done"] >= status["total"]:
        print(f"\n  ✅ ALL {status['total']} SCENES DONE! Runtime: {status['est_runtime']:.1f} min")
        break
    
    # Clear stuck running chunks
    if status["running"] > 0:
        print(f"  Clearing {status['running']} stuck running chunks...")
        clear_stuck()
    
    # Call generate-document
    print(f"  Calling generate-document (waiting up to 180s)...")
    sys.stdout.flush()
    result = call_generate_doc()
    
    # Brief pause to let DB writes settle
    time.sleep(2)

# Final status
final = get_v6_status()
if final:
    print(f"\n{'='*50}")
    print(f"FINAL STATUS")
    print(f"{'='*50}")
    print(f"  Done: {final['done']}/{final['total']} scenes")
    print(f"  Runtime: {final['est_runtime']:.1f} min")
    print(f"  Running: {final['running']}, Failed: {final['failed']}, Pending: {final['pending']}")
    print(f"  Total chars: {final['total_chars']}")
    print(f"  Est words: {final['est_words']}")
    print(f"  Est runtime @220: {final['est_runtime']:.1f} min")
    
    if final["running"] > 0:
        print(f"  Stuck at: {final['running_chunks']}")
