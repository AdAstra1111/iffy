# IFFY Agent Knowledge — Accumulated from Oracle-Sebastian Sessions

> **Purpose:** All agents MUST read this before making any code change, fix, or pipeline decision. This documents the actual code paths, root causes, and lessons learned from bugs that have already been solved. Skipping this and repeating old mistakes is a hard failure.

## 1. CRITICAL: Trace Code Paths Before Fixing

**Never assume you know which code path a bug follows.** Always trace the actual runtime path from user action to database.

**How to trace:**
1. Get the console errors from Sebastian (frontend JS stack traces)
2. Check the file name: PitchIdeas js = frontend bundle. supabase/functions/dev-engine-v2 = backend function.
3. Frontend bundles at iffy-analysis.vercel.app/assets/<filename>.js
4. Backend functions at hdfderbphdobomkdjypc.supabase.co/functions/v1/<name>

**The mistake that repeated:** Oracle deployed fixes to devseed-autopilot and devseed-orchestrator (backend functions) when the DevSeed creation actually flows through ApplyDevSeedDialog.tsx (frontend) → calls dev-engine-v2 directly. Four backend function deploys were wasted before the actual code path was traced.

## 2. DevSeed Creation Flow

**Actual path when a user creates a project from DevSeed:**

Frontend: ApplyDevSeedDialog.tsx
  → calls generate-pitch (gets pitch idea)
  → creates project row
  → creates individual documents (idea, concept_brief, format_rules, treatment, character_bible, market_sheet)
  → calls dev-engine-v2 regen-insufficient-start with docTypeWhitelist
  → dev-engine-v2 regenerates stubs using loadConstraintPack() for context

**Key files:** src/components/pitch/ApplyDevSeedDialog.tsx, supabase/functions/dev-engine-v2/index.ts, supabase/functions/generate-pitch/index.ts

**NOT used in DevSeed creation (do NOT patch these for DevSeed bugs):**
- devseed-autopilot — autopilot pipeline (runs AFTER project creation if autopilot enabled)
- devseed-orchestrator — separate orchestration pipeline
- promote-to-devseed — used by Promote to DevSeed button, different flow

## 3. Document Ladder: vertical-drama

idea → concept_brief → format_rules → character_bible → season_arc → episode_grid → vertical_episode_beats → season_script

Defined in:
- supabase/_shared/stage-ladders.json
- supabase/functions/_shared/stage-ladders.ts
- supabase/functions/_shared/stage-ladders.js
- src/config/documentLadders.ts (frontend copy)

All three sources must stay in sync. If you change one, regenerate the others.

DevSeed hardcoded list (separate from ladder):
- src/components/pitch/ApplyDevSeedDialog.tsx line 33: DEVSEED_DOC_TYPES
- Currently: idea, concept_brief, format_rules, treatment, character_bible, market_sheet

## 4. Budget Flow (Pitch Criteria to Document Content)

Pitch Idea (budget_band) → ApplyDevSeedDialog creates project with budget_range → dev-engine-v2 loadConstraintPack reads project.budget_range → Budget constraint injected into LLM prompt

Files: src/components/pitch/ApplyDevSeedDialog.tsx line 483, dev-engine-v2/index.ts loadConstraintPack, devseed-autopilot line 544

Key insight: TWO budget sources exist. Project budget_range (from pitch criteria = what user specified) and trend signal market data (Micro budget = market default). The LLM must see the user criteria.

## 5. Proxy Architecture (Vercel to Supabase Direct)

Vercel proxy has 10-second timeout on Hobby plan. Causes 503 for AI generation >10s.

Fix: Frontend calls Supabase directly. 36 files batch-replaced (commit e1d87cf).
Old: /api/supabase-proxy/functions/v1/dev-engine-v2
New: https://hdfderbphdobomkdjypc.supabase.co/functions/v1/dev-engine-v2

Auth gate also fixed: handles role: anon with userId null fallback to project creator.

Keep-warm: Script at /Users/laralane/.hermes/scripts/watchdog/keep_warm.sh pings every 15s.

## 6. Auth Gate Fix

Supabase edge functions returned 401 with anon key JWT. Auth gate didn't handle role: anon.

Fix: if role is anon, use project creator ID as fallback. Applied to dev-engine-v2 and resolve-qualifications.

## 7. Stale Document Hashes

After canon changes, documents show stale with hash mismatch. This is INTENTIONAL. Documents SHOULD show stale when canon changes — regeneration needed. The Regenerate button creates new version with updated hash.

## 8. Pipeline Debug

Before touching auto-run or dev-engine-v2 for any pipeline stall: read docs/PIPELINE_DEBUG_PROTOCOL.md.

Key invariant: Every document query must use approval_status = approved AND is_current = true.

## 9. Known Pitfalls

- format_rules missing: not in DEVSEED_DOC_TYPES → fix at ApplyDevSeedDialog.tsx:33
- Budget ignored: loadConstraintPack not reading budget_range → fix at dev-engine-v2 loadConstraintPack
- 503 on generation: Vercel proxy timeout → bypass proxy, direct Supabase calls
- object Object toast: error handler passes object → add string-type guards
- Null value in column user_id: auth gate returns null → add project creator fallback
- 401 from function: auth gate rejects anon → add role anon handler
- Ladder out of sync: only one source updated → sync json/ts/js

## 10. Pipeline Chain

oracle → architect → morpheus → trinity → seraph → agent smith → keymaker

Morpheus gate is mandatory. Morpheus sends back to Architect if issues found. No agent bypasses chain. Deploy step is mandatory after Keymaker.

## 11. Deployment

Vercel: auto-deploys on push to main via GitHub Actions.
Supabase Functions: manual via supabase functions deploy name --no-verify-jwt

Verify: curl -s https://iffy-analysis.vercel.app/index.html | grep -o src=...

Protected files (Lovable may revert): ladder-invariant.ts, chunkRunner.ts, decisionPolicyRegistry.ts, docPurposeRegistry.ts, auto-run/index.ts, dev-engine-v2/index.ts, ProjectDevelopmentEngine.tsx, drift-lock test files.

## 12. Key Contacts

Supabase: hdfderbphdobomkdjypc.supabase.co
Vercel: iffy-analysis (GitHub auto-deploy)
Keep-warm: /Users/laralane/.hermes/scripts/watchdog/keep_warm.sh (15s interval)
Agent workspace: /Users/laralane/.hermes/profiles/<agent>/workspace/

## 13. Pipeline Pre-Check Protocol

Before executing any work on the IFFY codebase, every agent MUST:
1. Read this file (docs/AGENT_KNOWLEDGE.md)
2. Check Kid ingested knowledge for related context
3. Verify the planned fix is on the correct code path (frontend bundle vs backend function)
4. Document what was checked and cite the relevant section in the task body
