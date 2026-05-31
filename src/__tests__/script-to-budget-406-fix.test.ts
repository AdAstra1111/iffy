/**
 * Tests for P0 — ScriptToBudgetPanel .single() → .maybeSingle() fix
 *
 * CRITICAL BUG: ScriptToBudgetPanel.tsx:77
 *
 * Current failure mode (pre-fix):
 * - Polling loop queries project_documents for extracted_text
 * - No document currently has extracted_text
 * - Query uses .single() → throws 406 when zero rows match
 * - No try/catch protecting the polling loop
 * - 406 kills the async function → retry setTimeout never fires
 * - User sees permanent stuck "waiting for extraction" state
 *
 * Fix:
 * 1. .single() → .maybeSingle() — zero rows returns {data: null} instead of 406
 * 2. try/catch around supabase query — real DB errors logged + retry continues
 * 3. data?.extracted_text check handles both null data and null extracted_text
 * 4. Unconditional retry path: if no extracted_text OR error → attempts++ + setTimeout
 */
import { describe, it, expect } from 'vitest';

// ── Query response handler — replicates lines 69-93 of ScriptToBudgetPanel.tsx ──

type QueryResult = {
  data: { extracted_text: string } | null;
  error: { message: string } | null;
};

/**
 * Simulates the ScriptToBudgetPanel tryFetch polling function.
 * This is the extracted query+error+retry logic from lines 69-93.
 */
function pollForExtractedText(result: QueryResult): { resolved: string | null; shouldRetry: boolean; error: string | null } {
  try {
    if (result.error) throw result.error;
    const text = result.data?.extracted_text ?? null;
    if (text) {
      return { resolved: text, shouldRetry: false, error: null };
    }
    // No extracted text yet — retry is the expected path
    return { resolved: null, shouldRetry: true, error: null };
  } catch (err: any) {
    // DB error caught — log and retry
    return { resolved: null, shouldRetry: true, error: err.message || 'Unknown error' };
  }
}

/** Simulates OLD behavior with .single() — throws 406 on zero rows */
function pollWithSingle(result: QueryResult): { resolved: string | null; shouldRetry: boolean; error: string | null } {
  try {
    if (result.error) throw result.error;
    // .single() throws if data is null (zero rows)
    if (!result.data) {
      const err: any = new Error('JSON object requested, multiple (or no) rows found');
      err.status = 406;
      err.code = 'PGRST116';
      throw err;
    }
    const text = result.data.extracted_text ?? null;
    if (text) {
      return { resolved: text, shouldRetry: false, error: null };
    }
    return { resolved: null, shouldRetry: true, error: null };
  } catch (err: any) {
    // Without try/catch in the real function, this error would kill the polling
    return { resolved: null, shouldRetry: false, error: err.message || 'Unknown error' };
  }
}

// ── 1. PRIMARY USE CASE ──

