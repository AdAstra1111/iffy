/**
 * SceneIndexedProgress — Scene-batch progress view for scene_indexed generation.
 * Shows per-scene-batch status from project_document_chunks, polls every 6s while generating.
 * Used for production_draft and feature_script when generated via scene_indexed strategy.
 * Displays formatted screenplay content in expandable cards.
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';

interface ChunkRow {
  id: string;
  chunk_index: number;
  chunk_key: string;
  status: string;
  content: string | null;
  char_count: number | null;
  meta_json: Record<string, any> | null;
}

interface SceneIndexedProgressProps {
  versionId: string;
  docType?: string;
  projectId?: string;
  documentId?: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  feature_script: 'Feature Script',
  production_draft: 'Production Draft',
  screenplay_draft: 'Screenplay Draft',
};

const RETRYABLE_STATUSES = new Set(['failed', 'failed_validation', 'error', 'needs_regen']);

function isRetryable(status: string): boolean {
  return RETRYABLE_STATUSES.has(status);
}

function getStatusIcon(status: string): React.ReactElement {
  if (status === 'done') return <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />;
  if (status === 'running') return <Loader2 className="h-4 w-4 text-blue-400 animate-spin shrink-0" />;
  if (isRetryable(status)) return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
  if (['failed', 'failed_validation', 'error', 'skipped'].includes(status))
    return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
  return <Clock className="h-4 w-4 text-muted-foreground/50 shrink-0" />;
}

/** Parse screenplay text into formatted React elements */
function formatScreenplayContent(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let afterCharacter = false;

  lines.forEach((line, i) => {
    const trimmed = line.trimEnd();

    // Scene markers → invisible (skip entirely)
    if (/^SCENE\s+\d+/i.test(trimmed)) return;

    // Sluglines (INT., EXT., INT/EXT., I/E.) → bold
    if (/^(INT|EXT|INT\.?\/EXT|I\.?\/E)\b/i.test(trimmed)) {
      result.push(
        <p key={i} className="text-xs font-bold text-foreground">
          {trimmed}
        </p>,
      );
      afterCharacter = false;
      return;
    }

    // Parentheticals → italic, indented
    if (/^\(.+\)$/.test(trimmed)) {
      result.push(
        <p key={i} className="text-xs italic text-muted-foreground/80 pl-4">
          {trimmed}
        </p>,
      );
      afterCharacter = false;
      return;
    }

    // Character names: all-caps standalone line (not a slugline, not a parenthetical)
    if (/^[A-Z][A-Z\s\.'-]{0,50}$/.test(trimmed) && trimmed.length > 1) {
      result.push(
        <p key={i} className="text-xs text-blue-400 font-medium">
          {trimmed}
        </p>,
      );
      afterCharacter = true;
      return;
    }

    // Dialogue (immediately after a character name)
    if (afterCharacter && trimmed.length > 0) {
      result.push(
        <p key={i} className="text-xs text-foreground/80 pl-4">
          {trimmed}
        </p>,
      );
      afterCharacter = false;
      return;
    }

    // Action lines
    if (trimmed) {
      result.push(
        <p key={i} className="text-xs text-foreground/70">
          {trimmed}
        </p>,
      );
    } else {
      result.push(<br key={i} />);
    }
    afterCharacter = false;
  });

  return result;
}

/** Strip metadata-like preamble lines from raw chunk content */
function cleanSceneContent(raw: string): string {
  const lines = raw.split('\n');
  let startIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i].trim();
    if (
      !line ||
      /^#+\s/.test(line) ||
      /^(SCENE\s+\d+|Deliverable|Completion|Completeness|Status|Section|Type)\s*(Type|Status|Check)?:/i.test(line)
    ) {
      startIdx = i + 1;
    } else {
      break;
    }
  }
  return lines.slice(startIdx).join('\n').trim();
}

/** Build a short plain-text preview for line-clamp usage */
function cleanScenePreview(raw: string): string {
  const prose = cleanSceneContent(raw);
  const preview = prose.slice(0, 400);
  return preview + (prose.length > 400 ? '…' : '');
}

