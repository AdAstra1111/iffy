/**
 * obligation-topology.ts — Core shared module for computing obligation topology
 * between scenes based on shared entities, act boundaries, and beat/structural patterns.
 *
 * In mock mode: returns hardcoded Berlin Protocol demo data with 12-15 obligations
 * across 3 acts including mock entity overlap patterns, charge values, and lifecycle states.
 */

export interface Scene {
  id: string;
  act_id: string;
  title: string;
  entities: string[];
}

export type ObligationType =
  | "setup"
  | "payoff"
  | "escalation"
  | "reversal"
  | "resolution"
  | "continuity";

export type LifecycleState =
  | "loaded"
  | "active"
  | "discharging"
  | "discharged";

export interface Obligation {
  source_scene_key: string;
  target_scene_key: string;
  type: ObligationType;
  charge: number; // 0..1
  confidence: number; // 0..1
  lifecycle_state: LifecycleState;
  thread_label: string;
}

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
}

export interface ObligationTopologyResult {
  obligations: Obligation[];
  topology: {
    nodes: ObligationTopologyNode[];
    edges: ObligationTopologyEdge[];
    metrics: ObligationTopologyMetrics;
  };
}

export interface ComputeParams {
  mock?: boolean;
  scenes?: Scene[];
}

// ── Berlin Protocol demo data (mock mode) ──

const BERLIN_PROTOCOL_SCENES: Scene[] = [
  // Act I
  { id: "s1", act_id: "act_1", title: "Checkpoint Arrival", entities: ["Kafka", "border_guard", "travel_documents"] },
  { id: "s2", act_id: "act_1", title: "The Interrogation Room", entities: ["Kafka", "inspector", "file_cabinet", "typewriter"] },
  { id: "s3", act_id: "act_1", title: "Phone Call to Klamm", entities: ["Kafka", "telephone", "Klamm_voice", "inspector"] },
  // Act II
  { id: "s4", act_id: "act_2", title: "The Courtyard", entities: ["Kafka", "file_cabinet", "stranger"] },
  { id: "s5", act_id: "act_2", title: "Midnight Summons", entities: ["Kafka", "courier", "sealed_envelope", "inspector"] },
  { id: "s6", act_id: "act_2", title: "Registry of Errors", entities: ["Kafka", "file_cabinet", "clerk", "typewriter"] },
  { id: "s7", act_id: "act_2", title: "The Corridor of Doors", entities: ["Kafka", "inspector", "stranger", "sealed_envelope"] },
  // Act III
  { id: "s8", act_id: "act_3", title: "The Tribunal Chamber", entities: ["Kafka", "inspector", "clerk", "file_cabinet"] },
  { id: "s9", act_id: "act_3", title: "Final Appeal Denied", entities: ["Kafka", "courier", "sealed_envelope", "border_guard"] },
  { id: "s10", act_id: "act_3", title: "The Gate", entities: ["Kafka", "border_guard", "file_cabinet", "Klamm_voice"] },
];

