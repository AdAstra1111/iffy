/**
 * CDG Types — Context Dependency Graph Node & Edge Definitions
 *
 * Canonical source: SESS-ARCH-0026 (Context Dependency Graph)
 *
 * The CDG defines:
 * - Every node across 5 layers (Narrative, PCP, CPIE, Canon, Projection)
 * - Every directed dependency edge (upstream -> downstream)
 * - Staleness status representations for every node
 * - Change event types that trigger invalidation
 *
 * Invariants:
 * - No hidden dependencies (ALL edges are declared)
 * - No implicit regeneration (every status transition has a trigger)
 * - Every stale state is explainable
 */

// Layer Definitions
export type CDGLayer = 'narrative' | 'pcp' | 'cpie' | 'canon' | 'projection';

export const CDG_LAYER_ORDER: CDGLayer[] = ['narrative', 'pcp', 'cpie', 'canon', 'projection'];

// All known node IDs
export type CDGNodeID =
  // Layer N - Narrative Truth
  | 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6' | 'N7' | 'N8'
  // Layer P - PCP
  | 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8'
  // Layer C - CPIE
  | 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7'
  // Layer D - Canon
  | 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7'
  // Layer S - Projection
  | 'S1' | 'S2' | 'S3' | 'S4' | 'S5';

// Layer map
export const CDG_NODE_LAYERS: Record<string, CDGLayer> = {
  N1: 'narrative', N2: 'narrative', N3: 'narrative', N4: 'narrative',
  N5: 'narrative', N6: 'narrative', N7: 'narrative', N8: 'narrative',
  P1: 'pcp', P2: 'pcp', P3: 'pcp', P4: 'pcp', P5: 'pcp', P6: 'pcp', P7: 'pcp', P8: 'pcp',
  C1: 'cpie', C2: 'cpie', C3: 'cpie', C4: 'cpie', C5: 'cpie', C6: 'cpie', C7: 'cpie',
  D1: 'canon', D2: 'canon', D3: 'canon', D4: 'canon', D5: 'canon', D6: 'canon', D7: 'canon',
  S1: 'projection', S2: 'projection', S3: 'projection', S4: 'projection', S5: 'projection',
};

// Human-readable names
export const CDG_NODE_NAMES: Record<string, string> = {
  N1: 'screenplay', N2: 'treatment', N3: 'story_outline',
  N4: 'concept_brief', N5: 'character_bible', N6: 'project_canon',
  N7: 'project_metadata', N8: 'user_input',
  P1: 'project_identity', P2: 'temporal_context', P3: 'geographic_context',
  P4: 'cultural_context', P5: 'technology_context', P6: 'economic_context',
  P7: 'professional_context', P8: 'visual_context',
  C1: 'cpie_wardrobe', C2: 'cpie_prop', C3: 'cpie_vehicle',
  C4: 'cpie_creature', C5: 'cpie_location', C6: 'cpie_pd', C7: 'cpie_vl',
  D1: 'atoms_wardrobe', D2: 'atoms_prop', D3: 'atoms_vehicle',
  D4: 'atoms_creature', D5: 'atoms_location', D6: 'atoms_pd', D7: 'project_visual_style',
  S1: 'hero_frames', S2: 'lookbook_sections', S3: 'vpb', S4: 'storyboards', S5: 'video_generation',
};
export const CDG_NODE_DESCRIPTIONS: Record<string, string> = {
  N1: 'Screenplay document — narrative truth source',
  N2: 'Treatment document — narrative truth source',
  N3: 'Story outline document — narrative truth source',
  N4: 'Concept brief document — narrative truth source',
  N5: 'Character bible document — narrative truth source',
  N6: 'Project canon (canon_json) — canonical narrative truth',
  N7: 'Project metadata (genre_tags, format, etc.)',
  N8: 'User-supplied manual overrides',
  P1: 'Project identity — genre, format, audience',
  P2: 'Temporal context — period, era, time markers',
  P3: 'Geographic context — region, biome, climate',
  P4: 'Cultural context — culture, norms, language',
  P5: 'Technology context — tech level, infrastructure',
  P6: 'Economic context — wealth, class, industry',
  P7: 'Professional context — profession map, institutions',
  P8: 'Visual context — tone, style influences',
  C1: 'CPIE wardrobe inference output',
  C2: 'CPIE prop inference output',
  C3: 'CPIE vehicle inference output',
  C4: 'CPIE creature inference output',
  C5: 'CPIE location dressing inference output',
  C6: 'CPIE production design inference output',
  C7: 'CPIE visual language inference output',
  D1: 'Canonical wardrobe atoms (costume_atoms table)',
  D2: 'Canonical prop atoms (prop_atoms table)',
  D3: 'Canonical vehicle atoms (vehicle_atoms table)',
  D4: 'Canonical creature atoms (creature_atoms table)',
  D5: 'Canonical location atoms (location_atoms table)',
  D6: 'Canonical production design atoms',
  D7: 'Visual style canon (project_visual_style table)',
  S1: 'Hero frame images (project_images)',
  S2: 'Lookbook sections and images',
  S3: 'Visual Project Bible assembly',
  S4: 'Future: storyboard system',
  S5: 'Future: video generation system',
};


