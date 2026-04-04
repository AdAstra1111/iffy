/**
 * HeroFrameDetailViewer — Fullscreen provenance viewer for hero frame images.
 *
 * Shows: prompt, scene/moment, narrative function, character binding,
 * generation metadata. All data from existing generation_config + image fields.
 * No new backend queries.
 */
import { useState } from 'react';
import {
  ChevronLeft, ChevronRight, Lock, Star, Copy, Check,
  Frame, Eye, Layers, User, Sparkles, Camera, Map,
  Shield, ShieldAlert, AlertTriangle, X, Trash2, StarOff,
  Loader2, Target,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { classifyCharacterIdentity } from '@/lib/images/characterImageEligibility';
import { classifyPremiumImageQuality } from '@/lib/images/premiumQualityGate';

// ── Types ──────────────────────────────────────────────────────────

interface HeroFrameImage {
  id: string;
  signedUrl?: string | null;
  is_primary?: boolean;
  role?: string;
  curation_state?: string;
  width?: number | null;
  height?: number | null;
  subject?: string | null;
  subject_type?: string | null;
  model?: string | null;
  provider?: string | null;
  generation_config?: Record<string, unknown> | null;
}

interface HeroFrameDetailViewerProps {
  images: HeroFrameImage[];
  currentIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (index: number) => void;
  /** Recommendation badge for an image */
  getRecommendation?: (imgId: string) => { label: string; color: string; icon: React.ReactNode } | null;
  /** Action handlers */
  onSetPrimary?: (id: string) => void;
  onUnsetPrimary?: (id: string) => void;
  onApprove?: (id: string) => void;
  onUnapprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onDemoteAndReject?: (id: string) => void;
  /** Busy states */
  settingPrimary?: string | null;
  approvingId?: string | null;
  rejectingId?: string | null;
}

// ── Metadata Extraction ─────────────────────────────────────────────

function extractMetadata(img: HeroFrameImage) {
  const gc = (img.generation_config || {}) as Record<string, unknown>;

  return {
    // Prompt
    prompt: (gc.prompt || gc.prompt_used || '') as string,

    // Scene / Moment
    momentUsed: (gc.moment_used || gc.momentUsed || '') as string,
    slugline: (gc.slugline || '') as string,
    sceneNumber: (gc.scene_number || gc.sceneNumber || '') as string,

    // Narrative function
    narrativeFunction: (gc.narrative_function || gc.narrativeFunction || '') as string,

    // Character binding
    subject: img.subject || null,
    subjectType: img.subject_type || (gc.subject_type as string) || null,
    actorVersionId: (gc.actorVersionId || gc.actor_version_id || '') as string,
    referenceImagesTotal: (gc.reference_images_total ?? gc.referenceImagesTotal ?? null) as number | null,
    identityLocked: !!gc.identity_locked,
    identityMode: (gc.identity_mode || gc.identityMode || '') as string,

    // Generation
    model: img.model || (gc.model || gc.resolved_model || '') as string,
    provider: img.provider || (gc.provider || gc.resolved_provider || '') as string,
    qualityTarget: (gc.quality_target || gc.qualityTarget || '') as string,
    variantIndex: (gc.variant_index ?? gc.variantIndex ?? '') as string | number,

    // Anchor info
    anchorImageIds: gc.anchor_image_ids as string[] | undefined,
    referenceImageUrls: gc.reference_image_urls as string[] | undefined,
  };
}

// ── Component ────────────────────────────────────────────────────────

export function HeroFrameDetailViewer({
  images,
  currentIndex,
  open,
  onOpenChange,
  onNavigate,
  getRecommendation,
  onSetPrimary,
  onUnsetPrimary,
  onApprove,
  onUnapprove,
  onReject,
  onDemoteAndReject,
  settingPrimary,
  approvingId,
  rejectingId,
}: HeroFrameDetailViewerProps) {
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  if (!open || currentIndex < 0 || currentIndex >= images.length) return null;

  const img = images[currentIndex];
  const meta = extractMetadata(img);
  const isPrimary = img.is_primary && img.role === 'hero_primary';
  const isApproved = img.curation_state === 'active' && !isPrimary;
  const total = images.length;
  const rec = getRecommendation?.(img.id) ?? null;

  // Identity classification
  const identityResult = classifyCharacterIdentity(
    { id: img.id, subject_type: img.subject_type, subject: img.subject, generation_config: img.generation_config },
    'hero_frames',
  );
  const premiumResult = classifyPremiumImageQuality(img as any);

  const handleCopyPrompt = () => {
    if (meta.prompt) {
      navigator.clipboard.writeText(meta.prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  const MetadataRow = ({ label, value, icon }: { label: string; value: string | number | null | undefined; icon?: React.ReactNode }) => {
    if (!value && value !== 0) return null;
    return (
      <div className="flex items-start gap-2 py-1.5 border-b border-border/10 last:border-0">
        {icon && <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>}
        <div className="min-w-0 flex-1">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">{label}</p>
          <p className="text-xs text-foreground break-words">{String(value)}</p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[96vw] max-h-[96vh] p-0 gap-0 bg-background border-border/50 overflow-hidden">
        <div className="flex flex-col md:flex-row h-full max-h-[96vh]">
          {/* ── Image Panel ── */}
          <div className="relative bg-black/95 flex items-center justify-center md:flex-1 min-h-[250px] md:min-h-[400px]">
            {img.signedUrl ? (
              <img
                src={img.signedUrl}
                alt="Hero frame"
                className="w-full h-full max-h-[60vh] md:max-h-[96vh] object-contain"
              />
            ) : (
              <div className="w-full aspect-video flex items-center justify-center">
                <Frame className="h-10 w-10 text-muted-foreground/30" />
              </div>
            )}

            {/* Navigation */}
            {total > 1 && (
              <>
                <button
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 hover:bg-background/90 p-2 transition-colors"
                  onClick={() => onNavigate((currentIndex - 1 + total) % total)}
                >
                  <ChevronLeft className="h-5 w-5 text-foreground" />
                </button>
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 hover:bg-background/90 p-2 transition-colors"
                  onClick={() => onNavigate((currentIndex + 1) % total)}
                >
                  <ChevronRight className="h-5 w-5 text-foreground" />
                </button>
              </>
            )}

            {/* Counter */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
              <Badge variant="outline" className="bg-background/70 text-[10px] px-2 py-0.5 border-border/30">
                {currentIndex + 1} / {total}
              </Badge>
            </div>

            {/* Identity status badge top-left */}
            <div className="absolute top-3 left-3 flex flex-col gap-1">
              {isPrimary && (
                <Badge className="bg-primary text-primary-foreground text-[9px] px-1.5 py-0.5 shadow-md">
                  <Lock className="h-2.5 w-2.5 mr-0.5" /> CANONICAL ANCHOR
                </Badge>
              )}
              {isApproved && (
                <Badge className="bg-green-600/90 text-white text-[9px] px-1.5 py-0.5">
                  <Star className="h-2.5 w-2.5 mr-0.5" /> APPROVED
                </Badge>
              )}
              {!isPrimary && !isApproved && (
                <Badge variant="outline" className="bg-background/70 text-muted-foreground text-[9px] px-1.5 py-0.5">
                  CANDIDATE
                </Badge>
              )}
              {rec && (
                <Badge className={cn(rec.color, 'text-[8px] px-1.5 py-0.5')}>
                  {rec.icon} {rec.label}
                </Badge>
              )}
            </div>
          </div>

          {/* ── Metadata Panel ── */}
          <div className="md:w-[340px] lg:w-[380px] border-t md:border-t-0 md:border-l border-border/30 flex flex-col max-h-[40vh] md:max-h-[96vh]">
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {/* Identity Status */}
                <div className="rounded-md border p-2.5 space-y-1.5" style={{
                  borderColor: identityResult.eligible
                    ? 'hsl(var(--primary) / 0.3)'
                    : 'hsl(var(--destructive) / 0.3)',
                  backgroundColor: identityResult.eligible
                    ? 'hsl(var(--primary) / 0.05)'
                    : 'hsl(var(--destructive) / 0.05)',
                }}>
                  <div className="flex items-center gap-1.5">
                    {identityResult.eligible ? (
                      <Shield className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
                    )}
                    <span className={cn(
                      'text-[10px] font-semibold uppercase tracking-wider',
                      identityResult.eligible ? 'text-primary' : 'text-destructive',
                    )}>
                      {identityResult.eligible ? 'Anchor-Conditioned' : 'Legacy — Unbound'}
                    </span>
                  </div>
                  {!identityResult.eligible && identityResult.reasons.length > 0 && (
                    <div className="space-y-0.5">
                      {identityResult.reasons.map((r, i) => (
                        <p key={i} className="text-[9px] text-destructive/80">{r}</p>
                      ))}
                    </div>
                  )}
                  {/* Premium quality status */}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span className={cn(
                      'text-[9px]',
                      premiumResult.status === 'premium_pass' ? 'text-primary/70' :
                      premiumResult.status === 'premium_warn' ? 'text-amber-600' : 'text-destructive/70',
                    )}>
                      Quality: {premiumResult.status === 'premium_pass' ? '✓ Premium' :
                               premiumResult.status === 'premium_warn' ? '⚠ Warning' : '✗ Below Floor'}
                    </span>
                  </div>
                </div>

                {/* Prompt */}
                {meta.prompt && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium flex items-center gap-1">
                        <Eye className="h-3 w-3" /> Prompt
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[9px]"
                        onClick={handleCopyPrompt}
                      >
                        {copiedPrompt ? (
                          <><Check className="h-2.5 w-2.5 mr-0.5" /> Copied</>
                        ) : (
                          <><Copy className="h-2.5 w-2.5 mr-0.5" /> Copy</>
                        )}
                      </Button>
                    </div>
                    <p className="text-[11px] text-foreground/90 leading-relaxed bg-muted/20 rounded-md p-2.5 border border-border/20">
                      {meta.prompt}
                    </p>
                  </div>
                )}

                {/* Scene / Moment */}
                {(meta.momentUsed || meta.slugline || meta.sceneNumber) && (
                  <div className="space-y-0.5">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium flex items-center gap-1">
                      <Map className="h-3 w-3" /> Scene / Moment
                    </p>
                    {meta.slugline && (
                      <p className="text-xs text-foreground font-medium">{meta.slugline}</p>
                    )}
                    {meta.momentUsed && meta.momentUsed !== meta.slugline && (
                      <p className="text-[11px] text-muted-foreground">{meta.momentUsed}</p>
                    )}
                    {meta.sceneNumber && (
                      <p className="text-[10px] text-muted-foreground/70">Scene {meta.sceneNumber}</p>
                    )}
                  </div>
                )}

                {/* Narrative Function */}
                {meta.narrativeFunction && (
                  <div className="space-y-0.5">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium flex items-center gap-1">
                      <Layers className="h-3 w-3" /> Narrative Function
                    </p>
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-primary/5 text-primary border-primary/20">
                      {meta.narrativeFunction.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                )}

                {/* Character Binding */}
                <div className="space-y-0.5">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium flex items-center gap-1">
                    <User className="h-3 w-3" /> Character Binding
                  </p>
                  <div className="space-y-1">
                    <MetadataRow label="Subject" value={meta.subject} />
                    <MetadataRow label="Subject Type" value={meta.subjectType} />
                    <MetadataRow label="Actor Version" value={meta.actorVersionId ? meta.actorVersionId.slice(0, 12) + '…' : null} />
                    <MetadataRow label="Reference Images" value={meta.referenceImagesTotal} />
                    <MetadataRow label="Anchor Lock Requested" value={meta.identityLocked ? 'Yes' : 'No'} />
                    <MetadataRow label="Identity Mode" value={meta.identityMode || null} />
                  </div>
                </div>

                {/* Generation Metadata */}
                <div className="space-y-0.5">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium flex items-center gap-1">
                    <Camera className="h-3 w-3" /> Generation
                  </p>
                  <div className="space-y-1">
                    <MetadataRow label="Model" value={meta.model ? (meta.model as string).split('/').pop() : null} />
                    <MetadataRow label="Provider" value={meta.provider || null} />
                    <MetadataRow label="Quality Target" value={meta.qualityTarget || null} />
                    <MetadataRow label="Variant" value={meta.variantIndex !== '' ? meta.variantIndex : null} />
                    {img.width && img.height && (
                      <MetadataRow label="Resolution" value={`${img.width} × ${img.height}`} />
                    )}
                  </div>
                </div>

                {/* Anchor References */}
                {meta.referenceImagesTotal && meta.referenceImagesTotal > 0 && (
                  <div className="space-y-0.5">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> Identity Anchors
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {meta.referenceImagesTotal} reference image{meta.referenceImagesTotal > 1 ? 's' : ''} injected
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Actions bar */}
            <div className="border-t border-border/30 p-3 flex items-center gap-2 flex-wrap bg-background">
              {isPrimary ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-[10px] px-3"
                    disabled={!!settingPrimary}
                    onClick={() => onUnsetPrimary?.(img.id)}
                  >
                    {settingPrimary === img.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><StarOff className="h-3 w-3 mr-1" /> Unset Primary</>}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-[10px] px-3"
                    disabled={!!rejectingId}
                    onClick={() => onDemoteAndReject?.(img.id)}
                  >
                    {rejectingId === img.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Trash2 className="h-3 w-3 mr-1" /> Remove</>}
                  </Button>
                </>
              ) : identityResult.eligible ? (
                <>
                  {img.curation_state !== 'active' ? (
                    <Button size="sm" variant="secondary" className="h-7 text-[10px] px-3" disabled={!!approvingId} onClick={() => onApprove?.(img.id)}>
                      {approvingId === img.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Star className="h-3 w-3 mr-1" /> Approve</>}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-[10px] px-3" disabled={!!approvingId} onClick={() => onUnapprove?.(img.id)}>
                      {approvingId === img.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><StarOff className="h-3 w-3 mr-1" /> Unapprove</>}
                    </Button>
                  )}
                  <Button size="sm" className="h-7 text-[10px] px-3" disabled={!!settingPrimary} onClick={() => { onSetPrimary?.(img.id); onOpenChange(false); }}>
                    {settingPrimary === img.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3 mr-1" /> Set Primary</>}
                  </Button>
                  <Button size="sm" variant="destructive" className="h-7 text-[10px] px-3" disabled={!!rejectingId} onClick={() => onReject?.(img.id)}>
                    {rejectingId === img.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Trash2 className="h-3 w-3 mr-1" /> Reject</>}
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="destructive" className="h-7 text-[10px] px-3" disabled={!!rejectingId} onClick={() => onReject?.(img.id)}>
                  {rejectingId === img.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Trash2 className="h-3 w-3 mr-1" /> Remove</>}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
