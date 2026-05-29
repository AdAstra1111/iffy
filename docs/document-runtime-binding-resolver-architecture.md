# DocumentRuntimeBinding Resolver — Architecture Package

**Author:** Architect (Agent Smith 3)
**Chain context:** Root-Cause (t_2fa78acd) → Regenerate (t_be4cd8cf) → Validate Approved (t_120a1275) → REVISE hook-based (t_17e72ba1) → REVISE durable storage (t_15d51659)
**Design refs:** `docs/STRATEGIC_ARCHITECTURE_BRIEFING.md`, `CLAUDE.md`

---

## 1. Problem Statement

IFFY has **8 fragmented version authorities** resolving the same question — "which version ID should I bind to?" — with different resolution rules, different sort orders, and no shared authority:

| # | Authority | Location | Surface | Problem |
|---|-----------|----------|---------|---------|
| 1 | `authoritativeVersion` | PDE.tsx:843 | useMemo | Re-resolves every 10s poll, loose fallback chain |
| 2 | `stablePromotionVersion` | PDE.tsx:851 | useMemo | Duplicate logic, separate filter/sort |
| 3 | `promotionGateVersionId` | PDE.tsx:861 | derived | Passes through from stablePromotionVersion; implicit |
| 4 | `effectiveVersionId` | PDE.tsx:864 | derived | authoritative \|\| selectedVersionId — no type tracking |
| 5 | `convergenceVersionId` | PDE.tsx:1087 | derived | selectedVersionId — **BUG**: should be promotion_gate |
| 6 | `selectedVersionId` | useDevEngineV2.ts:244 | useState | User-picked, no binding type metadata |
| 7 | ABVR (backend) | auto-run/index.ts:907 | function | Complex score-based resolver, no client-side equivalent |
| 8 | `approvedVersionMap` | useDevEngineV2.ts:219 | query | Most recent approved per doc, non-deterministic |

Each consumer independently re-resolves version IDs on every render cycle. No shared binding state, no binding type tracking, no invariant enforcement.

---

## 2. Solution: `useDocumentRuntimeBinding` — A React Hook

**Key design decision (REVISE):** The original proposal used an async shared function `resolveDocumentRuntimeBinding()`. The REVISE (t_17e72ba1) adopted a **React hook** instead because:
- Zero DB calls on render (reads from existing `versions` array)
- No race conditions (synchronous resolution from available data)
- Backward-compatible with all 11 downstream consumers of `authoritativeVersion`
- Preserves the auto-rebind effect (PDE.tsx:868-878) unchanged

### 2.1 TypeScript Interface

```typescript
// File: src/lib/versionBinding/documentRuntimeBindingTypes.ts (NEW)

export type BindingType = 'authoritative' | 'promotion_gate' | 'render' | 'pipeline';

export type BindingSource =
  | 'approved_and_current'          // strict invariant match
  | 'newest_approved'               // fallback by created_at
  | 'best_version_number'           // highest version_number among approved
  | 'user_selected'                 // explicitly picked by user
  | 'auto_select_latest'            // default when nothing is selected
  | 'pending'                       // not yet resolved
  | 'error'                         // resolution failed
  | 'unavailable';                  // no versions exist

export interface RuntimeBinding {
  type: BindingType;
  versionId: string | null;
  source: BindingSource;
  boundAt: number;
  docType: string | null;
}

export interface InvariantCheck {
  invariantId: number;
  name: string;
  passed: boolean;
  detail: string | null;
}

export interface BindingResult {
  binding: RuntimeBinding;
  eligible: boolean;
  invariants: InvariantCheck[];
}
```

### 2.2 Hook Signature

```typescript
// File: src/lib/versionBinding/useDocumentRuntimeBinding.ts (NEW)

export function useDocumentRuntimeBinding(
  docType: string | null,
  versions: Version[],               // from project_document_versions
  selectedVersionId: string | null,  // user's UI selection
): {
  // Core binding objects
  authoritative: RuntimeBinding | null;
  promotionGate: RuntimeBinding | null;
  render: RuntimeBinding | null;
  pipeline: RuntimeBinding | null;

  // Convenience accessors (backward-compatible with 11 downstream consumers)
  authoritativeVersion: Version | null;   // Full Version object — preserves all 11 consumers
  authoritativeVersionId: string | null;
  promotionGateVersionId: string | null;
  effectiveVersionId: string | null;      // authoritativeVersion?.id || selectedVersionId || null

  // Guard
  assertEligible: (action: string, context?: object) => BindingResult;

  // State
  isLoaded: boolean;
  error: string | null;
};
```

