/**
 * CDG Bridge — Edge-Function-Compatible Dependency & Provenance Layer
 *
 * Client-side CDG (src/lib/cdg/) runs in Vite/React. Edge functions run in
 * Deno. This bridge serializes CDG state as JSON so edge functions can
 * register dependencies, consumers, provenance lineage, and staleness
 * ownership without importing client-side libraries.
 *
 * Contract:
 *   Edge Function -> CDGBridge -> JSON payload -> CDG client (supabase write)
 *   Edge Function <- CDGBridge <- JSON snapshot <- CDG client (supabase read)
 */

// Types
export type CDGNodeID = string;
export type CDGNodeStatus = 'FRESH' | 'STALE' | 'STALE_WARNING' | 'INVALID' | 'BLOCKED' | 'CERTIFIED';

// Registration Payloads
export interface DependencyRegistration {
  node_id: CDGNodeID;
  entity_key: string;
  project_id: string;
  upstream_dependencies: string[];
  downstream_consumers: string[];
  staleness_owned_by: 'cpie' | 'atomiser' | 'user';
  certification_owned_by: 'user' | 'automated_gate';
  registered_at: string;
}

export interface ProvenanceLineageRecord {
  node_id: CDGNodeID;
  entity_key: string;
  field: string;
  value: string | string[];
  source_type: 'extracted' | 'inferred' | 'user_supplied';
  confidence_score: number;
  reasoning: string[];
  pcp_dependencies: string[];
  registry_rule_hit?: string;
  regenerated_from?: string;
  regenerated_at?: string;
}

export interface CDGRegistrationBundle {
  project_id: string;
  generated_at: string;
  dependencies: DependencyRegistration[];
  lineages: ProvenanceLineageRecord[];
  staleness_updates: Array<{
    node_id: CDGNodeID;
    status: CDGNodeStatus;
    reason: string;
  }>;
}

// Node Lookup Maps
const DOMAIN_NODE_MAP: Record<string, string> = {
  wardrobe: 'D1', costume: 'D1',
  prop: 'D2',
  vehicle: 'D3',
  creature: 'D4',
  location: 'D5',
  pd: 'D6',
  visual_language: 'D7',
};

const CPIE_DOMAIN_MAP: Record<string, string> = {
  wardrobe: 'C1', costume: 'C1',
  prop: 'C2',
  vehicle: 'C3',
  creature: 'C4',
  location: 'C5',
  pd: 'C6',
  visual_language: 'C7',
};

export function resolveCanonNode(domain: string): CDGNodeID | null {
  const key = domain.toLowerCase().replace(/[_-]/g, '');
  return DOMAIN_NODE_MAP[key] ?? null;
}

export function resolveCPIENode(domain: string): CDGNodeID | null {
  const key = domain.toLowerCase().replace(/[_-]/g, '');
  return CPIE_DOMAIN_MAP[key] ?? null;
}

// Registration Builders
export function buildDependencyRegistration(
  projectId: string, domain: string, entityKey: string, pcpDependencies: string[],
): DependencyRegistration | null {
  const nodeId = resolveCanonNode(domain);
  if (!nodeId) return null;
  return {
    node_id: nodeId, entity_key: entityKey, project_id: projectId,
    upstream_dependencies: pcpDependencies, downstream_consumers: [],
    staleness_owned_by: 'cpie', certification_owned_by: 'user',
    registered_at: new Date().toISOString(),
  };
}

export function buildProvenanceLineage(
  domain: string, entityKey: string, field: string,
  value: string | string[], sourceType: 'extracted' | 'inferred' | 'user_supplied',
  confidence: number, reasoning: string[], pcpDependencies: string[],
  registryRuleHit?: string,
): ProvenanceLineageRecord | null {
  const nodeId = resolveCanonNode(domain);
  if (!nodeId) return null;
  return {
    node_id: nodeId, entity_key: entityKey, field, value,
    source_type: sourceType, confidence_score: confidence,
    reasoning, pcp_dependencies: pcpDependencies,
    registry_rule_hit: registryRuleHit,
  };
}

export function buildRegistrationBundle(
  projectId: string, domain: string, entityKey: string,
  inferences: Array<{
    field: string; value: string | string[];
    source_type: 'extracted' | 'inferred' | 'user_supplied';
    confidence_score: number; reasoning: string[];
    pcp_dependencies: string[]; registry_rule_hit?: string;
  }>,
): CDGRegistrationBundle {
  const nodeId = resolveCanonNode(domain);
  const now = new Date().toISOString();
  const allDeps = new Set<string>();
  for (const inf of inferences) {
    for (const dep of inf.pcp_dependencies) allDeps.add(dep);
  }
  return {
    project_id: projectId, generated_at: now,
    dependencies: [{
      node_id: nodeId || 'unknown', entity_key: entityKey,
      project_id: projectId, upstream_dependencies: Array.from(allDeps),
      downstream_consumers: [],
      staleness_owned_by: 'cpie', certification_owned_by: 'user',
      registered_at: now,
    }],
    lineages: inferences
      .map(inf => buildProvenanceLineage(
        domain, entityKey, inf.field, inf.value,
        inf.source_type, inf.confidence_score,
        inf.reasoning, inf.pcp_dependencies,
        inf.registry_rule_hit,
      ))
      .filter(Boolean) as ProvenanceLineageRecord[],
    staleness_updates: nodeId
      ? [{ node_id: nodeId, status: 'FRESH' as CDGNodeStatus, reason: 'cpie_inference_generated' }]
      : [],
  };
}

// Persistence
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function persistCDGBundle(
  supabaseClient: ReturnType<typeof createClient>,
  projectId: string, bundle: CDGRegistrationBundle,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabaseClient
    .from('cdg_registrations')
    .insert({
      project_id: projectId,
      generated_at: bundle.generated_at,
      dependencies: bundle.dependencies,
      lineages: bundle.lineages,
      staleness_updates: bundle.staleness_updates,
    });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
