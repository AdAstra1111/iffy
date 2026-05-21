# Beat-Sequential Feature Script Generation — Design Proposal

*May 19, 2026 — Prepared by Oracle for external design consultation*

## Table of Contents
1. Executive Summary
2. Current System Architecture
3. The Granularity Problem
4. Deterministic Writing Principle
5. Dramatic vs Functional Characters
6. Proposed: `beat_sequential` Strategy
7. Canon Context Passing
8. Technical Code Paths
9. Open Design Questions

---

## 1. Executive Summary

IFFY is an AI-powered development engine that generates film/TV project documents through a structured ladder of stages. Currently, the feature script (screenplay) is generated as 4 monolithic act chunks — an approach that forces the AI to handle 15-18 beats per chunk, leading to summary-mode prose rather than dramatised scenes.

We propose a **`beat_sequential` chunking strategy**: each of the 40-70 beats from the beat sheet becomes its own generation unit. Each beat is first analysed to determine its scene count (1-3), then generated sequentially with full accumulated canon state passed from prior beats. This produces a real screenplay: INT./EXT. sluglines, action lines, character dialogue — not narrative summary.

**Core principle:** The AI must never hallucinate story facts. Every dramatic character, plot event, and world detail must trace to an upstream source document.

---

## 2. Current System Architecture

### 2.1 Format Ladders

Each project format has a canonical stage ladder defined in `supabase/_shared/stage-ladders.json`:

**Feature/Film ladder:**
```
idea → concept_brief → character_bible → treatment → story_outline → beat_sheet → feature_script → production_draft
```

**Vertical drama ladder:**
```
idea → concept_brief → format_rules → character_bible → season_arc → episode_grid → vertical_episode_beats → season_script
```

Each stage produces a document that the next stage builds upon. Documents have versions — only the `is_current = true AND approval_status = 'approved'` version is authoritative.

### 2.2 Document Purpose Registry

Each document type owns specific content and defers specific topics to upstream/downstream documents (`dev-engine-v2/index.ts`, lines ~7500-7620):

| Doc Type | Owns | Defers to Feature Script |
|----------|------|-------------------------|
| **Character bible** | Character depth, arcs, relationships | Dialogue craft, scene-level character expression |
| **Treatment** | Act structure, dramatic prose, world setting | Dialogue, scene dynamics, visual storytelling |
| **Story outline** | Scene-by-scene structural plan, act balance | Dialogue, scene dynamics, prose |
| **Beat sheet** | Beat progression, turning points, act architecture | Dialogue quality, scene dynamics, visual storytelling |
| **Feature script** | Dialogue craft, scene dynamics, visual storytelling | Production feasibility |

### 2.3 Chunking Strategies (largeRiskRouter.ts)

All large documents use chunked generation. Three existing strategies in `supabase/functions/_shared/largeRiskRouter.ts`:

| Strategy | Used By | Granularity | Continuity |
|----------|---------|-------------|------------|
| **sectioned** | treatment, story_outline, beat_sheet, feature_script, screenplay_draft | 4 act chunks | Structural descriptions only (no narrative continuity between chunks) |
| **episodic_indexed** | season_script, episode_beats, episode_grid, episode_script | 1 episode per chunk | Last 500 chars of previous episode passed for continuity |
| **scene_indexed** | production_draft | 5 scenes per chunk | Sequential scene-level continuity |

The dispatch function `chunkPlanFor()` routes each doc type to its strategy using fixed section definitions:

```typescript
const SCRIPT_SECTIONS = ["act_1", "act_2a", "act_2b", "act_3"];
const TREATMENT_SECTIONS = ["act_1_setup", "act_2a_rising_action", "act_2b_complications", "act_3_climax_resolution"];
const BEAT_SHEET_SECTIONS = ["act_1_beats", "act_2a_beats", "act_2b_beats", "act_3_beats"];
```

### 2.4 Generation Pipeline