/** Parse scene range from chunk_key like "SC01-SC05" → "Scenes 1–5" */
function formatSceneLabel(chunkKey: string, metaLabel?: string): string {
  if (metaLabel) return metaLabel;
  const match = chunkKey.match(/^SC(\d+)-SC(\d+)$/);
  if (match) {
    const start = parseInt(match[1], 10);
    const end = parseInt(match[2], 10);
    return `Scenes ${start}–${end}`;
  }
  // Fallback for act-based keys that ended up here
  return chunkKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SceneIndexedProgress({
  versionId,
  docType,
  projectId,
  documentId,
}: SceneIndexedProgressProps) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const { data: chunks = [], isLoading } = useQuery<ChunkRow[]>({
    queryKey: ['scene-indexed-chunks', versionId],
    queryFn: async () => {
      if (!versionId) return [];
      const { data, error } = await (supabase as any)
        .from('project_document_chunks')
        .select('id, chunk_index, chunk_key, status, content, char_count, meta_json')
        .eq('version_id', versionId)
        .order('chunk_index', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChunkRow[];
    },
    enabled: !!versionId,
    refetchInterval: (query) => {
      const rows = query.state.data;
      if (!rows || rows.length === 0) return 6000;
      const TERMINAL = new Set([
        'done',
        'failed',
        'failed_validation',
        'error',
        'needs_regen',
        'skipped',
      ]);
      const allTerminal = rows.every((c: ChunkRow) => TERMINAL.has(c.status));
      return allTerminal ? false : 6000;
    },
  });

  const safeChunks = Array.isArray(chunks) ? chunks : [];
  const total = safeChunks.length;
  const doneCount = safeChunks.filter((c) => c.status === 'done').length;
  const failedCount = safeChunks.filter((c) =>
    ['failed', 'failed_validation', 'error', 'skipped'].includes(c.status),
  ).length;
  const runningChunks = safeChunks.filter((c) => c.status === 'running');
  const pendingChunks = safeChunks.filter((c) => c.status === 'pending');
  const isStillActive = runningChunks.length > 0 || pendingChunks.length > 0;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const label = (docType && DOC_TYPE_LABELS[docType]) || 'Screenplay';

  const runningLabel =
    runningChunks.length > 0
      ? `Writing ${formatSceneLabel(runningChunks[0].chunk_key, runningChunks[0].meta_json?.label)} (${doneCount + 1} of ${total})…`
      : doneCount < total
        ? `Preparing scene batch ${doneCount + 1} of ${total}…`
        : 'Assembling final screenplay…';

  const handleRetryBatch = async (chunk: ChunkRow) => {
    if (!projectId || !documentId) {
      toast.error('Missing project context for retry');
      return;
    }
    setRetryingId(chunk.id);
    try {
      // 1. Mark this specific chunk as needs_regen
      const { error: markErr } = await (supabase as any)
        .from('project_document_chunks')
        .update({ status: 'needs_regen', error: null })
        .eq('id', chunk.id);
      if (markErr) throw markErr;

      // 2. Invoke generate-document in resume mode
      const { error } = await supabase.functions.invoke('generate-document', {
        body: {
          projectId,
          documentId,
          docType,
          resumeVersionId: versionId,
        },
      });
      if (error) throw error;

      toast.success(
        `Retrying ${chunk.meta_json?.label || formatSceneLabel(chunk.chunk_key)}…`,
      );
      queryClient.invalidateQueries({
        queryKey: ['scene-indexed-chunks', versionId],
      });
    } catch (err: any) {
      toast.error(`Retry failed: ${err.message}`);
    } finally {
      setRetryingId(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-col w-full space-y-4">
      {/* Header + progress bar */}
      <div className="w-full space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              Generating {label}
            </span>
            {isStillActive && (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 bg-blue-500/10 text-blue-400 border-blue-500/20 gap-1"
              >
                <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                Live
              </Badge>
            )}
            {!isStillActive && failedCount > 0 && doneCount > 0 && (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-400 border-amber-500/20"
              >
                Partially complete
              </Badge>
            )}
            {!isStillActive && doneCount === total && total > 0 && (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              >
                Complete
              </Badge>
            )}
          </div>
          <span className="text-muted-foreground font-mono text-xs">
            {doneCount} / {total || '?'} scene batches
          </span>
        </div>
        <Progress value={pct} className="h-2" />
        <p className="text-xs text-muted-foreground">{runningLabel}</p>
      </div>

      {/* Scene batch cards */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading scene status…
        </div>
      ) : safeChunks.length === 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Starting scene generation…
        </div>
      ) : (
        <div className="w-full space-y-3">
          {safeChunks.map((chunk) => {
            const sceneLabel =
              chunk.meta_json?.label || formatSceneLabel(chunk.chunk_key);
            const isDone = chunk.status === 'done';
            const isRunning = chunk.status === 'running';
            const canRetry = isRetryable(chunk.status);
            const isFailed =
              !isDone && !isRunning && chunk.status === 'skipped';
            const isExpanded = expandedId === chunk.id;
            const isRetrying = retryingId === chunk.id;

            const previewText =
              isDone && chunk.content
                ? cleanScenePreview(chunk.content)
                : null;
            const formattedContent =
              isDone && chunk.content
                ? formatScreenplayContent(chunk.content)
                : null;

            return (
              <Card
                key={chunk.id}
                className={`transition-all duration-300 ${
                  isDone
                    ? 'opacity-100 border-border/40 cursor-pointer hover:border-border/60'
                    : isRunning
                      ? 'opacity-90 border-blue-500/30 animate-pulse'
                      : canRetry
                        ? 'opacity-100 border-amber-500/30'
                        : isFailed
                          ? 'opacity-100 border-destructive/40'
                          : 'opacity-40 border-border/20'
                }`}
                onClick={() => isDone && toggleExpand(chunk.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">{getStatusIcon(chunk.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                          {sceneLabel}
                        </h4>
                        <div className="flex items-center gap-2">
                          {isDone && chunk.char_count != null && (
                            <span className="text-[10px] text-muted-foreground/60 font-mono">
                              {chunk.char_count.toLocaleString()} chars
                            </span>
                          )}
                          {isDone && chunk.content &&
                            (isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/60" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />
                            ))}
                        </div>
                      </div>

                      {/* Retryable failure */}
                      {canRetry && (
                        <div className="space-y-2">
                          <p className="text-xs text-amber-500/80 italic">
                            {chunk.status === 'failed_validation'
                              ? 'Validation issue — can retry'
                              : chunk.status === 'needs_regen'
                                ? 'Queued for regeneration'
                                : isStillActive
                                  ? 'Batch failed — may recover automatically'
                                  : 'Batch failed — tap retry to regenerate'}
                          </p>
                          {projectId && documentId && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRetryBatch(chunk);
                              }}
                              disabled={!!retryingId}
                            >
                              {isRetrying ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                              Retry batch
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Terminal failure (skipped) */}
                      {isFailed && !canRetry && (
                        <p className="text-xs text-destructive/80 italic">
                          Skipped
                        </p>
                      )}

                      {/* Done: plain-text preview */}
                      {isDone && !isExpanded && previewText && (
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 whitespace-pre-wrap">
                          {previewText}
                        </p>
                      )}

                      {/* Done: expanded formatted content */}
                      {isDone && isExpanded && formattedContent && (
                        <ScrollArea className="max-h-[400px] mt-2">
                          <div className="pr-3 space-y-0.5">
                            {formattedContent}
                          </div>
                        </ScrollArea>
                      )}

                      {/* Done expanded but no content */}
                      {isDone && isExpanded && !formattedContent && (
                        <p className="text-xs text-muted-foreground/50 italic mt-2">
                          Content not yet available — try refreshing.
                        </p>
                      )}

                      {/* Done collapsed but no preview text */}
                      {isDone && !isExpanded && !previewText && (
                        <p className="text-xs text-muted-foreground/50 italic">
                          Complete — click to read
                        </p>
                      )}

                      {/* Running */}
                      {isRunning && (
                        <p className="text-xs text-muted-foreground/70 italic">
                          Generating…
                        </p>
                      )}

                      {/* Pending */}
                      {!isDone &&
                        !isRunning &&
                        !canRetry &&
                        !isFailed && (
                          <p className="text-xs text-muted-foreground/40 italic">
                            Pending
                          </p>
                        )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/60 text-center">
        {isStillActive
          ? 'Scene-by-scene generation in progress — updates every few seconds.'
          : failedCount > 0
            ? 'Some scene batches need attention. Use retry to regenerate failed batches.'
            : 'This may take a few minutes. The page will update automatically when ready.'}
      </p>
    </div>
  );
}