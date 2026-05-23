/**
 * Tests for: Fix — Scene Index extraction synchronous cache population
 *
 * Commit 4ad5d7f — 2 files changed:
 *   1. src/hooks/useSceneIndex.ts — mutation onSuccess now accepts data parameter,
 *      synchronously populates query cache via setQueryData with scene data from
 *      edge function response, and uses dynamic count in toast message
 *   2. src/components/visual/SourceTruthDashboard.tsx — removes empty catch block
 *      that was silently swallowing scene_index extraction errors
 *
 * Root cause: onSuccess ignored the response data and only called
 * invalidateQueries (async refetch), creating a stale state window where UI
 * showed 'Not run' despite toast confirming success.
 *
 * Test approach: static analysis of source files to verify the fix patterns
 */

import { describe, it, expect } from 'vitest';

const HOOK_PATH = '/Users/laralane/code/iffy/src/hooks/useSceneIndex.ts';
const DASHBOARD_PATH = '/Users/laralane/code/iffy/src/components/visual/SourceTruthDashboard.tsx';

// ════════════════════════════════════════════════════════════════════════════════
// FIX: Scene Index extraction — synchronous cache population on mutation success
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix — Scene Index synchronous cache population', () => {

  // ── PRIMARY USE CASE ─────────────────────────────────────────────────────────

  it('onSuccess handler accepts data parameter for synchronous cache population', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // The onSuccess callback must accept the response data parameter
    // (old version was 'onSuccess: () => {' — no data parameter)
    expect(src).toContain('onSuccess: (data)');
  });

  it('synchronously populates SCENE_INDEX_KEY cache with setQueryData when scenes array is present', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Must check data?.scenes is an array before setQueryData
    expect(src).toContain('data?.scenes && Array.isArray(data.scenes)');
    // Must call setQueryData to populate cache synchronously
    expect(src).toContain('queryClient.setQueryData([SCENE_INDEX_KEY, projectId], data.scenes)');
  });

  it('uses dynamic scene count from edge function response in toast message', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Toast must show dynamic count from response (old: hardcoded message)
    expect(src).toContain('data?.count ?? 0');
    expect(src).toContain('Scene index built:');
  });

  // ── INVARIANT: READINESS INVALIDATION ────────────────────────────────────────

  it('invalidates SCENE_INDEX_READY_KEY after extraction for detailed character/wardrobe counts', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Readiness query must still be invalidated after extraction
    expect(src).toContain('invalidateQueries({ queryKey: [SCENE_INDEX_READY_KEY, projectId] })');
  });

  // ── REGRESSION: OLD HARDCODED TOAST REMOVED ─────────────────────────────────

  it('does NOT use old hardcoded toast message (Scene index built successfully)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // The old hardcoded toast message must be removed
    expect(src).not.toContain("'Scene index built successfully'");
  });

  // ── ERROR PROPAGATION ────────────────────────────────────────────────────────

  it('onError callback shows toast with actual error message from the failed mutation', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Must show the actual error message in the error toast
    expect(src).toContain('Scene index build failed:');
    expect(src).toContain('err.message');
  });

  // ── DASHBOARD: SCENE_INDEX ERROR SWALLOWING FIX ──────────────────────────────

  it('SourceTruthDashboard scene_index case no longer silently swallows errors', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    const lines = src.split('\n');

    // Find the scene_index case line (line 496)
    const sceneIdxLineIdx = lines.findIndex(l => l.includes("case 'scene_index':"));
    expect(sceneIdxLineIdx).toBeGreaterThanOrEqual(0);

    // Read lines 496-498: case, extract call, break
    const caseLine = lines[sceneIdxLineIdx];
    const callLine = lines[sceneIdxLineIdx + 1];
    const breakLine = lines[sceneIdxLineIdx + 2];

    // Must call extractSceneIndex with await and no try/catch wrapping
    expect(caseLine).toContain("case 'scene_index':");
    expect(callLine).toContain('await sceneIdx.extractSceneIndex()');
    expect(breakLine).toContain('break;');

    // Verify no empty catch block on the call line or next line
    expect(callLine).not.toMatch(/catch\s*\{/);
    expect(lines[sceneIdxLineIdx - 1] || '').not.toMatch(/try\s*\{/);
  });

  // ── REGRESSION: ALL DOMAIN EXTRACTIONS STILL WORK ────────────────────────────

  it('character, wardrobe, scene_evidence domain extractions still call wardrobe.extract()', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // character, wardrobe, scene_evidence must still cascade to wardrobe.extract()
    const lines = src.split('\n');
    const switchStart = lines.findIndex(l => l.includes('switch (domainKey)'));
    expect(switchStart).toBeGreaterThanOrEqual(0);

    const handleExtractBlock: string[] = [];
    for (let i = switchStart; i < Math.min(switchStart + 25, lines.length); i++) {
      const line = lines[i];
      if (line.includes('handleExtractDomain') && i > switchStart + 20) break;
      handleExtractBlock.push(line);
    }
    const blockCode = handleExtractBlock.join('\n');

    // All domain cases must be present
    expect(blockCode).toContain("case 'character':");
    expect(blockCode).toContain("case 'wardrobe':");
    expect(blockCode).toContain("case 'scene_evidence':");
    expect(blockCode).toContain("case 'locations':");
    expect(blockCode).toContain("case 'temporal':");
    expect(blockCode).toContain("case 'visual_canon':");

    // wardrobe.extract() must be called for character/wardrobe/scene_evidence
    expect(blockCode).toContain('wardrobe.extract()');
    // handleExtractLocations() must still be called for locations
    expect(blockCode).toContain('handleExtractLocations()');
    // temporal.extract() must still be called
    expect(blockCode).toContain('temporal.extract()');
    // visualCanon.extract() must still be called
    expect(blockCode).toContain('visualCanon.extract()');
  });

  it('scene_index extraction loading state is shown in the UI via sceneIdx.isExtracting', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // The isExtracting state must be wired up for scene_index domain
    expect(src).toContain("domain.key === 'scene_index' ? sceneIdx.isExtracting");
  });

  it('other domain extraction loading states still render correctly', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // All other domain loading states must still be present
    expect(src).toContain("wardrobe.extracting");
    expect(src).toContain("visualCanon.extracting");
    expect(src).toContain("locationExtracting");
    expect(src).toContain("temporal.extracting");
  });

  // ── DATA CONTRACT: EDGE FUNCTION RESPONSE ────────────────────────────────────

  it('edge function response is parsed and returned from mutationFn', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // The mutationFn must parse the JSON response and return it for onSuccess
    expect(src).toContain('return resp.json()');
  });
});