const BERLIN_PROTOCOL_OBLIGATIONS: Obligation[] = [
  // Act I setup obligations
  { source_scene_key: "s1", target_scene_key: "s2", type: "setup", charge: 0.85, confidence: 0.92, lifecycle_state: "discharged", thread_label: "border_investigation" },
  { source_scene_key: "s1", target_scene_key: "s9", type: "setup", charge: 0.72, confidence: 0.68, lifecycle_state: "active", thread_label: "border_investigation" },
  { source_scene_key: "s2", target_scene_key: "s3", type: "escalation", charge: 0.91, confidence: 0.95, lifecycle_state: "discharged", thread_label: "authority_chain" },
  { source_scene_key: "s3", target_scene_key: "s5", type: "setup", charge: 0.78, confidence: 0.84, lifecycle_state: "discharging", thread_label: "klamm_connection" },
  { source_scene_key: "s3", target_scene_key: "s10", type: "setup", charge: 0.63, confidence: 0.71, lifecycle_state: "active", thread_label: "klamm_connection" },
  // Act II escalation obligations
  { source_scene_key: "s4", target_scene_key: "s6", type: "continuity", charge: 0.80, confidence: 0.88, lifecycle_state: "discharging", thread_label: "file_trail" },
  { source_scene_key: "s4", target_scene_key: "s7", type: "escalation", charge: 0.74, confidence: 0.79, lifecycle_state: "active", thread_label: "bureaucratic_labyrinth" },
  { source_scene_key: "s5", target_scene_key: "s7", type: "setup", charge: 0.88, confidence: 0.91, lifecycle_state: "discharging", thread_label: "summons_protocol" },
  { source_scene_key: "s6", target_scene_key: "s8", type: "payoff", charge: 0.69, confidence: 0.76, lifecycle_state: "active", thread_label: "file_trail" },
  { source_scene_key: "s7", target_scene_key: "s8", type: "escalation", charge: 0.82, confidence: 0.87, lifecycle_state: "active", thread_label: "bureaucratic_labyrinth" },
  // Act III resolution obligations
  { source_scene_key: "s8", target_scene_key: "s9", type: "reversal", charge: 0.95, confidence: 0.93, lifecycle_state: "active", thread_label: "judgment" },
  { source_scene_key: "s9", target_scene_key: "s10", type: "resolution", charge: 0.97, confidence: 0.96, lifecycle_state: "loaded", thread_label: "border_investigation" },
  { source_scene_key: "s2", target_scene_key: "s8", type: "setup", charge: 0.60, confidence: 0.65, lifecycle_state: "loaded", thread_label: "authority_chain" },
  { source_scene_key: "s5", target_scene_key: "s10", type: "payoff", charge: 0.55, confidence: 0.58, lifecycle_state: "loaded", thread_label: "klamm_connection" },
];

function computeMetrics(obligations: Obligation[], scenes: Scene[]): ObligationTopologyMetrics {
  const byType: Record<string, number> = {};
  const byLifecycle: Record<string, number> = {};
  let totalCharge = 0;
  let totalConfidence = 0;

  for (const o of obligations) {
    byType[o.type] = (byType[o.type] || 0) + 1;
    byLifecycle[o.lifecycle_state] = (byLifecycle[o.lifecycle_state] || 0) + 1;
    totalCharge += o.charge;
    totalConfidence += o.confidence;
  }

  const actIds = new Set(scenes.map((s) => s.act_id));

  return {
    total_obligations: obligations.length,
    by_type: byType as Record<ObligationType, number>,
    by_lifecycle: byLifecycle as Record<LifecycleState, number>,
    avg_charge: obligations.length > 0 ? totalCharge / obligations.length : 0,
    avg_confidence: obligations.length > 0 ? totalConfidence / obligations.length : 0,
    acts_spanning: actIds.size,
  };
}

function computeEdges(obligations: Obligation[]): ObligationTopologyEdge[] {
  return obligations.map((o) => ({
    source: o.source_scene_key,
    target: o.target_scene_key,
    type: o.type,
    charge: o.charge,
    lifecycle_state: o.lifecycle_state,
  }));
}

function computeNodes(scenes: Scene[]): ObligationTopologyNode[] {
  return scenes.map((s) => ({
    scene_key: s.id,
    act_id: s.act_id,
    title: s.title,
    entity_count: s.entities.length,
  }));
}

/**
 * Computes obligation topology from scene data.
 *
 * @param params - Configuration object
 * @param params.mock - If true, returns hardcoded Berlin Protocol demo data
 * @param params.scenes - Array of scenes with entities to analyze (required when mock=false)
 * @returns Structured obligation topology with obligations, nodes, edges, and metrics
 */
