# IFFY System Inventory — Canonical Reference

> Generated: 2026-05-21 | Covers: ALL document types, generation paths, UI components, convert/promote flows, rewrite paths
> Source: Codebase investigation of ~/code/iffy/ (src/ + supabase/functions/)

---

## 1. Document Types & Ladders

### 1.1 All Canonical Document Types (30+ types)

| Canonical Key | Label | Purpose Class | Ladder Role |
|---|---|---|---|
| `idea` | Idea / Logline | PREMISE_POSITIONING | Initiating doc — establishes premise |
| `concept_brief` | Concept Brief | PREMISE_POSITIONING | One-pager expanding the idea |
| `market_sheet` | Market Sheet | PACKAGING_COMMERCIAL | Output doc — market positioning |
| `vertical_market_sheet` | Vertical Market Sheet | PACKAGING_COMMERCIAL | Output doc — vertical-only market |
| `treatment` | Treatment | PREMISE_POSITIONING | Structural overview / series bible |
| `story_outline` | Story Outline | DEVELOPMENT_ARCHITECTURE | Plot outline (JSON format) |
| `character_bible` | Character Bible | DEVELOPMENT_ARCHITECTURE | Character profiles & arcs |
| `beat_sheet` | Beat Sheet | DEVELOPMENT_ARCHITECTURE | Scene-by-scene beat structure |
| `episode_beats` | Episode Beats | DEVELOPMENT_ARCHITECTURE | Series episode beat sheets |
| `feature_script` | Feature Script | SCRIPT_EXECUTION | Full screenplay |
| `episode_script` | Episode Script | SCRIPT_EXECUTION | Single episode script |
| `season_script` | Season Script | SCRIPT_EXECUTION | Full-season continuous script |
| `season_master_script` | Season Master Script | SCRIPT_EXECUTION | Compiled season scripts |
| `production_draft` | Production Draft | SCRIPT_EXECUTION | Production-ready draft |
| `deck` | Deck | PACKAGING_COMMERCIAL | Output doc — pitch deck |
| `documentary_outline` | Documentary Outline | SCRIPT_EXECUTION | Documentary structure |
| `format_rules` | Format Rules | PREMISE_POSITIONING | Technical/production constraints |
| `season_arc` | Season Arc | DEVELOPMENT_ARCHITECTURE | Season-level narrative architecture |
| `episode_grid` | Episode Grid | DEVELOPMENT_ARCHITECTURE | Grid of all episodes |
| `vertical_episode_beats` | Vertical Episode Beats | DEVELOPMENT_ARCHITECTURE | VD episode beat sheets |
| `topline_narrative` | Topline Narrative | PREMISE_POSITIONING | Synposis + pillars |
| `visual_project_bible` | Visual Project Bible | (non-scored) | Deterministic assembly — no LLM |
| `visual_canon_brief` | Visual Canon Brief | (non-scored) | Multi-pass LLM synthesis |
| `project_overview` | Project Overview | PACKAGING_COMMERCIAL | Seed pack doc |
| `creative_brief` | Creative Brief | (non-scored) | Seed pack doc |
| `market_positioning` | Market Positioning | PACKAGING_COMMERCIAL | Seed pack doc |
| `canon` | Canon Snapshot | (non-scored) | Seed pack doc |
| `nec` | NEC | (non-scored) | Quality assessment |
| `complete_season_script` | Complete Season Script | (non-scored) | Seed pack doc |
| `scene_graph` | Scene Index | (non-scored) | Derived — deterministic |
| `change_report` | Change Report | (non-scored) | Derived — deterministic |

### 1.2 Per-Format Ladders (Backend: `stage-ladders.ts`)

| Format | Ladder (ordered) |
|---|---|
| **film / feature** | idea → concept_brief → character_bible → treatment → story_outline → beat_sheet → feature_script → production_draft |
| **vertical-drama** | idea → concept_brief → format_rules → character_bible → season_arc → episode_grid → vertical_episode_beats → season_script |
| **tv-series / limited-series / digital-series / anim-series** | idea → concept_brief → character_bible → treatment → story_outline → beat_sheet → episode_beats → episode_script → season_master_script → production_draft |
| **documentary / documentary-series** | idea → concept_brief → documentary_outline |
| **hybrid-documentary** | idea → concept_brief → documentary_outline → treatment |
| **short** | idea → concept_brief → feature_script |
| **animation** | idea → concept_brief → treatment → character_bible → beat_sheet → feature_script |
| **reality** | idea → concept_brief → treatment → beat_sheet → episode_beats → episode_script |
| **unspecified** | idea → concept_brief → character_bible → treatment → story_outline → beat_sheet → feature_script → production_draft |

### 1.3 Output Doc Types (non-ladder, generatable anytime)

