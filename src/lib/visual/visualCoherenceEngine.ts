/**
 * visualCoherenceEngine.ts — Visual Coherence Scoring Engine (VCS)
 *
 * Deterministic scoring engine evaluating cross-system visual coherence.
 * Separate from CI/GP — feeds into GP as a non-destructive signal.
 *
 * 5 components scored independently (0–100):
 *   1. world_coherence — era/cultural/geographic alignment
 *   2. material_consistency — garments, fabrics, architecture vs allowed systems
 *   3. character_integration — class/status correctness, character-world fit
 *   4. stylistic_unity — cross-system consistency (wardrobe, PD, frames)
 *   5. iconic_appeal — silhouette, memorability, poster strength
 *
 * IEL: No duplication of CI or GP logic. VCS is a visual-only signal.
 */

import type { TemporalTruth, TemporalClassification } from './temporalTruthResolver';
import type { EffectiveWardrobeProfile } from './effectiveProfileResolver';

// ── Types ────────────────────────────────────────────────────────────────────

export interface VCSComponentResult {
  score: number; // 0–100
  issues: string[];
  diagnostics?: string[];
}

export interface VCSResult {
  total_score: number;
  components: {
    world_coherence: VCSComponentResult;
    material_consistency: VCSComponentResult;
    character_integration: VCSComponentResult;
    stylistic_unity: VCSComponentResult;
    iconic_appeal: VCSComponentResult;
  };
  weighting_profile: WeightingProfileKey;
  key_failures: string[];
  recommendations: string[];
  scored_at: string;
}

export type WeightingProfileKey =
  | 'vertical_drama_profile'
  | 'prestige_profile'
  | 'commercial_profile';

export interface WeightingProfile {
  key: WeightingProfileKey;
  label: string;
  weights: {
    world_coherence: number;
    material_consistency: number;
    character_integration: number;
    stylistic_unity: number;
    iconic_appeal: number;
  };
}

// ── Weighting Profiles ───────────────────────────────────────────────────────

export const WEIGHTING_PROFILES: Record<WeightingProfileKey, WeightingProfile> = {
  vertical_drama_profile: {
    key: 'vertical_drama_profile',
    label: 'Vertical Drama',
    weights: {
      world_coherence: 15,
      material_consistency: 10,
      character_integration: 25,
      stylistic_unity: 20,
      iconic_appeal: 30,
    },
  },
  prestige_profile: {
    key: 'prestige_profile',
    label: 'Prestige',
    weights: {
      world_coherence: 25,
      material_consistency: 25,
      character_integration: 20,
      stylistic_unity: 20,
      iconic_appeal: 10,
    },
  },
  commercial_profile: {
    key: 'commercial_profile',
    label: 'Commercial',
    weights: {
      world_coherence: 20,
      material_consistency: 15,
      character_integration: 20,
      stylistic_unity: 15,
      iconic_appeal: 30,
    },
  },
};

// ── Scoring Inputs ───────────────────────────────────────────────────────────

export interface VCSInputs {
  // Project metadata
  format: string;
  genre: string;
  tone: string;

  // Temporal truth (canonical)
  temporalTruth: TemporalTruth | null;

  // Characters with effective wardrobe profiles
  characters: Array<{
    name: string;
    effectiveProfile: EffectiveWardrobeProfile | null;
    hasLockedActor: boolean;
    hasHeroFrame: boolean;
    socialClass?: string;
  }>;

  // Production Design state
  pdFamiliesTotal: number;
  pdFamiliesLocked: number;
  pdDomainsCovered: string[]; // e.g. ['environment_atmosphere', 'surface_language', ...]

  // Hero Frames state
  heroFrameCount: number;
  heroFrameApproved: number;
  heroFramePrimaryApproved: boolean;

  // World system
  hasWorldSystem: boolean;
  worldSystemEra?: string;
  worldSystemGeography?: string;

  // Visual style
  hasVisualStyle: boolean;
  prestigeStyleKey?: string;

  // Canon
  hasCanon: boolean;
}

// ── Profile Resolution ───────────────────────────────────────────────────────

const HISTORICAL_ERAS: TemporalClassification[] = [
  'ancient', 'medieval', 'feudal', 'renaissance', 'victorian', 'noir', 'western',
];

export function resolveWeightingProfile(
  format: string,
  genre: string,
  tone: string,
): WeightingProfileKey {
  const f = (format || '').toLowerCase();
  const g = (genre || '').toLowerCase();
  const t = (tone || '').toLowerCase();

  // Vertical drama format → vertical profile
  if (f.includes('vertical') || f.includes('short-form') || f.includes('mobile')) {
    return 'vertical_drama_profile';
  }

  // Prestige indicators
  if (
    g.includes('drama') && (t.includes('prestige') || t.includes('literary') || t.includes('arthouse')) ||
    g.includes('period') || g.includes('historical') ||
    t.includes('cinematic') || t.includes('auteur')
  ) {
    return 'prestige_profile';
  }

  return 'commercial_profile';
}

// ── Component Scorers ────────────────────────────────────────────────────────

