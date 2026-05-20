/**
 * Tests for: Fix: Rewrite stuck at chunk 1 of 6 — timeout chain realignment
 *
 * Commit 6a6b3ee — Two changes:
 *   1. callEngine now accepts optional timeoutMs param (default 120_000),
 *      300_000 at rewrite-chunk call site
 *   2. setState({ currentChunk }) moved from before API call to after
 *      successful chunk completion
 *
 * Prevents regression of: frontend timeout before edge function,
 *   "stuck at chunk 1" appearance while chunk is still processing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRewritePipeline } from '@/hooks/useRewritePipeline';

// ── Mock setup ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
const mockToast = vi.fn();

// Mock supabase
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

// Helpers
function mockFetchResponse(data: any, ok = true, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers(),
  });
}

function mockFetchHang(): Promise<Response> {
  return new Promise<never>(() => {});
}

function createAbortError(): Error {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}

// Fresh QueryClient per test via factory
function createWrapper() {
  const qc = new QueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch;

  mockGetSession.mockResolvedValue({
    data: {
      session: { access_token: 'test-token', user: { id: 'user-1' } },
    },
    error: null,
  });
});

// ── CHANGE 1: timeoutMs parameter propagation (static) ─────────────────────────

describe('CHANGE 1 — timeoutMs parameter', () => {

  it('callEngine signature has timeoutMs = 120_000 default', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('/Users/laralane/code/iffy/src/hooks/useRewritePipeline.ts', 'utf-8');
    expect(src).toContain('timeoutMs = 120_000');
  });

  it('AbortController uses timeoutMs variable not hardcoded 120_000', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('/Users/laralane/code/iffy/src/hooks/useRewritePipeline.ts', 'utf-8');
    expect(src).toContain('controller.abort(), timeoutMs');
  });

  it('rewrite-chunk call passes 300_000 as timeout', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('/Users/laralane/code/iffy/src/hooks/useRewritePipeline.ts', 'utf-8');
    const chunkIdx = src.indexOf("callEngine('rewrite-chunk'");
    const ctx = src.substring(chunkIdx, chunkIdx + 200);
    expect(ctx).toContain('300_000');
  });

  it('pipeline completes with rewrite-chunk using correct endpoint', async () => {
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mockFetchResponse({ rewrittenText: 'Chunk content with padding for assembly threshold check.' });
    mockFetchResponse({ newVersion: { id: 'v-1' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });

    expect(result.current.status).toBe('complete');

    const chunkCalls = mockFetch.mock.calls.filter((c: any) => {
      try { return JSON.parse(c[1]?.body || '{}').action === 'rewrite-chunk'; }
      catch { return false; }
    });
    expect(chunkCalls.length).toBe(1);
    expect(chunkCalls[0][0]).toContain('/api/supabase-proxy/functions/v1/dev-engine-v2');
  });

});

// ── CHANGE 2: currentChunk state update after API call ────────────────────────

describe('CHANGE 2 — currentChunk after completion', () => {

  it('currentChunk increments only after successful chunk API response', async () => {
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 2, strategy: 'legacy_slugline', chunkMeta: [] });
    mockFetchResponse({ rewrittenText: 'First chunk content padding...' });
    mockFetch.mockImplementationOnce(() => mockFetchHang());

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    act(() => { result.current.startRewrite('doc-1', 'version-1', [], []); });
    await new Promise(r => setTimeout(r, 300));

    expect(result.current.currentChunk).toBe(1);
  });

  it('currentChunk stays at 0 when chunk fails (retries exhausted)', async () => {
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 2, strategy: 'legacy_slugline', chunkMeta: [] });
    // Retries exhausted — all attempts return 500
    mockFetch.mockResolvedValue({
      ok: false, status: 500,
      text: () => Promise.resolve(JSON.stringify({ error: 'fail' })),
      headers: new Headers(),
    });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.currentChunk).toBe(0);
  });

  it('setState currentChunk appears after callEngine in source code order', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('/Users/laralane/code/iffy/src/hooks/useRewritePipeline.ts', 'utf-8');
    const callIdx = src.indexOf("callEngine('rewrite-chunk'");
    const setIdx = src.indexOf('setState(s => ({ ...s, currentChunk:');
    expect(setIdx).toBeGreaterThan(callIdx);
  });

  it('full pipeline reaches currentChunk == totalChunks', async () => {
    const total = 3;
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: total, strategy: 'legacy_slugline', chunkMeta: [] });
    for (let i = 0; i < total; i++)
      mockFetchResponse({ rewrittenText: `Chunk ${i + 1} padding for assembly threshold check...` });
    mockFetchResponse({ newVersion: { id: 'v-final' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });

    expect(result.current.status).toBe('complete');
    expect(result.current.currentChunk).toBe(total);
  });

});

// ── INVARIANT TESTS ────────────────────────────────────────────────────────────

describe('Invariant — error handling', () => {

  it('AbortError shows timeout message', async () => {
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 2, strategy: 'legacy_slugline', chunkMeta: [] });
    mockFetch.mockImplementationOnce(() => Promise.reject(createAbortError()));

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('timed out');
  });

  it('retries on network error then succeeds on 3rd attempt', async () => {
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mockFetch.mockRejectedValueOnce(new Error('Net err'));
    mockFetch.mockRejectedValueOnce(new Error('Net err'));
    mockFetchResponse({ rewrittenText: 'Content padding for assembly...' });
    mockFetchResponse({ newVersion: { id: 'v-retry' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });

    expect(result.current.status).toBe('complete');
    expect(result.current.currentChunk).toBe(1);
  });

  it('empty response sets error state', async () => {
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    // All retries return empty response (retries=2 means 3 total attempts)
    for (let i = 0; i < 3; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        text: () => Promise.resolve(''),
        headers: new Headers(),
      });
    }

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });

    expect(result.current.status).toBe('error');
    // Retries exhaust — error is set
    expect(result.current.error).toBeTruthy();
  });

  it('malformed JSON sets error state', async () => {
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      text: () => Promise.resolve('not json {{{'),
      headers: new Headers(),
    });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });

    expect(result.current.status).toBe('error');
  });

  it('short assembled content (<10 chars) rejected by guard', async () => {
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mockFetchResponse({ rewrittenText: 'Short' });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'version-1', [], []);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('no content');
  });

});

// ── REGRESSION ─────────────────────────────────────────────────────────────────

describe('Regression', () => {

  it('rewrite-plan called with correct params first', async () => {
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mockFetchResponse({ rewrittenText: 'Content padding...' });
    mockFetchResponse({ newVersion: { id: 'v-1' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'ver-1', ['note1'], ['protect1']);
    });

    const planCall = mockFetch.mock.calls.find((c: any) => {
      try { return JSON.parse(c[1]?.body || '{}').action === 'rewrite-plan'; }
      catch { return false; }
    });
    expect(planCall).toBeTruthy();
    const body = JSON.parse(planCall[1].body);
    expect(body.projectId).toBe('project-1');
    expect(body.documentId).toBe('doc-1');
    expect(body.approvedNotes).toEqual(['note1']);
    expect(body.protectItems).toEqual(['protect1']);
  });

  it('reset restores idle state', async () => {
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mockFetchResponse({ rewrittenText: 'Content padding...' });
    mockFetchResponse({ newVersion: { id: 'v-reset' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'ver-1', [], []);
    });
    expect(result.current.status).toBe('complete');

    act(() => { result.current.reset(); });
    expect(result.current.status).toBe('idle');
    expect(result.current.currentChunk).toBe(0);
    expect(result.current.newVersionId).toBeNull();
  });

  it('error on chunk keeps currentChunk at 0', async () => {
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mockFetch.mockRejectedValueOnce(new Error('Crash'));

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'ver-1', [], []);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.currentChunk).toBe(0);
  });

  it('concurrent guard prevents doubled requests', async () => {
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 2, strategy: 'legacy_slugline', chunkMeta: [] });
    mockFetchResponse({ rewrittenText: 'C1 padding...' });
    mockFetchResponse({ rewrittenText: 'C2 padding...' });
    mockFetchResponse({ newVersion: { id: 'v-final' } });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    act(() => { result.current.startRewrite('doc-1', 'ver-1', [], []); });
    act(() => { result.current.startRewrite('doc-1', 'ver-1', [], []); });

    await new Promise(r => setTimeout(r, 500));
    // plan + 2 chunks + assembly = 4 minimum, should be < 8 (not doubled)
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(mockFetch.mock.calls.length).toBeLessThan(8);
  });

});

// ── EDGE CASES ─────────────────────────────────────────────────────────────────

describe('Edge cases', () => {

  it('no projectId skips engine call', async () => {
    const { result } = renderHook(() => useRewritePipeline(undefined), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'ver-1', [], []);
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('session auth failure shows error', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'ver-1', [], []);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('Not authenticated');
  });

  it('runtime warning appears in toast', async () => {
    mockFetchResponse({ planRunId: 'plan-1', totalChunks: 1, strategy: 'legacy_slugline', chunkMeta: [] });
    mockFetchResponse({ rewrittenText: 'Content padding for assembly...' });
    mockFetchResponse({ newVersion: { id: 'v-warn' }, runtimeWarning: 'Slow model' });

    const { result } = renderHook(() => useRewritePipeline('project-1'), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.startRewrite('doc-1', 'ver-1', [], []);
    });

    expect(result.current.status).toBe('complete');
    expect(mockToast).toHaveBeenCalledWith('warning', expect.stringMatching(/slow/i));
  });

});