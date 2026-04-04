/**
 * sceneDemoValidation.test.ts — Deterministic tests for Scene Demo Validation System.
 */
import { describe, it, expect } from 'vitest';
import {
  validateSceneDemoSlot,
  validateSceneDemoRun,
  isSlotApprovable,
  checkRunLockEligibility,
  detectRunStaleness,
  summarizeSlotValidation,
  SCENE_DEMO_VALIDATION_VERSION,
  HARD_FAIL_CODES,
  ADVISORY_CODES,
  type SlotValidationInput,
  type SceneDemoSlotValidation,
  type SlotApprovalStatus,
} from '../sceneDemoValidation';
import type { SceneDemoPlan } from '../sceneDemoPlanner';

// ── Fixtures ──

function makePlan(overrides?: Partial<SceneDemoPlan>): SceneDemoPlan {
  return {
    scene_demo_id: 'sdp_test_1',
    scene_id: 'scene-1',
    scene_key: 'sc_1',
    slugline: 'INT. WORKSHOP - DAY',
    scene_purpose: 'labor_process',
    purpose_basis: 'inferred',
    characters: [
      {
        character_key: 'elena',
        actor_id: 'actor-1',
        actor_version_id: 'ver-1',
        wardrobe_state_key: 'work',
        wardrobe_state_label: 'Work',
        state_basis: 'inferred',
        costume_look_set_id: 'costume-set-1',
        costume_look_locked: true,
        blocking_reasons: [],
      },
    ],
    location_set_id: 'loc-set-1',
    location_set_locked: true,
    atmosphere_set_id: 'atmo-set-1',
    atmosphere_set_locked: true,
    motif_set_ids: [],
    planning_rationale: 'test',
    readiness_status: 'ready',
    blocking_reasons: [],
    version: '1.0.0',
    ...overrides,
  };
}

function makeSlotInput(overrides?: Partial<SlotValidationInput>): SlotValidationInput {
  return {
    slot_key: 'establishing_wide',
    prompt_used: 'Wide establishing shot. [NO CHARACTER DROPOUT]',
    generation_config: {
      character_keys: ['elena'],
      actor_ids: ['actor-1'],
      costume_look_set_ids: ['costume-set-1'],
      location_set_id: 'loc-set-1',
      atmosphere_set_id: 'atmo-set-1',
      scene_purpose: 'labor_process',
      world_mode: 'grounded',
    },
    plan: makePlan(),
    world_mode: 'grounded',
    ...overrides,
  };
}

// ── Slot Validation Tests ──

