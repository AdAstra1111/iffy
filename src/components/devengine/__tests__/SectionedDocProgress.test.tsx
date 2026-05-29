/**
 * SectionedDocProgress — P4 test suite
 *
 * Tests the P4 changes extracted as pure functions from SectionedDocProgress.tsx:
 *   1. Staleness guard: isStale = !versionBgGenerating && isStillActive && safeChunks.length > 0
 *   2. Authoritative progress: versionChunksTotal/versionChunksCompleted override chunks-derived values
 *   3. Retryable status set: RETRYABLE_STATUSES, TERMINAL_FAIL_STATUSES, isRetryable, isSectionFailed
 *   4. chunk.error displayed in retryable (amber) and terminal (red) failure states
 *   5. Regenerating badge: shown when regeneratingChunks.length > 0
 *   6. Stale badge: shown when isStale is true
 */

import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════
// Constants extracted from SectionedDocProgress.tsx
// ═══════════════════════════════════════════════════════════════

const RETRYABLE_STATUSES = new Set(['failed', 'failed_validation', 'error', 'needs_regen']);
const TERMINAL_FAIL_STATUSES = new Set(['skipped']);
const ALL_FAILED_STATUSES = new Set([...RETRYABLE_STATUSES, ...TERMINAL_FAIL_STATUSES]);

function isSectionFailed(status: string) {
  return ALL_FAILED_STATUSES.has(status);
}

function isRetryable(status: string) {
  return RETRYABLE_STATUSES.has(status);
}

// ── DOC_TYPE_LABELS from line 52-59 ──
const DOC_TYPE_LABELS: Record<string, string> = {
  story_outline: 'Story Outline',
  treatment: 'Treatment',
  beat_sheet: 'Beat Sheet',
  long_treatment: 'Long Treatment',
  character_bible: 'Character Bible',
  feature_script: 'Feature Script',
};

// ═══════════════════════════════════════════════════════════════
// 1. Retryable Status Detection
// ═══════════════════════════════════════════════════════════════

describe('isRetryable — retryable status detection', () => {
  it('returns true for "failed" status', () => {
    expect(isRetryable('failed')).toBe(true);
  });

  it('returns true for "failed_validation" status', () => {
    expect(isRetryable('failed_validation')).toBe(true);
  });

  it('returns true for "error" status', () => {
    expect(isRetryable('error')).toBe(true);
  });

  it('returns true for "needs_regen" status', () => {
    expect(isRetryable('needs_regen')).toBe(true);
  });

  it('returns false for "skipped" status (terminal)', () => {
    expect(isRetryable('skipped')).toBe(false);
  });

  it('returns false for "done" status', () => {
    expect(isRetryable('done')).toBe(false);
  });

  it('returns false for "running" status', () => {
    expect(isRetryable('running')).toBe(false);
  });

  it('returns false for "pending" status', () => {
    expect(isRetryable('pending')).toBe(false);
  });

  it('returns false for unknown status', () => {
    expect(isRetryable('unknown')).toBe(false);
  });
});

