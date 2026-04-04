/**
 * effectiveProfileResolver.ts — Single canonical effective wardrobe profile.
 *
 * AUTHORITY: VISUAL_AUTHORITIES.EFFECTIVE_PROFILE
 * This is the ONLY correct public entrypoint for profile-level wardrobe resolution.
 * All wardrobe consumers MUST use resolveEffectiveProfile() or resolveEffectiveProfileOrNull()
 * instead of reading profile.signature_garments directly.
 *
 * Wraps effectiveWardrobeNormalizer (internal primitive) — no duplicate logic.
 * Edge parity: _shared/effectiveWardrobeNormalizer.ts → resolveEffectiveWardrobe()
 *
 * IEL: No bypass. No raw reads in active display/prompt paths.
 */

import type { CharacterWardrobeProfile } from './characterWardrobeExtractor';
import type { TemporalTruth } from './temporalTruthResolver';
import { normalizeWardrobe, normalizeIdentitySummary, type GarmentExclusion } from './effectiveWardrobeNormalizer';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EffectiveWardrobeProfile extends CharacterWardrobeProfile {
  /** Effective garments after temporal exclusion (replaces raw signature_garments for consumption) */
  effective_signature_garments: string[];
  /** Garments excluded by temporal/era truth with provenance */
  excluded_garments: GarmentExclusion[];
  /** Normalized identity summary (forbidden garment names removed) */
  effective_identity_summary: string;
  /** Whether any normalization was applied */
  was_temporally_normalized: boolean;
  /** Human-readable normalization reasons */
  normalization_reasons: string[];
}

// ── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve an effective wardrobe profile from a raw extracted profile.
 *
 * This applies canonical temporal truth to:
 * 1. signature_garments → effective_signature_garments (excluded items removed)
 * 2. wardrobe_identity_summary → effective_identity_summary (forbidden names stripped)
 *
 * The returned object extends the original profile (all fields preserved for diagnostics)
 * but downstream consumers MUST read effective_signature_garments and effective_identity_summary.
 *
 * Scene-explicit garments can be passed to bypass temporal exclusion.
 */
export function resolveEffectiveProfile(
  profile: CharacterWardrobeProfile,
  temporalTruth: TemporalTruth | null | undefined,
  sceneExplicitGarments?: string[],
): EffectiveWardrobeProfile {
  // Normalize garments
  const garmentResult = normalizeWardrobe(
    {
      garments: profile.signature_garments,
      accessories: profile.signature_accessories,
      sceneExplicitGarments,
    },
    temporalTruth,
  );

  // Normalize identity summary
  const summaryResult = normalizeIdentitySummary(
    profile.wardrobe_identity_summary,
    temporalTruth,
  );

  const normalizationReasons: string[] = [];
  if (garmentResult.wasNormalized) {
    for (const ex of garmentResult.exclusions) {
      normalizationReasons.push(ex.detail);
    }
  }
  if (summaryResult.removedItems.length > 0) {
    normalizationReasons.push(
      `Identity summary corrected: removed ${summaryResult.removedItems.join(', ')}`,
    );
  }

  return {
    ...profile,
    // Override signature_garments with effective list so accidental raw reads are also clean
    signature_garments: garmentResult.garments,
    effective_signature_garments: garmentResult.garments,
    excluded_garments: garmentResult.exclusions,
    effective_identity_summary: summaryResult.normalized,
    was_temporally_normalized: garmentResult.wasNormalized || summaryResult.removedItems.length > 0,
    normalization_reasons: normalizationReasons,
  };
}

/**
 * Convenience: resolve effective profile or return null if no profile exists.
 */
export function resolveEffectiveProfileOrNull(
  profile: CharacterWardrobeProfile | null | undefined,
  temporalTruth: TemporalTruth | null | undefined,
  sceneExplicitGarments?: string[],
): EffectiveWardrobeProfile | null {
  if (!profile) return null;
  return resolveEffectiveProfile(profile, temporalTruth, sceneExplicitGarments);
}
