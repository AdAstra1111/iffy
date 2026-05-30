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
import { inferLocation } from './location';
import { inferVL } from './vl';
import { inferPD } from './pd';
import type { LocationInferenceOutput } from './location';
import type { VLInferenceOutput } from './vl';
import type { PDInferenceOutput } from './pd';
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
    location: LocationInferenceOutput[];
    vl: VLInferenceOutput;
    pd: PDInferenceOutput[];
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
  const domainLocation: LocationInferenceOutput[] = [];
  let domainVL: VLInferenceOutput = { project_id: context.project_id, inferences: [], inference_count: 0, generated_at: new Date().toISOString() };
  const domainPD: PDInferenceOutput[] = [];

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

  // Visual Language inference (project-level — single call after entity loop)
  domainVL = inferVL(context);

  // Production Design inference (venue-level — per-entity)
  // PD uses spatial_function from LC context
  for (const [entityKey, entry] of Object.entries(context.profession_map)) {
    for (const spFunc of ['hospitality', 'residential', 'civic', 'commercial', 'military', 'industrial', 'religious']) {
      const pdResult = inferPD(context, {
        entity_key: entityKey,
        canonical_name: entry.character_name,
        spatial_function: spFunc,
      });
      if (pdResult.inference_count > 0) {
        domainPD.push(pdResult);
      }
    }
  }

  // Calculate ICS per domain
  const ics: Record<string, number> = {};
  ics.wardrobe = calculateICS(domainWardrobe.flatMap(w => w.inferences), 'wardrobe');
  ics.props = calculateICS(domainProps.flatMap(p => p.inferences), 'props');
  ics.vehicle = calculateICS(domainVehicle.flatMap(v => v.inferences), 'vehicle');
  ics.creature = calculateICS(domainCreature.flatMap(c => c.inferences), 'creature');
  ics.location = calculateICS(domainLocation.flatMap(l => l.inferences), 'location');
  ics.vl = calculateICS(domainVL.inferences, 'vl');
  ics.pd = calculateICS(domainPD.flatMap(p => p.inferences), 'pd');

  return {
    project_id: context.project_id,
    context,
    domains: { wardrobe: domainWardrobe, props: domainProps, vehicle: domainVehicle, creature: domainCreature, location: domainLocation, vl: domainVL, pd: domainPD },
    ics,
    registry_metadata: getRegistryMetadata(),
    generated_at: new Date().toISOString(),
  };
}
