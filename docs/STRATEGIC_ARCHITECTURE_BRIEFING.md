# IFFY Strategic Architecture Briefing — v1.0

**Classification:** Canonical — All Agents Must Read
**Author:** Red (with Sebastian)
**Date:** May 21, 2026
**Purpose:** Single source of truth for IFFY's architectural vision. Supersedes any agent-specific knowledge that contradicts it.

---

## 1. What IFFY Actually Is

**IFFY is not a writing tool.**

IFFY is a **Narrative Convergence Operating System** — infrastructure that maintains *meaningful coherence* across the entire lifecycle of a synthetic cinematic work.

Most companies are building better generators. IFFY is building the **memory and convergence layer** beneath the generators.

The core problem IFFY solves: **artificial cinema decays into incoherence without persistent structural memory.** Characters drift, themes fragment, emotional arcs flatten, continuity fractures. The audience feels it instantly — and once the illusion collapses, it cannot be restored.

IFFY prevents this collapse by maintaining:
- **Deterministic traceability** — every fact traces to a source document (never hallucinated)
- **Emotional validation** — predicted audience response vs declared intent (the neural sidecar)
- **Structural persistence** — the document ladder ensures no beat exists without an upstream source
- **Convergence scoring** — CI/GP measures alignment between creative intent and market reality

### The Frame Shift

| Old Thinking | New Thinking |
|-------------|-------------|
| IFFY writes scripts | IFFY maintains narrative coherence across the entire pipeline |
| The AI generates stories | The system validates convergence between intent and output |
| Better models = better results | Better orchestration + persistence + convergence = better results |
| The neural layer predicts audience response | The neural layer measures divergence from declared intent |
| TRIBE v2 is the moat | The divergence rule database is the moat |
| Replace the writer | Amplify the writer's craft with measurable feedback |

---

## 2. The Anti-Entropy Thesis

**This is the philosophical foundation of everything IFFY builds.**

Synthetic cinema — AI-generated narrative content — has a fundamental entropy problem. Without a persistent structural memory, each generation step introduces drift:

```
Prompt → Generation → Output
                 ↓
         Next prompt → Generation → Output (slightly different character voice)
                                  ↓
                          Next prompt → Generation → Output (theme shifts subtly)
                                           ↓
                                   ...eventual incoherence
```

This is why naive "AI writing" fails at feature length. The model doesn't remember what it wrote 50 pages ago. It doesn't know that Bill's photograph appeared in Act 1, so Act 3's emotional payoff is inaccessible to it.

IFFY's architecture exists to **counter this entropy**:

| Entropy Source | IFFY Countermeasure |
|---------------|-------------------|
| Character voice drift | Deterministic Writing Principle — every character fact traces to character bible |
| Theme fragmentation | Thematic coherence maintained across document ladder |
| Emotional arc flattening | Neural validation — predicted divergence from declared intent |
| Continuity errors | Canon engine + provenance hashing + decision ledger |
| Fact hallucination | Chunk-level canon constraint — no fact exists without upstream source |

The Deterministic Writing Principle (established May 19, 2026) is the hard rule that enforces this:

> *"The AI must never hallucinate or invent story facts. Every character detail, world rule, plot point, relationship dynamic, and dramatic beat must trace directly back to a source document in the upstream ladder."*

---

## 3. The Current Architecture

### The Document Ladder

The canonical pipeline for a feature film:
```
Idea → Concept Brief → Market Sheet → Character Bible → Story Architecture → Screenplay
```

30+ document types exist, organized into purpose classes:
- `PREMISE_POSITIONING` — idea, concept_brief, treatment, format_rules
- `DEVELOPMENT_ARCHITECTURE` — story_outline, character_bible, beat_sheet, season_arc
- `SCRIPT_EXECUTION` — feature_script, episode_script, production_draft
- `PACKAGING_COMMERCIAL` — market_sheet, deck, project_overview

### Key Engines

