/**
 * Visual Governance Snapshot Types
 * 
 * Mirrors project_visual_stage_governance table row for frontend consumption.
 * Server-side persistence — not the sole authority, but preferred when available.
 */

import type { PipelineStage, StageStatus, StageEligibility, StaleRisk, StageProvenance } from './pipelineStatusResolver';

/** Stale reason code constants matching server-side STALE_REASON_CODES. */
export const STALE_REASON_CODES = {
  CANON_NEWER_THAN_STAGE: 'CANON_NEWER_THAN_STAGE',
  DOC_VERSION_CHANGED: 'DOC_VERSION_CHANGED',
  CAST_NEWER_THAN_HERO_FRAMES: 'CAST_NEWER_THAN_HERO_FRAMES',
  PD_NEWER_THAN_LOOKBOOK: 'PD_NEWER_THAN_LOOKBOOK',
  HERO_FRAMES_NEWER_THAN_POSTER: 'HERO_FRAMES_NEWER_THAN_POSTER',
  VISUAL_STYLE_OUTDATED: 'VISUAL_STYLE_OUTDATED',
  SOURCE_SNAPSHOT_CHANGED: 'SOURCE_SNAPSHOT_CHANGED',
} as const;

export type StaleReasonCode = typeof STALE_REASON_CODES[keyof typeof STALE_REASON_CODES];

/** Extended stale risk reason with hash-based reason code. */
export interface GovernanceStaleReason {
  label: string;
  detail: string;
  severity: 'low' | 'medium' | 'high';
  code?: StaleReasonCode;
  sourceTimestamp?: string;
  affectedDownstreamStages?: string[];
}

/** A single governance snapshot row for one visual stage. */
export interface GovernanceSnapshotRow {
  id: string;
  project_id: string;
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
    reasons: GovernanceStaleReason[];
  } | null;
  blocker_codes: string[] | null;
  provenance_json: {
    sourceType: string;
    sourceDetail?: string;
    generatedAsset?: string;
    functionName?: string;
  } | null;
  last_evaluated_at: string;
  source_snapshot_hash: string;
}

/** Full governance snapshot response from the evaluate-visual-governance edge function. */
export interface GovernanceSnapshotResponse {
  snapshot: GovernanceSnapshotRow[];
  evaluated_at: string;
}

/** Governance source — indicates whether the data came from live computation or persisted snapshot. */
export type GovernanceDataSource = 'live_computed' | 'persisted_snapshot';

/** Extended stage state with governance source metadata. */
export interface GovernanceAwareStage {
  stage: PipelineStage;
  status: StageStatus;
  label: string;
  description: string;
  progress?: string;
  blockers?: string[];
  staleReasons?: string[];
  eligibility?: StageEligibility;
  staleRisk?: StaleRisk;
  provenance?: StageProvenance;
  governance_source?: GovernanceDataSource;
}

/**
 * Merge a governance snapshot over live-computed stages.
 * For each stage: prefer snapshot status/eligibility/stale_risk/provenance if available,
 * but keep the live UI properties (label, description, progress).
 * 
 * If no snapshot exists for a stage, the live-computed value is used as-is.
 */
/** Preflight blocker codes for hero-frame execution readiness. */
export const PREFLIGHT_BLOCKER_CODES = {
  MISSING_SCENE_INDEX: 'MISSING_SCENE_INDEX',
  MISSING_CAST_BINDINGS: 'MISSING_CAST_BINDINGS',
  MISSING_LOCATION_BINDINGS: 'MISSING_LOCATION_BINDINGS',
  MISSING_VISUAL_STYLE: 'MISSING_VISUAL_STYLE',
  MISSING_CANON_HASH: 'MISSING_CANON_HASH',
  STALE_UPSTREAM_STAGE: 'STALE_UPSTREAM_STAGE',
  LOCKED_REVIEW_REQUIRED: 'LOCKED_REVIEW_REQUIRED',
} as const;

export type PreflightBlockerCode = typeof PREFLIGHT_BLOCKER_CODES[keyof typeof PREFLIGHT_BLOCKER_CODES];

