# Holographic Canon Module — Interface Spec v1.0

**Status:** Architecture Design
**Author:** Architect (Agent 3)
**Date:** 2026-05-23
**Priority:** POST-JUNE-1 — Long-term vision module
**LOOP_COUNT:** 0

---

## 0. Executive Summary

The Holographic Canon module (`_shared/holographic-canon.ts`) is the **latent-space projection layer** for IFFY. It implements the core theoretical model from the Holographic Canon Theory v3:

- **Canon as latent manifold** — a continuous, high-dimensional narrative field from which documents are rendered, not authored
- **Projection as lens transformation** — documents are projections of the field through specific angle/lens parameters
- **Faithfulness scoring** — measure how well a generated output aligns with the canonical field it was projected from
- **Multi-perspective rendering** — generate outputs from any narrative perspective axis (character POV, timeline layer, narrative stratum)

This module sits **above** `obligation-topology.ts` — it **consumes** topology metrics (field curvature measurements) as inputs to its projection functions. The topology module measures the field; the holographic canon module stores and renders it.

---

## 1. Relationship to obligation-topology.ts

### Architectural Position

```
┌─────────────────────────────────────────────────────────────────────┐
│                      INPUT SOURCES                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐        │
│  │ Scene    │  │ Beat     │  │Character │  │Relationship  │        │
│  │ Index    │  │ Store    │  │ Registry │  │ Graph        │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘        │
│       └──────────────┴──────────────┴──────────────┘               │
│                            │                                        │
│                      ┌─────▼──────────────┐                        │
│                      │ OBLIGATION TOPOLOGY │  (field measurement)  │
│                      │ ─ TensionField     │                        │
│                      │ ─ ObligationCharge  │                        │
│                      │ ─ DeferredIntimacy  │                        │
│                      │ ─ NarrativeDensity  │                        │
│                      └─────┬──────────────┘                        │
│                            │ (field curvature metrics)             │
│                      ┌─────▼───────────────────┐                   │
│                      │ HOLOGRAPHIC CANON       │  (field storage   │
│                      │ ─ LatentCanonState      │   + projection)   │
│                      │ ─ projectToCanon()      │                   │
│                      │ ─ projectFromCanon()    │                   │
│                      │ ─ scoreFaithfulness()   │                   │
│                      │ ─ resolveEquilibrium()  │                   │
│                      └─────┬───────────────────┘                   │
│                            │                                        │
│                      ┌─────▼─────────────┐                         │
│                      │    CONSUMERS       │                         │
│                      │ • Document gen     │                         │
│                      │ • NEC pipeline     │                         │
│                      │ • Writer dashboard │                         │
│                      │ • Ladder invariants │                        │
│                      └───────────────────┘                         │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Integration Points

| Module | Relationship to Holographic Canon |
|--------|----------------------------------|
| **obligation-topology.ts** | Produces field curvature metrics (TensionField, ObligationCharge, DeferredIntimacyIndex, NarrativeDensity). Holographic Canon **consumes** these as inputs to `resolveEquilibrium()`. |
| **canonSubjectRegistry.ts** | Produces deterministic subject-level deltas. Holographic Canon **consumes** subject identities to populate the latent manifold's attractor nodes. |
| **canonConstraintEnforcement.ts** | Produces post-generation drift detection. Holographic Canon's `scoreFaithfulness()` is a **superset** — it measures structural alignment, not just fact persistence. |
| **NEC pipeline** | Consumes holographic canon projection context for richer guardrail prompts. |
| **Dev Engine (dev-engine-v2)** | Calls `projectFromCanon()` to get perspective-specific generation context before invoking the LLM. |
| **Ladder invariants** | `scoreFaithfulness()` output can gate promotions (cannot promote if alignment below threshold). |

### Data Flow

```
obligation-topology metrics ─┐
                             ├──→ resolveEquilibrium() → LatentCanonState
canonSubjectRegistry deltas ─┘
                                     │
                         ┌───────────▼───────────┐
                         │   LatentCanonState     │
                         │  (stored/versioned)    │
                         └───────────┬───────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
     projectFromCanon()    scoreFaithfulness()    projectToCanon()
     (render through lens)  (measure alignment)   (narrative input)
              │                      │                      │
              ▼                      ▼                      ▼
     ProjectedOutput          CanonScore             LatentCanonState
     (perspectived doc)       (alignment metric)     (from raw narrative)