The pipeline (`supabase/functions/generate-document/index.ts`) flows:

1. **Trigger** — via `dev-engine-v2` convert action (line ~12482) or auto-run pipeline
2. **Preflight** — resolve doc type, check upstream dependence graph (DEP_GRAPH_VALID gate), create version placeholder with `bg_generating: true`
3. **Chunk plan** — `chunkPlanFor()` builds the chunk list from strategy
4. **Background task** — `runChunkedGeneration()` in `_shared/chunkRunner.ts` executes chunks
5. **Assembly** — chunks are joined with canonical headers, validated
6. **Promotion** — on full success, `is_current: true`, `latest_version_id` set, auto-run chain continues

### 2.5 Context Passing in Chunk Runner

The chunk runner (`supabase/functions/_shared/chunkRunner.ts`) has different context passing strategies:

- **Sectioned** (treatment, beat_sheet, feature_script): Each chunk gets a structural description of the *previous* act only — NO narrative content. This prevents the AI from "continuing" the previous act's prose. But it also means Act 2a doesn't know what Act 1 actually established in terms of character states, world facts, or dramatic tension.
- **Episodic_indexed** (season_script): Each episode gets the last 500 characters of the previous episode's actual content as continuity context. This lets character arcs and tension build naturally.

The `sectioned` approach was a deliberate fix for a bug where narrative continuity caused Act 2a/2b to be skipped (the AI would "continue" from Act 1 and skip to Act 3). But it's an overcorrection — feature scripts NEED real continuity between acts.

---

## 3. The Granularity Problem

### 3.1 Current Resolution

```
Treatment:    Act-level (4 chunks, ~1,000 words each)       ← coarse
Story outline: Act-level with moments (4 chunks × 5-8 moments) ← medium
Beat sheet:   Act-level with beats (4 chunks × 10-15 beats)  ← fine
Feature script: Act-level (4 chunks, 6,000+ words each)      ← COARSE AGAIN
```

### 3.2 The Act-by-Act Trap

When the AI writes a feature script as 4 act chunks, each chunk handles ~15-18 beats worth of material. It gets:

- The beat sheet beats for that act (e.g. Act 1's 15 beats)
- The story outline's moments for that act
- The treatment's prose for that act
- Character bible voice notes

Result: The AI falls into **summary mode**. Instead of writing:

```
INT. APARTMENT - DAY
Sarah sits at her desk, a half-empty coffee cup beside her. She stares at the letter, her hand trembling.
                        SARAH
            Who sent this?

She turns it over. No return address. No name.
```

It writes:

```
"Sarah finds a mysterious letter at her apartment. She wonders who sent it."
```

This is an act summary, not a screenplay.

### 3.3 Per-Act Page Targets

The current system sets page targets per act (`chunkRunner.ts` lines ~224-246):
- Act 1: 25-30 pages
- Act 2a: 28-32 pages
- Act 2b: 28-32 pages
- Act 3: 22-28 pages

These targets attempt to force detail, but the AI still produces ~1,000 words of genuine screenplay per chunk and pads the rest with summary. A real 30-page act has ~25-40 scenes. A chunk that tries to generate all of them in one pass inevitably compresses.

### 3.4 The Fix: Beat-by-Beat

The beat sheet already has the right granularity: **40-70 named beats, each with a structural purpose**. Each beat maps to a specific dramatic event. A beat like "Protagonist discovers the lie" becomes 1-3 scenes:

- Scene 1: She finds the evidence (INT. BEDROOM - MORNING)
- Scene 2: She confronts the source (INT. OFFICE - DAY)
- Scene 3: She sits alone processing it (EXT. ROOFTOP - SUNSET)

Three real scenes, each in proper screenplay format. That's what a screenplay is: beats expanded into dramatised moments.

---

## 4. Deterministic Writing Principle

**The AI must never hallucinate or invent story facts.**

### 4.1 The Rule

Every character detail, world rule, plot point, relationship dynamic, and dramatic beat must trace directly back to a source document in the upstream ladder. If a fact doesn't exist in an upstream doc, the AI must flag it as missing — not invent it.

### 4.2 Per-Stage Constraint

| Stage | Source | Can Generate | Cannot Generate |
|-------|--------|-------------|-----------------|
| Treatment | Concept brief + character bible | Scene-level action, dramatic prose, expanded world texture | New characters, new backstory facts, new plot events |
| Story outline | Treatment | Moment-level dramatic units, act structure | New plot points not in treatment |
| Beat sheet | Story outline + treatment | Named beats citing story outline scenes | Beats that don't correspond to story outline moments |
| Feature script | Beat sheet + all upstream | 1-3 screenplay-formatted scenes per beat. Functional characters per scene. | New dramatic characters, new story events, new dramatic turns |

### 4.3 Chunk-Level Canon Constraint

Every sequentially-generated chunk receives the **full accumulated canon state** from all prior chunks:
- Character states (emotional, physical, arc position)
- World state (settings established, objects introduced, rules set)
- Plot threads (active, resolved, dangling)
- Dramatic tension level

The AI must never contradict anything in the accumulated canon. If it needs to establish a new fact, it must source it from an upstream document or flag it as a gap.

---

## 5. Dramatic vs Functional Characters

A rigid "no new characters" rule would break realistic scriptwriting. Real scripts need both categories.

### 5.1 Dramatic Characters

The story's engine — protagonist, antagonist, love interest, mentor, rival, confidante. They have arcs, make meaningful choices, drive plot.

**Rule:** Must come from character bible. Never invent.

### 5.2 Functional Characters

Scene texture — waiter, doorman, taxi driver, cop on a corner, bartender, passerby. They serve the mechanism of a specific scene but have no arc, no backstory, no recurrence.

**Allowed with constraints:**
- Occupation-defined, not name-defined (WAITER, not "Jorge")
- Must not recur across beats (if they do, elevate to character bible)
- Must not drive plot (they react, they don't choose)
- No backstory or emotional arc
- Max 3 lines across the entire script

### 5.3 The Practical Test

```
Scene: Protagonist walks into a diner.
"Black coffee." — Protagonist
"Coming right up." — WAITER (walks away)
```
✅ Functional character. Mechanism only.

```
Same WAITER sits down.
"I know who you are. The police were here. They said you wouldn't come back."
```
✗ Should be dramatic character. Drives plot. Needs character bible entry.

---

## 6. Proposed: `beat_sequential` Strategy

### 6.1 Overview

A new chunking strategy where each beat from the beat sheet becomes a generation unit. Replace `sectioned` for feature_script with `beat_sequential`:

```
Old: 4 chunks (act_1, act_2a, act_2b, act_3)
New: 40-70 chunks (beat_1, beat_2, ..., beat_N)
```

### 6.2 Three-Phase Process

**Phase A — Beat Analysis (pre-pass)**
For each beat in the beat sheet, analyse:
- How many scenes does this beat need? (1-3, hard cap)
- What state must be true when this beat starts? (from prior canon)
- What state must be true when this beat ends? (for next beat)
- What settings/characters are required?

This could be:
- A single LLM call analysing all beats at once, OR
- A lightweight structural parser using the beat sheet's existing fields (act, turning point, structural purpose)

**Phase B — Sequential Generation**
For each beat (1 through N):
1. Receive: accumulated canon state (characters, world, plot threads, tension)
2. Generate: 1-3 scenes in proper screenplay format with functional characters as needed
3. Save: result to `project_document_chunks` (incremental persistence)
4. Update: canon state with this beat's closing state

**Phase C — Assembly**
Simple linear stitch: scenes from beat 1 + scenes from beat 2 + ... + scenes from beat N
No merging needed — each chunk is sequential and non-overlapping.

### 6.3 Parallelism vs Sequential

**Forced sequential** — beats MUST generate in order. Beat 32 cannot start until beat 31's closing state is known.

This is slower (40-70 sequential LLM calls vs 4 parallel calls) but the tradeoff is accepted for quality.

**Crash recovery** via existing chunk persistence (commit `9490e0f`): if generation crashes at beat 31, it resumes from beat 31 — not from scratch.

### 6.4 Prompt Structure Per Beat

Each beat's generation prompt contains:

```
You are writing scenes for Beat N of the feature script.

BEAT:
[Beat name]: [structural purpose]
[What happens: 2-3 sentences from beat sheet]

SCENE COUNT: [2] scenes

CANON STATE (what is true right now):
- Characters: [Sarah: scared, suspicious. Marcus: absent, unreachable.]
- World: [The apartment is messy, Sarah hasn't cleaned in days.]
- Plot threads: [Active: the mysterious letter. Resolved: —]
- Tension level: [7/10]

SCENE 1 — must establish:
- Setting: INT. APARTMENT - DAY
- Dramatic purpose: Sarah opens the letter
- Character state shift: curious → shocked
- Must end with: letter is real, evidence of a cover-up

SCENE 2 — must establish:
- Setting: INT. OFFICE - DAY
- Dramatic purpose: Sarah confronts the source
- Character state shift: shocked → determined
- Must end with: she knows who to trust and who not to

Write in proper screenplay format:
INT./EXT. LOCATION - TIME
Action paragraph.
CHARACTER NAME
Line of dialogue.
```

### 6.5 Per-Beat Scene Count Determination

How does the system decide if a beat needs 1, 2, or 3 scenes?

The beat sheet already contains structural information:
- **Turning point** (Yes/No) — turning points typically need 2-3 scenes
- **Structural purpose** — "dark night of the soul" needs at least 2 scenes (the low point + the beginning of the turn)
- **Story outline reference** — each beat cites a story outline scene; some story outline moments span multiple events

Options:
A. **LLM analysis pass** — read all beats, output scene count per beat with reasoning
B. **Rule-based** — turning points = 3 scenes, key moments = 2, transitions = 1
C. **Hybrid** — rule-based default, LLM overrides for exceptions

---

## 7. Canon Context Passing

### 7.1 What Must Be Tracked

Between each beat, the system must know:

| Context | Contents | Format |
|---------|----------|--------|
| **Character states** | Each character: emotional state, physical location, arc position, relationships | JSON object keyed by character name |
| **World state** | Locations established, objects introduced, rules established | JSON object |
| **Plot threads** | Active (unresolved), resolved (closed), hanging (teased but not yet paid off) | Array of thread objects with status |
| **Dramatic tension** | Current tension level (1-10), escalation vector | Numeric + description |
| **Temporal position** | Time of day, date, elapsed time since story start | Structured fields |

### 7.2 How It's Passed

Each chunk's generation prompt includes the canon state as structured text. After generation, the AI's closing scene is parsed (or the AI outputs a structured canon update alongside the scenes) to produce the next chunk's canon state.

**Option A: AI-output canon state**
Each chunk ends with a JSON block:
```json
{"canon_update": {
  "character_states": {"Sarah": "determined, in office building"},
  "new_plot_threads": ["the cover-up trail leads to Marcus"],
  "resolved_plot_threads": [],
  "tension_level": 8,
  "temporal_position": "late afternoon, day 3"
}}
```

**Option B: Parse closing scene**
Extract canon state from the last scene's content programmatically (settings, who's present, what was revealed).

**Option C: Hybrid**
Parse closing scene for the easy stuff (location, time, characters present). Let the AI provide structured canon update for the harder stuff (emotional states, plot thread status).

### 7.3 Implementation Considerations

- Canon state object grows over 40-70 beats — needs pruning (forget resolved threads, summarise stable character states)
- The context window for beat 70 includes canon state summarising beats 1-69, not raw text of all prior scenes
- Previous solution (sectioned strategy) intentionally avoided narrative continuity to prevent the "skip ahead" bug — `beat_sequential` must solve this differently: pass *structured canon*, not *raw prose*

---

## 8. Technical Code Paths

### 8.1 Key Files

| File | Purpose | Key Lines |
|------|---------|-----------|
| `supabase/_shared/stage-ladders.json` | Canonical format ladder definitions | Full file |
| `supabase/functions/_shared/largeRiskRouter.ts` | Chunk strategy definitions, `chunkPlanFor()` | Lines 1-250 (strategy types, section definitions, plan builder) |
| `supabase/functions/_shared/chunkRunner.ts` | `runChunkedGeneration()`, assembly, validation, context passing | Lines 180-220 (sectioned prompt), 220-245 (feature_script per-act targets), 512-555 (continuity logic), 773-803 (assembly) |
| `supabase/functions/generate-document/index.ts` | Main generation entry, prompt construction, upstream reads | Lines 1107-1118 (feature_script prompt), 12482-12540 (large-risk redirect), 2000-2080 (chunk dispatch) |
| `supabase/functions/dev-engine-v2/index.ts` | Document conversion, rewrite pipeline | Lines 12446-12540 (convert dispatch), 10884-10910 (sectionedRewriteTypes) |
| `supabase/functions/_shared/docTypeTemplates.ts` | Template injection per doc type | Lines 388-520 (treatment, story_outline, beat_sheet templates) |
| `supabase/functions/_shared/eligibilityRegistry.ts` | Promotion gate definitions | Full file |
| `supabase/functions/_shared/decisionPolicyRegistry.ts` | Stage progression routing | Full file |
| `supabase/functions/auto-run/index.ts` | Pipeline self-chain orchestrator | Full file |
| `src/pages/ProjectDevelopmentEngine.tsx` | Frontend: main dev workflow page | Lines 1360-1390 (decisions recording), 1100-1150 (version selection) |
| `src/lib/can-promote-to-script.ts` | Frontend: promotion eligibility | Lines 280+ |

### 8.2 Current flow for feature_script generation

```
User clicks "Promote to Script" on beat_sheet
  → ActionToolbar.tsx checks eligibility
  → Calls dev-engine-v2 convert action
  → dev-engine-v2/index.ts:12482 detects large-risk → redirects to generate-document
  → generate-document/index.ts: 
    - Creates version placeholder (bg_generating: true)
    - Builds chunkPlanFor("feature_script", {}) → strategy="sectioned", 4 act chunks
    - Runs runChunkedGeneration() in background
  → chunkRunner.ts:
    - For each of 4 act chunks:
      - Builds prompt with per-act page targets (25-30 pages for Act 1, etc.)
      - Generates via LLM (Google Gemini 2.5 Flash)
      - Validates content
    - Assembles: act_1 + act_2a + act_2b + act_3 joined with \n\n
    - Runs repair pass on any failed chunks
  → On success: is_current=true, latest_version_id set
```

### 8.3 Proposed changes for beat_sequential

| File | Change |
|------|--------|
| `largeRiskRouter.ts` | New strategy type: `beat_sequential` with chunk plan built from parsed beat sheet beats (40-70 chunks) |
| `largeRiskRouter.ts` | Add `BEAT_SEQUENTIAL_SECTIONS` or dynamic beat-based plan builder |
| `chunkRunner.ts` | New prompt template for beat_sequential strategy (beat context + scene count + canon state) |
| `chunkRunner.ts` | Sequential generation loop with canon state accumulation between chunks |
| `chunkRunner.ts` | Structured canon update output/parsing |
| `generate-document/index.ts` | Route feature_script to `beat_sequential` instead of `sectioned` |
| `generate-document/index.ts` | Parse beat sheet version to extract beats for chunk plan |
| `dev-engine-v2/index.ts` | May need changes if convert flow also generates feature_script |
| `docTypeTemplates.ts` | Add feature_script template (scene format per beat) |
| `docs/DETERMINISTIC_WRITING_PRINCIPLE.md` | (already created — reference) |

---

## 9. Open Design Questions

### 9.1 Beat Source

Where do the 40-70 beats come from? The beat sheet version is stored in `project_document_versions.plaintext`. Does the system:
- A) Parse the beat sheet's plaintext for the ## Beat N entries?
- B) Read the beat sheet version's structured output (if stored as JSON)?
- C) Query a dedicated beats table?

