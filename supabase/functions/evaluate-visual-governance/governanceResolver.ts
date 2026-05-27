/**
 * governanceResolver — Standalone server-side (Deno) resolver for Visual Pipeline Governance.
 *
 * Mirrors the exact logic from src/lib/visual/pipelineStatusResolver.ts
 * with no frontend imports. Self-contained for edge function use.
 *
 * Computes stage status, eligibility, stale-risk, and provenance from
 * PipelineInputs, then returns a StageGovernance[] for persistence.
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

/** Timestamps used for stale-risk computation per stage. */
export interface StaleRiskTimestamps {
  /** Most recent update of source documents (project_documents). */
  sourceDocUpdatedAt?: string;
  /** Most recent update of project_canon. */
  canonUpdatedAt?: string;
  /** Most recent update of project_visual_style. */
  visualStyleUpdatedAt?: string;
  /** Most recent update of project_ai_cast. */
  castUpdatedAt?: string;
  /** Most recent update of visual_sets for production_design. */
  pdUpdatedAt?: string;
  /** Most recent created_at of hero_frame project_images. */
  heroFrameGeneratedAt?: string;
  /** Most recent created_at of poster_candidates. */
  posterGeneratedAt?: string;
  /** Most recent update of lookbook_sections. */
  lookbookGeneratedAt?: string;
}

/** Reason code and metadata for a hash-based stale detection event. */
export interface StageStaleReason {
  code: string;
  label: string;
  detail: string;
  severity: 'low' | 'medium' | 'high';
  sourceTimestamp?: string;
  affectedDownstreamStages?: string[];
}

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
  castComplete: boolean; // character identity readiness: atoms complete + visual DNA present

  /** Visual DNA identity readiness (separate from actor anchor readiness) */
  hasVisualDNA: boolean;
  boundActorCount: number;
  hasActorBindings: boolean;
  actorAnchorsComplete: boolean; // actor anchor coverage/coherence (separate from castComplete)

  /** Non-character entity readiness (creature, vehicle, prop visual state bindings) */
  creaturesReady: boolean;
  vehiclesReady: boolean;
  propsReady: boolean;

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

  /** Stale-risk timestamps for governance read model. */
  staleRiskTimestamps?: StaleRiskTimestamps;
}

/** Governance row shape matching the project_visual_stage_governance table. */
export interface StageGovernance {
  stage_id: string;
  computed_status: string;
  eligibility_state: {
    eligible: boolean;
    reason?: string;
    completed_prereqs: string[];
    blocked_prereqs: string[];
  };
  stale_risk: {
    isStale: boolean;
    reasons: { label: string; detail: string; severity: string }[];
  } | null;
  blocker_codes: string[] | null;
  provenance_json: {
    sourceType: string;
    sourceDetail?: string;
    generatedAsset?: string;
    functionName?: string;
  } | null;
}

// ── Stage order and metadata ─────────────────────────────────────────────────

export const VISUAL_STAGE_ORDER: readonly PipelineStage[] = [
  'source_truth',
  'visual_canon',
  'cast',
  'hero_frames',
  'production_design',
  'visual_language',
  'poster',
  'concept_brief',
  'lookbook',
] as const;

/** Prerequisites: a stage requires these earlier stages to be complete (for eligibility gate). */
export const VISUAL_STAGE_PREREQUISITES: Record<PipelineStage, PipelineStage[]> = {
  source_truth: [],
  visual_canon: ['source_truth'],
  cast: ['source_truth', 'visual_canon'],
  hero_frames: ['source_truth', 'visual_canon', 'cast'],
  production_design: ['source_truth', 'visual_canon', 'cast'],
  visual_language: ['source_truth', 'visual_canon', 'cast', 'hero_frames'],
  poster: ['source_truth', 'visual_canon', 'cast', 'hero_frames'],
  concept_brief: ['source_truth', 'visual_canon', 'cast', 'hero_frames'],
  lookbook: ['source_truth', 'visual_canon', 'cast', 'hero_frames', 'production_design'],
};

