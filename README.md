# IFFY

**Intelligent Framework for Film & Yonder** — a full-stack narrative production operating system for the entertainment industry.

IFFY atomises stories into structured documents, evaluates them via convergence analysis (GP + CI scores), reverse-ingests existing projects, and extends into real production intelligence.

---

## Tech Stack

- **Frontend**: React + TypeScript (Vite + shadcn-ui + Tailwind)
- **Backend**: Supabase (Postgres + Edge Functions / Deno)
- **Deployment**: Vercel (frontend) + Supabase (edge functions)
- **AI**: Multi-LLM gateway via `ai.gateway.lovable.dev`

## Project Structure

```
src/                          # Frontend application
  pages/                      # Route pages
  components/                 # UI components
  lib/                        # Pure logic (no React)
  hooks/                      # React hooks
  integrations/supabase/      # Typed Supabase client
  config/                     # Document type registries

supabase/functions/           # Edge Functions (Deno)
  auto-run/                   # Pipeline orchestrator
  dev-engine-v2/              # AI document generation
  _shared/                    # Shared utilities
    ladder-invariant.ts       # Stage progression guard
    decisionPolicyRegistry.ts # Promotion routing
    chunkRunner.ts            # Section-by-section assembly

api/                          # Vercel serverless functions
  supabase-proxy/             # Edge function proxy (CORS + auth)
  llm.ts                      # LLM gateway
```

See `DEPLOYMENT.md` for deployment procedures, rollback, and troubleshooting.

---

## Development

```bash
npm run dev          # Dev server on port 8080
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest (single run)
```

See `CLAUDE.md` for architecture guidance and protected files.