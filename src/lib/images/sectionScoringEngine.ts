/**
 * sectionScoringEngine — Canonical Image Convergence / Selection Engine.
 *
 * Single source of truth for ranking, scoring, and recommending images per section.
 * Used by: useSectionConvergence (auto-prune), LookbookSectionPanel (recommendations),
 * and any future convergence surface.
 *
 * Architecture:
 * - Section-specific scoring profiles define weight vectors
 * - All scoring uses persisted metadata only (no AI calls)
 * - Deterministic: same inputs → same outputs
 * - Does NOT query DB — operates on already-fetched image arrays
 * - Uses canonical section keys from lookbookSlotRegistry
 */

import type { CanonicalSectionKey } from '@/lib/lookbook/pipeline/lookbookSlotRegistry';
import { classifyOrientation, type Orientation } from './orientationUtils';

// ── Types ──────────────────────────────────────────────────────────

export interface ScoredImage {
  id: string;
  totalScore: number;
  scoreBreakdown: ScoreBreakdown;
  recommendedAction: RecommendedAction;
  reasons: string[];
  sectionKey: CanonicalSectionKey;
  /** Rank within primary candidates (1 = best) */
  primaryCandidateRank: number;
  /** Rank within survivors (1 = best) */
  survivorRank: number;
}

export interface ScoreBreakdown {
  orientation: number;
  recency: number;
  resolution: number;
  primaryBonus: number;
  activeBonus: number;
  diversityPenalty: number;
  laneCompliance: number;
  sectionSpecific: number;
  /** Section-specific sub-scores for diagnostics */
  sectionDetails: Record<string, number>;
}

export type RecommendedAction =
  | 'recommend_primary'
  | 'keep'
  | 'keep_as_alternate'
  | 'archive_candidate'
  | 'reject_candidate'
  | 'review_needed';

export interface SectionScoringResult {
  sectionKey: CanonicalSectionKey;
  scored: ScoredImage[];
  recommendedPrimary: ScoredImage | null;
  survivors: ScoredImage[];
  archiveCandidates: ScoredImage[];
  rejectCandidates: ScoredImage[];
  diagnostics: SectionDiagnostics;
}

export interface SectionDiagnostics {
  candidateCount: number;
  survivorCount: number;
  archiveCount: number;
  rejectCount: number;
  recommendedPrimaryId: string | null;
  duplicateGroups: number;
  warnings: string[];
  coverageSummary: Record<string, number>;
}

// ── Section Scoring Profiles ───────────────────────────────────────

interface ScoringProfile {
  /** Weight for landscape orientation (0–20) */
  orientationWeight: number;
  /** Preferred orientation */
  preferredOrientation: Orientation;
  /** Weight for recency (0–15) */
  recencyWeight: number;
  /** Weight for resolution (0–15) */
  resolutionWeight: number;
  /** Weight for primary/active status bonus (0–10) */
  statusWeight: number;
  /** Weight for lane compliance (0–10) */
  laneComplianceWeight: number;
  /** Weight for section-specific signals (0–30) */
  sectionSpecificWeight: number;
  /** Duplication penalty factor */
  duplicationPenaltyMax: number;
  /** Max survivors (excluding primary) */
  maxAlternates: number;
  /** Section-specific scorer */
  sectionScorer: (img: ImageInput) => { score: number; details: Record<string, number>; warnings: string[] };
}

/** Minimal image interface — what the engine needs from a ProjectImage */
export interface ImageInput {
  id: string;
  width: number | null;
  height: number | null;
  is_primary: boolean;
  curation_state: string;
  created_at: string;
  shot_type: string | null;
  generation_purpose: string | null;
  strategy_key: string | null;
  asset_group: string | null;
  subject: string | null;
  subject_type: string | null;
  lane_compliance_score: number | null;
  generation_config: Record<string, unknown> | null;
  prompt_used: string;
  prestige_style: string | null;
}

// ── Shared Scoring Helpers ─────────────────────────────────────────

function scoreOrientation(img: ImageInput, preferred: Orientation): number {
  const actual = classifyOrientation(img.width, img.height);
  if (actual === preferred) return 20;
  if (actual === 'square') return 10;
  if (actual === 'unknown') return 5;
  return 0;
}

function scoreRecency(createdAt: string, newestTs: number, oldestTs: number, weight: number): number {
  const ts = new Date(createdAt).getTime();
  if (newestTs === oldestTs) return Math.round(weight * 0.5);
  const normalized = (ts - oldestTs) / (newestTs - oldestTs);
  return Math.round(normalized * weight);
}

