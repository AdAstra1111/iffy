# Production Stills Pipeline — Atoms to Images

**Architecture Design** | Architect (Agent 3) | 2026-05-23

---

## 1. Executive Summary

### What This Document Covers
The complete end-to-end pipeline that chains **atom generation → visual DNA resolution → prompt construction → image generation → output storage**, with explicit mapping of all missing connectors.

### Major Finding
The `atoms` table and `character_visual_dna` table are **completely disconnected**. Character atomisers produce rich physical descriptions (stored in `atoms.attributes`), but the visual DNA resolution layer (`dnaAutoFlow.ts` / `extract-visual-dna`) reads only from `project_canon` and `scene_graph_versions` — never from atoms. There is no orchestrator edge function that chains these stages.

---

## 2. Current State Map (As-Built)

### Layer 1 — Atom Generation (14 atomiser edge functions)
| Function | Atom Type | Key attributes produced |
|----------|-----------|----------------------|
| `character-atomiser` | character | physical_description, age_estimate, physical_markings, build, height_estimate, skin_tone, hair, eyes, distinctive_features, wardrobe_notes, movement_gait, facial_expression_range, casting_suggestions, casting_type_tags, visual_complexity |
| `location-atomiser` | location | architecture, geography, atmosphere, era_relevance |
| `costume-atomiser` | costume | fabric, color_palette, silhouette, era_accuracy |
| `creature-atomiser` | creature | biology, habitat, behaviour, visual_characteristics |
| `prop-atomiser` | prop | material, size, function, significance |
| `vehicle-atomiser` | vehicle | type, era, features, appearance |
| `dialogue-atomiser` | dialogue | (not visual) |
| `narrativebeat-atomiser` | narrativebeat | (not visual) |
| `theme-atomiser` | theme | (not visual) |
| `genre-atomiser` | genre | (not visual) |
| `tone-atomiser` | tone | (not visual) |
| `structure-atomiser` | structure | (not visual) |
| `soundtrack-atomiser` | soundtrack | (not visual) |

**Table:** `atoms` — columns: id, project_id, entity_id, atom_type, canonical_name, attributes (JSONB), confidence, generation_status

### Layer 2 — Visual DNA Resolution (client-side, frontend)
| File | Function |
|------|----------|
| `src/lib/images/visualDNA.ts` | `resolveCharacterVisualDNA()` — pure function, builds CharacterVisualDNA from canon+trait+markers |
| `src/lib/images/dnaAutoFlow.ts` | `executeDnaAutoFlow()` — calls `extract-visual-dna` edge function, resolves DNA, auto-persists to `character_visual_dna` table |
| `src/lib/images/identitySignature.ts` | `deriveIdentitySignature()` — face/body/silhouette/wardrobe profile |
| `src/lib/images/characterTraits.ts` | Trait extraction, binding markers |
| `src/lib/images/characterImageEligibility.ts` | `classifyCharacterIdentity()` — FAIL-CLOSED identity gate |

**Edge function:** `supabase/functions/extract-visual-dna/index.ts` — reads from `project_canon` + `scene_graph_versions`, NOT from `atoms` table.

**Table:** `character_visual_dna` — columns: id, project_id, character_name, version_number, script_truth (JSONB), narrative_markers (JSONB), inferred_guidance (JSONB), locked_invariants (JSONB), identity_signature (JSONB), identity_strength (TEXT), is_current (BOOL)

### Layer 3 — Prompt Construction
| File | Function |
|------|----------|
| `src/lib/images/slotPromptRegistry.ts` | `resolvePromptTemplate()` + `buildPromptFromTemplate()` — maps slot_type+shot_type+subject_type to templates with [PLACEHOLDER] tokens |
| `src/lib/images/lookbookImageOrchestrator.ts` | `orchestrateGapResolution()` + `executeGapGenerations()` — retrieve→reuse→recreate chain |
| `src/lib/images/requiredVisualSet.ts` | `resolveRequiredVisualSet()` — maps characters/locations to required image slots |

### Layer 4 — Image Generation (Edge Functions)
| Function | Purpose |
|----------|---------|
| `supabase/functions/generate-lookbook-image/` | Gemini-based image generation via OpenRouter. 3 models (premium/standard/fast). Reads `character_visual_dna` via `resolveCharacterBindings()`. Has full narrative moment selection (`selectNarrativeMoment`), shot taxonomy, identity lock enforcement |
| `supabase/functions/generate-hero-frames/` | Hero frame generation |
| `supabase/functions/auto-populate-visual-set/` | Batch orchestrator — reads canon JSON to determine required slots, calls `generate-lookbook-image` |

