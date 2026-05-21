// ═══════════════════════════════════════════════════════════════
// IFFY Neural Validation — Intent Target Builder
// Layer 0: Declare what the audience should become before validating
// ═══════════════════════════════════════════════════════════════

import {
  IntentTarget,
  EmotionalDestination,
  AudienceContract,
  GenreMode,
  BeatFunction,
  NeuralIntensity,
  NeuralDirection,
  ROILabel,
} from './types';

/**
 * Create an Intent Target for a beat or scene.
 *
 * This is the foundation of all neural validation.
 * Without a declared target, you cannot measure divergence.
 *
 * @example
 *   intentTarget()
 *     .theme('impossible choice')
 *     .tone('quiet menace')
 *     .symbolism(['photograph', 'silence'])
 *     .destination('morally-conflicted')
 *     .contract('slow-burn-tension')
 *     .target('PFC', 'moderate-low', 'falling')
 *     .target('TPJ', 'moderate-high', 'rising')
 *     .target('Amygdala', 'moderate', 'elevated')
 *     .target('Insula', 'high', 'elevated')
 *     .build()
 */
export function intentTarget() {
  const target: Partial<IntentTarget> = {
    roi_targets: {},
    symbolism: [],
  };

  return {
    theme: (t: string) => { target.theme = t; return api; },
    tone: (t: string) => { target.tone = t; return api; },
    symbolism: (s: string[]) => { target.symbolism = s; return api; },
    destination: (d: EmotionalDestination) => { target.emotional_destination = d; return api; },
    contract: (c: AudienceContract) => { target.audience_contract = c; return api; },
    genre: (g: GenreMode) => { target.genre_mode = g; return api; },
    function: (f: BeatFunction) => { target.beat_function = f; return api; },
    recovery: (r: 'none' | 'minimal' | 'moderate' | 'ample') => { target.recovery_cadence = r; return api; },
    notes: (n: string) => { target.craft_notes = n; return api; },
    target: (roi: ROILabel, intensity: NeuralIntensity, direction: NeuralDirection, notes?: string) => {
      target.roi_targets![roi] = { intensity, direction, notes };
      return api;
    },
    build: (): IntentTarget => {
      if (!target.theme) throw new Error('IntentTarget requires a theme');
      if (!target.tone) throw new Error('IntentTarget requires a tone');
      if (Object.keys(target.roi_targets!).length === 0) throw new Error('IntentTarget requires at least one ROI target');
      return target as IntentTarget;
    },
  };

  const api = target.theme ? this : (target as IntentTarget);
  return api;
}

/**
 * Normalize a neural intensity label to a numeric range [min, max].
 * Used to convert human-readable targets to model-comparable ranges.
 */
export function intensityToRange(intensity: NeuralIntensity): [number, number] {
  const ranges: Record<NeuralIntensity, [number, number]> = {
    'very-low': [-0.10, -0.04],
    'low': [-0.04, -0.01],
    'moderate-low': [-0.01, 0.01],
    'moderate': [0.01, 0.03],
    'moderate-high': [0.03, 0.06],
    'high': [0.06, 0.10],
    'very-high': [0.10, 0.20],
  };
  return ranges[intensity];
}

/**
 * Validate that an IntentTarget is complete and internally consistent.
 * Returns an array of validation issues (empty = valid).
 */
export function validateIntentTarget(target: IntentTarget): string[] {
  const issues: string[] = [];

  if (!target.theme || target.theme.trim().length < 3) {
    issues.push('Theme must be at least 3 characters');
  }
  if (!target.tone || target.tone.trim().length < 3) {
    issues.push('Tone must be at least 3 characters');
  }
  if (!Array.isArray(target.symbolism)) {
    issues.push('Symbolism must be an array');
  }
  if (!target.roi_targets || Object.keys(target.roi_targets).length === 0) {
    issues.push('At least one ROI target is required');
  }

  // Check internal consistency: some combinations don't make sense
  const rois = Object.keys(target.roi_targets || {}) as ROILabel[];
  if (rois.includes('PFC') && rois.includes('DMN')) {
    const pfc = target.roi_targets!.PFC!;
    const dmn = target.roi_targets!.DMN!;
    // PFC high + DMN high is unusual — typically they're anticorrelated
    if (['high', 'very-high'].includes(pfc.intensity) && ['high', 'very-high'].includes(dmn.intensity)) {
      issues.push('PFC-high and DMN-high simultaneously is atypical — the audience cannot be both analytically engaged and narratively absorbed');
    }
  }

  return issues;
}

/**
 * Create an IntentTarget for common beat functions.
 * Provides sensible defaults that can be overridden.
 */
export function getDefaultTargetForBeatFunction(
  beatFunction: BeatFunction,
  theme: string,
  tone: string,
): IntentTarget {
  const base: Partial<IntentTarget> = {
    theme,
    tone,
    symbolism: [],
    roi_targets: {},
    beat_function: beatFunction,
  };

  // Set sensible defaults based on beat function
  switch (beatFunction) {
    case 'setup':
      base.roi_targets = {
        PFC: { intensity: 'moderate', direction: 'stable', notes: 'Audience needs to understand the world' },
        TPJ: { intensity: 'moderate-low', direction: 'rising', notes: 'Begin orienting toward protagonist' },
      };
      break;
    case 'inciting-incident':
      base.roi_targets = {
        Amygdala: { intensity: 'moderate', direction: 'elevated', notes: 'Something has changed' },
        PFC: { intensity: 'moderate', direction: 'rising', notes: 'Audience processes the new information' },
        TPJ: { intensity: 'moderate', direction: 'stable' },
      };
      break;
    case 'crisis':
      base.roi_targets = {
        Amygdala: { intensity: 'high', direction: 'elevated' },
        PFC: { intensity: 'moderate-low', direction: 'falling', notes: 'Feeling over thinking' },
        TPJ: { intensity: 'high', direction: 'rising', notes: 'Maximum character connection' },
        Insula: { intensity: 'high', direction: 'elevated', notes: 'Visceral response to stakes' },
      };
      break;
    case 'climax':
      base.roi_targets = {
        Amygdala: { intensity: 'very-high', direction: 'elevated' },
        Insula: { intensity: 'very-high', direction: 'elevated' },
        TPJ: { intensity: 'high', direction: 'rising' },
        PFC: { intensity: 'low', direction: 'suppressed', notes: 'Pure experience, no analysis' },
        DMN: { intensity: 'very-high', direction: 'elevated', notes: 'Full absorption in the moment' },
      };
      break;
    case 'recovery-beat':
      base.roi_targets = {
        Amygdala: { intensity: 'low', direction: 'falling', notes: 'Let the audience breathe' },
        PFC: { intensity: 'moderate-low', direction: 'stable' },
        DMN: { intensity: 'moderate', direction: 'stable', notes: 'Processing what just happened' },
      };
      break;
    case 'emotional-peak':
      base.roi_targets = {
        Amygdala: { intensity: 'high', direction: 'elevated' },
        TPJ: { intensity: 'high', direction: 'elevated' },
        Insula: { intensity: 'very-high', direction: 'elevated' },
        PFC: { intensity: 'very-low', direction: 'suppressed' },
      };
      break;
    default:
      base.roi_targets = {
        TPJ: { intensity: 'moderate', direction: 'stable' },
        Amygdala: { intensity: 'moderate', direction: 'stable' },
      };
  }

  return base as IntentTarget;
}
