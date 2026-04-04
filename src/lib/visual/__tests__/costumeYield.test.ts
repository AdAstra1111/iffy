/**
 * costumeYield.test.ts — Tests for convergence reset, required-slot attempt budget,
 * and yield-tracking fixes in the costume generation pipeline.
 */

import { describe, it, expect } from 'vitest';
import {
  shouldContinueConvergence,
  initialConvergenceState,
  freshRunScopedConvergenceState,
  isConvergenceFromActiveRun,
  MAX_CONVERGENCE_ATTEMPTS,
  MAX_CONVERGENCE_ATTEMPTS_REQUIRED,
  updateConvergenceState,
  scoreCandidate,
  estimateAxesFromRules,
  resolveSlotScoringPolicy,
} from '../costumeConvergenceScoring';

describe('convergence attempt budget', () => {
  it('required slots get more attempts than optional', () => {
    expect(MAX_CONVERGENCE_ATTEMPTS_REQUIRED).toBeGreaterThan(MAX_CONVERGENCE_ATTEMPTS);
  });

  it('required slot continues beyond optional MAX', () => {
    const state = {
      ...initialConvergenceState(),
      attempt_count: MAX_CONVERGENCE_ATTEMPTS, // at optional limit
      best_score: 0.70, // below target
    };
    // Optional: should stop
    expect(shouldContinueConvergence(state, undefined, false)).toBe(false);
    // Required: should continue
    expect(shouldContinueConvergence(state, undefined, true)).toBe(true);
  });

  it('required slot stops at required MAX', () => {
    const state = {
      ...initialConvergenceState(),
      attempt_count: MAX_CONVERGENCE_ATTEMPTS_REQUIRED,
      best_score: 0.70,
    };
    expect(shouldContinueConvergence(state, undefined, true)).toBe(false);
  });

  it('both stop when target reached regardless of attempts', () => {
    const state = {
      ...initialConvergenceState(),
      attempt_count: 1,
      best_score: 0.90, // above target
    };
    expect(shouldContinueConvergence(state, undefined, false)).toBe(false);
    expect(shouldContinueConvergence(state, undefined, true)).toBe(false);
  });
});

describe('convergence state reset for new runs', () => {
  it('fresh state starts at zero attempts', () => {
    const state = initialConvergenceState();
    expect(state.attempt_count).toBe(0);
    expect(state.best_score).toBe(0);
  });

  it('stale attempt_count blocks convergence', () => {
    // Simulates carrying over from DB without reset
    const staleState = {
      ...initialConvergenceState(),
      attempt_count: MAX_CONVERGENCE_ATTEMPTS,
      best_score: 0,
    };
    expect(shouldContinueConvergence(staleState)).toBe(false);
  });

  it('resetting attempt_count allows fresh convergence', () => {
    // Simulates the new-run reset logic
    const resetState = {
      ...initialConvergenceState(),
      attempt_count: 0, // reset for new run
      best_score: 0.60, // preserve best from previous run
    };
    expect(shouldContinueConvergence(resetState)).toBe(true);
  });
});

describe('freshRunScopedConvergenceState', () => {
  it('resets ALL decision fields to fresh state', () => {
    const fresh = freshRunScopedConvergenceState();
    expect(fresh.attempt_count).toBe(0);
    expect(fresh.best_score).toBe(0);
    expect(fresh.best_candidate_id).toBeNull();
    expect(fresh.converged).toBe(false);
    expect(fresh.target_reached).toBe(false);
  });

  it('stale best_score from old run cannot suppress new run', () => {
    // Simulates old run leaving best_score at target
    const staleState = {
      ...initialConvergenceState(),
      best_score: 0.90, // above target — would stop immediately
      best_candidate_id: 'old-candidate-123',
      attempt_count: 3,
    };
    // Old state WOULD stop convergence
    expect(shouldContinueConvergence(staleState)).toBe(false);

    // Fresh run-scoped state allows generation
    const freshState = freshRunScopedConvergenceState();
    expect(shouldContinueConvergence(freshState)).toBe(true);
  });

  it('stale best_candidate_id is cleared on fresh run', () => {
    const fresh = freshRunScopedConvergenceState();
    expect(fresh.best_candidate_id).toBeNull();
  });
});

describe('isConvergenceFromActiveRun', () => {
  it('returns true when costume_run_id matches active run', () => {
    expect(isConvergenceFromActiveRun({ costume_run_id: 'run_abc' }, 'run_abc')).toBe(true);
  });

  it('returns false when costume_run_id differs', () => {
    expect(isConvergenceFromActiveRun({ costume_run_id: 'run_old' }, 'run_new')).toBe(false);
  });

  it('returns false for null/undefined convergence state', () => {
    expect(isConvergenceFromActiveRun(null, 'run_abc')).toBe(false);
    expect(isConvergenceFromActiveRun(undefined, 'run_abc')).toBe(false);
  });

  it('returns false when costume_run_id is missing from state', () => {
    expect(isConvergenceFromActiveRun({ some_other_field: true }, 'run_abc')).toBe(false);
  });
});
describe('rule-based scoring yields viable scores', () => {
  it('standard generation with anchors produces viable score', () => {
    const axes = estimateAxesFromRules({
      hasIdentityAnchors: true,
      garmentNounMatch: true,
      fabricLanguageMatch: false,
      shotTypeCorrect: true,
      eraAppropriate: true,
      promptValidationPassed: true,
      wardrobeTraitCount: 3,
    });

    const policy = resolveSlotScoringPolicy('full_body_primary', 'work');
    const score = scoreCandidate({
      axes,
      hardFailInput: {
        identityMatch: true,
        hasEraViolation: false,
        slotFramingCorrect: true,
        hasNarrativeLeakage: false,
      },
      policy,
    });

    expect(score.hard_fail).toBe(false);
    expect(score.final_score).toBeGreaterThanOrEqual(policy.min_viable_score);
  });

  it('detail slot with no face uses relaxed policy', () => {
    const policy = resolveSlotScoringPolicy('fabric_detail', 'work');
    expect(policy.key).toBe('detail_texture');
    expect(policy.identity_drift_is_soft).toBe(true);

    const axes = estimateAxesFromRules({
      hasIdentityAnchors: true,
      garmentNounMatch: true,
      fabricLanguageMatch: true,
      shotTypeCorrect: true,
      eraAppropriate: true,
      promptValidationPassed: true,
      wardrobeTraitCount: 2,
    });

    const score = scoreCandidate({
      axes,
      hardFailInput: {
        identityMatch: false, // no face in detail shot
        hasEraViolation: false,
        slotFramingCorrect: true,
        hasNarrativeLeakage: false,
      },
      policy,
    });

    // Should NOT hard fail because identity_drift_is_soft
    expect(score.hard_fail).toBe(false);
    expect(score.final_score).toBeGreaterThanOrEqual(policy.min_viable_score);
  });
});
