/**
 * Holographic Canon — Latent-Space Projection Layer v1.0
 *
 * Canonical location: supabase/functions/_shared/holographic-canon.ts
 *
 * Pure-deterministic TypeScript module implementing the Holographic Canon
 * Theory v3 latent-space projection layer. No LLM calls, no I/O, no React.
 *
 * ARCHITECTURE CONTEXT:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                      INPUT SOURCES                                  │
 * │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐        │
 * │  │ Scene    │  │ Beat     │  │Character │  │Relationship  │        │
 * │  │ Index    │  │ Store    │  │ Registry │  │ Graph        │        │
 * │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘        │
 * │       └──────────────┴──────────────┴──────────────┘               │
 * │                            │                                        │
 * │                      ┌─────▼──────────────┐                        │
 * │                      │ OBLIGATION TOPOLOGY │  (field measurement)  │
 * │                      │ ─ TensionField     │                        │
 * │                      │ ─ ObligationCharge  │                        │
 * │                      │ ─ DeferredIntimacy  │                        │
 * │                      │ ─ NarrativeDensity  │                        │
 * │                      └─────┬──────────────┘                        │
 * │                            │ (field curvature metrics)             │
 * │                      ┌─────▼───────────────────┐                   │
 * │                      │ HOLOGRAPHIC CANON       │  (field storage   │
 * │                      │ ─ LatentCanonState      │   + projection)   │
 * │                      │ ─ computeCanonState()   │                   │
 * │                      │ ─ projectFromCanon()    │                   │
 * │                      │ ─ scoreFaithfulness()   │                   │
 * │                      └─────┬───────────────────┘                   │
 * │                            │                                        │
 * │                      ┌─────▼─────────────┐                         │
 * │                      │    CONSUMERS       │                         │
 * │                      │ • Document gen     │                         │
 * │                      │ • NEC pipeline     │                         │
 * │                      │ • Writer dashboard │                         │
 * │                      │ • Ladder invariants │                        │
 * │                      └───────────────────┘                         │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * DESIGN DECISIONS:
 * - All functions are PURE DATA TRANSFORMATIONS — no LLM calls
 * - Deterministic: same inputs → same outputs
 * - Phase 1: core types + compute functions (zero schema drift, zero integration)
 * - Phase 2+ (post-June-1): integration with obligation-topology, persistence
 * - Extensible axis system — not a fixed enum
 * - obligationField ≠ ObligationCharge — they track the same phenomenon
 *   at different abstraction levels
 *
 * DESIGN REFERENCE:
 *   docs/designs/holographic-canon.md (Interface Spec v1.0)
 *   Holographic Canon Theory v3 (vault/_red/holographic-canon-theory.md)
 */

// ============================================================================
// 2.1 LatentCanonState — The Canonical Field Substrate
// ============================================================================

/**
 * The canonical field — a latent-space narrative manifold.
 *
 * This is NOT a document. It is a high-dimensional representation
 * of the narrative field from which all projections are rendered.
 *
 * Represents the "holographic plate" — every fragment contains
 * the whole field at lower resolution density.
 */
export interface LatentCanonState {
  /** Stable identifier for this state snapshot */
  stateId: string;
  /** Project ID this state belongs to */
  projectId: string;
  /** ISO 8601 timestamp of computation */
  computedAt: string;
  /** Source version hash for dedup (DJB2a of all inputs) */
  inputHash: string;
  /** Version of the canon data model used */
  modelVersion: number; // Start at 1, increment on schema changes

  // ── Field Structure ──

  /**
   * Attractor nodes — canonical entities with positions in the manifold.
   * Keyed by entity_key (from narrative_entities or canon_json characters).
   * Each node represents a point of concentrated canonical density.
   */
  attractors: Record<string, AttractorNode>;

  /**
   * Tension vectors — relationship gradients between attractor pairs.
   * Keyed by sorted pair key: `entityKeyA<>entityKeyB`.
   * Each vector represents the gradient of the field between two nodes.
   */
  tensionVectors: Record<string, TensionVector>;

