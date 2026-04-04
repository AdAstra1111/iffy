/**
 * costumeConvergenceScoring.test.ts — Tests for the convergence scoring engine.
 */
import { describe, it, expect } from 'vitest';
import {
  computeFinalScore,
  detectHardFail,
  scoreCandidate,
  shouldReplaceBest,
  shouldContinueConvergence,
  updateConvergenceState,
  initialConvergenceState,
  estimateAxesFromRules,
  serializeScoresForStorage,
  deserializeScoresFromStorage,
  resolveSlotScoringPolicy,
  getSlotScoringPolicy,
  MIN_VIABLE_SCORE,
  TARGET_SCORE,
  MAX_CONVERGENCE_ATTEMPTS,
  type ConvergenceAxisScores,
} from '../costumeConvergenceScoring';

describe('computeFinalScore', () => {
  it('returns weighted sum', () => {
    const axes: ConvergenceAxisScores = {
      identity_consistency: 1.0,
      costume_consistency: 1.0,
      slot_accuracy: 1.0,
      style_realism: 1.0,
    };
    expect(computeFinalScore(axes)).toBe(1.0);
  });

  it('returns correct weighted partial scores', () => {
    const axes: ConvergenceAxisScores = {
      identity_consistency: 0.5,
      costume_consistency: 0.5,
      slot_accuracy: 0.5,
      style_realism: 0.5,
    };
    expect(computeFinalScore(axes)).toBe(0.5);
  });

  it('weights identity highest with default policy', () => {
    const high_id: ConvergenceAxisScores = {
      identity_consistency: 1.0,
      costume_consistency: 0.0,
      slot_accuracy: 0.0,
      style_realism: 0.0,
    };
    const high_style: ConvergenceAxisScores = {
      identity_consistency: 0.0,
      costume_consistency: 0.0,
      slot_accuracy: 0.0,
      style_realism: 1.0,
    };
    expect(computeFinalScore(high_id)).toBeGreaterThan(computeFinalScore(high_style));
  });

  it('uses policy weights when provided', () => {
    const axes: ConvergenceAxisScores = {
      identity_consistency: 0.5,
      costume_consistency: 1.0,
      slot_accuracy: 0.8,
      style_realism: 0.7,
    };
    const detailPolicy = getSlotScoringPolicy('detail_texture');
    const strictPolicy = getSlotScoringPolicy('strict_identity');
    const detailScore = computeFinalScore(axes, detailPolicy);
    const strictScore = computeFinalScore(axes, strictPolicy);
    // Detail policy weights costume higher, so same axes should score differently
    expect(detailScore).not.toBe(strictScore);
    // With low identity but high costume, detail should score higher
    expect(detailScore).toBeGreaterThan(strictScore);
  });
});

describe('resolveSlotScoringPolicy', () => {
  it('returns strict_identity for full_body_primary', () => {
    expect(resolveSlotScoringPolicy('full_body_primary', null).key).toBe('strict_identity');
  });

  it('returns strict_identity for three_quarter', () => {
    expect(resolveSlotScoringPolicy('three_quarter', null).key).toBe('strict_identity');
  });

  it('returns detail_texture for detail shot type', () => {
    expect(resolveSlotScoringPolicy('detail', null).key).toBe('detail_texture');
  });

  it('returns detail_texture for fabric_detail', () => {
    expect(resolveSlotScoringPolicy('fabric_detail', null).key).toBe('detail_texture');
  });

  it('returns detail_texture for accessory_detail', () => {
    expect(resolveSlotScoringPolicy('accessory_detail', null).key).toBe('detail_texture');
  });

  it('returns occluded_identity for disguise_concealment state', () => {
    expect(resolveSlotScoringPolicy('full_body_primary', 'disguise_concealment').key).toBe('occluded_identity');
  });

  it('returns detail_texture for detail shot in disguise state', () => {
    expect(resolveSlotScoringPolicy('detail', 'disguise_concealment').key).toBe('detail_texture');
  });

  it('returns occluded_identity for back_silhouette', () => {
    expect(resolveSlotScoringPolicy('back_silhouette', null).key).toBe('occluded_identity');
  });

  it('returns strict_identity for close_up without disguise', () => {
    expect(resolveSlotScoringPolicy('close_up', null).key).toBe('strict_identity');
  });

  it('returns occluded_identity for close_up in masked state', () => {
    expect(resolveSlotScoringPolicy('close_up', 'masked').key).toBe('occluded_identity');
  });
});

