# SESS-IMP-0028A — Existing Violation Audit
**Status:** Audit only — no fixes applied
**Author:** Oracle
**Date:** 2026-05-30

---

## Creature-Atomiser (`supabase/functions/creature-atomiser/index.ts`)

### Current Violations

| Line | Violation | Type | Description |
|------|-----------|------|-------------|
| 1 | `// @ts-nocheck` | Contract: Type Safety | Disables all TypeScript checks |
| 382 | `admin.from("projects").select("title, format, logline, genres, premise, budget_range")` | **CRITICAL** — Direct context query | Reads `genres` directly from projects table, bypassing PCP entirely |
| 383-388 | Extracts `projGenres`, `projFormat`, `projLogline`, `projPremise` | **CRITICAL** — Context resolution | These fields are PCP-owned context, not atomiser data |
| 399-406 | Injects `projectContextStr` into LLM prompt | **CRITICAL** — Independent inference | Genres injected directly into LLM without CPIE mediation |
| 159-160 | `admin.from("narrative_entities")` | Acceptable (extraction input) | This is entity-level data, not project context |
| 166-184 | `admin.from("scene_graph_versions")`, `admin.from("project_documents")` | Acceptable (extraction input) | These are scene/document data, not project context |

### Contract Violations

| Rule | Status | Evidence |
|------|--------|----------|
| No direct `projects` queries | ❌ FAIL | Line 382: `admin.from("projects")` |
| No direct `genre` reads | ❌ FAIL | Line 383: reads `projects.genres` |
| Context from CPIE only | ❌ FAIL | No CPIE integration present |
| Type-safe code | ❌ FAIL | `@ts-nocheck` at line 1 |
| Provenance on all writes | ❌ FAIL | No provenance emitted |
| CDG registration | ❌ FAIL | No CDG hooks |

### Expected Remediation

1. Remove `admin.from("projects").select(...)` — **blocking**
2. Remove `projectContextStr` — **blocking**
3. Add CPIE context object as function parameter
4. Update LLM prompt to use CPIE-provided context
5. Remove `@ts-nocheck` — **blocking**
6. Add provenance to all atom outputs
7. Add CDG bridge registration

---

## Vehicle-Atomiser (`supabase/functions/vehicle-atomiser/index.ts`)

### Current Violations

| Line | Violation | Type | Description |
|------|-----------|------|-------------|
| 1 | `// @ts-nocheck` | Contract: Type Safety | Disables all TypeScript checks |
| 24-49 | `VEHICLE_PATTERNS` array | **STRUCTURAL** — WWII hardcode | 40+ regex patterns exclusively matching WWII vehicles (jeep, tank, panzer, spitfire, half-track, etc.) |
| 49 | `.from("narrative_entities")` | Acceptable (extraction input) | Entity-level data |
| Active | `canonicalise()` function | **STRUCTURAL** — WWII hardcode | Maps raw terms to WWII vehicle names (map on lines 92-118) |

### Contract Violations

| Rule | Status | Evidence |
|------|--------|----------|
| No direct `projects` queries | ✅ PASS | No projects table read |
| No direct `genre` reads | ✅ PASS | No genre read |
| No WWII hardcoded patterns | ❌ FAIL | VEHICLE_PATTERNS on lines 24-49 |
| No independent inference | ❌ FAIL | WWII patterns infer vehicle type without PCP context |
| Type-safe code | ❌ FAIL | `@ts-nocheck` at line 1 |
| Provenance on all writes | ❌ FAIL | No provenance emitted |
| CDG registration | ❌ FAIL | No CDG hooks |

### Expected Remediation

1. Remove `VEHICLE_PATTERNS` array — **blocking**
2. Replace `canonicalise()` with CPIE vehicle registry
3. Add CPIE context object as function parameter
4. Remove `@ts-nocheck` — **blocking**
5. Add provenance to all atom outputs
6. Add CDG bridge registration

---

## Costume-Atomiser (`supabase/functions/costume-atomiser/index.ts`)

### Current Violations

| Line | Violation | Type | Description |
|------|-----------|------|-------------|
| 1 | `// @ts-nocheck` | Contract: Type Safety | Disables all TypeScript checks |
| 130-174 | `.from("scene_graph_versions")`, `.from("project_documents")`, `.from("atoms")` | Acceptable (extraction input) | Entity-level data only |
| Active | No context reads | **COVERAGE GAP** | Zero genre/period/climate awareness |

### Contract Violations

| Rule | Status | Evidence |
|------|--------|----------|
| No direct `projects` queries | ✅ PASS | No projects table read |
| No direct `genre` reads | ✅ PASS | No genre read |
| Type-safe code | ❌ FAIL | `@ts-nocheck` at line 1 |
| Provenance on all writes | ❌ FAIL | No provenance emitted |
| CDG registration | ❌ FAIL | No CDG hooks |
| Inference available | ❌ FAIL | Zero inference — pure extraction |
| CPIE integration | ❌ FAIL | No CPIE input |

### Expected Remediation

1. Add CPIE context object as function parameter
2. Remove `@ts-nocheck` — **blocking**
3. Add provenance to all atom outputs
4. Add CDG bridge registration

---

## Prop-Atomiser (`supabase/functions/prop-atomiser/index.ts`)

### Current Violations

| Line | Violation | Type | Description |
|------|-----------|------|-------------|
| 1 | `// @ts-nocheck` | Contract: Type Safety | Disables all TypeScript checks |
| Active | No context reads | **COVERAGE GAP** | Zero genre/period/climate awareness |

### Contract Violations

| Rule | Status | Evidence |
|------|--------|----------|
| No direct `projects` queries | ✅ PASS | No projects table read |
| No direct `genre` reads | ✅ PASS | No genre read |
| Type-safe code | ❌ FAIL | `@ts-nocheck` at line 1 |
| Provenance on all writes | ❌ FAIL | No provenance emitted |
| CDG registration | ❌ FAIL | No CDG hooks |
| CPIE integration | ❌ FAIL | No CPIE input |

### Expected Remediation

1. Add CPIE context object as function parameter
2. Remove `@ts-nocheck` — **blocking**
3. Add provenance to all atom outputs
4. Add CDG bridge registration

---

## Summary

| Atomiser | Severity | Violations | Effort |
|----------|----------|------------|--------|
| creature-atomiser | 🔴 **CRITICAL** | 3 active (projects query, genre reads, LLM context injection) | 1 day |
| vehicle-atomiser | 🔴 **CRITICAL** | 2 active (WWII patterns + canonicalise map) | 2 days |
| costume-atomiser | 🟡 Coverage gap | 0 active (no context reads) — coverage gap | 1 day (additive) |
| prop-atomiser | 🟡 Coverage gap | 0 active (no context reads) — coverage gap | 0.5 day (additive) |

### Common Violations (All 4)
- `@ts-nocheck` on line 1 — **must be removed**
- `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` — **must be replaced with AtomiserRepository**
- No provenance on canon writes — **guard will reject**
- No CDG registration — **bridge will handle after Phase 1B**
- No CPIE input contract — **Phase 1B will wire**
