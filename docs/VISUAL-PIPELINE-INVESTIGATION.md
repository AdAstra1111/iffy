# Visual Development Engine — Full Pipeline Audit

**Date:** 2026-05-27  
**Investigator:** Architect (Agent 3)  
**Scope:** Complete inventory of all visual/frontend-related systems in IFFY  
**Purpose:** Pre-work audit before Visual Development Engine development begins (2-3 days)

---

## A. COMPLETE INVENTORY

### A1. Visual Edge Functions (24 functions)

| # | Function | Path | Lines | Purpose | Deployed? |
|---|----------|------|-------|---------|-----------|
| 1 | `auto-populate-visual-set` | `supabase/functions/auto-populate-visual-set/` | 391 | Orchestrates batch image gen for all unfilled visual slots. Phases: Character Identity → Character References → World/Locations → Visual Language + Key Moments. Calls `generate-lookbook-image`. Never auto-approves. | ✅ |
| 2 | `visual-unit-engine` | `supabase/functions/visual-unit-engine/` | 583 | Canonical Visual Unit pipeline. Handlers: `select_sources`, `run_extraction`, `list_candidates`, `get_candidate`, `get_events`, `get_unit`, `diff_candidates`. Sources from `project_active_docs` by type priority. | ✅ |
| 3 | `generate-lookbook-image` | `supabase/functions/generate-lookbook-image/` | 2026 | Lookbook image generation. Full style policy enforcement, visual style authority, prestige style system, quality gates. Provider: OpenRouter → Gemini. | ✅ |
| 4 | `generate-hero-frames` | `supabase/functions/generate-hero-frames/` | 1410 | Hero frame generation. Reads `character_visual_dna`, `project_ai_cast`, `canon_locations`, `location_visual_datasets`. Photoreal enforcement. Chunked generation. | ✅ |
| 5 | `storyboard-engine` | `supabase/functions/storyboard-engine/` | 703 | Storyboard pipeline: reads `visual_units`, creates panel plans via LLM, generates frames via Gemini (`google/gemini-2.5-flash-image`). Has cinematic quality enforcement, repair instructions. | ✅ |
| 6 | `generate-framing` | `supabase/functions/generate-framing/` | 299 | AI Creative Framing Engine. Generates 4-6 framing strategies per project + content type. Uses project canon for world-lock. | ✅ |
| 7 | `generate-shot-list` | `supabase/functions/generate-shot-list/` | 458 | Parses script into scenes → generates shot breakdowns. Actions: `generate`, `regenerate`. Uses 10 shot types (WS, MS, CU, ECU, OTS, POV, INSERT, 2SHOT, AERIAL, TRACKING). | ✅ |
| 8 | `generate-poster` | `supabase/functions/generate-poster/` | 1612 | Poster image generation with style enforcement. | ✅ |
| 9 | `generate-scene-demo` | `supabase/functions/generate-scene-demo/` | 304 | Scene demo generation. | ✅ |
| 10 | `extract-visual-dna` | `supabase/functions/extract-visual-dna/` | 359 | Evidence-driven Character Visual DNA extraction. Extracts structured traits + binding marker candidates with confidence/provenance. | ✅ |
| 11 | `storyboard-export` | `supabase/functions/storyboard-export/` | 376 | Storyboard PDF/contact sheet export. Downloads frames from `storyboards` storage bucket, builds PDF, uploads to `exports` bucket. | ✅ |
| 12 | `storyboard-render-queue` | `supabase/functions/storyboard-render-queue/` | 384 | Storyboard render job queue management. | ✅ |
| 13 | `render-animatic` | `supabase/functions/render-animatic/` | 182 | Animatic rendering from storyboard frames. | ✅ |
| 14 | `shot-plan-jobs` | `supabase/functions/shot-plan-jobs/` | 544 | Shot plan job tracking and management. | ✅ |
| 15 | `animatic-manager` | `supabase/functions/animatic-manager/` | 233 | Animatic management operations. | ✅ |
| 16 | `costume-atomiser` | `supabase/functions/costume-atomiser/` | 544 | Costume atomisation from narrative sources. | ✅ |
| 17 | `evaluate-visual-similarity` | `supabase/functions/evaluate-visual-similarity/` | 190 | Image similarity evaluation. | ⚠️ |
| 18 | `export-lookbook-pdf` | `supabase/functions/export-lookbook-pdf/` | 693 | Lookbook PDF export. | ✅ |
| 19 | `create-rough-cut` | `supabase/functions/create-rough-cut/` | 149 | Rough cut video creation. | ✅ |
| 20 | `create-video-render-job` | `supabase/functions/create-video-render-job/` | 125 | Video render job creation. | ✅ |
| 21 | `process-video-render-job` | `supabase/functions/process-video-render-job/` | 454 | Video render job processing. | ✅ |
| 22 | `comps-engine` | `supabase/functions/comps-engine/` | 1023 | Comparison images engine. | ✅ |
| 23 | `comps-style-fingerprint` | `supabase/functions/comps-style-fingerprint/` | 247 | Visual style fingerprinting. | ✅ |
| 24 | `generate-casting-candidates` | `supabase/functions/generate-casting-candidates/` | 980 | Casting candidate image generation. | ✅ |

