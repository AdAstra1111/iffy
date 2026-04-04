/**
 * costumeIdentityGate.ts — Canonical Actor Identity Enforcement Gate
 *
 * SINGLE SOURCE OF TRUTH for deciding whether a generated costume image
 * passes actor identity verification for candidate admission.
 *
 * No image may become a viable costume slot candidate, advance slot state,
 * contribute to readiness, or be approved/locked without passing this gate.
 *
 * Slot-aware policies determine thresholds:
 *   - strict_identity:   visible actor must match — face/body hard-fail
 *   - occluded_identity: hidden face tolerated if body/age cues match
 *   - detail_texture:    identity not primary, but wrong visible cues fail
 *
 * FAIL CLOSED: uncertain visible slots are never treated as passing.
 */

import type { SlotScoringPolicyKey } from './costumeConvergenceScoring';

// ── Gate Status ──

export type IdentityGateStatus = 'pass' | 'fail' | 'uncertain';
export type ContinuityGateStatus = 'pass' | 'fail' | 'skipped';

// ── Identity Fail Codes ──

export type IdentityFailCode =
  | 'face_mismatch'
  | 'body_mismatch'
  | 'age_mismatch'
  | 'hair_mismatch'
  | 'overall_mismatch'
  | 'below_policy_threshold'
  | 'occluded_identity_uncertain'
  | 'continuity_mismatch'
  | 'identity_mismatch';

// ── Policy Thresholds ──

export interface IdentityGatePolicy {
  key: SlotScoringPolicyKey;
  /** Minimum overall identity score (0-100) to pass */
  min_gate_score: number;
  /** Whether face mismatch alone is a hard fail */
  face_mismatch_hard_fail: boolean;
  /** Whether body mismatch alone is a hard fail */
  body_mismatch_hard_fail: boolean;
  /** Whether hidden-face uncertainty is tolerated */
  allows_hidden_face: boolean;
  /** Whether continuity check is mandatory */
  continuity_required: boolean;
  /** Minimum face score to not trigger face_mismatch (0-100) */
  min_face_score: number;
  /** Minimum body score (0-100) */
  min_body_score: number;
  /** Minimum age score (0-100) */
  min_age_score: number;
}

const STRICT_GATE: IdentityGatePolicy = {
  key: 'strict_identity',
  min_gate_score: 65,
  face_mismatch_hard_fail: true,
  body_mismatch_hard_fail: true,
  allows_hidden_face: false,
  continuity_required: true,
  min_face_score: 55,
  min_body_score: 50,
  min_age_score: 45,
};

const OCCLUDED_GATE: IdentityGatePolicy = {
  key: 'occluded_identity',
  min_gate_score: 50,
  face_mismatch_hard_fail: false,
  body_mismatch_hard_fail: true,
  allows_hidden_face: true,
  continuity_required: true,
  min_face_score: 30,
  min_body_score: 45,
  min_age_score: 35,
};

const DETAIL_GATE: IdentityGatePolicy = {
  key: 'detail_texture',
  min_gate_score: 35,
  face_mismatch_hard_fail: false,
  body_mismatch_hard_fail: false,
  allows_hidden_face: true,
  continuity_required: false,
  min_face_score: 0,
  min_body_score: 30,
  min_age_score: 0,
};

const GATE_REGISTRY: Record<SlotScoringPolicyKey, IdentityGatePolicy> = {
  strict_identity: STRICT_GATE,
  occluded_identity: OCCLUDED_GATE,
  detail_texture: DETAIL_GATE,
};

export function resolveIdentityGatePolicy(policyKey: SlotScoringPolicyKey): IdentityGatePolicy {
  return GATE_REGISTRY[policyKey] ?? STRICT_GATE;
}

// ── Gate Input/Output ──

export interface IdentityDimensionScores {
  face: number;    // 0-100
  hair: number;
  age: number;
  body: number;
  overall: number;
}

export interface IdentityGateInput {
  /** Dimension scores from visual similarity evaluation (0-100 each) */
  dimensions: IdentityDimensionScores;
  /** Whether face was assessable (not 'unavailable') */
  face_assessable: boolean;
  /** Policy key from slot scoring */
  policy_key: SlotScoringPolicyKey;
}

export interface IdentityGateResult {
  status: IdentityGateStatus;
  actor_identity_score: number;
  face_score: number;
  body_score: number;
  age_band_score: number;
  hair_score: number;
  fail_codes: IdentityFailCode[];
  advisory_codes: IdentityFailCode[];
  policy_key: SlotScoringPolicyKey;
  policy_thresholds: IdentityGatePolicy;
  audit_summary: string;
  gate_version: string;
}

export const IDENTITY_GATE_VERSION = '1.0.0';

/**
 * Canonical identity gate evaluation.
 * FAIL CLOSED on uncertain visible slots.
 */
