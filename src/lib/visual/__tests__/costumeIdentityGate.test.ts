import { describe, it, expect } from 'vitest';
import {
  evaluateIdentityGate,
  evaluateContinuityGate,
  combinedGateDecision,
  isCandidateIdentityValid,
  isCandidateAdmitted,
  serializeGateResult,
  type IdentityDimensionScores,
} from '../costumeIdentityGate';

const goodScores: IdentityDimensionScores = { face: 85, hair: 80, age: 82, body: 78, overall: 84 };
const badScores: IdentityDimensionScores = { face: 30, hair: 35, age: 40, body: 32, overall: 28 };
const occludedGood: IdentityDimensionScores = { face: 50, hair: 60, age: 70, body: 72, overall: 65 };
const detailScores: IdentityDimensionScores = { face: 50, hair: 50, age: 50, body: 50, overall: 50 };

describe('evaluateIdentityGate', () => {
  it('passes strict_identity with good scores', () => {
    const r = evaluateIdentityGate({ dimensions: goodScores, face_assessable: true, policy_key: 'strict_identity' });
    expect(r.status).toBe('pass');
    expect(r.fail_codes).toHaveLength(0);
    expect(r.actor_identity_score).toBeGreaterThan(65);
  });

  it('fails strict_identity with wrong actor', () => {
    const r = evaluateIdentityGate({ dimensions: badScores, face_assessable: true, policy_key: 'strict_identity' });
    expect(r.status).toBe('fail');
    expect(r.fail_codes).toContain('face_mismatch');
  });

  it('fails strict_identity when face hidden', () => {
    const r = evaluateIdentityGate({ dimensions: goodScores, face_assessable: false, policy_key: 'strict_identity' });
    expect(r.status).toBe('fail');
    expect(r.fail_codes).toContain('occluded_identity_uncertain');
  });

  it('passes occluded_identity with hidden face but good body', () => {
    const r = evaluateIdentityGate({ dimensions: occludedGood, face_assessable: false, policy_key: 'occluded_identity' });
    expect(r.status).toBe('pass');
  });

  it('fails occluded_identity with visible wrong body', () => {
    const r = evaluateIdentityGate({ dimensions: badScores, face_assessable: true, policy_key: 'occluded_identity' });
    expect(r.status).toBe('fail');
    expect(r.fail_codes).toContain('body_mismatch');
  });

  it('passes detail_texture with moderate scores', () => {
    const r = evaluateIdentityGate({ dimensions: detailScores, face_assessable: false, policy_key: 'detail_texture' });
    expect(r.status).toBe('pass');
  });

  it('fails detail_texture when clearly wrong body/skin', () => {
    const wrong = { face: 20, hair: 20, age: 15, body: 10, overall: 15 };
    const r = evaluateIdentityGate({ dimensions: wrong, face_assessable: false, policy_key: 'detail_texture' });
    expect(r.status).toBe('fail');
    expect(r.fail_codes).toContain('identity_mismatch');
  });
});

describe('evaluateContinuityGate', () => {
  it('passes when candidate matches existing', () => {
    const r = evaluateContinuityGate({
      candidateScores: goodScores,
      existingBestScores: { face: 83, hair: 78, age: 80, body: 75, overall: 82 },
      policyKey: 'strict_identity',
    });
    expect(r.status).toBe('pass');
    expect(r.continuity_score).toBeGreaterThan(80);
  });

  it('fails when candidate diverges from existing', () => {
    const r = evaluateContinuityGate({
      candidateScores: goodScores,
      existingBestScores: badScores,
      policyKey: 'strict_identity',
    });
    expect(r.status).toBe('fail');
    expect(r.fail_codes).toContain('continuity_mismatch');
  });

  it('skips when no existing reference', () => {
    const r = evaluateContinuityGate({
      candidateScores: goodScores,
      existingBestScores: null,
      policyKey: 'strict_identity',
    });
    expect(r.status).toBe('skipped');
  });

  it('skips continuity for detail_texture policy', () => {
    const r = evaluateContinuityGate({
      candidateScores: goodScores,
      existingBestScores: badScores,
      policyKey: 'detail_texture',
    });
    expect(r.status).toBe('skipped');
  });
});

describe('combinedGateDecision', () => {
  it('admits when both pass', () => {
    const id = evaluateIdentityGate({ dimensions: goodScores, face_assessable: true, policy_key: 'strict_identity' });
    const cont = evaluateContinuityGate({ candidateScores: goodScores, existingBestScores: null, policyKey: 'strict_identity' });
    const r = combinedGateDecision(id, cont);
    expect(r.admitted).toBe(true);
    expect(r.rejection_reason).toBeNull();
  });

  it('rejects when identity fails', () => {
    const id = evaluateIdentityGate({ dimensions: badScores, face_assessable: true, policy_key: 'strict_identity' });
    const cont = evaluateContinuityGate({ candidateScores: badScores, existingBestScores: null, policyKey: 'strict_identity' });
    const r = combinedGateDecision(id, cont);
    expect(r.admitted).toBe(false);
    expect(r.rejection_reason).toBeTruthy();
  });

  it('rejects when continuity fails', () => {
    const id = evaluateIdentityGate({ dimensions: goodScores, face_assessable: true, policy_key: 'strict_identity' });
    const cont = evaluateContinuityGate({ candidateScores: goodScores, existingBestScores: badScores, policyKey: 'strict_identity' });
    const r = combinedGateDecision(id, cont);
    expect(r.admitted).toBe(false);
  });
});

describe('readiness guards', () => {
  it('grandfathers pre-gate images', () => {
    expect(isCandidateIdentityValid(null)).toBe(true);
    expect(isCandidateIdentityValid({})).toBe(true);
    expect(isCandidateAdmitted(null)).toBe(true);
  });

  it('rejects gate-failed images', () => {
    expect(isCandidateIdentityValid({ actor_identity_gate_status: 'fail' })).toBe(false);
    expect(isCandidateAdmitted({ gate_admitted: false })).toBe(false);
  });

  it('passes gate-passed images', () => {
    expect(isCandidateIdentityValid({ actor_identity_gate_status: 'pass' })).toBe(true);
    expect(isCandidateAdmitted({ gate_admitted: true })).toBe(true);
  });
});

describe('serialization', () => {
  it('serializes full gate result', () => {
    const id = evaluateIdentityGate({ dimensions: goodScores, face_assessable: true, policy_key: 'strict_identity' });
    const cont = evaluateContinuityGate({ candidateScores: goodScores, existingBestScores: null, policyKey: 'strict_identity' });
    const combined = combinedGateDecision(id, cont);
    const s = serializeGateResult(combined);
    expect(s.actor_identity_gate_status).toBe('pass');
    expect(s.gate_admitted).toBe(true);
    expect(s.gate_version).toBeTruthy();
    expect(s.policy_key).toBe('strict_identity');
  });
});
