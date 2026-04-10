#!/usr/bin/env python3
"""
Backfill: Create pre-reconciliation_baseline entries in development_runs.

Sources (in priority order):
  1. dev_engine_convergence_history — canonical historical CI/GP for evaluated docs
  2. meta_json (ci/gp fields) — fallback for docs not yet in convergence_history

Rules:
  - development_runs is authoritative: one baseline row per unique (document_id, version_id)
  - All rows marked source='pre-reconciliation_baseline', backfill_date=today
  - Idempotent: uses upsert logic (ON CONFLICT DO NOTHING via unique constraint)

Prerequisites (already applied):
  1. Migration 202604100200: source column added
  2. Migration 202604100201: convergence_atomic_write function created
"""
import urllib.request
import json
from datetime import datetime, timezone

SB_URL = "https://hdfderbphdobomkdjypc.supabase.co"
SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkZmRlcmJwaGRvYm9ta2RqeXBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM4ODY2MSwiZXhwIjoyMDkwOTY0NjYxfQ.DhQvyzYRsh7sjKC2_yjn3nzFWzJlzm4d7Tgg90fYSVo"

YETI_PROJECT_ID = "f7d8b80f-3684-439d-8f8b-53f93f00a9cd"
SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000"

def get(path):
    req = urllib.request.Request(f"{SB_URL}{path}",
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def post(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(f"{SB_URL}{path}",
        data=body,
        headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
                 "Content-Type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            resp_body = r.read()
            return json.loads(resp_body) if resp_body else {}, r.status
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode()
        try:
            return json.loads(resp_body), e.code
        except Exception:
            return {"raw": resp_body[:200]}, e.code

today = datetime.now(timezone.utc).isoformat()
all_docs = {}  # doc_id -> {ci, gp, version_id, source, output_json}

# Source 1: dev_engine_convergence_history
print("[Source 1] dev_engine_convergence_history...")
try:
    hist = get(f"/rest/v1/dev_engine_convergence_history?project_id=eq.{YETI_PROJECT_ID}&select=*&order=created_at.desc")
    print(f"  {len(hist)} rows for YETI")
    seen_docs = set()
    for h in hist:
        doc_id = h.get("document_id")
        if doc_id in seen_docs:
            continue
        seen_docs.add(doc_id)
        ci = float(h.get("creative_score", 0) or 0)
        gp = float(h.get("greenlight_score", 0) or 0)
        all_docs[doc_id] = {
            "ci": ci, "gp": gp,
            "gap": abs(ci - gp),
            "allowed_gap": float(h.get("allowed_gap", 25) or 25),
            "version_id": h.get("version_id"),
            "status": h.get("convergence_status"),
            "trajectory": h.get("trajectory"),
            "source": "dev_engine_convergence_history",
            "created_at": h.get("created_at"),
        }
        print(f"  doc={doc_id[:8]}, ci={ci}, gp={gp}")
except Exception as e:
    print(f"  Error: {e}")

# Source 2: meta_json fallback (docs not in convergence_history)
YETI_DOC_IDS = [
    ("e2f6ba95-c191-4455-b0c1-901dbf70cee0", "character_bible"),
    ("fcf612ba-efcb-4180-b3cb-3dabdd8e8268", "beat_sheet"),
    ("0419c785-7f38-4be8-bc07-32426ab54001", "feature_script"),
    ("9adc34e0-93e3-4426-a55d-fd09ce0a51a8", "market_sheet"),
    ("ce404e2d-5a5d-424e-8b00-1d8014a24d84", "concept_brief"),
    ("e013b6bb-a863-40a8-82b1-f2a273408e58", "story_outline"),
    ("169fa31c-1bd8-46ae-943e-23959f43038f", "treatment"),
]
print("\n[Source 2] meta_json fallback...")
for doc_id, doc_type in YETI_DOC_IDS:
    if doc_id in all_docs:
        continue
    try:
        vers = get(f"/rest/v1/project_document_versions?document_id=eq.{doc_id}&select=id,meta_json,created_at&order=created_at.desc&limit=3")
        for v in vers:
            mj = v.get("meta_json") or {}
            ci = mj.get("ci") or mj.get("creative_integrity") or mj.get("creative_integrity_score")
            gp = mj.get("gp") or mj.get("greenlight_probability") or mj.get("greenlight_probability_score")
            if ci is not None or gp is not None:
                all_docs[doc_id] = {
                    "ci": float(ci) if ci is not None else None,
                    "gp": float(gp) if gp is not None else None,
                    "gap": None,
                    "allowed_gap": float(mj.get("allowed_gap", 25) or 25),
                    "version_id": v["id"],
                    "status": mj.get("convergence_status"),
                    "trajectory": mj.get("trajectory"),
                    "source": "meta_json_fallback",
                    "created_at": v["created_at"],
                }
                print(f"  {doc_type}: ci={ci}, gp={gp}")
                break
    except Exception as e:
        print(f"  Error for {doc_type}: {e}")

print(f"\nTotal docs to backfill: {len(all_docs)}")
if not all_docs:
    print("Nothing to backfill.")
    exit(0)

inserted = skipped = errors = 0
for doc_id, v in all_docs.items():
    ci, gp = v["ci"], v["gp"]
    if ci is None and gp is None:
        print(f"  SKIP {doc_id[:8]}: no scores")
        continue

    gap = v["gap"] or (abs(ci - gp) if ci is not None and gp is not None else None)
    output_json = {
        "source": "pre-reconciliation_baseline",
        "backfill_date": today,
        "backfill_source": v["source"],
        "creative_integrity_score": ci,
        "greenlight_probability": gp,
        "gap": gap,
        "allowed_gap": v["allowed_gap"],
        "convergence_status": v.get("status"),
        "trajectory": v.get("trajectory"),
        "convergence_source": "pre-reconciliation_baseline",
    }

    row = {
        "project_id": YETI_PROJECT_ID,
        "document_id": doc_id,
        "version_id": v["version_id"],
        "user_id": SYSTEM_USER_ID,
        "run_type": "CONVERGENCE",
        "production_type": "narrative_feature",
        "output_json": output_json,
        "source": "pre-reconciliation_baseline",
    }

    result, status = post("/rest/v1/development_runs", row)
    if status in (200, 201):
        print(f"  INSERTED doc={doc_id[:8]}, ci={ci}, gp={gp}")
        inserted += 1
    elif status == 409:
        print(f"  SKIPPED doc={doc_id[:8]}: baseline already exists")
        skipped += 1
    else:
        print(f"  ERROR doc={doc_id[:8]}: status={status}, {str(result)[:80]}")
        errors += 1

print(f"\n{'='*50}")
print(f"Backfill complete: {inserted} inserted, {skipped} skipped, {errors} errors")
