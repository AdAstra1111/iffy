# IFFY: Computational Narrative Infrastructure

**Working Plan — Roundtable Discussion Document**
**Date:** 2026-05-22 (v1)
**Status:** Living document — continuously updated
**Audience:** Oracle, Red, ChatGPT, Sebastian, all IFFY agents
**Constitutional Authority:** Part I is eternal law. Parts II–V are transient.

---

## Table of Contents

- **PART I — CONSTITUTION:** Timeless architectural law (12 Articles)
- **PART II — ARCHITECTURE WHITEPAPER:** Canonical narrative infrastructure theory
- **PART III — CURRENT IMPLEMENTATION:** What exists, what doesn't
- **PART IV — WORKING PLAN:** Build Now / Pilot Now / Delay with status
- **PART V — PROGRESS TRACKER:** Done, in-progress, blocked, who owns what
- **APPENDICES:** YETI case study data, open questions

---

# PART I — CONSTITUTION

*These are the fundamental laws of the narrative computation system. They may not be violated. Part I should survive 20 years.*

---

## Article 1: Canonical Substrate

**1.1.** The canonical substrate is a graph-based intermediate representation (IR), NOT a document.

**1.2.** Documents are compiled projections of canon. They are render surfaces — not truth containers.

**1.3.** This distinction is inviolable. Future contributors will naturally drift back toward treating screenplays, beat sheets, and story outlines as truth. If that happens, the system collapses into document orchestration.

**1.4.** The canonical IR consists of: Scene substrate (structural units), Narrative units (typed, linked, cross-referenced), Entities (characters, locations, props with continuity), Intent (narrative + audience targets per unit), Relationships (dependency edges between units), Continuity (world-state across the narrative), Emotional state (trajectory per unit), Dependencies (impact analysis structure).

---

## Article 2: The Canonical Truth Hierarchy

**2.1.** Truth exists in hierarchical layers. Lower levels may NEVER be overwritten by higher levels.

| Level | Layer | Role | Examples |
|-------|-------|------|----------|
| **L0** | Canonical IR | Graph-based narrative reality. THE TRUTH. | Scene substrate, narrative units, entities, intent, dependencies |
| **L1** | Narrative Units | Typed units linked to IR. Rich metadata. | Moments, beats, sequences, arcs |
| **L2** | Structural Projections | Compiled documents. Human-readable renderings. | Story outline, beat sheet, screenplay |
| **L3** | Visual Projections | Visual interpretations of narrative state. | VCB, lookbooks, shotlists |
| **L4** | Production Outputs | Final production artifacts. | Scripts, images, trailers, renders |

**2.2.** The screenplay is a compiled output — one render target of canon, not the canon itself.

---

## Article 3: Canonical Invariants

*These rules may NEVER be violated. They protect the architecture from degradation.*

| # | Invariant | Protection |
|---|-----------|------------|
| **I1** | **L0 canonical IR is the highest truth layer.** No higher-level layer may override it. | Prevents documents and production outputs from becoming de facto truth sources. |
| **I2** | **Compiled projections may not reverse-write into canonical IR without explicit canonicalization.** | Prevents silent corruption. Every IR mutation must be intentional and traceable. |
| **I3** | **Every narrative unit must preserve provenance.** Source lineage back to original input must always be reconstructible. | Prevents orphaned content. Enables audit and rollback. |
| **I4** | **Every rewrite must preserve lineage ancestry.** The parent version must be recorded in revision metadata. | Enables the branching model. Without this, divergence tracking collapses. |
| **I5** | **Every compiled projection must remain reproducible from canonical IR.** Given the same IR state, the same projection must be deterministically regeneratable. | Prevents non-deterministic drift between IR and projections. |
| **I6** | **Canonicalization must be lossless or explicitly confidence-scored where lossy.** Low-confidence units flagged for manual review before propagation. | Prevents silent hallucination propagation. Failure modes are explicit. |
| **I7** | **Lower projection layers may not mutate higher canonical layers.** L3 cannot mutate L2. L2 cannot mutate L0/L1. | Prevents corruption cascades. Changes flow in one direction. |
| **I8** | **Propagation must remain deterministic and replayable.** Same input + same revisions = same output. | Enables debugging, rollback, audit. Without this the system is a black box. |

---

## Article 4: The Ontology

