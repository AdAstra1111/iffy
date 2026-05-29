# DocumentRuntimeBinding Resolver — Architecture Package

**Design Authority:** Architect (Agent Smith 3)
**Router:** Architect → Morpheus (validate) → Trinity (build) → Keymaker
**Context Task:** t_ad7ed6bf (re-dispatch; prior scratch workspace lost at t_2fa78acd)
**Validation Parent:** t_120a1275

---

## 1. Problem

The IFFY frontend has **8 fragmented version authorities** resolving the same question — "which version ID should I bind to?" — in inconsistent ways:

| # | Authority | Location | Surface | Problem |
|---|-----------|----------|---------|---------|
| 1 | `authoritativeVersion` | DevelopmentEngine.tsx:843 | useMemo | Re-resolves every 10s poll, loose fallback chain |
| 2 | `stablePromotionVersion` | DevelopmentEngine.tsx:851 | useMemo | Duplicate logic, separate filter/sort |
| 3 | `promotionGateVersionId` | DevelopmentEngine.tsx:861 | derived | Passes through from stablePromotionVersion; implicit |
| 4 | `effectiveVersionId` | DevelopmentEngine.tsx:864 | derived | authoritative || selectedVersionId — no type tracking |
| 5 | `convergenceVersionId` | DevelopmentEngine.tsx:1087 | derived | selectedVersionId — used only for diagnostic logging |
| 6 | `selectedVersionId` | useDevEngineV2.ts:244 | useState | User-picked, no binding type metadata |
| 7 | **ABVR** (backend) | auto-run/index.ts:907 | function | Complex score-based resolver, no client-side equivalent |
| 8 | `job.current_document` | auto-run/index.ts | doc_type | Not a version ID, but entangled in binding context |

Each consumer independently re-resolves version IDs on every render cycle. The only coordination is ad-hoc `useMemo` keyed on `[versions]` — there is no shared binding state, no binding type tracking, and no invariant enforcement.

---

## 2. Solution: DocumentRuntimeBinding Resolver

A centralized, shared resolver with **4 binding types** and an **invariant guard** that replaces all inline version resolution.

### 2.1 Four Binding Types

| Binding Type | Enum Value | Resolution Logic | Used By |
|-------------|------------|-----------------|---------|
| **Authoritative** | `authoritative` | `approval_status='approved' AND is_current=true`. Fallback: newest approved by created_at. | Promotion gate analysis, lock/unlock decisions |
| **Promotion Gate** | `promotion_gate` | Approved versions sorted by version_number DESC (strict mode = approved+is_current; fallback = best approved by version_number). **Never falls through to selectedVersionId**. | Gate section, note/blocker fetch, CI/GP convergence panels |
| **Render** | `render` | Authoritative || selectedVersionId. Always has a value (defaults to latest version if neither exists). | UI document content, editor, diff viewer |
| **Pipeline** | `pipeline` | Backend ABVR equivalent for frontend-bound pipeline operations. Mirrors `resolveActiveVersionForDoc` contract. | Autorun triggers, pipeline init, batch operations |

### 2.2 Binding State Shape

Every binding is a first-class object with **type, versionId, source, and timestamp**:

```typescript
interface RuntimeBinding {
  type: 'authoritative' | 'promotion_gate' | 'render' | 'pipeline';
  versionId: string | null;
  source: string;         // "approved_and_current" | "newest_approved" | "best_version_number" | "user_selected" | "auto_select_latest"
  boundAt: number;        // Date.now() when bound
  docType: string;        // doc_type context — binding is per-document-type
}
```

### 2.3 Per-Doc-Type Isolation

Binding state is indexed by `docType` (document type). Switching document types resets all bindings. This satisfies **Invariant 8** — every doc_type has isolated binding state.

```typescript
type BindingStore = Map<string, RuntimeBinding[]>;
// key: doc_type (e.g. "concept_brief", "treatment", "screenplay")
// value: array of 4 bindings (authoritative, promotion_gate, render, pipeline)
```

