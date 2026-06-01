# Canonical Scene Substrate — Architecture Program Review

**Date:** 2026-06-01
**Author:** Architect (Agent Smith 3)
**Documents reviewed:**
- `/Users/laralane/Documents/Matrix Hive Memory Cloud Vault/_red/scene-extraction-foundation-fix.md`
- `/Users/laralane/Documents/Matrix Hive Memory Cloud Vault/knowledge/computational-narrative-infrastructure-v2.md`
- Full codebase investigation of 30+ files (migrations, edge functions, shared libraries)

---

## EVIDENCE

### What the Fix Document Identifies Correctly

The Scene Extraction Foundation Fix document correctly identifies these real platform gaps:

1. **5 separate screenplay parsers** exist — no shared module
2. **`generate-document` creates feature_scripts** as flat blobs with zero scene extraction
3. **`extract-scene-index`** copies scene titles but NOT full scene content
4. **No automatic trigger** connects document creation to scene graph population
5. **`scene_graph_versions.characters_present`** is never populated by any extraction path
6. **YETI data gap** — 83 scenes in `scene_index`, 0 scenes in `scene_graph_versions` with matched per-scene content

### What Has Changed Since the Fix Document Was Written

The codebase investigation reveals critical evolution since May 31:

| Finding | Status |
|---------|--------|
| Phase 1 scene substrate deployed | ✅ **DONE** — `canonicalize-scene-substrate` deployed, wired as Stage 3.5 |
| `scene_graph_scenes` got 6 enrichment columns | ✅ **DONE** — migration 20260522134800 |
| `scene_graph_atomic_write` persists sluglines | ✅ **DONE** |
| JWT fix applied | ✅ **DONE** — `--no-verify-jwt` redeploy |
| Vercel proxy + deploy.sh updated | ✅ **DONE** |
| Documentary OS integration | ✅ **DONE** — 27/27 paths compliant (Kid memory) |

### What Remains Open (Verified by Codebase Investigation)

| Gap | Severity | Found In |
|-----|----------|----------|
| **No shared parser** — 4 distinct implementations | 🔴 Critical | dev-engine-v2 (inline), story-ingestion-engine (inline), extract-scene-index (fallback), nel-orchestrator (inline) |
| **generate-document bypass** — no auto-trigger for feature_script → scene extraction | 🔴 Critical | generate-document/index.ts — no post-creation hook |
| **characters_present never populated** on scene_graph_versions | 🔴 Critical | All extraction paths verified — 0 writers |
| **scene_index ↔ scene_graph_versions no FK linkage** | 🟡 High | extract-scene-intelligence/index.ts line 64-77 — reads first scene_graph_versions record as fallback, no scene_id mapping |
| **extract-scene-intelligence fallback path** reads one record for all 83 scenes | 🟡 High | extract-scene-intelligence/index.ts line 70 — `limit(1)` with `order(version_number desc)`, no scene_number correlation |
| **YETI backfill not done** — 83 scenes lack per-scene content | 🟡 Medium | Not started per Kanban |
| **source_text_refs empty** on scene_graph_scenes | 🟡 Medium | Column exists, value null |
| **Page ranges not computed** | 🟡 Medium | Columns exist, values null |
| **No scene-to-moment mapping** | 🟢 Low | Design needed |
| **No beat-to-scene mapping** | 🟢 Low | Design needed |

---

## ARCHITECTURAL ANALYSIS

### Constitutional Alignment

| Article | Assessment |
|---------|-----------|
| **A1 — Canonical Substrate** | ✅ ALIGNED. The existing `scene_graph_scenes` + `scene_graph_versions` is the correct L0 canonical scene IR. Scene data is NOT stored in documents — it's stored in dedicated graph tables. |
| **A2 — Truth Hierarchy** | ✅ ALIGNED. Scene graph is L0. `scene_index` is L2 (compiled structural projection). Fix document correctly positions scene_index as DERIVED from scene_graph. |
| **A3 — Canonical Invariants** | ✅ ALIGNED. Proposed shared parser + Document OS hook respect I2 (canonicalization before propagation), I3 (provenance preservation), I6 (confidence scoring on lossy extraction). |
| **A8 — Lossless Canonicalization** | ⚠️ PARTIAL. Proposed `CanonicalSceneRecord` interface is good but `source_text_refs` implementation is incomplete (page ranges, line offsets not computed). |
| **A4 — Ontology** | ⚠️ GAP DETECTED. The fix document defines Scene as a structural unit within slugline boundaries, but does not address the Scene→Beat→Moment relationship. The fix defines scenes well but is silent on how beats map to scenes and how moments map to scene ranges. |
| **A5 — Propagation** | ✅ ALIGNED. Document OS `queueSceneExtraction` hook uses the correct fire-and-forget pattern. No duplicate propagation engine. |
| **A12 — Future Infrastructure** | ⚠️ NEEDS SCOPE. Scene-to-moment mapping and beat-to-scene mapping are acknowledged future work. Must not block Phase 1 of the program. |