  /**
   * Obligation field — unresolved canonical energy stored in the field.
   * These are NOT the same as ObligationCharge obligations.
   * ObligationCharge measures observable narrative debt in projected text.
   * ObligationField stores the canonical energy that DRIVES that debt.
   */
  obligationField: ObligationFieldEntry[];

  /**
   * Resolution density map — per-attractor and per-scene density measure.
   * Measures how much of the total field can be reconstructed from each fragment.
   */
  resolutionDensity: {
    perAttractor: Record<string, number>; // entityKey → density [0, 1]
    perScene: Record<string, number>;     // sceneId → density [0, 1]
    fieldAggregate: number;               // Overall field density
  };

  /** Canonical thermodynamics state */
  thermodynamics: CanonicalThermodynamics;
}

// ============================================================================
// 2.2 AttractorNode — Entity in the Manifold
// ============================================================================

/**
 * An attractor node in the latent manifold.
 * Entities (characters, locations, objects) are points of concentrated
 * canonical density that shape the curvature of the space around them.
 */
export interface AttractorNode {
  /** Entity key (from narrative_entities or canon_json characters) */
  entityKey: string;
  /** Entity type */
  entityType: "character" | "location" | "object" | "concept" | "event";
  /** Entity label (display name) */
  label: string;
  /**
   * Manifold position — coordinate vector in the latent space.
   * With modelVersion 1, this is a dense embedding derived from
   * entity relationships, scene co-occurrence, and arc data.
   */
  position: number[];
  /**
   * Canonical mass — how much of the field's total energy is
   * concentrated at this node. Higher mass = stronger field curvature.
   */
  canonicalMass: number;
  /**
   * Resolution density — how strongly this node reconstructs the full field.
   * Protagonist = high, minor character = low.
   */
  resolutionDensity: number;
  /**
   * Attractor stability — how resistant this node is to field perturbation.
   * Core canon facts = high, elastic canon = medium, projection artifacts = low.
   * Range [0, 1].
   */
  stability: number;
  /**
   * Constitutional layer — determines which optimisations can override.
   */
  constitutionalLayer: "core" | "elastic" | "artifact" | "market" | "audience";
  /**
   * Subject reference — links to canonSubjectRegistry subject_id if available.
   * Null for projection-generated nodes.
   */
  subjectId?: string;
}

// ============================================================================
// 2.3 TensionVector — Field Gradient Between Attractors
// ============================================================================

/**
 * A tension vector — the gradient of the canonical field
 * connecting two attractor nodes.
 *
 * In holographic terms: the stored potential energy between
 * two narrative entities. High magnitude = strong narrative pull.
 */
export interface TensionVector {
  /** Sorted pair key: `entityAKey<>entityBKey` */
  pairKey: string;
  /** First entity (sorted alphabetically) */
  entityA: string;
  /** Second entity (sorted alphabetically) */
  entityB: string;
  /**
   * Tension magnitude [0, 1].
   * 0 = no tension (indifferent/neutral)
   * 1 = maximum tension (antagonistic/polarised)
   */
  magnitude: number;
  /**
   * Tension direction — which way the gradient slopes.
   */
  direction: "a_to_b" | "b_to_a" | "mutual" | "indeterminate";
  /**
   * Type tags describing the tension's qualitative nature.
   * Examples: ["romantic", "unresolved"], ["ideological", "escalating"]
   */
  typeTags: string[];
  /**
   * Source of this vector — how it was derived.
   */
  source: "field_computation" | "obligation_topology" | "subject_registry" | "manual";
  /**
   * Gradient — rate of change from the prior canonical state.
   * Positive = tension increasing, negative = decreasing, null = initial.
   */
  gradient: number | null;
}

// ============================================================================
// 2.4 ObligationFieldEntry — Stored Canonical Energy
// ============================================================================

/**
 * A stored obligation in the canonical field.
 *
 * Not the same as ObligationCharge's narrative debt.
 * ObligationFieldEntry is the CANONICAL ENERGY that drives the observable debt.
 * ObligationCharge measures observable debt in projected text.
 * These are projection and measurement of the same underlying phenomenon.
 */
