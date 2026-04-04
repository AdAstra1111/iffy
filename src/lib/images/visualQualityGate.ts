/**
 * visualQualityGate — CANONICAL Unified Visual Quality Gate.
 *
 * SINGLE enforced image gate for ALL production outputs.
 * Every image MUST pass through this gate before insert into project_images
 * or admission into any governed pool.
 *
 * Composes:
 *   - characterImageEligibility (identity integrity)
 *   - premiumQualityGate (model provenance + resolution)
 *   + cinematic composition checks
 *   + environment coherence checks
 *   + prompt depth checks
 *
 * FAIL-CLOSED: images that fail ANY critical dimension are rejected.
 *
 * Output contract:
 *   { status, premiumEligible, score, rejectionCodes, warnings }
 *
 * DB columns populated from gate result:
 *   quality_status, premium_eligible, quality_score, quality_rejection_codes, quality_warnings
 */

import {
  classifyCharacterIdentity,
  type GateImageInput,
} from './characterImageEligibility';
import {
  classifyPremiumImageQuality,
  type QualityGateImageInput,
  type PremiumQualityStatus,
} from './premiumQualityGate';

// ── Types ──────────────────────────────────────────────────────────

export type QualityDimension =
  | 'identity_integrity'
  | 'model_provenance'
  | 'resolution'
  | 'cinematic_composition'
  | 'environment_coherence'
  | 'prompt_depth';

export type VisualQualityVerdict = 'pass' | 'warn' | 'reject';

export interface DimensionResult {
  dimension: QualityDimension;
  verdict: VisualQualityVerdict;
  reason: string;
}

/**
 * Canonical gate output contract.
 * Maps directly to DB columns on project_images.
 */
export interface VisualQualityResult {
  /** Overall status: pass | warn | reject */
  status: VisualQualityVerdict;
  /** Whether this image is eligible for premium downstream pools */
  premiumEligible: boolean;
  /** Composite score 0–100 */
  score: number;
  /** Codes of dimensions that triggered rejection */
  rejectionCodes: QualityDimension[];
  /** Human-readable warnings */
  warnings: string[];
  /** Per-dimension breakdown (for audit/debugging) */
  dimensions: DimensionResult[];
  // Legacy aliases (kept for backward compat)
  verdict: VisualQualityVerdict;
  rejectedDimensions: QualityDimension[];
}

/**
 * DB-ready payload for persisting gate result on project_images row.
 */
export interface QualityGateDbPayload {
  quality_status: 'pass' | 'warn' | 'reject';
  premium_eligible: boolean;
  quality_score: number;
  quality_rejection_codes: string[];
  quality_warnings: string[];
}

export interface VisualQualityFilterResult<T> {
  passed: T[];
  rejected: T[];
  summary: {
    total: number;
    passedCount: number;
    rejectedCount: number;
    rejectionBreakdown: Record<QualityDimension, number>;
  };
}

// ── Extended Image Input ──────────────────────────────────────────

export interface VisualQualityImageInput extends QualityGateImageInput {
  prompt_used?: string | null;
  storage_path?: string | null;
  asset_group?: string | null;
  generation_purpose?: string | null;
  shot_type?: string | null;
  location_ref?: string | null;
  moment_ref?: string | null;
  subject_ref?: string | null;
  lane_key?: string | null;
  prestige_style?: string | null;
}

// ── Constants ─────────────────────────────────────────────────────

/** Minimum prompt length for "prompt depth" — shallow prompts yield generic images */
const MIN_PROMPT_DEPTH_CHARS = 120;

/** Minimum resolution (pixels) for production-grade imagery */
const PRODUCTION_MIN_PIXELS = 600_000; // ~800x750

/** Shot types that imply compositional intent */
const COMPOSITIONAL_SHOT_TYPES = new Set([
  'wide', 'tableau', 'close_up', 'medium', 'full_body',
  'atmospheric', 'detail', 'over_shoulder',
  'identity_headshot', 'identity_profile', 'identity_full_body',
]);

// ── Dimension Assessors ───────────────────────────────────────────

function assessIdentityIntegrity(
  img: VisualQualityImageInput,
  sectionKey: string | null,
): DimensionResult {
  const identity = classifyCharacterIdentity(img, sectionKey);
  if (identity.eligible) {
    return { dimension: 'identity_integrity', verdict: 'pass', reason: 'Identity verified or not required' };
  }
  return {
    dimension: 'identity_integrity',
    verdict: 'reject',
    reason: `Identity gate failed: ${identity.reasons.join('; ')}`,
  };
}