// Staleness Status
export type CDGNodeStatus = 'FRESH' | 'STALE' | 'STALE_WARNING' | 'INVALID' | 'BLOCKED' | 'CERTIFIED';

export interface CDGNodeState {
  node_id: CDGNodeID;
  status: CDGNodeStatus;
  last_updated: string;
  staleness_reason: string;
  certification?: {
    certified_by: string;
    certified_at: string;
    expires_at?: string;
  };
  regeneration_count: number;
}

// Change Event
export interface CDGChangeEvent {
  node_id: CDGNodeID;
  change_type: 'field_changed' | 'content_updated' | 'source_removed' | 'source_added';
  changed_at: string;
  changed_by: string;
  details: string;
  affected_fields?: string[];
}

// Dependency Edge
export interface CDGEdge {
  from: CDGNodeID;
  to: CDGNodeID;
  dependency_type: 'direct' | 'indirect' | 'context_hint';
  description: string;
}

// Regeneration Plan
export interface RegenerationStep {
  order: number;
  node_id: CDGNodeID;
  layer: CDGLayer;
  action: 'regenerate' | 'skip' | 'blocked';
  blocking_reason?: string;
}

export interface RegenerationPlan {
  triggered_by: CDGNodeID;
  changed_at: string;
  affected_nodes: number;
  skipped_nodes: number;
  total_estimation: number;
  steps: RegenerationStep[];
}

// Governance Explanation
export interface StalenessExplanation {
  node: { id: CDGNodeID; name: string; status: CDGNodeStatus };
  triggered_by: { node_id: CDGNodeID; change: string; changed_at: string } | null;
  cascade: Array<{ node_id: CDGNodeID; name: string; status: CDGNodeStatus; action: string }>;
  regeneration_plan: { order: number[]; estimated_steps: number; blocking: string[] };
  certification_status: string;
}

// PCP invalidation matrix
export const PCP_INVALIDATION_MATRIX: Record<string, string[]> = {
  P1: ['C1', 'C4', 'C6', 'C7'],
  P2: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
  P3: ['C1', 'C4', 'C5', 'C6', 'C7'],
  P4: ['C1', 'C5', 'C6', 'C7'],
  P5: ['C2', 'C3', 'C5', 'C6', 'C7'],
  P6: ['C2', 'C5', 'C6', 'C7'],
  P7: ['C1', 'C2'],
  P8: ['C6', 'C7'],
};

// Default regeneration order for each node
export const CDG_REGEN_ORDER: Record<string, number> = {
  N1: 0, N2: 0, N3: 0, N4: 0, N5: 0, N6: 0, N7: 0, N8: 0,
  P1: 1, P2: 1, P3: 1, P4: 1, P5: 1, P6: 1, P7: 1, P8: 1,
  C1: 2, C2: 2, C3: 2, C4: 2,
  C5: 3, C6: 3, C7: 3,
  D1: 4, D2: 4, D3: 4, D4: 4,
  D5: 5, D6: 5, D7: 5,
  S1: 6, S2: 6,
  S3: 7,
  S4: 6, S5: 7,
};
