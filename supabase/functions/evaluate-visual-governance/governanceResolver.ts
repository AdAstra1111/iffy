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
  | 'identity_packages'
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

  // ── Dependency-specific timestamps (for precise stale detection) ──
  /** Most recent update of character_visual_dna. */
  characterVisualDnaUpdatedAt?: string;
  /** Most recent update of pd_location_design. */
  pdLocationDesignUpdatedAt?: string;
  /** Most recent update of pd_world_rules. */
  pdWorldRulesUpdatedAt?: string;
  /** Most recent update of scene_index. */
  sceneIndexUpdatedAt?: string;
  /** Most recent update of character_wardrobe_profiles. */
  wardrobeProfilesUpdatedAt?: string;
  /** Most recent update of scene_wardrobe_assignments. */
  sceneWardrobeAssignmentsUpdatedAt?: string;
  /** Most recent update of project_visual_language. */
  visualLanguageUpdatedAt?: string;
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

  /** Cast state — Performance Readiness dimension */
  totalCharacters: number;
  lockedCharacters: number;
  castComplete: boolean; // Performance Readiness: cast approved + AI actors bound
  castSuggested: boolean; // Visual Readiness: cast suggestions exist from visual DNA

  /** Visual DNA identity readiness */
  hasVisualDNA: boolean;
  boundActorCount: number;
  hasActorBindings: boolean;
  actorAnchorsComplete: boolean;

  /** Character Identity Package readiness — Visual Readiness dimension */
  identityPackagesComplete: boolean; // CIP exists for all main characters
  identityPackageCount: number;

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
  'identity_packages',
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
  identity_packages: ['source_truth', 'visual_canon'],
  cast: ['source_truth', 'visual_canon'],
  hero_frames: ['source_truth', 'visual_canon', 'identity_packages'],
  production_design: ['source_truth', 'visual_canon', 'cast'],
  visual_language: ['source_truth', 'visual_canon', 'cast', 'hero_frames'],
  poster: ['source_truth', 'visual_canon', 'cast', 'hero_frames'],
  concept_brief: ['source_truth', 'visual_canon', 'cast', 'hero_frames'],
  lookbook: ['source_truth', 'visual_canon', 'cast', 'hero_frames', 'production_design'],
};