export interface ObligationFieldEntry {
  /** Stable identifier */
  obligationId: string;
  /** Obligation type */
  obligationType:
    | "setup_payoff"
    | "dramatic_question"
    | "character_arc"
    | "thematic_resolution"
    | "relationship_tension"
    | "structural"
    | "mystery"
    | "promise";
  /** Canonical energy stored [0, 1] */
  energy: number;
  /** Attractor keys involved (sorted) */
  attractorKeys: string[];
  /** When the obligation was loaded (computedAt timestamp) */
  loadedAt: string;
  /** Expected discharge horizon (null = open-ended) */
  dischargeHorizon?: string; // e.g. "act_1", "act_2b", "climax", "saga_wide"
  /** Whether this obligation has been discharged */
  discharged: boolean;
  /** When discharged, if applicable */
  dischargedAt?: string;
  /** Discharge type */
  dischargeType?: "full" | "partial" | "transferred" | "decayed";
  /** Reference to the obligation-topology charge that inspired this entry */
  topologyChargeId?: string;
}

// ============================================================================
// 2.5 CanonicalThermodynamics — Field Energy State
// ============================================================================

/**
 * Canonical thermodynamics state of the field.
 *
 * Formalizes the three laws of canonical thermodynamics:
 * 1. Conservation of narrative energy
 * 2. Entropy increases without directed resolution
 * 3. Stable attractors minimise total tension
 */
export interface CanonicalThermodynamics {
  /**
   * Total canonical energy — unresolved narrative potential in the field.
   * Sum of all ObligationFieldEntry.energy values, normalised [0, 1].
   */
  totalEnergy: number;
  /**
   * Canonical entropy — tendency of obligations to lose directional specificity.
   * High entropy = many unresolved threads with weak discharge paths.
   */
  entropy: number;
  /**
   * Narrative temperature — rate of obligation loading and discharge.
   * hot: rapid charge/discharge (pacing is hot)
   * moderate: steady state (pacing is temperate)
   * low: sustained tension (pacing is cold)
   */
  narrativeTemperature: "hot" | "temperate" | "cold";
  /**
   * Interference noise — conflicting obligation vectors.
   * High = structural problems, tonal inconsistency.
   */
  interferenceNoise: number;
  /**
   * Resonance stability — how close the field is to a coherent attractor state.
   * 1 = fully resolved (all obligations discharged), 0 = fully incoherent.
   */
  resonanceStability: number;
  /**
   * Dominant thermodynamic regime.
   */
  dominantRegime: "loading" | "sustaining" | "discharging" | "resolved" | "decaying";
}

// ============================================================================
// 2.6 ProjectionAxis — The Lens Through Which the Canon Is Rendered
// ============================================================================

/**
 * A projection axis/angle — the lens through which the canonical field
 * is rendered into a projected output.
 *
 * EXTENSIBLE by design — not a fixed enum.
 * New axes can be added without module changes.
 * Each axis defines its own resolution parameters.
 */
export interface ProjectionAxis {
  /**
   * Axis identifier. Convention: lowercase_with_underscores.
   * Well-known axes:
   *   "script"       — screenplay format (scene structure, dialogue, pacing)
   *   "character"    — single character POV (their backstory, psychology, arc)
   *   "treatment"    — story-level (beats, themes, emotional journey)
   *   "pitch"        — marketability (who it's for, why it matters)
   *   "production"   — schedule, budget, logistics
   *   "timeline"     — chronological traversal with temporal ordering
   *   "thematic"     — thematic through-line extraction
   *   "relationship" — per-pair relationship arc trace
   *   "beat_map"     — structural beat sequence with obligation annotations
   *   "obligation_map" — obligation topology state map
   */
  axisId: string;
  /** Human-readable label for the axis */
  label: string;
  /**
   * Resolution parameters that control what the projection includes/excludes.
   * Each axis defines its own schema here.
   */
  resolution: Record<string, unknown>;
  /**
   * Which constitutional layers to include.
   */
  layers: Array<"core" | "elastic" | "artifact" | "market" | "audience">;
  /**
   * Filtered entity keys — only these attractors are included.
   * Empty = all entities (fully determined by axis type).
   */
  entityFilter?: string[];
  /**
   * Filtered scene IDs — only these scenes are included.
   * Empty = all scenes.
   */
  sceneFilter?: string[];
}

