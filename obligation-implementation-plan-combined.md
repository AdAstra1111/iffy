# Obligation Detection — Combined Implementation Plan

**Date:** 2026-05-22
**Source:** Red (architecture + physicalization plan) + Oracle (review + additions)
**Status:** Pre-roundtable draft
**Next step:** Sebastian + ChatGPT review, then architect task

---

## The Core Principle

Obligations are a **read enrichment**, not a write transformation.

They read from existing tables (scene graph, entity links, beat sheet, story outline), detect structural promises, and write to `narrative_obligations`. They never modify existing data. They never block the pipeline. If detection fails, zero obligations is a valid state.

---

## Architecture (Red)

### Stage 3.6: obligation_detect

Same pattern as Stage 3.5 (canonicalize):

```typescript
{ key: 'obligation_detect', label: 'Detecting narrative obligations…',
  functionName: 'dev-engine-v2', actionName: 'obligation_detect',
  retryable: true }
```

**Intake Pipeline (updated):**
```
3. scene_extract       → scene_graph_extract
3.5 canonicalize       → canonicalize-scene-substrate
3.6 obligation_detect  → dev-engine-v2:obligation_detect   ← NEW
4. entity_extract       → entity-links-engine
...
```

**Safety:**
- Added to `retryableStages` → failure doesn't block intake
- Added to `failedStages`/`skippedStages` → pipeline continues
- If no beat sheet exists (documentary), detection skips gracefully
- Rollback: remove one line from STAGE_DEFINITIONS

### Protected Files — Untouched

| File | Reason |
|------|--------|
| `ladder-invariant.ts` | Obligations don't affect stage progression |
| `decisionPolicyRegistry.ts` | Obligations don't affect promotion gates |
| `chunkRunner.ts` | Detection is single-pass, not chunked |
| `auto-run/index.ts` | Detection runs in intake pipeline, not auto-run |
| `generate-document/index.ts` | Detection reads generated docs, doesn't write them |

### Format-Aware Detection

