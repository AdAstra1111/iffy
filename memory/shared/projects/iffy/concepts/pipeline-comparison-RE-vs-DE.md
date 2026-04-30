# Pipeline Comparison: Reverse Engineering vs Development Engine
**Created:** 2026-04-30
**Author:** Morpheus (with sub-agent research contribution)
**Status:** COMPLETE

---

## Executive Summary

Two pipelines generate equivalent document types with fundamentally different methods:

- **Reverse Engineering (RE):** Extractive — reads existing screenplay, synthesizes rich narrative prose
- **Development Engine (DE):** Generative — creates from structured seed data with structural prompts

IFFY treats both outputs as the same document type with same convergence criteria. They are not equivalent — they differ in source data, output richness, and canonical vocabulary. This causes canon mismatches, convergence scoring failures, and promotion blocks.

---

## Pipeline 1: Reverse Engineering

**Edge function:** `reverse-engineer-script/index.ts` (1,177 lines)
**Trigger:** User drops screenplay → creates job → background job runs
**Source:** `plaintext` field of user-uploaded screenplay document

### Stages (12 stages, sequential):

```
structure_1 → structure_2 → structure_3 → synthesise → idea → beat_sheet → story_outline → character_bible → treatment → market_sheet → infer_criteria → storing_docs
```

### Each stage:

| Stage | Method | Input | Output |
|-------|--------|-------|--------|
| structure_1/2/3 | LLM synthesis | Script chunks (10K chars each) | Full story analysis: characters, locations, events, themes |
| synthesise | LLM merge | All 3 chunk analyses | Unified story arc, tone, structure |
| idea | LLM synthesis | Full synthesis + script opening | Title, logline, genre, subgenre, tone, themes, target_audience |
| beat_sheet | LLM extract | Full synthesis + script excerpt | 20-70 beats with names, descriptions, emotional_shift, protagonist_state, dramatic_function, turning_points |
| story_outline | LLM synthesis | Full synthesis + beat labels | Sequential narrative prose entries (1-2 sentences each), advances arc |
| character_bible | LLM synthesis | Full synthesis + script | Characters ordered by importance, full backstory + psychology |
| **treatment** | **LLM synthesis** | **Full synthesis + all beat descriptions + character roster + world notes** | **Rich sensory prose, 3-4 acts, atmospheric specificity, interiority, emotional texture** |
| market_sheet | LLM synthesis | concept_brief + structural data | Comparable titles, genre, tone, audience, budget range |
| infer_criteria | LLM inference | Market sheet + script | Criteria fields + guardrails |
| storing_docs | Upsert | All above | Written to project_documents table |

### RE Treatment Prompt (key directives):
```
"You are writing descriptive narrative prose for a feature film production.
This prose will be used as a FOUNDATIONAL CORPUS FOR AI IMAGE AND VIDEO GENERATION.
It must capture the SENSORY AND EMOTIONAL TEXTURE of each scene — not just the plot events."

"FOR EACH SCENE/MOMENT, WRITE WITH:
- Atmospheric specificity: What does this location actually look/sound/smell feel like?
  (Not 'the mine' — the SPECIFIC COLD, the ANCIENT CARVED WALLS, the way TORCHLIGHT CATCHES THE STONE FACE)
- Character interiority in motion: Not 'Bill is angry' — the CONTROLLED STILLNESS BEFORE HE SPEAKS, the way he HOLDS HIS LEFT HAND STILL
- Emotional texture: Not 'tense' — WHAT DOES IT FEEL LIKE EXACTLY?"

"REMEMBER: Specificity is everything. 'Ancient carved walls with torchlight catching the stone' creates AI consistency. 'The dark mine' creates generic AI."
```

### RE Output Format (Treatment):
- Flowing prose narrative — NOT beat list, NOT entries with titles/descriptions
- 3-4 acts with explicit act break guidance
- All beats from beat_sheet included as primary context
- Full character roster with backstory text fed to LLM
- Label: `v1 (reverse-engineered)`
- meta_json: `{ reverse_engineered: true, ...source_citations }`

---

## Pipeline 2: Development Engine

**Edge function:** `dev-engine-v2/index.ts` (36,744 lines)
**Trigger:** User creates dev seed → autorun → document generation
**Source:** `dev_seed_v2_*` tables (premise, axes, units, entities, beats, canon_rules) + existing project documents

