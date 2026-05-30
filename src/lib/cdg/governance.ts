/** * CDG Governance Visibility — explain_staleness() API */

import type { CDGNodeID, CDGNodeState, CDGNodeStatus, StalenessExplanation } from './types';
import { CDG_NODE_NAMES, CDG_REGEN_ORDER, ALL_CDG_NODES } from './types';
import { getUpstreamDependencies, getDownstreamDependents } from './registry';
import { computeInvalidation, sortByRegenerationOrder } from './invalidator';

// Main explanation query
export function explainStaleness(
  nodeId: CDGNodeID,
  currentStates: Map<CDGNodeID, CDGNodeState>,
): StalenessExplanation {
  const state = currentStates.get(nodeId);
  const status: CDGNodeStatus = state?.status ?? 'FRESH';
  const nodeName = CDG_NODE_NAMES[nodeId] || nodeId;

  // Find the root cause — walk upstream
  let triggerNode: CDGNodeID | null = null;
  let triggerChange = '';
  let triggerTime = '';

  if (status === 'STALE' || status === 'STALE_WARNING' || status === 'BLOCKED') {
    const visited = new Set<CDGNodeID>();
    const queue: CDGNodeID[] = [nodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const state = currentStates.get(current);
      if (state && (state.status === 'STALE' || state.status === 'INVALID')) {
        // Check if upstream is the real cause
        const upstream = getUpstreamDependencies(current);
        const anyUpstream = upstream.some(u => {
          const s = currentStates.get(u);
          return s && (s.status === 'STALE' || s.status === 'INVALID' || s.status === 'BLOCKED');
        });
        if (!anyUpstream || upstream.length === 0) {
          triggerNode = current;
          triggerChange = state.staleness_reason || 'upstream changed';
          triggerTime = state.last_updated;
        }
        queue.push(...upstream);
      }
    }
  }

  // Build cascade
  const cascade: Array<{ node_id: CDGNodeID; name: string; status: CDGNodeStatus; action: string }> = [];
  if (triggerNode) {
    // Walk downstream from trigger
    const affected = computeInvalidation(triggerNode);
    for (const aff of affected.all_affected) {
      const s = currentStates.get(aff);
      cascade.push({
        node_id: aff,
        name: CDG_NODE_NAMES[aff] || aff,
        status: s?.status ?? 'FRESH',
        action: s?.status === 'STALE' ? 'awaiting_regeneration'
          : s?.status === 'BLOCKED' ? 'blocked_on_upstream'
          : s?.status === 'INVALID' ? 'full_recompute_needed'
          : 'no_action_needed',
      });
    }
    // Add trigger node itself
    cascade.unshift({
      node_id: triggerNode,
      name: CDG_NODE_NAMES[triggerNode] || triggerNode,
      status: currentStates.get(triggerNode)?.status ?? 'STALE',
      action: 'trigger_of_cascade',
    });
  }

  // Build regeneration plan
  const regenOrder: number[] = [];
  const blocking: string[] = [];
  if (cascade.length > 1) {
    const affectedNodeIds = cascade.map(c => c.node_id).filter(id => id !== triggerNode);
    const sorted = sortByRegenerationOrder(affectedNodeIds as CDGNodeID[]);
    for (const id of sorted) {
      regenOrder.push(CDG_REGEN_ORDER[id] ?? 99);
      const s = currentStates.get(id);
      if (s?.status === 'BLOCKED') {
        blocking.push(`${CDG_NODE_NAMES[id] || id} is BLOCKED — ${s.staleness_reason}`);
      }
    }
  }

  const certStatus = state?.certification
    ? `CERTIFIED by ${state.certification.certified_by} at ${state.certification.certified_at}`
    : 'not certified';

  return {
    node: { id: nodeId, name: nodeName, status },
    triggered_by: triggerNode
      ? { node_id: triggerNode, change: triggerChange, changed_at: triggerTime }
      : null,
    cascade,
    regeneration_plan: {
      order: [...new Set(regenOrder)],
      estimated_steps: regenOrder.length,
      blocking: blocking.length > 0 ? blocking : ['none'],
    },
    certification_status: certStatus,
  };
}

