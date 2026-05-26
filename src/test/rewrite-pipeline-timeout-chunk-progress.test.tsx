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
    const src = fs.readFileSync('/Users/laralane/iffy-analysis/src/hooks/useRewritePipeline.ts', 'utf-8');
    expect(src).toContain('timeoutMs = 120_000');
  });

  it('AbortController uses setTimeout(() => controller.abort(), timeoutMs) pattern', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('/Users/laralane/iffy-analysis/src/hooks/useRewritePipeline.ts', 'utf-8');
    expect(src).toContain('setTimeout(() => controller.abort(), timeoutMs)');
  });

  it('rewrite-chunk call passes 300_000 as timeout', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('/Users/laralane/iffy-analysis/src/hooks/useRewritePipeline.ts', 'utf-8');
    const chunkIdx = src.indexOf("callEngine('rewrite-chunk'");
    const ctx = src.substring(chunkIdx, chunkIdx + 200);
    expect(ctx).toContain('300_000');
  });

  it('pipeline completes with rewrite-chunk using correct endpoint', { timeout: 15000 }, async () => {
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
    expect(chunkCalls[0][0]).toContain('supabase.co/functions/v1/dev-engine-v2');
  });

});