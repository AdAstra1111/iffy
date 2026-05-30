/**
 * Vehicle Domain Processor — CPIE Phase 1B.2
 *
 * Consumes PCP -> CPIE Registry for deterministic vehicle inference.
 * Pure function: same PCP context + same profession/entity = same vehicle output.
 * Includes transport function layer that maps profession to vehicle role.
 *
 * No LLM calls. No extraction logic. No context resolution.
 * AtomiserRepository handles persistence; this handles inference.
 */
import type { CPIEPCPContext, CPIEInference } from './types';
import { resolveVehicle } from './registry';

export interface VehicleInferenceOutput {
  entity_key: string;
  canonical_name: string;
  inferences: CPIEInference[];
  inference_count: number;
  generated_at: string;
}

/**
 * Transport Function Layer — Maps profession to vehicle role.
 *
 * Determines whether a vehicle is military, civilian, or utility transport
 * based on the entity's profession and institutional affiliation.
 */
export type TransportFunction = 'military' | 'civilian_transport' | 'civilian_utility' | 'emergency_services' | 'commercial' | 'none';

const PROFESSION_TRANSPORT_MAP: Record<string, TransportFunction> = {
  soldier: 'military',
  marine: 'military',
  general: 'military',
  commander: 'military',
  officer: 'military',
  spy: 'military',
  pilot: 'military',
  'special forces': 'military',
  police: 'emergency_services',
  paramedic: 'emergency_services',
  firefighter: 'emergency_services',
  detective: 'civilian_transport',
  fbi: 'emergency_services',
  courier: 'commercial',
  messenger: 'commercial',
  delivery: 'commercial',
  trucker: 'commercial',
  taxi: 'commercial',
  driver: 'commercial',
  farmer: 'civilian_utility',
  rancher: 'civilian_utility',
  construction: 'civilian_utility',
  mechanic: 'civilian_utility',
  engineer: 'civilian_utility',
  worker: 'civilian_utility',
  doctor: 'civilian_transport',
  nurse: 'civilian_transport',
  professor: 'civilian_transport',
  teacher: 'civilian_transport',
  knight: 'military',
  king: 'civilian_transport',
  queen: 'civilian_transport',
  prince: 'civilian_transport',
  noble: 'civilian_transport',
  lord: 'civilian_transport',
  lady: 'civilian_transport',
};

export function resolveTransportFunction(profession: string): TransportFunction {
  const key = profession.toLowerCase().trim();
  return PROFESSION_TRANSPORT_MAP[key] ?? 'civilian_transport';
}

/**
 * Run vehicle inference for a single entity.
 *
 * @param context — The PCP context (READ-ONLY, from src/lib/pcp/)
 * @param entity — Entity identity (from narrative extraction)
 * @returns Structured vehicle inference output with provenance
 */
export function inferVehicle(
  context: CPIEPCPContext,
  entity: { entity_key: string; canonical_name: string; profession?: string; role_archetype?: string },
): VehicleInferenceOutput {
  const tf = resolveTransportFunction(entity.profession ?? '');
  const matched = resolveVehicle(context, tf, {
    entity_key: entity.entity_key,
    canonical_name: entity.canonical_name,
    profession: entity.profession,
    role_archetype: entity.role_archetype,
  });

  return {
    entity_key: entity.entity_key,
    canonical_name: entity.canonical_name,
    inferences: Array.from(matched.values()),
    inference_count: matched.size,
    generated_at: new Date().toISOString(),
  };
}
