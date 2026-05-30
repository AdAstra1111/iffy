/**
 * NCP Types — Narrative Context Package
 *
 * Phase 2A: Scene Plan + NCP + Sequence-Aware Generation
 *
 * These types define the structured narrative context that accompanies
 * a Scene Plan, enabling sequence-aware (rather than scene-isolated)
 * screenplay generation.
 *
 * All types are designed to be:
 * - LLM-friendly (the same call that generates the Scene Plan also generates NCP)
 * - Token-efficient (compressed JSON field names)
 * - Machine-readable (strict types, validated before use)
 */
export interface ScenePlanEntry {
  scene_number: number;
  act: number;
  slugline: string;
  location: string;
  time_of_day: string;
  characters_present: string[];
  source_beat_number: number;
  source_beat_title: string;
  summary: string;
  dramatic_purpose: string;
  scene_turn: string;
  scene_outcome: string;
  estimated_pages?: number;
  pov_character?: string;
  // Phase 2A additions:
  scene_function_type?: SceneFunctionType;
  character_goal?: string;
}

/**
 * 15 scene function types with structural template guidelines.
 * Each type implies a specific internal scene architecture
 * (dialogue-to-action ratio, pacing, dramatic structure).
 */
export type SceneFunctionType =
  | "exposition"
  | "conflict"
  | "reveal"
  | "aftermath"
  | "transition"
  | "set_piece"
  | "character_moment"
  | "confrontation"
  | "negotiation"
  | "discovery"
  | "suspense"
  | "reaction"
  | "preparation"
  | "montage"
  | "inciting_event";

/**
 * The root NCP produced alongside the Scene Plan.
 * Generated in the same single LLM call — not a separate pass.
 */
export interface NarrativeContextPackage {
  global_story_map: GlobalStoryMap;
  sequence_map: SequenceMapEntry[];
  causal_chain: CausalChainEntry[];
  tension_curve: TensionCurveEntry[];
  promise_registry: PromiseRegistryEntry[];
  scene_function_registry: SceneFunctionEntry[];
}

/**
 * L1: Global Story Map
 * The overarching narrative shape — every scene's position in the curve.
 * ~150 tokens in compressed JSON.
 */
export interface GlobalStoryMap {
  total_scenes: number;
  acts: ActDef[];
  key_positions: Record<string, number>;
  key_position_labels: Record<string, string>;
  trajectory: NarrativeTrajectory;
  three_sentence_summary: string;
}

export interface ActDef {
  act: number;
  function: string;
  scene_range: [number, number];
  turning_points: string[];
}

export type NarrativeTrajectory = "rising_falling" | "rising" | "oscillating";

/**
 * L2: Sequence Map
 * Groups scenes into dramatic mini-arcs (4-7 scenes each, 10-15 total).
 * ~400 tokens in compressed JSON.
 */
export interface SequenceMapEntry {
  number: number;
  name: string;
  purpose: SequencePurpose;
  scene_range: [number, number];
  beat_range: [number, number];
  scene_count: number;
  act: number;
  function_description: string;
  pacing_directive: PacingDirective;
}

export type SequencePurpose =
  | "establish"
  | "catalyst"
  | "escalate"
  | "complicate"
  | "reverse"
  | "reveal"
  | "confrontation"
  | "aftermath"
  | "build"
  | "climax"
  | "resolve"
  | "transition";

export type PacingDirective =
  | "slow"
  | "medium"
  | "fast"
  | "escalating"
  | "de-escalating"
  | "oscillating";

/**
 * L3: Causal Chain
 * Tracks WHY each scene happens — the causal through-line.
 * ~25 tokens per scene.
 */
export interface CausalChainEntry {
  scene_number: number;
  triggered_by_scene: number | null;
  trigger_event: string;
  protagonist_catalyst: string;
  enables_scene: number | null;
  downstream_effect: string;
}

/**
 * L4: Tension Curve
 * Per-scene tension values (1-10) with trajectory and contrast.
 * ~150 tokens total for up to 100 scenes.
 */
export interface TensionCurveEntry {
  scene_number: number;
  value: number;
  trajectory: TensionTrajectory;
  contrast: number;
}

export type TensionTrajectory =
  | "rising"
  | "sustaining"
  | "releasing"
  | "resetting"
  | "oscillating";

/**
 * L5: Promise Registry
 * Tracks setups, mysteries, props, and character traits
 * that need payoff — without requiring Story Events or NEC.
 * ~200 tokens for 15-25 promises.
 */
export interface PromiseRegistryEntry {
  id: string;
  type: PromiseType;
  description: string;
  setup_scene: number;
  expected_payoff_type: string;
  payoff_deadline_scene: number;
  status: "active" | "paid" | "abandoned";
}

export type PromiseType =
  | "character_trait"
  | "prop"
  | "statement"
  | "situation"
  | "relationship"
  | "mystery";

/**
 * L6: Scene Function Registry
 * Maps each scene to its function type.
 * ~30 tokens per scene.
 */
export interface SceneFunctionEntry {
  scene_number: number;
  function_type: SceneFunctionType;
  structure_guideline: string;
}