**Critical detail:** `authoritativeVersion` returns a **full `Version` object** (not just the id). All 11 downstream consumers call `authoritativeVersion.ci`, `authoritativeVersion.gp`, `authoritativeVersion.status`, etc. The hook derives it as:

```typescript
const authoritativeVersion = useMemo(
  () => versions.find(v => v.id === authoritativeVersionId) || null,
  [versions, authoritativeVersionId]
);
```

### 2.3 Resolution Priority Order (per BindingType)

Each binding type has a deterministic resolution priority:

#### `authoritative` (Promotion gate analysis, lock/unlock decisions)
```
Rule 1: versions.find(v => v.approval_status === 'approved' && v.is_current === true)
Rule 2: filter(approved).sort(created_at DESC)[last]    // newest approved by created_at
Rule 3: null  // no approved versions → lifecyclePhase: 'pending_approval'
```

#### `promotion_gate` (Gate section, note/blocker fetch, CI/GP convergence panels)
```
Rule 1: filter(approved + is_current).sort(version_number DESC)[0]
Rule 2: filter(approved).sort(version_number DESC)[0]
Rule 3: null  // NEVER falls through to selectedVersionId — root cause of oscillation
```

**Critical fix:** `promotion_gate` NEVER falls through to `is_current` or `selectedVersionId`. This was the root cause of the oscillation between versions 3573b98c and c8ca087c.

#### `render` (UI document content, editor, diff viewer)
```
Rule 1: authoritativeVersion?.id (if exists)
Rule 2: selectedVersionId (if exists)
Rule 3: versions[versions.length - 1].id (latest by version_number)
Rule 4: null (no versions exist)
```

#### `pipeline` (Backend ABVR equivalent for frontend-bound pipeline ops)
```
Rule 1: authoritative (approved + current → always wins, even over pinned)
Rule 2: best approved by composite CI/GP score (pickBestScoredVersion logic)
Rule 3: versions.find(v => v.is_current)
Rule 4: versions.sort(version_number DESC)[0]
```
Mirrors ABVR rules A→B→D. Client-side has no `resume_version_id` concept.

---

## 3. 10 Binding Invariants — Guard Mapping

All invariants map to `assertRuntimeBindingEligible` guard conditions:

| # | Invariant | Guard Condition | Action Blocked | Fail Code |
|---|-----------|----------------|----------------|-----------|
| 1 | UI cannot choose authoritative versions locally | `action === 'render' && binding.type === 'authoritative'` | render | `UI_AUTHORITY_OVERRIDE` — 403 |
| 2 | Promotion gate cannot rebind versions | `action === 'promote' && binding.type !== 'promotion_gate'` | promote | `GATE_VERSION_REBIND` — 406 |
| 3 | Background poller cannot change authoritative version | `action === 'set_current' && binding.type === 'authoritative'` | set_current | `POLLER_AUTHORITY_DRIFT` — 409 |
| 4 | Promote-to-script cannot scan/switch versions on render | `action === 'promote' && binding.type === 'render'` | promote | `RENDER_SWITCH_DURING_PROMOTE` — 409 |
| 5 | Feature script writer cannot start without valid bound source and target | `action === 'generate' && (!binding.versionId || binding.source === 'unavailable')` | generate | `BOUND_UNRESOLVED` — 400 |
| 6 | dev-engine-v2 cannot fire from render/remount/query success | `action === 'analyze' && binding.type === 'render'` | analyze | `RENDER_TRIGGERED_PIPELINE` — 406 |
| 7 | Missing/short content = visible blocker, not a retry loop | `action === 'analyze' && binding.metadata.ci === null` | WARN only | `INSUFFICIENT_CONTENT` — 422 |
| 8 | Every doc_type has isolated binding state | `documentId` scoped by `projectId + docType` | all | `CROSS_DOC_TYPE_BINDING_LEAK` — 400 |
| 9 | Every mutation requires explicit source binding + target action | No action without first calling `assertEligible` | all | `IMPLICIT_MUTATION` — 400 |
| 10 | 400/404/406 errors are terminal failures, not retryable | `binding.lifecyclePhase === 'blocked'` → BLOCK with reason | all | `TERMINAL_VALIDATION_ERROR` — fail immediately |

