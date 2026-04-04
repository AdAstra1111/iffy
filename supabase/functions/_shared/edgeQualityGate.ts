/**
 * edgeQualityGate — Server-side Visual Quality Gate for edge functions.
 *
 * Mirrors the canonical client-side visualQualityGate.ts logic.
 * Computes quality_status, premium_eligible, quality_score, rejection_codes, warnings
 * for insertion into project_images at generation time.
 *
 * v2: Added scene_grounding dimension for hero frame enforcement.
 *
 * This runs inside Deno edge functions and cannot import from src/.
 */

// ── Types ──────────────────────────────────────────────────────────

export type QualityStatus = 'pass' | 'warn' | 'reject';

export interface EdgeQualityGateResult {
  quality_status: QualityStatus;
  premium_eligible: boolean;
  quality_score: number;
  quality_rejection_codes: string[];
  quality_warnings: string[];
}

export interface EdgeQualityInput {
  width?: number | null;
  height?: number | null;
  model?: string | null;
  provider?: string | null;
  prompt_used?: string | null;
  subject_type?: string | null;
  asset_group?: string | null;
  shot_type?: string | null;
  generation_config?: Record<string, unknown> | null;
  location_ref?: string | null;
}

// ── Constants ─────────────────────────────────────────────────────

const PREMIUM_MODELS = new Set([
  'google/gemini-3-pro-image-preview',
  'google/gemini-3.1-flash-image-preview',
]);

const LEGACY_MODELS = new Set([
  'google/gemini-2.5-flash-image',
  'google/gemini-2.0-flash',
]);

const MIN_PRODUCTION_PIXELS = 600_000;
const MIN_PROMPT_DEPTH = 120;

const COMPOSITIONAL_SHOTS = new Set([
  'wide', 'tableau', 'close_up', 'medium', 'full_body',
  'atmospheric', 'detail', 'over_shoulder',
  'identity_headshot', 'identity_profile', 'identity_full_body',
]);

// ── Weights ───────────────────────────────────────────────────────

const WEIGHTS: Record<string, number> = {
  identity: 25,
  model: 20,
  resolution: 12,
  composition: 12,
  environment: 8,
  prompt: 5,
  scene_grounding: 18,
};

// ── Gate ───────────────────────────────────────────────────────────

/**
 * Compute quality gate result for an image being inserted.
 * Call this BEFORE insert into project_images and spread the result
 * into the insert payload.
 */