### Key Actions:

| Action | Purpose |
|--------|---------|
| `create_dev_seed_v2` | Create seed from user input |
| `generate-document` | Generate new document via `generate-document` edge function |
| `treatment-rewrite` | Rewrite Treatment section-by-section (2-pass parser) |
| `rewrite` / `rewrite-chunk` | Rewrite other document types |
| `analyze` | Run convergence analysis on existing docs |
| `detect_autopilot_repair` | Monitor narrative health |

### Document Generation (via `generate-document` edge function):

UPSTREAM DEPS (from `generate-document/index.ts`):
```typescript
beat_sheet:    ["character_bible", "concept_brief", "treatment", "story_outline"],
treatment:     ["long_synopsis", "character_bible", "concept_brief", "market_sheet"],
story_outline: ["concept_brief", "character_bible", "treatment"],
screenplay_draft: ["beat_sheet", "character_bible", "treatment"],
```

### DE Treatment Template (from `docTypeTemplates.ts`):
```
## LOGLINE
[IMPORT — copy exactly from concept_brief.logline. Do not reinterpret or paraphrase.]

## THE WORLD
[EVOLVE from concept_brief.world — 1–2 paragraphs. Build on what's established, add texture.]

## ACT ONE
[GENERATE — 750–1,250 words. Establish protagonist in their ordinary world.
Introduce the central conflict. Inciting incident. End on the moment of commitment.]

## ACT TWO
[GENERATE — 1,000–1,500 words. Protagonist pursues goal. Obstacles multiply.
Midpoint reversal. Darkest moment before the final turn.]

## ACT THREE
[GENERATE — 750–1,250 words. Climactic confrontation. Resolution. Final image.]

## CHARACTERS
[EVOLVE from character_bible core descriptions — add texture, relationship dynamics.
Do not invent new character facts not in the character_bible.]

## TONE & VISUAL LANGUAGE
[EVOLVE from concept_brief.tone — reference visual approach, pacing, tonal notes.]

## WHY NOW
[IMPORT — copy exactly from concept_brief.why_now.]
```

### DE Output Format (Treatment):
- Sectioned scaffold with IMPORT/EVOLVE/GENERATE directives
- Acts have word count targets but no sensory richness guidance
- No explicit directive for atmospheric specificity, interiority, or emotional texture
- Source context: concept_brief fields (canon_json), character_bible core descriptions
- No beat descriptions, no screenplay narrative, no character backstory text

---

## Side-by-Side Comparison

### TREATMENT

| Dimension | RE (Reverse Engineering) | DE (Development Engine) |
|-----------|--------------------------|--------------------------|
| **Source** | Full screenplay plaintext + synthesis + beat descriptions | concept_brief + character_bible (structured fields) |
| **Method** | Extractive — pulls sensory detail from screenplay prose | Generative — creates from structural prompts |
| **Input richness** | All beats, character roster with backstories, world notes, full synthesis | canon_json fields, character_bible core |
| **Prose style** | Rich sensory description, interiority, emotional texture | Structural summaries, plot-advancing prose |
| **AI directive** | "foundational corpus for AI image and video generation" | None |
| **Act structure** | 3-4 acts, explicit act break guidance | 3 acts, word count targets |
| **Specificity** | "Ancient carved walls with torchlight catching the stone" | "Establish world, introduce conflict" |
| **Output purpose** | Feed visual AI systems (image/video generation) | Document ladder completion |

### CONCEPT BRIEF

| Dimension | RE | DE |
|-----------|----|----|
| **Source** | LLM synthesis from screenplay (rich screenplay vocabulary) | User input + structured seed fields (sparse) |
| **Format** | Structured JSON (title, logline, genre, subgenre, tone, themes, target_audience) | Same format, but populated from seed not screenplay |
| **Tone field** | Specific language from screenplay's actual voice | Generic concept-level tone |
| **Logline** | 1-2 sentence hook in screenplay's voice | Seed-derived logline |

### STORY OUTLINE

| Dimension | RE | DE |
|-----------|----|----|
| **Format** | Sequential narrative prose, 1-2 sentences per entry, advances arc | 3-5 sentence scene summaries with "What happens / Dramatic purpose / Connection" |
| **Source input** | Full synthesis + beat structural labels | concept_brief + character_bible + treatment |
| **Richness** | Narrative prose that advances story (not paraphrase) | Structural format (functional but not narrative prose) |

