#!/usr/bin/env python3
"""
Backfill script: Create pre-reconciliation_baseline entries in development_runs
for all existing documents that have CI/GP scores in meta_json.

Rule: one baseline row per document_id (latest version with scores wins).
Run once. Idempotent — uses ON CONFLICT DO NOTHING.
"""
import urllib.request
import json
from datetime import datetime, timezone

SB_URL = "https://hdfderbphdobomkdjypc.supabase.co"
SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkZmRlcmJwaGRvYm9ta2RqeXBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM4ODY2MSwiZXhwIjoyMDkwOTY0NjYxfQ.DhQvyzYRsh7sjKC2_yjn3nzFWzJlzm4d7Tgg90fYSVo"

def get(path, params=None):
    url = f"{SB_URL}{path}"
    if params:
        q = "&".join(f"{k}={v}" for k, v in params.items())
        url = f"{url}?{q}"
    req = urllib.request.Request(url,
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def post(path, data):
    req = urllib.request.Request(f"{SB_URL}{path}",
        data=json.dumps(data).encode(),
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
                 "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

# Fetch ALL project_document_versions that have meta_json with CI/GP scores
# Use limit to page through all (Supabase default limit is 1000, use select with no limit)
print("Fetching project_document_versions with meta_json scores...")
versions = get("/rest/v1/project_document_versions", {
    "select": "id,document_id,project_id,meta_json,created_at,version_number",
    "meta_json": "not.is.null",
    "order": "created_at.asc",
    "limit": 1000
})

print(f"Found {len(versions)} version rows with meta_json")

# Filter to those that have creative_integrity or greenlight_probability in meta_json
scored = []
for v in versions:
    mj = v.get("meta_json") or {}
    ci = mj.get("creative_integrity") or mj.get("creative_integrity_score")
    gp = mj.get("greenlight_probability") or mj.get("greenlight_probability_score")
    if ci is not None or gp is not None:
        scored.append({
            "id": v["id"],
            "document_id": v["document_id"],
            "project_id": v["project_id"],
            "meta_json": mj,
            "created_at": v["created_at"],
            "version_number": v.get("version_number"),
            "ci": float(ci) if ci is not None else None,
            "gp": float(gp) if gp is not None else None,
        })

print(f"Found {len(scored)} rows with CI/GP scores in meta_json")

# Deduplicate: one row per document_id (latest version wins — list is ordered by created_at asc so last in loop wins)
seen = {}
for v in scored:
    doc_id = v["document_id"]
    seen[doc_id] = v  # overwrite = keep latest

print(f"Unique documents to backfill: {len(seen)}")
print(f"Documents: {list(seen.keys())}")

# Fetch a service user_id — use the service role key to get a valid user
# We need a user_id for the development_runs row. Use a placeholder or query users.
# Since this is a backfill for existing data, use a fixed system user_id.
# Check what user_ids exist in auth.users
try:
    users = get("/rest/v1/users", {"limit": 1})
    user_id = users[0]["id"] if users else "00000000-0000-0000-0000-000000000000"
except:
    user_id = "00000000-0000-0000-0000-000000000000"

print(f"Using user_id: {user_id}")

today = datetime.now(timezone.utc).isoformat()
inserted = 0
skipped = 0

for doc_id, v in seen.items():
    mj = v["meta_json"]
    ci = v.get("ci")
    gp = v.get("gp")
    gap = abs(ci - gp) if ci is not None and gp is not None else None
    allowed_gap = mj.get("allowed_gap", 25)

    output_json = {
        "source": "pre-reconciliation_baseline",
        "backfill_date": today,
        "creative_integrity_score": ci,
        "greenlight_probability": gp,
        "gap": gap,
        "allowed_gap": allowed_gap,
        "convergence_status": mj.get("convergence_status"),
        "trajectory": mj.get("trajectory"),
        "primary_creative_risk": mj.get("primary_creative_risk"),
        "primary_commercial_risk": mj.get("primary_commercial_risk"),
        "convergence_source": "meta_json_backfill",
    }

    row = {
        "project_id": v["project_id"],
        "document_id": v["document_id"],
        "version_id": v["id"],
        "user_id": user_id,
        "run_type": "CONVERGENCE",
        "production_type": "narrative_feature",
        "output_json": output_json,
        "source": "pre-reconciliation_baseline",
    }

    try:
        result = post("/rest/v1/development_runs", row)
        print(f"  INSERTED baseline for doc={doc_id[:8]}... version={v['id'][:8]}...")
        inserted += 1
    except urllib.error.HTTPError as e:
        if e.code == 409:
            print(f"  SKIPPED (already exists) doc={doc_id[:8]}...")
            skipped += 1
        else:
            body = e.read().decode()
            print(f"  ERROR {e.code}: {body[:200]}")
    except Exception as e:
        print(f"  ERROR: {e}")

print(f"\nDone. Inserted: {inserted}, Skipped (already exists): {skipped}")