| Lane | Output Docs |
|---|---|
| feature_film | market_sheet, deck, trailer_script, visual_project_bible |
| series | market_sheet, deck, visual_project_bible |
| vertical_drama | vertical_market_sheet, visual_project_bible |
| documentary | market_sheet, deck, visual_project_bible |
| animation | market_sheet, deck, visual_project_bible |
| short | deck, visual_project_bible |

### 1.4 Format → Script Type Mapping

| Format | Script Type |
|---|---|
| film / feature / short / animation | feature_script |
| tv-series / limited-series / digital-series / anim-series / reality | episode_script |
| vertical-drama | season_script |
| documentary / documentary-series | feature_script |

---

## 2. Generation Paths Per Doc Type

### 2.1 Generation Mode Resolution (`generationModeResolver.ts`)

Three modes, resolved per doc type:

| Mode | Docs | Behavior |
|---|---|---|
| **deterministic_assembly** | visual_project_bible | No LLM calls. Assembled from structured sources (visual_canon_brief signals, canon_json, wardrobe profiles, canon_locations). |
| **llm_chunked** (episodic) | episode_grid, vertical_episode_beats, episode_beats, episode_script, season_script, season_master_script, season_scripts_bundle | Background chunked generation. Creates placeholder version → fires waitUntil bg task → generates in batches → reassembles. |
| **llm_chunked** (large-risk) | treatment, long_treatment, story_outline, beat_sheet, feature_script, screenplay_draft, concept_brief, production_draft | Same pattern: background chunked, creates placeholder → bg task → assemble. |
| **llm_single_pass** | idea, concept_brief, format_rules, season_arc, character_bible, topline_narrative, visual_canon_brief, market_sheet, deck, documentary_outline, nec, project_overview, creative_brief | Synchronous single LLM call. Returns on completion. |
| **llm_chunked** (episodic character_bible) | character_bible | Special case: per-character background generation (bg_generating=true, per_character=true). Each character generated as its own LLM call. |

### 2.2 Sync vs Background Matrix

| Doc Type | Sync/Async | Backend Function | Strategy |
|---|---|---|---|
| idea | sync | generate-document | single-pass |
| concept_brief | sync | generate-document | single-pass (but sectioned for rewrite) |
| format_rules | sync | generate-document | single-pass |
| season_arc | sync | generate-document | single-pass |
| character_bible | **async** | generate-document | per-character background (sync flag) |
| treatment | **async** | generate-document | sectioned chunked |
| story_outline | **async** | generate-document | sectioned chunked |
| beat_sheet | **async** | generate-document | sectioned chunked |
| episode_grid | **async** | generate-document | episodic_indexed chunked |
| vertical_episode_beats | **async** | generate-document | episodic_indexed chunked (batchSize=1) |
| episode_beats | **async** | generate-document | episodic_indexed chunked |
| feature_script | **async** | generate-document | sectioned chunked |
| episode_script | **async** | generate-document | episodic_indexed chunked |
| season_script | **async** | generate-document | episodic_indexed chunked (batchSize=1) |
| season_master_script | **async** | generate-document | episodic_indexed chunked |
| production_draft | **async** | generate-document | scene_indexed chunked |
| topline_narrative | sync | generate-document | single-pass (bespoke system) |
| visual_canon_brief | sync | generate-document | multi-pass (4 passes + coherence) |
| visual_project_bible | sync | generate-document | deterministic assembly (assembler) |
| market_sheet | sync | generate-document | single-pass |
| deck | sync | generate-document | single-pass |
| documentary_outline | sync | generate-document | single-pass |
| nec | sync | generate-document | single-pass |

### 2.3 Upstream Dependency Map (`UPSTREAM_DEPS` in generate-document/index.ts)

Each doc type depends on specific upstream docs for context:

| Doc Type | Upstream Dependencies |
|---|---|
| concept_brief | idea |
| character_bible | concept_brief |
| treatment | concept_brief + character_bible |
| beat_sheet | character_bible + concept_brief + treatment + story_outline |
| story_outline | concept_brief + character_bible + treatment |
| feature_script | beat_sheet + character_bible + treatment |
| episode_grid | season_arc + character_bible + concept_brief |
| vertical_episode_beats | episode_grid + season_arc + character_bible + format_rules |
| season_script | vertical_episode_beats + character_bible + season_arc + episode_grid + concept_brief + format_rules |
| season_arc | series_overview + character_bible + concept_brief + market_sheet |
| format_rules | concept_brief |
| topline_narrative | idea + concept_brief + market_sheet |
| visual_canon_brief | concept_brief + treatment + story_outline + character_bible + beat_sheet + feature_script |

---

## 3. UI Components Per Doc Type / Transition

### 3.1 BgGenBanner Routing (`BgGenBanner.tsx`)

The central dispatcher during background generation. Routes based on doc type + chunk strategy:

| Doc Type | Routed Component | Strategy Detection |
|---|---|---|
| `character_bible` / `long_character_bible` | `CharacterBibleProgress` | doc type match |
| episodic (season_script, episode_grid, etc.) NOT sectioned | `SeasonScriptProgress` | episodic doc type, not sectioned |
| Any with scene-indexed chunk keys (`^SC\d+-SC\d+$`) | `SceneIndexedProgress` | chunk key pattern match (first 10 chunks) |
| All other sectioned prose | `SectionedDocProgress` | fallback for treatment/beat_sheet/story_outline/production_draft/concept_brief |

### 3.2 Progress Components by Doc Type

| Component | Doc Types Served | What It Shows |
|---|---|---|
| `SeasonScriptProgress` | season_script, episode_grid, vertical_episode_beats | Clickable episode list + reading pane per episode |
| `CharacterBibleProgress` | character_bible, long_character_bible | Per-character progress cards, polls meta_json.characters_completed |
| `SectionedDocProgress` | treatment, story_outline, beat_sheet, concept_brief, feature_script, production_draft | Progressive card viewer, polls project_document_chunks every 8s |
| `SceneIndexedProgress` | production_draft (scene-indexed strategy) | Scene-batch progress view, polls every 6s |
| `ProcessProgressBar` | ALL doc types | Reusable percent/ETA/phase progress bar |
| `AutoRunProgressPanel` | ALL (during auto-run) | Pipeline stage timeline with approval gating |
| `OperationProgress` | ALL (during explicit user actions) | Animated stage progression with DEV_*_STAGES |
| `ChunkProgressPanel` | Large docs | Chunk generation progress with regen button |
| `GenerateSeasonScriptsPanel` | season_script | Per-episode status table, search, regenerate controls |

### 3.3 Banner Components

| Banner | Doc Types / Context | Purpose |
|---|---|---|
| `BgGenBanner` | ALL generating types | Error boundary + dispatch to progress components |
| `AutoRunBanner` | ALL | Auto-run status (play/pause/stop) |
| `StalenessAlertBanner` | ALL | Stalled auto-run job alert |
| `StaleDocBanner` | ALL | Stale doc hash mismatch alert |
| `DriftBanner` | ALL | Canon drift detection |
| `QualificationConflictBanner` | ALL | Episode count conflicts |
| `EpisodeHandoffBanner` | episode_script/season_script | Series Writer handoff |
| `SeedAppliedBanner` | ALL | DevSeed ruleset applied |
| `ConnectivityBanner` | ALL | Stale doc counts, provenance health |

### 3.4 Sectioned Rewrite Panels by Doc Type

| Doc Type | Rewrite Panel | Backend Action | Rewrite Strategy |
|---|---|---|---|
| `beat_sheet` | `BeatRewritePanel` | `action: 'beat-rewrite'` | Per-beat modal rewriting |
| `treatment` / `long_treatment` | `TreatmentRewritePanel` | `action: 'treatment'` | Per-act pipeline with save/assemble |
| `story_outline` (JSON) | `MomentRewritePanel` | `enqueue_rewrite_jobs` w/ targetDocType='story_outline' | Moment-level pipeline |
| `story_outline` (plaintext) | Sectioned viewer + generic rewrite | `rewrite-plan → rewrite-chunk → rewrite-assemble` | Sectioned chunked |
| `feature_script` / `episode_script` / `season_master_script` / `production_draft` | `SceneRewritePanel` | `rewrite_debug_probe → enqueue_rewrite_jobs → assemble` | Scene-level/chunk-mode selectable |
| `character_bible` | Sectioned viewer | `rewrite.mutate()` (single-pass) | Single-pass, fallback to chunked |
| `concept_brief` | Sectioned viewer | `rewrite-plan → rewrite-chunk → rewrite-assemble` | Sectioned chunked |
| Episodic (season_script, episode_grid, VEB) | `EpisodeRewriteWorkspace` | `rewrite-plan (episodic_indexed) → rewrite-chunk → rewrite-assemble` | Episodic indexed (per-episode) |

### 3.5 Other Key Panels

| Panel | Purpose |
|---|---|
| `GenerateSeasonScriptsPanel` | Bulk season script generation per episode |
| `SeriesWriterAutorunPanel` | End-to-end autorun with prerequisites table |
| `DecisionModePanel` | Decision mode selector UI |
| `CriteriaPanel` | Promotion gate criteria editing |
| `PromotionIntelligenceCard` | Promotion readiness scores + recommendation |
| `PipelineNextStepPanel` | Next pipeline step display |
| `ConvergencePanel` | Convergence round management |
| `CanonicalQualificationsPanel` | Canonical qualification editing |
| `OutputDocumentsSection` | Output doc generation (non-ladder) |
| `NotesPanel` | Document review notes |
| `DocumentSidebar` | Document list + version selector |
| `CascadePanel` | Cascade propagation |
| `ChangeReportPanel` | Diff/change report |
| `ProvenancePanel` | Document lineage |

