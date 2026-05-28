/**
 * VisualExecutionHistoryPanel — Execution history timeline for visual repair intents.
 *
 * Shows append-only execution provenance with asset lineage and rollback visibility.
 * No rollback execution — only display.
 */
import { useVisualExecutionProvenance } from '@/hooks/useVisualExecutionProvenance';
import {
  groupExecutionsByStage,
  getRollbackCandidate,
  getAssetLineage,
  type ExecutionProvenanceRow,
} from '@/lib/visual/visualExecutionProvenanceTypes';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X, Clock, Layers, ArrowRight, AlertCircle, MessageSquare } from 'lucide-react';
import { VisualExecutionReviewPanel } from './VisualExecutionReviewPanel';
import { VisualSkeleton } from './VisualSkeleton';
import { VisualEmptyState } from './VisualEmptyState';
import { VisualPanelErrorBoundary } from './VisualPanelErrorBoundary';

interface Props {
  projectId: string;
  stageId?: string;
}

function ExecutionRow({ row }: { row: ExecutionProvenanceRow }) {
  const isCompleted = row.execution_state === 'completed';
  const isSuperseded = row.is_superseded;
  const summary = typeof row.result_summary === 'object' && row.result_summary
    ? row.result_summary as Record<string, any>
    : null;

  return (
    <div className={`rounded border p-2.5 space-y-1 ${
      isSuperseded ? 'border-border/20 bg-muted/10 opacity-60' :
      isCompleted ? 'border-green-500/20 bg-green-500/[0.02]' :
      'border-red-500/20 bg-red-500/[0.02]'
    }`}>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono text-muted-foreground shrink-0 w-5">
          #{row.execution_number}
        </span>
        <span className="text-[9px] font-medium text-foreground/80">{row.recommended_action}</span>
        {isCompleted ? (
          <span className="inline-flex items-center gap-0.5 text-[8px] text-green-600 bg-green-500/10 px-1 py-0.5 rounded">
            <Check className="h-2 w-2" />
            done
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 text-[8px] text-red-600 bg-red-500/10 px-1 py-0.5 rounded">
            <X className="h-2 w-2" />
            failed
          </span>
        )}
        {isSuperseded && (
          <Badge variant="outline" className="text-[7px] h-3.5 px-1 text-muted-foreground/50 border-dashed">
            superseded
          </Badge>
        )}
        <span className="text-[8px] text-muted-foreground/50 ml-auto">
          {new Date(row.executed_at).toLocaleDateString()}
        </span>
      </div>

      {/* Execution detail */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[8px] text-muted-foreground/60">
        {summary?.stages_count !== undefined && (
          <span>Governance: {summary.stages_count} stages</span>
        )}
        {summary?.candidate_count !== undefined && (
          <span>Poster: {summary.candidate_count} candidates</span>
        )}
        {summary?.poster_candidate_ids?.length > 0 && (
          <span title={summary.poster_candidate_ids.join(', ')}>
            IDs: {summary.poster_candidate_ids.length}
          </span>
        )}
        {row.governance_snapshot_hash && (
          <span className="font-mono" title={`Hash: ${row.governance_snapshot_hash.slice(0, 16)}...`}>
            gov: {row.governance_snapshot_hash.slice(0, 8)}…
          </span>
        )}
      </div>

      {/* Asset lineage */}
      {row.generated_asset_ids && row.generated_asset_ids.length > 0 && (
        <div className="flex items-center gap-1 text-[7px] text-muted-foreground/50">
          <span>Assets:</span>
          {row.generated_asset_ids.map(id => (
            <span key={id} className="font-mono bg-muted/20 px-1 rounded">{id.slice(0, 8)}…</span>
          ))}
        </div>
      )}

      {/* Previous assets (shown if superseded this execution has a predecessor) */}
      {row.previous_asset_ids && row.previous_asset_ids.length > 0 && (
        <div className="flex items-center gap-1 text-[7px] text-amber-600/50">
          <ArrowRight className="h-2 w-2" />
          <span>Superseded {row.previous_asset_ids.length} previous assets</span>
        </div>
      )}

      {/* Error */}
      {row.error_message && (
        <div className="flex items-center gap-1 text-[7px] text-red-600/60">
          <AlertCircle className="h-2 w-2" />
          <span className="truncate max-w-[300px]">{row.error_message.slice(0, 120)}</span>
        </div>
      )}

      {/* Review panel — only for completed/partial executions */}
      {['completed', 'partial'].includes(row.execution_state) && (
        <div className="mt-1.5">
          <VisualExecutionReviewPanel
            execution={row}
            onReviewComplete={() => {}}
          />
        </div>
      )}
    </div>
  );
}

function StageTimelineGroup({
  group,
}: {
  group: ReturnType<typeof groupExecutionsByStage>[number];
}) {
  const rollback = getRollbackCandidate(
    group.executions,
    group.stage_id,
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[8px] h-4 px-1.5">
          {group.stage_id}
        </Badge>
        <span className="text-[8px] text-muted-foreground/60">
          {group.totalCount} execution{group.totalCount !== 1 ? 's' : ''}
        </span>
        {rollback && (
          <Badge variant="outline" className="text-[7px] h-3.5 px-1 text-amber-600/60 border-amber-500/20">
            rollback available
          </Badge>
        )}
        {group.latestCompleted && !group.latestCompleted.is_superseded && (
          <Badge variant="outline" className="text-[7px] h-3.5 px-1 text-green-600/60 border-green-500/20">
            active
          </Badge>
        )}
      </div>

      {/* Execution list */}
      <div className="space-y-1">
        {group.executions.slice(0, 5).map(row => (
          <ExecutionRow key={row.id} row={row} />
        ))}
        {group.executions.length > 5 && (
          <p className="text-[7px] text-muted-foreground/40 text-center pt-0.5">
            +{group.executions.length - 5} more executions
          </p>
        )}
      </div>

      {/* Rollback candidate (display only) */}
      {rollback && (
        <div className="text-[7px] text-amber-600/50 flex items-center gap-1 pt-0.5">
          <Clock className="h-2 w-2" />
          <span>
            Rollback target: execution #{rollback.execution_number} —
            {rollback.generated_asset_ids?.length ?? 0} assets
          </span>
        </div>
      )}
    </div>
  );
}

export function VisualExecutionHistoryPanel({ projectId, stageId }: Props) {
  const { rows, loading, error } = useVisualExecutionProvenance({
    projectId,
    enabled: true,
  });

  if (loading && rows.length === 0) {
    return <VisualSkeleton variant="list" />;
  }

  if (error && rows.length === 0) {
    return (
      <VisualEmptyState
        title="Execution history unavailable"
        compact
        icon={<AlertCircle className="h-3 w-3" />}
      />
    );
  }

  if (rows.length === 0) {
    return null; // No executions yet — don't show the panel
  }

  // Filter by stage if stageId provided
  const filtered = stageId ? rows.filter(r => r.stage_id === stageId) : rows;
  if (filtered.length === 0) return null;

  const groups = groupExecutionsByStage(filtered);
  const filteredGroups = stageId ? groups.filter(g => g.stage_id === stageId) : groups;

  return (
    <VisualPanelErrorBoundary panelLabel="VisualExecutionHistoryPanel">
      <div className="border-t border-border/30 mt-4">
      <div className="p-4 md:p-6 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-primary/70" />
          <span className="text-[10px] font-medium text-foreground/80">
            Execution History
          </span>
          <Badge variant="outline" className="text-[8px] h-4 px-1.5 ml-auto">
            {filtered.length} execution{filtered.length !== 1 ? 's' : ''}
          </Badge>
        </div>

        {/* Timeline groups */}
        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
          {filteredGroups.map(group => (
            <StageTimelineGroup key={group.stage_id} group={group} />
          ))}
        </div>
      </div>
    </VisualPanelErrorBoundary>
  );
}