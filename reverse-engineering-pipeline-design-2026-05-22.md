# Reverse Engineering Pipeline — Iteration Loop Design

**Date:** 2026-05-22
**Source:** Round-table discussion with Sebastian (via Oracle)
**Context:** Designing the post-reverse-engineering iteration workflow for IFFY

---

## A. The Problem

### What we're trying to solve

IFFY's forward pipeline (DevSeed → production draft) is well-defined. It generates foundation documents upward through the ladder, ending in a production draft. The purpose is generative — build a story from nothing.

The reverse engineering pipeline has a fundamentally different purpose:

> **Take an existing finished script → extract all its data → reverse engineer foundation documents that are faithful to the original → then iterate to improve creative integrity and green-light potential.**

The problem is: **we don't have an iteration loop designed for this.** The current reverse engineering pipeline extracts and generates foundation docs (idea, concept brief, market sheet, treatment, story outline, beat sheet, character bible, feature script) but stops there. There's no workflow for:

1. **Verifying** the foundation docs are truly faithful to the original script
2. **Reviewing** each foundation doc for creative improvement opportunities
3. **Applying notes** to foundation docs (from subtle to structural)
4. **Tracking divergence** from the original as changes accumulate
5. **Propagating** approved revisions into a rewritten feature script

### The core tension

There are two phases with opposing goals:

**Phase A — Faithfulness:** Foundation docs must capture the original script accurately. Every scene must be accounted for. Characters must exist in the script. No hallucinated content.

**Phase B — Improvement:** Once verified, we deliberately change the foundation docs to make the project better. More/less characters. Added/subtracted scenes. Structural rewrites. Theme deepening.

The tension: **When does a revised foundation doc stop being "the original story" and become a new story?** That's not a bug — it's the intended workflow. But we need a clear way to track what changed and why.

---

## B. What Currently Exists

### The data layer (confirmed via YETI deep dive)

**Scene Graph** — `scene_graph_scenes`
- 83 scenes for YETI (SCENE_001–SCENE_083, sequential, no gaps)
- Fields: `id`, `project_id`, `scene_key`, `scene_kind`, `provenance`
- **No sluglines, no headings, no act assignment stored**
- `provenance: {}` — empty, no traceability back to source text
- Count is captured in `screenplay_intake_stage_runs.output_summary` but not stored on the document version

**Story Outline** — stored as JSON blob in `project_document_versions.plaintext`
- Format: `"Abbreviated Story Sequence"` with 22 entries
- Each entry: `{title, number, description}` (short prose snippets)
- **No act boundaries, no scene references**
- No cross-reference to scene graph

**Beat Sheet** — stored as markdown
- 40 beats across 5 acts (Act 1: 11, Act 2A: 11, Act 2B: 7, Act 3: 9, Act 4: 2)
- References page numbers but **not scene numbers**
- Has turning points marked (Inciting Incident, Midpoint, Climax, etc.)

**Character Bible** — generated from entity extraction
- Characters from the script text via NLP
- Tied to entity extraction at intake stage

**Supporting docs**: idea, concept_brief, market_sheet, treatment — all generated from the extracted script

### Key gaps identified

1. **No scene-to-moment mapping** — the story outline doesn't know which scenes it covers. We can't verify "do these 22 moments span all 83 scenes?" from the data alone.

2. **No act boundaries on story outline** — the beat sheet has act boundaries but the story outline doesn't. The story outline JSON has no act field.

3. **Scene graph lacks headings** — SCENE_001 through SCENE_083 exist as empty containers. No slugline stored. The scene graph is a structural index, not a content store.

4. **Document versions lack scene_count metadata** — `meta_json` is null on the source feature_script version. The scene count lives in the intake run records but never gets written back to the version.

5. **No iteration workflow** — the pipeline generates v1 of everything and stops. No versioning across revisions, no change tracking, no approval workflow for iterative improvement.

