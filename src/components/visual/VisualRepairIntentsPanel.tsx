import { useState, useCallback } from 'react';
import { useVisualRepairIntents, type VisualRepairIntent } from '@/hooks/useVisualRepairIntents';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Check, X, Loader2, Shield, Clock, Plus, Eye, FileText, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ── Props ──

export interface VisualRepairIntentsPanelProps {
  projectId: string;
  stageId?: string;
  selectedStageState?: {
    stage?: string;
    status?: string;
    label?: string;
    staleRisk?: {
      isStale: boolean;
      reasons: Array<{
        label: string;
        detail: string;
        severity: 'low' | 'medium' | 'high';
        code?: string;
        affectedDownstreamStages?: string[];
      }>;
    };
    provenance?: {
      sourceType: string;
      sourceDetail?: string;
      generatedAsset?: string;
      functionName?: string;
    };
    eligibility?: {
      eligible: boolean;
      reason?: string;
    };
  };
}

// ── Status badge helpers ──

function approvalStateBadge(state: VisualRepairIntent['approval_state']) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
    pending: { label: 'Pending', variant: 'outline', className: 'text-amber-600 border-amber-500/30 bg-amber-500/5' },
    approved: { label: 'Approved', variant: 'default', className: 'bg-green-600 text-white' },
    rejected: { label: 'Rejected', variant: 'destructive' },
    cancelled: { label: 'Cancelled', variant: 'secondary' },
  };
  const m = map[state];
  return <Badge variant={m.variant} className={`${m.className ?? ''} text-[10px]`}>{m.label}</Badge>;
}

function executionStateBadge(state: VisualRepairIntent['execution_state']) {
  const map: Record<string, { label: string; icon: typeof Clock; className: string }> = {
    queued: { label: 'Queued', icon: Clock, className: 'text-sky-600 bg-sky-500/10 border-sky-500/20' },
    ready: { label: 'Ready', icon: Shield, className: 'text-blue-600 bg-blue-500/10 border-blue-500/20' },
    blocked: { label: 'Blocked', icon: AlertCircle, className: 'text-red-600 bg-red-500/10 border-red-500/20' },
    completed: { label: 'Completed', icon: Check, className: 'text-green-600 bg-green-500/10 border-green-500/20' },
    failed: { label: 'Failed', icon: X, className: 'text-destructive bg-destructive/10 border-destructive/20' },
  };
  const m = map[state] ?? { label: state, icon: Clock, className: 'text-muted-foreground bg-muted/20 border-border/30' };
  return (
    <Badge variant="outline" className={`text-[9px] gap-1 ${m.className}`}>
      <m.icon className="h-2.5 w-2.5" />
      {m.label}
    </Badge>
  );
}

// ── Component ──

