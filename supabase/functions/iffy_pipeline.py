#!/usr/bin/env python3
"""
iffy_pipeline.py — End-to-end project factory pipeline driver.

Usage:
  python3 iffy_pipeline.py create "Project Title" --format film --genres Sci-Fi Thriller
  python3 iffy_pipeline.py seed <project_id> --title "Title" --premise "..."
  python3 iffy_pipeline.py autorun <project_id>
  python3 iffy_pipeline.py status <project_id>
  python3 iffy_pipeline.py ladder <project_id> --docs concept_brief,character_bible,treatment
  python3 iffy_pipeline.py gate-check <project_id> --target production_draft
  python3 iffy_pipeline.py unpause <job_id>
"""
import re, json, urllib.request, sys, time, os, textwrap

# ── Config ──
ENV_PATH = "/Users/laralane/code/iffy/.env.local"
SUPABASE_URL = "https://hdfderbphdobomkdjypc.supabase.co"
USER_ID = "a6c31c79-7837-47d8-b2f0-91d2e0febd76"

def get_svc_key():
    with open(ENV_PATH) as f:
        c = f.read()
    m = re.search(r'SUPABASE_SERVICE_ROLE_KEY="([^"]+)"', c)
    if not m:
        m = re.search(r'SUPABASE_SERVICE_ROLE_KEY=(\S+)', c)
    if not m:
        print("ERROR: Cannot find service role key")
        sys.exit(1)
    return m.group(1)

SVC_KEY = get_svc_key()