### Layer 5 — Output Storage
**Table:** `project_images` — columns: id, project_id, role (enum), entity_id, strategy_key, prompt_used, negative_prompt, canon_constraints (JSONB), storage_path, storage_bucket, width, height, is_primary, is_active, dna_version_id, generation_config (JSONB), subject_type, subject, curation_state, asset_group, shot_type, subject_ref, generation_purpose, location_ref, moment_ref, state_key, lane_key, prestige_style, lane_compliance_score

**Identity Gate:** `characterImageEligibility.ts` — `classifyCharacterIdentity()` checks `generation_config.identity_locked === true`

### Layer 6 — Curation & Quality
- `premiumImagePool.ts` — canonical selector
- `lookbookRebuildTrigger.ts` — deterministic rebuild trigger
- `canonRebuildExecutor.ts` / `canonRebuildScoring.ts`
- `premiumDisplayFilter.ts` / `premiumQualityGate.ts`

---

## 3. Current Data Flow Diagram (Text)

```
┌────────────────────────────────────────────────────────────────┐
│  ATOM LAYER                                                   │
│  character-atomiser ──→ atoms (attributes: physical_desc...)   │
│  location-atomiser  ──→ atoms (attributes: architecture...)    │
│  costume-atomiser   ──→ atoms (attributes: fabric, palette...)  │
│  creature-atomiser  ──→ atoms (attributes: biology, ...)       │
│  prop-atomiser      ──→ atoms (attributes: material, ...)      │
│  vehicle-atomiser   ──→ atoms (attributes: type, ...)          │
└─────┬──────────────────────────────────────────────────────────┘
      │ ATOM DATA SITS HERE — NO DOWNSTREAM CONSUMPTION
      ▼
  ┌──────────────────────────────────────────────────────────┐
  │  atoms table    ←   A T O M   D A T A   C E M E T E R Y  │
  └──────────────────────────────────────────────────────────┘
      ✗ NO connector to visual DNA layer

┌────────────────────────────────────────────────────────────────┐
│  VISUAL DNA LAYER (reads from project_canon, NOT atoms)       │
│  extract-visual-dna ──reads──→ project_canon + scene_versions  │
│  dnaAutoFlow.ts    ──────→ character_visual_dna table          │
│  visualDNA.ts      ──pure fn──→ CharacterVisualDNA             │
└─────┬──────────────────────────────────────────────────────────┘
      │ DNA resolved from canon (not from atom details)
      ▼
┌────────────────────────────────────────────────────────────────┐
│  IMAGE GENERATION LAYER                                       │
│  generate-lookbook-image ──reads──→ character_visual_dna      │
│  shot-plan-jobs        ──reads──→ scene_graph_versions        │
│  auto-populate-visual-set ──reads──→ canon JSON               │
└─────┬──────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────────────┐
│  OUTPUT LAYER                                                 │
│  project_images table ←── storage buckets                      │
│  identity gate (characterImageEligibility.ts)                   │
└────────────────────────────────────────────────────────────────┘
```

### Gaps Identified

1. **Atoms → Visual DNA: MISSING CONNECTOR.** No edge function or DB trigger reads atom attributes and writes them into `character_visual_dna`. The `extract-visual-dna` function reads `project_canon`, not `atoms`.

2. **Parallel DNA sources.** `character_visual_dna` and `atoms` evolve independently. Atom physical descriptions never reach prompt construction.

3. **No orchestrator.** There is no edge function that chains atom completion → DNA resolution → image generation. The auto-run pipeline is document-only.

4. **Shot-plan-jobs → generate-lookbook-image: NO CONNECTOR.** `shot-plan-jobs` creates shot plans, but there's no integration that feeds shot plans as generation prompts into `generate-lookbook-image`.

5. **No auto-trigger.** Atom completion (`generation_status = 'complete'`) triggers nothing downstream. Image generation requires explicit user action.

---

## 4. Designed End-to-End Pipeline

### Phase 1 — Bridge: Atoms → Visual DNA (low risk, zero schema change)