describe('detectHardFail', () => {
  it('returns null when all checks pass', () => {
    expect(detectHardFail({
      identityMatch: true,
      hasEraViolation: false,
      slotFramingCorrect: true,
      hasNarrativeLeakage: false,
    })).toBeNull();
  });

  it('detects identity drift with strict policy', () => {
    expect(detectHardFail({
      identityMatch: false,
      hasEraViolation: false,
      slotFramingCorrect: true,
      hasNarrativeLeakage: false,
    })).toBe('identity_drift');
  });

  it('softens identity drift with occluded policy', () => {
    const occluded = getSlotScoringPolicy('occluded_identity');
    expect(detectHardFail({
      identityMatch: false,
      hasEraViolation: false,
      slotFramingCorrect: true,
      hasNarrativeLeakage: false,
    }, occluded)).toBeNull(); // soft, not hard fail
  });

  it('softens identity drift with detail_texture policy', () => {
    const detail = getSlotScoringPolicy('detail_texture');
    expect(detectHardFail({
      identityMatch: false,
      hasEraViolation: false,
      slotFramingCorrect: true,
      hasNarrativeLeakage: false,
    }, detail)).toBeNull();
  });

  it('still hard-fails era violation even with occluded policy', () => {
    const occluded = getSlotScoringPolicy('occluded_identity');
    expect(detectHardFail({
      identityMatch: true,
      hasEraViolation: true,
      slotFramingCorrect: true,
      hasNarrativeLeakage: false,
    }, occluded)).toBe('era_violation');
  });

  it('detects era violation', () => {
    expect(detectHardFail({
      identityMatch: true,
      hasEraViolation: true,
      slotFramingCorrect: true,
      hasNarrativeLeakage: false,
    })).toBe('era_violation');
  });
});

describe('scoreCandidate', () => {
  it('returns score 0 on hard fail', () => {
    const result = scoreCandidate({
      axes: { identity_consistency: 0.9, costume_consistency: 0.9, slot_accuracy: 0.9, style_realism: 0.9 },
      hardFailInput: { identityMatch: false, hasEraViolation: false, slotFramingCorrect: true, hasNarrativeLeakage: false },
    });
    expect(result.final_score).toBe(0);
    expect(result.hard_fail).toBe(true);
    expect(result.fail_reason).toBe('identity_drift');
    expect(result.scoring_policy).toBe('strict_identity');
  });

  it('returns correct score when no hard fail', () => {
    const result = scoreCandidate({
      axes: { identity_consistency: 0.9, costume_consistency: 0.8, slot_accuracy: 0.7, style_realism: 0.6 },
      hardFailInput: { identityMatch: true, hasEraViolation: false, slotFramingCorrect: true, hasNarrativeLeakage: false },
    });
    expect(result.hard_fail).toBe(false);
    expect(result.final_score).toBeGreaterThan(0.7);
    expect(result.final_score).toBeLessThan(1.0);
    expect(result.scoring_policy).toBe('strict_identity');
  });

  it('uses occluded policy weights and softens identity drift', () => {
    const occluded = getSlotScoringPolicy('occluded_identity');
    const result = scoreCandidate({
      axes: { identity_consistency: 0.4, costume_consistency: 0.85, slot_accuracy: 0.8, style_realism: 0.75 },
      hardFailInput: { identityMatch: false, hasEraViolation: false, slotFramingCorrect: true, hasNarrativeLeakage: false },
      policy: occluded,
    });
    // Should NOT hard-fail (identity drift is soft for occluded)
    expect(result.hard_fail).toBe(false);
    expect(result.final_score).toBeGreaterThan(0);
    expect(result.scoring_policy).toBe('occluded_identity');
    // Score should be viable under occluded thresholds
    expect(result.final_score).toBeGreaterThanOrEqual(occluded.min_viable_score);
  });

  it('detail_texture policy gives high score for costume-focused candidates', () => {
    const detail = getSlotScoringPolicy('detail_texture');
    const result = scoreCandidate({
      axes: { identity_consistency: 0.3, costume_consistency: 0.95, slot_accuracy: 0.9, style_realism: 0.85 },
      hardFailInput: { identityMatch: false, hasEraViolation: false, slotFramingCorrect: true, hasNarrativeLeakage: false },
      policy: detail,
    });
    expect(result.hard_fail).toBe(false);
    expect(result.scoring_policy).toBe('detail_texture');
    expect(result.final_score).toBeGreaterThanOrEqual(detail.target_score);
  });

  it('persists policy key in summary', () => {
    const occluded = getSlotScoringPolicy('occluded_identity');
    const result = scoreCandidate({
      axes: { identity_consistency: 0.7, costume_consistency: 0.8, slot_accuracy: 0.7, style_realism: 0.7 },
      hardFailInput: { identityMatch: true, hasEraViolation: false, slotFramingCorrect: true, hasNarrativeLeakage: false },
      policy: occluded,
    });
    expect(result.summary).toContain('policy:occluded_identity');
  });
});