function assessModelProvenance(img: VisualQualityImageInput): DimensionResult {
  const quality = classifyPremiumImageQuality(img);
  if (quality.status === 'premium_pass') {
    return { dimension: 'model_provenance', verdict: 'pass', reason: `Premium model: ${quality.model}` };
  }
  if (quality.status === 'premium_warn') {
    return { dimension: 'model_provenance', verdict: 'warn', reason: quality.reasons.join('; ') };
  }
  return {
    dimension: 'model_provenance',
    verdict: 'reject',
    reason: `Model provenance failed: ${quality.reasons.join('; ')}`,
  };
}

function assessResolution(img: VisualQualityImageInput): DimensionResult {
  const w = img.width ?? 0;
  const h = img.height ?? 0;
  if (w === 0 || h === 0) {
    return { dimension: 'resolution', verdict: 'warn', reason: 'Resolution unknown — no width/height metadata' };
  }
  const pixels = w * h;
  if (pixels >= PRODUCTION_MIN_PIXELS) {
    return { dimension: 'resolution', verdict: 'pass', reason: `${w}×${h} (${pixels}px) meets production floor` };
  }
  return {
    dimension: 'resolution',
    verdict: 'reject',
    reason: `Resolution too low: ${w}×${h} (${pixels}px), minimum ${PRODUCTION_MIN_PIXELS}px`,
  };
}

function assessCinematicComposition(img: VisualQualityImageInput): DimensionResult {
  const w = img.width ?? 0;
  const h = img.height ?? 0;

  if (w > 0 && h > 0) {
    const aspect = w / h;
    const isIdentityShot = img.shot_type?.startsWith('identity_');
    if (!isIdentityShot && (aspect < 0.5 || aspect > 3.0)) {
      return {
        dimension: 'cinematic_composition',
        verdict: 'reject',
        reason: `Extreme aspect ratio (${aspect.toFixed(2)}) — not cinematic`,
      };
    }
  }

  if (img.shot_type && !COMPOSITIONAL_SHOT_TYPES.has(img.shot_type)) {
    return {
      dimension: 'cinematic_composition',
      verdict: 'warn',
      reason: `Non-standard shot type: ${img.shot_type}`,
    };
  }

  return { dimension: 'cinematic_composition', verdict: 'pass', reason: 'Composition acceptable' };
}

function assessEnvironmentCoherence(img: VisualQualityImageInput): DimensionResult {
  const gc = (img.generation_config || {}) as Record<string, unknown>;

  if (img.subject_type === 'location' || img.asset_group === 'world') {
    if (!img.location_ref && !gc.location_id && !gc.location_name) {
      return {
        dimension: 'environment_coherence',
        verdict: 'warn',
        reason: 'Environment image lacks location binding — may be generic',
      };
    }
  }

  if (gc.canon_grounded === false) {
    return {
      dimension: 'environment_coherence',
      verdict: 'warn',
      reason: 'Image not grounded in project canon',
    };
  }

  return { dimension: 'environment_coherence', verdict: 'pass', reason: 'Environment coherence acceptable' };
}

function assessPromptDepth(img: VisualQualityImageInput): DimensionResult {
  const prompt = img.prompt_used || '';
  if (prompt.length === 0) {
    return { dimension: 'prompt_depth', verdict: 'warn', reason: 'No prompt_used recorded — provenance incomplete' };
  }
  if (prompt.length < MIN_PROMPT_DEPTH_CHARS) {
    return {
      dimension: 'prompt_depth',
      verdict: 'warn',
      reason: `Prompt is shallow (${prompt.length} chars, min ${MIN_PROMPT_DEPTH_CHARS}) — may yield generic output`,
    };
  }
  return { dimension: 'prompt_depth', verdict: 'pass', reason: 'Prompt has sufficient depth' };
}

// ── Dimension Weights ─────────────────────────────────────────────

const DIMENSION_WEIGHTS: Record<QualityDimension, number> = {
  identity_integrity: 30,
  model_provenance: 25,
  resolution: 15,
  cinematic_composition: 15,
  environment_coherence: 10,
  prompt_depth: 5,
};

function computeScore(dimensions: DimensionResult[]): number {
  let score = 0;
  for (const d of dimensions) {
    const weight = DIMENSION_WEIGHTS[d.dimension];
    if (d.verdict === 'pass') score += weight;
    else if (d.verdict === 'warn') score += weight * 0.5;
  }
  return Math.round(score);
}

// ── Main Gate ─────────────────────────────────────────────────────

/**
 * Validate an image against the unified Visual Quality Gate.
 * Returns the canonical gate result matching the output contract.
 */