**New edge function:** `supabase/functions/enrich-visual-dna-from-atoms/`

**Purpose:** Read completed character atoms from `atoms` table, synthesize physical descriptions into `character_visual_dna` as `inferred_guidance` + `evidence_traits`, update identity signature.

**Input contract:**
```typescript
{
  project_id: string;
  character_name: string;
  mode: 'aggressive' | 'conservative'; // default: aggressive
}
```

**Output contract:**
```typescript
{
  enriched: boolean;
  traits_added: number;
  dna_version_id: string | null;
  identity_updated: boolean;
  errors: string[];
}
```

**Logic:**
1. Query `atoms` WHERE project_id AND atom_type='character' AND canonical_name ILIKE character_name AND generation_status='complete'
2. Extract from `attributes`: physical_description, build, height_estimate, skin_tone, hair, eyes, distinctive_features, wardrobe_notes, age_estimate, physical_markings, casting_type_tags, visual_complexity
3. Map each to `VisualDNATrait` structures with source='atom_enrichment', confidence='high' if LLM-generated, 'medium' if extracted from text
4. Merge with existing `character_visual_dna` row (read current, append novel, detect contradictions)
5. Re-derive identity signature
6. Write new version if changes detected, preserving identity lock state
7. Return result

**No schema changes.** All data fits existing character_visual_dna columns.

### Phase 1B — Bridge: Location Atoms → Location Visual Datasets (low risk, zero schema change)

**Codebase discovery:** The `location_visual_datasets` table already exists (defined in migration `20260323171427`) and is the location-equivalent of `character_visual_dna`. It has 8 structured visual role layers (structural_substrate, surface_condition, atmosphere_behavior, spatial_character, status_signal, contextual_dressing, occupation_trace, symbolic_motif) and 6 slot-specific specs (slot_establishing, slot_atmosphere, slot_architectural_detail, slot_time_variant, slot_surface_language, slot_motif).

A client-side enrichment function `enrichWithLocationAtoms()` already exists in `generate-lookbook-image/index.ts` (lines 708-767) that reads location atoms from the `atoms` table and builds a raw text block injected into prompts at line 1973. However, there is **no structured enrichment path** that writes atom-level detail into the `location_visual_datasets` table's structured JSONB columns.

**Action:** Extend `enrich-visual-dna-from-atoms` to handle `atom_type='location'`. When the function receives a location_name instead of a character_name, it writes structured data into `location_visual_datasets` instead of `character_visual_dna`.

**Extended input contract:**
```typescript
{
  project_id: string;
  entity_name: string;          // was: character_name
  entity_type: 'character' | 'location';  // NEW: discriminator
  mode: 'aggressive' | 'conservative';
}
```

**Location-specific logic:**
1. Query `atoms` WHERE project_id AND atom_type='location' AND canonical_name ILIKE entity_name AND generation_status='complete'
2. Extract from `attributes`: architecture, geography, era_relevance, atmosphere, lightingCharacter, acousticCharacter, temperatureImpression, atmosphericMood, signatureArchitecturalFeatures[], dominantColors[], visualComplexity, settingType, sensoryTexture[], thematicSymbolism
3. Map to `location_visual_datasets` column structure:

| Atom attribute | location_visual_datasets column | Mapping strategy |
|---------------|-------------------------------|------------------|
| architecture, geography, era_relevance | `structural_substrate` | Composite: architecture as primary, geography as secondary, era as notes |
| atmosphere, lightingCharacter, sensoryTexture | `atmosphere_behavior` | Combine into atmospheric description |
| signatureArchitecturalFeatures, dominantColors, settingType | `slot_architectural_detail` | Features as primary_truths, colors as notes |
| temperatureImpression, atmosphericMood | `slot_atmosphere` | Mood as primary_truths, temperature as contextual |
| thematicSymbolism | `symbolic_motif` | Symbolism as motif content |
| visualComplexity | `status_expression_mode` | Maps: low→austere, medium→material, high→ornamental |
| location_visual_datasets row exists | `source_mode = 'reverse_engineered'` | Flag as atom-derived |

4. If no existing `location_visual_datasets` row: INSERT with atom-mapped data
5. If row exists: UPDATE, merge atom data into existing JSONB (atom attributes overwrite matching keys, novel keys append)
6. Set `freshness_status = 'fresh'`, `dataset_version = existing.version + 1` (or 1 if new)
7. Return enrichment result