**4.1.** Narrative reality is composed of five layers, ordered from most fundamental to most derived:

```
INTENT       →  what the story communicates + what the audience should feel
  ↓
MOMENT       →  narrative event that delivers both intents
  ↓
SCENE        →  structural unit (slugline boundary)
  ↓
BEAT         →  dramatic movement within a scene
  ↓
DIALOGUE     →  the atomic text unit
```

**4.2. Intent has two fundamental types:**
- **Narrative Intent:** What the story is communicating (reveal betrayal, establish power imbalance)
- **Audience Intent:** What the audience should feel (shock + grief, discomfort, transcendence)

**4.3.** The intent schema must remain extensible. Intent may later split into thematic, psychological, market, platform, or pacing intent.

**4.4. Key relationships:**
- A moment spans 1–5 scenes
- Multiple beats exist within a single scene
- A beat does NOT equal a scene — beats are dramatic, scenes are structural
- Scenes are NOT beats. Beats are NOT moments. Moments are NOT intents.

---

## Article 5: Propagation

**5.1.** There is ONE canonical propagation engine. There are MANY canonical entry points.

**5.2.** Canonical entry points include: DevSeed (forward generation), canonicalized screenplay, existing TV bible, imported franchise lore, AI-generated canon, human-authored revision branches.

**5.3.** All entry points feed the same deterministic propagation engine. There is NEVER "canonicalization canon" vs "generation canon" vs "screenplay canon." There is only canonical narrative reality.

**5.4.** Propagation must remain deterministic and replayable (Invariant I8).

**5.5.** Future propagation should evolve toward **semantic patch regeneration** — regenerating only affected semantic regions rather than entire documents.

---

## Article 6: Divergence and Branching

**6.1.** Divergence is NOT a boundary. It is **branching.** The model is narrative ancestry trees, equivalent to Git branching.

**6.2.** The original screenplay is the root commit. Every revision creates a branch. The question is never "is it still the original?" — it is "what branch are we on and what changed?"

**6.3.** Every rewrite must preserve lineage ancestry (Invariant I4).

**6.4. Future: Canonical Merge Resolution.** Once branching is real, merge operations become necessary. This introduces dependency conflicts, emotional conflicts, continuity conflicts, pacing conflicts, and intent conflicts.

---

## Article 7: Canonical Identity

**7.1.** Narrative units require **persistent canonical identities** that survive across rewrites.

**7.2.** IDs must NOT be: positional (Moment_7 becomes Moment_6 if another moment is inserted), document-derived (derived from story outline position), or generated ad hoc (random per session).

**7.3.** IDs must be stable across: wording changes, scene splits, beat refinements, dialogue rewrites, projection recompilation.

**7.4.** Without stable identity: lineage collapses, dependencies break, continuity mapping fails, neural scoring history disappears.

---

## Article 8: Lossless Canonicalization

**8.1.** Canonicalization must aim for lossless screenplay decomposition. Every detail must remain recoverable through the chain.

**8.2.** Every canonicalized narrative unit carries `source_refs` — pointers back to the exact source text it was derived from.

**8.3.** Every compiled projection carries `provenance` — traceable to the IR node and the original source line.

**8.4.** Where lossy canonicalization is unavoidable (ambiguity, missing data), the affected units carry a confidence score (0.0–1.0) and are flagged for manual review before propagation.

---

## Article 9: Canonical Transactions

**9.1.** Every approved rewrite is an **atomic canonical state mutation** — Git commits for narrative reality.

**9.2.** A canonical transaction must contain: `changed_units` (which narrative units were modified), `affected_dependencies` (which other units are impacted), `provenance` (source of the change), `emotional_delta` (how the emotional trajectory shifted), `intent_delta` (how narrative/audience intent changed), `confidence_changes` (per-unit confidence score updates), `regeneration_scope` (which downstream projections need recompilation), `lineage_branch` (which branch this transaction belongs to), `rollback` (sufficient information to revert the transaction).

**9.3.** Without canonical transactions, large-scale propagation eventually becomes unstable.

---

## Article 10: Canonical Snapshots

**10.1.** A **Canonical Snapshot** is a frozen reproducible state of canonical IR + dependencies + projections.

**10.2.** Snapshots are required for: greenlit versions, pitch versions, investor-approved versions, trailer locks, and any milestone requiring reproducible canonical state.