export function VisualRepairIntentsPanel({
  projectId,
  stageId,
  selectedStageState,
}: VisualRepairIntentsPanelProps) {
  const {
    intents,
    intentsByStage,
    loading,
    error,
    createIntent,
    approveIntent,
    rejectIntent,
    cancelIntent, executeIntent,
    refresh,
  } = useVisualRepairIntents({ projectId, enabled: true });

  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // If stageId is provided, filter to that stage's intents; otherwise show all
  const stageIntents = stageId ? (intentsByStage.get(stageId) ?? []) : intents;

  // ── Create intent handler ──
  const handleCreateIntent = useCallback(async () => {
    if (!selectedStageState?.staleRisk?.isStale) return;
    if (!selectedStageState?.stage) return;

    setCreating(true);
    try {
      // Get current user
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        toast.error('You must be logged in to create a repair intent');
        return;
      }

      // Build stale reason codes from the stale risk reasons
      const staleReasonCodes: string[] = [];
      const downstreamStages: string[] = [];
      for (const r of selectedStageState.staleRisk.reasons) {
        if (r.code) staleReasonCodes.push(r.code);
        if (r.affectedDownstreamStages) {
          downstreamStages.push(...r.affectedDownstreamStages.filter(Boolean));
        }
      }

      // Build provenance snapshot from stage state
      const provenanceSnapshot = selectedStageState.provenance
        ? {
            sourceType: selectedStageState.provenance.sourceType,
            sourceDetail: selectedStageState.provenance.sourceDetail,
            generatedAsset: selectedStageState.provenance.generatedAsset,
            functionName: selectedStageState.provenance.functionName,
          }
        : null;

      const stageName = selectedStageState.label ?? selectedStageState.stage;

      await createIntent({
        stageId: selectedStageState.stage,
        staleReasonCodes: staleReasonCodes.length > 0 ? staleReasonCodes : ['STALE_RISK_DETECTED'],
        recommendedAction: 'REBUILD_STAGE',
        intentLabel: `Repair ${stageName}`,
        intentDetail: `Stale risk detected for ${stageName}. Reasons: ${selectedStageState.staleRisk.reasons.map(r => r.detail).join('; ')}`,
        provenanceSnapshot,
        downstreamStages: downstreamStages.length > 0 ? [...new Set(downstreamStages)] : undefined,
        createdBy: userId,
      });

      toast.success(`Repair intent created for ${stageName}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create repair intent');
    } finally {
      setCreating(false);
    }
  }, [selectedStageState, createIntent]);

  // ── Action handlers ──
  const handleApprove = useCallback(async (intentId: string) => {
    setActionLoading(intentId);
    try {
      await approveIntent(intentId);
      toast.success('Repair intent approved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve');
    } finally {
      setActionLoading(null);
    }
  }, [approveIntent]);

  const handleReject = useCallback(async (intentId: string) => {
    setActionLoading(intentId);
    try {
      await rejectIntent(intentId, 'Rejected by user');
      toast.success('Repair intent rejected');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject');
    } finally {
      setActionLoading(null);
    }
  }, [rejectIntent]);

  const handleCancel = useCallback(async (intentId: string) => {
    setActionLoading(intentId);
    try {
      await cancelIntent(intentId);
      toast.success('Repair intent cancelled');
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel');
    } finally {
      setActionLoading(null);
    }
  }, [cancelIntent]);

  const handleExecute = useCallback(async (intentId: string, recommendedAction: string) => {
    setActionLoading(intentId);
    try {
      const result = await executeIntent(intentId);
      if (result.success) {
        toast.success(`Intent executed: ${recommendedAction}`);
      } else {
        if (result.error?.includes('EXECUTOR_NOT_ENABLED')) {
          toast.error(`Action ${recommendedAction} is not yet enabled for execution`);
        } else {
          toast.error(result.error || 'Execution failed');
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Execution failed');
    } finally {
      setActionLoading(null);
    }
  }, [executeIntent]);

  const showCreateButton = selectedStageState?.staleRisk?.isStale;

  return (
    <div className="border-t border-border/30 mt-4">
      <div className="p-4 md:p-6 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-foreground/80">Repair Intents</h3>
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
              {stageIntents.length}
            </Badge>
          </div>
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          {error && (
            <span className="text-[9px] text-destructive flex items-center gap-1">
              <AlertCircle className="h-2.5 w-2.5" /> {error}
            </span>
          )}
        </div>

        {/* Intent list */}
        {stageIntents.length === 0 && !loading && (
          <p className="text-[10px] text-muted-foreground/60 italic">
            No repair intents yet.
          </p>
        )}

        <div className="space-y-2">
          {stageIntents.map((intent) => (
            <div
              key={intent.id}
              className="rounded-lg border border-border/40 bg-card/30 p-3 space-y-2"
            >
              {/* Top row: stage badge + approval state + execution state */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[9px] font-mono">
                  {intent.stage_id}
                </Badge>
                {approvalStateBadge(intent.approval_state)}
                {executionStateBadge(intent.execution_state)}
                <span className="text-[8px] text-muted-foreground/50 ml-auto">
                  {new Date(intent.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {/* Recommended action tag */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-medium text-foreground/60">Action:</span>
                <span className="text-[9px] font-mono text-blue-600 bg-blue-500/10 px-1.5 py-0.5 rounded">
                  {intent.recommended_action}
                </span>
              </div>

              {/* Intent label/detail */}
              {intent.intent_label && (
                <p className="text-[10px] font-medium text-foreground/80">{intent.intent_label}</p>
              )}
              {intent.intent_detail && (
                <p className="text-[9px] text-muted-foreground/70 leading-relaxed">{intent.intent_detail}</p>
              )}

              {/* Stale reason codes */}
              {intent.stale_reason_codes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {intent.stale_reason_codes.map((code) => (
                    <span
                      key={code}
                      className="text-[8px] font-mono text-amber-600 bg-amber-500/10 px-1 py-0.5 rounded"
                    >
                      {code}
                    </span>
                  ))}
                </div>
              )}

              {/* Downstream stages */}
              {intent.downstream_stages && intent.downstream_stages.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] text-muted-foreground/60">Downstream:</span>
                  <div className="flex gap-1">
                    {intent.downstream_stages.map((ds) => (
                      <Badge key={ds} variant="outline" className="text-[8px] h-4 px-1">
                        {ds}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Provenance snapshot */}
              {intent.provenance_snapshot && (
                <div className="flex items-center gap-1.5 text-[8px] text-muted-foreground/60">
                  <FileText className="h-2.5 w-2.5" />
                  <span>{intent.provenance_snapshot.sourceType}</span>
                  {intent.provenance_snapshot.sourceDetail && (
                    <span>· {intent.provenance_snapshot.sourceDetail}</span>
                  )}
                  {intent.provenance_snapshot.functionName && (
                    <span>· {intent.provenance_snapshot.functionName}</span>
                  )}
                </div>
              )}

              {/* Rejection reason */}
              {intent.rejection_reason && (
                <p className="text-[9px] text-destructive/70 flex items-center gap-1">
                  <X className="h-2.5 w-2.5" /> {intent.rejection_reason}
                </p>
              )}
              
              {/* Execution result */}
              {intent.execution_result_json && (
                <div className="flex items-center gap-1.5 text-[8px] text-muted-foreground/70">
                  {intent.execution_state === 'completed' ? (
                    <Check className="h-2.5 w-2.5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-2.5 w-2.5 text-red-500" />
                  )}
                  <span>{intent.execution_state === 'completed' ? 'Executed' : 'Failed'}</span>
                  {intent.execution_result_json.evaluated_at && (
                    <>
                      <span>·</span>
                      <span>{new Date(intent.execution_result_json.evaluated_at).toLocaleString()}</span>
                    </>
                  )}
                  {intent.execution_result_json.stages_count !== undefined && (
                    <>
                      <span>·</span>
                      <span>{intent.execution_result_json.stages_count} stages</span>
                    </>
                  )}
                  {intent.execution_result_json.error && (
                    <span className="text-destructive/70">· error: {intent.execution_result_json.error}</span>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-1.5 pt-1">
                {intent.approval_state === 'pending' && (
                  <>
                    <Button
                      variant="default"
                      size="sm"
                      className="h-6 text-[10px] gap-1 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleApprove(intent.id)}
                      disabled={actionLoading === intent.id}
                    >
                      {actionLoading === intent.id ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <Check className="h-2.5 w-2.5" />
                      )}
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-6 text-[10px] gap-1"
                      onClick={() => handleReject(intent.id)}
                      disabled={actionLoading === intent.id}
                    >
                      <X className="h-2.5 w-2.5" />
                      Reject
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] gap-1 text-muted-foreground"
                      onClick={() => handleCancel(intent.id)}
                      disabled={actionLoading === intent.id}
                    >
                      Cancel
                    </Button>
                  </>
                )}
                {/* Execute button — only for approved + queued/ready intents */}
                {intent.approval_state === 'approved' && (intent.execution_state === 'queued' || intent.execution_state === 'ready') && (
                  intent.recommended_action === 'REFRESH_GOVERNANCE' ? (
                    <Button
                      variant="default"
                      size="sm"
                      className="h-6 text-[10px] gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => handleExecute(intent.id, intent.recommended_action)}
                      disabled={actionLoading === intent.id}
                      title="Execute is safe — re-evaluates governance state only"
                    >
                      {actionLoading === intent.id ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <Play className="h-2.5 w-2.5" />
                      )}
                      Execute
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] gap-1 text-muted-foreground/40 cursor-not-allowed border-dashed"
                      disabled
                      title={`EXECUTOR_NOT_ENABLED — ${intent.recommended_action} execution is not yet implemented`}
                    >
                      <Shield className="h-2.5 w-2.5 text-muted-foreground/30" />
                      Execute (disabled)
                    </Button>
                  )
                )}
                {(intent.approval_state === 'approved' || intent.approval_state === 'pending') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] gap-1 text-muted-foreground ml-auto"
                    onClick={() => handleCancel(intent.id)}
                    disabled={actionLoading === intent.id}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Create Repair Intent button */}
        {showCreateButton && (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-[10px] gap-1.5 border-dashed border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/5"
            onClick={handleCreateIntent}
            disabled={creating}
          >
            {creating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Create Repair Intent for {selectedStageState.label ?? selectedStageState.stage}
          </Button>
        )}
      </div>
    </div>
  );
}

export default VisualRepairIntentsPanel;