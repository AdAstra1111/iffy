/**
 * Engagement Metric — Pure Computation Utility
 *
 * Converts TRIBE neural ROI predictions into composite engagement scores.
 * This is a pure function with no side effects — no imports, no DB access.
 *
 * The engagement metric is derived from 5 brain ROI dimensions:
 *   Amygdala → emotional_journey  (0.30 weight)
 *   TPJ      → character_connection (0.25 weight)
 *   DMN      → narrative_absorption (0.20 weight)
 *   Insula   → visceral_impact    (0.15 weight)
 *   PFC      → cognitive_load     (0.10 weight, inverted)
 *
 * Spec: TRIBE_NEURAL_FEEDBACK_ARCHITECTURE.md §3
 */ // ── Types ──
// ── Normalization ──
/**
 * Normalize a raw ROI value to a 0-100 score using min/max clamping.
 * Values below min → 0, above max → 100, linear interpolation in between.
 */ export function normalizeScore(value, min, max) {
  if (max <= min) return 50; // degenerate range — return midpoint
  const clamped = Math.min(max, Math.max(min, value));
  return Math.round((clamped - min) / (max - min) * 100);
}
// ── Weights ──
export const ENGAGEMENT_WEIGHTS = {
  emotional_journey: 0.30,
  character_connection: 0.25,
  narrative_absorption: 0.20,
  visceral_impact: 0.15,
  cognitive_load: 0.10
};
// ── Thresholds ──
export const ENGAGEMENT_DEFAULTS = {
  threshold: 50,
  fatigue_consecutive_scenes: 3,
  fatigue_amygdala_min: 0.05,
  batch_max_with_engagement: 10,
  batch_engagement_slots: 2
};
// ── ROI Range Mappings ──
const ROI_RANGES = {
  Amygdala: {
    min: -0.10,
    max: 0.20
  },
  TPJ: {
    min: -0.05,
    max: 0.15
  },
  DMN: {
    min: -0.05,
    max: 0.15
  },
  Insula: {
    min: -0.05,
    max: 0.15
  },
  PFC: {
    min: -0.10,
    max: 0.20
  }
};
// ── Core Computation ──
/**
 * Compute a composite engagement score from TRIBE ROI predictions.
 *
 * Returns 5 sub-dimensions (0-100 each) plus weighted total (0-100).
 * cognitive_load is inverted — high PFC activation means the audience
 * is thinking instead of feeling, which is anti-engaging.
 */ export function computeEngagementMetric(predictions, predictionSource) {
  // Build ROI lookup from predictions
  const roiValues = {};
  const roiConfidence = {};
  for (const p of predictions){
    roiValues[p.roi] = p.value;
    roiConfidence[p.roi] = p.confidence;
  }
  // Compute sub-dimension scores
  const rawEmotional = roiValues['Amygdala'] ?? 0;
  const rawConnection = roiValues['TPJ'] ?? 0;
  const rawAbsorption = roiValues['DMN'] ?? 0;
  const rawVisceral = roiValues['Insula'] ?? 0;
  const rawCognitive = roiValues['PFC'] ?? 0;
  const emotionalScore = normalizeScore(rawEmotional, ROI_RANGES.Amygdala.min, ROI_RANGES.Amygdala.max);
  const connectionScore = normalizeScore(rawConnection, ROI_RANGES.TPJ.min, ROI_RANGES.TPJ.max);
  const absorptionScore = normalizeScore(rawAbsorption, ROI_RANGES.DMN.min, ROI_RANGES.DMN.max);
  const visceralScore = normalizeScore(rawVisceral, ROI_RANGES.Insula.min, ROI_RANGES.Insula.max);
  // Cognitive load is inverted: high PFC = bad = low score
  const cognitiveScore = 100 - normalizeScore(rawCognitive, ROI_RANGES.PFC.min, ROI_RANGES.PFC.max);
  // Composite weighted average
  const total = Math.round(emotionalScore * ENGAGEMENT_WEIGHTS.emotional_journey + connectionScore * ENGAGEMENT_WEIGHTS.character_connection + absorptionScore * ENGAGEMENT_WEIGHTS.narrative_absorption + visceralScore * ENGAGEMENT_WEIGHTS.visceral_impact + cognitiveScore * ENGAGEMENT_WEIGHTS.cognitive_load);
  // Aggregate confidence (average of available ROI confidences)
  const confidences = Object.values(roiConfidence);
  const avgConfidence = confidences.length > 0 ? confidences.reduce((a, b)=>a + b, 0) / confidences.length : 0.0;
  // Dimension-specific metadata
  const fatigueConsecutive = rawEmotional > ENGAGEMENT_DEFAULTS.fatigue_amygdala_min;
  const absorptionRisk = rawAbsorption < 0.01 ? 'flat' : rawAbsorption > 0.08 ? 'strong' : 'adequate';
  const sensoryGrounding = rawVisceral < 0.02 ? 'absent' : rawVisceral > 0.08 ? 'strong' : 'present';
  return {
    total_score: total,
    emotional_journey: {
      score: emotionalScore,
      value: rawEmotional,
      peak_value: rawEmotional,
      recovery_present: rawEmotional < 0.03,
      fatigue_risk: fatigueConsecutive
    },
    character_connection: {
      score: connectionScore,
      value: rawConnection,
      above_threshold: rawConnection >= 0.01
    },
    narrative_absorption: {
      score: absorptionScore,
      value: rawAbsorption,
      absorption_risk: absorptionRisk
    },
    visceral_impact: {
      score: visceralScore,
      value: rawVisceral,
      sensory_grounding: sensoryGrounding
    },
    cognitive_load: {
      score: cognitiveScore,
      value: rawCognitive,
      overload_risk: rawCognitive > 0.05
    },
    confidence: parseFloat(avgConfidence.toFixed(2)),
    prediction_source: predictionSource
  };
}
