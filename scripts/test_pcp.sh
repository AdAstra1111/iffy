#!/usr/bin/env bash
set -euo pipefail
cd /Users/laralane/code/iffy
source .env.local

# Test pcp-resolver with empty input — should auto-fetch canon
echo "=== Concrete Angels ==="
curl -s -X POST "${SUPABASE_URL}/functions/v1/pcp-resolver" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -d '{"project_id": "b6ae36fb-805b-4ff5-84ba-91fbccd46334", "project_metadata": {}, "canon_json": {}}' \
  | python3 -c "import sys, json; d=json.load(sys.stdin); print(json.dumps({k:d.get(k) for k in ['status','persisted','canon_source','version','persist_error']}, indent=2))"

echo ""
echo "=== Event Horizon Protocol ==="
curl -s -X POST "${SUPABASE_URL}/functions/v1/pcp-resolver" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -d '{"project_id": "6c4e2f48-fe9c-47b6-aac8-656a3ed4274b", "project_metadata": {}, "canon_json": {}}' \
  | python3 -c "import sys, json; d=json.load(sys.stdin); print(json.dumps({k:d.get(k) for k in ['status','persisted','canon_source','version','persist_error']}, indent=2))"

echo ""
echo "=== Verify in DB ==="
npx supabase db query "
SELECT p.title, pcp.status, 
  pcp.profile->'categories'->'project_identity'->'genre'->'value' as genre,
  pcp.profile->'categories'->'temporal_context'->'period'->'value' as period
FROM project_context_profiles pcp
JOIN projects p ON p.id = pcp.project_id
WHERE p.title IN ('Concrete Angels', 'Event Horizon Protocol')
ORDER BY p.title;
" --linked 2>/dev/null