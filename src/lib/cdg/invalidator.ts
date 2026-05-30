/** * CDG Invalidation Engine — Deterministic Downstream Identification */

import type { CDGNodeID, CDGNodeState, CDGNodeStatus, CDGChangeEvent } from './types';
import { getDownstreamDependents, getUpstreamDependencies, ALL_CDG_NODES, CDG_EDGES } from './registry';
import { PCP_INVALIDATION_MATRIX, CDG_REGEN_ORDER } from './types';

export interface InvalidationResult {
  directly_affected: CDGNodeID[];
  indirectly_affected: CDGNodeID[];
  all_affected: CDGNodeID[];
  skipped: CDGNodeID[];
  detail: InvalidationDetail[];
}

export interface InvalidationDetail {
  node: CDGNodeID;
  reason: string;
  distance: number; // 0 = trigger node, 1 = direct, 2+ = transitive
}

// BFS stale propagation
function bfsPropagation(
  startNodes: CDGNodeID[],
  excludeNode: CDGNodeID,
  maxDepth: number = 5,
): { nodes: CDGNodeID[]; depth: Map<string, number> } {
  const visited = new Set<CDGNodeID>([excludeNode]);
  const depth = new Map<string, number>();
  const queue: Array<{ node: CDGNodeID; d: number }> = [];

  for (const n of startNodes) {
    if (n === excludeNode) continue;
    visited.add(n);
    depth.set(n, 1);
    queue.push({ node: n, d: 1 });
  }

  while (queue.length > 0) {
    const { node, d } = queue.shift()!;
    if (d >= maxDepth) continue;
    const downstream = getDownstreamDependents(node);
    for (const dep of downstream) {
      if (!visited.has(dep)) {
        visited.add(dep);
        depth.set(dep, d + 1);
        queue.push({ node: dep, d: d + 1 });
      }
    }
  }

  return {
    nodes: ALL_CDG_NODES.filter(n => visited.has(n)),
    depth,
  };
}

// Deterministic invalidation from a PCP node change
export function computeInvalidation(
  changedNode: CDGNodeID,
  affectedFields?: string[],
): InvalidationResult {
  const result: InvalidationResult = {
    directly_affected: [],
    indirectly_affected: [],
    all_affected: [],
    skipped: [],
    detail: [],
  };

  // Step 1: Check if this node has entries in the invalidation matrix
  if (PCP_INVALIDATION_MATRIX[changedNode]) {
    // Direct CPIE invalidation
    const direct = PCP_INVALIDATION_MATRIX[changedNode];
    result.directly_affected.push(...direct);
    for (const nd of direct) {
      result.detail.push({ node: nd, reason: `direct invalidation from ${changedNode}`, distance: 1 });
    }

    // Step 2: BFS for indirect through CPIE -> Canon -> Projection
    for (const cpieNode of direct) {
      const downstream = getDownstreamDependents(cpieNode);
      for (const dn of downstream) {
        if (!result.directly_affected.includes(dn)) {
          result.indirectly_affected.push(dn);
          result.detail.push({ node: dn, reason: `transitive from ${cpieNode} (via ${changedNode})`, distance: 2 });
        }
      }
    }
  }

  // Also handle when a non-PCP node changes (e.g., Canon node directly)
  if (changedNode.startsWith('D') || changedNode.startsWith('C')) {
    const downstream = getDownstreamDependents(changedNode);
    for (const dn of downstream) {
      result.indirectly_affected.push(dn);
      result.detail.push({ node: dn, reason: `transitive from ${changedNode}`, distance: 1 });
    }
  }

  // Collect all
  const allSet = new Set([...result.directly_affected, ...result.indirectly_affected]);
  result.all_affected = Array.from(allSet);

  // Skipped = everything not affected
  result.skipped = ALL_CDG_NODES.filter(n => n !== changedNode && !allSet.has(n));

  return result;
}

// Process a full change event and return node states
export function processChangeEvent(
  event: CDGChangeEvent,
  currentStates: Map<CDGNodeID, CDGNodeState>,
): Map<CDGNodeID, CDGNodeState> {
  const newStates = new Map(currentStates);
  const invalidation = computeInvalidation(event.node_id, event.affected_fields);

  // Mark the trigger node first
  const triggerState = newStates.get(event.node_id);
  if (triggerState) {
    newStates.set(event.node_id, {
      ...triggerState,
      status: 'FRESH' as CDGNodeStatus,
      last_updated: event.changed_at,
      staleness_reason: '',
    });
  }

  // Mark all affected as STALE
  for (const nodeId of invalidation.all_affected) {
    const detail = invalidation.detail.find(d => d.node === nodeId);
    const existing = newStates.get(nodeId);
    newStates.set(nodeId, {
      node_id: nodeId,
      status: 'STALE',
      last_updated: event.changed_at,
      staleness_reason: detail?.reason ?? `affected by change to ${event.node_id}: ${event.details}`,
      regeneration_count: existing?.regeneration_count ?? 0,
    });
  }

  return newStates;
}

// Regeneration order sorting
export function sortByRegenerationOrder(nodes: CDGNodeID[]): CDGNodeID[] {
  return [...nodes].sort((a, b) => (CDG_REGEN_ORDER[a] ?? 99) - (CDG_REGEN_ORDER[b] ?? 99));
}

// Check if a node is blocked
export function isBlocked(
  nodeId: CDGNodeID,
  currentStates: Map<CDGNodeID, CDGNodeState>,
): { blocked: boolean; reason?: string } {
  const upstream = getUpstreamDependencies(nodeId);
  for (const up of upstream) {
    const state = currentStates.get(up);
    if (state && (state.status === 'STALE' || state.status === 'BLOCKED')) {
      return { blocked: true, reason: `upstream ${up} is ${state.status}: ${state.staleness_reason}` };
    }
  }
  return { blocked: false };
}