### A2. Trailer Edge Functions (9 supplementary)

| # | Function | Path | Lines | Purpose |
|---|----------|------|-------|---------|
| 1 | `ai-trailer-factory` | `supabase/functions/ai-trailer-factory/` | 723 | Orchestrator for the trailer pipeline |
| 2 | `trailer-assembler` | `supabase/functions/trailer-assembler/` | 1466 | Assembler: sequences clips into trailer cut |
| 3 | `trailer-audio-engine` | `supabase/functions/trailer-audio-engine/` | 1666 | Audio track generation |
| 4 | `trailer-blueprint-engine` | `supabase/functions/trailer-blueprint-engine/` | 391 | Trailer structural blueprint |
| 5 | `trailer-cinematic-engine` | `supabase/functions/trailer-cinematic-engine/` | 3756 | Cinematic evaluation of trailer clips |
| 6 | `trailer-clip-generator` | `supabase/functions/trailer-clip-generator/` | 2122 | Clip generation from storyboard/visual units |
| 7 | `trailer-continuity-engine` | `supabase/functions/trailer-continuity-engine/` | 759 | Continuity across trailer clips |
| 8 | `trailer-studio-finish` | `supabase/functions/trailer-studio-finish/` | 378 | Final studio-finish assembly |
| 9 | `create-rough-cut` | `supabase/functions/create-rough-cut/` | 149 | Rough cut assembly utility |

### A3. Database Tables — Visual Content (51 tables)

#### Visual Units Pipeline
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `visual_units` | Canonical visual unit store | `unit_key`, `canonical_payload`, `source_versions`, `locked`, `stale` |
| `visual_unit_runs` | Visual unit run tracking | `status`, `error`, `project_id` |
| `visual_unit_candidates` | Generated unit candidates | `project_id`, `unit_key`, `payload`, `confidence` |
| `visual_unit_events` | Event log for visual unit pipeline | `run_id`, `event_type`, `payload` |
| `visual_unit_diffs` | Diff records between candidates | `candidate_a_id`, `candidate_b_id`, `diff_payload` |

#### Storyboard Pipeline
| Table | Purpose |
|-------|---------|
| `storyboard_runs` | Storyboard run tracking |
| `storyboard_panels` | Generated storyboard panels (with storage_path, status) |
| `storyboard_pipeline_frames` | Pipeline frame output |
| `storyboard_exports` | Storyboard export records |
| `storyboard_render_jobs` | Render job queue |
| `storyboard_render_runs` | Render run tracking |

#### Shot Planning
| Table | Purpose |
|-------|---------|
| `shot_plan_jobs` | Shot plan job tracking |
| `shot_plan_job_scenes` | Shot plan scenes per job |
| `shot_lists` | Generated shot lists |
| `shot_list_items` | Individual shot list items |
| `scene_shots` | Scene-to-shot mapping |

#### Image Assets
| Table | Purpose |
|-------|---------|
| `project_images` | Stored project images (subject, shot_type, storage_path, storage_bucket, approval_status) |
| `project_posters` | Poster images (storage_bucket = 'project-posters') |
| `scene_demo_images` | Scene demo images |
| `scene_demo_runs` | Scene demo run records |
| `ai_actor_assets` | AI actor visual assets |

