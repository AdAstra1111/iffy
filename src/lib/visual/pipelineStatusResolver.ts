/**
 * pipelineStatusResolver — Canonical stage status resolver for the Visual Production Pipeline.
 *
 * Computes stage readiness from existing Supabase truth:
 * - cast truth (project_ai_cast, ai_actors, anchor coverage/coherence)
 * - hero frames (project_images with asset_group='hero_frame')
 * - visual sets (visual_sets, visual_set_slots)
 * - visual style profile (project_visual_style)
 * - canon (project_canon)
 *
 * No new tables. No duplicated logic. Pure derivation.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type PipelineStage =
  | 'source_truth'
  | 'visual_canon'
  | 'cast'
  | 'hero_frames'
  | 'production_design'
  | 'visual_language'
  | 'poster'
  | 'concept_brief'
  | 'lookbook';

export type StageStatus =
  | 'not_started'
  | 'in_progress'
  | 'ready_for_review'
  | 'approved'
  | 'locked'
  | 'stale'
  | 'blocked';

export interface StageState {
  stage: PipelineStage;
  status: StageStatus;
  label: string;
  description: string;
  progress?: string;
  blockers?: string[];
  staleReasons?: string[];
}

export const PIPELINE_STAGES: PipelineStage[] = [
  'source_truth',
  'visual_canon',
  'cast',
  'production_design',
  'hero_frames',
  'visual_language',
  'poster',
  'concept_brief',
  'lookbook',
];

export const STAGE_META: Record<PipelineStage, { label: string; description: string }> = {
  source_truth: { label: 'Source Truth', description: 'Narrative, world rules, and story canon' },
  visual_canon: { label: 'Visual Canon', description: 'Visual style, tone, and design language' },
  cast: { label: 'Cast', description: 'Character casting and identity anchoring' },
  hero_frames: { label: 'Hero Frames', description: 'Cinematic anchor stills — downstream of Production Design' },
  production_design: { label: 'Production Design', description: 'Environment, atmosphere, and surface language — upstream of Hero Frames' },
  visual_language: { label: 'Visual Language', description: 'Lighting, composition, and tone direction' },
  poster: { label: 'Poster', description: 'Top commercially viable poster candidates from governed imagery' },
  concept_brief: { label: 'Concept Brief', description: 'Executive concept brief — curated investor-ready visual package' },
  lookbook: { label: 'Explore / Lab', description: 'Exploratory visual identity assembly (internal use)' },
};

// ── Input data shapes (from existing hooks) ──

export interface PipelineInputs {
  /** Does the project have canon_json with content? */
  hasCanon: boolean;
  /** Does canon have locations? */
  hasLocations: boolean;
  locationCount: number;

  /** Visual style profile */
  hasVisualStyle: boolean;
  visualStyleComplete: boolean;

  /** Cast state */
  totalCharacters: number;
  lockedCharacters: number;
  castComplete: boolean; // all locked + datasets complete + coherent

  /** Hero Frames state */
  heroFrameTotal: number;
  heroFrameApproved: number;
  heroFramePrimaryApproved: boolean;

  /** Production Design state */
  pdTotalFamilies: number;
  pdLockedFamilies: number;
  pdCreatedFamilies: number;
  pdAllLocked: boolean;

  /** Visual Language (derived from visual style completeness for now) */
  visualLanguageApproved: boolean;

  /** LookBook */
  lookbookExists: boolean;
  lookbookStale: boolean;
  lookbookStaleReasons?: string[];

  /** Poster */
  posterCandidateCount?: number;

  /** Concept Brief */
  conceptBriefVersion?: number;
}

// ── Resolver ─────────────────────────────────────────────────────────────────

