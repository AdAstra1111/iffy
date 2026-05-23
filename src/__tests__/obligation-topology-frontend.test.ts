/**
 * Tests for: Frontend updates for compute-obligation-topology new response shape
 *
 * Commit dae6e46 — Updates frontend to read the new response shape:
 *   data.topology (ObligationTopologyResult) instead of the old flat response.
 *
 * Files changed:
 *   - src/lib/obligation-topology-types.ts (NEW)
 *   - src/hooks/useObligationTopology.ts (REWRITTEN)
 *   - src/components/devengine/ObligationTopologyHeatmap.tsx (REWRITTEN)
 *   - src/components/devengine/ObligationTopologyTooltip.tsx (REWRITTEN)
 *   - src/components/devengine/SceneGraphPanel.tsx (PATCHED)
 */
import { describe, it, expect, vi } from 'vitest';
import { deriveSceneMetrics } from '../lib/obligation-topology-types';
import type { ObligationTopologyNode, ObligationTopologyEdge, ObligationType, LifecycleState } from '../lib/obligation-topology-types';

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

const TYPES_PATH = '/Users/laralane/code/iffy/src/lib/obligation-topology-types.ts';
const HOOK_PATH = '/Users/laralane/code/iffy/src/hooks/useObligationTopology.ts';
const HEATMAP_PATH = '/Users/laralane/code/iffy/src/components/devengine/ObligationTopologyHeatmap.tsx';
const TOOLTIP_PATH = '/Users/laralane/code/iffy/src/components/devengine/ObligationTopologyTooltip.tsx';
const SCENE_GRAPH_PATH = '/Users/laralane/code/iffy/src/components/devengine/SceneGraphPanel.tsx';

// ───────────────────────────────────────────────────────────────────────────
// Section 1: deriveSceneMetrics unit tests
// ───────────────────────────────────────────────────────────────────────────