#### Visual Canon & Style
| Table | Purpose |
|-------|---------|
| `project_visual_language` | Visual style/language profile (style_profile_json) |
| `project_visual_style` | Visual style configuration |
| `visual_sets` | Visual set definitions (asset_group, families) |
| `visual_set_slots` | Visual set slots (slot_type, subject, shot_type) |
| `character_visual_dna` | Character visual DNA (traits, markers) |
| `location_visual_datasets` | Location visual reference datasets |
| `entity_visual_states` | Entity visual state variants |
| `creative_framing_strategies` | Framing strategy records |
| `visual_dependency_links` | Visual dependency links |

#### Scene Index
| Table | Purpose |
|-------|---------|
| `scene_index` | Scene index for visual pipeline |
| `scene_graph_scenes` | Scene graph scenes |
| `scene_graph_versions` | Scene graph versions |
| `scene_graph_order` | Scene graph ordering |

#### Character/DNA Tables
| Table | Purpose |
|-------|---------|
| `character_visual_dna` | Character visual DNA |
| `character_identity_notes` | Character identity notes |
| `ai_actors` | AI actor records |
| `project_ai_cast` | Project AI casting |

#### Canon/Location
| Table | Purpose |
|-------|---------|
| `canon_locations` | Location canon for visual generation |
| `project_canon` | Project canon (source for visual) |

### A4. Database Tables — Trailer Pipeline (39 tables)

Trailer tables prefixed with `trailer_`:

`trailers`, `trailer_blueprints`, `trailer_moments`, `trailer_script_beats`, `trailer_script_runs`,
`trailer_shotlists`, `trailer_shot_specs`, `trailer_shot_design_runs`, `trailer_rhythm_runs`,
`trailer_clips`, `trailer_clip_jobs`, `trailer_clip_runs`, `trailer_clip_attempts`, `trailer_clip_events`,
`trailer_clip_scores`, `trailer_continuity_runs`, `trailer_continuity_events`, `trailer_continuity_scores`,
`trailer_cuts`, `trailer_cut_events`, `trailer_render_jobs`, `trailer_render_variants`,
`trailer_judge_v2_runs`, `trailer_learning_signals`, `trailer_look_bibles`, `trailer_finishing_profiles`,
`trailer_definition_packs`, `trailer_definition_pack_items`,
`trailer_audio_assets`, `trailer_audio_jobs`, `trailer_audio_runs`, `trailer_audio_events`,
`ai_generated_media`

### A5. Supabase Storage Buckets

| Bucket | Access | Used By |
|--------|--------|---------|
| `storyboards` | Public | storyboard-engine, storyboard-export, storyboard-render-queue |
| `project-images` | Public | project_images table, generate-hero-frames, generate-lookbook-image |
| `project-posters` | Private | generate-poster, generate-hero-frames, generate-lookbook-image |
| `ai-media` | Private | Trailer pipeline |
| `exports` | Private | storyboard-export, export-lookbook-pdf |
| `scene-demos` | Private | generate-scene-demo |
| `scripts` | Private | General |

### A6. API Proxy Routes (Vercel)

The following visual functions have dedicated Vercel proxy handlers in `api/supabase-proxy/functions/v1/`:

```
visual-unit-engine.ts
storyboard-engine.ts
storyboard-export.ts
storyboard-render-queue.ts
animatic-manager.ts
costume-atomiser.ts
shot-plan-jobs.ts
ai-trailer-factory.ts
trailer-audio-engine.ts
trailer-cinematic-engine.ts
trailer-clip-generator.ts
trailer-continuity-engine.ts
trailer-studio-finish.ts
```

**Missing dedicated proxy handlers** (use catch-all `[...path].ts`):
- `generate-lookbook-image`
- `generate-hero-frames`
- `generate-shot-list`
- `generate-poster`
- `generate-scene-demo`
- `generate-framing`
- `extract-visual-dna`
- `auto-populate-visual-set`
- `render-animatic`
- `evaluate-visual-similarity`
- `export-lookbook-pdf`
- `comps-engine`
- `comps-style-fingerprint`
- `generate-casting-candidates`

### A7. Frontend Routes — Visual Pages (13 routes)