export function validateVisualQuality(
  img: VisualQualityImageInput,
  sectionKey: string | null = null,
): VisualQualityResult {
  const dimensions: DimensionResult[] = [
    assessIdentityIntegrity(img, sectionKey),
    assessModelProvenance(img),
    assessResolution(img),
    assessCinematicComposition(img),
    assessEnvironmentCoherence(img),
    assessPromptDepth(img),
  ];

  const rejectionCodes = dimensions
    .filter(d => d.verdict === 'reject')
    .map(d => d.dimension);

  const warnings = dimensions
    .filter(d => d.verdict === 'warn')
    .map(d => d.reason);

  const score = computeScore(dimensions);

  // Any reject → overall reject
  const status: VisualQualityVerdict = rejectionCodes.length > 0
    ? 'reject'
    : warnings.length > 0
      ? 'warn'
      : 'pass';

  // Premium eligible = pass on identity + model provenance + resolution (all three must not reject)
  const premiumEligible =
    status !== 'reject' &&
    dimensions.find(d => d.dimension === 'identity_integrity')?.verdict !== 'reject' &&
    dimensions.find(d => d.dimension === 'model_provenance')?.verdict !== 'reject' &&
    dimensions.find(d => d.dimension === 'resolution')?.verdict !== 'reject' &&
    // Must actually PASS model provenance (not just warn) for premium
    dimensions.find(d => d.dimension === 'model_provenance')?.verdict === 'pass';

  return {
    status,
    premiumEligible,
    score,
    rejectionCodes,
    warnings,
    dimensions,
    // Legacy aliases
    verdict: status,
    rejectedDimensions: rejectionCodes,
  };
}

// ── DB Payload Builder ────────────────────────────────────────────

/**
 * Convert a gate result into DB-ready payload for project_images columns.
 * Use this at insert or update time.
 */
export function toQualityGateDbPayload(result: VisualQualityResult): QualityGateDbPayload {
  return {
    quality_status: result.status,
    premium_eligible: result.premiumEligible,
    quality_score: result.score,
    quality_rejection_codes: result.rejectionCodes,
    quality_warnings: result.warnings,
  };
}

/**
 * Compute gate result AND return DB payload in one call.
 * Convenience for edge function insert paths.
 */
export function computeQualityGateForInsert(
  img: VisualQualityImageInput,
  sectionKey: string | null = null,
): { result: VisualQualityResult; dbPayload: QualityGateDbPayload } {
  const result = validateVisualQuality(img, sectionKey);
  return { result, dbPayload: toQualityGateDbPayload(result) };
}

// ── Batch Filter ──────────────────────────────────────────────────

/**
 * Filter images through the Visual Quality Gate.
 * Only images with verdict !== 'reject' pass through.
 */
export function filterVisualQuality<T extends VisualQualityImageInput>(
  images: T[],
  sectionKey: string | null = null,
): VisualQualityFilterResult<T> {
  const passed: T[] = [];
  const rejected: T[] = [];
  const rejectionBreakdown: Record<QualityDimension, number> = {
    identity_integrity: 0,
    model_provenance: 0,
    resolution: 0,
    cinematic_composition: 0,
    environment_coherence: 0,
    prompt_depth: 0,
  };

  for (const img of images) {
    const result = validateVisualQuality(img, sectionKey);
    if (result.status === 'reject') {
      rejected.push(img);
      for (const dim of result.rejectionCodes) {
        rejectionBreakdown[dim]++;
      }
    } else {
      passed.push(img);
    }
  }

  if (rejected.length > 0) {
    console.warn('[VISUAL_QUALITY_GATE]', {
      sectionKey,
      total: images.length,
      passed: passed.length,
      rejected: rejected.length,
      rejectionBreakdown,
    });
  }

  return {
    passed,
    rejected,
    summary: {
      total: images.length,
      passedCount: passed.length,
      rejectedCount: rejected.length,
      rejectionBreakdown,
    },
  };
}

// ── Premium Pool Filter ───────────────────────────────────────────

/**
 * Filter images eligible for premium downstream pools (Poster, Concept Brief).
 * Stricter than basic quality gate — requires premiumEligible === true.
 */
export function filterPremiumPoolEligible<T extends VisualQualityImageInput>(
  images: T[],
  sectionKey: string | null = null,
): { eligible: T[]; ineligible: T[] } {
  const eligible: T[] = [];
  const ineligible: T[] = [];

  for (const img of images) {
    const result = validateVisualQuality(img, sectionKey);
    if (result.premiumEligible && result.status !== 'reject') {
      eligible.push(img);
    } else {
      ineligible.push(img);
    }
  }

  return { eligible, ineligible };
}

// ── IEL Assertion ─────────────────────────────────────────────────

/**
 * IEL guard — throws if image fails the Visual Quality Gate.
 * Use before any mutation that admits an image into a governed pool.
 */
export function assertVisualQuality(
  img: VisualQualityImageInput,
  action: string,
  sectionKey: string | null = null,
): void {
  const result = validateVisualQuality(img, sectionKey);
  if (result.status === 'reject') {
    const msg = `[VISUAL_QUALITY_GATE_BLOCK] Cannot ${action}: ${result.rejectionCodes.join(', ')} failed`;
    console.error(msg, { image_id: img.id, score: result.score, rejectionCodes: result.rejectionCodes });
    throw new Error(msg);
  }
}
