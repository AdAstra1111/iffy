/**
 * stale-running-recovery — P0.1 Stale Running Atom Recovery
 *
 * Detects atoms stuck in generation_status = "running" for longer than
 * TTL_MINUTES and resets them to "failed".
 *
 * Called from handleStatus or handleGenerate in each atomiser.
 * Runs on every user action — no cron required.
 *
 * Policy: running > 15 minutes → failed
 * Why: preserves failure evidence, user can click Reset Failed,
 * avoids silent reprocessing loops.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const STALE_TTL_MINUTES = 15;

export interface StaleRecoveryResult {
  recovered: number;
  project_id: string;
  atom_type: string;
  atom_ids: string[];
}

/**
 * Recover stale running atoms for a specific atom type.
 * Queries atoms with generation_status = "running" and
 * updated_at older than TTL_MINUTES, resets them to "failed".
 */
export async function recoverStaleRunning(
  supabase: SupabaseClient,
  projectId: string,
  atomType: string,
  ttlMinutes: number = STALE_TTL_MINUTES,
): Promise<StaleRecoveryResult> {
  const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000).toISOString();

  const { data: staleAtoms, error: findError } = await supabase
    .from("atoms")
    .select("id, canonical_name, updated_at")
    .eq("project_id", projectId)
    .eq("atom_type", atomType)
    .eq("generation_status", "running")
    .lt("updated_at", cutoff);

  if (findError) {
    console.error(`[StaleRecovery] Find error: ${findError.message}`);
    return { recovered: 0, project_id: projectId, atom_type: atomType, atom_ids: [] };
  }

  if (!staleAtoms || staleAtoms.length === 0) {
    return { recovered: 0, project_id: projectId, atom_type: atomType, atom_ids: [] };
  }

  const atomIds = staleAtoms.map((a: any) => a.id);
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("atoms")
    .update({ generation_status: "failed", updated_at: now })
    .in("id", atomIds);

  if (updateError) {
    console.error(`[StaleRecovery] Update error: ${updateError.message}`);
    return { recovered: 0, project_id: projectId, atom_type: atomType, atom_ids: [] };
  }

  console.log(`[StaleRecovery] Recovered ${atomIds.length} stale ${atomType} atoms for project ${projectId}`);
  for (const a of staleAtoms) {
    console.log(`  [StaleRecovery]   ${a.canonical_name} — was running since ${a.updated_at}`);
  }

  return { recovered: atomIds.length, project_id: projectId, atom_type: atomType, atom_ids: atomIds };
}