const STAGE_META: Record<PipelineStage, { label: string; description: string }> = {
  source_truth: { label: 'Source Truth', description: 'Narrative, world rules, and story canon' },
  visual_canon: { label: 'Visual Canon', description: 'Visual style, tone, and design language' },
  identity_packages: { label: 'Character Identity Packages', description: 'Character Identity Packages — structured character identity from Visual DNA + Wardrobe + PD' },
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
 * Compute stale-risk for a single stage based on dependency-specific timestamp comparisons.
 *
 * Staleness is dependency-aware: a stage is stale only when a direct upstream
 * dependency that the stage actually consumes has changed since the stage was generated.
 *
 * Rules:
 * - source_truth: stale if source docs are newer than canon (narrative source changed)
 * - visual_canon: stale if visual style or visual language changed
 * - cast: stale if character_visual_dna or project_ai_cast changed (NOT generic canon/wardrobe)
 * - hero_frames: stale if scene_index, character_visual_dna, scene_wardrobe_assignments,
 *   pd_location_design, or pd_world_rules changed after generation
 * - production_design: stale if PD canon tables changed after creation
 * - visual_language: stale if visual style/language was re-approved
 * - poster: stale if hero frames or poster candidates changed
 * - lookbook: stale if identity, wardrobe, or PD canon changed
 */
export function computeStaleRiskForStage(
  stage: PipelineStage,
  ts: StaleRiskTimestamps,
): { isStale: boolean; reasons: { label: string; detail: string; severity: string }[] } | null {
  const reasons: { label: string; detail: string; severity: string }[] = [];

  const sourceDocTime = ts.sourceDocUpdatedAt ? new Date(ts.sourceDocUpdatedAt).getTime() : 0;
  const canonTime = ts.canonUpdatedAt ? new Date(ts.canonUpdatedAt).getTime() : 0;
  const styleTime = ts.visualStyleUpdatedAt ? new Date(ts.visualStyleUpdatedAt).getTime() : 0;
  const castTime = ts.castUpdatedAt ? new Date(ts.castUpdatedAt).getTime() : 0;
  const pdTime = ts.pdUpdatedAt ? new Date(ts.pdUpdatedAt).getTime() : 0;
  const hfTime = ts.heroFrameGeneratedAt ? new Date(ts.heroFrameGeneratedAt).getTime() : 0;
  const posterTime = ts.posterGeneratedAt ? new Date(ts.posterGeneratedAt).getTime() : 0;
  const lbTime = ts.lookbookGeneratedAt ? new Date(ts.lookbookGeneratedAt).getTime() : 0;

  // Dependency-specific timestamps
  const dnaTime = ts.characterVisualDnaUpdatedAt ? new Date(ts.characterVisualDnaUpdatedAt).getTime() : 0;
  const pdLocTime = ts.pdLocationDesignUpdatedAt ? new Date(ts.pdLocationDesignUpdatedAt).getTime() : 0;
  const pdWorldTime = ts.pdWorldRulesUpdatedAt ? new Date(ts.pdWorldRulesUpdatedAt).getTime() : 0;
  const sceneTime = ts.sceneIndexUpdatedAt ? new Date(ts.sceneIndexUpdatedAt).getTime() : 0;
  const wProfTime = ts.wardrobeProfilesUpdatedAt ? new Date(ts.wardrobeProfilesUpdatedAt).getTime() : 0;
  const wAssignTime = ts.sceneWardrobeAssignmentsUpdatedAt ? new Date(ts.sceneWardrobeAssignmentsUpdatedAt).getTime() : 0;
  const vlTime = ts.visualLanguageUpdatedAt ? new Date(ts.visualLanguageUpdatedAt).getTime() : 0;

  switch (stage) {
    case 'source_truth':
      // Dependency: source documents → canon.json
      if (sourceDocTime > 0 && canonTime > 0 && sourceDocTime > canonTime) {
        reasons.push({
          label: 'Source documents updated',
          detail: 'Source documents have been updated since canon was last refreshed.',
          severity: 'high',
        });
      }
      break;

    case 'visual_canon':
      // Dependencies: visual style, visual language
      if (canonTime > 0 && styleTime > 0 && canonTime > styleTime) {
        reasons.push({
          label: 'Canon updated after style profile',
          detail: 'Canon was updated after the visual style profile was defined.',
          severity: 'medium',
        });
      }
      if (vlTime > 0 && styleTime > 0 && vlTime > styleTime) {
        reasons.push({
          label: 'Visual language updated after style profile',
          detail: 'Visual language was updated after the style profile was defined.',
          severity: 'medium',
        });
      }
      break;

    case 'cast':
      // Dependencies: character_visual_dna, project_ai_cast, active character set
      // NOT: generic canon updates, wardrobe profiles, PD canon, hero frames, scene index
      if (dnaTime > 0 && castTime > 0 && dnaTime > castTime) {
        reasons.push({
          label: 'Character visual DNA updated',
          detail: 'Character visual DNA was updated after cast assignments were made.',
          severity: 'high',
        });
      }
      break;

    case 'hero_frames':
      // Dependencies: scene_index, character_visual_dna, scene_wardrobe_assignments,
      // pd_location_design, pd_world_rules
      // NOT: generic canon timestamp
      if (sceneTime > 0 && hfTime > 0 && sceneTime > hfTime) {
        reasons.push({
          label: 'Scene index updated',
          detail: 'Scene index was updated after hero frames were generated.',
          severity: 'high',
        });
      }
      if (dnaTime > 0 && hfTime > 0 && dnaTime > hfTime) {
        reasons.push({
          label: 'Character visual DNA updated',
          detail: 'Character visual DNA was updated after hero frames were generated.',
          severity: 'high',
        });
      }
      if (wAssignTime > 0 && hfTime > 0 && wAssignTime > hfTime) {
        reasons.push({
          label: 'Wardrobe assignments updated',
          detail: 'Scene wardrobe assignments were updated after hero frames were generated.',
          severity: 'medium',
        });
      }
      if (pdLocTime > 0 && hfTime > 0 && pdLocTime > hfTime) {
        reasons.push({
          label: 'Production Design locations updated',
          detail: 'PD location designs were updated after hero frames were generated.',
          severity: 'medium',
        });
      }
      if (pdWorldTime > 0 && hfTime > 0 && pdWorldTime > hfTime) {
        reasons.push({
          label: 'World rules updated',
          detail: 'PD world rules were updated after hero frames were generated.',
          severity: 'medium',
        });
      }
      if (castTime > 0 && hfTime > 0 && castTime > hfTime) {
        reasons.push({
          label: 'Cast updated',
          detail: 'Cast bindings were updated after hero frames were generated.',
          severity: 'high',
        });
      }
      break;

    case 'production_design':
      // Dependencies: PD canon tables themselves
      // If PD tables were updated after the last generation/lock, they're current.
      // Only stale if source truth changed and PD hasn't been re-evaluated.
      if (canonTime > 0 && pdTime > 0 && canonTime > pdTime) {
        reasons.push({
          label: 'Source truth updated',
          detail: 'Source truth was updated after Production Design was created.',
          severity: 'high',
        });
      }
      break;

    case 'visual_language':
      // Dependencies: visual style, visual language profile
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
      if (hfTime > 0 && posterTime > 0 && hfTime > posterTime) {
        reasons.push({
          label: 'Hero frames updated',
          detail: 'Hero frames were generated after concept brief was created.',
          severity: 'medium',
        });
      }
      break;

    case 'lookbook':
      // Dependencies: identity canon, wardrobe canon, PD canon
      if (dnaTime > 0 && lbTime > 0 && dnaTime > lbTime) {
        reasons.push({
          label: 'Character visual DNA updated',
          detail: 'Character visual DNA was updated after lookbook was assembled.',
          severity: 'high',
        });
      }
      if (wAssignTime > 0 && lbTime > 0 && wAssignTime > lbTime) {
        reasons.push({
          label: 'Wardrobe assignments updated',
          detail: 'Wardrobe assignments were updated after lookbook was assembled.',
          severity: 'high',
        });
      }
      if (pdLocTime > 0 && lbTime > 0 && pdLocTime > lbTime) {
        reasons.push({
          label: 'Production Design locations updated',
          detail: 'PD location designs were updated after lookbook was assembled.',
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
 * Uses dependency-aware timestamp comparisons — a stage is stale only when
 * one of its actual consumed dependencies has changed.
 *
 * Rules mirror computeStaleRiskForStage but return StructuredStaleReason objects
 * with codes for downstream stage inference.
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
  const hfTime = ts.heroFrameGeneratedAt ? new Date(ts.heroFrameGeneratedAt).getTime() : 0;
  const posterTime = ts.posterGeneratedAt ? new Date(ts.posterGeneratedAt).getTime() : 0;

  // Dependency-specific timestamps
  const dnaTime = ts.characterVisualDnaUpdatedAt ? new Date(ts.characterVisualDnaUpdatedAt).getTime() : 0;
  const pdLocTime = ts.pdLocationDesignUpdatedAt ? new Date(ts.pdLocationDesignUpdatedAt).getTime() : 0;
  const pdWorldTime = ts.pdWorldRulesUpdatedAt ? new Date(ts.pdWorldRulesUpdatedAt).getTime() : 0;
  const sceneTime = ts.sceneIndexUpdatedAt ? new Date(ts.sceneIndexUpdatedAt).getTime() : 0;
  const wAssignTime = ts.sceneWardrobeAssignmentsUpdatedAt ? new Date(ts.sceneWardrobeAssignmentsUpdatedAt).getTime() : 0;
  const vlTime = ts.visualLanguageUpdatedAt ? new Date(ts.visualLanguageUpdatedAt).getTime() : 0;

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

  // visual_canon: stale only if visual style or visual language changed after profile
  if (canonTime > 0 && styleTime > 0 && canonTime > styleTime) {
    reasons['visual_canon'] = [
      {
        code: STALE_REASON_CODES.CANON_NEWER_THAN_STAGE,
        label: 'Canon updated after style profile',
        detail: 'Canon was updated after the visual style profile was defined.',
        severity: 'medium',
        sourceTimestamp: ts.canonUpdatedAt,
        affectedDownstreamStages: ['cast', 'hero_frames'],
      },
    ];
  }
  if (vlTime > 0 && styleTime > 0 && vlTime > styleTime) {
    const existing = reasons['visual_canon'] || [];
    existing.push({
      code: STALE_REASON_CODES.VISUAL_STYLE_OUTDATED,
      label: 'Visual language updated',
      detail: 'Visual language was updated after the style profile.',
      severity: 'medium',
      sourceTimestamp: ts.visualLanguageUpdatedAt,
      affectedDownstreamStages: [],
    });
    reasons['visual_canon'] = existing;
  }
  // visual_language stale if canon or visual language changed after approval
  if (canonTime > 0 && styleTime > 0 && canonTime > styleTime) {
    const existing = reasons['visual_language'] || [];
    existing.push({
      code: STALE_REASON_CODES.VISUAL_STYLE_OUTDATED,
      label: 'Visual style outdated',
      detail: 'Canon updated after visual language was approved.',
      severity: 'medium',
      sourceTimestamp: ts.canonUpdatedAt,
      affectedDownstreamStages: [],
    });
    reasons['visual_language'] = existing;
  }

  // cast: stale only if character_visual_dna changed (NOT scene index, canon, wardrobe, or PD)
  if (dnaTime > 0 && castTime > 0 && dnaTime > castTime) {
    reasons['cast'] = [
      {
        code: STALE_REASON_CODES.CANON_NEWER_THAN_STAGE,
        label: 'Character visual DNA updated',
        detail: 'Character visual DNA was updated after cast assignments were made.',
        severity: 'high',
        sourceTimestamp: ts.characterVisualDnaUpdatedAt,
        affectedDownstreamStages: ['hero_frames', 'production_design', 'lookbook'],
      },
    ];
  }

  // hero_frames: stale only if scene_index, visual DNA, wardrobe assignments,
  // pd_location_design, or pd_world_rules changed after generation
  if (sceneTime > 0 && hfTime > 0 && sceneTime > hfTime) {
    reasons['hero_frames'] = [
      {
        code: STALE_REASON_CODES.CAST_NEWER_THAN_HERO_FRAMES,
        label: 'Scene index updated',
        detail: 'Scene index was updated after hero frames were generated.',
        severity: 'high',
        sourceTimestamp: ts.sceneIndexUpdatedAt,
        affectedDownstreamStages: ['poster', 'visual_language', 'concept_brief'],
      },
    ];
  }
  if (dnaTime > 0 && hfTime > 0 && dnaTime > hfTime) {
    const existing = reasons['hero_frames'] || [];
    existing.push({
      code: STALE_REASON_CODES.CAST_NEWER_THAN_HERO_FRAMES,
      label: 'Character visual DNA updated',
      detail: 'Character visual DNA was updated after hero frames were generated.',
      severity: 'high',
      sourceTimestamp: ts.characterVisualDnaUpdatedAt,
      affectedDownstreamStages: ['poster', 'visual_language', 'concept_brief'],
    });
    reasons['hero_frames'] = existing;
  }
  if (wAssignTime > 0 && hfTime > 0 && wAssignTime > hfTime) {
    const existing = reasons['hero_frames'] || [];
    existing.push({
      code: STALE_REASON_CODES.CAST_NEWER_THAN_HERO_FRAMES,
      label: 'Wardrobe assignments updated',
      detail: 'Wardrobe assignments were updated after hero frames were generated.',
      severity: 'medium',
      sourceTimestamp: ts.sceneWardrobeAssignmentsUpdatedAt,
      affectedDownstreamStages: ['poster', 'visual_language', 'concept_brief'],
    });
    reasons['hero_frames'] = existing;
  }
  if (pdLocTime > 0 && hfTime > 0 && pdLocTime > hfTime) {
    const existing = reasons['hero_frames'] || [];
    existing.push({
      code: STALE_REASON_CODES.PD_NEWER_THAN_LOOKBOOK,
      label: 'PD locations updated',
      detail: 'PD location designs were updated after hero frames were generated.',
      severity: 'medium',
      sourceTimestamp: ts.pdLocationDesignUpdatedAt,
      affectedDownstreamStages: [],
    });
    reasons['hero_frames'] = existing;
  }
  if (pdWorldTime > 0 && hfTime > 0 && pdWorldTime > hfTime) {
    const existing = reasons['hero_frames'] || [];
    existing.push({
      code: STALE_REASON_CODES.PD_NEWER_THAN_LOOKBOOK,
      label: 'World rules updated',
      detail: 'PD world rules were updated after hero frames were generated.',
      severity: 'medium',
      sourceTimestamp: ts.pdWorldRulesUpdatedAt,
      affectedDownstreamStages: [],
    });
    reasons['hero_frames'] = existing;
  }
  if (castTime > 0 && hfTime > 0 && castTime > hfTime) {
    const existing = reasons['hero_frames'] || [];
    existing.push({
      code: STALE_REASON_CODES.CAST_NEWER_THAN_HERO_FRAMES,
      label: 'Cast updated',
      detail: 'Cast bindings were updated after hero frames were generated.',
      severity: 'high',
      sourceTimestamp: ts.castUpdatedAt,
      affectedDownstreamStages: ['poster', 'visual_language', 'concept_brief'],
    });
    reasons['hero_frames'] = existing;
  }

  // production_design: stale only if source truth changed after PD creation
  if (canonTime > 0 && pdWorldTime > 0 && canonTime > pdWorldTime) {
    reasons['production_design'] = [
      {
        code: STALE_REASON_CODES.PD_NEWER_THAN_LOOKBOOK,
        label: 'Source truth updated',
        detail: 'Source truth was updated after Production Design was created.',
        severity: 'high',
        sourceTimestamp: ts.canonUpdatedAt,
        affectedDownstreamStages: ['hero_frames', 'lookbook'],
      },
    ];
  }

  // poster: stale if hero frames changed after poster candidates
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

  // lookbook: stale if identity, wardrobe, or PD canon changed after assembly
  if (dnaTime > 0 && hfTime > 0 && dnaTime > hfTime) {
    reasons['lookbook'] = [
      {
        code: STALE_REASON_CODES.CAST_NEWER_THAN_HERO_FRAMES,
        label: 'Character visual DNA updated',
        detail: 'Character visual DNA was updated after lookbook assembly.',
        severity: 'high',
        sourceTimestamp: ts.characterVisualDnaUpdatedAt,
        affectedDownstreamStages: [],
      },
    ];
  }
  if (wAssignTime > 0 && hfTime > 0 && wAssignTime > hfTime) {
    const existing = reasons['lookbook'] || [];
    existing.push({
      code: STALE_REASON_CODES.PD_NEWER_THAN_LOOKBOOK,
      label: 'Wardrobe assignments updated',
      detail: 'Wardrobe assignments were updated after lookbook assembly.',
      severity: 'high',
      sourceTimestamp: ts.sceneWardrobeAssignmentsUpdatedAt,
      affectedDownstreamStages: [],
    });
    reasons['lookbook'] = existing;
  }
  if (pdLocTime > 0 && hfTime > 0 && pdLocTime > hfTime) {
    const existing = reasons['lookbook'] || [];
    existing.push({
      code: STALE_REASON_CODES.PD_NEWER_THAN_LOOKBOOK,
      label: 'PD locations updated',
      detail: 'PD location designs were updated after lookbook assembly.',
      severity: 'high',
      sourceTimestamp: ts.pdLocationDesignUpdatedAt,
      affectedDownstreamStages: [],
    });
    reasons['lookbook'] = existing;
  }

  // Fallback: if hash changed but no timestamp condition matched,
  // mark all stages with SOURCE_SNAPSHOT_CHANGED — informational only
  // (low severity, never blocks a stage by itself)
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
          severity: 'low', // informational only — never blocks a completed stage
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
        sourceType: 'pd_canon_tables (pd_world_rules / pd_design_templates / pd_location_design)',
        sourceDetail: `${inputs.pdLockedFamilies}/${inputs.pdTotalFamilies} families · ${inputs.pdCreatedFamilies} created`,
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

  // ── 3B. CHARACTER IDENTITY PACKAGES — Visual Readiness dimension ──
  let cipStatus: StageStatus;
  const cipBlockers: string[] = [];
  if (!inputs.hasCanon) {
    cipStatus = 'blocked';
    cipBlockers.push('Requires source truth');
  } else if (inputs.identityPackagesComplete) {
    cipStatus = 'locked';
  } else if (inputs.identityPackageCount > 0) {
    cipStatus = 'in_progress';
  } else if (inputs.hasVisualDNA) {
    cipStatus = 'not_started';
  } else {
    cipStatus = 'blocked';
    cipBlockers.push('Requires Visual DNA');
  }
  stages.push({
    stage_id: 'identity_packages',
    computed_status: cipStatus,
    eligibility_state: { eligible: false, reason: undefined, completed_prereqs: [], blocked_prereqs: [] },
    stale_risk: null,
    blocker_codes: cipBlockers.length > 0 ? cipBlockers : null,
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

  // ── 5. HERO FRAMES — gated on Identity Packages Complete (Visual Readiness) ──
  let hfStatus: StageStatus;
  const hfBlockers: string[] = [];
  if (!inputs.identityPackagesComplete) {
    hfStatus = 'blocked';
    hfBlockers.push('Requires Character Identity Packages (Visual Readiness)');
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
    // Principle: hash mismatch alone cannot downgrade a completed stage.
    // Only explicit timestamp-based dependency failures can mark a stage stale.
    const stageHashReasons = hashBasedStaleReasons[s.stage_id];
    if (stageHashReasons && stageHashReasons.length > 0) {
      const hasHighSeverityHashReason = stageHashReasons.some((hr) => hr.severity === 'high' || hr.severity === 'medium');
      if (!s.stale_risk) {
        s.stale_risk = { isStale: hasHighSeverityHashReason, reasons: [] };
      }
      for (const hr of stageHashReasons) {
        s.stale_risk.reasons.push({
          label: hr.label,
          detail: hr.detail,
          severity: hr.severity,
        });
      }
      // Only high/medium severity hash reasons can override completed stages.
      // Low-severity (SOURCE_SNAPSHOT_CHANGED) is informational and never blocks.
      if (hasHighSeverityHashReason) {
        s.stale_risk.isStale = true;
      }
      // If the stage is already locked/approved and only has low-severity hash reasons,
      // keep isStale as whatever timestamp-based detection said (or false).
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
    // NOTE: Timestamps are deliberately excluded from the hash.
    // They belong in timestamp-based staleness detection (computeStaleRiskForStage).
    // Including them would make the hash change on every evaluation,
    // causing spurious SOURCE_SNAPSHOT_CHANGED flags on all stages.
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