### The corrected ontology (scenes vs moments vs beats)

During the conversation, it was confirmed that the current ladder definition conflates beats with scenes. The correct three-layer hierarchy:

```
SCRIPT
├── Scene 1: INT. CAVE — NIGHT       (structural unit, slugline boundary)
│   ├── Beat 1: tension introduced   (dramatic movement)
│   └── Beat 2: revelation lands     (dramatic shift within the same scene)
├── Scene 2: EXT. MOUNTAIN — DAY
│   └── Beat 3: decision
│
↓ reverse engineer groups scenes into narrative events

STORY OUTLINE
├── Moment 1: "The Discovery"        (narrative event, spans Scenes 1-5)
├── Moment 2: "The Journey"          (narrative event, spans Scenes 6-18)
```

**Key relationships:**
- A **moment** (story outline entry) spans 1–5 scenes
- Multiple **beats** exist within a single scene
- A beat does NOT equal a scene
- Scenes are structural (where+when), beats are dramatic (emotional/power shift), moments are narrative (something happens)

---

## C. Two Distinct Pipelines

### Forward Pipeline (DevSeed → Production Draft)

```
DevSeed / NEC → idea → concept_brief → market_sheet → treatment
  → character_bible → story_outline → beat_sheet → feature_script
  → production_draft
```

- **Purpose:** Generate a story from foundation outward
- **Direction:** Bottom-up (seed → docs)
- **Gate:** Morpheus validates before Trinity builds
- **Nature:** Generative, building from nothing

### Reverse Engineering Pipeline (Script → Foundation → Iterate) ← DESIGN TARGET

```
EXISTING SCRIPT
  ↓ extract to scene graph
  ↓ reverse engineer foundation docs
foundation docs v1 (faithful to original)
  ↓ VERIFICATION GATE — confirm accuracy
verified foundation docs
  ↓ ITERATION LOOP
  │  review → notes → revise foundation doc → approve new version
  │  (repeat per document, scope: subtle to structural)
  ↓
REWRITTEN SCRIPT (from approved foundation docs)
```

- **Purpose:** Take existing work and improve it
- **Direction:** Top-down (script → docs) → then iterative improvement → bottom-up (docs → rewritten script)
- **Gate:** Verification gate (different from Morpheus — this is about faithfulness, not design)
- **Nature:** Reverse engineer to understand, then iterate to improve

---

## D. The Iteration Loop — Architecture Ideas (Open for Design)

### Phase A: Verify Faithfulness

Before iteration begins, each foundation doc needs to be verified against the scene graph / source script:

| Document | Verification Question | How |
|----------|----------------------|-----|
| Story Outline | Do the 22 moments cover all 83 scenes? | Moment-to-scene mapping or manual review |
| Beat Sheet | Are all key dramatic turns captured? | Cross-reference against script structure |
| Character Bible | Are all characters from the script present? | Entity extraction vs script text |
| Treatment | Does the narrative arc match the original? | Coverage comparison |

The verification gate doesn't need to be automated — it could be a manual sign-off. But the **data to support it** (scene-to-moment mapping, act boundaries on moments) needs to exist.

### Phase B: Iterate with Intention

Once verified, the workflow is:

1. **Sebastian reviews a foundation doc** (reads the story outline, for example)
2. **Sebastian has a conversation with ChatGPT** about opportunities — creative integrity, green-light potential, character arcs, structural improvements
3. **Notes are generated** — could range from "rewrite this moment for more tension" to "add a new character subplot in Act 2A" to "restructure the entire third act"
4. **Notes are applied** — a new version of the foundation doc is created
5. **The revised doc is approved** as the new source of truth
6. **Changes propagate** — downstream docs (beat sheet, feature script) are updated to reflect the revision

### Change Propagation (The Hard Part)

Different changes have different ripple effects:

| Change | Propagates To |
|--------|---------------|
| Reword a story outline moment | Beat sheet entry, scene dialogue |
| Add a new story outline moment | New scene(s) in script, new beat(s) |
| Deepen a character arc | Character bible, all beats/scenes involving that character |
| Add a character | Character bible, extra scenes/beats |
| Restructure an act | Multiple moments, multiple beats, multiple scenes |
| Change the midpoint | Act 2A/2B boundary, multiple moments |

### Divergence Tracking

At some point, the revised foundation docs become materially different from the original script. This is intentional — it's the whole point. But we need to track:

- **What changed:** A running diff from the original
- **Why it changed:** Linked to specific notes/reviews
- **When it crossed from "faithful revision" to "new story":** A milestone or version boundary

---

## E. What's Missing / Open Questions

### Data structures that need building

1. **Scene-to-moment mapping** — a table or reference that says "Story Outline Moment #3 covers Scene_008–Scene_014"
2. **Act boundaries on story outline** — each moment needs an act assignment (Act 1, 2A, 2B, 3)
3. **Scene metadata on versions** — `meta_json` should carry `extracted_scene_count` at minimum
4. **Beat-to-scene mapping** — which beats live in which scenes
5. **Change log / revision history** — a structured record of what changed between foundation doc versions and why

### Process questions

1. **Verification gate:** Manual read-through or do we build a tool that traces moments → scenes?
2. **Note format:** How are review notes captured? Structured JSON? Free text? A conversation between Sebastian and ChatGPT?
3. **Doc priority:** Which foundation doc gets iterated first? Story outline (top of the ladder) or character bible (foundation)?
4. **Approval flow:** Does Sebastian approve each revised doc individually, or is it batch approval per review session?
5. **Divergence threshold:** At what point is the rewritten script no longer recognisable as the original? Is that a problem or a feature?

---

## F. YETI Case Study Data (for reference)

**Source:** YETI script, ~105 pages
**Project:** be05e314-900a-4b27-b2a7-5f2232ff6f6d

| Artifact | Count | Notes |
|----------|-------|-------|
| Scene graph | 83 scenes | SCENE_001–SCENE_083, sequential, no gaps |
| Original script scenes | ~81 (numbered 4-84) | 2 extra in graph (likely parsing artifact) |
| Story outline moments | 22 | JSON "Abbreviated Story Sequence", no act boundaries |
| Beat sheet | 40 beats | 5 acts: 11/11/7/9/2 beats |
| Character bible | generated | From entity extraction at intake |
| Supporting docs | 5 (idea, concept_brief, market_sheet, treatment, character_bible) | All at v1 |

**Data gaps exposed by YETI:**
- Story outline has **no scene references** → can't verify moment-to-scene coverage
- Story outline has **no act boundaries** → can't verify acts are balanced
- Beat sheet mentions **page numbers** but not scene numbers → can't trace beats to scenes
- Scene graph is **empty containers** (keys only, no headings/content) → can't verify scene positioning

---

## G. Summary for ChatGPT Context

For your conversation partner:

> IFFY is a React/TypeScript SPA backed by Supabase (Postgres + Edge Functions) for screenplay development. It has two pipelines: a forward pipeline (DevSeed → production draft, generative) and a reverse engineering pipeline (existing script → foundation docs → iteration → rewritten script). The reverse engineering pipeline successfully extracts scripts into a scene graph and reverse-engineers foundation documents (story outline in JSON "Abbreviated Story Sequence" format, beat sheet as markdown, character bible from entity extraction, plus supporting docs). What's missing is the iteration loop — a workflow for reviewing those foundation docs, receiving notes on creative integrity / green-light potential, revising documents, tracking divergence from the original script, and finally rewriting the feature script from approved revisions. The three-layer ontology is: Scenes (structural slugline boundaries) → Moments (narrative events spanning 1-5 scenes) → Beats (dramatic movements, multiple per scene). Beats and scenes are not equivalent. The design challenge is: how to structure the verification gate, the iteration loop, and change propagation.