### 9.2 Scene Count Determination

How is the 1-3 scene count per beat determined?
- A) Single LLM analysis pass over all beats at start
- B) Inline analysis before each beat (slower but more context-aware)
- C) Rule-based using beat sheet fields (turning points = 3, key beats = 2, transitions = 1)

### 9.3 Canon State Format

What format for the accumulated canon?
- A) Structured JSON that's passed as text in the prompt
- B) Natural language summary written by the previous chunk
- C) Hybrid: structured fields for easy data + NL summary for nuance

### 9.4 Context Pruning

After 40-70 beats, the canon state gets large. Pruning strategy:
- A) Drop resolved plot threads after 5 beats
- B) Summarise stable character states ("Sarah has been determined since beat 12")
- C) Sliding window: full canon for last 10 beats, summary for everything before

### 9.5 Model Choice

Sequential generation works best with a model that handles long, consistent character voice:
- A) Gemini 2.5 Flash (current default for chunked gen) — fast, cheap, consistent
- B) DeepSeek V4 Flash — better at long-form narrative
- C) Claude Sonnet 4 — best character voice, but more expensive for 40-70 calls

### 9.6 Parallel Exception: Tension Beats

Beats that don't depend on each other (character A's subplot vs character B's subplot running simultaneously) could theoretically be parallelised. Worth the complexity, or stick with pure sequential?