**10.3.** Snapshots must be: frozen, reproducible, auditable. They enable rollback, branching, regeneration reproducibility, and legal/version provenance.

---

## Article 11: Failure Semantics

**11.1.** The system assumes canonicalization may fail. Failure modes are explicit: Structural Ambiguity (malformed screenplay, missing sluglines), Narrative Ambiguity (unclear act boundaries, montage structures), Entity Ambiguity (unnamed characters, alias conflicts), Intent Ambiguity (emotional target unclear, contradictory audience state).

**11.2.** Every narrative unit carries a **confidence score** (0.0–1.0). Low-confidence units are flagged for manual review before propagation.

---

## Article 12: Future Infrastructure (Acknowledged, Not Built)

*The following systems are acknowledged as future requirements but are NOT to be built until the canonical layer stabilizes.*

| System | When needed |
|--------|------------|
| **Canonical Drift Management** — detection, scoring, and repair of semantic divergence between IR and projections | When compiled projections regularly go stale from manual edits |
| **Semantic Checksums** — every compiled projection carries a semantic fingerprint of the IR state | Concurrent with drift management |
| **Semantic Equivalence** — detecting structurally different but semantically identical rewrites | When AI rewrites produce near-identical variants |
| **Canonical Decay / Fidelity Metrics** — preventing entropy and semantic dilution from repeated AI rewrites | When autonomous iteration is active |
| **Narrative Physics** — modeling causality, momentum, tension accumulation, emotional conservation | Post-NDG maturity |
| **Narrative Database Theory** — formal ACID-like consistency models for narrative state | After merge operations become routine |

---

# PART II — ARCHITECTURE WHITEPAPER

*The canonical narrative infrastructure theory.*

---

## 1. Executive Summary

IFFY is evolving beyond screenplay tooling into a system for **machine-readable story reality.** The long-term objective is **deterministic computational narrative infrastructure** enabling: canonical narrative modeling, deterministic narrative propagation, semantic revision tracking, emotional and audience-state optimization, visual compilation, AI-native production workflows, and eventually fully interconnected narrative simulation systems.

---

## 2. The Two Core Pipelines

### 2.1 Forward Generation Pipeline

| Purpose | Generate a story from initial creative intent |
|---------|-----------------------------------------------|
| **Flow** | DevSeed → Idea → Concept Brief → Character Bible → Story Outline → Beat Sheet → Feature Script → Production Draft |
| **Nature** | Generative, Bottom-up, Synthetic, Expansive, Creation-oriented |
| **Status** | ✅ **EXISTS** — auto-run propagation, deterministic ladders, source pinning, rewrite infrastructure, convergence systems, CI/GP scoring |

### 2.2 Canonicalization + Iterative Revision Pipeline

| Purpose | Take an existing screenplay → convert to canonical narrative state → iteratively optimize → deterministically regenerate |
|---------|------------------------------------------------------------------------------------------------------------------------|
| **Flow** | Script → Canonicalization → Canonical IR → Faithful Compiled Projections → Verification → Iterative Optimization → Canonical Transactions → Deterministic Recompilation → Optimized Script |
| **Nature** | Analytical, Reconstructive, Canon-preserving initially, then intentionally divergent, Optimization-oriented |
| **Status** | 🚧 **IN PROGRESS** — scene substrate Phase 1 deployed, iteration loop being designed |

---

## 3. The Central Architectural Breakthrough

The reverse-engineering workflow should NOT become a separate orchestration system. The existing deterministic propagation engine already solves: ladder progression, deterministic recompilation, source pinning, version lineage, propagation ordering, rewrite orchestration, and downstream regeneration.

**Therefore:** Canonicalization is NOT a second pipeline. It is another canonical entry point into the same narrative operating system.

**One deterministic propagation engine. Many canonical entry points.**

If violated, the system drifts into: duplicated orchestration, conflicting truths, propagation divergence, rewrite instability, impossible validation states, and architectural fragmentation.

---

## 4. The Core Philosophical Shift

Originally: *AI screenplay tooling.* Now: *Narrative compilation infrastructure.*

---

## 5. Why Canonicalization Matters

The system is not "reverse engineering scripts." It is **canonicalizing fictional reality.** Canonicalization means: preserving provenance, preserving causality, preserving semantic meaning, preserving recoverability, and constructing machine-readable narrative state.

