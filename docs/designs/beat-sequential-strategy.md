# beat_sequential Chunking Strategy for feature_script Generation

**Status:** Architecture Design
**Author:** Architect (Agent 3)
**Date:** 2026-05-21
**Priority:** HIGH
**LOOP_COUNT:** 0

---

## 1. Problem Statement

The current `sectioned` strategy for `feature_script` splits generation into 4 act-level chunks:
act_1, act_2a, act_2b, act_3. Each chunk handles ~15-18 beats from the beat sheet. This causes:

1. **LLM falls into summary mode** — handling 15+ beats per chunk forces the model to write "and then this happens" prose instead of dramatised scenes
2. **Beat-to-scene mapping lost** — beats become narrative summary, not scene blueprints
3. **Character arc drift** between act chunks — no cross-chunk context (sectioned intentionally disables narrative continuity per the fix at chunkRunner.ts:510-557)
4. **Dramatic escalation prevented** — Act 2a doesn't know Act 1's closing state

## 2. DIAGNOSIS Questions — Answered

### A) Can existing `episodic_indexed` sequential pipeline be repurposed for beats?

**Yes, with adaptation.** The `episodic_indexed` pipeline generates one chunk per episode with:
- Narrative continuity via `previousChunkEnding` (last 500 chars of previous chunk) — handled in `generateSingleChunk()` at chunkRunner.ts:203
- Per-chunk validation via `validateEpisodicChunk()` for episode boundaries
- Sequential assembly via linear join

However, episodic_indexed is hardcoded to episode counting (episodeStart/episodeEnd/ChunkPlan.episodeCount). A new strategy `beat_sequential` is needed because:
- Beat chunks use `chunkKey: "B01"` pattern (not `"E01"`)
- Validation checks for screenplay scenes per beat, not episode boundaries
- Context passing is richer than episode continuity (needs canon state)

### B) What changes to `largeRiskRouter.ts`?

**New types and sets:**
- Add `"beat_sequential"` to `ChunkStrategy` type union
- New set `BEAT_SEQUENTIAL_DOC_TYPES = new Set(["feature_script"])`
- `strategyFor()` returns `"beat_sequential"` for these doc types
- `chunkPlanFor()` accepts new optional context: `beats: BeatPlanEntry[]` where `BeatPlanEntry = { beatNumber, title, description, act, structuralPurpose?, estimatedSceneCount? }`
- When `beats` is provided and strategy is beat_sequential: build one chunk per beat
- When `beats` is NOT provided (fallback): fall through to sectioned strategy

### C) How does generate-document dispatch chunked generation and assemble?

**Current flow at generate-document/index.ts:1817-2249:**
1. Line 2021: `const plan = chunkPlanFor(docType, { episodeCount, sceneCount })` — builds chunk plan
2. Line 2047-2060: Background task fires `runChunkedGeneration()` with plan, upstreamContent, systemPrompt
3. Line 2051-2060: `runChunkedGeneration()` in chunkRunner.ts handles individual chunk generation, persistence, and assembly
4. Line 2062-2069: On success, promotes version to `is_current: true` + sets `latest_version_id`

**Assembly** happens inside `runChunkedGeneration()` at chunkRunner.ts:773-803:
- Linear join with optional act header injection (ACT_ASSEMBLY_HEADERS)
- Sectioned uses header injection; episodic uses raw join
- beat_sequential will join chunks sequentially (no header injection needed per beat, but a `## BEAT N: Title` header per chunk is natural)

### D) Can beat analysis happen in a pre-pass or inline?

**Inline is preferred.** No separate LLM pre-pass needed. The chunk prompt includes the beat description from the beat sheet and a token budget of 8000-12000 tokens. The LLM naturally generates 1-3 scenes per beat based on:
- The beat description's density
- The upstream content's scene references
- The token budget instruction

This avoids an extra LLM call per beat (40-70 calls would add significant latency and cost).

### E) What context-passing mechanism exists?