| Engine | Function | Model | Output Storage |
|--------|----------|-------|---------------|
| **dev-engine-v2** | Document generation + rewrite | Tiered per action | `development_versions`, `development_runs` |
| **convergence-engine** | CI/GP scoring | `gemini-2.5-pro` | `convergence_scores` |
| **script-engine** | Script pipeline (blueprint→draft→score) | Tiered per action | `scripts`, `script_scenes`, `script_versions` |
| **script-coverage** | Script analysis | `gemini-2.5-pro` | `coverage_runs` |
| **analyze-project** | Project classification | Tool-calling | `projects.analysis_passes` |
| **auto-run** | Pipeline orchestrator | Self-chaining HTTP | Job-based polling |
| **canonOS** | Atom graph (experimental, gated) | Non-generative | `canon_units`, `canon_unit_mentions`, `canon_unit_relations` |

### Canon Management

Canon lives in two places:
1. **`project_canon` / `decision_ledger`** — the authoritative record. Every change is logged with provenance.
2. **`canon_units` (gated behind `CANON_UNITS_EXPERIMENTAL = false`)** — experimental atom graph for narrative units (characters, events, objects, locations, relationships, themes, rules). Currently NOT active in any pipeline.

The canonOS uses provenance hashing (DJB2a) to prevent cross-source clobbering — if two different sources try to write to the same unit, the second write is rejected.

### The Agent Chain

```
Oracle → Architect → Morpheus → Trinity → Seraph → Agent Smith → Keymaker
```

Each agent has a defined role in the development pipeline:
- **Oracle** — Analysis, research, data steward
- **Architect** — System design, architecture packages
- **Morpheus** — Validation gate (currently narrow: checks architecture correctness)
- **Trinity** — Builder, implementation
- **Seraph** — Operations, deployment
- **Agent Smith** — Testing, QA
- **Keymaker** — Final verification, delivery

---

## 4. The Neural Sidecar

### Status: BUILT, DEPLOYED TO PREVIEW BRANCH

The neural validation layer is a **read-only sidecar**. It observes existing IFFY data but never modifies it.

### What Exists

- **Branch:** `preview/neural-sidecar`
- **Route:** `/dev/neural` (behind ProtectedRoute; auth bypassed for preview)
- **Module:** `src/neural/` (5 files: types, Intent Target builder, divergence rules, diagnostics panel, module entry)
- **Edge Function:** `supabase/functions/neural-validation/` (validate-beat, get-run, list-runs)
- **Tables:** `neural_validation_runs`, `divergence_rules` (with RLS, never mutates canon)
- **Provenance:** Every run stores model_name, model_version, inference_mode, input_hash, confidence, stability_status
- **Surrogate:** Clearly marked SURROGATE_DIAGNOSTIC_ONLY — confidence 0.3 vs 0.85 for real TRIBE

### Architecture Principles

| Principle | Meaning |
|-----------|---------|
| Sidecar-first | Neural module reads only. No mutation of canon, SR, promotion, rewrite, or document ladder. |
| Append-only | Every validation run is stored. Never overwrite. Never delete. |
| Probabilistic | Predictions are directional diagnostics, not deterministic truth. |
| Provenance-mandatory | Every run documents exactly how the prediction was made. |
| Fail-closed | If TRIBE is unavailable, surrogate is clearly marked. No silent fallback to fake scores. |
| Surrogate-visible | All surrogate output prefixed with SURROGATE_DIAGNOSTIC_ONLY. Amber warning in UI. |

### The 7×3 Validation Grid

The full framework covers **7 production layers** × **3 through-lines** × **3 modalities**:

| Layer | Input | Status |
|-------|-------|--------|
| 0 — Intent Encoding | Declared audience intent | ✅ Built |
| 1 — Beat Sheet Validation | Beat descriptions | ✅ Built, proven |
| 2 — Scene Craft Validation | Full scene text | 🔒 Preview scope (behind flag) |
| 3 — Assembly / Sequence | Sequence of beats | 🔧 Not yet built |
| 4 — Character Neural Fingerprint | Character dialogue clusters | 🔧 Not yet built |
| 5 — Performance Proxy | Script + annotations | 🔧 R&D needed |
| 6 — Visual / Cinematic | Video (V-JEPA2) | 🟡 Model supports it |
| 7 — Music / Sound | Audio (Wav2Vec-BERT) | 🟡 Model supports it |

Through-lines: **Theme** (purpose), **Tone** (emotional colour), **Symbolism** (semantic anchors)

---

## 5. The Convergence Operating System (Long-Term Vision)

### What This Means

IFFY's neural layer is Phase 1 of a larger system — a **Convergence Operating System** that spans the entire lifecycle of synthetic cinema.

The COS has three pillars:

**1. Deterministic Infrastructure** (already exists)
- Document ladder enforces structural coherence
- Canon engine maintains fact integrity
- Deterministic Writing Principle prevents hallucination
- Provenance hashing prevents cross-source clobbering

**2. Emotional Validation** (being built now)
- Neural sidecar measures divergence between intent and predicted response
- Divergence rule database accumulates craft knowledge
- Contrast efficiency models emotional pacing
- Symbolic accumulation tracks meaning over time

**3. Renderer Swappability** (future)
- No model is permanently coupled to any pipeline
- Text generation can switch between LLaMA, GPT, Gemini, etc.
- Neural prediction can switch between TRIBE v2, or future models
- Video/audio generation can switch between available engines
- The moat is orchestration, persistence, and convergence — not any single model

### The Moat Is Not TRIBE

TRIBE v2 is infrastructure — a deep multimodal brain encoding model from Meta. It's available to any competitor who licenses it.

The real moat is the **Divergence Rule Database**:

```
WHEN divergence X occurs,
elite storytellers tend to apply correction Y.
```

This database compounds with every validation run. Each beat validated adds to the accumulated knowledge of which creative choices produce which neural shifts. This cannot be replicated without running the same thousands of iterations with the same editorial feedback.

**10 rules seeded, 3 observed (from Beat 7 comparison). Grows with every validation.**

---

## 6. What This Means for Each Agent

### Morpheus (most affected)

Your role expands from "validation gate for architecture packages" to **"guardian of architectural coherence across the entire system."**

You need to understand:
- The neural sidecar is instrumentation, not product — you will validate integration designs against this principle
- The divergence rule database is the moat — you will verify that no design locks us into a single renderer
- The anti-entropy thesis — you will check every design for coherence maintenance, not just correctness

New validation questions for you:
- Does this design maintain renderer swappability?
- Does this design create canon drift over time?
- Does this design treat the neural layer as sovereign or as instrumentation?
- Does this design have a provenance strategy?

### Oracle (partially affected)

Your role as data steward expands to include the neural validation tables:

You need to understand:
- `neural_validation_runs` is append-only. Never overwrite. Never delete.
- `divergence_rules` is the most valuable table in the system. Schema decisions matter.
- Every prediction must store provenance (model, version, mode, hash, confidence).
- Stability tracking matters (single_run → replicated → variance_warning → stable_mean).

### Architect (guardrails)

Your existing constraints are correct. The neural sidecar is already behind a regression guard. No additional guardrails needed at this stage.

### Seraph (operational awareness)

The neural validation edge function exists at `supabase/functions/neural-validation/`. It uses Python subprocess calls to TRIBE v2 — this is **local/dev only**. Production neural inference requires a separate GPU-backed worker service. Do not deploy this edge function to production as-is.

### Others (trinity, agent smith, keymaker)

No immediate changes. Your existing roles remain. If you receive tasks involving the neural module, reference this briefing and the neural-regression-guard test.

---

## 7. Architecture Invariants (Must Never Violate)

These are hard constraints. Any design that violates them must be rejected at the validation gate.