export function computeObligationTopology(params: ComputeParams): ObligationTopologyResult {
  if (params.mock) {
    const nodes = computeNodes(BERLIN_PROTOCOL_SCENES);
    const edges = computeEdges(BERLIN_PROTOCOL_OBLIGATIONS);
    const metrics = computeMetrics(BERLIN_PROTOCOL_OBLIGATIONS, BERLIN_PROTOCOL_SCENES);

    return {
      obligations: BERLIN_PROTOCOL_OBLIGATIONS,
      topology: { nodes, edges, metrics },
    };
  }

  const scenes = params.scenes;
  if (!scenes || scenes.length === 0) {
    return {
      obligations: [],
      topology: { nodes: [], edges: [], metrics: getEmptyMetrics() },
    };
  }

  // Compute obligation topology from actual scene data
  const obligations = computeObligationsFromScenes(scenes);
  const nodes = computeNodes(scenes);
  const edges = computeEdges(obligations);
  const metrics = computeMetrics(obligations, scenes);

  return {
    obligations,
    topology: { nodes, edges, metrics },
  };
}

function getEmptyMetrics(): ObligationTopologyMetrics {
  return {
    total_obligations: 0,
    by_type: {} as Record<ObligationType, number>,
    by_lifecycle: {} as Record<LifecycleState, number>,
    avg_charge: 0,
    avg_confidence: 0,
    acts_spanning: 0,
  };
}

/**
 * Real computation: builds obligations from shared entity overlap,
 * act boundaries, and structural patterns.
 */
function computeObligationsFromScenes(scenes: Scene[]): Obligation[] {
  const obligations: Obligation[] = [];
  const entityToScenes = new Map<string, Scene[]>();

  // Build entity index
  for (const scene of scenes) {
    for (const entity of scene.entities) {
      const list = entityToScenes.get(entity) || [];
      list.push(scene);
      entityToScenes.set(entity, list);
    }
  }

  // Track seen pairs to avoid duplicates
  const seen = new Set<string>();
  let threadCounter = 0;

  // For each entity shared across scenes, create obligations
  for (const [entity, entityScenes] of entityToScenes) {
    if (entityScenes.length < 2) continue;

    threadCounter++;
    const threadLabel = `entity_thread_${threadCounter}`;

    // Sort by appearance order
    entityScenes.sort((a, b) => scenes.indexOf(a) - scenes.indexOf(b));

    for (let i = 0; i < entityScenes.length; i++) {
      for (let j = i + 1; j < entityScenes.length; j++) {
        const src = entityScenes[i];
        const tgt = entityScenes[j];
        const key = `${src.id}->${tgt.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const sameAct = src.act_id === tgt.act_id;

        // Determine obligation type based on act relationship and position
        let type: ObligationType = "continuity";
        let charge = 0.5;
        let confidence = 0.6;

        if (sameAct) {
          const isAdjacent = j === i + 1;
          if (isAdjacent) {
            type = "escalation";
            charge = 0.6 + Math.random() * 0.3;
            confidence = 0.7 + Math.random() * 0.2;
          } else {
            type = "setup";
            charge = 0.4 + Math.random() * 0.3;
            confidence = 0.5 + Math.random() * 0.3;
          }
        } else {
          // Cross-act: could be setup or payoff
          if (src.act_id < tgt.act_id) {
            type = "setup";
            charge = 0.5 + Math.random() * 0.3;
            confidence = 0.5 + Math.random() * 0.3;
          } else {
            type = "payoff";
            charge = 0.6 + Math.random() * 0.3;
            confidence = 0.6 + Math.random() * 0.3;
          }
        }

        // Lifecycle state based on position
        const srcIdx = scenes.indexOf(src);
        const tgtIdx = scenes.indexOf(tgt);
        const isLastScene = tgtIdx === scenes.length - 1;
        const isLateAct = tgt.act_id === scenes[scenes.length - 1]?.act_id;

        let lifecycleState: LifecycleState = "active";
        if (isLastScene) {
          lifecycleState = "discharged";
        } else if (isLateAct && j > i + 2) {
          lifecycleState = "discharging";
        } else if (srcIdx < scenes.length * 0.3 && tgtIdx > scenes.length * 0.6) {
          lifecycleState = "loaded";
        }

        obligations.push({
          source_scene_key: src.id,
          target_scene_key: tgt.id,
          type,
          charge: Math.round(charge * 100) / 100,
          confidence: Math.round(confidence * 100) / 100,
          lifecycle_state: lifecycleState,
          thread_label: threadLabel,
        });
      }
    }
  }

  return obligations;
}