**For episodic_indexed** (chunkRunner.ts:528-532): passes last 500 chars of previous chunk as `previousChunkEnding`. This is genuine narrative continuity — characters, plot state, emotional register.

**For sectioned** (chunkRunner.ts:533-557): passes only structural descriptions (e.g., "Act 2A: Rising Action — Follows Act 1.") — explicitly NOT narrative content. This is correct for standalone acts but WRONG for beat-level generation where continuity matters.

**For beat_sequential**: use the episodic pattern — pass last 500-800 chars of previous chunk's content. Additionally, pass a compact canon state summary as part of `additionalContext`:
- Character emotional states entering this beat
- Active plot threads
- Unresolved dramatic tension
This canon state is derived from the previous chunk's output in the assembly loop.

### F) Does feature_script template need updating?

**Yes.** Currently `getDocTypeTemplate("feature_script", ctx)` falls to `default: return null`. A template is needed that produces per-beat screenplay scenes in proper format:

```
## BEAT [N]: [Beat Title]
**Act:** [1/2A/2B/3]
**Source beat:** [Name from beat sheet]

### SCENE 1 — INT./EXT. LOCATION — DAY/NIGHT
[Action/description — 2-5 lines establishing visual, tone, character entrance]

CHARACTER NAME
(Parenthetical if needed)
Dialogue line that reveals character, advances plot, or deepens tension.

CHARACTER NAME
Dialogue response.

### SCENE 2 — INT./EXT. LOCATION — DAY/NIGHT
[Action — carrying momentum from Scene 1]

[Continue for 1-3 scenes per beat]
```

---

## 3. Architectural Impact Assessment

### Schema Drift

**Risk: LOW.** No new tables needed. All state changes are:
- Additive to existing registries (config arrays)
- Additive to existing interfaces (new strategy type)
- No new database columns

### Data Model Changes

**`ChunkStrategy` type** (largeRiskRouter.ts:13):
```
export type ChunkStrategy = "episodic_indexed" | "sectioned" | "scene_indexed" | "beat_sequential";
```

**`ChunkPlanEntry` interface** (largeRiskRouter.ts:15-26):
```typescript
export interface ChunkPlanEntry {
  chunkIndex: number;
  chunkKey: string;
  label: string;
  episodeStart?: number;
  episodeEnd?: number;
  sectionId?: string;
  // NEW for beat_sequential:
  beatNumber?: number;
  beatTitle?: string;
  beatAct?: string;    // "1" | "2A" | "2B" | "3"
  beatDescription?: string;
}
```

**`BEAT_SEQUENTIAL_DOC_TYPES` set** (new, largeRiskRouter.ts):
```
const BEAT_SEQUENTIAL_DOC_TYPES = new Set(["feature_script"]);
```

**`chunkPlanFor` context** (largeRiskRouter.ts:141-148):
```typescript
context: {
  episodeCount?: number | null;
  sceneCount?: number | null;
  batchSize?: number;
  // NEW:
  beats?: Array<{
    beatNumber: number;
    title: string;
    description: string;
    act: string;
    structuralPurpose?: string;
  }>;
}
```

### Service Contracts

**`largeRiskRouter.ts` — new exports:**
- `isBeatSequentialDocType(docType: string): boolean` — checks if doc type uses beat_sequential

**`chunkRunner.ts` — new validation function:**
- `validateBeatSequentialChunk(content: string, beatNumber: number, docType: string): ValidationResult` — checks:
  1. Content is not empty
  2. Contains at least one proper slugline (INT./EXT. pattern)
  3. No banned summarization language
  4. Minimum word count per scene (~150 words minimum)

**`chunkValidator.ts` — new export:**
- `validateBeatSectionContent(content: string, expectedBeatCount: number): ValidationResult` — validates assembled output has the expected number of beat sections

**`docTypeTemplates.ts` — new template:**
- `case "feature_script"` — returns template scaffold for per-beat screenplay generation

### File List

#### New Files
| File | Purpose |
|------|---------|
| `docs/designs/beat-sequential-strategy.md` | This design document |