def call_fn(fn, payload, timeout=300):
    """Call a Supabase edge function with service role key."""
    url = f"{SUPABASE_URL}/functions/v1/{fn}"
    try:
        req = urllib.request.Request(
            url, data=json.dumps(payload).encode(),
            headers={"Authorization": f"Bearer {SVC_KEY}", "Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return {"error": f"HTTP {e.code}", "body": body[:2000]}
    except Exception as e:
        return {"error": str(e)}

def call_rest(path, method="GET", data=None):
    """Call Supabase REST API directly."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {"apikey": SVC_KEY, "Authorization": f"Bearer {SVC_KEY}"}
    if data is not None:
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=representation"
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data else None,
                                  headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"error": f"REST HTTP {e.code}", "body": e.read().decode()[:1000]}

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}")

# ═══════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════

def cmd_create(args):
    """Create a fresh project with guardrails."""
    title = args[0]
    fmt = args.format or "film"
    genres = [g.strip() for g in (args.genres or "Drama").split(",")]
    
    # Create project
    result = call_rest("projects", "POST", {
        "user_id": USER_ID, "title": title, "format": fmt,
        "genres": genres, "budget_range": "10m-20m",
        "target_audience": "adult", "tone": "Dark & Gritty",
        "assigned_lane": "independent-film",
        "pipeline_stage": "development", "lifecycle_stage": "development",
        "packaging_mode": "standard", "packaging_stage": "development",
        "pinned": False, "autorun_enabled": False, "autorun_trigger": "manual",
        "script_coverage_verdict": "pending", "primary_territory": "global",
        "secondary_territories": [], "target_runtime_minutes": 95,
        "min_runtime_minutes": 90, "runtime_estimation_mode": "fixed",
        "runtime_tolerance_pct": 0.1, "signals_influence": 0.5,
        "signals_apply": {}, "project_features": {}, "document_urls": [],
        "recommendations": [], "guardrails_config": {},
        "season_episode_count_locked": False,
        "vertical_engine_weights": {},
    })
    
    if isinstance(result, dict) and result.get("error"):
        print(f"FAILED: {result}")
        return
    
    proj = result[0] if isinstance(result, list) else result
    pid = proj["id"]
    log(f"Created: {title} ({pid})")
    
    # Generate idea document with premise
    idea_text = args.premise or f"{title} — a {', '.join(genres)}."
    doc_result = call_fn("dev-engine-v2", {
        "action": "create-paste",
        "projectId": pid, "docType": "idea",
        "title": f"Idea - {title}", "text": idea_text
    })
    
    if "error" in doc_result:
        log(f"Idea creation issue: {doc_result.get('error')}")
    else:
        log(f"Idea document created: {doc_result.get('document', {}).get('id', '?')[:8]}")
    
    print(f"\nPROJECT_ID={pid}")
    return pid

def cmd_create_dev_seed(args):
    """Create a dev seed v2 from a project."""
    pid = args[0]
    title = args.title or "Untitled"
    
    payload = {
        "action": "create_dev_seed_v2",
        "projectId": pid,
        "title": title,
        "lane": args.lane or "independent-film",
        "format": args.format or "film",
        "target_audience": args.audience or "Adult 25-54",
        "genre_stack": [g.strip() for g in (args.genres or "Drama").split(",")],
        "tone_contract": args.tone or "Dark & Gritty",
        "market_hook": args.hook or "",
        "runtime_pattern": args.runtime or "feature_90_120",
        "episode_pattern": None,
        "comparable_mode": args.comp_mode or "auto",
        "premise": {
            "premise": args.premise or "",
            "dramatic_question": args.dq or "",
            "central_irony": args.irony or "",
            "emotional_promise": args.promise or "",
            "audience_fantasy": args.fantasy or "",
            "theme_vector": args.theme or ""
        },
        "entities": [],
        "units": [],
        "entity_relations": [],
        "canon_rules": [],
        "beats": [],
        "generation_intent": "create_project_factory_test"
    }
    
    result = call_fn("dev-engine-v2", payload, timeout=120)
    print(json.dumps(result, indent=2, default=str)[:2000])

def cmd_start_autorun(args):
    """Start auto-run pipeline for a project."""
    pid = args[0]
    mode = args.mode or "balanced"
    start_doc = args.start_doc or "idea"
    target_doc = args.target_doc or "production_draft"
    
    log(f"Starting auto-run: {pid} ({start_doc} -> {target_doc}, mode={mode})")
    result = call_fn("auto-run", {
        "action": "start",
        "projectId": pid,
        "mode": mode,
        "start_document": start_doc,
        "target_document": target_doc,
        "max_total_steps": 200,
        "max_stage_loops": 15,
        "userId": USER_ID
    }, timeout=30)
    
    print(json.dumps(result, indent=2, default=str)[:2000])
    
    if result.get("error") and "RESUMABLE_JOB_EXISTS" in str(result.get("error")):
        job_id = result.get("existing_job_id")
        log(f"Resumable job exists: {job_id}")
        result2 = call_fn("auto-run", {
            "action": "resume",
            "jobId": job_id,
            "projectId": pid,
            "userId": USER_ID
        }, timeout=30)
        print(f"Resume result: {json.dumps(result2, indent=2, default=str)[:500]}")

def cmd_status(args):
    """Show full project and auto-run status."""
    pid = args[0]
    
    # Project info  
    proj = call_rest(f"projects?id=eq.{pid}")
    if isinstance(proj, list) and len(proj) > 0:
        p = proj[0]
        print(f"\n{'='*60}")
        print(f"PROJECT: {p.get('title')} ({p.get('format')})")
        print(f"Genres: {p.get('genres')}")
        print(f"Stage: {p.get('pipeline_stage')} / {p.get('lifecycle_stage')}")
        print(f"{'='*60}\n")
    
    # Documents
    docs = call_rest(f"project_documents?project_id=eq.{pid}&select=id,title,doc_type,latest_version_id,created_at")
    if isinstance(docs, list):
        print(f"DOCUMENTS ({len(docs)}):")
        for d in docs:
            print(f"  {d.get('doc_type','?'):25s} {d.get('id','?')[:8]}... title={d.get('title','')[:40]}")
    
    # Auto-run jobs
    jobs = call_rest(f"auto_run_jobs?project_id=eq.{pid}&select=id,status,current_document,step_count,created_at,updated_at&order=created_at.desc")
    if isinstance(jobs, list) and len(jobs) > 0:
        print(f"\nAUTO-RUN JOBS ({len(jobs)}):")
        for j in jobs:
            print(f"  ID: {j.get('id','?')[:8]}... Status: {j.get('status','?')} Doc: {j.get('current_document','?')} Steps: {j.get('step_count',0)}")
    else:
        print("\nNo auto-run jobs found.")
    
    # Auto-run steps
    if isinstance(jobs, list) and len(jobs) > 0:
        jid = jobs[0].get("id")
        steps = call_rest(f"auto_run_steps?job_id=eq.{jid}&select=id,step_index,document,action,status,created_at&order=step_index.desc&limit=15")
        if isinstance(steps, list) and len(steps) > 0:
            print(f"\nRecent steps ({len(steps)}):")
            for s in steps[:10]:
                print(f"  #{s.get('step_index',0):3d} {s.get('document',''):25s} {s.get('action',''):35s} {s.get('status',''):10s}")

def cmd_generate_docs(args):
    """Generate specific documents in sequence."""
    pid = args[0]
    docs = args.docs.split(",") if args.docs else ["concept_brief","character_bible","treatment","story_outline","beat_sheet","feature_script","production_draft"]
    
    for doc in docs:
        doc = doc.strip()
        log(f"Generating: {doc}...")
        result = call_fn("generate-document", {"projectId": pid, "docType": doc}, timeout=300)
        
        if "error" in result:
            log(f"  FAILED: {result['error']}")
            if "body" in result:
                log(f"  Body: {result['body'][:200]}")
            if result.get("error") == "HTTP 504":
                log(f"  TIMEOUT — doc might still be generating in background")
                continue
        else:
            gen = result.get("generating", False)
            doc_id = result.get("document_id", result.get("document",{}).get("id","?"))[:12]
            ver_id = result.get("version_id", result.get("version",{}).get("id","?"))[:12]
            log(f"  ✅ {doc} created (gen={gen}) doc={doc_id} ver={ver_id}")
        
        # Small delay between docs to avoid overwhelming the system
        time.sleep(2)

def cmd_gate_check(args):
    """Check completion gate for a target document."""
    pid = args[0]
    target = args.target or args[1] if len(args) > 1 else "production_draft"
    
    result = call_fn("auto-run", {
        "action": "debug-completion-gate",
        "project_id": pid,
        "target_document": target
    })
    print(json.dumps(result, indent=2, default=str)[:3000])

def cmd_unpause(args):
    """Resume a stuck auto-run job."""
    jid = args[0]
    pid = args.pid
    
    # Check job status first
    jobs = call_rest(f"auto_run_jobs?id=eq.{jid}") if jid.startswith("auto_") else \
           call_rest(f"auto_run_jobs?id=eq.{jid}")
    
    result = call_fn("auto-run", {
        "action": "run-next",
        "jobId": jid,
        "projectId": pid or args[1] if len(args) > 1 else None,
        "userId": USER_ID
    }, timeout=60)
    print(json.dumps(result, indent=2, default=str)[:2000])

def cmd_poll(args):
    """Poll auto-run job until complete or stuck."""
    pid = args[0]
    max_polls = args.max or 60
    
    for i in range(max_polls):
        # Check auto-run jobs
        jobs = call_rest(f"auto_run_jobs?project_id=eq.{pid}&order=created_at.desc&limit=1")
        if isinstance(jobs, list) and len(jobs) > 0:
            j = jobs[0]
            status = j.get("status")
            doc = j.get("current_document","?")
            steps = j.get("step_count",0)
            
            print(f"Poll {i+1}: status={status} doc={doc} steps={steps}")
            
            if status in ("complete", "failed", "cancelled"):
                print(f"\nJob {status}!")
                cmd_status([pid])
                return
        
        # Check docs
        docs = call_rest(f"project_documents?project_id=eq.{pid}&select=id,doc_type,latest_version_id")
        if isinstance(docs, list):
            docs_with_versions = [d for d in docs if d.get("latest_version_id")]
            print(f"  Docs with versions: {len(docs_with_versions)}/{len(docs)}")
        
        time.sleep(30)

def cmd_exec_sql(args):
    """Execute raw SQL on the linked project."""
    sql = " ".join(args)
    import subprocess
    r = subprocess.run(
        ["npx", "supabase", "db", "query", "--linked", sql],
        capture_output=True, text=True, timeout=30,
        cwd="/Users/laralane/code/iffy"
    )
    print(r.stdout[-2000:] if r.stdout else r.stderr[-2000:])

# ═══════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="IFFY Pipeline Driver")
    sub = parser.add_subparsers(dest="cmd")
    
    p = sub.add_parser("create")
    p.add_argument("title", nargs="+")
    p.add_argument("--format", default="film")
    p.add_argument("--genres", default="Drama")
    p.add_argument("--premise", default="")
    
    p = sub.add_parser("seed")
    p.add_argument("project_id")
    p.add_argument("--title", default="")
    p.add_argument("--format", default="film")
    p.add_argument("--genres", default="Drama")
    p.add_argument("--premise", default="")
    p.add_argument("--tone", default="Dark & Gritty")
    p.add_argument("--lane", default="independent-film")
    p.add_argument("--audience", default="Adult 25-54")
    p.add_argument("--hook", default="")
    p.add_argument("--runtime", default="feature_90_120")
    p.add_argument("--dq", default="")
    p.add_argument("--irony", default="")
    p.add_argument("--promise", default="")
    p.add_argument("--fantasy", default="")
    p.add_argument("--theme", default="")
    p.add_argument("--comp-mode", default="auto")
    
    p = sub.add_parser("autorun")
    p.add_argument("project_id")
    p.add_argument("--mode", default="balanced")
    p.add_argument("--start-doc", default="idea")
    p.add_argument("--target-doc", default="production_draft")
    
    p = sub.add_parser("status")
    p.add_argument("project_id")
    
    p = sub.add_parser("generate")
    p.add_argument("project_id")
    p.add_argument("--docs", default="concept_brief")
    
    p = sub.add_parser("gate-check")
    p.add_argument("project_id")
    p.add_argument("--target", default="production_draft")
    
    p = sub.add_parser("poll")
    p.add_argument("project_id")
    p.add_argument("--max", type=int, default=60)
    
    p = sub.add_parser("unpause")
    p.add_argument("job_id")
    p.add_argument("--pid")
    
    p = sub.add_parser("sql")
    p.add_argument("query", nargs="+")
    
    args = parser.parse_args()
    
    if args.cmd == "create":
        cmd_create(args)
    elif args.cmd == "seed":
        cmd_create_dev_seed(args)
    elif args.cmd == "autorun":
        cmd_start_autorun(args)
    elif args.cmd == "status":
        cmd_status(args)
    elif args.cmd == "generate":
        cmd_generate_docs(args)
    elif args.cmd == "gate-check":
        cmd_gate_check(args)
    elif args.cmd == "poll":
        cmd_poll(args)
    elif args.cmd == "unpause":
        cmd_unpause(args)
    elif args.cmd == "sql":
        cmd_exec_sql(args)
    else:
        parser.print_help()