function scoreResolution(w: number | null, h: number | null, weight: number): number {
  if (!w || !h) return Math.round(weight * 0.3);
  const pixels = w * h;
  if (pixels >= 2073600) return weight; // 1920x1080+
  if (pixels >= 1000000) return Math.round(weight * 0.8);
  if (pixels >= 500000) return Math.round(weight * 0.5);
  return Math.round(weight * 0.25);
}

function scoreStatus(img: ImageInput, weight: number): number {
  if (img.is_primary) return weight;
  if (img.curation_state === 'active') return Math.round(weight * 0.8);
  if (img.curation_state === 'candidate') return Math.round(weight * 0.4);
  return 0;
}

function scoreLaneCompliance(img: ImageInput, weight: number): number {
  if (typeof img.lane_compliance_score === 'number') {
    return Math.round((img.lane_compliance_score / 100) * weight);
  }
  return 0;
}

/** Detect near-duplicates by creation timestamp proximity (same batch) */
function computeDuplicationPenalties(images: ImageInput[], maxPenalty: number): Map<string, number> {
  const penalties = new Map<string, number>();
  const sorted = [...images].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  for (let i = 0; i < sorted.length; i++) {
    const ts = new Date(sorted[i].created_at).getTime();
    let batchCount = 0;
    for (let j = 0; j < sorted.length; j++) {
      if (i === j) continue;
      if (Math.abs(ts - new Date(sorted[j].created_at).getTime()) < 30000) batchCount++;
    }
    const penalty = batchCount > 2 ? -Math.min(maxPenalty, (batchCount - 2) * 5) : 0;
    penalties.set(sorted[i].id, penalty);
  }
  return penalties;
}

// ── Section-Specific Scorers ───────────────────────────────────────

function heroFrameScorer(img: ImageInput): { score: number; details: Record<string, number>; warnings: string[] } {
  const details: Record<string, number> = {};
  const warnings: string[] = [];
  let score = 0;

  // Aspect ratio cinematic fit — dual-peak: 16:9 (1.778) AND 2.39:1 anamorphic (2.39)
  // Both are canonical cinematic aspect ratios for hero frames.
  if (img.width && img.height) {
    const ratio = img.width / img.height;
    const diff16x9 = Math.abs(ratio - 1.778);
    const diffScope = Math.abs(ratio - 2.39);
    const bestDiff = Math.min(diff16x9, diffScope);
    const aspectScore = bestDiff < 0.05 ? 15 : bestDiff < 0.15 ? 12 : bestDiff < 0.3 ? 8 : 3;
    details.aspectRatioFit = aspectScore;
    score += aspectScore;
  }

  // NOTE: Identity gating is handled BEFORE scoring by the canonical
  // characterImageEligibility gate. Scoring assumes all inputs are already eligible.
  // No identity penalties or bonuses belong here — they are admission logic, not editorial.
  const gc = (img.generation_config || {}) as Record<string, unknown>;

  // Anchor richness bonus — editorial signal, not identity admission
  const hasAnchors = !!(gc.anchor_image_ids || gc.identity_anchor_paths || gc.reference_image_urls);
  if (hasAnchors) {
    details.anchorRichness = 5;
    score += 5;
  }

  // Narrative presence heuristic (prompt richness)
  const prompt = (img.prompt_used || '').toLowerCase();
  const narrativeSignals = ['cinematic', 'dramatic', 'atmospheric', 'tension', 'emotion', 'epic', 'intimate', 'powerful'];
  const narrativeHits = narrativeSignals.filter(s => prompt.includes(s)).length;
  const narrativeScore = Math.min(5, narrativeHits * 2);
  details.narrativePresence = narrativeScore;
  score += narrativeScore;

  return { score, details, warnings };
}

