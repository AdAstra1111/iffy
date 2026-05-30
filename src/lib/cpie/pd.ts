/**
 * Production Design Domain Processor — CPIE Domain C6
 *
 * Consumes LC (spatial_function) + PCP via LC -> CPIE Registry for
 * deterministic Production Design inference.
 * Entity-level inference: per-venue (same as Location).
 *
 * Architecture: PCP -> LC (spatial_function) -> Registry -> PD Canon
 *
 * Ownership:
 *   PD Canon = Environmental dressing, set design, surface treatments
 *   Location Canon = Permanent built environment (architecture)
 *   Visual Language = How the world is photographed
 *   Props = Interactable discrete objects
 *   Wardrobe = Character-worn clothing
 *
 * 8 fields: dressing_style, surface_treatment, institutional_culture,
 *           environmental_story, scene_specific_dressing,
 *           hero_background_objects, color_accents, atmosphere_physics
 *
 * No LLM calls in registry. No independent inference in consumers.
 * VPB renders PD outputs — never infers PD fields.
 */

import type { CPIEPCPContext, CPIEInference } from './types';
import { resolvePD, anchorToInference } from './registry';

export interface PDInferenceOutput {
  entity_key: string;
  canonical_name: string;
  inferences: CPIEInference[];
  inference_count: number;
  generated_at: string;
}

/**
 * Infer Production Design for a venue entity.
 * Entity-level inference: same pattern as Location.
 */
export function inferPD(
  context: CPIEPCPContext,
  entity: { entity_key: string; canonical_name: string; spatial_function?: string },
): PDInferenceOutput {
  // Build augmented context with spatial_function (from LC)
  const augmentedCtx = {
    ...context,
    spatial_function: entity.spatial_function ?? '',
  };

  const matched = resolvePD(augmentedCtx, entity);
  const now = new Date().toISOString();
  const deps = ['spatial_function', 'genre', 'period', 'economy', 'class_structure'];
  const inferences: CPIEInference[] = [];

  for (const [field, anchor] of matched.entries()) {
    inferences.push(anchorToInference(anchor, entity.entity_key, deps, now));
  }

  return {
    entity_key: entity.entity_key,
    canonical_name: entity.canonical_name,
    inferences,
    inference_count: inferences.length,
    generated_at: now,
  };
}