const STAGE_META: Record<PipelineStage, { label: string; description: string }> = {
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

/** Reason codes for hash-based stale detection mapped from timestamp comparisons. */
export const STALE_REASON_CODES = {
  CANON_NEWER_THAN_STAGE: 'CANON_NEWER_THAN_STAGE',
  DOC_VERSION_CHANGED: 'DOC_VERSION_CHANGED',
  CAST_NEWER_THAN_HERO_FRAMES: 'CAST_NEWER_THAN_HERO_FRAMES',
  PD_NEWER_THAN_LOOKBOOK: 'PD_NEWER_THAN_LOOKBOOK',
  HERO_FRAMES_NEWER_THAN_POSTER: 'HERO_FRAMES_NEWER_THAN_POSTER',
  VISUAL_STYLE_OUTDATED: 'VISUAL_STYLE_OUTDATED',
  SOURCE_SNAPSHOT_CHANGED: 'SOURCE_SNAPSHOT_CHANGED',
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the set of completed stage names from the resolved StageGovernance array.
 * A stage is "completed" if its status is 'approved' or 'locked'.
 */
export function getCompletedStages(stages: StageGovernance[]): Set<string> {
  return new Set(
    stages
      .filter((s) => s.computed_status === 'approved' || s.computed_status === 'locked')
      .map((s) => s.stage_id),
  );
}

/**
 * Returns true if the given stage is eligible (all prerequisites met).
 * Fail-closed: unknown stages return false.
 */
export function isStageEligible(
  stage: string | null | undefined,
  completedStages: Set<string>,
): boolean {
  if (!stage) return false;
  const prereqs = VISUAL_STAGE_PREREQUISITES[stage as PipelineStage];
  if (!prereqs) return false;
  return prereqs.every((p) => completedStages.has(p));
}

// ── Stale-risk computation ───────────────────────────────────────────────────

/**
 * Compute stale-risk for a single stage based on timestamp comparisons.
 *
 * Rules (mirrors frontend computeStaleRiskForStage):
 * - source_truth: stale if source docs are newer than canon
 * - visual_canon: stale if canon is newer than visual style
 * - cast: stale if canon is newer than cast assignments
 * - hero_frames: stale if canon, cast, or PD is newer than generated frames
 * - production_design: stale if cast is newer than PD sets
 * - visual_language: stale if canon or hero frames are newer than style approval
 * - poster: stale if hero frames are newer than poster candidates
 * - lookbook: stale if cast or PD is newer than lookbook sections
 */
export function computeStaleRiskForStage(
  stage: PipelineStage,
  ts: StaleRiskTimestamps,
): { isStale: boolean; reasons: { label: string; detail: string; severity: string }[] } | null {
  const reasons: { label: string; detail: string; severity: string }[] = [];

  const canonTime = ts.canonUpdatedAt ? new Date(ts.canonUpdatedAt).getTime() : 0;
  const sourceDocTime = ts.sourceDocUpdatedAt ? new Date(ts.sourceDocUpdatedAt).getTime() : 0;
  const styleTime = ts.visualStyleUpdatedAt ? new Date(ts.visualStyleUpdatedAt).getTime() : 0;
  const castTime = ts.castUpdatedAt ? new Date(ts.castUpdatedAt).getTime() : 0;
  const pdTime = ts.pdUpdatedAt ? new Date(ts.pdUpdatedAt).getTime() : 0;
  const hfTime = ts.heroFrameGeneratedAt ? new Date(ts.heroFrameGeneratedAt).getTime() : 0;
  const posterTime = ts.posterGeneratedAt ? new Date(ts.posterGeneratedAt).getTime() : 0;
  const lbTime = ts.lookbookGeneratedAt ? new Date(ts.lookbookGeneratedAt).getTime() : 0;

  switch (stage) {
    case 'source_truth':
      if (sourceDocTime > 0 && canonTime > 0 && sourceDocTime > canonTime) {
        reasons.push({
          label: 'Source documents updated',
          detail: 'Source documents have been updated since canon was last refreshed.',
          severity: 'high',
        });
      }
      break;

    case 'visual_canon':
      if (canonTime > 0 && styleTime > 0 && canonTime > styleTime) {
        reasons.push({
          label: 'Canon updated',
          detail: 'Canon was updated after the visual style profile was defined.',
          severity: 'medium',
        });
      }
      break;

    case 'cast':
      if (canonTime > 0 && castTime > 0 && canonTime > castTime) {
        reasons.push({
          label: 'Canon updated',
          detail: 'Canon was updated after cast assignments were made.',
          severity: 'high',
        });
      }
      break;

    case 'hero_frames':
      if (canonTime > 0 && hfTime > 0 && canonTime > hfTime) {
        reasons.push({
          label: 'Canon updated',
          detail: 'Canon was updated after hero frames were generated.',
          severity: 'high',
        });
      }
      if (castTime > 0 && hfTime > 0 && castTime > hfTime) {
        reasons.push({
          label: 'Cast updated',
          detail: 'Cast was updated after hero frames were generated.',
          severity: 'medium',
        });
      }
      if (pdTime > 0 && hfTime > 0 && pdTime > hfTime) {
        reasons.push({
          label: 'Production Design updated',
          detail: 'Production Design was updated after hero frames were generated.',
          severity: 'medium',
        });
      }
      break;

    case 'production_design':
      if (castTime > 0 && pdTime > 0 && castTime > pdTime) {
        reasons.push({
          label: 'Cast updated',
          detail: 'Cast was updated after Production Design sets were created.',
          severity: 'high',
        });
      }
      break;

    case 'visual_language':
      if (canonTime > 0 && styleTime > 0 && canonTime > styleTime) {
        reasons.push({
          label: 'Canon updated',
          detail: 'Canon updated after visual language was approved.',
          severity: 'medium',
        });
      }
      if (hfTime > 0 && styleTime > 0 && hfTime > styleTime) {
        reasons.push({
          label: 'Hero frames generated',
          detail: 'New hero frames generated after visual language was defined.',
          severity: 'low',
        });
      }
      break;

    case 'poster':
      if (hfTime > 0 && posterTime > 0 && hfTime > posterTime) {
        reasons.push({
          label: 'Hero frames updated',
          detail: 'Hero frames were generated after poster candidates.',
          severity: 'medium',
        });
      }
      break;

    case 'concept_brief':
      // Concept brief stale risk follows same pattern as poster: check if hero frames updated after brief
      if (hfTime > 0 && posterTime > 0 && hfTime > posterTime) {
        reasons.push({
          label: 'Hero frames updated',
          detail: 'Hero frames were generated after concept brief was created.',
          severity: 'medium',
        });
      }
      break;

    case 'lookbook':
      if (castTime > 0 && lbTime > 0 && castTime > lbTime) {
        reasons.push({
          label: 'Cast updated',
          detail: 'Cast was updated after lookbook was assembled.',
          severity: 'high',
        });
      }
      if (pdTime > 0 && lbTime > 0 && pdTime > lbTime) {
        reasons.push({
          label: 'Production Design updated',
          detail: 'Production Design was updated after lookbook was assembled.',
          severity: 'high',
        });
      }
      break;

    default:
      return null;
  }

  return { isStale: reasons.length > 0, reasons };
}

// ── Hash-based stale detection ──────────────────────────────────────────────

/**
 * Compute stage-specific stale reasons based on source-snapshot hash change.
 * Returns a map of stage_id → StageStaleReason[].
 *
 * Only returns reasons when the hash has changed (prevHash !== currentHash).
 * Maps timestamp comparisons to specific stale reason codes per stage.
 */
export function computeStageSpecificStaleReasons(
  prevHash: string | null,
  currentHash: string,
  ts: StaleRiskTimestamps,
): Record<string, StageStaleReason[]> {
  const reasons: Record<string, StageStaleReason[]> = {};

  // No hash change means no new stale risk from input changes
  if (!prevHash || prevHash === currentHash) {
    return reasons;
  }

  const sourceDocTime = ts.sourceDocUpdatedAt ? new Date(ts.sourceDocUpdatedAt).getTime() : 0;
  const canonTime = ts.canonUpdatedAt ? new Date(ts.canonUpdatedAt).getTime() : 0;
  const styleTime = ts.visualStyleUpdatedAt ? new Date(ts.visualStyleUpdatedAt).getTime() : 0;
  const castTime = ts.castUpdatedAt ? new Date(ts.castUpdatedAt).getTime() : 0;
  const pdTime = ts.pdUpdatedAt ? new Date(ts.pdUpdatedAt).getTime() : 0;
  const hfTime = ts.heroFrameGeneratedAt ? new Date(ts.heroFrameGeneratedAt).getTime() : 0;
  const posterTime = ts.posterGeneratedAt ? new Date(ts.posterGeneratedAt).getTime() : 0;

  // sourceDocUpdatedAt > canonUpdatedAt → DOC_VERSION_CHANGED → source_truth
  if (sourceDocTime > 0 && canonTime > 0 && sourceDocTime > canonTime) {
    reasons['source_truth'] = [
      {
        code: STALE_REASON_CODES.DOC_VERSION_CHANGED,
        label: 'Document version changed',
        detail: 'Source documents have been updated since canon was last refreshed.',
        severity: 'high',
        sourceTimestamp: ts.sourceDocUpdatedAt,
        affectedDownstreamStages: ['visual_canon', 'cast', 'hero_frames'],
      },
    ];
  }

  // canonUpdatedAt > visualStyleUpdatedAt → CANON_NEWER_THAN_STAGE (visual_canon)
  //                                   → VISUAL_STYLE_OUTDATED (visual_language)
  if (canonTime > 0 && styleTime > 0 && canonTime > styleTime) {
    reasons['visual_canon'] = [
      {
        code: STALE_REASON_CODES.CANON_NEWER_THAN_STAGE,
        label: 'Canon updated',
        detail: 'Canon was updated after the visual style profile was defined.',
        severity: 'medium',
        sourceTimestamp: ts.canonUpdatedAt,
        affectedDownstreamStages: ['cast', 'hero_frames'],
      },
    ];
    reasons['visual_language'] = [
      {
        code: STALE_REASON_CODES.VISUAL_STYLE_OUTDATED,
        label: 'Visual style outdated',
        detail: 'Canon updated after visual language was approved.',
        severity: 'medium',
        sourceTimestamp: ts.canonUpdatedAt,
        affectedDownstreamStages: [],
      },
    ];
  }

  // canonUpdatedAt > castUpdatedAt → CANON_NEWER_THAN_STAGE → cast
  if (canonTime > 0 && castTime > 0 && canonTime > castTime) {
    reasons['cast'] = [
      {
        code: STALE_REASON_CODES.CANON_NEWER_THAN_STAGE,
        label: 'Canon updated',
        detail: 'Canon was updated after cast assignments were made.',
        severity: 'high',
        sourceTimestamp: ts.canonUpdatedAt,
        affectedDownstreamStages: ['hero_frames', 'production_design', 'lookbook'],
      },
    ];
  }

  // castUpdatedAt > heroFrameGeneratedAt → CAST_NEWER_THAN_HERO_FRAMES → hero_frames
  if (castTime > 0 && hfTime > 0 && castTime > hfTime) {
    reasons['hero_frames'] = [
      {
        code: STALE_REASON_CODES.CAST_NEWER_THAN_HERO_FRAMES,
        label: 'Cast updated',
        detail: 'Cast was updated after hero frames were generated.',
        severity: 'medium',
        sourceTimestamp: ts.castUpdatedAt,
        affectedDownstreamStages: ['poster', 'visual_language', 'concept_brief'],
      },
    ];
  }

  // castUpdatedAt > pdUpdatedAt → PD_NEWER_THAN_LOOKBOOK → production_design, lookbook
  if (castTime > 0 && pdTime > 0 && castTime > pdTime) {
    reasons['production_design'] = [
      {
        code: STALE_REASON_CODES.PD_NEWER_THAN_LOOKBOOK,
        label: 'Production Design outdated',
        detail: 'Cast was updated after Production Design sets were created.',
        severity: 'high',
        sourceTimestamp: ts.castUpdatedAt,
        affectedDownstreamStages: ['hero_frames', 'lookbook'],
      },
    ];
    reasons['lookbook'] = [
      {
        code: STALE_REASON_CODES.PD_NEWER_THAN_LOOKBOOK,
        label: 'Production Design outdated',
        detail: 'Cast was updated after lookbook was assembled.',
        severity: 'high',
        sourceTimestamp: ts.castUpdatedAt,
        affectedDownstreamStages: [],
      },
    ];
  }

  // heroFrameGeneratedAt > posterGeneratedAt → HERO_FRAMES_NEWER_THAN_POSTER → poster
  if (hfTime > 0 && posterTime > 0 && hfTime > posterTime) {
    reasons['poster'] = [
      {
        code: STALE_REASON_CODES.HERO_FRAMES_NEWER_THAN_POSTER,
        label: 'Hero frames updated',
        detail: 'Hero frames were generated after poster candidates.',
        severity: 'medium',
        sourceTimestamp: ts.heroFrameGeneratedAt,
        affectedDownstreamStages: ['concept_brief'],
      },
    ];
  }

  // Fallback: if hash changed but no timestamp condition matched,
  // mark all stages with SOURCE_SNAPSHOT_CHANGED
  if (Object.keys(reasons).length === 0) {
    const allStageIds = [
      'source_truth', 'visual_canon', 'cast', 'hero_frames',
      'production_design', 'visual_language', 'poster',
      'concept_brief', 'lookbook',
    ];
    for (const stageId of allStageIds) {
      reasons[stageId] = [
        {
          code: STALE_REASON_CODES.SOURCE_SNAPSHOT_CHANGED,
          label: 'Source snapshot changed',
          detail: 'The source data snapshot hash has changed since the last evaluation.',
          severity: 'medium',
          sourceTimestamp: undefined,
          affectedDownstreamStages: [],
        },
      ];
    }
  }

  return reasons;
}

// ── Provenance computation ───────────────────────────────────────────────────

/**
 * Compute provenance metadata for a stage based on pipeline inputs.
 * Indicates source doc/table, version info, and generating function.
 */
export function computeProvenanceForStage(
  stage: PipelineStage,
  inputs: PipelineInputs,
): { sourceType: string; sourceDetail?: string; generatedAsset?: string; functionName?: string } | null {
  switch (stage) {
    case 'source_truth':
      return {
        sourceType: 'project_canon',
        sourceDetail: `Canon loaded: ${inputs.hasCanon ? 'yes' : 'no'} · ${inputs.locationCount} locations`,
        generatedAsset: 'canon_json',
      };
    case 'visual_canon':
      return {
        sourceType: 'project_visual_style',
        sourceDetail: inputs.visualStyleComplete ? 'Complete profile' : inputs.hasVisualStyle ? 'Partial profile' : 'Not defined',
        generatedAsset: 'visual_style_profile',
      };
    case 'cast':
      return {
        sourceType: 'project_ai_cast + ai_actors',
        sourceDetail: `${inputs.lockedCharacters}/${inputs.totalCharacters} cast · ${inputs.castComplete ? 'All coherent' : 'Incomplete'}`,
        functionName: 'assign-actor',
      };
    case 'hero_frames':
      return {
        sourceType: 'project_images',
        sourceDetail: `${inputs.heroFrameApproved}/${inputs.heroFrameTotal} approved · Primary: ${inputs.heroFramePrimaryApproved ? 'locked' : 'pending'}`,
        functionName: 'generate-hero-frames',
        generatedAsset: 'hero_frame',
      };
    case 'production_design':
      return {
        sourceType: 'visual_sets',
        sourceDetail: `${inputs.pdLockedFamilies}/${inputs.pdTotalFamilies} families locked · ${inputs.pdCreatedFamilies} created`,
        generatedAsset: 'production_design_sets',
      };
    case 'visual_language':
      return {
        sourceType: 'project_visual_style',
        sourceDetail: inputs.visualLanguageApproved ? 'Approved direction' : 'Not yet approved',
        generatedAsset: 'lighting/composition profile',
      };
    case 'poster':
      return {
        sourceType: 'poster_candidates',
        sourceDetail: `${inputs.posterCandidateCount ?? 0} candidates`,
        functionName: 'generate-poster',
        generatedAsset: 'poster_candidate',
      };
    case 'concept_brief':
      return {
        sourceType: 'concept_brief_versions',
        sourceDetail: `Version ${inputs.conceptBriefVersion ?? 0}`,
        generatedAsset: 'concept_brief',
      };
    case 'lookbook':
      return {
        sourceType: 'lookbook_sections',
        sourceDetail: inputs.lookbookExists ? 'Assembled' : 'Not assembled',
        generatedAsset: 'lookbook_assembly',
      };
    default:
      return { sourceType: 'unknown', sourceDetail: 'Unknown stage' };
  }
}

// ── Main resolver ────────────────────────────────────────────────────────────

/**
 * Resolve governance state for all visual pipeline stages.
 *
 * Mirrors resolvePipelineStages() from the frontend, but returns
 * StageGovernance[] suitable for persistence into the
 * project_visual_stage_governance table.
 */
export async function resolveStageGovernance(
  inputs: PipelineInputs,
  previousHash?: string | null,
): Promise<StageGovernance[]> {
  const stages: StageGovernance[] = [];

  // ── 1. SOURCE TRUTH ──
  const sourceTruthStatus: StageStatus = inputs.hasCanon
    ? (inputs.hasLocations ? 'locked' : 'in_progress')
    : 'not_started';
  stages.push({
    stage_id: 'source_truth',
    computed_status: sourceTruthStatus,
    eligibility_state: { eligible: false, reason: undefined, completed_prereqs: [], blocked_prereqs: [] },
    stale_risk: null,
    blocker_codes: null,
    provenance_json: null,
  });

  // ── 2. VISUAL CANON ──
  const visualCanonStatus: StageStatus = inputs.visualStyleComplete
    ? 'approved'
    : inputs.hasVisualStyle
    ? 'in_progress'
    : inputs.hasCanon
    ? 'not_started'
    : 'blocked';
  stages.push({
    stage_id: 'visual_canon',
    computed_status: visualCanonStatus,
    eligibility_state: { eligible: false, reason: undefined, completed_prereqs: [], blocked_prereqs: [] },
    stale_risk: null,
    blocker_codes: !inputs.hasCanon ? ['Requires source truth'] : null,
    provenance_json: null,
  });

  // ── 3. CAST ──
  let castStatus: StageStatus;
  const castBlockers: string[] = [];
  if (!inputs.hasCanon) {
    castStatus = 'blocked';
    castBlockers.push('Requires source truth');
  } else if (inputs.castComplete) {
    castStatus = 'locked';
  } else {
    // Character identity readiness determines status
    castStatus = inputs.totalCharacters > 0 ? 'in_progress' : 'not_started';

    // Granular blocker codes
    const atomsMissing = !inputs.totalCharacters || inputs.totalCharacters === 0;
    const atomsIncomplete = !atomsMissing && inputs.lockedCharacters < inputs.totalCharacters;
    const dnaMissing = !inputs.hasVisualDNA;
    const bindingsMissing = !inputs.hasActorBindings;
    const anchorInsufficient = inputs.hasActorBindings && !inputs.actorAnchorsComplete;

    if (atomsMissing) castBlockers.push('MISSING_CHARACTER_ATOMS');
    if (atomsIncomplete) castBlockers.push('MISSING_CHARACTER_ATOMS');
    if (dnaMissing) castBlockers.push('MISSING_VISUAL_DNA');
    if (bindingsMissing) castBlockers.push('MISSING_ACTOR_BINDINGS');
    if (anchorInsufficient) castBlockers.push('ACTOR_ANCHOR_INSUFFICIENT');
  }
  stages.push({
    stage_id: 'cast',
    computed_status: castStatus,
    eligibility_state: { eligible: false, reason: undefined, completed_prereqs: [], blocked_prereqs: [] },
    stale_risk: null,
    blocker_codes: castBlockers.length > 0 ? castBlockers : null,
    provenance_json: null,
  });

  // ── 4. PRODUCTION DESIGN — gated on cast ──
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
    stage_id: 'production_design',
    computed_status: pdStatus,
    eligibility_state: { eligible: false, reason: undefined, completed_prereqs: [], blocked_prereqs: [] },
    stale_risk: null,
    blocker_codes: pdBlockers.length > 0 ? pdBlockers : null,
    provenance_json: null,
  });

  // ── 5. HERO FRAMES — gated on Production Design locked ──
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
    stage_id: 'hero_frames',
    computed_status: hfStatus,
    eligibility_state: { eligible: false, reason: undefined, completed_prereqs: [], blocked_prereqs: [] },
    stale_risk: null,
    blocker_codes: hfBlockers.length > 0 ? hfBlockers : null,
    provenance_json: null,
  });

  // ── 6. VISUAL LANGUAGE ──
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
    stage_id: 'visual_language',
    computed_status: vlStatus,
    eligibility_state: { eligible: false, reason: undefined, completed_prereqs: [], blocked_prereqs: [] },
    stale_risk: null,
    blocker_codes: vlBlockers.length > 0 ? vlBlockers : null,
    provenance_json: null,
  });

  // ── 7. POSTER ──
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
    stage_id: 'poster',
    computed_status: posterStatus,
    eligibility_state: { eligible: false, reason: undefined, completed_prereqs: [], blocked_prereqs: [] },
    stale_risk: null,
    blocker_codes: posterBlockers.length > 0 ? posterBlockers : null,
    provenance_json: null,
  });

  // ── 8. CONCEPT BRIEF ──
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
    stage_id: 'concept_brief',
    computed_status: cbStatus,
    eligibility_state: { eligible: false, reason: undefined, completed_prereqs: [], blocked_prereqs: [] },
    stale_risk: null,
    blocker_codes: cbBlockers.length > 0 ? cbBlockers : null,
    provenance_json: null,
  });

  // ── 9. LOOKBOOK (Explore / Lab — siloed from primary pipeline) ──
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
    stage_id: 'lookbook',
    computed_status: lbStatus,
    eligibility_state: { eligible: false, reason: undefined, completed_prereqs: [], blocked_prereqs: [] },
    stale_risk: null,
    blocker_codes: lbBlockers.length > 0 ? lbBlockers : null,
    provenance_json: null,
  });

  // ── Visual Governance enrichment ──
  const completedStages = getCompletedStages(stages);
  
  // Compute current hash for hash-based stale detection
  const currentHash = await computeSourceSnapshotHash(inputs);
  const hashBasedStaleReasons = previousHash !== undefined
    ? computeStageSpecificStaleReasons(previousHash, currentHash, inputs.staleRiskTimestamps ?? {})
    : {};

  for (const s of stages) {
    // Eligibility: prerequisite gate check
    const stageKey = s.stage_id as PipelineStage;
    const prereqs = VISUAL_STAGE_PREREQUISITES[stageKey] ?? [];
    const eligible = isStageEligible(s.stage_id, completedStages);
    const completedPrereqs = prereqs.filter((p) => completedStages.has(p));
    const blockedPrereqs = prereqs.filter((p) => !completedStages.has(p));
    s.eligibility_state = {
      eligible,
      reason: eligible
        ? undefined
        : `Requires: ${prereqs.join(', ')}`,
      completed_prereqs: completedPrereqs,
      blocked_prereqs: blockedPrereqs,
    };

    // Stale-risk: timestamp-based detection
    if (inputs.staleRiskTimestamps) {
      s.stale_risk = computeStaleRiskForStage(stageKey, inputs.staleRiskTimestamps);
    }

    // Stale-risk: hash-based detection (additive — merges into timestamp-based)
    const stageHashReasons = hashBasedStaleReasons[s.stage_id];
    if (stageHashReasons && stageHashReasons.length > 0) {
      if (!s.stale_risk) {
        s.stale_risk = { isStale: true, reasons: [] };
      }
      for (const hr of stageHashReasons) {
        s.stale_risk.reasons.push({
          label: hr.label,
          detail: hr.detail,
          severity: hr.severity,
        });
      }
      s.stale_risk.isStale = true;
    }

    // Provenance: source doc/table, version, generated asset
    s.provenance_json = computeProvenanceForStage(stageKey, inputs);
  }

  return stages;
}

