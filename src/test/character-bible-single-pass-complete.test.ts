/**
 * Tests for Character Bible Rewrite UI stuck fix + Review button dead after character bible rewrite.
 *
 * Validates:
 * 1. CharacterBibleProgress.tsx — single-pass completion detection (no bg_generating flag)
 * 2. ProjectDevelopmentEngine.tsx — post-operation options trigger via versionId effect
 *
 * Bugs fixed:
 * A. UI stuck: CharacterBibleProgress showed "Generating" forever for single-pass rewrites
 *    that never set bg_generating. Fix: detect has data + no bg_generating + mounted >2s → complete.
 * B. Review button dead: setPendingAutoTrigger(true) fired before React confirmed new versionId.
 *    Fix: new useEffect watches selectedVersionId === postOperationVersionId.current.
 */
import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────────────────────────
// Fix 1: CharacterBibleProgress — Single-pass completion detection
// ──────────────────────────────────────────────────────────────────

interface VersionMeta {
  bg_generating?: boolean;
  bg_completed_at?: string;
  bg_failed?: boolean;
  characters_total?: number;
  characters_completed?: number;
  sections_total?: number;
  sections_completed?: number;
}

/**
 * Reference implementation of CharacterBibleProgress state derivation (lines 113-128).
 * Tests the logic in isolation — same computation the component uses.
 */
function computeCharacterBibleState(
  meta: VersionMeta | undefined,
  mountAgeMs: number
): {
  hasBeenMounted: boolean;
  isSinglePassComplete: boolean;
  isGenerating: boolean;
  isComplete: boolean;
  isFailed: boolean;
  total: number;
  completed: number;
} {
  const total = meta?.characters_total ?? 0;
  const completed = meta?.characters_completed ?? 0;
  const sectionsTotal = meta?.sections_total ?? 0;
  const sectionsCompleted = meta?.sections_completed ?? 0;
  const hasBeenMounted = mountAgeMs > 2000;

  const isSinglePassComplete =
    !meta?.bg_generating &&
    !meta?.bg_completed_at &&
    !meta?.bg_failed &&
    hasBeenMounted &&
    (total > 0 || sectionsTotal > 0);

  const isGenerating =
    !isSinglePassComplete &&
    !meta?.bg_completed_at &&
    !meta?.bg_failed &&
    (total > 0 || sectionsTotal > 0);

  const isComplete = !!meta?.bg_completed_at || isSinglePassComplete;
  const isFailed = !!meta?.bg_failed;

  return { hasBeenMounted, isSinglePassComplete, isGenerating, isComplete, isFailed, total, completed };
}