#### Modified Files
| File | Change Summary |
|------|---------------|
| `supabase/functions/_shared/largeRiskRouter.ts` | Add `beat_sequential` strategy type, BEAT_SEQUENTIAL_DOC_TYPES set, extend ChunkPlanEntry with beat fields, add beats context to chunkPlanFor, implement beat plan builder |
| `supabase/functions/_shared/chunkRunner.ts` | Add beat_sequential branch in generateSingleChunk (line ~376 else clause), add beat_sequential previousEnding logic (parallel to episodic at line 528), add token budget entry for beat_sequential in maxTokensForChunk, add ACT_ASSEMBLY_HEADERS entries for beat chunk keys |
| `supabase/functions/_shared/chunkValidator.ts` | Add `validateBeatSequentialChunk()` and `validateBeatSequentialContent()` |
| `supabase/functions/_shared/docTypeTemplates.ts` | Add `case "feature_script"` with per-beat screenplay template scaffold |
| `supabase/functions/generate-document/index.ts` | **CRITICAL PRE-REQUISITE FIX:** Add `feature_script: ["beat_sheet", "character_bible", "treatment", "story_outline"]` to UPSTREAM_DEPS (line ~94). **PRE-EXISTING BUG** — feature_script currently loads NO upstream documents. |
| `supabase/functions/generate-document/index.ts` | Add beat sheet data resolution before chunkPlanFor call (line ~2021): query exploded beat chunks from project_document_chunks, pass beats array to chunkPlanFor context |
| `supabase/functions/generate-document/index.ts` | Remove strict mode check that prevents contentFocus for feature_script from working without upstream data |
| `supabase/functions/generate-document/index.ts` | Update contentFocus for feature_script (line 1108) to reference per-beat generation instructions explicitly |

### Schema Drift Assessment

**Risk: LOW** — purely additive changes to config registries and TypeScript types. No database migrations, no new tables, no new columns. The `project_document_chunks` table already supports all beat-level data via `meta_json`.

### Build Order

1. **UPSTREAM_DEPS fix** — Add `feature_script: ["beat_sheet", "character_bible", "treatment", "story_outline"]` to UPSTREAM_DEPS. This is a pre-existing bug that prevents feature_script from receiving any upstream context regardless of chunking strategy.

2. **largeRiskRouter.ts changes** — Add `beat_sequential` strategy, new set, extend interfaces, implement beat plan builder in `chunkPlanFor`.

3. **docTypeTemplates.ts** — Add feature_script template scaffold.

4. **chunkValidator.ts** — Add beat_sequential validation functions.

5. **chunkRunner.ts** — Add beat_sequential branches in:
   - `generateSingleChunk()` (prompt building + LLM call)
   - `maxTokensForChunk()` (token budget)
   - PreviousEnding logic (use episodic pattern, not sectioned)
   - Assembly (ACT_ASSEMBLY_HEADERS for beat chunks)

6. **generate-document/index.ts** — Add beat sheet data resolution before chunk plan, pass beats to chunkPlanFor, update contentFocus for feature_script.

7. **Validation** — Verify sectioned strategy still works as fallback when no beat sheet exists.

---

## 4. Detailed Design

### 4.1 Beat Sheet Data Resolution

Before calling `chunkPlanFor("feature_script", ...)` in generate-document/index.ts (line 2021), resolve beat sheet data:

