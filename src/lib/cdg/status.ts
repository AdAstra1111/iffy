/** * CDG Staleness Model — 6-State Machine */

import type { CDGNodeID, CDGNodeState, CDGNodeStatus, CDGChangeEvent } from './types';
import { getUpstreamDependencies } from './registry';

// Valid transitions
const VALID_TRANSITIONS: Record<CDGNodeStatus, CDGNodeStatus[]> = {
  'FRESH': ['STALE', 'CERTIFIED'],
  'STALE': ['FRESH', 'INVALID', 'BLOCKED'],
  'STALE_WARNING': ['STALE', 'CERTIFIED', 'FRESH'],
  'INVALID': ['FRESH', 'BLOCKED'],
  'BLOCKED': ['STALE', 'INVALID'],
  'CERTIFIED': ['STALE_WARNING', 'STALE'],
};

export function canTransition(from: CDGNodeStatus, to: CDGNodeStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface TransitionResult {
  success: boolean;
  error?: string;
  newState?: CDGNodeState;
}

export function transitionNode(
  current: CDGNodeState,
  to: CDGNodeStatus,
  reason: string,
  timestamp: string,
): TransitionResult {
  if (!canTransition(current.status, to)) {
    return {
      success: false,
      error: `Invalid transition: ${current.status} -> ${to}`,
    };
  }
  return {
    success: true,
    newState: {
      ...current,
      status: to,
      last_updated: timestamp,
      staleness_reason: to === 'FRESH' ? '' : reason,
    },
  };
}

// Certification
export function certifyNode(
  state: CDGNodeState,
  certifiedBy: string,
  timestamp: string,
  ttlHours?: number,
): CDGNodeState {
  if (state.status === 'CERTIFIED' || state.status === 'STALE_WARNING') {
    return state;
  }
  if (state.status !== 'FRESH') {
    return state;
  }
  return {
    ...state,
    status: 'CERTIFIED',
    certification: {
      certified_by: certifiedBy,
      certified_at: timestamp,
      expires_at: ttlHours ? new Date(Date.now() + ttlHours * 3600000).toISOString() : undefined,
    },
    staleness_reason: '',
  };
}

export function revokeCertification(state: CDGNodeState, reason: string): CDGNodeState {
  if (state.status !== 'CERTIFIED' && state.status !== 'STALE_WARNING') return state;
  return {
    ...state,
    status: 'STALE',
    certification: undefined,
    staleness_reason: reason || 'certification revoked',
  };
}

// Upstream staleness check
export function checkUpstreamStaleness(
  nodeId: CDGNodeID,
  allStates: Map<CDGNodeID, CDGNodeState>,
): { stale: boolean; upstreamNodes: CDGNodeID[] } {
  const upstream = getUpstreamDependencies(nodeId);
  const staleNodes = upstream.filter(u => {
    const s = allStates.get(u);
    return s && (s.status === 'STALE' || s.status === 'INVALID' || s.status === 'BLOCKED');
  });
  return { stale: staleNodes.length > 0, upstreamNodes: staleNodes };
}

// Full state refresh
export function refreshStaleness(
  allStates: Map<CDGNodeID, CDGNodeState>,
): Map<CDGNodeID, CDGNodeState> {
  const result = new Map(allStates);
  for (const [nodeId, state] of result) {
    if (state.status === 'FRESH' || state.status === 'CERTIFIED') {
      const { stale, upstreamNodes } = checkUpstreamStaleness(nodeId, result);
      if (stale) {
        if (state.status === 'CERTIFIED') {
          result.set(nodeId, { ...state, status: 'STALE_WARNING', staleness_reason: `upstream stale: ${upstreamNodes.join(', ')}` });
        } else {
          result.set(nodeId, { ...state, status: 'STALE', staleness_reason: `upstream stale: ${upstreamNodes.join(', ')}` });
        }
      }
    }
  }
  return result;
}

// Create initial FRESH state for a node
export function createFreshState(
  nodeId: CDGNodeID,
  timestamp: string,
  certified?: boolean,
): CDGNodeState {
  return {
    node_id: nodeId,
    status: certified ? 'CERTIFIED' : 'FRESH',
    last_updated: timestamp,
    staleness_reason: '',
    certification: certified ? { certified_by: 'system', certified_at: timestamp } : undefined,
    regeneration_count: 0,
  };
}
