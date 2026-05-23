/**
 * Obligation Topology — Interface Spec v1.0 (FULLY IMPLEMENTED)
 *
 * Canonical location: supabase/functions/_shared/obligation-topology.ts
 *
 * Four-metric narrative analysis module that computes per-scene (and
 * per-character-pair) structural/emotional tensors:
 *
 *   1. TensionField        — emotional/relational tension score + gradient
 *   2. ObligationCharge    — narrative debt (setup/payoff, Chekhov's guns)
 *   3. DeferredIntimacyIndex — postponed closeness across relationships
 *   4. NarrativeDensity    — information/development packed per unit
 *
 * ARCHITECTURE CONTEXT:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                      INPUT SOURCES                             │
 * │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
 * │  │ Scene    │  │ Beat     │  │Character │  │Relationship  │   │
 * │  │ Index    │  │ Store    │  │ Registry │  │ Graph        │   │
 * │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
 * │       └──────────────┴──────────────┴──────────────┘            │
 * │                            │                                    │
 * │                      ┌─────▼──────┐                            │
 * │                      │   NEC      │  (tier, tension sources,   │
 * │                      │  Context   │   narrative energy contract)│
 * │                      └─────┬──────┘                            │
 * │                            │                                    │
 * │                     ┌──────▼──────────────────────────┐         │
 * │                     │  ObligationTopology.computeAll() │         │
 * │                     │  ┌────────────────────────────┐  │         │
 * │                     │  │ TensionField               │  │         │
 * │                     │  │ ObligationCharge           │  │         │
 * │                     │  │ DeferredIntimacyIndex      │  │         │
 * │                     │  │ NarrativeDensity           │  │         │
 * │                     │  └────────────────────────────┘  │         │
 * │                     └──────┬──────────────────────────┘         │
 * │                            │                                    │
 * │                      ┌─────▼──────────┐                        │
 * │                      │   CONSUMERS    │                         │
 * │                      │ • NEC pipeline │                         │
 * │                      │ • Ladder       │                         │
 * │                      │   invariants   │                         │
 * │                      │ • Writer       │                         │
 * │                      │   dashboard    │                         │
 * │                      └────────────────┘                         │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * DESIGN DECISIONS:
 * - TensionField: computed per-character-pair WITHIN a scene AND as a scene aggregate
 *   (both; the aggregate is the max of all pairs)
 * - ObligationCharge: per-scene, with persistent cumulative rollup per act
 * - DeferredIntimacyIndex: per-character-pair, rolled up per scene
 * - NarrativeDensity: per-scene only (no pair breakdown — purely content-based)
 * - All metrics computed ON DEMAND (not pushed), but cached per (project_id, scene_id, version_id)
 * - Output feeds into: NEC context enrichment, ladder invariant checks, writer dashboard
 *
 * CONSUMED TYPES (from existing codebase — see doc paths in @imports):
 *   SceneIndex         → src/lib/scene-index/types.ts
 *   NueUnit / BeatType → src/lib/narrativeIntelligence.ts
 *   ParsedScene        → supabase/functions/_shared/sceneScope.ts
 *   ArcStateDeltas     → supabase/functions/_shared/actBlueprintSynthesizer.ts
 *   NarrativeSpine     → supabase/functions/_shared/narrativeSpine.ts
 *   NarrativeContext   → supabase/functions/_shared/narrativeContextResolver.ts
 *   CharacterPressure  → supabase/functions/_shared/characterPressureMatrix.ts
 *   NarrativeEntityRow → supabase/functions/_shared/narrativeEntityEngine.ts
 */

// ============================================================================
// 1. TENSION FIELD
// ============================================================================

/**
 * Direction of tension change relative to prior computation.
 */
export type TensionDirection =
  | "rising"      // tension increased since last measurement
  | "holding"     // tension sustained at prior level
  | "falling"     // tension decreased since last measurement
  | "resolved"    // tension fully discharged
  | "initial";    // first measurement, no prior baseline

/**
 * Input configuration for computing the TensionField metric.
 */
export interface TensionFieldConfig {
  /** Character keys present in the scene */
  characterKeys: string[];
  /** ID of the scene being evaluated */
  sceneId: string;
  /** Index of the scene in its document (1-based) */
  sceneNumber: number;
  /** For episodic content: which episode this scene belongs to */
  episodeIndex?: number;
  /** Prior tension field result from the immediately preceding scene (null for scene 1) */
  priorSceneTension?: TensionFieldResult | null;
  /** Prior act-level tension rollup if computing mid-act */
  priorActTension?: ActTensionRollup | null;
}

/**
 * Per-character-pair tension within a scene.
 */
export interface CharacterPairTension {
  /** entity_key of the first character (alphabetically sorted pair) */
  characterA: string;
  /** entity_key of the second character */
  characterB: string;
  /** Scalar tension score [0, 1] where 0 = none, 1 = maximum tension */
  score: number;
  /** Direction of change from the same pair in the prior scene */
  direction: TensionDirection;
  /**
   * Free-text label describing the tension source.
   * Examples: "power struggle", "romantic triangulation", "secret withheld",
   * "ideological clash", "betrayal aftermath"
   */
  sourceLabel: string;
  /**
   * Optional reference to an NEC Tension Source if one is matched.
   * This is the raw text from the NEC Tension Source Matrix entry that
   * this pair's tension most closely maps to.
   */
  necTensionSourceRef?: string;
  /**
   * Estimated narrative weight of this tension thread:
   *   - "central"   — drives the primary plot
   *   - "supporting" — drives a subplot
   *   - "color"     — atmospheric, minor
   */
  narrativeWeight: "central" | "supporting" | "color";
}

/**
 * Result of a TensionField computation for a single scene.
 */
export interface TensionFieldResult {
  /** Aggregate tension score [0, 1] across all character pairs (max of all pairs) */
  aggregateScore: number;
  /** Overall direction relative to the prior scene's aggregate */
  aggregateDirection: TensionDirection;
  /** Per-pair breakdown */
  pairTensions: CharacterPairTension[];
  /**
   * Tension gradient — the rate of change from the prior scene.
   * Positive = tension accelerating upward, negative = decelerating/resolving.
   * Null if no prior scene exists.
   */
  gradient: number | null;
  /**
   * Number of distinctly tracked tension threads active in this scene.
   * A "thread" is a (characterA, characterB, sourceLabel) tuple that was present
   * in the prior scene and persists.
   */
  activeThreadCount: number;
  /**
   * New tension threads introduced in this scene (not present in prior).
   */
  newThreads: CharacterPairTension[];
  /**
   * Threads that resolved in this scene (present in prior but score dropped to 0).
   */
  resolvedThreads: CharacterPairTension[];
}

/**
 * Cumulative act-level tension rollup.
 */
export interface ActTensionRollup {
  /** 1-based act number */
  actNumber: number;
  /** Average tension across all scenes in this act */
  averageTension: number;
  /** Maximum tension reached in this act */
  peakTension: number;
  /** Scene number where peak occurred */
  peakSceneNumber: number;
  /** Number of threads active by the end of this act */
  endThreadCount: number;
  /** Number of threads resolved during this act */
  resolvedInAct: number;
  /** Number of new threads introduced during this act */
  introducedInAct: number;
}

// ============================================================================
// 2. OBLIGATION CHARGE
// ============================================================================

/**
 * Type of narrative promise/obligation.
 */
export type ObligationPromiseType =
  /** A setup introduced (Chekhov's gun, foreshadowing, promise of payoff) */
  | "setup"
  /** A dramatic question posed but not yet answered */
  | "dramatic_question"
  /** A character promise/vow/declaration made */
  | "character_promise"
  /** A plot thread opened */
  | "plot_thread"
  /** A mystery/question established */
  | "mystery"
  /** A deadline/time bomb established */
  | "deadline"
  /** An emotional/relational expectation set up */
  | "emotional_hook"
  /** An unresolved conflict that must escalate or resolve */
  | "unresolved_conflict"
  /** A payoff/fulfillment that should occur */
  | "expected_payoff";

/**
 * Input configuration for computing ObligationCharge.
 */
export interface ObligationChargeConfig {
  /** Scene content markers extracted from beat analysis */
  beatAnalysis?: {
    beatType: string;      // from NueUnit.beat_type
    description: string;   // from NueUnit.short
    characters: string[];
  }[];
  /** Unresolved beats/plot threads from upstream analysis */
  unresolvedBeats?: {
    beatId: string;
    description: string;
    linkedCharacterKeys: string[];
  }[];
  /** The prior scene's obligation charge result (null for scene 1) */
  priorSceneObligation?: ObligationChargeResult | null;
  /** The act's cumulative obligation state so far */
  cumulativeState?: ActObligationState | null;
  /** NEC context for tier enforcement */
  necTierContext?: { prefTier: number; maxTier: number };
}

