/**
 * Tests for: Fix: Cache auth session token once in startRewrite to prevent
 * AbortError on Episode 2+ chunks
 *
 * Commit f02b0eb — Two changes:
 *   1. callEngine() signature: removed supabase.auth.getSession() call,
 *      added `token: string` as 5th parameter
 *   2. startRewrite() calls supabase.auth.getSession() once before the
 *      chunk loop, caches access_token, and passes it to all callEngine
 *      invocations
 *
 * Prevents regression of: AbortError on Episode 2+ chunks caused by
 * getSession() resolving to a stale/null session when called inside
 * callEngine() for each chunk
 *
 * KNOWN ISSUE: The auth session check in startRewrite() (line 262-263)
 * throws before the try/catch block, so auth failures propagate as
 * unhandled rejections rather than being caught and setting status:'error'.
 * This is a pre-existing pattern from the old code where getSession lived
 * inside callEngine (also before its try/catch). The auth check should be
 * moved inside try {} to ensure proper cleanup of runningRef/startGuardRef.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRewritePipeline } from '@/hooks/useRewritePipeline';

// ── Mock setup ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
const mockToast = vi.fn();

// Mock supabase — count getSession calls
const mockGetSession = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: any[]) => mockToast('success', ...args),
    error: (...args: any[]) => mockToast('error', ...args),
    warning: (...args: any[]) => mockToast('warning', ...args),
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────────────────

function mockFetchResponse(data: any, ok = true) {
  mockFetch.mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 500,
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers(),
  });
}

function createWrapper() {
  const qc = new QueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function minContent(n: number): string {
  return 'x'.repeat(Math.max(10, n));
}

const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.test-token-cached';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch;

  // Default: valid session with known token
  mockGetSession.mockResolvedValue({
    data: {
      session: { access_token: TEST_TOKEN, user: { id: 'user-1' } },
    },
    error: null,
  });
});

// ── CHANGE 1: getSession removed from callEngine ────────────────────────────────

describe('CHANGE 1 — getSession removed from callEngine', () => {

  it('callEngine signature now has token: string as 5th parameter', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      '/Users/laralane/code/iffy/src/hooks/useRewritePipeline.ts',
      'utf-8'
    );
    const callEngineLine = src.match(
      /async function callEngine\([^)]+\)/
    );
    expect(callEngineLine).toBeTruthy();
    expect(callEngineLine![0]).toContain('token: string');
  });

  it('no supabase.auth.getSession() call inside callEngine function body', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      '/Users/laralane/code/iffy/src/hooks/useRewritePipeline.ts',
      'utf-8'
    );
    // Find the callEngine function definition and extract its body
    const fnStart = src.indexOf('async function callEngine(');
    // The function body ends at the next standalone `\n}\n` that's not followed by a catch
    const fnBody = src.substring(fnStart, src.indexOf('\nexport function', fnStart));
    expect(fnBody).not.toContain('getSession');
  });

  it('Authorization header uses ${token} not ${session.access_token}', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      '/Users/laralane/code/iffy/src/hooks/useRewritePipeline.ts',
      'utf-8'
    );
    const authLine = src.match(/Authorization:.*/);
    expect(authLine).toBeTruthy();
    expect(authLine![0]).toContain('Bearer ${token}');
    expect(authLine![0]).not.toContain('session.access_token');
  });

});

// ── CHANGE 2: Token cached once in startRewrite ────────────────────────────────

describe('CHANGE 2 — token cached once in startRewrite', () => {

  it('getSession() is called exactly once per startRewrite invocation', async () => {
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mockFetchResponse({ rewrittenText: 'Chunk content with padding for assembly threshold check.' });
    mockFetchResponse({ newVersion: { id: 'v-1' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });

    // getSession must be called exactly once — cached, not per-chunk
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('complete');
  });

  it('getSession() call appears before any callEngine invocation in source order', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      '/Users/laralane/code/iffy/src/hooks/useRewritePipeline.ts',
      'utf-8'
    );
    const getSessionIdx = src.indexOf('getSession()', src.indexOf('startRewrite'));
    const callEngineIdx = src.indexOf("callEngine('rewrite-plan'");
    expect(getSessionIdx).toBeGreaterThan(0);
    expect(callEngineIdx).toBeGreaterThan(getSessionIdx);
  });

  it('all 3 callEngine invocations receive the cached accessToken variable', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      '/Users/laralane/code/iffy/src/hooks/useRewritePipeline.ts',
      'utf-8'
    );

    // Check each callEngine invocation passes accessToken as the last arg
    const planCall = src.match(/callEngine\('rewrite-plan'[\s\S]*?\);/);
    const chunkCall = src.match(/callEngine\('rewrite-chunk'[\s\S]*?\);/);
    const assembleCall = src.match(/callEngine\('rewrite-assemble'[\s\S]*?\);/);

    expect(planCall).toBeTruthy();
    expect(planCall![0]).toContain('accessToken');
    expect(chunkCall).toBeTruthy();
    expect(chunkCall![0]).toContain('accessToken');
    expect(assembleCall).toBeTruthy();
    expect(assembleCall![0]).toContain('accessToken');
  });

  it('pipeline completes when all 3 calls use cached token', async () => {
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 2, strategy: 'legacy_slugline', chunkMeta: [] });
    mockFetchResponse({ rewrittenText: 'First chunk content with padding for assembly threshold check.' });
    mockFetchResponse({ rewrittenText: 'Second chunk content with padding for assembly threshold check.' });
    mockFetchResponse({ newVersion: { id: 'v-final' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });

    expect(result.current.status).toBe('complete');
    expect(result.current.currentChunk).toBe(2);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

});

// ── TOKEN PROPAGATION — verify the cached token flows through ───────────────────

