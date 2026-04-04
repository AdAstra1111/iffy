/**
 * effectiveWardrobeNormalizer.ts — Shared runtime-safe garment exclusion enforcement.
 *
 * This is the edge/Deno-compatible mirror of `src/lib/visual/effectiveWardrobeNormalizer.ts`.
 * Both files share identical pure logic; this copy avoids "@/" alias and DOM dependencies.
 *
 * IEL: All edge/server wardrobe consumers MUST pass garment lists through this normalizer.
 * No duplicate filtering logic — if the core algorithm changes, update both files.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface TemporalTruthLike {
  era: string;
  family: string;
  label: string;
  confidence: string; // 'high' | 'medium' | 'low'
  forbidden_garment_families: string[];
  era_garments?: string[];
}

export interface GarmentExclusion {
  item: string;
  reason: 'temporal_forbidden' | 'contradiction_demoted' | 'world_default_overridden';
  detail: string;
}

export interface NormalizedWardrobe {
  garments: string[];
  accessories: string[];
  exclusions: GarmentExclusion[];
  wasNormalized: boolean;
}

export interface NormalizeInput {
  garments: string[];
  accessories?: string[];
  sceneExplicitGarments?: string[];
}

// ── Core Normalizer ─────────────────────────────────────────────────────────

export function normalizeWardrobe(
  input: NormalizeInput,
  temporalTruth: TemporalTruthLike | null | undefined,
): NormalizedWardrobe {
  if (!temporalTruth || temporalTruth.forbidden_garment_families.length === 0) {
    return {
      garments: [...input.garments],
      accessories: [...(input.accessories || [])],
      exclusions: [],
      wasNormalized: false,
    };
  }

  if (temporalTruth.confidence === 'low') {
    return {
      garments: [...input.garments],
      accessories: [...(input.accessories || [])],
      exclusions: [],
      wasNormalized: false,
    };
  }

  const forbiddenSet = new Set(
    temporalTruth.forbidden_garment_families.map((g: string) => g.toLowerCase()),
  );
  const sceneExplicitSet = new Set(
    (input.sceneExplicitGarments || []).map((g: string) => g.toLowerCase()),
  );

  const exclusions: GarmentExclusion[] = [];
  const effectiveGarments: string[] = [];

  for (const g of input.garments) {
    const lower = g.toLowerCase();
    if (forbiddenSet.has(lower)) {
      // IEL: Scene-explicit garments do NOT bypass temporal exclusion.
      // Scene provenance is diagnostic evidence, not permission.
      // Parity: must match src/lib/visual/effectiveWardrobeNormalizer.ts exactly.
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

  return {
    garments: effectiveGarments,
    accessories: [...(input.accessories || [])],
    exclusions,
    wasNormalized: exclusions.length > 0,
  };
}

// ── Identity summary normalizer ─────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeIdentitySummary(
  summary: string,
  temporalTruth: TemporalTruthLike | null | undefined,
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
      result = result.replace(new RegExp(`\\s*,?\\s*\\b${escapeRegex(forbidden)}\\b\\s*,?\\s*`, 'gi'), ' ');
    }
  }

  result = result.replace(/,\s*,/g, ',').replace(/—\s*,/g, '—').replace(/,\s*$/g, '').replace(/^\s*,/g, '').replace(/\s{2,}/g, ' ').trim();

  return { normalized: result, removedItems };
}

// ── Effective Profile Resolver ──────────────────────────────────────────────

export interface EffectiveWardrobeResult {
  effective_signature_garments: string[];
  effective_identity_summary: string;
  excluded_garments: GarmentExclusion[];
  was_temporally_normalized: boolean;
  normalization_reasons: string[];
}

/**
 * Resolve effective wardrobe from a raw profile + temporal truth.
 * Pure function, no runtime dependencies.
 */
export function resolveEffectiveWardrobe(
  profile: {
    signature_garments?: string[];
    signature_accessories?: string[];
    wardrobe_identity_summary?: string;
  },
  temporalTruth: TemporalTruthLike | null | undefined,
  sceneExplicitGarments?: string[],
): EffectiveWardrobeResult {
  const garmentResult = normalizeWardrobe(
    {
      garments: profile.signature_garments || [],
      accessories: profile.signature_accessories || [],
      sceneExplicitGarments,
    },
    temporalTruth,
  );

  const summaryResult = normalizeIdentitySummary(
    profile.wardrobe_identity_summary || '',
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
    effective_signature_garments: garmentResult.garments,
    effective_identity_summary: summaryResult.normalized,
    excluded_garments: garmentResult.exclusions,
    was_temporally_normalized: garmentResult.wasNormalized || summaryResult.removedItems.length > 0,
    normalization_reasons: normalizationReasons,
  };
}

/**
 * Resolve canonical temporal truth from canon JSON.
 * Lightweight edge-safe resolver that reads persisted temporal truth
 * from canon_json.canonical_temporal_truth (set by the client hook).
 */
export function resolveTemporalTruthFromCanon(
  canonJson: Record<string, any> | null | undefined,
): TemporalTruthLike | null {
  if (!canonJson) return null;

  // 1. Prefer persisted canonical temporal truth
  const persisted = canonJson.canonical_temporal_truth;
  if (persisted && persisted.era && persisted.forbidden_garment_families) {
    return persisted as TemporalTruthLike;
  }

  // 2. Lightweight fallback: derive from canon fields if temporal truth not yet persisted
  const era = canonJson.era || canonJson.period || canonJson.time_period || '';
  if (!era) return null;

  const eraLower = era.toLowerCase();
  const modernSignals = ['contemporary', 'modern', 'present', '21st', '20th', 'current'];
  const isModern = modernSignals.some((s: string) => eraLower.includes(s));

  if (isModern) {
    return {
      era: 'contemporary',
      family: 'modern',
      label: `Contemporary (from canon: "${era}")`,
      confidence: 'medium',
      forbidden_garment_families: ['tunic', 'cloak', 'robe', 'kimono', 'toga', 'tabard', 'doublet', 'bodice', 'corset', 'gown', 'cape'],
    };
  }

  const historicalSignals = ['medieval', 'feudal', 'ancient', 'renaissance', 'victorian'];
  const isHistorical = historicalSignals.some((s: string) => eraLower.includes(s));

  if (isHistorical) {
    return {
      era: eraLower.includes('medieval') ? 'medieval' : 'feudal',
      family: 'historical',
      label: `Historical (from canon: "${era}")`,
      confidence: 'medium',
      forbidden_garment_families: ['hoodie', 'sneakers', 'jeans', 't-shirt', 'tracksuit', 'bomber jacket'],
    };
  }

  return null;
}
