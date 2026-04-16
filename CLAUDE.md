# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server on port 8080
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest (single run)
npm run test:watch   # Vitest watch mode
```

Run a single test file:
```bash
npx vitest run src/test/ladder-invariant-guard.test.ts
```

## Architecture Overview

IFFY is a React/TypeScript SPA (Vite + shadcn-ui + Tailwind) backed by Supabase (Postgres + Edge Functions) and deployed on Vercel.

### Key Layers

**Frontend** (`src/`)
- `App.tsx` — router root; pages lazy-loaded with `React.lazy`; auth wraps all `/app/*` routes
- `src/pages/` — one page per route; `ProjectDevelopmentEngine.tsx` is the critical development workflow page
- `src/components/` — UI components; `src/lib/` — pure logic (no React)
- `src/hooks/` — React hooks; `src/integrations/supabase/` — typed Supabase client
- `src/config/documentLadders.ts` — canonical document type registry (`BASE_DOC_TYPES`, `formatToLane`, etc.)
- `src/lib/eligibilityRegistry.ts` — **single source of truth for all promotion gates** — never duplicate or bypass

**Supabase Edge Functions** (`supabase/functions/`)
- Deno runtime; shared utilities in `supabase/functions/_shared/`
- `auto-run/` — pipeline orchestrator; drives the development ladder via self-chain fetches
- `dev-engine-v2/` — AI document generation; chunked via `_shared/chunkRunner.ts`
- `_shared/ladder-invariant.ts` — canonical stage progression guard; all promotion logic must use this
- `_shared/decisionPolicyRegistry.ts` — `getNextStage` routes through `ladder-invariant.ts`

**Vercel API** (`api/`)
- `supabase-proxy.ts` / `api/supabase-proxy/[...path]/route.ts` — proxies all edge function calls from the frontend (avoids CORS and allows auth injection)
- `llm.ts` — LLM gateway proxy

### Pipeline Self-Chain Architecture (Critical)

The `auto-run` pipeline works via HTTP self-chaining:
```
Frontend polls job → calls POST /auto-run { action: "run-next" }
  → PREP_SETUP gate (sync) → spawns bgTask (async, fire-and-forget via waitUntil)
    → bgTask completes → self-chain fetch to /auto-run { action: "run-next" }
      → repeat
```

**`respondWithJob(supabase, jobId, "run-next")` returns an HTTP response to its caller — it does NOT invoke run-next itself.** If called inside a fire-and-forget bgTask chain, the response is discarded and the pipeline freezes. Always self-chain with `{ action: "run-next", jobId }` from bgTask.

### Authoritative Version Invariant

Every document query must use:
```
approval_status = 'approved' AND is_current = true
```
Historical versions are archival only and must never drive pipeline decisions. `effectiveVersionId = authoritativeVersion.id` (or `selectedVersionId` only when no authoritative exists).

### Format Ladders

Each format has its own stage ladder — no universal pipeline:
- Feature Film: Idea → Concept Brief → Market Sheet → Character Bible → Story Architecture → Screenplay
- Series: Idea → Concept Brief → Series Bible → Season Arc → Episode Outline → Episode Script
- Vertical Drama: Idea → Concept Brief → Market Sheet → Character Bible → Season Grid → Season Script
- Documentary: Idea → Concept Brief → Research Dossier → Narrative Structure → Production Script

Ladder definitions live in `supabase/_shared/stage-ladders.json`. Do not add `blueprint`, `architecture`, `draft`, or `coverage` as ladder keys — these are banned legacy keys.

### IEL (Invariant Enforcement Layer)

Critical events must be emitted as structured logs: `authoritative_version_resolved`, `promotion_gate_version_bound`, `stage_transition`, `ladder_validation_passed`, `lane_validation_passed`, etc. IEL must fail **closed** on ambiguity.

## Branch Workflow

- `main` is protected — no direct pushes; PRs required
- Lovable (the AI coding tool) pushes to the `lovable` branch and opens PRs to `main`
- Lara reviews and merges Lovable PRs, checking for regressions against protected files

## Protected Files — Verify on Every Lovable PR

These files carry critical hardening that Lovable may accidentally revert:

- `supabase/functions/_shared/ladder-invariant.ts`
- `supabase/functions/_shared/chunkRunner.ts` — must atomically clear `bg_generating: false` on assembly
- `supabase/functions/_shared/decisionPolicyRegistry.ts`
- `supabase/functions/_shared/docPurposeRegistry.ts`
- `supabase/functions/_shared/narrativeIntegrityEngine.ts` / `narrativeIntegrityValidator.ts`
- `supabase/functions/auto-run/index.ts`
- `supabase/functions/dev-engine-v2/index.ts` — AI gateway must use `ai.gateway.lovable.dev`
- `supabase/functions/generate-document/index.ts` — must use `serviceClient` for background DB writes
- `src/pages/ProjectDevelopmentEngine.tsx` — see DO NOT REVERT below
- `src/test/ladder-invariant-guard.test.ts`
- `src/test/stage-ladders-canonical.test.ts`
- `.github/workflows/lara-regression-guard.yml`
- `vercel.json` — must point to project `hdfderbphdobomkdjypc`, NOT `tzdxrhklarzccqamxbxw`

## DO NOT REVERT

**`runAnalysisWithContext` in `ProjectDevelopmentEngine.tsx`**: The `isBgGenerating` check must NOT be added back to this guard. The `bg_generating` flag can be permanently stuck `true` on versions that have real content (pre-fix versions where chunkRunner didn't clear it atomically). The backend (`dev-engine-v2`) already rejects genuinely empty documents; the frontend guard is content-check only.

## Pipeline Debug

Before touching `auto-run` or `dev-engine-v2` for any pipeline stall, read `docs/PIPELINE_DEBUG_PROTOCOL.md` in full. The stall point maps to a specific line in `auto-run/index.ts` — identify it before writing any code.

## Tests

Tests live in both `src/__tests__/` and `src/test/`. The test suite includes drift-lock tests (`*-drift-lock.test.ts`) that guard canonical registries against silent changes — these will fail if you rename or remove canonical values. Run the full suite before merging.
