/**
 * costumeEpochResolver — Canonical current-epoch resolver for Costume-on-Actor.
 *
 * Source of truth: MAX(generation_epoch) among non-archived costume visual_sets for a project.
 * Fail-closed: returns epoch 1 if no sets exist (safe default for first-generation).
 */

import { supabase } from '@/integrations/supabase/client';

const COSTUME_DOMAIN = 'character_costume_look';

export interface EpochInfo {
  currentEpoch: number;
  /** Whether any costume sets exist for this project */
  hasCostumeSets: boolean;
}

/**
 * Resolve the current costume generation epoch for a project.
 * Returns the max generation_epoch among active (non-archived) costume visual sets.
 * If no active sets exist, falls back to max epoch across all sets (including archived),
 * then defaults to 1 if truly empty.
 */
export async function resolveCurrentCostumeEpoch(projectId: string): Promise<EpochInfo> {
  // Try active sets first
  const { data: activeMax } = await (supabase as any)
    .from('visual_sets')
    .select('generation_epoch')
    .eq('project_id', projectId)
    .eq('domain', COSTUME_DOMAIN)
    .neq('status', 'archived')
    .order('generation_epoch', { ascending: false })
    .limit(1);

  if (activeMax?.[0]?.generation_epoch != null) {
    return {
      currentEpoch: activeMax[0].generation_epoch,
      hasCostumeSets: true,
    };
  }

  // No active sets — check archived to get latest epoch (post-reset, pre-new-generation)
  const { data: archivedMax } = await (supabase as any)
    .from('visual_sets')
    .select('generation_epoch')
    .eq('project_id', projectId)
    .eq('domain', COSTUME_DOMAIN)
    .order('generation_epoch', { ascending: false })
    .limit(1);

  if (archivedMax?.[0]?.generation_epoch != null) {
    // After reset, the new epoch is max + 1
    return {
      currentEpoch: archivedMax[0].generation_epoch + 1,
      hasCostumeSets: true,
    };
  }

  // No costume sets at all — first generation
  return { currentEpoch: 1, hasCostumeSets: false };
}

/**
 * React Query key for the epoch resolver.
 */
export function costumeEpochQueryKey(projectId: string | undefined) {
  return ['costume-epoch', projectId] as const;
}