describe('convergence loop', () => {
  it('continues when below target and under max attempts', () => {
    const state = { best_candidate_id: 'a', best_score: 0.6, attempt_count: 2, converged: false, target_reached: false };
    expect(shouldContinueConvergence(state)).toBe(true);
  });

  it('stops when target reached', () => {
    const state = { best_candidate_id: 'a', best_score: TARGET_SCORE, attempt_count: 2, converged: true, target_reached: true };
    expect(shouldContinueConvergence(state)).toBe(false);
  });

  it('stops at max attempts', () => {
    const state = { best_candidate_id: 'a', best_score: 0.5, attempt_count: MAX_CONVERGENCE_ATTEMPTS, converged: true, target_reached: false };
    expect(shouldContinueConvergence(state)).toBe(false);
  });

  it('uses policy target for convergence check', () => {
    const occluded = getSlotScoringPolicy('occluded_identity');
    // Score 0.80 meets occluded target but not strict
    const state = { best_candidate_id: 'a', best_score: 0.80, attempt_count: 2, converged: false, target_reached: false };
    expect(shouldContinueConvergence(state, occluded)).toBe(false); // 0.80 >= 0.80
    expect(shouldContinueConvergence(state)).toBe(true); // 0.80 < 0.85 strict
  });

  it('replaces best on higher score', () => {
    const score = scoreCandidate({
      axes: { identity_consistency: 0.9, costume_consistency: 0.9, slot_accuracy: 0.9, style_realism: 0.9 },
      hardFailInput: { identityMatch: true, hasEraViolation: false, slotFramingCorrect: true, hasNarrativeLeakage: false },
    });
    expect(shouldReplaceBest(0.5, score)).toBe(true);
  });

  it('does not replace on hard fail', () => {
    const score = scoreCandidate({
      axes: { identity_consistency: 0.9, costume_consistency: 0.9, slot_accuracy: 0.9, style_realism: 0.9 },
      hardFailInput: { identityMatch: false, hasEraViolation: false, slotFramingCorrect: true, hasNarrativeLeakage: false },
    });
    expect(shouldReplaceBest(0.5, score)).toBe(false);
  });

  it('updateConvergenceState tracks improvement', () => {
    let state = initialConvergenceState();
    const score1 = scoreCandidate({
      axes: { identity_consistency: 0.7, costume_consistency: 0.7, slot_accuracy: 0.7, style_realism: 0.7 },
      hardFailInput: { identityMatch: true, hasEraViolation: false, slotFramingCorrect: true, hasNarrativeLeakage: false },
    });
    state = updateConvergenceState(state, 'c1', score1);
    expect(state.best_candidate_id).toBe('c1');
    expect(state.best_score).toBe(score1.final_score);
    expect(state.attempt_count).toBe(1);

    // Lower score — no replacement
    const score2 = scoreCandidate({
      axes: { identity_consistency: 0.5, costume_consistency: 0.5, slot_accuracy: 0.5, style_realism: 0.5 },
      hardFailInput: { identityMatch: true, hasEraViolation: false, slotFramingCorrect: true, hasNarrativeLeakage: false },
    });
    state = updateConvergenceState(state, 'c2', score2);
    expect(state.best_candidate_id).toBe('c1'); // unchanged
    expect(state.attempt_count).toBe(2);
  });
});