### What Conflicts

1. **`extract-scene-index` as primary scene_index builder** — The fix document proposes the shared parser writes to scene_index directly. CURRENT STATE: `scene_index` is rebuilt from scratch by `extract-scene-index` (the primary writer) OR `nel-orchestrator` (in its own pipeline). Both delete+insert. If the new shared parser also writes to scene_index, we get write contention. **Resolution:** The shared parser writes to `scene_graph_scenes` + `scene_graph_versions`. `scene_index` remains a derived compilation REBUILT by `extract-scene-index` reading from scene_graph. This respects the constitutional hierarchy (L0→L2).

2. **`nel-orchestrator` has its own scene parsing** — The NEL pipeline has its own `parseScenesFromText()` and writes to `scene_index` directly, bypassing the scene graph entirely for its pipeline. **Resolution:** The NEL pipeline must be migrated to use the shared parser and write through `scene_graph_atomic_write`. This is a Phase 2 concern.

3. **`extract-scene-intelligence` fallback path reads first scene_graph_versions record** (line 70-77) — This is a critical bug: it reads ONE record and uses it for ALL 83 scenes. **Resolution:** The shared parser must establish scene_id linkage so `scene_intelligence_packages` can reference the correct version. The FK already exists as `scene_intelligence_packages.scene_id → scene_index.id`, but scene_index.id ≠ scene_graph_scenes.id.

### What Is Missing

1. **Shared parser module architecture** — The fix document defines `CanonicalSceneRecord` and a `parseScreenplay()` function, but does not specify the migration strategy for existing data in scene_graph. When the new parser produces different boundaries or scene_keys than the current inline parsers, existing downstream consumers (scene_spine_links, scene_blueprint_bindings) will break if scenes are re-keyed.

2. **scene_graph_versions scene_id → scene_index scene_number mapping** — Currently no join path exists. The `extract-scene-intelligence` function's fallback path (line 70-77) proves this is a real gap. **Fix:** Add `scene_graph_versions.scene_number` column (or add `scene_index.scene_graph_scene_id FK`) to establish the linkage.

3. **Staleness propagation for Document OS hook** — The fix document describes staleness propagation but doesn't specify: what happens to scene_intelligence_packages when a feature_script is regenerated? Is the `is_current = false` set atomically with scene graph rewrite, or is it a separate async operation? **Resolution:** Must be atomic or have a transaction ID so consumers can detect the stale/current boundary.

4. **Parser versioning** — If the shared parser changes its regex, existing scene_graph data becomes stale vs new extractions. Need a `parser_version` column on `scene_graph_versions` or `provenance`.

### What Should Be Modified

1. **CanonicalSceneRecord → Add `parser_version` and `regex_pattern_version` fields** — Enables detection of stale extractions when the parser is upgraded
2. **`queueSceneExtraction` → Add transaction boundary stamp** — A `extraction_tx_id` UUID that links all writes from a single extraction event, enabling consumers to detect incomplete extractions
3. **`scene_index` is L2, not L0** — The fix document's target table section treats scene_index as a peer table to scene_graph_scenes. It should be explicitly marked as DERIVED only. All three tables (scene_graph_scenes, scene_graph_versions, scene_graph_order) form the L0 scene substrate. scene_index is L2 compilation.

---

## DEPENDENCY MAP

### Layer 0: Scene Graph Tables (L0 Canonical Scene Substrate)

```
scene_graph_scenes ─────┐
   ├── scene_key        │  ┌─────────────────────┐
   ├── slugline         │  │ scene_graph_order   │
   ├── act              │  ├── order_key          │
   ├── provenance       │  ├── act                │
   └── source_text_refs │  └── is_active          │
                        │                        │
scene_graph_versions ───┤  ┌─────────────────────┐
   ├── content          │  │ scene_spine_links   │
   ├── characters_present│  ├── axis_key          │
   ├── slugline         │  ├── roles              │
   ├── beats            │  ├── threads            │
   └── summary          │  └── arc_steps          │
                        │                        │
                        └── scene_graph_scenes ──┤
                                                 │
                    ┌────────────────────────────┘
                    ▼
            scene_index (L2 compilation)
```