---

## 3. Core Files (5)

### File 1 — `src/lib/versionBinding/documentRuntimeBindingTypes.ts`

**Purpose:** Canonical type definitions.

```typescript
// Binding type enum
export type BindingType = 'authoritative' | 'promotion_gate' | 'render' | 'pipeline';

// A resolved binding result
export interface RuntimeBinding {
  type: BindingType;
  versionId: string | null;
  source: BindingSource;
  boundAt: number;
  docType: string | null;
}

export type BindingSource =
  | 'approved_and_current'        // strict invariant match
  | 'newest_approved'             // fallback by created_at
  | 'best_version_number'         // highest version_number among approved
  | 'user_selected'               // explicitly picked by user
  | 'auto_select_latest'          // default when nothing is selected
  | 'pending'                     // not yet resolved
  | 'error'                       // resolution failed
  | 'unavailable';                // no versions exist

// Result from a binding operation
export interface BindingResult {
  binding: RuntimeBinding;
  eligible: boolean;
  invariants: InvariantCheck[];
}

export interface InvariantCheck {
  invariantId: number;
  name: string;
  passed: boolean;
  detail: string | null;
}
```

**Rationale:** One file, no dependencies. Every consumer imports types from here. Zero schema — all in-memory.

---

### File 2 — `src/lib/versionBinding/documentRuntimeBindingResolver.ts`

**Purpose:** Pure resolution logic — no React, no side effects. Deterministic, testable, shareable.

```typescript
// resolve all 4 binding types from a version list
export function resolveBindings(
  versions: Version[],           // from project_document_versions query
  selectedVersionId: string | null,
  docType: string,
): RuntimeBinding[];

// resolve a single binding type
export function resolveSingleBinding(
  type: BindingType,
  versions: Version[],
  selectedVersionId: string | null,
  docType: string,
): RuntimeBinding;
```

**Resolution rules per type (mirrors existing logic):**

```
authoritative:
  1. versions.find(v => v.approval_status === 'approved' && v.is_current === true)
  2. filter(approved).sort(created_at DESC)[last]  // newest approved

promotion_gate:
  1. filter(approved+is_current).sort(version_number DESC)[0]
  2. filter(approved).sort(version_number DESC)[0]
  3. null  // NEVER falls through to selectedVersionId

render:
  1. authoritative.id if exists
  2. selectedVersionId if exists
  3. versions[versions.length - 1].id  // latest by version_number
  4. null (no versions)

pipeline:
  1. authoritative.id  (approved + current)
  2. latest approved by composite score (CI+GP)
  3. versions.find(v => v.is_current)
  4. versions.sort(version_number DESC)[0]
  (mirrors ABVR rules A→B→D; client-side has no resume_version_id concept)
```

**Rationale:** Centralizes the 4 resolution algorithms into one pure function. Each consumer calls `resolveBindings()` once. No duplicate filter/sort/map chains. Tests prove correctness.

---

### File 3 — `src/lib/versionBinding/assertRuntimeBindingEligible.ts`

**Purpose:** The invariant guard. Called BEFORE any consumer uses a binding for a side-effect operation (promotion, gate analysis, note commit, render init).

```typescript
export function assertRuntimeBindingEligible(
  binding: RuntimeBinding,
  context: {
    operation: 'promote' | 'gate_analysis' | 'notes_fetch' | 'render_init' | 'pipeline_trigger';
    targetDocType: string;
    projectId: string;
    jobId?: string;
  }
): {
  eligible: boolean;
  violations: { invariantId: number; message: string }[];
};
```

**The 10 Invariants enforced:**

