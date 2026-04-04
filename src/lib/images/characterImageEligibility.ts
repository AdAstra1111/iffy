/**
 * characterImageEligibility — Universal Character Identity Invariant Gate.
 *
 * SINGLE SOURCE OF TRUTH for determining whether an image depicting a bound
 * character is eligible for canonical selection flows (scoring, approval,
 * convergence, primary selection, export).
 *
 * This is a FAIL-CLOSED invariant (IEL Layer), NOT a scoring penalty.
 * Images that fail this gate MUST NOT enter any canonical pool.
 *
 * FAIL-CLOSED RULES:
 *   1. Non-character images with explicit non-character subject_type → pass
 *   2. Character images MUST have generation_config with identity_locked === true
 *   3. Null/empty generation_config on character images → BLOCKED (no legacy pass)
 *   4. Null/missing subject_type in character-bearing sections → BLOCKED
 *   5. Explicit gate failure or rejection → BLOCKED
 *
 * There is NO legacy_pass. Missing evidence = blocked.
 */

// ── Types ──────────────────────────────────────────────────────────

export type CharacterIdentityStatus = 'pass' | 'drift' | 'blocked_missing_evidence';

export interface CharacterEligibilityResult {
  eligible: boolean;
  status: CharacterIdentityStatus;
  reasons: string[];
}

export interface EligibilityFilterResult<T> {
  eligible: T[];
  drift: T[];
  blocked: T[];
  summary: {
    total: number;
    eligibleCount: number;
    driftCount: number;
    blockedCount: number;
    driftReasons: string[];
  };
}

// Minimal image shape required by the gate
export interface GateImageInput {
  id: string;
  subject_type?: string | null;
  subject?: string | null;
  generation_config?: Record<string, unknown> | null;
}

// ── Character-Bearing Section Policy ──────────────────────────────

/**
 * Canonical list of section keys that may contain character imagery.
 * Images in these sections MUST pass the identity gate if they depict characters.
 */
const CHARACTER_BEARING_SECTIONS = new Set([
  'hero_frames',
  'character_identity',
  'key_moments',
  'symbolic_motifs',
  'poster_directions',
]);

/**
 * Non-character subject types that are explicitly safe to pass without identity evidence.
 * If subject_type is NOT in this set and NOT 'character', the gate uses section context.
 */
const SAFE_NON_CHARACTER_TYPES = new Set([
  'location',
  'world',
  'environment',
  'texture',
  'atmosphere',
  'object',
  'prop',
]);

/**
 * Determine whether a section or image flow requires identity gating.
 * Used by consumers to decide whether to apply the gate.
 */
export function requiresCharacterIdentityGate(
  sectionKey: string | null,
  image: GateImageInput,
): boolean {
  // Explicit character → always gated
  if (image.subject_type === 'character') return true;

  // Explicit safe non-character type → never gated
  if (image.subject_type && SAFE_NON_CHARACTER_TYPES.has(image.subject_type)) return false;

  // In character-bearing sections, ambiguous subject_type → gated (fail-closed)
  if (sectionKey && CHARACTER_BEARING_SECTIONS.has(sectionKey)) {
    // If subject_type is null/undefined/unknown in a character-bearing section,
    // the image COULD depict a character. Gate applies.
    if (!image.subject_type) return true;
    // Unknown subject_type in character-bearing section → gated
    return true;
  }

  // Outside character-bearing sections with non-null non-character subject_type → not gated
  if (image.subject_type && image.subject_type !== 'character') return false;

  // Null subject_type outside character-bearing sections → not gated (non-character sections)
  return false;
}

// ── Core Gate ──────────────────────────────────────────────────────

/**
 * Classify a single image's character identity eligibility.
 * Deterministic, zero-network, metadata-only.
 *
 * FAIL-CLOSED: missing evidence → blocked.
 *
 * @param img - Image to classify
 * @param sectionKey - Optional section context for ambiguous subject_type handling
 */
