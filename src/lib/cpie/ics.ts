/**
 * ICS — Inference Coverage Score v1
 *
 * Measures what percentage of plausible fields are filled per domain.
 * Used by governance diagnostics to track inference quality.
 */
import type { CPIEInference, CPIEDomain } from './types';

/** Total plausible fields per domain (schema-defined) */
const DOMAIN_FIELD_COUNTS: Record<string, number> = {
  wardrobe: 10,  // primary_outfit, footwear, headwear, outerwear, silhouette,
                  // dominant_colors, fabric_texture, key_pieces, accessories, production_complexity
  prop: 8,        // primary_prop, secondary_prop, communication, utility, weapon,
                  // container, lighting, tech_carry
  vehicle: 8,     // primary_vehicle, heavy_vehicle, light_vehicle, armored_vehicle,
                  // medical_vehicle, specialized_vehicle, transport_function, geography_context
  creature: 10,   // creature_type, species, role, behavior, size,
                  // habitat, diet, intelligence_level, magical_properties, narrative_function
  location: 12,   // architecture, era, lighting, sensory, dressing, etc.
  pd: 8,          // production_design elements
  vl: 8,          // visual_language elements
};

export interface ICSResult {
  domain: CPIEDomain;
  total_possible_fields: number;
  inferred_count: number;
  inferred_pct: number;
  extracted_count: number;
  user_supplied_count: number;
  ics: number;          // (inferred + extracted + user_supplied) / total_possible_fields
  breakdown: {
    inferred_pct: number;
    extracted_pct: number;
    user_supplied_pct: number;
    empty_pct: number;
  };
}

/**
 * Calculate ICS for a set of inferences in a domain.
 *
 * @param inferences — Array of CPIEInference objects
 * @param domain — Domain to calculate for
 * @returns ICSResult with breakdown
 */
export function calculateICS(
  inferences: CPIEInference[],
  domain: string,
): number {
  const totalFields = DOMAIN_FIELD_COUNTS[domain] ?? 10;
  if (totalFields <= 0) return 0;

  const filledCount = inferences.filter(i =>
    i.source_type === 'inferred'
  ).length;

  const ics = Math.min(filledCount / totalFields, 1.0);
  return Math.round(ics * 100) / 100;
}

/**
 * Calculate full ICS breakdown for a domain.
 */
export function calculateICSBreakdown(
  domain: CPIEDomain,
  inferences: CPIEInference[],
  extractions?: number,
  userSupplied?: number,
): ICSResult {
  const totalFields = DOMAIN_FIELD_COUNTS[domain] ?? 10;
  if (totalFields <= 0) {
    return {
      domain,
      total_possible_fields: totalFields,
      inferred_count: 0,
      inferred_pct: 0,
      extracted_count: 0,
      user_supplied_count: 0,
      ics: 0,
      breakdown: { inferred_pct: 0, extracted_pct: 0, user_supplied_pct: 0, empty_pct: 1 },
    };
  }

  const inferredCount = inferences.filter(i => i.source_type === 'inferred').length;
  const extractedCount = extractions ?? 0;
  const userCount = userSupplied ?? 0;

  const fillCount = Math.min(inferredCount + extractedCount + userCount, totalFields);
  const ics = Math.round((fillCount / totalFields) * 100) / 100;

  return {
    domain,
    total_possible_fields: totalFields,
    inferred_count: inferredCount,
    inferred_pct: Math.round((inferredCount / totalFields) * 10000) / 100,
    extracted_count: extractedCount,
    user_supplied_count: userCount,
    ics,
    breakdown: {
      inferred_pct: Math.round((inferredCount / totalFields) * 10000) / 100,
      extracted_pct: Math.round((extractedCount / totalFields) * 10000) / 100,
      user_supplied_pct: Math.round((userCount / totalFields) * 10000) / 100,
      empty_pct: Math.round(((totalFields - fillCount) / totalFields) * 10000) / 100,
    },
  };
}

/** Get the maximum possible fields for a domain */
export function getTotalPossibleFields(domain: string): number {
  return DOMAIN_FIELD_COUNTS[domain] ?? 10;
}