### 3.6 Atom Grid Components (Entity-Level)

| Component | Entity Type |
|---|---|
| `CharacterAtomGrid` | Characters |
| `LocationAtomGrid` | Locations |
| `PropAtomGrid` | Props |
| `CostumeAtomGrid` | Costumes |
| `VehicleAtomGrid` | Vehicles |
| `CreatureAtomGrid` | Creatures |
| `ThemeAtomGrid` | Themes |
| `GenreAtomGrid` | Genres |
| `ToneAtomGrid` | Tones |
| `StructureAtomGrid` | Structures |
| `NarrativebeatAtomGrid` | Narrative beats |
| `SoundtrackAtomGrid` | Soundtrack cues |
| `DialogueAtomGrid` | Dialogue patterns |

---

## 4. Promote/Convert Flow

### 4.1 End-to-End Sequence

```
User clicks "Analyze"
  → handleRunEngine() [PDE.tsx:1030]
    → guard: bg_generating check (content only)
    → runAnalysisWithContext() [PDE.tsx:999]
      → analyze.mutate({ deliverableType, developmentBehavior, format })
        → callEngineV2('analyze', { projectId, documentId, versionId })
          → POST supabase/functions/v1/dev-engine-v2 { action: 'analyze' }
      → on success: generateNotes.mutate(analysisResult)
        → callEngineV2('notes', { ... })
  → useEffect [PDE.tsx:947] fires reactively
    → promotionIntel.computeLocal() 
      → extracts ci, gp, gap, trajectory from promotionGateAnalysis
      → calls computePipelineState() from Pipeline Brain
      → returns recommendation: promote | stabilise | escalate
      → returns next_document

User clicks "Promote"
  → handlePromote() [PDE.tsx:1638]
    → resolves effectiveVersionId (authoritative version)
    → checks drift (blocks if hasUnresolvedMajorDrift)
    → gets target: promotionIntel.data?.next_document (Pipeline Brain)
    → fallback: approved version with CI≥85 / GP≥85 → getNextStage()
    → validates: ladder membership via getLadderForFormat()
    → convert.mutate({ targetOutput, protectItems })

convert.mutate() [useDevEngineV2.ts]
  → resolveVersionId() (selectedVersionId → latest)
  → callEngineV2('convert', { projectId, documentId, versionId, targetOutput, protectItems })
    → POST supabase/functions/v1/dev-engine-v2 { action: 'convert' }

Dev Engine V2 Convert Handler
  → reconciliation gate (checks reconciliation_flags)
  → fetches source version plaintext
  → resolves qualifications
  → loads NEC + constraint pack
  → builds template prompt for target doc type
  → builds assimilation block from preceding stages
  → RESOLVES ROUTE:
    if episode target (episode_grid, VEB, season_script, etc.):
      → REDIRECT to generate-document (chunked pipeline)
    if large-risk doc type (treatment, beat_sheet, etc.):
      → REDIRECT to generate-document (chunked pipeline)
    if screenplay type (feature_script, production_draft):
      → block if single-shot (must use chunked pipeline)
    else:
      → single-shot AI call (small docs: idea, concept_brief, etc.)
  → creates version via ensureDocSlot() + createVer() in doc-os.ts
  → runs CCE drift detection on new version
  → returns { newDoc: { id, doc_type }, newVersion: { id }, convert: { ... } }

Frontend onSuccess:
  → toast("Converted to ...")
  → selectDocument(newDoc.id) — navigates to new doc
  → setSelectedVersionId(newVersion.id)
  → invalidateAll() — refreshes queries
```

### 4.2 Convert Routing (Which Docs Go Where)

When `action: 'convert'` is called on `dev-engine-v2`, the target doc type determines the path:

| Target Doc Type | Route | Reason |
|---|---|---|
| episode_grid | ➡ generate-document | Episodic — chunked by episode |
| vertical_episode_beats | ➡ generate-document | Episodic — chunked by episode |
| episode_beats | ➡ generate-document | Episodic — chunked by episode |
| season_script | ➡ generate-document | Episodic — chunked by episode |
| season_master_script | ➡ generate-document | Episodic — chunked by episode |
| treatment / long_treatment | ➡ generate-document | Large-risk sectioned |
| beat_sheet | ➡ generate-document | Large-risk sectioned |
| story_outline | ➡ generate-document | Large-risk sectioned |
| concept_brief | ➡ generate-document | Large-risk sectioned |
| feature_script | ➡ generate-document | Screenplay (must be chunked) |
| production_draft | ➡ generate-document | Large-risk scene-indexed |
| screenplay_draft | ➡ generate-document | Large-risk sectioned |
| idea | .dev-engine-v2 (single-shot) | Small doc |
| format_rules | .dev-engine-v2 (single-shot) | Small doc |
| season_arc | .dev-engine-v2 (single-shot) | Small doc |
| topline_narrative | .dev-engine-v2 (single-shot) | Small doc |
| documentary_outline | .dev-engine-v2 (single-shot) | Small doc |

