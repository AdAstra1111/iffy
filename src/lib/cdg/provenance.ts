/** * CDG Provenance Layer — Source tracking through regeneration */

export type ProvenanceEventType = 'creation' | 'regeneration' | 'certification' | 'override' | 'rollback';

export interface ProvenanceEvent {
  event_id: string;
  node_id: string;
  event_type: ProvenanceEventType;
  timestamp: string;
  triggered_by: string;        // "user" | "system" | "pipeline" | change description
  before_value?: unknown;
  after_value?: unknown;
  confidence_before?: number;
  confidence_after?: number;
  reasoning_added: string[];   // new reasoning added this step
  source_type: string;          // "extracted" | "inferred" | "user_supplied"
  registry_rule_hit?: string;  // which deterministic rule matched
}

export interface ProvenanceChain {
  node_id: string;
  current_value: unknown;
  current_confidence: number;
  current_source_type: string;
  current_reasoning: string[];    // full chain, most recent last
  events: ProvenanceEvent[];
  original_source: string;        // where the very first value came from
  original_timestamp: string;
  regeneration_count: number;
}

export interface ProvenanceNode {
  node_key: string;        // e.g. "C1.wardrobe.primary_outfit" or "D1.atom.vehicle_01"
  chain: ProvenanceChain;
  dependencies: string[];  // upstream node keys that contributed
}

export function createProvenanceEvent(
  eventId: string,
  nodeId: string,
  eventType: ProvenanceEventType,
  triggeredBy: string,
  reasoningAdded: string[],
  sourceType: string,
  registryRuleHit?: string,
  before?: unknown,
  after?: unknown,
  confidenceBefore?: number,
  confidenceAfter?: number,
): ProvenanceEvent {
  return {
    event_id: eventId,
    node_id: nodeId,
    event_type: eventType,
    timestamp: new Date().toISOString(),
    triggered_by: triggeredBy,
    before_value: before,
    after_value: after,
    confidence_before: confidenceBefore,
    confidence_after: confidenceAfter,
    reasoning_added: reasoningAdded,
    source_type: sourceType,
    registry_rule_hit: registryRuleHit,
  };
}

export function initProvenanceChain(
  nodeId: string,
  value: unknown,
  confidence: number,
  sourceType: string,
  reasoning: string[],
): ProvenanceChain {
  return {
    node_id: nodeId,
    current_value: value,
    current_confidence: confidence,
    current_source_type: sourceType,
    current_reasoning: [...reasoning],
    events: [{
      event_id: `${nodeId}-init-${Date.now()}`,
      node_id: nodeId,
      event_type: 'creation',
      timestamp: new Date().toISOString(),
      triggered_by: 'system',
      after_value: value,
      confidence_after: confidence,
      reasoning_added: [...reasoning],
      source_type: sourceType,
    }],
    original_source: reasoning[0] || 'unknown',
    original_timestamp: new Date().toISOString(),
    regeneration_count: 0,
  };
}

export function extendProvenanceChain(
  chain: ProvenanceChain,
  newValue: unknown,
  newConfidence: number,
  newSourceType: string,
  triggeredBy: string,
  newReasoning: string[],
  registryRuleHit?: string,
): ProvenanceChain {
  const event: ProvenanceEvent = {
    event_id: `${chain.node_id}-regen-${chain.regeneration_count + 1}-${Date.now()}`,
    node_id: chain.node_id,
    event_type: 'regeneration',
    timestamp: new Date().toISOString(),
    triggered_by: triggeredBy,
    before_value: chain.current_value,
    after_value: newValue,
    confidence_before: chain.current_confidence,
    confidence_after: newConfidence,
    reasoning_added: newReasoning,
    source_type: newSourceType,
    registry_rule_hit: registryRuleHit,
  };

  return {
    ...chain,
    current_value: newValue,
    current_confidence: newConfidence,
    current_source_type: newSourceType,
    current_reasoning: [...chain.current_reasoning, ...newReasoning],
    events: [...chain.events, event],
    regeneration_count: chain.regeneration_count + 1,
  };
}

// Explanation builder
export function buildProvenanceSummary(chain: ProvenanceChain): string {
  const lines: string[] = [
    `Node: ${chain.node_id}`,
    `Value: ${JSON.stringify(chain.current_value)}`,
    `Confidence: ${chain.current_confidence}`,
    `Source: ${chain.current_source_type}`,
    `Regeneration count: ${chain.regeneration_count}`,
    `Original source: ${chain.original_source}`,
    ``,
    `Reasoning chain:`,
  ];
  for (const line of chain.current_reasoning) {
    lines.push(`  - ${line}`);
  }
  if (chain.events.length > 1) {
    lines.push(``, `Regeneration history:`);
    for (const ev of chain.events) {
      if (ev.event_type === 'regeneration') {
        lines.push(`  [${ev.timestamp}] ${ev.triggered_by}: confidence ${ev.confidence_before} -> ${ev.confidence_after}`);
      }
    }
  }
  return lines.join('\n');
}

export function getProvenanceVersion(): string {
  return '1.0.0';
}