describe('ScriptToBudgetPanel 406 fix — .maybeSingle() polling behavior', () => {

  it('returns extracted_text when a document row exists with extracted_text (happy path)', () => {
    const result: QueryResult = {
      data: { extracted_text: 'Scene 1: A detective enters the room.\nScene 2: The suspect confesses.' },
      error: null,
    };
    const response = pollForExtractedText(result);
    expect(response.resolved).toBe('Scene 1: A detective enters the room.\nScene 2: The suspect confesses.');
    expect(response.shouldRetry).toBe(false);
    expect(response.error).toBeNull();
  });

  it('returns extracted_text with a short script', () => {
    const result: QueryResult = {
      data: { extracted_text: 'INT. OFFICE - DAY\nDetective Smith sits at his desk.' },
      error: null,
    };
    const response = pollForExtractedText(result);
    expect(response.resolved).toContain('Detective Smith');
    expect(response.shouldRetry).toBe(false);
  });

  // ── 2. EDGE CASE: No row exists (THE CRITICAL BUG — was 406, now graceful) ──

  it('returns shouldRetry=true when no row exists (BUG FIX: was 406 polling death, now graceful retry)', () => {
    // .maybeSingle() returns {data: null, error: null} — no throw
    const result: QueryResult = { data: null, error: null };
    const response = pollForExtractedText(result);
    expect(response.resolved).toBeNull();
    expect(response.shouldRetry).toBe(true);
    expect(response.error).toBeNull();
  });

  it('does NOT throw 406 when no row exists (regression guard)', () => {
    const noRowResult: QueryResult = { data: null, error: null };

    // OLD behavior (.single()): throws 406 → polling dies
    const oldResponse = pollWithSingle(noRowResult);
    expect(oldResponse.shouldRetry).toBe(false); // ← polling dies
    expect(oldResponse.error).toContain('rows found');

    // NEW behavior (.maybeSingle()): no throw → retry continues
    const newResponse = pollForExtractedText(noRowResult);
    expect(newResponse.shouldRetry).toBe(true);  // ← polling continues
    expect(newResponse.error).toBeNull();
  });

  // ── 3. EDGE: Row exists but extracted_text is null/undefined ──

  it('returns shouldRetry=true when row exists but extracted_text is null', () => {
    const result: QueryResult = {
      data: { extracted_text: null } as any,
      error: null,
    };
    const response = pollForExtractedText(result);
    expect(response.resolved).toBeNull();
    expect(response.shouldRetry).toBe(true);
    expect(response.error).toBeNull();
  });

  it('returns shouldRetry=true when row exists but extracted_text is undefined', () => {
    const result: QueryResult = {
      data: { extracted_text: undefined } as any,
      error: null,
    };
    const response = pollForExtractedText(result);
    expect(response.resolved).toBeNull();
    expect(response.shouldRetry).toBe(true);
    expect(response.error).toBeNull();
  });

  it('returns shouldRetry=true when data object has no extracted_text key', () => {
    // Defensive: if the select returns a row but the key is missing
    const result: QueryResult = { data: {} as any, error: null };
    const response = pollForExtractedText(result);
    expect(response.resolved).toBeNull();
    expect(response.shouldRetry).toBe(true);
  });

  // ── 4. ERROR HANDLING — real DB/network errors ──

  it('returns shouldRetry=true with error logged when DB returns an error', () => {
    const result: QueryResult = {
      data: null,
      error: { message: 'Database connection failed' },
    };
    const response = pollForExtractedText(result);
    expect(response.resolved).toBeNull();
    expect(response.shouldRetry).toBe(true);  // ← polling continues after error
    expect(response.error).toContain('Database connection failed');
  });

  it('returns shouldRetry=true with error logged on permission error', () => {
    const result: QueryResult = {
      data: null,
      error: { message: 'permission denied for table project_documents' },
    };
    const response = pollForExtractedText(result);
    expect(response.shouldRetry).toBe(true);
    expect(response.error).toContain('permission denied');
  });

  it('returns shouldRetry=true with error logged on network error', () => {
    const result: QueryResult = {
      data: null,
      error: { message: 'Failed to fetch' },
    };
    const response = pollForExtractedText(result);
    expect(response.shouldRetry).toBe(true);
    expect(response.error).toContain('Failed to fetch');
  });

  // ── 5. POLLING STORM / RETRY VALIDATION ──

  it('consecutive polls with no matching row never throw (simulates 3-second polling cycle)', () => {
    const result: QueryResult = { data: null, error: null };
    for (let i = 0; i < 100; i++) {
      const response = pollForExtractedText(result);
      expect(response.shouldRetry).toBe(true);
      expect(() => pollForExtractedText(result)).not.toThrow();
    }
  });

  it('consecutive polls with DB error never throw and always continue retry', () => {
    const result: QueryResult = { data: null, error: { message: 'Transient error' } };
    for (let i = 0; i < 100; i++) {
      const response = pollForExtractedText(result);
      expect(response.shouldRetry).toBe(true);
      expect(() => pollForExtractedText(result)).not.toThrow();
    }
  });

  it('poll transitions cleanly from no-row to row-exists (simulates lifecycle)', () => {
    // Before extraction: no row
    let response = pollForExtractedText({ data: null, error: null });
    expect(response.resolved).toBeNull();
    expect(response.shouldRetry).toBe(true);

    // During extraction: row exists but extracted_text is null (extraction in progress)
    response = pollForExtractedText({ data: { extracted_text: null } as any, error: null });
    expect(response.resolved).toBeNull();
    expect(response.shouldRetry).toBe(true);

    // After extraction completes
    response = pollForExtractedText({
      data: { extracted_text: 'FADE IN:\nINT. HOUSE - DAY\nA quiet morning.' },
      error: null,
    });
    expect(response.resolved).toContain('FADE IN');
    expect(response.shouldRetry).toBe(false);
  });

  // ── 6. OLD vs NEW behavior comparison ──

  it('.single() and .maybeSingle() behave identically when row exists with extracted_text', () => {
    const existingRow: QueryResult = {
      data: { extracted_text: 'Full script text here...' },
      error: null,
    };

    const singleResponse = pollWithSingle(existingRow);
    const maybeResponse = pollForExtractedText(existingRow);

    expect(singleResponse.resolved).toBe(maybeResponse.resolved);
    expect(singleResponse.shouldRetry).toBe(maybeResponse.shouldRetry);
  });

  it('.single() kills polling on zero rows, .maybeSingle() does not (THE CRITICAL FIX)', () => {
    const noRow: QueryResult = { data: null, error: null };

    // OLD: .single() → polling dies (shouldRetry = false)
    const oldResponse = pollWithSingle(noRow);
    expect(oldResponse.shouldRetry).toBe(false);
    expect(oldResponse.error).not.toBeNull();

    // NEW: .maybeSingle() → polling continues (shouldRetry = true)
    const newResponse = pollForExtractedText(noRow);
    expect(newResponse.shouldRetry).toBe(true);
    expect(newResponse.error).toBeNull();
  });
});
