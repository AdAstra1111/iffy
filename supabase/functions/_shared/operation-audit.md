# Operation-to-Code-Path Audit (2026-05-06)

## 1. Generate Document

**UI Component:** `ActionToolbar.tsx` (Generate button) → `onGenerateDocument` prop
**Page handler:** `ProjectDevelopmentEngine.tsx` → `handleGenerateDocument`
**Edge Function:** `generate-document/index.ts`
**UI Structure:** Background generation (no per-act progress shown for fresh generation)
**Act Count:** Uses `largeRiskRouter.ts` chunk plan:
- `story_outline`: 6 feature sections (setup, inciting_incident, rising_action, midpoint, climax, resolution) — **BUG: should be 4-act for vertical drama**
- `treatment`: 4 acts ✓
- `beat_sheet`: 4 acts ✓
- `character_bible`: 4 sections (protagonists, antagonists, supporting_cast, relationships) ✓
**Known Issues:** story_outline uses feature 6-section structure instead of 4-act

## 2. Promote

**UI Component:** `ActionToolbar.tsx` (Promote button) → `onPromote`
**Page handler:** `ProjectDevelopmentEngine.tsx` → `handlePromote`
**Edge Function:** `dev-engine-v2/index.ts` (action: "convert")
**Act-by-act?** For episode doc types → redirects to `generate-document` chunked pipeline. For sectioned → uses same chunked approach via `largeRiskRouter`.
**Act Count:** Dynamic — uses `chunkPlanFor()` with actual document metadata
**Known Issues:** None currently (well-routed through chunking)

## 3. Apply Notes (NoteResolutionDrawer — individual fix)

**UI Component:** `NoteResolutionDrawer.tsx`
**Page handler:** Direct → calls `supabase.functions.invoke('apply-note-fix', ...)`
**Edge Function:** `apply-note-fix/index.ts`
**UI Structure:** Single-pass LLM rewrite (monolithic — NOT act-by-act)
**Act Count:** 
- `SECTIONED_DOC_TYPES` validation checks for `["act_1", "act_2a", "act_2b", "act_3"]` 
- Uses 32k maxTokens for sectioned docs to try to preserve all acts
- **BUT:** `STORY_OUTLINE_SECTIONS` have 6 feature sections, not 4-act markers
**Known Issues:** 
1. Single-pass rewrite can truncate Act 3 at token limit
2. Validation markers mismatch story_outline actual section headers
3. No act-by-act progress UI shown

## 4. Apply Notes (NotesPanel — bulk rewrite)

**UI Component:** `NotesPanel.tsx` → "Apply Rewrite (with notes)" button
**Page handler:** `ProjectDevelopmentEngine.tsx` → `handleRewriteWithBlockerCheck` → `handleRewrite` → `rewritePipeline.startRewrite()`
**Edge Function:** `dev-engine-v2/index.ts` (actions: rewrite-plan → rewrite-chunk → rewrite-assemble)
**UI Structure:** Act-by-act (sectioned chunk pipeline) — shows Act 1 / Act 2a / Act 2b / Act 3 progress
**Act Count:** Dynamic — splits on `##` section headers, uses ACT_LABEL_MAP for labels
**Known Issues:** Story outline sections are 6 feature-sections, not 4-act. Labels may not match act names.

## 5. Reverse Engineer

**UI Component:** `ReverseEngineerCallout.tsx` / `AddDocumentsUpload.tsx`
**Page handler:** `useReverseEngineer` hook
**Edge Function:** `reverse-engineer-script/index.ts`
**UI Structure:** Background job — shows job status polling, not per-section progress
**Act Count:** N/A — reads source script and generates foundation docs as separate job
**Known Issues:** None

## 6. Extraction

**UI Components:** Multiple extraction UIs (extract-scenes, extract-characters, extract-visual-dna, extract-documents)
**Edge Functions:** `extract-scenes/index.ts`, `extract-characters/index.ts`, `extract-visual-dna/index.ts`, `extract-documents/index.ts`
**UI Structure:** Background job or direct call — shows completion status
**Act Count:** N/A — extraction is a feature, not a generation
**Known Issues:** None

---

## Summary of Issues Found

| Issue | Location | Severity |
|-------|----------|----------|
| Story outline chunk plan uses 6 sections (feature) not 4 acts | `largeRiskRouter.ts` | HIGH |
| Story outline section registry uses 6 headings not 4-act | `deliverableSectionRegistry.ts` | HIGH |
| apply-note-fix validates story_outline against 4-act markers but actual content uses 6 sections | `apply-note-fix/index.ts` | MEDIUM |
| NoteResolutionDrawer single-pass rewrite can lose Act 3 (no chunking) | `apply-note-fix/index.ts` | MEDIUM |
| Hardcoded 3 in act counting (need to search) | TBD | HIGH |

---

## Frontend Migration Plan — Act-by-Act for All Operations

### Problem
The rewrite/apply-notes flow (dev-engine-v2 rewrite-plan → rewrite-chunk → rewrite-assemble) uses a synchronous frontend-driven pipeline that shows a single `ProcessProgressBar`. The generate/promote flow uses an async backend-driven pipeline that shows `SectionedDocProgress` with per-act cards.

### Root Cause
Architectural difference in execution model:
- **Generate/Promote:** Async background. Backend writes chunks/treatment_acts to DB → frontend polls → SectionedDocProgress shows per-act cards.
- **Rewrite/Apply-Notes:** Synchronous. Frontend calls rewrite-chunk x N in a loop → each returns immediately → frontend assembles → final version stored.

### Migration Plan (5 steps)

**Step 1** ✅ *(DONE)* — Fix backend section definitions
- `deliverableSectionRegistry.ts`: story_outline 6→4 act sections
- `largeRiskRouter.ts`: story_outline chunk plan 6→4 act sections
- `dev-engine-v2/index.ts`: act count default 3→4

**Step 2** *(PENDING)* — Convert rewrite-pipeline to write `project_document_chunks` asynchronously
- `dev-engine-v2:rewrite-chunk`: After generating each chunk, also write to `project_document_chunks` table (same schema as bg gen)
- Key: chunk status = "done" on completion, "running" during, "pending" before
- This enables `SectionedDocProgress` to show per-act progress during rewrite

**Step 3** *(PENDING)* — Route rewrite progress UI through SectionedDocProgress
- `ProjectDevelopmentEngine.tsx` line ~2240: Change the non-episodic rewrite branch to show `SectionedDocProgress(versionId, docType, projectId, documentId)` instead of `ProcessProgressBar`
- Condition must track whether a new version is being written

**Step 4** *(PENDING)* — Make apply-note-fix (individual) write through same chunk pipeline
- `apply-note-fix`: Replace monolithic single-pass rewrite with chunked pipeline
- For sectioned doc types, split into 4 chunks → rewrite-plan → rewrite-chunk → assemble
- Add `SECTIONED_DOC_TYPES` routing to use chunk pipeline

**Step 5** *(PENDING)* — Add Act-3 post-generation validation to ALL paths
- After every rewrite operation, verify all expected acts exist in output
- `apply-note-fix` already has `validateSectionsComplete()` — extend to dev-engine-v2 rewrite-assemble
- Add explicit warning if Act 3 content is truncated or missing
