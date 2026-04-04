/**
 * productionDesignApprovalLock.test.ts — Tests for PD family approval→lock flow,
 * effective state derivation, and Lock All eligibility.
 */
import { describe, it, expect } from 'vitest';

// ── Inline the state derivation logic for deterministic testing ──

type FamilyBuildState = 'pending' | 'generating' | 'partial' | 'ready' | 'approved' | 'locked' | 'failed' | 'rejected';
type VisualSetStatus = 'draft' | 'autopopulated' | 'curating' | 'ready_to_lock' | 'locked' | 'stale' | 'archived';

interface FamilyProgress {
  state: FamilyBuildState;
}

function getFamilyEffectiveState(
  setStatus: VisualSetStatus | undefined,
  buildState?: FamilyProgress,
): FamilyBuildState {
  if (buildState?.state === 'generating' || buildState?.state === 'failed') return buildState.state;
  if (!setStatus) return 'pending';
  if (setStatus === 'locked') return 'locked';
  if (setStatus === 'archived') return 'rejected';
  if (setStatus === 'ready_to_lock') return 'approved';
  if (setStatus === 'curating' || setStatus === 'autopopulated') return 'ready';
  return 'pending';
}

function computeLockAllEligible(
  families: { status: VisualSetStatus | undefined }[],
): boolean {
  if (families.length === 0) return false;
  const total = families.length;
  let locked = 0;
  let readyToLock = 0;
  for (const f of families) {
    if (!f.status) return false; // no set = not eligible
    if (f.status === 'locked') locked++;
    else if (f.status === 'ready_to_lock') readyToLock++;
    else return false; // any other status blocks Lock All
  }
  if (locked === total) return false; // already all locked
  return (locked + readyToLock) === total;
}

// ── Tests ──

describe('family effective state derivation', () => {
  it('maps locked status to locked state', () => {
    expect(getFamilyEffectiveState('locked')).toBe('locked');
  });

  it('maps ready_to_lock status to approved state', () => {
    expect(getFamilyEffectiveState('ready_to_lock')).toBe('approved');
  });

  it('maps curating to ready', () => {
    expect(getFamilyEffectiveState('curating')).toBe('ready');
  });

  it('maps autopopulated to ready', () => {
    expect(getFamilyEffectiveState('autopopulated')).toBe('ready');
  });

  it('maps archived to rejected', () => {
    expect(getFamilyEffectiveState('archived')).toBe('rejected');
  });

  it('maps undefined (no set) to pending', () => {
    expect(getFamilyEffectiveState(undefined)).toBe('pending');
  });

  it('build state generating overrides set status', () => {
    expect(getFamilyEffectiveState('curating', { state: 'generating' })).toBe('generating');
  });

  it('build state failed overrides set status', () => {
    expect(getFamilyEffectiveState('curating', { state: 'failed' })).toBe('failed');
  });
});

describe('Lock All eligibility', () => {
  it('eligible when all families are ready_to_lock', () => {
    expect(computeLockAllEligible([
      { status: 'ready_to_lock' },
      { status: 'ready_to_lock' },
      { status: 'ready_to_lock' },
    ])).toBe(true);
  });

  it('eligible when mix of locked and ready_to_lock', () => {
    expect(computeLockAllEligible([
      { status: 'locked' },
      { status: 'ready_to_lock' },
    ])).toBe(true);
  });

  it('not eligible when all already locked', () => {
    expect(computeLockAllEligible([
      { status: 'locked' },
      { status: 'locked' },
    ])).toBe(false);
  });

  it('not eligible when any family is curating', () => {
    expect(computeLockAllEligible([
      { status: 'ready_to_lock' },
      { status: 'curating' },
    ])).toBe(false);
  });

  it('not eligible when any family is draft', () => {
    expect(computeLockAllEligible([
      { status: 'ready_to_lock' },
      { status: 'draft' },
    ])).toBe(false);
  });

  it('not eligible when any family has no set', () => {
    expect(computeLockAllEligible([
      { status: 'ready_to_lock' },
      { status: undefined },
    ])).toBe(false);
  });

  it('not eligible with empty families', () => {
    expect(computeLockAllEligible([])).toBe(false);
  });

  it('not eligible when family is archived/rejected', () => {
    expect(computeLockAllEligible([
      { status: 'ready_to_lock' },
      { status: 'archived' },
    ])).toBe(false);
  });

  it('not eligible when family is stale', () => {
    expect(computeLockAllEligible([
      { status: 'ready_to_lock' },
      { status: 'stale' },
    ])).toBe(false);
  });
});

describe('approval transitions to locked', () => {
  it('approved state is distinct from ready', () => {
    expect(getFamilyEffectiveState('ready_to_lock')).not.toBe('ready');
    expect(getFamilyEffectiveState('ready_to_lock')).toBe('approved');
  });

  it('locked families excluded from generation (state check)', () => {
    const state = getFamilyEffectiveState('locked');
    expect(state).toBe('locked');
    // Locked families should not be treated as generating/ready/pending
    expect(['generating', 'ready', 'pending', 'approved', 'failed']).not.toContain(state);
  });
});