### Direct Scene Graph Consumers

| System | Reads | Writes | Criticality |
|--------|-------|--------|-------------|
| **dev-engine-v2** | scene_graph_scenes, versions, order, spine_links | scene_graph_scenes, versions, order, spine_links | 🔴 Critical |
| **canonicalize-scene-substrate** | scene_graph_scenes, order | scene_graph_order (act UPDATE), scene_graph_scenes (provenance UPDATE) | 🔴 Critical |
| **extract-scene-index** | scene_graph_scenes, versions, order | scene_index (DELETE+INSERT rebuild) | 🔴 Critical |
| **extract-scene-intelligence** | scene_index, scene_graph_versions (fallback) | scene_intelligence_packages | 🟡 High |
| **generate-document** | scene_graph_scenes, scene_graph_versions (inner join), scene_graph_order | None (read-only) | 🟡 High |
| **generate-hero-frames** | scene_graph_scenes, scene_index | None (reads for context) | 🟡 High |
| **generate-lookbook-image** | scene_graph_scenes | None | 🟡 High |
| **shot-plan-jobs** | scene_graph_order, scene_index, scene_graph_versions | scene_shots, shot_plan_job_scenes | 🟡 High |
| **scene-enrichment-engine** | scene_graph_versions (content) | scene_graph_versions (enrichment) | 🟡 High |
| **entity-links-engine** | scene_graph_scenes, scene_graph_versions, scene_spine_links | entity_scene_mappings | 🟡 High |
| **narrativeEntityEngine** | scene_graph_versions (content) | entity registries | 🟡 Medium |
| **spine-rewrite-plan** | scene_graph_scenes, scene_graph_versions, scene_spine_links | rewrite plans | 🟡 Medium |
| **ndgProjectGraph** | scene_spine_links | NDG input data | 🟡 Medium |
| **convergence-coach-engine** | scene_spine_links | convergence analysis | 🟡 Medium |
| **compute-obligation-topology** | scene_graph_scenes (act_id) | obligation_topology | 🟡 Medium |
| **atom-index-backfill** | scene_graph_scenes | atoms table | 🟢 Low |
| **story-ingestion-engine** | scene_graph_scenes (via atomic_write) | scene_graph_scenes, versions, order | 🔴 Critical |
| **nel-orchestrator** | scene_graph_scenes (indirect), scene_index | scene_index (DELETE+INSERT) | 🟡 Medium |

### Downstream Scene Intelligence Consumers

| System | Reads scene_intelligence_packages | Used For |
|--------|----------------------------------|----------|
| **extract-scene-intelligence** | Scene-level analysis | Scene_action, blocking_map, gaze_map, tension_level |
| **evaluate-visual-governance** | scene_intelligence_package_id on project_images | Visual governance evaluation |
| **generate-hero-frames** | scene_intelligence data (indirect) | Hero frame prompt enrichment |
| **SourceTruthDashboard** | scene data + intelligence status | Source truth tracking |

### Indirect Consumers (Scene Data Through Proxies)

| System | Proxy Layer | Dependency Path |
|--------|-------------|-----------------|
| **Hero Frame Pipeline** | scene_graph_scenes → generate-hero-frames | scene_key → relevant character/location bindings |
| **Lookbook Pipeline** | scene_graph_scenes → generate-lookbook-image | scene presence → costume binding resolution |
| **VPB Assembly** | scene_index → vpb-assembly-engine | scene order → visual production bible |
| **AI Actors** | scene_graph_versions content → extract-visual-dna | action lines → performance direction |
| **Production Bible** | scene_graph_scenes + scene_index → infer-pd-canon | scene breakdown → production design |
| **Casting** | scene_graph_versions characters_present → processEvidenceResolver | character presence → casting evidence |
| **Schedule Intelligence** | scene_index → schedule-intelligence | scene count → shoot day estimation |
| **Corpus Analysis** | scene_index → corpus-resolver | scene patterns → genre analysis |
| **Narrative Beat Atomiser** | scene_index → narrativebeat-atomiser | scene_number → beat atomization |

### Key Finding: Dependency Graph Topology

The scene data dependency graph has exactly **ONE central hub**: `scene_graph_scenes`. If scenes are re-keyed (new key format, different boundary splits), ALL downstream consumers break. This makes the shared parser migration the highest-risk operation in the program.

