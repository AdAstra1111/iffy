// ═══════════════════════════════════════════════════════════════
// IFFY Neural Validation — Module Entry
// ═══════════════════════════════════════════════════════════════

export { NeuralDiagnosticsPanel } from './DiagnosticsPanel';
export { intentTarget, validateIntentTarget, getDefaultTargetForBeatFunction, intensityToRange } from './intent-target';
export { DIVERGENCE_RULES, matchDivergenceRules, getRulesByStatus, getTrustedRules } from './divergence-rules';
export type {
  IntentTarget,
  NeuralValidationRun,
  NeuralPrediction,
  DivergenceFlag,
  DivergenceRule,
  ROILabel,
  NeuralIntensity,
  NeuralDirection,
  InferenceMode,
  ModelProvenance,
  StabilityStatus,
  EmotionalDestination,
  AudienceContract,
  GenreMode,
  BeatFunction,
  DivergenceSignature,
  CorrectionDomain,
} from './types';