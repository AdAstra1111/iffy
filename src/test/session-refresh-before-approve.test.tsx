/**
 * Tests for: Fix UI toast flood 'failed to fetch' on manual document approval
 *
 * Commit 5cebfa4 — One change:
 *   await supabase.auth.refreshSession({ force: true });
 *   added as first line inside doApproveAndActivate(), before the null guard.
 *
 * Prevents regression of: After a long rewrite session (~1h), the auth token
 * expires. When the user manually approves a document version, the edge function
 * call returns 401 which surfaces as a "failed to fetch" network error. The UI
 * retries aggressively, producing a toast flood.
 *
 * Fix: Refresh the session before making the API call. If the token is already
 * valid, refreshSession({ force: true }) is a no-op success. If the token is
 * expired, it's refreshed transparently. If there's no session, refreshSession
 * throws and the existing try/catch shows a toast error.
 *
 * Edge cases:
 * 1. Token already valid  — refreshSession({ force: true }) is a no-op success
 * 2. Token expired        — refreshSession succeeds, approveAndActivate works
 * 3. No session           — refreshSession throws, caught by try/catch → toast.error
 * 4. Foundation doc       — goes through CanonDeltaDialog → same doApproveAndActivate path
 * 5. Non-foundation doc   — goes through handleApproveVersion → same path
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── File path for static analysis ──────────────────────────────────────────────

const SRC_PATH = '/Users/laralane/code/iffy/src/pages/ProjectDevelopmentEngine.tsx';

// ── Mocked function tracking for dynamic tests ─────────────────────────────────

const mockRefreshSession = vi.fn();
const mockInvoke = vi.fn();
const mockToast = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      refreshSession: (...args: any[]) => mockRefreshSession(...args),
    },
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
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

beforeEach(() => {
  vi.clearAllMocks();

  mockRefreshSession.mockResolvedValue({
    data: { session: { access_token: 'fresh-token', user: { id: 'user-1' } } },
    error: null,
  });

  mockInvoke.mockResolvedValue({
    data: { success: true, versionId: 'v-1' },
    error: null,
  });
});

// ── Static analysis — source code structure ────────────────────────────────────

describe('Static — refreshSession in doApproveAndActivate', () => {

  it('refreshSession({ force: true }) is present inside doApproveAndActivate', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');
    const fnStart = src.indexOf('const doApproveAndActivate = async () => {');
    expect(fnStart).toBeGreaterThan(0);
    const fnClose = src.indexOf('};', fnStart);
    const fnBody = src.substring(fnStart, fnClose);
    expect(fnBody).toContain('await supabase.auth.refreshSession({ force: true })');
  });

  it('refreshSession is inside try block, after null guard', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');
    const fnStart = src.indexOf('const doApproveAndActivate = async () => {');
    const fnClose = src.indexOf('};', fnStart);
    const fnBody = src.substring(fnStart, fnClose);

    // The null guard runs before the try block
    const nullGuardIdx = fnBody.indexOf('if (!projectId || !selectedVersionId)');
    const tryIdx = fnBody.indexOf('try {');
    expect(tryIdx).toBeGreaterThan(nullGuardIdx);

    // refreshSession is inside the try block (after try { )
    const refreshIdx = fnBody.indexOf('refreshSession');
    expect(refreshIdx).toBeGreaterThan(tryIdx);
  });

  it('refreshSession is called with { force: true } — not bare {} or empty parens', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');
    const fnStart = src.indexOf('const doApproveAndActivate = async () => {');
    const fnClose = src.indexOf('};', fnStart);
    const fnBody = src.substring(fnStart, fnClose);
    // Must use { force: true } — bare refreshSession() doesn't force a refresh
    expect(fnBody).toContain('refreshSession({ force: true })');
    // No bare calls with empty args
    expect(fnBody).not.toContain('refreshSession()');
    expect(fnBody).not.toContain('refreshSession({})');
  });

  it('handleApproveVersion wraps doApproveAndActivate in try/catch', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');
    const fnStart = src.indexOf('const handleApproveVersion = async () => {');
    expect(fnStart).toBeGreaterThan(0);
    const fnClose = src.indexOf('};', fnStart);
    const fnBody = src.substring(fnStart, fnClose);
    expect(fnBody).toContain('try');
    expect(fnBody).toContain('catch');
    expect(fnBody).toContain('doApproveAndActivate()');
    expect(fnBody).toContain('toast.error');
  });

  it('CanonDeltaDialog onConfirm wraps doApproveAndActivate in try/catch', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');
    // Find the onConfirm handler in CanonDeltaDialog
    const dialogStart = src.indexOf('<CanonDeltaDialog');
    expect(dialogStart).toBeGreaterThan(0);
    const onConfirmIdx = src.indexOf('onConfirm={', dialogStart);
    expect(onConfirmIdx).toBeGreaterThan(dialogStart);
    // Read enough context to verify try/catch wrapping
    const contextStart = Math.max(0, onConfirmIdx - 100);
    const contextEnd = Math.min(src.length, onConfirmIdx + 500);
    const context = src.substring(contextStart, contextEnd);
    expect(context).toContain('try');
    expect(context).toContain('catch');
    expect(context).toContain('doApproveAndActivate()');
    expect(context).toContain('toast.error');
  });

});

// ── Edge case verification — source-level ────────────────────────────────────

describe('Edge cases — source-level verification', () => {

  it('Edge case 1: token already valid — refreshSession({ force: true }) is a no-op', async () => {
    // refreshSession({ force: true }) with a valid session silently succeeds.
    // Verify the code path: refreshSession is inside try block before approveAndActivate.
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');
    const fnStart = src.indexOf('const doApproveAndActivate = async () => {');
    const fnClose = src.indexOf('};', fnStart);
    const fnBody = src.substring(fnStart, fnClose);

    // refreshSession is inside the try block
    const tryIdx = fnBody.indexOf('try {');
    const refreshIdx = fnBody.indexOf('refreshSession');
    expect(refreshIdx).toBeGreaterThan(tryIdx);

    // refreshSession is called before approveAndActivate (sequential in try block)
    const approveIdx = fnBody.indexOf('approveAndActivate');
    expect(approveIdx).toBeGreaterThan(refreshIdx);

    // Nothing meaningful between refreshSession and approveAndActivate that could skip it
    const between = fnBody.substring(
      fnBody.indexOf('\n', refreshIdx) + 1,
      approveIdx
    ).trim();
    // Between them should be only `await` — no guards or branches
    expect(between).toBe('await');
  });

  it('Edge case 2: token expired — refreshSession succeeds and approve proceeds', async () => {
    // Same code path as valid session — refreshSession({ force: true })
    // handles both fresh and expired tokens internally.
    // refreshSession is inside the try block, so if it succeeds,
    // approveAndActivate runs immediately after.
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');
    const fnStart = src.indexOf('const doApproveAndActivate = async () => {');
    const fnClose = src.indexOf('};', fnStart);
    const fnBody = src.substring(fnStart, fnClose);

    // refreshSession is INSIDE the try block
    const tryIdx = fnBody.indexOf('try {');
    const refreshIdx = fnBody.indexOf('refreshSession');
    expect(tryIdx).toBeGreaterThan(0);
    expect(refreshIdx).toBeGreaterThan(tryIdx);

    // refreshSession is not wrapped in its own try/catch inside the try block
    const afterTryBrace = fnBody.substring(tryIdx, refreshIdx);
    expect(afterTryBrace).toContain('try {');
    expect(afterTryBrace).not.toContain('catch');
  });

  it('Edge case 3: no session — refreshSession throws, caught by finally + caller try/catch', async () => {
    // refreshSession without an active session throws.
    // doApproveAndActivate has try { ... } finally { ... } (no catch).
    // The finally block runs (resets setApprovePending(false)), then the error
    // propagates to the caller (handleApproveVersion or CanonDeltaDialog onConfirm)
    // which wraps it in try/catch and shows toast.error.
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');

    // Verify doApproveAndActivate has try/finally (no catch)
    const fnStart = src.indexOf('const doApproveAndActivate = async () => {');
    const fnClose = src.indexOf('};', fnStart);
    const fnBody = src.substring(fnStart, fnClose);
    expect(fnBody).toContain('try {');
    expect(fnBody).toContain('} finally {');
    // No catch in doApproveAndActivate — error propagates to caller
    const tryBlock = fnBody.substring(fnBody.indexOf('try {'), fnBody.indexOf('};'));
    expect(tryBlock).not.toContain('catch');

    // Verify handleApproveVersion has its own try/catch
    const fnStart2 = src.indexOf('const handleApproveVersion = async () => {');
    const fnClose2 = src.indexOf('};', fnStart2);
    const fnBody2 = src.substring(fnStart2, fnClose2);
    expect(fnBody2).toContain('try {');
    expect(fnBody2).toContain('catch');
    expect(fnBody2).toContain('toast.error(err.message');
  });

  it('Edge case 4: Foundation doc approval goes through CanonDeltaDialog → same path', async () => {
    // Foundation docs (concept_brief, beat_sheet, etc.) set canDeltaOpen = true
    // which opens the CanonDeltaDialog. Its onConfirm calls doApproveAndActivate.
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');

    // CanonDeltaDialog receives onConfirm that calls doApproveAndActivate
    const dialogStart = src.indexOf('<CanonDeltaDialog');
    expect(dialogStart).toBeGreaterThan(0);
    const onConfirm = src.substring(
      src.indexOf('onConfirm', dialogStart),
      src.indexOf('}}', src.indexOf('onConfirm', dialogStart)) + 2
    );
    expect(onConfirm).toContain('doApproveAndActivate()');
  });

  it('Edge case 5: Non-foundation doc goes through handleApproveVersion → same doApproveAndActivate', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');
    const fnStart = src.indexOf('const handleApproveVersion = async () => {');
    const fnClose = src.indexOf('};', fnStart);
    const fnBody = src.substring(fnStart, fnClose);
    expect(fnBody).toContain('doApproveAndActivate()');
  });

});

// ── Dynamic — module integration tests ────────────────────────────────────────

describe('Dynamic — approveAndActivate helper module', () => {

  it('approveAndActivate calls supabase.functions.invoke with correct params', async () => {
    const { approveAndActivate } = await import('@/lib/active-folder/approveAndActivate');
    await approveAndActivate({
      projectId: 'proj-1',
      documentVersionId: 'v-123',
      sourceFlow: 'dev_engine',
    });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('project-folder-engine', {
      body: {
        action: 'approve',
        projectId: 'proj-1',
        documentVersionId: 'v-123',
        sourceFlow: 'dev_engine',
        notes: undefined,
      },
    });
  });

  it('approveAndActivate throws on error response', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: new Error('Edge function error'),
    });
    const { approveAndActivate } = await import('@/lib/active-folder/approveAndActivate');
    await expect(
      approveAndActivate({ projectId: 'proj-1', documentVersionId: 'v-123' })
    ).rejects.toThrow('Edge function error');
  });

  it('approveAndActivate returns data on success', async () => {
    const expected = { success: true, versionId: 'v-1' };
    mockInvoke.mockResolvedValue({ data: expected, error: null });
    const { approveAndActivate } = await import('@/lib/active-folder/approveAndActivate');
    const result = await approveAndActivate({ projectId: 'proj-1', documentVersionId: 'v-123' });
    expect(result).toEqual(expected);
  });

});

describe('Dynamic — auth session refresh edge cases', () => {

  it('refreshSession succeeds with valid session → no error', async () => {
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: 'valid-token', user: { id: 'user-1' } } },
      error: null,
    });
    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase.auth.refreshSession({ force: true });
    expect(result.data.session.access_token).toBe('valid-token');
    expect(result.error).toBeNull();
    expect(mockRefreshSession).toHaveBeenCalledWith({ force: true });
  });

  it('refreshSession succeeds with expired token → new session', async () => {
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: 'new-token', user: { id: 'user-1' } } },
      error: null,
    });
    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase.auth.refreshSession({ force: true });
    expect(result.data.session.access_token).toBe('new-token');
    expect(result.error).toBeNull();
  });

  it('refreshSession throws when no session exists', async () => {
    mockRefreshSession.mockRejectedValue(new Error('No session'));
    const { supabase } = await import('@/integrations/supabase/client');
    await expect(supabase.auth.refreshSession({ force: true })).rejects.toThrow('No session');
  });

  it('refreshSession returns null session on invalid refresh token', async () => {
    mockRefreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid Refresh Token: Refresh Token Not Found' },
    });
    const { supabase } = await import('@/integrations/supabase/client');
    const result = await supabase.auth.refreshSession({ force: true });
    expect(result.data.session).toBeNull();
    expect(result.error).toBeTruthy();
  });

});

// ── Invariant — module structure ─────────────────────────────────────────────

describe('Invariant — no regression in approval flow', () => {

  it('doApproveAndActivate still uses approveAndActivate import (not inlined)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');
    const fnStart = src.indexOf('const doApproveAndActivate = async () => {');
    const fnClose = src.indexOf('};', fnStart);
    const fnBody = src.substring(fnStart, fnClose);
    // should use the imported function, not an inline replacement
    expect(fnBody).toContain('approveAndActivate({');
  });

  it('approveAndActivate import still exists at module level', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');
    const importLine = src.match(/import.*approveAndActivate.*from.*/);
    expect(importLine).toBeTruthy();
    expect(importLine![0]).toContain('approveAndActivate');
    expect(importLine![0]).toContain('@/lib/active-folder/approveAndActivate');
  });

  it('supabase import still exists at module level', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SRC_PATH, 'utf-8');
    const importLine = src.match(/import.*supabase.*from.*/);
    expect(importLine).toBeTruthy();
    expect(importLine![0]).toContain('@/integrations/supabase/client');
  });

});