```typescript
// Resolve beat sheet beats for beat_sequential strategy
let beatsArray: BeatPlanEntry[] | undefined;

if (docType === "feature_script") {
  try {
    // Find authoritative beat sheet document
    const { data: bsDoc } = await supabase
      .from("project_documents")
      .select("id")
      .eq("project_id", projectId)
      .eq("doc_type", "beat_sheet")
      .maybeSingle();

    if (bsDoc) {
      // Find authoritative version
      const { data: bsVer } = await supabase
        .from("project_document_versions")
        .select("id")
        .eq("document_id", bsDoc.id)
        .eq("approval_status", "approved")
        .eq("is_current", true)
        .maybeSingle();

      if (bsVer) {
        // Get exploded beat chunks
        const { data: beats } = await supabase
          .from("project_document_chunks")
          .select("chunk_key, content, meta_json, chunk_index")
          .eq("document_id", bsDoc.id)
          .eq("version_id", bsVer.id)
          .contains("meta_json", { is_beat: true })
          .order("chunk_index", { ascending: true });

        if (beats && beats.length > 0) {
          beatsArray = beats.map(b => ({
            beatNumber: b.meta_json?.beat_number || (parseInt(b.chunk_key.replace("beat_", "")) || 1),
            title: b.meta_json?.label || "",
            description: b.content?.slice(0, 500) || "",  // Truncate to avoid blowing context
            act: "",  // Inferred from position or meta_json
          }));
        }
      }
    }
  } catch (err) {
    console.warn("[generate-document] Beat sheet resolution failed — falling back to sectioned", err?.message);
  }
}
```

### 4.2 Beat Plan Builder (in chunkPlanFor)

When `context.beats` is provided and strategy is beat_sequential:

```typescript
if (strategy === "beat_sequential") {
  const beats = context.beats;
  if (!beats || beats.length === 0) {
    // Fall back to sectioned — no beat data available
    console.warn(`[largeRiskRouter] beat_sequential requested for "${docType}" but no beats provided — falling back to sectioned`);
    // ... sectioned fallback logic ...
  }

  const chunks: ChunkPlanEntry[] = beats.map((beat, i) => ({
    chunkIndex: i,
    chunkKey: `B${String(beat.beatNumber).padStart(2, "0")}`,
    label: `Beat ${beat.beatNumber}: ${beat.title}`,
    beatNumber: beat.beatNumber,
    beatTitle: beat.title,
    beatAct: beat.act,
    beatDescription: beat.description,
  }));

  return { strategy, chunks, totalChunks: chunks.length, docType, episodeCount: undefined };
}
```

### 4.3 Per-Beat Generation Prompt

In `generateSingleChunk()`, new branch for beat_sequential:

```typescript
if (plan.strategy === "beat_sequential") {
  const beat = chunk;
  chunkPrompt = `You are generating BEAT ${beat.beatNumber}: "${beat.beatTitle}" for the screenplay "${projectTitle}".

This beat generates 1-3 screenplay-formatted scenes. Each scene must be in standard screenplay format:

## SCENE 1 — INT./EXT. LOCATION — DAY/NIGHT
[Action — 2-5 lines establishing visual, character, and dramatic context]

CHARACTER NAME
(Parenthetical if needed)
Dialogue that reveals character, advances plot, or deepens tension.

[Continue for 1-3 scenes]

BEAT DESCRIPTION:
${beat.beatDescription || "(from beat sheet)"}

${beat.beatAct ? `ACT: ${beat.beatAct}` : ""}

CRITICAL RULES:
- Generate ONLY the scenes for this beat. Do NOT generate scenes from other beats.
- Write FULL scenes with sluglines, action, and dialogue — DO NOT summarize.
- Every scene must have a clear dramatic function tied to this beat's purpose.
- Use ONLY characters, locations, and story facts from the upstream documents.
- Do NOT invent new story facts, characters, or plot events.
- Each scene should be 150-400 words minimum.
- End the beat's last scene on a dramatic note that flows naturally into the next beat.

${additionalContext ? `CREATIVE DIRECTION:
${additionalContext}
` : ""}
${previousChunkEnding ? `PREVIOUS BEAT ENDING (for continuity):
...${previousChunkEnding}
` : ""}
UPSTREAM CONTEXT:
${upstreamContent}

Generate Beat ${beat.beatNumber} now — full screenplay scenes only.`;
}
```

### 4.4 Token Budget

In `maxTokensForChunk()`:
```typescript
if (strategy === "beat_sequential") return 12000;  // 1-3 scenes × ~4000 tokens each
```

### 4.5 Context Passing (Previous Ending)

