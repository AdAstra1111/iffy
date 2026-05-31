#!/bin/bash
cd /Users/laralane/code/iffy
export $(grep -v '^#' .env.local | xargs)
curl -s "${SUPABASE_URL}/rest/v1/$1?project_id=eq.9404a383-5cdc-4f06-92aa-2ca70973c556&$2" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
