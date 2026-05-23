/**
 * obligation-topology-types.ts — Frontend types for the obligation topology pipeline.
 *
 * These types mirror the edge function's response shape (supabase/functions/_shared/obligation-topology.ts)
 * but live in the frontend src tree so components can import them without Deno module issues.
 *
 * Canonical source: src/hooks/useObligationData.ts re-exported here for convenience.
 */

export type ObligationType =
  | 'setup'
  | 'payoff'
  | 'escalation'
  | 'reversal'
  | 'resolution'
  | 'continuity';

export type LifecycleState =
  | 'loaded'
  | 'active'
  | 'discharging'
  | 'discharged';

export interface ObligationTopologyNode {
  scene_key: string;
  act_id: string;
  title: string;
  entity_count: number;
}

export interface ObligationTopologyEdge {
  source: string;
  target: string;
  type: ObligationType;
  charge: number;
  lifecycle_state: LifecycleState;
}

export interface ObligationTopologyMetrics {
  total_obligations: number;
  by_type: Record<ObligationType, number>;
  by_lifecycle: Record<LifecycleState, number>;
  avg_charge: number;
  avg_confidence: number;
  acts_spanning: number;
  discharged_count: number;
  active_count: number;
}

export interface ObligationTopologyResult {
  obligations: Array<{
    source_scene_key: string;
    target_scene_key: string;
    type: ObligationType;
    charge: number;
    confidence: number;
    lifecycle_state: LifecycleState;
    thread_label: string;
  }>;
  topology: {
    nodes: ObligationTopologyNode[];
    edges: ObligationTopologyEdge[];
    metrics: ObligationTopologyMetrics;
  };
}

/**
 * SceneObligationMetrics — per-scene derived metrics from the graph model.
 * Computed by useObligationTopology from the raw nodes + edges array.
 */
export interface SceneObligationMetrics {
  entityCount: number;
  totalObligations: number;
  avgCharge: number;
  activeObligations: number;
}

/**
 * Derive per-scene metrics from obligation topology nodes and edges.
 */
export function deriveSceneMetrics(
  nodes: ObligationTopologyNode[],
  edges: ObligationTopologyEdge[],
): Record<string, SceneObligationMetrics> {
  const metrics: Record<string, SceneObligationMetrics> = {};

  for (const node of nodes) {
    const sceneEdges = edges.filter(e => e.source === node.scene_key);
    const avgCharge = sceneEdges.length > 0
      ? sceneEdges.reduce((sum, e) => sum + e.charge, 0) / sceneEdges.length
      : 0;
    const activeEdges = sceneEdges.filter(e => e.lifecycle_state === 'active');

    metrics[node.scene_key] = {
      entityCount: node.entity_count,
      totalObligations: sceneEdges.length,
      avgCharge: Math.round(avgCharge * 100) / 100,
      activeObligations: activeEdges.length,
    };
  }

  return metrics;
}