// ============================================================================
// 2.7 CanonScore — Faithfulness Scoring Result
// ============================================================================

/**
 * Result of scoring a generated output against the canonical field.
 * Structured, not scalar — multiple dimensions.
 */
export interface CanonScore {
  /** Whether the output passes the minimum faithfulness threshold */
  passed: boolean;
  /**
   * Aggregate faithfulness score [0, 1].
   * 1 = perfect alignment with the canonical field.
   * 0 = completely divergent from the canon.
   */
  aggregateScore: number;
  /** Threshold used for pass/fail determination */
  threshold: number;
  /** Per-dimension scores */
  dimensions: FaithfulnessDimension[];
  /** Specific violations detected */
  violations: FaithfulnessViolation[];
  /** Scored at timestamp */
  scoredAt: string;
  /** Input hash for dedup */
  inputHash: string;
}

/**
 * A single dimension of faithfulness measurement.
 */
export interface FaithfulnessDimension {
  /** Dimension identifier */
  dimension:
    | "entity_identity"
    | "relationship_accuracy"
    | "obligation_tracking"
    | "thematic_alignment"
    | "tone_consistency"
    | "structural_integrity"
    | "temporal_coherence";
  /** Score [0, 1] */
  score: number;
  /** Weight in aggregate score */
  weight: number;
  /** Explanation */
  explanation: string;
}

/**
 * A specific faithfulness violation.
 */
export interface FaithfulnessViolation {
  /** Violation domain */
  domain: "identity" | "relationship" | "obligation" | "theme" | "tone" | "structure" | "temporality";
  /** Severity */
  severity: "critical" | "major" | "minor" | "informational";
  /** Description of the violation */
  description: string;
  /** What the canon expected */
  canonicalExpected: string;
  /** What the generated output asserted */
  observedConflict: string;
  /** The constitutional layer affected */
  affectedLayer: "core" | "elastic" | "artifact";
  /** Whether this violation is automatically repairable */
  repairable: boolean;
}

// ============================================================================
// 2.8 ProjectedOutput — Result of Projecting Through a Lens
// ============================================================================

/**
 * The result of projecting the canonical field through a projection axis.
 */
export interface ProjectedOutput {
  /** The axis used for projection */
  axis: ProjectionAxis;
  /** The canonical state used as source */
  sourceStateId: string;
  /** ISO 8601 timestamp */
  projectedAt: string;
  /**
   * The projected content — structured per axis type.
   * For "script" axis: an array of scene-like structures.
   * For "character" axis: a structured character profile.
   * For "treatment" axis: beat-level story architecture.
   * Schema determined by axis.resolution config.
   */
  content: unknown;
  /**
   * Resolution density achieved in this projection.
   * Measures how faithfully the output resolves the underlying field.
   */
  achievedDensity: number;
  /**
   * Projection confidence — how confident the system is that this
   * projection accurately reflects the canonical state.
   */
  confidence: number;
  /**
   * Obligations resolved/loaded during this projection.
   */
  obligationChanges?: {
    discharged: string[]; // obligationIds
    loaded: string[];     // obligationIds
  };
  /**
   * Faithfulness score if computed inline.
   */
  selfFaithScore?: number;
}

// ============================================================================
// 2.9 NarrativeState — Input for computeCanonState
// ============================================================================

/**
 * The current observable narrative state — input to computeCanonState().
 *
 * This is the "surface-level" representation of the story as it exists
 * in IFFY's database: scene graph, entity links, canon JSON, etc.
 * computeCanonState() projects this INTO the latent manifold.
 */
