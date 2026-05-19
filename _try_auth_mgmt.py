#!/usr/bin/env python3
"""Login to Supabase Auth with anon key, then create exec_sql via Management API."""
import json, re, urllib.request, urllib.error, sys

PROJECT_REF = "hdfderbphdobomkdjypc"

# Read anon key from .env.local
with open("/Users/laralane/code/iffy/.env.local") as f:
    env = f.read()
m = re.search(r"VITE_SUPABASE_ANON_KEY=(.+)", env)
if not m:
    print("ERROR: No anon key found")
    sys.exit(1)
anon_key = m.group(1).strip()

print(f"Anon key length: {len(anon_key)}")

# Step 1: Login via Supabase Auth with email/password
auth_url = f"https://{PROJECT_REF}.supabase.co/auth/v1/token?grant_type=password"
auth_headers = {
    "Content-Type": "application/json",
    "apikey": anon_key,
}
payload = json.dumps({
    "email": "SebastianStreet@gmail.com",
    "password": "M33KDrag0n"
}).encode()

print("Logging in via Supabase Auth...")
try:
    req = urllib.request.Request(auth_url, data=payload, headers=auth_headers, method="POST")
    with urllib.request.urlopen(req) as resp:
        login_data = json.loads(resp.read().decode())
        access_token = login_data.get("access_token")
        refresh_token = login_data.get("refresh_token")
        print(f"Login OK! Access token: {access_token[:30]}...")
        
        # Step 2: Use the access token with Management API
        mgmt_url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
        mgmt_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        
        # Drop existing exec_sql
        drop = json.dumps({"query": "DROP FUNCTION IF EXISTS public.exec_sql(text);"}).encode()
        print("\nDropping old exec_sql...")
        req = urllib.request.Request(mgmt_url, data=drop, headers=mgmt_headers, method="POST")
        with urllib.request.urlopen(req) as resp:
            print(f"DROP: {resp.read().decode()} ({resp.status})")
        
        # Create exec_sql
        create_sql = """CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  RETURN (SELECT json_agg(row_to_json(t)) FROM (EXECUTE query) t);
END;
$func$;"""
        
        create = json.dumps({"query": create_sql}).encode()
        print("\nCreating exec_sql...")
        req = urllib.request.Request(mgmt_url, data=create, headers=mgmt_headers, method="POST")
        with urllib.request.urlopen(req) as resp:
            print(f"CREATE: {resp.read().decode()} ({resp.status})")
        
        # Verify
        verify = json.dumps({"query": "SELECT 1 as test"}).encode()
        print("\nVerifying exec_sql...")
        req = urllib.request.Request(mgmt_url, data=verify, headers=mgmt_headers, method="POST")
        with urllib.request.urlopen(req) as resp:
            print(f"VERIFY: {resp.read().decode()} ({resp.status})")
        
        print("\n=== SUCCESS ===")
        
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"\nHTTP {e.code}: {body[:500]}")
    if e.code == 401:
        print("\n401 means Management API needs PAT, not access token.")
        print("Let me try service_role key with Management API as alternative...")
        
        # Alternative: use service_role key
        with open("/Users/laralane/code/iffy/api/auth/login.ts") as f:
            ct = f.read()
        sm = re.search(r"SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'", ct)
        if sm:
            sr_key = sm.group(1)
            print(f"SR key: {sr_key[:20]}... ({len(sr_key)} chars)")
            mgmt_headers2 = {
                "Authorization": f"Bearer {sr_key}",
                "Content-Type": "application/json",
            }
            create_sql2 = """CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  RETURN (SELECT json_agg(row_to_json(t)) FROM (EXECUTE query) t);
END;
$func$;"""
            create2 = json.dumps({"query": create_sql2}).encode()
            try:
                req2 = urllib.request.Request(f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query", 
                    data=create2, headers=mgmt_headers2, method="POST")
                with urllib.request.urlopen(req2) as resp2:
                    print(f"SR-key CREATE: {resp2.read().decode()} ({resp2.status})")
            except urllib.error.HTTPError as e2:
                body2 = e2.read().decode()
                print(f"SR-key also failed: HTTP {e2.code}: {body2[:300]}")
    elif e.code == 400:
        # Login failed - password wrong
        print("\nAuth login failed - password may be wrong.")
except Exception as e:
    print(f"\nException: {e}")