### 4.3 Pipeline Stages UI Constants (`OperationProgress.tsx`)

| Constant | Stages |
|---|---|
| `DEV_ANALYZE_STAGES` (4) | Loading (2%) → Reading doc (10%) → Evaluating structure (25%) → Generating analysis (60%-95%) |
| `DEV_NOTES_STAGES` (3) | Loading notes (2%) → Reviewing (10%-65%) → Generating notes (80%-95%) |
| `DEV_REWRITE_STAGES` (5) | Starting (2%) → Preparing rewrite (15%) → Rewriting (35%-70%) → Reviewing (80%) → Saving (92%) |
| `DEV_CONVERT_STAGES` (5) | Reading source doc (5%) → Mapping structure (20%) → Converting format (45%) → Preserving DNA (70%) → Saving (90%) |
| `DEV_GENERATE_STAGES` (8) | Starting (2%) → Loading context (8%) → Building framework (18%) → Generating (32%) → Large doc writing (52%) → Constraints (72%) → Reviewing (86%) → Saving (93%) |

---

## 5. Rewrite Paths

### 5.1 Complete Rewrite Path Matrix

| Doc Type | Sectioned Viewer? | Rewrite Panel | Backend Entry | Strategy |
|---|---|---|---|---|
| `idea` | No | None | dev-engine-v2 (single-pass) | Single-shot |
| `concept_brief` | Yes (SECTIONED_VIEW_TYPES) | None (generic SectionedDocProgress) | Sectioned chunked via rewritePipeline | plan → chunk → assemble |
| `format_rules` | No | None | dev-engine-v2 (single-pass) | Single-shot |
| `character_bible` | Yes (SECTIONED_VIEW_TYPES) | None | rewrite.mutate() (single-pass) | Single-pass; fallback chunked |
| `treatment` | Yes | TreatmentRewritePanel | Per-act via dev-engine-v2 | Per-act pipeline; fallback sectioned chunked |
| `long_treatment` | Yes | TreatmentRewritePanel | Per-act via dev-engine-v2 | Same as treatment |
| `story_outline` (JSON) | Yes | MomentRewritePanel | enqueue_rewrite_jobs w/ story_outline | Moment-level (SceneRewritePipeline with targetDocType) |
| `story_outline` (plaintext) | Yes | None (SectionedDocViewer) | Sectioned chunked via rewritePipeline | plan → chunk → assemble |
| `beat_sheet` | Yes | BeatRewritePanel | action: 'beat-rewrite' on dev-engine-v2 | Per-beat modal rewrite, sequential |
| `feature_script` | Yes | SceneRewritePanel | debug_probe → enqueue → poll → assemble | Scene or Chunk mode |
| `episode_script` | Yes | SceneRewritePanel | Same | Scene or Chunk mode |
| `season_master_script` | Yes | SceneRewritePanel | Same | Scene or Chunk mode |
| `production_draft` | Yes | SceneRewritePanel | Same | Scene or Chunk mode |
| `season_script` | Yes | EpisodeRewriteWorkspace | episodic_indexed chunked rewrite | plan → chunk → assemble (episode-aware) |
| `episode_grid` | Yes | EpisodeRewriteWorkspace | episodic_indexed chunked rewrite | Same |
| `vertical_episode_beats` | Yes | EpisodeRewriteWorkspace | episodic_indexed chunked rewrite | Same |
| `episode_beats` | Yes | EpisodeRewriteWorkspace | episodic_indexed chunked rewrite | Same |

### 5.2 Rewrite Pipeline Strategies (from `useRewritePipeline.ts`)

| Strategy | Detection | UI | Behavior |
|---|---|---|---|
| `episodic_indexed` | Plan returns episodeCount > 0 | EpisodeRewriteWorkspace | Per-episode chunking, progress measured against BOTH affected + preserved |
| `sectioned` | Plan returns section labels | SectionedDocViewer | Act/section-based chunks with section labels |
| `legacy_slugline` | Fallback | Generic progress | Flat chunk-based, no section labels |

### 5.3 Scene Rewrite Modes (from `SceneRewritePanel.tsx`)

| Mode | Trigger | Behavior |
|---|---|---|
| `auto` | Default | Probes document; uses scene mode if scenes detected, chunk mode otherwise |
| `scene` | Force scene-mode | Scene-by-scene rewrite using scene graph |
| `chunk` | Force chunk-mode | Section-based rewrite (fallback for non-scene docs) |

### 5.4 Sectioned Doc Types Registry (from `PDE.tsx`)

```
SECTIONED_VIEW_TYPES = new Set(['feature_script', 'treatment', 'story_outline',
  'beat_sheet', 'production_draft', 'concept_brief', 'character_bible'])

SECTIONED_REWRITE_TYPES = new Set(['treatment', 'long_treatment', 'beat_sheet',
  'story_outline', 'character_bible'])
```

