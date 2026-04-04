/**
 * wardrobeProfileGuard.ts — Canonical placeholder/degraded profile detection.
 *
 * Deterministic, shared guard. Prevents silently accepting generic
 * wardrobe profiles as valid canonical data.
 */

import type { CharacterWardrobeProfile } from './characterWardrobeExtractor';

const PLACEHOLDER_PATTERNS = [
  /\bundetermined\b/i,
  /\bunspecified\b/i,
  /\bgeneric garments\b/i,
  /\bunknown\b/i,
];

const TRIVIAL_FABRICS = new Set(['woven', 'cotton, linen — class-appropriate', 'cotton, wool, linen — setting-appropriate']);

/** Patterns that indicate world-context resolution (not placeholder) */
const CONTEXT_RESOLVED_PATTERNS = [
  /\b\w+-era contextual\b/i,
  /\bcontextual\b.*\bgarments\b/i,
  /\bworld-inferred\b/i,
  /\b(medieval|feudal|victorian|renaissance|ancient|modern|contemporary|futuristic|western|noir)-appropriate\b/i,
];

export interface WardrobeProfileValidation {
  valid: boolean;
  degraded: boolean;
  reasons: string[];
}

/**
 * Check whether a wardrobe profile is degraded/placeholder.
 * Fail-closed: if any critical field is placeholder, the profile is degraded.
 */
export function validateWardrobeProfile(
  profile: CharacterWardrobeProfile | null | undefined,
): WardrobeProfileValidation {
  if (!profile) {
    return { valid: false, degraded: true, reasons: ['No wardrobe profile exists'] };
  }

  const reasons: string[] = [];

  // Check identity summary for placeholder text
  // But skip if the summary contains world-context resolution markers
  const summary = profile.wardrobe_identity_summary || '';
  const isContextResolved = CONTEXT_RESOLVED_PATTERNS.some(p => p.test(summary));

  if (!isContextResolved) {
    for (const pat of PLACEHOLDER_PATTERNS) {
      if (pat.test(summary)) {
        reasons.push(`Identity summary contains placeholder text: "${summary}"`);
        break;
      }
    }
  }

  // Check garments
  if (!profile.signature_garments || profile.signature_garments.length === 0) {
    reasons.push('No signature garments extracted');
  }

  // Check fabric language
  const fabric = profile.fabric_language || '';
  if (!fabric || TRIVIAL_FABRICS.has(fabric.trim())) {
    reasons.push(`Fabric language is trivial or missing: "${fabric}"`);
  }

  // Check confidence
  if (profile.confidence === 'low') {
    reasons.push('Extraction confidence is low');
  }

  const degraded = reasons.length > 0;
  return { valid: !degraded, degraded, reasons };
}

/**
 * Human-readable block reason for a degraded wardrobe profile.
 */
export function getDegradedProfileReason(validation: WardrobeProfileValidation): string {
  if (validation.valid) return '';
  return validation.reasons[0] || 'Wardrobe profile is degraded';
}
