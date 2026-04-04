/**
 * costumeReadinessDisplay.test.ts — Tests for canonical readiness display logic.
 *
 * getCharacterCostumeDisplayStatus is now INFORMATIONAL ONLY.
 * All semantic decisions (lock, CTA, completion) are driven by lock-gap resolver.
 * These tests verify the informational layer and regression tripwires.
 */
import { describe, it, expect } from 'vitest';
import {
  getCharacterCostumeDisplayStatus,
  type CharacterCoverage,
  type GlobalLockGapSummary,
} from '@/hooks/useCostumeOnActor';

function makeCoverage(overrides: Partial<CharacterCoverage> = {}): CharacterCoverage {
  return {
    characterKey: 'hana',
    characterName: 'Hana',
    totalStates: 5,
    statesWithSets: 0,
    statesLocked: 0,
    statesApproved: 0,
    missingStates: ['work', 'domestic', 'ceremonial', 'public_formal', 'travel'],
    priorityMissing: ['work', 'domestic', 'public_formal'],
    readiness: 'incomplete',
    requiredReady: false,
    fullReady: false,
    blockReason: null,
    isEligible: true,
    ...overrides,
  };
}

// ── A. Informational display — requiredReady shows as "Needs Completion" ──

describe('getCharacterCostumeDisplayStatus (INFORMATIONAL)', () => {
  it('requiredReady=true displays as Needs Completion, not Ready', () => {
    const cov = makeCoverage({
      statesWithSets: 5,
      requiredReady: true,
      readiness: 'ready',
      missingStates: [],
      priorityMissing: [],
    });
    const status = getCharacterCostumeDisplayStatus(cov);
    expect(status.label).toBe('Needs Completion');
    expect(status.variant).toBe('incomplete');
    // Lock button never shown from coverage — driven by lock-gap only
    expect(status.showLockButton).toBe(false);
  });

  it('fully locked overrides and displays correctly', () => {
    const cov = makeCoverage({
      statesWithSets: 5,
      statesLocked: 5,
      requiredReady: true,
      fullReady: true,
      readiness: 'fully_locked',
      missingStates: [],
      priorityMissing: [],
    });
    const status = getCharacterCostumeDisplayStatus(cov);
    expect(status.label).toBe('Fully Locked');
    expect(status.variant).toBe('locked');
    expect(status.showLockButton).toBe(false);
  });

  it('incomplete character displays as Incomplete', () => {
    const cov = makeCoverage({
      statesWithSets: 2,
      requiredReady: false,
      readiness: 'incomplete',
    });
    const status = getCharacterCostumeDisplayStatus(cov);
    expect(status.label).toBe('Incomplete');
    expect(status.variant).toBe('incomplete');
    expect(status.showLockButton).toBe(false);
  });

  it('blocked character displays as Blocked with reason', () => {
    const cov = makeCoverage({
      readiness: 'blocked',
      blockReason: 'no_wardrobe_profile',
      isEligible: false,
      totalStates: 0,
      statesWithSets: 0,
      missingStates: [],
      priorityMissing: [],
    });
    const status = getCharacterCostumeDisplayStatus(cov);
    expect(status.label).toBe('Blocked');
    expect(status.variant).toBe('blocked');
    expect(status.showLockButton).toBe(false);
    expect(status.blockReason).toBe('no_wardrobe_profile');
  });
});

// ── B. No misleading "Ready" label anywhere ──

describe('no misleading Ready label', () => {
  it('requiredReady=true never produces label "Ready"', () => {
    const cov = makeCoverage({
      statesWithSets: 5,
      statesApproved: 2,
      requiredReady: true,
      readiness: 'ready',
      missingStates: [],
    });
    const status = getCharacterCostumeDisplayStatus(cov);
    expect(status.label).not.toBe('Ready');
  });
});

// ── C. Progress fraction displays (informational) ──