```

---

## 2. Types & Interfaces

### 2.1 LatentCanonState — The Canonical Field Substrate

```typescript
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
  modelVersion: number;  // Start at 1, increment on schema changes

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
   * [0, 1] where 1 = full field reconstructible from this fragment.
   */
  resolutionDensity: {
    perAttractor: Record<string, number>;   // entityKey → density [0, 1]
    perScene: Record<string, number>;       // sceneId → density [0, 1]
    fieldAggregate: number;                 // Overall field density
  };

  /**
   * Canonical thermodynamics state.
   */
  thermodynamics: CanonicalThermodynamics;
}
```

### 2.2 AttractorNode — Entity in the Manifold

```typescript
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
   * Not a spatial position; a point in N-dimensional canonical space.
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
   *   "core"          — cannot be violated without identity collapse
   *   "elastic"       — can shift across projections with justification
   *   "artifact"      — exists only in a specific render (freely overridable)
   *   "market"        — external optimisation layer (advisory only)
   *   "audience"      — predicted response (informational only)
   */
  constitutionalLayer: "core" | "elastic" | "artifact" | "market" | "audience";
  /**
   * Subject reference — links to canonSubjectRegistry subject_id if available.
   * Null for projection-generated nodes.
   */
  subjectId?: string;
}
```

### 2.3 TensionVector — Field Gradient Between Attractors

```typescript
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
   *   "a_to_b"     — entity A exerts pull toward entity B
   *   "b_to_a"     — entity B exerts pull toward entity A
   *   "mutual"     — symmetrical gradient (mutual attraction/repulsion)
   *   "indeterminate" — direction not resolvable (no clear gradient)
   */
  direction: "a_to_b" | "b_to_a" | "mutual" | "indeterminate";
  /**
   * Type tags describing the tension's qualitative nature.
   * Examples: ["romantic", "unresolved"], ["ideological", "escalating"],
   * ["power", "dominance"], ["trust", "eroding"]
   */
  typeTags: string[];
  /**
   * Source of this vector — how it was derived.
   *   "field_computation" — computed from manifold geometry
   *   "obligation_topology" — imported from TensionField metrics
   *   "subject_registry" — derived from canonSubjectRegistry deltas
   *   "manual" — explicitly defined in canon
   */
  source: "field_computation" | "obligation_topology" | "subject_registry" | "manual";
  /**
   * Gradient — rate of change from the prior canonical state.
   * Positive = tension increasing, negative = decreasing, null = initial.
   */
  gradient: number | null;
}
```

### 2.4 ObligationFieldEntry — Stored Canonical Energy

```typescript
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
    | "setup_payoff"       // Setup requires eventual payoff
    | "dramatic_question"  // Question posed, answer required
    | "character_arc"      // Character transformation promised
    | "thematic_resolution" // Thematic thread must resolve
    | "relationship_tension" // Relational energy must discharge
    | "structural"         // Beat/act structure promises resolution
    | "mystery"            // Information withheld, reveal expected
    | "promise";           // Explicit narrative promise
  /** Canonical energy stored [0, 1] */
  energy: number;
  /** Attractor keys involved (sorted) */
  attractorKeys: string[];
  /** When the obligation was loaded (computedAt timestamp) */
  loadedAt: string;
  /** Expected discharge horizon (null = open-ended) */
  dischargeHorizon?: string;  // e.g. "act_1", "act_2b", "climax", "saga_wide"
  /** Whether this obligation has been discharged */
  discharged: boolean;
  /** When discharged, if applicable */
  dischargedAt?: string;
  /** Discharge type */
  dischargeType?: "full" | "partial" | "transferred" | "decayed";
  /** Reference to the obligation-topology charge that inspired this entry */
  topologyChargeId?: string;
}
```

### 2.5 CanonicalThermodynamics — Field Energy State

```typescript
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
   * - high: rapid charge/discharge (pacing is hot)
   * - moderate: steady state (pacing is temperate)
   * - low: sustained tension (pacing is cold)
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
```

### 2.6 ProjectionAxis — The Lens Through Which the Canon Is Rendered

```typescript
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
   */
  axisId: string;
  /**
   * Human-readable label for the axis.
   */
  label: string;
  /**
   * Resolution parameters that control what the projection includes/excludes.
   * Each axis defines its own schema here.
   */
  resolution: Record<string, unknown>;
  /**
   * Which constitutional layers to include.
   *   core       — always included (canonical truth)
   *   elastic    — included unless filtered
   *   artifact   — included only if format-specific
   *   market     — included only if market-aware axis
   *   audience   — included only if audience-simulation axis
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
```

### 2.7 CanonScore — Faithfulness Scoring Result

```typescript
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
  dimension: "entity_identity" | "relationship_accuracy" | "obligation_tracking" | "thematic_alignment" | "tone_consistency" | "structural_integrity" | "temporal_coherence";
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
```

### 2.8 ProjectedOutput — Result of Projecting Through a Lens

```typescript
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
   * [0, 1] — higher = more of the field reconstructed in the output.
   */
  achievedDensity: number;
  /**
   * Projection confidence — how confident the system is that this
   * projection accurately reflects the canonical state.
   * [0, 1] — higher = more deterministic.
   */
  confidence: number;
  /**
   * Obligations resolved/loaded during this projection.
   * A projection may discharge canonical energy (e.g., a payoff).
   */
  obligationChanges?: {
    discharged: string[];  // obligationIds
    loaded: string[];      // obligationIds
  };
  /**
   * Faithfulness score if computed inline.
   */
  selfFaithScore?: number;
}
```

### 2.9 NarrativeState — Input for projectToCanon

```typescript
/**
 * The current observable narrative state — input to projectToCanon().
 *
 * This is the "surface-level" representation of the story as it exists
 * in IFFY's database: scene graph, entity links, canon JSON, etc.
 * projectToCanon() projects this INTO the latent manifold.
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
  subjectDeltas?: unknown[];      // SubjectDelta[]
  /** Document ladder state — which docs exist and their approval status */
  ladderState?: Record<string, { exists: boolean; approved: boolean }>;
}