Note: `concept_brief` is in `SECTIONED_VIEW_TYPES` but NOT in `SECTIONED_REWRITE_TYPES`. Concept brief rewrite goes through the generic sectioned chunked pipeline (the `startRewrite()` fallback path).

---

## 6. Key Files Reference

### 6.1 Backend Edge Functions

| File | Purpose | Notes |
|---|---|---|
| `supabase/functions/dev-engine-v2/index.ts` | Main dev engine — analyze, notes, rewrite, convert | ~40K lines — massive |
| `supabase/functions/generate-document/index.ts` | Document generation — all modes | ~2.7K lines |
| `supabase/functions/auto-run/index.ts` | Pipeline orchestrator — self-chaining | ~12K lines |
| `supabase/functions/_shared/chunkRunner.ts` | Chunked generation orchestrator | ~1.3K lines |
| `supabase/functions/_shared/episodeBeatsChunked.ts` | Episodic chunked generation | ~690 lines |
| `supabase/functions/_shared/coreDocs.ts` | Fetches canonical document context | ~255 lines |
| `supabase/functions/_shared/doc-os.ts` | Document operating system (createVersion, ensureDocSlot) | Version creation utility |
| `supabase/functions/_shared/stage-ladders.ts` | Canonical ladder definitions (auto-generated) | Maps format → ladder stages |
| `supabase/functions/_shared/ladder-invariant.ts` | Stage progression guard | Validates next-stage, prevents loops |
| `supabase/functions/_shared/decisionPolicyRegistry.ts` | Decision classification (BLOCKING/DEFERRABLE) | ~360 lines |
| `supabase/functions/_shared/docPurposeRegistry.ts` | Document scoring purpose | CI/GP scoring rubrics per class |
| `supabase/functions/_shared/largeRiskRouter.ts` | Large-risk doc type + strategy resolver | episodic/sectioned/scene_indexed |
| `supabase/functions/_shared/generationModeResolver.ts` | Sync/async mode resolution | deterministic/llm_single_pass/llm_chunked |
| `supabase/functions/_shared/documentLadders.ts` | Backend mirror of frontend documentLadders | Lane-aware normalization |
| `supabase/functions/_shared/pipeline-brain.ts` | (redir) — imports from frontend | Stage sequencing logic |
| `supabase/functions/_shared/narrativeContextResolver.ts` | NEC + signals + decisions + canon context | Used by both generate and dev-engine |
| `supabase/functions/_shared/transitionLedger.ts` | IEL event emission | Logs authoritative_version_resolved, stage_transition, etc. |

### 6.2 Frontend

| File | Purpose |
|---|---|
| `src/pages/ProjectDevelopmentEngine.tsx` | Main dev page — route all doc actions | ~3.6K lines |
| `src/config/documentLadders.ts` | Canonical doc types + lane ladders | Frontend registry |
| `src/lib/pipeline-brain.ts` | Stage sequencing + computePipelineState | ~406 lines |
| `src/lib/dev-os-config.ts` | Deliverable types, behaviors, convergence | Configuration |
| `src/lib/can-promote-to-script.ts` | Script promotion eligibility | Guard logic |
| `src/lib/eligibilityRegistry.ts` | Promotion gate rules | (renamed to master-viability.ts?) |
| `src/lib/stages/registry.ts` | Stage ladder + next-stage helper | Import from config |
| `src/lib/document-dependencies.ts` | Document dependency map (mirrored backend) | UPSTREAM_DEPS frontend |
| `src/hooks/useDevEngineV2.ts` | Engine v2 mutation hooks | analyze, notes, rewrite, convert |
| `src/hooks/useRewritePipeline.ts` | Sectioned rewrite pipeline hook | plan → chunk → assemble |
| `src/hooks/useSceneRewritePipeline.ts` | Scene-level rewrite pipeline hook | probe → enqueue → poll → assemble |
| `src/hooks/usePromotionIntelligence.ts` | Promotion readiness computation | computeLocal, computePipelineState |
| `src/hooks/useScriptPipeline.ts` | Script pipeline hooks | Script-specific orchestration |
| `src/components/devengine/BgGenBanner.tsx` | Error boundary + progress route dispatch | Routes to correct *Progress component |
| `src/components/devengine/BeatRewritePanel.tsx` | Beat-level rewrite UI | ~856 lines |
| `src/components/devengine/TreatmentRewritePanel.tsx` | Per-act treatment rewrite | ~779 lines |
| `src/components/devengine/SceneRewritePanel.tsx` | Scene-level script rewrite | ~480 lines |
| `src/components/devengine/MomentRewritePanel.tsx` | Story outline moment rewrite | ~348 lines (wraps scene pipeline) |
| `src/components/devengine/EpisodeRewriteWorkspace.tsx` | Episodic rewrite workspace | Per-episode browser |
| `src/components/devengine/SectionedDocProgress.tsx` | Sectioned doc generation progress | Polls chunks |
| `src/components/devengine/SeasonScriptProgress.tsx` | Season script episode-level progress | Clickable episode list |
| `src/components/devengine/CharacterBibleProgress.tsx` | Per-character generation progress | Polls character_completed |
| `src/components/devengine/SceneIndexedProgress.tsx` | Scene-batch progress | Polls every 6s |
| `src/components/OperationProgress.tsx` | Stage-based progress + DEV_*_STAGES constants | Animated stage progression |
| `src/components/DeliverablePipeline.tsx` | Pipeline stage status + step cards | Visual stage display |

