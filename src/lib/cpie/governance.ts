/**
 * CPIE Governance — "Why was this inferred?" explanation API
 *
 * Every inference must be explainable:
 *   What PCP fields created it?
 *   What registry rule matched?
 *   What reasoning chain produced the value?
 *   What confidence score and dependencies?
 *
 * No opaque outputs.
 */
import type { CPIEInference, CPIEPCPContext, CPIEDomain } from './types';
import { getRegistryMetadata } from './registry';

export interface InferenceExplanation {
  domain: string;
  entity_key: string;
  field: string;
  value: string;
  source_type: string;
  confidence_score: number;
  reasoning: string[];
  registry_anchor_id: string;
  pcp_dependencies: string[];
  pcp_values_snapshot: Record<string, string>;
  generated_by: string;
}

/**
 * Build a full explanation for a single CPIE inference.
 * Answers: "Why was {field} = {value} inferred?"
 */
export function explainInference(
  inference: CPIEInference,
  context: CPIEPCPContext,
  entityKey: string,
  domain: string,
): InferenceExplanation {
  // Snapshot the PCP values that contributed
  const pcpValues: Record<string, string> = {};
  for (const dep of inference.pcp_dependencies) {
    const depLower = dep.toLowerCase();
    if (depLower === 'profession_map' && context.profession_map[entityKey]) {
      pcpValues['profession'] = context.profession_map[entityKey].profession;
    }
    if (depLower === 'genre') pcpValues['genre'] = context.genre.join(', ');
    if (depLower === 'climate') pcpValues['climate'] = context.climate;
    if (depLower === 'period') pcpValues['period'] = context.period;
    if (depLower === 'technology_level') pcpValues['technology_level'] = context.technology_level;
    if (depLower === 'culture') pcpValues['culture'] = Array.isArray(context.culture) ? context.culture.join(', ') : context.culture;
  }

  return {
    domain,
    entity_key: entityKey,
    field: inference.field,
    value: inference.value,
    source_type: inference.source_type,
    confidence_score: inference.confidence_score,
    reasoning: inference.reasoning,
    registry_anchor_id: inference.registry_anchor_id,
    pcp_dependencies: inference.pcp_dependencies,
    pcp_values_snapshot: pcpValues,
    generated_by: inference.generated_by,
  };
}

/**
 * Build a human-readable explanation string.
 *
 * Example output:
 *   Trench Coat (Harry's primary_outfit)
 *     Source: inferred (confidence: 0.91)
 *     Because: profession=detective, genre=noir, climate=rainy
 *     Registry rule: wd_detective_noir_coat
 *     Dependencies: profession_map, genre, climate
 */
export function formatExplanation(explanation: InferenceExplanation): string {
  const lines: string[] = [
    `${explanation.value} (${explanation.entity_key}'s ${explanation.field})`,
    `  Source: ${explanation.source_type} (confidence: ${explanation.confidence_score})`,
  ];

  if (explanation.reasoning.length > 0) {
    lines.push(`  Because: ${explanation.reasoning.filter(r => !r.startsWith('registry_rule')).join(', ')}`);
  }
  if (explanation.registry_anchor_id) {
    lines.push(`  Registry rule: ${explanation.registry_anchor_id}`);
  }
  if (explanation.pcp_dependencies.length > 0) {
    lines.push(`  Dependencies: ${explanation.pcp_dependencies.join(', ')}`);
  }
  if (Object.keys(explanation.pcp_values_snapshot).length > 0) {
    lines.push(`  PCP values:`);
    for (const [k, v] of Object.entries(explanation.pcp_values_snapshot)) {
      lines.push(`    ${k}: ${v}`);
    }
  }

  return lines.join('\n');
}

export { getRegistryMetadata };