| Route | Page Component | UI Location | Notes |
|-------|---------------|-------------|-------|
| `/projects/:id/visual-dev` | VisualDevHub | Sidebar → "Visual Dev" (produce mode only) | Hub page with links to all visual features |
| `/projects/:id/visual-production` | VisualProductionPipeline | ProjectShell → "Visual Production" | Unified production workspace (new) |
| `/projects/:id/visual-units` | VisualUnits | From VisualDevHub card | Visual unit review page |
| `/projects/:id/visual-references` | VisualReferencesPage | Direct route | Reference image sets |
| `/projects/:id/storyboards` | StoryboardsPage | From VisualDevHub card | Storyboard viewer |
| `/projects/:id/storyboard-pipeline` | StoryboardPipeline | From VisualDevHub card | Full pipeline UI |
| `/projects/:id/shot-list` | ShotListPage | From VisualDevHub card | Shot list viewer |
| `/projects/:id/poster` | PosterEngine | Sidebar → "Poster" (all modes) | Poster engine UI |
| `/projects/:id/lookbook` | LookBookPage | Sidebar → "Look Book" (all modes) | Lookbook page |
| `/projects/:id/images` | ProjectImageLibrary | Direct route | Image library |
| `/projects/:id/production-design` | ProductionDesign | ProjectShell | Production design workspace |
| `/projects/:id/trailer` | TrailerHub | Sidebar → "Trailer" (produce mode) | In ProjectShell |
| `/projects/:id/ai-content` | AIContentPage | Sidebar → "AI Content" (produce mode) | In ProjectShell |

---

## B. ARCHITECTURE MAP

### B1. Component Tree — Visual Frontend (56+ components)

```
src/components/
├── visual/                          # Core visual panels (12 components)
│   ├── CharacterWardrobePanel.tsx        (11.6K)
│   ├── ConceptBriefPanel.tsx             (7.7K)
│   ├── CostumeOnActorPanel.tsx           (84.4K)  — largest visual component
│   ├── HeroFrameDetailViewer.tsx         (20K)
│   ├── PosterPanel.tsx                   (6.7K)
│   ├── SceneDemoGeneratorPanel.tsx       (15.3K)
│   ├── SceneDemoPlannerPanel.tsx         (8.3K)
│   ├── SceneIndexPanel.tsx               (3.8K)
│   ├── SourceTruthDashboard.tsx          (67.5K)
│   ├── VisualCanonExtractionPanel.tsx    (7.4K)
│   ├── VisualCoherencePanel.tsx          (6.3K)
│   └── VisualImageDetailDrawer.tsx       (24.8K)
│
├── visualUnits/                     # Visual unit components (6 components)
│   ├── VisualUnitCandidateCard.tsx
│   ├── VisualUnitCandidatesList.tsx
│   ├── VisualUnitDiffPanel.tsx
│   ├── VisualUnitHistoryTimeline.tsx
│   ├── VisualUnitRunsList.tsx
│   └── VisualUnitSourcesPanel.tsx
│
├── images/                          # Image management (22 components)  
│   ├── ApprovalGovernanceDialog.tsx
│   ├── ApprovalWorkspace.tsx             (24.9K)
│   ├── CharacterBaseLookPanel.tsx        (56.2K)
│   ├── CharacterVisualDNAPanel.tsx       (30.8K)
│   ├── EntityStateVariantsPanel.tsx
│   ├── IdentityAlignmentPanel.tsx
│   ├── ImageComparisonView.tsx
│   ├── ImageEvaluationBadge.tsx
│   ├── ImageLightbox.tsx
│   ├── ImageSelectorGrid.tsx             (29.8K)
│   ├── LaneComplianceBadge.tsx
│   ├── LookbookRebuildHistoryStrip.tsx
│   ├── LookbookTriggerDiagnosticsStrip.tsx
│   ├── PrestigeStyleSelector.tsx
│   ├── ResetVisualCanonModal.tsx
│   ├── ReviewStudio.tsx                  (25.9K)
│   ├── VisualCanonResetPanel.tsx         (65.4K)
│   ├── VisualChangeStudio.tsx            (20.2K)
│   ├── VisualSetCurationPanel.tsx        (25.1K)
│   ├── VisualStyleAuthorityPanel.tsx
│   └── WorldLocationLookPanel.tsx        (36.2K)
│
├── shots/                           # Shot components (4 components)
│   ├── AiReadinessBadge.tsx
│   ├── AiShotActionPanel.tsx
│   ├── AiShotHeatmapDashboard.tsx       (17.5K)
│   └── GenerateShotListModal.tsx
│
├── lookbook/                        # Lookbook components (8 components)
│   ├── LookBookViewer.tsx
│   ├── LookbookPipelineProgress.tsx
│   ├── LookbookQASummary.tsx
│   ├── LookbookSectionPanel.tsx
│   ├── LookbookSectionShell.tsx
│   ├── SlideRenderer.tsx
│   ├── StyleLockPanel.tsx
│   └── __tests__/lookbookQASummary.test.ts
│
├── poster/                          # Poster components (2 components)
│   ├── PosterCompositor.tsx
│   └── PosterEnginePanel.tsx
│
├── animatic/                        # Animatic component (1 component)
│   └── AnimaticEditor.tsx               (15K)
│
└── visual-decisions/                # Decision badge (1 component)
    └── DecisionBadge.tsx
```

