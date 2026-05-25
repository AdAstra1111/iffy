/**
 * Visual Execution Provenance Types
 * 
 * Mirrors project_visual_execution_provenance table row for frontend consumption.
 * Append-only execution history with asset lineage and rollback metadata.
 */

/** A single execution provenance row. */
export interface ExecutionProvenanceRow {
  id: string;
  project_id: string;
  repair_intent_id: string;
  execution_number: number;
  stage_id: string;
  recommended_action: string;
  execution_state: string;
  governance_snapshot_hash: string | null;
  stale_reason_snapshot: string[] | null;
  generation_input_hash: string | null;
  generated_asset_ids: string[] | null;
  previous_asset_ids: string[] | null;
  previous_execution_id: string | null;
  is_superseded: boolean;
  superseded_at: string | null;
  result_summary: {
    stages_count?: number;
    evaluated_at?: string;
    candidate_count?: number;
    poster_candidate_ids?: string[];
  } | string | null;
  error_message: string | null;
  executed_at: string;
  created_at: string;
}

/** Group executions by stage for timeline display. */
export interface ExecutionTimelineGroup {
  stage_id: string;
  executions: ExecutionProvenanceRow[];
  latestCompleted: ExecutionProvenanceRow | null;
  totalCount: number;
}

/**
 * Group provenance rows by stage, ordered by execution_number.
 */
export function groupExecutionsByStage(
  rows: ExecutionProvenanceRow[],
): ExecutionTimelineGroup[] {
  const groups = new Map<string, ExecutionProvenanceRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.stage_id) ?? [];
    existing.push(row);
    groups.set(row.stage_id, existing);
  }

  const result: ExecutionTimelineGroup[] = [];
  for (const [stage_id, executions] of groups) {
    const sorted = executions.sort((a, b) => b.execution_number - a.execution_number);
    const latestCompleted = sorted.find(e => e.execution_state === 'completed') ?? null;
    result.push({
      stage_id,
      executions: sorted,
      latestCompleted,
      totalCount: sorted.length,
    });
  }

  return result.sort((a, b) => b.totalCount - a.totalCount);
}

/**
 * Get the rollback candidate for a stage (the previous non-superseded execution).
 */
export function getRollbackCandidate(
  rows: ExecutionProvenanceRow[],
  stageId: string,
): ExecutionProvenanceRow | null {
  const stageRows = rows
    .filter(r => r.stage_id === stageId && r.execution_state === 'completed')
    .sort((a, b) => b.execution_number - a.execution_number);

  // Find the latest non-superseded execution
  const latestActive = stageRows.find(r => !r.is_superseded);
  if (!latestActive) return null;

  // Find its predecessor
  if (!latestActive.previous_execution_id) return null;
  return stageRows.find(r => r.id === latestActive.previous_execution_id) ?? null;
}

/**
 * Get all asset IDs produced by a stage's execution chain (ordered by recency).
 */
export function getAssetLineage(
  rows: ExecutionProvenanceRow[],
  stageId: string,
): { executionNumber: number; assetIds: string[]; isSuperseded: boolean }[] {
  return rows
    .filter(r => r.stage_id === stageId && r.generated_asset_ids && r.generated_asset_ids.length > 0)
    .sort((a, b) => b.execution_number - a.execution_number)
    .map(r => ({
      executionNumber: r.execution_number,
      assetIds: r.generated_asset_ids!,
      isSuperseded: r.is_superseded,
    }));
}