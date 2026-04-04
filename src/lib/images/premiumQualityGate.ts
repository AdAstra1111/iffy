/**
 * premiumQualityGate — Canonical PRIMARY eligibility + premium-active quality governance.
 *
 * Sits ABOVE the character identity gate (characterImageEligibility.ts).
 * Identity gate = "is this the right person?"
 * Premium gate  = "is this good enough for premium-facing surfaces?"
 *
 * This is a FAIL-CLOSED invariant for primary candidacy.
 * Premium-active classification is advisory but enforced at admission boundaries.
 *
 * APPROVED PREMIUM REGIMES (from imageGenerationResolver.ts):
 *   - Provider: 'lovable-ai'
 *   - Models (premium tier): 'google/gemini-3-pro-image-preview'
 *   - Models (standard tier): 'google/gemini-3.1-flash-image-preview'
 *   - Models (fast/legacy): 'google/gemini-2.5-flash-image' — NOT premium eligible
 *
 * PREMIUM-FACING SURFACES:
 *   - hero_frames
 *   - poster_directions
 *   - lookbook cover / character_identity primary
 */

import { isCharacterImageEligible, type GateImageInput } from './characterImageEligibility';

// ── Types ──────────────────────────────────────────────────────────

export type PremiumQualityStatus = 'premium_pass' | 'premium_warn' | 'premium_fail';

export interface PremiumQualityResult {
  status: PremiumQualityStatus;
  reasons: string[];
  provider: string | null;
  model: string | null;
}

export type PrimaryEligibilityStatus = 'eligible' | 'blocked_identity' | 'blocked_quality' | 'blocked_missing_metadata';

export interface PrimaryEligibilityResult {
  eligible: boolean;
  status: PrimaryEligibilityStatus;
  reasons: string[];
  premiumQuality: PremiumQualityResult;
}

// ── Approved Render Regimes ────────────────────────────────────────

/** Models approved for premium-facing primary candidacy */
const PREMIUM_APPROVED_MODELS = new Set([
  'google/gemini-3-pro-image-preview',
  'google/gemini-3.1-flash-image-preview',
]);

/** Models that are fast/legacy — not premium eligible */
const LEGACY_FAST_MODELS = new Set([
  'google/gemini-2.5-flash-image',
  'google/gemini-2.0-flash',
]);

/** Premium-facing sections that enforce quality governance */
const PREMIUM_SECTIONS = new Set([
  'hero_frames',
  'poster_directions',
]);

/** Minimum resolution for premium-facing primary images (width * height) */
const PREMIUM_MIN_PIXELS = 800_000; // ~1024x800

/** Minimum acceptable aspect ratio for landscape-required premium surfaces */
const PREMIUM_MIN_ASPECT_LANDSCAPE = 1.3;

// ── Premium Quality Classifier ─────────────────────────────────────

export interface QualityGateImageInput extends GateImageInput {
  width?: number | null;
  height?: number | null;
  generation_config?: Record<string, unknown> | null;
  asset_group?: string | null;
  generation_purpose?: string | null;
  strategy_key?: string | null;
  prestige_style?: string | null;
}

/**
 * Classify an image's premium quality status.
 * Deterministic, metadata-only, zero-network.
 */
export function classifyPremiumImageQuality(img: QualityGateImageInput): PremiumQualityResult {
  const gc = (img.generation_config || {}) as Record<string, unknown>;
  const provider = (gc.provider || gc.resolved_provider || null) as string | null;
  const model = (gc.model || gc.resolved_model || null) as string | null;
  const reasons: string[] = [];

  // Model provenance check — FAIL-CLOSED for premium surfaces
  if (!model) {
    reasons.push('No model provenance — cannot verify quality regime');
    return { status: 'premium_fail', reasons, provider, model };
  }

  if (LEGACY_FAST_MODELS.has(model)) {
    reasons.push(`Legacy/fast model (${model}) — below premium quality floor`);
    return { status: 'premium_fail', reasons, provider, model };
  }

  if (!PREMIUM_APPROVED_MODELS.has(model)) {
    reasons.push(`Unknown model (${model}) — not in approved premium regime`);
    return { status: 'premium_fail', reasons, provider, model };
  }

  // Resolution check
  const w = img.width ?? 0;
  const h = img.height ?? 0;
  if (w > 0 && h > 0) {
    const pixels = w * h;
    if (pixels < PREMIUM_MIN_PIXELS) {
      reasons.push(`Resolution too low (${w}×${h} = ${pixels}px, min ${PREMIUM_MIN_PIXELS}px)`);
    }
  }

  // Determine status
  if (reasons.some(r => r.includes('below premium quality floor'))) {
    return { status: 'premium_fail', reasons, provider, model };
  }
  if (reasons.length > 0) {
    return { status: 'premium_warn', reasons, provider, model };
  }
  return { status: 'premium_pass', reasons: [], provider, model };
}

