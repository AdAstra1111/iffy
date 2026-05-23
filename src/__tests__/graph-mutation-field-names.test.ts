/**
 * Tests for: Graph Mutation Pipeline field name mismatch fix
 *
 * Commit 5bd7a30 — Changes:
 *   approveMutation: project_id -> projectId, proposal_ids -> proposalIds
 *   rejectMutation:  project_id -> projectId, proposal_ids -> proposalIds, review_comment -> reviewComment
 *
 * Backend (dev-engine-v2/index.ts:7509) destructures:
 *   const { projectId, proposalIds, approved, reviewComment } = body;
 *
 * This fix aligns the frontend field names with the backend expectations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── File path for static analysis ──────────────────────────────────────────────

const HOOK_PATH = '/Users/laralane/code/iffy/src/hooks/useGraphMutations.ts';
const HANDLER_PATH = '/Users/laralane/code/iffy/supabase/functions/dev-engine-v2/handlers/apply-graph-mutations.ts';
const BACKEND_PATH = '/Users/laralane/code/iffy/supabase/functions/dev-engine-v2/index.ts';

// ── Mocked function tracking ──────────────────────────────────────────────────

const mockInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              then: (cb: any) => cb({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock: approve/reject succeeds
  mockInvoke.mockResolvedValue({
    data: { ok: true },
    error: null,
  });
});

// ── Wrapper for renderHook ─────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  );
}

// ── Static analysis — source code structure ────────────────────────────────────

describe('Static — field names in useGraphMutations.ts', () => {

  it('approveMutation body key is projectId (not project_id as key)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');
    const lines = src.split('\n');
    const approveLine = lines.find(l => l.includes('approved: true'));
    expect(approveLine).toBeDefined();
    // Body KEY should be projectId: (left side of colon), not project_id:
    // The VALUE proposals[0]?.project_id is fine — it reads from the DB field
    expect(approveLine!).toMatch(/projectId\s*:/);
    expect(approveLine!).not.toMatch(/^\s*body.*project_id\s*:/); // project_id: as KEY with colon
  });

  it('approveMutation body key is proposalIds (not proposal_ids as key)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');
    const lines = src.split('\n');
    const approveLine = lines.find(l => l.includes('approved: true'));
    expect(approveLine).toBeDefined();
    expect(approveLine!).toMatch(/proposalIds\s*:/);
    expect(approveLine!).not.toMatch(/proposal_ids\s*:/);
  });

  it('rejectMutation body keys are projectId, proposalIds, reviewComment (no snake_case keys)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');
    const lines = src.split('\n');
    const rejectLine = lines.find(l => l.includes('approved: false'));
    expect(rejectLine).toBeDefined();
    // Must have camelCase keys
    expect(rejectLine!).toMatch(/projectId\s*:/);
    expect(rejectLine!).toMatch(/proposalIds\s*:/);
    expect(rejectLine!).toMatch(/reviewComment\s*:/);
    // Must NOT have snake_case keys (left side of colon)
    expect(rejectLine!).not.toMatch(/(?<!\.)project_id\s*:/);  // project_id: as KEY (not .project_id value)
    expect(rejectLine!).not.toMatch(/(?<!\.)proposal_ids\s*:/);
    expect(rejectLine!).not.toMatch(/(?<!\.)review_comment\s*:/);
  });

});

// ── Dynamic tests: verify actual body sent to supabase ─────────────────────────

describe('Dynamic — approveMutation sends correct field names to backend', () => {

  it('approveMutation sends projectId (camelCase) as the body key', async () => {
    const { useGraphMutations } = await import('@/hooks/useGraphMutations');
    const { result } = renderHook(() => useGraphMutations(), { wrapper: createWrapper() });

    // Set proposals so proposals[0]?.project_id is available
    // We can't directly set state, so let's test via the actual code path
    // The hook reads proposals[0]?.project_id for the value of projectId

    await act(async () => {
      await result.current.approveMutation('proposal-1');
    });

    // Verify invoke was called with camelCase keys
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const callArgs = mockInvoke.mock.calls[0];
    expect(callArgs[1]).toBeDefined();
    expect(callArgs[1].body).toBeDefined();
    // Must NOT have snake_case keys
    expect(callArgs[1].body).not.toHaveProperty('project_id');
    expect(callArgs[1].body).not.toHaveProperty('proposal_ids');
    // MUST have camelCase keys
    expect(callArgs[1].body).toHaveProperty('projectId');
    expect(callArgs[1].body).toHaveProperty('proposalIds');
  });

  it('approveMutation sends approved: true in the body', async () => {
    const { useGraphMutations } = await import('@/hooks/useGraphMutations');
    const { result } = renderHook(() => useGraphMutations(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.approveMutation('proposal-1');
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0][1].body.approved).toBe(true);
    expect(mockInvoke.mock.calls[0][1].body.action).toBe('apply_graph_mutations');
  });

  it('rejectMutation sends reviewComment (camelCase) in the body', async () => {
    const { useGraphMutations } = await import('@/hooks/useGraphMutations');
    const { result } = renderHook(() => useGraphMutations(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.rejectMutation('proposal-2', 'Needs more detail');
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const body = mockInvoke.mock.calls[0][1].body;
    // Must NOT have snake_case
    expect(body).not.toHaveProperty('review_comment');
    // MUST have camelCase
    expect(body).toHaveProperty('reviewComment');
    expect(body.reviewComment).toBe('Needs more detail');
    expect(body.approved).toBe(false);
  });

  it('rejectMutation sends approved: false in the body', async () => {
    const { useGraphMutations } = await import('@/hooks/useGraphMutations');
    const { result } = renderHook(() => useGraphMutations(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.rejectMutation('proposal-3');
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0][1].body.approved).toBe(false);
  });

});

// ── Backend handler field name validation ─────────────────────────────────────

describe('Static — backend handler expects camelCase field names', () => {

  it('backend handler destructures projectId, proposalIds, approved, reviewComment', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(BACKEND_PATH, 'utf-8');
    // Line ~7509
    const hasCamelCase = src.includes('const { projectId, proposalIds, approved, reviewComment } = body;');
    expect(hasCamelCase).toBe(true);
  });

  it('backend handler interface uses camelCase', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HANDLER_PATH, 'utf-8');
    const hasInterface = src.includes('projectId: string') && src.includes('proposalIds: string[]') && src.includes('reviewComment?: string');
    expect(hasInterface).toBe(true);
  });

});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('Edge cases — error handling in graph mutations', () => {

  it('approveMutation handles invoke error gracefully', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Network error'));
    const { useGraphMutations } = await import('@/hooks/useGraphMutations');
    const { result } = renderHook(() => useGraphMutations(), { wrapper: createWrapper() });

    await act(async () => {
      const ok = await result.current.approveMutation('proposal-1');
      expect(ok).toBe(false);
    });
  });

  it('rejectMutation handles invoke error gracefully', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Network error'));
    const { useGraphMutations } = await import('@/hooks/useGraphMutations');
    const { result } = renderHook(() => useGraphMutations(), { wrapper: createWrapper() });

    await act(async () => {
      const ok = await result.current.rejectMutation('proposal-1', 'No good');
      expect(ok).toBe(false);
    });
  });

  it('rejectMutation handles empty comment correctly', async () => {
    const { useGraphMutations } = await import('@/hooks/useGraphMutations');
    const { result } = renderHook(() => useGraphMutations(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.rejectMutation('proposal-4');
    });

    // When comment is undefined, reviewComment should be undefined
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const body = mockInvoke.mock.calls[0][1].body;
    // The body should still have reviewComment key
    expect(body).toHaveProperty('reviewComment');
  });

});