export function computeEdgeQualityGate(input: EdgeQualityInput): EdgeQualityGateResult {
  const rejections: string[] = [];
  const warnings: string[] = [];
  const verdicts: Record<string, 'pass' | 'warn' | 'reject'> = {};

  const gc = input.generation_config || {};
  const isHeroFrame = input.asset_group === 'hero_frame' || (gc.source_feature as string) === 'hero_frames_engine';
  const isCharacter = input.subject_type === 'character' || input.asset_group === 'character';

  // 1. Identity integrity — accepts honest provenance semantics
  //    Valid if: identity_locked=true OR identity_mode='anchors_injected' with evidence
  if (isCharacter) {
    const hasLegacyLock = !!gc.identity_locked;
    const hasProvenanceEvidence =
      gc.identity_mode === 'anchors_injected' &&
      typeof gc.identity_evidence_count === 'number' &&
      (gc.identity_evidence_count as number) > 0;
    if (!hasLegacyLock && !hasProvenanceEvidence) {
      rejections.push('identity_integrity');
      verdicts.identity = 'reject';
    } else {
      verdicts.identity = 'pass';
    }
  } else {
    verdicts.identity = 'pass';
  }

  // 2. Model provenance
  const model = input.model || (gc.model as string) || (gc.resolved_model as string) || null;
  if (!model) {
    rejections.push('model_provenance');
    verdicts.model = 'reject';
  } else if (LEGACY_MODELS.has(model)) {
    rejections.push('model_provenance');
    verdicts.model = 'reject';
  } else if (!PREMIUM_MODELS.has(model)) {
    rejections.push('model_provenance');
    verdicts.model = 'reject';
  } else {
    verdicts.model = 'pass';
  }

  // 3. Resolution
  const w = input.width ?? 0;
  const h = input.height ?? 0;
  if (w === 0 || h === 0) {
    warnings.push('Resolution unknown');
    verdicts.resolution = 'warn';
  } else if (w * h < MIN_PRODUCTION_PIXELS) {
    rejections.push('resolution');
    verdicts.resolution = 'reject';
  } else {
    verdicts.resolution = 'pass';
  }

  // 4. Cinematic composition
  if (w > 0 && h > 0) {
    const aspect = w / h;
    const isIdentityShot = input.shot_type?.startsWith('identity_');
    if (!isIdentityShot && (aspect < 0.5 || aspect > 3.0)) {
      rejections.push('cinematic_composition');
      verdicts.composition = 'reject';
    } else if (input.shot_type && !COMPOSITIONAL_SHOTS.has(input.shot_type)) {
      warnings.push(`Non-standard shot type: ${input.shot_type}`);
      verdicts.composition = 'warn';
    } else {
      verdicts.composition = 'pass';
    }
  } else {
    verdicts.composition = 'pass';
  }

  // 5. Environment coherence
  if (input.subject_type === 'location' || input.asset_group === 'world') {
    if (!input.location_ref && !gc.location_id && !gc.location_name) {
      warnings.push('Environment image lacks location binding');
      verdicts.environment = 'warn';
    } else {
      verdicts.environment = 'pass';
    }
  } else {
    verdicts.environment = 'pass';
  }

  // 6. Prompt depth
  const prompt = input.prompt_used || '';
  if (prompt.length === 0) {
    warnings.push('No prompt recorded');
    verdicts.prompt = 'warn';
  } else if (prompt.length < MIN_PROMPT_DEPTH) {
    warnings.push(`Shallow prompt (${prompt.length} chars)`);
    verdicts.prompt = 'warn';
  } else {
    verdicts.prompt = 'pass';
  }

  // 7. Scene grounding (MANDATORY for hero frames)
  if (isHeroFrame) {
    const hasSceneNumber = !!(gc.scene_number);
    const hasLocationKey = !!(gc.location_key || input.location_ref);
    
    if (!hasSceneNumber || !hasLocationKey) {
      rejections.push('scene_grounding');
      verdicts.scene_grounding = 'reject';
      if (!hasSceneNumber) warnings.push('Hero frame missing scene_number');
      if (!hasLocationKey) warnings.push('Hero frame missing location_key');
    } else if (!gc.pd_bound) {
      // Has scene + location but no PD dataset — warn, not reject
      // BUT: prevents premium eligibility (enforced below)
      warnings.push('Hero frame not bound to Production Design dataset — premium ineligible');
      verdicts.scene_grounding = 'warn';
    } else {
      verdicts.scene_grounding = 'pass';
    }
  } else {
    // Non-hero frames don't require scene grounding
    verdicts.scene_grounding = 'pass';
  }

  // Compute score
  let score = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const v = verdicts[key] || 'pass';
    if (v === 'pass') score += weight;
    else if (v === 'warn') score += weight * 0.5;
  }
  score = Math.round(score);

  // Overall status
  const quality_status: QualityStatus = rejections.length > 0
    ? 'reject'
    : warnings.length > 0
      ? 'warn'
      : 'pass';

  // Premium eligible = not rejected + model + identity + resolution pass
  // Hero frames ALSO require pd_bound for premium admission
  const premium_eligible =
    quality_status !== 'reject' &&
    verdicts.model === 'pass' &&
    verdicts.identity === 'pass' &&
    verdicts.resolution !== 'reject' &&
    // Hero frames require FULL scene grounding (pass, not warn) for premium
    // This means pd_bound must be true — warn (missing PD) blocks premium
    (!isHeroFrame || verdicts.scene_grounding === 'pass');

  return {
    quality_status,
    premium_eligible,
    quality_score: score,
    quality_rejection_codes: rejections,
    quality_warnings: warnings,
  };
}
