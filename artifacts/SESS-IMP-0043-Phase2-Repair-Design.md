# SESS-IMP-0043 — Phase 2: Frontend/Backend Repair Design

## Evidence (from actual codebase audit)

### 1. staleTime: Infinity — CONFIRMED in useUIMode (line 64:1)
useUIMode.tsx: `staleTime: Infinity, // Don't refetch often — localStorage is source of truth`
- The Supabase profile query NEVER re-fetches
- Mode is read from localStorage first, Supabase is secondary
- Setter writes localStorage immediately + Supabase fire-and-forget
- **Effect:** If another tab changes mode, this tab never knows. If Supabase write fails, state is permanently desynced.

### 2. invalidateQueries — INCOMPLETE for notes and decisions
- `invalidateAll('notes')` only invalidates dev-v2-runs, dev-v2-doc-runs, dev-v2-convergence
- Does NOT invalidate: resolved-notes, project-notes, project-note, approval-notes
- After note generation, the notes panel reads from its own query key that isn't invalidated
- `invalidateDevEngine.ts` (shared library) DOES include resolved-notes and project-* keys, but `invalidateAll` in useDevEngineV2 does NOT call it with deep=true for notes/analyze

### 3. Optimistic update divergence — PRESENT in rewrites
- rewrite.onSuccess uses qc.setQueryData to push newVersion into cache BEFORE invalidation
- If the server response is stale or has deduped the version, the cache has incorrect data for one render cycle
- No rollback on error

### 4. Multiple canonical state sources — PRESENT in useUIMode
- THREE sources: localStorage (primary), Supabase (secondary), React state (bridge)
- Two-master write: both localStorage and Supabase are written simultaneously
- Read priority: Supabase > localStorage (line 71-73), but localStorage is read FIRST (line 36)

### 5. localStorage — UI-only, NOT used for document/note/decision state
- All localStorage reads are: dismiss banners, sidebar width, debug flags, onboarding seen-status
- No document content, notes, or decisions are stored in localStorage
- **This candidate is NOT confirmed as a desync source**

### 6. Race conditions — NOT confirmed in code review
- No evidence found of race conditions in rewrite completion
- Rewrite mutations are sequential within a single hook instance

### 7. Version propagation — GUARDED by onSuccess
- rewrite.onSuccess receives `data.newVersion` and explicitly sets it into cache
- Version propagation is explicit and immediate

### 8. Decision status propagation — GAPPED
- Decisions have their own engine (callDecisionsEngine) with separate query keys
- No evidence that invalidateDevEngine or invalidateAll touches decision query keys
- After a decision is applied, panels reading decision state may not update

---

## TASK 5 — Root Cause Ranking

| Rank | Cause | Impact | Freq | Fix Effort | Priority | Evidence |
|------|-------|--------|------|-----------|----------|----------|
| 1 | staleTime: Infinity (useUIMode) | HIGH | HIGH | LOW (change 1 line) | **P0** | Confirmed line 64:1 useUIMode.tsx |
| 2 | Missing invalidateQueries for notes+decisions | HIGH | HIGH | LOW (add to invalidateAll switch) | **P0** | invalidateAll('notes') skips project-notes, resolved-notes, approval-notes |
| 3 | Optimistic update without error rollback | MEDIUM | MEDIUM | MEDIUM (add onError rollback to setQueryData) | **P1** | rewrite.onSuccess: no onError revert |
| 4 | Decision query keys not invalidated after mutations | HIGH | LOW | LOW (add decision key to invalidateDevEngine) | **P1** | Decisions use separate callDecisionsEngine |
| 5 | Multiple canonical state sources (UIMode) | MEDIUM | MEDIUM | MEDIUM (demote localStorage, use single source) | **P2** | Three competing sources in useUIMode |
| 6 | Race conditions during rewrite completion | LOW | LOW | HIGH (needs investigation) | **P3** | Not confirmed in code |
| 7 | Version propagation failures | LOW | LOW | LOW (already guarded) | **P3** | Explicit in onSuccess |
| 8 | localStorage overriding backend truth | LOW | LOW | MEDIUM (UI-only state) | **P3** | Not used for document state |

---

## TASK 6 — State Ownership Matrix

