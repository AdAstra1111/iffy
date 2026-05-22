# Work Notes for Kid — May 21, 2026

**Source:** Red + Sebastian session (Telegram)
**Date:** 2026-05-21
**Chain:** Red (not Keymaker)

## Files to Ingest

The following work notes are in `_red/work-notes/` — Red's vault space. They need reviewing, distilling, and filing into the `knowledge/` structure.

### 1. `_red/work-notes/2026-05-21_weekly-trends-cron-setup.md`
**What changed:** pg_cron job set up to auto-refresh trend signals. Runs Monday 06:00 UTC. Calls `scheduled-refresh-trends` edge function. Handles film, tv-series, vertical-drama, animation.
**Why it matters:** Trends were only refreshing manually before (Sebastian clicked refresh "a few times ever"). Now automated weekly.
**Files:** Migration at `supabase/migrations/20260521000000_setup_weekly_trends_cron.sql`. Deploy script updated. Cron secret regenerated.
**Ingest to:** `knowledge/design-decisions.md` + `knowledge/pipeline-patterns.md`

### 2. `_red/work-notes/2026-05-21_iffy-pipeline-map.md`
**Content:** Complete end-to-end pipeline map from Trends → Pitch → Dev Seed → Dev Engine → Atomizer → Visual Pipeline. 13 atom types, 9 visual stages. Discovered that ChatGPT's Strategic Directive described what already exists in code — the atomization framework was already built.
**Why it matters:** This is the authoritative architecture reference. The chain (Morpheus, Architect, etc.) should know this. The neural sidecar should plug INTO existing visual canon system, not sit separately.
**Ingest to:** `knowledge/design-decisions.md` + `knowledge/agent-patterns.md`

### 3. `_red/work-notes/2026-05-21_neural-sidecar-status.md`
**Content:** Neural validation sidecar built with TRIBE v2. Branch `preview/neural-sidecar`. `/dev/neural` route. Deterministic inference found.
**Status:** Phase 1 of 8. Not integrated into pipeline yet. Not deployed to production.
**Ingest to:** `knowledge/design-decisions.md` (architecture decision: neural is instrumentation only)

### 4. `_red/work-notes/2026-05-21_auto-run-pending.md`
**Content:** Auto-run pipeline (12,432 lines) flagged as not working by Sebastian. Self-chain architecture with known freeze bugs documented in PIPELINE_DEBUG_PROTOCOL.md. Not yet diagnosed.
**Status:** Pending investigation — Sebastian asked for trends first.
**Ingest to:** `knowledge/pipeline-patterns.md` (known failure pattern)

---

## Summary for Kid's Ingestion

| Priority | Topic | Type | For knowledge/ |
|----------|-------|------|----------------|
| HIGH | Weekly trends cron setup | Configuration change | design-decisions, pipeline-patterns |
| HIGH | Complete pipeline map | Architecture reference | design-decisions, agent-patterns |
| MEDIUM | Neural sidecar status | Feature in progress | design-decisions |
| MEDIUM | Auto-run pending issue | Known bug | pipeline-patterns |

**Tag all entries with:** `date:2026-05-21`, `chain:red-sebastian`, `source:red-work-notes`