### 9.7 Frontend Progress Display

Current: "Generating Act 1 of 4" 
Proposed: "Generating Beat 12 of 52 — 'The Discovery' (Scene 2 of 3)"

---

## Appendix A: Existing Sequential Architecture

The `episodic_indexed` strategy in `chunkRunner.ts` is the closest existing pattern to what we need:

```typescript
// chunkRunner.ts ~lines 527-555 — episodic continuity
if (plan.strategy === "episodic_indexed") {
    previousEnding = chunk.chunkIndex > 0
        ? chunkContents[chunk.chunkIndex - 1].slice(-500)
        : undefined;
}
```

The episodic strategy already:
- Generates chunks sequentially (one episode at a time)
- Passes continuity (last 500 chars of previous episode)
- Saves each chunk to DB incrementally
- Supports crash recovery via `resumeChunkedGeneration()`
- Uses `project_document_chunks` table for individual chunk storage

The `beat_sequential` strategy extends this by:
- Replacing episode chunks with beat chunks
- Adding structured canon state (not just raw text) between beats
- Adding beat analysis pre-pass for scene count determination
- Adding per-beat scene count and structural purpose to prompts

## Appendix B: Key Commit History

| Commit | Purpose |
|--------|---------|
| `d1cf879` | Beat sheet per-act rewrite — sectioned strategy for rewrite pipeline |
| `2566b55` | Fix 3 beat sheet generation bugs (duplicate headers, prompt enforcement, parser fallback) |
| `9490e0f` | Chunk persistence — crash-resumable rewrites |
| `f084b90` | Fix promote-to-season-script button visibility |
| `f02b0eb` | Auth caching for sequential rewrites |

