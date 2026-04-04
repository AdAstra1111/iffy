import { describe, it, expect } from 'vitest';
import {
  evaluateIdentityGate,
  evaluateContinuityGate,
  combinedGateDecision,
  isCandidateIdentityValid,
  isCandidateAdmitted,
  getCandidateRejectionReason,
  serializeGateResult,
  type IdentityDimensionScores,
} from '../costumeIdentityGate';
import {
  resolveVisualSlotState,
  type SlotLike,
  type CandidateLike,
} from '../slotStateResolver';

// ── Test fixtures ──

const goodScores: IdentityDimensionScores = { face: 85, hair: 80, age: 82, body: 78, overall: 84 };
const badScores: IdentityDimensionScores = { face: 30, hair: 35, age: 40, body: 32, overall: 28 };

function makeSlot(overrides: Partial<SlotLike> = {}): SlotLike {
  return { id: 'slot-1', state: 'empty', ...overrides };
}

function makeCandidate(overrides: Partial<CandidateLike> = {}): CandidateLike {
  return {
    id: 'cand-1',
    visual_set_slot_id: 'slot-1',
    image_id: 'img-1',
    selected_for_slot: false,
    producer_decision: 'undecided',
    generation_config: null,
    ...overrides,
  };
}

// ── A. Epoch + admission enforcement in resolver ──

describe('Resolver: epoch + admission enforcement', () => {
  it('non-admitted candidates do not produce candidate_present', () => {
    const slot = makeSlot({ state: 'empty' });
    const candidates: CandidateLike[] = [
      makeCandidate({ generation_config: { gate_admitted: false } }),
    ];
    const result = resolveVisualSlotState(slot, candidates);
    expect(result.display_state).toBe('empty');
    expect(result.candidate_count).toBe(0);
  });

  it('admitted candidates DO produce candidate_present', () => {
    const slot = makeSlot({ state: 'empty' });
    const candidates: CandidateLike[] = [
      makeCandidate({ generation_config: { gate_admitted: true } }),
    ];
    const result = resolveVisualSlotState(slot, candidates);
    expect(result.display_state).toBe('candidate_present');
    expect(result.candidate_count).toBe(1);
  });

  it('pre-gate (null config) candidates are grandfathered', () => {
    const slot = makeSlot({ state: 'empty' });
    const candidates: CandidateLike[] = [
      makeCandidate({ generation_config: null }),
    ];
    const result = resolveVisualSlotState(slot, candidates);
    expect(result.display_state).toBe('candidate_present');
    expect(result.candidate_count).toBe(1);
  });

  it('rejected candidates do not count even with gate_admitted=true', () => {
    const slot = makeSlot({ state: 'empty' });
    const candidates: CandidateLike[] = [
      makeCandidate({
        producer_decision: 'rejected',
        generation_config: { gate_admitted: true },
      }),
    ];
    const result = resolveVisualSlotState(slot, candidates);
    expect(result.display_state).toBe('empty');
    expect(result.candidate_count).toBe(0);
  });
});

// ── B. Approval blocking ──

describe('Approval: identity gate enforcement', () => {
  it('approveAllSafe should skip non-admitted candidates (logic check)', () => {
    // Test the gate check helpers directly
    expect(isCandidateAdmitted({ gate_admitted: false })).toBe(false);
    expect(isCandidateAdmitted({ gate_admitted: true })).toBe(true);
    expect(isCandidateAdmitted(null)).toBe(true); // grandfathered
    expect(isCandidateAdmitted({})).toBe(true); // no gate yet
  });

  it('getCandidateRejectionReason returns reason for rejected', () => {
    const reason = getCandidateRejectionReason({
      gate_rejection_reason: 'Identity gate failed: face_mismatch',
    });
    expect(reason).toBe('Identity gate failed: face_mismatch');
  });

  it('getCandidateRejectionReason returns null for admitted', () => {
    expect(getCandidateRejectionReason({ gate_admitted: true })).toBeNull();
    expect(getCandidateRejectionReason(null)).toBeNull();
  });
});

// ── C. Continuity mismatch blocks admission ──

describe('Continuity gate: cross-image enforcement', () => {
  it('continuity mismatch blocks combined admission', () => {
    const idResult = evaluateIdentityGate({
      dimensions: goodScores,
      face_assessable: true,
      policy_key: 'strict_identity',
    });
    expect(idResult.status).toBe('pass');

    const contResult = evaluateContinuityGate({
      candidateScores: goodScores,
      existingBestScores: badScores,
      policyKey: 'strict_identity',
    });
    expect(contResult.status).toBe('fail');

    const combined = combinedGateDecision(idResult, contResult);
    expect(combined.admitted).toBe(false);
    expect(combined.all_fail_codes).toContain('continuity_mismatch');
  });

  it('continuity passes when scores are close', () => {
    const existing: IdentityDimensionScores = { face: 83, hair: 78, age: 80, body: 75, overall: 82 };
    const contResult = evaluateContinuityGate({
      candidateScores: goodScores,
      existingBestScores: existing,
      policyKey: 'strict_identity',
    });
    expect(contResult.status).toBe('pass');
    expect(contResult.continuity_score).toBeGreaterThan(80);
  });
});