// ── Primary Eligibility Gate ───────────────────────────────────────

/**
 * Canonical primary eligibility gate — stricter than active admission.
 * A PRIMARY image must pass:
 *   1. Character identity gate (where applicable)
 *   2. Premium quality floor
 *   3. Minimum metadata requirements
 *
 * FAIL-CLOSED: missing evidence → blocked.
 */
export function classifyPrimaryEligibility(
  img: QualityGateImageInput,
  sectionKey: string | null,
): PrimaryEligibilityResult {
  const premiumQuality = classifyPremiumImageQuality(img);
  const isPremiumSection = sectionKey ? PREMIUM_SECTIONS.has(sectionKey) : false;

  // 1. Identity gate (fail-closed for character-bearing images)
  if (!isCharacterImageEligible(img, sectionKey)) {
    return {
      eligible: false,
      status: 'blocked_identity',
      reasons: ['Failed character identity gate — cannot be primary'],
      premiumQuality,
    };
  }

  // 2. Premium quality gate for premium-facing sections
  if (isPremiumSection && premiumQuality.status === 'premium_fail') {
    return {
      eligible: false,
      status: 'blocked_quality',
      reasons: [`Premium quality floor not met: ${premiumQuality.reasons.join('; ')}`],
      premiumQuality,
    };
  }

  // 3. Aspect ratio gate for landscape-required premium sections
  if (isPremiumSection && img.width && img.height) {
    const aspect = img.width / img.height;
    if (aspect < PREMIUM_MIN_ASPECT_LANDSCAPE) {
      return {
        eligible: false,
        status: 'blocked_quality',
        reasons: [`Aspect ratio ${aspect.toFixed(2)} below landscape minimum (${PREMIUM_MIN_ASPECT_LANDSCAPE}) for premium surface`],
        premiumQuality,
      };
    }
  }

  return {
    eligible: true,
    status: 'eligible',
    reasons: [],
    premiumQuality,
  };
}

/**
 * Boolean convenience — is this image eligible to be PRIMARY in a section?
 */
export function isPrimaryEligibleImage(
  img: QualityGateImageInput,
  sectionKey: string | null,
): boolean {
  return classifyPrimaryEligibility(img, sectionKey).eligible;
}

/**
 * IEL mutation guard — throws if image cannot be set as primary.
 * Call before any setPrimary mutation.
 */
export function assertPrimaryEligible(
  img: QualityGateImageInput,
  sectionKey: string | null,
): void {
  const result = classifyPrimaryEligibility(img, sectionKey);
  if (!result.eligible) {
    const msg = `[PRIMARY_GATE_BLOCK] Cannot set primary: ${result.reasons.join('; ')}`;
    console.error(msg, { image_id: img.id, sectionKey, status: result.status });
    throw new Error(`Cannot set as primary: ${result.reasons.join('; ')}`);
  }
}

// ── Premium Active Admission Filter ────────────────────────────────

/**
 * Filter images for premium-active admission in a section.
 * Returns only images that pass the premium quality floor.
 * Non-premium sections pass all images through unchanged.
 */
export function filterPremiumActiveImages<T extends QualityGateImageInput>(
  images: T[],
  sectionKey: string | null,
): { admitted: T[]; excluded: T[]; isFiltered: boolean } {
  const isPremiumSection = sectionKey ? PREMIUM_SECTIONS.has(sectionKey) : false;
  if (!isPremiumSection) {
    return { admitted: images, excluded: [], isFiltered: false };
  }

  const admitted: T[] = [];
  const excluded: T[] = [];

  for (const img of images) {
    const quality = classifyPremiumImageQuality(img);
    if (quality.status === 'premium_fail') {
      console.warn('[PREMIUM_ACTIVE_EXCLUDE]', {
        image_id: img.id,
        model: quality.model,
        reasons: quality.reasons,
      });
      excluded.push(img);
    } else {
      admitted.push(img);
    }
  }

  return { admitted, excluded, isFiltered: true };
}

/**
 * Check if a section is premium-facing.
 */
export function isPremiumSection(sectionKey: string): boolean {
  return PREMIUM_SECTIONS.has(sectionKey);
}