function symbolicMotifsScorer(img: ImageInput): { score: number; details: Record<string, number>; warnings: string[] } {
  const details: Record<string, number> = {};
  const warnings: string[] = [];
  let score = 0;
  const prompt = (img.prompt_used || '').toLowerCase();

  // Symbolic density — reward symbolic/metaphorical language
  const symbolicSignals = ['symbol', 'metaphor', 'motif', 'emblem', 'allegory', 'abstract', 'surreal',
    'dreamlike', 'mythic', 'ritual', 'shadow', 'mirror', 'reflection', 'mask', 'flame', 'water',
    'light and dark', 'duality', 'threshold', 'transformation', 'decay', 'rebirth', 'cycle'];
  const symbolHits = symbolicSignals.filter(s => prompt.includes(s)).length;
  const symbolicScore = Math.min(15, symbolHits * 3);
  details.symbolicDensity = symbolicScore;
  score += symbolicScore;

  // Penalty for literal scene language
  const literalSignals = ['walks into', 'sits down', 'stands up', 'talking to', 'looking at',
    'medium shot of', 'wide shot of', 'close-up of', 'enters the room', 'picks up'];
  const literalHits = literalSignals.filter(s => prompt.includes(s)).length;
  const literalPenalty = Math.min(15, literalHits * 5);
  details.literalPenalty = -literalPenalty;
  score -= literalPenalty;

  if (literalHits >= 2) {
    warnings.push('low symbolic strength — reads as literal scene still');
  }

  // Visual memorability — composition / visual language cues
  const visualSignals = ['silhouette', 'chiaroscuro', 'negative space', 'golden ratio',
    'symmetry', 'asymmetry', 'framing', 'depth of field', 'dramatic lighting'];
  const visualHits = visualSignals.filter(s => prompt.includes(s)).length;
  const visualScore = Math.min(10, visualHits * 3);
  details.visualMemorability = visualScore;
  score += visualScore;

  return { score, details, warnings };
}

function textureDetailScorer(img: ImageInput): { score: number; details: Record<string, number>; warnings: string[] } {
  const details: Record<string, number> = {};
  const warnings: string[] = [];
  let score = 0;
  const prompt = (img.prompt_used || '').toLowerCase();

  // Material truth — environmental/architectural material cues
  const materialSignals = ['wood', 'stone', 'brick', 'metal', 'glass', 'concrete', 'plaster',
    'terracotta', 'marble', 'rust', 'patina', 'grain', 'surface', 'texture', 'material',
    'weathered', 'worn', 'aged', 'peeling', 'cracked'];
  const materialHits = materialSignals.filter(s => prompt.includes(s)).length;
  const materialScore = Math.min(15, materialHits * 3);
  details.materialTruth = materialScore;
  score += materialScore;

  // Production design relevance
  const pdSignals = ['set design', 'production design', 'environment', 'interior', 'exterior',
    'architectural', 'decor', 'furniture', 'prop', 'practical'];
  const pdHits = pdSignals.filter(s => prompt.includes(s)).length;
  const pdScore = Math.min(10, pdHits * 3);
  details.productionDesign = pdScore;
  score += pdScore;

  // Detail composition — tight framing / detail shots
  if (img.shot_type === 'detail' || img.shot_type === 'texture_ref') {
    details.shotTypeBonus = 5;
    score += 5;
  }

  return { score, details, warnings };
}

function atmosphereLightingScorer(img: ImageInput): { score: number; details: Record<string, number>; warnings: string[] } {
  const details: Record<string, number> = {};
  const warnings: string[] = [];
  let score = 0;
  const prompt = (img.prompt_used || '').toLowerCase();

  // Lighting mood clarity
  const lightingSignals = ['golden hour', 'blue hour', 'candlelight', 'firelight', 'moonlight',
    'neon', 'fluorescent', 'harsh', 'soft', 'dappled', 'rim light', 'backlight',
    'silhouette', 'chiaroscuro', 'high contrast', 'low key', 'high key'];
  const lightHits = lightingSignals.filter(s => prompt.includes(s)).length;
  const lightScore = Math.min(15, lightHits * 3);
  details.lightingClarity = lightScore;
  score += lightScore;

  // Atmosphere distinctiveness
  const atmosphereSignals = ['fog', 'mist', 'rain', 'smoke', 'dust', 'haze', 'steam',
    'dawn', 'dusk', 'twilight', 'night', 'overcast', 'storm', 'glow'];
  const atmoHits = atmosphereSignals.filter(s => prompt.includes(s)).length;
  const atmoScore = Math.min(10, atmoHits * 3);
  details.atmosphereDistinctiveness = atmoScore;
  score += atmoScore;

  // Time-of-day shot type bonus
  if (img.shot_type === 'atmospheric' || img.shot_type === 'time_variant' || img.shot_type === 'lighting_ref') {
    details.shotTypeBonus = 5;
    score += 5;
  }

  return { score, details, warnings };
}