### B2. Frontend Library Modules (126+ .ts files)

| Module | # Files | Purpose |
|--------|---------|---------|
| `src/lib/visual/` | 61 .ts + 63 .test.ts | Visual canon, wardrobe, hero frames, costume pipeline, VPB assembly |
| `src/lib/images/` | 28 .ts + 31 .test.ts | Image evaluation, DNA, similarity, quality gates, lookbook orchestration |
| `src/lib/lookbook/` | 22 .ts + 6 .test.ts | Lookbook pipeline: assembly, election, QA, identity binding |
| `src/lib/storyboard/` | 2 .ts | Storyboard API calls |
| `src/lib/storyboardExport/` | 2 .ts | Storyboard PDF export |
| `src/lib/storyboardRender/` | 2 .ts | Storyboard render |
| `src/lib/animatics/` | 3 .ts | Animatic API calls |
| `src/lib/visualUnits/` | 2 .ts | Visual unit API calls |

### B3. Visual Production Pipeline Stages

```
Source Truth → Visual Canon → Cast → Production Design → Hero Frames → Visual Language → Poster → Concept Brief → Lookbook
     │              │           │            │                │              │            │          │            │
     ▼              ▼           ▼            ▼                ▼              ▼            ▼          ▼            ▼
  Narrative      Visual      Actors &    Sets, motifs,     Anchor        Lighting,     Primary   Creative     Section-
  documents     style/      identity     locations,        cinematic     color,       poster     framing     driven
  & canon       tone        anchoring    atmosphere        stills        composition  design    strategies   pitch deck
```

Each stage is resolved as `not_started | in_progress | ready_for_review | approved | locked | stale | blocked` by `pipelineStatusResolver.ts`.

### B4. Data Flow

```
[Narrative Documents] ──→ extract-visual-dna ──→ character_visual_dna
                    │
                    └──→ generate-document (visual_canon_brief) ──→ project_canon
                    
[Project Canon] ──→ auto-populate-visual-set ──→ generate-lookbook-image ──→ project_images
              │                                                                    │
              ├──→ generate-hero-frames ───────────────────────────────────────────┘
              │         │
              │         └──→ character_visual_dna + project_ai_cast + canon_locations
              │
              ├──→ visual-unit-engine ──→ visual_units ──→ storyboard-engine ──→ storyboard_panels
              │                                                                │
              │                                                                └──→ storyboard-export → PDF
              │                                                                     └──→ render-animatic → video
              │
              ├──→ generate-shot-list ──→ shot_lists
              │
              └──→ generate-framing ──→ creative_framing_strategies
```

**Key architecture insight: Visual pipeline is NOT part of auto-run.** Visual content generation is manually initiated from the UI. The only bridge from the document ladder to visual is the `visual_canon_brief` generated by `generate-document`.

### B5. Navigation Architecture

**Two navigation systems coexist:**

**System 1: Standalone routes** (older, no ProjectShell wrapper)
- `/visual-dev` → VisualDevHub (hub page with links)
- `/visual-units`, `/storyboards`, `/storyboard-pipeline`, `/visual-references`, `/shot-list`

**System 2: ProjectShell routes** (newer, unified workspace)
- `/visual-production` → VisualProductionPipeline
- `/poster` → PosterEngine (in shell)
- `/lookbook` → LookBookPage (in shell)
- `/images` → ProjectImageLibrary (in shell)
- `/production-design` → ProductionDesign (in shell)
- `/trailer` → TrailerHub (in shell)

