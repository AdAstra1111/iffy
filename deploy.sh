#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════════
# IFFY Deploy — Everything. One command. Zero fuss.
# ═══════════════════════════════════════════════════════════════
# Prerequisites:
#   - Vercel CLI logged in (vercel whoami)
#   - Supabase CLI installed (supabase --version)
#   - SUPABASE_ACCESS_TOKEN in env or supabase login
# ═══════════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check() {
  if [ $? -eq 0 ]; then echo -e "${GREEN}✓${NC} $1"; else echo -e "${RED}✗${NC} $1"; exit 1; fi
}

echo ""
echo "══════════════════════════════════════════════"
echo "  IFFY Deploy — Full Stack"
echo "══════════════════════════════════════════════"
echo ""

# ── Step 1: Build frontend ──
echo "◆ Building frontend..."
npm run build --silent 2>/dev/null || npm run build
check "Frontend build"

# ── Step 2: Deploy frontend to Vercel ──
echo ""
echo "◆ Deploying frontend to Vercel..."
DEPLOY_OUTPUT=$(vercel deploy --prod --yes 2>&1)
echo "$DEPLOY_OUTPUT"
if echo "$DEPLOY_OUTPUT" | grep -q "Aliased"; then
  echo -e "${GREEN}✓${NC} Frontend deployed"
else
  echo -e "${YELLOW}⚠${NC} Frontend deploy may need checking"
fi

# ── Step 3: Deploy Supabase edge functions ──
echo ""
echo "◆ Deploying Supabase edge functions..."
for fn in supabase/functions/*/; do
  name=$(basename "$fn")
  case "$name" in
    _shared|_temp-bootstrap|test-deploy|test-env) continue ;;
  esac
  if [ -f "${fn}index.ts" ]; then
    echo "  Deploying: $name"
    supabase functions deploy "$name" --project-ref hdfderbphdobomkdjypc --no-verify-jwt --use-api 2>&1 | tail -1
  fi
done
check "Edge functions deployed"

echo ""
echo "══════════════════════════════════════════════"
echo -e "${GREEN}  Deploy complete${NC}"
echo "══════════════════════════════════════════════"
echo ""
echo "  Frontend:  https://iffy-analysis.vercel.app"
echo "  Functions: https://hdfderbphdobomkdjypc.supabase.co/functions/v1/"
echo ""