The second most critical dependency is `scene_graph_versions.content` — this is the actual scene text. If scene content is missing (as it is for YETI scenes 5-83), every downstream enrichment (scene_action, blocking_map, gaze_map, character_intentions) produces empty or degraded output.

---

## OWNERSHIP MATRIX

### Workstream 1: Shared Screenplay Parser

| Role | Assignment | Rationale |
|------|-----------|-----------|
| **Primary Owner** | Red | Pure function module — Red's typical scope for well-defined library code |
| **Supporting** | Architect (spec review), Oracle (coordination) | Architect must approve interface; Oracle coordinates migration sequence |
| **Validator** | Morpheus | Must validate parser output parity against existing 4 parsers |
| **Assets** | `supabase/functions/_shared/screenplayParser.ts` | New file — does NOT exist yet |
| **Deliverables** | `parseScreenplay()` function, `CanonicalSceneRecord` type, migration adapter layer | |

### Workstream 2: Parser Integration (Replace 4 Inline Parsers)

| Sub-workstream | Primary | Supporting | Validator |
|----------------|---------|------------|-----------|
| **Replace dev-engine-v2 inline parser** | Red | Trinity | Morpheus |
| **Replace story-ingestion-engine parser** | Red | Trinity | Morpheus |
| **Replace extract-scene-index fallback parser** | Red | Trinity | Morpheus |
| **Replace nel-orchestrator parser** | Red | Trinity | Morpheus |
| **Replace export-package parser** | Red | Trinity | Morpheus |

### Workstream 3: Document OS Auto-Trigger

| Role | Assignment | Rationale |
|------|-----------|-----------|
| **Primary Owner** | Trinity | Document OS integration is a deployment/schema/infrastructure concern |
| **Supporting** | Architect (design approval), Red (parser import) | Architect reviews hook placement; Red provides parser interface |
| **Validator** | Morpheus | Must validate: all feature_script/production_draft creates trigger extraction |
| **Deliverables** | `queueSceneExtraction()` in doc-os.ts or Document OS edge function | |

### Workstream 4: characters_present Population Fix

| Role | Assignment | Rationale |
|------|-----------|-----------|
| **Primary Owner** | Red | Part of parser output — Red writes the extraction logic |
| **Supporting** | Trinity (if schema change needed) | Currently column exists on scene_graph_versions, just never populated |
| **Validator** | Morpheus | Must verify every extraction path populates this field |
| **Deliverables** | `characters_present` populated in all extract → scene_graph_atomic_write paths | |

### Workstream 5: scene_index ↔ scene_graph_versions Linkage

| Role | Assignment | Rationale |
|------|-----------|-----------|
| **Primary Owner** | Architect | Requires schema decision + constitutional alignment |
| **Supporting** | Trinity (schema migration), Oracle (impact assessment) | Schema risk — must be designed carefully |
| **Validator** | Morpheus | Must validate no regression in extract-scene-intelligence |
| **Deliverables** | Migration for join column or mapping table | |

### Workstream 6: YETI Backfill

| Role | Assignment | Rationale |
|------|-----------|-----------|
| **Primary Owner** | Trinity | Backfill script + execution |
| **Supporting** | Red (parser availability), Oracle (coordination) | Must wait for shared parser to exist |
| **Validator** | Morpheus | Must validate: all 83 scenes have full content post-backfill |
| **Deliverables** | Backfill script, execution result, re-run extract-scene-intelligence | |

### Workstream 7: Scene Intelligence Refresh

| Role | Assignment | Rationale |
|------|-----------|-----------|
| **Primary Owner** | Oracle | Orchestrates Scene Intelligence re-run post-backfill |
| **Supporting** | Trinity (function deployment if needed) | May need function parameter changes |
| **Validator** | Morpheus | A/B comparison of intelligence output pre/post fix |
| **Deliverables** | scene_intelligence_packages for all YETI scenes, A/B report | |

### Workstream 8: Repair Action UI

| Role | Assignment | Rationale |
|------|-----------|-----------|
| **Primary Owner** | Trinity | Frontend work |
| **Supporting** | Red (sceneGraphClassifier for detection) | Uses existing classifySceneGraphState() |
| **Validator** | Oracle | Validates user-facing flow |
| **Deliverables** | "Re-extract Scenes From Script" button in VPP/Scene Intelligence panel | |

### Workstream 9: Staleness Propagation

| Role | Assignment | Rationale |
|------|-----------|-----------|
| **Primary Owner** | Architect | Design-only — constitutional requirement |
| **Supporting** | Trinity (implementation), Oracle (consumer inventory) | Must inventory all is_current consumers |
| **Validator** | Morpheus | Must validate: script change → stale propagation chain complete |
| **Deliverables** | Design spec for stale propagation chain, implementation | |