function keyMomentsScorer(img: ImageInput): { score: number; details: Record<string, number>; warnings: string[] } {
  const details: Record<string, number> = {};
  const warnings: string[] = [];
  let score = 0;
  const prompt = (img.prompt_used || '').toLowerCase();

  // Narrative recognizability
  const narrativeSignals = ['confrontation', 'revelation', 'reunion', 'departure', 'discovery',
    'betrayal', 'sacrifice', 'choice', 'climax', 'turning point', 'confession',
    'first meeting', 'final'];
  const narrativeHits = narrativeSignals.filter(s => prompt.includes(s)).length;
  const narrativeScore = Math.min(15, narrativeHits * 3);
  details.narrativeRecognizability = narrativeScore;
  score += narrativeScore;

  // Emotional clarity
  const emotionSignals = ['anger', 'fear', 'joy', 'sorrow', 'love', 'despair', 'hope',
    'tension', 'relief', 'shock', 'tenderness', 'rage', 'grief'];
  const emotionHits = emotionSignals.filter(s => prompt.includes(s)).length;
  const emotionScore = Math.min(10, emotionHits * 3);
  details.emotionalClarity = emotionScore;
  score += emotionScore;

  // NOTE: Identity gating is handled BEFORE scoring by the canonical gate.
  // No identity bonuses here — they are admission logic, not editorial scoring.

  return { score, details, warnings };
}

function characterIdentityScorer(img: ImageInput): { score: number; details: Record<string, number>; warnings: string[] } {
  const details: Record<string, number> = {};
  const warnings: string[] = [];
  let score = 0;

  const gc = img.generation_config || {};

  // Identity lock is paramount
  if ((gc as any).identity_locked) {
    details.identityLocked = 15;
    score += 15;
  } else {
    warnings.push('identity not locked — face may drift');
  }

  // Anchor paths present
  if ((gc as any).identity_anchor_paths) {
    details.anchorBound = 10;
    score += 10;
  }

  // Shot type bonus for identity-specific shots
  if (img.shot_type === 'identity_headshot' || img.shot_type === 'identity_profile' || img.shot_type === 'identity_full_body') {
    details.identityShotType = 5;
    score += 5;
  }

  return { score, details, warnings };
}

function worldLocationsScorer(img: ImageInput): { score: number; details: Record<string, number>; warnings: string[] } {
  const details: Record<string, number> = {};
  const warnings: string[] = [];
  let score = 0;
  const prompt = (img.prompt_used || '').toLowerCase();

  // Environmental specificity
  const envSignals = ['interior', 'exterior', 'architecture', 'landscape', 'street',
    'building', 'room', 'garden', 'market', 'village', 'city', 'forest', 'coastal',
    'mountain', 'river', 'bridge', 'temple', 'church', 'castle', 'house', 'workshop'];
  const envHits = envSignals.filter(s => prompt.includes(s)).length;
  const envScore = Math.min(15, envHits * 3);
  details.environmentSpecificity = envScore;
  score += envScore;

  // Establishing shot bonus
  if (img.shot_type === 'wide' || img.shot_type === 'atmospheric') {
    details.shotTypeBonus = 5;
    score += 5;
  }

  // Location binding
  if (img.subject_type === 'location' || img.subject_type === 'world') {
    details.locationBound = 10;
    score += 10;
  }

  return { score, details, warnings };
}

function genericScorer(_img: ImageInput): { score: number; details: Record<string, number>; warnings: string[] } {
  return { score: 0, details: {}, warnings: [] };
}

// ── Profile Registry ───────────────────────────────────────────────

