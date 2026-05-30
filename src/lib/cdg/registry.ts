/** * CDG Registry — Hardcoded node registry with all dependency edges */
import type { CDGNodeID, CDGEdge } from './types';
import { CDG_NODE_LAYERS, CDG_NODE_NAMES, CDG_NODE_DESCRIPTIONS, CDG_REGEN_ORDER } from './types';

// Register all nodes
export type CDGNodeRecord = {
  id: CDGNodeID;
  layer: string;
  name: string;
  description: string;
  regen_order: number;
};

function makeRecord(id: CDGNodeID): CDGNodeRecord {
  return {
    id,
    layer: CDG_NODE_LAYERS[id],
    name: CDG_NODE_NAMES[id],
    description: (CDG_NODE_DESCRIPTIONS as Record<string, string>)[id] || CDG_NODE_NAMES[id],
    regen_order: CDG_REGEN_ORDER[id] ?? 99,
  };
}

export const ALL_CDG_NODES: CDGNodeID[] = [
  'N1','N2','N3','N4','N5','N6','N7','N8',
  'P1','P2','P3','P4','P5','P6','P7','P8',
  'C1','C2','C3','C4','C5','C6','C7',
  'D1','D2','D3','D4','D5','D6','D7',
  'S1','S2','S3','S4','S5',
];

export const CDG_NODE_RECORDS: CDGNodeRecord[] = ALL_CDG_NODES.map(n => makeRecord(n));