---

## PROGRAM PHASES

### Phase 0 — Preconditions (0-1 session)

**Gate:** All following phases depend on this

```
Task: Build shared screenplayParser.ts
Owner: Red
Validator: Morpheus
Output: supabase/functions/_shared/screenplayParser.ts
Risk: Low — pure function, testable in isolation
```

### Phase 1 — Consolidation (1-2 sessions)

```
Task A: Replace inline parser in dev-engine-v2 scene_graph_extract
  Owner: Red  |  Need: Phase 0 complete  |  Risk: Medium — regression on existing scene extraction

Task B: Replace inline parser in story-ingestion-engine
  Owner: Red  |  Need: Phase 0 complete  |  Risk: Low — well-defined input/output

Task C: Replace inline parser in extract-scene-index
  Owner: Red  |  Need: Phase 0 complete  |  Risk: Low — only fallback path affected

Task D: Replace inline parser in nel-orchestrator
  Owner: Red  |  Need: Phase 0 complete  |  Risk: Medium — must not break NEL pipeline

Task E: Replace inline parser in export-package
  Owner: Red  |  Need: Phase 0 complete  |  Risk: Low — standalone function

Task F: Deprecate old parser functions
  Owner: Red  |  Need: A-E complete  |  Risk: Low — comment-based deprecation
```

**Gate for Phase 2:** All 5 parsers use shared module, old inline parsers deprecated.

### Phase 2 — Auto-Trigger Integration (1 session)

```
Task A: Add Document OS hook in persistVersion for feature_script/production_draft
  Owner: Trinity  |  Need: Phase 1 complete  |  Risk: Low — fire-and-forget, same pattern as existing NEL triggers

Task B: Populate characters_present in scene_graph_atomic_write
  Owner: Red  |  Need: Phase 0 complete  |  Risk: Low — field exists, just needs population

Task C: Add parser_version to scene_graph_versions provenance
  Owner: Red  |  Need: Phase 0 complete  |  Risk: Low — metadata field only
```

**Gate for Phase 3:** All new document versions trigger extraction; characters_present populated.

### Phase 3 — Data Integrity Fixes (1 session)

```
Task A: Design scene_index ↔ scene_graph_versions linkage
  Owner: Architect  |  Need: Phase 2 complete  |  Risk: Medium — schema change

Task B: Implement migration for linkage (add scene_graph_versions.scene_number or scene_index.scene_graph_scene_id FK)
  Owner: Trinity  |  Need: Task A approved  |  Risk: Medium — existing data may need backfill

Task C: Fix extract-scene-intelligence fallback path to use proper scene_id linkage
  Owner: Red  |  Need: Task B complete |  Risk: Low — once ID linkage exists, fallback removed

Task D: Add extraction_tx_id to scene_graph writes for atomic boundary detection
  Owner: Architect  |  Need: Phase 2 complete  |  Risk: Low — metadata field
```

**Gate for Phase 4:** scene_index ↔ scene_graph properly linked; extract-scene-intelligence reads correct per-scene content.

### Phase 4 — YETI Backfill (1 session)

```
Task A: Build backfill script using shared parser
  Owner: Trinity  |  Need: Phase 0 complete  |  Risk: Low — standalone script

Task B: Run backfill on YETI (83 scenes)
  Owner: Trinity  |  Need: Task A complete  |  Risk: Medium — first real test of parser on production data

Task C: Re-run extract-scene-intelligence on YETI
  Owner: Oracle  |  Need: Phase 3 complete |  Risk: Low — re-trigger existing function

Task D: A/B comparison — Hero Frame fidelity pre/post backfill
  Owner: Oracle  |  Need: Task C complete  |  Risk: Low — validation only
```

**Gate for Phase 5:** YETI has full per-scene content; scene_intelligence_packages populated from real content.

### Phase 5 — Repair Action UI (0.5 session)

```
Task A: Add "Re-extract Scenes From Script" button using classifySceneGraphState()
  Owner: Trinity  |  Need: Phase 1 complete  |  Risk: Low — frontend component

Task B: Wire repair action to POST /extract-scene-index { projectId, force: true }
  Owner: Trinity  |  Need: Task A complete  |  Risk: Low — existing endpoint
```

### Phase 6 — Staleness Propagation (Design + 1 session)