---

## 6. The Two Critical Phases

### Phase A — Faithful Canonicalization

Goal: Understand before improving. Forensic, reconstructive, provenance-heavy, loss-minimizing. Produces **Faithful Canonical IR v1** — the root branch, provenance anchor, audit source, rollback origin, and reference reality.

### Phase B — Intentional Divergence

Only AFTER faithful canonicalization is verified does optimization begin. The system intentionally mutates: structure, pacing, emotional trajectories, characters, themes, escalation, pressure systems, and market positioning. This is **canonical branching.**

---

## 7. What If the Original Screenplay Is Weak?

The original screenplay is NOT sacred. It is the **initial observed manifestation of an underlying fictional possibility space.** Many weak screenplays contain strong worlds, strong emotional cores, strong themes, strong concepts, or strong characters — trapped inside weak structure, poor pacing, redundant characters, weak escalation, or ineffective execution.

The architecture preserves **Observed Canon** while enabling **Optimized Canon** through branching.

---

## 8. Branching Solves the Core Paradox

Without branching, the system is trapped between "preserve faithfully" vs "improve aggressively." Branching resolves this — the original remains the root, and optimized descendants emerge through intentional mutation, controlled iteration, and deterministic recompilation.

---

## 9. Why Story Outline Iteration Comes First

Most screenplay failures are moment-level (structural, causal, pacing-related, escalation-related, character-economy-related). Therefore the primary mutation surface is **Story Outline iteration** — not dialogue rewriting.

**Example Iteration Flow:**
1. Story Outline — collapse moments 12-15, strengthen midpoint, add active pursuit pressure
2. Character Bible — merge redundant characters, deepen emotional arcs
3. Beat Sheet — compress repetitive beats, sharpen dramatic escalation
4. Feature Script — deterministically recompiled from optimized canon

---

## 10. Narrative Intent vs Audience Intent

| Type | What it is | Examples |
|------|-----------|---------|
| **Narrative Intent** | What the story communicates | Betrayal, mythic awe, corruption, sacrifice |
| **Audience Intent** | What the audience should feel | Dread, grief, transcendence, discomfort |

This becomes critical for: neural validation, convergence scoring, emotional optimization, and future audience-state systems (TRIBE v2 brain-response prediction).

---

## 11. The Bigger Vision

Once canonical narrative reality exists, all downstream media become projections: AI-native filmmaking, deterministic image/video generation, continuity-safe production, AI actors, synthetic universes, interactive narratives, game-world generation, and narrative atomization.

---

# PART III — CURRENT IMPLEMENTATION

*What exists right now. Update as work progresses.*

---

## III.1 System Architecture (May 2026)

IFFY: React/TypeScript SPA → Supabase (Postgres + Edge Functions) → Vercel

- **Forward pipeline:** DevSeed → auto-run propagation engine → compiled projections
- **Canonicalization:** Scene substrate canonicalization deployed (Phase 1)
- **Propagation engine:** `auto-run/index.ts` — HTTP self-chaining, deterministic regeneration
- **Scene substrate:** `scene_graph_scenes` — enrichment columns exist, partial data

---

## III.2 Verified Data: Scene Enrichment Status (YETI)

**Project:** `be05e314-900a-4b27-b2a7-5f2232ff6f6d`

| Metric | Value |
|--------|-------|
| Total scenes | 83 (SCENE_001–SCENE_083, sequential, no gaps) |
| Acts assigned (provenance) | 4 acts: 1=19, 2=23, 3=23, 4=18 scenes |
| Schema migration | ✅ Columns added: slugline, act, act_label, page_range_start, page_range_end, source_text_refs |
| Provenance tracking | ✅ act, scene_number, source_doc_type, canonicalized_at, source_version_id, canonicalization_pass |
| **slugline** | ❌ All null |
| **act (column)** | ❌ All null (populated only in provenance JSON) |
| **act_label** | ❌ All null |
| **page_range** | ❌ All null |
| **source_text_refs** | ❌ Empty arrays |

---

## III.3 Current Compiled Projections