export function classifyCharacterIdentity(
  img: GateImageInput,
  sectionKey?: string | null,
): CharacterEligibilityResult {
  // Determine if the gate applies
  const gateApplies = requiresCharacterIdentityGate(sectionKey ?? null, img);

  if (!gateApplies) {
    return { eligible: true, status: 'pass', reasons: [] };
  }

  // ── Gate applies: FAIL-CLOSED from here ──

  const gc = img.generation_config;
  const hasGc = gc != null && typeof gc === 'object' && Object.keys(gc).length > 0;

  // BLOCKED: no generation_config at all → missing evidence
  if (!hasGc) {
    console.warn('[IDENTITY_GATE_MISSING_EVIDENCE]', {
      image_id: img.id,
      character_key: img.subject,
      reason: 'No generation_config — cannot verify identity',
    });
    return {
      eligible: false,
      status: 'blocked_missing_evidence',
      reasons: ['No generation metadata — identity cannot be verified'],
    };
  }

  const gcObj = gc as Record<string, unknown>;
  const reasons: string[] = [];

  // Hard fail: explicit gate failure
  if (gcObj.actor_identity_gate_status === 'fail') {
    reasons.push('Failed actor identity gate');
  }

  // Hard fail: explicit gate rejection
  if (gcObj.gate_admitted === false) {
    reasons.push('Rejected by admission gate');
  }

  // Hard fail: identity not locked
  if (!gcObj.identity_locked) {
    reasons.push('Identity not locked during generation');
  }

  if (reasons.length > 0) {
    const status: CharacterIdentityStatus = reasons.some(r =>
      r.includes('Failed') || r.includes('Rejected')
    ) ? 'drift' : 'blocked_missing_evidence';

    console.warn('[IDENTITY_GATE_BLOCK]', {
      image_id: img.id,
      character_key: img.subject,
      status,
      reasons,
    });
    return { eligible: false, status, reasons };
  }

  return { eligible: true, status: 'pass', reasons: [] };
}

/**
 * Single boolean gate — the canonical check for all pipelines.
 * Fail-closed: if in doubt, returns false for character-bearing images.
 */
export function isCharacterImageEligible(
  img: GateImageInput,
  sectionKey?: string | null,
): boolean {
  return classifyCharacterIdentity(img, sectionKey).eligible;
}

// ── Batch Filter ──────────────────────────────────────────────────

/**
 * Filter an array of images, separating eligible from drift/blocked.
 * Works with any image type that extends the minimal gate shape.
 */
export function filterEligibleImages<T extends GateImageInput>(
  images: T[],
  sectionKey?: string | null,
): EligibilityFilterResult<T> {
  const eligible: T[] = [];
  const drift: T[] = [];
  const blocked: T[] = [];
  const allDriftReasons = new Set<string>();

  for (const img of images) {
    const result = classifyCharacterIdentity(img, sectionKey);
    if (result.eligible) {
      eligible.push(img);
    } else if (result.status === 'drift') {
      drift.push(img);
      for (const r of result.reasons) allDriftReasons.add(r);
    } else {
      blocked.push(img);
      for (const r of result.reasons) allDriftReasons.add(r);
    }
  }

  if (drift.length > 0 || blocked.length > 0) {
    console.warn('[IDENTITY_GATE_CONSUMER_AUDIT]', {
      sectionKey,
      total: images.length,
      eligible: eligible.length,
      drift: drift.length,
      blocked: blocked.length,
      reasons: Array.from(allDriftReasons),
    });
  }

  return {
    eligible,
    drift,
    blocked,
    summary: {
      total: images.length,
      eligibleCount: eligible.length,
      driftCount: drift.length,
      blockedCount: blocked.length,
      driftReasons: Array.from(allDriftReasons),
    },
  };
}

// ── IEL Mutation Guard ────────────────────────────────────────────

/**
 * IEL invariant guard — call before any approve/setPrimary mutation.
 * Throws if the image is character drift or missing identity evidence.
 */
export function assertCharacterImageEligible(
  img: GateImageInput,
  attemptedAction: string,
  sectionKey?: string | null,
): void {
  const result = classifyCharacterIdentity(img, sectionKey);
  if (!result.eligible) {
    const statusLabel = result.status === 'drift' ? 'Identity drift' : 'Missing identity evidence';
    const msg = `[IDENTITY_GATE_BLOCK] Cannot ${attemptedAction} image ${img.id} (${img.subject}): ${statusLabel} — ${result.reasons.join('; ')}`;
    console.error(msg);
    throw new Error(`${statusLabel}: cannot ${attemptedAction} — ${result.reasons.join('; ')}`);
  }
}