```
Task A: Design stale propagation chain (Architect)
  Owner: Architect  |  Need: Phase 3 complete  |  Risk: Low — design only

Task B: Implement is_current=false marking on scene_graph_versions when script updated
  Owner: Trinity  |  Need: Task A approved  |  Risk: Medium — must not break concurrent readers

Task C: Implement stale detection in scene_intelligence_packages consumers
  Owner: Trinity  |  Need: Task B complete  |  Risk: Medium — consumer inventory needed
```

### Phase 7 — Future: Scene-Moment-Beast Linkage (Deferred)

```
Design: Scene→moment mapping, beat→scene mapping
  Owner: Architect  |  Need: Canonical Transaction model defined  |  Risk: Low — design only
```

---

## RISKS

### Schema Risks

| Risk | Severity | Description | Mitigation |
|------|----------|-------------|------------|
| Scene re-keying | 🔴 Critical | If shared parser produces different scene boundaries than inline parsers, existing scene_spine_links and scene_blueprint_bindings FK relationships break | Parser must preserve existing scene_key format (SCENE_NNN). Adapter layer maps old keys to new boundaries. |
| scene_index ↔ scene_graph FK addition | 🟡 High | Adding FK from scene_index → scene_graph_scenes would require .id uniqueness (currently not guaranteed — old projects may have duplicate scene_graph_scenes rows) | Use scene_number mapping instead of direct FK. Add scene_graph_versions.scene_number column. |
| scene_graph_atomic_write signature change | 🟡 High | Any change to the PL/pgSQL function's parameter list breaks all callers | Add new parameters as optional with defaults. Deprecate old signature, remove in Phase 7. |

### Duplicate Truth Risks

| Risk | Severity | Description | Mitigation |
|------|----------|-------------|------------|
| scene_index as second truth | 🟡 High | If shared parser writes to both scene_graph AND scene_index, two write paths can diverge | scene_index is DERIVED only. extract-scene-index REBUILDS from scene_graph. Shared parser writes only to scene_graph. |
| Nel-orchestrator bypass | 🟡 Medium | NEL pipeline parses scenes independently and writes to scene_index, bypassing scene graph | Phase 1 migration of nel-orchestrator to shared parser. NEL writes through scene_graph_atomic_write. |
| Generate-document bypass | 🟡 Medium | Generated feature_scripts sit in document_versions with no scene extraction | Phase 2 Document OS hook fixes this. |

### Migration Risks

| Risk | Severity | Description | Mitigation |
|------|----------|-------------|------------|
| YETI re-extraction produces different scene count | 🟡 High | If YETI's script has ambiguity, the shared parser may split or merge scenes differently than the original 83 | Validate parser against YETI's 83 known scene boundaries before running backfill. Flag divergences for manual review. |
| Existing scene_spine_links orphaned | 🟡 High | scene_spine_links references scene_graph_scenes.id. If backfill uses force:true, DELETE+INSERT creates new IDs, breaking all FK relationships | Backfill must use force:ONLY IF scene content is truly missing. Partial backfill (scene_graph_versions only) preferred. |

### Regression Risks

| Risk | Severity | Description | Mitigation |
|------|----------|-------------|------------|
| Hero frame inputs degrade | 🟡 High | generate-hero-frames reads scene_graph_scenes for scene selection. If the new parser produces different scene sets, hero frame coverage changes | A/B validation: hero frame scene selection pre/post parser replacement must produce same coverage. |
| Shot plan scene ordering changes | 🟡 Medium | shot-plan-jobs reads scene_graph_order. If order_keys change, shot plan sequences shift | Parser must preserve evenly-spaced key generation (sgGenerateEvenKeys equivalent). |
| VPB scene count mismatch | 🟡 Medium | vpb-assembly-engine reads scene_index row count. If scene count changes, VPB structure shifts | Validate scene count parity during Phase 1 validation. |
| Scene Intelligence scope change | 🟡 Medium | extract-scene-intelligence processes scenes per project. New scene count changes processing scope and API cost | Track scene count change in validation. Acceptable if change is ≤5%. |

### Performance Risks

| Risk | Severity | Description | Mitigation |
|------|----------|-------------|------------|
| Document OS hook blocks document save | 🟡 Low | queueSceneExtraction is fire-and-forget — document save returns immediately | Already correct per design. Verify in code review. |
| Shared parser on large scripts | 🟢 Low | 120+ page script parsed in-memory is sub-second | Pure string manipulation — no I/O, no API calls. Safe. |

### Constitutional Risks

