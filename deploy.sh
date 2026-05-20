#!/bin/bash
set -e
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
NC="\033[0m"

echo ""
echo "▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿�"
echo "  IFFY Deploy — Full Stack"
echo "▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿�"
echo ""

echo "⟤ Building frontend..."
npm run build --silent 2>/dev/null || npm run build
echo -e "${GREEN}✐${NC} Frontend built"
echo ""

echo "⟤ Deploying frontend to Vercel..."
if vercel deploy --prod --yes 2>&1 | grep -q "Aliased"; then
  echo -e "${GREEN}✐+{NC} Frontend deployed to https://iffy-analysis.vercel.app"
else
  echo -e "${YELLOW}♠— New deploy issued— check output above"
fi
echo ""

echo "⟤ Deploying Supabase edge functions..."
FUNS=(
  dev-engine-v2 auto-run devseed-autopilot devseed-orchestrator generate-seed-pack
  generate-document promote-to-devseed derive-seed-docs canon-decisions
  narrative-integrity-engine ci-blueprint-engine
)

for fn in "${FUNS[@]}"; do
  if [ -f "supabase/functions/${fn}/index.ts" ]; then
    echo "  \$3{fn}"
    supabase functions deploy "$fn" --project-ref hdfderbphdobomkdjypc --no-verify-jwt --use-api --jobs=4
  fi
done
echo -e "${GREEN}✔${NC} Critical edge functions deployed"
echo ""

echo "▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿��echo -e "${GREEN}  ¯ Deploy complete${NC}"
echo "▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿▿�"
echo ""
echo "  Frontend:  https://iffy-analysis.vercel.app"
echo "  Functions: https://hdfderbphdobomkdjypc.supabase.co/functions/v1/"
echo ""