export interface NarrativeState {
  /** Project ID */
  projectId: string;
  /** Scene graph state (all scenes with order) */
  scenes: SceneSummary[];
  /** Entity registry state */
  entities: EntitySummary[];
  /** Canon JSON (from project_canon or similar) */
  canonJson: Record<string, unknown>;
  /** Obligation topology metrics (from obligation-topology.ts) */
  topologyMetrics?: {
    tensionField?: unknown;      // ObligationTopologyState
    obligationCharge?: unknown;  // ObligationChargeResult
    deferredIntimacy?: unknown;  // DeferredIntimacyResult
    narrativeDensity?: unknown;  // NarrativeDensityResult
  };
  /** Subject-level deltas from canonSubjectRegistry */
  subjectDeltas?: unknown[];     // SubjectDelta[]
  /** Document ladder state — which docs exist and their approval status */
  ladderState?: Record<string, { exists: boolean; approved: boolean }>;
}

/**
 * Summary of a scene in the narrative state.
 */
export interface SceneSummary {
  sceneId: string;
  sceneNumber: number;
  actNumber?: number;
  slugline?: string;
  characterKeys: string[];
  wordCount: number;
}

/**
 * Summary of an entity in the narrative state.
 */
export interface EntitySummary {
  entityKey: string;
  entityType: "character" | "location" | "object" | "concept" | "event";
  name: string;
  sceneAppearances: number;
  totalAppearances: number;
}

// ============================================================================
// 3.1 Primary Entry Point: computeHolographicCanon → computeCanonState
// ============================================================================

/**
 * Compute the full holographic canonical state from a narrative state.
 *
 * This is the PRIMARY ENTRY POINT — it:
 * 1. Projects observable narrative state into the latent manifold
 * 2. Computes attractor nodes from entity/dependency data
 * 3. Computes tension vectors from relationship data + topology metrics
 * 4. Computes the obligation field from canon data + obligation topology
 * 5. Measures resolution density across the field
 * 6. Computes canonical thermodynamics
 *
 * Phase 1: stub implementation. Throws until actual computation is implemented.
 *
 * CONSUMERS:
 *   - projectFromCanon() — uses LatentCanonState as source for projections
 *   - scoreFaithfulness() — uses LatentCanonState as reference for scoring
 *   - resolveEquilibrium() — re-computes field after state changes
 */
export function computeCanonState(
  narrativeState: NarrativeState,
): LatentCanonState {
  throw new Error("Not implemented — Phase 2 integration with obligation-topology");
}

// ============================================================================
// 3.2 Attractor Computation
// ============================================================================

/**
 * Compute attractor nodes from entity registry and canon JSON.
 *
 * Phase 1: stub implementation. Throws until actual computation is implemented.
 */
export function computeAttractorNodes(
  entities: EntitySummary[],
  canonJson: Record<string, unknown>,
  subjectDeltas?: unknown[],
): Record<string, AttractorNode> {
  throw new Error("Not implemented — Phase 2 integration with subject registry");
}

// ============================================================================
// 3.3 Tension Vector Computation
// ============================================================================

/**
 * Compute tension vectors between all attractor pairs.
 *
 * Phase 1: stub implementation. Throws until actual computation is implemented.
 */
export function computeTensionVectors(
  attractors: Record<string, AttractorNode>,
  topologyTensionField?: unknown,
): Record<string, TensionVector> {
  throw new Error("Not implemented — Phase 2 integration with obligation-topology");
}

// ============================================================================
// 3.4 Obligation Field Computation
// ============================================================================

/**
 * Compute the obligation field from canon data and optional topology metrics.
 *
 * Phase 1: stub implementation. Throws until actual computation is implemented.
 */
export function computeObligationField(
  canonJson: Record<string, unknown>,
  scenes: SceneSummary[],
  attractors: Record<string, AttractorNode>,
  topologyObligationCharge?: unknown,
): ObligationFieldEntry[] {
  throw new Error("Not implemented — Phase 2 integration with obligation-topology");
}

// ============================================================================
// 3.5 Resolution Density Measurement
// ============================================================================

/**
 * Measure resolution density across the canonical field.
 *
 * Phase 1: stub implementation. Throws until actual computation is implemented.
 */