export interface SceneSummary {
  sceneId: string;
  sceneNumber: number;
  actNumber?: number;
  slugline?: string;
  characterKeys: string[];
  wordCount: number;
}

export interface EntitySummary {
  entityKey: string;
  entityType: "character" | "location" | "object" | "concept" | "event";
  name: string;
  sceneAppearances: number;    // Number of scenes this entity appears in
  totalAppearances: number;    // Total appearance count across all scenes
}
```

---

## 3. Function Signatures — Public API

### 3.1 Primary Entry Point: computeHolographicCanon

```typescript
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
 * DATA FLOW (canonical path):
 *   Input gathering (caller provides):
 *     project_id + scene graph + entities + canon_json
 *         │
 *         ├── (optional) ObligationTopology.computeAll() results
 *         ├── (optional) SubjectDelta[] from canonSubjectRegistry
 *         │
 *         ▼
 *   holographicCanon.computeCanonState()
 *         │
 *         ├── computeAttractorNodes()       ──→ Record<string, AttractorNode>
 *         ├── computeTensionVectors()       ──→ Record<string, TensionVector>
 *         ├── computeObligationField()      ──→ ObligationFieldEntry[]
 *         ├── computeResolutionDensity()    ──→ { perAttractor, perScene, fieldAggregate }
 *         └── computeThermodynamics()       ──→ CanonicalThermodynamics
 *         │
 *         ▼
 *   LatentCanonState (complete field representation)
 *         │
 *         ▼ (returned to caller, cached, available for projections)
 *
 * CONSUMERS:
 *   - projectFromCanon() — uses LatentCanonState as source for projections
 *   - scoreFaithfulness() — uses LatentCanonState as reference for scoring
 *   - resolveEquilibrium() — re-computes field after state changes
 *
 * CACHING:
 *   Results should be cached per (projectId, inputHash).
 *   Recompute only when narrative state changes (e.g., new scene, canon edit).
 */
export function computeCanonState(
  narrativeState: NarrativeState,
): LatentCanonState {
  throw new Error("Not implemented — interface spec only");
}
```

### 3.2 Attractor Computation

```typescript
/**
 * Compute attractor nodes from entity registry and canon JSON.
 *
 * Inputs:
 *   - EntitySummary[] from narrative_entities or canon_json.characters
 *   - Canon JSON for constitutional layer assignment
 *   - SubjectDelta[] for subject identity linking (optional)
 *
 * Algorithm sketch:
 *   1. For each entity:
 *      a. Determine entity type from entity registry
 *      b. Compute canonical mass from:
 *         - Scene appearance frequency
 *         - Number of relationship edges
 *         - Count of canon subject deltas referencing this entity
 *      c. Compute resolution density from:
 *         - Entity's role classification (protagonist = high, minor = low)
 *         - Degree centrality in the entity co-occurrence graph
 *         - Number of obligation field entries involving this entity
 *      d. Assign constitutional layer:
 *         - Core: protagonist, logline, premise, forbidden_changes
 *         - Elastic: character traits that can bend, beat positions
 *         - Artifact: format-specific descriptive text
 *      e. Compute attractor position from:
 *         - Canonical attribute embedding (a deterministic hash of
 *           entity facts projected into manifold coordinates)
 *   2. Aggregate: sort by canonicalMass, normalise to [0, 1] range
 */