### BEAT SHEET

| Dimension | RE | DE |
|-----------|----|----|
| **Format** | 20-70 beats with: name, description, emotional_shift, protagonist_state, dramatic_function | 40-70 beats with: structural purpose, act affiliation, scene linkage |
| **Beat names** | Short evocative titles (1-6 words, actual character names) | Structural labels |
| **Protagonist state** | Included | Not included |
| **Emotional shift** | Included | Not included |
| **Scene citations** | N/A | Cites story_outline scenes |

### CHARACTER BIBLE

| Dimension | RE | DE |
|-----------|----|----|
| **Format** | Ordered by narrative importance, full backstory, psychology | Character profiles from structured seed |
| **Ordering** | Narrative importance (protagonist first) | Structured (may be alphabetical) |
| **Backstory** | Full backstory text from screenplay synthesis | Core descriptions from character seed |

---

## Root Cause Analysis

### Why RE produces richer content than DE:

**1. Source data quality**
RE reads actual screenplay prose — thousands of lines of narrative description, dialogue subtext, setting details. DE reads structured canon_json fields — brief text entries in named buckets. The source data for RE is inherently richer than the structured abstraction DE works from.

**2. Prompt directives**
RE Treatment prompt explicitly instructs: "This prose will be used as a foundational corpus for AI image and video generation. Specificity is everything." DE Treatment template has no equivalent directive. The word count targets are structural scaffolding, not sensory guidance.

**3. Architectural purpose**
RE and DE were designed for different purposes. RE is designed to extract a story's complete sensory world from an existing screenplay. DE is designed to generate a story from structured seeds. These are different tasks with different output requirements. IFFY treats them as equivalent pipeline stages when they're not.

**4. Canonical vocabulary mismatch**
When canon feed compares canon_json values between RE and DE Treatment versions, they use different vocabulary to describe the same story elements. RE: "Ancient carved walls with torchlight catching the stone face." DE: "The dark mine." Canon gate flags this as drift even though the story is identical.

---

## Canon, Scoring, and Promotion Impact

### The `reverse_engineered: true` flag:
- Present in `meta_json` for all RE documents
- Does **NOT** exempt documents from canon checking
- Does **NOT** alter convergence scoring behavior
- Does **NOT** change promotion gate logic
- Documents are treated as equivalent canonical sources regardless of pipeline origin

### Canon mismatch mechanism:
1. RE Treatment has canon_json with specific sensory vocabulary
2. DE Treatment rewrite has canon_json with generic structural vocabulary
3. Canon feed detects "drift" between versions — flags as F1/F2 violation
4. Convergence scoring gives lower CI/GP to DE Treatment because its content is thinner
5. Promotion blocks fire — Promote-to-Script gate sees unresolved canon violations

### Concept Brief canon violations and Promote-to-Script:
- RE concept_brief is synthesized from screenplay voice — vocabulary is specific
- DE concept_brief is generated from seed fields — vocabulary is generic
- Canon gate checks whether concept_brief.criteria_* fields match criteria.json
- When mixed RE/DE documents exist in same project, canon feed receives inconsistent vocabulary
- This is a root cause of the F1/F2 canon violations blocking Promote-to-Script

---

## Alignment Design

### Principle: Both pipelines must produce structurally AND semantically equivalent outputs.

The target output format should be defined FIRST, then both pipelines must be updated to hit that target.

### Minimum content requirements by document type:

#### Treatment
- **LOGLINE:** 1-2 sentence hook, protagonist + conflict + stakes. Canonical source: concept_brief.logline
- **THE WORLD:** 1-2 paragraphs establishing setting, sensory texture, atmosphere. Not generic.
- **THE STORY — ACTS:** Act 1 (750-1,250w), Act 2 (1,000-1,500w), Act 3 (750-1,250w). Word count is guidance, not mandate. Sensory specificity required.
- **CHARACTERS:** 1-2 paragraphs per character with emotional texture. Core from character_bible.
- **TONE & VISUAL LANGUAGE:** 1 paragraph. Visual approach, pacing, tonal notes.
- **WHY NOW:** 1 paragraph. Thematic relevance.

**Non-negotiable richness standard for both pipelines:**
> "This prose will be used as a foundational corpus for AI image and video generation. It must capture the sensory and emotional texture of each scene. Atmospheric specificity is non-negotiable. For each location: what does it actually look/sound/smell/feel like? For each character moment: what does it feel like exactly, not just what happens?"