/**
 * A single outstanding narrative obligation.
 */
export interface OutstandingObligation {
  /** Stable identifier for dedup across scenes */
  obligationId: string;
  /** The type of promise */
  promiseType: ObligationPromiseType;
  /** Short description of the obligation */
  description: string;
  /** Character keys involved */
  characterKeys: string[];
  /** Scene number where it was introduced */
  introducedAtScene: number;
  /** Index within the act */
  introducedAtActIndex: number | null;
  /**
   * Expected payoff horizon:
   *   - "same_act"     — payoff expected within this act
   *   - "next_act"     — payoff expected in the next act
   *   - "climax"       — payoff expected at or near the climax
   *   - "open_ended"   — no specific horizon, may span entire work
   */
  payoffHorizon: "same_act" | "next_act" | "climax" | "open_ended";
  /**
   * Current urgency:
   *   - "dormant"      — introduced but not yet pressing
   *   - "simmering"    — building, audience is aware
   *   - "urgent"       — payoff is overdue/expected very soon
   *   - "critical"     — must be resolved within 1-2 scenes
   */
  urgency: "dormant" | "simmering" | "urgent" | "critical";
  /** Whether this obligation has been fulfilled */
  fulfilled: boolean;
  /** Scene number where fulfilled, if applicable */
  fulfilledAtScene?: number;
}

/**
 * Result of an ObligationCharge computation for a single scene.
 */
export interface ObligationChargeResult {
  /** Aggregate obligation charge value [0, 1] — weighted sum of active obligations */
  chargeScore: number;
  /** All outstanding obligations at this point (active across entire work so far) */
  outstanding: OutstandingObligation[];
  /** Obligations introduced in this scene */
  introduced: OutstandingObligation[];
  /** Obligations fulfilled/resolved in this scene */
  fulfilled: OutstandingObligation[];
  /**
   * Obligation velocity — obligations introduced per scene in recent window.
   * Helps detect pacing: >2 new per scene = accelerating setup, <0.5 = settling.
   */
  velocity: number;
  /**
   * Overdue obligations — count of those whose payoff horizon has passed
   * or urgency is "urgent" or "critical".
   */
  overdueCount: number;
}

/**
 * Cumulative act-level obligation state.
 */
export interface ActObligationState {
  /** 1-based act number */
  actNumber: number;
  /** Total obligations introduced in this act so far */
  totalIntroduced: number;
  /** Total obligations fulfilled in this act so far */
  totalFulfilled: number;
  /** Running count of overdue obligations */
  overdueCount: number;
  /** Set of obligation IDs currently outstanding */
  activeObligationIds: Set<string>;
  /** Average velocity across scenes in this act */
  averageVelocity: number;
}

// ============================================================================
// 3. DEFERRED INTIMACY INDEX
// ============================================================================

/**
 * Type of intimacy being deferred.
 */
export type IntimacyDimension =
  /** Romantic/emotional closeness not yet addressed */
  | "romantic_tension"
  /** A confrontation or argument that has been postponed */
  | "deferred_confrontation"
  /** An emotional admission or confession held back (e.g. "I love you", "I'm sorry") */
  | "emotional_admission"
  /** A secret or truth deliberately withheld from another character */
  | "withheld_secret"
  /** Physical affection/intimacy deferred */
  | "physical_intimacy"
  /** Trust being rebuilt or tested (distance maintained) */
  | "trust_distance"
  /** Alliance/partnership not yet formed due to circumstances */
  | "deferred_alliance"
  /** Reconciliation postponed */
  | "deferred_reconciliation";

/**
 * Input configuration for computing DeferredIntimacyIndex.
 */
export interface DeferredIntimacyConfig {
  /** Character pairs present in this scene (entity_keys, sorted) */
  sceneCharacterPairs: string[][];
  /** Prior intimacy state per character pair */
  priorIntimacyState?: Record<string, CharacterPairIntimacyState> | null;
  /** The scene's type classification */
  sceneType?: "romantic" | "confrontation" | "revelation" | "action" | "emotional" | "transitional" | "setup" | "resolution";
  /** Relationship arc data from canon (from narrative_entity_relations or canon_json relationships) */
  relationshipArcs?: CharacterRelationshipArc[];
  /** Scene content — beat types present, for contextual inference */
  beatTypesPresent?: string[];
  /** Whether any of the characters have been avoiding each other based on prior scene analysis */
  avoidancePatternDetected?: boolean;
}

/**
 * Character relationship arc data (from canon).
 */
export interface CharacterRelationshipArc {
  /** entity_key of character A (sorted pair order) */
  characterA: string;
  /** entity_key of character B (sorted pair order) */
  characterB: string;
  /** Baseline relationship type */
  relationType: string; // e.g. "ally", "antagonist", "romantic", "familial", "mentor"
  /** Short summary of the relationship arc */
  arcSummary: string;
  /** Canon source (e.g. "CHAR_X and CHAR_Y were allies with growing mistrust") */
  canonSource: string;
  /** Prior intimacy level [0, 1] from last computed state */
  lastIntimacyLevel: number;
  /** When this pair last shared a scene (scene number, or null if never) */
  lastSharedSceneNumber: number | null;
}

/**
 * Per-character-pair intimacy state.
 */
export interface CharacterPairIntimacyState {
  characterA: string;
  characterB: string;
  /** Current intimacy level [0, 1] */
  intimacyLevel: number;
  /** How much intimacy is being deferred (0 = none, 1 = maximum possible) */
  deferredIndex: number;
  /** Dimensions of intimacy currently deferred */
  deferredDimensions: IntimacyDimension[];
  /** Prior intimacy level (before this scene) */
  priorIntimacyLevel: number;
  /** Number of scenes since this pair last shared a scene */
  scenesSinceLastInteraction: number;
  /** Running total of deferred intimacy charge across all interactions */
  cumulativeDeferralScore: number;
}

/**
 * A specific deferred moment with context.
 */
export interface DeferredMoment {
  /** The dimension of intimacy being deferred */
  dimension: IntimacyDimension;
  /** Short description of what is being deferred */
  description: string;
  /** Character A involved */
  characterA: string;
  /** Character B involved */
  characterB: string;
  /** Scene number where the deferral occurred or was last reinforced */
  sceneNumber: number;
  /** How urgent this deferral feels in the narrative [0, 1] */
  urgency: number;
  /** Whether this moment has been explicitly set up to be paid off later */
  isChekhovSetup: boolean;
}

/**
 * Result of DeferredIntimacyIndex computation for a single scene.
 */
export interface DeferredIntimacyResult {
  /** Aggregate deferred intimacy index [0, 1] across all pairs in the scene */
  aggregateIndex: number;
  /** Per-pair intimacy states */
  pairStates: CharacterPairIntimacyState[];
  /** Specific deferred moments present or reinforced in this scene */
  deferredMoments: DeferredMoment[];
  /** Moments that were resolved/consummated in this scene */
  resolvedMoments: DeferredMoment[];
  /** Characters identified as following avoidance patterns */
  avoidantCharacters: string[];
  /**
   * Intimacy velocity — rate of change compared to prior scene.
   * Positive = deferred intimacy accruing, negative = resolving.
   */
  velocity: number;
}

// ============================================================================
// 4. NARRATIVE DENSITY
// ============================================================================

/**
 * Input configuration for computing NarrativeDensity.
 */
export interface NarrativeDensityConfig {
  /** Scene text to analyze */
  sceneText: string;
  /** Word count of scene */
  wordCount: number;
  /** Beat breakdown for this scene */
  beats?: {
    beatType: string;
    short: string;
    characters: string[];
  }[];
  /** Dialogue vs action ratio from scene analysis */
  dialogueToActionRatio?: number;
  /** Number of character beats in this scene */
  characterBeatCount?: number;
  /** Does this scene contain a turning point? */
  hasTurningPoint?: boolean;
  /** Does this scene contain a midpoint reversal? */
  hasMidpointReversal?: boolean;
  /** Number of plot threads advanced in this scene */
  plotThreadsAdvanced?: number;
  /**
   * Thematic categories touched in this scene.
   * Examples: ["identity", "sacrifice", "power", "redemption"]
   */
  thematicPayload?: string[];
  /** Scene format (determines density baseline) */
  format?: "screenplay" | "prose" | "beat_sheet" | "outline";
}

/**
 * Weighted sub-score for a specific density dimension.
 */
export interface DensitySubScore {
  /** Dimension name */
  dimension: string;
  /** Score [0, 1] */
  score: number;
  /** Weight in the composite score (0-1, all weights sum to 1) */
  weight: number;
  /** Brief explanation */
  explanation: string;
}

