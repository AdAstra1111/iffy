# Deployment

**One command to deploy everything:**

```bash
./deploy.sh
```

## What it does

1. **Builds the frontend** (`npm run build`)
2. **Deploys to Vercel** (`vercel deploy --prod`) — logged in as `adastra1111`
3. **Deploys all Supabase edge functions** (`supabase functions deploy <name>`)

That's it. ~60 seconds total.

## Prerequisites

The deploy script requires:
- `vercel` CLI logged in (Vercel account `adastra1111`)
- `supabase` CLI with `SUPABASE_ACCESS_TOKEN` configured

These are already set up on the Oracle machine. If deploying from a different machine,
run `vercel login` and `supabase login` first.

## When to deploy

Every agent runs `./deploy.sh` as the FINAL step of their task — after implementation,
testing, and review are all complete. One command, no CI/CD confusion.

## Why no GitHub Actions?

Vercel has a native GitHub integration that auto-deploys the frontend on push to `main`.
The GitHub Actions workflows (`deploy-frontend.yml`) exist only as manual fallback triggers
(`workflow_dispatch`). Edge functions cannot auto-deploy — they require explicit CLI invocation.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `vercel` not logged in | `vercel login` |
| `supabase` not logged in | `supabase login` |
| `SUPABASE_ACCESS_TOKEN` missing | Set in env or `~/.supabase/token.json` |
| Deploy fails mid-way | Run `./deploy.sh` again — it's idempotent |
