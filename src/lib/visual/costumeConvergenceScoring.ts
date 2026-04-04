/**
 * Costume Convergence Scoring Engine v1.0
 *
 * Deterministic, 4-axis scoring model for costume-on-actor image candidates.
 * Drives convergence toward the best possible result per slot.
 *
 * Axes:
 *   identity_consistency (0–1, weight 0.40)
 *   costume_consistency  (0–1, weight 0.25)
 *   slot_accuracy        (0–1, weight 0.20)
 *   style_realism        (0–1, weight 0.15)
 *
 * Hard-fail conditions immediately produce score = 0 with fail_reason.
 *
 * Slot-aware scoring policies adjust axis weights and thresholds
 * for occluded/detail slots where identity features are intentionally hidden.
 */

// ── Constants ──

export const SCORE_WEIGHTS = {
  identity_consistency: 0.40,
  costume_consistency: 0.25,
  slot_accuracy: 0.20,
  style_realism: 0.15,
} as const;

export const MIN_VIABLE_SCORE = 0.75;
export const TARGET_SCORE = 0.85;
export const MAX_CONVERGENCE_ATTEMPTS = 5;
/** Required slots get more attempts to improve yield */
export const MAX_CONVERGENCE_ATTEMPTS_REQUIRED = 8;

// ── Slot Scoring Policy ──

export type SlotScoringPolicyKey = 'strict_identity' | 'occluded_identity' | 'detail_texture';

export interface SlotScoringPolicy {
  key: SlotScoringPolicyKey;
  label: string;
  weights: {
    identity_consistency: number;
    costume_consistency: number;
    slot_accuracy: number;
    style_realism: number;
  };
  min_viable_score: number;
  target_score: number;
  /** Whether identity_drift hard-fail is relaxed to a soft penalty */
  identity_drift_is_soft: boolean;
}

/**
 * Strict identity policy — used for slots where actor identity MUST be visible.
 * full_body_primary, three_quarter, front_silhouette, close_up, medium, profile
 */
const STRICT_IDENTITY_POLICY: SlotScoringPolicy = {
  key: 'strict_identity',
  label: 'Strict Identity — face/body must be visible and match',
  weights: { ...SCORE_WEIGHTS },
  min_viable_score: MIN_VIABLE_SCORE,
  target_score: TARGET_SCORE,
  identity_drift_is_soft: false,
};

/**
 * Occluded identity policy — for slots where disguise/concealment intentionally
 * hides facial features. Identity weight is reduced; costume/slot accuracy raised.
 * disguise_concealment, hooded, masked, back_silhouette
 */
const OCCLUDED_IDENTITY_POLICY: SlotScoringPolicy = {
  key: 'occluded_identity',
  label: 'Occluded Identity — features intentionally hidden by wardrobe/disguise',
  weights: {
    identity_consistency: 0.20,
    costume_consistency: 0.35,
    slot_accuracy: 0.25,
    style_realism: 0.20,
  },
  min_viable_score: 0.65,
  target_score: 0.80,
  identity_drift_is_soft: true,
};

/**
 * Detail/texture policy — for close-up detail shots of fabric, accessories, closures.
 * No face expected. Identity is near-zero weight; costume fidelity is primary.
 * fabric_detail, closure_detail, accessory_detail, hair_grooming
 */
const DETAIL_TEXTURE_POLICY: SlotScoringPolicy = {
  key: 'detail_texture',
  label: 'Detail/Texture — no face expected, costume fidelity is primary',
  weights: {
    identity_consistency: 0.10,
    costume_consistency: 0.40,
    slot_accuracy: 0.30,
    style_realism: 0.20,
  },
  min_viable_score: 0.60,
  target_score: 0.75,
  identity_drift_is_soft: true,
};

const POLICY_REGISTRY: Record<SlotScoringPolicyKey, SlotScoringPolicy> = {
  strict_identity: STRICT_IDENTITY_POLICY,
  occluded_identity: OCCLUDED_IDENTITY_POLICY,
  detail_texture: DETAIL_TEXTURE_POLICY,
};

/** Slot keys / shot types that map to each policy */
const OCCLUDED_SLOT_KEYS = new Set([
  'disguise_concealment', 'hooded', 'masked', 'back_silhouette',
]);
const DETAIL_SLOT_KEYS = new Set([
  'detail', 'fabric_detail', 'closure_detail', 'accessory_detail', 'hair_grooming',
]);
const OCCLUDED_STATE_KEYS = new Set([
  'disguise_concealment', 'disguise', 'concealment', 'hooded', 'masked',
]);