### Guard Implementation Pattern

```typescript
function assertRuntimeBindingEligible(
  binding: RuntimeBinding,
  context: { operation: string; ... }
): BindingResult {
  const violations: InvariantCheck[] = [];

  // Invariant 1
  if (context.operation === 'render' && binding.type === 'authoritative') {
    violations.push({ invariantId: 1, name: 'UI_AUTHORITY_OVERRIDE',
      passed: false, detail: 'UI cannot render authoritative version directly' });
  }
  // ... all 10 invariants
  return {
    binding,
    eligible: violations.length === 0,
    invariants: violations,
  };
}
```

The guard:
- Returns ALL violations (not short-circuits) for debugging
- Emits `[ui][IEL] runtime_binding_violation` log for every violation
- Does NOT throw by default (caller decides whether to fail or warn)

---

## 4. Per-doc_type Isolation Design

### 4.1 Binding Store

```typescript
// File: src/lib/versionBinding/runtimeBindingStore.ts (NEW)

class RuntimeBindingStore {
  private bindings: Map<string, RuntimeBinding[]> = new Map();
  private listeners: Map<string, Set<(bindings: RuntimeBinding[]) => void>> = new Map();

  setBindings(docType: string, bindings: RuntimeBinding[]): void;
  getBindings(docType: string): RuntimeBinding[] | null;
  getBinding(docType: string, type: BindingType): RuntimeBinding | null;
  clearBindings(docType: string): void;     // On doc type switch
  subscribe(docType: string, listener: ...): () => void;
  logState(docType?: string): void;
}
```

### 4.2 Binding State Indexing

Binding state is indexed by `docType`. Switching document types resets all bindings:

```typescript
type BindingStore = Map<string, RuntimeBinding[]>;
// key: doc_type (e.g. "concept_brief", "treatment", "screenplay")
// value: array of 4 bindings (authoritative, promotion_gate, render, pipeline)
```

### 4.3 Cross-Doc-Type Leak Prevention

- The store never caches results across doc_types
- Each call to `resolveBindings()` produces fresh results
- The frontend's `lastPromotionGateVersionRef` pattern (PDE.tsx:836, 1129) remains as a client-side guard, but the resolver itself is stateless
- `clearBindings()` is called whenever `docType` changes in the hook's useEffect

---

## 5. 5-Phase Migration Plan

### Phase 0 — Foundation (No behavioral change)

1. Create `src/lib/versionBinding/` directory:
   - `documentRuntimeBindingTypes.ts` — type definitions
   - `documentRuntimeBindingResolver.ts` — pure resolution logic
   - `assertRuntimeBindingEligible.ts` — invariant guard
   - `runtimeBindingStore.ts` — binding state store
   - `useDocumentRuntimeBinding.ts` — React hook

2. Create test file: `src/__tests__/document-runtime-binding.test.ts`

3. The resolver reads ALL versions and applies rules — no site calls it yet

**Files:** 5 new lib files + 1 new test file
**Rollback:** Delete all 6 files — zero impact

### Phase 1 — Backend: Extract ABVR to shared module

1. Extract `resolveActiveVersionForDoc()` (auto-run/index.ts:907-1056) to:
   `supabase/functions/_shared/documentRuntimeBinding.ts`

2. Replace the function body: `return resolveBackendBinding(supabase, projectId, docType, 'pipeline')`

3. Remove `pickBestScoredVersion()` and `parseVersionScores()` if no other callers

4. Update `needsFreshReview()` (line 1060) to use the shared resolver

**Files:** 1 new (shared backend module), 1 modified (auto-run/index.ts)
**Rollback:** Revert auto-run, delete shared module
**Verify:** ABVR returns same results for all rules A-D

### Phase 2 — Frontend: ProjectDevelopmentEngine.tsx (Core)

