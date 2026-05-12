/**
 * TreatmentRewritePanel — Persistent per-act editing panel for Treatment and Long Treatment documents.
 *
 * Polls treatment_acts from the DB, displays each act in an expandable/editable card,
 * and provides controls for per-act saving, full-panel rewrite, and assembly.
 *
 * Architecture: Self-contained component (no external pipeline hook). Treatment docs
 * rewrite via dev-engine-v2 { action: "rewrite", deliverableType } route.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle2, Loader2, AlertCircle, ChevronRight, ChevronDown,
  RotateCcw, Info, Sparkles, Save, Edit3, Eye, Package, Square,
  Play, Clock, AlertTriangle, Bug, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { ProcessProgressBar } from './ProcessProgressBar';
import { ActivityTimeline } from './ActivityTimeline';

const sb = supabase as any;

// ── Types ────────────────────────────────────────────────────────────────────

interface TreatmentActRow {
  id: string;
  act_number: number;
  act_key: string;
  label: string;
  content: string | null;
  content_hash: string | null;
  act_blueprint: Record<string, any> | null;
  arc_state_deltas: Record<string, any> | null;
  status: string;
  error_message: string | null;
  created_at: string;
  revised_at: string | null;
}

interface TreatmentRewritePanelProps {
  projectId: string;
  documentId: string;
  versionId: string;
  docType: string;
  approvedNotes?: any[];
  protectItems?: string[];
  onComplete?: (newVersionId: string) => void;
  onApplyAllStart?: () => void;
  onApplyAllDone?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TERMINAL = new Set(['done', 'failed']);

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'done': return <Badge variant="default" className="bg-green-600 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Done</Badge>;
    case 'rewriting': return <Badge variant="default" className="bg-blue-600 text-xs animate-pulse"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Rewriting</Badge>;
    case 'failed': return <Badge variant="destructive" className="text-xs"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
    case 'pending': return <Badge variant="secondary" className="text-xs"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

function formatActLabel(act: TreatmentActRow): string {
  return act.label || `Act ${act.act_number} — ${act.act_key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`;
}

// ── Panel ────────────────────────────────────────────────────────────────────

export default function TreatmentRewritePanel({
  projectId, documentId, versionId, docType, approvedNotes, protectItems, onComplete, onApplyAllStart, onApplyAllDone,
}: TreatmentRewritePanelProps) {
  const queryClient = useQueryClient();
  const [expandedActId, setExpandedActId] = useState<string | null>(null);
  const [editContents, setEditContents] = useState<Record<string, string>>({});
  const [savingActId, setSavingActId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [rewritingAll, setRewritingAll] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const startGuardRef = useRef(false);

  // ── Poll treatment_acts ──────────────────────────────────────────────────────

  const { data: acts = [], isLoading, isError } = useQuery<TreatmentActRow[]>({
    queryKey: ['treatment-rewrite-acts', documentId],
    queryFn: async () => {
      if (!documentId) return [];
      const { data, error } = await sb
        .from('treatment_acts')
        .select('*')
        .eq('treatment_id', documentId)
        .order('act_number', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TreatmentActRow[];
    },
    enabled: !!documentId,
    refetchInterval: (query) => {
      const rows = query.state.data;
      if (!rows || rows.length === 0) return 5000;
      const allTerminal = rows.every((r: TreatmentActRow) => TERMINAL.has(r.status));
      return allTerminal ? false : 5000;
    },
    staleTime: 15_000,
  });

  const safeActs = Array.isArray(acts) ? acts : [];
  const total = safeActs.length;
  const doneCount = safeActs.filter(a => a.status === 'done').length;
  const failedCount = safeActs.filter(a => a.status === 'failed').length;
  const isWorking = safeActs.some(a => a.status === 'rewriting' || a.status === 'pending');
  const allDone = total > 0 && doneCount === total;

  useEffect(() => {
    if (!initialized && safeActs.length > 0) {
      // Initialize edit contents from act content
      const init: Record<string, string> = {};
      for (const act of safeActs) {
        init[act.id] = act.content || '';
      }
      setEditContents(prev => {
        // Only set if not already initialized
        if (Object.keys(prev).length === 0) return init;
        return prev;
      });
      setInitialized(true);
    }
  }, [safeActs, initialized]);

  // Sync edit contents when acts refresh (new content from backend)
  useEffect(() => {
    if (initialized) {
      setEditContents(prev => {
        const next = { ...prev };
        let changed = false;
        for (const act of safeActs) {
          const existing = prev[act.id];
          if (existing === undefined && act.content) {
            next[act.id] = act.content;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [safeActs, initialized]);

  // ── Notify on complete ────────────────────────────────────────────────────────

  const [newVersionId, setNewVersionId] = useState<string | null>(null);
  useEffect(() => {
    if (newVersionId && onComplete) {
      onComplete(newVersionId);
    }
  }, [newVersionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Act editing ──────────────────────────────────────────────────────────────

  const handleActContentChange = useCallback((actId: string, value: string) => {
    setEditContents(prev => ({ ...prev, [actId]: value }));
  }, []);

  const handleSaveAct = async (act: TreatmentActRow) => {
    if (savingActId) return;
    setSavingActId(act.id);
    try {
      const newContent = editContents[act.id] || '';
      const { error } = await sb
        .from('treatment_acts')
        .update({
          content: newContent,
          content_hash: null, // force content_hash recalculation by backend
          revised_at: new Date().toISOString(),
        })
        .eq('id', act.id);
      if (error) throw error;
      toast.success(`${formatActLabel(act)} saved`);
      queryClient.invalidateQueries({ queryKey: ['treatment-rewrite-acts', documentId] });
    } catch (err: any) {
      toast.error('Save failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setSavingActId(null);
    }
  };

  // ── Rewrite All ─────────────────────────────────────────────────────────────

  const handleRewriteAll = async () => {
    if (startGuardRef.current || rewritingAll) return;
    startGuardRef.current = true;
    setRewritingAll(true);
    onApplyAllStart?.();

    try {
      const deliverableType = docType === 'long_treatment' ? 'long_treatment' : 'treatment';
      const { data: result, error: invokeError } = await supabase.functions.invoke('dev-engine-v2', {
        body: {
          action: 'rewrite',
          deliverableType,
          projectId,
          documentId,
          versionId,
          approvedNotes: approvedNotes || [],
          protectItems: protectItems || [],
        },
      });
      if (invokeError) throw invokeError;
      if (result?.error) throw new Error(result.error);

      toast.success('Treatment rewrite started — per-act pipeline running');
      queryClient.invalidateQueries({ queryKey: ['treatment-rewrite-acts', documentId] });
    } catch (err: any) {
      console.error('[TreatmentRewritePanel] rewrite all failed:', err);
      toast.error('Rewrite failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setRewritingAll(false);
      startGuardRef.current = false;
      onApplyAllDone?.();
    }
  };

  // ── Assembly ─────────────────────────────────────────────────────────────────

  const handleAssemble = async () => {
    if (assembling) return;
    setAssembling(true);
    try {
      // Build full treatment text from all act contents
      const actOrder = ['act_1', 'act_2a', 'act_2b', 'act_3'];
      const sorted = [...safeActs].sort((a, b) => a.act_number - b.act_number);
      const sections: string[] = [];
      for (const act of sorted) {
        const content = editContents[act.id] || act.content || '';
        const label = formatActLabel(act);
        sections.push(`## ${label}\n\n${content.trim()}`);
      }
      const plaintext = sections.join('\n\n');

      // Create new version
      const { data: newVer, error: verError } = await sb
        .from('project_document_versions')
        .insert({
          document_id: documentId,
          version_number: null, // let DB auto-increment
          plaintext,
          is_current: true,                   // fix d: new version must be current
          approval_status: 'draft',
          meta_json: {
            source: 'treatment_rewrite_panel',
            source_version_id: versionId,
            act_count: sorted.length,
            assembled_at: new Date().toISOString(),
          },
          change_summary: `Assembled from ${sorted.length} act(s) via TreatmentRewritePanel`,
        })
        .select('id')
        .single();
      if (verError) throw verError;

      // Mark old version as not current
      if (versionId) {
        await sb
          .from('project_document_versions')
          .update({ is_current: false })
          .eq('id', versionId);
      }

      // Update document's latest_version_id
      const { error: docError } = await sb
        .from('project_documents')
        .update({ latest_version_id: newVer.id })
        .eq('id', documentId);
      if (docError) throw docError;

      toast.success('New version assembled');
      setNewVersionId(newVer.id);
      queryClient.invalidateQueries({ queryKey: ['dev-v2-versions', documentId] });
      queryClient.invalidateQueries({ queryKey: ['treatment-rewrite-acts', documentId] });
    } catch (err: any) {
      console.error('[TreatmentRewritePanel] assemble failed:', err);
      toast.error('Assembly failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setAssembling(false);
    }
  };

  // ── Preview ─────────────────────────────────────────────────────────────────

  const handlePreview = () => {
    const actOrder = ['act_1', 'act_2a', 'act_2b', 'act_3'];
    const sorted = [...safeActs].sort((a, b) => a.act_number - b.act_number);
    const sections: string[] = [];
    for (const act of sorted) {
      const content = editContents[act.id] || act.content || '';
      const label = formatActLabel(act);
      sections.push(`## ${label}\n\n${content.trim()}`);
    }
    setPreviewText(sections.join('\n\n'));
    setPreviewOpen(true);
  };

  // ── Retry failed ────────────────────────────────────────────────────────────

  const handleRetryFailed = async () => {
    if (rewritingAll) return;
    setRewritingAll(true);
    onApplyAllStart?.();
    try {
      const deliverableType = docType === 'long_treatment' ? 'long_treatment' : 'treatment';
      const { data: result, error: invokeError } = await supabase.functions.invoke('dev-engine-v2', {
        body: {
          action: 'rewrite',
          deliverableType,
          projectId,
          documentId,
          versionId,
          approvedNotes: approvedNotes || [],
          protectItems: protectItems || [],
          retryFailed: true,
        },
      });
      if (invokeError) throw invokeError;
      if (result?.error) throw new Error(result.error);
      toast.success('Retrying failed acts');
      queryClient.invalidateQueries({ queryKey: ['treatment-rewrite-acts', documentId] });
    } catch (err: any) {
      toast.error('Retry failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setRewritingAll(false);
      onApplyAllDone?.();
    }
  };

  // ── Compute state flags ─────────────────────────────────────────────────────

  const canStart = total === 0 || (!isWorking && safeActs.every(a => TERMINAL.has(a.status) || a.status === 'pending'));
  const canRetryFailed = failedCount > 0 && !isWorking;
  const canAssemble = allDone && !newVersionId;
  const canPreview = total > 0 && doneCount > 0;
  const needsInitialGenerate = total === 0;

  const stuckMinutes = 10;
  const hasStuckRewrite = false; // treatment_acts don't have a "claimed_at" concept

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {docType === 'long_treatment' ? 'Long Treatment' : 'Treatment'} — Per-Act Rewrite
          </span>
          {total > 0 && (
            <span className="text-xs text-muted-foreground">
              {doneCount}/{total} acts
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {needsInitialGenerate ? (
            <Button size="sm" variant="default" onClick={handleRewriteAll} disabled={rewritingAll} className="h-7 text-xs gap-1">
              {rewritingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Generate Acts
            </Button>
          ) : (
            <>
              {!isWorking && (
                <>
                  {/* Fix b: per-act button renamed to "Rewrite All" */}
                  <Button size="sm" variant="default" onClick={handleRewriteAll} disabled={rewritingAll} className="h-7 text-xs gap-1">
                    {rewritingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    {rewritingAll ? 'Rewriting…' : 'Rewrite All'}
                  </Button>
                  {canRetryFailed && (
                    <Button size="sm" variant="outline" onClick={handleRetryFailed} className="h-7 text-xs gap-1">
                      <RotateCcw className="h-3 w-3" /> Retry Failed
                    </Button>
                  )}
                  {canPreview && (
                    <Button size="sm" variant="outline" onClick={handlePreview} className="h-7 text-xs gap-1">
                      <Eye className="h-3 w-3" /> Preview
                    </Button>
                  )}
                  {canAssemble && (
                    <Button size="sm" variant="default" onClick={handleAssemble} disabled={assembling} className="h-7 text-xs gap-1">
                      {assembling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Package className="h-3 w-3" />}
                      {assembling ? 'Assembling…' : 'Assemble'}
                    </Button>
                  )}
                </>
              )}
              {isWorking && (
                <span className="text-xs text-blue-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> In progress…
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <ProcessProgressBar
          percent={total > 0 ? Math.round((doneCount / total) * 100) : 0}
          actualPercent={total > 0 ? Math.round((doneCount / total) * 100) : 0}
          phase={isWorking ? 'processing' : allDone ? 'complete' : 'idle'}
          label={isWorking ? `Rewriting act ${doneCount + 1} of ${total}…` : allDone ? 'All acts complete' : 'Ready'}
          status={isWorking ? 'working' : allDone ? 'success' : failedCount > 0 ? 'warn' : 'working'}
        />
      )}

      {/* Error display */}
      {isError && (
        <div className="text-xs text-destructive p-2 bg-destructive/10 rounded flex items-center gap-1">
          <XCircle className="h-3 w-3" /> Failed to load treatment acts
        </div>
      )}

      {/* Success banner */}
      {newVersionId && (
        <div className="text-xs space-y-1 p-2 rounded bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
          <div className="text-green-600 font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> New version assembled
          </div>
          <div className="text-muted-foreground">
            All {doneCount} act(s) combined into a single treatment document.
          </div>
        </div>
      )}

      {/* Act cards */}
      {isLoading ? (
        <div className="flex items-center justify-center h-[200px] gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading acts…
        </div>
      ) : safeActs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[200px] gap-3 text-muted-foreground text-sm">
          <Sparkles className="h-8 w-8 opacity-30" />
          <p>No acts yet. Click "Generate Acts" or "Rewrite All" to create treatment acts.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {safeActs.map((act) => {
            const isExpanded = expandedActId === act.id;
            const isDone = act.status === 'done';
            const isFailed = act.status === 'failed';
            const isRewriting = act.status === 'rewriting';
            const content = editContents[act.id] !== undefined ? editContents[act.id] : (act.content || '');
            const isSaving = savingActId === act.id;
            const hasEdits = content !== (act.content || '');

            return (
              <Card key={act.id} className={`transition-all ${isRewriting ? 'border-blue-500/30 animate-pulse' : isFailed ? 'border-destructive/30' : ''}`}>
                <CardHeader
                  className="p-3 pb-2 flex flex-row items-center justify-between cursor-pointer hover:bg-muted/30"
                  onClick={() => setExpandedActId(prev => prev === act.id ? null : act.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <CardTitle className="text-sm font-semibold truncate">{formatActLabel(act)}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasEdits && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-400/50 text-amber-500">
                        Edited
                      </Badge>
                    )}
                    <StatusBadge status={act.status} />
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="p-3 pt-2 space-y-2">
                    {/* Editable textarea */}
                    <textarea
                      className="w-full min-h-[200px] text-xs font-mono p-3 rounded border bg-background resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                      value={content}
                      onChange={(e) => handleActContentChange(act.id, e.target.value)}
                      disabled={isRewriting}
                      placeholder={isRewriting ? 'Rewriting…' : 'Edit act content…'}
                    />

                    {/* Error message */}
                    {isFailed && act.error_message && (
                      <div className="text-xs text-destructive flex items-start gap-1 p-2 bg-destructive/10 rounded">
                        <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                        {act.error_message}
                      </div>
                    )}

                    {/* Per-act actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant={hasEdits ? "default" : "outline"}
                        onClick={() => handleSaveAct(act)}
                        disabled={isSaving || isRewriting}
                        className="h-7 text-xs gap-1"
                      >
                        {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        {isSaving ? 'Saving…' : hasEdits ? 'Save Changes' : 'Save'}
                      </Button>
                      {act.content != null && (
                        <span className="text-[10px] text-muted-foreground/60 ml-1">
                          {act.content.split(/\s+/).filter(Boolean).length.toLocaleString()} words
                        </span>
                      )}
                    </div>
                  </CardContent>
                )}

                {!isExpanded && isDone && content && (
                  <CardContent className="p-3 pt-0">
                    <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                      {content.slice(0, 200)}{content.length > 200 ? '…' : ''}
                    </p>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Summary stats */}
      {total > 0 && (
        <div className="flex gap-3 text-xs text-muted-foreground">
          {safeActs.filter(a => a.status === 'pending').length > 0 && <span>Pending: {safeActs.filter(a => a.status === 'pending').length}</span>}
          {safeActs.filter(a => a.status === 'rewriting').length > 0 && <span className="text-blue-500">Rewriting: {safeActs.filter(a => a.status === 'rewriting').length}</span>}
          {doneCount > 0 && <span className="text-green-500">Done: {doneCount}</span>}
          {failedCount > 0 && <span className="text-destructive">Failed: {failedCount}</span>}
        </div>
      )}

      {/* Activity/debug panel */}
      {import.meta.env.DEV && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
            <Bug className="h-3 w-3" /> Debug
          </summary>
          <div className="mt-1 space-y-1 pl-4">
            <Button size="sm" variant="outline" className="h-6 text-[10px]"
              onClick={() => console.log('[TreatmentRewritePanel] State:', {
                total, doneCount, failedCount, isWorking, allDone,
                newVersionId, rewritingAll, assembling, initialized,
                expandedActId, editCount: Object.keys(editContents).length,
              })}>
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
              Treatment Preview
              <span className="font-normal text-muted-foreground ml-2">
                {doneCount} acts • {previewText.split(/\s+/).filter(Boolean).length.toLocaleString()} words
              </span>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0">
            <pre className="text-xs whitespace-pre-wrap font-mono p-3 bg-muted/30 rounded">
              {previewText || 'No content yet.'}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Kh = TreatmentRewritePanel;
