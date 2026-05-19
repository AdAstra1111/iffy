/**
 * Document Assistant — .maybeSingle() for 406 Not Acceptable fix
 *
 * Problem: Supabase `.single()` throws a 406 PGRST116 error when the query
 * returns zero rows. For `document_assistant_threads`, this happens when a
 * project has never used the document assistant before — a valid state that
 * should return `null`, not crash.
 *
 * Fix: Changed `.single()` → `.maybeSingle()` on both:
 *   - src/hooks/useDocAssistantPersistent.ts (frontend query)
 *   - supabase/functions/document-assistant-run/index.ts (edge function query)
 *
 * `.maybeSingle()` returns `null` when no rows match, handling the 406
 * gracefully without an exception.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Track which query methods are called
const callLog: string[] = [];

// Mock supabase chain
const mockMaybeSingle = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockGetUser = vi.fn();
const mockGetSession = vi.fn();

// Reset call log each test
beforeEach(() => {
  vi.clearAllMocks();
  callLog.length = 0;

  // Default: no thread exists (first use of doc assistant)
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle });
  mockOrder.mockReturnValue({ limit: mockLimit, maybeSingle: mockMaybeSingle });
  mockEq.mockReturnValue({ order: mockOrder, limit: mockLimit, maybeSingle: mockMaybeSingle });

  // select can be used for .select("id") on threads OR .select("*") on messages/actions
  mockSelect.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      order: mockOrder,
      limit: mockLimit,
      maybeSingle: mockMaybeSingle,
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    order: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  });

  mockFrom.mockReturnValue({
    select: mockSelect,
  });

  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1' } },
    error: null,
  });

  mockGetSession.mockResolvedValue({
    data: {
      session: {
        access_token: 'test-token',
        user: { id: 'user-1' },
      },
    },
    error: null,
  });
});

// Mock supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('useDocAssistantPersistent — .maybeSingle() fix for 406', () => {
  it('1. Primary use case: existing thread is returned when one exists', async () => {
    // Given: a thread exists for this project
    mockMaybeSingle.mockResolvedValue({ data: { id: 'thread-42' }, error: null });

    const { useDocAssistantPersistent } = await import(
      '@/hooks/useDocAssistantPersistent'
    );

    const { result } = renderHook(
      () => useDocAssistantPersistent('project-1'),
      { wrapper: createWrapper() }
    );

    // Wait for query to settle
    await vi.waitFor(
      () => {
        expect(result.current.threadId).toBe('thread-42');
      },
      { timeout: 3000 }
    );
  });

  it('2. EDGE CASE: no thread exists — .maybeSingle() returns null, no 406 crash', async () => {
    // Given: no thread exists (first-ever use of doc assistant for this project)
    // maybeSingle returns { data: null } instead of throwing a 406 error
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const { useDocAssistantPersistent } = await import(
      '@/hooks/useDocAssistantPersistent'
    );

    const { result } = renderHook(
      () => useDocAssistantPersistent('project-1'),
      { wrapper: createWrapper() }
    );

    // Wait long enough for the query to resolve
    await vi.waitFor(
      () => {
        // threadId stays null — the query returned null, useEffect didn't set it
        expect(result.current.threadId).toBeNull();
        // No loading state
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: 3000 }
    );
  });

  it('3. EDGE CASE: undefined projectId — query is disabled, no crash', async () => {
    const { useDocAssistantPersistent } = await import(
      '@/hooks/useDocAssistantPersistent'
    );

    const { result } = renderHook(
      () => useDocAssistantPersistent(undefined),
      { wrapper: createWrapper() }
    );

    // With projectId undefined, the query should NOT be enabled
    // so mockFrom should NOT have been called for the thread query
    expect(result.current.threadId).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('4. INVARIANT: .maybeSingle() is used (not .single()) on document_assistant_threads in hook', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      '/Users/laralane/code/iffy/src/hooks/useDocAssistantPersistent.ts',
      'utf-8'
    );

    // Find the document_assistant_threads query in queryFn
    const threadQuery = source.match(
      /from\(['"]document_assistant_threads['"]\)[\s\S]*?\.(?:maybeSingle|single)\(\)/
    );

    expect(threadQuery).not.toBeNull();
    // MUST use .maybeSingle(), NOT .single()
    expect(threadQuery![0]).toContain('.maybeSingle()');
    expect(threadQuery![0]).not.toContain('.single()');
  });

  it('5. INVARIANT: .maybeSingle() is used (not .single()) on document_assistant_threads in edge function', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      '/Users/laralane/code/iffy/supabase/functions/document-assistant-run/index.ts',
      'utf-8'
    );

    // Find the document_assistant_threads query
    const threadQuery = source.match(
      /from\(["']document_assistant_threads["']\)[\s\S]*?\.(?:maybeSingle|single)\(\)/
    );

    expect(threadQuery).not.toBeNull();
    // MUST use .maybeSingle(), NOT .single()
    expect(threadQuery![0]).toContain('.maybeSingle()');
    expect(threadQuery![0]).not.toContain('.single()');
  });

  it('6. INVARIANT: No .single() calls remain on document_assistant_threads SELECT queries', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const filesToCheck = [
      '/Users/laralane/code/iffy/src/hooks/useDocAssistantPersistent.ts',
      '/Users/laralane/code/iffy/supabase/functions/document-assistant-run/index.ts',
    ];

    for (const filePath of filesToCheck) {
      const source = fs.readFileSync(filePath, 'utf-8');
      // Find only SELECT queries on document_assistant_threads (not INSERT queries)
      // INSERT queries legitimately chain .select().single() — insert always returns exactly one row
      const allThreadQueries = source.match(
        /from\(['"]document_assistant_threads['"][\s\S]*?\.select\([\s\S]*?\.(?:maybeSingle|single)\(\)/g
      );

      if (allThreadQueries) {
        // Filter out INSERT queries — those legitimately use .single()
        const selectQueries = allThreadQueries.filter(q => !q.includes('.insert('));
        for (const q of selectQueries) {
          expect(q).toContain('.maybeSingle()');
          expect(q).not.toContain('.single()');
        }
        // Ensure we found at least one SELECT query (not just INSERT queries)
        expect(selectQueries.length).toBeGreaterThan(0);
      }
    }
  });

  it('7. REGRESSION: messages query still works when thread exists', async () => {
    // Set up: thread exists
    mockMaybeSingle.mockResolvedValue({ data: { id: 'thread-42' }, error: null });

    const { useDocAssistantPersistent } = await import(
      '@/hooks/useDocAssistantPersistent'
    );

    const { result } = renderHook(
      () => useDocAssistantPersistent('project-1'),
      { wrapper: createWrapper() }
    );

    await vi.waitFor(
      () => {
        expect(result.current.threadId).toBe('thread-42');
        // messages should be an empty array (default mock value)
        expect(Array.isArray(result.current.messages)).toBe(true);
      },
      { timeout: 3000 }
    );
  });

  it('8. REGRESSION: sendMessage mutation works', async () => {
    // Mock fetch for the sendMessage mutation
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        threadId: 'thread-42',
        messages: [],
        actions: [],
        actionResults: [],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    mockMaybeSingle.mockResolvedValue({ data: { id: 'thread-42' }, error: null });

    const { useDocAssistantPersistent } = await import(
      '@/hooks/useDocAssistantPersistent'
    );

    const { result } = renderHook(
      () => useDocAssistantPersistent('project-1'),
      { wrapper: createWrapper() }
    );

    await vi.waitFor(
      () => {
        expect(result.current.threadId).toBe('thread-42');
      },
      { timeout: 3000 }
    );

    // Send a message
    result.current.sendMessage.mutate('Hello, assistant!');

    await vi.waitFor(
      () => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const callUrl = mockFetch.mock.calls[0][0];
        expect(callUrl).toContain('/api/supabase-proxy/functions/v1/document-assistant-run');
      },
      { timeout: 3000 }
    );

    vi.unstubAllGlobals();
  });
});

describe('Edge function — document-assistant-run structural analysis', () => {
  it('document_assistant_threads SELECT query uses .maybeSingle() (not .single())', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      '/Users/laralane/code/iffy/supabase/functions/document-assistant-run/index.ts',
      'utf-8'
    );

    // The SELECT query for reading threads was fixed: line 108-110
    // Find the SELECT query (not INSERT) on document_assistant_threads
    const selectQuery = source.match(
      /from\(["']document_assistant_threads["'][\s\S]*?\.select\([\s\S]*?\.(?:maybeSingle|single)\(\)/
    );

    expect(selectQuery).not.toBeNull();
    expect(selectQuery![0]).toContain('.maybeSingle()');

    // The INSERT query legitimately uses .single() — confirm it exists but it's not what we're checking
    const insertQuery = source.match(
      /from\(["']document_assistant_threads["'][\s\S]*?\.insert\([\s\S]*?\.single\(\)/
    );
    expect(insertQuery).not.toBeNull();
  });
});
