/**
 * Location Domain Processor — CPIE Phase 2A
 *
 * Consumes PCP -> CPIE Registry for deterministic location inference.
 * Pure function: same PCP context + same location entity = same location output.
 *
 * Architecture: PCP (period/region/climate/etc.) -> Registry -> Location Canon
 *
 * No LLM calls. No extraction logic. No context resolution.
 * LLM enhancement is limited to atmospheric_mood and acoustic_character.
 *
 * Ownership:
 *   Location Canon = permanent/inherent spatial truth
 *   Production Design = modifications for shoot
 *   Visual Language = how it is photographed
 */

import type { CPIEPCPContext, CPIEInference } from './types';
import { resolveLocation } from './registry';

export interface LocationInferenceOutput {
  entity_key: string;
  canonical_name: string;
  inferences: CPIEInference[];
  inference_count: number;
  generated_at: string;
}

export type LocationFunction =
  | 'residential' | 'commercial' | 'civic' | 'military'
  | 'industrial' | 'religious' | 'transportation' | 'hospitality'
  | 'agricultural' | 'wilderness' | 'public_realm';

export const LOCATION_FUNCTION_MAP: Record<string, LocationFunction> = {
  pub: 'hospitality', bar: 'hospitality', tavern: 'hospitality',
  inn: 'hospitality', hotel: 'hospitality', saloon: 'hospitality',
  cafe: 'hospitality', restaurant: 'hospitality',
  club: 'hospitality', lounge: 'hospitality',
  church: 'religious', cathedral: 'religious', temple: 'religious',
  mosque: 'religious', shrine: 'religious', monastery: 'religious',
  abbey: 'religious', chapel: 'religious',
  castle: 'military', fort: 'military', fortress: 'military',
  bunker: 'military', garrison: 'military', barracks: 'military',
  guard_post: 'military', armory: 'military',
  warehouse: 'industrial', factory: 'industrial', mill: 'industrial',
  forge: 'industrial', workshop: 'industrial', smelter: 'industrial',
  plant: 'industrial', refinery: 'industrial',
  house: 'residential', apartment: 'residential', manor: 'residential',
  cottage: 'residential', hut: 'residential', cabin: 'residential',
  mansion: 'residential', villa: 'residential',
  shop: 'commercial', store: 'commercial', market: 'commercial',
  office: 'commercial', bank: 'commercial',
  station: 'transportation', harbor: 'transportation', port: 'transportation',
  airport: 'transportation', dock: 'transportation', depot: 'transportation',
  terminal: 'transportation', hangar: 'transportation',
  hospital: 'civic', school: 'civic', library: 'civic',
  town_hall: 'civic', police_station: 'civic', courthouse: 'civic',
  embassy: 'civic', museum: 'civic', palace: 'civic',
  prison: 'civic', jail: 'civic',
  street: 'public_realm', square: 'public_realm', plaza: 'public_realm',
  park: 'public_realm', courtyard: 'public_realm', alley: 'public_realm',
  battlefield: 'public_realm', market_square: 'public_realm',
  farm: 'agricultural', barn: 'agricultural', stable: 'agricultural',
  ranch: 'agricultural', vineyard: 'agricultural',
  forest: 'wilderness', mountain: 'wilderness', desert: 'wilderness',
  cave: 'wilderness', ocean: 'wilderness', swamp: 'wilderness',
  jungle: 'wilderness', tundra: 'wilderness',
};

export function resolveFunction(locationName: string): LocationFunction {
  const key = locationName.toLowerCase().trim().split(/[\s_]+/).pop() || locationName.toLowerCase();
  return LOCATION_FUNCTION_MAP[key] ?? LOCATION_FUNCTION_MAP[locationName.toLowerCase()] ?? 'civic';
}

export function buildLocationContext(
  context: CPIEPCPContext,
  entity: { entity_key: string; canonical_name: string },
): CPIEPCPContext & { spatial_function: string } {
  return {
    ...context,
    spatial_function: resolveFunction(entity.canonical_name),
  };
}

export function inferLocation(
  context: CPIEPCPContext,
  entity: { entity_key: string; canonical_name: string },
): LocationInferenceOutput {
  const fn = resolveFunction(entity.canonical_name);
  const matched = resolveLocation(context, fn, {
    entity_key: entity.entity_key,
    canonical_name: entity.canonical_name,
  });

  return {
    entity_key: entity.entity_key,
    canonical_name: entity.canonical_name,
    inferences: Array.from(matched.values()),
    inference_count: matched.size,
    generated_at: new Date().toISOString(),
  };
}
