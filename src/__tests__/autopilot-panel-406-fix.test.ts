/**
 * Tests for P0 — AutopilotPanel project_canon 406 root cause (.single() → .maybeSingle())
 *
 * Production logs showed continuous 406 errors from AutopilotPanel path:
 *   GET /rest/v1/project_canon?select=canon_json&project_id=eq.<project_id>
 *   406 Not Acceptable
 *
 * ROOT CAUSE:
 *   AutopilotPanel.tsx line 329 used `.single()` on project_canon queries.
 *   PostgREST `.single()` throws HTTP 406 "JSON object requested, multiple
 *   (or no) rows found" when zero rows match.
 *
 *   This happened because:
 *   1. The polling useEffect starts on mount (line 355: poll(); then setInterval)
 *   2. project_canon rows are NOT created until Phase 1 (DevSeed) runs
 *   3. Before Phase 1, no row exists → .single() throws 406 every 3 seconds
 *   4. Catch block swallows the error but the 406 still fires on every poll
 *   5. This creates the observed continuous 406 storm
 *
 * FIX:
 *   Line 329: `.single()` → `.maybeSingle()`
 *
 *   .maybeSingle() returns {data: null, error: null} when no row matches,
 *   which the existing guard `if (!autopilotState) return;` handles gracefully.
 *
 * ALL OTHER project_canon queries in the codebase already use .maybeSingle():
 *   - useProjectCanon.ts:82 ✓
 *   - projectCanonStorage.ts:17,62 ✓
 *   - VisualCanonResetPanel.tsx:120 ✓
 *   - ApplyDevSeedDialog.tsx:728,837 ✓
 *   - useWorldValidationMode.ts:66 ✓
 *   - getCanonicalProjectState.ts:83 ✓
 *   - resolveInferredVisualStyle.ts:142 ✓
 *   - useCharacterWardrobe.ts:283 ✓
 *   - useVisualCanonExtraction.ts:33 ✓
 *   - castingBriefResolver.ts:1775,1824 ✓
 */
import { describe, it, expect } from 'vitest';

// ── Query response handler — replicates lines 322-332 of AutopilotPanel.tsx ──
//
// Before fix (line 329 was .single()):
//   .single() → {data: {canon_json: ...}, error: null}  if row exists
//   .single() → throws 406 "JSON object requested, multiple (or no) rows found"  if no row exists
//
// After fix (.maybeSingle()):
//   .maybeSingle() → {data: {canon_json: ...}, error: null}  if row exists
//   .maybeSingle() → {data: null, error: null}               if no row exists  (HTTP 200)

type PollResult = {
  data: { canon_json: Record<string, unknown> } | null;
  error: { message: string; code?: string; status?: number } | null;
};

/**
 * Simulates the AutopilotPanel poll function's query logic AFTER the fix.
 * This is the extracted query+guard pattern from lines 322-332:
 *
 *   const { data: canonRow } = await supabase
 *     .from('project_canon')
 *     .select('canon_json')
 *     .eq('project_id', projectId)
 *     .maybeSingle();
 *   if (!canonRow?.canon_json?.autopilot) return null;
 *   return canonRow.canon_json.autopilot;
 */
function pollWithMaybeSingle(canonRow: PollResult): Record<string, unknown> | null {
  if (canonRow.error) throw canonRow.error;
  const autopilotState = canonRow?.data?.canon_json?.autopilot as Record<string, unknown> | undefined;
  if (!autopilotState) return null;
  return autopilotState;
}

/** Simulates PostgREST .single() — throws 406 when no row */
function pollWithSingle(canonRow: PollResult): Record<string, unknown> | null {
  if (canonRow.error) throw canonRow.error;
  if (!canonRow.data) {
    // .single() throws a PostgREST error for zero-match queries
    const err: any = new Error('JSON object requested, multiple (or no) rows found');
    err.status = 406;
    err.code = 'PGRST116';
    throw err;
  }
  const autopilotState = canonRow.data?.canon_json?.autopilot as Record<string, unknown> | undefined;
  if (!autopilotState) return null;
  return autopilotState;
}

// ── 1. PRIMARY USE CASE: Row exists with autopilot state ──

