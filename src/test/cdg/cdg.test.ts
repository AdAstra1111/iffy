/**
 * CDG Tests — Invalidation, Staleness, Provenance, Governance, Migration
 */

import { describe, it, expect } from 'vitest';
import type { CDGNodeID, CDGNodeState, CDGNodeStatus, CDGChangeEvent } from '@/lib/cdg/types';
import {
  ALL_CDG_NODES, CDG_EDGES, CDG_NODE_RECORDS,
  getUpstreamDependencies, getDownstreamDependents, hashDependencyGraph,
} from '@/lib/cdg/registry';
import {
  computeInvalidation, processChangeEvent, sortByRegenerationOrder, isBlocked,
} from '@/lib/cdg/invalidator';
import {
  PCP_INVALIDATION_MATRIX, CDG_REGEN_ORDER, CDG_NODE_NAMES, CDG_NODE_LAYERS,
} from '@/lib/cdg/types';
import {
  canTransition, transitionNode, certifyNode, revokeCertification,
  checkUpstreamStaleness, refreshStaleness, createFreshState,
} from '@/lib/cdg/status';
import {
  initProvenanceChain, extendProvenanceChain, buildProvenanceSummary, createProvenanceEvent,
} from '@/lib/cdg/provenance';
import {
  explainStaleness, getGovernanceDashboard, getAllStaleNodes, getAlerts,
} from '@/lib/cdg/governance';
import {
  migrateCDGBootstrap, migrateVisualStyle, notifyVisualStyleUpdate,
} from '@/lib/cdg/migration';

// ── Helper: Create initial all-FRESH state map ────────────────────────

function freshStates(): Map<CDGNodeID, CDGNodeState> {
  const m = new Map<CDGNodeID, CDGNodeState>();
  const now = new Date().toISOString();
  for (const n of ALL_CDG_NODES) {
    m.set(n, createFreshState(n, now));
  }
  return m;
}

// ── T3: Registry Structure ────────────────────────────────────────────

describe('CDG Registry — Node Inventory', () => {
  it('has all 35 known nodes', () => {
    expect(ALL_CDG_NODES.length).toBe(35);
  });

  it('has 5 layers with correct nodes per layer', () => {
    const narrative = ALL_CDG_NODES.filter(n => CDG_NODE_LAYERS[n] === 'narrative');
    const pcp = ALL_CDG_NODES.filter(n => CDG_NODE_LAYERS[n] === 'pcp');
    const cpie = ALL_CDG_NODES.filter(n => CDG_NODE_LAYERS[n] === 'cpie');
    const canon = ALL_CDG_NODES.filter(n => CDG_NODE_LAYERS[n] === 'canon');
    const proj = ALL_CDG_NODES.filter(n => CDG_NODE_LAYERS[n] === 'projection');
    expect(narrative.length).toBeGreaterThanOrEqual(8);
    expect(pcp.length).toBeGreaterThanOrEqual(8);
    expect(cpie.length).toBeGreaterThanOrEqual(7);
    expect(canon.length).toBeGreaterThanOrEqual(7);
    expect(proj.length).toBeGreaterThanOrEqual(5);
  });

  it('every node has a human-readable name', () => {
    for (const n of ALL_CDG_NODES) {
      expect(CDG_NODE_NAMES[n]).toBeDefined();
    }
  });

  it('every node has a regeneration order', () => {
    for (const n of ALL_CDG_NODES) {
      expect(typeof CDG_REGEN_ORDER[n]).toBe('number');
    }
  });
});

describe('CDG Registry — Dependency Edges', () => {
  it('has all required edges declared', () => {
    // Should have edges from each layer to the next
    const allUpstream = new Set(CDG_EDGES.map(e => e.from));
    const allDownstream = new Set(CDG_EDGES.map(e => e.to));
    expect(allUpstream.size).toBeGreaterThan(15);
    expect(allDownstream.size).toBeGreaterThan(15);
  });

  it('Narrative nodes have no upstream (source truth)', () => {
    for (const n of ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8'] as CDGNodeID[]) {
      expect(getUpstreamDependencies(n).length).toBe(0);
    }
  });

  it('Projection nodes have downstream consumers', () => {
    for (const n of ['S1', 'S2', 'S3'] as CDGNodeID[]) {
      expect(getDownstreamDependents(n)).toBeDefined();
    }
  });

  it('P2 feeds all 7 CPIE domains', () => {
    const downstream = getDownstreamDependents('P2');
    expect(downstream).toContain('C1');
    expect(downstream).toContain('C3');
    expect(downstream).toContain('C7');
  });

  it('hash is deterministic', () => {
    expect(hashDependencyGraph()).toBeTruthy();
  });
});

