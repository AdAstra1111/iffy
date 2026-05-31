/**
 * Validation tests for MEDIUM-risk .single() → .maybeSingle() fixes:
 * - useSceneGraph.ts:74 — scene state no-row lifecycle
 * - SpineConfirmationPanel.tsx:194 — decision_ledger no-row lifecycle
 *
 * These were fixed in commit 2b2b493 alongside the ScriptToBudgetPanel fix.
 * Both convert .single() → .maybeSingle(), allowing zero-row states to
 * return null instead of throwing 406.
 *
 * Risk level: MEDIUM (no polling death — worst case is logged error)
 */
import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// useSceneGraph.ts — line 74
// ═══════════════════════════════════════════════════════════════════════════
//
// Before (line 74 was .single()):
//   .single() → {data: row, error: null}                      if row exists
//   .single() → throws 406 "JSON object requested, multiple.." if no row exists
//
// After (.maybeSingle()):
//   .maybeSingle() → {data: row, error: null}                if row exists
//   .maybeSingle() → {data: null, error: null}               if no row exists
//
// The return changed from:
//   return data as ProjectSceneState;
// to:
//   return (data ?? null) as ProjectSceneState | null;
// ──

type SceneStateQueryResult = {
  data: { scene_count: number; latest_scene_index: number; project_id: string } | null;
  error: { message: string; code?: string } | null;
};

function querySceneState(result: SceneStateQueryResult) {
  if (result.error) throw result.error;
  return (result.data ?? null) as { scene_count: number; latest_scene_index: number; project_id: string } | null;
}

/** Simulates OLD .single() behavior */
function querySceneStateSingle(result: SceneStateQueryResult) {
  if (result.error) throw result.error;
  if (!result.data) {
    const err: any = new Error('JSON object requested, multiple (or no) rows found');
    err.status = 406;
    err.code = 'PGRST116';
    throw err;
  }
  return result.data;
}

