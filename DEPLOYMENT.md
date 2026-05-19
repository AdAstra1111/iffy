# IFFY Deployment Guide

## Overview

IFFY has two independent deployment pipelines:

1. **Frontend (Vite/React SPA)** — deployed to Vercel via GitHub Actions
2. **Edge Functions (Supabase/Deno)** — deployed to Supabase via GitHub Actions

Both deploy automatically on push to `main`, but through separate workflows.

---

## Frontend Deployment

### Trigger

Push to `main` affecting any of:
- `src/**` — application code
- `api/**` — Vercel serverless functions
- `index.html`, `package.json`, `vite.config.ts`, `vercel.json` — build config
- `tailwind.config.ts`, `postcss.config.js` — styling config

Also triggerable manually via GitHub → Actions → Deploy Frontend → Run workflow.

### Workflow

File: `.github/workflows/deploy-frontend.yml`

1. Checkout repo
2. Install Vercel CLI
3. Deploy to Vercel Production with `vercel deploy --prod`

Build happens on Vercel's infrastructure using the `buildCommand` from `vercel.json`. VITE_ environment variables are passed as `--build-env` from GitHub secrets.

### What gets deployed

- Built SPA assets to Vercel CDN (`dist/` with content-hashed filenames)
- Vercel serverless functions under `api/`
- Vercel edge functions under `api/supabase-proxy/`

### CDN Caching

- `index.html`: `no-cache, no-store, must-revalidate` — always fresh
- `/assets/*`: `public, max-age=31536000, immutable` — content-hashed filenames ensure cache-busting on change
- No deploy-trigger commits needed — the CDN respects these headers

---

## Edge Function Deployment

### Trigger

Push to `main` affecting `supabase/functions/**`.

### Workflow

File: `.github/workflows/deploy-functions.yml`

1. Checkout repo
2. Setup Supabase CLI + Deno
3. Validate edge functions with `deno check`
4. Deploy **all** edge functions with `supabase functions deploy --all`

### Validation Step

Before deployment, each edge function is checked with `deno check` to catch:
- Syntax errors
- Missing imports
- Type mismatches
- Merge conflict artifacts

Errors are warnings (non-blocking) — the function still deploys. Fix them promptly.

### Adding a new edge function

Create a new directory under `supabase/functions/<name>/` with an `index.ts`.
The deploy workflow picks it up automatically — **no need to edit the workflow file.**

**Do not** add directories for experimental or unfinished functions. Either finish them or keep them outside `supabase/functions/`.

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

### Managed in Vercel Dashboard (secrets)

These are set in Vercel Project Settings → Environment Variables (not in `vercel.json`):

| Variable | Purpose |
|----------|---------|
| `VERCEL_TOKEN` | Vercel API token for CI/CD |
| `VERCEL_ORG_ID` | Vercel organization ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key (keep secret) |
| `SUPABASE_ACCESS_TOKEN` | Supabase PAT for edge function deploys |

### Injected at build time (from GitHub secrets)

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon public key |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project ref |

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

After deployment completes:

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
| Build fails in CI but works locally | Cache mismatch or env var missing | Clear Vite cache (`rm -rf node_modules/.vite`), verify GitHub secrets |
| Stale JS/CSS after deploy | CDN cache on index.html | `s-maxage=0` should prevent this; verify header is present |
| Edge function deploy fails | Syntax error or missing dependency | Check `deno check` output, fix the issue, redeploy |
| "Function not found" 404 | Function missing from deploy list | With `--all` this shouldn't happen; verify directory exists |
| Page renders blank | JS runtime error | Check browser console; rollback via git revert if needed |