### 6.3 Configuration / Data

| File | Purpose |
|---|---|
| `src/config/documentLadders.ts` | All doc types, lane ladders, aliases, helpers |
| `supabase/_shared/stage-ladders.json` | Source JSON for stage ladders (auto-generates stage-ladders.ts) |
| `supabase/functions/_shared/stage-ladders.ts` | Generated TypeScript from JSON |

### 6.4 Tests

| File | What It Guards |
|---|---|
| `src/test/ladder-invariant-guard.test.ts` | Stage progression guard invariants |
| `src/test/stage-ladders-canonical.test.ts` | Ladder definitions match canonical |
| `src/test/empty-assembledtext-guard.test.ts` | Empty text pre-routing guard (3 layers) |
| `src/test/concept-brief-sectioned-rewrite.test.ts` | Concept brief sectioned rewrite path |
| `src/test/document-ladders-drift.test.ts` | Frontend/backend ladder drift |
| `.github/workflows/lara-regression-guard.yml` | Regression guard CI workflow |

---

## 7. Architecture Patterns

### 7.1 Self-Chaining Pipeline (Auto-Run)

```
Frontend polls job → POST auto-run { action: "run-next" }
  → PREP_SETUP gate (sync)
  → spawns bgTask (fire-and-forget via waitUntil)
    → bgTask completes → self-chain fetch to /auto-run { action: "run-next" }
      → repeat
```

Critical: `respondWithJob()` returns HTTP response to caller — does NOT invoke run-next itself. Always self-chain with `{ action: "run-next", jobId }` from bgTask.

### 7.2 Authoritative Version Invariant

Every document query:
```
approval_status = 'approved' AND is_current = true
```
`effectiveVersionId = authoritativeVersion.id` (or `selectedVersionId` only when no authoritative exists).

### 7.3 IEL Required Events

- authoritative_version_resolved
- promotion_gate_version_bound
- stage_transition
- ladder_validation_passed
- lane_validation_passed
- Must fail CLOSED on ambiguity

### 7.4 Chunk Runner Assembly Pattern

1. Upsert chunk plan entries in `project_document_chunks` (preserving existing)
2. Generate each chunk via LLM
3. Validate each chunk
4. Assembly repair loop (regen only missing/failed chunks — max 2 passes)
5. Store assembled result in `project_document_versions`
6. Atomic clear: `bg_generating: false` on assembly

### 7.5 Fail-Closed Guards (3 Layers)

| Layer | Location | What It Checks |
|---|---|---|
| 1 | PDE.tsx (pre-routing) | Version plaintext >= 10 chars before sectioned rewrite routing |
| 2 | chunkRunner.ts (assembly) | Failed chunk placeholder check (containsFailedPlaceholders) |
| 3 | PDE.tsx (post-assembly) | assembledText.trim().length >= 10 in onSuccess |

---

## 8. Design Constraints for Future Work

1. **NEVER duplicate existing infra** — check SYSTEM_INVENTORY.md first. All the panels, hooks, pipelines, and generators already exist.
2. **New doc types**: register in ALL of these:
   - `src/config/documentLadders.ts` (BASE_DOC_TYPES + lane ladders)
   - `supabase/_shared/stage-ladders.json` (format-specific ladders)
   - `supabase/functions/_shared/docPurposeRegistry.ts` (purpose class)
   - `supabase/functions/_shared/largeRiskRouter.ts` (if large/episodic)
   - `supabase/functions/generate-document/index.ts` (upstream deps + scope blocks)
   - `src/components/devengine/BgGenBanner.tsx` (if needs progress routing)
   - `supabase/functions/_shared/generationModeResolver.ts` (if deterministic)
