/**
 * TreatmentRewritePanel — Persistent per-act editing panel for Treatment and Long Treatment docs.
 *
 * Polls treatment_acts by treatment_id, displays expandable act cards with editable content,
 * per-act rewrite buttons, save, and assemble-all functionality.
 *
 * Unlike TreatmentActsProgress (which only renders during active rewrite),
 * this panel persists after generation completes so the user can review, edit,
 * and selectively rewrite individual acts.
 */

import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RotateCcw,
  Save,
  Play,
  BookOpen,
  Shield,
  Target,
  GitBranch,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Square,
  Package,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ProcessProgressBar } from './ProcessProgressBar';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ActBlueprint {
  actKey?: string;
  actNumber?: number;
  label?: string;
  functionDescription?: string;
  canonConstraints?: string[];
  targetingNotes?: string[];
  hasPrecedingContext?: boolean;
}

interface CharacterState {
  current_desire?: string;
  current_fear?: string;
  emotional_state?: string;
  relationship_states?: Record<string, string>;
}

interface PendingArc {
  character?: string;
  arc_description?: string;
  tension_level?: string | number;
}

interface UnresolvedTension {
  tension?: string;
  introduced_in_act?: string | number;
  escalation_level?: string | number;
}

interface ArcStateDeltas {
  character_states?: Record<string, CharacterState>;
  pending_arcs?: PendingArc[];
  unresolved_tensions?: UnresolvedTension[];
}

interface TreatmentActRow {
  id: string;
  act_number: number;
  act_key: string;
  label: string;
  content: string | null;
  content_hash: string | null;
  act_blueprint: ActBlueprint | null;
  arc_state_deltas: ArcStateDeltas | null;
  status: string;
  error_message: string | null;
  created_at: string;
  revised_at: string | null;
}

