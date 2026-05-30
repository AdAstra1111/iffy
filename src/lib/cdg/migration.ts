/** * CDG Migration Layer — Integration Hooks for Existing Systems */

import type { CDGNodeID, CDGNodeState, CDGNodeStatus } from './types';
import { ALL_CDG_NODES } from './registry';
import { createFreshState, refreshStaleness, transitionNode, certifyNode, revokeCertification } from './status';
import { processChangeEvent } from './invalidator';
import { explainStaleness, getGovernanceDashboard, getAllStaleNodes, getAlerts } from './governance';

// Full migration: creates the CDG state map from scratch for a project
export function migrateCDGBootstrap(projectId: string): Map<CDGNodeID, CDGNodeState> {
  const states = new Map<CDGNodeID, CDGNodeState>();
  const now = new Date().toISOString();

  for (const nodeId of ALL_CDG_NODES) {
    states.set(nodeId, createFreshState(nodeId, now));
  }
  return states;
}

// Visual Style Migration: fold existing project_visual_style into CDG
export interface VisualStyleSnapshot {
  period?: string;
  cultural_context?: string;
  lighting_philosophy?: string;
  camera_philosophy?: string;
  composition_philosophy?: string;
  texture_materiality?: string;
  color_response?: string;
  environment_realism?: string;
  forbidden_traits?: string[];
}

export function migrateVisualStyle(
  visualStyle: VisualStyleSnapshot,
  currentStates: Map<CDGNodeID, CDGNodeState>,
): Map<CDGNodeID, CDGNodeState> {
  const states = new Map(currentStates);
  const now = new Date().toISOString();
  const existingD7 = states.get('D7');

  // If D7 exists and has content, mark it FRESH but don't overwrite
  if (existingD7 && Object.keys(visualStyle).length > 0) {
    states.set('D7', {
      ...existingD7,
      status: 'FRESH',
      last_updated: now,
      staleness_reason: 'migrated from existing project_visual_style',
    });
  }
  return states;
}

// deriveStyleFromCanon integration: when deriveStyleFromCanon writes to
// project_visual_style, it triggers this to update CDG state
export function notifyVisualStyleUpdate(
  currentStates: Map<CDGNodeID, CDGNodeState>,
  changedFields: string[],
  timestamp: string,
): Map<CDGNodeID, CDGNodeState> {
  const states = new Map(currentStates);
  const d7State = states.get('D7');
  if (d7State) {
    states.set('D7', {
      ...d7State,
      status: 'FRESH',
      last_updated: timestamp,
      staleness_reason: '',
      regeneration_count: d7State.regeneration_count + 1,
    });
  }
  // Mark projection nodes stale since visual style changed
  for (const proj of ['S1', 'S2', 'S3'] as CDGNodeID[]) {
    const pState = states.get(proj);
    if (pState) {
      states.set(proj, {
        ...pState,
        status: 'STALE',
        staleness_reason: `visual_style updated: ${changedFields.join(', ')}`,
        last_updated: timestamp,
      });
    }
  }
  return states;
}

// Get integration version
export function getMigrationVersion(): string {
  return '1.0.0';
}
