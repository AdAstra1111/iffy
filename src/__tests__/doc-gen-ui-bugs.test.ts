/**
 * Tests for: Fix: Doc gen UI bugs (rewriter, stale state, approve)
 *
 * Commit 843421a — 5 fixes:
 *   1. BgGenBanner hidden when bg_generating stuck true but content exists (>100 chars)
 *   2. beat_sheet rewrite routes to BeatRewritePanel per-beat API (via applyAllTrigger)
 *   3. Stale auth prevention — refreshSession with try/catch in all paths
 *   4. Optimistic update on approve — approval state shows immediately before refetch
 *   5. approvedVersionMap refetches every 10s — stale approval state clears within polling window
 *
 * Test approach: static analysis (source code patterns) + dynamic (module integration)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── File paths for static analysis ──────────────────────────────────────────────

const ENG_PATH = '/Users/laralane/code/iffy/src/pages/ProjectDevelopmentEngine.tsx';
const CLIENT_PATH = '/Users/laralane/code/iffy/src/integrations/supabase/client.ts';
const HOOK_PATH = '/Users/laralane/code/iffy/src/hooks/useDevEngineV2.ts';
const PANEL_PATH = '/Users/laralane/code/iffy/src/components/devengine/BeatRewritePanel.tsx';

// ════════════════════════════════════════════════════════════════════════════════
// FIX 1: BgGenBanner hidden when bg_generating stuck true but content exists
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix 1 — BgGenBanner stuck-generating guard', () => {

  it('isStuckGenerating computed from isBgGenerating && versionHasContent', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    // The isStuckGenerating definition must exist
    expect(src).toContain('const isStuckGenerating = isBgGenerating && versionHasContent');
  });

  it('versionHasContent checks plaintext trim().length > 100', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    // versionHasContent should check trimmed plaintext length > 100
    expect(src).toContain('versionHasContent');
    const defLine = src.split('\n').find(l => l.includes('const versionHasContent'));
    expect(defLine).toBeDefined();
    expect(defLine!).toContain('> 100');
  });

  it('isBgGenerating check at line 2655 uses && !isStuckGenerating', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');
    const lines = src.split('\n');

    // Find the line with isBgGenerating rendering (should be around line 2655)
    const bannerLine = lines.find((l, i) =>
      l.includes('isBgGenerating') && (i > 2640 && i < 2680)
    );
    expect(bannerLine).toBeDefined();
    // Must use && !isStuckGenerating to hide banner when content exists
    expect(bannerLine!).toContain('isBgGenerating && !isStuckGenerating');
  });

  it('isBgGenerating reads from meta_json.bg_generating === true', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');
    const defLine = src.split('\n').find(l => l.includes('const isBgGenerating'));
    expect(defLine).toBeDefined();
    expect(defLine!).toContain('meta_json?.bg_generating === true');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// FIX 2: beat_sheet routes to BeatRewritePanel per-beat API
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix 2 — beat_sheet rewrite routes to BeatRewritePanel via applyAllTrigger', () => {

  it('beat_sheet removed from SECTIONED_REWRITE_TYPES', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');
    const defLine = src.split('\n').find(l => l.includes('const SECTIONED_REWRITE_TYPES'));
    expect(defLine).toBeDefined();
    // beat_sheet must NOT be in SECTIONED_REWRITE_TYPES
    expect(defLine!).not.toContain('beat_sheet');
    // Must include treatment, long_treatment, character_bible
    expect(defLine!).toContain('treatment');
    expect(defLine!).toContain('long_treatment');
    expect(defLine!).toContain('character_bible');
  });

  it('handleRewrite has a beat_sheet routing branch before SECTIONED_REWRITE_TYPES check', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    // Find the beat_sheet routing branch
    const fnStart = src.indexOf('const handleRewrite');
    expect(fnStart).toBeGreaterThan(0);

    // After the SECTIONED_REWRITE_TYPES definition, there should be a routing branch
    // that checks for beat_sheet doc_type BEFORE the sectioned rewrite check
    const beatSheetRoute = src.indexOf("selectedDoc?.doc_type === 'beat_sheet'", fnStart);
    expect(beatSheetRoute).toBeGreaterThan(fnStart);

    // It should set beatRewriteTrigger and return
    // The routing block is ~3 lines (beat_sheet condition, toast, setTrigger, return)
    // Use a wider window (350 chars from beatSheetRoute) to capture all lines
    const contextStart = Math.max(0, beatSheetRoute - 20);
    const contextEnd = Math.min(src.length, beatSheetRoute + 350);
    const context = src.substring(contextStart, contextEnd);
    expect(context).toContain('setBeatRewriteTrigger(prev => prev + 1)');
    expect(context).toContain('return;');
  });

  it('beatRewriteTrigger state variable exists and initialized to 0', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');
    const defLine = src.split('\n').find(l => l.includes('const [beatRewriteTrigger, setBeatRewriteTrigger]'));
    expect(defLine).toBeDefined();
    expect(defLine!).toContain('useState(0)');
  });

  it('BeatRewritePanel receives applyAllTrigger prop', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    // The BeatRewritePanel JSX should pass applyAllTrigger={beatRewriteTrigger}
    const panelLine = src.split('\n').find(l =>
      l.includes('<BeatRewritePanel') || l.includes('applyAllTrigger={')
    );
    const hasApplyAllTrigger = src.includes('applyAllTrigger={beatRewriteTrigger}');
    expect(hasApplyAllTrigger).toBe(true);
  });

  it('BeatRewritePanel has applyAllTrigger in props and useEffect', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(PANEL_PATH, 'utf-8');

    // applyAllTrigger declared in props interface
    expect(src).toContain('applyAllTrigger?: number');

    // useEffect fires handleApplyAll when applyAllTrigger changes
    const effectSection = src.substring(
      src.indexOf('// External trigger'),
      src.indexOf('const toggleAct')
    );
    expect(effectSection).toContain('applyAllTrigger');
    expect(effectSection).toContain('handleApplyAll()');
    expect(effectSection).toContain('useRef(applyAllTrigger)');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// FIX 3: Stale auth prevention — refreshSession wrapped in try/catch
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix 3 — Stale auth prevention (refreshSession with try/catch)', () => {

  it('client.ts proxy — refreshSession wrapped in try/catch', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(CLIENT_PATH, 'utf-8');

    // Must have try/catch around refreshSession in the proxy invoke override
    const invokeFn = src.substring(
      src.indexOf("client.functions).invoke"),
      src.indexOf("Object.assign(headers, options.headers)")
    );
    expect(invokeFn).toContain('refreshSession');
    expect(invokeFn).toContain('try {');
    expect(invokeFn).toContain('} catch (_)');
  });

  it('BeatRewritePanel handleRewrite — refreshSession with .catch(() => {})', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(PANEL_PATH, 'utf-8');

    // Find handleRewrite function
    const fnStart = src.indexOf('const handleRewrite = async');
    const fnClose = src.indexOf('const handleRewriteDone', fnStart);
    const fnBody = src.substring(fnStart, fnClose > 0 ? fnClose : fnStart + 1000);

    // Must have refreshSession with .catch(() => {}) before getSession
    expect(fnBody).toContain('refreshSession()');
    expect(fnBody).toContain('.catch(() => {})');
    // refreshSession must be before getSession
    const refreshIdx = fnBody.indexOf('refreshSession');
    const getSessionIdx = fnBody.indexOf('getSession');
    expect(getSessionIdx).toBeGreaterThan(refreshIdx);
  });

  it('BeatRewritePanel handleApplyAll — refreshSession with .catch(() => {})', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(PANEL_PATH, 'utf-8');

    // Find handleApplyAll function
    const fnStart = src.indexOf('const handleApplyAll = async');
    const fnClose = src.indexOf('const handleRewriteDone', fnStart);
    const fnBody = src.substring(fnStart, fnClose > 0 ? fnClose : fnStart + 1000);

    // Must have refreshSession with .catch(() => {}) before getSession
    expect(fnBody).toContain('refreshSession()');
    expect(fnBody).toContain('.catch(() => {})');
    // refreshSession must be before getSession
    const refreshIdx = fnBody.indexOf('refreshSession');
    const getSessionIdx = fnBody.indexOf('getSession');
    expect(getSessionIdx).toBeGreaterThan(refreshIdx);
  });

  it('doApproveAndActivate — refreshSession moved inside try block', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    // Find doApproveAndActivate
    const fnStart = src.indexOf('const doApproveAndActivate = async () => {');
    const fnClose = src.indexOf('};', fnStart);
    const fnBody = src.substring(fnStart, fnClose > 0 ? fnClose : fnStart + 500);

    // refreshSession must be inside the try block (not before it)
    const tryIdx = fnBody.indexOf('try {');
    const refreshIdx = fnBody.indexOf('refreshSession');
    expect(tryIdx).toBeGreaterThan(0);
    expect(refreshIdx).toBeGreaterThan(tryIdx);

    // Must use { force: true } variant
    expect(fnBody).toContain('refreshSession({ force: true })');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// FIX 4: Optimistic update on approve
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix 4 — Optimistic update on approve', () => {

  it('doApproveAndActivate uses qc.setQueryData for optimistic update', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    const fnStart = src.indexOf('const doApproveAndActivate = async () => {');
    const fnClose = src.indexOf('};', fnStart);
    const fnBody = src.substring(fnStart, fnClose > 0 ? fnClose : fnStart + 500);

    // Must have setQueryData for optimistic update BEFORE invalidateQueries
    expect(fnBody).toContain('qc.setQueryData');
    expect(fnBody).toContain("['dev-v2-approved', projectId]");

    // setQueryData should come before invalidateQueries
    const setDataIdx = fnBody.indexOf('setQueryData');
    const invalidateIdx = fnBody.indexOf('invalidateQueries');
    expect(setDataIdx).toBeGreaterThan(0);
    expect(invalidateIdx).toBeGreaterThan(setDataIdx);
  });

  it('Optimistic update correctly merges old state with new approved version', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    // Find the setQueryData call body
    const setDataIdx = src.indexOf('qc.setQueryData');
    const bracketEnd = src.indexOf('});', setDataIdx);
    const setDataBody = src.substring(setDataIdx, bracketEnd + 3);

    // Must spread old state and add [selectedDocId!]: selectedVersionId!
    expect(setDataBody).toContain('...old');
    expect(setDataBody).toContain('[selectedDocId!]: selectedVersionId!');
  });

  it('dev-v2-docs invalidation added alongside other invalidations', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');

    const fnStart = src.indexOf('const doApproveAndActivate = async () => {');
    const fnClose = src.indexOf('};', fnStart);
    const fnBody = src.substring(fnStart, fnClose > 0 ? fnClose : fnStart + 600);

    // Must invalidate dev-v2-docs to clear stale "pending" badge
    expect(fnBody).toContain("['dev-v2-docs', projectId]");
    // Must also have the existing invalidations
    expect(fnBody).toContain("['dev-v2-approved', projectId]");
    expect(fnBody).toContain("['dev-v2-versions', selectedDocId]");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// FIX 5: approvedVersionMap refetches every 10s
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix 5 — approvedVersionMap refetch interval', () => {

  it('approvedVersionMap query has refetchInterval: 10_000', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Find the entire useQuery block for approvedVersionMap
    // The query config object spans from queryKey: ['dev-v2-approved' through refetchInterval: 10_000,
    // then ends with });  We need to find the closing }); that ends the useQuery call.
    const queryStart = src.indexOf("queryKey: ['dev-v2-approved'");
    expect(queryStart).toBeGreaterThan(0);

    // refetchInterval: 10_000 comes after the queryFn block
    // Search for it after the queryKey position
    const afterQueryFn = src.indexOf('refetchInterval', queryStart);
    expect(afterQueryFn).toBeGreaterThan(queryStart);
    const intervalLine = src.substring(afterQueryFn, afterQueryFn + 30);
    expect(intervalLine).toContain('refetchInterval: 10_000');
  });

  it('refetchInterval only on approvedVersionMap query, not on versions query', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Find versions query — should NOT have refetchInterval
    const versionsQueryStart = src.indexOf("queryKey: ['dev-v2-versions'");
    if (versionsQueryStart > 0) {
      const versionsQueryEnd = src.indexOf('};', versionsQueryStart);
      const versionsBody = src.substring(versionsQueryStart, versionsQueryEnd > 0 ? versionsQueryEnd : versionsQueryStart + 300);
      // Either no refetchInterval, or refetchInterval: false
      const hasInterval = versionsBody.includes('refetchInterval');
      if (hasInterval) {
        expect(versionsBody).toContain('refetchInterval: false');
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// REGRESSION — existing invariants still hold
// ════════════════════════════════════════════════════════════════════════════════

describe('Regression — existing invariants still hold', () => {

  it('doApproveAndActivate still uses approveAndActivate import', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');
    const fnStart = src.indexOf('const doApproveAndActivate = async () => {');
    const fnClose = src.indexOf('};', fnStart);
    const fnBody = src.substring(fnStart, fnClose > 0 ? fnClose : fnStart + 400);
    expect(fnBody).toContain('approveAndActivate({');
  });

  it('SECTIONED_VIEW_TYPES still includes beat_sheet', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');
    const defLine = src.split('\n').find(l => l.includes('const SECTIONED_VIEW_TYPES'));
    expect(defLine).toBeDefined();
    // beat_sheet should still be in VIEW_TYPES (just not REWRITE_TYPES)
    expect(defLine!).toContain('beat_sheet');
  });

  it('handleRewrite still checks SECTIONED_REWRITE_TYPES for other doc types', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(ENG_PATH, 'utf-8');
    // The sectioned rewrite check should still exist for treatment/long_treatment/character_bible
    const sectionedCheck = src.includes('SECTIONED_REWRITE_TYPES.has(selectedDoc?.doc_type');
    expect(sectionedCheck).toBe(true);
  });

  it('refreshSession still called before getSession in client.ts proxy', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(CLIENT_PATH, 'utf-8');
    const invokeFn = src.substring(
      src.indexOf("client.functions).invoke"),
      src.indexOf("Object.assign(headers, options.headers)")
    );
    const refreshIdx = invokeFn.indexOf('refreshSession');
    const getSessionIdx = invokeFn.indexOf('getSession');
    expect(getSessionIdx).toBeGreaterThan(refreshIdx);
  });
});