/**
 * Compute a deterministic SHA256 hex digest of all pipeline input values.
 * This enables change detection: if the hash changes between evaluations,
 * the governance state needs updating.
 *
 * Joins all boolean/count/timestamp values into a canonical string, then
 * SHA256-hashes it.
 */
export async function computeSourceSnapshotHash(inputs: PipelineInputs): Promise<string> {
  const canonicalParts: string[] = [
    // Booleans (sorted alphabetically by key)
    `castComplete:${inputs.castComplete}`,
    `creaturesReady:${inputs.creaturesReady}`,
    `hasCanon:${inputs.hasCanon}`,
    `hasLocations:${inputs.hasLocations}`,
    `hasVisualStyle:${inputs.hasVisualStyle}`,
    `heroFramePrimaryApproved:${inputs.heroFramePrimaryApproved}`,
    `lookbookExists:${inputs.lookbookExists}`,
    `lookbookStale:${inputs.lookbookStale}`,
    `pdAllLocked:${inputs.pdAllLocked}`,
    `propsReady:${inputs.propsReady}`,
    `vehiclesReady:${inputs.vehiclesReady}`,
    `visualLanguageApproved:${inputs.visualLanguageApproved}`,
    `visualStyleComplete:${inputs.visualStyleComplete}`,

    // Counts
    `conceptBriefVersion:${inputs.conceptBriefVersion ?? 0}`,
    `heroFrameApproved:${inputs.heroFrameApproved}`,
    `heroFrameTotal:${inputs.heroFrameTotal}`,
    `locationCount:${inputs.locationCount}`,
    `lockedCharacters:${inputs.lockedCharacters}`,
    `pdCreatedFamilies:${inputs.pdCreatedFamilies}`,
    `pdLockedFamilies:${inputs.pdLockedFamilies}`,
    `pdTotalFamilies:${inputs.pdTotalFamilies}`,
    `posterCandidateCount:${inputs.posterCandidateCount ?? 0}`,
    `totalCharacters:${inputs.totalCharacters}`,

    // Stale-risk timestamps (if present)
    `sourceDocUpdatedAt:${inputs.staleRiskTimestamps?.sourceDocUpdatedAt ?? ''}`,
    `canonUpdatedAt:${inputs.staleRiskTimestamps?.canonUpdatedAt ?? ''}`,
    `visualStyleUpdatedAt:${inputs.staleRiskTimestamps?.visualStyleUpdatedAt ?? ''}`,
    `castUpdatedAt:${inputs.staleRiskTimestamps?.castUpdatedAt ?? ''}`,
    `pdUpdatedAt:${inputs.staleRiskTimestamps?.pdUpdatedAt ?? ''}`,
    `heroFrameGeneratedAt:${inputs.staleRiskTimestamps?.heroFrameGeneratedAt ?? ''}`,
    `posterGeneratedAt:${inputs.staleRiskTimestamps?.posterGeneratedAt ?? ''}`,
    `lookbookGeneratedAt:${inputs.staleRiskTimestamps?.lookbookGeneratedAt ?? ''}`,
  ];

  const canonicalString = canonicalParts.join('|');

  // Encode to Uint8Array for SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}