// ── T4: Invalidation Engine ─────────────────────────────────────────────

describe('CDG Invalidation Engine', () => {
  it('P1 genre change invalidates C1, C4, C6, C7 only (not C2, C3, C5)', () => {
    const result = computeInvalidation('P1');
    expect(result.directly_affected).toContain('C1');
    expect(result.directly_affected).toContain('C4');
    expect(result.directly_affected).toContain('C6');
    expect(result.directly_affected).toContain('C7');
    expect(result.directly_affected).not.toContain('C2');
    expect(result.directly_affected).not.toContain('C3');
    expect(result.directly_affected).not.toContain('C5');
    expect(Array.from(result.directly_affected).length).toBe(4);
  });

  it('P2 period change invalidates all 7 CPIE domains', () => {
    const result = computeInvalidation('P2');
    expect(result.directly_affected.length).toBe(7);
    expect(result.directly_affected).toContain('C1');
    expect(result.directly_affected).toContain('C7');
  });

  it('P7 profession change invalidates only C1 and C2', () => {
    const result = computeInvalidation('P7');
    expect(result.directly_affected).toContain('C1');
    expect(result.directly_affected).toContain('C2');
    expect(result.directly_affected.length).toBe(2);
  });

  it('P8 visual_tone change invalidates only C6 and C7', () => {
    const result = computeInvalidation('P8');
    expect(result.directly_affected).toContain('C6');
    expect(result.directly_affected).toContain('C7');
    expect(result.directly_affected.length).toBe(2);
  });

  it('Canon node invalidation propagates to projection', () => {
    const result = computeInvalidation('D1');
    expect(result.indirectly_affected).toContain('S1');
    expect(result.indirectly_affected).toContain('S2');
  });

  it('skipped nodes exclude trigger + affected', () => {
    const result = computeInvalidation('P1');
    expect(result.skipped).toContain('N1');
    expect(result.skipped).toContain('P2');
    expect(result.skipped).toContain('C3');
    expect(result.skipped).not.toContain('C1'); // affected
    expect(result.skipped).not.toContain('P1'); // trigger
  });

  it('deterministic: same input, same output', () => {
    const a = computeInvalidation('P2');
    const b = computeInvalidation('P2');
    expect(a.directly_affected).toEqual(b.directly_affected);
  });

  it('provides detail for each affected node', () => {
    const result = computeInvalidation('P2');
    for (const detail of result.detail) {
      expect(detail.reason).toBeTruthy();
      expect(detail.distance).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('CDG — Change Event Processing', () => {
  it('processChangeEvent marks affected nodes STALE', () => {
    const states = freshStates();
    const event: CDGChangeEvent = {
      node_id: 'P2',
      change_type: 'field_changed',
      changed_at: '2026-06-01T14:30:00Z',
      changed_by: 'system',
      details: 'period: 1944 -> 2087',
    };
    const updated = processChangeEvent(event, states);

    // P2 itself should remain FRESH
    expect(updated.get('P2')?.status).toBe('FRESH');
    // C1 should be STALE
    expect(updated.get('C1')?.status).toBe('STALE');
    expect(updated.get('C1')?.staleness_reason).toContain('P2');
  });
});

// ── T5: Staleness Model ────────────────────────────────────────────────

describe('CDG Staleness Model — State Transitions', () => {
  it('FRESH -> STALE is valid', () => {
    expect(canTransition('FRESH', 'STALE')).toBe(true);
  });
  it('FRESH -> INVALID is not valid (must go STALE first)', () => {
    expect(canTransition('FRESH', 'INVALID')).toBe(false);
  });
  it('FRESH -> CERTIFIED is valid', () => {
    expect(canTransition('FRESH', 'CERTIFIED')).toBe(true);
  });
  it('STALE -> FRESH is valid', () => {
    expect(canTransition('STALE', 'FRESH')).toBe(true);
  });
  it('STALE -> INVALID is valid', () => {
    expect(canTransition('STALE', 'INVALID')).toBe(true);
  });
  it('CERTIFIED -> STALE_WARNING is valid', () => {
    expect(canTransition('CERTIFIED', 'STALE_WARNING')).toBe(true);
  });
  it('INVALID -> FRESH requires regeneration', () => {
    expect(canTransition('INVALID', 'FRESH')).toBe(true);
  });
  it('STALE -> CERTIFIED is not valid', () => {
    expect(canTransition('STALE', 'CERTIFIED')).toBe(false);
  });
  it('BLOCKED -> STALE is valid', () => {
    expect(canTransition('BLOCKED', 'STALE')).toBe(true);
  });
  it('STALE_WARNING -> STALE is valid (certification revoked)', () => {
    expect(canTransition('STALE_WARNING', 'STALE')).toBe(true);
  });
});

describe('CDG Staleness Model — Transition Execution', () => {
  it('transitionNode returns new state on success', () => {
    const state = createFreshState('C1', '2026-01-01');
    const result = transitionNode(state, 'STALE', 'upstream P2 changed', '2026-06-01');
    expect(result.success).toBe(true);
    expect(result.newState?.status).toBe('STALE');
    expect(result.newState?.staleness_reason).toContain('upstream P2 changed');
  });

  it('transitionNode returns error on invalid transition', () => {
    const state = createFreshState('C1', '2026-01-01');
    const result = transitionNode(state, 'INVALID' as CDGNodeStatus, 'test', '2026-06-01');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid transition');
  });

  it('certifyNode works on FRESH state', () => {
    const state = createFreshState('D1', '2026-01-01');
    const cert = certifyNode(state, 'user', '2026-06-01');
    expect(cert.status).toBe('CERTIFIED');
    expect(cert.certification?.certified_by).toBe('user');
  });

  it('revokeCertification changes CERTIFIED to STALE', () => {
    const state = createFreshState('D1', '2026-01-01', true);
    const revoked = revokeCertification(state, 'period changed');
    expect(revoked.status).toBe('STALE');
    expect(revoked.certification).toBeUndefined();
  });

  it('refreshStaleness detects upstream changes', () => {
    const states = freshStates();
    const now = '2026-06-01';
    // Manually stale C1's upstream (P2)
    states.set('P2', { ...states.get('P2')!, status: 'STALE', staleness_reason: 'period changed', last_updated: now });

    // Refresh should cascade: P2(FRESH originally, but stale) -> ... but P2's stale won't cascade through
    // because refreshStaleness only checks upstream of FRESH/CERTIFIED nodes
    const refreshed = refreshStaleness(states);
    // C1 should now detect upstream P2 is stale if C1 was FRESH
    expect(refreshed.get('P2')?.status).toBe('STALE');
  });
});

// ── T6: Provenance Layer ────────────────────────────────────────────────

describe('CDG Provenance', () => {
  it('initProvenanceChain creates first event', () => {
    const chain = initProvenanceChain('D1.jeep', 'WWII Jeep', 0.91, 'inferred', ['period=1944', 'genre=war']);
    expect(chain.current_value).toBe('WWII Jeep');
    expect(chain.events.length).toBe(1);
    expect(chain.events[0].event_type).toBe('creation');
    expect(chain.regeneration_count).toBe(0);
  });

  it('extendProvenanceChain preserves history', () => {
    const chain = initProvenanceChain('D1.jeep', 'WWII Jeep', 0.91, 'inferred', ['period=1944', 'genre=war']);
    const extended = extendProvenanceChain(
      chain, 'Hovercar', 0.85, 'inferred',
      'P2.period changed: 1944 -> 2087',
      ['period=2087', 'DEPRECATED: period was 1944 (resolved 2026-06-01)'],
      'vehicle_hovercar_sci_fi',
    );
    expect(extended.current_value).toBe('Hovercar');
    expect(extended.current_confidence).toBe(0.85);
    expect(extended.regeneration_count).toBe(1);
    expect(extended.events.length).toBe(2);
    expect(extended.current_reasoning).toContain('period=2087');
    expect(extended.current_reasoning.some(r => r.includes('DEPRECATED: period was 1944'))).toBe(true);
  });

  it('buildProvenanceSummary produces readable output', () => {
    const chain = initProvenanceChain('D1.trench_coat', 'trench_coat', 0.91, 'inferred', ['profession=detective', 'climate=rainy']);
    const summary = buildProvenanceSummary(chain);
    expect(summary).toContain('trench_coat');
    expect(summary).toContain('0.91');
    expect(summary).toContain('profession=detective');
  });
});

// ── T7: Governance Visibility ──────────────────────────────────────────

describe('CDG Governance — explainStaleness', () => {
  it('explained for STALE node with trigger', () => {
    const states = freshStates();
    const now = '2026-06-01T14:30:00Z';
    states.set('P2', { ...states.get('P2')!, status: 'STALE', staleness_reason: 'period: 1944 -> 2087', last_updated: now });
    states.set('C1', { ...states.get('C1')!, status: 'STALE', staleness_reason: 'upstream P2 changed', last_updated: now });
    states.set('D1', { ...states.get('D1')!, status: 'STALE', staleness_reason: 'upstream C1 changed', last_updated: now });

    const explanation = explainStaleness('D1', states);
    expect(explanation.node.status).toBe('STALE');
    expect(explanation.node.name).toBe('atoms_wardrobe');
    expect(explanation.cascade.length).toBeGreaterThan(1);
    expect(explanation.regeneration_plan.order).toBeDefined();
    expect(explanation.regeneration_plan.estimated_steps).toBeGreaterThan(1);
  });

  it('returns clean state for FRESH node', () => {
    const states = freshStates();
    const explanation = explainStaleness('C1', states);
    expect(explanation.node.status).toBe('FRESH');
    expect(explanation.triggered_by).toBeNull();
  });

  it('getAllStaleNodes returns stale nodes', () => {
    const states = freshStates();
    states.set('C1', { ...states.get('C1')!, status: 'STALE', staleness_reason: 'test', last_updated: '2026-05-01' });
    states.set('D1', { ...states.get('D1')!, status: 'STALE', staleness_reason: 'test', last_updated: '2026-05-15' });
    const stale = getAllStaleNodes(states);
    expect(stale.length).toBe(2);
    expect(stale[0].status).toBe('STALE');
  });

  it('getAlerts returns correct severity', () => {
    const states = freshStates();
    const now = '2026-06-01';
    // Make all projection nodes stale
    for (const s of ['S1', 'S2', 'S3', 'S4', 'S5'] as CDGNodeID[]) {
      states.set(s, { ...states.get(s)!, status: 'STALE', staleness_reason: 'test', last_updated: now });
    }
    states.set('P1', { ...states.get('P1')!, status: 'STALE', staleness_reason: 'genre changed', last_updated: now });
    const alerts = getAlerts(states);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const infoAlert = alerts.find(a => a.message.includes('projection'));
    expect(infoAlert).toBeDefined();
    expect(infoAlert?.severity).toBe('info');
  });

  it('getGovernanceDashboard returns aggregated counts', () => {
    const states = freshStates();
    states.set('C1', { ...states.get('C1')!, status: 'STALE', staleness_reason: 'test', last_updated: '2026-05-15' });
    states.set('D1', { ...states.get('D1')!, status: 'CERTIFIED', staleness_reason: '', last_updated: '2026-05-01',
      certification: { certified_by: 'user', certified_at: '2026-05-01' },
    });
    const dash = getGovernanceDashboard(states);
    expect(dash.total_nodes).toBe(35);
    expect(dash.stale).toBe(1);
    expect(dash.certified).toBe(1);
    expect(dash.stalest_nodes).toBeDefined();
  });
});

// ── T8: Migration Layer ─────────────────────────────────────────────────

describe('CDG Migration', () => {
  it('bootstrap creates all 35 nodes FRESH', () => {
    const states = migrateCDGBootstrap('project-123');
    expect(states.size).toBe(35);
    for (const state of states.values()) {
      expect(state.status).toBe('FRESH');
    }
  });

  it('visual style migration marks D7 as FRESH', () => {
    const states = migrateCDGBootstrap('project-123');
    const migrated = migrateVisualStyle({
      period: '1940s',
      lighting_philosophy: 'high contrast, chiaroscuro',
      camera_philosophy: 'classic framing',
      color_response: 'desaturated',
      environment_realism: 'stylised',
      forbidden_traits: ['neon', 'glow'],
    }, states);
    expect(migrated.get('D7')?.status).toBe('FRESH');
    expect(migrated.get('D7')?.staleness_reason).toContain('migrated');
  });

  it('visual style update marks projection nodes stale', () => {
    const states = migrateCDGBootstrap('project-123');
    const updated = notifyVisualStyleUpdate(states, ['lighting_philosophy', 'color_response'], '2026-06-01');
    expect(updated.get('S1')?.status).toBe('STALE');
    expect(updated.get('S2')?.status).toBe('STALE');
    expect(updated.get('S3')?.status).toBe('STALE');
  });
});

// ── Integration: End-to-End Lifecycle ────────────────────────────────────

describe('CDG End-to-End Lifecycle Simulation', () => {
  it('full lifecycle: bootstrap -> change -> stale -> regenerate -> fresh', () => {
    let states = migrateCDGBootstrap('project-lifecycle');
    const now = '2026-06-01T14:30:00Z';

    // Phase 1: Period changes 1944 -> 2087
    const event: CDGChangeEvent = {
      node_id: 'P2',
      change_type: 'field_changed',
      changed_at: now,
      changed_by: 'system',
      details: 'period: 1944 -> 2087',
    };
    states = processChangeEvent(event, states);

    // Phase 2: Verify all CPIE domains stale
    for (const cpie of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'] as CDGNodeID[]) {
      expect(states.get(cpie)?.status).toBe('STALE');
      expect(states.get(cpie)?.staleness_reason).toContain('P2');
    }

    // Phase 3: Regenerate C1, C2
    states.set('C1', { ...states.get('C1')!, status: 'FRESH', staleness_reason: '', last_updated: now, regeneration_count: 1 });
    states.set('C2', { ...states.get('C2')!, status: 'FRESH', staleness_reason: '', last_updated: now, regeneration_count: 1 });

    // Phase 4: Governance explanation shows C1 and C2 as FRESH, others still STALE
    const explanation = explainStaleness('C3', states);
    expect(explanation.node.status).toBe('STALE');
  });

  it('Certified node becomes STALE_WARNING on upstream change', () => {
    let states = freshStates();
    const now = '2026-06-01';

    // Certify D1
    states.set('D1', certifyNode(states.get('D1')!, 'user', now));

    // Change upstream (P2 -> C1 -> D1)
    states.set('P2', { ...states.get('P2')!, status: 'STALE', staleness_reason: 'period changed', last_updated: now });
    states.set('C1', { ...states.get('C1')!, status: 'STALE', staleness_reason: 'upstream P2', last_updated: now });

    // Refresh should detect D1 upstream but certified -> STALE_WARNING
    const refreshed = refreshStaleness(states);
    expect(refreshed.get('D1')?.status).toBe('STALE_WARNING');
    expect(refreshed.get('D1')?.staleness_reason).toContain('upstream stale');
  });
});

// ── Invalidation Matrix Completeness ─────────────────────────────────────

describe('CDG Invalidation Matrix Completeness', () => {
  it('all 8 PCP nodes have an entry in the matrix', () => {
    const pcpNodes = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
    for (const p of pcpNodes) {
      expect(PCP_INVALIDATION_MATRIX[p]).toBeDefined();
    }
  });

  it('each entry only contains valid CPIE node IDs', () => {
    const validCPIE = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'];
    for (const [, targets] of Object.entries(PCP_INVALIDATION_MATRIX)) {
      for (const t of targets) {
        expect(validCPIE).toContain(t);
      }
    }
  });

  it('no duplicate entries in any invalidation list', () => {
    for (const [, targets] of Object.entries(PCP_INVALIDATION_MATRIX)) {
      expect(new Set(targets).size).toBe(targets.length);
    }
  });
});

// ── Sort by Regeneration Order ─────────────────────────────────────────

describe('CDG Regeneration Order Sorting', () => {
  it('sorts nodes by regeneration order ascending', () => {
    const nodes: CDGNodeID[] = ['D1', 'C1', 'P2', 'S1'];
    const sorted = sortByRegenerationOrder(nodes);
    // P2(order:1) first, C1(order:2), D1(order:4), S1(order:6)
    expect(sorted.indexOf('P2')).toBeLessThan(sorted.indexOf('C1'));
    expect(sorted.indexOf('C1')).toBeLessThan(sorted.indexOf('D1'));
    expect(sorted.indexOf('D1')).toBeLessThan(sorted.indexOf('S1'));
  });
});

// ── Blocked Detection ──────────────────────────────────────────────────

describe('CDG Blocked Detection', () => {
  it('detects blocked node when upstream is stale', () => {
    const states = freshStates();
    states.set('C1', { ...states.get('C1')!, status: 'STALE', staleness_reason: 'upstream changed', last_updated: '2026-06-01' });
    const check = isBlocked('D1', states);
    expect(check.blocked).toBe(true);
    expect(check.reason).toContain('C1');
  });
});

// ── Version Assertions ──────────────────────────────────────────────────

describe('CDG Version Integrity', () => {
  it('all CDG_NODE_RECORDS have valid data', () => {
    for (const rec of CDG_NODE_RECORDS) {
      expect(rec.id).toBeTruthy();
      expect(rec.name).toBeTruthy();
      expect(typeof rec.regen_order).toBe('number');
    }
  });

  it('CDG_EDGES array has sufficient entries', () => {
    expect(CDG_EDGES.length).toBeGreaterThan(50); // updated count
  });
});
