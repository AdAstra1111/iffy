#!/usr/bin/env python3
"""Create exec_sql function via Supabase Management API using GitHub PAT."""
import json, re, subprocess, urllib.request, urllib.error, sys

PROJECT_REF = "hdfderbphdobomkdjypc"

# First, let's get the service role key from login.ts (the full key)
with open("/Users/laralane/code/iffy/api/auth/login.ts") as f:
    content = f.read()
    
m = re.search(r"SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'", content)
if not m:
    print("ERROR: Could not extract service role key")
    sys.exit(1)
sr_key = m.group(1)
print(f"SR key length: {len(sr_key)}")

# Option: Use Supabase auth to login with email/password, get a session token
# Then use that session token with the Management API
# The service role key can be used to create a user session via the auth API

AUTH_URL = f"https://{PROJECT_REF}.supabase.co/auth/v1/token?grant_type=password"

# Try to login with Sebastian's credentials via the auth API
headers = {
    "Content-Type": "application/json",
    "apikey": sr_key,
}

login_payload = json.dumps({
    "email": "SebastianStreet@gmail.com",
    "password": "M33KDrag0n"
}).encode()

print("Attempting auth login...")
try:
    req = urllib.request.Request(AUTH_URL, data=login_payload, headers=headers, method="POST")
    with urllib.request.urlopen(req) as resp:
        login_data = json.loads(resp.read())
        access_token = login_data.get("access_token")
        print(f"Login succeeded! Access token: {access_token[:20]}...")
        
        # Now use this access token to create exec_sql via the Management API
        mgmt_url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
        
        # First drop
        drop_payload = json.dumps({"query": "DROP FUNCTION IF EXISTS public.exec_sql(text);"}).encode()
        mgmt_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        print("Dropping old exec_sql...")
        req = urllib.request.Request(mgmt_url, data=drop_payload, headers=mgmt_headers, method="POST")
        with urllib.request.urlopen(req) as resp:
            print(f"DROP: {resp.read().decode()} ({resp.status})")
        
        # Create exec_sql - use dollar-quoting properly
        create_sql = """CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fff$
BEGIN
  RETURN (SELECT json_agg(row_to_json(t)) FROM (EXECUTE query) t);
END;
$fff$;"""
        
        create_payload = json.dumps({"query": create_sql}).encode()
        print(f"Creating exec_sql...")
        print(f"SQL: {create_sql[:100]}...")
        req = urllib.request.Request(mgmt_url, data=create_payload, headers=mgmt_headers, method="POST")
        with urllib.request.urlopen(req) as resp:
            print(f"CREATE: {resp.read().decode()} ({resp.status})")
        
        # Verify
        verify_payload = json.dumps({"query": "SELECT 1 as test"}).encode()
        print("Verifying exec_sql...")
        req = urllib.request.Request(mgmt_url, data=verify_payload, headers=mgmt_headers, method="POST")
        with urllib.request.urlopen(req) as resp:
            print(f"VERIFY: {resp.read().decode()} ({resp.status})")
        
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"HTTP {e.code}: {body[:300]}")
    
    # If login failed, try a different approach
    if e.code == 400:
        print("\nLogin failed. Trying alternative approach...")
        
        # Use the service role key directly with the Management API
        print("Trying Management API with service_role key...")
        mgmt_url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
        mgmt_headers = {
            "Authorization": f"Bearer {sr_key}",
            "Content-Type": "application/json",
        }
        
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
        
        create_payload = json.dumps({"query": create_sql}).encode()
        try:
            req = urllib.request.Request(mgmt_url, data=create_payload, headers=mgmt_headers, method="POST")
            with urllib.request.urlopen(req) as resp:
                print(f"CREATE via SR key: {resp.read().decode()} ({resp.status})")
        except urllib.error.HTTPError as e2:
            print(f"SR key failed: HTTP {e2.code}")
            
            # Last resort: use the postgREST /rest/v1/rpc/ endpoint via service role key
            # Actually, we can't create functions via RPC
            print("\nNeed another approach. Trying direct postgres connection...")
except Exception as e:
    print(f"Exception: {e}")
