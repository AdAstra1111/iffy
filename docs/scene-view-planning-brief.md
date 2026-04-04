# Planning Brief: Persistent Scene-by-Scene Document View
## For: ChatGPT → Lovable Implementation

---

## OBJECTIVE
Design and prompt Lovable to implement a persistent scene-by-scene document viewer 
that replaces (or augments) the flat text editor after a document is generated.
The scene/chunk cards should remain visible after generation completes — not just 
during the bg_generating progress phase.

---

## CONTEXT: CURRENT STATE

### What exists today
1. **SectionedDocProgress** (`src/components/devengine/SectionedDocProgress.tsx`)
   - Shows chunk/scene cards with status icons (✓ done, ⟳ running, ⚠ failed)
   - Shows content preview per chunk/scene
   - Reads from `project_document_chunks` table (already populated after generation)
   - Currently ONLY shown when `isBgGenerating === true`
   - Once generation completes → collapses to flat `FormattedDocContent` text editor

2. **SceneRewritePanel** (`src/components/devengine/SceneRewritePanel.tsx`)
   - Shows per-scene rewrite status during a notes-driven rewrite operation
   - Only shown when `sceneRewrite.total > 0` (i.e., mid-operation only)
   - Has scene queue, status badges, activity timeline

3. **RewriteExecutionPanel** (`src/components/project/RewriteExecutionPanel.tsx`)
   - Producer-facing selective regeneration UI
   - Shows plan, dry-run, execution, scene diffs
   - Currently **completely unwired** — never rendered

4. **BgGenBanner** (`src/components/devengine/BgGenBanner.tsx`)
   - Wraps SectionedDocProgress (and SeasonScriptProgress for TV)
   - Rendered inside ProjectDevelopmentEngine.tsx at line ~1862

### Rendering condition (ProjectDevelopmentEngine.tsx ~line 1861)
```tsx
{isBgGenerating ? (
  <BgGenBanner versionId={selectedVersionId} ... />
) : (
  <FormattedDocContent text={editableText} editable={true} ... />
)}
```
This is the single gate that controls everything.

### Data availability
- `project_document_chunks` table is ALWAYS populated after chunked generation
- Chunks persist after `bg_generating` flag clears
- Each chunk has: `chunk_index`, `chunk_key`, `status`, `content`, `char_count`, `meta_json`
- So the data is ALWAYS there — it's just not being shown

---

## WHAT SEBASTIAN WANTS
A persistent scene/section view that:
- Shows the document broken into its natural sections/scenes (as cards)
- Remains the default view after generation completes (not just during generation)
- Allows expanding/collapsing individual sections
- Allows seeing content of each section
- Should feel like editing a structured document, not a wall of text
- Must NOT break the existing flat text editor (keep as fallback/alternative)

---

## KEY CONSTRAINTS FOR LOVABLE PROMPT

1. **Do NOT change the chunk writing logic** — only the display/rendering layer
2. **Do NOT touch `bg_generating` flag logic** — that is working correctly
3. **Do NOT modify `SectionedDocProgress` core logic** — only its visibility condition
4. **The flat text editor must remain accessible** — add a toggle (e.g. "Structured" / "Raw" view)
5. **Only show scene-by-scene view for sectioned doc types** — check `largeRiskRouter.ts` 
   for which doc types are "sectioned" or "scene_indexed":
   - Sectioned: `feature_script`, `treatment`, `story_outline`, `beat_sheet`, `character_bible`
   - Scene-indexed: `production_draft`
   - Episodic (different component — SeasonScriptProgress): `episode_script`, `season_master_script` etc.
6. **Only show if chunks exist** — query `project_document_chunks` for the version first
7. **Preserve the `isBgGenerating` progress behaviour** — during generation show progress; after, show persistent view

---

## QUESTIONS FOR CHATGPT TO RESOLVE BEFORE PROMPTING LOVABLE

1. **View toggle UX**: Should "Structured" vs "Raw" be a tab toggle in the document card header? 
   Or should Structured be the default with a "View source" option? 
   What's the cleanest pattern already used in this UI?

2. **Edit capability**: In the structured view, should individual chunks be editable inline? 
   Or read-only with a "Edit in raw mode" escape hatch?
   (Note: editing a chunk would need to write back to `project_document_chunks` AND 
   regenerate the assembled plaintext — this may be out of scope for v1)

3. **Empty state**: What should show if `project_document_chunks` is empty for the version?
   (i.e. document was not generated via chunked pipeline — older versions, manual text etc.)
   → Fall back to flat text editor silently.

4. **SectionedDocProgress vs new component**: Is it better to:
   a) Extend `SectionedDocProgress` to work in "completed" mode (no generation in progress)
   b) Create a new `SectionedDocViewer` that is purely for reading/viewing completed chunks
   (Recommendation: option (b) — keep progress and view concerns separate)

5. **Where to render**: The new viewer should slot in where `FormattedDocContent` currently is,
   but only when chunks exist. The rendering logic in `ProjectDevelopmentEngine.tsx` 
   becomes a 3-way switch: generating → progress view, chunks exist → structured view, 
   no chunks → flat text editor.

---

## SUGGESTED LOVABLE PROMPT STRUCTURE (for ChatGPT to refine)

```
OBJECTIVE:
Add a persistent structured document viewer that shows completed chunk/scene cards 
after generation finishes, replacing the flat text view when chunks are available.

SCOPE — ONLY these files:
- src/pages/ProjectDevelopmentEngine.tsx (rendering condition only)
- src/components/devengine/BgGenBanner.tsx (or new SectionedDocViewer component)
- New file: src/components/devengine/SectionedDocViewer.tsx

DO NOT TOUCH:
- Any edge functions or Supabase functions
- bg_generating flag logic
- Chunk writing/assembly logic
- SectionedDocProgress.tsx (generation progress — keep as is)
- Any database schema

IMPLEMENTATION:
1. Create SectionedDocViewer component that:
   - Queries project_document_chunks for the given versionId
   - Shows each chunk as an expandable card (chunk_key as title, content preview collapsed)
   - Has a "View Raw" toggle button to switch to FormattedDocContent
   - Falls back to FormattedDocContent if no chunks found
   - Is read-only in v1 (no inline editing)

2. Update ProjectDevelopmentEngine.tsx rendering condition:
   Replace the binary isBgGenerating toggle with a 3-way:
   - isBgGenerating → BgGenBanner (progress)
   - !isBgGenerating && chunksExist → SectionedDocViewer
   - !isBgGenerating && !chunksExist → FormattedDocContent (unchanged)

3. chunksExist should be derived from a lightweight query:
   Check if project_document_chunks has any rows for selectedVersionId.
   This query already exists in SectionedDocProgress — reuse the same pattern.

MUST preserve:
- The editable flat text editor (accessible via toggle)
- All existing generation/progress behaviour
- isBgGenerating polling and flag clearing
```

---

## WHAT CHATGPT SHOULD DO WITH THIS

1. Read this brief fully
2. Answer the 5 open questions above with reasoned recommendations
3. Review the actual component files listed (ask Lovable to read them first)
4. Produce a final, precise Lovable prompt that:
   - Is scoped tightly to minimum viable change
   - Specifies exact files to touch and exact files NOT to touch
   - Includes the 3-way rendering logic
   - Specifies fallback behaviour
   - Has a clear Definition of Done
5. Do NOT implement directly — produce the prompt for review first
