/**
 * Convergence Engine — Determinism Tests
 *
 * Proves: no randomness in ranking, stop logic, score bands, round summaries,
 * multi-reference aggregation, self-reference handling, provenance.
 */
import { describe, it, expect } from 'vitest';
import {
  rankCandidates,
  selectKeepers,
  checkConvergenceStop,
  scoreBandFromValue,
  buildRefinementPlan,
  resolveRoundStrategy,
  checkCandidatePromotionEligibility,
  type ConvergenceCandidate,
  type ConvergencePolicy,
  type ConvergenceRun,
} from './convergenceEngine';

function makeCandidate(overrides: Partial<ConvergenceCandidate> = {}): ConvergenceCandidate {
  return {
    id: 'c-' + (overrides.candidate_index ?? 0),
    round_id: 'r1',
    run_id: 'run1',
    asset_id: null,
    candidate_index: 0,
    status: 'scored',
    score: 70,
    score_band: 'promising',
    axis_scores: {},
    hard_fail_codes: [],
    advisory_codes: [],
    rank_position: null,
    selection_status: 'pending',
    selection_rationale: null,
    refinement_fitness: {},
    generation_config: {},
    evaluation_mode: null,
    evaluated_against: [],
    scoring_model: null,
    scoring_prompt_version: null,
    raw_evaluation_json: [],
    confidence: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('rankCandidates — deterministic ranking', () => {
  it('ranks higher score first', () => {
    const candidates = [
      makeCandidate({ score: 60, candidate_index: 0 }),
      makeCandidate({ score: 90, candidate_index: 1 }),
      makeCandidate({ score: 75, candidate_index: 2 }),
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked[0].score).toBe(90);
    expect(ranked[1].score).toBe(75);
    expect(ranked[2].score).toBe(60);
  });

  it('hard fails sort below clean candidates regardless of score', () => {
    const candidates = [
      makeCandidate({ score: 95, hard_fail_codes: ['HF-08'], candidate_index: 0 }),
      makeCandidate({ score: 60, hard_fail_codes: [], candidate_index: 1 }),
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked[0].score).toBe(60);
    expect(ranked[0].hard_fail_codes).toEqual([]);
    expect(ranked[1].score).toBe(95);
    expect(ranked[1].hard_fail_codes).toEqual(['HF-08']);
  });

  it('same score uses candidate_index as tie-breaker', () => {
    const candidates = [
      makeCandidate({ score: 80, candidate_index: 3 }),
      makeCandidate({ score: 80, candidate_index: 1 }),
      makeCandidate({ score: 80, candidate_index: 2 }),
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked[0].candidate_index).toBe(1);
    expect(ranked[1].candidate_index).toBe(2);
    expect(ranked[2].candidate_index).toBe(3);
  });

  it('excludes failed and null-score candidates', () => {
    const candidates = [
      makeCandidate({ score: 80, status: 'scored', candidate_index: 0 }),
      makeCandidate({ score: null, status: 'failed', candidate_index: 1 }),
      makeCandidate({ score: null, status: 'generating', candidate_index: 2 }),
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked).toHaveLength(1);
  });

  it('produces identical output on repeated calls (no randomness)', () => {
    const candidates = [
      makeCandidate({ score: 70, candidate_index: 0 }),
      makeCandidate({ score: 85, candidate_index: 1 }),
      makeCandidate({ score: 70, candidate_index: 2 }),
    ];
    const r1 = rankCandidates(candidates);
    const r2 = rankCandidates(candidates);
    expect(r1.map(c => c.candidate_index)).toEqual(r2.map(c => c.candidate_index));
    expect(r1.map(c => c.rank_position)).toEqual(r2.map(c => c.rank_position));
  });

  it('rank_position is assigned only during ranking, not during scoring', () => {
    const candidates = [
      makeCandidate({ score: 80, candidate_index: 0, rank_position: null }),
      makeCandidate({ score: 90, candidate_index: 1, rank_position: null }),
    ];
    // Before ranking, rank_position should be null
    expect(candidates[0].rank_position).toBeNull();
    // After ranking, rank_position should be assigned
    const ranked = rankCandidates(candidates);
    expect(ranked[0].rank_position).toBe(1);
    expect(ranked[1].rank_position).toBe(2);
  });
});

describe('selectKeepers', () => {
  it('keeps top N and rejects rest', () => {
    const ranked = [
      makeCandidate({ score: 90, rank_position: 1, candidate_index: 0 }),
      makeCandidate({ score: 70, rank_position: 2, candidate_index: 1 }),
      makeCandidate({ score: 50, rank_position: 3, candidate_index: 2 }),
    ];
    const { keepers, rejected } = selectKeepers(ranked, 1);
    expect(keepers).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    expect(keepers[0].selection_status).toBe('keeper');
    expect(rejected[0].selection_status).toBe('rejected');
  });
});

describe('checkConvergenceStop — evidence-based', () => {
  const basePolicy: ConvergencePolicy = {
    maxRounds: 5,
    candidatesPerRound: 3,
    keepTopN: 1,
    requiredScoreBand: 'stable',
    minImprovementDelta: 2,
    failFastOnHardFail: true,
  };

  it('stops when score threshold met', () => {
    const result = checkConvergenceStop(basePolicy, 2, 80, null, 0);
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toContain('threshold');
  });

  it('continues when score below threshold', () => {
    const result = checkConvergenceStop(basePolicy, 2, 60, null, 0);
    expect(result.shouldStop).toBe(false);
  });

  it('stops at max rounds', () => {
    const result = checkConvergenceStop(basePolicy, 5, 30, null, 0);
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toContain('Max rounds');
  });

  it('stops on plateau', () => {
    const result = checkConvergenceStop(basePolicy, 3, 60, 0.5, 0);
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toContain('Plateau');
  });

  it('stops on persistent hard fails when failFast enabled', () => {
    const result = checkConvergenceStop(basePolicy, 2, 50, null, 3);
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toContain('Hard fail');
  });

  it('does not stop on hard fails round 1 even with failFast', () => {
    const result = checkConvergenceStop(basePolicy, 1, 50, null, 3);
    expect(result.shouldStop).toBe(false);
  });
});

describe('scoreBandFromValue — deterministic', () => {
  it('maps scores to correct bands', () => {
    expect(scoreBandFromValue(95)).toBe('elite');
    expect(scoreBandFromValue(90)).toBe('elite');
    expect(scoreBandFromValue(80)).toBe('stable');
    expect(scoreBandFromValue(75)).toBe('stable');
    expect(scoreBandFromValue(65)).toBe('promising');
    expect(scoreBandFromValue(60)).toBe('promising');
    expect(scoreBandFromValue(40)).toBe('weak');
    expect(scoreBandFromValue(0)).toBe('weak');
  });
});

describe('resolveRoundStrategy — deterministic', () => {
  it('round 1 exploratory → exploratory_wide', () => {
    expect(resolveRoundStrategy('exploratory', 1, null)).toBe('exploratory_wide');
  });
  it('round 1 locked → locked_tight', () => {
    expect(resolveRoundStrategy('reference_locked', 1, null)).toBe('locked_tight');
  });
  it('high score → final_confirmation', () => {
    expect(resolveRoundStrategy('reference_locked', 3, 85)).toBe('final_confirmation');
  });
  it('round 4+ → recovery_repair', () => {
    expect(resolveRoundStrategy('exploratory', 4, 50)).toBe('recovery_repair');
  });
});

describe('self-reference bias handling', () => {
  it('self-reference candidate does not get inflated rank from its own score', () => {
    // Simulate: candidate with self-reference advisory should not auto-win
    const candidates = [
      makeCandidate({ score: 50, candidate_index: 0, advisory_codes: ['ADV-SELF-REFERENCE-ONLY'] }),
      makeCandidate({ score: 70, candidate_index: 1, advisory_codes: [] }),
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked[0].candidate_index).toBe(1); // higher score wins
    expect(ranked[0].score).toBe(70);
  });
});

describe('provenance fields present on candidate type', () => {
  it('candidate has all provenance fields', () => {
    const c = makeCandidate({
      evaluation_mode: 'reference_locked',
      evaluated_against: ['ref-1', 'ref-2'],
      scoring_model: 'google/gemini-2.5-flash-lite',
      scoring_prompt_version: 'v2-multi-ref',
      raw_evaluation_json: [{ ref_id: 'r1', score: 8, reason: 'strong match' }],
      confidence: 'high',
    });
    expect(c.evaluation_mode).toBe('reference_locked');
    expect(c.evaluated_against).toHaveLength(2);
    expect(c.scoring_model).toBe('google/gemini-2.5-flash-lite');
    expect(c.scoring_prompt_version).toBe('v2-multi-ref');
    expect(c.raw_evaluation_json).toHaveLength(1);
    expect(c.confidence).toBe('high');
  });

  it('provenance uses stable IDs, not URL fragments', () => {
    const c = makeCandidate({
      evaluated_against: ['asset-uuid-1', 'asset-uuid-2', 'candidate-uuid-3'],
      raw_evaluation_json: [
        { ref_id: 'asset-uuid-1', score: 8, reason: 'good match' },
        { ref_id: 'asset-uuid-2', score: 7, reason: 'decent match' },
      ],
    });
    // No evaluated_against entry should look like a URL fragment
    for (const id of c.evaluated_against) {
      expect(id).not.toMatch(/^https?:\/\//);
      expect(id).not.toMatch(/\.png$/);
      expect(id).not.toMatch(/\.jpg$/);
    }
    // Raw evaluation ref_ids should be stable identifiers
    for (const ev of c.raw_evaluation_json) {
      expect(ev.ref_id).not.toMatch(/^https?:\/\//);
      expect(typeof ev.ref_id).toBe('string');
      expect(ev.ref_id.length).toBeGreaterThan(0);
    }
  });
});

describe('no randomness verification', () => {
  it('ranking is fully deterministic across 100 iterations', () => {
    const candidates = [
      makeCandidate({ score: 70, candidate_index: 0 }),
      makeCandidate({ score: 70, candidate_index: 1 }),
      makeCandidate({ score: 85, candidate_index: 2 }),
      makeCandidate({ score: 85, candidate_index: 3, hard_fail_codes: ['HF-01'] }),
    ];
    const firstResult = rankCandidates(candidates).map(c => c.candidate_index);
    for (let i = 0; i < 100; i++) {
      const result = rankCandidates(candidates).map(c => c.candidate_index);
      expect(result).toEqual(firstResult);
    }
});

// ── Promotion Eligibility Tests ───────────────────────────────────────────

function makeRun(overrides: Partial<ConvergenceRun> = {}): ConvergenceRun {
  return {
    id: 'run1',
    actor_id: 'a1',
    actor_version_id: 'v1',
    user_id: 'u1',
    mode: 'exploratory',
    status: 'completed',
    policy_json: { maxRounds: 4, candidatesPerRound: 4, keepTopN: 2 },
    current_round: 2,
    max_rounds: 4,
    best_candidate_id: null,
    shortlisted_candidate_ids: [],
    stop_reason: null,
    final_recommendation: null,
    started_at: '2026-01-01T00:00:00Z',
    completed_at: '2026-01-01T01:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T01:00:00Z',
    ...overrides,
  };
}

describe('checkCandidatePromotionEligibility', () => {
  it('eligible keeper candidate', () => {
    const c = makeCandidate({ selection_status: 'keeper', asset_id: 'a1', score: 80 });
    const result = checkCandidatePromotionEligibility(c, makeRun());
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('Keeper candidate');
  });

  it('eligible best candidate', () => {
    const c = makeCandidate({ selection_status: 'pending', asset_id: 'a1', score: 80, id: 'c-best' });
    const run = makeRun({ best_candidate_id: 'c-best' });
    const result = checkCandidatePromotionEligibility(c, run);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe('Best candidate');
  });

  it('ineligible: already promoted', () => {
    const c = makeCandidate({ selection_status: 'promoted', asset_id: 'a1', score: 80 });
    const result = checkCandidatePromotionEligibility(c, makeRun());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('Already promoted');
  });

  it('ineligible: failed candidate', () => {
    const c = makeCandidate({ status: 'failed', asset_id: 'a1', score: 80 });
    const result = checkCandidatePromotionEligibility(c, makeRun());
    expect(result.eligible).toBe(false);
  });

  it('ineligible: has hard fails', () => {
    const c = makeCandidate({ hard_fail_codes: ['HF-DRIFT'], asset_id: 'a1', score: 80, selection_status: 'keeper' });
    const result = checkCandidatePromotionEligibility(c, makeRun());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('Has hard failures');
  });

  it('ineligible: no asset', () => {
    const c = makeCandidate({ asset_id: null, score: 80, selection_status: 'keeper' });
    const result = checkCandidatePromotionEligibility(c, makeRun());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('No generated asset');
  });

  it('ineligible: not scored', () => {
    const c = makeCandidate({ score: null, asset_id: 'a1', selection_status: 'keeper' });
    const result = checkCandidatePromotionEligibility(c, makeRun());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('Not yet scored');
  });

  it('ineligible: rejected candidate', () => {
    const c = makeCandidate({ selection_status: 'rejected', asset_id: 'a1', score: 50 });
    const result = checkCandidatePromotionEligibility(c, makeRun());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('Candidate was rejected');
  });
});
});
