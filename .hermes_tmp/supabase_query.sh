#!/bin/bash
# Helper to query Supabase via Management API
TOKEN=*** /Users/laralane/.config/supabase/access-token)
QUERY="$1"
curl -s -X POST "https://api.supabase.com/v1/projects/hdfderbphdobomkdjypc/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $(echo "$QUERY" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))')}" | python3 -m json.tool 2>/dev/null
