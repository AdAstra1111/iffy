/**
 * CPIE — CDG Integration Layer
 *
 * Wires CPIE inference outputs to CDG for provenance tracking,
 * staleness registration, dependency mapping, and governance.
 *
 * Every inference emitted by CPIE must register:
 *   - Dependencies (which PCP fields were used)
 *   - Provenance (source_type, confidence, reasoning)
 *   - Staleness ownership (who regenerates when PCP changes)
 *   - Node mapping (CPIE node -> Canon node -> Projection node)
 *
 * No orphan outputs.
 */
import type { CPIEInference, CPIEDomain, CPIEPCPContext } from './types';
import { resolveCanonNode, resolveCPIENode } from '../../../supabase/functions/_shared/cdg-bridge';
// Falls back to direct mapping if cdg-bridge import fails in client-side
// (cdg-bridge is Deno — client-side uses direct mapping below)

const DOMAIN_NODE_MAP: Record<string, string> = {
  wardrobe: 'D1',
  prop: 'D2',
  vehicle: 'D3',
  creature: 'D4',
  location: 'D5',
  vl: 'D7',
  pd: 'D6',
};

const CPIE_NODE_MAP: Record<string, string> = {
  wardrobe: 'C1',
  prop: 'C2',
  vehicle: 'C3',
  creature: 'C4',
  location: 'C5',
  vl: 'C7',
  pd: 'C6',
};

export interface CDGRegistrationBundle {
  project_id: string;
  entity_key: string;
  node_id: string;
  cpie_node_id: string;
  upstream_dependencies: string[];
  staleness_owned_by: 'cpie';
  certification_owned_by: 'user';
  inferences: Array<{
    field: string;
    value: string;
    source_type: string;
    confidence_score: number;
    reasoning: string[];
    registry_anchor_id: string;
  }>;
  registered_at: string;
}

/**
 * Build a CDG registration bundle for a single entity's inference results.
 */
export function buildCDGRegistration(
  projectId: string,
  domain: CPIEDomain,
  entityKey: string,
  inferences: CPIEInference[],
): CDGRegistrationBundle | null {
  const nodeId = DOMAIN_NODE_MAP[domain] ?? null;
  const cpieNodeId = CPIE_NODE_MAP[domain] ?? null;
  if (!nodeId || !cpieNodeId) return null;

  // Collect unique PCP dependencies across all inferences
  const deps = new Set<string>();
  for (const inf of inferences) {
    for (const dep of inf.pcp_dependencies) deps.add(dep);
  }

  return {
    project_id: projectId,
    entity_key: entityKey,
    node_id: nodeId,
    cpie_node_id: cpieNodeId,
    upstream_dependencies: Array.from(deps),
    staleness_owned_by: 'cpie',
    certification_owned_by: 'user',
    inferences: inferences.map(inf => ({
      field: inf.field,
      value: inf.value,
      source_type: inf.source_type,
      confidence_score: inf.confidence_score,
      reasoning: inf.reasoning,
      registry_anchor_id: inf.registry_anchor_id,
    })),
    registered_at: new Date().toISOString(),
  };
}