## Appendix C: Format Ladder Reference

```json
{
  "film": ["idea", "concept_brief", "character_bible", "treatment", 
           "story_outline", "beat_sheet", "feature_script", "production_draft"],
  "feature": ["idea", "concept_brief", "character_bible", "treatment", 
              "story_outline", "beat_sheet", "feature_script", "production_draft"],
  "vertical-drama": ["idea", "concept_brief", "format_rules", "character_bible", 
                     "season_arc", "episode_grid", "vertical_episode_beats", "season_script"],
  "animation": ["idea", "concept_brief", "treatment", "character_bible", 
                "beat_sheet", "feature_script"]
}
```

---

*This document is a living design proposal. External consultation (ChatGPT) should treat this as a system design brief and contribute architectural suggestions, prompt engineering improvements, and edge-case analysis.*

---

## 10. ChatGPT Design Feedback Integration

*External design consultation received May 19, 2026. The feedback substantially extends the architecture beyond text-chunk generation toward a **Narrative State Machine**.*

### 10.1 Foundational Shift: Beats as State Transitions

The most important recommendation: beats are NOT prose. They are **structured dramatic contracts**:

```
PRECONDITION → dramatic pressure → interaction → state mutation → POSTCONDITION
```

This enables deterministic rewrite propagation, contradiction detection, localized regeneration, and convergence scoring. The screenplay becomes a **rendered manifestation of state transitions**, not a monolithic prose artifact.