export function evaluateIdentityGate(input: IdentityGateInput): IdentityGateResult {
  const policy = resolveIdentityGatePolicy(input.policy_key);
  const d = input.dimensions;
  const failCodes: IdentityFailCode[] = [];
  const advisoryCodes: IdentityFailCode[] = [];

  // Weighted overall identity score
  const weightedScore = Math.round(
    d.face * 0.40 + d.body * 0.15 + d.age * 0.20 + d.hair * 0.10 + d.overall * 0.15
  );

  // ── Per-dimension checks ──

  // Face check
  if (input.face_assessable && d.face < policy.min_face_score) {
    if (policy.face_mismatch_hard_fail) {
      failCodes.push('face_mismatch');
    } else {
      advisoryCodes.push('face_mismatch');
    }
  }

  // Hidden face uncertainty for strict policy
  if (!input.face_assessable && !policy.allows_hidden_face) {
    failCodes.push('occluded_identity_uncertain');
  } else if (!input.face_assessable && policy.allows_hidden_face) {
    advisoryCodes.push('occluded_identity_uncertain');
  }

  // Body check
  if (d.body < policy.min_body_score) {
    if (policy.body_mismatch_hard_fail) {
      failCodes.push('body_mismatch');
    } else {
      advisoryCodes.push('body_mismatch');
    }
  }

  // Age check
  if (d.age < policy.min_age_score) {
    advisoryCodes.push('age_mismatch');
  }

  // Hair check (advisory only)
  if (d.hair < 40) {
    advisoryCodes.push('hair_mismatch');
  }

  // Overall gate score check
  if (weightedScore < policy.min_gate_score) {
    failCodes.push('below_policy_threshold');
  }

  // Overall identity mismatch (very low)
  if (d.overall < 40) {
    failCodes.push('identity_mismatch');
  }

  // ── Determine status ──
  let status: IdentityGateStatus;
  if (failCodes.length > 0) {
    status = 'fail';
  } else if (advisoryCodes.length > 0 && weightedScore < policy.min_gate_score + 10) {
    // Close to threshold with advisories — uncertain
    status = 'uncertain';
  } else {
    status = 'pass';
  }

  // FAIL CLOSED: uncertain on strict visible → fail
  if (status === 'uncertain' && input.policy_key === 'strict_identity') {
    status = 'fail';
    failCodes.push('below_policy_threshold');
  }

  const auditParts = [
    `policy:${policy.key}`,
    `gate:${status}`,
    `score:${weightedScore}`,
    `face:${d.face}(${input.face_assessable ? 'ok' : 'hidden'})`,
    `body:${d.body}`,
    `age:${d.age}`,
    `hair:${d.hair}`,
    `overall:${d.overall}`,
    failCodes.length > 0 ? `fails:[${failCodes.join(',')}]` : '',
    advisoryCodes.length > 0 ? `advisory:[${advisoryCodes.join(',')}]` : '',
  ].filter(Boolean).join(' | ');

  return {
    status,
    actor_identity_score: weightedScore,
    face_score: d.face,
    body_score: d.body,
    age_band_score: d.age,
    hair_score: d.hair,
    fail_codes: failCodes,
    advisory_codes: advisoryCodes,
    policy_key: input.policy_key,
    policy_thresholds: policy,
    audit_summary: auditParts,
    gate_version: IDENTITY_GATE_VERSION,
  };
}

// ── Continuity Gate ──

export interface ContinuityGateInput {
  /** Identity scores from NEW candidate vs anchors */
  candidateScores: IdentityDimensionScores;
  /** Identity scores from EXISTING best accepted candidate vs anchors (if any) */
  existingBestScores: IdentityDimensionScores | null;
  policyKey: SlotScoringPolicyKey;
}

export interface ContinuityGateResult {
  status: ContinuityGateStatus;
  continuity_score: number;
  fail_codes: IdentityFailCode[];
  audit_summary: string;
}

/**
 * Continuity gate — ensures images within same wardrobe state
 * depict the same performer.
 *
 * Compares new candidate's identity scores against existing accepted images.
 * If they diverge significantly, the new candidate fails continuity.
 */
export function evaluateContinuityGate(input: ContinuityGateInput): ContinuityGateResult {
  const policy = resolveIdentityGatePolicy(input.policyKey);

  if (!policy.continuity_required || !input.existingBestScores) {
    return {
      status: 'skipped',
      continuity_score: 100,
      fail_codes: [],
      audit_summary: input.existingBestScores ? 'continuity_not_required' : 'no_existing_reference',
    };
  }

  const c = input.candidateScores;
  const e = input.existingBestScores;

  // Compute divergence across dimensions
  const faceDelta = Math.abs(c.face - e.face);
  const bodyDelta = Math.abs(c.body - e.body);
  const ageDelta = Math.abs(c.age - e.age);
  const overallDelta = Math.abs(c.overall - e.overall);

  // Weighted continuity score (100 = identical, 0 = totally different)
  const avgDelta = (faceDelta * 0.40 + bodyDelta * 0.20 + ageDelta * 0.20 + overallDelta * 0.20);
  const continuityScore = Math.round(Math.max(0, 100 - avgDelta));

  const failCodes: IdentityFailCode[] = [];

  // Continuity fails if delta is too large
  if (continuityScore < 60) {
    failCodes.push('continuity_mismatch');
  }

  return {
    status: failCodes.length > 0 ? 'fail' : 'pass',
    continuity_score: continuityScore,
    fail_codes: failCodes,
    audit_summary: `continuity:${continuityScore} faceDelta:${faceDelta} bodyDelta:${bodyDelta}`,
  };
}

