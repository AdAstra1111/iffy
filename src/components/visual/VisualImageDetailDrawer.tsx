/**
 * VisualImageDetailDrawer — Reusable image inspection + regeneration control.
 *
 * Shows exact final prompt, provenance/metadata, edit prompt + redo,
 * canon/authority validation, and version history for any generated visual asset.
 *
 * Designed as a pipeline-wide primitive reusable across PD, Cast, LookBook, etc.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Copy, RefreshCw, Wand2, ChevronDown, ChevronRight,
  Clock, Cpu, Image as ImageIcon, Layers, AlertTriangle,
  ShieldCheck, ShieldAlert, ShieldX, Eye,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { validateNoteAgainstCanon, type NoteValidationResult } from '@/lib/visual/canonNoteValidator';

// ── Types ──

export interface ImageDetailData {
  id: string;
  prompt_used: string | null;
  negative_prompt: string | null;
  model: string | null;
  provider: string | null;
  shot_type: string | null;
  generation_purpose: string | null;
  subject: string | null;
  strategy_key: string | null;
  style_mode: string | null;
  generation_config: Record<string, any> | null;
  truth_snapshot_json: Record<string, any> | null;
  storage_path: string | null;
  storage_bucket: string | null;
  created_at: string | null;
  width: number | null;
  height: number | null;
  freshness_status: string | null;
  stale_reason: string | null;
  asset_group: string | null;
  lane_key: string | null;
}

export interface VisualImageDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  imageId: string | null;
  projectId: string;
  /** Canon JSON for validation */
  canonJson?: Record<string, any> | null;
  /** Callback to regenerate a single slot with a prompt */
  onRegenerateSlot?: (imageId: string, prompt: string) => Promise<void>;
  /** Callback to redo slot with original prompt */
  onRedoSlot?: (imageId: string) => Promise<void>;
  /** Slot/family context labels */
  slotLabel?: string;
  familyLabel?: string;
}

// ── Collapsible section ──

function Section({
  title, icon, children, defaultOpen = false,
}: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/30 rounded-md overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/10 transition-colors"
      >
        {icon}
        <span className="text-xs font-medium text-foreground flex-1">{title}</span>
        {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
      </button>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

// ── Metadata row ──

function MetaRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-2 text-[10px]">
      <span className="text-muted-foreground shrink-0 w-24 uppercase tracking-wider">{label}</span>
      <span className="text-foreground break-all">{String(value)}</span>
    </div>
  );
}

// ── Main Component ──