export function resolvePipelineStages(inputs: PipelineInputs): StageState[] {
  const stages: StageState[] = [];

  // 1. SOURCE TRUTH
  const sourceTruthStatus: StageStatus = inputs.hasCanon
    ? (inputs.hasLocations ? 'locked' : 'in_progress')
    : 'not_started';
  stages.push({
    stage: 'source_truth',
    ...STAGE_META.source_truth,
    status: sourceTruthStatus,
    progress: inputs.hasCanon
      ? `Canon loaded${inputs.hasLocations ? ` · ${inputs.locationCount} locations` : ''}`
      : undefined,
  });

  // 2. VISUAL CANON
  const visualCanonStatus: StageStatus = inputs.visualStyleComplete
    ? 'approved'
    : inputs.hasVisualStyle
    ? 'in_progress'
    : inputs.hasCanon
    ? 'not_started'
    : 'blocked';
  stages.push({
    stage: 'visual_canon',
    ...STAGE_META.visual_canon,
    status: visualCanonStatus,
    progress: inputs.visualStyleComplete ? 'Visual style complete' : inputs.hasVisualStyle ? 'Partial — fields remaining' : undefined,
    blockers: !inputs.hasCanon ? ['Requires source truth'] : undefined,
  });

  // 3. CAST
  let castStatus: StageStatus;
  const castBlockers: string[] = [];
  if (!inputs.hasCanon) {
    castStatus = 'blocked';
    castBlockers.push('Requires source truth');
  } else if (inputs.castComplete) {
    castStatus = 'locked';
  } else if (inputs.lockedCharacters > 0) {
    castStatus = 'in_progress';
  } else if (inputs.totalCharacters > 0) {
    castStatus = 'not_started';
  } else {
    castStatus = 'not_started';
  }
  stages.push({
    stage: 'cast',
    ...STAGE_META.cast,
    status: castStatus,
    progress: inputs.totalCharacters > 0
      ? `${inputs.lockedCharacters}/${inputs.totalCharacters} locked`
      : undefined,
    blockers: castBlockers.length > 0 ? castBlockers : undefined,
  });

  // 4. PRODUCTION DESIGN — gated on cast (upstream of hero frames)
  let pdStatus: StageStatus;
  const pdBlockers: string[] = [];
  if (!inputs.castComplete) {
    pdStatus = 'blocked';
    pdBlockers.push('Requires cast locked with complete datasets');
  } else if (inputs.pdAllLocked) {
    pdStatus = 'locked';
  } else if (inputs.pdCreatedFamilies > 0) {
    pdStatus = inputs.pdLockedFamilies > 0 ? 'in_progress' : 'ready_for_review';
  } else {
    pdStatus = 'not_started';
  }
  stages.push({
    stage: 'production_design',
    ...STAGE_META.production_design,
    status: pdStatus,
    progress: inputs.pdTotalFamilies > 0
      ? `${inputs.pdLockedFamilies}/${inputs.pdTotalFamilies} families locked`
      : undefined,
    blockers: pdBlockers.length > 0 ? pdBlockers : undefined,
  });

  // 5. HERO FRAMES — gated on Production Design locked
  let hfStatus: StageStatus;
  const hfBlockers: string[] = [];
  if (!inputs.castComplete) {
    hfStatus = 'blocked';
    hfBlockers.push('Requires cast locked with complete datasets');
  } else if (!inputs.pdAllLocked) {
    hfStatus = 'blocked';
    hfBlockers.push('Requires Production Design locked');
  } else if (!inputs.hasLocations) {
    hfStatus = 'blocked';
    hfBlockers.push('Requires world foundation (locations defined)');
  } else if (inputs.heroFramePrimaryApproved) {
    hfStatus = 'locked';
  } else if (inputs.heroFrameTotal > 0) {
    hfStatus = 'ready_for_review';
  } else {
    hfStatus = 'not_started';
  }
  stages.push({
    stage: 'hero_frames',
    ...STAGE_META.hero_frames,
    status: hfStatus,
    progress: inputs.heroFrameTotal > 0
      ? `${inputs.heroFrameApproved}/${inputs.heroFrameTotal} approved${inputs.heroFramePrimaryApproved ? ' · Primary locked' : ''}`
      : undefined,
    blockers: hfBlockers.length > 0 ? hfBlockers : undefined,
  });

  // 6. VISUAL LANGUAGE
  let vlStatus: StageStatus;
  const vlBlockers: string[] = [];
  if (!inputs.pdAllLocked) {
    vlStatus = 'blocked';
    vlBlockers.push('Requires Production Design locked');
  } else if (inputs.visualLanguageApproved) {
    vlStatus = 'approved';
  } else if (inputs.visualStyleComplete) {
    vlStatus = 'ready_for_review';
  } else {
    vlStatus = 'not_started';
  }
  stages.push({
    stage: 'visual_language',
    ...STAGE_META.visual_language,
    status: vlStatus,
    progress: inputs.visualLanguageApproved ? 'Direction approved' : undefined,
    blockers: vlBlockers.length > 0 ? vlBlockers : undefined,
  });

  // 7. POSTER
  let posterStatus: StageStatus;
  const posterBlockers: string[] = [];
  if (!inputs.heroFramePrimaryApproved) {
    posterStatus = 'blocked';
    posterBlockers.push('Requires Hero Frames primary approved');
  } else if ((inputs.posterCandidateCount ?? 0) > 0) {
    posterStatus = 'ready_for_review';
  } else {
    posterStatus = 'not_started';
  }
  stages.push({
    stage: 'poster',
    ...STAGE_META.poster,
    status: posterStatus,
    progress: (inputs.posterCandidateCount ?? 0) > 0
      ? `${inputs.posterCandidateCount} candidate${(inputs.posterCandidateCount ?? 0) !== 1 ? 's' : ''} selected`
      : undefined,
    blockers: posterBlockers.length > 0 ? posterBlockers : undefined,
  });

  // 8. CONCEPT BRIEF
  let cbStatus: StageStatus;
  const cbBlockers: string[] = [];
  if (!inputs.heroFramePrimaryApproved) {
    cbStatus = 'blocked';
    cbBlockers.push('Requires Hero Frames primary approved');
  } else if ((inputs.conceptBriefVersion ?? 0) > 0) {
    cbStatus = 'ready_for_review';
  } else {
    cbStatus = 'not_started';
  }
  stages.push({
    stage: 'concept_brief',
    ...STAGE_META.concept_brief,
    status: cbStatus,
    progress: (inputs.conceptBriefVersion ?? 0) > 0
      ? `Version ${inputs.conceptBriefVersion}`
      : undefined,
    blockers: cbBlockers.length > 0 ? cbBlockers : undefined,
  });

  // 9. LOOKBOOK (Explore / Lab — siloed from primary pipeline)
  let lbStatus: StageStatus;
  const lbBlockers: string[] = [];
  if (!inputs.castComplete || !inputs.pdAllLocked) {
    lbStatus = 'blocked';
    if (!inputs.castComplete) lbBlockers.push('Requires cast locked');
    if (!inputs.pdAllLocked) lbBlockers.push('Requires Production Design locked');
  } else if (inputs.lookbookStale) {
    lbStatus = 'stale';
  } else if (inputs.lookbookExists) {
    lbStatus = 'approved';
  } else {
    lbStatus = 'not_started';
  }
  stages.push({
    stage: 'lookbook',
    ...STAGE_META.lookbook,
    status: lbStatus,
    progress: inputs.lookbookExists ? (inputs.lookbookStale ? 'Stale — rebuild recommended' : 'Built') : undefined,
    blockers: lbBlockers.length > 0 ? lbBlockers : undefined,
    staleReasons: inputs.lookbookStaleReasons,
  });

  return stages;
}

/**
 * Get the first actionable stage (the one the user should focus on).
 */
export function getActiveStage(stages: StageState[]): PipelineStage {
  for (const s of stages) {
    if (s.status === 'not_started' || s.status === 'in_progress' || s.status === 'ready_for_review' || s.status === 'stale') {
      return s.stage;
    }
  }
  return 'poster'; // Default to poster rather than lookbook (lookbook is exploratory)
}