describe('validateSceneDemoSlot', () => {
  it('passes when all config matches plan', () => {
    const result = validateSceneDemoSlot(makeSlotInput());
    expect(result.passed).toBe(true);
    expect(result.hard_fail_codes).toHaveLength(0);
    expect(result.overall_score).toBe(100);
    expect(result.validation_version).toBe(SCENE_DEMO_VALIDATION_VERSION);
    expect(result.scoring_model).toBe('scene_demo_v1');
  });

  it('hard fails on actor identity lost', () => {
    const input = makeSlotInput({
      generation_config: {
        ...makeSlotInput().generation_config,
        actor_ids: ['wrong-actor'],
      },
    });
    const result = validateSceneDemoSlot(input);
    expect(result.passed).toBe(false);
    expect(result.hard_fail_codes).toContain('ACTOR_IDENTITY_LOST');
    expect(result.scores.actor_continuity).toBe(0);
  });

  it('hard fails on wrong costume state', () => {
    const input = makeSlotInput({
      generation_config: {
        ...makeSlotInput().generation_config,
        costume_look_set_ids: ['wrong-costume'],
      },
    });
    const result = validateSceneDemoSlot(input);
    expect(result.passed).toBe(false);
    expect(result.hard_fail_codes).toContain('COSTUME_WRONG_STATE');
  });

  it('hard fails on character dropout', () => {
    const plan = makePlan({
      characters: [
        ...makePlan().characters,
        {
          character_key: 'marco',
          actor_id: 'actor-2',
          actor_version_id: 'ver-2',
          wardrobe_state_key: 'work',
          wardrobe_state_label: 'Work',
          state_basis: 'inferred',
          costume_look_set_id: 'costume-set-2',
          costume_look_locked: true,
          blocking_reasons: [],
        },
      ],
    });
    const input = makeSlotInput({
      plan,
      generation_config: {
        ...makeSlotInput().generation_config,
        character_keys: ['elena'], // Missing marco
        actor_ids: ['actor-1'], // Missing actor-2
      },
    });
    const result = validateSceneDemoSlot(input);
    expect(result.hard_fail_codes).toContain('CHARACTER_DROPOUT');
    expect(result.hard_fail_codes).toContain('ACTOR_IDENTITY_LOST');
  });

  it('hard fails on wrong location', () => {
    const input = makeSlotInput({
      generation_config: {
        ...makeSlotInput().generation_config,
        location_set_id: 'wrong-loc',
      },
    });
    const result = validateSceneDemoSlot(input);
    expect(result.hard_fail_codes).toContain('WRONG_LOCATION');
  });

  it('advisory on atmosphere drift', () => {
    const input = makeSlotInput({
      generation_config: {
        ...makeSlotInput().generation_config,
        atmosphere_set_id: 'wrong-atmo',
      },
    });
    const result = validateSceneDemoSlot(input);
    expect(result.passed).toBe(true); // advisory only
    expect(result.advisory_codes).toContain('ATMOSPHERE_DRIFT');
  });

  it('hard fails on world mode violation', () => {
    const input = makeSlotInput({
      world_mode: 'grounded',
      generation_config: {
        ...makeSlotInput().generation_config,
        world_mode: 'fantastical',
      },
    });
    const result = validateSceneDemoSlot(input);
    expect(result.hard_fail_codes).toContain('WORLD_MODE_VIOLATION');
  });

  it('advisory on editorial drift (missing NO CHARACTER DROPOUT)', () => {
    const input = makeSlotInput({
      prompt_used: 'Wide establishing shot. No constraints.',
    });
    const result = validateSceneDemoSlot(input);
    expect(result.advisory_codes).toContain('EDITORIAL_DRIFT');
  });

  it('returns upstream dependency ids', () => {
    const result = validateSceneDemoSlot(makeSlotInput());
    expect(result.upstream_dependency_ids).toContain('costume-set-1');
    expect(result.upstream_dependency_ids).toContain('loc-set-1');
    expect(result.upstream_dependency_ids).toContain('atmo-set-1');
  });

  it('environment_detail slot skips character dropout check', () => {
    const plan = makePlan({
      characters: [
        ...makePlan().characters,
        {
          character_key: 'marco',
          actor_id: 'actor-2',
          actor_version_id: 'ver-2',
          wardrobe_state_key: 'work',
          wardrobe_state_label: 'Work',
          state_basis: 'inferred',
          costume_look_set_id: 'costume-set-2',
          costume_look_locked: true,
          blocking_reasons: [],
        },
      ],
    });
    const input = makeSlotInput({
      slot_key: 'environment_detail',
      plan,
      generation_config: {
        ...makeSlotInput().generation_config,
        character_keys: [], // No characters needed for env detail
        actor_ids: ['actor-1', 'actor-2'],
        costume_look_set_ids: ['costume-set-1', 'costume-set-2'],
      },
    });
    const result = validateSceneDemoSlot(input);
    expect(result.hard_fail_codes).not.toContain('CHARACTER_DROPOUT');
  });
});

// ── Run Validation Tests ──

describe('validateSceneDemoRun', () => {
  it('passes when all slots valid and deps locked', () => {
    const plan = makePlan();
    const locked = new Set(['costume-set-1', 'loc-set-1', 'atmo-set-1']);
    const result = validateSceneDemoRun({
      run_id: 'run-1',
      plan,
      slots: [makeSlotInput()],
      currentLockedSetIds: locked,
      world_mode: 'grounded',
    });
    expect(result.all_passed).toBe(true);
    expect(result.lock_eligible).toBe(true);
    expect(result.stale).toBe(false);
  });

  it('marks stale when dependency drifts', () => {
    const plan = makePlan();
    const locked = new Set(['loc-set-1', 'atmo-set-1']); // costume missing
    const result = validateSceneDemoRun({
      run_id: 'run-1',
      plan,
      slots: [makeSlotInput()],
      currentLockedSetIds: locked,
      world_mode: 'grounded',
    });
    expect(result.stale).toBe(true);
    expect(result.lock_eligible).toBe(false);
    expect(result.stale_reasons.length).toBeGreaterThan(0);
  });

  it('blocks lock when any slot has hard fail', () => {
    const badSlot = makeSlotInput({
      generation_config: {
        ...makeSlotInput().generation_config,
        actor_ids: ['wrong-actor'],
      },
    });
    const locked = new Set(['costume-set-1', 'loc-set-1', 'atmo-set-1']);
    const result = validateSceneDemoRun({
      run_id: 'run-1',
      plan: makePlan(),
      slots: [badSlot],
      currentLockedSetIds: locked,
      world_mode: 'grounded',
    });
    expect(result.all_passed).toBe(false);
    expect(result.lock_eligible).toBe(false);
    expect(result.hard_fail_count).toBeGreaterThan(0);
  });
});