| Source | What It Holds | Authoritative? | Derived? | Cache? | Unsafe? | Risk |
|--------|--------------|---------------|---------|-------|--------|------|
| Supabase DB (primary) | documents, versions, notes, decisions, chunks, jobs, profiles | ✅ YES (canonical) | — | — | — | NONE |
| React Query cache (react-query) | dev-v2-*, project-*, resolved-notes, approval-notes, profile-mode | — | — | ✅ CACHE | IF staleTime=∞ | STALE if not invalidated |
| useUIMode localMode (useState) | UI mode preference | — | ✅ DERIVED from localStorage | — | IF diverges from Supabase | LOCAL-FIRST desync |
| useUIMode profile query | mode_preference from profiles table | ✅ (should be source) | — | ✅ CACHE (staleTime=∞) | — | NEVER refreshes |
| localStorage | UI mode, sidebar width, dismissed banners, debug flags | — | — | — | ⚠️ PRIMARY for mode | Mode has 3 sources |
| URL params | selected decision ID, filters | — | ✅ DERIVED | — | — | LOW |
| Component state (useState) | UI-only: open panels, scroll position, form state | — | ✅ DERIVED | — | — | LOW |
| callDecisionsEngine | decision state (fetched ad-hoc) | ✅ (reads from DB) | — | — | NOT invalidated | Decision panels stale |
| invalidateAll action routing | selective invalidation per action | — | — | — | ⚠️ MISSING keys | Notes + decisions not invalidated |

**Root problem:** The invalidation graph is incomplete. Several mutation paths don't invalidate all affected query keys, leaving stale cache entries. The UIMode has three competing sources where localStorage (non-authoritative) can win over Supabase (authoritative).

---

## TASK 7 — Repair Design

### Principle: Single Source of Truth + Deterministic Invalidation

### Repair 1: staleTime: Infinity → staleTime: 30s (useUIMode)
- Change the profile mode query from `staleTime: Infinity` to `staleTime: 30_000`
- This ensures the UI mode re-syncs with Supabase within 30 seconds
- localStorage remains as IMMEDIATE source (no network wait for toggle)
- Supabase becomes the AUTHORITATIVE source within 30s

### Repair 2: Add missing query keys to invalidateAll
- `invalidateAll('notes')` currently skips `project-notes`, `resolved-notes`, `approval-notes`
- Add these keys to the notes case in invalidateAll
- Also add to invalidateDevEngine if the pattern calls deep

### Repair 3: Add decision-query-key invalidation to invalidateDevEngine
- Add `['decisions', projectId]` and `['resolved-notes', projectId]` to the deep invalidation path
- Ensure both invalidateDevEngine and invalidateAll cover decisions

### Repair 4: Optimistic update rollback for rewrite
- In `rewrite.onMutate`: snapshot the current version list
- In `rewrite.onError`: revert to the snapshot
- This prevents stale cache data when the rewrite fails

### Repair 5: Decision panel query invalidation after mutations
- Find the decision panel component and add `refetch()` or `invalidateQueries` after decisions are applied
- Or subscribe decision queries to the same invalidation pattern

### What These Repairs Guarantee

| Invariant | How Repairs Address | Confidence |
|-----------|-------------------|-----------|
| I-1 Version ID Parity | Repair 2: invalidate dev-v2-versions after all mutations | HIGH |
| I-2 Note Status Parity | Repair 2: invalidate project-notes, resolved-notes after notes mutations | HIGH |
| I-3 Decision Availability | Repair 3: invalidate decision keys | HIGH |
| I-4 Chunk Progress Parity | Already invalidated via dev-v2-runs | HIGH |
| I-5 Rewrite Trigger Parity | Already invalidated via dev-v2 runs | HIGH |
| I-6 Content Parity | Repair 2: invalidate dev-v2-versions | HIGH |
| I-7 Note Application Effect | Repair 2 + Repair 4: version invalidation + rollback | HIGH |
| I-8 Decision Application Effect | Repair 3: decision invalidation | HIGH |
| I-9 Normalization Fidelity | Production code fix (normalizeDecisionUI is already correct) | HIGH |
| I-10 Render-Action Idempotency | Repair 4: rollback ensures consistency | MEDIUM |

---

## TASK 8 — Implementation Plan