**Output contract:**
```typescript
{
  enriched: boolean;
  entity_type: 'location';
  entity_name: string;
  dataset_version: number;
  fields_mapped: string[];        // which location_visual_datasets columns were written
  errors: string[];
}
```

**No schema changes.** All data fits existing `location_visual_datasets` columns. The `entity_type` discriminator is the only input contract change to `enrich-visual-dna-from-atoms`.

### Phase 2 — Pipeline Orchestrator (low-medium risk, one new JSONB column on projects)

**New edge function:** `supabase/functions/pipeline-orchestrator/`

**Purpose:** Chain: atom completion check → DNA enrichment → required visual set resolution → image generation for unfilled slots.

**Actions:**
- `status` — return pipeline state for a project
- `run` — execute the pipeline from current state

**Input contract (run action):**
```typescript
{
  project_id: string;
  phases?: ('atoms_to_dna' | 'resolve_visual_set' | 'generate_identity' | 'generate_references' | 'generate_world' | 'generate_key_moments' | 'generate_visual_language')[];
  // If omitted, runs all phases
  max_generations?: number; // default: 10 per session
}
```

**Pipeline phases:**
1. `atoms_to_dna` — call `enrich-visual-dna-from-atoms` for each completed character and location atom. Character atoms → `character_visual_dna`. Location atoms → `location_visual_datasets`.
2. `resolve_visual_set` — compute required visual slots vs existing (calls existing `requiredVisualSet` logic server-side)
3. `generate_identity` — generate identity pack for each character (headshot, profile, full_body) via `generate-lookbook-image`
4. `generate_references` — generate character reference shots (close_up, medium, full_body, profile, emotional_variant)
5. `generate_world` — generate world establishing shots + location detail. Reads enriched `location_visual_datasets` for architectural, geographical, and atmospheric prompt context.
6. `generate_key_moments` — pick top narrative moments from scene graph, generate tableau/wide/medium/close_up
7. `generate_visual_language` — generate lighting/texture/composition/color references

**State persistence:**
- Pipeline state per project stored in a new table or use `project_settings` JSONB field
- State: `{ current_phase, completed_phases: [], status: 'idle'|'running'|'paused'|'complete', error_counts, started_at }`

**Schema addition:** Add `pipeline_state` JSONB column to `projects` table (or use existing meta_json):
```sql
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS pipeline_state JSONB DEFAULT '{}'::jsonb;
```
Index: not needed — single JSONB per project, queried by project_id (has PK index).

**Error/Retry Policy — All Edge Function Calls:**

| Failure Mode | Retry Strategy | Per-Call Budget | Phase-Level Action |
|-------------|----------------|-----------------|-------------------|
| HTTP timeout (>30s) | 2 retries, exponential backoff (2s, 4s) | 3 total attempts | Record `{ phase, entity, error: "timeout" }` in `pipeline_state.failed_items[]`, continue to next entity |
| LLM/API error (4xx/5xx) | 2 retries, exponential backoff (3s, 6s) | 3 total attempts | Same — mark slot failed, continue |
| Network/connection error | 2 retries, exponential backoff (1s, 3s) | 3 total attempts | Same — mark slot failed, continue |
| Storage write failure | 1 retry after 5s | 2 total attempts | Abort current image, continue to next slot. Re-verify storage in validation phase |
| Rate limit (429) | 3 retries with backoff (5s, 10s, 20s) | 4 total attempts | Same as timeout — rate limits are transient |

**Per-phase failure threshold:** If >50% of calls in a single phase fail (e.g., 3 of 5 character identity generations fail), the orchestrator:
1. Marks the phase `status: 'failed'` in `pipeline_state`, with `phase_failure_reason: "<phase> failed: N/M calls failed"`  
2. Records each failing entity in `pipeline_state.failed_items[]` with full error details
3. Continues to the next phase — does NOT abort the pipeline
4. Returns `{ status: 'complete_with_failures', failed_phases: [...] }` in the run result

**Why continue rather than abort:** The pipeline produces partial results rather than blocking entirely. A user can inspect `pipeline_state.failed_items`, fix the underlying issue, and re-invoke with specific phases.