describe('deriveSceneMetrics — obligation-topology-types.ts', () => {

  // Helper: create a node
  function makeNode(sceneKey: string, entityCount = 3, actId = 'act_1', title = 'Scene'): ObligationTopologyNode {
    return { scene_key: sceneKey, act_id: actId, title, entity_count: entityCount };
  }

  // Helper: create an edge
  function makeEdge(source: string, target: string, type: ObligationType = 'setup', charge = 0.5, lifecycle: LifecycleState = 'active'): ObligationTopologyEdge {
    return { source, target, type, charge, lifecycle_state: lifecycle };
  }

  // ── Happy path ──────────────────────────────────────────────────────────

  it('computes per-scene metrics from nodes and edges', () => {
    const nodes = [
      makeNode('s1', 4, 'act_1', 'Scene 1'),
      makeNode('s2', 6, 'act_1', 'Scene 2'),
    ];
    const edges = [
      makeEdge('s1', 's2', 'setup', 0.8, 'active'),
      makeEdge('s1', 's3', 'escalation', 0.6, 'active'),
      makeEdge('s2', 's3', 'payoff', 0.5, 'discharged'),
    ];

    const metrics = deriveSceneMetrics(nodes, edges);

    // s1: 2 outgoing edges (0.8 + 0.6) / 2 = 0.70
    expect(metrics['s1']).toEqual({
      entityCount: 4,
      totalObligations: 2,
      avgCharge: 0.70,
      activeObligations: 2,
    });

    // s2: 1 outgoing edge (0.5) / 1 = 0.50, lifecycle is 'discharged' so 0 active
    expect(metrics['s2']).toEqual({
      entityCount: 6,
      totalObligations: 1,
      avgCharge: 0.50,
      activeObligations: 0,
    });
  });

  // ── Edge case: empty nodes ─────────────────────────────────────────────

  it('returns empty record for empty nodes array', () => {
    expect(deriveSceneMetrics([], [])).toEqual({});
  });

  // ── Edge case: node with no outgoing edges ─────────────────────────────

  it('returns zero values for a node with no outgoing edges', () => {
    const nodes = [makeNode('orphan', 3)];
    const edges = [makeEdge('other', 'elsewhere', 'setup', 0.5, 'active')];
    // 'orphan' has no outgoing edges → avgCharge = 0, totalObligations = 0
    const metrics = deriveSceneMetrics(nodes, edges);
    expect(metrics['orphan']).toEqual({
      entityCount: 3,
      totalObligations: 0,
      avgCharge: 0,
      activeObligations: 0,
    });
  });

  // ── Edge case: all lifecycle states accounted for ──────────────────────

  it('counts only active lifecycle_state in activeObligations', () => {
    const nodes = [makeNode('s1', 2)];
    const edges = [
      makeEdge('s1', 't1', 'setup', 0.5, 'active'),
      makeEdge('s1', 't2', 'setup', 0.5, 'discharging'),
      makeEdge('s1', 't3', 'setup', 0.5, 'discharged'),
      makeEdge('s1', 't4', 'setup', 0.5, 'loaded'),
    ];
    const metrics = deriveSceneMetrics(nodes, edges);
    expect(metrics['s1'].activeObligations).toBe(1);
    expect(metrics['s1'].totalObligations).toBe(4);
  });

  // ── Invariant: avgCharge rounded to 2 decimal places ───────────────────

  it('rounds avgCharge to 2 decimal places', () => {
    const nodes = [makeNode('s1', 1)];
    // 0.333 * 3 = 1.0 → 1.0 / 3 = 0.333... → rounds to 0.33
    const edges = [
      makeEdge('s1', 't1', 'setup', 0.33, 'active'),
      makeEdge('s1', 't2', 'setup', 0.33, 'active'),
      makeEdge('s1', 't3', 'setup', 0.34, 'active'),
    ];
    const metrics = deriveSceneMetrics(nodes, edges);
    // 0.33 + 0.33 + 0.34 = 1.0 / 3 = 0.333... → Math.round(33.333...)/100 = 0.33
    expect(metrics['s1'].avgCharge).toBe(0.33);
  });

  // ── Edge case: single edge with very high charge ───────────────────────

  it('handles single edge with charge 1.0 correctly', () => {
    const nodes = [makeNode('s1', 5)];
    const edges = [makeEdge('s1', 't1', 'resolution', 1.0, 'discharged')];
    const metrics = deriveSceneMetrics(nodes, edges);
    expect(metrics['s1']).toEqual({
      entityCount: 5,
      totalObligations: 1,
      avgCharge: 1.0,
      activeObligations: 0,
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Section 2: obligation-topology-types.ts static checks
// ───────────────────────────────────────────────────────────────────────────

describe('obligation-topology-types.ts — source integrity', () => {

  it('defines ObligationType with all 6 values', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(TYPES_PATH, 'utf-8');
    // The type union must include all 6 obligation types
    expect(src).toContain("'setup'");
    expect(src).toContain("'payoff'");
    expect(src).toContain("'escalation'");
    expect(src).toContain("'reversal'");
    expect(src).toContain("'resolution'");
    expect(src).toContain("'continuity'");
  });

  it('defines LifecycleState with all 4 states', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(TYPES_PATH, 'utf-8');
    expect(src).toContain("'loaded'");
    expect(src).toContain("'active'");
    expect(src).toContain("'discharging'");
    expect(src).toContain("'discharged'");
  });

  it('exports deriveSceneMetrics function', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(TYPES_PATH, 'utf-8');
    expect(src).toContain('export function deriveSceneMetrics');
  });

  it('types mirror edge function shared types (ObligationTopologyResult structure)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(TYPES_PATH, 'utf-8');
    // ObligationTopologyResult must have obligations[] and topology { nodes, edges, metrics }
    expect(src).toContain('ObligationTopologyResult');
    expect(src).toContain('obligations');
    expect(src).toContain('source_scene_key');
    expect(src).toContain('target_scene_key');
    expect(src).toContain('thread_label');
  });

  it('defines SceneObligationMetrics with all 4 fields', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(TYPES_PATH, 'utf-8');
    expect(src).toContain('SceneObligationMetrics');
    expect(src).toContain('entityCount');
    expect(src).toContain('totalObligations');
    expect(src).toContain('avgCharge');
    expect(src).toContain('activeObligations');
  });

  it('stale comment on line 7 references wrong source — non-blocking cosmetic', async () => {
    const fs = await import('fs');
    const lines = fs.readFileSync(TYPES_PATH, 'utf-8').split('\n');
    const line7 = lines[6]; // 0-indexed
    // Note: This is a cosmetic issue flagged in review — comment says "re-exported from useObligationData.ts"
    // but these types are self-defined, not re-exported.
    expect(line7).toMatch(/re-exported/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Section 3: useObligationTopology.ts static checks
// ───────────────────────────────────────────────────────────────────────────

describe('useObligationTopology.ts — source integrity', () => {

  it('reads data.topology as ObligationTopologyResult', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');
    // Must cast data?.topology as ObligationTopologyResult
    expect(src).toContain('data?.topology as ObligationTopologyResult');
  });

  it('imports deriveSceneMetrics from obligation-topology-types', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');
    expect(src).toContain("import { deriveSceneMetrics } from '@/lib/obligation-topology-types'");
  });

  it('calls deriveSceneMetrics with topology.nodes and topology.edges', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');
    expect(src).toContain('deriveSceneMetrics(result.topology.nodes, result.topology.edges)');
  });

  it('has SetStates call for topology and states', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');
    expect(src).toContain('setTopology(result)');
    expect(src).toContain('setStates(deriveSceneMetrics');
  });

  it('returns early if no projectId or empty sceneIds', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');
    expect(src).toContain('if (!projectId || sceneIds.length === 0) return');
  });

  it('skips processing when result?.topology?.nodes is missing', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');
    // Guard check: only process if nodes and edges exist
    expect(src).toContain('result?.topology?.nodes && result?.topology?.edges');
  });

  it('aborts in-flight request on refetch', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');
    expect(src).toContain('abortRef.current.abort()');
    expect(src).toContain('abortRef.current = new AbortController()');
  });

  it('silently handles AbortError', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');
    // AbortError should return early without setting error state
    expect(src).toContain("err.name === 'AbortError'");
  });

  it('uses AbortController via useRef', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');
    expect(src).toContain('const abortRef = useRef<AbortController | null>(null)');
  });

  it('returns UseObligationTopologyReturn with states, topology, isLoading, error, refetch', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');
    expect(src).toContain('states: Record<string, SceneObligationMetrics>');
    expect(src).toContain('topology: ObligationTopologyResult | null');
    expect(src).toContain('isLoading: boolean');
    expect(src).toContain('error: string | null');
    expect(src).toContain('refetch: () => void');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Section 4: ObligationTopologyHeatmap.tsx static checks
// ───────────────────────────────────────────────────────────────────────────

describe('ObligationTopologyHeatmap.tsx — source integrity', () => {

  it('accepts topology prop of type ObligationTopologyResult | null', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HEATMAP_PATH, 'utf-8');
    expect(src).toContain('topology: ObligationTopologyResult | null');
  });

  it('accepts states, sceneIds, isLoading, error, onRefetch props', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HEATMAP_PATH, 'utf-8');
    expect(src).toContain('states: Record<string, SceneObligationMetrics>');
    expect(src).toContain('sceneIds: string[]');
    expect(src).toContain('isLoading: boolean');
    expect(src).toContain('error: string | null');
    expect(src).toContain('onRefetch: () => void');
  });

  it('renders loading state with Loader2 spinner', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HEATMAP_PATH, 'utf-8');
    expect(src).toContain('if (isLoading)');
    expect(src).toContain('Loader2');
    expect(src).toContain('Computing narrative topology');
  });

  it('renders error state with Retry button', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HEATMAP_PATH, 'utf-8');
    expect(src).toContain('if (error)');
    expect(src).toContain('AlertTriangle');
    expect(src).toContain('onClick={onRefetch}');
  });

  it('renders empty state when no scenes', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HEATMAP_PATH, 'utf-8');
    expect(src).toContain('if (sceneIds.length === 0)');
    expect(src).toContain('No scenes to analyze');
  });

  it('displays 4 metric columns: Entities, Obligations, Avg Charge, Active', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HEATMAP_PATH, 'utf-8');
    expect(src).toContain("key: 'entityCount'");
    expect(src).toContain("key: 'totalObligations'");
    expect(src).toContain("key: 'avgCharge'");
    expect(src).toContain("key: 'activeObligations'");
    expect(src).toContain("label: 'Entities'");
    expect(src).toContain("label: 'Obligations'");
    expect(src).toContain("label: 'Avg Charge'");
    expect(src).toContain("label: 'Active'");
  });

  it('reads edges from topology?.topology?.edges', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HEATMAP_PATH, 'utf-8');
    expect(src).toContain('topology?.topology?.edges');
  });

  it('shows ObligationTopologyTooltip only for avgCharge metric', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HEATMAP_PATH, 'utf-8');
    expect(src).toContain("tooltipInfo.metric.key === 'avgCharge'");
  });

  it('passes correct props to ObligationTopologyTooltip', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HEATMAP_PATH, 'utf-8');
    expect(src).toContain('<ObligationTopologyTooltip');
    expect(src).toContain('metrics={tooltipInfo.metrics}');
    expect(src).toContain('edges={edges.filter');
    expect(src).toContain('sceneId={tooltipInfo.sceneId}');
    expect(src).toContain('position={{ x: tooltipInfo.x, y: tooltipInfo.y }}');
    expect(src).toContain('onClose={() => setTooltipInfo(null)}');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Section 5: ObligationTopologyTooltip.tsx static checks
