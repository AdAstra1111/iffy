/**
 * visualGovernanceActions — Action recommendations for visual governance.
 *
 * Maps stale reason codes and stage state to human-readable actions.
 * All actions are RECOMMENDATIONS only — they EXPLAIN what should happen next
 * but do NOT execute anything.
 *
 * The only safe executable action in this pass is REFRESH_GOVERNANCE
 * (re-evaluates governance state without triggering generation).
 */

import {
  type StaleReasonCode,
  type GovernanceStaleReason,
  STALE_REASON_CODES,
} from './visualGovernanceTypes';

import type { PipelineStage, StageStatus, StageEligibility, StageProvenance } from './pipelineStatusResolver';

// ── Action types ─────────────────────────────────────────────────────────────

export const VISUAL_GOVERNANCE_ACTIONS = {
  REVIEW_ONLY: 'REVIEW_ONLY',
  REFRESH_GOVERNANCE: 'REFRESH_GOVERNANCE',
  REGENERATE_CANDIDATES: 'REGENERATE_CANDIDATES',
  REBUILD_STAGE: 'REBUILD_STAGE',
  LOCKED_REVIEW_REQUIRED: 'LOCKED_REVIEW_REQUIRED',
} as const;

export type VisualGovernanceAction = typeof VISUAL_GOVERNANCE_ACTIONS[keyof typeof VISUAL_GOVERNANCE_ACTIONS];

export interface ActionRecommendation {
  /** The recommended action ID. */
  action: VisualGovernanceAction;
  /** Human-readable label for the action. */
  label: string;
  /** Explanation of why this action is recommended. */
  reason: string;
  /** Whether the action is eligible (gating conditions met). */
  eligible: boolean;
  /** Why the action is blocked, if not eligible. */
  blockedReason?: string;
  /** Whether executing this action is safe (read-only/explain vs actually generates). */
  isSafe: boolean;
  /** Downstream stages that would be affected. */
  affectedDownstreamStages: string[];
  /** The stale reason code that triggered this recommendation, if any. */
  triggerCode?: StaleReasonCode;
}

// ── Action metadata ──────────────────────────────────────────────────────────

/** Human-readable labels for each action. */
export const ACTION_LABELS: Record<VisualGovernanceAction, string> = {
  REVIEW_ONLY: 'Review Only',
  REFRESH_GOVERNANCE: 'Refresh Governance',
  REGENERATE_CANDIDATES: 'Regenerate Candidates',
  REBUILD_STAGE: 'Rebuild Stage',
  LOCKED_REVIEW_REQUIRED: 'Locked — Review Required',
};

/** Whether each action is safe (read-only inference) or involves generation. */
export const ACTION_SAFETY: Record<VisualGovernanceAction, boolean> = {
  REVIEW_ONLY: true,           // Pure human review — no system action
  REFRESH_GOVERNANCE: true,    // Re-evaluate governance state, read-only
  REGENERATE_CANDIDATES: false, // Would trigger generation (not yet executable)
  REBUILD_STAGE: false,         // Would trigger regeneration (not yet executable)
  LOCKED_REVIEW_REQUIRED: true, // Human review of locked assets
};

// ── Stale-reason-to-action mapping ──────────────────────────────────────────

/**
 * Map from stale reason code -> recommended action.
 * This is the PRIMARY mapping for stale-stage recommendations.
 */
const STALE_REASON_ACTION_MAP: Record<string, VisualGovernanceAction> = {
  [STALE_REASON_CODES.DOC_VERSION_CHANGED]: 'REBUILD_STAGE',
  [STALE_REASON_CODES.CANON_NEWER_THAN_STAGE]: 'REGENERATE_CANDIDATES',
  [STALE_REASON_CODES.CAST_NEWER_THAN_HERO_FRAMES]: 'REGENERATE_CANDIDATES',
  [STALE_REASON_CODES.PD_NEWER_THAN_LOOKBOOK]: 'REBUILD_STAGE',
  [STALE_REASON_CODES.HERO_FRAMES_NEWER_THAN_POSTER]: 'REGENERATE_CANDIDATES',
  [STALE_REASON_CODES.VISUAL_STYLE_OUTDATED]: 'REFRESH_GOVERNANCE',
  [STALE_REASON_CODES.SOURCE_SNAPSHOT_CHANGED]: 'REFRESH_GOVERNANCE',
};

// ── Eligibility rules ────────────────────────────────────────────────────────

/**
 * Check if an action is eligible for a given stage state.
 * 
 * Rules (fail-closed):
 * - REFRESH_GOVERNANCE: always allowed (safe, read-only)
 * - REVIEW_ONLY: blocked if stage locked AND not stale
 * - REGENERATE_CANDIDATES: blocked if no provenance, blocked if stage is locked
 * - REBUILD_STAGE: blocked if stale reason unresolved (trivially false since stale)
 * - LOCKED_REVIEW_REQUIRED: blocked if stage is not locked, blocked if no stale reason
 */