// ── D. BEST badge only for admitted current-epoch candidate ──

describe('BEST badge eligibility', () => {
  it('non-admitted candidate does not count in viable candidate count', () => {
    const slot = makeSlot({
      state: 'candidate_present',
      best_candidate_id: 'cand-1',
      best_score: 0.85,
    });
    const candidates: CandidateLike[] = [
      makeCandidate({
        id: 'cand-1',
        selected_for_slot: true,
        generation_config: { gate_admitted: false },
      }),
    ];
    const result = resolveVisualSlotState(slot, candidates);
    // Non-admitted candidates don't count as viable
    expect(result.candidate_count).toBe(0);
    // Slot cache best_candidate_id is preserved as fallback (defensive read model)
    // but UI must use candidate_count to determine BEST badge eligibility
  });
});

// ── E. Readiness ignores non-admitted ──

describe('Readiness: non-admitted exclusion', () => {
  it('slot with only non-admitted candidates resolves as empty', () => {
    const slot = makeSlot({ state: 'empty' });
    const candidates: CandidateLike[] = [
      makeCandidate({ generation_config: { gate_admitted: false } }),
      makeCandidate({ id: 'c2', image_id: 'img-2', generation_config: { gate_admitted: false } }),
    ];
    const result = resolveVisualSlotState(slot, candidates);
    expect(result.display_state).toBe('empty');
    expect(result.candidate_count).toBe(0);
  });

  it('slot with mix of admitted and non-admitted counts only admitted', () => {
    const slot = makeSlot({ state: 'empty' });
    const candidates: CandidateLike[] = [
      makeCandidate({ generation_config: { gate_admitted: false } }),
      makeCandidate({
        id: 'c2',
        image_id: 'img-2',
        generation_config: { gate_admitted: true },
      }),
    ];
    const result = resolveVisualSlotState(slot, candidates);
    expect(result.display_state).toBe('candidate_present');
    expect(result.candidate_count).toBe(1);
  });
});

// ── F. Serialization roundtrip ──

describe('Gate serialization', () => {
  it('serializes and can be checked by isCandidateAdmitted', () => {
    const id = evaluateIdentityGate({ dimensions: goodScores, face_assessable: true, policy_key: 'strict_identity' });
    const cont = evaluateContinuityGate({ candidateScores: goodScores, existingBestScores: null, policyKey: 'strict_identity' });
    const combined = combinedGateDecision(id, cont);
    const serialized = serializeGateResult(combined);

    expect(isCandidateAdmitted(serialized as unknown as Record<string, unknown>)).toBe(true);
    expect(isCandidateIdentityValid(serialized as unknown as Record<string, unknown>)).toBe(true);
    expect(serialized.policy_key).toBe('strict_identity');
    expect(serialized.gate_version).toBeTruthy();
  });

  it('failed gate serializes as non-admitted', () => {
    const id = evaluateIdentityGate({ dimensions: badScores, face_assessable: true, policy_key: 'strict_identity' });
    const cont = evaluateContinuityGate({ candidateScores: badScores, existingBestScores: null, policyKey: 'strict_identity' });
    const combined = combinedGateDecision(id, cont);
    const serialized = serializeGateResult(combined);

    expect(isCandidateAdmitted(serialized as unknown as Record<string, unknown>)).toBe(false);
    expect(serialized.gate_rejection_reason).toBeTruthy();
  });
});

// ── G. Locked/approved states override resolver ──

describe('Resolver: locked/approved override', () => {
  it('locked slot stays locked even with no candidates', () => {
    const slot = makeSlot({ state: 'locked', selected_image_id: 'img-locked' });
    const result = resolveVisualSlotState(slot, []);
    expect(result.display_state).toBe('locked');
  });

  it('approved slot stays approved even with non-admitted candidates', () => {
    const slot = makeSlot({ state: 'approved', selected_image_id: 'img-approved' });
    const candidates: CandidateLike[] = [
      makeCandidate({ generation_config: { gate_admitted: false } }),
    ];
    const result = resolveVisualSlotState(slot, candidates);
    expect(result.display_state).toBe('approved');
  });
});

// ── H. Detail slots don't hard-fail on hidden face ──

describe('Policy: detail_texture tolerance', () => {
  it('detail_texture passes with hidden face and moderate scores', () => {
    const scores: IdentityDimensionScores = { face: 50, hair: 50, age: 50, body: 50, overall: 50 };
    const result = evaluateIdentityGate({
      dimensions: scores,
      face_assessable: false,
      policy_key: 'detail_texture',
    });
    expect(result.status).toBe('pass');
  });

  it('strict_identity fails with hidden face', () => {
    const result = evaluateIdentityGate({
      dimensions: goodScores,
      face_assessable: false,
      policy_key: 'strict_identity',
    });
    expect(result.status).toBe('fail');
    expect(result.fail_codes).toContain('occluded_identity_uncertain');
  });
});