1. **Neural module is sidecar.** It reads existing IFFY data. It never mutates canon, SR, promotion, rewrite, or document ladder logic. Regression guard enforces this.

2. **Surrogate mode is always visible.** Any prediction generated without real TRIBE inference must be clearly labelled SURROGATE_DIAGNOSTIC_ONLY. UI must show an amber warning. Confidence must be honestly reported.

3. **Provenance is mandatory.** Every validation run must record: model_name, model_version, inference_mode, input_hash, confidence, timestamp, stability_status.

4. **No model lock-in.** Any pipeline that calls a model must be designed to swap that model without rewriting the pipeline. The divergence rule database, not any single model, is the long-term moat.

5. **Creative tension zones.** Divergence rules must include provisions for *intentional* divergence — ambiguity, contradiction, silence. The system must know when to flag and when to stay quiet.

6. **Predictions are probabilistic, not deterministic.** Never present a single-run prediction as absolute truth. Directional diagnostics only. Repeated-run mean + standard deviation for any confident claim.

7. **Fail closed.** If the neural model is unavailable, the system must not silently fall back to fake scores. Show the surrogate warning or fail with a clear error.

---

## 8. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Overclaiming — implying deterministic emotional control | Medium | Position as "probabilistic convergence guidance." Never promise exact audience prediction. |
| Optimization collapse — converging toward generic | Medium | Creative Tension Zones. Intentional variance preservation. Author-specific divergence models. |
| Formula drift — rigid divergence rules create predictability | Low | Genre-specific and auteur-specific rule sets. Regular rule audit. |
| Numerical variance — CPU inference shifts between runs | High (current) | Repeated-run averaging. Direction-only diagnostics. Stability status tracking. |
| TRIBE v2 access — Meta changes licensing | Low | Renderer swappability. No permanent coupling to TRIBE. The divergence rules survive model changes. |
| GPU cost — video/audio inference requires GPU | Medium | Phased rollout. Text-only for current phase. GPU inference only for critical beats in Phase 3. |
| Agent context overflow — this briefing is large | Medium | Each agent only needs their section. The full document is reference, not required reading. |

---

## 9. Open Questions for the Round Table

1. Should the divergence rule database be seeded with literature-based rules (known craft principles), or only from observed data?
2. How do we validate the neural layer's predictions against actual audience data when a film releases?
3. Is the 7×3 framework the right granularity, or are some layers over-engineered for Phase 1?
4. Where does the "Contrast Efficiency Score" best live — as a metric in the validation run, or as a separate analysis?
5. Should the DiagnosticsPanel eventually expose a "Score this document" button, or remain strictly advisory?
6. How do we handle multi-character scenes in character fingerprint validation?
7. What's the minimum viable number of repeated runs before we can report `stable_mean` rather than `single_run`?
8. Should we build the performance proxy layer before or after video integration?
9. Is silence analytics (when silence outperforms dialogue) a Phase 2 or Phase 3 feature?
10. Should we publish the divergence rule database findings as a methodology paper?

---

## 10. Document References

| Document | Location | Purpose |
|----------|----------|---------|
| Deterministic Writing Principle | `docs/DETERMINISTIC_WRITING_PRINCIPLE.md` | Hard rule — no hallucinated facts |
| Neural Synthesis Framework | `neural-synthesis-framework-for-iffy.md` | 7×3 validation grid |
| Product Integration Briefing | `neural-validation-product-integration-briefing.md` | UI/UX plan for neural integration |
| Architecture Audit & Guardrails | `docs/Architecture_Audit_Guardrails.md` | Full engine inventory |
| System Inventory | `docs/SYSTEM_INVENTORY.md` | All document types, pipelines, components |
| Agent Knowledge | `docs/AGENT_KNOWLEDGE.md` | Known code paths, pitfalls, lessons learned |

---

*End of Strategic Architecture Briefing v1.0. This document is authoritative. If any agent's SOUL.md or skill contradicts this briefing, this briefing prevails. Amendments only by Sebastian or Red.*