export function computeAttractorNodes(
  entities: EntitySummary[],
  canonJson: Record<string, unknown>,
  subjectDeltas?: unknown[],
): Record<string, AttractorNode> {
  throw new Error("Not implemented — interface spec only");
}
```

### 3.3 Tension Vector Computation

```typescript
/**
 * Compute tension vectors between all attractor pairs.
 *
 * Inputs:
 *   - AttractorNode[] (from computeAttractorNodes)
 *   - narrative_entity_relations for relationship types
 *   - Obligation topology TensionField result (optional)
 *   - Subject delta dependency edges (optional)
 *
 * Algorithm sketch:
 *   1. For each pair of attractors:
 *      a. Compute baseline tension from:
 *         - Distance between attractor positions in manifold
 *         - Relationship type (antagonistic = higher baseline)
 *         - Constitutional layer compatibility (core vs elastic)
 *      b. Adjust for topology:
 *         - If TensionField result available, blend with topology score
 *         - Match pair_characterKey to topology character pairs
 *      c. Compute direction from:
 *         - Relationship type asymmetry (mentor → student vs reciprocal)
 *         - Power/status differential
 *      d. Assign type tags from:
 *         - Relationship arc summary keywords
 *         - Beat types in scenes where this pair co-occurs
 *   2. Source attribution:
 *      - If topology data used: source = "obligation_topology"
 *      - If only attractor geometry used: source = "field_computation"
 *      - If subject deltas provided and matched: source = "subject_registry"
 */
export function computeTensionVectors(
  attractors: Record<string, AttractorNode>,
  topologyTensionField?: unknown,
): Record<string, TensionVector> {
  throw new Error("Not implemented — interface spec only");
}
```

### 3.4 Obligation Field Computation

```typescript
/**
 * Compute the obligation field from canon data and optional topology metrics.
 *
 * Inputs:
 *   - canon_json for explicit narrative promises
 *   - ObligationCharge result from obligation-topology.ts (optional)
 *   - AttractorNode[] for entity involvement
 *   - Scene graph for structural obligations
 *
 * Algorithm sketch:
 *   1. Extract explicit obligations from canon_json:
 *      - ongoing_threads → "promise" type
 *      - character arcs → "character_arc" type
 *      - premise/logline dramatic questions → "dramatic_question" type
 *      - forbidden_changes → implicit promise that these won't change
 *   2. Extract structural obligations from scene graph:
 *      - Act boundaries → "structural" type (audience told this is Act 1)
 *      - Scene-within-act positioning → promise of rising action
 *   3. Fuse with ObligationCharge results (if provided):
 *      - Match obligation types between systems
 *      - Topology's "outstanding" obligations map to field entries
 *      - Store topologyChargeId for traceability
 *   4. Compute energy from:
 *      - Constitutional layer (core = higher energy)
 *      - Time since loaded (decay modelled as energy decrease)
 *      - Number of attractor nodes involved (more nodes = more energy)
 *   5. Compute discharge state from scene graph:
 *      - Check if subsequent scenes contain payoff markers
 *      - Mark as discharged if payoff scene exists
 */
export function computeObligationField(
  canonJson: Record<string, unknown>,
  scenes: SceneSummary[],
  attractors: Record<string, AttractorNode>,
  topologyObligationCharge?: unknown,
): ObligationFieldEntry[] {
  throw new Error("Not implemented — interface spec only");
}
```

### 3.5 Resolution Density Measurement

```typescript
/**
 * Measure resolution density across the canonical field.
 *
 * Resolution density = how much of the total field can be reconstructed
 * from a given fragment (attractor node or scene).
 *
 * Algorithm sketch:
 *   1. Per attractor:
 *      a. Compute degree centrality in the attractor co-occurrence graph
 *      b. Count obligation field entries involving this attractor
 *      c. Compute entity exclusivity (rarity-weighted co-occurrence)
 *      d. Density = weighted sum of (centrality × 0.3, obligation_involvement × 0.3, exclusivity × 0.2, mass × 0.2)
 *   2. Per scene:
 *      a. Sum of attractor densities for entities in this scene
 *      b. Normalise by scene length (density per word)
 *      c. Adjust for scene position (climax scenes carry more weight)
 *   3. Field aggregate: mean of all per-attractor densities
 *
 * NOTE on prior prototype findings (resolution-density-prototype.md):
 *   The bipartite-reach approach saturates on densely connected graphs.
 *   This design uses entity exclusivity and obligation load as alternative
 *   differentiators to avoid saturation.
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
  throw new Error("Not implemented — interface spec only");
}
```

### 3.6 Thermodynamics Computation

```typescript
/**
 * Compute canonical thermodynamics from field state.
 *
 * Implements the three laws of canonical thermodynamics.
 *
 * Algorithm sketch:
 *   1. Total energy = sum of all obligation energies, normalised to [0, 1]
 *   2. Entropy calculation:
 *      a. Count obligations without clear discharge paths
 *      b. Measure directional specificity (how many obligations point
 *         toward at least one discharge-capable attractor pair)
 *      c. entropy = 1 - (directed_obligations / total_obligations)
 *   3. Narrative temperature:
 *      a. Compute loading rate: obligations loaded per scene in window
 *      b. Compute discharge rate: obligations discharged per scene in window
 *      c. Temperature = loading_rate - discharge_rate
 *      d. hot = >0.5, temperate = -0.5 to 0.5, cold = <-0.5
 *   4. Interference noise:
 *      a. Detect tension vectors with conflicting directionality
 *      b. Count obligation entries with overlapping attractors but
 *         contradictory obligation types
 *   5. Resonance stability = 1 - (entropy × 0.5 + interference × 0.5)
 *   6. Dominant regime:
 *      - Loading: obligations_loaded > obligations_discharged
 *      - Discharging: obligations_discharged > obligations_loaded
 *      - Sustaining: near-equal rates with high total energy
 *      - Resolved: near-zero total energy
 *      - Decaying: high entropy, low directional specificity
 */
