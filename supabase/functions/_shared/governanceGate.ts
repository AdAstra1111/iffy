/**
 * governanceGate.ts — Shared visual governance gate.
 *
 * Read governor-blocks from project_visual_stage_governance and return
 * whether the caller is permitted to generate for the given stage.
 *
 * NOT a middleware — a query + decision function called by each
 * generation function at its own insertion point.
 *
 * DESIGN RATIONALE:
 * - Fail-open for MISSING snapshots (older projects may not have them yet)
 * - Fail-closed for GOVERNANCE-BLOCKED stages (returns blocker_codes)
 * - Source tracking so callers can log / return "missing_snapshot" metadata
 * - No state mutations — pure read + compute
 */

export interface GovernanceGateResult {
  /** true when the stage snapshot says blocked */
  blocked: boolean;
  /** Blocker reason codes from the governance snapshot */
  blockers: string[];
  /** The computed_status from governance (if snapshot existed) */
  computed_status?: string;
  /** Where this result came from */
  source: "project_visual_stage_governance" | "missing_snapshot";
}

/**
 * Read visual governance for a single stage.
 *
 * @param supabase — authenticated supabase client (service_role)
 * @param projectId — project UUID
 * @param stageId — stage identifier matching pipelineStatusResolver
 * @returns GovernanceGateResult
 */
export async function readVisualGovernanceGate(
  supabase: any,
  projectId: string,
  stageId: string,
): Promise<GovernanceGateResult> {
  const { data, error } = await supabase
    .from("project_visual_stage_governance")
    .select("computed_status, blocker_codes")
    .eq("project_id", projectId)
    .eq("stage_id", stageId)
    .maybeSingle();

  // Missing row — fail open (older projects may lack snapshots)
  if (error || !data) {
    return {
      blocked: false,
      blockers: [],
      source: "missing_snapshot",
    };
  }

  // Stage is blocked by governance — fail closed
  if (data.computed_status === "blocked") {
    return {
      blocked: true,
      blockers: data.blocker_codes ?? [],
      computed_status: data.computed_status,
      source: "project_visual_stage_governance",
    };
  }

  // Stage is not blocked — allow
  return {
    blocked: false,
    blockers: [],
    computed_status: data.computed_status,
    source: "project_visual_stage_governance",
  };
}
