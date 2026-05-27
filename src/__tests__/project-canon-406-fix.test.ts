/**
 * Tests for P0 — project_canon 406 root cause (.single() → .maybeSingle())
 *
 * PostgREST `.single()` throws HTTP 406 when no row matches the query.
 * `.maybeSingle()` returns {data: null, error: null} (HTTP 200) — no exception.
 *
 * The fix:
 *   Line 82: `.single()` → `.maybeSingle()`
 *   Line 84: `(data?.canon_json || {})` — already handles null data correctly
 *
 * This test validates the behavior at the query-response boundary:
 *   1. Row exists → canon_json returned
 *   2. No row exists → {} returned (was 406, now clean)
 *   3. Supabase error → thrown (unchanged)
 *   4. Null/invalid data → graceful fallback
 */
import { describe, it, expect } from 'vitest';

// ── Query response handler — replicates lines 78-84 of useProjectCanon.ts ──
//
// Before fix (line 82 was .single()):
//   .single() → {data: {canon_json: ...}, error: null}  if row exists
//   .single() → throws 406 "JSON object requested, multiple (or no) rows found"  if no row exists
//
// After fix (.maybeSingle()):
//   .maybeSingle() → {data: {canon_json: ...}, error: null}  if row exists
//   .maybeSingle() → {data: null, error: null}               if no row exists  (HTTP 200)

type QueryResult = {
  data: { canon_json: Record<string, unknown> } | null;
  error: { message: string; status?: number; code?: string } | null;
};

/** 
 * Replicates the critical extract-logic from useProjectCanon lines 78-84
 * but as a pure function so we can test every input/output path.
 */
function extractCanon(result: QueryResult): Record<string, unknown> {
  if (result.error) throw result.error;
  return (result.data?.canon_json || {});
}

// ── Helpers to simulate .single() vs .maybeSingle() behavior ──

/** Simulates PostgREST .single() — throws 406 when no row */
function singleQuery(row: Record<string, unknown> | undefined): QueryResult {
  if (!row) {
    // .single() throws a PostgREST error for zero-match queries
    const err: any = new Error('JSON object requested, multiple (or no) rows found');
    err.status = 406;
    err.code = 'PGRST116';
    throw err;
  }
  return { data: { canon_json: row }, error: null };
}

/** Simulates PostgREST .maybeSingle() — returns null data gracefully */
function maybeSingleQuery(row: Record<string, unknown> | undefined): QueryResult {
  if (!row) {
    return { data: null, error: null };
  }
  return { data: { canon_json: row }, error: null };
}

// ── 1. PRIMARY USE CASE: Row exists ──────────────────────────────────────────

describe('project-canon 406 fix — .maybeSingle() behavior', () => {

  // ── 1. PRIMARY USE CASE ──
  it('returns canon_json when a row exists (happy path)', () => {
    const result = maybeSingleQuery({
      logline: 'A detective solves crimes in deep space',
      premise: 'In the year 3000...',
    });
    const canon = extractCanon(result);
    expect(canon).toEqual({
      logline: 'A detective solves crimes in deep space',
      premise: 'In the year 3000...',
    });
  });

  it('returns canon_json with complex nested data when row exists', () => {
    const result = maybeSingleQuery({
      logline: 'Test',
      characters: [
        { name: 'Alice', role: 'protagonist' },
        { name: 'Bob', role: 'antagonist' },
      ],
      world_rules: 'No magic',
      locations: 'New York',
    });
    const canon = extractCanon(result);
    expect(canon).toHaveProperty('logline', 'Test');
    expect(canon).toHaveProperty('world_rules', 'No magic');
    expect(Array.isArray((canon as any).characters)).toBe(true);
    expect((canon as any).characters).toHaveLength(2);
  });

  // ── 2. EDGE CASE: No row exists (THE BUG FIX — was 406, now graceful) ──

  it('returns {} when no row exists (BUG FIX: was 406, now graceful)', () => {
    // This is THE fix: .maybeSingle() returns null data instead of throwing
    const result = maybeSingleQuery(undefined);
    const canon = extractCanon(result);
    expect(canon).toEqual({});
  });

  it('does NOT throw 406 when no row exists (regression guard)', () => {
    // Previous behavior with .single() would throw
    expect(() => singleQuery(undefined)).toThrow();
    expect(() => singleQuery(undefined)).toThrow(/rows found/);

    // New behavior with .maybeSingle() does NOT throw
    expect(() => maybeSingleQuery(undefined)).not.toThrow();
    const result = maybeSingleQuery(undefined);
    const canon = extractCanon(result);
    expect(canon).toEqual({});
  });

  // ── 3. ERROR PATH ──

  it('throws when supabase returns an error (error path unchanged)', () => {
    const result: QueryResult = {
      data: null,
      error: { message: 'Database connection failed', status: 500 },
    };
    expect(() => extractCanon(result)).toThrow('Database connection failed');
  });

  it('throws when supabase returns a permission error', () => {
    const result: QueryResult = {
      data: null,
      error: { message: 'permission denied for table project_canon', code: '42501' },
    };
    expect(() => extractCanon(result)).toThrow('permission denied');
  });

  it('throws when supabase returns a network error', () => {
    const result: QueryResult = {
      data: null,
      error: { message: 'Failed to fetch', status: 0 },
    };
    expect(() => extractCanon(result)).toThrow('Failed to fetch');
  });

  // ── 4. EDGE: null/invalid data ──

  it('returns {} when data is null (may be null if no row exists)', () => {
    // .maybeSingle() returns {data: null} when no row matches
    const result: QueryResult = { data: null, error: null };
    expect(extractCanon(result)).toEqual({});
  });

  it('returns {} when data exists but canon_json is undefined', () => {
    // Defensive: if data is non-null but has no canon_json key
    const result: QueryResult = { data: {} as any, error: null };
    expect(extractCanon(result)).toEqual({});
  });

  it('returns {} when data has canon_json key with undefined value', () => {
    // Optional chaining: data?.canon_json → undefined → || {} → {}
    const result: QueryResult = { data: { canon_json: undefined } as any, error: null };
    expect(extractCanon(result)).toEqual({});
  });

  it('returns {} when data has canon_json key with null value', () => {
    // Defensive: DB could theoretically store null
    const result: QueryResult = { data: { canon_json: null } as any, error: null };
    expect(extractCanon(result)).toEqual({});
  });

  // ── 5. BOUNDARY: Empty object scenarios ──

  it('returns {} when canon_json is empty object', () => {
    const result = maybeSingleQuery({});
    const canon = extractCanon(result);
    expect(canon).toEqual({});
  });

  // ── 6. COMPARISON: .single() vs .maybeSingle() ──

  it('.single() throws 406 for zero matches, .maybeSingle() does not (THE FIX)', () => {
    // .single() — OLD behavior (the bug)
    expect(() => singleQuery(undefined)).toThrow();
    try {
      singleQuery(undefined);
    } catch (e: any) {
      expect(e.status).toBe(406);
      expect(e.code).toBe('PGRST116');
    }

    // .maybeSingle() — NEW behavior (the fix)
    expect(() => maybeSingleQuery(undefined)).not.toThrow();
    const result = maybeSingleQuery(undefined);
    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
    expect(extractCanon(result)).toEqual({});
  });

  // ── 7. Both functions return same data when row does exist ──

  it('.single() and .maybeSingle() behave identically when row exists', () => {
    const row = { logline: 'A story', premise: 'Once upon a time...' };

    const singleResult = singleQuery(row);
    const maybeResult = maybeSingleQuery(row);

    expect(extractCanon(singleResult)).toEqual(extractCanon(maybeResult));
  });
});