// ── Combined Gate Result (for persistence) ──

export interface CombinedGateResult {
  identity_gate: IdentityGateResult;
  continuity_gate: ContinuityGateResult;
  /** Overall admission decision */
  admitted: boolean;
  /** Combined fail codes */
  all_fail_codes: IdentityFailCode[];
  /** Human-readable reason for UI */
  rejection_reason: string | null;
}

/**
 * Combine identity + continuity gate results into a single admission decision.
 */
export function combinedGateDecision(
  identity: IdentityGateResult,
  continuity: ContinuityGateResult,
): CombinedGateResult {
  const allFails = [...identity.fail_codes, ...continuity.fail_codes];
  const admitted = identity.status === 'pass' && continuity.status !== 'fail';

  let rejectionReason: string | null = null;
  if (!admitted) {
    if (identity.status === 'fail') {
      rejectionReason = `Identity gate failed: ${identity.fail_codes.join(', ')}`;
    } else if (continuity.status === 'fail') {
      rejectionReason = `Continuity mismatch: images may depict different performers`;
    } else if (identity.status === 'uncertain') {
      rejectionReason = `Identity uncertain for visible slot — fail closed`;
    }
  }

  return {
    identity_gate: identity,
    continuity_gate: continuity,
    admitted,
    all_fail_codes: allFails,
    rejection_reason: rejectionReason,
  };
}

// ── Serialization for DB persistence ──

export interface SerializedGatePayload {
  actor_identity_gate_status: IdentityGateStatus;
  actor_identity_score: number;
  continuity_gate_status: ContinuityGateStatus;
  continuity_score: number;
  identity_fail_codes: string[];
  continuity_fail_codes: string[];
  identity_advisory_codes: string[];
  policy_key: SlotScoringPolicyKey;
  gate_version: string;
  gate_admitted: boolean;
  gate_rejection_reason: string | null;
  face_score: number;
  body_score: number;
  age_score: number;
  hair_score: number;
}

export function serializeGateResult(result: CombinedGateResult): SerializedGatePayload {
  return {
    actor_identity_gate_status: result.identity_gate.status,
    actor_identity_score: result.identity_gate.actor_identity_score,
    continuity_gate_status: result.continuity_gate.status,
    continuity_score: result.continuity_gate.continuity_score,
    identity_fail_codes: result.identity_gate.fail_codes,
    continuity_fail_codes: result.continuity_gate.fail_codes,
    identity_advisory_codes: result.identity_gate.advisory_codes,
    policy_key: result.identity_gate.policy_key,
    gate_version: result.identity_gate.gate_version,
    gate_admitted: result.admitted,
    gate_rejection_reason: result.rejection_reason,
    face_score: result.identity_gate.face_score,
    body_score: result.identity_gate.body_score,
    age_score: result.identity_gate.age_band_score,
    hair_score: result.identity_gate.hair_score,
  };
}

// ── Readiness / Resolver Guards ──

/**
 * Check whether a candidate's gate payload marks it as identity-valid.
 * Used by slot resolver, readiness computations, and Approve All Safe.
 */
export function isCandidateIdentityValid(
  generationConfig: Record<string, unknown> | null | undefined,
): boolean {
  if (!generationConfig) return true; // Pre-gate images are grandfathered
  const gateStatus = generationConfig.actor_identity_gate_status as string | undefined;
  if (!gateStatus) return true; // No gate run yet — grandfathered
  return gateStatus === 'pass';
}

/**
 * Check if a candidate was admitted by both identity + continuity gates.
 */
export function isCandidateAdmitted(
  generationConfig: Record<string, unknown> | null | undefined,
): boolean {
  if (!generationConfig) return true; // Pre-gate grandfathered
  const admitted = generationConfig.gate_admitted;
  if (admitted === undefined) return true; // No gate yet
  return admitted === true;
}

/**
 * Canonical producer_decision eligibility check.
 *
 * A candidate is producer-eligible (display-eligible) if its producer_decision
 * is NOT a terminal rejection. Null and 'pending' are included as "not yet decided."
 *
 * Use this helper anywhere candidate display/visibility depends on producer_decision
 * to avoid duplicating null-handling semantics.
 */
export function isProducerDecisionEligible(
  producerDecision: string | null | undefined,
): boolean {
  if (!producerDecision) return true; // null / undefined = not yet decided = eligible
  if (producerDecision === 'pending') return true;
  if (producerDecision === 'rejected') return false;
  if (producerDecision === 'archived_by_reset') return false;
  // Any other value (approved, selected, etc.) is eligible
  return true;
}

/**
 * Get human-readable rejection reason from generation config.
 */
export function getCandidateRejectionReason(
  generationConfig: Record<string, unknown> | null | undefined,
): string | null {
  if (!generationConfig) return null;
  return (generationConfig.gate_rejection_reason as string) || null;
}