function scoreWorldCoherence(inputs: VCSInputs): VCSComponentResult {
  const issues: string[] = [];
  let score = 100;

  if (!inputs.hasCanon) {
    return { score: 0, issues: ['No canon data available'] };
  }

  if (!inputs.temporalTruth) {
    score -= 30;
    issues.push('No temporal truth resolved — era alignment cannot be verified');
  } else {
    // Check if temporal truth has low confidence
    if (inputs.temporalTruth.confidence === 'low') {
      score -= 15;
      issues.push(`Low temporal confidence — era may be ambiguous`);
    }
    if (inputs.temporalTruth.contradictions.length > 0) {
      const penalty = Math.min(25, inputs.temporalTruth.contradictions.length * 8);
      score -= penalty;
      issues.push(`${inputs.temporalTruth.contradictions.length} temporal contradiction(s) detected`);
    }
  }

  if (!inputs.hasWorldSystem) {
    score -= 20;
    issues.push('No world system document — geography and cultural rules unverified');
  }

  if (!inputs.hasVisualStyle) {
    score -= 10;
    issues.push('No visual style profile set');
  }

  return { score: Math.max(0, score), issues };
}

function scoreMaterialConsistency(inputs: VCSInputs): VCSComponentResult {
  const issues: string[] = [];
  let score = 100;

  if (inputs.characters.length === 0) {
    return { score: 0, issues: ['No characters available for material evaluation'] };
  }

  let normalizedCount = 0;
  let totalExcluded = 0;

  for (const char of inputs.characters) {
    if (!char.effectiveProfile) {
      score -= 10;
      issues.push(`${char.name}: no wardrobe profile`);
      continue;
    }
    if (char.effectiveProfile.was_temporally_normalized) {
      normalizedCount++;
      totalExcluded += char.effectiveProfile.excluded_garments.length;
    }
  }

  // Normalization happened = good (system is correcting), but many exclusions = upstream drift
  if (totalExcluded > 5) {
    const penalty = Math.min(20, totalExcluded * 3);
    score -= penalty;
    issues.push(`${totalExcluded} garment(s) excluded by temporal truth — upstream profiles may need refresh`);
  }

  // PD material coverage
  if (inputs.pdFamiliesTotal === 0) {
    score -= 25;
    issues.push('No production design families — material system unverified');
  } else if (inputs.pdFamiliesLocked < inputs.pdFamiliesTotal) {
    const ratio = inputs.pdFamiliesLocked / inputs.pdFamiliesTotal;
    if (ratio < 0.5) {
      score -= 15;
      issues.push(`Only ${inputs.pdFamiliesLocked}/${inputs.pdFamiliesTotal} PD families locked`);
    }
  }

  return { score: Math.max(0, score), issues };
}

function scoreCharacterIntegration(inputs: VCSInputs): VCSComponentResult {
  const issues: string[] = [];
  let score = 100;

  if (inputs.characters.length === 0) {
    return { score: 0, issues: ['No characters in project'] };
  }

  let withProfiles = 0;
  let withActors = 0;
  let withHeroFrames = 0;

  for (const char of inputs.characters) {
    if (char.effectiveProfile) withProfiles++;
    if (char.hasLockedActor) withActors++;
    if (char.hasHeroFrame) withHeroFrames++;
  }

  const total = inputs.characters.length;

  // Profile coverage
  if (withProfiles < total) {
    const missing = total - withProfiles;
    score -= Math.min(30, missing * 10);
    issues.push(`${missing}/${total} character(s) missing wardrobe profiles`);
  }

  // Actor coverage
  if (withActors < total) {
    const missing = total - withActors;
    score -= Math.min(25, missing * 8);
    issues.push(`${missing}/${total} character(s) not cast`);
  }

  // Hero frame coverage
  if (withHeroFrames < total) {
    const missing = total - withHeroFrames;
    score -= Math.min(20, missing * 5);
    issues.push(`${missing}/${total} character(s) without hero frames`);
  }

  return { score: Math.max(0, score), issues };
}

function scoreStylisticUnity(inputs: VCSInputs): VCSComponentResult {
  const issues: string[] = [];
  let score = 100;

  // Visual style presence
  if (!inputs.hasVisualStyle) {
    score -= 30;
    issues.push('No visual style profile — stylistic unity cannot be measured');
  }

  // PD coverage across domains
  const expectedDomains = ['environment_atmosphere', 'surface_language', 'symbolic_motifs'];
  if (inputs.pdDomainsCovered.length > 0) {
    const missing = expectedDomains.filter(d => !inputs.pdDomainsCovered.includes(d));
    if (missing.length > 0) {
      score -= missing.length * 10;
      issues.push(`PD missing domain coverage: ${missing.join(', ')}`);
    }
  } else if (inputs.pdFamiliesTotal === 0) {
    score -= 25;
    issues.push('No production design — cross-system consistency unverifiable');
  }

  // Prestige style consistency
  if (!inputs.prestigeStyleKey) {
    score -= 10;
    issues.push('No prestige style selected');
  }

  // Hero frames without PD = fragmented pipeline
  if (inputs.heroFrameCount > 0 && inputs.pdFamiliesLocked === 0) {
    score -= 15;
    issues.push('Hero frames generated without locked Production Design — stylistic fragmentation risk');
  }

  return { score: Math.max(0, score), issues };
}