describe('Token propagation — Authorization header', () => {

  it('all fetch calls use the cached access token in Authorization header', async () => {
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mockFetchResponse({ rewrittenText: 'Content padding for assembly threshold check.' });
    mockFetchResponse({ newVersion: { id: 'v-1' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });

    // Every fetch call should have the cached token
    const allCalls = mockFetch.mock.calls;
    expect(allCalls.length).toBeGreaterThanOrEqual(3);
    for (const call of allCalls) {
      const headers = call[1]?.headers || {};
      expect(headers.Authorization).toBe(`Bearer ${TEST_TOKEN}`);
    }
  });

  it('token is the same across plan, chunk, and assemble calls', async () => {
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 2, strategy: 'legacy_slugline', chunkMeta: [] });
    mockFetchResponse({ rewrittenText: 'C1 padding for assembly threshold check.' });
    mockFetchResponse({ rewrittenText: 'C2 padding for assembly threshold check.' });
    mockFetchResponse({ newVersion: { id: 'v-1' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });

    const tokens = mockFetch.mock.calls.map(
      (c: any) => c[1]?.headers?.Authorization
    );
    // All tokens should be identical
    expect(new Set(tokens).size).toBe(1);
    expect(tokens[0]).toBe(`Bearer ${TEST_TOKEN}`);
  });

});

// ── ERROR HANDLING — auth session ──────────────────────────────────────────────
// NOTE: The auth check (getSession + throw) is BEFORE the try/catch in
// startRewrite(), so errors propagate as unhandled rejections rather than
// setting status:'error'. These tests must wrap in try/catch.

describe('Error handling — auth session', () => {

  it('Not authenticated error thrown by startRewrite (not callEngine)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    // Error propagates because getSession/throw is before the try/catch
    await expect(async () => {
      await act(async () => {
        await result.current.startRewrite('doc-1', 'ver-1', [], []);
      });
    }).rejects.toThrow('Not authenticated');

    // Exactly 1 getSession call — no fetch calls made
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('session failure blocks pipeline before any engine call', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await expect(async () => {
      await act(async () => {
        await result.current.startRewrite('doc-1', 'ver-1', [], []);
      });
    }).rejects.toThrow();

    // No engine calls should have been made
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('getSession rejection propagates as error from startRewrite', async () => {
    mockGetSession.mockRejectedValue(new Error('Network error in auth'));

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await expect(async () => {
      await act(async () => {
        await result.current.startRewrite('doc-1', 'ver-1', [], []);
      });
    }).rejects.toThrow('Network error in auth');
  });

});

// ── REGRESSION ──────────────────────────────────────────────────────────────────

describe('Regression — existing functionality preserved', () => {

  it('getSession() only appears once outside callEngine in the entire file', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      '/Users/laralane/code/iffy/src/hooks/useRewritePipeline.ts',
      'utf-8'
    );
    // Count getSession occurrences in the file (should be exactly 1, in startRewrite)
    const matches = src.match(/getSession\(\)/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBe(1);
  });

  it('no getSession reference exists inside the callEngine function definition', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      '/Users/laralane/code/iffy/src/hooks/useRewritePipeline.ts',
      'utf-8'
    );
    // Extract callEngine function body
    const ceStart = src.indexOf('async function callEngine(');
    const ceEnd = src.indexOf('\nexport function', ceStart);
    const ceBody = src.substring(ceStart, ceEnd);
    expect(ceBody).not.toContain('getSession');
  });

  it('existing pipeline behavior with 2 chunks still completes', async () => {
    const total = 2;
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: total, strategy: 'legacy_slugline', chunkMeta: [] });
    for (let i = 0; i < total; i++)
      mockFetchResponse({ rewrittenText: `Chunk ${i + 1} with padding for assembly threshold check...` });
    mockFetchResponse({ newVersion: { id: 'v-final' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });

    expect(result.current.status).toBe('complete');
    expect(result.current.currentChunk).toBe(total);
  });

});

// ── INVARIANT ───────────────────────────────────────────────────────────────────

describe('Invariant — auth token isolation', () => {

  it('token does not leak across separate startRewrite calls', async () => {
    // First rewrite — use TEST_TOKEN
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mockFetchResponse({ rewrittenText: 'First rewrite content with padding for assembly threshold check.' });
    mockFetchResponse({ newVersion: { id: 'v-1' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });
    expect(result.current.status).toBe('complete');
    const firstCalls = mockFetch.mock.calls.length;
    expect(firstCalls).toBeGreaterThanOrEqual(3);

    // Second rewrite — different token
    const SECOND_TOKEN = 'second-token-different-value';
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: SECOND_TOKEN, user: { id: 'user-1' } } },
      error: null,
    });

    // Reset hook state
    act(() => { result.current.reset(); });

    // Set up fresh mocks for second rewrite
    mockFetch.mockReset();
    global.fetch = mockFetch;
    mockFetchResponse({ planRunId: 'plan-2', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mockFetchResponse({ rewrittenText: 'Second rewrite content with padding for assembly threshold check.' });
    mockFetchResponse({ newVersion: { id: 'v-2' } });

    await act(async () => {
      await result.current.startRewrite('doc-2', 'version-2', [], []);
    });
    expect(result.current.status).toBe('complete');

    // Verify session was called again for the second rewrite
    expect(mockGetSession).toHaveBeenCalledTimes(2);

    // Verify second rewrite's Authorization header uses the new token
    const authHeaders = mockFetch.mock.calls.map(
      (c: any) => c[1]?.headers?.Authorization
    );
    expect(authHeaders.length).toBeGreaterThanOrEqual(3);
    expect(authHeaders.every(h => h === `Bearer ${SECOND_TOKEN}`)).toBe(true);
  });

});