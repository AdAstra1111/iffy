#!/bin/bash
set -e

# Ensure SUPABASE_ACCESS_TOKEN is available for supabase CLI
# Note: HOME is overridden in Hermes, so use hard-coded path
if [ -z "$SUPABASE_ACCESS_TOKEN" ] && [ -f "/Users/laralane/.config/supabase/access-token" ]; then
  export SUPABASE_ACCESS_TOKEN=$(cat "/Users/laralane/.config/supabase/access-token")
fi

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "==========================================="
echo "  IFFY Deploy - Full Stack"
echo "==========================================="
echo ""

echo "1. Building frontend..."
npm run build --silent 2>/dev/null || npm run build
echo -e "${GREEN}OK${NC} Frontend built"
echo ""

echo "2. Deploying frontend to Vercel..."
if vercel deploy --prod --yes 2>&1 | grep -q "Aliased"; then
  echo -e "${GREEN}OK${NC} Frontend live at https://iffy-analysis.vercel.app"
else
  echo -e "${YELLOW}Check${NC} Deploy result above"
fi
echo ""

echo "3. Deploying edge functions..."
FUNCTIONS="dev-engine-v2 auto-run devseed-autopilot devseed-orchestrator generate-seed-pack generate-document promote-to-devseed derive-seed-docs canon-decisions scheduled-refresh-trends refresh-trends canonicalize-scene-substrate compute-obligation-topology enrich-visual-dna-from-atoms pipeline-orchestrator project-incentive-insights research-incentives packaging-intelligence generate-lookbook-image generate-hero-frames generate-poster evaluate-visual-governance repair-visual-intents hero-frame-preflight lookbook-preflight"
for fn in $FUNCTIONS; do
  if [ -f "supabase/functions/$fn/index.ts" ]; then
    echo "  -> $fn"
    supabase functions deploy "$fn" --project-ref hdfderbphdobomkdjypc --no-verify-jwt --use-api 2>&1 | tail -1
  fi
done
echo -e "${GREEN}OK${NC} Edge functions deployed"
echo ""

echo "==========================================="
echo -e "${GREEN}  Deploy complete${NC}"
echo "==========================================="
echo ""
echo "  Frontend:  https://iffy-analysis.vercel.app"
echo "  Functions: https://hdfderbphdobomkdjypc.supabase.co/functions/v1/"
echo ""