// Get all stale nodes
export function getAllStaleNodes(
  currentStates: Map<CDGNodeID, CDGNodeState>,
): Array<{ node_id: CDGNodeID; name: string; status: CDGNodeStatus; daysStale: number }> {
  const now = Date.now();
  const stale: Array<{ node_id: CDGNodeID; name: string; status: CDGNodeStatus; daysStale: number }> = [];
  for (const [id, state] of currentStates) {
    if (state.status === 'STALE' || state.status === 'INVALID' || state.status === 'BLOCKED') {
      const lastUpdated = new Date(state.last_updated).getTime();
      const daysStale = (now - lastUpdated) / (1000 * 60 * 60 * 24);
      stale.push({
        node_id: id,
        name: CDG_NODE_NAMES[id] || id,
        status: state.status,
        daysStale: Math.round(daysStale * 100) / 100,
      });
    }
  }
  return stale.sort((a, b) => b.daysStale - a.daysStale);
}

// Dashboard summary
export function getGovernanceDashboard(
  currentStates: Map<CDGNodeID, CDGNodeState>,
): {
  total_nodes: number;
  fresh: number;
  stale: number;
  stale_warning: number;
  invalid: number;
  blocked: number;
  certified: number;
  stalest_nodes: Array<{ node_id: string; name: string; daysStale: number }>;
} {
  let fresh = 0, stale = 0, staleWarning = 0, invalid = 0, blocked = 0, certified = 0;

  for (const state of currentStates.values()) {
    switch (state.status) {
      case 'FRESH': fresh++; break;
      case 'STALE': stale++; break;
      case 'STALE_WARNING': staleWarning++; break;
      case 'INVALID': invalid++; break;
      case 'BLOCKED': blocked++; break;
      case 'CERTIFIED': certified++; break;
    }
  }

  const stalest = getAllStaleNodes(currentStates).slice(0, 5);

  return {
    total_nodes: currentStates.size,
    fresh, stale, stale_warning: staleWarning, invalid, blocked, certified,
    stalest_nodes: stalest.map(s => ({ node_id: s.node_id, name: s.name, daysStale: s.daysStale })),
  };
}

// Alert logic
export function getAlerts(
  currentStates: Map<CDGNodeID, CDGNodeState>,
): Array<{ severity: 'critical' | 'warning' | 'info'; message: string }> {
  const alerts: Array<{ severity: 'critical' | 'warning' | 'info'; message: string }> = [];

  let staleProjection = 0;
  let stalePCP = 0;
  let staleAnything = 0;
  let blockedNodes = 0;
  let invalidNodes = 0;

  for (const [id, state] of currentStates) {
    if (state.status === 'STALE' || state.status === 'INVALID') {
      staleAnything++;
      if (id.startsWith('S')) staleProjection++;
      if (id.startsWith('P')) stalePCP++;
    }
    if (state.status === 'BLOCKED') blockedNodes++;
    if (state.status === 'INVALID') invalidNodes++;
  }

  if (staleProjection >= 5) {
    alerts.push({ severity: 'info', message: 'All projection nodes outdated — regeneration recommended' });
  }
  if (stalePCP > 0) {
    alerts.push({ severity: 'warning', message: `${stalePCP} context fields need re-resolution` });
  }
  if (blockedNodes > 0) {
    alerts.push({ severity: 'critical', message: `${blockedNodes} nodes blocked — upstream dependencies unresolved` });
  }
  if (invalidNodes > 0) {
    alerts.push({ severity: 'critical', message: `${invalidNodes} nodes invalid — full recompute required` });
  }

  return alerts;
}