1. Replace PDE.tsx lines 840-864 (4 inline useMemos + derived values) with single hook call:

   **BEFORE:**
   ```typescript
   const authoritativeVersion = useMemo(() => { ... }, [versions]);
   const stablePromotionVersion = useMemo(() => { ... }, [versions]);
   const promotionGateVersionId = stablePromotionVersion?.id || null;
   const effectiveVersionId = authoritativeVersion?.id || selectedVersionId || null;
   ```

   **AFTER:**
   ```typescript
   const {
     authoritativeVersion,       // Full Version object — preserves 11 consumers
     authoritativeVersionId,
     promotionGateVersionId,
     effectiveVersionId,
     render,
     assertEligible,
   } = useDocumentRuntimeBinding(selectedDeliverableType, versions, selectedVersionId);
   ```

2. **Preserve** auto-rebind effect (lines 869-878) unchanged — the oscillation root cause was the double-memo pattern at 843-864, not the auto-rebind.

3. **Fix convergenceVersionId** (line 1087):
   ```typescript
   // BEFORE (BUG):
   const convergenceVersionId = selectedVersionId || null;
   // AFTER (FIXED):
   const convergenceVersionId = render?.versionId || null;
   ```
   `convergenceVersionId` should track the rendered version, not the raw `selectedVersionId`. This was the root cause of cross-doc stale invalidation.

4. Update `handlePromote` (line ~1930) to wrap in `assertEligible('promote', ...)` guard

**Files:** 1 modified (ProjectDevelopmentEngine.tsx)
**Rollback:** Restore old 4 memos (keep commented as `// LEGACY - remove after Phase 2 verified`)

### Phase 3 — Hook Integration: useDevEngineV2.ts

1. Replace `currentVersion` derivation (line 265) with resolver's `render` binding:
   ```typescript
   const currentVersion = render?.versionId || null;
   ```

2. Replace auto-select `useEffect` (lines 683-687) with resolver-aware logic:
   - Only auto-select when `render` binding returns `null`
   - Never auto-select `authoritative` or `promotion_gate` versions

3. Remove direct `approvedVersionMap` query (lines 219-240) — resolver provides this

**Files:** 1 modified (useDevEngineV2.ts)
**Rollback:** Restore old version resolution inline

### Phase 4 — SQL RPC Guard Application

Add `assertRuntimeBindingEligible` guard before ALL `set_current_version` call sites:

| File | Call Sites | Risk |
|------|-----------|------|
| supabase/functions/auto-run/index.ts | 14 | LOW — pass-through guard |
| supabase/functions/dev-engine-v2/index.ts | 8 | LOW — pass-through guard |
| supabase/functions/project-folder-engine/index.ts | 1 | LOW — pass-through guard |
| supabase/functions/notes-writers-room/index.ts | 2 | LOW — pass-through guard |
| src/hooks/useDocumentVersions.ts | 1 (client) | LOW — pass-through guard |
| src/components/notes/ChangesetTimeline.tsx | 1 (rollback) | LOW — pass-through guard |

**Files:** 6 files with guard additions
**Rollback:** Revert guard lines — no behavioral change on guard failure, guard blocks before RPC call

### Rollback Strategy Summary

- **Phase 0:** Delete new files — zero risk
- **Phase 1:** Revert auto-run, delete shared module — zero risk
- **Phase 2:** Keep old memos commented with `// LEGACY` marker — rollback = uncomment
- **Phase 3:** Keep old version resolution inline — rollback = restore
- **Phase 4:** Guards are pass-through on failure — rollback = revert guard lines

---

## 6. Edge Case Handling

| Edge Case | Resolver Behavior | UI Behavior |
|-----------|------------------|-------------|
| No versions exist for doc_type | All binding types return `null` with `source: 'unavailable'` | "No versions yet" — user must generate first |
| No documents exist for doc_type | `authoritativeVersion: null`, no binding resolves | Visible empty state, no retry |
| Pinned version conflicts with authoritative | Authoritative wins (invariant A1 from ABVR) | Logged as `pinned_overridden_by_authoritative` |
| Pinned version deleted/missing | Fall through to authoritative or best approved | Logged as `pinned_version_missing` |
| CI/GP scores missing from meta_json | Fall back to version_number sort, then is_current | Analysis blocked until scores exist (Invariant 7) |
| Network error on DB query | Error logged, binding returns `source: 'error'` | Visible error state, terminal (Invariant 10) |
| Multiple docs match doc_type | Picks newest by `created_at DESC` (existing behavior) | Consistent with current document selection |
| doc_type has no approved versions | Returns non-approved version for `render` binding, null for `authoritative/promotion_gate` | "Pending approval" state |
| Empty content (newly created version) | Version exists, content length check is external | Short content → "No content to analyze" (Invariant 7) |
| 400/404/406 errors from DB | Return `{ eligible: false, violations: [...] }` — terminal | Fail-closed, no degraded fallback (Invariant 10) |

