/**
 * MomentRewritePanel — Moment-by-moment rewrite panel for Story Outlines.
 *
 * Mirrors SceneRewritePanel but uses "Moment" terminology and routes to the
 * story_outline moment-rewrite backend path via useMomentRewritePipeline.
 *
 * The actual queue/processing/assemble pattern is identical to scene rewrite;
 * only the labels and backend routing differ.
 */

import React, { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Play, RotateCcw, Package, Square, AlertCircle, CheckCircle2, Clock, Sparkles, Eye, AlertTriangle, Bug } from 'lucide-react';
import { useMomentRewritePipeline } from '@/hooks/useMomentRewritePipeline';
import type { PreviewResult } from '@/hooks/useSceneRewritePipeline';
import { ProcessProgressBar } from './ProcessProgressBar';
import { ActivityTimeline } from './ActivityTimeline';

interface MomentRewritePanelProps {
  projectId: string;
  documentId: string;
  versionId: string;
  approvedNotes: any[];
  protectItems: string[];
  onComplete?: (newVersionId: string) => void;
  /** Pass the pipeline instance from the parent to share state */
  pipelineInstance?: ReturnType<typeof useMomentRewritePipeline>;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'done': return <Badge variant="default" className="bg-green-600 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Done</Badge>;
    case 'running': return <Badge variant="default" className="bg-blue-600 text-xs animate-pulse"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</Badge>;
    case 'failed': return <Badge variant="destructive" className="text-xs"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
    case 'queued': return <Badge variant="secondary" className="text-xs"><Clock className="h-3 w-3 mr-1" />Queued</Badge>;
    default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

export default function MomentRewritePanel({
  projectId, documentId, versionId, approvedNotes, protectItems, onComplete, pipelineInstance,
}: MomentRewritePanelProps) {
  const ownPipeline = useMomentRewritePipeline(projectId);
  const pipeline = pipelineInstance || ownPipeline;
  const [initialized, setInitialized] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const startGuardRef = useRef(false);
  const unitLabel = 'Moment';

  useEffect(() => {
    if (!initialized && versionId) {
      pipeline.loadStatus(versionId).then(() => setInitialized(true));
    }
  }, [versionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pipeline.mode === 'complete' && pipeline.newVersionId && onComplete) {
      onComplete(pipeline.newVersionId);
    }
  }, [pipeline.mode, pipeline.newVersionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = async () => {
    if (startGuardRef.current) return;
    startGuardRef.current = true;
    try {
      const targetMoments = pipeline.scopePlan?.target_scene_numbers;
      const result = await pipeline.enqueue(documentId, versionId, approvedNotes, protectItems, targetMoments);
      if (result) {
        pipeline.processAll(versionId);
      }
    } finally {
      startGuardRef.current = false;
    }
  };

  const handleResume = () => {
    if (startGuardRef.current) return;
    startGuardRef.current = true;
    try {
      pipeline.processAll(versionId);
    } finally {
      startGuardRef.current = false;
    }
  };

  const handleRetry = async () => {
    await pipeline.retryFailed(versionId);
    pipeline.processAll(versionId);
  };

  const handleAssemble = () => {
    pipeline.assemble(documentId, versionId, {
      rewriteModeSelected: 'auto',
      rewriteModeEffective: 'scene',
      rewriteModeReason: 'auto_probe_scene',
    });
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    const data = await pipeline.preview(versionId);
    setPreviewData(data);
    setPreviewOpen(true);
    setPreviewLoading(false);
  };

  const handleRequeueStuck = () => {
    pipeline.requeueStuck(versionId);
  };

  const handleVerify = async () => {
    await pipeline.verify(versionId);
  };

  const canStart = pipeline.mode === 'idle' && pipeline.total === 0;
  const canResume = (pipeline.mode === 'idle' || pipeline.mode === 'error') && pipeline.queued > 0;
  const canRetry = pipeline.failed > 0;
  const canAssemble = pipeline.done === pipeline.total && pipeline.total > 0 && !pipeline.newVersionId;
  const isWorking = pipeline.mode === 'processing' || pipeline.mode === 'enqueuing' || pipeline.mode === 'assembling';

  const stuckMinutes = 10;
  const isStuck = pipeline.running > 0 && pipeline.oldestRunningClaimedAt &&
    (Date.now() - new Date(pipeline.oldestRunningClaimedAt).getTime()) > stuckMinutes * 60_000;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Moment-by-Moment Rewrite</span>
          {pipeline.total > 0 && (
            <span className="text-xs text-muted-foreground">
              {pipeline.done}/{pipeline.total} {unitLabel.toLowerCase()}s
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {canResume && !isWorking && (
            <Button size="sm" variant="default" onClick={handleResume} disabled={isWorking} className="h-7 text-xs gap-1">
              <Play className="h-3 w-3" /> Resume
            </Button>
          )}
          {canStart && !canResume && (
            <Button size="sm" variant="default" onClick={handleStart} disabled={isWorking} className="h-7 text-xs gap-1">
              <Play className="h-3 w-3" /> Start
            </Button>
          )}
          {canRetry && !isWorking && (
            <Button size="sm" variant="outline" onClick={handleRetry} className="h-7 text-xs gap-1">
              <RotateCcw className="h-3 w-3" /> Retry Failed
            </Button>
          )}
          {pipeline.done > 0 && !isWorking && (
            <Button size="sm" variant="outline" onClick={handlePreview} disabled={previewLoading} className="h-7 text-xs gap-1">
              {previewLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />} Preview
            </Button>
          )}
          {canAssemble && !isWorking && (
            <>
              <Button size="sm" variant="outline" onClick={handleVerify} className="h-7 text-xs gap-1">
                <CheckCircle2 className="h-3 w-3" /> Verify
              </Button>
              <Button size="sm" variant="default" onClick={handleAssemble} className="h-7 text-xs gap-1">
                <Package className="h-3 w-3" /> Assemble
              </Button>
            </>
          )}
          {isWorking && (
            <Button size="sm" variant="ghost" onClick={pipeline.stop} className="h-7 text-xs gap-1">
              <Square className="h-3 w-3" /> Stop
            </Button>
          )}
          {pipeline.mode !== 'idle' && (
            <Button size="sm" variant="ghost" onClick={pipeline.reset} className="h-7 text-xs">
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {(isWorking || pipeline.mode === 'complete') && pipeline.total > 0 && (
        <ProcessProgressBar
          percent={pipeline.smoothedPercent}
          actualPercent={pipeline.progress.percent}
          phase={pipeline.progress.phase}
          label={pipeline.progress.label}
          etaMs={pipeline.etaMs}
          status={
            pipeline.mode === 'complete' ? 'success'
            : pipeline.mode === 'error' ? 'error'
            : pipeline.failed > 0 ? 'warn'
            : 'working'
          }
        />
      )}

      {pipeline.error && (
        <div className="text-xs text-destructive">{pipeline.error}</div>
      )}

      {/* Stuck jobs warning */}
      {isStuck && (
        <div className="text-xs p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-center justify-between">
          <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {pipeline.running} job(s) look stuck ({stuckMinutes}+ min).
          </span>
          <Button size="sm" variant="outline" onClick={handleRequeueStuck} className="h-6 text-[10px]">
            Requeue stuck
          </Button>
        </div>
      )}

      {pipeline.newVersionId && (
        <div className="text-xs space-y-1 p-2 rounded bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
          <div className="text-green-600 font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Rewrite complete — new version created
          </div>
          {pipeline.lastAssembledVersionNumber != null && (
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">v{pipeline.lastAssembledVersionNumber}</span>
              {pipeline.lastAssembledVersionLabel && (
                <span className="ml-1">— {pipeline.lastAssembledVersionLabel}</span>
              )}
            </div>
          )}
          {pipeline.lastAssembledChangeSummary && (
            <div className="text-muted-foreground">{pipeline.lastAssembledChangeSummary}</div>
          )}
          {pipeline.lastAssembledSelective != null && (
            <div className="text-muted-foreground">
              {pipeline.lastAssembledSelective
                ? `Selective: ${pipeline.lastAssembledTargetCount}/${pipeline.totalScenesInScript || '?'} ${unitLabel.toLowerCase()}s`
                : `Full rewrite: ${pipeline.done} ${unitLabel.toLowerCase()}s`}
            </div>
          )}
        </div>
      )}

      {/* Moment list */}
      {pipeline.scenes.length > 0 && (
        <div className="max-h-[400px] overflow-y-auto rounded">
          <div className="space-y-1">
            {pipeline.scenes.map((scene) => {
              const metrics = pipeline.sceneMetrics[scene.scene_number];
              return (
                <div key={scene.scene_number} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-muted/50">
                  <span className="truncate flex-1 mr-2">
                    <span className="text-muted-foreground mr-1">#{scene.scene_number}</span>
                    {scene.scene_heading || `${unitLabel} ${scene.scene_number}`}
                  </span>
                  {metrics && scene.status === 'done' && (
                    <span className="text-muted-foreground mr-2 shrink-0 tabular-nums">
                      {metrics.skipped ? 'skip' : (
                        <>
                          {metrics.duration_ms ? `${(metrics.duration_ms / 1000).toFixed(1)}s` : ''}
                          {metrics.delta_pct != null && (
                            <span className={metrics.delta_pct > 15 ? 'text-amber-500 ml-1' : metrics.delta_pct < -15 ? 'text-blue-500 ml-1' : 'ml-1'}>
                              {metrics.delta_pct > 0 ? '+' : ''}{metrics.delta_pct}%
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  )}
                  <StatusBadge status={scene.status} />
                  {scene.error && (
                    <span className="text-destructive ml-2 truncate max-w-32" title={scene.error}>
                      {scene.error}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary stats */}
      {pipeline.total > 0 && (
        <div className="flex gap-3 text-xs text-muted-foreground">
          {pipeline.queued > 0 && <span>Queued: {pipeline.queued}</span>}
          {pipeline.running > 0 && <span className="text-blue-500">Running: {pipeline.running}</span>}
          {pipeline.done > 0 && <span className="text-green-500">Done: {pipeline.done}</span>}
          {pipeline.failed > 0 && <span className="text-destructive">Failed: {pipeline.failed}</span>}
        </div>
      )}

      {/* Activity timeline */}
      {pipeline.activityItems.length > 0 && (
        <ActivityTimeline items={pipeline.activityItems} onClear={pipeline.clearActivity} />
      )}

      {/* Debug panel */}
      {import.meta.env.DEV && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
            <Bug className="h-3 w-3" /> Debug tools
          </summary>
          <div className="mt-1 space-y-1 pl-4">
            <Button size="sm" variant="outline" className="h-6 text-[10px]"
              onClick={() => console.log('[debug] State:', JSON.stringify({
                mode: pipeline.mode, total: pipeline.total, done: pipeline.done, failed: pipeline.failed,
              }, null, 2))}>
              Log state
            </Button>
          </div>
        </details>
      )}

      {/* Preview modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Rewrite Preview
              {previewData && (
                <span className="font-normal text-muted-foreground ml-2">
                  {previewData.scenes_count} {unitLabel.toLowerCase()}s • {previewData.total_chars.toLocaleString()} chars
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {previewData?.missing_scenes && previewData.missing_scenes.length > 0 && (
            <div className="text-xs text-amber-600 flex items-center gap-1 p-2 rounded bg-amber-50 dark:bg-amber-950/30">
              <AlertTriangle className="h-3 w-3" />
              Missing {unitLabel.toLowerCase()}s: {previewData.missing_scenes.join(', ')}
            </div>
          )}
          <ScrollArea className="flex-1 min-h-0">
            <pre className="text-xs whitespace-pre-wrap font-mono p-3 bg-muted/30 rounded">
              {previewData?.preview_text || 'No preview available.'}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