### 10.2 Structured Beat Contract Format

```json
{
  "beat_id": "B12",
  "dramatic_function": "reversal",
  "preconditions": { "sarah_trusts_marcus": true, "letter_unopened": true },
  "required_characters": ["Sarah", "Marcus"],
  "state_mutations": { "sarah_trusts_marcus": false, "coverup_exists": true },
  "tension_delta": 2,
  "scene_targets": [{ "purpose": "discovery", "required_outcome": "Sarah confirms deception" }]
}
```

### 10.3 Four-Layer Canon System (Required)

| Layer | Name | Contents | Load Strategy | Volume |
|-------|------|----------|--------------|--------|
| 1 | Immutable Canon | Ages, histories, world rules, geography, permanent relationships | Always loaded | Small |
| 2 | Active Narrative State | Emotional states, objectives, current location, tension, alliances | Rolling window, frequently updated | Small |
| 3 | Historical Compression | Summarized trajectory memory: "Sarah has gradually distrusted Marcus since B12" | Always loaded | Tiny |
| 4 | Episodic Recall | Retrieval-only: gun introduced in B4, photograph from B18 | On-demand via retrieval | Variable |

Critical for scaling 40-70 sequential beats without context collapse.

### 10.4 Dramatic Intent Tracking

The most significant missing system. Track what each character is TRYING TO DO, not just how they feel:

```json
{
  "Sarah": {
    "visible_goal": "discover truth",
    "hidden_goal": "avoid abandonment",
    "strategy": "pressure Marcus",
    "confidence": 0.7
  }
}
```

Drama emerges from CONFLICTING INTENT, not plot facts.

### 10.5 Hybrid Canon Updates

- **Programmatic extraction**: location, time, characters present, objects introduced
- **AI structured output**: emotional shifts, dramatic reversals, trust changes, plot thread resolution, hidden revelations

BOTH, not one or the other.

### 10.6 Parallel Rollout Strategy

DO NOT replace `sectioned` immediately. Add `feature_script_v2` with `beat_sequential` as a new experimental pathway. Run both in parallel for empirical comparison of:

- SR scores and convergence quality
- Canon stability and pacing consistency
- Rewrite resilience and repair behavior
- Token economics and latency
- Continuity integrity

### 10.7 Full Implementation Phases

| Phase | Scope |
|-------|-------|
| **Phase 1** | beat_sequential strategy, sequential chunk execution, beat parsing, structured canon state, hybrid canon updates, beat-level persistence |
| **Phase 2** | Structured beat contracts, intent tracking, canon stratification, dynamic scene-count analysis, beat-level validation |
| **Phase 3** | Narrative dependency graph, localized rewrite replay, contradiction engine, dramatic convergence scoring, state mutation validation |
| **Phase 4** | Production intelligence layer, AI actor integration, scene energy vector analysis, predictive rewrite simulation, narrative risk forecasting |