**ProjectShell sidebar** shows Visual Dev, Trailer, AI Content, Audio Export, Casting, Cast Studio, Poster, Look Book, Produce — mode-filtered (develop vs produce).

---

## C. ISSUES INVENTORY

### C1. Architecture Issues

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| 1 | **Visual Dev is split across two navigation systems** | P1 | Standalone routes (`/visual-dev`, etc.) coexist with ProjectShell routes (`/visual-production`, `/poster`). User sees them in different sidebar contexts. No unified "Visual" section. |
| 2 | **Visual Dev only visible in 'produce' mode** | P1 | The "Visual Dev" sidebar tab only appears when operating mode is 'produce'. If user is in 'develop' mode, they don't see it. Some routes like poster/lookbook are 'all' modes, causing context-switching confusion. |
| 3 | **Image generation pipeline is entirely manual** | P2 | No auto-run style orchestration for visual content. Each visual function (hero frames, lookbook, poster, storyboards) must be triggered individually from UI. |
| 4 | **No document-ladder integration for visual types** | P2 | Visual types (poster, hero_frame, lookbook, visual_project_bible) are NOT part of the document ladder system. No `ladder_invariant`, no `decisionPolicyRegistry`, no `eligibilityRegistry` for visual content. Visual decisions bypass canonical promotion gates. |
| 5 | **generate-lookbook-image is extremely large (2026 lines)** | P2 | Single function that should likely be decomposed (or has duplicate logic across hero frames, poster, lookbook image generation). |
| 6 | **costume-atomiser/create-rough-cut have small surface area** | P3 | Some visual functions are very small (< 200 lines), suggesting incomplete implementation or minimal use. |
| 7 | **Storage bucket policy inconsistency** | P2 | `storyboards` = public, `project-images` = public, `project-posters` = private. No clear policy documentation per bucket. |
| 8 | **No unified image provider selection service** | P2 | `imageGenerationResolver.ts` exists but `generate-framing` has hardcoded OpenRouter URL while others use `resolveGateway()`. Provider selection logic is duplicated. |

### C2. Missing Dedicated Vercel Proxy Handlers

The following visual functions lack dedicated proxy handlers in `api/supabase-proxy/functions/v1/` — they fall through to the catch-all `[...path].ts`:

- `generate-lookbook-image` (2026 lines, heavy — catch-all may not have adequate timeout/safeguards)
- `generate-hero-frames` (1410 lines)
- `generate-shot-list`
- `generate-poster` (1612 lines)
- `generate-scene-demo`
- `generate-framing`
- `extract-visual-dna`
- `auto-populate-visual-set`
- `render-animatic`
- `evaluate-visual-similarity`
- `export-lookbook-pdf`
- `comps-engine`
- `comps-style-fingerprint`
- `generate-casting-candidates`

**Risk:** The catch-all handler may not forward the right environment variables or have correct timeout settings for larger visual functions. Common regression pattern seen with `dev-engine-v2` handler.

### C3. Missing Error/Loading States

| # | Component | Issue | Severity |
|---|-----------|-------|----------|
| 1 | `VisualDevHub` | No loading skeleton for main hubs | P2 |
| 2 | `VisualDevHub` | No error state if project_id is invalid | P2 |
| 3 | `VisualProductionPipeline` (2082 lines) | Massive single component — likely missing error boundaries for lazy-loaded sub-content | P2 |
| 4 | `ShotListPage` | Verifies page exists (579 lines) but not checked for empty script content edge case | P3 |
| 5 | `VisualUnits` | Created `scene_graph_scenes` but no explicit scene content check | P3 |

### C4. No Edge Function Tests

**Zero visual edge function tests exist.** All 24 visual edge functions + 9 trailer functions have no test coverage in `supabase/`. The only visual-related tests are in `src/lib/` (unit tests for library functions).

### C5. Missing Component Tests

Out of 56+ visual components, only **1 component test** exists:
- `src/components/lookbook/__tests__/lookbookQASummary.test.ts`

30 test files exist in `src/lib/` but these test library functions, not React components.

### C6. Trailer Pipeline Complexity

The trailer pipeline is a **9-edge-function pipeline** totaling ~10,950 lines with **39 database tables**. It has its own complete domain model (blueprints → moments → clips → cuts → assembly → audio → finishing). This is essentially a complete subsystem that should be treated as its own audit scope.