**State shape for error tracking:**
```typescript
pipeline_state: {
  current_phase: string;
  completed_phases: string[];
  status: 'idle' | 'running' | 'paused' | 'complete' | 'complete_with_failures';
  failed_items: Array<{
    phase: string;
    entity: string;           // character_name or location_name
    call: string;             // which edge function
    error: string;            // error type
    error_detail: string;     // original error message
    attempts: number;
    last_attempt_at: string;  // ISO timestamp
  }>;
  phase_failures: Record<string, {
    status: 'failed' | 'complete_with_failures';
    total_calls: number;
    failed_calls: number;
    failure_reason: string;
  }>;
  budget_exhausted: boolean;
  budget_reached_at: string | null;  // phase name where budget was exhausted
  generation_count: number;
  started_at: string;
}
```

**`max_generations` Budget Behavior:**
- The budget applies per `run` invocation, across all phases in that invocation
- Each call to `generate-lookbook-image` or equivalent image-generation edge function increments `pipeline_state.generation_count`
- When `generation_count >= max_generations`:
  1. The orchestrator completes the current generation call (does not abort mid-generation)
  2. Finishes the current phase (completes any in-flight entities, does not start new ones)
  3. Marks `pipeline_state.budget_exhausted = true`, `pipeline_state.budget_reached_at = "<phase_name>"`
  4. Returns result with `{ status: 'budget_exhausted', completed_phases: [...], remaining_phases: [...] }`
  5. The caller can re-invoke `pipeline-orchestrator` with the remaining phases (the orchestrator skips completed phases via state)
- DNA enrichment calls (`enrich-visual-dna-from-atoms`) do NOT count toward the generation budget — only image-generation calls increment the counter
- Default: `max_generations = 10` per invocation

### Phase 3 — Shot Plan → Generation Bridge (medium risk, zero schema change)

**Modification:** `supabase/functions/generate-lookbook-image/index.ts`

Add support for an optional `shot_plan_context` parameter that contains pre-computed shot selections from the shot planning system:

```typescript
shot_plan_context?: {
  selected_moments: NarrativeMoment[];
  shot_type_assignments: { moment_key: string; shot_type: ShotType }[];
  force_section_key?: string;
}
```

When provided:
1. Skip `loadNarrativeMoments` (use pre-loaded `shot_plan_context.selected_moments` instead)
2. Use `shot_type_assignments` instead of SHOT_PACKS random selection
3. Each generation uses the assigned shot's narrative moment context

**No schema changes.**

### Phase 4 — June 1 Demo Scope

The June 1 demo requires **atoms → basic character images** in a clean flow. Minimal viable scope:

| Pipeline Step | What to Demo | Preconditions |
|---------------|-------------|---------------|
| 1. Atom generation | character-atomiser extracts physical descriptions for 1-2 characters + location-atomiser extracts architecture/geography for 1-2 locations | Script uploaded, narrative entities linked to scenes |
| 2. Visual DNA enrichment | Character atom physical descriptions flow into character_visual_dna AND location atom data flows into location_visual_datasets | Phase 1A and Phase 1B bridges deployed |
| 3. Identity pack generation | 3 images per character (headshot, profile, full_body) | character_visual_dna has identity_signature |
| 4. World establishing | 1-2 location establishing shots enriched with location atom architecture/geography/atmosphere data | location_visual_datasets populated for each location |
| 5. Key moment | 1 tableau shot from a scene | scene_graph_versions populated |

**Walkthrough:**
1. User uploads script → screenplay intake pipeline runs → character-atomiser extracts atoms
2. User clicks "Generate Visual Pipeline" → pipeline-orchestrator runs
3. Pipeline phases execute in sequence
4. UI shows progress per phase (Atom status → DNA status → Image generation status)
5. Final output: `project_images` table populated + storage bucket has images

**UI Surface:** `VisualProductionPipeline.tsx` already exists and has stage status tracking. Add a "Generate Pipeline" button that calls `pipeline-orchestrator`.

---

## 5. Trigger Strategy

### Primary: Explicit User Action
- User clicks "Generate Visual Pipeline" in `VisualProductionPipeline.tsx`
- This calls `pipeline-orchestrator` with all phases
- Direct, simple, no race conditions

### Secondary (post-June 1): Auto-trigger on Atom Completion
- DB trigger on `atoms` table after UPDATE of generation_status='complete'
- Fires `pipeline-orchestrator` with `{ phases: ['atoms_to_dna'] }` — only the enrichment phase
- NOT the full image generation (that requires user intent)
- This ensures atom → DNA bridge happens automatically