| Document | Format | Status |
|----------|--------|--------|
| Idea | Markdown | ✅ Generated at DevSeed |
| Concept Brief | Markdown `## Section` | ✅ Generated at DevSeed |
| Treatment | Markdown `## Act` | ✅ Generated via reverse engineering |
| Story Outline | JSON (22 entries) | ✅ Generated via reverse engineering |
| Beat Sheet | Markdown (40 beats) | ✅ Generated via reverse engineering |
| Character Bible | Markdown | ✅ Generated from entity extraction |
| Feature Script | Screenplay format | ✅ Original uploaded |

**Story Outline (YETI):** 22 entries, "Abbreviated Story Sequence" JSON format. No act boundaries, no scene references.

**Beat Sheet (YETI):** 40 beats across 5 acts. Act 1 (11 beats), Act 2A (11 beats), Act 2B (7 beats), Act 3 (9 beats), Act 4 (2 beats).

---

## III.4 Deployed Commits (Canonicalization)

| Commit | Description |
|--------|-------------|
| `b5e9d66` | feat: canonicalize-scene-substrate edge function — Phase 1 implementation |
| `94a0d2b` | Implement format-aware act assignment via sceneGraphActAssigner |
| `09790f2` | fix: Canonicalize Scene Substrate — 3 review issues resolved |
| `0126334` | fix: wire canonicalize into intake pipeline + persist slugline on scene_graph_scenes |
| `2f62446` | fix: add Vercel proxy + vercel.json entry for canonicalize-scene-substrate |

---

## III.5 Current Gaps

| Gap | Impact | Status |
|-----|--------|--------|
| slugline not persisted | Cannot verify scene-to-moment mapping | ❌ Needs Phase 2 |
| page ranges not computed | No source localization | ❌ Needs Phase 2 |
| act column vs provenance mismatch | Act lives in JSON blob, not dedicated column | ❌ Needs alignment |
| source_text_refs empty | Cannot trace scenes to source lines | ❌ Needs Phase 2 |
| Story outline has no act boundaries | Cannot verify per-act moment balance | ❌ Needs Phase 2 |
| No scene-to-moment mapping | Story outline entries don't reference scenes | ❌ Design needed |
| No beat-to-scene mapping | Beat sheet references page numbers, not scenes | ❌ Design needed |
| No verification gate tooling | Faithfulness checking is manual | ❌ Design needed |

---

## III.6 Terminology Map

| In code / UI | Constitutional term |
|-------------|-------------------|
| "Reverse engineer" | Canonicalize |
| "Enrich scene graph" | Canonicalize scene substrate |
| "Generated docs" | Compiled narrative projections |
| "Scene graph" | Scene substrate |
| "Story outline entries" | Moments |
| "Beat sheet items" | Beats |
| "provenance" object | Canonical provenance metadata |
| "auto-run" propagation | Deterministic propagation engine |

---

## III.7 Permissions

- **Supabase:** `hdfderbphdobomkdjypc.supabase.co`
- **Vercel:** `iffy-analysis`, deploy via `./deploy.sh`
- **Service role key:** In `.env.vercel`
- **Kanban:** Local Hermes (`hermes kanban`)
- **Git:** Branch `main`, push directly

---

# PART IV — WORKING PLAN

*Build Now / Pilot Now / Delay. Update as work progresses.*

---

## IV.1 BUILD NOW

### 1. Canonicalize Scene Substrate — Phase 2

**Goal:** Persist sluglines, page ranges, and source_text_refs on scene_graph_scenes.

| Item | Status |
|------|--------|
| Schema migration (columns added) | ✅ DONE |
| Provenance tracking (act assignment, scene_number) | ✅ DONE |
| Persist slugline from parsed headings | 🚧 IN PROGRESS |
| Compute page ranges | ❌ NOT STARTED |
| Populate source_text_refs with line ranges | ❌ NOT STARTED |
| Write act to dedicated column (not just provenance) | ❌ NOT STARTED |

**Owner:** Red (Architect → Trinity)
**Depends on:** Nothing (schema already migrated)
**Effort:** Small — sluglines already parsed in memory during scene_graph_extract

### 2. Verification Gate

**Goal:** Enable human verification that foundation docs are faithful to original script before iteration begins.

| Item | Status |
|------|--------|
| Design verification data model | ❌ Not started |
| Implement moment-to-scene-range mapping | ❌ Not started |
| Implement beat-to-scene mapping | ❌ Not started |
| Build verification UI or CLI tool | ❌ Not started |

**Depends on:** Scene substrate Phase 2

### 3. Revision Propagation Entry Point

