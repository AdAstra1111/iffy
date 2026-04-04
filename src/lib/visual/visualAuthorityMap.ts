/**
 * visualAuthorityMap.ts — Canonical Visual OS Authority Registry
 *
 * ARCHITECTURE CONSOLIDATION ARTIFACT
 *
 * This file defines the single canonical authority for each layer of the visual OS.
 * Import and reference these constants in code comments, guards, and documentation.
 *
 * Rules:
 * - Each layer has exactly ONE canonical authority path
 * - No downstream system may independently derive truth that an upstream authority owns
 * - Edge/server mirrors must maintain parity with client canonical implementations
 * - VCS is evaluative only — never a progression gate
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  LAYER                      │  AUTHORITY                                   │
 * ├─────────────────────────────┼──────────────────────────────────────────────┤
 * │  Temporal Truth             │  temporalTruthResolver.ts                    │
 * │    client entrypoint        │  useCanonicalTemporalTruth (hook)            │
 * │    edge entrypoint          │  resolveTemporalTruthFromCanon (shared)      │
 * │    persistence              │  canon_json.canonical_temporal_truth          │
 * │                             │                                              │
 * │  Effective Profile          │  effectiveProfileResolver.ts                 │
 * │    public entrypoint        │  resolveEffectiveProfile()                   │
 * │    null-safe                │  resolveEffectiveProfileOrNull()             │
 * │    primitive (internal)     │  effectiveWardrobeNormalizer.normalizeWardrobe│
 * │    edge mirror              │  _shared/effectiveWardrobeNormalizer.ts      │
 * │                             │                                              │
 * │  State Wardrobe             │  costumeOnActor.ts                           │
 * │    public entrypoint        │  resolveStateWardrobe()                      │
 * │    display contract         │  ResolvedStateWardrobe.displayGarments       │
 * │    invariant                │  assertNoForbiddenDisplayGarments()          │
 * │                             │                                              │
 * │  Visual Completion          │  canonCompletionProof.ts                     │
 * │    substrate                │  visual_sets (DB table)                      │
 * │    NOT completion           │  project_images presence                     │
 * │    NOT completion           │  wardrobe profile existence                  │
 * │    slot resolver            │  visualCanonSlotResolver.ts                  │
 * │                             │                                              │
 * │  Pipeline Stage Authority   │  pipelineStatusResolver.ts                   │
 * │    stage order              │  PD → Hero Frames (PD is upstream)           │
 * │                             │                                              │
 * │  Visual Coherence Score     │  visualCoherenceEngine.ts                    │
 * │    role                     │  EVALUATIVE ONLY — not a progression gate    │
 * │    feeds                    │  GP (non-destructive signal)                 │
 * │    input assembly           │  vcsInputAssembler.ts                        │
 * │                             │                                              │
 * │  UI Surface Boundaries      │                                              │
 * │    Source Truth             │  upstream extracted/resolved canonical truth  │
 * │    Visual Canon Completion  │  downstream visual coverage from visual_sets │
 * │    Creative Design Prims    │  derived artistic synthesis                  │
 * │    VCS Panel                │  evaluative score display only               │
 * └─────────────────────────────┴──────────────────────────────────────────────┘
 *
 * CROSS-RUNTIME PARITY:
 *   - Client: effectiveWardrobeNormalizer.ts (src/lib/visual/)
 *   - Edge:   effectiveWardrobeNormalizer.ts (supabase/functions/_shared/)
 *   - Both MUST enforce identical forbidden-garment exclusion logic.
 *   - Scene-explicit garments do NOT bypass temporal exclusion in either runtime.
 *   - Parity is enforced by shared test suite (sharedEffectiveWardrobe.test.ts).
 *
 * REMAINING INTENTIONAL MIRRORS:
 *   - Edge effectiveWardrobeNormalizer uses TemporalTruthLike (structurally compatible)
 *     instead of importing the full TemporalTruth type (avoids @/ alias in Deno).
 *   - Edge resolveTemporalTruthFromCanon is a lightweight fallback for when
 *     the client has not yet persisted canonical_temporal_truth to canon_json.
 *
 * CONSOLIDATION DATE: 2026-03-26
 */

// ── Authority Keys (importable constants) ────────────────────────────────────

