# Obligation Detection — Combined Implementation Plan v2

**Date:** 2026-05-22
**Source:** Red (architecture) + Oracle (review) + ChatGPT (architectural rigor)
**Status:** Pre-roundtable draft, updated with ChatGPT's additions
**Next step:** Roundtable with Sebastian, then architect task

---

## The Core Principle

> "Obligations are a read enrichment, not a write transformation."

Protect this rule aggressively. The moment obligations become mutative, auto-corrective, or self-editing, the system risks contaminating the substrate with inferred structures that may be wrong.

Obligations are **observational overlays**, not canonical truth.

---

## The Most Important Hidden Risk

Obligation detection is NOT objective extraction. It is **probabilistic structural interpretation.** Even humans disagree about what was promised, when it loaded, whether it discharged, and whether it discharged satisfactorily.

This means obligations are not facts. They are probabilistic structural interpretations. That uncertainty must be represented explicitly in the schema.

### Required: Obligation Confidence Schema (before P1 goes live)

| Field | Meaning |
|-------|---------|
| `detection_confidence` | How certain the system is (0.0-1.0) |
| `evidence_refs` | Which scenes/beats support detection |
| `detection_mode` | explicit / inferred / thematic |
| `human_verified` | bool |
| `projection_scope` | which projections acknowledge it |

Without this, soft thematic readings become treated as hard canonical structure. That becomes dangerous during propagation and arbitration.

---

## Taxonomy Bifurcation

The current taxonomy is too plot-centric. It needs a split:

### Structural Obligations (plot-driven)
- mystery
- chekhov_gun
- reversal
- mission
- prophecy
- survival
- reveal

These spike sharply and discharge discretely.

### Field Obligations (relational)
- mutual_recognition
- emotional_permission
- intimacy_deferral
- grief_acceptance
- identity_reconciliation
- existential_choice
- belonging
- forgiveness

These diffuse gradually, overlap continuously, partially discharge, and sometimes intentionally remain unresolved.

Without this split, the framework will overfit loud genre material (action, thriller) and fail on quiet films (relationship drama, art film).

---

## The Active State Problem — Deeper Solution

The entity-links approach (active if source/target entity appears) is correct for MVP but insufficient long-term. Activity should behave like **field intensity**, not binary presence:

| State | Meaning |
|-------|---------|
| dormant | Not yet loaded |
| background-active | Present but not escalated |
| foreground-active | Actively driving tension |
| escalating | Charge increasing |
| discharging | Resolving |
| decaying | Fading without formal resolution |

This matters because quiet films sustain low-level field activation for very long durations.

---

## The Most Important Future Metric: Obligation Coherence

The most valuable metric is NOT obligation count, total energy, or density alone. It is:

> **Obligation coherence** — how aligned are the active obligations toward a stable attractor?

This likely predicts narrative clarity, emotional inevitability, and "the story clicks" much more strongly than raw obligation volume.

Future convergence scoring should weight coherence above raw load.

---

## Build Sequence (Updated)

### P0 — Seed + Manual Verification (1 day)

- Write 14 obligations from YETI seed data into `narrative_obligations`
- Validate lifecycle model against production data
- Create view with confidence schema
- **Oracle P0.5:** Verify energy peaks against beat sheet structural markers

### P0.5 — Architecture Rigor (before P1)

**ChatGPT addition** — do this BEFORE automating detection:

1. **Add confidence schema** to `narrative_obligations` (detection_confidence, evidence_refs, detection_mode, human_verified, projection_scope)
2. **Separate taxonomy** — structural vs field obligations with different thermodynamic behaviors
3. **Define field intensity states** — dormant, background-active, foreground-active, escalating, discharging, decaying
4. **Begin quiet-film validation set** — collect a relationship drama, a slow art film, a comedy, a mystery alongside YETI. Otherwise the framework overfits one narrative temperature regime.

### P1 — Pipeline Automation (2 days)

- Add `obligation_detect` action handler to dev-engine-v2
- Create `obligation-detect.ts` — detection rules for structural obligations (act boundaries, entity co-occurrence, beat sheet entries)
- Wire as Stage 3.6 in `useScriptDropProject.ts`
- Detection emits confidence scores, not binary classifications

### P2 — Minimal Dashboard (2 days)

- Build `thermodynamic_metrics` view: obligations by act, net energy, average charge, temperature
- Build UI component: energy curve chart + obligation list with confidence badges
- Conditional tab (renders only if obligations exist)
- **ChatGPT:** Start minimal — graph view, not full dashboard. The theory is still evolving.

### P3 — Convergence Integration (2 days)

- Obligation charge/discharge feeds into convergence scoring
- Scenes discharging high-charge obligations get convergence bonus
- Obligation_centrality added to resolution density
- **This is where obligations become operationally consequential.** Before this, they're decorative metadata.

### P4 — Field Obligation Detection (4 days)

- Character bibles → field obligations (want vs need gap)
- Entity co-occurrence → relationship tension
- Proximity analysis → deferred intimacy
- Test on non-YETI projects (quiet film set from P0.5)

### P5 — NIR (delayed)

DO NOT couple NIR tightly to screenplay grammar. Keep it abstract:

Bad:
```json
{ "scene_type": "dialogue_scene" }
```

Better:
```json
{
  "dramatic_function": "relational_escalation",
  "obligation_effects": [],
  "temperature_delta": -0.2
}
```

NIR must survive: film, TV, games, interactive, vertical drama, audio, novels. Otherwise the holographic promise collapses.

---

## Immediate Priority (ChatGPT)

| Priority | Action |
|----------|--------|
| 1 | P0 seed + manual verification |
| 2 | Add obligation confidence schema |
| 3 | Separate structural vs field obligations |
| 4 | Build minimal dashboard |
| 5 | Add convergence weighting |
| 6 | Delay autonomous projection work |
| 7 | Begin quiet-film validation set |

---

## The Bigger Picture

### Validation is structural correlation, not theory proof

Verifying energy peaks against beat sheet markers validates structural correlation — not the theory itself. The risk of circularity: traditional screenplay structure predicts traditional screenplay structure.

The real breakthrough test is: **do obligations predict audience response independently of screenplay dogma?** That's where TRIBE integration becomes critical later.

### Narrative energy is relational, not event-based

> Stories are not primarily things happening. They are states of unstable human equilibrium seeking resolution. Plot is just one expression of that.

If true, the theory generalizes much better than expected — to quiet films, to interactive, to games, to any medium where "something happens" is less important than "something is felt."

### The strongest signal

The framework now has edge cases it encounters naturally (quiet cinema). Weak theories only work on ideal examples. **Strong theories survive ambiguity.**

---

## Files That Change / Don't Change

(Unchanged from v1 — architecture is same, just richer data model.)