3. **Rewrite panels are per-doc-type** — do NOT create a generic rewrite panel that handles multiple doc types. Each has its own UI, backend action, and pipeline.
4. **BgGenBanner is the single router** — all background generation progress routing goes through it. Do NOT add ad-hoc progress displays.
5. **Convert always goes through dev-engine-v2** which redirects to generate-document for large/episodic targets. Do NOT call generate-document directly from the frontend for convert.
6. **Pipeline Brain** (`src/lib/pipeline-brain.ts`) is the sole authority for next-stage determination. Do not hard-code stage sequencing.
7. **Character bible generation** is special: per-character background with `per_character: true` flag. Do not treat it as a normal chunked doc.
8. **Visual Project Bible** is deterministic assembly — NO LLM calls in any phase. Violations are fail-closed.
9. **Story outline** has TWO paths: JSON format uses MomentRewritePanel, plaintext uses sectioned chunked. The `handleRewrite` routing in PDE.tsx checks format at runtime.

---

## Appendix A: All File Paths Referenced

```
# Backend Edge Functions (supabase/functions/)
dev-engine-v2/index.ts
generate-document/index.ts
auto-run/index.ts

# Shared Backend Utilities (supabase/functions/_shared/)
stage-ladders.ts
ladder-invariant.ts
decisionPolicyRegistry.ts
docPurposeRegistry.ts
generationModeResolver.ts
largeRiskRouter.ts
chunkRunner.ts
chunkValidator.ts
episodeBeatsChunked.ts
coreDocs.ts
doc-os.ts
documentLadders.ts (backend mirror)
narrativeContextResolver.ts
narrativeIntegrityEngine.ts
narrativeSpine.ts
canonConstraintEnforcement.ts
verticalDramaBeats.ts
characterPressureMatrix.ts
ciBlockerGate.ts
styleDeviation.ts
surgicalEpisodeRewrite.ts
narrativeEntityEngine.ts
narrativeDependencyGraph.ts
ndgProjectGraph.ts
sceneRoleClassifier.ts
sceneGraphClassifier.ts
actBlueprintSynthesizer.ts
arcStateDeltaGenerator.ts
deliverableSectionRegistry.ts
stageIdentityContracts.ts
transitionLedger.ts
eligibilityRegistry.ts
writingVoiceResolver.ts
convergencePolicy.ts
docPolicyRegistry.ts
pendingDecisionGate.ts
effective-profile-context.ts
guardrails.ts
llm.ts
prefs.ts
teamVoice.ts
nuanceEngine.ts
visualProjectBibleEdge.ts
deduplicateConceptBriefSections.ts
sectionRepairEngine.ts
episodeScope.ts
characterDedupUtils.ts

# Frontend Core (src/)
config/documentLadders.ts
lib/pipeline-brain.ts
lib/dev-os-config.ts
lib/can-promote-to-script.ts
lib/stages/registry.ts
lib/document-dependencies.ts
lib/invalidateDevEngine.ts
lib/stale-detection.ts
lib/stageIdentityReasons.ts
lib/script_change.ts
lib/format-helpers.ts

# Frontend Hooks (src/hooks/)
useDevEngineV2.ts
useRewritePipeline.ts
useSceneRewritePipeline.ts
usePromotionIntelligence.ts
useScriptPipeline.ts
useAutoRunMissionControl.ts
useSetAsLatestDraft.ts
useSeasonTemplate.ts
useDocumentPackage.ts
useProjectIssues.ts
useDeferredNotes.ts
useEpisodeHandoff.ts
useStageResolve.ts
useDecisionCommit.ts
useProjectNotes.ts
useProjectRuleset.ts

# Frontend UI Components (src/components/devengine/)
BgGenBanner.tsx
SeasonScriptProgress.tsx
CharacterBibleProgress.tsx
SectionedDocProgress.tsx (exports SectionedDocProgress + TreatmentActsProgress)
SceneIndexedProgress.tsx
ProcessProgressBar.tsx
BeatRewritePanel.tsx
TreatmentRewritePanel.tsx
SceneRewritePanel.tsx
MomentRewritePanel.tsx
EpisodeRewriteWorkspace.tsx
GenerateSeasonScriptsPanel.tsx
SeriesWriterAutorunPanel.tsx
AutoRunBanner.tsx
AutoRunProgressPanel.tsx
AutoRunMissionControl.tsx
DocumentSidebar.tsx
ActionToolbar.tsx
NotesPanel.tsx
ConvergencePanel.tsx
ConvergenceCoachPanel.tsx
DriftBanner.tsx
StaleDocBanner.tsx
PromotionIntelligenceCard.tsx
PipelineNextStepPanel.tsx
DecisionModePanel.tsx
CriteriaPanel.tsx
CanonicalQualificationsPanel.tsx
OutputDocumentsSection.tsx
ProvenancePanel.tsx
CascadePanel.tsx
ChangeReportPanel.tsx
SceneGraphPanel.tsx
StyleEvalPanel.tsx
StyleSourcesPanel.tsx
SectionedDocViewer.tsx
OperationProgress.tsx (in src/components/)

# Frontend Tests (src/test/)
ladder-invariant-guard.test.ts
stage-ladders-canonical.test.ts
empty-assembledtext-guard.test.ts
concept-brief-sectioned-rewrite.test.ts
document-ladders-drift.test.ts
```