interface TreatmentRewritePanelProps {
  projectId: string;
  documentId: string;
  versionId: string;
  approvedNotes: any[];
  protectItems: string[];
  onComplete?: (newVersionId: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ActStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'done':
      return (
        <Badge variant="default" className="bg-green-600 text-xs gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Done
        </Badge>
      );
    case 'rewriting':
      return (
        <Badge variant="default" className="bg-blue-600 text-xs gap-1 animate-pulse">
          <Loader2 className="h-3 w-3 animate-spin" />
          Rewriting
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive" className="text-xs gap-1">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="text-xs gap-1">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      );
  }
}

function BlueprintSection({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function ConstraintList({ items, emptyText = 'None' }: { items?: string[]; emptyText?: string }) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-muted-foreground/50 italic">{emptyText}</p>;
  }
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function ArcStateSection({ deltas }: { deltas: ArcStateDeltas | null }) {
  if (!deltas) return <p className="text-xs text-muted-foreground/50 italic">No arc-state data</p>;

  const { character_states, pending_arcs, unresolved_tensions } = deltas;
  const hasAny =
    (character_states && Object.keys(character_states).length > 0) ||
    (pending_arcs && pending_arcs.length > 0) ||
    (unresolved_tensions && unresolved_tensions.length > 0);

  if (!hasAny) return <p className="text-xs text-muted-foreground/50 italic">No arc-state data from prior acts</p>;

  return (
    <div className="space-y-3">
      {character_states && Object.keys(character_states).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Character States</p>
          <div className="space-y-2">
            {Object.entries(character_states).map(([name, state]) => (
              <div key={name} className="pl-2 border-l border-border/40">
                <p className="text-xs font-medium text-foreground/90">{name}</p>
                {state.current_desire && (
                  <p className="text-[10px] text-muted-foreground">
                    <span className="text-foreground/60">Wants:</span> {state.current_desire}
                  </p>
                )}
                {state.current_fear && (
                  <p className="text-[10px] text-muted-foreground">
                    <span className="text-foreground/60">Fears:</span> {state.current_fear}
                  </p>
                )}
                {state.emotional_state && (
                  <p className="text-[10px] text-muted-foreground">
                    <span className="text-foreground/60">State:</span> {state.emotional_state}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {pending_arcs && pending_arcs.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Pending Arcs</p>
          <div className="space-y-1.5">
            {pending_arcs.map((arc, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                <GitBranch className="h-3 w-3 text-muted-foreground/50 shrink-0 mt-0.5" />
                <span>
                  {arc.character && <span className="font-medium">{arc.character}: </span>}
                  {arc.arc_description}
                  {arc.tension_level != null && (
                    <span className="ml-1 text-[10px] text-muted-foreground/60">(tension: {arc.tension_level})</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {unresolved_tensions && unresolved_tensions.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Unresolved Tensions</p>
          <div className="space-y-1.5">
            {unresolved_tensions.map((t, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                <AlertTriangle className="h-3 w-3 text-amber-500/60 shrink-0 mt-0.5" />
                <span>
                  {t.tension}
                  {t.introduced_in_act != null && (
                    <span className="ml-1 text-[10px] text-muted-foreground/60">
                      (act {t.introduced_in_act}
                      {t.escalation_level != null ? `, escalation: ${t.escalation_level}` : ''})
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TreatmentRewritePanel({
  projectId,
  documentId,
  versionId,
  approvedNotes,
  protectItems,
  onComplete,
}: TreatmentRewritePanelProps) {
  const qc = useQueryClient();
  // ── Untyped DB client for tables not in the generated types ──
  const sb = supabase as any;

  // ── State for progress during per-act pipeline ──
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineProgress, setPipelineProgress] = useState<{ done: number; total: number; status: 'idle' | 'working' | 'complete' | 'error' }>({
    done: 0,
    total: 0,
    status: 'idle',
  });
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  // ── State for act card expansion ──
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── State for per-act content editing ──
  const [editingContent, setEditingContent] = useState<Record<string, string>>({});
  const [savingAct, setSavingAct] = useState<Record<string, boolean>>({});

  // ── State for blueprint collapsible per card ──
  const [blueprintExpanded, setBlueprintExpanded] = useState<Record<string, boolean>>({});

  // ── Guard refs ──
  const rewriteGuardRef = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Query: fetch treatment_acts with polling ──
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
      const TERMINAL = new Set(['done', 'failed']);
      const allTerminal = rows.every((r: TreatmentActRow) => TERMINAL.has(r.status));
      return allTerminal ? false : 5000;
    },
  });

  const safeActs = Array.isArray(acts) ? acts : [];
  const totalActs = safeActs.length;
  const doneActs = safeActs.filter(a => a.status === 'done').length;
  const isAnyRewriting = safeActs.some(a => a.status === 'rewriting');

  // ── Per-act rewrite: runs the full per-act pipeline via dev-engine-v2 ──
  const handleRewriteAct = async () => {
    if (rewriteGuardRef.current) return;
    rewriteGuardRef.current = true;
    setPipelineRunning(true);
    setPipelineProgress({ done: 0, total: 4, status: 'working' });
    setPipelineError(null);

    try {
      const action = 'rewrite';

      const { data: result, error: invokeError } = await supabase.functions.invoke('dev-engine-v2', {
        body: {
          action,
          deliverableType: 'treatment',
          projectId,
          documentId,
          versionId,
          approvedNotes,
          protectItems,
        },
      });

      if (invokeError) throw invokeError;

      if (result?.success) {
        setPipelineProgress({ done: 4, total: 4, status: 'complete' });
        toast.success('Treatment rewrite completed');
        qc.invalidateQueries({ queryKey: ['treatment-rewrite-acts', documentId] });
        qc.invalidateQueries({ queryKey: ['dev-v2-versions', documentId] });

        // Notify parent of new version
        if (result.new_version_id && onComplete) {
          onComplete(result.new_version_id);
        }
      } else {
        throw new Error(result?.error || 'Per-act rewrite returned unsuccessful');
      }
    } catch (err: any) {
      console.error('[treatment-rewrite-panel] per-act rewrite failed:', err);
      setPipelineProgress(p => ({ ...p, status: 'error' }));
      setPipelineError(err?.message || 'Rewrite failed');
      toast.error('Treatment rewrite failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setPipelineRunning(false);
      rewriteGuardRef.current = false;
    }
  };

  // ── Save a single act's content ──
  const handleSaveAct = async (act: TreatmentActRow, content: string) => {
    const actId = act.id;
    setSavingAct(prev => ({ ...prev, [actId]: true }));

    try {
      const { error } = await sb
        .from('treatment_acts')
        .update({ content, revised_at: new Date().toISOString() })
        .eq('id', actId);

      if (error) throw error;

      toast.success(`${act.label || `Act ${act.act_number}`} saved`);
      // Clear editing state for this act
      setEditingContent(prev => {
        const next = { ...prev };
        delete next[actId];
        return next;
      });
      qc.invalidateQueries({ queryKey: ['treatment-rewrite-acts', documentId] });
    } catch (err: any) {
      console.error('[treatment-rewrite-panel] save act failed:', err);
      toast.error('Failed to save: ' + (err?.message || 'Unknown error'));
    } finally {
      setSavingAct(prev => ({ ...prev, [actId]: false }));
    }
  };

  // ── Assemble all acts into a new version ──
  const handleAssembleAll = async () => {
    const assembledActs = safeActs.filter(a => a.status === 'done' && a.content);
    if (assembledActs.length === 0) {
      toast.error('No completed acts to assemble');
      return;
    }

    // Build the full treatment text from act content
    const assembledText = assembledActs
      .map(act => `## ${act.label || `Act ${act.act_number}`}\n\n${act.content}`)
      .join('\n\n');

    if (!assembledText.trim()) {
      toast.error('Acts have no content to assemble');
      return;
    }

    setPipelineRunning(true);
    setPipelineProgress({ done: 0, total: 1, status: 'working' });
    setPipelineError(null);

    try {
      // Get current version to copy its metadata
      const { data: currentVersion, error: verError } = await sb
        .from('project_document_versions')
        .select('version_number, label, meta_json')
        .eq('id', versionId)
        .single();

      if (verError) throw verError;

      const newVersionNumber = (currentVersion?.version_number || 0) + 1;

      // Create new version with assembled text
      const { data: newVersion, error: createError } = await sb
        .from('project_document_versions')
        .insert({
          document_id: documentId,
          version_number: newVersionNumber,
          label: currentVersion?.label || null,
          plaintext: assembledText,
          meta_json: {
            ...(currentVersion?.meta_json || {}),
            run_type: 'TREATMENT_MANUAL_ASSEMBLE',
            pipeline: 'per_act_manual',
            assembled_from_acts: true,
          },
          approval_status: 'draft',
          is_current: true,
        })
        .select()
        .single();

      if (createError) throw createError;

      // Update document's latest_version_id
      const { error: updateError } = await sb
        .from('project_documents')
        .update({ latest_version_id: newVersion.id })
        .eq('id', documentId);

      if (updateError) console.warn('[treatment-rewrite-panel] update latest_version_id failed:', updateError);

      setPipelineProgress({ done: 1, total: 1, status: 'complete' });
      toast.success(`Treatment assembled — v${newVersionNumber} created`);

      qc.invalidateQueries({ queryKey: ['dev-v2-versions', documentId] });

      if (onComplete) {
        onComplete(newVersion.id);
      }
    } catch (err: any) {
      console.error('[treatment-rewrite-panel] assemble failed:', err);
      setPipelineProgress(p => ({ ...p, status: 'error' }));
      setPipelineError(err?.message || 'Assembly failed');
      toast.error('Assembly failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setPipelineRunning(false);
    }
  };

  // ── Helpers for card state ──
  const getEditedContent = (act: TreatmentActRow): string => {
    return editingContent[act.id] !== undefined ? editingContent[act.id] : (act.content || '');
  };

  const hasUnsavedChanges = (act: TreatmentActRow): boolean => {
    return editingContent[act.id] !== undefined && editingContent[act.id] !== (act.content || '');
  };

  const toggleBlueprint = (actId: string) => {
    setBlueprintExpanded(prev => ({ ...prev, [actId]: !prev[actId] }));
  };

  // ── Render ──

  const showAssemble = safeActs.filter(a => a.status === 'done' && a.content).length > 0 && !isAnyRewriting;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Treatment — Per-Act Editor</span>
          {totalActs > 0 && (
            <span className="text-xs text-muted-foreground">
              {doneActs}/{totalActs} acts
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(pipelineProgress.status === 'complete' || showAssemble) && !pipelineRunning && (
            <Button
              size="sm"
              variant="default"
              onClick={handleAssembleAll}
              disabled={pipelineRunning}
              className="h-7 text-xs gap-1"
            >
              <Package className="h-3 w-3" /> Assemble All
            </Button>
          )}
          {!pipelineRunning && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRewriteAct}
              disabled={pipelineRunning || !versionId}
              className="h-7 text-xs gap-1"
            >
              <RotateCcw className="h-3 w-3" /> Rewrite All
            </Button>
          )}
          {pipelineRunning && (
            <Button size="sm" variant="ghost" disabled className="h-7 text-xs gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Working…
            </Button>
          )}
        </div>
      </div>

      {/* Pipeline progress */}
      {(pipelineProgress.status === 'working' || pipelineProgress.status === 'complete' || pipelineProgress.status === 'error') && (
        <ProcessProgressBar
          percent={pipelineProgress.status === 'complete' ? 100 : pipelineProgress.status === 'error' ? 0 : 50}
          actualPercent={pipelineProgress.status === 'complete' ? 100 : pipelineProgress.status === 'error' ? 0 : (pipelineProgress.done / Math.max(pipelineProgress.total, 1)) * 100}
          phase={pipelineProgress.status === 'working' ? 'rewriting' : pipelineProgress.status === 'complete' ? 'done' : 'error'}
          label={pipelineProgress.status === 'working' ? 'Rewriting acts…' : pipelineProgress.status === 'complete' ? 'Rewrite complete' : 'Rewrite failed'}
          status={pipelineProgress.status === 'complete' ? 'success' : pipelineProgress.status === 'error' ? 'error' : 'working'}
        />
      )}

      {/* Error message */}
      {pipelineError && (
        <div className="text-xs text-destructive p-2 rounded bg-destructive/5 border border-destructive/20">
          {pipelineError}
        </div>
      )}

      {/* Act cards */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading acts…
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 text-destructive/70 text-sm py-8 justify-center">
          <XCircle className="h-4 w-4" />
          Failed to load acts
        </div>
      ) : safeActs.length === 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Clock className="h-4 w-4" />
          No acts yet — generate the treatment first.
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {safeActs.map((act) => {
            const isDone = act.status === 'done';
            const isRewriting = act.status === 'rewriting';
            const isFailed = act.status === 'failed';
            const isExpanded = expandedId === act.id;
            const currentContent = getEditedContent(act);
            const hasChanges = hasUnsavedChanges(act);
            const isSaving = savingAct[act.id] || false;
            const showBlueprint = blueprintExpanded[act.id];
            const bp = act.act_blueprint;

            return (
              <Card
                key={act.id}
                className={`transition-all duration-300 ${
                  isDone
                    ? 'border-border/40'
                    : isRewriting
                      ? 'border-blue-500/30 animate-pulse'
                      : isFailed
                        ? 'border-destructive/40'
                        : 'border-border/20 opacity-40'
                }`}
              >
                <CardContent className="p-3">
                  {/* Act header row */}
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => isDone && setExpandedId(prev => prev === act.id ? null : act.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ActStatusBadge status={act.status} />
                      <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide truncate">
                        {act.label || `Act ${act.act_number}`}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Actions visible when collapsed */}
                      {isDone && (
                        <>
                          {hasChanges && (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-6 text-[10px] gap-1"
                              disabled={isSaving}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSaveAct(act, currentContent);
                              }}
                            >
                              {isSaving ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : (
                                <Save className="h-2.5 w-2.5" />
                              )}
                              Save
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] gap-1"
                            disabled={pipelineRunning}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRewriteAct();
                            }}
                          >
                            <RotateCcw className="h-2.5 w-2.5" /> Rewrite All
                          </Button>
                        </>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/60" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />
                      )}
                    </div>
                  </div>

                  {/* Error message */}
                  {isFailed && act.error_message && (
                    <div className="flex items-start gap-2 mt-2 p-2 rounded bg-destructive/10 border border-destructive/20">
                      <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                      <p className="text-xs text-destructive/90">{act.error_message}</p>
                    </div>
                  )}

                  {/* Rewriting indicator */}
                  {isRewriting && (
                    <p className="text-xs text-muted-foreground/70 italic mt-2">Rewriting…</p>
                  )}

                  {/* Pending indicator */}
                  {act.status === 'pending' && (
                    <p className="text-xs text-muted-foreground/40 italic mt-2">Pending</p>
                  )}

                  {/* Expanded content area */}
                  {isExpanded && isDone && (
                    <div className="mt-3 space-y-3">
                      {/* Editable content textarea */}
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">
                          Content
                        </label>
                        <textarea
                          className="w-full min-h-[120px] text-xs text-foreground/80 leading-relaxed p-2 rounded border border-border/40 bg-background resize-y font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                          value={currentContent}
                          onChange={(e) =>
                            setEditingContent(prev => ({ ...prev, [act.id]: e.target.value }))
                          }
                          spellCheck={false}
                        />

                        {/* Save bar when edited */}
                        {hasChanges && (
                          <div className="flex items-center justify-end gap-1 mt-1.5">
                            <span className="text-[10px] text-amber-500/70 italic mr-2">Unsaved changes</span>
                            <Button
                              size="sm"
                              variant="default"
                              className="h-6 text-[10px] gap-1"
                              disabled={isSaving}
                              onClick={() => handleSaveAct(act, currentContent)}
                            >
                              {isSaving ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : (
                                <Save className="h-2.5 w-2.5" />
                              )}
                              Save Changes
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Blueprint section — collapsible */}
                      <div>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => toggleBlueprint(act.id)}
                        >
                          <BookOpen className="h-3 w-3" />
                          Blueprint
                          {showBlueprint
                            ? <ChevronUp className="h-3 w-3 ml-1" />
                            : <ChevronDown className="h-3 w-3 ml-1" />}
                        </button>

                        {showBlueprint && (
                          <div className="mt-2 space-y-3 pl-1 border-l-2 border-border/20 pl-3">
                            {/* Function description */}
                            {bp?.functionDescription && (
                              <BlueprintSection icon={<BookOpen className="h-3 w-3" />} label="Function">
                                <p className="text-xs text-foreground/80 leading-relaxed">{bp.functionDescription}</p>
                              </BlueprintSection>
                            )}

                            {/* Canon constraints */}
                            <BlueprintSection icon={<Shield className="h-3 w-3" />} label="Canon Constraints">
                              <ConstraintList items={bp?.canonConstraints} emptyText="No canon constraints" />
                            </BlueprintSection>

                            {/* Targeting notes */}
                            {bp?.targetingNotes && bp.targetingNotes.length > 0 && (
                              <BlueprintSection icon={<Target className="h-3 w-3" />} label="Notes Targeting This Act">
                                <ConstraintList items={bp.targetingNotes} />
                              </BlueprintSection>
                            )}

                            {/* Arc-state deltas */}
                            <BlueprintSection icon={<GitBranch className="h-3 w-3" />} label="Arc-State from Prior Acts">
                              <ArcStateSection deltas={act.arc_state_deltas} />
                            </BlueprintSection>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Bottom info text */}
      {safeActs.length > 0 && (
        <p className="text-[11px] text-muted-foreground/60 text-center">
          {isAnyRewriting
            ? 'Rewrite in progress — status updates every few seconds.'
            : 'Edit act content directly, save changes, then assemble into a new version.'}
        </p>
      )}
    </div>
  );
}

export const Kh = TreatmentRewritePanel;