| # | Invariant | Enforced Rule | Violation Produces |
|---|-----------|--------------|-------------------|
| 1 | **UI cannot choose authoritative version locally** | `authoritative` binding must use resolver, not `useState`/`useMemo` in consumer code | `UI_AUTHORITY_OVERRIDE` — 403 |
| 2 | **Promotion gate cannot rebind versions** | `promotion_gate` binding must use resolver, never `selectedVersionId` fallthrough | `GATE_VERSION_REBIND` — 406 |
| 3 | **Background poller cannot change authoritative version** | `authoritative` binding only changes on explicit approval+current mutation (via `set_current_version` RPC) | `POLLER_AUTHORITY_DRIFT` — 409 |
| 4 | **Promote-to-script cannot scan/switch versions on render** | `promotion_gate` binding locked during promote operation; render version cannot be re-resolved mid-promote | `RENDER_SWITCH_DURING_PROMOTE` — 409 |
| 5 | **Feature script writer cannot start without valid bound source and target** | Both `render` (source) and `pipeline` (target) must resolve to non-null versionIds | `BOUND_UNRESOLVED` — 400 |
| 6 | **dev-engine-v2 cannot fire from render/remount/query success** | `render` binding changes must not trigger pipeline operations — only explicit user action can | `RENDER_TRIGGERED_PIPELINE` — 406 |
| 7 | **Missing/short content must become visible blocker, not retry loop** | If `render` binding resolves but content is empty/null, guard returns `INSUFFICIENT_CONTENT` — caller must show blocker UI, not retry | `INSUFFICIENT_CONTENT` — 422 |
| 8 | **Every doc_type has isolated binding state** | Resolver is keyed by `docType`; switching doc types clears obsolete bindings. Violation if stale bindings from other doc_type leak in | `CROSS_DOC_TYPE_BINDING_LEAK` — 400 |
| 9 | **Every mutation requires explicit source binding + target action** | Any side-effect operation (promote, lock, change-content) must carry `{ sourceBinding, targetAction }` in the context | `IMPLICIT_MUTATION` — 400 |
| 10 | **400/404/406 errors are terminal validation failures, not retryable network events** | Guard must throw/fail-closed on these — no degraded fallback, no silent retry | `TERMINAL_VALIDATION_ERROR` — fail immediately |

**Behavior:**

- Returns `{ eligible: true, violations: [] }` when all invariants pass
- Returns `{ eligible: false, violations: [...] }` with ALL violations (not short-circuits) for debugging
- Emits `[ui][IEL] runtime_binding_violation` log for every violation
- Does NOT throw by default (caller decides whether to fail or warn)

---

### File 4 — `src/lib/versionBinding/runtimeBindingStore.ts`

**Purpose:** Durable binding state — per `docType` binding store with change notification.

```typescript
// Singleton binding store (no React — framework agnostic)
class RuntimeBindingStore {
  private bindings: Map<string, RuntimeBinding[]> = new Map();
  private listeners: Map<string, Set<(bindings: RuntimeBinding[]) => void>> = new Map();

  // Set all 4 bindings for a doc type
  setBindings(docType: string, bindings: RuntimeBinding[]): void;

  // Get all 4 bindings for a doc type
  getBindings(docType: string): RuntimeBinding[] | null;

  // Get a specific binding type for a doc type
  getBinding(docType: string, type: BindingType): RuntimeBinding | null;

  // Clear bindings for a doc type (on doc type switch)
  clearBindings(docType: string): void;

  // Subscribe to binding changes for a doc type
  subscribe(docType: string, listener: (bindings: RuntimeBinding[]) => void): () => void;

  // Logging
  logState(docType?: string): void;
}
```

**Rationale:** The store decouples binding state from React's render cycle. The resolver produces bindings; the store holds them; consumers read from the store. This prevents re-resolution on every render.

---

### File 5 — `src/lib/versionBinding/useDocumentRuntimeBinding.ts`

**Purpose:** React hook that wires resolver, store, and invariant guard together.

