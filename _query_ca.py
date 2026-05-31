#!/usr/bin/env python3
"""Query Concrete Angels project state using Supabase REST API."""
import json, subprocess, os

os.chdir("/Users/laralane/code/iffy")

# Read service key from .env.local
with open(".env.local") as f:
    for line in f:
        if "SUPABASE_SERVICE_ROLE_KEY" in line and "VITE" not in line and "PUBLIC" not in line:
            svc_key = line.split("=", 1)[1].strip().strip('"')
            break

headers = [
    "apikey: " + svc_key,
    "Authorization: Bearer " + svc_key,
    "Accept: application/json",
]

headers_args = []
for h in headers:
    headers_args.extend(["-H", h])

def rest_get(path):
    url = "https://hdfderbphdobomkdjypc.supabase.co/rest/v1/" + path
    cmd = ["curl", "-s"] + headers_args + [url]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    return json.loads(result.stdout)

# 1. Find Concrete Angels project
projects = rest_get("projects?title=ilike.*Concrete%20Angels*&select=id,title,format,created_at,updated_at,user_id")
print("=== CONCRETE ANGELS PROJECT ===")
print(json.dumps(projects, indent=2, default=str))

if projects:
    pid = projects[0]["id"]
    
    # 2. Check character_visual_dna for this project
    dna = rest_get(f"character_visual_dna?project_id=eq.{pid}&select=id,character_id,character_name,traits,created_at")
    print(f"\n=== CHARACTER VISUAL DNA (project {pid}) ===")
    print(json.dumps(dna, indent=2, default=str))
    
    # 3. Check character_identity_packages
    cip = rest_get(f"character_identity_packages?project_id=eq.{pid}&select=id,character_id,character_name,trait_payload,asset_class,created_at")
    print(f"\n=== CHARACTER IDENTITY PACKAGES (project {pid}) ===")
    print(json.dumps(cip, indent=2, default=str))
    
    # 4. Check hero_frames
    frames = rest_get(f"hero_frames?project_id=eq.{pid}&select=id,character_id,character_name,image_url,generation_type,character_identity_package_id,actor_id")
    print(f"\n=== HERO FRAMES (project {pid}) ===")
    print(json.dumps(frames, indent=2, default=str))
    
    # 5. Check project_ai_cast
    cast = rest_get(f"project_ai_cast?project_id=eq.{pid}&select=id,character_name,ai_actor_id,status,character_status")
    print(f"\n=== PROJECT AI CAST (project {pid}) ===")
    print(json.dumps(cast, indent=2, default=str))
    
    # 6. Check NEL state - what documents exist
    docs = rest_get(f"documents?project_id=eq.{pid}&select=id,doc_type,version_number,title,length(plaintext),is_current,approval_status&is_current=eq.true&order=doc_type.asc")
    print(f"\n=== DOCUMENTS (project {pid}) ===")
    print(json.dumps(docs, indent=2, default=str))