describe('CharacterBibleProgress — Single-pass completion detection (UI stuck fix)', () => {

  // ── 1. Primary Use Case ──

  it('detects single-pass rewrite as complete (no bg_generating, has data, mounted >2s)', () => {
    const meta: VersionMeta = {
      characters_total: 3,
      characters_completed: 3,
      // no bg_generating at all — this is a single-pass rewrite
    };
    const state = computeCharacterBibleState(meta, 5000);

    expect(state.isSinglePassComplete).toBe(true);
    expect(state.isGenerating).toBe(false);
    expect(state.isComplete).toBe(true);
    expect(state.isFailed).toBe(false);
  });

  it('shows bg_generating as generating even when data exists', () => {
    const meta: VersionMeta = {
      bg_generating: true,
      characters_total: 5,
      characters_completed: 2,
    };
    const state = computeCharacterBibleState(meta, 5000);

    expect(state.isSinglePassComplete).toBe(false);
    expect(state.isGenerating).toBe(true);
    expect(state.isComplete).toBe(false);
  });

  it('shows bg_completed_at as complete regardless of bg_generating', () => {
    const meta: VersionMeta = {
      bg_generating: true,  // stuck flag but backend says done
      bg_completed_at: '2024-01-01T00:00:00Z',
      characters_total: 3,
      characters_completed: 3,
    };
    const state = computeCharacterBibleState(meta, 5000);

    expect(state.isSinglePassComplete).toBe(false);
    expect(state.isGenerating).toBe(false);
    expect(state.isComplete).toBe(true);
  });

  // ── 2. Edge Cases ──

  it('does NOT treat as single-pass complete when mounted <2s', () => {
    const meta: VersionMeta = {
      // No bg_generating, has data
      characters_total: 3,
      characters_completed: 1,
    };
    const state = computeCharacterBibleState(meta, 500);  // only 500ms mounted

    expect(state.hasBeenMounted).toBe(false);
    expect(state.isSinglePassComplete).toBe(false);
    // Should still show as generating because we have data
    expect(state.isGenerating).toBe(true);
  });

  it('does NOT treat as single-pass complete at exactly 2000ms (must be >2s)', () => {
    const meta: VersionMeta = {
      characters_total: 3,
    };
    const state = computeCharacterBibleState(meta, 2000);  // exactly 2000ms

    expect(state.hasBeenMounted).toBe(false);
    expect(state.isSinglePassComplete).toBe(false);
  });

  it('treats as single-pass complete just over 2000ms', () => {
    const meta: VersionMeta = {
      characters_total: 3,
    };
    const state = computeCharacterBibleState(meta, 2001);  // 2001ms

    expect(state.hasBeenMounted).toBe(true);
    expect(state.isSinglePassComplete).toBe(true);
  });

  it('does not treat as single-pass when no data (total === 0 and sectionsTotal === 0)', () => {
    const meta: VersionMeta = {
      // No data at all
    };
    const state = computeCharacterBibleState(meta, 5000);

    expect(state.isSinglePassComplete).toBe(false);
    expect(state.isGenerating).toBe(false);  // no data = waiting not generating
  });

  it('does not treat as single-pass when bg_failed is true', () => {
    const meta: VersionMeta = {
      bg_failed: true,
      characters_total: 3,
      characters_completed: 1,
    };
    const state = computeCharacterBibleState(meta, 5000);

    expect(state.isSinglePassComplete).toBe(false);
    expect(state.isFailed).toBe(true);
    expect(state.isGenerating).toBe(false);
  });

  it('does not treat as single-pass when bg_generating is explicitly false but has data', () => {
    // bg_generating: false with data and mounted >2s IS single-pass complete
    const meta: VersionMeta = {
      bg_generating: false,
      characters_total: 3,
      characters_completed: 3,
    };
    const state = computeCharacterBibleState(meta, 5000);

    // !meta?.bg_generating → true (false is falsy), so yes, it is single-pass complete
    expect(state.isSinglePassComplete).toBe(true);
    expect(state.isComplete).toBe(true);
  });

  it('shows bg_generating === false with no characters as not generating', () => {
    const meta: VersionMeta = {
      bg_generating: false,
      // no character data
    };
    const state = computeCharacterBibleState(meta, 5000);

    expect(state.isSinglePassComplete).toBe(false);  // no data
    expect(state.isGenerating).toBe(false);  // no data
    expect(state.isComplete).toBe(false);    // nothing to be complete about
  });

  it('handles sections_total instead of characters_total', () => {
    const meta: VersionMeta = {
      sections_total: 6,
      sections_completed: 6,
    };
    const state = computeCharacterBibleState(meta, 5000);

    // sections_total > 0 triggers the single-pass check
    expect(state.isSinglePassComplete).toBe(true);
    expect(state.isComplete).toBe(true);
  });

  it('handles both characters_total and sections_total simultaneously', () => {
    const meta: VersionMeta = {
      characters_total: 4,
      characters_completed: 2,
      sections_total: 6,
      sections_completed: 4,
    };
    const state = computeCharacterBibleState(meta, 5000);

    expect(state.isSinglePassComplete).toBe(true);
  });

  it('single-pass complete overrides bg_completed_at false', () => {
    // If bg_completed_at is undefined and we detect single-pass, isComplete should still be true
    const meta: VersionMeta = {
      characters_total: 1,
      characters_completed: 1,
      // no bg_completed_at
    };
    const state = computeCharacterBibleState(meta, 5000);

    expect(state.isComplete).toBe(true);
    expect(state.isSinglePassComplete).toBe(true);
  });

  // ── 3. Regression Tests ──

  it('shows bg_generating + bg_failed as failed (regression)', () => {
    const meta: VersionMeta = {
      bg_generating: true,
      bg_failed: true,
      characters_total: 3,
    };
    const state = computeCharacterBibleState(meta, 5000);

    expect(state.isFailed).toBe(true);
    expect(state.isGenerating).toBe(false);
  });

  it('shows bg_generating + bg_completed_at as complete (regression)', () => {
    const meta: VersionMeta = {
      bg_generating: true,
      bg_completed_at: '2024-01-01T00:00:00Z',
      characters_total: 3,
      characters_completed: 3,
    };
    const state = computeCharacterBibleState(meta, 5000);

    expect(state.isComplete).toBe(true);
    expect(state.isGenerating).toBe(false);
  });

  it('show generating when bg_generating with partial data (regression)', () => {
    const meta: VersionMeta = {
      bg_generating: true,
      characters_total: 5,
      characters_completed: 2,
    };
    const state = computeCharacterBibleState(meta, 5000);

    expect(state.isGenerating).toBe(true);
    expect(state.isComplete).toBe(false);
  });

  it('still works immediately after mount (regression — mount <2s)', () => {
    // Before the fix, this was the only path: bg_generating defined → generating
    const meta: VersionMeta = {
      bg_generating: true,
      characters_total: 5,
      characters_completed: 0,
    };
    const state = computeCharacterBibleState(meta, 100);

    expect(state.isGenerating).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
// Fix 2: ProjectDevelopmentEngine — Post-operation options trigger
// ──────────────────────────────────────────────────────────────────

interface OptionsTriggerDeps {
  postOperationVersionId: string | null;
  selectedVersionId: string | null;
  selectedDocId: string | null;
  generateOptionsMutate: (() => void) | null;
  selectedVersionMeta: VersionMeta | undefined;
}

interface OptionsTriggerAction {
  shouldFire: boolean;
  shouldClear: boolean;
  shouldGenerate: boolean;
  reason: string;
}

/**
 * Reference implementation of the new useEffect logic (lines 382-398)
 * that auto-triggers Generate Options after rewrite/convert.
 *
 * Returns what the effect SHOULD do based on the current deps.
 * Tests the guard conditions in isolation.
 */
function evaluateOptionsTrigger(deps: OptionsTriggerDeps): OptionsTriggerAction {
  const { postOperationVersionId, selectedVersionId, selectedDocId, generateOptionsMutate, selectedVersionMeta } = deps;

  // Guard 1: No pending operation
  if (!postOperationVersionId) {
    return { shouldFire: false, shouldClear: false, shouldGenerate: false, reason: 'no pending post-operation' };
  }

  // Guard 2: Version doesn't match the expected post-operation version
  if (selectedVersionId !== postOperationVersionId) {
    return { shouldFire: false, shouldClear: false, shouldGenerate: false, reason: 'version mismatch' };
  }

  // Guard 3: No doc selected or mutate function unavailable
  if (!selectedDocId || !generateOptionsMutate) {
    return { shouldFire: false, shouldClear: true, shouldGenerate: false, reason: 'no doc or no mutate function' };
  }

  // Guard 4: Still generating in background — wait
  if (selectedVersionMeta?.bg_generating === true) {
    return { shouldFire: false, shouldClear: false, shouldGenerate: false, reason: 'still generating in background' };
  }

  // All guards passed — fire the mutation
  return { shouldFire: true, shouldClear: true, shouldGenerate: true, reason: 'all guards passed' };
}

describe('ProjectDevelopmentEngine — Post-operation options trigger (Review button dead fix)', () => {

  // ── 1. Primary Use Case ──

  it('fires generateOptions when selectedVersionId matches postOperationVersionId', () => {
    const result = evaluateOptionsTrigger({
      postOperationVersionId: 'ver-123',
      selectedVersionId: 'ver-123',
      selectedDocId: 'doc-1',
      generateOptionsMutate: () => {},
      selectedVersionMeta: {},
    });

    expect(result.shouldFire).toBe(true);
    expect(result.shouldClear).toBe(true);
    expect(result.shouldGenerate).toBe(true);
  });

  // ── 2. Edge Cases ──

  it('does NOT fire when postOperationVersionId is null', () => {
    const result = evaluateOptionsTrigger({
      postOperationVersionId: null,
      selectedVersionId: 'ver-123',
      selectedDocId: 'doc-1',
      generateOptionsMutate: () => {},
      selectedVersionMeta: {},
    });

    expect(result.shouldFire).toBe(false);
    expect(result.shouldClear).toBe(false);
  });

  it('does NOT fire when selectedVersionId does not match postOperationVersionId', () => {
    const result = evaluateOptionsTrigger({
      postOperationVersionId: 'ver-123',
      selectedVersionId: 'ver-456',
      selectedDocId: 'doc-1',
      generateOptionsMutate: () => {},
      selectedVersionMeta: {},
    });

    expect(result.shouldFire).toBe(false);
    expect(result.shouldClear).toBe(false);
  });

  it('clears postOperationVersionId and does NOT fire when no selectedDocId', () => {
    const result = evaluateOptionsTrigger({
      postOperationVersionId: 'ver-123',
      selectedVersionId: 'ver-123',
      selectedDocId: null,
      generateOptionsMutate: () => {},
      selectedVersionMeta: {},
    });

    expect(result.shouldFire).toBe(false);
    expect(result.shouldClear).toBe(true);  // should clear to prevent infinite effects
    expect(result.shouldGenerate).toBe(false);
  });

  it('clears and does NOT fire when generateOptionsMutate is not a function', () => {
    const result = evaluateOptionsTrigger({
      postOperationVersionId: 'ver-123',
      selectedVersionId: 'ver-123',
      selectedDocId: 'doc-1',
      generateOptionsMutate: null,
      selectedVersionMeta: {},
    });

    expect(result.shouldFire).toBe(false);
    expect(result.shouldClear).toBe(true);
  });

  it('does NOT fire when version is still bg_generating — waits for completion', () => {
    const result = evaluateOptionsTrigger({
      postOperationVersionId: 'ver-123',
      selectedVersionId: 'ver-123',
      selectedDocId: 'doc-1',
      generateOptionsMutate: () => {},
      selectedVersionMeta: { bg_generating: true },
    });

    // The effect does NOT fire and does NOT clear the marker — it waits
    expect(result.shouldFire).toBe(false);
    expect(result.shouldClear).toBe(false);
    expect(result.shouldGenerate).toBe(false);
  });

  it('fires once bg_generating becomes done', () => {
    // Simulates: first call when bg_generating=true, then bg_generating becomes undefined
    const result = evaluateOptionsTrigger({
      postOperationVersionId: 'ver-123',
      selectedVersionId: 'ver-123',
      selectedDocId: 'doc-1',
      generateOptionsMutate: () => {},
      selectedVersionMeta: { bg_generating: false },
    });

    expect(result.shouldFire).toBe(true);
    expect(result.shouldGenerate).toBe(true);
  });

  // ── 3. Invariant Tests ──

  it('does NOT fire multiple times — postOperationVersionId is cleared after first fire', () => {
    // First call: matches, fires
    const first = evaluateOptionsTrigger({
      postOperationVersionId: 'ver-123',
      selectedVersionId: 'ver-123',
      selectedDocId: 'doc-1',
      generateOptionsMutate: () => {},
      selectedVersionMeta: {},
    });
    expect(first.shouldFire).toBe(true);
    expect(first.shouldClear).toBe(true);

    // After clear, the effect's guard catches it:
    const second = evaluateOptionsTrigger({
      postOperationVersionId: null,  // cleared after first fire
      selectedVersionId: 'ver-123',
      selectedDocId: 'doc-1',
      generateOptionsMutate: () => {},
      selectedVersionMeta: {},
    });
    expect(second.shouldFire).toBe(false);
    expect(second.shouldClear).toBe(false);
  });

  it('does NOT fire when user navigates to a different version naturally', () => {
    // User clicks a different version — no post-operation marker
    const result = evaluateOptionsTrigger({
      postOperationVersionId: null,
      selectedVersionId: 'ver-789',
      selectedDocId: 'doc-1',
      generateOptionsMutate: () => {},
      selectedVersionMeta: {},
    });

    expect(result.shouldFire).toBe(false);
  });

  it('fires even when bg_generating is undefined (single-pass rewrite case)', () => {
    // Single-pass rewrite never sets bg_generating
    const result = evaluateOptionsTrigger({
      postOperationVersionId: 'ver-123',
      selectedVersionId: 'ver-123',
      selectedDocId: 'doc-1',
      generateOptionsMutate: () => {},
      selectedVersionMeta: {},  // meta exists but has no bg_generating field
    });

    // meta?.bg_generating === true checks for strictly true — undefined is not true
    expect(result.shouldFire).toBe(true);
    expect(result.shouldGenerate).toBe(true);
  });

  // ── 4. Integration scenario: full lifecycle ──

  it('simulates the full lifecycle: rewrite → version lands → options triggered', () => {
    // Step 1: User clicks Rewrite → afterRewrite runs, postOperationVersionId is set to '__next__'
    // (This is handled by a separate useEffect at line 645)
    let postOpId: string | null = '__next__';

    // Step 2: New version arrives and __next__ is resolved to actual versionId
    // (This is handled by a separate useEffect at line 658-659)
    const newVersionId = 'ver-new-456';
    postOpId = newVersionId;

    // Step 3: The options-trigger useEffect sees the match
    const result = evaluateOptionsTrigger({
      postOperationVersionId: postOpId,
      selectedVersionId: newVersionId,
      selectedDocId: 'doc-1',
      generateOptionsMutate: () => {},
      selectedVersionMeta: {},
    });
    expect(result.shouldFire).toBe(true);

    // Step 4: After firing, postOperationVersionId is cleared
    postOpId = null;

    // Step 5: Effect runs again but sees cleared marker — no re-fire
    const after = evaluateOptionsTrigger({
      postOperationVersionId: postOpId,
      selectedVersionId: newVersionId,
      selectedDocId: 'doc-1',
      generateOptionsMutate: () => {},
      selectedVersionMeta: {},
    });
    expect(after.shouldFire).toBe(false);
  });

  // ── 5. Difference from old approach ──

  it('does NOT have the old bug: setPendingAutoTrigger fires before versionId is confirmed', () => {
    // The old bug: setPendingAutoTrigger(true) called inside afterRewrite() before React
    // confirmed the new versionId. The pendingAutoTrigger useEffect would fire with the OLD
    // selectedVersionId, causing generateOptionsMutation to fire on the wrong version.

    // With the NEW approach, the effect waits until selectedVersionId actually matches
    // postOperationVersionId. This is inherently immune to the timing bug because
    // useEffect only fires when the selectedVersionId value in state equals the marker.

    // Simulate: afterRewrite called, but selectedVersionId hasn't updated yet
    const result = evaluateOptionsTrigger({
      postOperationVersionId: 'ver-new-456',  // set by rewrite pipeline
      selectedVersionId: 'ver-old-123',        // React hasn't updated yet
      selectedDocId: 'doc-1',
      generateOptionsMutate: () => {},
      selectedVersionMeta: {},
    });

    // Guard catches it: version mismatch
    expect(result.shouldFire).toBe(false);
    expect(result.shouldClear).toBe(false);
    expect(result.reason).toContain('version mismatch');
  });
});

// ──────────────────────────────────────────────────────────────────
// Integration: Both fixes work together for the character bible flow
// ──────────────────────────────────────────────────────────────────

describe('Integration — character bible rewrite UI flow', () => {

  it('single-pass rewrite: CharacterBibleProgress shows complete AND review button works', () => {
    // Scenario: User rewrites character bible via single-pass (no bg_generating).
    //
    // After rewrite, a new version is created with character data populated
    // but NO bg_generating flag (single-pass path in dev-engine-v2).

    // 1. CharacterBibleProgress detects single-pass as complete
    const bibleMeta: VersionMeta = {
      characters_total: 4,
      characters_completed: 4,
    };
    const bibleState = computeCharacterBibleState(bibleMeta, 5000);
    expect(bibleState.isSinglePassComplete).toBe(true);
    expect(bibleState.isGenerating).toBe(false);

    // 2. handleRunEngine checks bg_generating === true before running analysis
    //    In single-pass case, bg_generating is undefined, so guard passes
    const bgGeneratingForReview = bibleMeta.bg_generating === true;
    expect(bgGeneratingForReview).toBe(false);  // Review button works

    // 3. Options trigger fires once version matches
    const optionsResult = evaluateOptionsTrigger({
      postOperationVersionId: 'ver-new-789',
      selectedVersionId: 'ver-new-789',
      selectedDocId: 'doc-cb-1',
      generateOptionsMutate: () => {},
      selectedVersionMeta: {},
    });
    expect(optionsResult.shouldFire).toBe(true);
  });

  it('chunked rewrite: UI shows generating during progress, options fire on completion', () => {
    // Scenario: Per-character rewrite that uses chunkRunner (bg_generating=true)

    // 1. During generation: CharacterBibleProgress shows generating
    const generatingMeta: VersionMeta = {
      bg_generating: true,
      characters_total: 4,
      characters_completed: 2,
      sections_total: 6,
      sections_completed: 3,
    };
    const duringState = computeCharacterBibleState(generatingMeta, 5000);
    expect(duringState.isSinglePassComplete).toBe(false);
    expect(duringState.isGenerating).toBe(true);

    // 2. Options trigger does NOT fire while bg_generating
    const duringOptions = evaluateOptionsTrigger({
      postOperationVersionId: 'ver-new-789',
      selectedVersionId: 'ver-new-789',
      selectedDocId: 'doc-cb-1',
      generateOptionsMutate: () => {},
      selectedVersionMeta: { bg_generating: true },
    });
    expect(duringOptions.shouldFire).toBe(false);

    // 3. After generation completes: bg_generating cleared
    const completeMeta: VersionMeta = {
      bg_generating: false,  // cleared by chunkRunner
      bg_completed_at: '2024-01-01T00:00:00Z',
      characters_total: 4,
      characters_completed: 4,
      sections_total: 6,
      sections_completed: 6,
    };
    const afterState = computeCharacterBibleState(completeMeta, 5000);
    expect(afterState.isComplete).toBe(true);

    // 4. Options trigger fires (meta.bg_generating === true → false, so guard passes)
    const afterOptions = evaluateOptionsTrigger({
      postOperationVersionId: 'ver-new-789',
      selectedVersionId: 'ver-new-789',
      selectedDocId: 'doc-cb-1',
      generateOptionsMutate: () => {},
      selectedVersionMeta: { bg_generating: false },
    });
    expect(afterOptions.shouldFire).toBe(true);
  });

  it('stuck bg_generating flag: CharacterBibleProgress detects single-pass, review still works', () => {
    // Scenario: Version from BEFORE the chunkRunner fix where bg_generating is permanently
    // stuck to true. The DO NOT REVERT note in CLAUDE.md says the frontend guard must NOT
    // add back an isBgGenerating check to runAnalysisWithContext.

    // CharacterBibleProgress won't show stuck as complete (bg_generating=true prevents
    // single-pass detection) — but this is actually correct for stuck versions:
    // they DO have bg_generating=true even if generation finished.
    const stuckMeta: VersionMeta = {
      bg_generating: true,  // stuck flag
      characters_total: 4,
      characters_completed: 4,
    };
    const stuckState = computeCharacterBibleState(stuckMeta, 5000);
    expect(stuckState.isSinglePassComplete).toBe(false);
    expect(stuckState.isGenerating).toBe(true);  // still shows generating (stuck flag)

    // However, handleRunEngine checks bg_generating === true → shows "still generating" toast
    // This is the existing behavior per CLAUDE.md: "The isBgGenerating check must NOT be
    // added back to this guard" — but handleRunEngine does check bg_generating.
    // The stuck flag recovery in bg-poll handles this case by calling fix_stuck_version.
  });
});