function scoreIconicAppeal(inputs: VCSInputs): VCSComponentResult {
  const issues: string[] = [];
  let score = 100;

  // Must have hero frames for iconic assessment
  if (inputs.heroFrameCount === 0) {
    return { score: 0, issues: ['No hero frames — iconic appeal cannot be assessed'] };
  }

  // Primary hero frame approved?
  if (!inputs.heroFramePrimaryApproved) {
    score -= 30;
    issues.push('Primary hero frame not approved — no anchor silhouette');
  }

  // Approval ratio
  if (inputs.heroFrameCount > 0) {
    const ratio = inputs.heroFrameApproved / inputs.heroFrameCount;
    if (ratio < 0.5) {
      score -= 20;
      issues.push(`Low hero frame approval rate (${inputs.heroFrameApproved}/${inputs.heroFrameCount})`);
    }
  }

  // Cast completeness affects poster strength
  const castWithActors = inputs.characters.filter(c => c.hasLockedActor).length;
  if (castWithActors === 0) {
    score -= 25;
    issues.push('No cast locked — poster strength cannot be evaluated');
  }

  // Visual style needed for desirability
  if (!inputs.hasVisualStyle) {
    score -= 10;
    issues.push('No visual style — desirability unanchored');
  }

  return { score: Math.max(0, score), issues };
}

// ── Main Scorer ──────────────────────────────────────────────────────────────

export function computeVisualCoherence(inputs: VCSInputs): VCSResult {
  const profileKey = resolveWeightingProfile(inputs.format, inputs.genre, inputs.tone);
  const profile = WEIGHTING_PROFILES[profileKey];

  const components = {
    world_coherence: scoreWorldCoherence(inputs),
    material_consistency: scoreMaterialConsistency(inputs),
    character_integration: scoreCharacterIntegration(inputs),
    stylistic_unity: scoreStylisticUnity(inputs),
    iconic_appeal: scoreIconicAppeal(inputs),
  };

  // Weighted total
  const weights = profile.weights;
  const totalWeight =
    weights.world_coherence +
    weights.material_consistency +
    weights.character_integration +
    weights.stylistic_unity +
    weights.iconic_appeal;

  const weightedSum =
    components.world_coherence.score * weights.world_coherence +
    components.material_consistency.score * weights.material_consistency +
    components.character_integration.score * weights.character_integration +
    components.stylistic_unity.score * weights.stylistic_unity +
    components.iconic_appeal.score * weights.iconic_appeal;

  const total_score = Math.round(weightedSum / totalWeight);

  // Identify key failures (components below 40)
  const key_failures: string[] = [];
  const componentEntries = Object.entries(components) as [string, VCSComponentResult][];
  for (const [name, comp] of componentEntries) {
    if (comp.score < 40) {
      key_failures.push(`${name.replace(/_/g, ' ')} critically low (${comp.score})`);
    }
  }

  // Recommendations: from weakest component
  const weakest = componentEntries.sort((a, b) => a[1].score - b[1].score)[0];
  const recommendations: string[] = [];
  if (weakest[1].issues.length > 0) {
    recommendations.push(`Focus on ${weakest[0].replace(/_/g, ' ')}: ${weakest[1].issues[0]}`);
  }
  if (componentEntries[1]?.[1]?.issues?.[0]) {
    recommendations.push(`Then address ${componentEntries[1][0].replace(/_/g, ' ')}: ${componentEntries[1][1].issues[0]}`);
  }

  return {
    total_score,
    components,
    weighting_profile: profileKey,
    key_failures,
    recommendations,
    scored_at: new Date().toISOString(),
  };
}

// ── Convergence Helper ───────────────────────────────────────────────────────

export type VCSComponentKey = keyof VCSResult['components'];

/**
 * Identify the weakest VCS component for targeted refinement.
 */
export function identifyWeakestComponent(result: VCSResult): {
  component: VCSComponentKey;
  score: number;
  topIssue: string;
} {
  const entries = Object.entries(result.components) as [VCSComponentKey, VCSComponentResult][];
  const weakest = entries.sort((a, b) => a[1].score - b[1].score)[0];
  return {
    component: weakest[0],
    score: weakest[1].score,
    topIssue: weakest[1].issues[0] || 'No specific issue identified',
  };
}

/**
 * Check if VCS meets a minimum threshold for convergence.
 */
export function meetsVCSThreshold(
  result: VCSResult,
  minTotal: number = 60,
  minComponent: number = 30,
): { passes: boolean; failures: string[] } {
  const failures: string[] = [];
  if (result.total_score < minTotal) {
    failures.push(`Total VCS (${result.total_score}) below threshold (${minTotal})`);
  }
  for (const [name, comp] of Object.entries(result.components)) {
    if (comp.score < minComponent) {
      failures.push(`${name} (${comp.score}) below minimum (${minComponent})`);
    }
  }
  return { passes: failures.length === 0, failures };
}