Following the episodic pattern (not sectioned):
```typescript
if (plan.strategy === "beat_sequential") {
  previousEnding = chunk.chunkIndex > 0
    ? chunkContents[chunk.chunkIndex - 1].slice(-800)
    : undefined;
}
```

### 4.6 Validation

Per-chunk validation in the generation loop (parallel to sectioned check at line 599):
```typescript
if (plan.strategy === "beat_sequential") {
  const beatValidation = validateBeatSequentialChunk(content, chunk.beatNumber!, docType);
  chunkPassed = beatValidation.pass;
  if (!chunkPassed && attempt < maxChunkRepairs) {
    systemPrompt += "

CRITICAL RETRY: Your previous output was not valid screenplay format. Ensure EVERY scene has: INT./EXT. slugline, action paragraph(s), character cues with dialogue. No prose summaries.";
    continue;
  }
}
```

Assembly validation (parallel to sectioned check at line 811):
```typescript
if (plan.strategy === "beat_sequential") {
  validationResult = validateBeatSectionContent(assembledContent, plan.totalChunks);
}
```

### 4.7 Assembly

Linear join, no header injection needed (each chunk starts with `## BEAT N:` naturally):

```typescript
// For beat_sequential: chunks already contain their own beat headers
if (plan.strategy === "beat_sequential") {
  const parts = chunkContents.filter(c => c);
  assembledContent = parts.join("

---

");
}
```

### 4.8 Template

In `docTypeTemplates.ts`:

```typescript
case "feature_script":
case "screenplay_draft":
  return `# ${title}

A feature film screenplay generated from beat sheet structure.

## LOGLINE
[IMPORT from concept_brief.logline — copy exactly]

## CHARACTERS
[Evolve from character_bible — key characters with brief descriptions]

## SCREENPLAY

[Each beat generates 1-3 scenes in standard screenplay format. Beats appear in numbered sequence.]

---

### BEAT [N]: [Beat Title]
**Act:** [1/2A/2B/3]
**Source:** [Story outline scene reference]

#### SCENE [N] — INT./EXT. LOCATION — DAY/NIGHT
[Action paragraph — sets the visual, establishes character entrance, defines tone and tension]