/** Human-readable labels for each blocker code. */
export const PREFLIGHT_BLOCKER_LABELS: Record<PreflightBlockerCode, string> = {
  MISSING_SCENE_INDEX: 'Scene Index Missing',
  MISSING_CAST_BINDINGS: 'Cast Bindings Missing',
  MISSING_LOCATION_BINDINGS: 'Location Bindings Missing',
  MISSING_VISUAL_STYLE: 'Visual Style Missing',
  MISSING_CANON_HASH: 'Canon Hash Missing',
  STALE_UPSTREAM_STAGE: 'Upstream Stage Stale',
  LOCKED_REVIEW_REQUIRED: 'Locked Review Required',
};

/** Detailed explanation for each blocker code. */
export const PREFLIGHT_BLOCKER_DETAILS: Record<PreflightBlockerCode, string> = {
  MISSING_SCENE_INDEX: 'Scene index must be populated with at least one scene entry.',
  MISSING_CAST_BINDINGS: 'All characters must have cast bindings (character_visual_dna + project_ai_cast).',
  MISSING_LOCATION_BINDINGS: 'All scene locations must have canon_locations entries.',
  MISSING_VISUAL_STYLE: 'Visual style profile must exist and be complete.',
  MISSING_CANON_HASH: 'Canon must exist with content (project_canon.canon_json).',
  STALE_UPSTREAM_STAGE: 'An upstream input (canon, cast, or production design) has newer data than existing hero frames.',
  LOCKED_REVIEW_REQUIRED: 'A locked review or governance block prevents execution.',
};

/** Requirements that each blocker code corresponds to. */
export interface PreflightRequirementResult {
  code: PreflightBlockerCode;
  passed: boolean;
  detail: string;
}

/** Full preflight evaluation result for hero-frame execution readiness. */
export interface HeroFramePreflightResult {
  project_id: string;
  evaluated_at: string;
  all_requirements_pass: boolean;
  requirements: PreflightRequirementResult[];
  canon_hash: string | null;
  scene_count: number;
  character_count: number;
  location_count: number;
  cast_bound_count: number;
  location_bound_count: number;
}

/** Lookbook preflight blocker codes for lookbook execution readiness. */
export const LOOKBOOK_PREFLIGHT_BLOCKER_CODES = {
  MISSING_CANON_HASH: 'MISSING_CANON_HASH',
  MISSING_VISUAL_CANON: 'MISSING_VISUAL_CANON',
  MISSING_CAST: 'MISSING_CAST',
  MISSING_PRODUCTION_DESIGN: 'MISSING_PRODUCTION_DESIGN',
  MISSING_HERO_FRAMES: 'MISSING_HERO_FRAMES',
  MISSING_VISUAL_LANGUAGE: 'MISSING_VISUAL_LANGUAGE',
  MISSING_SCENE_INDEX: 'MISSING_SCENE_INDEX',
  HIGH_SEVERITY_STALE_RISK: 'HIGH_SEVERITY_STALE_RISK',
  LOCKED_REVIEW_REQUIRED: 'LOCKED_REVIEW_REQUIRED',
} as const;

export type LookbookPreflightBlockerCode = typeof LOOKBOOK_PREFLIGHT_BLOCKER_CODES[keyof typeof LOOKBOOK_PREFLIGHT_BLOCKER_CODES];

/** Human-readable labels for each lookbook blocker code. */
export const LOOKBOOK_PREFLIGHT_BLOCKER_LABELS: Record<LookbookPreflightBlockerCode, string> = {
  MISSING_CANON_HASH: 'Canon Hash Missing',
  MISSING_VISUAL_CANON: 'Visual Canon Not Ready',
  MISSING_CAST: 'Cast Not Ready',
  MISSING_PRODUCTION_DESIGN: 'Production Design Not Ready',
  MISSING_HERO_FRAMES: 'Hero Frames Not Ready',
  MISSING_VISUAL_LANGUAGE: 'Visual Language Not Ready',
  MISSING_SCENE_INDEX: 'Scene Index Missing',
  HIGH_SEVERITY_STALE_RISK: 'High-Severity Stale Risk',
  LOCKED_REVIEW_REQUIRED: 'Locked Review Required',
};