/**
 * Resolve the scoring policy for a given slot.
 * Uses shot_type and state_key to classify.
 */
export function resolveSlotScoringPolicy(
  shotType: string | null | undefined,
  stateKey: string | null | undefined,
): SlotScoringPolicy {
  const st = (shotType || '').toLowerCase();
  const sk = (stateKey || '').toLowerCase();

  // Detail slots — texture/accessory focus, no face expected
  if (DETAIL_SLOT_KEYS.has(st)) return DETAIL_TEXTURE_POLICY;

  // Occluded slots — disguise/concealment framing
  if (OCCLUDED_SLOT_KEYS.has(st)) return OCCLUDED_IDENTITY_POLICY;

  // State-based occlusion — disguise state on ANY slot type
  if (OCCLUDED_STATE_KEYS.has(sk) && DETAIL_SLOT_KEYS.has(st)) return DETAIL_TEXTURE_POLICY;
  if (OCCLUDED_STATE_KEYS.has(sk)) return OCCLUDED_IDENTITY_POLICY;

  // Default: strict identity
  return STRICT_IDENTITY_POLICY;
}

export function getSlotScoringPolicy(key: SlotScoringPolicyKey): SlotScoringPolicy {
  return POLICY_REGISTRY[key];
}

// ── Types ──

export interface ConvergenceAxisScores {
  identity_consistency: number;
  costume_consistency: number;
  slot_accuracy: number;
  style_realism: number;
}

export type HardFailReason =
  | 'identity_drift'
  | 'era_violation'
  | 'slot_framing_mismatch'
  | 'narrative_leakage';

export interface ConvergenceScore {
  axes: ConvergenceAxisScores;
  final_score: number;
  hard_fail: boolean;
  fail_reason: HardFailReason | null;
  /** Human-readable summary */
  summary: string;
  /** Which scoring policy was applied */
  scoring_policy: SlotScoringPolicyKey;
}

export interface SlotConvergenceState {
  best_candidate_id: string | null;
  best_score: number;
  attempt_count: number;
  converged: boolean;
  /** Whether target score has been reached */
  target_reached: boolean;
}

export interface ConvergenceCandidateRecord {
  candidate_id: string;
  image_id: string;
  scores: ConvergenceAxisScores;
  final_score: number;
  hard_fail: boolean;
  fail_reason: string | null;
  prompt_used: string;
  model_metadata: Record<string, unknown>;
}

// ── Scoring ──

/**
 * Compute final score from axes using weighted sum.
 * Accepts an optional policy; defaults to strict identity weights.
 */
export function computeFinalScore(
  axes: ConvergenceAxisScores,
  policy?: SlotScoringPolicy,
): number {
  const w = policy?.weights ?? SCORE_WEIGHTS;
  const raw =
    axes.identity_consistency * w.identity_consistency +
    axes.costume_consistency * w.costume_consistency +
    axes.slot_accuracy * w.slot_accuracy +
    axes.style_realism * w.style_realism;
  return Math.round(raw * 1000) / 1000;
}

// ── Hard-Fail Detection ──

export interface HardFailInput {
  /** Whether the image matches the expected character identity */
  identityMatch: boolean;
  /** Whether the image contains anachronistic elements */
  hasEraViolation: boolean;
  /** Whether the shot framing matches the slot requirement */
  slotFramingCorrect: boolean;
  /** Whether narrative/environment content leaks into identity slots */
  hasNarrativeLeakage: boolean;
}

/**
 * Check for hard-fail conditions. Returns null if no failure, or the reason.
 * When policy.identity_drift_is_soft is true, identity_drift becomes a soft
 * penalty rather than a hard fail (the axis score already reflects occlusion).
 */
export function detectHardFail(
  input: HardFailInput,
  policy?: SlotScoringPolicy,
): HardFailReason | null {
  if (!input.identityMatch) {
    if (policy?.identity_drift_is_soft) {
      // Not a hard fail for occluded/detail slots — identity axis score handles it
    } else {
      return 'identity_drift';
    }
  }
  if (input.hasEraViolation) return 'era_violation';
  if (!input.slotFramingCorrect) return 'slot_framing_mismatch';
  if (input.hasNarrativeLeakage) return 'narrative_leakage';
  return null;
}