// Full dependency edges
export const CDG_EDGES: CDGEdge[] = [
  // N -> P (Narrative feeds PCP resolver)
  { from: 'N1', to: 'P1', dependency_type: 'direct', description: 'screenplay -> project_identity' },
  { from: 'N1', to: 'P2', dependency_type: 'direct', description: 'screenplay -> temporal_context' },
  { from: 'N1', to: 'P3', dependency_type: 'direct', description: 'screenplay -> geographic_context' },
  { from: 'N1', to: 'P5', dependency_type: 'direct', description: 'screenplay -> technology_context' },
  { from: 'N1', to: 'P8', dependency_type: 'direct', description: 'screenplay -> visual_context' },
  { from: 'N2', to: 'P2', dependency_type: 'direct', description: 'treatment -> temporal_context' },
  { from: 'N2', to: 'P8', dependency_type: 'direct', description: 'treatment -> visual_context' },
  { from: 'N3', to: 'P2', dependency_type: 'direct', description: 'story_outline -> temporal_context' },
  { from: 'N3', to: 'P7', dependency_type: 'direct', description: 'story_outline -> professional_context' },
  { from: 'N3', to: 'P8', dependency_type: 'direct', description: 'story_outline -> visual_context' },
  { from: 'N4', to: 'P2', dependency_type: 'direct', description: 'concept_brief -> temporal_context' },
  { from: 'N4', to: 'P8', dependency_type: 'direct', description: 'concept_brief -> visual_context' },
  { from: 'N5', to: 'P7', dependency_type: 'direct', description: 'character_bible -> professional_context' },
  { from: 'N6', to: 'P1', dependency_type: 'direct', description: 'canon_json -> project_identity' },
  { from: 'N6', to: 'P2', dependency_type: 'direct', description: 'canon_json -> temporal_context' },
  { from: 'N6', to: 'P3', dependency_type: 'direct', description: 'canon_json -> geographic_context' },
  { from: 'N6', to: 'P4', dependency_type: 'direct', description: 'canon_json -> cultural_context' },
  { from: 'N6', to: 'P6', dependency_type: 'direct', description: 'canon_json -> economic_context' },
  { from: 'N6', to: 'P5', dependency_type: 'direct', description: 'canon_json -> technology_context' },
  { from: 'N6', to: 'P7', dependency_type: 'direct', description: 'canon_json -> professional_context' },
  { from: 'N6', to: 'P8', dependency_type: 'direct', description: 'canon_json -> visual_context' },
  { from: 'N7', to: 'P1', dependency_type: 'direct', description: 'metadata -> project_identity' },
  { from: 'N8', to: 'P1', dependency_type: 'direct', description: 'user_input -> project_identity' },
  { from: 'N8', to: 'P2', dependency_type: 'direct', description: 'user_input -> temporal_context' },
  { from: 'N8', to: 'P3', dependency_type: 'direct', description: 'user_input -> geographic_context' },
  { from: 'N8', to: 'P7', dependency_type: 'direct', description: 'user_input -> professional_context' },
  { from: 'N8', to: 'P8', dependency_type: 'direct', description: 'user_input -> visual_context' },
  // P -> C (PCP context feeds CPIE inference)
  { from: 'P1', to: 'C7', dependency_type: 'direct', description: 'genre -> visual_language inference' },
  { from: 'P2', to: 'C1', dependency_type: 'direct', description: 'temporal -> wardrobe inference' },
  { from: 'P2', to: 'C2', dependency_type: 'direct', description: 'temporal -> prop inference' },
  { from: 'P2', to: 'C3', dependency_type: 'direct', description: 'temporal -> vehicle inference' },
  { from: 'P2', to: 'C4', dependency_type: 'direct', description: 'temporal -> creature inference' },
  { from: 'P2', to: 'C5', dependency_type: 'direct', description: 'temporal -> location inference' },
  { from: 'P2', to: 'C6', dependency_type: 'direct', description: 'temporal -> pd inference' },
  { from: 'P2', to: 'C7', dependency_type: 'direct', description: 'temporal -> vl inference' },
  { from: 'P3', to: 'C1', dependency_type: 'direct', description: 'geo -> wardrobe inference' },
  { from: 'P3', to: 'C4', dependency_type: 'direct', description: 'geo -> creature inference' },
  { from: 'P3', to: 'C5', dependency_type: 'direct', description: 'geo -> location inference' },
  { from: 'P3', to: 'C6', dependency_type: 'direct', description: 'geo -> pd inference' },
  { from: 'P3', to: 'C7', dependency_type: 'direct', description: 'geo -> vl inference' },
  { from: 'P4', to: 'C1', dependency_type: 'direct', description: 'culture -> wardrobe inference' },
  { from: 'P4', to: 'C5', dependency_type: 'direct', description: 'culture -> location inference' },
  { from: 'P4', to: 'C6', dependency_type: 'direct', description: 'culture -> pd inference' },
  { from: 'P4', to: 'C7', dependency_type: 'direct', description: 'culture -> vl inference' },
  { from: 'P5', to: 'C2', dependency_type: 'direct', description: 'tech -> prop inference' },
  { from: 'P5', to: 'C3', dependency_type: 'direct', description: 'tech -> vehicle inference' },
  { from: 'P5', to: 'C5', dependency_type: 'direct', description: 'tech -> location inference' },
  { from: 'P5', to: 'C6', dependency_type: 'direct', description: 'tech -> pd inference' },
  { from: 'P5', to: 'C7', dependency_type: 'direct', description: 'tech -> vl inference' },
  { from: 'P6', to: 'C2', dependency_type: 'direct', description: 'economy -> prop inference' },
  { from: 'P6', to: 'C5', dependency_type: 'direct', description: 'economy -> location inference' },
  { from: 'P6', to: 'C7', dependency_type: 'direct', description: 'economy -> vl inference' },
  { from: 'P7', to: 'C1', dependency_type: 'direct', description: 'profession -> wardrobe inference' },
  { from: 'P7', to: 'C2', dependency_type: 'direct', description: 'profession -> prop inference' },
  { from: 'P8', to: 'C6', dependency_type: 'direct', description: 'visual -> pd inference' },
  { from: 'P8', to: 'C7', dependency_type: 'direct', description: 'visual -> vl inference' },
  // C -> D (CPIE output feeds Canon)
  { from: 'C1', to: 'D1', dependency_type: 'direct', description: 'wardrobe inference -> atoms_wardrobe' },
  { from: 'C2', to: 'D2', dependency_type: 'direct', description: 'prop inference -> atoms_prop' },
  { from: 'C3', to: 'D3', dependency_type: 'direct', description: 'vehicle inference -> atoms_vehicle' },
  { from: 'C4', to: 'D4', dependency_type: 'direct', description: 'creature inference -> atoms_creature' },
  { from: 'C5', to: 'D5', dependency_type: 'direct', description: 'location inference -> atoms_location' },
  { from: 'C6', to: 'D6', dependency_type: 'direct', description: 'pd inference -> atoms_pd' },
  { from: 'C7', to: 'D7', dependency_type: 'direct', description: 'vl inference -> project_visual_style' },
  // D -> S (Canon feeds Projection)
  { from: 'D1', to: 'S1', dependency_type: 'direct', description: 'atoms_wardrobe -> hero_frames' },
  { from: 'D1', to: 'S2', dependency_type: 'direct', description: 'atoms_wardrobe -> lookbook' },
  { from: 'D2', to: 'S2', dependency_type: 'direct', description: 'atoms_prop -> lookbook' },
  { from: 'D3', to: 'S2', dependency_type: 'direct', description: 'atoms_vehicle -> lookbook' },
  { from: 'D4', to: 'S2', dependency_type: 'direct', description: 'atoms_creature -> lookbook' },
  { from: 'D5', to: 'S1', dependency_type: 'direct', description: 'atoms_location -> hero_frames' },
  { from: 'D5', to: 'S2', dependency_type: 'direct', description: 'atoms_location -> lookbook' },
  { from: 'D6', to: 'S2', dependency_type: 'direct', description: 'atoms_pd -> lookbook' },
  { from: 'D7', to: 'S1', dependency_type: 'direct', description: 'visual_style -> hero_frames' },
  { from: 'D7', to: 'S2', dependency_type: 'direct', description: 'visual_style -> lookbook' },
  { from: 'D7', to: 'S3', dependency_type: 'direct', description: 'visual_style -> vpb' },
  // P -> S (context hints — non-blocking)
  { from: 'P1', to: 'S1', dependency_type: 'context_hint', description: 'genre -> hero_frames (context)' },
  { from: 'P1', to: 'S2', dependency_type: 'context_hint', description: 'genre -> lookbook (context)' },
  { from: 'P2', to: 'S1', dependency_type: 'context_hint', description: 'period -> hero_frames (context)' },
  { from: 'P2', to: 'S2', dependency_type: 'context_hint', description: 'period -> lookbook (context)' },
  { from: 'P3', to: 'S1', dependency_type: 'context_hint', description: 'geo -> hero_frames (context)' },
  { from: 'P3', to: 'S2', dependency_type: 'context_hint', description: 'geo -> lookbook (context)' },
  { from: 'P7', to: 'S2', dependency_type: 'context_hint', description: 'profession -> lookbook (context)' },
  { from: 'P8', to: 'S1', dependency_type: 'context_hint', description: 'visual_tone -> hero_frames (context)' },
  { from: 'P8', to: 'S2', dependency_type: 'context_hint', description: 'visual_tone -> lookbook (context)' },
];