const SECTION_PROFILES: Record<CanonicalSectionKey, ScoringProfile> = {
  hero_frames: {
    orientationWeight: 20,
    preferredOrientation: 'landscape',
    recencyWeight: 10,
    resolutionWeight: 15,
    statusWeight: 10,
    laneComplianceWeight: 5,
    sectionSpecificWeight: 30,
    duplicationPenaltyMax: 20,
    maxAlternates: 12,
    sectionScorer: heroFrameScorer,
  },
  character_identity: {
    orientationWeight: 5,
    preferredOrientation: 'portrait',
    recencyWeight: 5,
    resolutionWeight: 10,
    statusWeight: 10,
    laneComplianceWeight: 5,
    sectionSpecificWeight: 30,
    duplicationPenaltyMax: 15,
    maxAlternates: 3,
    sectionScorer: characterIdentityScorer,
  },
  world_locations: {
    orientationWeight: 15,
    preferredOrientation: 'landscape',
    recencyWeight: 8,
    resolutionWeight: 10,
    statusWeight: 10,
    laneComplianceWeight: 5,
    sectionSpecificWeight: 30,
    duplicationPenaltyMax: 15,
    maxAlternates: 4,
    sectionScorer: worldLocationsScorer,
  },
  atmosphere_lighting: {
    orientationWeight: 10,
    preferredOrientation: 'landscape',
    recencyWeight: 8,
    resolutionWeight: 10,
    statusWeight: 10,
    laneComplianceWeight: 5,
    sectionSpecificWeight: 30,
    duplicationPenaltyMax: 15,
    maxAlternates: 4,
    sectionScorer: atmosphereLightingScorer,
  },
  texture_detail: {
    orientationWeight: 5,
    preferredOrientation: 'square',
    recencyWeight: 5,
    resolutionWeight: 15,
    statusWeight: 10,
    laneComplianceWeight: 5,
    sectionSpecificWeight: 30,
    duplicationPenaltyMax: 15,
    maxAlternates: 3,
    sectionScorer: textureDetailScorer,
  },
  symbolic_motifs: {
    orientationWeight: 5,
    preferredOrientation: 'landscape',
    recencyWeight: 5,
    resolutionWeight: 10,
    statusWeight: 10,
    laneComplianceWeight: 5,
    sectionSpecificWeight: 30,
    duplicationPenaltyMax: 15,
    maxAlternates: 4,
    sectionScorer: symbolicMotifsScorer,
  },
  key_moments: {
    orientationWeight: 10,
    preferredOrientation: 'landscape',
    recencyWeight: 8,
    resolutionWeight: 10,
    statusWeight: 10,
    laneComplianceWeight: 5,
    sectionSpecificWeight: 30,
    duplicationPenaltyMax: 15,
    maxAlternates: 5,
    sectionScorer: keyMomentsScorer,
  },
  poster_directions: {
    orientationWeight: 20,
    preferredOrientation: 'landscape',
    recencyWeight: 10,
    resolutionWeight: 15,
    statusWeight: 10,
    laneComplianceWeight: 5,
    sectionSpecificWeight: 30,
    duplicationPenaltyMax: 20,
    maxAlternates: 12,
    sectionScorer: heroFrameScorer,
  },
};

// ── Main Scoring Engine ────────────────────────────────────────────

/**
 * Score and rank images for a given section using canonical section-specific profiles.
 *
 * This is THE canonical selection engine. All convergence, auto-prune, and
 * recommendation surfaces must use it.
 *
 * @param images - Already-fetched images (must be filtered through canonical section filter)
 * @param sectionKey - Canonical section key
 * @param options - Optional overrides
 */
