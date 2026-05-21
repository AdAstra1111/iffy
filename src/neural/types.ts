// ═══════════════════════════════════════════════════════════════
// IFFY Neural Validation — Shared Types
// Sidecar module. Reads existing IFFY data. Does NOT mutate canon.
// ═══════════════════════════════════════════════════════════════

/** ROI network labels — simplified for diagnostic display */
export type ROILabel = 'Amygdala' | 'TPJ' | 'DMN' | 'PFC' | 'VisualCortex' | 'Insula';

/** Target intensity — qualitative range for human-readable intent encoding */
export type NeuralIntensity = 'very-low' | 'low' | 'moderate-low' | 'moderate' | 'moderate-high' | 'high' | 'very-high';

/** Direction of change relative to baseline */
export type NeuralDirection = 'rising' | 'falling' | 'stable' | 'suppressed' | 'elevated';

/** Per-ROI target specification */
export interface ROITarget {
  intensity: NeuralIntensity;
  direction: NeuralDirection;
  notes?: string;
}

// ───────────────────────────────────────────────────────────────
// LAYER 0 — INTENT TARGET
// ───────────────────────────────────────────────────────────────

export type EmotionalDestination =
  | 'devastated' | 'hopeful' | 'morally-conflicted' | 'haunted'
  | 'inspired' | 'destabilized' | 'uplifted' | 'numb'
  | 'triumphant' | 'curious' | 'satisfied' | 'unsettled';

export type AudienceContract =
  | 'slow-burn-tension' | 'mystery-ambiguity' | 'emotional-realism'
  | 'operatic-melodrama' | 'dark-satire' | 'prestige-restraint'
  | 'comedic-release' | 'visceral-horror' | 'thriller-pace';

export type GenreMode =
  | 'drama' | 'comedy' | 'thriller' | 'horror' | 'romance'
  | 'sci-fi' | 'fantasy' | 'documentary' | 'musical'
  | 'action' | 'western' | 'noir' | 'satire';

export type BeatFunction =
  | 'setup' | 'inciting-incident' | 'rising-action' | 'complication'
  | 'midpoint' | 'crisis' | 'climax' | 'resolution' | 'denouement'
  | 'character-introduction' | 'character-transformation'
  | 'thematic-revelation' | 'symbolic-payoff' | 'recovery-beat'
  | 'tension-buildup' | 'comic-relief' | 'emotional-peak';

export interface IntentTarget {
  /** What the story is about — the core philosophical question */
  theme: string;
  /** Emotional colour of this beat/sequence */
  tone: string;
  /** Objects, images, sounds that carry accumulated meaning */
  symbolism: string[];
  /** What the audience should feel by the end of this beat */
  emotional_destination?: EmotionalDestination;
  /** The emotional contract with the audience */
  audience_contract?: AudienceContract;
  /** Genre mode — affects expected pacing and neural cadence */
  genre_mode?: GenreMode;
  /** What dramatic function this beat serves */
  beat_function?: BeatFunction;
  /** Per-ROI neural targets */
  roi_targets: Partial<Record<ROILabel, ROITarget>>;
  /** How often the audience is allowed to breathe before this beat */
  recovery_cadence?: 'none' | 'minimal' | 'moderate' | 'ample';
  /** Free-form notes for the writer/director */
  craft_notes?: string;
}

// ───────────────────────────────────────────────────────────────
// LAYER 2 — NEURAL VALIDATION RUN
// ───────────────────────────────────────────────────────────────

export interface NeuralPrediction {
  roi: ROILabel;
  value: number;       // mean activation relative to baseline
  confidence: number;  // 0–1
}

export interface DivergenceFlag {
  roi: ROILabel;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  predicted_value: number;
  target_range: { min: number; max: number };
  suggested_correction: string;
  rule_id?: string;    // references divergence rule database
}

export interface NeuralValidationRun {
  id: string;
  project_id: string;
  document_id: string;
  document_version_id: string;
  layer_type: 'beat' | 'scene' | 'character' | 'sequence' | 'performance-proxy';
  input_text_hash: string;
  input_text_preview: string;   // first 200 chars for reference
  model_version: string;
  target_json: IntentTarget;
  output_json: {
    predictions: NeuralPrediction[];
    segment_timings: number[];
  };
  divergence_json: {
    flags: DivergenceFlag[];
    summary: string;
    contrast_efficiency_score?: number;
  };
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  created_at: string;
}

// ───────────────────────────────────────────────────────────────
// LAYER 5 — DIVERGENCE RULE
// ───────────────────────────────────────────────────────────────

export type DivergenceSignature =
  | 'pfc-overload'
  | 'tpj-weak'
  | 'insula-absent'
  | 'amygdala-fatigue'
  | 'dmn-flat'
  | 'symbolic-accumulation-weak'
  | 'contrast-absent'
  | 'character-drift'
  | 'tone-mismatch'
  | 'thematic-drift';

export type CorrectionDomain =
  | 'exposition' | 'dialogue' | 'action-line' | 'performance'
  | 'camera' | 'pacing' | 'music' | 'silence' | 'symbol-placement'
  | 'character-choice' | 'sensory-detail' | 'recovery-beat';

export interface DivergenceRule {
  id: string;
  signature: DivergenceSignature;
  name: string;
  description: string;
  neural_pattern: string;
  correction_principle: string;
  example_corrections: string[];
  domain: CorrectionDomain[];
  source: 'sebastian' | 'red' | 'literature' | 'experimental';
  verification_status: 'hypothesis' | 'observed' | 'validated' | 'replicated';
  created_at: string;
  tags: string[];
}