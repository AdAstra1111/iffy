/**
 * CPIE Inference Engine — Orchestrates registry lookups across domains.
 *
 * Entry point for all Phase 1 inference.
 * Consumes PCP context and entity identities, produces domain results.
 * No context resolution — PCP is the sole source.
 * No LLM calls — registry is the sole inference authority.
 */
import type { CPIEPCPContext, CPIEDomainResult } from './types';
import { inferCharacterWardrobe } from './wardrobe';
import { inferCharacterProps } from './props';
import { inferVehicle } from './vehicle';
import type { VehicleInferenceOutput } from './vehicle';
import { inferCreature } from './creature';
import type { CreatureInferenceOutput } from './creature';
import type { WardrobeInferenceOutput } from './wardrobe';
import type { PropInferenceOutput } from './props';
import { calculateICS } from './ics';
import { getRegistryMetadata } from './registry';

export interface CPIESessionResult {
  project_id: string;
  context: CPIEPCPContext;
  domains: {
    wardrobe: WardrobeInferenceOutput[];
    props: PropInferenceOutput[];
    vehicle: VehicleInferenceOutput[];
    creature: CreatureInferenceOutput[];
  };
  ics: Record<string, number>;
  registry_metadata: ReturnType<typeof getRegistryMetadata>;
  generated_at: string;
}

/**
 * Run full CPIE inference for a project.
 * Infers wardrobe + props for every entity in the PCP context.
 */
export function runCPIEInference(context: CPIEPCPContext): CPIESessionResult {
  const domainWardrobe: WardrobeInferenceOutput[] = [];
  const domainProps: PropInferenceOutput[] = [];
  const domainVehicle: VehicleInferenceOutput[] = [];
  const domainCreature: CreatureInferenceOutput[] = [];

  // Iterate over all entities in the PCP profession_map
  for (const [entityKey, entry] of Object.entries(context.profession_map)) {
    const entity = {
      entity_key: entityKey,
      canonical_name: entry.character_name,
      profession: entry.profession,
      role_archetype: entry.role_archetype,
    };

    // Wardrobe inference
    const wardrobeResult = inferCharacterWardrobe(context, entity);
    if (wardrobeResult.inference_count > 0) {
      domainWardrobe.push(wardrobeResult);
    }

    // Prop inference
    const propResult = inferCharacterProps(context, entity);
    if (propResult.inference_count > 0) {
      domainProps.push(propResult);
    }

    // Vehicle inference
    const vehicleResult = inferVehicle(context, entity);
    if (vehicleResult.inference_count > 0) {
      domainVehicle.push(vehicleResult);
    }

    // Creature inference
    const creatureResult = inferCreature(context, entity);
    if (creatureResult.inference_count > 0) {
      domainCreature.push(creatureResult);
    }
  }

  // Calculate ICS per domain
  const ics: Record<string, number> = {};
  ics.wardrobe = calculateICS(domainWardrobe.flatMap(w => w.inferences), 'wardrobe');
  ics.props = calculateICS(domainProps.flatMap(p => p.inferences), 'props');
  ics.vehicle = calculateICS(domainVehicle.flatMap(v => v.inferences), 'vehicle');
  ics.creature = calculateICS(domainCreature.flatMap(c => c.inferences), 'creature');

  return {
    project_id: context.project_id,
    context,
    domains: { wardrobe: domainWardrobe, props: domainProps, vehicle: domainVehicle, creature: domainCreature },
    ics,
    registry_metadata: getRegistryMetadata(),
    generated_at: new Date().toISOString(),
  };
}
