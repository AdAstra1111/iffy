# IFFY Deployment Guide

## Overview

IFFY has a **single unified deployment pipeline** that handles both frontend (Vercel) and edge functions (Supabase) in one workflow.

**File:** `.github/workflows/deploy.yml`

The pipeline:
1. Detects what changed (frontend paths vs. function paths)
2. Validates and deploys edge functions to Supabase (if changed)
3. Deploys frontend to Vercel via **OIDC** (no static VERCEL_TOKEN) (if changed)
4. Verifies the production URL returns HTTP 200 with expected content

---

## Unified Pipeline

### Trigger

Push to `main` affecting any of:
- `src/**` — application code
- `api/**` — Vercel serverless functions
- `supabase/functions/**` — edge functions
- `supabase/config.toml` — Supabase configuration
- `index.html`, `package.json`, `vite.config.ts`, `vercel.json` — build config
- `tsconfig*.json` — TypeScript configuration
- `tailwind.config.ts`, `postcss.config.js` — styling config

Also triggerable manually via GitHub → Actions → Deploy All → Run workflow.

### Path Detection

The workflow uses `dorny/paths-filter@v3` to detect which paths changed:

| Filter | Paths | Action |
|--------|-------|--------|
| `frontend` | `src/`, `api/`, `index.html`, `package.json`, `vite.config.ts`, etc. | Deploy to Vercel |
| `functions` | `supabase/functions/`, `supabase/config.toml` | Validate + deploy to Supabase |

If only frontend files changed, the function steps are skipped. If only edge functions changed, the Vercel step is skipped. If both changed, everything runs.

### Edge Function Validation

Before deployment, each edge function is checked with `deno check` to catch:
- Syntax errors
- Missing imports
- Type mismatches
- Merge conflict artifacts

Errors are warnings (non-blocking) — the function still deploys. Fix them promptly.

### Edge Function Deployment

Deployed via a **shell for-loop**, not `--all` (the `--all` flag is not supported by the Supabase CLI). This ensures new functions are automatically picked up without editing workflow files.

### Frontend Deployment (OIDC)

The frontend deploys to Vercel via **GitHub OIDC** — no `VERCEL_TOKEN` needed. The `--token` flag is completely absent from the unified workflow. GitHub and Vercel negotiate auth using OpenID Connect.

Build happens on Vercel's infrastructure using the `buildCommand` from `vercel.json`. VITE_ environment variables are passed as `--build-env` from GitHub secrets.

**Permissions required in deploy.yml:**
```yaml
permissions:
  id-token: write
  contents: read
```

### Deploy Verification

After deploying to Vercel, the workflow curls the production URL with a retry loop:
- **12 attempts** with **5-second intervals** (~60s total)
- Checks for **HTTP 200** and expected content (`root`, `app`, `IFFY`, or `iffy` in the HTML)
- Fails the workflow if verification doesn't pass within the retry window

---

## OIDC Setup (One-Time Manual Steps)

To replace the expiring `VERCEL_TOKEN` with GitHub OIDC:

1. **Enable OIDC in Vercel**
   - Go to Vercel Dashboard → Team Settings → Git
   - Enable "GitHub OIDC" for your team

2. **Configure GitHub OIDC trust with Vercel**
   - Follow Vercel's instructions to add the OIDC provider
   - Vercel will provide a thumbprint — add it to your GitHub OIDC configuration

3. **Remove VERCEL_TOKEN from GitHub secrets**
   - Go to GitHub → IFFY repo → Settings → Secrets and variables → Actions
   - Delete `VERCEL_TOKEN`

> **Why OIDC?** Static tokens expire and require manual rotation. OIDC uses short-lived tokens issued by GitHub's OIDC provider, which Vercel trusts. No secrets to manage, no rotation needed.

---

## Deprecated Workflows