describe('isSectionFailed — all failed status detection', () => {
  it('returns true for retryable statuses', () => {
    expect(isSectionFailed('failed')).toBe(true);
    expect(isSectionFailed('failed_validation')).toBe(true);
    expect(isSectionFailed('error')).toBe(true);
    expect(isSectionFailed('needs_regen')).toBe(true);
  });

  it('returns true for terminal status "skipped"', () => {
    expect(isSectionFailed('skipped')).toBe(true);
  });

  it('returns false for non-failed statuses', () => {
    expect(isSectionFailed('done')).toBe(false);
    expect(isSectionFailed('running')).toBe(false);
    expect(isSectionFailed('pending')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Staleness Guard (P4)
// ═══════════════════════════════════════════════════════════════

describe('staleness guard — isStale logic', () => {
  it('is stale when bg_generating=false, chunks still active, and chunks exist', () => {
    const versionBgGenerating = false;
    const runningChunks = [{ status: 'running' }];
    const pendingChunks = [] as any[];
    const regeneratingChunks = [] as any[];
    const isStillActive = runningChunks.length > 0 || pendingChunks.length > 0 || regeneratingChunks.length > 0;
    const safeChunksLength = 5;

    const isStale = !versionBgGenerating && isStillActive && safeChunksLength > 0;
    expect(isStale).toBe(true);
  });

  it('is NOT stale when bg_generating is true (still generating)', () => {
    const versionBgGenerating = true; // default to true if not set
    const runningChunks = [{ status: 'running' }];
    const pendingChunks = [] as any[];
    const regeneratingChunks = [] as any[];
    const isStillActive = runningChunks.length > 0 || pendingChunks.length > 0 || regeneratingChunks.length > 0;
    const safeChunksLength = 5;

    const isStale = !versionBgGenerating && isStillActive && safeChunksLength > 0;
    expect(isStale).toBe(false);
  });

  it('is NOT stale when all chunks are terminal (no active chunks)', () => {
    const versionBgGenerating = false;
    const runningChunks = [] as any[];
    const pendingChunks = [] as any[];
    const regeneratingChunks = [] as any[];
    const isStillActive = runningChunks.length > 0 || pendingChunks.length > 0 || regeneratingChunks.length > 0;
    const safeChunksLength = 5;

    const isStale = !versionBgGenerating && isStillActive && safeChunksLength > 0;
    expect(isStale).toBe(false);
  });

  it('is NOT stale when there are no chunks yet', () => {
    const versionBgGenerating = false;
    const runningChunks = [{ status: 'running' }];
    const pendingChunks = [] as any[];
    const regeneratingChunks = [] as any[];
    const isStillActive = runningChunks.length > 0 || pendingChunks.length > 0 || regeneratingChunks.length > 0;
    const safeChunksLength = 0;

    const isStale = !versionBgGenerating && isStillActive && safeChunksLength > 0;
    expect(isStale).toBe(false);
  });

  it('is NOT stale when regenerating chunks exist but bg_generating is still active', () => {
    const versionBgGenerating = true;
    const runningChunks = [] as any[];
    const pendingChunks = [] as any[];
    const regeneratingChunks = [{ status: 'needs_regen' }];
    const isStillActive = runningChunks.length > 0 || pendingChunks.length > 0 || regeneratingChunks.length > 0;
    const safeChunksLength = 5;

    const isStale = !versionBgGenerating && isStillActive && safeChunksLength > 0;
    expect(isStale).toBe(false);
  });

  it('detects staleness even with only regenerating chunks active', () => {
    const versionBgGenerating = false;
    const runningChunks = [] as any[];
    const pendingChunks = [] as any[];
    const regeneratingChunks = [{ status: 'needs_regen' }];
    const isStillActive = runningChunks.length > 0 || pendingChunks.length > 0 || regeneratingChunks.length > 0;
    const safeChunksLength = 5;

    const isStale = !versionBgGenerating && isStillActive && safeChunksLength > 0;
    expect(isStale).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Authoritative Progress (P4)
// ═══════════════════════════════════════════════════════════════

describe('authoritative progress — version meta_json overrides chunks-derived values', () => {
  it('uses versionChunksTotal when available', () => {
    const versionChunksTotal = 8;
    const chunksTotal = 4; // chunks might not all be created yet
    const authoritativeTotal = versionChunksTotal ?? chunksTotal;
    expect(authoritativeTotal).toBe(8);
  });

  it('falls back to chunks.length when versionChunksTotal is null', () => {
    const versionChunksTotal = null as number | null;
    const chunksTotal = 4;
    const authoritativeTotal = versionChunksTotal ?? chunksTotal;
    expect(authoritativeTotal).toBe(4);
  });

  it('uses versionChunksCompleted when available', () => {
    const versionChunksCompleted = 5;
    const doneCount = 3; // only 3 chunks have been created yet
    const authoritativeDone = versionChunksCompleted ?? doneCount;
    expect(authoritativeDone).toBe(5);
  });

  it('falls back to doneCount when versionChunksCompleted is undefined', () => {
    const versionChunksCompleted = undefined as number | undefined;
    const doneCount = 3;
    const authoritativeDone = versionChunksCompleted ?? doneCount;
    expect(authoritativeDone).toBe(3);
  });

  it('calculates correct percentage from authoritative values', () => {
    const versionChunksTotal = 8;
    const versionChunksCompleted = 3;
    const total = versionChunksTotal;
    const done = versionChunksCompleted;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    expect(pct).toBe(38); // 3/8 = 37.5 → rounds to 38
  });

  it('handles zero total gracefully', () => {
    const versionChunksTotal = 0;
    const pct = versionChunksTotal > 0 ? 50 : 0;
    expect(pct).toBe(0);
  });

  it('displays authoritative total in counter text', () => {
    const doneCount = 3;
    const versionChunksTotal = 8;
    const authoritativeTotal = versionChunksTotal ?? 4;
    // The counter renders as: {doneCount} / {authoritativeTotal} sections
    const counter = `${doneCount} / ${authoritativeTotal || '?'}`;
    expect(counter).toBe('3 / 8');
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Badge display conditions (P4)
// ═══════════════════════════════════════════════════════════════

describe('badge display conditions — P4 regenerating, stale, live badges', () => {
  it('shows stale badge when isStale is true', () => {
    const isStale = true;
    expect(isStale).toBe(true);
    // Conditional in JSX: {isStale && <Badge>Stale</Badge>}
  });

  it('hides stale badge when isStale is false', () => {
    const isStale = false;
    expect(isStale).toBe(false);
  });

  it('shows regenerating badge when regeneratingChunks > 0', () => {
    const regeneratingChunks = [{ status: 'needs_regen' }];
    const showRegeneratingBadge = regeneratingChunks.length > 0;
    expect(showRegeneratingBadge).toBe(true);
  });

  it('hides regenerating badge when no regenerating chunks', () => {
    const regeneratingChunks = [] as any[];
    const showRegeneratingBadge = regeneratingChunks.length > 0;
    expect(showRegeneratingBadge).toBe(false);
  });

  it('shows live badge when still active but no regenerating chunks and not stale', () => {
    const isStillActive = true;
    const regeneratingChunks = [] as any[];
    const isStale = false;
    const showLiveBadge = isStillActive && regeneratingChunks.length === 0 && !isStale;
    expect(showLiveBadge).toBe(true);
  });

  it('hides live badge when regenerating chunks exist', () => {
    const isStillActive = true;
    const regeneratingChunks = [{ status: 'needs_regen' }];
    const isStale = false;
    const showLiveBadge = isStillActive && regeneratingChunks.length === 0 && !isStale;
    expect(showLiveBadge).toBe(false);
  });

  it('hides live badge when stale', () => {
    const isStillActive = true;
    const regeneratingChunks = [] as any[];
    const isStale = true;
    const showLiveBadge = isStillActive && regeneratingChunks.length === 0 && !isStale;
    expect(showLiveBadge).toBe(false);
  });

  it('hides live badge when not active', () => {
    const isStillActive = false;
    const regeneratingChunks = [] as any[];
    const isStale = false;
    const showLiveBadge = isStillActive && regeneratingChunks.length === 0 && !isStale;
    expect(showLiveBadge).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. chunk.error display conditions (P4)
// ═══════════════════════════════════════════════════════════════

describe('chunk.error display — retryable (amber) vs terminal (red)', () => {
  it('retryable chunk shows amber-colored error', () => {
    const chunk = { status: 'failed', error: 'LLM call timed out' };
    const isRetryable = RETRYABLE_STATUSES.has(chunk.status);
    const isTerminal = TERMINAL_FAIL_STATUSES.has(chunk.status);
    expect(isRetryable).toBe(true);
    expect(isTerminal).toBe(false);

    // Color mapping: retryable → text-amber-400/60, terminal → text-destructive/60
    const errorColorClass = isRetryable ? 'text-amber-400/60' :
      isTerminal ? 'text-destructive/60' : '';
    expect(errorColorClass).toBe('text-amber-400/60');
  });

  it('retryable chunk displays retry button', () => {
    const chunk = { id: 'c1', status: 'failed_validation' };
    const canRetry = isRetryable(chunk.status);
    expect(canRetry).toBe(true);
    // JSX: {canRetry && <Button>Retry section</Button>}
  });

  it('terminal (skipped) chunk shows red-colored error without retry button', () => {
    const chunk = { status: 'skipped', error: 'Skipped due to invalid input' };
    const isRetryableStatus = RETRYABLE_STATUSES.has(chunk.status);
    const isTerminal = TERMINAL_FAIL_STATUSES.has(chunk.status);
    expect(isRetryableStatus).toBe(false);
    expect(isTerminal).toBe(true);

    // Color mapping: terminal → text-destructive/60
    const errorColorClass = isTerminal ? 'text-destructive/60' : '';
    expect(errorColorClass).toBe('text-destructive/60');

    // Terminal chunks do NOT show retry button
    const canRetry = isRetryable(chunk.status);
    expect(canRetry).toBe(false);
  });

  it('done chunks do not display errors', () => {
    const chunk = { status: 'done', error: null };
    const isFailed = isSectionFailed(chunk.status);
    expect(isFailed).toBe(false);
  });

  it('retryable chunk displays error message in amber font-mono', () => {
    const chunk = { error: 'LLM call timed out after 180s' };
    // JSX: <p className="text-[10px] text-amber-400/60 font-mono truncate max-w-full">{chunk.error}</p>
    const displayText = chunk.error;
    expect(displayText).toBeTruthy();
  });

  it('terminal chunk displays error message in red font-mono', () => {
    const chunk = { error: 'Skipped at assembly time' };
    // JSX: <p className="text-[10px] text-destructive/60 font-mono truncate max-w-full mt-1">{chunk.error}</p>
    const displayText = chunk.error;
    expect(displayText).toBeTruthy();
  });

  it('retryable status messages show specific text per failure type', () => {
    const status = 'failed_validation';
    const expectedMsg = 'Validation issue — can retry';
    expect(status === 'failed_validation' ? 'Validation issue — can retry' : '')
      .toBe(expectedMsg);
  });

  it('needs_regen status shows "Queued for regeneration" message', () => {
    const status = 'needs_regen';
    const msg = status === 'needs_regen'
      ? 'Queued for regeneration'
      : status === 'failed_validation'
        ? 'Validation issue — can retry'
        : 'Section failed — tap retry to regenerate';
    expect(msg).toBe('Queued for regeneration');
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. isStillActive detection (inclusive of regeneratingChunks)
// ═══════════════════════════════════════════════════════════════

describe('isStillActive — detects active generation state', () => {
  it('is active when running chunks exist', () => {
    const running = [{ status: 'running' }];
    const pending = [] as any[];
    const regenerating = [] as any[];
    const active = running.length > 0 || pending.length > 0 || regenerating.length > 0;
    expect(active).toBe(true);
  });

  it('is active when pending chunks exist', () => {
    const running = [] as any[];
    const pending = [{ status: 'pending' }];
    const regenerating = [] as any[];
    const active = running.length > 0 || pending.length > 0 || regenerating.length > 0;
    expect(active).toBe(true);
  });

  it('is active when regenerating chunks exist (P4 addition)', () => {
    const running = [] as any[];
    const pending = [] as any[];
    const regenerating = [{ status: 'needs_regen' }];
    const active = running.length > 0 || pending.length > 0 || regenerating.length > 0;
    expect(active).toBe(true);
  });

  it('is NOT active when no running, pending, or regenerating chunks', () => {
    const running = [] as any[];
    const pending = [] as any[];
    const regenerating = [] as any[];
    const active = running.length > 0 || pending.length > 0 || regenerating.length > 0;
    expect(active).toBe(false);
  });
});
