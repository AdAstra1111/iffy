/**
 * visualGovernanceActions.test.ts — Action recommendation tests.
 *
 * Tests for computeRecommendedAction and isActionEligible.
 * Covers: stale→correct action, locked requires review, no provenance blocks,
 *         refresh governance is safe.
 */

import { describe, it, expect } from 'vitest';
import {
  computeRecommendedAction,
  isActionEligible,
  VISUAL_GOVERNANCE_ACTIONS,
  type ActionRecommendation,
} from '../visualGovernanceActions';
import type { PipelineStage, StageStatus, StageEligibility, StageProvenance } from '../pipelineStatusResolver';

// ── Helpers ──

function makeStage(overrides: {
  stage_id?: string;
  status?: StageStatus;
  eligible?: boolean;
  isStale?: boolean;
  staleCode?: string;
  hasProvenance?: boolean;
  downstreamStages?: string[];
} = {}) {
  const {
    stage_id = 'hero_frames',
    status = 'ready_for_review',
    eligible = true,
    isStale = false,
    staleCode = undefined,
    hasProvenance = true,
    downstreamStages = [],
  } = overrides;

  return {
    stage_id,
    status,
    eligibility: { eligible, reason: eligible ? undefined : 'Requires source truth' } as StageEligibility,
    staleRisk: isStale
      ? {
          isStale: true,
          reasons: [
            {
              label: 'Test stale reason',
              detail: 'Source changed',
              severity: 'medium' as const,
              code: staleCode ?? 'CANON_NEWER_THAN_STAGE',
              sourceTimestamp: '2026-06-01T00:00:00Z',
              affectedDownstreamStages: downstreamStages,
            },
          ],
        }
      : undefined,
    provenance: hasProvenance
      ? { sourceType: 'project_images', sourceDetail: '5 approved', generatedAsset: 'hero_frame', functionName: 'generate-hero-frames' } as StageProvenance
      : undefined,
  };
}

// ── Tests ──

describe('computeRecommendedAction', () => {
  it('locked + stale → LOCKED_REVIEW_REQUIRED', () => {
    const stage = makeStage({ status: 'locked', isStale: true });
    const result = computeRecommendedAction(stage);
    expect(result.action).toBe('LOCKED_REVIEW_REQUIRED');
    expect(result.eligible).toBe(true);
    expect(result.isSafe).toBe(true);
  });

  it('locked (no stale) → REVIEW_ONLY (blocked by eligibility — no review needed)', () => {
    const stage = makeStage({ status: 'locked', isStale: false });
    const result = computeRecommendedAction(stage);
    expect(result.action).toBe('REVIEW_ONLY');
    // REVIEW_ONLY is properly blocked because stage is locked and not stale
    expect(result.eligible).toBe(false);
    expect(result.blockedReason).toContain('no review needed');
    expect(result.isSafe).toBe(true);
  });

  it('stale with CANON_NEWER_THAN_STAGE → REGENERATE_CANDIDATES', () => {
    const stage = makeStage({
      status: 'ready_for_review',
      isStale: true,
      staleCode: 'CANON_NEWER_THAN_STAGE',
    });
    const result = computeRecommendedAction(stage);
    expect(result.action).toBe('REGENERATE_CANDIDATES');
    expect(result.triggerCode).toBe('CANON_NEWER_THAN_STAGE');
  });

  it('stale with DOC_VERSION_CHANGED → REBUILD_STAGE', () => {
    const stage = makeStage({
      status: 'ready_for_review',
      isStale: true,
      staleCode: 'DOC_VERSION_CHANGED',
    });
    const result = computeRecommendedAction(stage);
    expect(result.action).toBe('REBUILD_STAGE');
    expect(result.triggerCode).toBe('DOC_VERSION_CHANGED');
  });

  it('stale with CAST_NEWER_THAN_HERO_FRAMES → REGENERATE_CANDIDATES', () => {
    const stage = makeStage({
      status: 'ready_for_review',
      isStale: true,
      staleCode: 'CAST_NEWER_THAN_HERO_FRAMES',
    });
    const result = computeRecommendedAction(stage);
    expect(result.action).toBe('REGENERATE_CANDIDATES');
  });

  it('stale with PD_NEWER_THAN_LOOKBOOK → REBUILD_STAGE', () => {
    const stage = makeStage({
      stage_id: 'lookbook',
      status: 'ready_for_review',
      isStale: true,
      staleCode: 'PD_NEWER_THAN_LOOKBOOK',
    });
    const result = computeRecommendedAction(stage);
    expect(result.action).toBe('REBUILD_STAGE');
  });

  it('stale with HERO_FRAMES_NEWER_THAN_POSTER → REGENERATE_CANDIDATES', () => {
    const stage = makeStage({
      stage_id: 'poster',
      status: 'ready_for_review',
      isStale: true,
      staleCode: 'HERO_FRAMES_NEWER_THAN_POSTER',
    });
    const result = computeRecommendedAction(stage);
    expect(result.action).toBe('REGENERATE_CANDIDATES');
  });

  it('stale with VISUAL_STYLE_OUTDATED → REFRESH_GOVERNANCE (safe)', () => {
    const stage = makeStage({
      status: 'ready_for_review',
      isStale: true,
      staleCode: 'VISUAL_STYLE_OUTDATED',
    });
    const result = computeRecommendedAction(stage);
    expect(result.action).toBe('REFRESH_GOVERNANCE');
    expect(result.isSafe).toBe(true);
  });

  it('stale with SOURCE_SNAPSHOT_CHANGED → REFRESH_GOVERNANCE (safe)', () => {
    const stage = makeStage({
      status: 'ready_for_review',
      isStale: true,
      staleCode: 'SOURCE_SNAPSHOT_CHANGED',
    });
    const result = computeRecommendedAction(stage);
    expect(result.action).toBe('REFRESH_GOVERNANCE');
    expect(result.isSafe).toBe(true);
  });

  it('eligible + no stale risk → REFRESH_GOVERNANCE', () => {
    const stage = makeStage({ status: 'ready_for_review', isStale: false });
    const result = computeRecommendedAction(stage);
    expect(result.action).toBe('REFRESH_GOVERNANCE');
    expect(result.isSafe).toBe(true);
  });

  it('not eligible + no stale risk → REVIEW_ONLY', () => {
    const stage = makeStage({ status: 'not_started', eligible: false, isStale: false });
    const result = computeRecommendedAction(stage);
    expect(result.action).toBe('REVIEW_ONLY');
  });

  it('passes through affected downstream stages', () => {
    const stage = makeStage({
      status: 'ready_for_review',
      isStale: true,
      staleCode: 'CAST_NEWER_THAN_HERO_FRAMES',
      downstreamStages: ['poster', 'visual_language'],
    });
    const result = computeRecommendedAction(stage);
    expect(result.affectedDownstreamStages).toContain('poster');
    expect(result.affectedDownstreamStages).toContain('visual_language');
  });

  it('stale stage maps trigger code correctly', () => {
    const stage = makeStage({
      status: 'in_progress',
      isStale: true,
      staleCode: 'HERO_FRAMES_NEWER_THAN_POSTER',
    });
    const result = computeRecommendedAction(stage);
    expect(result.triggerCode).toBe('HERO_FRAMES_NEWER_THAN_POSTER');
  });
});