export function computeThermodynamics(
  attractors: Record<string, AttractorNode>,
  tensionVectors: Record<string, TensionVector>,
  obligationField: ObligationFieldEntry[],
  resolutionDensity: { perAttractor: Record<string, number>; perScene: Record<string, number>; fieldAggregate: number },
): CanonicalThermodynamics {
  throw new Error("Not implemented — interface spec only");
}
```

### 3.7 Project From Canon — Render Through a Lens

```typescript
/**
 * Project the canonical field through a given axis/lens.
 *
 * This is the function that makes the holographic canon operational:
 * it READS the latent manifold and PRODUCES a rendered output in the
 * format/lens requested.
 *
 * DATA FLOW:
 *   LatentCanonState + ProjectionAxis
 *         │
 *         ▼
 *   holographicCanon.projectFromCanon()
 *         │
 *         ├── 1. Apply entityFilter (if any)
 *         ├── 2. Apply sceneFilter (if any)
 *         ├── 3. Apply constitutionalLayer filter
 *         ├── 4. Render based on axis type:
 *         │      ├── script:    linearise scenes, format sluglines
 *         │      ├── character: traverse field from single attractor
 *         │      ├── treatment: extract beat-level obligations
 *         │      ├── timeline:  chronological sort + state transitions
 *         │      ├── thematic:  trace a single theme across the field
 *         │      └── [extensible — new axes added via config]
 *         ├── 5. Measure achieved density in the projection
 *         └── 6. Return ProjectedOutput with self-faithfulness check
 *
 * CONSUMERS:
 *   - dev-engine-v2: calls projectFromCanon() before LLM invocation
 *     to provide perspective-specific generation context
 *   - Writer dashboard: renders projections for comparison
 *   - Ladder invariants: checks projection quality before promotion
 *
 * CACHING:
 *   Per (stateId, axisId, entityFilter fingerprint, sceneFilter fingerprint).
 *   Cache is invalidated when the source LatentCanonState is recomputed.
 */
export function projectFromCanon(
  canonState: LatentCanonState,
  axis: ProjectionAxis,
): ProjectedOutput {
  throw new Error("Not implemented — interface spec only");
}
```

### 3.8 Score Faithfulness — Measure Alignment

```typescript
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
 *   (character names, relationships, world rules) survive into generated text.
 *   scoreFaithfulness() checks STRUCTURAL alignment — does the generated
 *   text maintain the field's obligation topology, attractor relationships,
 *   and thermodynamic state.
 *   They are complementary: detectCanonDrift catches surface errors,
 *   scoreFaithfulness catches structural drift.
 *
 * Algorithm sketch:
 *   1. Parse generated output into structured form (per axis type)
 *   2. Entity identity check:
 *      - Extract entity names from output, match to attractors
 *      - Check for hallucinated entities (in output but not in canon)
 *      - Check for omitted entities (in canon but not in output)
 *   3. Relationship accuracy check:
 *      - Extract stated/implied relationships from output
 *      - Compare against tension vectors in field
 *   4. Obligation tracking:
 *      - Check output's obligation load/discharge matches field state
 *      - Flag if output creates new obligations not in field
 *      - Flag if output resolves obligations not yet loaded in field
 *   5. Thematic alignment:
 *      - Extract thematic signals from output
 *      - Compare against attractor typeTags and obligation types
 *   6. Tone consistency:
 *      - Classify tone register of output
 *      - Compare against canon context tone
 *   7. Aggregate: weighted sum of dimension scores
 *
 * Return:
 *   CanonScore with per-dimension breakdown and specific violations.
 */