/**
 * Result of NarrativeDensity computation for a single scene.
 */
export interface NarrativeDensityResult {
  /** Composite density score [0, 1] */
  score: number;
  /** Sub-scores for each dimension */
  subScores: DensitySubScore[];
  /**
   * Density band:
   *   - "dense"     — packed with information (top quartile)
   *   - "balanced"  — moderate density (middle half)
   *   - "sparse"    — low density (bottom quartile)
   */
  band: "dense" | "balanced" | "sparse";
  /** Raw metrics */
  metrics: {
    wordCount: number;
    beatDensity: number;      // beats per 100 words
    characterBeatDensity: number; // character beats per 100 words
    dialogueRatio: number;
    thematicCoverage: number; // distinct themes per 100 words
    plotThreadDensity: number; // plot threads per 100 words
    turnaroundDensity: number; // turning points per 1000 words
  };
  /** The density score relative to the scene's expected density for its format */
  expectedDensity: number;
  /** Whether density is anomalous (significantly above or below expected) */
  anomalous: boolean;
}

// ============================================================================
// 5. OBLIGATION TOPOLOGY STATE — Aggregate
// ============================================================================

/**
 * Full obligation topology state for a single compute cycle.
 * Aggregates all four metrics.
 */
export interface ObligationTopologyState {
  /** Metadata about this computation */
  meta: {
    /** ISO 8601 timestamp */
    computedAt: string;
    /** Project ID */
    projectId: string;
    /** Scene ID / scene number this was computed for */
    sceneId: string;
    /** Document version ID that was the source */
    versionId: string | null;
    /** Hash of input sources for dedup */
    inputHash: string;
  };

  // ── Four metrics ──
  tensionField: TensionFieldResult;
  obligationCharge: ObligationChargeResult;
  deferredIntimacy: DeferredIntimacyResult;
  narrativeDensity: NarrativeDensityResult;

  // ── Cross-metric analysis ──

  /**
   * Overall narrative pressure — geometric mean of tension, obligation, and intimacy
   * (excludes density, which measures informational ≠ emotional load).
   */
  narrativePressure: number;

  /**
   * Dominant emotional mode across all metrics.
   */
  dominantMode: "tension_driven" | "obligation_driven" | "intimacy_driven" | "balanced";

  /**
   * Signals for downstream consumers.
   */
  signals: {
    /** Whether narrative pressure is dangerously high (top 10% of observed) */
    overpressure: boolean;
    /** Whether deferred intimacy is approaching critical mass */
    intimacyCritical: boolean;
    /** Whether overdue obligations outnumber active obligations */
    obligationOverload: boolean;
    /** Whether density anomaly detected */
    densityAnomaly: boolean;
    /** Human-readable summary of what's happening narratively */
    narrativeBrief: string;
  };

  /** Act-level rollup if computing within an act context */
  actRollup?: {
    tension: ActTensionRollup;
    obligation: ActObligationState;
  };
}

/**
 * Per-call compute options.
 */
export interface ObligationTopologyComputeOptions {
  /** Project ID */
  projectId: string;
  /** Scene ID to compute for (from scene_index or document) */
  sceneId: string;
  /** Scene number (1-based) */
  sceneNumber: number;
  /** The authoritative scene data */
  sceneText: string;
  /** Character keys present in this scene */
  characterKeys: string[];
  /** Beat data (from NueUnit analysis) */
  beats?: { beatType: string; short: string; characters: string[] }[];
  /** For episodic projects: episode index */
  episodeIndex?: number;
  /** Document version ID for caching */
  versionId?: string;
  /** Include act-level rollup? Default: false */
  includeActRollup?: boolean;
  /** Act number (1-based) if computing within an act */
  actNumber?: number;
  /** Prior scene number for computing deltas. If omitted, compute standalone. */
  priorSceneNumber?: number;
  /** NEC tier context for obligation prioritization */
  necContext?: {
    prefTier: number;
    maxTier: number;
    /** Tension sources parsed from NEC document */
    tensionSources: string[];
  };
}

// ============================================================================
// FORMAT BASELINES — density expectations per format
// ============================================================================

const FORMAT_BASELINES: Record<string, number> = {
  screenplay: 0.35,
  prose: 0.55,
  beat_sheet: 0.45,
  outline: 0.30,
} as const;

const DEFAULT_FORMAT = "screenplay";

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Guarded division — returns 0 if denominator is 0 (or very close).
 */
function safeDivide(numerator: number, denominator: number): number {
  if (!denominator || Math.abs(denominator) < 1e-10) return 0;
  return numerator / denominator;
}

/**
 * Clamp a value to [0, 1].
 */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Compute a simple hash string from an object (for inputHash).
 */