---

## D. RECOMMENDED FIX ORDER

### P0: Critical (blocking Visual Development Engine work)

1. **Audit generate-lookbook-image (2026 lines) and generate-hero-frames (1410 lines) for timeout/crash patterns** — these are the most-called visual functions. Test their Vercel proxy behavior with catch-all handler.
2. **Verify storyboards storage bucket public access and RLS policies** — storyboard frames won't render if bucket permissions change during deploy.

### P1: Important (address before active visual dev)

3. **Add dedicated Vercel proxy handlers for large visual functions** — at minimum: `generate-lookbook-image`, `generate-hero-frames`, `generate-poster`. Guard against known `dev-engine-v2` regression pattern.
4. **Document storage bucket policies per bucket** — prevent accidental public/private toggle during deploy.
5. **Add loading/error states to VisualDevHub** — it's the primary navigation hub for all visual features.
6. **Reconcile visual navigation** — decide: keep both standalone + ProjectShell nav systems, or migrate all to ProjectShell? Currently fragmented.

### P2: Nice to Have

7. **Add edge function smoke tests for visual functions** — at minimum test that each function accepts POST and handles auth correctly.
8. **Evaluate possible auto-run integration for visual content** — could visual generation be triggered automatically after certain ladder stages complete (e.g., after screenplay approval → auto-generate hero frames)?
9. **Add error boundaries to VisualProductionPipeline** — it lazily loads 3 pages (CastingPipeline, ProductionDesign, LookBookPage), any of which could silently fail.
10. **Audit create-rough-cut, evaluate-visual-similarity, render-animatic for completeness** — small functions that may be partially implemented.

### P3: Future

11. **Unify image provider selection** — centralize the 3+ different API key/gateway resolution patterns across visual functions.
12. **Add component-level tests for visual React components** — especially the image-heavy panels (ImageSelectorGrid, VisualSetCurationPanel, ReviewStudio).
13. **Complete trailer pipeline documentation** — the 39-table trailer system needs its own architecture audit.

---

## E. KEY ARCHITECTURAL OBSERVATIONS

### E1. Separate Track from Document Ladder
Visual content operates on its own track. It is NOT governed by:
- `ladder-invariant.ts` (stage progression guard)
- `decisionPolicyRegistry.ts` (next stage routing)
- `eligibilityRegistry.ts` (promotion gates)
- `documentLadders.ts` (document type registry)

The only bridge is the `visual_canon_brief` doc type in `generate-document/index.ts` — a narrative-only upstream visual intent document.

### E2. Image Generation Stack
```
OpenRouter Gateway → Gemini models (pro/flash image) → Storage (posters/images/storyboards buckets)
```
- Pro model: `google/gemini-3-pro-image-preview`
- Flash model: `google/gemini-3.1-flash-image-preview`
- Legacy: `google/gemini-2.5-flash-image`
- All via OpenRouter chat completions API

### E3. No Chunked Generation
Unlike dev-engine-v2 (which has `rewrite-chunk`/`rewrite-assemble` chunked pipeline), visual functions generate images in single LLM calls. This means:
- No crash-resumable generation
- No chunk progress reporting in UI
- Single-point-of-failure for large image batches

### E4. CI/GP Scoring Does Not Apply
CI/GP scoring (a core document pipeline concept) does not apply to visual content. Visual content has its own quality assessment system:
- `computeEdgeQualityGate` in `_shared/edgeQualityGate.ts`
- `premiumQualityGate` in `src/lib/images/`
- `visualQualityGate` in `src/lib/images/`
- `prestigeStyleSystem` in `_shared/`

---

## F. FILE MAP

### Visual Edge Functions
All in `supabase/functions/<name>/index.ts`

### Visual Pages
- `src/pages/VisualDevHub.tsx` (329 lines) — hub entry point
- `src/pages/VisualProductionPipeline.tsx` (2082 lines) — unified production workspace
- `src/pages/VisualUnits.tsx` (439 lines)
- `src/pages/VisualReferencesPage.tsx` (328 lines)
- `src/pages/VisualReferencesPage.tsx` (328 lines)
- `src/pages/StoryboardsPage.tsx` (653 lines)
- `src/pages/StoryboardPipeline.tsx` (973 lines)
- `src/pages/ShotListPage.tsx` (579 lines)
- `src/pages/LookBookPage.tsx` (656 lines)
- `src/pages/ProjectImageLibrary.tsx` (373 lines)
- `src/pages/ProductionDesign.tsx`
- `src/components/poster/PosterEnginePanel.tsx`