// ───────────────────────────────────────────────────────────────────────────

describe('ObligationTopologyTooltip.tsx — source integrity', () => {

  it('accepts props: metrics, edges, sceneId, position, onClose', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(TOOLTIP_PATH, 'utf-8');
    expect(src).toContain('metrics: SceneObligationMetrics');
    expect(src).toContain('edges: ObligationTopologyEdge[]');
    expect(src).toContain('sceneId: string');
    expect(src).toContain('position: { x: number; y: number }');
    expect(src).toContain('onClose: () => void');
  });

  it('closes on outside click (mousedown)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(TOOLTIP_PATH, 'utf-8');
    expect(src).toContain("addEventListener('mousedown', handleClickOutside)");
  });

  it('closes on Escape key', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(TOOLTIP_PATH, 'utf-8');
    expect(src).toContain("addEventListener('keydown', handleKeyDown)");
    expect(src).toContain("if (e.key === 'Escape') onClose()");
  });

  it('displays all 3 summary metrics: obligations, active, entities', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(TOOLTIP_PATH, 'utf-8');
    expect(src).toContain('metrics.totalObligations');
    expect(src).toContain('metrics.activeObligations');
    expect(src).toContain('metrics.entityCount');
  });

  it('displays Avg Charge percentage', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(TOOLTIP_PATH, 'utf-8');
    expect(src).toContain('metrics.avgCharge');
    expect(src).toContain('Avg Charge');
  });

  it('shows up to 8 edges with a +more overflow indicator', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(TOOLTIP_PATH, 'utf-8');
    expect(src).toContain('edges.slice(0, 8)');
    expect(src).toContain('edges.length - 8');
    expect(src).toContain('more');
  });

  it('has empty state when no edges', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(TOOLTIP_PATH, 'utf-8');
    expect(src).toContain('edges.length === 0');
    expect(src).toContain('No outgoing obligation edges');
  });

  it('displays lifecycle badge colors for all 4 states', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(TOOLTIP_PATH, 'utf-8');
    expect(src).toContain("case 'active': return 'text-amber-500'");
    expect(src).toContain("case 'discharging': return 'text-blue-500'");
    expect(src).toContain("case 'discharged': return 'text-green-500'");
    expect(src).toContain("case 'loaded': return 'text-muted-foreground'");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Section 6: SceneGraphPanel.tsx integration checks
// ───────────────────────────────────────────────────────────────────────────

describe('SceneGraphPanel.tsx — integration with obligation topology', () => {

  it('imports ObligationTopologyHeatmap', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SCENE_GRAPH_PATH, 'utf-8');
    expect(src).toContain("import { ObligationTopologyHeatmap } from './ObligationTopologyHeatmap'");
  });

  it('imports useObligationTopology hook', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SCENE_GRAPH_PATH, 'utf-8');
    expect(src).toContain("import { useObligationTopology } from '@/hooks/useObligationTopology'");
  });

  it('calls useObligationTopology with projectId and sceneIds', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SCENE_GRAPH_PATH, 'utf-8');
    expect(src).toContain('useObligationTopology(projectId, sceneIds)');
  });

  it('derives sceneIds from sg.scenes', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SCENE_GRAPH_PATH, 'utf-8');
    expect(src).toContain("const sceneIds = useMemo(() => sg.scenes.map(s => s.scene_id), [sg.scenes])");
  });

  it('destructures all return values from useObligationTopology', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SCENE_GRAPH_PATH, 'utf-8');
    expect(src).toContain('states: topologyStates');
    expect(src).toContain('topology: topologyResult');
    expect(src).toContain('isLoading: topologyLoading');
    expect(src).toContain('error: topologyError');
    expect(src).toContain('refetch: topologyRefetch');
  });

  it('passes topologyResult to ObligationTopologyHeatmap', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SCENE_GRAPH_PATH, 'utf-8');
    expect(src).toContain('topology={topologyResult}');
  });

  it('places ObligationTopologyHeatmap in the Narrative tab (value="narrative")', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SCENE_GRAPH_PATH, 'utf-8');
    expect(src).toContain('TabsContent value="narrative"');
    expect(src).toContain('BarChart3 className="h-3 w-3" /> Narrative');
    expect(src).toContain('<ObligationTopologyHeatmap');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Section 7: Regression — existing functionality not broken
