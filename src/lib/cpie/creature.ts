/**
 * Creature Domain Processor — CPIE Phase 1B.2
 *
 * Consumes PCP -> CPIE Registry for deterministic creature inference.
 * Pure function: same PCP context + same entity = same creature output.
 *
 * No LLM calls. No extraction logic. No context resolution.
 * AtomiserRepository handles persistence; this handles inference.
 */
import type { CPIEPCPContext, CPIEInference } from './types';
import { resolveCreature } from './registry';

export interface CreatureInferenceOutput {
  entity_key: string;
  canonical_name: string;
  inferences: CPIEInference[];
  inference_count: number;
  generated_at: string;
}

/**
 * Run creature inference for a single entity.
 *
 * @param context — The PCP context (READ-ONLY, from src/lib/pcp/)
 * @param entity — Entity identity (from narrative extraction)
 * @returns Structured creature inference output with provenance
 */
export function inferCreature(
  context: CPIEPCPContext,
  entity: { entity_key: string; canonical_name: string; profession?: string; role_archetype?: string },
): CreatureInferenceOutput {
  const matched = resolveCreature(context, {
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