export function scoreFaithfulness(
  projectCanonState: LatentCanonState,
  generatedOutput: string,
  axis: ProjectionAxis,
): CanonScore {
  throw new Error("Not implemented — interface spec only");
}
```

### 3.9 Resolve Equilibrium — Re-compute Field After Changes

```typescript
/**
 * Re-resolve the canonical field equilibrium after state changes.
 *
 * When the canon changes (new scene, entity edit, overlay applied),
 * the field must be re-resolved to find the new equilibrium.
 * This is the propagation mechanism — it applies the change and
 * re-computes the entire field configuration to find the new
 * stable attractor state.
 *
 * DIFFERENCE FROM computeCanonState():
 *   computeCanonState() computes from SCRATCH (full recompute).
 *   resolveEquilibrium() starts from the PRIOR state and applies
 *   a delta, re-computing only the affected portions and then
 *   re-stabilising globally.
 *
 * Algorithm sketch:
 *   1. Take prior LatentCanonState + list of changed entity/scene IDs
 *   2. Re-compute attractor nodes for changed entities only
 *   3. Re-compute tension vectors involving changed attractors
 *      (leave unchanged pairs as-is)
 *   4. Re-compute obligation field for affected scenes
 *   5. Re-compute resolution density for changed attractors/scenes
 *   6. Re-compute thermodynamics from the partially-updated field
 *   7. Return updated LatentCanonState with new stateId and computedAt
 *
 * If topologyMetrics changed: re-compute obligation field and thermodynamics.
 * If subjectDeltas provided: update attractor nodes for delta-affected subjects.
 * If canonJson changed: re-compute entire field (full recompute faster than delta).
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
  throw new Error("Not implemented — interface spec only");
}
```

### 3.10 Utility Functions

```typescript
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
      resolution: { format: "screenplay", includeSceneNumbers: true, includeSluglines: true },
      layers: ["core", "elastic", "artifact"],
      entityFilter: [],
      sceneFilter: [],
    },
    {
      axisId: "character",
      label: "Character POV Projection",
      resolution: { format: "character_profile", includeBackstory: true, includeArc: true },
      layers: ["core", "elastic"],
      entityFilter: [],
      sceneFilter: [],
    },
    {
      axisId: "treatment",
      label: "Treatment-Level Projection",
      resolution: { format: "treatment", includeBeats: true, includeThemes: true },
      layers: ["core", "elastic"],
      entityFilter: [],
      sceneFilter: [],
    },
    {
      axisId: "timeline",
      label: "Chronological Projection",
      resolution: { format: "timeline", sortByAct: true, includeStateTransitions: true },
      layers: ["core", "elastic", "artifact"],
      entityFilter: [],
      sceneFilter: [],
    },
    {
      axisId: "thematic",
      label: "Thematic Through-Line Projection",
      resolution: { format: "thematic_extraction", extractThemes: ["all"] },
      layers: ["core"],
      entityFilter: [],
      sceneFilter: [],
    },
    {
      axisId: "obligation_map",
      label: "Obligation Topology Map",
      resolution: { format: "obligation_graph", includeEnergyMetrics: true, showDischargePaths: true },
      layers: ["core", "elastic"],
      entityFilter: [],
      sceneFilter: [],
    },
  ];
}

/**
 * Export a canonical state as JSON for persistence.
 * Deterministic: same state → same JSON.
 */
export function serializeCanonState(state: LatentCanonState): string {
  throw new Error("Not implemented — interface spec only");
}

/**
 * Import a canonical state from persisted JSON.
 */
export function deserializeCanonState(json: string): LatentCanonState {
  throw new Error("Not implemented — interface spec only");
}

/**
 * Hash inputs for cache dedup (DJB2a, consistent with canonSubjectRegistry).
 */
export function hashCanonInputs(narrativeState: NarrativeState): string {
  throw new Error("Not implemented — interface spec only");
}

/**
 * Check if two canonical states are equivalent (same field configuration).
 */