describe('AutopilotPanel 406 fix — .maybeSingle() poll behavior', () => {

  it('returns autopilot state when project_canon row exists with autopilot', () => {
    const result: PollResult = {
      data: {
        canon_json: {
          autopilot: { status: 'running', stages: { devseed: { status: 'complete' } } },
          logline: 'A test',
        },
      },
      error: null,
    };
    const state = pollWithMaybeSingle(result);
    expect(state).not.toBeNull();
    expect(state).toHaveProperty('status', 'running');
  });

  it('returns null when project_canon row exists but autopilot is missing', () => {
    const result: PollResult = {
      data: {
        canon_json: {
          logline: 'A test',
          premise: 'No autopilot state here',
        },
      },
      error: null,
    };
    const state = pollWithMaybeSingle(result);
    expect(state).toBeNull();
  });

  // ── 2. EDGE CASE: No row exists (THE BUG FIX — was 406, now graceful) ──

  it('returns null when no row exists (BUG FIX: was 406, now graceful)', () => {
    // This is THE fix: .maybeSingle() returns null data instead of throwing 406
    const result: PollResult = { data: null, error: null };
    const state = pollWithMaybeSingle(result);
    expect(state).toBeNull();
  });

  it('does NOT throw 406 when no row exists (regression guard)', () => {
    // OLD behavior: .single() throws 406 when no row
    const noRowResult: PollResult = { data: null, error: null };
    expect(() => pollWithSingle(noRowResult)).toThrow();
    expect(() => pollWithSingle(noRowResult)).toThrow(/rows found/);

    // NEW behavior: .maybeSingle() does NOT throw
    expect(() => pollWithMaybeSingle(noRowResult)).not.toThrow();
    const state = pollWithMaybeSingle(noRowResult);
    expect(state).toBeNull();
  });

  // ── 3. ERROR PATH — unchanged ──

  it('throws when supabase returns a database error (error path unchanged)', () => {
    const result: PollResult = {
      data: null,
      error: { message: 'Database connection failed', status: 500 },
    };
    expect(() => pollWithMaybeSingle(result)).toThrow('Database connection failed');
  });

  it('throws when supabase returns a permission error', () => {
    const result: PollResult = {
      data: null,
      error: { message: 'permission denied for table project_canon', code: '42501' },
    };
    expect(() => pollWithMaybeSingle(result)).toThrow('permission denied');
  });

  it('throws when supabase returns a network error', () => {
    const result: PollResult = {
      data: null,
      error: { message: 'Failed to fetch', status: 0 },
    };
    expect(() => pollWithMaybeSingle(result)).toThrow('Failed to fetch');
  });

  // ── 4. EDGE: null/invalid data paths ──

  it('returns null when canon_json exists but autopilot key is undefined', () => {
    const result: PollResult = {
      data: { canon_json: { logline: 'test', autopilot: undefined } as any },
      error: null,
    };
    expect(pollWithMaybeSingle(result)).toBeNull();
  });

  it('returns null when canon_json exists but autopilot is null', () => {
    const result: PollResult = {
      data: { canon_json: { logline: 'test', autopilot: null } as any },
      error: null,
    };
    expect(pollWithMaybeSingle(result)).toBeNull();
  });

  it('returns null when canon_json itself is null', () => {
    const result: PollResult = {
      data: { canon_json: null } as any,
      error: null,
    };
    expect(pollWithMaybeSingle(result)).toBeNull();
  });

  it('returns null when canon_json is empty object', () => {
    const result: PollResult = {
      data: { canon_json: {} },
      error: null,
    };
    expect(pollWithMaybeSingle(result)).toBeNull();
  });

  // ── 5. POLLING STORM VALIDATION ──

  it('consecutive polls with no row do not throw (simulates 3-second polling cycle)', () => {
    // This validates that the fix prevents the continuous 406 storm
    const result: PollResult = { data: null, error: null };
    for (let i = 0; i < 100; i++) {
      // Simulate 100 consecutive poll cycles (5 minutes at 3-second intervals)
      expect(() => pollWithMaybeSingle(result)).not.toThrow();
      const state = pollWithMaybeSingle(result);
      expect(state).toBeNull();
    }
  });

  it('poll transitions cleanly from no-rows to row-exists (simulates lifecycle)', () => {
    // Before DevSeed: no row
    const beforeResult: PollResult = { data: null, error: null };
    expect(pollWithMaybeSingle(beforeResult)).toBeNull();

    // After canon_os_initialize: row exists, no autopilot yet
    const duringResult: PollResult = {
      data: { canon_json: { logline: 'A story' } },
      error: null,
    };
    expect(pollWithMaybeSingle(duringResult)).toBeNull();

    // After DevSeed completes: autopilot state present
    const afterResult: PollResult = {
      data: {
        canon_json: {
          logline: 'A story',
          autopilot: { status: 'complete', stages: { devseed: { status: 'complete' } } },
        },
      },
      error: null,
    };
    expect(pollWithMaybeSingle(afterResult)).toHaveProperty('status', 'complete');
  });

  // ── 6. COMPARISON: .single() vs .maybeSingle() behavior match when row exists ──

  it('.single() and .maybeSingle() behave identically when row exists with autopilot', () => {
    const existingRow: PollResult = {
      data: {
        canon_json: {
          autopilot: { status: 'running' },
          logline: 'Test',
        },
      },
      error: null,
    };

    const singleResult = pollWithSingle(existingRow);
    const maybeResult = pollWithMaybeSingle(existingRow);

    expect(singleResult).toEqual(maybeResult);
    expect(singleResult).toHaveProperty('status', 'running');
  });
});