describe('estimateAxesFromRules', () => {
  it('gives high scores for well-configured generation', () => {
    const axes = estimateAxesFromRules({
      hasIdentityAnchors: true,
      garmentNounMatch: true,
      fabricLanguageMatch: true,
      shotTypeCorrect: true,
      eraAppropriate: true,
      promptValidationPassed: true,
      wardrobeTraitCount: 5,
    });
    expect(axes.identity_consistency).toBeGreaterThanOrEqual(0.8);
    expect(axes.costume_consistency).toBeGreaterThanOrEqual(0.7);
    expect(axes.slot_accuracy).toBe(1.0);
    expect(axes.style_realism).toBeGreaterThanOrEqual(0.8);
  });

  it('gives low identity score without anchors', () => {
    const axes = estimateAxesFromRules({
      hasIdentityAnchors: false,
      garmentNounMatch: true,
      fabricLanguageMatch: true,
      shotTypeCorrect: true,
      eraAppropriate: true,
      promptValidationPassed: true,
      wardrobeTraitCount: 3,
    });
    expect(axes.identity_consistency).toBeLessThan(0.6);
  });
});

describe('serialization', () => {
  it('round-trips correctly with scoring_policy', () => {
    const score = scoreCandidate({
      axes: { identity_consistency: 0.85, costume_consistency: 0.75, slot_accuracy: 0.9, style_realism: 0.7 },
      hardFailInput: { identityMatch: true, hasEraViolation: false, slotFramingCorrect: true, hasNarrativeLeakage: false },
    });
    const serialized = serializeScoresForStorage(score);
    expect(serialized.convergence_scores.scoring_policy).toBe('strict_identity');
    const deserialized = deserializeScoresFromStorage(serialized);
    expect(deserialized).not.toBeNull();
    expect(deserialized!.final_score).toBe(score.final_score);
    expect(deserialized!.axes.identity_consistency).toBe(0.85);
    expect(deserialized!.scoring_policy).toBe('strict_identity');
  });

  it('round-trips occluded policy', () => {
    const occluded = getSlotScoringPolicy('occluded_identity');
    const score = scoreCandidate({
      axes: { identity_consistency: 0.6, costume_consistency: 0.8, slot_accuracy: 0.7, style_realism: 0.7 },
      hardFailInput: { identityMatch: true, hasEraViolation: false, slotFramingCorrect: true, hasNarrativeLeakage: false },
      policy: occluded,
    });
    const serialized = serializeScoresForStorage(score);
    const deserialized = deserializeScoresFromStorage(serialized);
    expect(deserialized!.scoring_policy).toBe('occluded_identity');
  });

  it('defaults to strict_identity when policy missing in storage', () => {
    const raw = {
      convergence_scores: {
        identity_consistency: 0.8,
        costume_consistency: 0.7,
        slot_accuracy: 0.9,
        style_realism: 0.6,
        final_score: 0.77,
        hard_fail: false,
        fail_reason: null,
        // no scoring_policy field — legacy data
      },
    };
    const deserialized = deserializeScoresFromStorage(raw);
    expect(deserialized!.scoring_policy).toBe('strict_identity');
  });
});