### Not Recommended: Auto-run Pipeline Integration
The auto-run pipeline (`auto-run/index.ts`) is document-ladder specific. Adding image generation to it would create a cross-cutting concern. The `pipeline-orchestrator` should remain independent.

---

## 6. Identity Gate Integration

Every generated image must pass `classifyCharacterIdentity()`. The pipeline enforces:

1. When `enrich-visual-dna-from-atoms` writes DNA, it sets identity lock state based on atom confidence
2. When `generate-lookbook-image` is called via orchestrator, it sets `generation_config.identity_locked: true` in the generation payload
3. The identity gate (`characterImageEligibility.ts`) reads this and passes the image
4. If identity lock is weak (< 'strong'), the orchestrator caps generation at identity-only shots (headshot, profile)

---

## 7. Schema Drift Assessment

### Phase 1A (atoms → character DNA bridge): LOW risk
- Zero new tables
- Zero new columns
- Pure read from `atoms`, write to `character_visual_dna`

### Phase 1B (atoms → location DNA bridge): LOW risk
- Zero new tables (`location_visual_datasets` already exists)
- Zero new columns
- Extends `enrich-visual-dna-from-atoms` input contract with `entity_type` discriminator
- Maps atom attributes to existing `location_visual_datasets` JSONB columns

### Phase 2 (Pipeline orchestrator): LOW-MEDIUM risk  
- One new column: `projects.pipeline_state` JSONB
- One new edge function: `pipeline-orchestrator`
- No canonical registry changes
- No promotion gate changes

### Phase 3 (Shot plan bridge): MEDIUM risk
- Requires modifying `generate-lookbook-image` input contract
- Must maintain backward compatibility with existing callers
- Additive only — no existing contracts broken

### Phase 4 (June 1 demo): Integration scope only
- No schema changes
- Requires frontend wiring in `VisualProductionPipeline.tsx`

---

## 8. Dependency Confirmation

| Dependency | Status | Action |
|------------|--------|--------|
| `character-atomiser` deployed | ✅ Exists at `supabase/functions/character-atomiser/` | None |
| `location-atomiser` deployed | ✅ Exists | None |
| `atoms` table | ✅ Schema exists | None |
| `character_visual_dna` table | ✅ Schema exists at migration 20260319114814 | None |
| `extract-visual-dna` edge function | ✅ Exists | None |
| `dnaAutoFlow.ts` | ✅ Exists | None — but needs server-side enrichment alternative |
| `generate-lookbook-image` | ✅ Exists at v79 | Needs `shot_plan_context` support (Phase 3) |
| `auto-populate-visual-set` | ✅ Exists | Can serve as reference for orchestrator |
| `shot-plan-jobs` | ✅ Exists | Need output bridge to generation (Phase 3) |
| `requiredVisualSet.ts` | ✅ Exists | Can be adapted for server-side |
| `project_images` table | ✅ Schema exists | None |
| `characterImageEligibility.ts` | ✅ Identity gate | None |
| `VisualProductionPipeline.tsx` | ✅ Exists | Needs pipeline trigger button |
| `auto-run/index.ts` | ❌ NOT involved | Document-only pipeline, keep separate |
| OpenRouter key for image generation | ✅ In env | None |
| Supabase storage buckets | ✅ Configured | None |
| `_shared/imageGenerationResolver.ts` | ✅ Exists | None |
| `location_visual_datasets` table | ✅ Schema exists (migration 20260323171427) | Target for location atom enrichment (Phase 1B) |
| `enrichWithLocationAtoms()` in generate-lookbook-image | ✅ Exists at line 708 | Client-side raw text enrichment — pipeline orchestrator prefers structured `location_visual_datasets` |

## 9. Build Order

1. **`enrich-visual-dna-from-atoms` edge function** — read atoms, merge into character_visual_dna AND location_visual_datasets (entity_type discriminator)
2. **`pipeline-orchestrator` edge function** — phase management, state persistence with error tracking and budget enforcement
3. **`projects.pipeline_state` column** — single JSONB migration
4. **`generate-lookbook-image` shot_plan_context support** — additive input contract
5. **`VisualProductionPipeline.tsx` trigger button** — frontend integration for June 1 demo
6. **DB trigger on atoms table** — auto-enrich on completion (post-June 1)