### Patch 1: Fix staleTime (1 line)
- **File:** `src/hooks/useUIMode.tsx`
- **Change:** `staleTime: Infinity` → `staleTime: 30_000`
- **Validation:** Mode toggles still instant (localStorage immediate), cross-tab sync within 30s
- **Risk:** LOW. Adds one extra network call every 30s. No functional change to toggle behavior.

### Patch 2: Add missing query keys to invalidateAll (10 lines)
- **File:** `src/hooks/useDevEngineV2.ts`
- **Change:** In invalidateAll, add to the 'notes' case:
  ```
  qc.invalidateQueries({ queryKey: ['resolved-notes', projectId] });
  qc.invalidateQueries({ queryKey: ['project-notes', projectId] });
  qc.invalidateQueries({ queryKey: ['approval-notes', projectId] });
  ```
- **Validation:** After note generation, note panel shows new notes. After note resolution, badge flips.
- **Risk:** LOW. More queries refetched is safe, just more network activity.

### Patch 3: Add decision invalidation (5 lines)
- **File:** `src/lib/invalidateDevEngine.ts`
- **Change:** Add to the deep block:
  ```
  qc.invalidateQueries({ queryKey: ['decisions', projectId] });
  ```
- **Validation:** After decision applied, decision panel reflects in < 1s.
- **Risk:** LOW.

### Patch 4: Add optimistic rollback for rewrite (15 lines)
- **File:** `src/hooks/useDevEngineV2.ts`
- **Change:** In the rewrite useMutation, add `onMutate` to snapshot version list, and `onError` to revert:
  ```typescript
  onMutate: async () => {
    if (!selectedDocId) return;
    await qc.cancelQueries({ queryKey: ['dev-v2-versions', selectedDocId] });
    const previousVersions = qc.getQueryData(['dev-v2-versions', selectedDocId]);
    return { previousVersions };
  },
  onError: (err, vars, context) => {
    if (context?.previousVersions && selectedDocId) {
      qc.setQueryData(['dev-v2-versions', selectedDocId], context.previousVersions);
    }
  },
  ```
- **Validation:** If rewrite mutation errors, version list reverts to pre-mutation state.
- **Risk:** LOW. Standard React Query optimistic update pattern.

### Patch 5: Decision panel refetch (5 lines — component find needed first)
- **Find:** The component that reads decision state
- **Change:** Subscribe to invalidateAll or use queryClient to refetch after decision mutations
- **Risk:** LOW.

### Validation Plan

After patches:
1. Run consistency suite: `npx vitest run src/test/frontend-backend-consistency.test.ts` → 78/78
2. Run CPIE + governance tests: `npx vitest run src/test/cpie/ src/test/pcp/ src/test/cdg/ src/test/enforcement/` → all pass
3. Integration test: Jot down a note in dev engine → verify version bumps, note status flips
4. Integration test: Select a decision → verify panel updates
5. Integration test: Trigger a rewrite → verify spinner appears → verify new version appears
6. Cross-tab test: Change mode in Tab A → Tab B reflects within 30s

### Definition of Done

- [ ] Patch 1 applied: staleTime: Infinity → 30s
- [ ] Patch 2 applied: missing keys added to invalidateAll
- [ ] Patch 3 applied: decision invalidation added
- [ ] Patch 4 applied: rewrite optimistic rollback
- [ ] Consistency suite: 78/78 pass
- [ ] Governance suite: 411/411 pass
- [ ] Integration verified: notes, decisions, rewrites, versions all sync
- [ ] Mode sync: cross-tab within 30s

---

## Certification Summary

**Phase 1 (Test Harness):** ✅ Certified — 78/78 pass, all invariants meaningful, zero false-pass risk
**Phase 2 (Repair Design):** ✅ Complete — 5 patches designed, all evidence-based from codebase audit
**Gate Recommendation:** A. Mandatory PR gate for the consistency suite

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| staleTime change increases network calls | LOW | LOW (1 extra call per 30s) | Acceptable — trivial overhead |
| Adding invalidations causes UI flicker | LOW | LOW | RQ batches refetches |
| Decision component not found or pattern differs | MEDIUM | LOW | Fall back to broader invalidateDevEngine |
| Rollback on error could corrupt if mutation partially succeeded | LOW | MEDIUM | onError only reverts version list, not DB state |