```typescript
export function useDocumentRuntimeBinding(
  docType: string | null,
  versions: Version[],
  selectedVersionId: string | null,
): {
  // All 4 resolved bindings
  authoritative: RuntimeBinding | null;
  promotionGate: RuntimeBinding | null;
  render: RuntimeBinding | null;
  pipeline: RuntimeBinding | null;

  // Convenience accessors (mirrors existing API for backward compat)
  authoritativeVersionId: string | null;
  promotionGateVersionId: string | null;
  effectiveVersionId: string | null;

  // Guard
  assertEligible: (operation: string, context?: object) => BindingResult;

  // State
  isLoaded: boolean;
  error: string | null;
};
```

**Behavior:**
1. On mount and when `[docType, versions, selectedVersionId]` change — calls `resolveBindings()`
2. Writes results to `RuntimeBindingStore`
3. Returns binding objects + convenience accessors (backward compatible)
4. `assertEligible` delegates to `assertRuntimeBindingEligible` with current bindings and operation context

---

## 4. Surface Integration Files (8)

### File 6 — `src/pages/ProjectDevelopmentEngine.tsx` (patch)

**Current state:** Lines 840-878 — 3 inline `useMemo` blocks (`authoritativeVersion`, `stablePromotionVersion`, `effectiveVersionId`) + auto-rebind effect (lines 869-878).

**Change:** Replace lines 840-878 with a single call to `useDocumentRuntimeBinding`:

```typescript
// BEFORE (inline):
const authoritativeVersion = useMemo(() => { ... }, [versions]);
const stablePromotionVersion = useMemo(() => { ... }, [versions]);
const promotionGateVersionId = stablePromotionVersion?.id || null;
const effectiveVersionId = authoritativeVersion?.id || selectedVersionId || null;
const prevAuthVersionRef = useRef<string | null>(null);
useEffect(() => { ... auto-rebind ... }, [authoritativeVersion?.id]);

// AFTER (centralized):
const {
  authoritativeVersionId,
  promotionGateVersionId,
  effectiveVersionId,
  render,
  assertEligible,
} = useDocumentRuntimeBinding(selectedDeliverableType, versions, selectedVersionId);
```

**Eliminated:** 3 useMemos, 1 useEffect, 1 useRef — all replaced by one hook call.

**Additional changes:**
- Line 1087: replace `const convergenceVersionId = selectedVersionId || null;` with `const convergenceVersionId = render?.versionId || null;` (convergence should track rendered version, not raw selectedVersionId)
- Line 1930 (`handlePromote`): wrap promote logic in `assertEligible('promote', { ... })` guard
- Lines 880-893 (`promotionGateRuns`, `promotionGateAnalysis`): already use `promotionGateVersionId` — no change needed, value comes from resolver now

---

### File 7 — `src/hooks/useDevEngineV2.ts` (patch)

**Current state:** Lines 243-244 — raw `useState` for `selectedVersionId` with no binding context.

**Change:** Wrap `selectedVersionId` state with binding-aware selection:

```typescript
// AFTER:
const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

// Resolve bindings from versions
const {
  authoritativeVersionId,
  promotionGateVersionId,
  effectiveVersionId,
  render,
  assertEligible,
} = useDocumentRuntimeBinding(selectedDocType, versions, selectedVersionId);

// Auto-select latest on doc change (keep — this is scope-discover for render binding)
const currentVersion = render?.versionId || null;
```

**Rationale:** The hook still owns `selectedVersionId` (user chooses it), but the binding resolution is externalized. `useDocumentRuntimeBinding` derives the 4 binding types from the same state.

---

### File 8 — `src/components/project/VersionsPanel.tsx` (patch)

**Current state:** Lines 121, 187, 190, 255 — version selection calls `setCurrentVersion.mutate` directly.

**Change:** Wrap version selection in `assertEligible` guard:

```typescript
// AFTER - version selection:
const { assertEligible } = useDocumentRuntimeBinding(docType, versions, selectedVersionId);

const handleSetCurrent = (versionId: string) => {
  const result = assertEligible('set_current', {
    targetVersionId: versionId,
    sourceBinding: 'authoritative',
  });
  if (!result.eligible) {
    // Show warning in UI — invariant violation
    return;
  }
  setCurrentVersion.mutate({ documentId: effectiveDocId, versionId });
};
```

**Rationale:** Prevents the VersionsPanel from bypassing binding guards when setting `is_current`.

---

### File 9 — `src/components/devengine/GateSection.tsx` (patch)

**Current state:** Uses `promotionGateVersionId` forwarded as prop from DevelopmentEngine.tsx.

**Change:** Read `promotionGateVersionId` from resolver:

```typescript
// AFTER:
const { promotionGateVersionId, assertEligible } = useDocumentRuntimeBinding(
  docType, versions, selectedVersionId
);

// Before running gate analysis:
const eligible = assertEligible('gate_analysis', { ... });
if (!eligible.eligible) {
  // Show blocker — gate cannot run on this version
  return <GateBlocked violations={eligible.violations} />;
}
```

---

### File 10 — `src/components/devengine/PromotionControls.tsx` (patch)

**Current state:** Uses `effectiveVersionId` and raw `selectedDeliverableType` for promote.

**Change:** Wrap promote flow in binding guard:

```typescript
// AFTER:
const { render, promotionGateVersionId, assertEligible } = useDocumentRuntimeBinding(
  docType, versions, selectedVersionId
);

const handlePromote = () => {
  const result = assertEligible('promote', {
    sourceBinding: render,
    targetGate: promotionGateVersionId,
  });
  if (!result.eligible) {
    setBlocker({ type: 'promote_blocked', violations: result.violations });
    return;
  }
  // ... existing promote logic
};
```

**This satisfies Invariants 4, 5, 6, and 9 in one place.**

---

### File 11 — `src/hooks/useDocumentVersions.ts` (patch)

**Current state:** Line 51 calls `rpc('set_current_version', ...)` directly.

