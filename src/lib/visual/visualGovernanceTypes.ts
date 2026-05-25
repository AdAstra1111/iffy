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