| Risk | Severity | Description | Mitigation |
|------|----------|-------------|------------|
| I1 violation — scene_index treated as L0 | 🟡 Medium | Some downstream systems treat scene_index as authoritative scene source | Scene_index must be explicitly documented as L2 compilation. Validation gates should check against scene_graph, not scene_index. |
| I2 violation — document-to-IR without canonicalization | 🟡 Medium | If generate-document creates feature_script → Document OS hook extracts scenes via shared parser → this IS proper canonicalization (I2 compliant) | Verify the hook is wired correctly in Phase 2. |
| I6 violation — low-confidence propagation | 🟢 Low | Parser accuracy targets are 85-99% per component. Low-confidence extractions must propagate explicitly | CanonicalSceneRecord.extraction_confidence field exists. Must be checked before auto-propagation. |

---

## VALIDATION STRATEGY

### Phase 1: Parser Parity Validation

```
Test: Parse 5 reference scripts with both old inline parsers AND new shared parser
Metric: Scene count parity (must match exactly)
Metric: Slugline match rate (≥99%)
Metric: Scene_key format (must produce SCENE_NNN keys)
Metric: Content preservation (per-scene text must be semantically equivalent, not byte-identical)

Failure: Any script produces different scene count → block Phase 2
Failure: Slugline match < 99% → return to Red
```

### Phase 2: Auto-Trigger Validation

```
Test: Generate a feature_script via auto-run pipeline
Expected: scene_graph_versions gets new rows for each scene within 5 seconds
Test: Verify scene_graph_versions.characters_present is non-empty array
Test: Verify scene_graph_atomic_write called with correct project_id and source_version_id

Failure: No new rows → block Phase 3
Failure: characters_present empty → return to Red
```

### Phase 3: Data Integrity Validation

```
Test: Query scene join — scene_index.scene_number = scene_graph_versions.scene_number
Expected: Every scene_index row has matching scene_graph_versions row
Test: extract-scene-intelligence runs without fallback path (no limit(1) workaround)
Expected: Per-scene scene_action, blocking_map, gaze_map derived from matched content

Failure: Join mismatch > 0 rows → block Phase 4
Failure: Fallback path still active → return to Red
```

### Phase 4: YETI Backfill Validation

```
Test: scene_graph_versions count = 83 for project be05e314-900a-4b27-b2a7-5f2232ff6f6d
Test: Every YETI scene_graph_scenes row has non-null slugline
Test: Every YETI scene_graph_versions row has content length > 0
Test: extract-scene-intelligence produces non-empty scene_action for all 83 scenes
Test: Hero Frame scene selection matches pre-backfill coverage

Failure: Any scene missing content → manual review + partial retry
Failure: Hero Frame coverage changes > 10% → architect review
```

### Phase 5: Repair Action Validation

```
Test: Delete scene_graph_versions for a test project
Expected: classifySceneGraphState() returns PARTIAL_GRAPH
Test: Click "Re-extract Scenes From Script"
Expected: scene_graph_versions repopulated, scene_intelligence_packages marked stale

Failure: Action doesn't restore content → return to Trinity
```

### Phase 6: Staleness Propagation Validation

```
Test: Create new feature_script version on existing project
Expected: scene_graph_versions old rows have supersedes_version_id set
Expected: scene_intelligence_packages.is_current = false
Expected: extract-scene-intelligence re-runs automatically

Failure: is_current not updated → architect review
```

---

## RECOMMENDED EXECUTION ORDER

```
ORDER 0: Build shared screenplayParser.ts (Red)
  Dependencies: None
  Risk: Low
  Gate for: Everything

ORDER 1: Replace 4 inline parsers (Red)
  Dependencies: ORDER 0
  Risk: Medium
  Validate: Parser parity tests
  Gate for: Auto-trigger integration

ORDER 2: characters_present population + parser_version (Red)
  Dependencies: ORDER 0
  Risk: Low
  Validate: All extraction paths populate characters_present
  Gate for: Data integrity fixes

ORDER 3: Document OS auto-trigger (Trinity)
  Dependencies: ORDER 1
  Risk: Low
  Validate: All feature_script creates trigger extraction
  Gate for: Data integrity fixes

ORDER 4: scene_index ↔ scene_graph linkage redesign (Architect)
  Dependencies: ORDER 1 (to understand current data shapes)
  Risk: Medium — schema decision
  Gate for: Implementation

ORDER 5: Schema migration for linkage + extraction_tx_id (Trinity)
  Dependencies: ORDER 4
  Risk: Medium
  Validate: All scenes join correctly

ORDER 6: Fix extract-scene-intelligence fallback path (Red)
  Dependencies: ORDER 5
  Risk: Low
  Validate: No more limit(1) workaround

ORDER 7: YETI backfill script + execution (Trinity)
  Dependencies: ORDER 0, ORDER 5
  Risk: Medium
  Validate: 83 scenes with full content

ORDER 8: Re-run extract-scene-intelligence on YETI (Oracle)
  Dependencies: ORDER 7
  Risk: Low
  Validate: A/B comparison

ORDER 9: Repair action UI (Trinity)
  Dependencies: ORDER 1
  Risk: Low — can parallelize with ORDER 4-8

ORDER 10: Staleness propagation design + implement (Architect + Trinity)
  Dependencies: ORDER 5
  Risk: Medium
  Validate: Consumer inventory + propagation test
```