**Change:** No change to the RPC call itself (it's the sole valid write path), but add inline guard:

```typescript
// AFTER:
const { assertEligible } = useDocumentRuntimeBinding(
  selectedDocType, versions, selectedVersionId
);

const setCurrentVersion = async (versionId: string) => {
  const result = assertEligible('set_current', {
    sourceBinding: 'authoritative',
    targetVersionId: versionId,
  });
  if (!result.eligible) {
    throw new Error(`[binding-guard] set_current_version blocked: ${JSON.stringify(result.violations)}`);
  }
  // ... existing RPC call
};
```

---

### File 12 — `src/lib/versionBinding/supabaseDocumentRuntimeBinding.ts` (backend shared module)

**Purpose:** Shared backend module that mirrors the frontend resolver contract. The ABVR function and the client-side `pipeline` binding type must produce the same results for the same versions.

**Location:** `supabase/functions/_shared/documentRuntimeBinding.ts`

```typescript
// Backend module — importable by auto-run, dev-engine-v2, project-folder-engine

export type BindingType = 'authoritative' | 'promotion_gate' | 'render' | 'pipeline';

export interface BackendBindingResult {
  versionId: string | null;
  source: string;
  reason: string;
}

// Pure resolver — same logic as client-side but returns flat result
export function resolveBackendBinding(
  type: BindingType,
  versions: BackendVersion[],
  job?: { resume_version_id?: string; resume_document_id?: string; follow_latest?: boolean },
): BackendBindingResult;

// ABVR entry point — wraps resolveBackendBinding with job-aware rules
export async function resolveABVR(
  supabase: any,
  job: any,
  documentId: string,
  ctx: any,
): Promise<BackendBindingResult | null>;
```

**Rationale:** The current ABVR function at auto-run/index.ts:907 is inlined in a 13,590-line file. Extracting it to `_shared/` makes it testable and importable by other edge functions. The `resolveBackendBinding` function mirrors the client-side `resolveSingleBinding` signature, ensuring the same deterministic algorithm runs on both sides.

---

### File 13 — `src/__tests__/document-runtime-binding.test.ts` (new file)

**Purpose:** Comprehensive test suite covering all 4 binding types, 10 invariants, and cross-doc-type isolation.

**Test categories:**
1. **authoritative resolution** — strict match, fallback, empty versions
2. **promotion_gate resolution** — never falls through to selectedVersionId
3. **render resolution** — authoritative wins, then selected, then latest
4. **pipeline resolution** — mirrors ABVR backend logic
5. **assertRuntimeBindingEligible** — all 10 invariants individually
6. **Per-doc-type isolation** — doc type switch clears bindings
7. **Cross-doc-type binding leak detection** — invariant 8 enforcement
8. **Backward compatibility** — existing consumption patterns still work

---

## 5. Integration Summary

### 5.1 File Change Manifest

| # | File | Action | Lines Changed | Impact |
|---|------|--------|--------------|--------|
| 1 | `src/lib/versionBinding/documentRuntimeBindingTypes.ts` | **CREATE** | ~80 | Types + interfaces — pure TS |
| 2 | `src/lib/versionBinding/documentRuntimeBindingResolver.ts` | **CREATE** | ~120 | 4 resolution algorithms — pure functions |
| 3 | `src/lib/versionBinding/assertRuntimeBindingEligible.ts` | **CREATE** | ~100 | 10 invariant guard — pure functions |
| 4 | `src/lib/versionBinding/runtimeBindingStore.ts` | **CREATE** | ~100 | Singleton binding store, no React |
| 5 | `src/lib/versionBinding/useDocumentRuntimeBinding.ts` | **CREATE** | ~90 | React hook — wires resolver + store |
| 6 | `src/pages/ProjectDevelopmentEngine.tsx` | **PATCH** | ~40 replaced (840-878) | Remove 3 useMemos + 1 useEffect |
| 7 | `src/hooks/useDevEngineV2.ts` | **PATCH** | ~15 | Add hook + binding accessors |
| 8 | `src/components/project/VersionsPanel.tsx` | **PATCH** | ~15 (121, 187, 190, 255) | Wrap set-current in guard |
| 9 | `src/components/devengine/GateSection.tsx` | **PATCH** | ~10 | Read binding from resolver |
| 10 | `src/components/devengine/PromotionControls.tsx` | **PATCH** | ~20 | Wrap promote in guard |
| 11 | `src/hooks/useDocumentVersions.ts` | **PATCH** | ~10 | Add guard on set_current_version |
| 12 | `supabase/functions/_shared/documentRuntimeBinding.ts` | **CREATE** | ~150 | Extract ABVR to shared module |
| 13 | `src/__tests__/document-runtime-binding.test.ts` | **CREATE** | ~200 | Full test suite |

**Total: 5 new core files + 8 surface patches = 13 file changes. 0 schema changes.**

### 5.2 Already Clean (no change needed)

These existing bindings satisfy the design criteria and do NOT need refactoring:
- `approvedVersionMap` (useDevEngineV2.ts:219-240) — query-only, no binding mutation
- `currentVersion` (useDevEngineV2.ts:265) — derivation from `is_current`, no side effects
- `promotionGateRuns` / `promotionGateAnalysis` (DevelopmentEngine.tsx:880-893) — already keyed on `promotionGateVersionId`, will read from resolver

### 5.3 IEL Event Alignment

The `runtimeBindingStore` emits IEL events for binding operations:

| Event | Trigger | Payload |
|-------|---------|---------|
| `authoritative_version_bound` | authoritative binding resolved/changed | docType, versionId, source |
| `promotion_gate_version_bound` | promotion_gate binding resolved/changed | docType, versionId, source |
| `render_version_bound` | render binding resolved/changed | docType, versionId, source |
| `runtime_binding_violation` | invariant check failed | invariantId, operation, violations[] |
| `cross_doc_type_binding_switch` | docType changed, bindings reset | oldDocType, newDocType |

---

## 6. Migration Path

### Phase 1 — Create resolver + hook (doesn't change behavior)
1. Create 5 core files (files 1-5) — all pure code, zero side effects
2. Write the test suite (file 13) — prove correctness of the resolver
3. Push + deploy — nothing uses the resolver yet

### Phase 2 — Integrate DevelopmentEngine.tsx (files 6-7)
6. Patch DevelopmentEngine.tsx inline memos with `useDocumentRuntimeBinding` hook
7. Patch useDevEngineV2.ts to expose binding accessors
8. Validate: promote flow still works without regression

### Phase 3 — Integrate surface consumers (files 8-11)
9. Patch VersionsPanel.tsx — wrap set-current in guard
10. Patch GateSection.tsx — read binding from resolver
11. Patch PromotionControls.tsx — wrap promote in guard
12. Patch useDocumentVersions.ts — add guard on set_current_version

### Phase 4 — Extract backend ABVR (file 12)
13. Extract ABVR to `_shared/documentRuntimeBinding.ts`
14. Replace inline ABVR in auto-run/index.ts with shared import
15. Validate: auto-run pipeline produces same version selections

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Version equivalence mismatch (resolver vs inline logic) | Low | Medium | Tests prove deterministic equivalence. Wiretap mode: run resolver alongside existing code, log mismatches |
| Render cycle regression (too many re-resolutions) | Low | Medium | `RuntimeBindingStore` decouples state from React. Resolver only fires on `[docType, versions, selectedVersionId]` change |
| Cross-doc-type switching breaks binding state | Low | High | Per-doc-type isolation is Invariant 8. Store clears bindings on type switch |
| Backward compat break for components importing version IDs | Low | High | Hook returns `authoritativeVersionId` / `promotionGateVersionId` / `effectiveVersionId` — same named accessors as current inline code |
| ABVR backend extraction fails on edge cases | Low | High | Phase 4 has wiretap validation — compare extracted results with inline ABVR for 100 runs before switching |

### Rollback Strategy

Each phase is independently revertible:
- **Phase 1:** No consumers — delete the files
- **Phase 2-3:** Revert the patch — the inline memos are removed but the resolver hook returns exact equivalents
- **Phase 4:** Import file 12 but keep inline ABVR active behind a feature flag

---

## 8. Wiretap / Observability

During migration, enable "wiretap mode": the resolver runs alongside existing inline code but its results are only logged, not consumed. This allows validation without risk.

```typescript
// Wiretap mode — log differences if resolver disagrees with inline code
if (ENABLE_BINDING_WIRETAP) {
  const resolverBindings = resolveBindings(versions, selectedVersionId, docType);
  const inlineAuthoritative = /* existing inline computation */;
  if (resolverBindings.find(b => b.type === 'authoritative')?.versionId !== inlineAuthoritative?.id) {
    console.warn(`[binding-wiretap] authoritative_version_mismatch { ... }`);
  }
}
```

---

## 9. Contract with Downstream Agents

### For Trinity (build agent):
- Create 5 core lib files under `src/lib/versionBinding/`
- Create shared backend module under `supabase/functions/_shared/`
- Patch 6 existing files (6-11)
- Write test suite
- 0 schema changes

### For Keymaker (test/verify):
- Verify `document-runtime-binding.test.ts` passes
- Verify `promotion-gate-cross-doc-type-binding.test.ts` still passes (backward compat)
- Verify auto-run integration test still passes (Phase 4)
- Wiretap mode for 24h before full cutover

---

*End of Architecture Package. Router: t_ad7ed6bf → t_120a1275 (Morpheus — validation)*