// Build upstream lookup
const _upstreamMap = new Map<CDGNodeID, CDGNodeID[]>();
const _downstreamMap = new Map<CDGNodeID, CDGNodeID[]>();

function initMaps(): void {
  for (const node of ALL_CDG_NODES) {
    _upstreamMap.set(node, []);
    _downstreamMap.set(node, []);
  }
  for (const edge of CDG_EDGES) {
    const u = _upstreamMap.get(edge.to)!;
    if (!u.includes(edge.from)) u.push(edge.from);
    const d = _downstreamMap.get(edge.from)!;
    if (!d.includes(edge.to)) d.push(edge.to);
  }
}
initMaps();

export function getUpstreamDependencies(nodeId: CDGNodeID): CDGNodeID[] {
  return _upstreamMap.get(nodeId) ?? [];
}

export function getDownstreamDependents(nodeId: CDGNodeID): CDGNodeID[] {
  return _downstreamMap.get(nodeId) ?? [];
}

export function getDirectUpstreamByType(nodeId: CDGNodeID): CDGEdge[] {
  return CDG_EDGES.filter(e => e.to === nodeId && e.dependency_type === 'direct');
}

/** Simple hash to detect changes */
export function hashDependencyGraph(): string {
  return CDG_EDGES.length.toString(16) + '-' + ALL_CDG_NODES.length.toString(16);
}