**Goal:** Enable `auto_approve_all` mode to skip CI scoring on user-approved revisions.

| Item | Status |
|------|--------|
| Add `auto_approve_all` mode to auto-run | ❌ Not started |
| Test source pinning via resume_version_id | ❌ Not started |
| Verify end-to-end iteration flow | ❌ Not started |

---

## IV.2 PILOT NOW

### 4. YETI Iteration Loop

**Goal:** First complete iteration cycle on YETI.

Estimated 2.5h per cycle: review story outline (45m) → propagate to beat sheet (30m) → review beats → propagate to feature script (60m).

| Item | Status | Owner |
|------|--------|-------|
| Scene substrate canonicalized | ✅ DONE | Red |
| Review story outline | ❌ Not started | Sebastian |
| Apply notes to story outline | ❌ Not started | Oracle → chain |
| Propagate to beat sheet | ❌ Not started | Auto-run |
| Review beats | ❌ Not started | Sebastian |
| Propagate to feature script | ❌ Not started | Auto-run |
| Verify recompiled script | ❌ Not started | Sebastian |

### 5. Structured Notes

**Goal:** ChatGPT conversation → structured JSON → existing rewrite pipeline.

| Item | Status |
|------|--------|
| Define structured note schema | ❌ Not started |
| Build ChatGPT → JSON converter | ❌ Not started |
| Wire into rewrite pipeline | ❌ Not started |

### 6. Intent Annotations (YETI Pilot)

**Goal:** Annotate 22 YETI story outline moments with Narrative Intent + Audience Intent.

| Item | Status |
|------|--------|
| Define intent schema | ❌ Not started |
| Annotate 22 YETI moments | ❌ Not started |
| Map to TRIBE v2 brain-response predictions | ❌ Not started |

### 7. Semantic Diffs (Early Prototype)

**Goal:** Show pacing changes, emotional trajectory shifts, act balance changes between versions.

| Item | Status |
|------|--------|
| Prototype diff for pacing | ❌ Not started |
| Prototype diff for emotional trajectory | ❌ Not started |
| Prototype diff for act balance | ❌ Not started |

---

## IV.3 DELAY

| System | Trigger |
|--------|---------|
| Full NarrativeUnit abstraction | Scene substrate stable across 3+ projects |
| Narrative graph (replaces scene graph) | First non-screenplay format enters pipeline |
| Canonical Transaction system | Multiple concurrent revision branches in use |
| Canonical Snapshot system | External stakeholders need frozen states |
| Semantic patch regeneration | Small-scale impact analysis proven |
| Canonical Merge Resolution | Branch merging becomes routine |
| Semantic equivalence layers | AI rewrites produce near-identical variants |
| Canonical Drift Management | Compiled projections regularly go stale |
| Canonical decay / fidelity metrics | Autonomous iteration active |
| Full NDG execution + narrative physics | Post-canonicalization maturity |

---

# PART V — PROGRESS TRACKER

*Living status. Update as work progresses.*

---

## V.1 Completed ✅

| Date | Item | Owner | Notes |
|------|------|-------|-------|
| 2026-05-22 | Scene enrichment Phase 1 — schema migration | Red | Columns added to scene_graph_scenes |
| 2026-05-22 | Scene enrichment Phase 1 — provenance tracking | Red | act, scene_number, canonicalized_at in provenance |
| 2026-05-22 | Scene enrichment Phase 1 — act assignment | Red | 83 scenes to 4 acts via format-aware algorithm |
| 2026-05-22 | Scene enrichment Phase 1 — intake pipeline wiring | Red | Wired into intake flow |
| 2026-05-22 | Scene enrichment Phase 1 — Vercel proxy | Red | API endpoint created |
| 2026-05-22 | Scene enrichment Phase 1 — review pass | Seraph | 3 issues resolved |
| 2026-05-22 | Scene enrichment Phase 1 — test pass | Agent Smith | All tests passing |
| 2026-05-22 | Scene enrichment Phase 1 — live verification | Keymaker | Deployed and verified |
| 2026-05-22 | Constitution v4 | ChatGPT + Oracle + Red + Sebastian | 12 Articles, 8 Invariants, ontology, branching model |
| 2026-05-22 | Architecture Whitepaper v1 | ChatGPT | 25 sections, two-pipeline model, iteration philosophy |
| 2026-05-22 | Working Plan v1 (this document) | Oracle | Comprehensive roundtable document with status tracking |