[CHARACTER NAME]
(Parenthetical — optional, for subtext/delivery guidance)
[Dialogue that pushes the scene's dramatic function forward]

[CHARACTER NAME]
[Response dialogue — with subtext, character voice, and escalating tension]

---

[Continue for remaining beats...]

## END`;
```

### 4.9 Fallback Behavior

If beat sheet data is unavailable (first generation, failed generation, missing):
- `chunkPlanFor()` with no `beats` context → falls back to `sectioned` strategy
- This preserves backward compatibility with existing feature_script generation
- Existing versions are not affected — only NEW generations use beat_sequential

---

## 5. Coexistence with Existing sectioned Strategy

| Scenario | Strategy Used | Notes |
|----------|--------------|-------|
| First feature_script generation, beat sheet exists | `beat_sequential` | Beats resolved from DB |
| First feature_script generation, no beat sheet | `sectioned` (fallback) | Works as before |
| Regenerating feature_script | `beat_sequential` | Uses current beat sheet beats |
| Retry failed chunk (resumeVersionId) | Same as original | Plan already persisted in DB |
| Frontend "Retry section" button | `sectioned` for backward compat | Existing behavior unchanged |

---

## 6. Edge Cases

### Crash at Beat N → Resume from Beat N
Already handled by existing chunk persistence (commit 9490e0f). `resumeChunkedGeneration()` at chunkRunner.ts:1032 skips done chunks and regenerates missing/failed ones. No changes needed.

### Beat Sheet Changes Mid-Generation
If the beat sheet is regenerated between chunk plan creation and background task execution: the chunk plan reflects the beats at time of generation request. This is correct — the plan is an atomic snapshot. A stale plan is acceptable because feature_script refers to a specific version of the beat sheet.

### Single-Beat Feature Script
If a beat sheet somehow produces only 1 beat, the plan has 1 chunk. This is handled naturally by the chunk runner loop — it's the same as a 70-chunk plan.

### Very Long Beats (3+ scenes)
Token budget of 12000 tokens per chunk handles up to ~3 full screenplay scenes. If the LLM needs more, `maxChunkRepairs` allows regeneration. The `maxTokensForChunk` budget can be increased per beat in future.

### Feature Script Without Beat Sheet (Direct Generation)
If the ladder skips beat_sheet (e.g., "short" format: idea → concept_brief → feature_script), the beat sheet DB query returns no results → `beatsArray` stays undefined → `chunkPlanFor` falls back to sectioned. Safe path.

---

## 7. Frontend Considerations

### Progress Display
Current behavior: shows "Act 1/4", "Act 2/4", "Act 3/4", "Act 4/4" via `chunk_plan.total_chunks` in the response.

For beat_sequential with 40-70 chunks: the frontend already polls `project_document_chunks` via the version polling mechanism. The existing `BgGenBanner` component reads `chunk_plan.total_chunks` and `chunks_completed` from the version's `meta_json`. No frontend changes needed — the numbers update naturally.

However, displaying "Beat 47 of 65" would be confusing without context. The chunk labels already include "Beat N: Title" via the `label` field.

### Upload/Retry Buttons
The existing section-level retry button (resumeVersionId path) works identically for beat_sequential:
- If a chunk failed at beat 31, the retry regenerates only beat 31
- The frontend reads `chunk_plan.total_chunks` and `chunk_plan.strategy` from the response

---

## 8. Validation Criteria

### Must Pass
1. Beat with 1 scene → produces exactly 1 screenplay-formatted scene (slugline + action + dialogue)
2. Beat with 3 scenes → produces exactly 3 connected scenes
3. Scene N+1 does not contradict scene N's established facts (continuity enforced by previousEnding)
4. Character voice is consistent across all beats (upstream character bible context)
5. Dramatic escalation is perceptible: each beat raises stakes from previous
6. Crash at beat 31 → resume from beat 31 (not 0)
7. No regression: existing `sectioned` strategy path still works for existing feature_script versions

### Must Block
- Empty chunk content
- Chunk with only prose (no sluglines) for feature_script
- Chunk with banned summarization language ("this scene shows", "in this beat", etc.)
- Assembly with fewer chunks than expected beats

---

## 9. UNCERTAINTIES (resolved or remaining)

- **RESOLVED: Can we reuse sectioned previousEnding logic?** No — sectioned is intentionally stateless (act independence). beat_sequential needs stateful episodic-style continuity.
- **RESOLVED: Does feature_script need upstream deps?** YES — this is a pre-existing bug. UPSTREAM_DEPS missing for feature_script. Fixed as prerequisite.
- **RESOLVED: Beat pre-pass or inline?** Inline. Token budgets handle variable scene count per beat.
- **RESOLVED: Replace or coexist with sectioned?** Coexist — beat_sequential is primary, sectioned is fallback.
- **RESOLVED: Template needed?** Yes — feature_script currently has no template (returns null).
- **UNRESOLVED: Frontend progress granularity** — 40-70 chunks show as "Beat N of M" automatically, but the frontend's polling/refresh rate for chunk status may need tuning for 70 sequential LLM calls.

---

## 10. Dependencies

| Dependency | Status | Notes |
|-----------|--------|-------|
| Chunk persistence (commit 9490e0f) | ✅ Ready | Existing, proven |
| Beat sheet explosion to per-beat chunks | ✅ Ready | `explodeBeatSheetChunks()` in chunkRunner.ts:1196 |
| project_document_chunks table schema | ✅ Ready | Supports meta_json with is_beat, beat_number, label |
| UPSTREAM_DEPS for feature_script | 🔴 MISSING | Pre-existing bug — must add |
| feature_script template in docTypeTemplates.ts | 🔴 MISSING | Currently null (default) |
| beat_sequential strategy handler | 🔴 MISSING | This design |