/** Response shape from generateScenePlanAndNCP() */
export interface ScenePlanWithNCP {
  scenes: ScenePlanEntry[];
  narrative_context: NarrativeContextPackage;
}

// ── Sequence Grouping Types ───────────────────────────────────────────────

/**
 * A sequence group as determined by the deterministic grouping algorithm.
 * Used by largeRiskRouter for chunk planning.
 */
export interface SequenceGroup {
  number: number;
  name: string;
  purpose: SequencePurpose;
  scene_range: [number, number];
  beat_range: [number, number];
  scene_count: number;
  act: number;
  function_description: string;
  pacing_directive: PacingDirective;
}

// ── Validation ────────────────────────────────────────────────────────────

export interface NCPValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate NarrativeContextPackage integrity.
 * Ensures all scenes are accounted for across all cross-referencing sections.
 */
export function validateNarrativeContext(
  ncp: NarrativeContextPackage,
  totalScenes: number
): NCPValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Helper: extract an array from a field that may be either array or object-with-sub-array
  function extractArray(val: any): any[] {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return val.scenes || val.entries || val.items || val.data || [];
  }

  if (!ncp.global_story_map) errors.push("global_story_map is required");
  if (!ncp.sequence_map || extractArray(ncp.sequence_map).length === 0) errors.push("sequence_map is required with at least 1 sequence");
  if (!ncp.causal_chain || extractArray(ncp.causal_chain).length === 0) errors.push("causal_chain is required with at least 1 entry");
  if (!ncp.tension_curve) errors.push("tension_curve is required with at least 1 entry");
  if (!ncp.promise_registry) warnings.push("promise_registry is optional — no promises tracked");
  if (!ncp.scene_function_registry || extractArray(ncp.scene_function_registry).length === 0) errors.push("scene_function_registry is required with at least 1 entry");

  // Validate sequence_map covers all scenes
  const seqArray = extractArray(ncp.sequence_map);
  if (seqArray.length > 0) {
    const seqSceneNums = new Set<number>();
    for (const seq of seqArray) {
      const [start, end] = seq.scene_range;
      for (let s = start; s <= end; s++) seqSceneNums.add(s);
    }
    for (let s = 1; s <= totalScenes; s++) {
      if (!seqSceneNums.has(s)) errors.push(`scene ${s} not covered by any sequence`);
    }
  }

  // Validate tension_curve covers all scenes
  const curveArray = extractArray(ncp.tension_curve);
  if (curveArray.length > 0) {
    const tensionNums = new Set(curveArray.map((t: any) => t.scene_number));
    for (let s = 1; s <= totalScenes; s++) {
      if (!tensionNums.has(s)) errors.push(`scene ${s} missing from tension_curve`);
    }
  }

  // Validate causal_chain covers all scenes
  const causalArray = extractArray(ncp.causal_chain);
  if (causalArray.length > 0) {
    const causalNums = new Set(causalArray.map((c: any) => c.scene_number));
    for (let s = 1; s <= totalScenes; s++) {
      if (!causalNums.has(s)) warnings.push(`scene ${s} missing from causal_chain`);
    }
  }

  // Validate scene_function_registry covers all scenes
  const funcArray = extractArray(ncp.scene_function_registry);
  if (funcArray.length > 0) {
    const funcNums = new Set(funcArray.map((f: any) => f.scene_number));
    for (let s = 1; s <= totalScenes; s++) {
      if (!funcNums.has(s)) errors.push(`scene ${s} missing from scene_function_registry`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── Sequence grouping constants ───────────────────────────────────────────

/**
 * Beat titles that mark mandatory sequence boundaries.
 * Based on Save the Cat beat sheet conventions.
 */
const KEY_TURNING_POINT_KEYWORDS = [
  "inciting",
  "lock in",
  "lock-in",
  "break into two",
  "break into 2",
  "midpoint",
  "false victory",
  "false defeat",
  "bad guys close in",
  "all is lost",
  "dark night",
  "break into three",
  "break into 3",
  "finale",
  "climax",
  "final image",
];

/**
 * Detect if a beat title indicates a key turning point.
 */
export function isKeyTurningPoint(beatTitle: string): boolean {
  const lower = (beatTitle || "").toLowerCase();
  return KEY_TURNING_POINT_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Default sequence purpose when no specific purpose is inferred.
 */
const SEQUENCE_PURPOSE_BY_POSITION: Record<string, SequencePurpose> = {
  "1_1": "establish",
  "1_2": "catalyst",
  "1_3": "escalate",
  "2_1": "escalate",
  "2_2": "complicate",
  "2_3": "reverse",
  "2_4": "complicate",
  "2_5": "reverse",
  "2_6": "aftermath",
  "3_1": "build",
  "3_2": "climax",
  "3_3": "resolve",
};

/**
 * Get default sequence purpose from act + sequence position within act.
 */
export function defaultPurposeForPosition(act: number, seqInAct: number): SequencePurpose {
  const key = `${act}_${seqInAct}`;
  return SEQUENCE_PURPOSE_BY_POSITION[key] || "transition";
}

const ACT_PACING_MAP: Record<number, PacingDirective> = {
  1: "medium",
  2: "escalating",
  3: "fast",
};

// ── Phase 2A.5 — Scene Expansion Plan Types ─────────────────────────────

export interface SceneExpansionPlan {
  total_scenes: number;
  per_act: ActSceneBudget[];
  per_beat: BeatSceneAllocation[];
  sequences: ExpansionSequence[];
  scene_slots: ExpansionSceneSlot[];
}

export interface ActSceneBudget {
  act: number;
  label: string;
  scene_count: number;
  percentage: number;
}

export interface BeatSceneAllocation {
  beat_number: number;
  beat_title: string;
  act: number;
  scene_count: number;
  is_major: boolean;
}

export interface ExpansionSequence {
  number: number;
  beat_numbers: number[];
  scene_range: [number, number];
  scene_count: number;
  act: number;
  purpose: SequencePurpose;
}

export interface ExpansionSceneSlot {
  scene_slot_number: number;
  act: number;
  source_beat_number: number;
  source_beat_title: string;
  function_type: string;
  sequence_hint: number;
  estimated_pages: number;
}

export interface ProjectMetadata {
  genre?: string;
  runtime_minutes?: number;
  major_character_count?: number;
  subplot_count?: number;
  complex_worldbuilding?: boolean;
  high_mystery_density?: boolean;
}

// ── Phase 2B.1 — Dramatic Architecture Blueprint Types ─────────────────────

/**
 * Dramatic Architecture Blueprint (DAB)
 *
 * The DAB answers: "What must this story deliver to satisfy the audience?"
 * It is the layer between Beat Sheet and Scene Architecture.
 * Generated by an LLM analysis pass before any Scene Plan generation.
 *
 * This does NOT contain:
 * - Scene numbers (Scene Architecture assigns these)
 * - Sluglines (Scene Plan assigns these)
 * - Screenplay text (Feature Script produces this)
 */
export interface DramaticArchitectureBlueprint {
  audience_promise_registry: AudiencePromiseRegistry;
  character_transformation_architecture: CharacterTransformationEntry[];
  relationship_architecture: RelationshipArchitectureEntry[];
  mystery_information_architecture: MysteryInformationArchitecture;
  emotional_architecture: EmotionalArchitecture;
  spectacle_setpiece_architecture: SpectacleSetPieceEntry[];
  breathing_room_architecture: BreathingRoomEntry[];
  dramatic_movements: DramaticMovement[];
}

/** What the audience expects from the story (derived from upstream docs) */
export interface AudiencePromiseRegistry {
  genre_promises: string[];
  emotional_promises: string[];
  mystery_promises: string[];
  spectacle_promises: string[];
  relationship_promises: string[];
  thematic_promises: string[];
}

/** A character's transformation arc broken into stages with scene requirements */
export interface CharacterTransformationEntry {
  character: string;
  stages: CharacterArcStage[];
  total_required_scenes: number;
}

export interface CharacterArcStage {
  stage: string;
  required_scenes: number;
  function_preference: string;
  purpose: string;
}

/** Architecture for a significant relationship pair */
export interface RelationshipArchitectureEntry {
  pair: [string, string];
  stages: RelationshipStage[];
  total_scenes: number;
}

export interface RelationshipStage {
  stage: string;
  required_scenes: number;
  interaction_type: string;
}

/** Information flow and mystery architecture */
export interface MysteryInformationArchitecture {
  revelations_per_act: RevelationBlock[];
  withholding_strategy: string[];
  dramatic_irony_opportunities: string[];
}

export interface RevelationBlock {
  act: number;
  reveals: RevelationItem[];
}

export interface RevelationItem {
  what: string;
  when_scene_approx: string;
  to_whom: string;
}

/** Emotional journey mapped to dramatic movements (not individual scenes) */
export interface EmotionalArchitecture {
  sequence: EmotionalSequenceEntry[];
}

export interface EmotionalSequenceEntry {
  movement_range: string;
  dominant_emotion: string;
  purpose: string;
}

/** Required spectacle / set piece with position and weight */
export interface SpectacleSetPieceEntry {
  name: string;
  estimated_scenes: number;
  estimated_pages: number;
  position: string;
  type: string;
}

/** Where the story must slow down for emotional processing */
export interface BreathingRoomEntry {
  after_movement: string;
  reason: string;
}

/**
 * A Dramatic Movement is a 2-5 scene cluster serving ONE dramatic payoff.
 * Larger than a scene, smaller than a Sequence (our generation unit).
 * This is the core output of the DAB.
 */
export interface DramaticMovement {
  movement_number: number;
  name: string;
  act: number;
  source_reference: string;
  dramatic_payoff: string;
  estimated_scenes: number;
  scene_cluster: DramaticSceneSlot[];
  pacing: string;
  breathing_room_required_after: boolean;
}

/** A single scene slot within a Dramatic Movement */
export interface DramaticSceneSlot {
  slot_in_movement: number;
  function: string;
  purpose: string;
}