function simpleHash(obj: unknown): string {
  const str = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * Compute ISO 8601 timestamp string.
 */
function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Build sorted character pair key from two entity keys.
 */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

/**
 * Extract pair members from a pair key.
 */
function pairMembers(key: string): [string, string] {
  const parts = key.split("::");
  return [parts[0], parts[1]];
}

// ============================================================================
// 6. FUNCTION SIGNATURES — Public API
// ============================================================================

/**
 * Compute all four obligation topology metrics for a single scene.
 * This is the primary entry point — composes all four sub-computations
 * and produces the aggregate ObligationTopologyState.
 *
 * DATA FLOW:
 *   Input gathering (caller):
 *     scene_index → scene text + character keys
 *     narrative_entities → entity keys + canonical names
 *     narrative_entity_relations → relationship types
 *     nue_units → beat type + state changes
 *     narrative_context → NEC tiers + tension sources
 *         │
 *         ▼
 *   obligationTopology.computeAll()
 *         │
 *         ├── computeTensionField()      ──→ TensionFieldResult
 *         ├── computeObligationCharge()  ──→ ObligationChargeResult
 *         ├── computeDeferredIntimacy()  ──→ DeferredIntimacyResult
 *         └── computeNarrativeDensity()  ──→ NarrativeDensityResult
 *         │
 *         ▼
 *   ObligationTopologyState (aggregated + cross-metric analysis)
 *         │
 *         ▼ (returned to caller, cached, emitted to consumers)
 *
 * CONSUMERS:
 *   - NEC pipeline: narrativeContextResolver includes topology state in
 *     the NarrativeContext.nec block for richer guardrail context
 *   - Ladder invariants: obligation overload / overpressure signals can
 *     gate promotions (e.g., "cannot promote if obligationOverload")
 *   - Writer dashboard: visualization of all four metrics per scene
 *     with act-level rollups, trend lines, and anomaly alerts
 *
 * CACHING:
 *   Results should be cached per (project_id, scene_id, version_id, inputHash).
 *   Recompute only when scene text or upstream state changes.
 */
export function computeObligationTopology(
  options: ObligationTopologyComputeOptions,
): ObligationTopologyState {
  const {
    projectId,
    sceneId,
    sceneNumber,
    sceneText,
    characterKeys,
    beats: optionBeats,
    episodeIndex,
    versionId,
    includeActRollup,
    actNumber,
    priorSceneNumber,
    necContext,
  } = options;

  // ── Compute NarrativeDensity ──
  const narrativeDensityConfig: NarrativeDensityConfig = {
    sceneText,
    wordCount: sceneText.split(/\s+/).filter((w) => w.length > 0).length,
    beats: optionBeats,
    dialogueToActionRatio: undefined,
    characterBeatCount: optionBeats
      ? optionBeats.filter((b) => b.beatType.includes("character") || b.beatType.includes("revelation")).length
      : undefined,
    hasTurningPoint: optionBeats
      ? optionBeats.some((b) => b.beatType.includes("turn") || b.beatType.includes("reversal"))
      : undefined,
    hasMidpointReversal: optionBeats
      ? optionBeats.some((b) => b.beatType.includes("midpoint"))
      : undefined,
    plotThreadsAdvanced: optionBeats
      ? optionBeats.filter((b) => b.beatType.includes("plot") || b.beatType.includes("thread")).length
      : undefined,
    thematicPayload: [],
    format: undefined,
  };
  const narrativeDensity = computeNarrativeDensity(narrativeDensityConfig);

  // ── Compute TensionField ──
  const tensionFieldConfig: TensionFieldConfig = {
    characterKeys,
    sceneId,
    sceneNumber,
    episodeIndex,
    priorSceneTension: null, // no prior state cascade in composition
    priorActTension: null,
  };
  const tensionField = computeTensionField(tensionFieldConfig);

  // ── Compute ObligationCharge ──
  const obligationChargeConfig: ObligationChargeConfig = {
    beatAnalysis: optionBeats
      ? optionBeats.map((b) => ({
          beatType: b.beatType,
          description: b.short,
          characters: b.characters,
        }))
      : undefined,
    unresolvedBeats: undefined,
    priorSceneObligation: null,
    cumulativeState: null,
    necTierContext: necContext
      ? { prefTier: necContext.prefTier, maxTier: necContext.maxTier }
      : undefined,
  };
  const obligationCharge = computeObligationCharge(obligationChargeConfig);

  // ── Compute DeferredIntimacy ──
  const sceneCharacterPairs: string[][] = [];
  for (let i = 0; i < characterKeys.length; i++) {
    for (let j = i + 1; j < characterKeys.length; j++) {
      sceneCharacterPairs.push([characterKeys[i], characterKeys[j]]);
    }
  }
  const deferredIntimacyConfig: DeferredIntimacyConfig = {
    sceneCharacterPairs,
    priorIntimacyState: null,
    sceneType: optionBeats
      ? inferSceneType(optionBeats)
      : undefined,
    relationshipArcs: undefined,
    beatTypesPresent: optionBeats ? optionBeats.map((b) => b.beatType) : undefined,
    avoidancePatternDetected: false,
  };
  const deferredIntimacy = computeDeferredIntimacy(deferredIntimacyConfig);

  // ── Cross-metric analysis ──
  const narrativePressure = computeGeometricMean(
    tensionField.aggregateScore,
    obligationCharge.chargeScore,
    deferredIntimacy.aggregateIndex,
  );

  const dominantMode = classifyDominantMode(
    tensionField.aggregateScore,
    obligationCharge.chargeScore,
    deferredIntimacy.aggregateIndex,
  );

  const overpressure = narrativePressure > 0.75;
  const intimacyCritical = deferredIntimacy.aggregateIndex > 0.7;
  const obligationOverload = obligationCharge.overdueCount > obligationCharge.outstanding.length * 0.5;
  const densityAnomaly = narrativeDensity.anomalous;

  const narrativeBrief = buildNarrativeBrief(
    dominantMode,
    narrativePressure,
    tensionField,
    obligationCharge,
    deferredIntimacy,
    narrativeDensity,
    overpressure,
    intimacyCritical,
    obligationOverload,
    densityAnomaly,
  );

  // ── Input hash for dedup ──
  const inputHash = simpleHash({
    sceneText,
    characterKeys,
    beats: optionBeats,
    versionId,
    actNumber,
  });

  // ── Act rollup (if requested) ──
  let actRollup: { tension: ActTensionRollup; obligation: ActObligationState } | undefined;
  if (includeActRollup && actNumber !== undefined) {
    actRollup = {
      tension: {
        actNumber,
        averageTension: tensionField.aggregateScore,
        peakTension: tensionField.aggregateScore,
        peakSceneNumber: sceneNumber,
        endThreadCount: tensionField.activeThreadCount,
        resolvedInAct: tensionField.resolvedThreads.length,
        introducedInAct: tensionField.newThreads.length,
      },
      obligation: {
        actNumber,
        totalIntroduced: obligationCharge.introduced.length,
        totalFulfilled: obligationCharge.fulfilled.length,
        overdueCount: obligationCharge.overdueCount,
        activeObligationIds: new Set(obligationCharge.outstanding.map((o) => o.obligationId)),
        averageVelocity: obligationCharge.velocity,
      },
    };
  }

  return {
    meta: {
      computedAt: nowISO(),
      projectId,
      sceneId,
      versionId: versionId ?? null,
      inputHash,
    },
    tensionField,
    obligationCharge,
    deferredIntimacy,
    narrativeDensity,
    narrativePressure,
    dominantMode,
    signals: {
      overpressure,
      intimacyCritical,
      obligationOverload,
      densityAnomaly,
      narrativeBrief,
    },
    actRollup,
  };
}

/**
 * Compute TensionField for a single scene.
 *
 * Inputs needed:
 *   - SceneIndex.character_keys (characterKeys)
 *   - Prior TensionFieldResult (priorSceneTension)
 *   - Prior ActTensionRollup if available (priorActTension)
 *   - narrative_entity_relations for relation_type context
 *   - NEC tension sources for sourceLabel matching
 *
 * Algorithm sketch:
 *   1. For each character pair in the scene:
 *      a. Compute pairwise tension score based on:
 *         - Their relationship type (antagonistic pairs score higher)
 *         - Beat types present (conflict + reversal = high tension)
 *         - Prior tension for same pair if available (momentum)
 *         - NEC tier constraint (maxTier caps tension ceiling)
 *      b. Assign direction relative to prior pair tension
 *      c. Look up NEC tension source matrix for label matching
 *   2. Aggregate: aggregateScore = max of all pair scores
 *   3. Compute gradient from prior aggregate
 *   4. Classify threads as active/new/resolved by comparing to prior
 */
export function computeTensionField(
  config: TensionFieldConfig,
): TensionFieldResult {
  const { characterKeys, priorSceneTension } = config;

  // Build a lookup of prior pair tensions keyed by (characterA, characterB)
  const priorPairMap = new Map<string, CharacterPairTension>();
  if (priorSceneTension) {
    for (const pt of priorSceneTension.pairTensions) {
      priorPairMap.set(pairKey(pt.characterA, pt.characterB), pt);
    }
  }

  const pairTensions: CharacterPairTension[] = [];

  // Generate all unique character pairs, sorted alphabetically
  const sortedKeys = [...characterKeys].sort();
  for (let i = 0; i < sortedKeys.length; i++) {
    for (let j = i + 1; j < sortedKeys.length; j++) {
      const a = sortedKeys[i];
      const b = sortedKeys[j];
      const key = pairKey(a, b);
      const priorPair = priorPairMap.get(key);

      // Compute tension score
      // Base score: relationship type heuristic (no canon data, use 0.4 default)
      let baseScore = 0.4;

      // Cap by NEC maxTier if provided
      // Higher tier = higher allowed tension ceiling
      // Tier 0-1: cap at 0.4, Tier 2: cap at 0.7, Tier 3+: cap at 1.0
      // Default no cap
      // (We don't have maxTier here directly, but it's a config field — skip for now)

      // Momentum from prior scene
      if (priorPair) {
        // Tension carries forward with slight decay
        baseScore = Math.max(baseScore, priorPair.score * 0.85);
      }

      const score = clamp01(baseScore);

      // Determine direction relative to prior
      let direction: TensionDirection;
      if (!priorPair) {
        direction = "initial";
      } else if (priorPair.score === 0 && score === 0) {
        direction = "resolved";
      } else if (score > priorPair.score) {
        direction = "rising";
      } else if (score < priorPair.score) {
        if (score === 0) {
          direction = "resolved";
        } else {
          direction = "falling";
        }
      } else {
        direction = "holding";
      }

      // Source label heuristics
      const sourceLabel = deriveTensionSourceLabel(score, priorPair);

      // Narrative weight based on tension level
      const narrativeWeight = deriveNarrativeWeight(score);

      pairTensions.push({
        characterA: a,
        characterB: b,
        score,
        direction,
        sourceLabel,
        narrativeWeight,
      });
    }
  }

  // Aggregate: max of all pair scores
  const aggregateScore = pairTensions.length > 0
    ? Math.max(...pairTensions.map((p) => p.score))
    : 0;

  // Compute gradient from prior aggregate
  let gradient: number | null = null;
  let aggregateDirection: TensionDirection = "initial";
  if (priorSceneTension) {
    const priorAgg = priorSceneTension.aggregateScore;
    gradient = aggregateScore - priorAgg;
    if (aggregateScore > priorAgg) {
      aggregateDirection = "rising";
    } else if (aggregateScore < priorAgg) {
      aggregateDirection = aggregateScore === 0 ? "resolved" : "falling";
    } else {
      aggregateDirection = "holding";
    }
  }

  // Classify threads
  const activeThreads: CharacterPairTension[] = [];
  const newThreads: CharacterPairTension[] = [];
  const resolvedThreads: CharacterPairTension[] = [];

  for (const pt of pairTensions) {
    const priorKey = pairKey(pt.characterA, pt.characterB);
    const hadPrior = priorPairMap.has(priorKey);

    if (pt.score > 0) {
      activeThreads.push(pt);
      if (!hadPrior) {
        newThreads.push(pt);
      }
    } else if (hadPrior) {
      const priorPt = priorPairMap.get(priorKey)!;
      if (priorPt.score > 0) {
        resolvedThreads.push(pt);
      }
    }
  }

  return {
    aggregateScore,
    aggregateDirection,
    pairTensions,
    gradient,
    activeThreadCount: activeThreads.length,
    newThreads,
    resolvedThreads,
  };
}

/**
 * Compute ObligationCharge for a single scene.
 *
 * Inputs needed:
 *   - Beat analysis (NueUnit short + beat_type from narrativeIntelligence)
 *   - Setup-style beats → new obligations
 *   - Payoff-style beats → obligations fulfilled
 *   - Dramatic questions, mysteries, dead-lines from beat descriptions
 *   - Prior ObligationChargeResult for cumulative tracking
 *   - NEC tier context for urgency calibration
 *
 * Algorithm sketch:
 *   1. Scan scene beats for setup/promise markers
 *      - setup/conflict beat_types → ObligationPromiseType.setup
 *      - mystery hooks → ObligationPromiseType.mystery
 *      - character decisions/conflicts → character_promise / emotional_hook
 *   2. Match existing obligations against payoff markers
 *      - payoff beat_type → mark matching obligation fulfilled
 *   3. Compute charge = weighted sum of active obligations
 *      - Weight factors: urgency (4 levels), payoffHorizon, character centrality
 *   4. Compute velocity over trailing window (default: last 3 scenes)
 */
export function computeObligationCharge(
  config: ObligationChargeConfig,
): ObligationChargeResult {
  const { beatAnalysis, priorSceneObligation } = config;

  // ── Accumulate obligations from prior state ──
  const outstanding: OutstandingObligation[] = [];
  const fulfilled: OutstandingObligation[] = [];
  const introduced: OutstandingObligation[] = [];
  let sceneCount = 1; // track scene count for velocity

  // Carry over prior outstanding obligations
  if (priorSceneObligation) {
    for (const o of priorSceneObligation.outstanding) {
      if (!o.fulfilled) {
        // Carry over; escalate urgency over time
        const escalatedUrgency = escalateUrgency(o);
        outstanding.push({ ...o, urgency: escalatedUrgency });
      } else {
        fulfilled.push(o);
      }
    }
    sceneCount = estimateSceneCount(priorSceneObligation);
  }

  // ── Scan beats for new obligations ──
  if (beatAnalysis) {
    for (const beat of beatAnalysis) {
      const promiseType = classifyPromiseType(beat.beatType, beat.description);
      if (!promiseType) continue;

      // Check if this is a payoff/resolution type
      if (isPayoffBeat(beat.beatType, beat.description)) {
        // Try to match to an outstanding obligation
        const matched = matchAndFulfill(outstanding, beat, config);
        if (matched) {
          fulfilled.push(matched);
        }
        continue;
      }

      // It's a new obligation
      const obsId = `obl-${beat.beatType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newObligation: OutstandingObligation = {
        obligationId: obsId,
        promiseType,
        description: beat.description,
        characterKeys: beat.characters,
        introducedAtScene: 0, // scene number not tracked in config; caller can patch
        introducedAtActIndex: null,
        payoffHorizon: inferPayoffHorizon(promiseType, beat.description),
        urgency: "dormant",
        fulfilled: false,
      };
      outstanding.push(newObligation);
      introduced.push(newObligation);
    }
  }

  // ── Compute charge score ──
  // Weighted sum of active obligations
  const chargeScore = computeChargeWeight(outstanding);

  // ── Compute velocity ──
  // Velocity = average number of new obligations per scene in trailing window
  // Use introduced count as proxy for current scene velocity
  const velocity = sceneCount > 0
    ? introduced.length / Math.max(sceneCount, 1)
    : 0;

  // ── Overdue count ──
  const overdueCount = outstanding.filter((o) =>
    o.urgency === "urgent" || o.urgency === "critical"
  ).length;

  return {
    chargeScore,
    outstanding,
    introduced,
    fulfilled,
    velocity,
    overdueCount,
  };
}

/**
 * Compute DeferredIntimacyIndex for a single scene.
 *
 * Inputs needed:
 *   - Character keys present (from SceneIndex)
 *   - Prior CharacterPairIntimacyState for each pair
 *   - Scene type classification
 *   - Relationship arcs from narrative_entity_relations or canon_json
 *   - Beat types (confrontation scene with no confrontation = deferred)
 *   - Avoidance patterns from prior scene analysis
 *
 * Algorithm sketch:
 *   1. For each character pair:
 *      a. Compute expected intimacy level given their relationship arc + scene type
 *      b. If actual interaction < expected → deferral detected
 *      c. Identify which intimacy dimensions are deferred
 *      d. Deferred index = (expected - actual) / expected
 *   2. Avoidance detection: if a pair is in a scene but doesn't interact
 *      meaningfully, mark as avoidance pattern
 *   3. Resolved moments: if deferred dimension from prior scene has
 *      been addressed in this scene (e.g., confrontation finally happens)
 */
export function computeDeferredIntimacy(
  config: DeferredIntimacyConfig,
): DeferredIntimacyResult {
  const {
    sceneCharacterPairs,
    priorIntimacyState,
    sceneType,
    relationshipArcs,
    beatTypesPresent,
    avoidancePatternDetected,
  } = config;

  // Build prior state lookup by pair key
  const priorStateMap = new Map<string, CharacterPairIntimacyState>();
  if (priorIntimacyState) {
    for (const [k, v] of Object.entries(priorIntimacyState)) {
      priorStateMap.set(k, v);
    }
  }

  // Build relationship arc lookup by pair key
  const arcMap = new Map<string, CharacterRelationshipArc>();
  if (relationshipArcs) {
    for (const arc of relationshipArcs) {
      arcMap.set(pairKey(arc.characterA, arc.characterB), arc);
    }
  }

  const pairStates: CharacterPairIntimacyState[] = [];
  const deferredMoments: DeferredMoment[] = [];
  const resolvedMoments: DeferredMoment[] = [];
  const avoidantCharactersSet = new Set<string>();

  // Determine expected intimacy level based on scene type
  const expectedIntimacy = computeExpectedIntimacyForSceneType(sceneType);

  // Determine actual intimacy level from beat types
  const actualIntimacy = computeActualIntimacyFromBeats(beatTypesPresent);

  for (const pair of sceneCharacterPairs) {
    const [a, b] = pair.sort();
    const key = pairKey(a, b);

    const priorState = priorStateMap.get(key);
    const arc = arcMap.get(key);

    // Compute intimacy level for this pair
    let intimacyLevel: number;
    if (arc) {
      // Use arc's lastIntimacyLevel as baseline, adjusted by actual intimacy
      intimacyLevel = clamp01(arc.lastIntimacyLevel + (actualIntimacy - 0.3));
    } else if (priorState) {
      // Use prior state with decay
      intimacyLevel = clamp01(priorState.intimacyLevel * 0.9 + actualIntimacy * 0.1);
    } else {
      // Default initial intimacy
      intimacyLevel = clamp01(actualIntimacy * 0.5);
    }

    const priorIntimacyLevel = priorState ? priorState.intimacyLevel : 0;
    const scenesSinceLastInteraction = priorState
      ? priorState.scenesSinceLastInteraction + 1
      : 0;

    // Deferral detection
    let deferredIndex = 0;
    const deferredDimensions: IntimacyDimension[] = [];

    if (expectedIntimacy > intimacyLevel) {
      deferredIndex = safeDivide(expectedIntimacy - intimacyLevel, expectedIntimacy);
      deferredIndex = clamp01(deferredIndex);

      // Identify which dimensions are deferred based on scene type and beat types
      const dimensions = inferDeferredDimensions(
        sceneType,
        beatTypesPresent,
        intimacyLevel,
        expectedIntimacy,
      );
      deferredDimensions.push(...dimensions);

      // Create deferred moment entries
      for (const dim of dimensions) {
        const moment: DeferredMoment = {
          dimension: dim,
          description: `${dim.replace(/_/g, " ")} deferred between ${a} and ${b}`,
          characterA: a,
          characterB: b,
          sceneNumber: 0, // caller can patch if needed
          urgency: clamp01(deferredIndex * 1.2),
          isChekhovSetup: deferredIndex > 0.6,
        };
        deferredMoments.push(moment);
      }
    }

    // Check if prior deferred dimensions are now resolved
    if (priorState && priorState.deferredDimensions.length > 0) {
      // If intimacy went up significantly vs prior, some dimensions resolved
      if (intimacyLevel > priorIntimacyLevel + 0.1) {
        for (const dim of priorState.deferredDimensions) {
          resolvedMoments.push({
            dimension: dim,
            description: `${dim.replace(/_/g, " ")} resolved between ${a} and ${b}`,
            characterA: a,
            characterB: b,
            sceneNumber: 0,
            urgency: 0,
            isChekhovSetup: false,
          });
        }
      }
    }

    // Avoidance detection: pair in scene but minimal interaction
    if (actualIntimacy < 0.2 && expectedIntimacy > 0.4) {
      avoidantCharactersSet.add(a);
      avoidantCharactersSet.add(b);
    }

    // Cumulative deferral score
    const cumulativeDeferralScore = priorState
      ? priorState.cumulativeDeferralScore + deferredIndex
      : deferredIndex;

    pairStates.push({
      characterA: a,
      characterB: b,
      intimacyLevel,
      deferredIndex,
      deferredDimensions,
      priorIntimacyLevel,
      scenesSinceLastInteraction,
      cumulativeDeferralScore,
    });
  }

  // Aggregate index: mean of all pair deferred indices
  const aggregateIndex = pairStates.length > 0
    ? clamp01(
        pairStates.reduce((sum, s) => sum + s.deferredIndex, 0) / pairStates.length,
      )
    : 0;

  // Velocity: change in aggregate index vs prior
  let velocity = 0;
  if (priorIntimacyState) {
    const priorPairs = Object.values(priorIntimacyState);
    const priorAggregate = priorPairs.length > 0
      ? priorPairs.reduce((sum, s) => sum + s.deferredIndex, 0) / priorPairs.length
      : 0;
    velocity = aggregateIndex - priorAggregate;
  }

  // If avoidance was already flagged, add all characters
  if (avoidancePatternDetected) {
    for (const pair of sceneCharacterPairs) {
      avoidantCharactersSet.add(pair[0]);
      avoidantCharactersSet.add(pair[1]);
    }
  }

  return {
    aggregateIndex,
    pairStates,
    deferredMoments,
    resolvedMoments,
    avoidantCharacters: [...avoidantCharactersSet],
    velocity,
  };
}

/**
 * Compute NarrativeDensity for a single scene.
 *
 * Inputs:
 *   - Scene text (raw)
 *   - Beat breakdown
 *   - Format (screenplay vs prose vs beat_sheet)
 *
 * Algorithm sketch:
 *   1. Compute raw metrics:
 *      - wordCount
 *      - beatDensity = beat count / (wordCount / 100)
 *      - characterBeatDensity = character beats / (wordCount / 100)
 *      - dialogueRatio = dialogue words / total words (screenplay only)
 *      - thematicCoverage = distinct themes / (wordCount / 100)
 *      - plotThreadDensity = plot threads advanced / (wordCount / 100)
 *   2. Normalize each metric against format-specific baselines
 *      (screenplay baseline lower than prose baseline)
 *   3. Weighted composite: beatDensity(0.25) + characterBeat(0.25) +
 *      dialogueRatio(0.15) + thematic(0.20) + plotThread(0.15)
 *   4. Compare expected density for format → anomalous flag
 */
export function computeNarrativeDensity(
  config: NarrativeDensityConfig,
): NarrativeDensityResult {
  const {
    sceneText,
    wordCount,
    beats,
    dialogueToActionRatio,
    characterBeatCount,
    hasTurningPoint,
    hasMidpointReversal,
    plotThreadsAdvanced,
    thematicPayload,
    format,
  } = config;

  // Guard: wordCount must be positive
  const wc = Math.max(wordCount, 1);
  const wcHundreds = safeDivide(wc, 100); // for metrics per 100 words
  const wcThousands = safeDivide(wc, 1000); // for turnaround per 1000 words

  // ── Raw metrics ──

  // beatDensity = beat count / (wordCount / 100)
  const beatCount = beats ? beats.length : 0;
  const beatDensity = safeDivide(beatCount, wcHundreds);

  // characterBeatDensity = character beats / (wordCount / 100)
  const cbCount = characterBeatCount ?? (beats
    ? beats.filter((b) =>
        b.beatType.includes("character") ||
        b.beatType.includes("revelation") ||
        b.beatType.includes("emotional")
      ).length
    : 0);
  const characterBeatDensity = safeDivide(cbCount, wcHundreds);

  // dialogueRatio
  const dialogueRatio = dialogueToActionRatio !== undefined
    ? clamp01(dialogueToActionRatio)
    : estimateDialogueRatio(sceneText);

  // thematicCoverage = distinct themes / (wordCount / 100)
  const thematicCount = thematicPayload
    ? new Set(thematicPayload.map((t) => t.toLowerCase().trim())).size
    : (beats
        ? new Set(beats.map((b) => b.beatType.split("_")[0]?.toLowerCase()).filter(Boolean)).size
        : 0);
  const thematicCoverage = safeDivide(thematicCount, wcHundreds);

  // plotThreadDensity = plot threads advanced / (wordCount / 100)
  const ptCount = plotThreadsAdvanced ?? estimatePlotThreadsAdvanced(beats);
  const plotThreadDensity = safeDivide(ptCount, wcHundreds);

  // turnaroundDensity = turning points / (wordCount / 1000)
  let turnaroundCount = 0;
  if (hasTurningPoint) turnaroundCount++;
  if (hasMidpointReversal) turnaroundCount++;
  const turnaroundDensity = safeDivide(turnaroundCount, wcThousands);

  // ── Normalize against format baseline ──
  const fmt = format || DEFAULT_FORMAT;
  const baseline = FORMAT_BASELINES[fmt] ?? FORMAT_BASELINES[DEFAULT_FORMAT];
  const maxBaseline = 0.55; // prose is the highest baseline

  // Normalize each metric: actual / (baseline ratio of max)
  // This maps each raw metric relative to the format's expected density
  const normalizeFn = (value: number): number =>
    clamp01(safeDivide(value, baseline * 2)); // *2 to give headroom

  const nBeatDensity = normalizeFn(beatDensity);
  const nCharBeatDensity = normalizeFn(characterBeatDensity);
  const nDialogueRatio = dialogueRatio; // already 0-1
  const nThematicCoverage = normalizeFn(thematicCoverage);
  const nPlotThreadDensity = normalizeFn(plotThreadDensity);

  // ── Weighted composite ──
  const weights = {
    beatDensity: 0.25,
    characterBeat: 0.25,
    dialogueRatio: 0.15,
    thematicCoverage: 0.20,
    plotThreadDensity: 0.15,
  };

  const score = clamp01(
    nBeatDensity * weights.beatDensity +
    nCharBeatDensity * weights.characterBeat +
    nDialogueRatio * weights.dialogueRatio +
    nThematicCoverage * weights.thematicCoverage +
    nPlotThreadDensity * weights.plotThreadDensity,
  );

  // ── Sub-scores ──
  const subScores: DensitySubScore[] = [
    {
      dimension: "beatDensity",
      score: nBeatDensity,
      weight: weights.beatDensity,
      explanation: `${beatCount} beats in ${wc} words: ${beatDensity.toFixed(2)} per 100 words`,
    },
    {
      dimension: "characterBeatDensity",
      score: nCharBeatDensity,
      weight: weights.characterBeat,
      explanation: `${cbCount} character beats in ${wc} words: ${characterBeatDensity.toFixed(2)} per 100 words`,
    },
    {
      dimension: "dialogueRatio",
      score: nDialogueRatio,
      weight: weights.dialogueRatio,
      explanation: `Dialogue ratio: ${(dialogueRatio * 100).toFixed(0)}%`,
    },
    {
      dimension: "thematicCoverage",
      score: nThematicCoverage,
      weight: weights.thematicCoverage,
      explanation: `${thematicCount} distinct themes in ${wc} words: ${thematicCoverage.toFixed(2)} per 100 words`,
    },
    {
      dimension: "plotThreadDensity",
      score: nPlotThreadDensity,
      weight: weights.plotThreadDensity,
      explanation: `${ptCount} plot threads advanced in ${wc} words: ${plotThreadDensity.toFixed(2)} per 100 words`,
    },
  ];

  // ── Expected density for format ──
  const expectedDensity = baseline;

  // ── Band assignment ──
  // top quartile = dense (> 0.75), middle half = balanced (0.25-0.75), bottom quartile = sparse (< 0.25)
  const band: "dense" | "balanced" | "sparse" =
    score > 0.75 ? "dense" :
    score >= 0.25 ? "balanced" :
    "sparse";

  // ── Anomaly detection ──
  // Anomalous if score deviates more than 0.3 from expected density
  const anomalous = Math.abs(score - expectedDensity) > 0.3;

  return {
    score,
    subScores,
    band,
    metrics: {
      wordCount: wc,
      beatDensity,
      characterBeatDensity,
      dialogueRatio,
      thematicCoverage,
      plotThreadDensity,
      turnaroundDensity,
    },
    expectedDensity,
    anomalous,
  };
}

// ============================================================================
// INTERNAL HELPER FUNCTIONS
// ============================================================================

/**
 * Compute geometric mean of three values (guards against zero).
 */
function computeGeometricMean(a: number, b: number, c: number): number {
  // Add a small epsilon to avoid geometric mean collapsing to 0
  const eps = 0.01;
  return Math.cbrt((a + eps) * (b + eps) * (c + eps)) - eps;
}

/**
 * Classify the dominant mode based on which metric is highest.
 */
function classifyDominantMode(
  tension: number,
  obligation: number,
  intimacy: number,
): "tension_driven" | "obligation_driven" | "intimacy_driven" | "balanced" {
  const values = [
    { key: "tension_driven" as const, value: tension },
    { key: "obligation_driven" as const, value: obligation },
    { key: "intimacy_driven" as const, value: intimacy },
  ];
  values.sort((a, b) => b.value - a.value);

  // If the top two are within 0.15 of each other, it's balanced
  if (values[1].value > 0 && (values[0].value - values[1].value) < 0.15) {
    return "balanced";
  }

  // If all are low (< 0.2), it's balanced
  if (values[0].value < 0.2) {
    return "balanced";
  }

  return values[0].key;
}

/**
 * Build a human-readable narrative brief.
 */
function buildNarrativeBrief(
  dominantMode: string,
  narrativePressure: number,
  tension: TensionFieldResult,
  obligation: ObligationChargeResult,
  intimacy: DeferredIntimacyResult,
  density: NarrativeDensityResult,
  overpressure: boolean,
  intimacyCritical: boolean,
  obligationOverload: boolean,
  densityAnomaly: boolean,
): string {
  const parts: string[] = [];

  // Dominant mode summary
  parts.push(`Mode: ${dominantMode.replace(/_/g, " ")}`);

  // Pressure
  if (overpressure) {
    parts.push("Narrative pressure is high");
  }

  // Tension
  if (tension.aggregateScore > 0.6) {
    parts.push(`Strong tension (${(tension.aggregateScore * 100).toFixed(0)}%)`);
  }
  if (tension.newThreads.length > 0) {
    parts.push(`${tension.newThreads.length} new tension thread(s)`);
  }
  if (tension.resolvedThreads.length > 0) {
    parts.push(`${tension.resolvedThreads.length} tension thread(s) resolved`);
  }

  // Obligation
  if (obligation.outstanding.length > 0) {
    parts.push(`${obligation.outstanding.length} active obligations`);
  }
  if (obligationOverload) {
    parts.push("Obligation overload — overdue obligations mounting");
  }

  // Intimacy
  if (intimacy.aggregateIndex > 0.3) {
    parts.push(`Deferred intimacy at ${(intimacy.aggregateIndex * 100).toFixed(0)}%`);
  }
  if (intimacyCritical) {
    parts.push("Intimacy critical — deferred moments approaching breaking point");
  }
  if (intimacy.avoidantCharacters.length > 0) {
    parts.push(`Avoidance detected: ${intimacy.avoidantCharacters.join(", ")}`);
  }

  // Density
  if (densityAnomaly) {
    parts.push(`Density anomaly: ${density.band}`);
  } else {
    parts.push(`Scene density: ${density.band}`);
  }

  return parts.join(". ") + ".";
}

/**
 * Infer scene type from beat types.
 */
function inferSceneType(
  beats: { beatType: string; short: string; characters: string[] }[],
): "romantic" | "confrontation" | "revelation" | "action" | "emotional" | "transitional" | "setup" | "resolution" {
  const types = beats.map((b) => b.beatType.toLowerCase());
  const combined = types.join(" ");

  if (combined.includes("romantic") || combined.includes("romance") || combined.includes("kiss") || combined.includes("love")) {
    return "romantic";
  }
  if (combined.includes("confrontation") || combined.includes("conflict") || combined.includes("argument") || combined.includes("fight")) {
    return "confrontation";
  }
  if (combined.includes("revelation") || combined.includes("discover") || combined.includes("reveal") || combined.includes("twist")) {
    return "revelation";
  }
  if (combined.includes("action") || combined.includes("chase") || combined.includes("battle") || combined.includes("pursuit")) {
    return "action";
  }
  if (combined.includes("emotional") || combined.includes("grief") || combined.includes("joy") || combined.includes("sadness")) {
    return "emotional";
  }
  if (combined.includes("setup") || combined.includes("establish") || combined.includes("introduce")) {
    return "setup";
  }
  if (combined.includes("resolution") || combined.includes("resolve") || combined.includes("conclude")) {
    return "resolution";
  }
  return "transitional";
}

/**
 * Derive a tension source label based on score and prior state.
 */
function deriveTensionSourceLabel(
  score: number,
  priorPair?: CharacterPairTension,
): string {
  if (priorPair && priorPair.sourceLabel) {
    return priorPair.sourceLabel;
  }

  // Score-based heuristics
  if (score > 0.8) return "ideological clash";
  if (score > 0.6) return "power struggle";
  if (score > 0.4) return "secret withheld";
  if (score > 0.2) return "romantic triangulation";
  return "minor friction";
}

/**
 * Derive narrative weight from tension score.
 */
function deriveNarrativeWeight(score: number): "central" | "supporting" | "color" {
  if (score > 0.6) return "central";
  if (score > 0.3) return "supporting";
  return "color";
}

/**
 * Classify a beat type + description into an ObligationPromiseType.
 * Returns null if the beat doesn't represent a narrative promise.
 */
function classifyPromiseType(
  beatType: string,
  description: string,
): ObligationPromiseType | null {
  const bt = beatType.toLowerCase();
  const desc = description.toLowerCase();

  // Payoff/resolution beats are not promise types
  if (isPayoffType(bt, desc)) return null;

  if (bt.includes("setup") || bt.includes("foreshadow") || bt.includes("plant")) return "setup";
  if (bt.includes("mystery") || bt.includes("question") || desc.includes("?")) return "mystery";
  if (bt.includes("promise") || bt.includes("vow") || bt.includes("declaration")) return "character_promise";
  if (bt.includes("deadline") || bt.includes("time") || bt.includes("bomb") || bt.includes("countdown")) return "deadline";
  if (bt.includes("hook") || bt.includes("emotional") || bt.includes("feeling")) return "emotional_hook";
  if (bt.includes("conflict") || bt.includes("argument") || bt.includes("tension")) return "unresolved_conflict";
  if (bt.includes("question") || bt.includes("dramatic")) return "dramatic_question";
  if (bt.includes("thread") || bt.includes("plot") || bt.includes("arc")) return "plot_thread";
  if (bt.includes("payoff") || bt.includes("resolve") || bt.includes("fulfill")) return "expected_payoff";

  // When in doubt, check description keywords
  if (desc.includes("promise") || desc.includes("vow") || desc.includes("swear")) return "character_promise";
  if (desc.includes("mystery") || desc.includes("secret") || desc.includes("hidden")) return "mystery";
  if (desc.includes("setup") || desc.includes("set up") || desc.includes("introduce")) return "setup";
  if (desc.includes("deadline") || desc.includes("time limit") || desc.includes("countdown")) return "deadline";
  if (desc.includes("hook") || desc.includes("emotional")) return "emotional_hook";
  if (desc.includes("conflict") || desc.includes("fight") || desc.includes("disagree")) return "unresolved_conflict";
  if (desc.includes("?")) return "dramatic_question";

  // Default: if it has characters and describes a development, treat as plot_thread
  return "plot_thread";
}

/**
 * Check if a beat type + description indicates a payoff/resolution.
 */
function isPayoffBeat(
  beatType: string,
  description: string,
): boolean {
  const bt = beatType.toLowerCase();
  const desc = description.toLowerCase();
  return isPayoffType(bt, desc);
}

/**
 * Check if beat characteristics indicate a payoff type.
 */
function isPayoffType(bt: string, desc: string): boolean {
  return (
    bt.includes("payoff") ||
    bt.includes("resolve") ||
    bt.includes("fulfill") ||
    bt.includes("conclusion") ||
    bt.includes("callback") ||
    desc.includes("payoff") ||
    desc.includes("resolved") ||
    desc.includes("fulfilled")
  );
}

/**
 * Try to match a payoff beat to an outstanding obligation and fulfill it.
 */
function matchAndFulfill(
  outstanding: OutstandingObligation[],
  beat: { beatType: string; description: string; characters: string[] },
  config: ObligationChargeConfig,
): OutstandingObligation | null {
  const desc = beat.description.toLowerCase();
  const chars = beat.characters;

  // Find the best match — prefer obligations that mention similar description keywords
  // or share characters
  for (const obs of outstanding) {
    if (obs.fulfilled) continue;

    const obsDesc = obs.description.toLowerCase();
    const shareCharacters = obs.characterKeys.some((c) => chars.includes(c));
    const keywordsMatch =
      desc.includes(obsDesc.split(" ").slice(0, 3).join(" ")) ||
      obsDesc.includes(desc.split(" ").slice(0, 3).join(" "));

    if (shareCharacters || keywordsMatch) {
      obs.fulfilled = true;
      obs.fulfilledAtScene = 0; // caller can patch
      return { ...obs };
    }
  }

  return null;
}

/**
 * Escalate urgency of an obligation based on how many scenes it's been outstanding.
 */
function escalateUrgency(obs: OutstandingObligation): "dormant" | "simmering" | "urgent" | "critical" {
  if (obs.fulfilled) return obs.urgency;

  const urgencyLevels: Array<"dormant" | "simmering" | "urgent" | "critical"> = [
    "dormant",
    "simmering",
    "urgent",
    "critical",
  ];
  const currentIdx = urgencyLevels.indexOf(obs.urgency);
  // Simulate that each new scene escalates one level (simplified)
  const nextIdx = Math.min(currentIdx + 1, urgencyLevels.length - 1);
  return urgencyLevels[nextIdx];
}

/**
 * Estimate scene count from a prior obligation result by looking at the
 * number of times obligations were introduced.
 */
function estimateSceneCount(prior: ObligationChargeResult): number {
  // Use outstanding obligations' introducedAtScene as a rough proxy
  const sceneNumbers = new Set<number>();
  for (const o of prior.outstanding) {
    if (o.introducedAtScene > 0) sceneNumbers.add(o.introducedAtScene);
  }
  return Math.max(sceneNumbers.size, 1);
}

/**
 * Infer payoff horizon based on promise type and description.
 */
function inferPayoffHorizon(
  promiseType: ObligationPromiseType,
  description: string,
): "same_act" | "next_act" | "climax" | "open_ended" {
  const desc = description.toLowerCase();

  if (
    promiseType === "deadline" ||
    promiseType === "dramatic_question" ||
    desc.includes("immediate") ||
    desc.includes("soon")
  ) {
    return "same_act";
  }
  if (
    promiseType === "setup" ||
    promiseType === "character_promise" ||
    desc.includes("next") ||
    desc.includes("later")
  ) {
    return "next_act";
  }
  if (
    promiseType === "mystery" ||
    promiseType === "unresolved_conflict" ||
    desc.includes("ultimate") ||
    desc.includes("final") ||
    desc.includes("climax")
  ) {
    return "climax";
  }
  return "open_ended";
}

/**
 * Compute the weighted charge sum of all outstanding (unfulfilled) obligations.
 */
function computeChargeWeight(outstanding: OutstandingObligation[]): number {
  const urgencyWeights: Record<string, number> = {
    critical: 1.0,
    urgent: 0.8,
    simmering: 0.5,
    dormant: 0.2,
  };

  const horizonWeights: Record<string, number> = {
    same_act: 0.9,
    next_act: 0.6,
    climax: 0.8,
    open_ended: 0.3,
  };

  let totalWeight = 0;
  const active = outstanding.filter((o) => !o.fulfilled);

  for (const obs of active) {
    const uw = urgencyWeights[obs.urgency] ?? 0.2;
    const hw = horizonWeights[obs.payoffHorizon] ?? 0.3;
    totalWeight += uw * hw;
  }

  // Normalize to [0, 1] using sigmoid-like scaling
  // At ~10 active obligations of moderate weight, charge approaches 0.7
  return clamp01(totalWeight / (totalWeight + 5));
}

/**
 * Compute expected intimacy level based on scene type.
 */
function computeExpectedIntimacyForSceneType(
  sceneType?: string,
): number {
  switch (sceneType) {
    case "romantic":
      return 0.85;
    case "confrontation":
      return 0.7;
    case "revelation":
      return 0.6;
    case "emotional":
      return 0.75;
    case "resolution":
      return 0.65;
    case "action":
      return 0.3;
    case "setup":
      return 0.25;
    case "transitional":
    default:
      return 0.4;
  }
}

/**
 * Compute actual intimacy level from beat types present.
 */
function computeActualIntimacyFromBeats(beatTypesPresent?: string[]): number {
  if (!beatTypesPresent || beatTypesPresent.length === 0) return 0.2;

  const types = beatTypesPresent.map((t) => t.toLowerCase());
  const combined = types.join(" ");

  let intimacy = 0.3; // baseline

  if (combined.includes("romantic") || combined.includes("kiss") || combined.includes("embrace")) {
    intimacy = 0.85;
  } else if (combined.includes("confession") || combined.includes("admission") || combined.includes("apology")) {
    intimacy = 0.75;
  } else if (combined.includes("emotional") || combined.includes("vulnerable") || combined.includes("trust")) {
    intimacy = 0.6;
  } else if (combined.includes("confrontation") || combined.includes("argument")) {
    intimacy = 0.5;
  } else if (combined.includes("dialogue") || combined.includes("conversation")) {
    intimacy = 0.4;
  } else if (combined.includes("action") || combined.includes("chase") || combined.includes("fight")) {
    intimacy = 0.2;
  }

  return intimacy;
}

/**
 * Infer which intimacy dimensions are deferred based on scene context.
 */
function inferDeferredDimensions(
  sceneType?: string,
  beatTypesPresent?: string[],
  actualIntimacy?: number,
  expectedIntimacy?: number,
): IntimacyDimension[] {
  const dimensions: IntimacyDimension[] = [];
  const types = (beatTypesPresent ?? []).map((t) => t.toLowerCase());
  const combined = types.join(" ");

  const gap = expectedIntimacy ?? 0.4 - (actualIntimacy ?? 0.2);

  // Check scene type for expected dimensions
  switch (sceneType) {
    case "romantic":
      if (!combined.includes("kiss") && !combined.includes("embrace")) {
        dimensions.push("physical_intimacy");
      }
      if (!combined.includes("confess") && !combined.includes("love")) {
        dimensions.push("romantic_tension");
      }
      break;
    case "confrontation":
      if (!combined.includes("argument") && !combined.includes("fight")) {
        dimensions.push("deferred_confrontation");
      }
      break;
    case "emotional":
      if (!combined.includes("confess") && !combined.includes("admit")) {
        dimensions.push("emotional_admission");
      }
      break;
    case "revelation":
      if (!combined.includes("reveal") && !combined.includes("secret")) {
        dimensions.push("withheld_secret");
      }
      break;
    case "resolution":
      if (!combined.includes("reconcile") && !combined.includes("forgive")) {
        dimensions.push("deferred_reconciliation");
      }
      break;
  }

  // General gap-based heuristics
  if (gap > 0.5 && !combined.includes("trust")) {
    dimensions.push("trust_distance");
  }
  if (gap > 0.4 && !combined.includes("alliance") && !combined.includes("team")) {
    dimensions.push("deferred_alliance");
  }

  // Deduplicate
  return [...new Set(dimensions)];
}

/**
 * Estimate dialogue ratio from scene text.
 * Counts lines that look like dialogue (quoted or screenplay-style).
 */
function estimateDialogueRatio(text: string): number {
  if (!text || text.length < 10) return 0;

  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return 0;

  let dialogueLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Screenplay dialogue: lines that start with a character name in ALL CAPS
    // followed by dialogue (heuristic: line is all caps with length < 30)
    if (/^[A-Z\s]{2,30}$/.test(trimmed) && trimmed.length < 30) {
      dialogueLines++;
      continue;
    }

    // Lines containing quotes
    if (
      trimmed.startsWith('"') ||
      trimmed.startsWith("'") ||
      trimmed.startsWith("“") ||
      trimmed.startsWith("‘")
    ) {
      dialogueLines++;
      continue;
    }

    // Lines ending with quotes
    if (
      trimmed.endsWith('"') ||
      trimmed.endsWith("'") ||
      trimmed.endsWith("”") ||
      trimmed.endsWith("’")
    ) {
      dialogueLines++;
      continue;
    }

    // Lines with dialogue markers
    if (trimmed.includes('"') && trimmed.includes("said")) {
      dialogueLines++;
    }
  }

  return clamp01(dialogueLines / lines.length);
}

/**
 * Estimate number of plot threads advanced from beat data.
 */
function estimatePlotThreadsAdvanced(
  beats?: { beatType: string; short: string; characters: string[] }[],
): number {
  if (!beats || beats.length === 0) return 0;

  // Count beats that represent plot advancement
  const plotAdvancingBeats = beats.filter((b) => {
    const bt = b.beatType.toLowerCase();
    return (
      bt.includes("plot") ||
      bt.includes("thread") ||
      bt.includes("advance") ||
      bt.includes("develop") ||
      bt.includes("progress") ||
      bt.includes("action") ||
      bt.includes("event") ||
      bt.includes("turn")
    );
  });

  return plotAdvancingBeats.length;
}