#### Beat Sheet
- Beat names: short evocative titles (1-6 words, real character names)
- Description: full prose description with sensory texture (not just plot summary)
- `emotional_shift`: included
- `protagonist_state`: included  
- `dramatic_function`: included
- `turning_point` flag: included
- Story outline scene citations

#### Story Outline
- Sequential narrative prose entries that advance the arc (not paraphrased beat summaries)
- Format: title + 1-2 sentence description that moves story forward
- Dramatic purpose stated per scene

#### Character Bible
- Ordered by narrative importance (protagonist first)
- Full backstory + psychology text (not just "character description" fields)
- Voice/dialogue style notes
- Emotional range and texture

---

## Reconciliation Plan

### Question 1: Should DE overwrite the RE document, or respect RE content as canonical?

**Answer: RE content should be respected as canonical until explicitly rewritten.**

When a project has an RE Treatment, it should be considered the canonical Treatment for that story until the user explicitly rewrites it through DE. The canon feed should treat RE documents as authoritative sources, not as first-pass drafts to be regenerated.

**Rule:** If `meta_json.reverse_engineered: true`, the document is the canonical source for that story. DE rewrite should be an evolution of the RE content, not a replacement.

### Question 2: Should RE and DE share the same convergence criteria?

**Answer: Yes, but with pipeline-aware scoring.**

The convergence criteria (CI/GP thresholds) should be the same. However, the convergence engine should account for source data richness:
- RE documents start with richer source data — CI/GP expectations should account for this
- DE documents start with sparser source data — CI/GP may be structurally lower until content is enriched

**Practical approach:** Don't lower the bar for DE. Instead, fix DE's source data to match RE's richness. Then the same criteria apply to both.

### Question 3: What happens when a project has mixed sources?

**Answer: Identify the canonical source for each document type, track pipeline origin, apply pipeline-aware convergence.**

Add pipeline origin tracking to canon_json:
```typescript
canon_json: {
  treatment: {
    source_pipeline: "reverse_engineer" | "development_engine",
    source_document_id: string,
    reverse_engineered: boolean,
    // existing fields...
  }
}
```

Convergence scoring and canon feed should:
1. For each document, check `source_pipeline` in canon_json
2. When comparing RE vs DE documents of same type, flag the mismatch explicitly
3. Don't treat it as canon drift — treat it as pipeline inconsistency requiring resolution

### Question 4: Should RE documents be regeneratable through DE pipeline?

**Answer: Yes, but only when user explicitly requests it.**

A "Regenerate through DE" action should be distinct from "Rewrite Treatment." Rewrite respects the existing document. Regenerate through DE replaces the RE pipeline origin with DE pipeline origin — this should be an explicit user choice, not an automatic pipeline stage.

---

## Technical Changes Required

### RE Pipeline Changes (match DE output format):

1. **`reverse-engineer-script/index.ts` — Beat sheet stage:**
   - Add `structural_purpose`, `scene_citation` fields to beat output
   - Current: `emotional_shift`, `protagonist_state`, `dramatic_function`, `turning_points`
   - Target DE format: same + `story_outline_scene_ref`

2. **`reverse-engineer-script/index.ts` — Story outline stage:**
   - Keep narrative prose format (RE's current format is richer than DE's)
   - Add `dramatic_purpose` field per entry
   - DE format requires "What happens / Dramatic purpose / Connection" — RE can adopt this structure without losing richness

3. **`reverse-engineer-script/index.ts` — Character bible stage:**
   - Already has full backstory text — confirm ordering is by narrative importance (not alphabetical)
   - Confirm voice/dialogue style notes are included

4. **`reverse-engineer-script/index.ts` — Treatment stage:**
   - Keep current format (it's better than DE's)
   - Add meta_json field: `source_pipeline: "reverse_engineer"`
   - This flag should propagate to canon_json via canon alignment gate

### DE Pipeline Changes (match RE output detail level):

1. **`docTypeTemplates.ts` — Treatment template:**
   - Add sensory richness directive: "This prose will be used as a foundational corpus for AI image and video generation. Specificity is non-negotiable."
   - Replace generic `[GENERATE — 750–1,250 words]` with rich prose guidance matching RE's prompt
   - Add atmospheric specificity guidance for THE WORLD section