### Key Hooks
- `src/hooks/useVisualCoherence.ts`
- `src/hooks/useVisualStyleProfile.ts`
- `src/hooks/useVisualCanonCompletion.ts`
- `src/hooks/useVisualTruthFreshness.ts`
- `src/hooks/useVisualDecision.ts`
- `src/hooks/useVisualCanonReset.ts`
- `src/hooks/useVisualProduction.ts`
- `src/hooks/useHeroFrameAutoCuration.ts`
- `src/hooks/useProjectImages.ts`
- `src/hooks/useProjectPosters.ts`
- `src/hooks/useLookbookSectionImages.ts`
- `src/hooks/useProductionDesignOrchestrator.ts`
- `src/hooks/useCharacterVisualDatasets.ts`
- `src/hooks/useLocationVisualDatasets.ts`
- `src/hooks/useCharacterWardrobe.ts`
- `src/hooks/useParallelCostumeGeneration.ts`
- `src/hooks/useAnimatic.ts`
- `src/hooks/useAiTrailerFactory.ts`
- `src/hooks/useSceneDemoPlanner.ts`
- `src/hooks/useGenerateFullShotPlan.ts`
- `src/hooks/useActiveProjectPoster.ts`
- `src/hooks/useImageCuration.ts`
- `src/hooks/useImageEvaluation.ts`
- `src/hooks/useVisualReferences.ts`
- `src/hooks/useProjectAiShotReadiness.ts`

### Shared Utilities
- `supabase/functions/_shared/imageGenerationResolver.ts` — provider/model/config selection
- `supabase/functions/_shared/imageGen.ts` — response extraction, storage upload helpers
- `supabase/functions/_shared/visualStyleAuthority.ts` — visual style profile resolver
- `supabase/functions/_shared/prestigeStyleSystem.ts` — prestige/quality style system
- `supabase/functions/_shared/edgeQualityGate.ts` — quality gate enforcement
- `supabase/functions/_shared/effectiveWardrobeNormalizer.ts` — wardrobe normalization
- `supabase/functions/_shared/cinematic-kernel.ts` — cinematic quality enforcement
- `supabase/functions/_shared/cinematic-adapters.ts` — storyboard panel adaptation
- `supabase/functions/_shared/cinematic-repair.ts` — storyboard repair instructions
- `supabase/functions/_shared/cinematic-score.ts` — cinematic scoring
- `supabase/functions/_shared/cinematic-telemetry.ts` — cinematic telemetry
- `supabase/functions/_shared/cinematic-features.ts` — cinematic features
- `supabase/functions/_shared/productionModality.ts` — production modality (live/animation)
- `supabase/functions/_shared/animationMeta.ts` — animation metadata
- `supabase/functions/_shared/visualProjectBibleEdge.ts` — VPB edge assembly
- `supabase/functions/_shared/styleDeviation.ts` — style deviation analysis
- `supabase/functions/_shared/qualityHistory.ts` — quality history tracking

### Config Files
- `src/config/documentLadders.ts` — references `lookbook`→`deck`, `visual_project_bible`
- `src/config/productionModality.ts` — production modality config
- `src/config/animationMeta.ts` — animation meta config

### Key Library Files
- `src/lib/visual/pipelineStatusResolver.ts` — Visual Production Pipeline stage status resolver
- `src/lib/visual/heroFrameChunkRunner.ts` — Hero frame chunk generation
- `src/lib/visual/visualProjectBibleAssembler.ts` — VPB assembly
- `src/lib/visual/visualCoherenceEngine.ts` — Visual coherence computation
- `src/lib/visual/costumeCommandService.ts` — Costume generation orchestration
- `src/lib/visual/characterWardrobeExtractor.ts` — Wardrobe extraction from canon
- `src/lib/images/visualQualityGate.ts` — Visual quality gate
- `src/lib/images/premiumQualityGate.ts` — Premium image quality filtering
- `src/lib/lookbook/runLookbookPipeline.ts` — Lookbook pipeline orchestrator
- `src/lib/lookbook/lookbookSlotRegistry.ts` — Lookbook slot registration