/**
 * ProductionDesign — Real workspace for building the visual world.
 * Supports: approve, lock, reject, redo, retry-with-notes per family.
 * Supports: image-level prompt inspection + regeneration via VisualImageDetailDrawer.
 * Supports: motif family grouping with lineage/anchor diagnostics from persisted data.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Palette, ArrowLeft, MapPin, Sun, Layers, Sparkles, Check, Lock, Loader2,
  AlertCircle, ChevronDown, ChevronRight, Wand2, RefreshCw, Play, XCircle,
  Trash2, RotateCcw, MessageSquarePlus, ShieldAlert, ShieldCheck, ShieldX,
  Database, Fingerprint, ShieldOff, Anchor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import {
  useProductionDesignOrchestrator,
  type PDFamily,
  type FamilyBuildState,
} from '@/hooks/useProductionDesignOrchestrator';
import type { VisualSet, VisualSetSlot } from '@/hooks/useVisualSets';
import type { NoteValidationResult } from '@/lib/visual/canonNoteValidator';
import { VisualImageDetailDrawer } from '@/components/visual/VisualImageDetailDrawer';
import {
  extractMotifDiagnostics,
  motifSelectionLabel,
  motifLineageLabel,
  type MotifDiagnosticsPayload,
} from '@/lib/visual/motifAnchorResolver';

// ── Family icon map ──
const DOMAIN_ICONS: Record<string, typeof MapPin> = {
  production_design_location: MapPin,
  production_design_atmosphere: Sun,
  production_design_texture: Layers,
  production_design_motif: Sparkles,
};

// ── State badge ──
function StateBadge({ state }: { state: FamilyBuildState | string }) {
  const config: Record<string, { label: string; classes: string }> = {
    pending: { label: 'Pending', classes: 'bg-muted/50 text-muted-foreground border-border/30' },
    generating: { label: 'Generating…', classes: 'bg-primary/10 text-primary border-primary/20 animate-pulse' },
    partial: { label: 'Partial', classes: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    ready: { label: 'Ready for Review', classes: 'bg-accent/10 text-accent-foreground border-accent/20' },
    approved: { label: 'Approved', classes: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    locked: { label: 'Locked', classes: 'bg-primary/10 text-primary border-primary/20' },
    failed: { label: 'Failed', classes: 'bg-destructive/10 text-destructive border-destructive/20' },
    rejected: { label: 'Rejected', classes: 'bg-destructive/10 text-destructive border-destructive/20' },
  };
  const c = config[state] || config.pending;
  return <Badge className={`text-[9px] ${c.classes}`}>{c.label}</Badge>;
}

// ── Slot image thumbnail with motif diagnostics ──
function SlotThumb({
  slot, projectId, onClick, onRejectedClick, isGenerating, isMotifFamily,
}: {
  slot: VisualSetSlot; projectId: string; onClick?: () => void; onRejectedClick?: () => void; isGenerating?: boolean; isMotifFamily?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [motifDiag, setMotifDiag] = useState<MotifDiagnosticsPayload | null>(null);
  const [blockedCandidateCount, setBlockedCandidateCount] = useState(0);
  const [latestRejectedImageId, setLatestRejectedImageId] = useState<string | null>(null);

  useEffect(() => {
    if (!slot.selected_image_id) {
      setUrl(null);
      setMotifDiag(null);
      // Check for blocked candidates (generated but not selected)
      if (isMotifFamily && slot.id) {
        (async () => {
          const { data, count } = await (supabase as any)
            .from('visual_set_candidates')
            .select('image_id', { count: 'exact' })
            .eq('visual_set_slot_id', slot.id)
            .eq('selected_for_slot', false)
            .order('created_at', { ascending: false })
            .limit(1);
          setBlockedCandidateCount(count || 0);
          setLatestRejectedImageId(data?.[0]?.image_id || null);
        })();
      }
      return;
    }
    setBlockedCandidateCount(0);
    setLatestRejectedImageId(null);
    let cancelled = false;
    (async () => {
      const { data: img } = await (supabase as any)
        .from('project_images')
        .select('storage_path, storage_bucket, generation_config')
        .eq('id', slot.selected_image_id)
        .maybeSingle();
      if (cancelled || !img?.storage_path) return;
      const { data: signed } = await supabase.storage
        .from(img.storage_bucket || 'project-images')
        .createSignedUrl(img.storage_path, 3600);
      if (!cancelled && signed?.signedUrl) setUrl(signed.signedUrl);
      if (!cancelled && isMotifFamily) {
        setMotifDiag(extractMotifDiagnostics(img.generation_config));
      }
    })();
    return () => { cancelled = true; };
  }, [slot.selected_image_id, slot.id, projectId, isMotifFamily]);

  const isFailed = !slot.selected_image_id && slot.state !== 'empty' && !isGenerating;

  // Currently generating this slot
  if (isGenerating && !slot.selected_image_id) {
    return (
      <div className="aspect-[4/3] rounded-md border border-primary/40 bg-primary/5 flex flex-col items-center justify-center gap-1 animate-pulse ring-1 ring-primary/20">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-[9px] text-primary font-medium">Generating…</span>
      </div>
    );
  }

  if (!slot.selected_image_id) {
    const hasRejected = blockedCandidateCount > 0;
    const canInspect = hasRejected && latestRejectedImageId && onRejectedClick;
    return (
      <div className="space-y-0.5">
        <div
          className={`aspect-[4/3] rounded-md border border-dashed flex flex-col items-center justify-center gap-0.5 ${
            isFailed
              ? 'border-destructive/30 bg-destructive/5'
              : hasRejected
              ? 'border-amber-500/30 bg-amber-500/5'
              : 'border-border/40 bg-muted/20'
          } ${canInspect ? 'cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/10 transition-colors' : ''}`}
          onClick={canInspect ? onRejectedClick : undefined}
        >
          {isFailed ? (
            <XCircle className="h-3.5 w-3.5 text-destructive/40" />
          ) : hasRejected ? (
            <>
              <ShieldX className="h-3 w-3 text-amber-600/60" />
              <span className="text-[8px] text-amber-600/80">{blockedCandidateCount} blocked</span>
              {canInspect && <span className="text-[7px] text-amber-600/60">tap to inspect</span>}
            </>
          ) : (
            <span className="text-[10px] text-muted-foreground/50">Empty</span>
          )}
        </div>
        {hasRejected && (
          <Badge className="text-[7px] gap-0.5 bg-amber-500/10 text-amber-600 border-amber-500/20 w-fit">
            <ShieldX className="h-2 w-2" /> {blockedCandidateCount} rejected
          </Badge>
        )}
      </div>
    );
  }

  // Motif lineage/selection status badge
  const motifStatusBadge = motifDiag ? (
    <MotifSlotStatusBadge diag={motifDiag} />
  ) : null;

  return (
    <div className="space-y-0.5">
      <div
        className={`aspect-[4/3] rounded-md border overflow-hidden bg-muted/10 cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all ${
          motifDiag?.lineage_status === 'anchor' ? 'border-amber-500/40 ring-1 ring-amber-500/20' :
          motifDiag?.selection_status && motifDiag.selection_status !== 'selected_valid' ? 'border-destructive/30' :
          'border-border/30'
        }`}
        onClick={onClick}
      >
        {url ? (
          <img src={url} alt={slot.slot_label} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40" />
          </div>
        )}
      </div>
      {motifStatusBadge}
    </div>
  );
}

// ── Motif slot status badge ──
function MotifSlotStatusBadge({ diag }: { diag: MotifDiagnosticsPayload }) {
  if (!diag.selection_status) return null;

  const isAnchor = diag.lineage_status === 'anchor';
  const isValid = diag.selection_status === 'selected_valid';
  const isBlocked = diag.selection_status?.startsWith('blocked_');
  const isRejected = diag.selection_status?.startsWith('rejected_');

  if (isAnchor && isValid) {
    return (
      <Badge className="text-[8px] gap-0.5 bg-amber-500/15 text-amber-600 border-amber-500/30 w-fit">
        <Anchor className="h-2 w-2" /> Anchor
      </Badge>
    );
  }

  if (isBlocked) {
    return (
      <Badge className="text-[8px] gap-0.5 bg-destructive/10 text-destructive border-destructive/20 w-fit">
        <ShieldOff className="h-2 w-2" /> {motifLineageLabel(diag.lineage_status)}
      </Badge>
    );
  }

  if (isRejected) {
    return (
      <Badge className="text-[8px] gap-0.5 bg-destructive/10 text-destructive border-destructive/20 w-fit">
        <ShieldX className="h-2 w-2" /> Rejected
      </Badge>
    );
  }

  if (isValid && diag.lineage_status === 'match') {
    return (
      <Badge className="text-[8px] gap-0.5 bg-green-500/10 text-green-600 border-green-500/30 w-fit">
        <Check className="h-2 w-2" /> Lineage Match
      </Badge>
    );
  }

  if (isValid) {
    return (
      <Badge className="text-[8px] gap-0.5 bg-primary/10 text-primary border-primary/20 w-fit">
        <Check className="h-2 w-2" /> Valid
      </Badge>
    );
  }

  return null;
}

// ── Note Validation Indicator ──
function NoteValidationBadge({ result }: { result: NoteValidationResult | null }) {
  if (!result || result.level === 'safe') return null;
  const isSoft = result.level === 'soft_conflict';
  return (
    <div className={`flex items-start gap-1.5 text-[10px] rounded-md px-2 py-1.5 ${
      isSoft ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'
    }`}>
      {isSoft ? <ShieldAlert className="h-3 w-3 mt-0.5 shrink-0" /> : <ShieldX className="h-3 w-3 mt-0.5 shrink-0" />}
      <div>
        <span className="font-medium">{isSoft ? 'Soft Conflict' : 'Hard Conflict — Blocked'}</span>
        {result.reasons.map((r, i) => <p key={i} className="mt-0.5">{r}</p>)}
      </div>
    </div>
  );
}

// ── Family Row ──
function FamilyRow({
  family,
  set,
  projectId,
  effectiveState,
  onApproveAll,
  onLock,
  onRetryFamily,
  onRejectFamily,
  onRedoFamily,
  onRetryWithNotes,
  onUnapproveAndRedo,
  onImageClick,
  validateNote,
  fetchSlots,
  buildState,
  isBuilding,
  slotCompletedTick,
  activeSlotKey,
}: {
  family: PDFamily;
  set: VisualSet | undefined;
  projectId: string;
  effectiveState: FamilyBuildState;
  onApproveAll: (setId: string) => void;
  onLock: (setId: string) => void;
  onRetryFamily: (family: PDFamily) => void;
  onRejectFamily: (family: PDFamily) => void;
  onRedoFamily: (family: PDFamily) => void;
  onRetryWithNotes: (family: PDFamily, note: string) => void;
  onUnapproveAndRedo: (family: PDFamily) => void;
  onImageClick: (imageId: string, slotLabel: string, familyLabel: string) => void;
  validateNote: (note: string) => NoteValidationResult;
  fetchSlots: (setId: string) => Promise<VisualSetSlot[]>;
  buildState?: { state: FamilyBuildState; totalSlots: number; filledSlots: number; failedSlots: number; activeSlotLabel?: string };
  isBuilding: boolean;
  /** Monotonic tick — triggers immediate slot refresh when incremented */
  slotCompletedTick: number;
  /** The slot_key currently being generated across the whole build */
  activeSlotKey?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [slots, setSlots] = useState<VisualSetSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteValidation, setNoteValidation] = useState<NoteValidationResult | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const Icon = DOMAIN_ICONS[family.domain] || Palette;

  const isLocked = effectiveState === 'locked';
  const isRejected = effectiveState === 'rejected';

  const loadSlots = useCallback(async () => {
    if (!set) return;
    setLoadingSlots(true);
    try {
      const s = await fetchSlots(set.id);
      setSlots(s);
    } finally {
      setLoadingSlots(false);
    }
  }, [set, fetchSlots]);

  useEffect(() => {
    if (expanded && set) loadSlots();
  }, [expanded, set, loadSlots]);

  useEffect(() => {
    if (effectiveState === 'generating' || effectiveState === 'ready' || effectiveState === 'failed') {
      setExpanded(true);
    }
  }, [effectiveState]);

  useEffect(() => {
    if (isLocked) setExpanded(true);
  }, [isLocked]);

  // Immediate refresh when a slot completes (tick changes)
  useEffect(() => {
    if (slotCompletedTick > 0 && expanded && set) loadSlots();
  }, [slotCompletedTick, expanded, set, loadSlots]);

  // Fallback polling during generation (slower since tick handles immediate)
  useEffect(() => {
    if (effectiveState !== 'generating' || !set) return;
    const interval = setInterval(loadSlots, 6000);
    return () => clearInterval(interval);
  }, [effectiveState, set, loadSlots]);

  useEffect(() => {
    if (effectiveState === 'generating' && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [effectiveState]);

  // Live note validation
  useEffect(() => {
    if (!noteText.trim()) {
      setNoteValidation(null);
      return;
    }
    const timer = setTimeout(() => {
      setNoteValidation(validateNote(noteText));
    }, 300);
    return () => clearTimeout(timer);
  }, [noteText, validateNote]);

  const filledSlots = slots.filter(s => s.selected_image_id);
  const approvedSlots = slots.filter(s => s.state === 'approved' || s.state === 'locked');
  const totalSlotCount = buildState?.totalSlots || slots.length;
  const filledCount = buildState?.filledSlots ?? filledSlots.length;
  const hasAnyContent = filledSlots.length > 0;
  // Track whether family has rejected-only slots (no selection but candidates exist)
  const [rejectedCandidateMap, setRejectedCandidateMap] = useState<Record<string, string | null>>({});
  const hasRejectedOnly = !hasAnyContent && slots.length > 0 && Object.keys(rejectedCandidateMap).length > 0;

  // Build rejected candidate map for motif families
  useEffect(() => {
    if (family.domain !== 'production_design_motif' || slots.length === 0) return;
    const slotsWithoutSelection = slots.filter(s => !s.selected_image_id);
    if (slotsWithoutSelection.length === 0) { setRejectedCandidateMap({}); return; }
    let cancelled = false;
    (async () => {
      const map: Record<string, string | null> = {};
      await Promise.all(slotsWithoutSelection.map(async (s) => {
        const { data } = await (supabase as any)
          .from('visual_set_candidates')
          .select('image_id')
          .eq('visual_set_slot_id', s.id)
          .eq('selected_for_slot', false)
          .order('created_at', { ascending: false })
          .limit(1);
        if (!cancelled && data?.length > 0) {
          map[s.id] = data[0].image_id || null;
        }
      }));
      if (!cancelled) setRejectedCandidateMap(map);
    })();
    return () => { cancelled = true; };
  }, [slots, family.domain]);

  const handleRetryWithNotes = () => {
    if (!noteText.trim()) return;
    if (noteValidation?.level === 'hard_conflict') return;
    onRetryWithNotes(family, noteText);
    setShowNoteInput(false);
    setNoteText('');
    setNoteValidation(null);
  };

  return (
    <div
      ref={rowRef}
      className={`rounded-lg border overflow-hidden transition-colors ${
        isLocked
          ? 'border-primary/30 bg-primary/5'
          : isRejected
          ? 'border-destructive/20 bg-destructive/[0.02]'
          : effectiveState === 'generating'
          ? 'border-primary/20 bg-primary/[0.03] ring-1 ring-primary/10'
          : effectiveState === 'failed'
          ? 'border-destructive/20 bg-destructive/[0.03]'
          : 'border-border/40 bg-card/30'
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 sm:p-4 text-left hover:bg-muted/10 transition-colors"
      >
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
          isLocked ? 'bg-primary/15' : isRejected ? 'bg-destructive/10' : effectiveState === 'generating' ? 'bg-primary/10' : 'bg-muted/30'
        }`}>
          {effectiveState === 'generating' ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : isLocked ? (
            <Lock className="h-4 w-4 text-primary" />
          ) : isRejected ? (
            <Trash2 className="h-4 w-4 text-destructive" />
          ) : effectiveState === 'failed' ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : (
            <Icon className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">{family.label}</span>
            <StateBadge state={effectiveState} />
            {totalSlotCount > 0 && effectiveState !== 'locked' && effectiveState !== 'pending' && effectiveState !== 'rejected' && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {filledCount}/{totalSlotCount}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {isRejected
              ? 'Rejected — requires regeneration'
              : effectiveState === 'generating' && buildState?.activeSlotLabel
              ? `Generating ${buildState.activeSlotLabel}…`
              : effectiveState === 'failed' && buildState?.failedSlots
              ? `${buildState.failedSlots} slot${buildState.failedSlots > 1 ? 's' : ''} failed`
              : family.description}
          </p>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {/* Slot-level progress bar during generation */}
      {effectiveState === 'generating' && totalSlotCount > 0 && (
        <div className="px-3 sm:px-4">
          <Progress
            value={totalSlotCount > 0 ? (filledCount / totalSlotCount) * 100 : 0}
            className="h-1"
          />
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 sm:px-4 sm:pb-4 space-y-3 pt-2">
          {/* Rejected state — show redo actions */}
          {isRejected && !isBuilding && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => onRedoFamily(family)}
              >
                <RotateCcw className="h-3 w-3" /> Redo Family
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1.5"
                onClick={() => setShowNoteInput(!showNoteInput)}
              >
                <MessageSquarePlus className="h-3 w-3" /> Retry with Notes
              </Button>
            </div>
          )}

          {/* Slot grid — only show if set exists and not rejected */}
          {set && !isRejected && (
            <>
              {loadingSlots ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading slots…
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {slots.map(slot => {
                      const isMotif = family.domain === 'production_design_motif';
                      const rejectedImageId = rejectedCandidateMap[slot.id];
                      return (
                        <div key={slot.id} className="space-y-1">
                          <SlotThumb
                            slot={slot}
                            projectId={projectId}
                            onClick={slot.selected_image_id ? () => onImageClick(slot.selected_image_id!, slot.slot_label, family.label) : undefined}
                            onRejectedClick={isMotif && rejectedImageId ? () => onImageClick(rejectedImageId, slot.slot_label, family.label) : undefined}
                            isGenerating={effectiveState === 'generating' && activeSlotKey === slot.slot_key && !slot.selected_image_id}
                            isMotifFamily={isMotif}
                          />
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground truncate flex-1">{slot.slot_label}</span>
                            {slot.state === 'approved' && <Check className="h-3 w-3 text-green-500" />}
                            {slot.state === 'locked' && <Lock className="h-3 w-3 text-primary" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {effectiveState === 'failed' && !isBuilding && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1.5 border-destructive/20 text-destructive hover:bg-destructive/10"
                        onClick={() => onRetryFamily(family)}
                      >
                        <RefreshCw className="h-3 w-3" /> Retry Failed Slots
                      </Button>
                    )}

                    {!isLocked && filledSlots.length > 0 && approvedSlots.length < filledSlots.length && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1.5"
                        onClick={() => onApproveAll(set.id)}
                      >
                        <Check className="h-3 w-3" /> Approve All
                      </Button>
                    )}
                    {!isLocked && (set.status === 'ready_to_lock' || approvedSlots.length >= slots.filter(s => s.is_required).length) && approvedSlots.length > 0 && (
                      <Button
                        size="sm"
                        className="text-xs gap-1.5"
                        onClick={() => onLock(set.id)}
                      >
                        <Lock className="h-3 w-3" /> Lock Set
                      </Button>
                    )}

                    {/* Reject / Redo / Retry with Notes — for non-locked sets with content or rejected-only motif slots */}
                    {!isLocked && (filledSlots.length > 0 || hasRejectedOnly) && !isBuilding && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs gap-1.5 text-destructive hover:bg-destructive/10"
                          onClick={() => onRejectFamily(family)}
                        >
                          <Trash2 className="h-3 w-3" /> Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs gap-1.5"
                          onClick={() => onRedoFamily(family)}
                        >
                          <RotateCcw className="h-3 w-3" /> Redo
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs gap-1.5"
                          onClick={() => setShowNoteInput(!showNoteInput)}
                        >
                          <MessageSquarePlus className="h-3 w-3" /> Retry with Notes
                        </Button>
                      </>
                    )}

                    {/* Unapprove + Redo for approved but unlocked */}
                    {!isLocked && approvedSlots.length > 0 && approvedSlots.length === filledSlots.length && !isBuilding && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs gap-1.5 text-amber-600 hover:bg-amber-500/10"
                        onClick={() => onUnapproveAndRedo(family)}
                      >
                        <RotateCcw className="h-3 w-3" /> Unapprove & Redo
                      </Button>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* Note input panel */}
          {showNoteInput && (
            <div className="space-y-2 rounded-md border border-border/40 bg-muted/10 p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Director Notes</p>
              <Textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="e.g. 'more severe architecture', 'cooler lighting', 'less pottery presence'"
                className="text-xs min-h-[60px] resize-none"
                maxLength={500}
              />
              <NoteValidationBadge result={noteValidation} />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="text-xs gap-1.5"
                  disabled={!noteText.trim() || noteValidation?.level === 'hard_conflict'}
                  onClick={handleRetryWithNotes}
                >
                  {noteValidation?.level === 'safe' || !noteValidation ? (
                    <ShieldCheck className="h-3 w-3" />
                  ) : (
                    <ShieldAlert className="h-3 w-3" />
                  )}
                  {noteValidation?.level === 'soft_conflict' ? 'Proceed with Warning' : 'Regenerate with Notes'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => { setShowNoteInput(false); setNoteText(''); setNoteValidation(null); }}
                >
                  Cancel
                </Button>
                <span className="text-[10px] text-muted-foreground ml-auto">{noteText.length}/500</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Global Build Summary Bar ──
function BuildSummaryBar({ orch }: { orch: ReturnType<typeof useProductionDesignOrchestrator> }) {
  const { buildProgress, buildStatus } = orch;
  const isBuilding = buildStatus === 'building';
  if (!isBuilding && buildProgress.total === 0) return null;

  const pct = buildProgress.total > 0 ? Math.round((buildProgress.done / buildProgress.total) * 100) : 0;
  const activeFamily = orch.requiredFamilies.find(f =>
    orch.familyKey(f) === buildProgress.activeFamilyKey,
  );

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          {isBuilding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          ) : buildProgress.failed > 0 ? (
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <Check className="h-3.5 w-3.5 text-primary" />
          )}
          <span className="font-medium text-foreground">
            {isBuilding ? 'Building Production Design' : buildProgress.failed > 0 ? 'Build completed with errors' : 'Build Complete'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {buildProgress.failed > 0 && (
            <span className="text-destructive">{buildProgress.failed} failed</span>
          )}
          <span className="tabular-nums font-medium text-foreground">{buildProgress.done}/{buildProgress.total} slots</span>
          <span className="tabular-nums font-medium text-foreground">{pct}%</span>
        </div>
      </div>
      <Progress value={pct} className="h-1.5" />
      {isBuilding && activeFamily && (
        <p className="text-[10px] text-muted-foreground">
          Generating {activeFamily.label}
          {buildProgress.activeSlotLabel ? ` — ${buildProgress.activeSlotLabel}` : ''}
        </p>
      )}
    </div>
  );
}

// ── Main Page ──
export default function ProductionDesign() {
  const { id: projectId } = useParams<{ id: string }>();
  const orch = useProductionDesignOrchestrator(projectId);

  const handleApproveAll = useCallback((setId: string) => {
    orch.approveAllSafe.mutate({ setId, includeReviewRequired: true });
  }, [orch.approveAllSafe]);

  const handleLock = useCallback((setId: string) => {
    orch.lockSet.mutate(setId);
  }, [orch.lockSet]);

  const handleRetryFamily = useCallback((family: PDFamily) => {
    orch.retryFamily(family);
  }, [orch.retryFamily]);

  const handleRejectFamily = useCallback((family: PDFamily) => {
    orch.rejectFamily(family);
  }, [orch.rejectFamily]);

  const handleRedoFamily = useCallback((family: PDFamily) => {
    orch.redoFamily(family);
  }, [orch.redoFamily]);

  const handleRetryWithNotes = useCallback((family: PDFamily, note: string) => {
    orch.retryWithNotes(family, note);
  }, [orch.retryWithNotes]);

  const handleUnapproveAndRedo = useCallback((family: PDFamily) => {
    orch.unapproveAndRedo(family);
  }, [orch.unapproveAndRedo]);

  // ── Drawer state ──
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerImageId, setDrawerImageId] = useState<string | null>(null);
  const [drawerSlotLabel, setDrawerSlotLabel] = useState<string | undefined>();
  const [drawerFamilyLabel, setDrawerFamilyLabel] = useState<string | undefined>();

  const handleImageClick = useCallback((imageId: string, slotLabel: string, familyLabel: string) => {
    setDrawerImageId(imageId);
    setDrawerSlotLabel(slotLabel);
    setDrawerFamilyLabel(familyLabel);
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
    setDrawerImageId(null);
  }, []);

  const { progressSummary, buildStatus } = orch;
  const isBuilding = buildStatus === 'building';
  const showAutoBuild = progressSummary.created < progressSummary.total || orch.hasIncompleteWork;
  const showContinue = progressSummary.created > 0 && orch.hasIncompleteWork && !isBuilding && buildStatus !== 'idle';

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Back */}
      <Link to={`/projects/${projectId}/casting`}>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground -ml-2">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Casting
        </Button>
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Palette className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-display font-semibold text-foreground">
              Production Design
            </h1>
            <p className="text-xs text-muted-foreground">
              Build the visual world before scene and poster generation
            </p>
          </div>
        </div>

        {/* Design truth summary */}
        {orch.pd && (
          <div className="space-y-1.5">
            {/* World / Era */}
            <div className="flex flex-wrap gap-1.5">
              {orch.styleProfile?.period && (
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary/80">
                  <span className="text-[8px] uppercase tracking-wider text-muted-foreground mr-1">Era</span>
                  {orch.styleProfile.period}
                </Badge>
              )}
              {orch.pd.architecture_style && (
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary/80">
                  <span className="text-[8px] uppercase tracking-wider text-muted-foreground mr-1">Style</span>
                  {orch.pd.architecture_style}
                </Badge>
              )}
            </div>
            {/* Structure / Surface */}
            {orch.pd.material_palette.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-[8px] uppercase tracking-wider text-muted-foreground self-center mr-0.5">Materials</span>
                {orch.pd.material_palette.slice(0, 5).map(m => (
                  <Badge key={m} variant="outline" className="text-[10px] text-muted-foreground border-border/40">{m}</Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dataset observability */}
        {(() => {
          const ds = orch.locationDatasets;
          const cs = ds.coverageSummary;
          const datasets = ds.datasets || [];
          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-md border border-border/30 bg-card/20 px-3 py-2">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Database className="h-3 w-3" />
                  <span>Datasets: <strong className="text-foreground">{cs.total}</strong></span>
                  {cs.fresh > 0 && <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-600">{cs.fresh} fresh</Badge>}
                  {cs.stale > 0 && <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-600">{cs.stale} stale</Badge>}
                  {cs.unknown > 0 && <Badge variant="outline" className="text-[9px] border-border/40 text-muted-foreground">{cs.unknown} unknown</Badge>}
                  {cs.lastRegeneration && (
                    <span className="text-[9px]">
                      Last built: {new Date(cs.lastRegeneration).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[10px] gap-1 h-6 px-2"
                  disabled={ds.regenerate.isPending}
                  onClick={() => ds.regenerate.mutate()}
                >
                  {ds.regenerate.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Rebuild Datasets
                </Button>
              </div>
              {/* Per-location hierarchy summary */}
              {datasets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {datasets.map(d => {
                    const tierColors: Record<string, string> = {
                      imperial: 'border-amber-500/40 text-amber-600',
                      elite: 'border-purple-500/40 text-purple-600',
                      working: 'border-blue-500/40 text-blue-600',
                      poor: 'border-stone-500/40 text-stone-600',
                    };
                    const tierColor = tierColors[d.status_tier] || 'border-border/40 text-muted-foreground';
                    const densityLabel = d.density_profile?.object_density || '';
                    const sigMaterials = d.material_privilege?.signature?.slice(0, 2)?.join(', ') || '';
                    return (
                      <div key={d.id} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] ${tierColor}`}>
                        <span className="font-medium">{d.location_name}</span>
                        <span className="opacity-60">·</span>
                        <span className="uppercase tracking-wider text-[8px]">{d.status_tier}</span>
                        {densityLabel && <><span className="opacity-60">·</span><span>{densityLabel}</span></>}
                        {sigMaterials && <><span className="opacity-60">·</span><span className="italic">{sigMaterials}</span></>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Global progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{progressSummary.locked} / {progressSummary.total} families locked</span>
          {progressSummary.allLocked && (
            <span className="text-primary font-medium flex items-center gap-1">
              <Check className="h-3 w-3" /> Production Design Complete
            </span>
          )}
        </div>
        <Progress
          value={progressSummary.total > 0 ? (progressSummary.locked / progressSummary.total) * 100 : 0}
          className="h-1.5"
        />
      </div>

      {/* Lock All button — appears when all families are eligible */}
      {progressSummary.lockAllEligible && !isBuilding && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-emerald-600" /> All Families Ready
            </p>
            <p className="text-xs text-muted-foreground">
              Lock all {progressSummary.total - progressSummary.locked} remaining families to finalize production design.
            </p>
          </div>
          <Button
            size="sm"
            className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={orch.lockAll}
          >
            <Lock className="h-3 w-3" /> Lock All
          </Button>
        </div>
      )}

      {/* Build summary bar */}
      <BuildSummaryBar orch={orch} />

      {/* Auto-build / Continue / Retry CTAs */}
      {showAutoBuild && !isBuilding && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Wand2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {showContinue ? 'Continue Production Design' : 'Auto-Build Production Design'}
              </p>
              <p className="text-xs text-muted-foreground">
                {showContinue
                  ? 'Resume generation for incomplete families. Approved and locked work will not be touched.'
                  : 'Generate environment, atmosphere, texture, and motif references from your project canon and visual style. All imagery is world-only — no characters.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="gap-1.5 text-xs"
              disabled={!orch.requiredFamilies.length}
              onClick={showContinue ? orch.continueBuild : orch.autoBuild}
            >
              {showContinue ? (
                <><Play className="h-3 w-3" /> Continue ({orch.requiredFamilies.length} families)</>
              ) : (
                <><Wand2 className="h-3 w-3" /> Auto-Build ({orch.requiredFamilies.length} families)</>
              )}
            </Button>

            {orch.hasFailedSlots && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs border-destructive/20 text-destructive hover:bg-destructive/10"
                onClick={orch.retryFailed}
              >
                <RefreshCw className="h-3 w-3" /> Retry Failed Only
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Building state — inline */}
      {isBuilding && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="text-xs gap-1.5 text-muted-foreground"
            onClick={orch.cancelBuild}
          >
            Cancel Build
          </Button>
        </div>
      )}

      {/* No families fallback */}
      {orch.requiredFamilies.length === 0 && (
        <div className="rounded-lg border border-border/30 bg-card/20 p-6 text-center space-y-2">
          <AlertCircle className="h-6 w-6 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No canon locations found. Add locations to your project canon first, then return here to build the visual world.
          </p>
        </div>
      )}

      {/* Family rows */}
      <div className="space-y-3">
        {orch.requiredFamilies.map(family => {
          const key = orch.familyKey(family);
          const fp = orch.buildProgress.familyProgress.get(key);
          const effectiveState = orch.getFamilyEffectiveState(family, fp);
          return (
            <FamilyRow
              key={key}
              family={family}
              set={orch.familySetMap.get(key)}
              projectId={projectId!}
              effectiveState={effectiveState}
              onApproveAll={handleApproveAll}
              onLock={handleLock}
              onRetryFamily={handleRetryFamily}
              onRejectFamily={handleRejectFamily}
              onRedoFamily={handleRedoFamily}
              onRetryWithNotes={handleRetryWithNotes}
              onUnapproveAndRedo={handleUnapproveAndRedo}
              onImageClick={handleImageClick}
              validateNote={orch.validateNote}
              fetchSlots={orch.fetchSlotsForSet}
              buildState={fp}
              isBuilding={isBuilding}
              slotCompletedTick={orch.buildProgress.slotCompletedTick}
              activeSlotKey={orch.buildProgress.activeFamilyKey === key ? orch.buildProgress.activeSlotKey : undefined}
            />
          );
        })}
      </div>

      {/* Next stage gate */}
      {progressSummary.allLocked && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-center space-y-2">
          <Lock className="h-6 w-6 mx-auto text-primary" />
          <p className="text-sm font-medium text-foreground">Production Design Locked</p>
          <p className="text-xs text-muted-foreground">
            All design families are locked. Your visual world is ready for downstream stages.
          </p>
        </div>
      )}

      {!progressSummary.allLocked && progressSummary.created > 0 && !isBuilding && !showAutoBuild && (
        <div className="rounded-lg border border-border/30 bg-card/20 p-4 text-center space-y-1">
          <p className="text-xs text-muted-foreground">
            Review, approve, and lock all design families to complete Production Design.
          </p>
        </div>
      )}

      {/* Image Detail Drawer */}
      <VisualImageDetailDrawer
        open={drawerOpen}
        onClose={handleDrawerClose}
        imageId={drawerImageId}
        projectId={projectId!}
        canonJson={orch.canon || null}
        onRegenerateSlot={orch.regenerateSlotWithPrompt}
        onRedoSlot={orch.redoSlotAsIs}
        slotLabel={drawerSlotLabel}
        familyLabel={drawerFamilyLabel}
      />
    </div>
  );
}