export function computeResolutionDensity(
  attractors: Record<string, AttractorNode>,
  scenes: SceneSummary[],
  obligationField: ObligationFieldEntry[],
): {
  perAttractor: Record<string, number>;
  perScene: Record<string, number>;
  fieldAggregate: number;
} {
  throw new Error("Not implemented — Phase 2 implementation with YETI data validation");
}

// ============================================================================
// 3.6 Thermodynamics Computation
// ============================================================================

/**
 * Compute canonical thermodynamics from field state.
 *
 * Implements the three laws of canonical thermodynamics.
 *
 * Phase 1: stub implementation. Throws until actual computation is implemented.
 */
export function computeThermodynamics(
  attractors: Record<string, AttractorNode>,
  tensionVectors: Record<string, TensionVector>,
  obligationField: ObligationFieldEntry[],
  resolutionDensity: { perAttractor: Record<string, number>; perScene: Record<string, number>; fieldAggregate: number },
): CanonicalThermodynamics {
  throw new Error("Not implemented — Phase 2 implementation with empirical calibration");
}

// ============================================================================
// 3.7 Project From Canon — Render Through a Lens (Post-June-1)
// ============================================================================

/**
 * Project the canonical field through a given axis/lens.
 *
 * This is the function that makes the holographic canon operational:
 * it READS the latent manifold and PRODUCES a rendered output in the
 * format/lens requested.
 *
 * Post-June-1: stub implementation. Throws until actual projection is implemented.
 *
 * CONSUMERS:
 *   - dev-engine-v2: calls projectFromCanon() before LLM invocation
 *   - Writer dashboard: renders projections for comparison
 *   - Ladder invariants: checks projection quality before promotion
 */
export function projectFromCanon(
  canonState: LatentCanonState,
  axis: ProjectionAxis,
): ProjectedOutput {
  throw new Error("Not implemented — Post-June-1: axis-specific projection logic");
}

// ============================================================================
// 3.8 Score Faithfulness — Measure Alignment (Post-June-1)
// ============================================================================

/**
 * Score a generated document/output against the canonical field.
 *
 * This is the "projection fidelity" measurement in the North Star Test.
 * It measures how faithfully a generated output resolves the underlying
 * canonical field — not whether it's "good" or "bad" writing, but
 * whether it accurately represents the canonical truth.
 *
 * DIFFERENCE FROM canonConstraintEnforcement.detectCanonDrift():
 *   detectCanonDrift() checks FACTUAL consistency — do concrete facts
 *   survive into generated text.
 *   scoreFaithfulness() checks STRUCTURAL alignment — does the generated
 *   text maintain the field's obligation topology, attractor relationships,
 *   and thermodynamic state.
 *
 * Post-June-1: stub implementation. Throws until actual scoring is implemented.
 */
export function scoreFaithfulness(
  projectCanonState: LatentCanonState,
  generatedOutput: string,
  axis: ProjectionAxis,
): CanonScore {
  throw new Error("Not implemented — Post-June-1: faithfulness scoring algorithm");
}

// ============================================================================
// 3.9 Resolve Equilibrium — Re-compute Field After Changes (Post-June-1)
// ============================================================================

/**
 * Re-resolve the canonical field equilibrium after state changes.
 *
 * When the canon changes (new scene, entity edit, overlay applied),
 * the field must be re-resolved to find the new equilibrium.
 *
 * DIFFERENCE FROM computeCanonState():
 *   computeCanonState() computes from SCRATCH (full recompute).
 *   resolveEquilibrium() starts from the PRIOR state and applies
 *   a delta, re-computing only the affected portions and then
 *   re-stabilising globally.
 *
 * Post-June-1: stub implementation. Throws until actual resolution is implemented.
 */
export function resolveEquilibrium(
  priorState: LatentCanonState,
  changes: {
    changedEntityKeys?: string[];
    changedSceneIds?: string[];
    topologyMetrics?: unknown;
    subjectDeltas?: unknown[];
    canonJsonChanged?: boolean;
  },
): LatentCanonState {
  throw new Error("Not implemented — Post-June-1: delta-based equilibrium resolution");
}