export function VisualImageDetailDrawer({
  open, onClose, imageId, projectId, canonJson,
  onRegenerateSlot, onRedoSlot,
  slotLabel, familyLabel,
}: VisualImageDetailDrawerProps) {
  const [data, setData] = useState<ImageDetailData | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [validation, setValidation] = useState<NoteValidationResult | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; created_at: string; prompt_used: string | null }>>([]);

  // Load image data
  useEffect(() => {
    if (!open || !imageId) {
      setData(null);
      setImageUrl(null);
      setIsEditing(false);
      setValidation(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: img } = await (supabase as any)
        .from('project_images')
        .select('id, prompt_used, negative_prompt, model, provider, shot_type, generation_purpose, subject, strategy_key, style_mode, generation_config, truth_snapshot_json, storage_path, storage_bucket, created_at, width, height, freshness_status, stale_reason, asset_group, lane_key')
        .eq('id', imageId)
        .maybeSingle();
      if (cancelled) return;
      setData(img || null);

      if (img?.prompt_used) {
        setEditedPrompt(img.prompt_used);
      }

      // Signed URL
      if (img?.storage_path) {
        const { data: signed } = await supabase.storage
          .from(img.storage_bucket || 'project-images')
          .createSignedUrl(img.storage_path, 3600);
        if (!cancelled && signed?.signedUrl) setImageUrl(signed.signedUrl);
      }

      // Load history (same subject + shot_type + generation_purpose within project)
      if (img?.subject && img?.shot_type) {
        const { data: hist } = await (supabase as any)
          .from('project_images')
          .select('id, created_at, prompt_used')
          .eq('project_id', projectId)
          .eq('subject', img.subject)
          .eq('shot_type', img.shot_type)
          .eq('generation_purpose', img.generation_purpose || 'production_design')
          .order('created_at', { ascending: false })
          .limit(10);
        if (!cancelled && hist) setHistory(hist);
      }

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, imageId, projectId]);

  // Live validation of edited prompt
  useEffect(() => {
    if (!isEditing || !editedPrompt.trim() || !canonJson) {
      setValidation(null);
      return;
    }
    const timer = setTimeout(() => {
      // Compare edited vs original — only validate the diff
      if (editedPrompt === data?.prompt_used) {
        setValidation(null);
        return;
      }
      setValidation(validateNoteAgainstCanon(editedPrompt, canonJson));
    }, 400);
    return () => clearTimeout(timer);
  }, [editedPrompt, isEditing, canonJson, data?.prompt_used]);

  const handleCopyPrompt = useCallback(() => {
    if (data?.prompt_used) {
      navigator.clipboard.writeText(data.prompt_used);
      toast.success('Prompt copied to clipboard');
    }
  }, [data?.prompt_used]);

  const handleRedoAsIs = useCallback(async () => {
    if (!imageId || !onRedoSlot) return;
    setRegenerating(true);
    try {
      await onRedoSlot(imageId);
      toast.success('Regeneration started');
    } catch (err: any) {
      toast.error(`Regeneration failed: ${err.message}`);
    } finally {
      setRegenerating(false);
    }
  }, [imageId, onRedoSlot]);

  const handleEditedRedo = useCallback(async () => {
    if (!imageId || !onRegenerateSlot || !editedPrompt.trim()) return;
    if (validation?.level === 'hard_conflict') {
      toast.error('Prompt blocked by canon conflict');
      return;
    }
    setRegenerating(true);
    try {
      await onRegenerateSlot(imageId, editedPrompt);
      toast.success('Regeneration with edited prompt started');
      setIsEditing(false);
    } catch (err: any) {
      toast.error(`Regeneration failed: ${err.message}`);
    } finally {
      setRegenerating(false);
    }
  }, [imageId, onRegenerateSlot, editedPrompt, validation]);

  const gc = data?.generation_config || {};
  const hasPrompt = !!data?.prompt_used;

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            <SheetHeader className="space-y-1">
              <SheetTitle className="text-sm font-display">
                Image Detail
              </SheetTitle>
              {(slotLabel || familyLabel) && (
                <div className="flex items-center gap-1.5">
                  {familyLabel && <Badge variant="outline" className="text-[9px]">{familyLabel}</Badge>}
                  {slotLabel && <Badge variant="outline" className="text-[9px] text-muted-foreground">{slotLabel}</Badge>}
                </div>
              )}
            </SheetHeader>

            {/* Image preview */}
            {imageUrl && (
              <div className="rounded-lg border border-border/30 overflow-hidden bg-muted/10">
                <img src={imageUrl} alt={data?.subject || 'Generated image'} className="w-full object-contain max-h-64" />
              </div>
            )}

            {/* Freshness indicator */}
            {data?.freshness_status === 'stale' && (
              <div className="flex items-start gap-2 text-[10px] bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-md px-2.5 py-2">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium">Stale</span>
                  {data.stale_reason && <p className="mt-0.5">{data.stale_reason}</p>}
                </div>
              </div>
            )}

            {loading && (
              <div className="text-xs text-muted-foreground text-center py-4">Loading…</div>
            )}

            {data && !loading && (
              <>
                {/* A. PROMPT */}
                <Section
                  title="Prompt"
                  icon={<Wand2 className="h-3 w-3 text-primary" />}
                  defaultOpen
                >
                  {hasPrompt ? (
                    <div className="space-y-2">
                      {isEditing ? (
                        <Textarea
                          value={editedPrompt}
                          onChange={e => setEditedPrompt(e.target.value)}
                          className="text-[10px] font-mono min-h-[200px] resize-y leading-relaxed"
                        />
                      ) : (
                        <pre className="text-[10px] font-mono whitespace-pre-wrap text-foreground/90 bg-muted/20 rounded-md p-2.5 max-h-[300px] overflow-y-auto leading-relaxed border border-border/20">
                          {data.prompt_used}
                        </pre>
                      )}

                      {/* Validation badge */}
                      {isEditing && validation && validation.level !== 'safe' && (
                        <div className={`flex items-start gap-1.5 text-[10px] rounded-md px-2 py-1.5 ${
                          validation.level === 'soft_conflict'
                            ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                            : 'bg-destructive/10 text-destructive border border-destructive/20'
                        }`}>
                          {validation.level === 'soft_conflict'
                            ? <ShieldAlert className="h-3 w-3 mt-0.5 shrink-0" />
                            : <ShieldX className="h-3 w-3 mt-0.5 shrink-0" />}
                          <div>
                            <span className="font-medium">
                              {validation.level === 'soft_conflict' ? 'Soft Conflict' : 'Hard Conflict — Blocked'}
                            </span>
                            {validation.reasons.map((r, i) => <p key={i} className="mt-0.5">{r}</p>)}
                          </div>
                        </div>
                      )}

                      {/* Slot-scope indicator */}
                      {slotLabel && (
                        <p className="text-[9px] text-muted-foreground mb-1">
                          Actions below affect <span className="font-medium text-foreground/80">this slot only</span> — sibling slots remain untouched.
                        </p>
                      )}

                      {/* Prompt actions */}
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="ghost" className="text-[10px] h-7 gap-1" onClick={handleCopyPrompt}>
                          <Copy className="h-3 w-3" /> Copy
                        </Button>
                        {!isEditing ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-[10px] h-7 gap-1"
                            onClick={() => { setIsEditing(true); setEditedPrompt(data.prompt_used || ''); }}
                          >
                            <Wand2 className="h-3 w-3" /> Edit Prompt
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              className="text-[10px] h-7 gap-1"
                              disabled={regenerating || validation?.level === 'hard_conflict' || !editedPrompt.trim()}
                              onClick={handleEditedRedo}
                            >
                              {validation?.level === 'soft_conflict'
                                ? <><ShieldAlert className="h-3 w-3" /> Redo Slot with Warning</>
                                : validation?.level === 'safe' || !validation
                                ? <><ShieldCheck className="h-3 w-3" /> Redo This Slot</>
                                : <><ShieldX className="h-3 w-3" /> Blocked</>}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-[10px] h-7"
                              onClick={() => { setIsEditing(false); setValidation(null); }}
                            >
                              Cancel
                            </Button>
                          </>
                        )}
                        {onRedoSlot && !isEditing && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[10px] h-7 gap-1"
                            disabled={regenerating}
                            onClick={handleRedoAsIs}
                          >
                            <RefreshCw className="h-3 w-3" /> Redo Slot As-Is
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground italic">No prompt data persisted for this image.</p>
                  )}
                </Section>

                {/* B. MOTIF DIAGNOSTICS (when present) */}
                {gc.motif_validation && (
                  <Section
                    title="Motif Diagnostics"
                    icon={<Layers className="h-3 w-3 text-amber-500" />}
                    defaultOpen
                  >
                    <div className="space-y-2">
                      {/* Selection & Lineage Status */}
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className={`text-[9px] ${
                          gc.motif_validation.selection_status === 'selected_valid'
                            ? 'border-green-500/30 text-green-600'
                            : gc.motif_validation.selection_status?.startsWith('blocked_')
                            ? 'border-destructive/30 text-destructive'
                            : gc.motif_validation.selection_status?.startsWith('rejected_')
                            ? 'border-destructive/30 text-destructive'
                            : 'border-border/40 text-muted-foreground'
                        }`}>
                          {gc.motif_validation.selection_status?.replace(/_/g, ' ') || 'Unknown'}
                        </Badge>
                        <Badge variant="outline" className={`text-[9px] ${
                          gc.motif_validation.lineage_status === 'anchor'
                            ? 'border-amber-500/30 text-amber-600'
                            : gc.motif_validation.lineage_status === 'match'
                            ? 'border-green-500/30 text-green-600'
                            : gc.motif_validation.lineage_status === 'mismatch'
                            ? 'border-destructive/30 text-destructive'
                            : 'border-border/40 text-muted-foreground'
                        }`}>
                          Lineage: {gc.motif_validation.lineage_status?.replace(/_/g, ' ') || 'N/A'}
                        </Badge>
                      </div>

                      {/* Fingerprint */}
                      {gc.motif_validation.fingerprint_key && (
                        <MetaRow label="Fingerprint" value={gc.motif_validation.fingerprint_key} />
                      )}

                      {/* Scores */}
                      {gc.motif_validation.scores && (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                          <MetaRow label="Plausibility" value={gc.motif_validation.scores.physical_plausibility} />
                          <MetaRow label="Material" value={gc.motif_validation.scores.material_legibility} />
                          <MetaRow label="Use Trace" value={gc.motif_validation.scores.use_trace} />
                          <MetaRow label="Embedded" value={gc.motif_validation.scores.world_embeddedness} />
                          <MetaRow label="Lineage" value={gc.motif_validation.scores.motif_lineage} />
                          <MetaRow label="Overall" value={gc.motif_validation.overall_score} />
                        </div>
                      )}

                      {/* Hard Fails */}
                      {gc.motif_validation.hard_fail_codes?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {gc.motif_validation.hard_fail_codes.map((code: string) => (
                            <Badge key={code} className="text-[8px] bg-destructive/10 text-destructive border-destructive/20">
                              {code.replace(/_/g, ' ')}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Advisory Codes */}
                      {gc.motif_validation.advisory_codes?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {gc.motif_validation.advisory_codes.map((code: string) => (
                            <Badge key={code} variant="outline" className="text-[8px] border-amber-500/30 text-amber-600">
                              {code.replace(/_/g, ' ')}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Slot Expectation */}
                      {gc.motif_validation.slot_expectation_failures?.length > 0 && (
                        <div className="text-[10px] text-destructive">
                          Slot expectations: {gc.motif_validation.slot_expectation_failures.join(', ')}
                        </div>
                      )}

                      {/* Anchor Ref */}
                      {gc.motif_validation.family_anchor_ref && (
                        <MetaRow label="Anchor Ref" value={gc.motif_validation.family_anchor_ref} />
                      )}

                      <MetaRow label="Scoring" value={gc.motif_validation.scoring_model} />
                    </div>
                  </Section>
                )}

                {/* C. PROVENANCE */}
                <Section
                  title="Provenance"
                  icon={<Layers className="h-3 w-3 text-muted-foreground" />}
                >
                  <div className="space-y-1.5">
                    <MetaRow label="Section" value={gc.section} />
                    <MetaRow label="Asset Group" value={data.asset_group} />
                    <MetaRow label="Authority" value={gc.slot_authority} />
                    <MetaRow label="Architecture" value={gc.production_design_architecture} />
                    <MetaRow label="PD Hash" value={gc.production_design_hash} />
                    <MetaRow label="Style Lock" value={gc.style_lock_active ? `Active (${gc.style_lock_hash})` : 'Inactive'} />
                    <MetaRow label="Canon Binding" value={gc.canonical_binding_status} />
                    <MetaRow label="World Bound" value={gc.world_binding_active ? 'Yes' : 'No'} />
                    <MetaRow label="World Era" value={gc.world_binding_era} />
                    <MetaRow label="Locations" value={gc.resolved_location_names?.join(', ')} />
                    <MetaRow label="Targeting" value={gc.targeting_mode} />
                    <MetaRow label="Narrative" value={gc.narrative_source} />
                    {data.negative_prompt && (
                      <div className="mt-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Negatives</p>
                        <p className="text-[10px] text-foreground/70 bg-muted/20 rounded p-1.5 font-mono">{data.negative_prompt}</p>
                      </div>
                    )}
                  </div>
                </Section>

                {/* C. METADATA */}
                <Section
                  title="Metadata"
                  icon={<Cpu className="h-3 w-3 text-muted-foreground" />}
                >
                  <div className="space-y-1.5">
                    <MetaRow label="Model" value={data.model} />
                    <MetaRow label="Provider" value={data.provider} />
                    <MetaRow label="Generated" value={data.created_at ? new Date(data.created_at).toLocaleString() : null} />
                    <MetaRow label="Purpose" value={data.generation_purpose} />
                    <MetaRow label="Subject" value={data.subject} />
                    <MetaRow label="Shot Type" value={data.shot_type} />
                    <MetaRow label="Strategy" value={data.strategy_key} />
                    <MetaRow label="Style Mode" value={data.style_mode} />
                    <MetaRow label="Lane" value={data.lane_key} />
                    <MetaRow label="Dimensions" value={data.width && data.height ? `${data.width}×${data.height}` : null} />
                    <MetaRow label="Aspect" value={gc.requested_aspect_ratio} />
                    <MetaRow label="Vertical" value={gc.vertical_drama_project ? 'Yes' : undefined} />
                    <MetaRow label="Freshness" value={data.freshness_status} />
                  </div>
                </Section>

                {/* D. HISTORY */}
                {history.length > 1 && (
                  <Section
                    title={`History (${history.length})`}
                    icon={<Clock className="h-3 w-3 text-muted-foreground" />}
                  >
                    <div className="space-y-1.5">
                      {history.map((h, i) => (
                        <div
                          key={h.id}
                          className={`flex items-center gap-2 text-[10px] rounded-md px-2 py-1.5 ${
                            h.id === imageId ? 'bg-primary/10 border border-primary/20' : 'bg-muted/10 border border-border/20'
                          }`}
                        >
                          <Eye className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-foreground flex-1 truncate">
                            {h.id === imageId ? 'Current' : `v${history.length - i}`}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {h.created_at ? new Date(h.created_at).toLocaleString() : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