---

## 7. File Change Summary

### Core Files (5 new)

| File | Purpose | Lines (est.) |
|------|---------|-------------|
| `src/lib/versionBinding/documentRuntimeBindingTypes.ts` | Type definitions (BindingType, RuntimeBinding, BindingResult, InvariantCheck) | 60 |
| `src/lib/versionBinding/documentRuntimeBindingResolver.ts` | Pure resolution logic — `resolveBindings()`, `resolveSingleBinding()` | 120 |
| `src/lib/versionBinding/assertRuntimeBindingEligible.ts` | Invariant guard — `assertRuntimeBindingEligible()` with all 10 invariants | 80 |
| `src/lib/versionBinding/runtimeBindingStore.ts` | Binding state store (Map-based, framework-agnostic) | 80 |
| `src/lib/versionBinding/useDocumentRuntimeBinding.ts` | React hook wrapping resolver + store + guard | 100 |

### Surface Integration Files (8 modified)

| File | Change | Risk |
|------|--------|------|
| `src/pages/ProjectDevelopmentEngine.tsx` | Replace lines 843-864 (4 memos) with hook; preserve auto-rebind (869-878); fix convergenceVersionId (1087); wrap handlePromote (~1930) | MEDIUM |
| `src/hooks/useDevEngineV2.ts` | Replace currentVersion derivation (265); replace auto-select (683-687); remove approvedVersionMap (219-240) | LOW |
| `src/components/project/VersionsPanel.tsx` | Add `assertEligible` guard before setCurrentVersion calls (lines 121, 187, 190, 255) | LOW |
| `src/components/devengine/GateSection.tsx` | Read promotionGateVersionId from resolver; wrap gate analysis in guard | LOW |
| `src/components/devengine/PromotionControls.tsx` | Wrap promote flow in binding guard | LOW |
| `src/hooks/useDocumentVersions.ts` | Add `assertEligible` guard before RPC call (line 51) | LOW |
| `supabase/functions/auto-run/index.ts` | Extract ABVR to shared module; update needsFreshReview | LOW |
| `supabase/functions/_shared/documentRuntimeBinding.ts` (new) | Backend mirror of frontend resolver contract | LOW |

### Backend Files (1 new)

| File | Purpose |
|------|---------|
| `supabase/functions/_shared/documentRuntimeBinding.ts` | Backend binding resolver — `resolveBackendBinding()`, `resolveABVR()` |

### Test Files (1 new)

| File | What it tests |
|------|--------------|
| `src/__tests__/document-runtime-binding.test.ts` | All 4 binding types, 10 invariants, cross-doc isolation, backward compatibility |

### Files NOT Modified

- `supabase/migrations/20260423013000_fix_set_current_version.sql` — no change needed
- `supabase/functions/_shared/transitionLedger.ts` — no change (resolver emits same events)
- `supabase/functions/notes-writers-room/index.ts` — no change (guards not needed for non-version writes)
- **0 schema changes** — all existing columns used

---

## 8. Key Code Reference Map

### Current State (Before Migration)

| Variable | File:Line | Current Logic | Binding Type |
|----------|-----------|---------------|--------------|
| `authoritativeVersion` | PDE.tsx:843 | `approved + is_current`, fallback newest approved | authoritative |
| `stablePromotionVersion` | PDE.tsx:851 | `approved + is_current` by version_number DESC, fallback approved DESC | promotion_gate |
| `promotionGateVersionId` | PDE.tsx:861 | `stablePromotionVersion?.id \|\| null` | promotion_gate |
| `effectiveVersionId` | PDE.tsx:864 | `authoritativeVersion?.id \|\| selectedVersionId \|\| null` | authoritative + render |
| `convergenceVersionId` | PDE.tsx:1087 | `selectedVersionId \|\| null` (**BUG** — should be promotion_gate) | render (WRONG) |
| `selectedVersionId` | useDevEngineV2.ts:244 | User picks or auto-selects latest | render |
| `currentVersion` | useDevEngineV2.ts:265 | `is_current` flag, fallback highest version_number | render |
| `resolveActiveVersionForDoc` | auto-run/index.ts:914-1056 | ABVR rules A-D | pipeline |
| `approvedVersionMap` | useDevEngineV2.ts:219 | Query: most recent approved per doc | render |
| `set_current_version` RPC | migrations/SQL | DB-level is_current flag | pipeline |