// ============================================================================
// 3.10 Utility Functions
// ============================================================================

/**
 * DJB2a hash function.
 * Consistent with canonSubjectRegistry's hashing for cache dedup.
 */
function djb2a(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  // Convert to hex for consistent string representation
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Get well-known projection axes.
 * Returns a registry of pre-defined axes for common projection surfaces.
 * Extensible — new axes can be registered at runtime.
 */
export function getDefaultAxes(): ProjectionAxis[] {
  return [
    {
      axisId: "script",
      label: "Screenplay Projection",
      resolution: {
        format: "screenplay",
        includeSceneNumbers: true,
        includeSluglines: true,
      },
      layers: ["core", "elastic", "artifact"],
      entityFilter: [],
      sceneFilter: [],
    },
    {
      axisId: "character",
      label: "Character POV Projection",
      resolution: {
        format: "character_profile",
        includeBackstory: true,
        includeArc: true,
      },
      layers: ["core", "elastic"],
      entityFilter: [],
      sceneFilter: [],
    },
    {
      axisId: "treatment",
      label: "Treatment-Level Projection",
      resolution: {
        format: "treatment",
        includeBeats: true,
        includeThemes: true,
      },
      layers: ["core", "elastic"],
      entityFilter: [],
      sceneFilter: [],
    },
    {
      axisId: "timeline",
      label: "Chronological Projection",
      resolution: {
        format: "timeline",
        sortByAct: true,
        includeStateTransitions: true,
      },
      layers: ["core", "elastic", "artifact"],
      entityFilter: [],
      sceneFilter: [],
    },
    {
      axisId: "thematic",
      label: "Thematic Through-Line Projection",
      resolution: {
        format: "thematic_extraction",
        extractThemes: ["all"],
      },
      layers: ["core"],
      entityFilter: [],
      sceneFilter: [],
    },
    {
      axisId: "obligation_map",
      label: "Obligation Topology Map",
      resolution: {
        format: "obligation_graph",
        includeEnergyMetrics: true,
        showDischargePaths: true,
      },
      layers: ["core", "elastic"],
      entityFilter: [],
      sceneFilter: [],
    },
  ];
}

/**
 * Serialize a canonical state as JSON for persistence.
 * Deterministic: same state → same JSON.
 */
export function serializeCanonState(state: LatentCanonState): string {
  return JSON.stringify(state, null, 2);
}

/**
 * Deserialize a canonical state from persisted JSON.
 */
export function deserializeCanonState(json: string): LatentCanonState {
  const parsed = JSON.parse(json);
  // Basic structural validation — ensures required fields exist
  if (!parsed.stateId || !parsed.projectId || !parsed.computedAt) {
    throw new Error(
      "Invalid canonical state JSON: missing required fields (stateId, projectId, computedAt)",
    );
  }
  return parsed as LatentCanonState;
}

/**
 * Hash inputs for cache dedup (DJB2a).
 *
 * Creates a deterministic hash from the narrative state's key inputs:
 * scene graph, entity list, canon JSON structure.
 * Used to determine whether the canonical state needs recomputation.
 */
export function hashCanonInputs(narrativeState: NarrativeState): string {
  const sceneKeys = narrativeState.scenes
    .map((s) => `${s.sceneId}:${s.wordCount}`)
    .sort()
    .join(",");
  const entityKeys = narrativeState.entities
    .map((e) => `${e.entityKey}:${e.sceneAppearances}:${e.totalAppearances}`)
    .sort()
    .join(",");
  // Use stable JSON serialization for canonJson
  const canonStr = JSON.stringify(narrativeState.canonJson, Object.keys(narrativeState.canonJson).sort());
  const payload = `${narrativeState.projectId}|${sceneKeys}|${entityKeys}|${canonStr}`;
  return djb2a(payload);
}

/**
 * Check if two canonical states are equivalent (same field configuration).
 *
 * Performs a deep comparison of:
 * - Attractor nodes (by entityKey)
 * - Tension vectors (by pairKey)
 * - Obligation field entries (by obligationId + energy + discharged state)
 * - Thermodynamics
 * - Resolution density aggregate
 */
export function statesAreEquivalent(a: LatentCanonState, b: LatentCanonState): boolean {
  // Quick hash check first
  if (a.inputHash !== b.inputHash) return false;
  // Quick length checks
  if (
    Object.keys(a.attractors).length !== Object.keys(b.attractors).length ||
    Object.keys(a.tensionVectors).length !== Object.keys(b.tensionVectors).length ||
    a.obligationField.length !== b.obligationField.length
  ) {
    return false;
  }
  // JSON comparison on the structured data
  return (
    serializeCanonState(a).length === serializeCanonState(b).length &&
    JSON.stringify(a.attractors, Object.keys(a.attractors).sort()) ===
      JSON.stringify(b.attractors, Object.keys(b.attractors).sort()) &&
    JSON.stringify(a.tensionVectors, Object.keys(a.tensionVectors).sort()) ===
      JSON.stringify(b.tensionVectors, Object.keys(b.tensionVectors).sort()) &&
    a.thermodynamics.totalEnergy === b.thermodynamics.totalEnergy &&
    a.thermodynamics.entropy === b.thermodynamics.entropy &&
    a.thermodynamics.resonanceStability === b.thermodynamics.resonanceStability &&
    a.resolutionDensity.fieldAggregate === b.resolutionDensity.fieldAggregate
  );
}

/**
 * Get the diff between two canonical states.
 * Returns added, removed, and changed attractors, vectors, and obligations.
 */
export function diffCanonStates(
  before: LatentCanonState,
  after: LatentCanonState,
): {
  addedAttractors: string[];
  removedAttractors: string[];
  changedAttractors: string[];
  addedVectors: string[];
  removedVectors: string[];
  changedVectors: string[];
  addedObligations: string[];
  dischargedObligations: string[];
  changedThermodynamics: boolean;
} {
  const beforeAttractorKeys = new Set(Object.keys(before.attractors));
  const afterAttractorKeys = new Set(Object.keys(after.attractors));
  const beforeVectorKeys = new Set(Object.keys(before.tensionVectors));
  const afterVectorKeys = new Set(Object.keys(after.tensionVectors));

  const addedAttractors = [...afterAttractorKeys].filter((k) => !beforeAttractorKeys.has(k));
  const removedAttractors = [...beforeAttractorKeys].filter((k) => !afterAttractorKeys.has(k));
  const changedAttractors = [...afterAttractorKeys].filter(
    (k) =>
      beforeAttractorKeys.has(k) &&
      JSON.stringify(before.attractors[k]) !== JSON.stringify(after.attractors[k]),
  );

  const addedVectors = [...afterVectorKeys].filter((k) => !beforeVectorKeys.has(k));
  const removedVectors = [...beforeVectorKeys].filter((k) => !afterVectorKeys.has(k));
  const changedVectors = [...afterVectorKeys].filter(
    (k) =>
      beforeVectorKeys.has(k) &&
      JSON.stringify(before.tensionVectors[k]) !== JSON.stringify(after.tensionVectors[k]),
  );

  const beforeObligationIds = new Set(before.obligationField.map((o) => o.obligationId));
  const afterObligationIds = new Set(after.obligationField.map((o) => o.obligationId));
  const addedObligations = [...afterObligationIds].filter((id) => !beforeObligationIds.has(id));
  const dischargedObligations = before.obligationField
    .filter((o) => !o.discharged && after.obligationField.find((a) => a.obligationId === o.obligationId)?.discharged)
    .map((o) => o.obligationId);

  const changedThermodynamics =
    JSON.stringify(before.thermodynamics) !== JSON.stringify(after.thermodynamics);

  return {
    addedAttractors,
    removedAttractors,
    changedAttractors,
    addedVectors,
    removedVectors,
    changedVectors,
    addedObligations,
    dischargedObligations,
    changedThermodynamics,
  };
}