2. **`generate-document/index.ts` — Treatment generation:**
   - Pass rich upstream context to LLM (beat descriptions, character backstory text, not just canon_json fields)
   - Include story_outline scene summaries as context for Treatment generation
   - Add word count targets per act (current template already has these)

3. **`docTypeTemplates.ts` — Beat sheet template:**
   - Add `emotional_shift`, `protagonist_state` fields (RE includes these, DE doesn't)
   - Add `dramatic_function` field
   - Add turning point flags

4. **`docTypeTemplates.ts` — Story outline template:**
   - Current DE format (What happens / Dramatic purpose / Connection) is fine
   - Confirm it imports treatment.tone and concept_brief.logline

5. **`docTypeTemplates.ts` — Character bible template:**
   - Confirm backstory + psychology text is part of output, not just core descriptions
   - Add voice/dialogue style notes guidance

### Schema Changes:

1. **Add `source_pipeline` to `project_document_versions.meta_json`:**
```typescript
meta_json: {
  source_pipeline: "reverse_engineer" | "development_engine" | null,
  reverse_engineered: boolean,
  // existing fields...
}
```

2. **Canon feed / convergence engine:**
   - Read `source_pipeline` from canon_json
   - When comparing documents of same type from different pipelines, flag as pipeline_inconsistency (not canon_drift)
   - Different error handling for pipeline_inconsistency vs canon_drift

3. **Promotion logic:**
   - Check `source_pipeline` for documents involved in promotion gate
   - Mixed pipeline sources at Promote-to-Script should surface a warning, not silently fail

### Edge Function Changes:

1. **`dev-engine-v2/index.ts` — canon alignment gate:**
   - Track `source_pipeline` in canon_json when writing canon values
   - Flag pipeline origin on canon entries

2. **`dev-engine-v2/index.ts` — treatment-rewrite action:**
   - Preserve `source_pipeline: "development_engine"` on rewritten versions
   - Existing RE Treatment rewritten by DE should be flagged as pipeline evolution, not regeneration

3. **`reverse-engineer-script/index.ts` — all storeDoc calls:**
   - Add `source_pipeline: "reverse_engineer"` to meta_json on all created documents
   - Ensure this propagates to canon_json via canon alignment gate

---

## Implementation Priority

### Phase 1 (Immediate — fix the most common promotion block):
1. Add `source_pipeline` tracking to meta_json (both pipelines)
2. Update canon alignment gate to track and propagate pipeline origin
3. Update concept_brief generation in DE to use richer source context (beat descriptions, character backstory)

### Phase 2 (Short term — content quality parity):
1. Update DE Treatment template with sensory richness directive
2. Update DE Beat sheet template with emotional_shift + protagonist_state fields
3. Update RE Story outline to include dramatic_purpose per entry

### Phase 3 (Medium term — full reconciliation):
1. Update convergence scoring to flag pipeline mismatches
2. Update promotion logic to warn on mixed pipeline sources
3. Add "Regenerate through DE" action (respects RE as canonical until explicit user request)

---

## Validation

After implementing Phase 1-2 changes, test by:

1. **RE project:** Drop screenplay → generate all foundation docs → verify Treatment has sensory richness
2. **DE project:** Create dev seed → generate all foundation docs → verify Treatment matches RE richness standard
3. **Mixed project:** RE concept_brief + DE Treatment → verify canon feed doesn't flag as drift
4. **Convergence scoring:** Same story content scored through RE and DE pipelines → both meet CI/GP threshold
5. **Promotion:** Mixed-source project at Promote-to-Script → should warn but not silently block

---

## Key Files

| File | Purpose |
|------|---------|
| `supabase/functions/reverse-engineer-script/index.ts` | RE pipeline — 12-stage screenplay extraction |
| `supabase/functions/dev-engine-v2/index.ts` | DE pipeline — 36,744 lines, all DE actions |
| `supabase/functions/generate-document/index.ts` | DE document generation — called by dev-engine-v2 |
| `supabase/functions/_shared/docTypeTemplates.ts` | DE document templates — format definitions |
| `src/canon/canonOS.ts` | Canon feed — stores canon_json + provenance_hash |
| `src/hooks/useCommitSectionPatch.ts` | Convergence scoring — validates provenance |

---

_Last updated: 2026-04-30 22:49 BST_