### After Migration (Target State)

| Variable | Source | Binding Type | Change |
|----------|--------|--------------|--------|
| `authoritativeVersion` | `useDocumentRuntimeBinding` hook | authoritative | **Same logic, unified via hook — preserves full Version object** |
| `stablePromotionVersion` | REMOVED | — | Merged into `promotionGate` via resolver |
| `promotionGateVersionId` | Derived from `promotionGate` binding | promotion_gate | Same logic, from resolver |
| `effectiveVersionId` | `authoritativeVersion?.id \|\| selectedVersionId \|\| null` | authoritative + render | No change |
| `convergenceVersionId` | `promotionGateVersionId` | promotion_gate | **FIXED** — was using selectedVersionId |
| Auto-rebind effect (869-878) | PRESERVED unchanged | — | **Key REVISE decision** — kept as-is |
| `selectedVersionId` | User picks or auto-selects (render binding) | render | No change |
| `currentVersion` | `useDocumentRuntimeBinding` → `render` binding | render | Uses resolver |
| ABVR | `resolveBackendBinding(..., 'pipeline')` | pipeline | Extracted to shared module |
| `set_current_version` | Preceded by `assertRuntimeBindingEligible` guard | pipeline | Same behavior + guard |

---

## 9. Implementation Order (Trinity)

1. **Create** `src/lib/versionBinding/` and all 5 core files (Phase 0)
2. **Create** test file — verify all 4 binding types and 10 invariants
3. **Create** `supabase/functions/_shared/documentRuntimeBinding.ts` — backend mirror (Phase 1)
4. **Phase 1:** Integrate into auto-run — replace ABVR, update needsFreshReview
5. **Phase 2:** Integrate into ProjectDevelopmentEngine.tsx — replace 4 memos, fix convergenceVersionId, wrap handlePromote
6. **Phase 3:** Integrate into useDevEngineV2.ts — replace currentVersion, replace auto-select, remove approvedVersionMap
7. **Phase 4:** Add guards to all set_current_version call sites (6 files)
8. **Surface components:** Update VersionsPanel, GateSection, PromotionControls, useDocumentVersions
9. **Test end-to-end:** version resolution, promotion gate, convergence, auto-run pipeline, oscillation stability

---

## 10. Verification Checklist

- [ ] `useDocumentRuntimeBinding(docType, versions, selectedVersionId)` returns `authoritativeVersion` matching current PDE.tsx:843 behavior
- [ ] `useDocumentRuntimeBinding(...)` returns `promotionGate` matching current `stablePromotionVersion` PDE.tsx:851 behavior (version_number DESC sort)
- [ ] `render` binding produces `authoritativeVersion?.id \|\| selectedVersionId \|\| versions[-1].id` — matches current `effectiveVersionId` + fallback
- [ ] `promotion_gate` binding NEVER resolves to `selectedVersionId` — eliminates oscillation
- [ ] `convergenceVersionId` uses `render?.versionId` (promotion_gate binding), NOT raw `selectedVersionId`
- [ ] Auto-rebind effect (PDE.tsx:869-878) is **unchanged** — no regressions
- [ ] `assertRuntimeBindingEligible({ type: 'authoritative' }, 'render')` → `eligible: false` (Invariant 1)
- [ ] `assertRuntimeBindingEligible({ type: 'render' }, 'promote')` → `eligible: false` (Invariant 2)
- [ ] `assertRuntimeBindingEligible({ type: 'pipeline' }, 'generate')` with all valid → `eligible: true`
- [ ] 0 schema changes — all existing columns used
- [ ] Backend `resolveBackendBinding` returns same results as current ABVR for rules A-D
- [ ] All 10 invariants have corresponding guard conditions in `assertRuntimeBindingEligible`
- [ ] Per-doc-type isolation: switching doc types clears stale bindings
- [ ] 14 set_current_version calls in auto-run have guard
- [ ] 8 set_current_version calls in dev-engine-v2 have guard
- [ ] Edge case handling: no versions, empty content, pinned vs approved conflict, network errors all produce correct lifecycle phases