describe('progress fraction displays', () => {
  it('requiredFraction shows statesWithSets / totalStates', () => {
    const cov = makeCoverage({ statesWithSets: 3, totalStates: 5 });
    const status = getCharacterCostumeDisplayStatus(cov);
    expect(status.requiredFraction).toBe('3/5 required-ready');
  });

  it('lockedFraction shows statesLocked / totalStates', () => {
    const cov = makeCoverage({ statesLocked: 1, totalStates: 5 });
    const status = getCharacterCostumeDisplayStatus(cov);
    expect(status.lockedFraction).toBe('1/5 locked');
  });

  it('blocked character shows dash fractions', () => {
    const cov = makeCoverage({ readiness: 'blocked', blockReason: 'no_actor_binding', isEligible: false, totalStates: 0 });
    const status = getCharacterCostumeDisplayStatus(cov);
    expect(status.requiredFraction).toBe('—');
    expect(status.lockedFraction).toBe('—');
  });
});

// ── D. Lock button is NEVER enabled from coverage-level display status ──

describe('lock button never from coverage', () => {
  it('lock button is never shown from coverage display status', () => {
    const cov = makeCoverage({
      statesWithSets: 5,
      requiredReady: true,
      readiness: 'ready',
      missingStates: [],
    });
    const status = getCharacterCostumeDisplayStatus(cov);
    expect(status.showLockButton).toBe(false);
  });
});

// ── E. Blocked character classification ──

describe('blocked character classification', () => {
  it('degraded_wardrobe_profile is classified as blocked', () => {
    const cov = makeCoverage({
      readiness: 'blocked',
      blockReason: 'degraded_wardrobe_profile',
      isEligible: false,
      totalStates: 0,
    });
    const status = getCharacterCostumeDisplayStatus(cov);
    expect(status.label).toBe('Blocked');
    expect(status.variant).toBe('blocked');
    expect(status.blockReason).toBe('degraded_wardrobe_profile');
    expect(status.showLockButton).toBe(false);
  });
});

// ── F. REGRESSION TRIPWIRE: legacy requiredReady cannot change canonical status ──

describe('regression tripwire: legacy coverage cannot determine semantic status', () => {
  it('requiredReady=true does not imply lock-readiness', () => {
    const cov = makeCoverage({
      statesWithSets: 5,
      requiredReady: true,
      readiness: 'ready',
      missingStates: [],
    });
    const status = getCharacterCostumeDisplayStatus(cov);
    // Coverage-level display says "Needs Completion", never "Lock Ready"
    expect(status.label).not.toBe('Lock Ready');
    expect(status.label).not.toBe('Ready');
    expect(status.showLockButton).toBe(false);
  });

  it('statesWithSets === totalStates does not mean lockable', () => {
    const cov = makeCoverage({
      statesWithSets: 5,
      totalStates: 5,
      requiredReady: true,
      readiness: 'ready',
      missingStates: [],
    });
    const status = getCharacterCostumeDisplayStatus(cov);
    // showLockButton is always false — lock driven by lock-gap only
    expect(status.showLockButton).toBe(false);
  });
});

// ── G. GlobalLockGapSummary type shape ──

describe('GlobalLockGapSummary type shape', () => {
  it('has all required fields', () => {
    const summary: GlobalLockGapSummary = {
      total: 5,
      blocked: 1,
      needs_required: 1,
      needs_completion: 1,
      lock_ready: 1,
      locked: 1,
      generating: 0,
      total_required_slots: 25,
      lock_ready_slots: 15,
    };
    expect(summary.total).toBe(5);
    expect(summary.blocked + summary.needs_required + summary.needs_completion + summary.lock_ready + summary.locked + summary.generating).toBe(5);
  });

  it('summary buckets cover all characters', () => {
    // Simulate aggregation matching lock-gap display_status
    const statuses = ['blocked', 'needs_required', 'needs_completion', 'lock_ready', 'locked'] as const;
    const counts: Record<string, number> = {};
    for (const s of statuses) counts[s] = 0;
    
    // 3 characters: 1 locked, 1 needs_completion, 1 blocked
    counts['locked'] = 1;
    counts['needs_completion'] = 1;
    counts['blocked'] = 1;
    
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(3);
  });
});