---

## 10. Validation Gates

| Gate | Check | Failure Action |
|------|-------|---------------|
| Atom completion | All required atom types for selected phase have generation_status='complete' | Block phase, report missing atoms |
| Location enrichment | `location_visual_datasets` has entries for all location entities in the scene graph | Skip world establishing generation, only generate character images |
| DNA enrichment | character_visual_dna has at least identity_signature with face/body data | Skip character image generation, only generate world/location |
| Identity lock | classifyCharacterIdentity() passes on generated images | Move to candidate pool (not active), flag for review |
| Storage verification | Image binary exists at claimed storage_path | Re-generate, max 2 retries |
| Required slot fill | project_images has row matching required slot spec | Report gap in orchestrator result |

---

## 11. Atom Type → Image Role Mapping

| Atom Type | Visual Relevance | Image Roles |
|-----------|-----------------|-------------|
| character | HIGH | identity_headshot, identity_profile, identity_full_body, close_up, medium, full_body, emotional_variant |
| costume | HIGH | full_body (with wardrobe enforcement) |
| location | HIGH | wide, atmospheric, detail, time_variant |
| creature | MEDIUM | full_body, close_up, detail |
| prop | MEDIUM | detail (as object prop) |
| vehicle | MEDIUM | wide, detail, full_body |
| narrativebeat | MEDIUM | tableau, medium, wide |
| dialogue | NONE | — excluded (no visual impact) |
| theme | NONE | — excluded (abstract) |
| genre | NONE | — excluded (abstract) |
| tone | NONE | — excluded (abstract; tone influences prompt via slotPromptRegistry tone context) |
| structure | NONE | — excluded (structural, not visual) |
| soundtrack | NONE | — excluded (audio only) |

---

## 12. Prompt Construction Pipeline (Data Flow Detail)

```
atoms.attributes.physical_description ──→ enrich-visual-dna-from-atoms ──→ character_visual_dna
  (entity_type: 'character')

atoms.attributes.architecture/geography/atmosphere ──→ enrich-visual-dna-from-atoms ──→ location_visual_datasets
  (entity_type: 'location')                                                 structural_substrate, atmosphere_behavior, slot_architectural_detail

character_visual_dna ──→ resolveCharacterBindings() ──→ CharacterBinding[]
  └── traits_summary, identity_signature, locked_invariants

CharacterBinding[] ──→ buildCharacterBindingBlock() ──→ [IDENTITY SIGNATURE] block
  └── Face, Body, Silhouette, Wardrobe sections

location_visual_datasets ──→ resolveWorldBindings() ──→ WorldBinding[]
  └── structural_substrate, atmosphere_behavior, slot_architectural_detail, slot_atmosphere

character_visual_dna + scene_versions ──→ loadNarrativeMoments() ──→ NarrativeMoment[]
  └── selectNarrativeMoment() picks best moment for shot type

PromptContext {
  characterName: bindings[i].character_name,
  characterTraits: bindings[i].traits_summary,
  locationName: locationBinding.canonical_name,
  locationDescription: locationBinding.description,
  worldRules: locationBinding.world_rules,
  tone, period, genre: from project meta
}

slotPromptRegistry.resolvePromptTemplate(subjectType, shotType) → PromptTemplate
slotPromptRegistry.buildPromptFromTemplate(template, context) → { prompt, negativePrompt }

└── → generate-lookbook-image({ prompt, negative_prompt, identity_locked: true, ... })
       → OpenRouter/Gemini → storage → project_images row
```

---

## 13. Missing Integration Points — Complete Spec

### Missing #1: `enrich-visual-dna-from-atoms` (Phase 1A + Phase 1B)
**Priority:** HIGH — necessary for atom data to reach images
**Implementation:** New edge function, ~300 lines (character + location enrichment)
**Reads:** `atoms` table, `character_visual_dna` table, `location_visual_datasets` table
**Writes:** `character_visual_dna` table (character mode), `location_visual_datasets` table (location mode)
**Calls:** None (self-contained)
**Documented in:** Section 4, Phase 1A and Phase 1B