// ── Full Scoring Pipeline ──

export interface ScoreInput {
  axes: ConvergenceAxisScores;
  hardFailInput: HardFailInput;
  /** Optional: slot scoring policy. Defaults to strict_identity. */
  policy?: SlotScoringPolicy;
}

/**
 * Score a candidate image. Returns a deterministic ConvergenceScore.
 * Uses policy-aware weights and thresholds when provided.
 */
export function scoreCandidate(input: ScoreInput): ConvergenceScore {
  const policy = input.policy ?? STRICT_IDENTITY_POLICY;
  const hardFail = detectHardFail(input.hardFailInput, policy);

  if (hardFail) {
    return {
      axes: input.axes,
      final_score: 0,
      hard_fail: true,
      fail_reason: hardFail,
      summary: `Hard fail: ${hardFail}`,
      scoring_policy: policy.key,
    };
  }

  const final_score = computeFinalScore(input.axes, policy);
  const parts: string[] = [`policy:${policy.key}`];
  if (final_score >= policy.target_score) parts.push('target reached');
  else if (final_score >= policy.min_viable_score) parts.push('viable');
  else parts.push('below threshold');

  parts.push(
    `id:${input.axes.identity_consistency.toFixed(2)}`,
    `cos:${input.axes.costume_consistency.toFixed(2)}`,
    `slot:${input.axes.slot_accuracy.toFixed(2)}`,
    `style:${input.axes.style_realism.toFixed(2)}`,
  );

  return {
    axes: input.axes,
    final_score,
    hard_fail: false,
    fail_reason: null,
    summary: parts.join(' | '),
    scoring_policy: policy.key,
  };
}

// ── Convergence Logic ──

/**
 * Determine if a new candidate should replace the current best.
 * Returns true if replacement should happen.
 */
export function shouldReplaceBest(
  currentBestScore: number,
  newScore: ConvergenceScore,
): boolean {
  if (newScore.hard_fail) return false;
  return newScore.final_score > currentBestScore;
}

/**
 * Determine if the convergence loop should continue.
 * Accepts optional policy for policy-aware target thresholds.
 */
export function shouldContinueConvergence(
  state: SlotConvergenceState,
  policy?: SlotScoringPolicy,
  isRequired?: boolean,
): boolean {
  const target = policy?.target_score ?? TARGET_SCORE;
  const maxAttempts = isRequired ? MAX_CONVERGENCE_ATTEMPTS_REQUIRED : MAX_CONVERGENCE_ATTEMPTS;
  if (state.attempt_count >= maxAttempts) return false;
  if (state.best_score >= target) return false;
  return true;
}

/**
 * Update convergence state after scoring a new candidate.
 * Accepts optional policy for policy-aware target thresholds.
 */
export function updateConvergenceState(
  prev: SlotConvergenceState,
  candidateId: string,
  score: ConvergenceScore,
  policy?: SlotScoringPolicy,
): SlotConvergenceState {
  const target = policy?.target_score ?? TARGET_SCORE;
  const newAttemptCount = prev.attempt_count + 1;

  if (score.hard_fail || score.final_score <= prev.best_score) {
    return {
      ...prev,
      attempt_count: newAttemptCount,
      converged: newAttemptCount >= MAX_CONVERGENCE_ATTEMPTS || prev.best_score >= target,
      target_reached: prev.best_score >= target,
    };
  }

  const newBestScore = score.final_score;
  return {
    best_candidate_id: candidateId,
    best_score: newBestScore,
    attempt_count: newAttemptCount,
    converged: newAttemptCount >= MAX_CONVERGENCE_ATTEMPTS || newBestScore >= target,
    target_reached: newBestScore >= target,
  };
}

/**
 * Create initial convergence state for a fresh slot.
 */
export function initialConvergenceState(): SlotConvergenceState {
  return {
    best_candidate_id: null,
    best_score: 0,
    attempt_count: 0,
    converged: false,
    target_reached: false,
  };
}

/**
 * Create a fresh run-scoped convergence state for a new run.
 * Resets ALL decision-making fields so stale data from prior runs
 * cannot suppress generation or promote stale candidates.
 *
 * This is the ONLY valid way to initialize convergence for a new run.
 * Do NOT selectively reset individual fields.
 */
