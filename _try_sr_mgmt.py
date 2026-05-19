#!/usr/bin/env python3
"""Try Management API with service_role key directly."""
import json, re, urllib.request, urllib.error, sys

PROJECT_REF = "hdfderbphdobomkdjypc"

# Get service role key
with open("/Users/laralane/code/iffy/api/auth/login.ts") as f:
    content = f.read()
m = re.search(r"SUPABASE_SERVICE_ROLE_KEY.*?\|\| '([^']+)'", content)
sr_key = m.group(1)
print(f"SR key length: {len(sr_key)}")

# Try Management API with SR key
mgmt_url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
headers = {
    "Authorization": f"Bearer {sr_key}",
    "Content-Type": "application/json",
}

# First check connectivity with a simple query
test = json.dumps({"query": "SELECT 1"}).encode()
print("Testing Management API with SR key...")
try:
    req = urllib.request.Request(mgmt_url, data=test, headers=headers, method="POST")
    with urllib.request.urlopen(req) as resp:
        print(f"WORKED! Response: {resp.read().decode()} ({resp.status})")
        print("\nNow creating exec_sql...")
        
        # Drop first
        drop = json.dumps({"query": "DROP FUNCTION IF EXISTS public.exec_sql(text);"}).encode()
        req = urllib.request.Request(mgmt_url, data=drop, headers=headers, method="POST")
        with urllib.request.urlopen(req) as resp:
            print(f"DROP: {resp.read().decode()} ({resp.status})")
        
        # Create using proper dollar-quoting but avoid potential issues
        create_sql = """CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (SELECT json_agg(row_to_json(t)) FROM (EXECUTE query) t);
END;
$$;"""
        create = json.dumps({"query": create_sql}).encode()
        req = urllib.request.Request(mgmt_url, data=create, headers=headers, method="POST")
        with urllib.request.urlopen(req) as resp:
            print(f"CREATE: {resp.read().decode()} ({resp.status})")
        
        # Verify
        verify = json.dumps({"query": "SELECT 1 as test"}).encode()
        req = urllib.request.Request(mgmt_url, data=verify, headers=headers, method="POST")
        with urllib.request.urlopen(req) as resp:
            print(f"VERIFY: {resp.read().decode()} ({resp.status})")
        
        print("\n=== SUCCESS ===")
        
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"FAILED: HTTP {e.code}: {body[:300]}")
except Exception as e:
    print(f"Exception: {e}")
