# Obligation Validation Set — Requirements

## Purpose

A canonical validation set for testing narrative obligation detection (NC1), scoring (NC2), and the new confidence schema + field intensity state machine. This set ensures that changes to the obligation pipeline do not regress known-good behavior.

## Test Project

**Primary project:** YETI (any replica — multiple exist in the database)
- Format: `film`
- Characters: Enki, Brother/Boy (merged→Enki), Sister, Girl (merged→Sister)
- Approx. 83 scenes, 5 acts, 40+ beats

## Validation Categories

### 1. NC1 — Build Obligation Registry

| Test | Expected | Failure mode |
|------|----------|-------------|
| NC1 inserts rows for all NC1_OBLIGATION_SPECS (25+) | Each spec produces one row per project | Missing obligations = spec not covered |
| detection_confidence = NULL for NC1 rows | Correct — NC1 doesn't measure confidence | Seed-level confidence breaks downstream queries |
| detection_mode = 'explicit' for NC1 rows | All NC1 obligations are explicitly seeded | Seed mode wrong → bad filtering in NC2 |
| human_verified = true for NC1 rows | Seeds are canon-level | Wrong → false confidence_summary counts |
| projection_scope = [] for NC1 rows | Seed obligations project everywhere | Empty scope = correct at seed level |
| domain = 'structural' for NC1 rows | All seed obligations are structural | Wrong domain = broken taxonomy query |
| lifecycle_state = 'background_active' for NC1 rows | Seeds haven't been projected yet | Wrong state = misclassified in lifecycle queries |
| charge = 5.0 for NC1 rows | Default structural charge | Wrong = priority skew |
| No duplicate obligation_id per project_site | Unique per (project_id, obligation_type, source_layer, source_key) | Dedup regression |

### 2. NC2 — Validate Obligations

| Test | Expected | Failure mode |
|------|----------|-------------|
| confidence_summary.average_confidence | null (all NC1 rows have null confidence) | Wrong aggregation |
| confidence_summary.by_detection_mode | {"explicit": N} where N = total NC1 rows | Wrong counts |
| confidence_summary.human_verified_count | N — all NC1 rows are human_verified=true | False positive count |
| confidence_summary.by_domain | {"structural": N} | Wrong domain distribution |
| Obligations sorted: violated→unresolved→unavailable→fulfilled | Status ordering invariant preserved | Sort regression |
| Empty results for project with no document versions | Graceful — no crash | Pipeline stall |

### 3. Schema — Column Integrity

| Column | Type | Default | CHECK | Verified |
|--------|------|---------|-------|----------|
| detection_confidence | REAL | NULL | 0.0–1.0 or NULL | ✅ 2026-05-22 |
| evidence_refs | JSONB | '[]' | — | ✅ 2026-05-22 |
| detection_mode | TEXT | 'explicit' | explicit, inferred, pattern_matched, ai_suggested | ✅ 2026-05-22 |
| human_verified | BOOLEAN | false | — | ✅ 2026-05-22 |
| projection_scope | JSONB | '[]' | — | ✅ 2026-05-22 |
| domain | TEXT | 'structural' | structural, character, thematic, tonal, genre, pacing, continuity | ✅ 2026-05-22 |
| lifecycle_state | TEXT | 'background_active' | background_active, active, resolved, superseded, archived | ✅ 2026-05-22 |
| charge | REAL | 5.0 | 0–10 | ✅ 2026-05-22 |
| source_scene_id | UUID | NULL | FK → scene_graph_scenes(id) ON DELETE SET NULL | ✅ 2026-05-22 |
| target_scene_id | UUID | NULL | FK → scene_graph_scenes(id) ON DELETE SET NULL | ✅ 2026-05-22 |
| thread_label | TEXT | NULL | — | ✅ 2026-05-22 |

### 4. Indexes — Performance Validation

| Index | Columns | Expected use case |
|-------|---------|-------------------|
| narrative_obligations_detection_mode_lifecycle_idx | (detection_mode, lifecycle_state) | Filter active obligations by mode — NC2 hot path |
| narrative_obligations_domain_idx | (domain) | Filter by taxonomy domain |
| narrative_obligations_source_scene_id_idx | (source_scene_id) | Lookup obligations by source scene |
| narrative_obligations_lifecycle_charge_idx | (lifecycle_state, charge DESC) | Priority-ordered lifecycle queries |

## Test Script

To verify a YETI project after schema changes:

```sql
-- 1. Check all 11 columns exist
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'narrative_obligations'
  AND column_name IN (
    'detection_confidence', 'evidence_refs', 'detection_mode',
    'human_verified', 'projection_scope', 'domain',
    'lifecycle_state', 'charge', 'source_scene_id',
    'target_scene_id', 'thread_label'
  )
ORDER BY column_name;

-- 2. Check all 4 indexes exist
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'narrative_obligations'
  AND indexname IN (
    'narrative_obligations_detection_mode_lifecycle_idx',
    'narrative_obligations_domain_idx',
    'narrative_obligations_source_scene_id_idx',
    'narrative_obligations_lifecycle_charge_idx'
  );

-- 3. Verify NC1 row defaults (replace with actual project_id)
SELECT detection_confidence, detection_mode, human_verified,
       projection_scope, domain, lifecycle_state, charge
FROM narrative_obligations
WHERE project_id = '<project-uuid>'
  AND obligation_id LIKE 'nc1::%'
LIMIT 1;
```

## Regression Guard

Before deploying any migration or update that touches `narrative_obligations`:

1. Apply the migration SQL against a project with existing obligations (YETI preferred)
2. Run a test INSERT with all new columns populated → verify RETURNING
3. Run a confidence_summary-style query → verify aggregation
4. Verify all 4 indexes via `pg_indexes`