| File | Status | Why |
|------|--------|-----|
| `.github/workflows/deploy-frontend.yml` | DEPRECATED — workflow_dispatch only | Replaced by unified deploy.yml |
| `.github/workflows/deploy-functions.yml` | DEPRECATED — workflow_dispatch only | Replaced by unified deploy.yml |

These files are kept for backward compatibility (accessible via manual `workflow_dispatch` in the GitHub Actions UI). **They no longer trigger on push.** Remove them after `deploy.yml` has been proven stable in production.

---

## Rollback Procedures

### Frontend rollback

1. **Option A: Revert the commit on main**
   ```bash
   git revert <bad-commit-hash>
   git push origin main
   ```
   The deploy workflow runs automatically and deploys the reverted version.

2. **Option B: Vercel Dashboard**
   - Go to [Vercel Dashboard](https://vercel.com) → IFFY project → Deployments
   - Find the last known-good deployment
   - Click "..." → "Promote to Production"

### Edge function rollback

1. **Option A: Revert the commit** (same as frontend)
2. **Option B: Deploy a specific previous version via CLI**
   ```bash
   supabase functions deploy <function-name> \
     --project-ref hdfderbphdobomkdjypc \
     --no-verify-jwt
   ```

---

## Environment Variables

### Managed in GitHub Secrets

| Variable | Purpose | Required In |
|----------|---------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL | Vercel build |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon public key | Vercel build |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project ref | Vercel build |
| `SUPABASE_ACCESS_TOKEN` | Supabase PAT for edge function deploys | GitHub Actions |
| ~~`VERCEL_TOKEN`~~ | ~~Vercel API token for CI/CD~~ | **REMOVED — OIDC replaces this** |

### Managed in Vercel Dashboard (secrets)

These are set in Vercel Project Settings → Environment Variables (not in `vercel.json`):

| Variable | Purpose |
|----------|---------|
| `VERCEL_ORG_ID` | Vercel organization ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key (keep secret) |

### To update a secret

1. Go to GitHub → IFFY repo → Settings → Secrets and variables → Actions
2. Update the secret value
3. Trigger a manual deploy via GitHub Actions

---

## Pre-Deployment Checklist

Before pushing to `main`:

- [ ] `npm run build` passes locally
- [ ] `npm run lint` reports no errors
- [ ] `npm run test` passes (full suite)
- [ ] No merge conflict markers (`<<<<<<`, `======`, `>>>>>>`) in changed files
- [ ] New edge functions have valid `index.ts` with correct imports
- [ ] Hardcoded secrets are **not** in `vercel.json` or any committed file
- [ ] `vercel.json` changes are reviewed for env var/header correctness
- [ ] If changing Supabase schema: migration file is committed
- [ ] If adding a new edge function: directory is under `supabase/functions/`

---

## Post-Deployment Verification

After deployment completes, the workflow automatically verifies the production URL. Manual checks:

- [ ] Visit the production URL — page loads without errors
- [ ] Check Vercel Dashboard → Deployments — status is "Ready"
- [ ] Check browser console — no 404s for JS/CSS assets
- [ ] Verify any new features work end-to-end
- [ ] Check edge function logs in Supabase Dashboard → Edge Functions → Logs
- [ ] If regression is suspected: rollback via git revert

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| OIDC auth fails | OIDC not configured in Vercel | Complete the one-time OIDC setup (see above) |
| Build fails in CI but works locally | Cache mismatch or env var missing | Clear Vite cache (`rm -rf node_modules/.vite`), verify GitHub secrets |
| Stale JS/CSS after deploy | CDN cache on index.html | `s-maxage=0` should prevent this; verify header is present |
| Edge function deploy fails | Syntax error or missing dependency | Check `deno check` output, fix the issue, redeploy |
| "Function not found" 404 | Function missing from deploy list | With dynamic for-loop this shouldn't happen; verify directory exists |
| Deploy verification fails | Deploy not propagated or content changed | Check Vercel dashboard; run workflow again if transient |
| Page renders blank | JS runtime error | Check browser console; rollback via git revert if needed |