---

## FINAL VERDICT

### APPROVE PROGRAM — with modifications

The Canonical Scene Substrate initiative is APPROVED as a formal IFFY architecture program. It addresses a real platform-level concern that has manifested across Scene Intelligence, Hero Frames, VPB, and Narrative Intelligence independently.

**Modifications to the foundation fix document:**

1. **Parser consolidation is Phase 0, not Phase 1** — The shared parser must exist before any integration work. The fix document treats it as a Phase 4 task but it's the prerequisite for everything.

2. **scene_index is L2, not L0** — The fix document's target table section lists scene_index as a peer to scene_graph_scenes. It must be explicitly derived.

3. **No direct scene_index writes from shared parser** — The fix document shows writeScenesToGraph writing to all three tables + scene_index. Remove scene_index writes from the parser. scene_index is rebuilt by extract-scene-index from scene_graph.

4. **Add parser_version + extraction_tx_id to the record** — Missing from the fix document's CanonicalSceneRecord. Essential for stale detection and migration tracking.

5. **Backfill must not re-key scenes** — YETI backfill must preserve existing scene_graph_scenes IDs if present. Only populate missing content on scene_graph_versions.

6. **Defer scene-to-moment and beat-to-scene mapping** — These are critical constitutional requirements (Article 4 Ontology) but should not block Phases 0-5. Add as Phase 7.

**Execution:** Begin immediately. ORDER 0 (shared parser) has no prerequisites and zero constitutional conflict.

### Distribution Plan

| Order | Task | Agent | Body |
|-------|------|-------|------|
| 0 | Build `_shared/screenplayParser.ts` | Red | Build shared parser module per Architect spec. Design: Pure function, 5 reference scripts for parity validation, `CanonicalSceneRecord` interface, unified heading regex, deprecated old parser functions. Morpheus validates parity. |
| 1 | Replace 4 inline parsers | Red | Replace inline parsers in dev-engine-v2 (scene_graph_extract), story-ingestion-engine, extract-scene-index (fallback), nel-orchestrator, export-package. All use shared module. |
| 2 | Populate characters_present | Red | Ensure scene_graph_atomic_write populates characters_present on scene_graph_versions. Add parser_version to provenance. |
| 3 | Document OS auto-trigger | Trinity | Add queueSceneExtraction() hook in persistVersion for feature_script/production_draft doc types. Fire-and-forget pattern. |
| 4 | scene_index↔scene_graph linkage design | Architect | Design the join column — recommend `scene_graph_versions.scene_number INT` for direct join to `scene_index.scene_number`. |
| 5 | Schema migration | Trinity | Implement migration for linkage column. Add extraction_tx_id UUID to scene_graph writes. |
| 6 | Fix extract-scene-intelligence fallback | Red | Remove limit(1) workaround. Use proper scene_id→scene_number join. |
| 7 | YETI backfill script | Trinity | Build + run. Use shared parser. Preserve existing scene IDs. Only populate missing content. |
| 8 | Re-run Scene Intelligence | Oracle | Run extract-scene-intelligence on YETI post-backfill. A/B comparison report. |
| 9 | Repair action UI | Trinity | "Re-extract Scenes From Script" button + POST wire. |
| 10 | Staleness propagation | Architect→Trinity | Design chain → implement is_current marking → consumer verification. |

**Wiring:** Route ORDER 0 to Red. After Morpheus validates the shared parser, route ORDER 1-2 to Red. Orders 3 and 9 to Trinity can begin in parallel with Red's parser work. Orders 4-5 (Architect→Trinity) must wait for parser consolidation to complete so current data shapes are understood.

**Total estimated effort:** 4-6 focused sessions across 3 agents (Red, Trinity, Oracle) with 1 validation session (Morpheus) and 2 design sessions (Architect).
