#!/bin/bash
# Refresh visual DNA
set -e
KEY=$(python3 -c "
with open('/Users/laralane/code/iffy/.env.local') as f:
    for line in f:
        if 'SUPABASE_SERVICE_ROLE_KEY' in line and 'VITE' not in line and 'PUBLIC' not in line:
            k = line.split('=', 1)[1].strip().strip('\"')
            print(k, end='')
            break
")
curl -s -X POST \
  -H "apikey: $KEY" \
  -H "Authorization: Bearer *** \
  -H "Content-Type: application/json" \
  -d '{"project_id":"b6ae36fb-805b-4ff5-84ba-91fbccd46334","target":"all_characters","mode":"refresh_stale"}' \
  "https://hdfderbphdobomkdjypc.supabase.co/functions/v1/generate-visual-dna-from-canon"