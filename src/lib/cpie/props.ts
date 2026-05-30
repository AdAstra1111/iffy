/**
 * Prop Domain Processor — CPIE Phase 1
 *
 * Consumes PCP -> CPIE Registry for deterministic prop inference.
 * Pure function: same PCP context + same entity = same prop output.
 */
import type { CPIEPCPContext, CPIEInference } from './types';
import { resolveProps } from './registry';

export interface PropInferenceOutput {
  entity_key: string;
  canonical_name: string;
  inferences: CPIEInference[];
  inference_count: number;
  generated_at: string;
}

/**
 * Run prop inference for a single entity.
 *
 * @param context — The PCP context (READ-ONLY)
 * @param entity — Entity identity (from narrative extraction)
 * @returns Structured prop inference output with provenance
 */
export function inferCharacterProps(
  context: CPIEPCPContext,
  entity: { entity_key: string; canonical_name: string; profession?: string; role_archetype?: string },
): PropInferenceOutput {
  const matched = resolveProps(context, {
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
