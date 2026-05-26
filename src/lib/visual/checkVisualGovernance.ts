/**
 * checkVisualGovernance — lightweight governance gate check for frontend generator call sites.
 *
 * Calls the evaluate-visual-governance edge function and checks whether a specific stage
 * is blocked from proceeding (i.e., has blocker codes). Fail-open on errors: if the
 * governance check itself fails, we allow generation to proceed with a console.warn.
 *
 * Usage:
 *   const { blocked, blockers, computed_status } = await checkVisualGovernance(projectId, 'hero_frames');
 *   if (blocked) { /* show blockers, skip generation *\/ }
 */

import { supabase } from '@/integrations/supabase/client';

export interface GovernanceCheckResult {
  /** True when the stage has active blocker codes that prevent generation. */
  blocked: boolean;
  /** Human-readable blocker descriptions, empty if not blocked. */
  blockers: string[];
  /** The stage's computed_status from governance, or null if unavailable. */
  computed_status: string | null;
}

/**
 * Evaluate visual governance for a specific stage and return whether generation
 * is blocked. Fail-open: returns { blocked: false } on any error so the user
 * is not blocked by a transient infrastructure issue.
 */
export async function checkVisualGovernance(
  projectId: string,
  stageId: string,
): Promise<GovernanceCheckResult> {
  try {
    const { data, error } = await supabase.functions.invoke(
      'evaluate-visual-governance',
      { body: { projectId, stageId } },
    );

    if (error) {
      console.warn(
        `[checkVisualGovernance] Edge function error for stage "${stageId}":`,
        error.message,
      );
      return { blocked: false, blockers: [], computed_status: null };
    }

    // The function returns { stages: StageGovernance[] } with each stage
    // containing stage_id, computed_status, blocker_codes, etc.
    const stages: Array<{
      stage_id: string;
      computed_status: string;
      blocker_codes: string[] | null;
    }> = data?.stages ?? [];

    const stage = stages.find((s) => s.stage_id === stageId);

    if (!stage) {
      // Stage not found in governance response — allow generation
      return { blocked: false, blockers: [], computed_status: null };
    }

    const blockers = stage.blocker_codes ?? [];
    return {
      blocked: blockers.length > 0,
      blockers,
      computed_status: stage.computed_status ?? null,
    };
  } catch (err: any) {
    console.warn(
      `[checkVisualGovernance] Error checking governance for stage "${stageId}":`,
      err?.message ?? String(err),
    );
    // Fail-open: allow generation on infrastructure errors
    return { blocked: false, blockers: [], computed_status: null };
  }
}