/**
 * characterGenerationCTA.test.ts — Tests for canonical character generation CTA resolver.
 * Now driven by CharacterLockGap instead of CharacterCoverage.
 */

import { describe, it, expect } from 'vitest';
import { resolveCharacterGenerationCTA, type CharacterCTAAction } from '../characterGenerationCTA';
import type { CharacterLockGap, CharacterLockDisplayStatus } from '../characterLockGap';

function makeLockGap(overrides: Partial<CharacterLockGap> = {}): CharacterLockGap {
  return {
    character_key: 'hana',
    character_name: 'Hana',
    lock_ready: false,
    display_status: 'needs_required',
    blocking_states: ['work'],
    blocking_slots: [{ type: 'missing_state', slot_key: '*', slot_label: 'Work', is_required: true }],
    totals: {
      total_states: 3,
      locked_states: 0,
      total_required_slots: 0,
      lock_ready_slots: 0,
      missing_slots: 1,
      unattempted_slots: 0,
      failed_slots: 0,
      rejected_slots: 0,
      identity_failed_slots: 0,
      continuity_failed_slots: 0,
      not_approved_slots: 0,
    },
    per_state: [],
    ...overrides,
  };
}

describe('resolveCharacterGenerationCTA', () => {
  // 1. Missing required slots → Generate Required
  it('returns generate_required when needs_required', () => {
    const cta = resolveCharacterGenerationCTA(makeLockGap(), false);
    expect(cta.action).toBe('generate_required');
    expect(cta.label).toBe('Generate Required');
    expect(cta.visible).toBe(true);
    expect(cta.enabled).toBe(true);
  });

  // 2. Required-ready but not lock-ready → Complete Character
  it('returns complete_character when needs_completion', () => {
    const gap = makeLockGap({
      display_status: 'needs_completion',
      blocking_slots: [{ type: 'not_approved', slot_key: 'full_body_primary', slot_label: 'Full Body', is_required: true }],
    });
    const cta = resolveCharacterGenerationCTA(gap, false);
    expect(cta.action).toBe('complete_character');
    expect(cta.label).toBe('Complete Character');
    expect(cta.visible).toBe(true);
    expect(cta.enabled).toBe(true);
  });

  // 3. Fully locked → hidden
  it('returns none when locked', () => {
    const gap = makeLockGap({
      lock_ready: true,
      display_status: 'locked',
      blocking_states: [],
      blocking_slots: [],
    });
    const cta = resolveCharacterGenerationCTA(gap, false);
    expect(cta.action).toBe('none');
    expect(cta.visible).toBe(false);
  });

  // 4. Blocked → hidden
  it('returns none when blocked', () => {
    const gap = makeLockGap({ display_status: 'blocked' });
    const cta = resolveCharacterGenerationCTA(gap, false);
    expect(cta.action).toBe('none');
    expect(cta.visible).toBe(false);
  });

  // 5. Lock ready → hidden (nothing to generate)
  it('returns none when lock_ready', () => {
    const gap = makeLockGap({
      lock_ready: true,
      display_status: 'lock_ready',
      blocking_states: [],
      blocking_slots: [],
    });
    const cta = resolveCharacterGenerationCTA(gap, false);
    expect(cta.action).toBe('none');
    expect(cta.visible).toBe(false);
  });

  // 6. CTA disabled during active build
  it('disables CTA when build is active', () => {
    const cta = resolveCharacterGenerationCTA(makeLockGap(), true);
    expect(cta.action).toBe('generate_required');
    expect(cta.enabled).toBe(false);
  });

  // 7. Complete Character disabled during active build
  it('disables complete_character during active build', () => {
    const gap = makeLockGap({ display_status: 'needs_completion', blocking_slots: [] });
    const cta = resolveCharacterGenerationCTA(gap, true);
    expect(cta.action).toBe('complete_character');
    expect(cta.enabled).toBe(false);
  });

  // 8. Generating → hidden
  it('returns none when generating', () => {
    const gap = makeLockGap({ display_status: 'generating' });
    const cta = resolveCharacterGenerationCTA(gap, false);
    expect(cta.action).toBe('none');
    expect(cta.visible).toBe(false);
  });
});