export function freshRunScopedConvergenceState(): SlotConvergenceState {
  return {
    best_candidate_id: null,
    best_score: 0,
    attempt_count: 0,
    converged: false,
    target_reached: false,
  };
}

/**
 * Determine if convergence state belongs to the active run.
 * If costume_run_id in persisted convergence_state differs from activeRunId,
 * the state is historical and must not control active-run decisions.
 */
export function isConvergenceFromActiveRun(
  persistedConvergenceState: Record<string, unknown> | null | undefined,
  activeRunId: string,
): boolean {
  if (!persistedConvergenceState) return false;
  return persistedConvergenceState.costume_run_id === activeRunId;
}

// ── Rule-Based Axis Estimation ──
// Used when no AI vision model is available. Derives axis scores from
// prompt metadata and validation signals.

export interface RuleBasedScoringInput {
  /** Did the prompt include identity anchor references? */
  hasIdentityAnchors: boolean;
  /** Did the prompt include the correct garment nouns? */
  garmentNounMatch: boolean;
  /** Did the prompt include correct fabric language? */
  fabricLanguageMatch: boolean;
  /** Is the forced_shot_type correct for this slot? */
  shotTypeCorrect: boolean;
  /** Did the prompt include era-appropriate language? */
  eraAppropriate: boolean;
  /** Did prompt validation pass? (from validateCostumeLookCandidate) */
  promptValidationPassed: boolean;
  /** Number of wardrobe-specific traits in prompt */
  wardrobeTraitCount: number;
}

/**
 * Estimate axis scores from rule-based signals.
 * This is a deterministic fallback when AI vision scoring is unavailable.
 */
export function estimateAxesFromRules(input: RuleBasedScoringInput): ConvergenceAxisScores {
  // Identity: primarily based on whether anchors were used
  const identity = input.hasIdentityAnchors ? 0.85 : 0.45;

  // Costume: garment + fabric + trait density
  const garmentBase = input.garmentNounMatch ? 0.5 : 0.2;
  const fabricBonus = input.fabricLanguageMatch ? 0.25 : 0;
  const traitBonus = Math.min(input.wardrobeTraitCount * 0.05, 0.25);
  const costume = Math.min(garmentBase + fabricBonus + traitBonus, 1.0);

  // Slot accuracy: shot type + validation
  const slotBase = input.shotTypeCorrect ? 0.7 : 0.3;
  const validationBonus = input.promptValidationPassed ? 0.3 : 0;
  const slot = Math.min(slotBase + validationBonus, 1.0);

  // Style/realism: era-appropriate + general prompt quality
  const styleBase = input.eraAppropriate ? 0.75 : 0.4;
  const styleBonus = input.promptValidationPassed ? 0.15 : 0;
  const style = Math.min(styleBase + styleBonus, 1.0);

  return {
    identity_consistency: Math.round(identity * 100) / 100,
    costume_consistency: Math.round(costume * 100) / 100,
    slot_accuracy: Math.round(slot * 100) / 100,
    style_realism: Math.round(style * 100) / 100,
  };
}

// ── Serialization ──

export interface SerializedConvergenceScores {
  convergence_scores: ConvergenceAxisScores & {
    final_score: number;
    hard_fail: boolean;
    fail_reason: string | null;
    scoring_policy?: SlotScoringPolicyKey;
  };
}

export function serializeScoresForStorage(score: ConvergenceScore): SerializedConvergenceScores {
  return {
    convergence_scores: {
      ...score.axes,
      final_score: score.final_score,
      hard_fail: score.hard_fail,
      fail_reason: score.fail_reason,
      scoring_policy: score.scoring_policy,
    },
  };
}

export function deserializeScoresFromStorage(
  raw: any,
): ConvergenceScore | null {
  if (!raw?.convergence_scores) return null;
  const cs = raw.convergence_scores;
  return {
    axes: {
      identity_consistency: cs.identity_consistency ?? 0,
      costume_consistency: cs.costume_consistency ?? 0,
      slot_accuracy: cs.slot_accuracy ?? 0,
      style_realism: cs.style_realism ?? 0,
    },
    final_score: cs.final_score ?? 0,
    hard_fail: cs.hard_fail ?? false,
    fail_reason: cs.fail_reason ?? null,
    summary: cs.hard_fail ? `Hard fail: ${cs.fail_reason}` : `Score: ${cs.final_score}`,
    scoring_policy: cs.scoring_policy ?? 'strict_identity',
  };
}
