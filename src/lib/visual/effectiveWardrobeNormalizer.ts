/**
 * effectiveWardrobeNormalizer.ts — Single canonical garment exclusion enforcement.
 *
 * AUTHORITY: VISUAL_AUTHORITIES.WARDROBE_NORMALIZER_INTERNAL
 * This is an INTERNAL primitive. External consumers MUST use:
 *   - resolveEffectiveProfile() for profile-level resolution
 *   - resolveStateWardrobe() for state-level resolution
 *
 * CROSS-RUNTIME PARITY: supabase/functions/_shared/effectiveWardrobeNormalizer.ts
 * is the edge mirror. Both files MUST enforce identical exclusion logic:
 *   - Scene-explicit garments do NOT bypass temporal exclusion
 *   - Forbidden garments are excluded regardless of provenance
 *
 * IEL: No duplicate filtering logic. All garment exclusion flows through here.
 */

import type { TemporalTruth } from './temporalTruthResolver';

// ── Types ────────────────────────────────────────────────────────────────────

export interface GarmentExclusion {
  item: string;
  reason: 'temporal_forbidden' | 'contradiction_demoted' | 'world_default_overridden';
  detail: string;
}

export interface NormalizedWardrobe {
  /** Effective garments after exclusions */
  garments: string[];
  /** Effective accessories after exclusions */
  accessories: string[];
  /** Items removed with provenance */
  exclusions: GarmentExclusion[];
  /** Whether any items were removed */
  wasNormalized: boolean;
}

export interface NormalizeInput {
  garments: string[];
  accessories?: string[];
  /**
   * Scene-explicit garments — tracked for provenance only.
   * IMPORTANT: Scene evidence does NOT bypass temporal exclusion.
   * Forbidden garments from scenes are excluded and surfaced as contradictions.
   */
  sceneExplicitGarments?: string[];
}

// ── Core Normalizer ─────────────────────────────────────────────────────────

/**
 * Normalize a garment list against canonical temporal truth.
 *
 * Rules:
 * 1. Items in temporalTruth.forbidden_garment_families are excluded
 * 2. Items explicitly backed by scene evidence are EXEMPT from exclusion
 * 3. Exclusions are tracked with provenance for diagnostics
 * 4. If all garments would be excluded, retain the least-forbidden or return empty
 */
export function normalizeWardrobe(
  input: NormalizeInput,
  temporalTruth: TemporalTruth | null | undefined,
): NormalizedWardrobe {
  if (!temporalTruth || temporalTruth.forbidden_garment_families.length === 0) {
    return {
      garments: [...input.garments],
      accessories: [...(input.accessories || [])],
      exclusions: [],
      wasNormalized: false,
    };
  }

  // Only enforce when confidence is medium+ to avoid false positives
  if (temporalTruth.confidence === 'low') {
    return {
      garments: [...input.garments],
      accessories: [...(input.accessories || [])],
      exclusions: [],
      wasNormalized: false,
    };
  }

  const forbiddenSet = new Set(
    temporalTruth.forbidden_garment_families.map(g => g.toLowerCase()),
  );
  const sceneExplicitSet = new Set(
    (input.sceneExplicitGarments || []).map(g => g.toLowerCase()),
  );

  const exclusions: GarmentExclusion[] = [];
  const effectiveGarments: string[] = [];

  for (const g of input.garments) {
    const lower = g.toLowerCase();
    if (forbiddenSet.has(lower)) {
      // Scene evidence does NOT bypass temporal exclusion.
      // Forbidden garments are excluded regardless of provenance.
      // Scene-derived forbidden items are surfaced as contradictions for diagnostics.
      const isSceneDerived = sceneExplicitSet.has(lower);
      exclusions.push({
        item: g,
        reason: isSceneDerived ? 'contradiction_demoted' : 'temporal_forbidden',
        detail: isSceneDerived
          ? `"${g}" excluded — scene evidence contradicts ${temporalTruth.label} era truth`
          : `"${g}" excluded — inappropriate for ${temporalTruth.label} (${temporalTruth.family} era)`,
      });
    } else {
      effectiveGarments.push(g);
    }
  }

  // Accessories: also filter but less aggressively (only clear garment-type items)
  const effectiveAccessories = [...(input.accessories || [])];

  return {
    garments: effectiveGarments,
    accessories: effectiveAccessories,
    exclusions,
    wasNormalized: exclusions.length > 0,
  };
}

/**
 * Normalize a wardrobe identity summary string by removing forbidden garment names.
 * Used for display of baseline identity.
 */
export function normalizeIdentitySummary(
  summary: string,
  temporalTruth: TemporalTruth | null | undefined,
): { normalized: string; removedItems: string[] } {
  if (!temporalTruth || temporalTruth.confidence === 'low' || temporalTruth.forbidden_garment_families.length === 0) {
    return { normalized: summary, removedItems: [] };
  }

  const removedItems: string[] = [];
  let result = summary;

  for (const forbidden of temporalTruth.forbidden_garment_families) {
    const re = new RegExp(`\\b${escapeRegex(forbidden)}\\b`, 'gi');
    if (re.test(result)) {
      removedItems.push(forbidden);
      // Remove the word and any trailing comma/space
      result = result.replace(new RegExp(`\\s*,?\\s*\\b${escapeRegex(forbidden)}\\b\\s*,?\\s*`, 'gi'), ' ');
    }
  }

  // Clean up double commas, leading/trailing commas, extra spaces
  result = result.replace(/,\s*,/g, ',').replace(/—\s*,/g, '—').replace(/,\s*$/g, '').replace(/^\s*,/g, '').replace(/\s{2,}/g, ' ').trim();

  return { normalized: result, removedItems };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
