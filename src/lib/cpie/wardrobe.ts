/**
 * Wardrobe Domain Processor — CPIE Phase 1
 *
 * Consumes PCP -> CPIE Registry for deterministic wardrobe inference.
 * Pure function: same PCP context + same entity = same wardrobe output.
 *
 * No LLM calls. No extraction logic. No context resolution.
 * AtomiserRepository handles persistence; this handles inference.
 */
import type { CPIEPCPContext, CPIEInference } from './types';
import { resolveWardrobe } from './registry';

export interface WardrobeInferenceOutput {
  entity_key: string;
  canonical_name: string;
  inferences: CPIEInference[];
  inference_count: number;
  generated_at: string;
}

/**
 * Run wardrobe inference for a single entity.
 *
 * @param context — The PCP context (READ-ONLY, from src/lib/pcp/)
 * @param entity — Entity identity (from narrative extraction)
 * @returns Structured wardrobe inference output with provenance
 */
export function inferCharacterWardrobe(
  context: CPIEPCPContext,
  entity: { entity_key: string; canonical_name: string; profession?: string; role_archetype?: string },
): WardrobeInferenceOutput {
  const matched = resolveWardrobe(context, {
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