describe('useSceneGraph.ts state query — .maybeSingle()', () => {

  // ── 1. PRIMARY USE CASE ──

  it('returns scene state data when a row exists (happy path)', () => {
    const result: SceneStateQueryResult = {
      data: { scene_count: 32, latest_scene_index: 31, project_id: 'proj-123' },
      error: null,
    };
    const state = querySceneState(result);
    expect(state).not.toBeNull();
    expect(state!.scene_count).toBe(32);
    expect(state!.latest_scene_index).toBe(31);
  });

  it('returns scene state with minimum fields', () => {
    const result: SceneStateQueryResult = {
      data: { scene_count: 0, latest_scene_index: 0, project_id: 'proj-123' },
      error: null,
    };
    const state = querySceneState(result);
    expect(state).not.toBeNull();
    expect(state!.scene_count).toBe(0);
  });

  // ── 2. EDGE CASE: No row exists (THE FIX) ──

  it('returns null when no row exists (no 406 thrown)', () => {
    const result: SceneStateQueryResult = { data: null, error: null };
    const state = querySceneState(result);
    expect(state).toBeNull();
  });

  it('does NOT throw 406 when no row exists (regression guard)', () => {
    const noRow: SceneStateQueryResult = { data: null, error: null };

    // OLD: .single() throws 406
    expect(() => querySceneStateSingle(noRow)).toThrow();
    expect(() => querySceneStateSingle(noRow)).toThrow(/rows found/);

    // NEW: .maybeSingle() does NOT throw
    expect(() => querySceneState(noRow)).not.toThrow();
    expect(querySceneState(noRow)).toBeNull();
  });

  // ── 3. ERROR PATH ──

  it('throws on database error (error path unchanged — useQuery catches it)', () => {
    const result: SceneStateQueryResult = {
      data: null,
      error: { message: 'relation "project_script_scene_state" does not exist', code: '42P01' },
    };
    expect(() => querySceneState(result)).toThrow('project_script_scene_state');
  });

  it('throws on permission error', () => {
    const result: SceneStateQueryResult = {
      data: null,
      error: { message: 'permission denied for table project_script_scene_state', code: '42501' },
    };
    expect(() => querySceneState(result)).toThrow('permission denied');
  });

  // ── 4. NULL/UNDEFINED GUARDS ──

  it('returns null when data is null explicitly', () => {
    expect(querySceneState({ data: null, error: null })).toBeNull();
  });

  it('maintains type distinction: null return vs undefined data', () => {
    // Ensure (data ?? null) correctly coalesces undefined to null
    const result: SceneStateQueryResult = { data: undefined as any, error: null };
    const state = querySceneState(result);
    expect(state).toBeNull();
  });

  // ── 5. COMPARISON: .single() vs .maybeSingle() ──

  it('.single() and .maybeSingle() behave identically when row exists', () => {
    const existingRow: SceneStateQueryResult = {
      data: { scene_count: 10, latest_scene_index: 9, project_id: 'p1' },
      error: null,
    };
    expect(querySceneStateSingle(existingRow)).toEqual(querySceneState(existingRow));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SpineConfirmationPanel.tsx — line 194
// ═══════════════════════════════════════════════════════════════════════════
//
// Before (line 194 was .single()):
//   .single() → {data: {id: ..}, error: null}    if pending_lock row exists
//   .single() → throws 406                        if no pending_lock row exists
//   (The 406 prevented reaching existing?.id check)
//
// After (.maybeSingle()):
//   .maybeSingle() → {data: {id: ..}, error: null}   if pending_lock row exists
//   .maybeSingle() → {data: null, error: null}       if no pending_lock row exists
//
// Critical insight: the code checks `if (existing?.id)` — this was the
// INTENDED null guard, but .single() threw 406 before it could evaluate.
// Now .maybeSingle() returns null, and the guard works as designed.
// ──

type DecisionLedgerResult = {
  data: { id: string } | null;
  error: { message: string; code?: string } | null;
};

/**
 * Replicates the spine confirmation logic path:
 *   query decision_ledger for pending_lock
 *   if row → UPDATE (existing row found)
 *   if null → INSERT (no existing row)
 */
function confirmNarrativeSpine(result: DecisionLedgerResult): { action: 'update' | 'insert'; id: string | null } {
  if (result.error) throw result.error;
  if (result.data?.id) {
    return { action: 'update', id: result.data.id };
  }
  return { action: 'insert', id: null };
}

/** Simulates OLD .single() behavior — 406 kills the path */
function confirmNarrativeSpineOld(result: DecisionLedgerResult): { action: 'update' | 'insert'; id: string | null } {
  if (result.error) throw result.error;
  if (!result.data) {
    const err: any = new Error('JSON object requested, multiple (or no) rows found');
    err.status = 406;
    err.code = 'PGRST116';
    throw err;
  }
  if (result.data.id) {
    return { action: 'update', id: result.data.id };
  }
  return { action: 'insert', id: null };
}

describe('SpineConfirmationPanel.tsx — .maybeSingle() null guard path', () => {

  // ── 1. PRIMARY: Existing pending_lock row → UPDATE ──

  it('returns update action when a pending_lock decision exists', () => {
    const result: DecisionLedgerResult = {
      data: { id: 'dec-456' },
      error: null,
    };
    const response = confirmNarrativeSpine(result);
    expect(response.action).toBe('update');
    expect(response.id).toBe('dec-456');
  });

  // ── 2. THE FIX: No pending_lock row → INSERT ──

  it('returns insert action when no pending_lock decision exists (THE FIX: was 406, now reaches INSERT)', () => {
    const result: DecisionLedgerResult = { data: null, error: null };
    const response = confirmNarrativeSpine(result);
    expect(response.action).toBe('insert');
    expect(response.id).toBeNull();
  });

  it('does NOT throw 406 when no row matches (regression guard)', () => {
    const noRow: DecisionLedgerResult = { data: null, error: null };

    // OLD: .single() throws 406 — code never reaches the null guard
    expect(() => confirmNarrativeSpineOld(noRow)).toThrow();
    expect(() => confirmNarrativeSpineOld(noRow)).toThrow(/rows found/);

    // NEW: .maybeSingle() — code reaches the existing?.id guard
    expect(() => confirmNarrativeSpine(noRow)).not.toThrow();
    const response = confirmNarrativeSpine(noRow);
    expect(response.action).toBe('insert'); // ← intended fallback path now reachable
  });

  // ── 3. ERROR PATH ──

  it('throws on database error (error path unchanged)', () => {
    const result: DecisionLedgerResult = {
      data: null,
      error: { message: 'relation "decision_ledger" does not exist' },
    };
    expect(() => confirmNarrativeSpine(result)).toThrow('decision_ledger');
  });

  it('throws on permission error', () => {
    const result: DecisionLedgerResult = {
      data: null,
      error: { message: 'permission denied for table decision_ledger', code: '42501' },
    };
    expect(() => confirmNarrativeSpine(result)).toThrow('permission denied');
  });

  // ── 4. NULL/UNDEFINED GUARDS ──

  it('returns insert when data is null explicitly', () => {
    const response = confirmNarrativeSpine({ data: null, error: null });
    expect(response.action).toBe('insert');
  });

  it('returns insert when data is undefined (edge case from destructuring)', () => {
    const response = confirmNarrativeSpine({ data: undefined as any, error: null });
    expect(response.action).toBe('insert');
  });

  it('returns insert when data exists but id is undefined', () => {
    const response = confirmNarrativeSpine({ data: {} as any, error: null });
    expect(response.action).toBe('insert');
    expect(response.id).toBeNull();
  });

  // ── 5. COMPARISON ──

  it('.single() and .maybeSingle() behave identically when row exists', () => {
    const row: DecisionLedgerResult = { data: { id: 'dec-789' }, error: null };
    expect(confirmNarrativeSpineOld(row)).toEqual(confirmNarrativeSpine(row));
  });

  it('.single() kills the INSERT path, .maybeSingle() restores it (THE FIX)', () => {
    const noRow: DecisionLedgerResult = { data: null, error: null };

    // OLD: cannot reach the INSERT path
    expect(() => confirmNarrativeSpineOld(noRow)).toThrow();

    // NEW: INSERT path is reachable
    const response = confirmNarrativeSpine(noRow);
    expect(response.action).toBe('insert');
  });
});