export function scoreSection(
  images: ImageInput[],
  sectionKey: CanonicalSectionKey,
  options: { maxAlternates?: number } = {},
): SectionScoringResult {
  const profile = SECTION_PROFILES[sectionKey];
  const maxAlternates = options.maxAlternates ?? profile.maxAlternates;

  if (images.length === 0) {
    return {
      sectionKey,
      scored: [],
      recommendedPrimary: null,
      survivors: [],
      archiveCandidates: [],
      rejectCandidates: [],
      diagnostics: {
        candidateCount: 0, survivorCount: 0, archiveCount: 0, rejectCount: 0,
        recommendedPrimaryId: null, duplicateGroups: 0, warnings: [], coverageSummary: {},
      },
    };
  }

  // Compute time range
  const timestamps = images.map(i => new Date(i.created_at).getTime());
  const newestTs = Math.max(...timestamps);
  const oldestTs = Math.min(...timestamps);
  const dupPenalties = computeDuplicationPenalties(images, profile.duplicationPenaltyMax);

  // Score each image
  const allWarnings: string[] = [];
  const scored: ScoredImage[] = images.map(img => {
    const orientation = scoreOrientation(img, profile.preferredOrientation);
    const recency = scoreRecency(img.created_at, newestTs, oldestTs, profile.recencyWeight);
    const resolution = scoreResolution(img.width, img.height, profile.resolutionWeight);
    const primaryBonus = img.is_primary ? 10000 : 0; // absolute survivor
    const activeBonus = scoreStatus(img, profile.statusWeight);
    const diversityPenalty = dupPenalties.get(img.id) || 0;
    const laneCompliance = scoreLaneCompliance(img, profile.laneComplianceWeight);

    const sectionResult = profile.sectionScorer(img);
    const sectionSpecific = sectionResult.score;
    if (sectionResult.warnings.length > 0) {
      allWarnings.push(...sectionResult.warnings.map(w => `[${img.id.slice(0, 8)}] ${w}`));
    }

    const totalScore = orientation + recency + resolution + primaryBonus + activeBonus +
      diversityPenalty + laneCompliance + sectionSpecific;

    return {
      id: img.id,
      totalScore,
      scoreBreakdown: {
        orientation,
        recency,
        resolution,
        primaryBonus,
        activeBonus,
        diversityPenalty,
        laneCompliance,
        sectionSpecific,
        sectionDetails: sectionResult.details,
      },
      recommendedAction: 'keep' as RecommendedAction, // set below
      reasons: [],
      sectionKey,
      primaryCandidateRank: 0,
      survivorRank: 0,
    };
  });

  // Sort by totalScore descending, recency tiebreak
  scored.sort((a, b) => {
    if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
    const imgA = images.find(i => i.id === a.id)!;
    const imgB = images.find(i => i.id === b.id)!;
    return (imgB.created_at || '').localeCompare(imgA.created_at || '');
  });

  // Assign ranks
  scored.forEach((s, i) => { s.primaryCandidateRank = i + 1; });

  // Determine survivors
  const primaryCount = images.filter(i => i.is_primary).length;
  const maxKeep = primaryCount > 0 ? primaryCount + maxAlternates : maxAlternates + 1;
  const survivors = scored.slice(0, maxKeep);
  const archiveCandidates = scored.slice(maxKeep);

  survivors.forEach((s, i) => { s.survivorRank = i + 1; });

  // Assign recommended actions
  if (survivors.length > 0) {
    // Best non-primary candidate → recommend_primary
    const bestNonPrimary = survivors.find(s => {
      const img = images.find(i => i.id === s.id);
      return img && !img.is_primary;
    });
    const hasPrimary = survivors.some(s => {
      const img = images.find(i => i.id === s.id);
      return img?.is_primary;
    });

    for (const s of survivors) {
      const img = images.find(i => i.id === s.id)!;
      if (img.is_primary) {
        s.recommendedAction = 'keep';
        s.reasons.push('current primary');
      } else if (!hasPrimary && s === bestNonPrimary) {
        s.recommendedAction = 'recommend_primary';
        s.reasons.push('highest scoring candidate — no primary set');
      } else if (s === survivors[0] && !hasPrimary) {
        s.recommendedAction = 'recommend_primary';
        s.reasons.push('top ranked');
      } else {
        s.recommendedAction = 'keep_as_alternate';
        s.reasons.push(`alternate rank #${s.survivorRank}`);
      }
    }
  }

  for (const s of archiveCandidates) {
    const img = images.find(i => i.id === s.id);
    if (img?.is_primary) {
      // Safety: never archive primary
      s.recommendedAction = 'keep';
      s.reasons.push('primary — protected');
    } else if (s.totalScore < 20) {
      s.recommendedAction = 'reject_candidate';
      s.reasons.push('very low score');
    } else {
      s.recommendedAction = 'archive_candidate';
      s.reasons.push('below survivor threshold');
    }
  }

  // Build diagnostics
  const coverageSummary: Record<string, number> = {};
  for (const s of survivors) {
    const img = images.find(i => i.id === s.id);
    const cat = img?.shot_type || 'uncategorized';
    coverageSummary[cat] = (coverageSummary[cat] || 0) + 1;
  }

  const dupCount = Array.from(dupPenalties.values()).filter(p => p < 0).length;

  const diagnostics: SectionDiagnostics = {
    candidateCount: images.length,
    survivorCount: survivors.length,
    archiveCount: archiveCandidates.filter(s => s.recommendedAction === 'archive_candidate').length,
    rejectCount: archiveCandidates.filter(s => s.recommendedAction === 'reject_candidate').length,
    recommendedPrimaryId: scored[0]?.id || null,
    duplicateGroups: dupCount,
    warnings: allWarnings,
    coverageSummary,
  };

  return {
    sectionKey,
    scored,
    recommendedPrimary: survivors[0] || null,
    survivors,
    archiveCandidates: archiveCandidates.filter(s => s.recommendedAction === 'archive_candidate'),
    rejectCandidates: archiveCandidates.filter(s => s.recommendedAction === 'reject_candidate'),
    diagnostics,
  };
}

/**
 * Get the scoring profile for a section (for UI display of max alternates etc.)
 */
export function getSectionProfile(sectionKey: CanonicalSectionKey): { maxAlternates: number; preferredOrientation: Orientation } {
  const profile = SECTION_PROFILES[sectionKey];
  return {
    maxAlternates: profile.maxAlternates,
    preferredOrientation: profile.preferredOrientation,
  };
}