export function statesAreEquivalent(a: LatentCanonState, b: LatentCanonState): boolean {
  throw new Error("Not implemented — interface spec only");
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
  throw new Error("Not implemented — interface spec only");
}
```

---

## 4. Integration Points with Existing Modules

### 4.1 Import/Export Matrix

| Module | Import from Holographic Canon | Export to Holographic Canon |
|--------|-------------------------------|----------------------------|
| **obligation-topology.ts** | `AttractorNode` (for relationship arc enrichment) | `ObligationTopologyState` → field curvature metrics |
| **canonSubjectRegistry.ts** | `LatentCanonState` (for subject projection targets) | `SubjectDelta[]` → attractor node updates |
| **canonConstraintEnforcement.ts** | `CanonScore` (for enriched drift detection) | `CanonConstraints` → core canon layer data |
| **narrativeContextResolver.ts** | `ProjectedOutput` (for NEC context enrichment) | `NarrativeContext` → scene-level context |
| **dev-engine-v2/index.ts** | `projectFromCanon()` → perspective context | Document generation requests |
| **ladder-invariant.ts** | `CanonScore.score` → promotion gating | Stage progression state |
| **auto-run/index.ts** | Pipeline event: canon state recomputed | Pipeline execution context |

### 4.2 File Changes Required for Integration

| File | Change | Risk |
|------|--------|------|
| `_shared/obligation-topology.ts` | Add optional `AttractorNode[]` input to `computeAll()` for tension vector enrichment | Low — nullable field, backward compatible |
| `_shared/canonSubjectRegistry.ts` | Add optional projection to `getSubjectProjectionTargets()` using holographic canon state | Low — new function path |
| `_shared/narrativeContextResolver.ts` | Call `projectFromCanon()` for NEC context enrichment if holographic canon state exists | Low — conditional call |
| `docs/STRATEGIC_ARCHITECTURE_BRIEFING.md` | Reference holographic-canon module in engine inventory | Documentation only |

### 4.3 Tables That MAY Be Needed (Schema Drift — To Be Determined at Implementation)

| Table | Purpose | Risk | Justification |
|-------|---------|------|---------------|
| `canon_field_states` | Persist `LatentCanonState` snapshots per project + version | Medium | Needed for stateful projections and diff tracking. Without it, the field is recalculated every time. |
| `canon_field_projections` | Cache `ProjectedOutput` results per (stateId, axis) | Low | Performance optimisation — projection is expensive to recompute. |
| `canon_field_scores` | Persist `CanonScore` results for faithfulness tracking | Low | Append-only, similar to neural_validation_runs pattern. |

**Schema Drift Assessment: HIGH** — These are new tables that extend the canon subsystem. They are additive and backwards-compatible (existing code continues to work without them), but they do require migration work. See Section 6 for full assessment.

---

## 5. Design Decisions

### 5.1 Extensible Axis System

Multi-perspective axes use a **config-driven registry**, not a fixed enum. New projection axes can be added at runtime by:
1. Creating a new `ProjectionAxis` config entry
2. Adding a render handler in `projectFromCanon()` (or an extensible dispatch table)
3. No module-level code changes for new axes

This satisfies the "Do NOT change module" requirement for extensibility.

### 5.2 Field Separation: obligationField vs ObligationCharge

| | ObligationFieldEntry (holographic-canon) | OutstandingObligation (obligation-topology) |
|---|---|---|
| **What** | Canonical stored energy | Observable narrative debt |
| **Source** | Canon field geometry + topology fusion | Beat analysis + scene context |
| **Energy** | Scalar [0, 1] with decay model | Urgency enum + payoff horizon |
| **Granularity** | Field-level (across all attractors) | Per-scene cumulative |
| **Resolution** | Via field re-equilibration | Via payoff beat detection |

They track the SAME phenomenon at different abstraction levels. The bridge is `topologyChargeId` in `ObligationFieldEntry`.

### 5.3 Resolution Density — Avoiding Saturation

Building on the prototype findings from `resolution-density-prototype.md`:
- The prior bipartite-reach approach saturated on YETI's dense character network
- This design uses THREE signals to differentiate: centrality, obligation involvement, and entity exclusivity
- The weighting factor (0.3/0.3/0.2/0.2) is a starting recommendation — should be validated against real data

### 5.4 Determinism vs AI

All functions in this module are PURE DATA TRANSFORMATIONS — they do NOT call LLMs. The module is deterministic:
- Same narrative state + same canon JSON → same LatentCanonState
- Same LatentCanonState + same ProjectionAxis → same ProjectedOutput
- Same pair of (state, output) → same CanonScore

Stochastic elements (LLM calls) happen OUTSIDE this module — in the dev engine and generation layer. This module provides the canonical reference against which LLM outputs are measured.

### 5.5 No UI Dependencies

This module is pure TypeScript, no React imports, no DOM references, no runtime dependencies. It can be used in edge functions, CLI tools, backend services, and locally — anywhere Deno runs.

---

## 6. Schema Drift Assessment

**Risk: HIGH** — but justified.

**Why HIGH:**
- New tables may be required (`canon_field_states`, `canon_field_projections`, `canon_field_scores`)
- New RLS policies needed for any new tables
- Migration work to create tables and indexes

**Mitigations:**
- All integrations are BACKWARD COMPATIBLE — existing code continues to work without holographic canon tables
- The module returns stub/empty data when its tables don't exist (fail closed)
- Phase-in approach: Step 1 = core types + compute functions (no schema changes). Step 2 = persistence + projections (schema changes)

**No risk to existing data:**
- This module NEVER writes to existing tables
- All new writes go to new tables only
- Existing canon tables (`project_canon`, `project_canon_versions`, `canon_units`) are READ-ONLY from this module's perspective

---

## 7. Build Order

### Phase 1 — Core Types + Compute (Zero schema drift, zero integration)
1. Create `_shared/holographic-canon.ts` with all type definitions
2. Implement `computeCanonState()` with all sub-functions
3. Implement utility functions (serialize, hash, diff, equivalence)
4. No new tables yet — state lives in memory or existing development_runs

### Phase 2 — Integration with obligation-topology
5. Add optional AttractorNode[] input to obligation-topology's computeAll()
6. Test integration: compute field state from YETI project data
7. Validate resolution density formula on YETI (verify no saturation)

### Phase 3 — Persistence (Schema drift — requires migration)
8. Create `canon_field_states` table (project_id, state_id, state_json, input_hash, computed_at)
9. Create `canon_field_projections` table (state_id, axis_fingerprint, projected_output, cached_at)
10. Create `canon_field_scores` table (project_id, document_id, version_id, score_json, scored_at)
11. Wire persistence into computeCanonState() and projectFromCanon()

### Phase 4 — Projection rendering (Post-June-1)
12. Implement `projectFromCanon()` with axis-specific projection logic
13. Implement `getDefaultAxes()` registry
14. Wire into dev-engine-v2 as optional context enrichment path

### Phase 5 — Faithfulness scoring (Post-June-1)
15. Implement `scoreFaithfulness()` with all dimension checks
16. Integrate with ladder-invariant.ts for promotion gating
17. Wire into writer dashboard for comparison views

---

## 8. File List

### New Files
| File | Purpose |
|------|---------|
| `supabase/functions/_shared/holographic-canon.ts` | Main module — types, interfaces, function signatures (THIS SPEC) |
| `docs/designs/holographic-canon.md` | This design document |

### Modified Files (Phase 2+)
| File | Change Summary |
|------|---------------|
| `supabase/functions/_shared/obligation-topology.ts` | Accept optional `LatentCanonState` AttractorNode[] in computeAll() |
| `supabase/functions/_shared/narrativeContextResolver.ts` | Call projectFromCanon() if holographic canon state available |
| `docs/STRATEGIC_ARCHITECTURE_BRIEFING.md` | Add holographic-canon engine to System Inventory |

---

## 9. Dependencies

### Confirmed Ready
- `obligation-topology.ts` — interface spec exists, implementation pending but types stable
- `canonSubjectRegistry.ts` — fully implemented and deployed
- `canonConstraintEnforcement.ts` — fully implemented
- TypeScript type system — all Deno-compatible types

### Needs Action Before Implementation
- YETI project data availability for validation — needs canonical field state from YETI's scene graph + entity links
- Canon JSON structure validation — ensure all fields holographic-canon reads (ongoing_threads, forbidden_changes) are populated

### Not Required (and thus unblocked)
- No new Supabase migration needed for Phase 1
- No Vercel deployment needed for edge functions
- No frontend changes needed for this module
- No LLM model access needed (pure data transformations)

---

## 10. UNCERTAINTIES (for Morpheus to validate)

1. **Resolution density formula** — The 0.3/0.3/0.2/0.2 weighting needs validation against real data. The prototype showed bipartite-reach saturation; this design uses entity exclusivity instead, but the efficacy is unconfirmed without real data.

2. **Number of attractor position dimensions** — modelVersion 1 uses a simple deterministic hash → coordinate mapping. The final dimensionality (how many axes in the manifold) is TBD based on the number of entity attributes available.

3. **Thermodynamics threshold values** — The hot/temperate/cold thresholds (>0.5, -0.5 to 0.5, <-0.5) are initial estimates. Real validation data will determine the correct boundaries.

4. **canon_field_states table schema** — Whether to store state as a single JSONB column (flexible, no schema enforcement) or as structured columns (schema rigidity, indexed) is deferred to implementation. JSONB preferred for Phase 3.

5. **Obligation energy decay model** — Linear decay? Exponential? Time-windowed? The model is structurally defined but the specific decay function is TBD.

6. **Integration point with auto-run pipeline** — Should canonical state recomputation be a Stage (like obligation_detect) or an inline enrichment (like NEC context)? Deferred to implementation.

---

*End of Holographic Canon Module Interface Spec v1.0*
*Author: Architect (Agent 3) — 2026-05-23*
*Design reference: Holographic Canon Theory v3 (vault/_red/holographic-canon-theory.md)*
*Peer module: obligation-topology.ts (supabase/functions/_shared/obligation-topology.ts)*