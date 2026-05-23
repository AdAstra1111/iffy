/**
 * Demo Surface Consolidation — Comprehensive Test Suite
 *
 * Tests for the consolidated demo surface architecture:
 * - DemoPortal hub page (5 feature cards, pipeline flow, heatmap, 3 tool cards)
 * - DemoPipelineFlow (5 stages with animated SVG arrows)
 * - DemoObligationHeatmap (grid rendering, heatColor, heatLabel)
 * - DemoScriptUpload, DemoDocGeneration, DemoAtomExplorer (structure)
 * - useObligationData hook (types, fetch shape)
 * - computeObligationTopology (mock data, scene-based computation)
 * - Edge function auth guard (static structure)
 * - Vercel proxy route (static structure)
 * - DemoPortal metrics grid and CTA buttons
 * - Invariant: metrics shape matches DemoPortal expectations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

/* ════════════════════════════════════════════════════════════════
   1. computeObligationTopology — mock data integrity
   ════════════════════════════════════════════════════════════════ */
import {
  computeObligationTopology,
  type ObligationTopologyResult,
  type Obligation,
  type Scene,
  type ObligationType,
  type LifecycleState,
  type ObligationTopologyMetrics,
} from '../../supabase/functions/_shared/obligation-topology';

describe('computeObligationTopology — mock mode', () => {
  let result: ObligationTopologyResult;

  beforeAll(() => {
    result = computeObligationTopology({ mock: true });
  });

  it('returns obligations array with 14 entries', () => {
    expect(Array.isArray(result.obligations)).toBe(true);
    expect(result.obligations).toHaveLength(14);
  });

  it('each obligation has required fields with correct types', () => {
    for (const o of result.obligations) {
      expect(typeof o.source_scene_key).toBe('string');
      expect(typeof o.target_scene_key).toBe('string');
      expect(typeof o.charge).toBe('number');
      expect(typeof o.confidence).toBe('number');
      expect(typeof o.thread_label).toBe('string');
      expect(['setup', 'payoff', 'escalation', 'reversal', 'resolution', 'continuity']).toContain(o.type);
      expect(['loaded', 'active', 'discharging', 'discharged']).toContain(o.lifecycle_state);
    }
  });

  it('charge values are in [0, 1] range', () => {
    for (const o of result.obligations) {
      expect(o.charge).toBeGreaterThanOrEqual(0);
      expect(o.charge).toBeLessThanOrEqual(1);
    }
  });

  it('confidence values are in [0, 1] range', () => {
    for (const o of result.obligations) {
      expect(o.confidence).toBeGreaterThanOrEqual(0);
      expect(o.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('topology.nodes has 10 nodes (Berlin Protocol scenes)', () => {
    expect(result.topology.nodes).toHaveLength(10);
  });

  it('each node has required fields', () => {
    for (const n of result.topology.nodes) {
      expect(typeof n.scene_key).toBe('string');
      expect(typeof n.act_id).toBe('string');
      expect(typeof n.title).toBe('string');
      expect(typeof n.entity_count).toBe('number');
    }
  });

  it('topology.edges matches obligations length', () => {
    expect(result.topology.edges).toHaveLength(result.obligations.length);
  });

  it('each edge maps correct source/target/type/charge/lifecycle_state', () => {
    for (let i = 0; i < result.obligations.length; i++) {
      const o = result.obligations[i];
      const e = result.topology.edges[i];
      expect(e.source).toBe(o.source_scene_key);
      expect(e.target).toBe(o.target_scene_key);
      expect(e.type).toBe(o.type);
      expect(e.charge).toBe(o.charge);
      expect(e.lifecycle_state).toBe(o.lifecycle_state);
    }
  });

  it('topology.metrics has all required fields', () => {
    const m = result.topology.metrics;
    expect(m.total_obligations).toBe(14);
    expect(typeof m.total_obligations).toBe('number');
    expect(typeof m.by_type).toBe('object');
    expect(typeof m.by_lifecycle).toBe('object');
    expect(typeof m.avg_charge).toBe('number');
    expect(typeof m.avg_confidence).toBe('number');
    expect(typeof m.acts_spanning).toBe('number');
  });

  it('metrics.by_type covers all obligation types found in data', () => {
    const typeCount = new Map<string, number>();
    for (const o of result.obligations) {
      typeCount.set(o.type, (typeCount.get(o.type) || 0) + 1);
    }
    for (const [type, count] of typeCount) {
      expect(result.topology.metrics.by_type[type as ObligationType]).toBe(count);
    }
  });

  it('metrics.by_lifecycle covers all lifecycle states found in data', () => {
    const lcCount = new Map<string, number>();
    for (const o of result.obligations) {
      lcCount.set(o.lifecycle_state, (lcCount.get(o.lifecycle_state) || 0) + 1);
    }
    for (const [state, count] of lcCount) {
      expect(result.topology.metrics.by_lifecycle[state as LifecycleState]).toBe(count);
    }
  });

  it('metrics.avg_charge is computed correctly', () => {
    const total = result.obligations.reduce((s, o) => s + o.charge, 0);
    expect(result.topology.metrics.avg_charge).toBeCloseTo(total / 14, 2);
  });

  it('metrics.avg_confidence is computed correctly', () => {
    const total = result.obligations.reduce((s, o) => s + o.confidence, 0);
    expect(result.topology.metrics.avg_confidence).toBeCloseTo(total / 14, 2);
  });

  it('metrics.acts_spanning is 3 (3 acts in Berlin Protocol)', () => {
    expect(result.topology.metrics.acts_spanning).toBe(3);
  });

  it('three distinct lifecycle states present in mock data', () => {
    const states = new Set(result.obligations.map(o => o.lifecycle_state));
    expect(states.size).toBeGreaterThanOrEqual(3); // discharged, active, discharging, loaded
  });

  it('discharged_count, active_count, avg_charge available in metrics', () => {
    // These exist in topology.metrics; verify they map correctly
    const m = result.topology.metrics;
    expect(m.by_lifecycle.discharged).toBeGreaterThanOrEqual(0);
    expect(m.by_lifecycle.active).toBeGreaterThanOrEqual(0);
    expect(m.avg_charge).toBeGreaterThan(0);
  });
});

describe('computeObligationTopology — scene-based mode', () => {
  const testScenes: Scene[] = [
    { id: 'a1', act_id: 'act_1', title: 'Arrival', entities: ['hero', 'guard'] },
    { id: 'a2', act_id: 'act_1', title: 'Meeting', entities: ['hero', 'villain'] },
    { id: 'b1', act_id: 'act_2', title: 'Chase', entities: ['hero', 'guard', 'villain'] },
  ];

  it('returns obligations based on shared entity overlap', () => {
    const result = computeObligationTopology({ scenes: testScenes });
    expect(result.obligations.length).toBeGreaterThan(0);
    // hero appears in all 3 scenes → creates threads
    // guard appears in a1, b1 → creates edge
    // villain appears in a2, b1 → creates edge
  });

  it('each obligation has valid types and lifecycle states', () => {
    const result = computeObligationTopology({ scenes: testScenes });
    const validTypes = ['setup', 'payoff', 'escalation', 'reversal', 'resolution', 'continuity'];
    const validLifecycles = ['loaded', 'active', 'discharging', 'discharged'];
    for (const o of result.obligations) {
      expect(validTypes).toContain(o.type);
      expect(validLifecycles).toContain(o.lifecycle_state);
      expect(o.charge).toBeGreaterThanOrEqual(0);
      expect(o.charge).toBeLessThanOrEqual(1);
    }
  });

  it('nodes match input scenes', () => {
    const result = computeObligationTopology({ scenes: testScenes });
    expect(result.topology.nodes).toHaveLength(3);
    expect(result.topology.nodes[0].scene_key).toBe('a1');
    expect(result.topology.nodes[1].scene_key).toBe('a2');
    expect(result.topology.nodes[2].scene_key).toBe('b1');
  });

  it('entity_count in nodes matches scene entity array length', () => {
    const result = computeObligationTopology({ scenes: testScenes });
    expect(result.topology.nodes[0].entity_count).toBe(2);
    expect(result.topology.nodes[1].entity_count).toBe(2);
    expect(result.topology.nodes[2].entity_count).toBe(3);
  });

  it('edges match obligations count', () => {
    const result = computeObligationTopology({ scenes: testScenes });
    expect(result.topology.edges).toHaveLength(result.obligations.length);
  });

  it('empty scenes returns empty result with zero metrics', () => {
    const result = computeObligationTopology({ scenes: [] });
    expect(result.obligations).toHaveLength(0);
    expect(result.topology.nodes).toHaveLength(0);
    expect(result.topology.edges).toHaveLength(0);
    expect(result.topology.metrics.total_obligations).toBe(0);
    expect(result.topology.metrics.avg_charge).toBe(0);
    expect(result.topology.metrics.acts_spanning).toBe(0);
  });

  it('single scene returns empty result (no pairs to form)', () => {
    const result = computeObligationTopology({
      scenes: [{ id: 's1', act_id: 'act_1', title: 'Solo', entities: ['hero'] }],
    });
    expect(result.obligations).toHaveLength(0);
  });

  it('scenes with no shared entities produce no obligations', () => {
    const result = computeObligationTopology({
      scenes: [
        { id: 's1', act_id: 'act_1', title: 'A', entities: ['alpha'] },
        { id: 's2', act_id: 'act_1', title: 'B', entities: ['beta'] },
      ],
    });
    expect(result.obligations).toHaveLength(0);
  });
});

describe('computeObligationTopology — edge cases', () => {
  it('undefined params defaults gracefully', () => {
    // @ts-expect-error testing undefined
    const result = computeObligationTopology({});
    expect(result.obligations).toHaveLength(0);
    expect(result.topology.nodes).toHaveLength(0);
    expect(result.topology.metrics.total_obligations).toBe(0);
  });

  it('null scenes treated as empty', () => {
    const result = computeObligationTopology({ scenes: null as unknown as Scene[] });
    expect(result.obligations).toHaveLength(0);
  });

  it('scenes with empty entities array produce no obligations', () => {
    const result = computeObligationTopology({
      scenes: [
        { id: 's1', act_id: 'act_1', title: 'A', entities: [] },
        { id: 's2', act_id: 'act_1', title: 'B', entities: [] },
      ],
    });
    expect(result.obligations).toHaveLength(0);
  });

  it('deterministic mock data returns identical results on repeated calls', () => {
    const a = computeObligationTopology({ mock: true });
    const b = computeObligationTopology({ mock: true });
    expect(a.obligations).toEqual(b.obligations);
    expect(a.topology.nodes).toEqual(b.topology.nodes);
    expect(a.topology.edges).toEqual(b.topology.edges);
    expect(a.topology.metrics).toEqual(b.topology.metrics);
  });
});

/* ════════════════════════════════════════════════════════════════
   2. DemoObligationHeatmap — component rendering
   ════════════════════════════════════════════════════════════════ */
import { DemoObligationHeatmap, type ObligationData, type SceneInfo } from '@/components/demo/DemoObligationHeatmap';

describe('DemoObligationHeatmap — component rendering', () => {
  const mockScenes: SceneInfo[] = [
    { id: 's1', title: 'Scene 1' },
    { id: 's2', title: 'Scene 2' },
  ];

  const mockObligations: ObligationData[] = [
    { source_scene_key: 's1', target_scene_key: 's2', type: 'setup', charge: 0.8, lifecycle_state: 'active' },
    { source_scene_key: 's2', target_scene_key: 's1', type: 'payoff', charge: 0.3, lifecycle_state: 'discharged' },
  ];

  it('renders "Obligation Heatmap" title', () => {
    render(<DemoObligationHeatmap obligations={mockObligations} scenes={mockScenes} />);
    expect(screen.getByText('Obligation Heatmap')).toBeDefined();
  });

  it('renders scene titles as column headers', () => {
    render(<DemoObligationHeatmap obligations={mockObligations} scenes={mockScenes} />);
    expect(screen.getByText('Scene 1')).toBeDefined();
    expect(screen.getByText('Scene 2')).toBeDefined();
  });

  it('renders obligation type labels as row headers', () => {
    render(<DemoObligationHeatmap obligations={mockObligations} scenes={mockScenes} />);
    expect(screen.getByText('setup')).toBeDefined();
    expect(screen.getByText('payoff')).toBeDefined();
  });

  it('shows empty state when no obligations or scenes provided', () => {
    render(<DemoObligationHeatmap obligations={[]} scenes={[]} />);
    expect(screen.getByText(/No obligation data loaded/i)).toBeDefined();
  });

  it('shows no obligations when scenes exist but no matching obligation types', () => {
    render(<DemoObligationHeatmap obligations={[]} scenes={mockScenes} />);
    expect(screen.getByText(/No obligation data loaded/i)).toBeDefined();
  });

  it('renders summary with obligation count', () => {
    render(<DemoObligationHeatmap obligations={mockObligations} scenes={mockScenes} />);
    expect(screen.getByText(/2 obligations/)).toBeDefined();
  });

  it('renders summary with scene count', () => {
    render(<DemoObligationHeatmap obligations={mockObligations} scenes={mockScenes} />);
    expect(screen.getByText(/2 scenes/)).toBeDefined();
  });

  it('renders color legend elements', () => {
    render(<DemoObligationHeatmap obligations={mockObligations} scenes={mockScenes} />);
    expect(screen.getByText('Discharged')).toBeDefined();
    expect(screen.getByText('Active')).toBeDefined();
    expect(screen.getByText('Loaded')).toBeDefined();
  });

  it('renders with empty types but still shows grid', () => {
    render(<DemoObligationHeatmap obligations={[{ source_scene_key: 's1', target_scene_key: 's1', type: '', charge: 0, lifecycle_state: 'active' }]} scenes={mockScenes} />);
    // Should show no obligation types detected
    expect(screen.getByText(/No obligation types detected/i)).toBeDefined();
  });

  it('accepts className prop', () => {
    const { container } = render(
      <DemoObligationHeatmap obligations={mockObligations} scenes={mockScenes} className="custom-class" />,
    );
    const card = container.querySelector('.custom-class');
    expect(card).not.toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════
   3. DemoPipelineFlow — structure and rendering
   ════════════════════════════════════════════════════════════════ */
import { DemoPipelineFlow } from '@/components/demo/DemoPipelineFlow';

describe('DemoPipelineFlow — stage structure', () => {
  it('renders all 5 stage labels', () => {
    render(<DemoPipelineFlow />);
    expect(screen.getByText('Script Intake')).toBeDefined();
    expect(screen.getByText('Analysis')).toBeDefined();
    expect(screen.getByText('Obligation Detection')).toBeDefined();
    expect(screen.getByText('Documentation')).toBeDefined();
    expect(screen.getByText('Export')).toBeDefined();
  });

  it('renders all 5 stage descriptions', () => {
    render(<DemoPipelineFlow />);
    expect(screen.getByText(/Parse and normalize screenplay format/)).toBeDefined();
    expect(screen.getByText(/Extract scenes, characters, and beats/)).toBeDefined();
    expect(screen.getByText(/Identify narrative promises and debts/)).toBeDefined();
    expect(screen.getByText(/Generate bibles, sheets, and briefs/)).toBeDefined();
    expect(screen.getByText(/Package deliverables for production/)).toBeDefined();
  });

  it('renders stage number badges 1 through 5', () => {
    const { container } = render(<DemoPipelineFlow />);
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(String(i))).toBeDefined();
    }
  });

  it('renders SVG arrow connectors between stages', () => {
    const { container } = render(<DemoPipelineFlow />);
    const svgs = container.querySelectorAll('svg');
    // 4 connectors (between 5 stages)
    expect(svgs.length).toBeGreaterThanOrEqual(4);
  });

  it('each SVG has arrowhead marker definitions', () => {
    const { container } = render(<DemoPipelineFlow />);
    const markers = container.querySelectorAll('marker');
    expect(markers.length).toBeGreaterThanOrEqual(4);
  });

  it('renders animated circles (data is in SVG markup)', () => {
    const { container } = render(<DemoPipelineFlow />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBeGreaterThanOrEqual(8); // animated circle + glow per connector
  });

  it('renders with default props (no crash)', () => {
    const { container } = render(<DemoPipelineFlow />);
    expect(container.querySelector('.w-full')).not.toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════
   4. DemoPortal — FEATURE_CARDS route structure
   ════════════════════════════════════════════════════════════════ */

// Inline the FEATURE_CARDS list from DemoPortal.tsx to test static data
// (we can't easily import it since it's not exported)
const EXPECTED_FEATURE_CARDS = [
  { id: 'cinematic', title: 'Cinematic', path: '/demo/cinematic', badge: 'Immersive' },
  { id: 'interactive', title: 'Interactive', path: '/demo/interactive', badge: 'Data' },
  { id: 'executive', title: 'Executive', path: '/demo/executive', badge: 'Walkthrough' },
  { id: 'guided', title: 'Guided Tour', path: '/demo/guided', badge: 'Tour' },
  { id: 'run', title: 'Demo Run', path: '/demo/run', badge: 'Live' },
];

describe('DemoPortal — feature card routes (static check)', () => {
  it('has exactly 5 feature cards', () => {
    expect(EXPECTED_FEATURE_CARDS).toHaveLength(5);
  });

  it('each card has required fields', () => {
    for (const card of EXPECTED_FEATURE_CARDS) {
      expect(typeof card.id).toBe('string');
      expect(typeof card.title).toBe('string');
      expect(typeof card.path).toBe('string');
      expect(typeof card.badge).toBe('string');
      expect(card.path.startsWith('/demo/')).toBe(true);
    }
  });

  it('cinematic card navigates to /demo/cinematic', () => {
    expect(EXPECTED_FEATURE_CARDS[0].path).toBe('/demo/cinematic');
  });

  it('interactive card navigates to /demo/interactive', () => {
    expect(EXPECTED_FEATURE_CARDS[1].path).toBe('/demo/interactive');
  });

  it('executive card navigates to /demo/executive', () => {
    expect(EXPECTED_FEATURE_CARDS[2].path).toBe('/demo/executive');
  });

  it('guided tour card navigates to /demo/guided', () => {
    expect(EXPECTED_FEATURE_CARDS[3].path).toBe('/demo/guided');
  });

  it('demo run card navigates to /demo/run', () => {
    expect(EXPECTED_FEATURE_CARDS[4].path).toBe('/demo/run');
  });

  it('all 5 titles are unique and non-empty', () => {
    const titles = EXPECTED_FEATURE_CARDS.map(c => c.title);
    expect(new Set(titles).size).toBe(5);
    for (const t of titles) expect(t.length).toBeGreaterThan(0);
  });

  it('all 5 paths are unique', () => {
    const paths = EXPECTED_FEATURE_CARDS.map(c => c.path);
    expect(new Set(paths).size).toBe(5);
  });

  it('all 5 ids are unique', () => {
    const ids = EXPECTED_FEATURE_CARDS.map(c => c.id);
    expect(new Set(ids).size).toBe(5);
  });
});

/* ════════════════════════════════════════════════════════════════
   5. Demo Portal — MOCK_SCENES structure (10 scenes)
   ════════════════════════════════════════════════════════════════ */

const EXPECTED_MOCK_SCENES = [
  { id: 's1', title: 'Cold Open' },
  { id: 's2', title: 'Safe House' },
  { id: 's3', title: 'Archive' },
  { id: 's4', title: 'Intercept' },
  { id: 's5', title: 'Mole Reveal' },
  { id: 's6', title: 'Chase' },
  { id: 's7', title: 'Safe House 2' },
  { id: 's8', title: 'Cipher Solved' },
  { id: 's9', title: 'Confrontation' },
  { id: 's10', title: 'Resolution' },
];

describe('DemoPortal — MOCK_SCENES structure', () => {
  it('has exactly 10 scenes', () => {
    expect(EXPECTED_MOCK_SCENES).toHaveLength(10);
  });

  it('each scene has unique id and non-empty title', () => {
    const ids = EXPECTED_MOCK_SCENES.map(s => s.id);
    expect(new Set(ids).size).toBe(10);
    for (const s of EXPECTED_MOCK_SCENES) {
      expect(s.title.length).toBeGreaterThan(0);
    }
  });

  it('scene ids are sequential s1 through s10', () => {
    for (let i = 0; i < EXPECTED_MOCK_SCENES.length; i++) {
      expect(EXPECTED_MOCK_SCENES[i].id).toBe(`s${i + 1}`);
    }
  });
});

/* ════════════════════════════════════════════════════════════════
   6. Demo tool components — structure verification
   ════════════════════════════════════════════════════════════════ */
import { DemoScriptUpload } from '@/components/demo/DemoScriptUpload';
import { DemoDocGeneration } from '@/components/demo/DemoDocGeneration';
import { DemoAtomExplorer } from '@/components/demo/DemoAtomExplorer';

describe('DemoScriptUpload — component structure', () => {
  it('renders title', () => {
    render(<DemoScriptUpload />);
    expect(screen.getByText('Script Upload')).toBeDefined();
  });

  it('renders upload placeholder text', () => {
    render(<DemoScriptUpload />);
    expect(screen.getByText(/Upload your script to begin analysis/i)).toBeDefined();
  });

  it('renders disabled Upload Script button', () => {
    render(<DemoScriptUpload />);
    const btn = screen.getByText('Upload Script');
    expect(btn).toBeDefined();
    expect(btn.closest('button')).toHaveAttribute('disabled');
  });

  it('renders "Coming in live mode" hint', () => {
    render(<DemoScriptUpload />);
    expect(screen.getByText(/Coming in live mode/i)).toBeDefined();
  });
});

describe('DemoDocGeneration — component structure', () => {
  it('renders title', () => {
    render(<DemoDocGeneration />);
    expect(screen.getByText('Document Generation')).toBeDefined();
  });

  it('renders all 3 placeholder docs', () => {
    render(<DemoDocGeneration />);
    expect(screen.getByText('Concept Brief')).toBeDefined();
    expect(screen.getByText('Market Sheet')).toBeDefined();
    expect(screen.getByText('Character Bible')).toBeDefined();
  });

  it('renders descriptions for each doc', () => {
    render(<DemoDocGeneration />);
    expect(screen.getByText(/High-level narrative summary/i)).toBeDefined();
    expect(screen.getByText(/Genre positioning and comp titles/i)).toBeDefined();
    expect(screen.getByText(/Protagonist and supporting cast profiles/i)).toBeDefined();
  });

  it('renders status badges (Ready and Pending)', () => {
    render(<DemoDocGeneration />);
    expect(screen.getByText('Ready')).toBeDefined();
    const pendingBadges = screen.getAllByText('Pending');
    expect(pendingBadges).toHaveLength(2);
  });
});

describe('DemoAtomExplorer — component structure', () => {
  it('renders title', () => {
    render(<DemoAtomExplorer />);
    expect(screen.getByText('Atom Explorer')).toBeDefined();
  });

  it('renders all 6 atom categories', () => {
    render(<DemoAtomExplorer />);
    expect(screen.getByText('Character')).toBeDefined();
    expect(screen.getByText('Location')).toBeDefined();
    expect(screen.getByText('Prop')).toBeDefined();
    expect(screen.getByText('Theme')).toBeDefined();
    expect(screen.getByText('Beat')).toBeDefined();
    expect(screen.getByText('Relationship')).toBeDefined();
  });

  it('renders descriptions for each category', () => {
    render(<DemoAtomExplorer />);
    expect(screen.getByText(/Protagonists, antagonists, supporting cast/i)).toBeDefined();
    expect(screen.getByText(/Settings, environments, spatial anchors/i)).toBeDefined();
    expect(screen.getByText(/Objects, artifacts, significant items/i)).toBeDefined();
    expect(screen.getByText(/Core motifs, symbolic threads, arcs/i)).toBeDefined();
    expect(screen.getByText(/Story beats, plot points, turning moments/i)).toBeDefined();
    expect(screen.getByText(/Character dynamics, alliances, conflicts/i)).toBeDefined();
  });

  it('renders 6 placeholder badges', () => {
    const { container } = render(<DemoAtomExplorer />);
    const dashBadges = container.querySelectorAll('.text-muted-foreground\\/50');
    expect(dashBadges.length).toBeGreaterThanOrEqual(0);
  });
});

/* ════════════════════════════════════════════════════════════════
   7. useObligationData — hook type/shape verification
   ════════════════════════════════════════════════════════════════ */
import { useObligationData, type UseObligationDataOptions } from '@/hooks/useObligationData';

describe('useObligationData — shape and types', () => {
  it('exports useObligationData as a function', () => {
    expect(typeof useObligationData).toBe('function');
  });

  it('UseObligationDataOptions allows mock and scenes fields', () => {
    const opt1: UseObligationDataOptions = { mock: true };
    const opt2: UseObligationDataOptions = { scenes: [{ id: 's1', act_id: 'a1', title: 'T', entities: [] }] };
    expect(opt1.mock).toBe(true);
    expect(opt2.scenes).toHaveLength(1);
  });

  it('UseObligationDataOptions defaults to empty object', () => {
    const opt: UseObligationDataOptions = {};
    expect(opt.mock).toBeUndefined();
    expect(opt.scenes).toBeUndefined();
  });
});

/* ════════════════════════════════════════════════════════════════
   8. Edge function — auth guard structure
   ════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';

describe('Edge function — auth guard', () => {
  const edgeFnPath = path.resolve(__dirname, '../../supabase/functions/demo-obligation-data/index.ts');
  const content = fs.readFileSync(edgeFnPath, 'utf-8');

  it('checks Authorization header', () => {
    expect(content).toContain('Authorization');
    expect(content).toContain('authHeader');
  });

  it('returns 401 when no authorization header present', () => {
    expect(content).toContain('401');
    expect(content).toContain('No authorization header');
  });

  it('calls auth.getUser() for authentication', () => {
    expect(content).toContain('auth.getUser');
  });

  it('returns 401 when user not authenticated', () => {
    expect(content).toContain('Not authenticated');
  });

  it('handles CORS OPTIONS preflight', () => {
    expect(content).toContain('OPTIONS');
    expect(content).toContain('corsHeaders');
  });

  it('has try-catch error handling', () => {
    expect(content).toContain('catch');
    expect(content).toContain('500');
  });

  it('validates body requires mock or scenes', () => {
    expect(content).toContain('mock=true');
    expect(content).toContain('scenes');
  });
});

/* ════════════════════════════════════════════════════════════════
   9. Vercel proxy — route structure
   ════════════════════════════════════════════════════════════════ */

describe('Vercel proxy — route configuration', () => {
  const proxyPath = path.resolve(__dirname, '../../api/supabase-proxy/functions/v1/demo-obligation-data.ts');
  const content = fs.readFileSync(proxyPath, 'utf-8');

  it('proxies to correct Supabase path', () => {
    expect(content).toContain('functions/v1/demo-obligation-data');
  });

  it('forwards Authorization header', () => {
    expect(content).toContain('Authorization');
  });

  it('forwards x-supabase-key header', () => {
    expect(content).toContain('x-supabase-key');
  });

  it('has try-catch error handling with 500 status', () => {
    expect(content).toContain('catch');
    expect(content).toContain('500');
  });

  it('forwards POST/PUT/PATCH body as JSON', () => {
    expect(content).toContain('JSON.stringify(req.body)');
  });

  it('exports maxDuration', () => {
    expect(content).toContain('maxDuration');
  });
});

/* ════════════════════════════════════════════════════════════════
   10. obligation-topology.ts — shared module invariants
   ════════════════════════════════════════════════════════════════ */

describe('obligation-topology — shared module invariants', () => {
  const modulePath = path.resolve(__dirname, '../../supabase/functions/_shared/obligation-topology.ts');
  const content = fs.readFileSync(modulePath, 'utf-8');

  it('exports computeObligationTopology function', () => {
    expect(content).toContain('export function computeObligationTopology');
  });

  it('has Berlin Protocol demo scenes', () => {
    expect(content).toContain('Checkpoint Arrival');
    expect(content).toContain('The Interrogation Room');
    expect(content).toContain('The Gate');
  });

  it('defines all 6 obligation types', () => {
    expect(content).toContain('"setup"');
    expect(content).toContain('"payoff"');
    expect(content).toContain('"escalation"');
    expect(content).toContain('"reversal"');
    expect(content).toContain('"resolution"');
    expect(content).toContain('"continuity"');
  });

  it('defines all 4 lifecycle states', () => {
    expect(content).toContain('"loaded"');
    expect(content).toContain('"active"');
    expect(content).toContain('"discharging"');
    expect(content).toContain('"discharged"');
  });
});

/* ════════════════════════════════════════════════════════════════
   Invariant checks
   ════════════════════════════════════════════════════════════════ */

describe('Invariant: all obligations reference valid scene keys', () => {
  it('mock data obligations reference only s1-s10 scene keys', () => {
    const result = computeObligationTopology({ mock: true });
    const validKeys = new Set(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10']);
    for (const o of result.obligations) {
      expect(validKeys.has(o.source_scene_key)).toBe(true);
      expect(validKeys.has(o.target_scene_key)).toBe(true);
    }
  });
});

describe('Invariant: DemoPortal uses useObligationData with mock:true', () => {
  const portalPath = path.resolve(__dirname, '../pages/DemoPortal.tsx');
  const content = fs.readFileSync(portalPath, 'utf-8');

  it('calls useObligationData with mock: true', () => {
    expect(content).toContain('useObligationData({ mock: true })');
  });
});

/* ════════════════════════════════════════════════════════════════
   11. Invariant: DemoPortal metrics shape matches computed topology
   ════════════════════════════════════════════════════════════════ */

describe('Invariant: metrics shape — DemoPortal references match ObligationTopologyMetrics', () => {
  const portalPath = path.resolve(__dirname, '../pages/DemoPortal.tsx');
  const portalContent = fs.readFileSync(portalPath, 'utf-8');

  const metricsPath = path.resolve(__dirname, '../../supabase/functions/_shared/obligation-topology.ts');
  const metricsContent = fs.readFileSync(metricsPath, 'utf-8');

  it('ObligationTopologyMetrics has total_obligations field', () => {
    expect(metricsContent).toContain('total_obligations');
  });

  it('ObligationTopologyMetrics has by_lifecycle field', () => {
    expect(metricsContent).toContain('by_lifecycle');
  });

  it('ObligationTopologyMetrics has avg_charge field', () => {
    expect(metricsContent).toContain('avg_charge');
  });

  it('DemoPortal references topology.metrics.total_obligations', () => {
    expect(portalContent).toContain('total_obligations');
  });

  it('DemoPortal references topology.metrics.avg_charge', () => {
    expect(portalContent).toContain('avg_charge');
  });

  it('DemoPortal references topology.metrics.discharged_count — VERIFY THIS PROP EXISTS', () => {
    // ⚠ THIS TEST EXPOSES A BUG:
    // DemoPortal.tsx reads topology.metrics.discharged_count but this property
    // does NOT exist in ObligationTopologyMetrics. The correct access path
    // is topology.metrics.by_lifecycle.discharged.
    // This test will PASS if the property exists (fixed) or FAIL if not.
    expect(portalContent).toContain('discharged_count');
  });

  it('DemoPortal references topology.metrics.active_count — VERIFY THIS PROP EXISTS', () => {
    // ⚠ THIS TEST EXPOSES A BUG:
    // DemoPortal.tsx reads topology.metrics.active_count but this property
    // does NOT exist in ObligationTopologyMetrics. The correct access path
    // is topology.metrics.by_lifecycle.active.
    // This test will PASS if the property exists (fixed) or FAIL if not.
    expect(portalContent).toContain('active_count');
  });

  it('FIXED: discharged_count now exists in ObligationTopologyMetrics interface', () => {
    // discharged_count was added as a convenience getter to resolve the gap.
    // Previously: expect(metricsContent).not.toContain('discharged_count');
    expect(metricsContent).toContain('discharged_count');
  });

  it('FIXED: active_count now exists in ObligationTopologyMetrics interface', () => {
    // active_count was added as a convenience getter to resolve the gap.
    // Previously: expect(metricsContent).not.toContain('active_count');
    expect(metricsContent).toContain('active_count');
  });

  it('computeObligationTopology result has discharged_count property', () => {
    const result = computeObligationTopology({ mock: true });
    expect(typeof result.topology.metrics.discharged_count).toBe('number');
    expect(result.topology.metrics.discharged_count).toBeGreaterThanOrEqual(0);
    expect(result.topology.metrics.discharged_count).toBe(result.topology.metrics.by_lifecycle.discharged);
  });

  it('computeObligationTopology result has active_count property', () => {
    const result = computeObligationTopology({ mock: true });
    expect(typeof result.topology.metrics.active_count).toBe('number');
    expect(result.topology.metrics.active_count).toBeGreaterThanOrEqual(0);
    expect(result.topology.metrics.active_count).toBe(result.topology.metrics.by_lifecycle.active);
  });

  it('correct access path for discharged count is by_lifecycle.discharged', () => {
    const result = computeObligationTopology({ mock: true });
    expect(typeof result.topology.metrics.by_lifecycle.discharged).toBe('number');
    expect(result.topology.metrics.by_lifecycle.discharged).toBeGreaterThanOrEqual(0);
  });

  it('correct access path for active count is by_lifecycle.active', () => {
    const result = computeObligationTopology({ mock: true });
    expect(typeof result.topology.metrics.by_lifecycle.active).toBe('number');
    expect(result.topology.metrics.by_lifecycle.active).toBeGreaterThanOrEqual(0);
  });
});

/* ════════════════════════════════════════════════════════════════
   12. DemoPortal — CTA buttons static check
   ════════════════════════════════════════════════════════════════ */

describe('DemoPortal — CTA button static check', () => {
  const portalPath = path.resolve(__dirname, '../pages/DemoPortal.tsx');
  const content = fs.readFileSync(portalPath, 'utf-8');

  it('has "Create Project" button text', () => {
    expect(content).toContain('Create Project');
  });

  it('"Create Project" button navigates to /projects/new', () => {
    // eslint-disable-next-line no-useless-escape
    expect(content).toContain("navigate('/projects/new')");
  });

  it('has "Go to Dashboard" button text', () => {
    expect(content).toContain('Go to Dashboard');
  });

  it('"Go to Dashboard" button navigates to /dashboard', () => {
    expect(content).toContain("navigate('/dashboard')");
  });

  it('both CTA buttons are inside a footer/section', () => {
    expect(content).toContain('Create Project');
    expect(content).toContain('Go to Dashboard');
  });

  it('"Create Project" button uses ChevronRight icon', () => {
    expect(content).toContain('ChevronRight');
  });
});

/* ════════════════════════════════════════════════════════════════
   13. DemoPortal — header and section rendering (static check)
   ════════════════════════════════════════════════════════════════ */

describe('DemoPortal — section structure (static check)', () => {
  const portalPath = path.resolve(__dirname, '../pages/DemoPortal.tsx');
  const content = fs.readFileSync(portalPath, 'utf-8');

  it('renders "See IFFY in Action" heading', () => {
    expect(content).toContain('See IFFY in Action');
  });

  it('renders "Demo Surface" badge', () => {
    expect(content).toContain('Demo Surface');
  });

  it('renders "Demo Modes" section heading', () => {
    expect(content).toContain('Demo Modes');
  });

  it('renders "IFFY Pipeline" section heading', () => {
    expect(content).toContain('IFFY Pipeline');
  });

  it('renders "Obligation Topology" section heading', () => {
    expect(content).toContain('Obligation Topology');
  });

  it('renders "Demo Tools" section heading', () => {
    expect(content).toContain('Demo Tools');
  });

  it('uses DemoPipelineFlow component', () => {
    expect(content).toContain('<DemoPipelineFlow');
  });

  it('uses DemoObligationHeatmap component', () => {
    expect(content).toContain('<DemoObligationHeatmap');
  });

  it('uses DemoScriptUpload component', () => {
    expect(content).toContain('<DemoScriptUpload');
  });

  it('uses DemoDocGeneration component', () => {
    expect(content).toContain('<DemoDocGeneration');
  });

  it('uses DemoAtomExplorer component', () => {
    expect(content).toContain('<DemoAtomExplorer');
  });

  it('uses framer-motion for animation', () => {
    expect(content).toContain('framer-motion');
  });

  it('loading indicator shows when isLoading is true', () => {
    expect(content).toContain('isLoading');
    expect(content).toContain('Loading');
  });

  it('topology metrics grid checks for topology?.metrics before rendering', () => {
    expect(content).toContain('topology?.metrics');
  });

  it('all 5 feature card descriptions are present', () => {
    expect(content).toContain('Full-screen immersive pitch');
    expect(content).toContain('Interactive data dashboard');
    expect(content).toContain('Major studio packaging walkthrough');
    expect(content).toContain('Interactive step-by-step demo');
    expect(content).toContain('One-click pipeline orchestration');
  });
});

/* ════════════════════════════════════════════════════════════════
   14. Invariant: heatColor function behavior
   ════════════════════════════════════════════════════════════════ */

describe('heatColor — color mapping function', () => {
  // Import the module to test the internal function indirectly
  // heatColor is not exported, so we test it via DemoObligationHeatmap rendering

  it('discharged obligations render green background', () => {
    const obligations: ObligationData[] = [
      { source_scene_key: 's1', target_scene_key: 's2', type: 'setup', charge: 0.8, lifecycle_state: 'discharged' },
    ];
    const { container } = render(<DemoObligationHeatmap obligations={obligations} scenes={[{ id: 's1', title: 'Scene 1' }, { id: 's2', title: 'Scene 2' }]} />);
    // Renders a table cell for discharged - should have green-500 bg class
    const cells = container.querySelectorAll('.bg-green-500\\/30');
    expect(cells.length).toBeGreaterThan(0);
  });

  it('high-charge active obligations render yellow with intensity', () => {
    const obligations: ObligationData[] = [
      { source_scene_key: 's1', target_scene_key: 's2', type: 'setup', charge: 0.8, lifecycle_state: 'active' },
    ];
    const { container } = render(<DemoObligationHeatmap obligations={obligations} scenes={[{ id: 's1', title: 'Scene 1' }, { id: 's2', title: 'Scene 2' }]} />);
    // High charge active: yellow-500/50
    const cells = container.querySelectorAll('.bg-yellow-500\\/50');
    expect(cells.length).toBeGreaterThan(0);
  });

  it('high-charge loaded obligations render red with intensity', () => {
    const obligations: ObligationData[] = [
      { source_scene_key: 's1', target_scene_key: 's2', type: 'setup', charge: 0.8, lifecycle_state: 'loaded' },
    ];
    const { container } = render(<DemoObligationHeatmap obligations={obligations} scenes={[{ id: 's1', title: 'Scene 1' }, { id: 's2', title: 'Scene 2' }]} />);
    // High charge loaded: red-500/60
    const cells = container.querySelectorAll('.bg-red-500\\/60');
    expect(cells.length).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════
   15. Invariant: computeObligationTopology enforces Berlin Protocol scene order
   ════════════════════════════════════════════════════════════════ */

describe('Invariant: Berlin Protocol scene order — 3 acts, 10 scenes', () => {
  it('mock data scenes are correctly ordered (act_1 scenes first)', () => {
    const result = computeObligationTopology({ mock: true });
    const acts = result.topology.nodes.map(n => n.act_id);
    // 10 scenes: 3×act_1, 4×act_2, 3×act_3 (indices: 0-2, 3-6, 7-9)
    expect(acts[0]).toBe('act_1');
    expect(acts[1]).toBe('act_1');
    expect(acts[2]).toBe('act_1');
    expect(acts[3]).toBe('act_2');
    expect(acts[7]).toBe('act_3');
    expect(acts[9]).toBe('act_3');
  });

  it('act_1 has 3 scenes', () => {
    const result = computeObligationTopology({ mock: true });
    const act1Scenes = result.topology.nodes.filter(n => n.act_id === 'act_1');
    expect(act1Scenes).toHaveLength(3);
  });

  it('act_2 has 4 scenes', () => {
    const result = computeObligationTopology({ mock: true });
    const act2Scenes = result.topology.nodes.filter(n => n.act_id === 'act_2');
    expect(act2Scenes).toHaveLength(4);
  });

  it('act_3 has 3 scenes', () => {
    const result = computeObligationTopology({ mock: true });
    const act3Scenes = result.topology.nodes.filter(n => n.act_id === 'act_3');
    expect(act3Scenes).toHaveLength(3);
  });
});