Every format has a scene graph + entities → structural + relationship obligations
Formats with beat sheets + story outlines → explicit obligations (mysteries, Chekhov's guns)
Documentary → structural + thematic only (no beat sheet = no explicit obligations)

Detection engine checks which document types exist and only detects what data supports.

---

## Build Sequence (Red's P0-P5 + Oracle's adjustments)

### P0 — Seed the Obligation Graph (1 day)

**Unlocks everything below.**

- Write 14 obligations from YETI into `narrative_obligations` using seed data
- Validate lifecycle model against production data
- Create view: obligation_id, type, charge, lifecycle_state, source_scene_key, target_scene_key, thread_label

**Oracle addition — P0.5: Verify Before Building**

After seeding, before automating: **validate the thermodynamic curve against the beat sheet's own structural markers.** The YETI beat sheet already tags: Inciting Incident (Beat 4/5), Plot Point 1 (Beat 9), Midpoint (Beat 24), All Is Lost (Beat 29), Climax (Beat 35).

If obligation energy peaks align with these markers → model is validated, proceed to P1.
If not → adjust detection rules before writing any pipeline code.

This catches fundamental model errors before they're baked into the pipeline.

---

### P1 — Obligation CRUD in the Pipeline (2 days)

- Add `obligation_detect` action handler to `dev-engine-v2/index.ts`
- Create `dev-engine-v2/obligation-detect.ts` — new file, isolated code
- Detection rules Phase 1: act boundaries → structural, entity co-occurrence → relationship, beat sheet entries → explicit obligations
- Wire as Stage 3.6 in `useScriptDropProject.ts`
- Add to Vercel proxy if needed (+ deploy.sh if new edge function)

**Dependency:** P0 validation passes
**Rollback:** Remove one line from STAGE_DEFINITIONS

---

### P2 — Thermodynamic Dashboard (3 days)

- Build `thermodynamic_metrics` view: aggregate obligations by act — loaded, discharged, net energy, average charge, temperature
- Build UI component: energy curve chart (acts on X, net load on Y)
- Build UI component: obligation list with lifecycle state badges
- Wire as conditional tab (renders only if obligations exist)
- No new backend routes (reads from existing `narrative_obligations` table)

**Oracle recommendation:** Solve the "active state" problem (Roundtable Question 2) BEFORE building the dashboard. Otherwise the curve will be misleading — 161 active obligations in Act 2 for 14 total obligations inflates the curve.

Simplest approach: "active" scenes = those containing obligation's source or target entity. This is derivable from existing entity_links data. No manual annotation needed.

---

### P3 — Convergence Integration (swap priority with field obligations)

**(Red had P4 here, Oracle recommends moving to P3)**

- Add obligation charge/discharge data into convergence scoring formula
- Scenes that discharge high-charge obligations get convergence bonus
- Add obligation_centrality to resolution density metric
- Wire into existing convergence score table

**Why this is P3, not P4:** This ties obligations into the existing quality measurement system. It makes obligations matter for scoring, not just display. Field detection (Red's P3) is interesting but doesn't unlock anything else.

---

### P4 — Field Obligation Detection (4 days)

- Character bibles → character arc obligations (want vs need gap)
- Entity co-occurrence patterns → relationship tension obligations
- Proximity analysis → deferred intimacy detection
- Add orthogonal discharge dimensions (informational, emotional, thematic)
- Test on non-YETI project (relationship drama or quiet film)

**Why this is P4 now:** It expands the model to quiet films, but doesn't unblock anything. Convergence integration (now P3) has higher impact.

---

### P5 — NIR + Deterministic Projection (5 days)

- Design NIR schema extension to `scene_graph_scenes`
- Build NIR enrichment stage (runs after canonicalize, before reverse-engineer)
- Each scene carries: dramatic_function, obligation_refs, temperature_shift, arc_transition, tension_gradient, projection_priority, canonical_density
- Build deterministic projection engine prototype

**Correctly placed last.** Everything below must be stable first.

---

## Oracle's Top-Level Observations

### 1. auto_approve_all and obligations are independent

Both can proceed in parallel:
- **auto_approve_all** (t_70581088) — runs during revision propagation. Lets Sebastian approve a story outline → propagate to beat sheet without CI gates blocking.
- **obligation_detect** (Stage 3.6) — runs during intake. Detects obligations from existing scene/entity data.

They touch different parts of the pipeline and don't conflict.

### 2. The roundtable questions map cleanly to the build sequence

| Question | Where it gets answered |
|----------|----------------------|
| Q1: Scene-to-obligation mapping precision | P0 seed data (manual mapping first) |
| Q2: Active state problem | P2 dashboard (before visualization) |
| Q3: Binary vs gradient discharge | P0 validation (if binary aligns with beat sheet markers, keep it) |
| Q4: Resolution density integration | P3 convergence integration |
| Q5: Taxonomy of types | P0 seed + P1 detection rules |
| Q6: Visualization | P2 dashboard |

### 3. The beat sheet already validates the model

The YETI beat sheet has explicit structural markers:
- Inciting Incident (Beat 4-5)
- Plot Point 1 (Beat 9)
- Midpoint (Beat 24)
- All Is Lost/Second Turning Point (Beat 29)
- Climax (Beat 35)

If obligation energy loading peaks at Inciting Incident, sustains through Midpoint, and discharges at Climax → the model is validated by the script's own structure. This is stronger evidence than any synthetic test.

---

## Summary

| Phase | What | Duration | Unlocks |
|-------|------|----------|---------|
| P0 | Seed obligation graph + validate against beat sheet markers | 1 day | Everything below |
| P0.5 | Verify energy curve alignment (Oracle addition) | 0.5 day | Confidence to build |
| P1 | Pipeline automation (Stage 3.6) | 2 days | Automatic detection |
| P2 | Thermodynamic dashboard | 3 days | Visual proof of model |
| P3 | Convergence integration (swap with field detection) | 3 days | Obligations affect scoring |
| P4 | Field obligation detection | 4 days | Quiet film support |
| P5 | NIR + deterministic projection | 5 days | Holographic leap |

**Total:** ~15-16 days, P0/P1 can overlap with auto_approve_all task

---

## Files That Need Changes

| File | Change | Risk |
|------|--------|------|
| `src/hooks/useScriptDropProject.ts` | Add obligation_detect to STAGE_DEFINITIONS | Low — same pattern as Stage 3.5 |
| `supabase/functions/dev-engine-v2/index.ts` | Add obligation_detect action handler | Medium — new feature, isolated path |
| `supabase/functions/dev-engine-v2/obligation-detect.ts` | NEW FILE — detection logic | Low — new file |
| `api/supabase-proxy/[...path]/route.ts` | Proxy if edge function needs it | Low |
| `src/pages/ProjectDevelopmentEngine.tsx` | Add conditional thermodynamics tab | Low |
| `src/components/thermodynamic-dashboard.tsx` | NEW FILE — dashboard | Low |

## Files That DON'T Change

ladder-invariant.ts, decisionPolicyRegistry.ts, chunkRunner.ts, auto-run/index.ts, generate-document/index.ts, stage-ladders.json, vercel.json