## V.2 In Progress 🚧

| Date | Item | Owner | Status |
|------|------|-------|--------|
| 2026-05-22 | Scene enrichment Phase 2 — persist sluglines | Red | Data parsed in memory, needs write to column |
| 2026-05-22 | Scene enrichment Phase 2 — page ranges | Red | Not yet started |
| 2026-05-22 | Scene enrichment Phase 2 — source_text_refs | Red | Not yet started |

## V.3 Blocked ⊘

| Date | Item | Owner | Blocked by |
|------|------|-------|------------|
| — | Verification gate | TBD | Scene enrichment Phase 2 |
| — | YETI iteration loop | TBD | Verification gate |
| — | Structured notes | TBD | First iteration cycle |
| — | Intent annotations | TBD | Stable story outline |

## V.4 Not Started ❌

| Item | Priority | Notes |
|------|----------|-------|
| Revision propagation entry point | High | auto_approve_all mode needed for iteration loop |
| Semantic diffs prototype | Medium | Can start after first iteration cycle |
| Scene-to-moment mapping table | Medium | Depends on stable scene substrate |
| Beat-to-scene mapping | Medium | Depends on stable scene substrate |
| Canonical transactions | Low | Delayed |
| Canonical snapshots | Low | Delayed |

---

## V.5 Relevant Kanban Tasks (Archive)

| Task | Status | Description |
|------|--------|-------------|
| `t_a8663d8f` | ✅ DONE | Canonicalize Scene Substrate (cancelled then completed through chain) |
| `t_5b4c33ae` | ✅ DONE | REVISE: Canonicalize Scene Substrate |
| `t_e706fff0` | ✅ DONE | FIX: Canonicalize Scene Substrate |
| `t_78764431` | ✅ DONE | Verify: FIX: Canonicalize Scene Substrate |
| `t_adf7cd97` | ✅ DONE | Ingest: FIX: Canonicalize Scene Substrate |
| `t_cc0c15bd` | ⊘ BLOCKED | NEC canonical format mismatch |
| `t_480c5da4` | ✅ DONE | NEC regeneration 500 fix |

---

## Appendix A: YETI Case Study Data

| Artifact | Value |
|----------|-------|
| Project ID | `be05e314-900a-4b27-b2a7-5f2232ff6f6d` |
| Source script | YETI, 105 pages, ~81 original scenes (numbered 4-84) |
| Scene graph | 83 scenes (SCENE_001-SCENE_083) |
| Acts (provenance) | 4: 1=19, 2=23, 3=23, 4=18 |
| Story outline | 22 moments, JSON Abbreviated Story Sequence |
| Beat sheet | 40 beats, 5 acts (1:11, 2A:11, 2B:7, 3:9, 4:2) |
| Feature script version | `c17d29ae` (v1) |
| Intake run | `8c67d0db`, completed, scene_count=83 |
| Canonicalization pass | v1, provenance populated 2026-05-22T11:16:28Z |

## Appendix B: Open Questions for Next Roundtable

1. **Slugline Phase 2:** Write during `scene_graph_extract` (already parsed in memory) or as separate post-processing?
2. **Act column vs provenance:** Populate dedicated `act` column or keep in JSON?
3. **Story outline format:** Migrate from JSON "Abbreviated Story Sequence" to proper prose?
4. **Scene-to-moment mapping:** Build junction table now or let emerge from iteration?
5. **auto_approve_all mode:** Right bypass mechanism, or need something more granular?
6. **Intent annotation pilot:** Who annotates the 22 YETI moments?
7. **First iteration target:** Start with Section 16's example (weak Act 2, redundant characters) or different focus?

---

## Epilogue

> You are not building screenplay software, AI script coverage, or development tooling. You are building **Computational Narrative Infrastructure** — a constitutional substrate for machine-readable story reality. If the canonical layer is designed correctly, then images, videos, games, AI actors, trailers, social atomization, synthetic universes, and interactive narratives all become projections of the same substrate.

> The next step is still: **Parse sluglines correctly.** That discipline determines whether this becomes real infrastructure or philosophical vapor.

---

*Constitutional version: v4 (2026-05-22)*
*Working plan version: v1 (2026-05-22)*
*Living document — update as work progresses.*