// ───────────────────────────────────────────────────────────────────────────

describe('Regression — existing SceneGraphPanel structure intact', () => {

  it('still has all 7 top-level tabs', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SCENE_GRAPH_PATH, 'utf-8');
    // Count tabs trigger values
    const tabTriggers = ['scenes', 'visual', 'changesets', 'qc', 'passes', 'canon', 'narrative'];
    for (const tab of tabTriggers) {
      expect(src).toContain(`TabsTrigger value="${tab}"`);
    }
  });

  it('still imports all required sub-components', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SCENE_GRAPH_PATH, 'utf-8');
    expect(src).toContain("import { VisualProductionPanel } from './VisualProductionPanel'");
    expect(src).toContain("import { ChangeSetsPanel } from './ChangeSetsPanel'");
    expect(src).toContain("import { QCPanel } from './QCPanel'");
    expect(src).toContain("import { PassesPanel } from './PassesPanel'");
    expect(src).toContain("import { CanonOSPanel } from './CanonOSPanel'");
  });

  it('still has all existing Dialog panels', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(SCENE_GRAPH_PATH, 'utf-8');
    expect(src).toContain('showInsertDialog');
    expect(src).toContain('showInactiveDrawer');
    expect(src).toContain('showActionHistory');
    expect(src).toContain('showSnapshotView');
  });
});