export function isActionEligible(
  action: VisualGovernanceAction,
  stage: {
    status: StageStatus;
    eligibility?: StageEligibility;
    staleRisk?: { isStale: boolean; reasons: any[] };
    provenance?: StageProvenance;
  },
): { eligible: boolean; reason?: string } {
  // REFRESH_GOVERNANCE is always safe and always eligible
  if (action === 'REFRESH_GOVERNANCE') return { eligible: true };

  // All other actions require the stage to be eligible (prerequisites met)
  const isPrereqEligible = stage.eligibility?.eligible ?? true;
  if (!isPrereqEligible) {
    // But we still show recommendations — just mark as blocked
  }

  const isLocked = stage.status === 'locked';
  const isStale = stage.staleRisk?.isStale ?? false;
  const hasProvenance = !!stage.provenance?.sourceType;

  switch (action) {
    case 'REVIEW_ONLY':
      if (isLocked && !isStale) {
        return { eligible: false, reason: 'Stage is locked and not stale — no review needed' };
      }
      return { eligible: true };

    case 'REGENERATE_CANDIDATES':
      if (isLocked) return { eligible: false, reason: 'Stage is locked — unlock before regenerating' };
      if (!hasProvenance) return { eligible: false, reason: 'Missing provenance — cannot identify source' };
      return { eligible: true };

    case 'REBUILD_STAGE':
      if (isLocked) return { eligible: false, reason: 'Stage is locked — unlock before rebuilding' };
      return { eligible: true };

    case 'LOCKED_REVIEW_REQUIRED':
      if (!isLocked) return { eligible: false, reason: 'Stage is not locked — no review needed' };
      if (!isStale) return { eligible: false, reason: 'No stale risk detected' };
      return { eligible: true };

    default:
      return { eligible: false, reason: 'Unknown action' };
  }
}

// ── Main recommendation engine ───────────────────────────────────────────────

/**
 * Compute the recommended governance action for a single visual stage.
 * 
 * Rules (first match wins):
 * 1. If stage is locked AND stale → LOCKED_REVIEW_REQUIRED
 * 2. If stage is locked (no stale) → REVIEW_ONLY
 * 3. If stage has stale risk → map first stale reason code to action
 * 4. If stage is eligible and ready → REFRESH_GOVERNANCE
 * 5. Default → REVIEW_ONLY
 */
export function computeRecommendedAction(
  stage: {
    stage_id: string;
    status: StageStatus;
    eligibility?: StageEligibility;
    staleRisk?: { isStale: boolean; reasons: any[] };
    provenance?: StageProvenance;
  },
): ActionRecommendation {
  const isStale = stage.staleRisk?.isStale ?? false;
  const isLocked = stage.status === 'locked';
  
  // Extract first stale reason code and downstream stages
  const firstReason = (stage.staleRisk?.reasons ?? [])[0] as GovernanceStaleReason | undefined;
  const triggerCode = firstReason?.code;
  const downstream = firstReason?.affectedDownstreamStages ?? [];

  let action: VisualGovernanceAction;
  let reason: string;

  // Rule 1: Locked + stale → LOCKED_REVIEW_REQUIRED
  if (isLocked && isStale) {
    action = 'LOCKED_REVIEW_REQUIRED';
    reason = `Stage "${stage.stage_id}" is locked but stale risk detected — requires human review of locked assets.`;
  }
  // Rule 2: Locked (no stale) → REVIEW_ONLY
  else if (isLocked) {
    action = 'REVIEW_ONLY';
    reason = `Stage "${stage.stage_id}" is locked with no stale risk — review only if needed.`;
  }
  // Rule 3: Stale risk → map code to action
  else if (isStale && triggerCode) {
    action = STALE_REASON_ACTION_MAP[triggerCode] ?? 'REVIEW_ONLY';
    const sourceDetail = firstReason?.sourceTimestamp
      ? `Source changed: ${new Date(firstReason.sourceTimestamp).toLocaleDateString()}`
      : '';
    reason = `Stale reason "${triggerCode}" detected${sourceDetail ? ` (${sourceDetail})` : ''}.`;
  }
  // Rule 4: Eligible and no stale risk → REFRESH_GOVERNANCE
  else if (stage.eligibility?.eligible) {
    action = 'REFRESH_GOVERNANCE';
    reason = `Stage "${stage.stage_id}" is eligible — refresh governance to confirm state.`;
  }
  // Rule 5: Default → REVIEW_ONLY
  else {
    action = 'REVIEW_ONLY';
    reason = `Stage "${stage.stage_id}" has no actionable state — review only.`;
  }

  // Check eligibility of the recommended action
  const eligibility = isActionEligible(action, stage);

  return {
    action,
    label: ACTION_LABELS[action],
    reason,
    eligible: eligibility.eligible,
    blockedReason: eligibility.reason,
    isSafe: ACTION_SAFETY[action],
    affectedDownstreamStages: downstream,
    triggerCode,
  };
}

/**
 * Compute recommended actions for ALL visual pipeline stages at once.
 */
export function computeAllStageActions(
  stages: Array<{
    stage_id: string;
    status: StageStatus;
    eligibility?: StageEligibility;
    staleRisk?: { isStale: boolean; reasons: any[] };
    provenance?: StageProvenance;
  }>,
): Map<string, ActionRecommendation> {
  const results = new Map<string, ActionRecommendation>();
  for (const stage of stages) {
    results.set(stage.stage_id, computeRecommendedAction(stage));
  }
  return results;
}

export { STALE_REASON_ACTION_MAP };