/**
 * characterLockGap.test.ts — Tests for canonical lock-gap resolver.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveCharacterLockGap,
  formatLockGapSummary,
  formatLockFailureMessage,
  getDisplayStatusConfig,
  type LockGapInput,
} from '../characterLockGap';
import type { CharacterCoverage } from '@/hooks/useCostumeOnActor';

function makeCoverage(overrides: Partial<CharacterCoverage> = {}): CharacterCoverage {
  return {
    characterKey: 'hana',
    characterName: 'Hana',
    totalStates: 2,
    statesWithSets: 2,
    statesLocked: 0,
    statesApproved: 0,
    missingStates: [],
    priorityMissing: [],
    readiness: 'ready',
    requiredReady: true,
    fullReady: false,
    blockReason: null,
    isEligible: true,
    ...overrides,
  };
}

const STATES = [
  { state_key: 'work', label: 'Work / Labor', explicit_or_inferred: 'explicit' as const },
  { state_key: 'domestic', label: 'Domestic / Private', explicit_or_inferred: 'explicit' as const },
];

function makeSlot(overrides: Record<string, any> = {}) {
  return {
    id: 'slot-1',
    visual_set_id: 'set-1',
    slot_key: 'full_body_primary',
    slot_label: 'Full Body Primary',
    slot_type: 'image',
    is_required: true,
    state: 'empty',
    selected_image_id: null,
    best_candidate_id: null,
    best_score: null,
    attempt_count: 0,
    convergence_state: null,
    evaluation_status: null,
    replacement_count: 0,
    created_at: '',
    updated_at: '',
    ...overrides,
  } as any;
}

describe('resolveCharacterLockGap', () => {
  it('returns blocked for blocked characters', () => {
    const gap = resolveCharacterLockGap({
      coverage: makeCoverage({ readiness: 'blocked', isEligible: false, blockReason: 'no_actor_binding' }),
      states: [],
      slotsPerState: {},
      setsPerState: {},
      isGenerating: false,
    });
    expect(gap.display_status).toBe('blocked');
    expect(gap.lock_ready).toBe(false);
  });

  it('returns locked for fully locked characters', () => {
    const gap = resolveCharacterLockGap({
      coverage: makeCoverage({ readiness: 'fully_locked', fullReady: true, statesLocked: 2 }),
      states: STATES,
      slotsPerState: {},
      setsPerState: {},
      isGenerating: false,
    });
    expect(gap.display_status).toBe('locked');
    expect(gap.lock_ready).toBe(true);
  });

  it('returns needs_required when states are missing', () => {
    const gap = resolveCharacterLockGap({
      coverage: makeCoverage({ readiness: 'incomplete', requiredReady: false, statesWithSets: 1, missingStates: ['domestic'] }),
      states: STATES,
      slotsPerState: { work: [makeSlot({ state: 'approved' })] },
      setsPerState: { work: { id: 'set-1', status: 'active' }, domestic: null },
      isGenerating: false,
    });
    expect(gap.display_status).toBe('needs_required');
    expect(gap.lock_ready).toBe(false);
    expect(gap.blocking_states).toContain('domestic');
  });

  it('returns needs_completion when required-ready but slots not approved', () => {
    const gap = resolveCharacterLockGap({
      coverage: makeCoverage(),
      states: STATES,
      slotsPerState: {
        work: [makeSlot({ state: 'candidate_present', best_candidate_id: 'c1', selected_image_id: 'img1' })],
        domestic: [makeSlot({ id: 'slot-2', state: 'approved' })],
      },
      setsPerState: {
        work: { id: 'set-1', status: 'active' },
        domestic: { id: 'set-2', status: 'active' },
      },
      isGenerating: false,
    });
    expect(gap.display_status).toBe('needs_completion');
    expect(gap.lock_ready).toBe(false);
    expect(gap.totals.not_approved_slots).toBe(1);
  });

  it('returns lock_ready when all required slots approved', () => {
    const gap = resolveCharacterLockGap({
      coverage: makeCoverage(),
      states: STATES,
      slotsPerState: {
        work: [makeSlot({ state: 'approved' })],
        domestic: [makeSlot({ id: 'slot-2', state: 'approved' })],
      },
      setsPerState: {
        work: { id: 'set-1', status: 'active' },
        domestic: { id: 'set-2', status: 'active' },
      },
      isGenerating: false,
    });
    expect(gap.display_status).toBe('lock_ready');
    expect(gap.lock_ready).toBe(true);
    expect(gap.blocking_slots).toHaveLength(0);
  });

  it('detects identity gate failures', () => {
    const gap = resolveCharacterLockGap({
      coverage: makeCoverage(),
      states: [STATES[0]],
      slotsPerState: {
        work: [makeSlot({
          state: 'empty',
          attempt_count: 3,
          convergence_state: { gate_admitted: false, actor_identity_gate_status: 'fail' },
        })],
      },
      setsPerState: { work: { id: 'set-1', status: 'active' } },
      isGenerating: false,
    });
    expect(gap.totals.identity_failed_slots).toBe(1);
    expect(gap.blocking_slots[0].type).toBe('identity_fail');
  });

  it('detects unattempted slots', () => {
    const gap = resolveCharacterLockGap({
      coverage: makeCoverage(),
      states: [STATES[0]],
      slotsPerState: {
        work: [makeSlot({ state: 'empty', attempt_count: 0 })],
      },
      setsPerState: { work: { id: 'set-1', status: 'active' } },
      isGenerating: false,
    });
    expect(gap.totals.unattempted_slots).toBe(1);
    expect(gap.blocking_slots[0].type).toBe('unattempted');
  });

  it('shows generating status during active generation', () => {
    const gap = resolveCharacterLockGap({
      coverage: makeCoverage(),
      states: STATES,
      slotsPerState: {},
      setsPerState: { work: { id: 'set-1', status: 'active' }, domestic: null },
      isGenerating: true,
    });
    expect(gap.display_status).toBe('generating');
  });

  it('skips locked states correctly', () => {
    const gap = resolveCharacterLockGap({
      coverage: makeCoverage(),
      states: STATES,
      slotsPerState: {
        work: [makeSlot({ state: 'approved' })],
      },
      setsPerState: {
        work: { id: 'set-1', status: 'active' },
        domestic: { id: 'set-2', status: 'locked' },
      },
      isGenerating: false,
    });
    expect(gap.totals.locked_states).toBe(1);
    const domesticState = gap.per_state.find(s => s.state_key === 'domestic');
    expect(domesticState?.is_locked).toBe(true);
    expect(domesticState?.issues).toHaveLength(0);
  });
});

describe('formatLockGapSummary', () => {
  it('returns concise issue summary', () => {
    const gap = resolveCharacterLockGap({
      coverage: makeCoverage(),
      states: [STATES[0]],
      slotsPerState: {
        work: [
          makeSlot({ state: 'empty', attempt_count: 0 }),
          makeSlot({ id: 'slot-2', slot_key: 'three_quarter_view', slot_label: 'Three Quarter', state: 'empty', attempt_count: 2, convergence_state: { gate_admitted: false, actor_identity_gate_status: 'fail' } }),
        ],
      },
      setsPerState: { work: { id: 'set-1', status: 'active' } },
      isGenerating: false,
    });
    const summary = formatLockGapSummary(gap);
    expect(summary.length).toBeGreaterThan(0);
    expect(summary.some(s => s.includes('unattempted'))).toBe(true);
    expect(summary.some(s => s.includes('identity failed'))).toBe(true);
  });
});

describe('formatLockFailureMessage', () => {
  it('returns empty for lock-ready', () => {
    const gap = resolveCharacterLockGap({
      coverage: makeCoverage(),
      states: STATES,
      slotsPerState: {
        work: [makeSlot({ state: 'approved' })],
        domestic: [makeSlot({ id: 'slot-2', state: 'approved' })],
      },
      setsPerState: { work: { id: 'set-1', status: 'active' }, domestic: { id: 'set-2', status: 'active' } },
      isGenerating: false,
    });
    expect(formatLockFailureMessage(gap)).toBe('');
  });

  it('returns structured failure message with slot details', () => {
    const gap = resolveCharacterLockGap({
      coverage: makeCoverage(),
      states: [STATES[0]],
      slotsPerState: {
        work: [makeSlot({ state: 'empty', attempt_count: 0 })],
      },
      setsPerState: { work: { id: 'set-1', status: 'active' } },
      isGenerating: false,
    });
    const msg = formatLockFailureMessage(gap);
    expect(msg).toContain('Cannot lock');
    expect(msg).toContain('Full Body Primary');
    expect(msg).toContain('Work / Labor');
  });
});

describe('getDisplayStatusConfig', () => {
  it('returns config for all statuses', () => {
    for (const s of ['blocked', 'needs_required', 'needs_completion', 'lock_ready', 'locked', 'generating'] as const) {
      const config = getDisplayStatusConfig(s);
      expect(config.label).toBeTruthy();
      expect(config.variant).toBeTruthy();
    }
  });
});