// ── Approval Helpers Tests ──

describe('isSlotApprovable', () => {
  it('returns true for passed slot', () => {
    const v = validateSceneDemoSlot(makeSlotInput());
    expect(isSlotApprovable(v)).toBe(true);
  });

  it('returns false for failed slot', () => {
    const v = validateSceneDemoSlot(makeSlotInput({
      generation_config: { ...makeSlotInput().generation_config, actor_ids: ['wrong'] },
    }));
    expect(isSlotApprovable(v)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isSlotApprovable(null)).toBe(false);
  });
});

describe('checkRunLockEligibility', () => {
  it('eligible when all required slots approved', () => {
    const statuses: Record<string, SlotApprovalStatus> = {
      establishing_wide: 'approved',
      character_action: 'approved',
    };
    const result = checkRunLockEligibility(statuses, ['establishing_wide', 'character_action']);
    expect(result.eligible).toBe(true);
  });

  it('ineligible when required slot not approved', () => {
    const statuses: Record<string, SlotApprovalStatus> = {
      establishing_wide: 'approved',
      character_action: 'pending',
    };
    const result = checkRunLockEligibility(statuses, ['establishing_wide', 'character_action']);
    expect(result.eligible).toBe(false);
    expect(result.blocking_reasons.length).toBeGreaterThan(0);
  });

  it('ineligible when required slot missing', () => {
    const statuses: Record<string, SlotApprovalStatus> = {
      establishing_wide: 'approved',
    };
    const result = checkRunLockEligibility(statuses, ['establishing_wide', 'character_action']);
    expect(result.eligible).toBe(false);
  });
});

describe('detectRunStaleness', () => {
  it('not stale when all deps locked', () => {
    const plan = makePlan();
    const locked = new Set(['costume-set-1', 'loc-set-1', 'atmo-set-1']);
    const result = detectRunStaleness(plan, locked);
    expect(result.stale).toBe(false);
  });

  it('stale when costume set drifted', () => {
    const plan = makePlan();
    const locked = new Set(['loc-set-1', 'atmo-set-1']);
    const result = detectRunStaleness(plan, locked);
    expect(result.stale).toBe(true);
    expect(result.reasons.length).toBe(1);
  });
});

describe('summarizeSlotValidation', () => {
  it('returns score string for passing slot', () => {
    const v = validateSceneDemoSlot(makeSlotInput());
    const summary = summarizeSlotValidation(v);
    expect(summary).toContain('Score: 100/100');
  });

  it('includes hard fails in summary', () => {
    const v = validateSceneDemoSlot(makeSlotInput({
      generation_config: { ...makeSlotInput().generation_config, actor_ids: ['wrong'] },
    }));
    const summary = summarizeSlotValidation(v);
    expect(summary).toContain('ACTOR_IDENTITY_LOST');
  });
});

// ── Shape Tests ──

describe('validation result shape', () => {
  it('has all required fields', () => {
    const result = validateSceneDemoSlot(makeSlotInput());
    expect(result).toHaveProperty('slot_key');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('overall_score');
    expect(result).toHaveProperty('scores');
    expect(result).toHaveProperty('hard_fail_codes');
    expect(result).toHaveProperty('advisory_codes');
    expect(result).toHaveProperty('validation_version');
    expect(result).toHaveProperty('scoring_model');
    expect(result).toHaveProperty('source_plan_id');
    expect(result).toHaveProperty('upstream_dependency_ids');
  });

  it('scores object has all axes', () => {
    const result = validateSceneDemoSlot(makeSlotInput());
    const axes = Object.keys(result.scores);
    expect(axes).toContain('actor_continuity');
    expect(axes).toContain('costume_continuity');
    expect(axes).toContain('environment_continuity');
    expect(axes).toContain('atmosphere_continuity');
    expect(axes).toContain('purpose_adherence');
    expect(axes).toContain('world_mode_compliance');
    expect(axes).toContain('character_presence');
    expect(axes).toContain('editorial_fidelity');
  });
});

describe('run state transitions', () => {
  it('fail-closed: plan not ready blocks lock', () => {
    const plan = makePlan({ readiness_status: 'blocked' });
    const locked = new Set(['costume-set-1', 'loc-set-1', 'atmo-set-1']);
    const result = validateSceneDemoRun({
      run_id: 'run-1',
      plan,
      slots: [makeSlotInput({ plan })],
      currentLockedSetIds: locked,
      world_mode: 'grounded',
    });
    expect(result.lock_eligible).toBe(false);
    expect(result.blocking_reasons).toContain('Source plan is not ready');
  });
});
