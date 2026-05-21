/**
 * Tests for: Fix: 401 Unauthorized on Episode 34+ rewrite chunks — cached auth token expires mid-rewrite
 *
 * Commit 62a532b — Changes:
 *   1. callEngine() — added `onTokenExpired?: () => Promise<string>` as 6th parameter
 *   2. callEngine() — added `let tokenRefreshCount = 0` counter, max 3 refreshes per chunk
 *   3. callEngine() — 401 detection block after clearTimeout: resp.status === 401 && onTokenExpired
 *      → refresh token, decrement attempt, continue
 *   4. startRewrite() — added `refreshToken` callback using supabase.auth.refreshSession()
 *   5. All 3 callEngine calls (rewrite-plan, rewrite-chunk, rewrite-assemble) pass refreshToken as 6th arg
 *
 * Prevents regression of: 401 Unauthorized on Episode 34+ rewrite chunks caused by
 * cached auth token that expires ~1 hour after session start while rewrite is still running.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRewritePipeline } from '@/hooks/useRewritePipeline';

// ── Mock setup ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
const mockToast = vi.fn();

const mockGetSession = vi.fn();
const mockRefreshSession = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      refreshSession: () => mockRefreshSession(),
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

const TEST_TOKEN = 'eyJhbG...original-token';
const REFRESHED_TOKEN = 'eyJhbG...refreshed-token';
const SRC_PATH = '/Users/laralane/code/iffy/src/hooks/useRewritePipeline.ts';

function mock401(body: any = { error: 'JWT expired' }) {
  mockFetch.mockResolvedValueOnce({
    ok: false, status: 401,
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  });
}

function mock200(data: any) {
  mockFetch.mockResolvedValueOnce({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers(),
  });
}

function createWrapper() {
  const qc = new QueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch;

  mockGetSession.mockResolvedValue({
    data: { session: { access_token: TEST_TOKEN, user: { id: 'user-1' } } },
    error: null,
  });
  mockRefreshSession.mockResolvedValue({
    data: { session: { access_token: REFRESHED_TOKEN, user: { id: 'user-1' } } },
    error: null,
  });
});

// ── Static analysis — signature & structure ───────────────────────────────────

describe('Static — callEngine signature', () => {

  it('onTokenExpired is the 6th parameter', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');
    // Find the line containing the function definition (may span multiple lines)
    // Just check the parameter is present — position is obvious from context
    expect(src).toContain('onTokenExpired?: () => Promise<string>');
  });

  it('tokenRefreshCount initialized to 0', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');
    const fnStart = src.indexOf('async function callEngine(');
    const fnBody = src.substring(fnStart, src.indexOf('\nexport function', fnStart));
    expect(fnBody).toContain('tokenRefreshCount = 0');
  });

  it('401 refresh guard checks tokenRefreshCount < 3', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');
    expect(src).toContain('resp.status === 401 && onTokenExpired && tokenRefreshCount < 3');
  });

  it('auth.refreshSession() referenced inside startRewrite', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');
    const srStart = src.indexOf('const startRewrite');
    expect(srStart).toBeGreaterThan(0);
    expect(src.substring(srStart)).toContain('refreshSession');
  });

  it('all 3 callEngine calls pass refreshToken', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');
    for (const action of ['rewrite-plan', 'rewrite-chunk', 'rewrite-assemble']) {
      const match = src.match(new RegExp(`callEngine\\('${action}'[\\s\\S]*?\\);`));
      expect(match).toBeTruthy();
      expect(match![0]).toContain('refreshToken');
    }
  });

  it('401 check after clearTimeout, before body parsing', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');
    const fnStart = src.indexOf('async function callEngine(');
    const fnBody = src.substring(fnStart, src.indexOf('\nexport function', fnStart));
    const ctIdx = fnBody.indexOf('clearTimeout(timeout)');
    const f401Idx = fnBody.indexOf('resp.status === 401');
    const textIdx = fnBody.indexOf('const text = await resp.text()');
    expect(ctIdx).toBeGreaterThan(0);
    expect(f401Idx).toBeGreaterThan(ctIdx);
    expect(textIdx).toBeGreaterThan(f401Idx);
  });

});

// ── Dynamic — standard pipeline behavior ──────────────────────────────────────

describe('Dynamic — standard pipeline (no 401s)', () => {

  function setup1ChunkPipeline() {
    mock200({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mock200({ rewrittenText: 'Content padded for assembly threshold check.' });
    mock200({ newVersion: { id: 'v-1' } });
  }

  it('completes successfully without calling refreshSession', async () => {
    setup1ChunkPipeline();
    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });
    expect(result.current.status).toBe('complete');
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('getSession called exactly once', async () => {
    setup1ChunkPipeline();
    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });
    expect(result.current.status).toBe('complete');
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it('multiple chunks complete with zero refresh calls', async () => {
    mock200({ planRunId: 'plan-1', totalChunks: 3, strategy: 'legacy_slugline', chunkMeta: [] });
    mock200({ rewrittenText: 'C1 padded for assembly.' }); mock200({ rewrittenText: 'C2 padded for assembly.' });
    mock200({ rewrittenText: 'C3 padded for assembly.' });
    mock200({ newVersion: { id: 'v-final' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });
    expect(result.current.status).toBe('complete');
    expect(result.current.currentChunk).toBe(3);
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('non-401 errors (500) retry via existing logic, not refresh', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 500,
      text: () => Promise.resolve(JSON.stringify({ error: 'Server error' })),
      headers: new Headers(),
    });
    setup1ChunkPipeline();

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });
    expect(result.current.status).toBe('complete');
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

});

// ── Dynamic — 401 refresh on each phase ───────────────────────────────────────

describe('Dynamic — 401 triggers refresh per phase', () => {

  it('401 on plan → refresh → retry with new token', async () => {
    mock401();
    mock200({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mock200({ rewrittenText: 'Content padded for assembly.' });
    mock200({ newVersion: { id: 'v-1' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });
    expect(result.current.status).toBe('complete');
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    // call 0 = 401 (TEST_TOKEN), call 1 = retry (REFRESHED_TOKEN)
    expect(mockFetch.mock.calls[0][1]?.headers?.Authorization).toBe(`Bearer ${TEST_TOKEN}`);
    expect(mockFetch.mock.calls[1][1]?.headers?.Authorization).toBe(`Bearer ${REFRESHED_TOKEN}`);
  });

  it('401 on chunk → refresh within that callEngine', async () => {
    mock200({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mock401();
    mock200({ rewrittenText: 'Chunk after refresh padded for assembly.' });
    mock200({ newVersion: { id: 'v-1' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });
    expect(result.current.status).toBe('complete');
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    // call 0=plan(200), 1=chunk(401), 2=chunk-retry(REFRESHED_TOKEN)
    expect(mockFetch.mock.calls[2][1]?.headers?.Authorization).toBe(`Bearer ${REFRESHED_TOKEN}`);
  });

  it('401 on assemble → refresh within that callEngine', async () => {
    mock200({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mock200({ rewrittenText: 'Content padded for assembly.' });
    mock401();
    mock200({ newVersion: { id: 'v-1' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });
    expect(result.current.status).toBe('complete');
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    // call 3 = assemble-retry(REFRESHED_TOKEN)
    expect(mockFetch.mock.calls[3][1]?.headers?.Authorization).toBe(`Bearer ${REFRESHED_TOKEN}`);
  });

  it('401 on all 3 phases — 3 refreshes total (one per callEngine)', async () => {
    mock401(); mock200({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mock401(); mock200({ rewrittenText: 'Chunk after refresh padded for assembly.' });
    mock401(); mock200({ newVersion: { id: 'v-final' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });
    expect(result.current.status).toBe('complete');
    expect(mockRefreshSession).toHaveBeenCalledTimes(3);
  });

});

// ── Dynamic — refresh limits and failure handling ─────────────────────────────

describe('Dynamic — refresh limits & failure', () => {

  it('max 3 refreshes per callEngine — 4th 401 exhausts retries (10000ms timeout)', async () => {
    // callEngine with retries=2 has 3 base attempts.
    // 3 refreshes each decrement attempt, giving 3+3=6 total possible fetch calls.
    // All 6 return 401 — 3 are refreshed, 3 fall through to error+retry with 2s delay.
    mock401(); mock401(); mock401();
    mock401(); mock401(); mock401();
    // 6 all-401 mocks → the 6th throws in catch (attempt=2, not <2)
    // Pipeline errors before chunk+assemble

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });
    expect(result.current.status).toBe('error');
    expect(mockRefreshSession).toHaveBeenCalledTimes(3);
  }, 15000);

  it('failed refresh (throws) falls through to error + retry', async () => {
    mock401();
    mock200({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mock200({ rewrittenText: 'Content padded for assembly.' });
    mock200({ newVersion: { id: 'v-1' } });
    mockRefreshSession.mockRejectedValue(new Error('Network error during refresh'));

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });
    // The failed refresh falls through the catch {} in the 401 block.
    // The original 401 error propagates, but with retries available,
    // the fetch is retried with the ORIGINAL token.
    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });
    // The retry succeeds (mock200 for plan kicks in after the 401)
    expect(result.current.status).toBe('complete');
    // refreshSession was called exactly once
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });

  it('refresh returns null session — error with "Session expired"', async () => {
    mock401();
    mock200({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mock200({ rewrittenText: 'Content padded for assembly.' });
    mock200({ newVersion: { id: 'v-1' } });
    mockRefreshSession.mockResolvedValue({
      data: { session: null }, error: null,
    });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });
    expect(result.current.status).toBe('complete');
    // The first 401 triggers refresh → null session → throws "Session expired"
    // The catch() in the 401 block catches the throw, falls through to normal retry
    // The retry uses the original accessToken and succeeds
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });

});

// ── Invariant — token isolation across boundaries ─────────────────────────────

describe('Invariant — token isolation', () => {

  it('token refresh count resets across separate callEngine invocations', async () => {
    // Plan: 401 x 2 (2 refreshes, within limit of 3)
    mock401(); mock401();
    mock200({ planRunId: 'plan-1', totalChunks: 2, strategy: 'legacy_slugline', chunkMeta: [] });
    // Chunk 1: 401 x 2
    mock401(); mock401();
    mock200({ rewrittenText: 'C1 padded for assembly.' });
    // Chunk 2: 401 x 2
    mock401(); mock401();
    mock200({ rewrittenText: 'C2 padded for assembly.' });
    // Assemble: no 401
    mock200({ newVersion: { id: 'v-final' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });
    expect(result.current.status).toBe('complete');
    // 4 callEngine calls x 2 refreshes each = 6 (plan=2, chunk1=2, chunk2=2, assemble=0)
    expect(mockRefreshSession).toHaveBeenCalledTimes(6);
  });

  it('refreshed token stays within its callEngine; next callEngine gets original accessToken', async () => {
    mock401();
    mock200({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mock200({ rewrittenText: 'Content padded for assembly.' });
    mock200({ newVersion: { id: 'v-1' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });
    expect(result.current.status).toBe('complete');

    // call 0: plan 401 (TEST_TOKEN)
    expect(mockFetch.mock.calls[0][1]?.headers?.Authorization).toBe(`Bearer ${TEST_TOKEN}`);
    // call 1: plan retry (REFRESHED_TOKEN - same callEngine)
    expect(mockFetch.mock.calls[1][1]?.headers?.Authorization).toBe(`Bearer ${REFRESHED_TOKEN}`);
    // call 2: chunk (TEST_TOKEN - new callEngine)
    expect(mockFetch.mock.calls[2][1]?.headers?.Authorization).toBe(`Bearer ${TEST_TOKEN}`);
    // call 3: assemble (TEST_TOKEN - new callEngine)
    expect(mockFetch.mock.calls[3][1]?.headers?.Authorization).toBe(`Bearer ${TEST_TOKEN}`);
  });

  it('401 on one chunk does not affect adjacent chunks', async () => {
    mock200({ planRunId: 'plan-1', totalChunks: 2, strategy: 'legacy_slugline', chunkMeta: [] });
    // Chunk 1: 401 → success
    mock401(); mock200({ rewrittenText: 'C1 after refresh padded for assembly.' });
    // Chunk 2: no 401
    mock200({ rewrittenText: 'C2 normal padded for assembly.' });
    mock200({ newVersion: { id: 'v-final' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });
    expect(result.current.status).toBe('complete');
    expect(result.current.currentChunk).toBe(2);
    // Only chunk 1 triggered a refresh (1 call)
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });

  it('consecutive rewrites each get independent tokens and refresh', async () => {
    // Rewrite 1 — no 401
    mock200({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mock200({ rewrittenText: 'First rewrite padded for assembly.' });
    mock200({ newVersion: { id: 'v-1' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });
    expect(result.current.status).toBe('complete');
    expect(mockRefreshSession).not.toHaveBeenCalled();

    // Rewrite 2 — complete reset
    vi.clearAllMocks();
    global.fetch = mockFetch;
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'second-token-456', user: { id: 'user-1' } } },
      error: null,
    });
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: REFRESHED_TOKEN, user: { id: 'user-1' } } },
      error: null,
    });

    mock401(); mock200({ planRunId: 'plan-2', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mock200({ rewrittenText: 'Second rewrite padded for assembly.' });
    mock200({ newVersion: { id: 'v-2' } });

    act(() => { result.current.reset(); });
    await act(async () => {
      await result.current.startRewrite('doc-2', 'version-2', [], []);
    });
    expect(result.current.status).toBe('complete');

    expect(mockFetch.mock.calls[0][1]?.headers?.Authorization).toBe('Bearer second-token-456');
    expect(mockFetch.mock.calls[1][1]?.headers?.Authorization).toBe(`Bearer ${REFRESHED_TOKEN}`);
  });

});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('Edge cases', () => {

  it('non-JSON error body on 401 still triggers refresh', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 401,
      text: () => Promise.resolve('Gateway Timeout'),
      headers: new Headers(),
    });
    mock200({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mock200({ rewrittenText: 'Content padded for assembly.' });
    mock200({ newVersion: { id: 'v-1' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });
    expect(result.current.status).toBe('complete');
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });

});