### Missing #2: `pipeline-orchestrator` (Phase 2)
**Priority:** HIGH — necessary for chain execution
**Implementation:** New edge function, ~400 lines
**Reads:** `atoms`, `character_visual_dna`, `project_images`, `scene_graph_versions`
**Writes:** `projects.pipeline_state`, calls `enrich-visual-dna-from-atoms`, calls `generate-lookbook-image`
**Documented in:** Section 4, Phase 2

### Missing #3: Atoms → DNA completion hook (post-June 1)
**Priority:** LOW (post-demo)
**Implementation:** DB trigger or after-write hook in atomisers
**Reads/Writes:** None directly — triggers pipeline-orchestrator
**Documented in:** Section 5, Secondary

### Missing #4: Shot plan → generation bridge (Phase 3)
**Priority:** MEDIUM
**Implementation:** `generate-lookbook-image` input expansion
**Documented in:** Section 4, Phase 3

---

## 14. Key Architecture Decisions

1. **Pipeline orchestrator is independent from auto-run** — `auto-run/index.ts` manages document ladder progression. Image generation is a separate concern. Mixing them would couple unrelated pipelines.

2. **Atoms → DNA enrichment is server-side only** — The existing `dnaAutoFlow.ts` is client-side (browser). For pipeline automation, a Deno edge function is required to run without user context.

3. **All generated images start as 'candidate' curation state** — No auto-promotion to 'active'. Human review/admission is required. This respects the identity gate and prevents degraded images from entering canonical pools.

4. **Atom data takes priority over canon for physical traits** — When atomic physical descriptions conflict with canon, the atom data wins because it's LLM-generated from script evidence (higher granularity). Conflicts are logged and reported.

5. **Failure isolation per phase** — If a phase fails (e.g., key moment generation), subsequent phases continue. The orchestrator reports per-phase status. This prevents cascading failures.

6. **Location enrichment targets existing `location_visual_datasets` table** — The table already exists (migration 20260323171427) with 8 visual role layers and 6 slot-specific specs. The `enrich-visual-dna-from-atoms` function writes atom attributes into these structured JSONB columns rather than creating a new table. This avoids schema drift while resolving the missing connector between location atoms and world-establishing image generation. The existing `enrichWithLocationAtoms()` in `generate-lookbook-image` (raw text block appended to prompt) remains as a fallback for non-orchestrated calls.

---

## 15. File List

### New Files
| File | Purpose | Phase |
|------|---------|-------|
| `supabase/functions/enrich-visual-dna-from-atoms/index.ts` | Bridge atoms → character_visual_dna + location_visual_datasets (entity_type discriminator) | Phase 1A + Phase 1B |
| `supabase/functions/pipeline-orchestrator/index.ts` | Pipeline state machine orchestrator with error retry and budget enforcement | Phase 2 |

### Modified Files
| File | Change | Phase |
|------|--------|-------|
| `supabase/functions/generate-lookbook-image/index.ts` | Add `shot_plan_context` input support | Phase 3 |
| `src/pages/VisualProductionPipeline.tsx` | Add "Generate Pipeline" button + status display | Phase 4 |
| `supabase/migrations/NNNN_pipeline_state.sql` | Add `pipeline_state` JSONB column to `projects` | Phase 2 |

### Configuration Changes
| File | Change | Phase |
|------|--------|-------|
| None | No registry changes needed | — |

---

## 16. June 1 Demo Plan

### Preconditions
- 1 project with script uploaded through screenplay intake
- At least 2 character entities linked to scenes
- At least 2 location entities with scene links
- Scene graph populated (at minimum 3-5 scenes)

### Demo Flow
1. Navigate to `VisualProductionPipeline` page
2. See pipeline stages: Atom Completion (✅) → DNA Enrichment → Identity Pack → World Establishing → Key Moments
3. Click "Generate Visual Pipeline"
4. Watch phases execute in sequence (pipeline-orchestrator polls or SSE)
5. Result: 6+ images generated (3 per character identity pack, 2 world establishing, 1 key moment tableau)
6. Images appear in LookBook

### Fallback
If full pipeline fails, demonstrate phases independently:
- Show atom data in `atoms` table (character + location)
- Show `character_visual_dna` enriched with atom data
- Show `location_visual_datasets` populated with atom architecture/geography/atmosphere data
- Show one `generate-lookbook-image` call manually
- Show resulting image in storage

---

*End of Architecture Package — designed for IFFY's existing infrastructure. All new components fit within existing schema patterns and architecture invariants.*