export const VISUAL_AUTHORITIES = {
  /** Temporal truth resolution — client canonical */
  TEMPORAL_TRUTH: 'temporalTruthResolver.ts → useCanonicalTemporalTruth',
  /** Temporal truth resolution — edge fallback */
  TEMPORAL_TRUTH_EDGE: '_shared/effectiveWardrobeNormalizer.ts → resolveTemporalTruthFromCanon',

  /** Profile-level wardrobe normalization — public entrypoint */
  EFFECTIVE_PROFILE: 'effectiveProfileResolver.ts → resolveEffectiveProfile',
  /** Raw garment filtering — internal primitive, never call directly from UI/prompt */
  WARDROBE_NORMALIZER_INTERNAL: 'effectiveWardrobeNormalizer.ts → normalizeWardrobe',

  /** State-level wardrobe resolution — public entrypoint */
  STATE_WARDROBE: 'costumeOnActor.ts → resolveStateWardrobe',

  /** Visual completion determination — ONLY from visual_sets */
  COMPLETION_SUBSTRATE: 'visual_sets (DB table)',
  /** Completion proof helpers */
  COMPLETION_PROOF: 'canonCompletionProof.ts',
  /** Slot coverage resolver */
  COMPLETION_SLOTS: 'visualCanonSlotResolver.ts',

  /** Pipeline stage ordering */
  PIPELINE_STAGES: 'pipelineStatusResolver.ts',

  /** Visual canon enrichment — structured signals only, never raw prose */
  VISUAL_CANON_ENRICHMENT: 'visualCanonEnrichment.ts → mapWardrobeEnrichment / mapPDEnrichment',
  /** Visual canon extraction — ONLY legal access path for visual_canon_brief */
  VISUAL_CANON_EXTRACTION: 'visualCanonBrief.ts → extractVisualCanonSignals',

  /**
   * Visual canon signals — structured upstream visual intent.
   * Produced ONLY by extractVisualCanonSignals().
   * Consumed ONLY through enrichment mappers or approved assembly inputs.
   * Raw visual_canon_brief prose MUST NOT bypass this layer.
   */
  VISUAL_CANON_SIGNALS: 'visualCanonBrief.ts → VisualCanonSignals (type)',

  /**
   * Creative Design Primitives — derived artistic synthesis from project canon.
   * These are NOT upstream truth and NOT canonical signals.
   * They are artistic/cinematic primitives derived from canon JSON.
   * Authority: visualCanonExtractor.ts → extractVisualCanon()
   * UI: VisualCanonExtractionPanel (Creative Design Primitives panel)
   */
  CREATIVE_DESIGN_PRIMITIVES: 'visualCanonExtractor.ts → extractVisualCanon',

  /**
   * Visual Project Bible — read-only assembled output document.
   * Consumes canonical visual sources through approved paths only.
   * MUST NOT create new truth.
   * MUST NOT consume raw visual_canon_brief prose.
   */
  VISUAL_PROJECT_BIBLE: 'visualProjectBibleAssembler.ts → assembleVisualProjectBible',

  /** Visual coherence scoring — evaluative only */
  VCS_ENGINE: 'visualCoherenceEngine.ts',
  VCS_ROLE: 'EVALUATIVE_ONLY' as const,
} as const;

/**
 * UI surface responsibility boundaries.
 * Each panel owns exactly one concern — no restatement across panels.
 */
export const UI_SURFACE_BOUNDARIES = {
  /** Upstream extracted/resolved canonical truth (extraction, inspection, refresh) */
  SOURCE_TRUTH: {
    role: 'upstream_canonical_truth',
    description: 'Extraction, inspection, and refresh of canonical visual knowledge',
    owns: ['temporal_truth', 'wardrobe_profiles', 'scene_evidence', 'location_truth'],
    does_not_own: ['visual_completion', 'scoring', 'artistic_synthesis', 'visual_canon_signals'],
  },
  /** Downstream visual coverage measured from visual_sets */
  VISUAL_CANON_COMPLETION: {
    role: 'downstream_visual_coverage',
    description: 'Visual asset coverage measured from canonical visual_sets substrate',
    owns: ['identity_completion', 'wardrobe_visual_completion', 'pd_location_completion'],
    does_not_own: ['truth_extraction', 'scoring', 'artistic_synthesis'],
  },
  /** Derived artistic synthesis from upstream truth */
  CREATIVE_DESIGN_PRIMITIVES: {
    role: 'derived_artistic_synthesis',
    description: 'Artistic design language derived from canonical upstream truth (visualCanonExtractor)',
    owns: ['visual_style', 'design_language', 'prestige_style'],
    does_not_own: ['truth_extraction', 'visual_completion', 'scoring', 'visual_canon_signals'],
  },
  /**
   * Visual Canon Signals — structured upstream visual intent extracted from visual_canon_brief.
   * NOT a UI surface. This is a data contract consumed by enrichment mappers and assemblers.
   * Produced only by extractVisualCanonSignals().
   */
  VISUAL_CANON_SIGNALS: {
    role: 'structured_upstream_signal',
    description: 'Typed structured signals extracted from visual_canon_brief — NOT a UI surface',
    owns: ['era_classification', 'palettes', 'materials', 'motifs', 'exclusions', 'costume_philosophy', 'pd_philosophy'],
    does_not_own: ['truth_extraction', 'visual_completion', 'artistic_synthesis', 'scoring'],
  },
  /** Evaluative scoring only — never a progression gate */
  VCS_PANEL: {
    role: 'evaluative_score',
    description: 'Visual coherence quality evaluation — signal for GP, not a gate',
    owns: ['coherence_score', 'component_scores', 'recommendations'],
    does_not_own: ['truth_extraction', 'visual_completion', 'stage_progression'],
  },
} as const;

/**
 * Assert at dev time that a consumer is using the correct authority.
 * Use in comments / guard clauses to document intent.
 */
export function assertAuthority(
  consumer: string,
  authority: keyof typeof VISUAL_AUTHORITIES,
): void {
  if (process.env.NODE_ENV !== 'production') {
    // No-op in production. In dev, serves as documentation anchor.
    // If this function is called, the consumer acknowledges the canonical authority.
  }
}