// ── Eligibility Tests ──

describe('isActionEligible', () => {
  it('REFRESH_GOVERNANCE is always eligible', () => {
    const stage = makeStage({ status: 'locked', isStale: true });
    const result = isActionEligible('REFRESH_GOVERNANCE', stage);
    expect(result.eligible).toBe(true);
  });

  it('REVIEW_ONLY blocked for locked + not stale', () => {
    const stage = makeStage({ status: 'locked', isStale: false });
    const result = isActionEligible('REVIEW_ONLY', stage);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('no review needed');
  });

  it('REGENERATE_CANDIDATES blocked without provenance', () => {
    const stage = makeStage({
      status: 'ready_for_review',
      isStale: true,
      hasProvenance: false,
    });
    const result = isActionEligible('REGENERATE_CANDIDATES', stage);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Missing provenance');
  });

  it('REGENERATE_CANDIDATES blocked for locked stage', () => {
    const stage = makeStage({ status: 'locked', isStale: true });
    const result = isActionEligible('REGENERATE_CANDIDATES', stage);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('locked');
  });

  it('REGENERATE_CANDIDATES eligible for unlocked + has provenance', () => {
    const stage = makeStage({ status: 'ready_for_review', isStale: true });
    const result = isActionEligible('REGENERATE_CANDIDATES', stage);
    expect(result.eligible).toBe(true);
  });

  it('REBUILD_STAGE blocked for locked stage', () => {
    const stage = makeStage({ status: 'locked', isStale: true });
    const result = isActionEligible('REBUILD_STAGE', stage);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('locked');
  });

  it('REBUILD_STAGE eligible for unlocked + stale', () => {
    const stage = makeStage({ status: 'ready_for_review', isStale: true });
    const result = isActionEligible('REBUILD_STAGE', stage);
    expect(result.eligible).toBe(true);
  });

  it('LOCKED_REVIEW_REQUIRED blocked for not locked', () => {
    const stage = makeStage({ status: 'ready_for_review', isStale: true });
    const result = isActionEligible('LOCKED_REVIEW_REQUIRED', stage);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('not locked');
  });

  it('LOCKED_REVIEW_REQUIRED blocked for locked + not stale', () => {
    const stage = makeStage({ status: 'locked', isStale: false });
    const result = isActionEligible('LOCKED_REVIEW_REQUIRED', stage);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('No stale risk');
  });

  it('LOCKED_REVIEW_REQUIRED eligible for locked + stale', () => {
    const stage = makeStage({ status: 'locked', isStale: true });
    const result = isActionEligible('LOCKED_REVIEW_REQUIRED', stage);
    expect(result.eligible).toBe(true);
  });
});