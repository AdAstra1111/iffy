#!/bin/bash
TOKEN=$(cat /Users/laralane/.config/supabase/access-token)
QUERY=$1
curl -s -X POST "https://api.supabase.com/v1/projects/hdfderbphdobomkdjypc/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$QUERY\"}" 2>&1 | python3 -m json.tool 2>/dev/null