/** Detailed explanation for each lookbook blocker code. */
export const LOOKBOOK_PREFLIGHT_BLOCKER_DETAILS: Record<LookbookPreflightBlockerCode, string> = {
  MISSING_CANON_HASH: 'Canon must exist with content (project_canon.canon_json).',
  MISSING_VISUAL_CANON: 'Visual canon stage must be approved/locked in governance.',
  MISSING_CAST: 'Cast stage must be approved/locked in governance.',
  MISSING_PRODUCTION_DESIGN: 'Production Design stage must be approved/locked in governance.',
  MISSING_HERO_FRAMES: 'Hero frames must be generated with at least one approved frame.',
  MISSING_VISUAL_LANGUAGE: 'Visual Language stage must be complete with style profile.',
  MISSING_SCENE_INDEX: 'Scene index must be populated with at least one scene entry.',
  HIGH_SEVERITY_STALE_RISK: 'One or more upstream stages have high-severity stale risk.',
  LOCKED_REVIEW_REQUIRED: 'Governance blockers require review before execution.',
};

/** Lookbook preflight requirement result. */
export interface LookbookPreflightRequirement {
  code: LookbookPreflightBlockerCode;
  passed: boolean;
  detail: string;
}

/** Full lookbook preflight evaluation result. */
export interface LookbookPreflightResult {
  project_id: string;
  evaluated_at: string;
  all_requirements_pass: boolean;
  requirements: LookbookPreflightRequirement[];
  canon_hash: string | null;
  upstream_stage_statuses: Record<string, string>;
  scene_count: number;
  hero_frame_count: number;
}

export function mergeGovernanceSnapshot(
  liveStages: GovernanceAwareStage[],
  snapshot: GovernanceSnapshotRow[] | null,
  evaluatedAt?: string,
): GovernanceAwareStage[] {
  if (!snapshot || snapshot.length === 0) {
    return liveStages.map(s => ({ ...s, governance_source: 'live_computed' }));
  }

  const snapshotMap = new Map(snapshot.map(r => [r.stage_id, r]));

  // Check if ALL stages have a snapshot — if so, we can use snapshot as primary
  const allStagesHaveSnapshot = liveStages.every(s => snapshotMap.has(s.stage));
  
  return liveStages.map(s => {
    const snapshotRow = snapshotMap.get(s.stage);
    if (!snapshotRow) {
      return { ...s, governance_source: 'live_computed' };
    }

    return {
      ...s,
      // Prefer snapshot status, fall back to live-computed
      status: (snapshotRow.computed_status as StageStatus) || s.status,
      // Enrich with snapshot eligibility
      eligibility: {
        eligible: snapshotRow.eligibility_state.eligible,
        reason: snapshotRow.eligibility_state.reason || 
          (!snapshotRow.eligibility_state.eligible && snapshotRow.eligibility_state.blocked_prereqs.length > 0
            ? `Requires: ${snapshotRow.eligibility_state.blocked_prereqs.join(', ')}`
            : undefined),
      },
      // Snapshot stale-risk (already enriched)
      staleRisk: snapshotRow.stale_risk ? {
        isStale: snapshotRow.stale_risk.isStale,
        reasons: snapshotRow.stale_risk.reasons,
      } : s.staleRisk,
      // Snapshot provenance
      provenance: snapshotRow.provenance_json ? {
        sourceType: snapshotRow.provenance_json.sourceType,
        sourceDetail: snapshotRow.provenance_json.sourceDetail,
        generatedAsset: snapshotRow.provenance_json.generatedAsset,
        functionName: snapshotRow.provenance_json.functionName,
      } : s.provenance,
      // Blockers from snapshot
      blockers: snapshotRow.blocker_codes && snapshotRow.blocker_codes.length > 0 
        ? snapshotRow.blocker_codes 
        : s.blockers,
      governance_source: allStagesHaveSnapshot ? 'persisted_snapshot' : 'live_computed',
    };
  });
}
