/**
 * CostumeOnActorPanel — Full workflow surface for character costume-on-actor looks.
 *
 * Shows: coverage summary, bound characters, wardrobe states, slot previews,
 * validation, approve/reject/redo, batch actions, lock.
 *
 * All character status, CTA, and lock-gap display is driven by the canonical
 * characterLockGap resolver — no component-local lockability heuristics.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { resolveSlotDisplayFromFields, type SlotLike } from '@/lib/visual/slotStateResolver';
import { useCostumeOnActor, type CharacterCoverage, type BulkCastProgress } from '@/hooks/useCostumeOnActor';
import { COSTUME_REQUIRED_SLOT_KEYS, resolveStateWardrobe, resolveStateWardrobePackage, type StateWardrobePackage } from '@/lib/visual/costumeOnActor';
import { deriveCanonInputsFromProfile } from '@/lib/visual/stateWardrobeReconstructor';
import { detectStateCollapse } from '@/lib/visual/stateWardrobeReconstructor';
import { classifyWardrobeHealth } from '@/lib/visual/wardrobeHealthClassifier';
import type { CharacterWardrobeProfile } from '@/lib/visual/characterWardrobeExtractor';
import { resolveEffectiveProfileOrNull } from '@/lib/visual/effectiveProfileResolver';
import { useCanonicalTemporalTruth } from '@/hooks/useCanonicalTemporalTruth';
import { resolveCharacterGenerationCTA } from '@/lib/visual/characterGenerationCTA';
import {
  resolveCharacterLockGap,
  getDisplayStatusConfig,
  formatLockGapSummary,
  formatLockFailureMessage,
  type CharacterLockGap,
  type CharacterLockDisplayStatus,
  type LockGapInput,
} from '@/lib/visual/characterLockGap';
import { useCharacterWardrobe } from '@/hooks/useCharacterWardrobe';
import { getBlockRemediation, getBlockReasonLabel, isRepairAvailable } from '@/lib/visual/blockRemediation';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { VisualImageDetailDrawer } from '@/components/visual/VisualImageDetailDrawer';
import { MIN_VIABLE_SCORE, TARGET_SCORE } from '@/lib/visual/costumeConvergenceScoring';
import {
  ChevronDown,
  Lock,
  User,
  Shirt,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Play,
  Zap,
  Square,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  ShieldCheck,
  X,
  Search,
  Trash2,
  Users,
  Pause,
  SkipForward,
  RefreshCw,
} from 'lucide-react';
import type { VisualSetSlot } from '@/hooks/useVisualSets';

interface Props {
  projectId: string | undefined;
}

// ── Coverage Badge — driven by canonical lock-gap display status ──

function CoverageBadge({ displayStatus, blockReason }: { displayStatus: CharacterLockDisplayStatus; blockReason?: string | null }) {
  const config = getDisplayStatusConfig(displayStatus);
  const iconMap: Record<string, React.ReactNode> = {
    blocked: <X className="h-3 w-3 mr-1" />,
    locked: <Lock className="h-3 w-3 mr-1" />,
    lock_ready: <CheckCircle2 className="h-3 w-3 mr-1" />,
    needs_completion: <AlertTriangle className="h-3 w-3 mr-1" />,
    needs_required: <AlertTriangle className="h-3 w-3 mr-1" />,
    generating: <Loader2 className="h-3 w-3 mr-1 animate-spin" />,
  };
  const variantMap: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
    blocked: 'outline',
    locked: 'default',
    lock_ready: 'secondary',
    needs_completion: 'outline',
    needs_required: 'outline',
    generating: 'outline',
  };
  const classMap: Record<string, string> = {
    blocked: 'text-[10px] text-muted-foreground border-muted-foreground/40',
    locked: 'bg-primary/10 text-primary border-primary/30 text-[10px]',
    lock_ready: 'text-[10px] text-emerald-400 border-emerald-500/30',
    needs_completion: 'text-[10px] text-amber-400 border-amber-500/30',
    needs_required: 'text-[10px] text-muted-foreground',
    generating: 'text-[10px] text-primary border-primary/30',
  };

  return (
    <Badge variant={variantMap[displayStatus] || 'outline'} className={classMap[displayStatus] || 'text-[10px]'}>
      {iconMap[displayStatus]}
      {config.label}
    </Badge>
  );
}

// ── Slot Preview Row ──

function SlotCandidateThumb({ slotId, imageId, onClick }: { slotId: string; imageId: string | null; onClick?: (resolvedImageId: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [resolvedImageId, setResolvedImageId] = useState<string | null>(imageId);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      let targetImageId = imageId;

      // If no selected image, find latest ADMITTED candidate only
      if (!targetImageId) {
        const { data: cands } = await (supabase as any)
          .from('visual_set_candidates')
          .select('image_id, generation_config')
          .eq('visual_set_slot_id', slotId)
          .neq('producer_decision', 'rejected')
          .order('created_at', { ascending: false })
          .limit(5);
        // Filter to admitted candidates only (gate_admitted !== false)
        const admitted = (cands || []).find((c: any) => {
          const gc = c.generation_config;
          return !gc || gc.gate_admitted == null || gc.gate_admitted === true;
        });
        targetImageId = admitted?.image_id || null;
      }

      if (cancelled || !targetImageId) return;
      setResolvedImageId(targetImageId);

      const { data: img } = await (supabase as any)
        .from('project_images')
        .select('storage_path, storage_bucket')
        .eq('id', targetImageId)
        .maybeSingle();
      if (cancelled || !img?.storage_path) return;

      const { data: signed } = await supabase.storage
        .from(img.storage_bucket || 'project-images')
        .createSignedUrl(img.storage_path, 3600);
      if (!cancelled && signed?.signedUrl) setUrl(signed.signedUrl);
    };

    resolve();
    return () => { cancelled = true; };
  }, [slotId, imageId]);

  if (!url) return null;

  return (
    <button
      onClick={() => resolvedImageId && onClick?.(resolvedImageId)}
      className="relative group shrink-0 rounded-md overflow-hidden border border-border/50 hover:border-primary/50 transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40"
      title="Click to inspect"
    >
      <img
        src={url}
        alt="slot preview"
        className="h-14 w-14 rounded-md object-cover"
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
        <Search className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  );
}

function SlotPreviewRow({
  slot,
  locked,
  onApprove,
  onReject,
  onRedo,
  onInspect,
  isActioning,
  activeRunId,
  showActiveRunOnly,
}: {
  slot: VisualSetSlot;
  locked: boolean;
  onApprove: () => void;
  onReject: () => void;
  onRedo: () => Promise<void> | void;
  onInspect: (imageId: string) => void;
  isActioning: boolean;
  activeRunId?: string | null;
  showActiveRunOnly?: boolean;
}) {
  const [isSlotGenerating, setIsSlotGenerating] = useState(false);

  // ── Use canonical slot state resolver instead of ad-hoc heuristics ──
  const resolved = useMemo(() => resolveSlotDisplayFromFields(slot as SlotLike), [slot]);
  const hasCandidateOrImage = resolved.hasCandidateOrImage;
  const isApproved = resolved.isApproved;
  const isLocked = resolved.isLocked;
  const disableActions = locked || isLocked || isActioning || isSlotGenerating;
  const isEmpty = resolved.isEmpty;

  const handleSlotRedo = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSlotGenerating) return;
    setIsSlotGenerating(true);
    try {
      await onRedo();
    } catch (err: any) {
      console.error(`[Costume] Slot retry failed for ${slot.slot_key}:`, err);
    } finally {
      setIsSlotGenerating(false);
    }
  }, [onRedo, isSlotGenerating, slot.slot_key]);

  // Parse convergence diagnostics from slot
  const convState = (slot.convergence_state || {}) as Record<string, any>;
  const lastFailReason = convState.last_fail_reason || convState.exhaustion_reason || null;
  const promptTemplateKey = convState.prompt_template_key || null;
  const slotRunId = convState.costume_run_id || null;
  const slotGenMode = convState.generation_mode || null;
  const scoringPolicy = convState.scoring_policy || null;

  // ── Identity gate diagnostics ──
  const gateStatus = convState.actor_identity_gate_status || null;
  const gateAdmitted = convState.gate_admitted;
  const gateRejectionReason = convState.gate_rejection_reason || null;
  const identityScore = convState.actor_identity_score;
  const continuityStatus = convState.continuity_gate_status || null;
  const continuityScore = convState.continuity_score;

  // Determine if this slot's content is from the active run or historical
  const isFromActiveRun = !!activeRunId && !!slotRunId && slotRunId === activeRunId;
  const isHistorical = hasCandidateOrImage && !isApproved && !isLocked && activeRunId && !isFromActiveRun;
  const isOptionalSlot = !slot.is_required;

  // In active-run-only mode, hide historical optional candidates
  if (showActiveRunOnly && isHistorical && isOptionalSlot && !isApproved && !isLocked) {
    return null;
  }

  // Convergence scoring display
  const bestScore = slot.best_score ?? 0;
  const attempts = slot.attempt_count ?? 0;
  const scoreColor = bestScore >= TARGET_SCORE
    ? 'text-emerald-400'
    : bestScore >= MIN_VIABLE_SCORE
      ? 'text-amber-400'
      : bestScore > 0
        ? 'text-red-400'
        : 'text-muted-foreground';

  // Gate visual state
  const isGateRejected = gateAdmitted === false;
  const rowBgClass = isGateRejected
    ? 'bg-destructive/5 border-l-2 border-l-destructive/40'
    : isHistorical ? 'bg-muted/10 opacity-50' : 'bg-muted/30';

  return (
    <div className={`flex items-center gap-2.5 py-2 px-2 rounded text-xs ${rowBgClass}`}>
      {/* Thumbnail — larger, clickable */}
      {hasCandidateOrImage && (
        <SlotCandidateThumb slotId={slot.id} imageId={slot.selected_image_id} onClick={onInspect} />
      )}

      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {isLocked ? (
          <Lock className="h-3.5 w-3.5 text-primary shrink-0" />
        ) : isApproved ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
        ) : isGateRejected ? (
          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
        ) : hasCandidateOrImage ? (
          <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
        )}
        <span className="font-medium truncate">{slot.slot_label}</span>
        {slot.is_required && <span className="text-primary">*</span>}

        {/* Convergence score display */}
        {bestScore > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <span className={`font-mono text-[10px] ${scoreColor}`}>
                  {(bestScore * 100).toFixed(0)}%
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p>Best score: {(bestScore * 100).toFixed(1)}%</p>
                <p>Attempts: {attempts}/{5}</p>
                {scoringPolicy && <p>Policy: {scoringPolicy}</p>}
                {bestScore >= TARGET_SCORE && <p className="text-emerald-400">✓ Target reached</p>}
                {bestScore >= MIN_VIABLE_SCORE && bestScore < TARGET_SCORE && <p className="text-amber-400">Viable — may improve</p>}
                {bestScore > 0 && bestScore < MIN_VIABLE_SCORE && <p className="text-red-400">Below threshold</p>}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {attempts > 0 && (
          <span className="text-[9px] text-muted-foreground/60 font-mono">
            ×{attempts}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {hasCandidateOrImage && !disableActions && !isGateRejected && (
          <>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={onApprove}
                    disabled={isApproved}
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top"><p>Approve</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onReject}>
                    <ThumbsDown className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top"><p>Reject</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )}
        {!isLocked && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleSlotRedo} disabled={disableActions}>
                  {isSlotGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top"><p>{isEmpty ? 'Generate' : 'Redo'}</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {isSlotGenerating && (
          <span className="text-[9px] text-muted-foreground animate-pulse">Generating…</span>
        )}

        {/* Best candidate badge — only for admitted, current-epoch, viable candidates */}
        {/* BEST badge: requires viable score, admitted gate, non-historical, and a selected image.
            NOTE: selected_image_id is an IMAGE id; best_candidate_id is a CANDIDATE id.
            They are different domains — never compare them directly.
            BEST means: this slot has a selected image AND a best score above threshold. */}
        {slot.selected_image_id && bestScore >= MIN_VIABLE_SCORE && !isGateRejected && !isHistorical && gateAdmitted !== false && (
          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[9px] px-1">
            BEST
          </Badge>
        )}

        {/* Identity gate rejection badge */}
        {isGateRejected && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="text-[9px] px-1 text-destructive border-destructive/30">
                  ✗ identity
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[240px]">
                <p className="font-medium text-destructive">Identity Gate Failed</p>
                {gateRejectionReason && <p>{gateRejectionReason}</p>}
                {identityScore != null && <p>Identity score: {identityScore}/100</p>}
                {continuityStatus === 'fail' && <p className="text-destructive">Continuity: FAIL (score: {continuityScore})</p>}
                {continuityStatus === 'pass' && <p>Continuity: pass (score: {continuityScore})</p>}
                {scoringPolicy && <p>Policy: {scoringPolicy}</p>}
                <p className="text-muted-foreground mt-1">This candidate cannot be approved or count toward readiness.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Scoring policy badge */}
        {scoringPolicy && !isGateRejected && (
          <Badge variant="outline" className="text-[9px] px-1 text-muted-foreground border-muted-foreground/20">
            {scoringPolicy.replace('_', ' ')}
          </Badge>
        )}

        {/* Historical badge */}
        {isHistorical && (
          <Badge variant="outline" className="text-[9px] px-1 text-muted-foreground border-muted-foreground/30">
            historical
          </Badge>
        )}

        <Badge
          variant={isLocked ? 'default' : isApproved ? 'secondary' : hasCandidateOrImage ? 'outline' : 'outline'}
          className="text-[10px] px-1.5"
        >
          {isLocked ? 'locked' : isApproved ? 'approved' : isGateRejected ? 'rejected' : hasCandidateOrImage ? 'candidate' : 'empty'}
        </Badge>

        {/* Empty required slot failure diagnostics */}
        {isEmpty && slot.is_required && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="text-[9px] px-1 text-destructive border-destructive/30">
                  {attempts === 0
                    ? '0 attempts'
                    : lastFailReason
                      ? `${attempts}× / ${lastFailReason}`
                      : `${attempts}× exhausted`}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[200px]">
                <p>Attempts: {attempts}/{5}</p>
                {bestScore > 0 && <p>Best score: {(bestScore * 100).toFixed(1)}%</p>}
                {lastFailReason && <p>Last fail: {lastFailReason}</p>}
                {promptTemplateKey && <p>Template: {promptTemplateKey}</p>}
                {scoringPolicy && <p>Policy: {scoringPolicy}</p>}
                {attempts === 0 && <p>Not yet attempted</p>}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

// IEL: classifyWardrobeHealth is imported from wardrobeHealthClassifier.ts — sole canonical authority.

// ── Resolved Wardrobe Summary — shows what will actually be generated for this state ──

function ResolvedWardrobeSummary({ profile, state, temporalTruth }: {
  profile: CharacterWardrobeProfile;
  state: { garment_adjustments: string[]; fabric_adjustments: string[]; accessory_adjustments: string[]; trigger_conditions?: string[]; explicit_or_inferred: 'explicit' | 'inferred' };
  temporalTruth?: import('@/lib/visual/temporalTruthResolver').TemporalTruth | null;
}) {
  const canonInputs = deriveCanonInputsFromProfile(profile, temporalTruth);
  const pkg = resolveStateWardrobePackage(profile, state as any, temporalTruth, canonInputs);

  if (pkg.displayGarments.length === 0 && pkg.displayFabrics.length === 0 && pkg.exclusions.length === 0) return null;

  const sceneKeys = pkg.sceneKeys;

  const strengthColor = pkg.packageStrength === 'strong' ? 'text-emerald-500/80 border-emerald-500/20 bg-emerald-500/5'
    : pkg.packageStrength === 'usable' ? 'text-blue-500/70 border-blue-500/20 bg-blue-500/5'
    : pkg.packageStrength === 'weak' ? 'text-amber-500/70 border-amber-500/20 bg-amber-500/5'
    : 'text-destructive/70 border-destructive/20 bg-destructive/5';

  // Contamination: contemporary project using era-fallback
  const isContemporary = !temporalTruth || ['contemporary', 'modern', 'near_future'].includes(temporalTruth.era);
  const hasEraFallback = pkg.sourceSummary.includes('era-fallback') || pkg.isPrimarilyFallback;
  const isContaminated = isContemporary && hasEraFallback;

  return (
    <div className="px-3 py-1.5 border-t border-border/20 bg-muted/10">
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-[9px] font-medium text-muted-foreground/70 uppercase tracking-wider">
          This state uses
        </p>
        <Badge variant="outline" className={`text-[8px] px-1 py-0 ${strengthColor}`}>
          {pkg.packageStrength}
        </Badge>
        {pkg.usedStateReconstruction && (
          <Badge variant="outline" className={`text-[8px] px-1 py-0 ${
            pkg.isPrimarilyFallback
              ? 'text-amber-500/70 border-amber-500/20 bg-amber-500/5'
              : 'text-blue-500/70 border-blue-500/20 bg-blue-500/5'
          }`}>
            {pkg.isPrimarilyFallback ? 'era-fallback' : 'profile-driven'}
          </Badge>
        )}
        {pkg.stateCategory !== 'default' && (
          <Badge variant="outline" className="text-[8px] px-1 py-0 text-muted-foreground/50 border-muted-foreground/15">
            {pkg.stateCategory.replace(/_/g, ' ')}
          </Badge>
        )}
        {isContaminated && (
          <Badge variant="outline" className="text-[8px] px-1 py-0 text-destructive border-destructive/30 bg-destructive/5">
            ⚠ historical contamination
          </Badge>
        )}
      </div>
      {/* Diagnostic lines: era, baseline, source summary */}
      <div className="flex flex-wrap gap-2 text-[8px] font-mono text-muted-foreground/40 mb-1">
        <span>era: {temporalTruth?.era ?? 'contemporary'}/{temporalTruth?.family ?? 'modern'}</span>
        <span>baseline: {pkg.baseline?.baselineSource ?? 'unknown'}</span>
        <span>src: {pkg.sourceSummary.join(' · ')}</span>
      </div>
      <div className="space-y-0.5 text-[10px] text-muted-foreground">
        {pkg.displayGarments.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-medium text-foreground/80">Garments:</span>
            {pkg.displayGarments.map((item, i) => {
              const src = pkg.garmentSources[i];
              const isInferred = src?.source === 'inferred';
              const isScene = src?.source === 'scene';
              return (
                <Badge
                  key={i}
                  variant="outline"
                  className={`text-[9px] px-1 py-0 border-muted-foreground/20 ${
                    isScene ? 'text-green-600/80 border-green-500/30' :
                    isInferred ? 'text-blue-500/70 border-blue-500/20' :
                    'text-muted-foreground'
                  }`}
                >
                  {item}
                </Badge>
              );
            })}
          </div>
        )}
        {pkg.displayFabrics.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-medium text-foreground/80">Fabrics:</span>
            {pkg.displayFabrics.map((item, i) => (
              <Badge
                key={i}
                variant="outline"
                className="text-[9px] px-1 py-0 text-muted-foreground border-muted-foreground/20"
              >
                {item}
              </Badge>
            ))}
          </div>
        )}
        {sceneKeys.length > 0 && (
          <p className="text-[9px] text-muted-foreground/50 mt-0.5">
            Source: Scene-derived · {sceneKeys.map(k => `Scene ${k}`).join(', ')}
          </p>
        )}
        {pkg.exclusions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            <span className="font-medium text-destructive/70">Era-excluded:</span>
            {pkg.exclusions.map((ex, i) => (
              <Badge
                key={i}
                variant="outline"
                className="text-[9px] px-1 py-0 text-destructive/60 border-destructive/20 line-through"
              >
                {ex.item}
              </Badge>
            ))}
          </div>
        )}
        {pkg.failureReasons.length > 0 && (
          <div className="mt-1">
            {pkg.failureReasons.map((r, i) => (
              <p key={i} className="text-[9px] text-amber-500/80 italic">⚠ {r}</p>
            ))}
          </div>
        )}
        {pkg.intelligenceDiagnostic && pkg.failureReasons.length === 0 && (
          <p className="text-[9px] text-muted-foreground/50 mt-1 italic">
            {pkg.intelligenceDiagnostic}
          </p>
        )}
        {/* ── DEBUG: Slot Readiness Surface (temporary diagnostic) ── */}
        <div className="mt-1.5 pt-1 border-t border-border/10">
          <p className="text-[8px] font-mono text-muted-foreground/40 mb-0.5">SLOT READINESS</p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(pkg.slotReadiness).map(([key, readiness]) => {
              const color = readiness === 'ready' ? 'text-emerald-500/70 border-emerald-500/20'
                : readiness === 'soft_ready' ? 'text-blue-500/60 border-blue-500/20'
                : 'text-destructive/60 border-destructive/20';
              return (
                <Badge key={key} variant="outline" className={`text-[7px] px-0.5 py-0 font-mono ${color}`}>
                  {key.replace(/_/g, '·')}: {readiness}
                  {readiness === 'blocked' && pkg.slotBlockedReasons[key] ? ` (${pkg.slotBlockedReasons[key]})` : ''}
                </Badge>
              );
            })}
          </div>
          {pkg.sourceSummary.length > 0 && (
            <p className="text-[7px] font-mono text-muted-foreground/30 mt-0.5">
              src: {pkg.sourceSummary.join(' · ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── State Row with Slot Expansion ──

function StateRow({
  characterKey,
  characterName,
  state,
  lookSet,
  locked,
  slots,
  onGenerate,
  onApproveAll,
  onApproveSlot,
  onLock,
  onRejectSlot,
  onInspectSlot,
  onRedoSlot,
  isGenerating,
  isActioning,
  activeRunId,
  showActiveRunOnly,
  wardrobeProfile,
  temporalTruth,
}: {
  characterKey: string;
  characterName: string;
  state: { state_key: string; label: string; explicit_or_inferred: 'explicit' | 'inferred'; trigger_conditions?: string[]; garment_adjustments: string[]; fabric_adjustments: string[]; accessory_adjustments: string[] };
  lookSet: { id: string; status: string } | null;
  locked: boolean;
  slots: VisualSetSlot[];
  onGenerate: () => void;
  onApproveAll: () => void;
  onApproveSlot: (slotId: string) => void;
  onLock: () => void;
  onRejectSlot: (slotId: string) => void;
  onInspectSlot: (imageId: string, slot: VisualSetSlot) => void;
  onRedoSlot: (slotId: string, slotKey: string) => Promise<void>;
  isGenerating: boolean;
  isActioning: boolean;
  activeRunId?: string | null;
  showActiveRunOnly?: boolean;
  wardrobeProfile?: CharacterWardrobeProfile | null;
  temporalTruth?: import('@/lib/visual/temporalTruthResolver').TemporalTruth | null;
}) {
  const hasSlots = slots.length > 0;
    // Use canonical resolver for slot state — only count approved/locked slots.
    // RISK 3 FIX: Do NOT rely on slot-level convergence_state.gate_admitted (cache truth).
    // Approved/locked status itself is authoritative — it can only be reached if the
    // candidate passed the gate at approval time (enforced in approveSlot/approveAllSafe).
    // So approved/locked state IS the canonical admission proof.
    const approvedCount = slots.filter(s => {
      const r = resolveSlotDisplayFromFields(s as SlotLike);
      return r.isApproved || r.isLocked;
    }).length;
    const filledCount = approvedCount;

  return (
    <div className={`border rounded-md overflow-hidden ${isGenerating ? 'border-primary/40 ring-1 ring-primary/10' : 'border-border/30'}`}>
      <div className={`flex items-center justify-between py-2 px-3 ${isGenerating ? 'bg-primary/5' : 'bg-muted/20'}`}>
        <div className="flex items-center gap-2">
          {locked ? (
            <Lock className="h-3.5 w-3.5 text-primary" />
          ) : isGenerating ? (
            <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
          ) : lookSet ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="text-xs font-medium">{state.label}</span>
          <Badge
            variant={state.explicit_or_inferred === 'explicit' ? 'default' : 'outline'}
            className="text-[10px] px-1 py-0"
          >
            {state.explicit_or_inferred}
          </Badge>
          {'trigger_conditions' in state && Array.isArray((state as any).trigger_conditions) &&
            (state as any).trigger_conditions.some((t: string) => t.startsWith('scene:')) && (
            <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-accent/20 text-accent-foreground">
              Scene-derived
            </Badge>
          )}
          {hasSlots && (
            <span className="text-[10px] text-muted-foreground">
              {approvedCount}/{slots.length} slots
            </span>
          )}
          {isGenerating && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-primary border-primary/30 animate-pulse">
              generating
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {!lookSet && !locked && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={onGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
              Generate
            </Button>
          )}
          {lookSet && !locked && filledCount > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={onApproveAll}
                disabled={isActioning}
              >
                <ShieldCheck className="h-3 w-3 mr-1" />Approve Safe
              </Button>
              {approvedCount === slots.filter(s => s.is_required).length && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={onLock}
                  disabled={isActioning}
                >
                  <Lock className="h-3 w-3 mr-1" />Lock
                </Button>
              )}
            </>
          )}
          {locked && (
            <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px]">
              <Lock className="h-3 w-3 mr-0.5" />Locked
            </Badge>
          )}
        </div>
      </div>

      {/* ── State-Specific Resolved Wardrobe Summary ── */}
      {wardrobeProfile && (
        <ResolvedWardrobeSummary profile={wardrobeProfile} state={state} temporalTruth={temporalTruth} />
      )}

      {hasSlots ? (
        <div className="px-3 py-1.5 space-y-1">
          {slots.map(slot => (
            <SlotPreviewRow
              key={slot.id}
              slot={slot}
              locked={locked}
              onApprove={() => onApproveSlot(slot.id)}
              onReject={() => onRejectSlot(slot.id)}
              onRedo={() => onRedoSlot(slot.id, slot.slot_key)}
              onInspect={(imageId) => onInspectSlot(imageId, slot)}
              isActioning={isActioning}
              activeRunId={activeRunId}
              showActiveRunOnly={showActiveRunOnly}
            />
          ))}
        </div>
      ) : isGenerating ? (
        <div className="px-3 py-3 space-y-2">
          <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
            <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-primary">Generating costume slots…</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Creating look set and generating candidates for {state.label}. Slots will appear as they are created.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Main Panel ──

export function CostumeOnActorPanel({ projectId }: Props) {
  const costume = useCostumeOnActor(projectId);
  const wardrobe = useCharacterWardrobe(projectId);
  const temporal = useCanonicalTemporalTruth(projectId);
  const { temporalTruth } = temporal;
  const [expandedChars, setExpandedChars] = useState<Set<string>>(new Set());
  const [charSlots, setCharSlots] = useState<Record<string, Record<string, VisualSetSlot[]>>>({});
  const [isActioning, setIsActioning] = useState(false);
  const [generatingStates, setGeneratingStates] = useState<Set<string>>(new Set());
  const [showActiveRunOnly, setShowActiveRunOnly] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);

  // Auto-enable active-run-only during required-only runs
  const activeRunId = costume.activeRunManifest?.run_id || null;

  // ── Inspection drawer state ──
  const [inspectImageId, setInspectImageId] = useState<string | null>(null);
  const [inspectContext, setInspectContext] = useState<{
    characterName: string;
    stateLabel: string;
    slotLabel: string;
    slotState: string;
    slots: VisualSetSlot[];
    currentSlotIndex: number;
  } | null>(null);

  // Load slots for all existing sets
  // CRITICAL: depends on costume.slotsVersion to re-run after any slot-affecting write
  useEffect(() => {
    if (!costume.sets.length) return;
    let cancelled = false;
    const loadSlots = async () => {
      const result: Record<string, Record<string, VisualSetSlot[]>> = {};
      for (const set of costume.sets) {
        try {
          const slots = await costume.fetchSlotsForSet(set.id);
          if (cancelled) return;
          if (!result[set.characterKey]) result[set.characterKey] = {};
          result[set.characterKey][set.wardrobeStateKey] = slots;
        } catch { /* ignore */ }
      }
      if (!cancelled) setCharSlots(result);
    };
    loadSlots();
    return () => { cancelled = true; };
  }, [costume.sets, costume.fetchSlotsForSet, costume.slotsVersion]);

  const toggleChar = useCallback((key: string) => {
    setExpandedChars(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const handleGenerate = useCallback(async (characterKey: string, stateKey: string) => {
    const genKey = `${characterKey}:${stateKey}`;
    setGeneratingStates(prev => new Set(prev).add(genKey));
    try {
      await costume.generateLook(characterKey, stateKey);
    } catch (err: any) {
      console.error('[Costume] Generate failed:', err);
    }
    setGeneratingStates(prev => { const n = new Set(prev); n.delete(genKey); return n; });
    costume.invalidateSets();
  }, [costume]);

  const handleGenerateAllMissing = useCallback(async (characterKey: string) => {
    await costume.generateAllMissing(characterKey);
  }, [costume]);

  const handleApproveAllSafe = useCallback(async (setId: string) => {
    setIsActioning(true);
    try { await costume.approveAllSafe(setId); } finally { setIsActioning(false); }
  }, [costume]);

  const handleApproveAllForChar = useCallback(async (characterKey: string) => {
    setIsActioning(true);
    try { await costume.approveAllSafeForCharacter(characterKey); } finally { setIsActioning(false); }
  }, [costume]);

  const handleLockSet = useCallback(async (setId: string) => {
    setIsActioning(true);
    try { await costume.lockSet(setId); } finally { setIsActioning(false); }
  }, [costume]);

  const handleLockCharacter = useCallback(async (characterKey: string) => {
    setIsActioning(true);
    try { await costume.lockCharacterCostume(characterKey); } finally { setIsActioning(false); }
  }, [costume]);

  const handleApproveSlot = useCallback(async (slotId: string) => {
    setIsActioning(true);
    try { await costume.approveSlot(slotId); } finally { setIsActioning(false); }
  }, [costume]);

  const handleRejectSlot = useCallback(async (slotId: string) => {
    setIsActioning(true);
    try { await costume.rejectSlot(slotId); } finally { setIsActioning(false); }
  }, [costume]);

  const handleRedoSlot = useCallback(async (characterKey: string, stateKey: string, slotId: string, slotKey: string) => {
    try {
      await costume.generateSingleSlot(characterKey, stateKey, slotId, slotKey);
    } catch (err: any) {
      console.error('[Costume] Single-slot retry failed:', err);
    }
    costume.invalidateSets();
  }, [costume]);

  const handleResetCostume = useCallback(async () => {
    setIsActioning(true);
    try {
      await costume.resetCostumeGeneration('Manual reset — clean generation with identity + scoring system');
    } catch (err: any) {
      console.error('[Costume] Reset failed:', err);
    } finally {
      setIsActioning(false);
    }
  }, [costume]);

  // ── Contamination detection ──
  const liveTruthAudit = useMemo(() => {
    const isContemporary = !temporalTruth || ['contemporary', 'modern', 'near_future'].includes(temporalTruth.era);
    const contaminatedStates: string[] = [];

    if (isContemporary && wardrobe.extraction) {
      for (const char of costume.boundCharacters) {
        if (!char.profile) continue;
        const states = costume.getStatesForCharacter(char.characterKey);
        const canonInputs = deriveCanonInputsFromProfile(char.profile, temporalTruth);
        for (const st of states) {
          const pkg = resolveStateWardrobePackage(char.profile, st, temporalTruth, canonInputs);
          if (pkg.sourceSummary.includes('era-fallback') || pkg.isPrimarilyFallback) {
            contaminatedStates.push(`${char.characterName} / ${st.label}`);
          }
        }
      }
    }

    return {
      contaminationDetected: contaminatedStates.length > 0,
      contaminatedStates,
      isContemporary,
    };
  }, [temporalTruth, wardrobe.extraction, costume.boundCharacters]);

  // ── Project-scoped rebuild handler ──
  const handleRebuildProjectTruth = useCallback(async () => {
    if (!projectId) return;
    setIsRebuilding(true);
    try {
      // 1. Re-extract canonical temporal truth
      await temporal.extractAsync();
      // 2. Re-extract wardrobe profiles
      await wardrobe.extractAsync();
      // 3. Reset/archive stale costume generation
      await costume.resetCostumeGeneration('Project truth rebuild — fresh temporal + wardrobe extraction');
      toast.success('Project costume truth rebuilt successfully');
    } catch (err: any) {
      console.error('[Costume] Rebuild failed:', err);
      toast.error(err.message || 'Rebuild failed');
    } finally {
      setIsRebuilding(false);
    }
  }, [projectId, temporal, wardrobe, costume]);

  if (costume.isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading costume-on-actor data...</div>;
  }

  if (!costume.hasWardrobe) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center space-y-3">
          <Shirt className="mx-auto h-8 w-8 opacity-40" />
          <p className="text-sm text-muted-foreground">
            Wardrobe profiles must be extracted before costume looks can be generated.
          </p>
          {!wardrobe.hasCanon ? (
            <p className="text-xs text-muted-foreground">No canon data available — add project canon first.</p>
          ) : (
            <Button
              onClick={() => wardrobe.extract()}
              disabled={wardrobe.extracting}
              size="sm"
            >
              {wardrobe.extracting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              {wardrobe.extracting ? 'Extracting…' : 'Extract Wardrobe Profiles'}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (costume.boundCharacters.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          <User className="mx-auto mb-2 h-8 w-8 opacity-40" />
          <p>No characters found in cast. Add characters to begin.</p>
        </CardContent>
      </Card>
    );
  }

  const gls = costume.globalLockGapSummary;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shirt className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Costume-on-Actor Looks</h3>
          <Badge variant="outline" className="text-xs">{costume.boundCharacters.length} characters</Badge>
          {costume.currentEpoch > 1 && (
            <Badge variant="outline" className="text-[9px] font-mono text-muted-foreground">
              Epoch {costume.currentEpoch}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {costume.buildStatus === 'building' && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={costume.stopBuild}>
              <Square className="h-3 w-3 mr-1" />Stop
            </Button>
          )}
          {costume.buildStatus !== 'building' && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => costume.buildAllCast()}
              disabled={isActioning || liveTruthAudit.contaminationDetected}
            >
              <Users className="h-3 w-3 mr-1" />Build All Character Wardrobes
            </Button>
          )}
          <ConfirmDialog
            title="Reset Costume Generation"
            description="This will archive all existing costume outputs and reset convergence state so a clean generation can run using the current identity + scoring system. No data will be deleted — all existing images are preserved as archived history."
            confirmLabel="Reset & Archive"
            variant="destructive"
            onConfirm={handleResetCostume}
          >
            <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" disabled={isActioning}>
              <Trash2 className="h-3 w-3 mr-1" />Reset Generation
            </Button>
          </ConfirmDialog>
          {costume.activeRunManifest && (
            <Badge variant="outline" className="text-[9px] font-mono">
              {costume.activeRunManifest.generation_mode === 'required_only' ? '🔒 Required Only' : '⚡ Full'}
            </Badge>
          )}
          {costume.sessionStale.stale && (
            <Badge variant="destructive" className="text-[9px]">
              <AlertTriangle className="h-3 w-3 mr-0.5" />
              Stale: {costume.sessionStale.reason}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Live Truth Debug Strip (temporary diagnostic) ── */}
      <div className="rounded border border-border/30 bg-muted/10 p-2.5 space-y-1 font-mono text-[9px] text-muted-foreground/60">
        <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground mb-1">
          <Search className="h-3 w-3" />
          <span>LIVE TRUTH DIAGNOSTIC</span>
          {wardrobe.isStalePersisted && (
            <Badge variant="destructive" className="text-[8px] px-1 py-0">STALE</Badge>
          )}
          {!wardrobe.isStalePersisted && wardrobe.isPersisted && (
            <Badge variant="outline" className="text-[8px] px-1 py-0 text-emerald-500 border-emerald-500/30">CURRENT</Badge>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          <span>project_id: {projectId}</span>
          <span>temporal era: {temporalTruth?.era ?? 'contemporary'} / {temporalTruth?.family ?? 'modern'}</span>
          <span>temporal persisted: {temporal.isPersisted ? 'yes' : 'no (live)'}</span>
          <span>wardrobe version: {wardrobe.extractionVersion ?? 'none'}</span>
          <span>wardrobe extracted_at: {wardrobe.extractedAt ?? 'never'}</span>
          <span>freshness: {wardrobe.isStalePersisted ? '⚠ stale persisted wardrobe row' : wardrobe.isPersisted ? '✓ current persisted rebuild' : 'fresh live recomputation'}</span>
          <span>source doc types: {wardrobe.sourceDocTypes.join(', ') || 'none'}</span>
          <span>scene evidence: {wardrobe.coverage?.sceneFactCount ?? 0} facts / {wardrobe.coverage?.scenesScanned ?? 0} scenes</span>
        </div>
        {wardrobe.staleReasons.length > 0 && (
          <div className="mt-1 text-destructive/70">
            Stale reasons: {wardrobe.staleReasons.join(' · ')}
          </div>
        )}
        {liveTruthAudit.contaminatedStates.length > 0 && (
          <div className="mt-1 text-destructive/70">
            Contaminated states: {liveTruthAudit.contaminatedStates.join(', ')}
          </div>
        )}
      </div>

      {/* ── Contamination Warning + Rebuild Button ── */}
      {liveTruthAudit.contaminationDetected && (
        <div className="rounded border border-destructive/40 bg-destructive/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Historical wardrobe contamination detected
          </div>
          <p className="text-[10px] text-destructive/80">
            This project resolves as contemporary but {liveTruthAudit.contaminatedStates.length} state(s) are using era-fallback wardrobe truth.
            Bulk generation is blocked until wardrobe truth is rebuilt.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs border-destructive/30 text-destructive hover:text-destructive"
            onClick={handleRebuildProjectTruth}
            disabled={isRebuilding || wardrobe.extracting || temporal.extracting}
          >
            {isRebuilding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            {isRebuilding ? 'Rebuilding…' : 'Rebuild Project Costume Truth'}
          </Button>
        </div>
      )}

      {/* Rebuild button also shown when stale but not contaminated */}
      {wardrobe.isStalePersisted && !liveTruthAudit.contaminationDetected && (
        <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            Stale wardrobe truth detected
          </div>
          <p className="text-[10px] text-amber-600/80">
            {wardrobe.staleReasons.join('. ')}. Rebuild recommended before generating.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs border-amber-500/30"
            onClick={handleRebuildProjectTruth}
            disabled={isRebuilding || wardrobe.extracting || temporal.extracting}
          >
            {isRebuilding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            {isRebuilding ? 'Rebuilding…' : 'Rebuild Project Costume Truth'}
          </Button>
        </div>
      )}

      {/* Active Run Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label htmlFor="active-run-toggle" className="text-xs text-muted-foreground">Show Active Run Only</label>
          <Switch
            id="active-run-toggle"
            checked={showActiveRunOnly}
            onCheckedChange={setShowActiveRunOnly}
          />
        </div>
        {gls.locked > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            <Lock className="h-3 w-3 mr-1" />{gls.locked}/{gls.total} locked
          </Badge>
        )}
      </div>

      {/* Global Coverage Summary — lock-gap-driven */}
      <Card className="bg-muted/20 border-border/30">
        <CardContent className="p-3">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-muted-foreground font-medium">Overall Coverage</span>
            <div className="flex gap-2 font-mono text-[10px]">
              <span>{gls.locked}/{gls.total} locked</span>
              {gls.lock_ready > 0 && (
                <>
                  <span className="text-muted-foreground/60">·</span>
                  <span>{gls.lock_ready} lock-ready</span>
                </>
              )}
            </div>
          </div>
          <Progress value={gls.total > 0 ? (gls.locked / gls.total) * 100 : 0} className="h-1.5" />
          <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Lock className="h-3 w-3" />{gls.locked} locked</span>
            {gls.lock_ready > 0 && <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{gls.lock_ready} lock-ready</span>}
            {gls.needs_completion > 0 && <span className="flex items-center gap-1"><Circle className="h-3 w-3" />{gls.needs_completion} needs completion</span>}
            {gls.needs_required > 0 && <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{gls.needs_required} needs required</span>}
            {gls.blocked > 0 && <span className="flex items-center gap-1"><X className="h-3 w-3" />{gls.blocked} blocked</span>}
          </div>
        </CardContent>
      </Card>

      {/* Bulk All-Cast Progress */}
      {costume.bulkProgress.length > 0 && costume.buildStatus === 'building' && (
        <Card className="bg-muted/20 border-border/30">
          <CardContent className="p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />Build All Character Wardrobes Progress
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {costume.bulkProgress.filter(p => p.status === 'accepted').length}/
                {costume.bulkProgress.length} done
              </span>
            </div>
            <Progress
              value={costume.bulkProgress.length > 0
                ? (costume.bulkProgress.filter(p => ['accepted', 'failed', 'skipped'].includes(p.status)).length / costume.bulkProgress.length) * 100
                : 0}
              className="h-1.5"
            />
            <div className="max-h-32 overflow-y-auto space-y-0.5">
              {costume.bulkProgress.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <span className="font-medium truncate w-24">{p.characterName}</span>
                  <span className="text-muted-foreground truncate w-20">{p.stateKey}</span>
                  <Badge
                    variant="outline"
                    className={`text-[8px] px-1 ${
                      p.status === 'accepted' ? 'text-emerald-400 border-emerald-500/30' :
                      p.status === 'failed' ? 'text-destructive border-destructive/30' :
                      p.status === 'skipped' ? 'text-muted-foreground' :
                      p.status === 'generating' ? 'text-primary border-primary/30' :
                      'text-muted-foreground'
                    }`}
                  >
                    {p.status === 'generating' && <Loader2 className="h-2 w-2 animate-spin mr-0.5" />}
                    {p.status}
                  </Badge>
                  {p.reason && <span className="text-muted-foreground/60 truncate">{p.reason}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-Character Cards */}
      {costume.boundCharacters.map((char) => {
        const charCov = costume.coverage.find(c => c.characterKey === char.characterKey);
        const isBlocked = !char.isEligible;

        // Compute lock gap for eligible characters
        const states = !isBlocked ? costume.getStatesForCharacter(char.characterKey) : [];
        const slotsForChar = charSlots[char.characterKey] || {};
        const charGeneratingKeys = [...generatingStates].filter(k => k.startsWith(char.characterKey + ':'));
        const isCharGenerating = costume.buildStatus === 'building' && (
          costume.bulkProgress.some(p => p.characterKey === char.characterKey && p.status === 'generating') ||
          charGeneratingKeys.length > 0
        );

        const lockGap = charCov ? resolveCharacterLockGap({
          coverage: charCov,
          states,
          slotsPerState: slotsForChar,
          setsPerState: Object.fromEntries(states.map(s => [
            s.state_key,
            costume.getLookSet(char.characterKey, s.state_key)
              ? { id: costume.getLookSet(char.characterKey, s.state_key)!.id, status: costume.getLookSet(char.characterKey, s.state_key)!.status }
              : null,
          ])),
          isGenerating: isCharGenerating,
        }) : null;

        // Blocked character: render simplified card with reason
        if (isBlocked) {
          const remediation = getBlockRemediation(char.blockReason);
          const canRepair = isRepairAvailable(char.blockReason);

          return (
            <Card key={char.characterKey} className="border-dashed opacity-70">
              <div className="py-3 px-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground/50" />
                  <span className="text-sm font-medium text-muted-foreground">{char.characterName}</span>
                  <CoverageBadge displayStatus="blocked" blockReason={charCov?.blockReason} />
                </div>
              </div>
              <CardContent className="pt-0 pb-3 px-4 space-y-2">
                <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/20 rounded p-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <span className="block">{getBlockReasonLabel(char.blockReason)}</span>
                    {char.blockDiagnostics?.guardReasons && char.blockDiagnostics.guardReasons.length > 0 && (
                      <ul className="list-disc list-inside text-[10px] text-muted-foreground/60 mt-1 space-y-0.5">
                        {char.blockDiagnostics.guardReasons.map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    )}
                    {char.blockDiagnostics && (
                      <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground/50">
                        <span>{char.blockDiagnostics.explicitStateCount} explicit / {char.blockDiagnostics.inferredStateCount} inferred states</span>
                        {char.blockDiagnostics.hasSceneEvidence && (
                          <span>• {char.blockDiagnostics.sceneFactCount} scene costume facts</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {canRepair && remediation && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={wardrobe.extracting}
                      onClick={() => wardrobe.extract()}
                    >
                      {wardrobe.extracting ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <RotateCcw className="h-3 w-3 mr-1" />
                      )}
                      {wardrobe.extracting ? 'Extracting…' : remediation.repairLabel}
                    </Button>
                    {remediation.repairDescription && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-[10px] text-muted-foreground/60 cursor-help">ⓘ</span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[220px] text-xs">
                            {remediation.repairDescription}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        }

        // Eligible character: full interactive card
        const isExpanded = expandedChars.has(char.characterKey);
        const displayStatus = lockGap?.display_status || 'needs_required';
        const gapSummary = lockGap ? formatLockGapSummary(lockGap) : [];

        return (
          <Card key={char.characterKey}>
            {/* Character header — always visible */}
            <div
              className="py-3 px-4 flex items-center justify-between cursor-pointer hover:bg-muted/10 transition-colors"
              onClick={() => toggleChar(char.characterKey)}
            >
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{char.characterName}</span>
                <CoverageBadge displayStatus={displayStatus} />
                <span className="text-[10px] text-muted-foreground font-mono">
                  {lockGap && lockGap.totals.total_required_slots > 0
                    ? `${lockGap.totals.lock_ready_slots}/${lockGap.totals.total_required_slots} slots`
                    : charCov ? `${charCov.statesWithSets}/${charCov.totalStates} states` : ''}
                </span>
                {/* Inline lock-gap summary chips */}
                {gapSummary.length > 0 && !isExpanded && (
                  <span className="text-[9px] text-muted-foreground/70">
                    ({gapSummary.slice(0, 2).join(', ')})
                  </span>
                )}
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </div>

            {/* Coverage bar — tracks lock-ready progress from lock-gap only */}
            {charCov && lockGap && (
              <div className="px-4 pb-2">
                <Progress
                  value={lockGap.totals.total_required_slots > 0
                    ? (lockGap.totals.lock_ready_slots / lockGap.totals.total_required_slots) * 100
                    : 0}
                  className="h-1"
                />
              </div>
            )}

            {/* Expanded content */}
            {isExpanded && (
              <CardContent className="pt-0 pb-3 px-4 space-y-3">
                {/* Live Run Inspector — shows when this character has active execution */}
                {(() => {
                  const charBulk = costume.bulkProgress.filter(p => p.characterKey === char.characterKey);
                  const activeItem = charBulk.find(p => p.status === 'generating');
                  const charGeneratingKeys = [...generatingStates].filter(k => k.startsWith(char.characterKey + ':'));
                  const isCharActive = !!activeItem || charGeneratingKeys.length > 0;
                  if (!isCharActive) return null;

                  const activeStateKey = activeItem?.stateKey || charGeneratingKeys[0]?.split(':')[1] || null;
                  const activeStateLabel = activeStateKey
                    ? (states.find(s => s.state_key === activeStateKey)?.label || activeStateKey)
                    : null;
                  const completedCount = charBulk.filter(p => ['accepted', 'failed', 'skipped'].includes(p.status)).length;
                  const totalCount = charBulk.length || states.length;
                  const failedCount = charBulk.filter(p => p.status === 'failed').length;
                  const skippedCount = charBulk.filter(p => p.status === 'skipped').length;
                  const acceptedCount = charBulk.filter(p => p.status === 'accepted').length;

                  return (
                    <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 space-y-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
                        <span className="text-xs font-semibold text-primary">Live Generation</span>
                        {charBulk.length > 0 && (
                          <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                            {completedCount}/{totalCount} states
                          </span>
                        )}
                      </div>
                      {activeStateLabel && (
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className="text-muted-foreground">Active state:</span>
                          <span className="font-medium text-foreground">{activeStateLabel}</span>
                          {activeItem?.slotKey && activeItem.slotKey !== '*' && (
                            <>
                              <span className="text-muted-foreground/50">›</span>
                              <span className="text-foreground">{activeItem.slotKey}</span>
                            </>
                          )}
                        </div>
                      )}
                      {costume.activeRunManifest && (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>Mode: {costume.activeRunManifest.generation_mode === 'required_only' ? 'Required only' : 'Full'}</span>
                          <span className="text-muted-foreground/30">·</span>
                          <span>Slots: {costume.activeRunManifest.slots_succeeded}/{costume.activeRunManifest.slots_attempted} succeeded</span>
                        </div>
                      )}
                      {charBulk.length > 1 && (
                        <div className="space-y-0.5 max-h-24 overflow-y-auto">
                          {charBulk.map((p, i) => (
                            <div key={i} className={`flex items-center gap-2 text-[10px] rounded px-1.5 py-0.5 ${p.status === 'generating' ? 'bg-primary/10' : ''}`}>
                              <span className={`truncate w-28 ${p.status === 'generating' ? 'font-medium text-primary' : 'text-muted-foreground'}`}>
                                {states.find(s => s.state_key === p.stateKey)?.label || p.stateKey}
                              </span>
                              <Badge
                                variant="outline"
                                className={`text-[8px] px-1 ${
                                  p.status === 'accepted' ? 'text-emerald-400 border-emerald-500/30' :
                                  p.status === 'failed' ? 'text-destructive border-destructive/30' :
                                  p.status === 'skipped' ? 'text-muted-foreground border-muted-foreground/20' :
                                  p.status === 'generating' ? 'text-primary border-primary/30' :
                                  'text-muted-foreground border-muted-foreground/20'
                                }`}
                              >
                                {p.status === 'generating' && <Loader2 className="h-2 w-2 animate-spin mr-0.5" />}
                                {p.status}
                              </Badge>
                              {p.reason && <span className="text-muted-foreground/50 text-[9px] truncate">{p.reason}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {(acceptedCount > 0 || failedCount > 0 || skippedCount > 0) && (
                        <div className="flex gap-3 text-[10px] text-muted-foreground pt-0.5 border-t border-primary/10">
                          {acceptedCount > 0 && <span className="text-emerald-400">{acceptedCount} accepted</span>}
                          {failedCount > 0 && <span className="text-destructive">{failedCount} failed</span>}
                          {skippedCount > 0 && <span>{skippedCount} skipped</span>}
                        </div>
                      )}
                      {/* ── Run Intervention Controls ── */}
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-primary/10">
                        {costume.isPaused ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={(e) => { e.stopPropagation(); costume.issueCommand('resume_run'); }}
                          >
                            <Play className="h-3 w-3 mr-0.5" />Resume
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={(e) => { e.stopPropagation(); costume.issueCommand('pause_run'); }}
                          >
                            <Pause className="h-3 w-3 mr-0.5" />Pause
                          </Button>
                        )}
                        {activeStateKey && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                costume.issueCommand('skip_state', {
                                  characterKey: char.characterKey,
                                  stateKey: activeStateKey,
                                  reason: 'User skipped via UI',
                                });
                              }}
                            >
                              <SkipForward className="h-3 w-3 mr-0.5" />Skip State
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                costume.issueCommand('retry_state', {
                                  characterKey: char.characterKey,
                                  stateKey: activeStateKey,
                                });
                              }}
                            >
                              <RefreshCw className="h-3 w-3 mr-0.5" />Retry State
                            </Button>
                          </>
                        )}
                      </div>
                      {costume.isPaused && (
                        <div className="flex items-center gap-1.5 text-[10px] rounded bg-muted/40 px-2 py-1">
                          <Pause className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground font-medium">Paused — waiting for resume</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Profile summary — baseline identity via canonical effective profile */}
                {char.profile && (() => {
                  const ep = resolveEffectiveProfileOrNull(char.profile, temporalTruth);
                  if (!ep) return null;
                  return (
                    <div className="text-xs text-muted-foreground border-b border-border pb-2 space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">Baseline Wardrobe Identity</p>
                      <p><strong>Identity:</strong> {ep.effective_identity_summary}</p>
                      <p><strong>Garments:</strong> {ep.effective_signature_garments.join(', ') || '—'}</p>
                      <p><strong>Fabrics:</strong> {ep.fabric_language}</p>
                      {ep.source_doc_types.includes('scene_contradiction') && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-400 border-amber-500/30">
                          World defaults corrected by scene evidence
                        </Badge>
                      )}
                      {ep.source_doc_types.includes('scene_reinforcement') && !ep.source_doc_types.includes('scene_contradiction') && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 text-accent-foreground border-accent/30">
                          Scene-reinforced
                        </Badge>
                      )}
                      {ep.was_temporally_normalized && ep.excluded_garments.length > 0 && (
                        <div className="pt-1 space-y-0.5">
                          <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Era-excluded</p>
                          <div className="flex flex-wrap gap-1">
                            {ep.excluded_garments.map((ex, i) => (
                              <Badge key={i} variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground/50 border-muted-foreground/20 line-through">
                                {ex.item}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Batch actions */}
                <div className="flex flex-wrap gap-1.5">
                  {charCov && charCov.missingStates.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={(e) => { e.stopPropagation(); handleGenerateAllMissing(char.characterKey); }}
                      disabled={costume.buildStatus === 'building'}
                    >
                      {costume.buildStatus === 'building' ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Zap className="h-3 w-3 mr-1" />
                      )}
                      Generate Missing ({charCov.missingStates.length})
                    </Button>
                  )}
                  {(() => {
                    const cta = lockGap ? resolveCharacterGenerationCTA(lockGap, costume.buildStatus === 'building') : null;
                    if (!cta || !cta.visible) return null;
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (cta.action === 'generate_required') {
                            costume.generateRequiredOnly(char.characterKey);
                          } else if (cta.action === 'complete_character') {
                            costume.completeCharacter(char.characterKey);
                          }
                        }}
                        disabled={!cta.enabled}
                        title={cta.description}
                      >
                        {costume.buildStatus === 'building' ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <ShieldCheck className="h-3 w-3 mr-1" />
                        )}
                        {cta.label}
                      </Button>
                    );
                  })()}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={(e) => { e.stopPropagation(); handleApproveAllForChar(char.characterKey); }}
                    disabled={isActioning || charCov?.readiness === 'fully_locked'}
                  >
                    <ShieldCheck className="h-3 w-3 mr-1" />Approve All Safe
                  </Button>
                  {lockGap && lockGap.lock_ready && displayStatus !== 'locked' && (
                    <Button
                      variant="default"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={(e) => { e.stopPropagation(); handleLockCharacter(char.characterKey); }}
                      disabled={isActioning}
                    >
                      <Lock className="h-3 w-3 mr-1" />Lock Character
                    </Button>
                  )}
                </div>

                {/* Lock Gap Summary — canonical slot-level blocking visibility */}
                {lockGap && !lockGap.lock_ready && lockGap.blocking_slots.length > 0 && displayStatus !== 'blocked' && (
                  <div className="rounded-md border border-border/30 bg-muted/10 p-2.5 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      Lock Blockers ({lockGap.blocking_slots.length} required slot{lockGap.blocking_slots.length !== 1 ? 's' : ''})
                    </div>
                    <div className="space-y-0.5 max-h-28 overflow-y-auto">
                      {lockGap.per_state.filter(s => s.issues.length > 0).map(state => (
                        <div key={state.state_key} className="text-[10px]">
                          <span className="font-medium text-foreground">{state.state_label}</span>
                          <span className="text-muted-foreground ml-1">
                            — {state.issues.map(i => {
                              const typeLabel: Record<string, string> = {
                                missing_slot: 'missing',
                                unattempted: 'unattempted',
                                identity_fail: 'identity fail',
                                continuity_fail: 'continuity fail',
                                rejected: 'rejected',
                                below_threshold: 'below threshold',
                                not_approved: 'not approved',
                                no_admitted_candidate: 'no admitted candidate',
                                missing_state: 'no set',
                              };
                              return `${i.slot_label} (${typeLabel[i.type] || i.type})`;
                            }).join(', ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Priority missing warning */}
                {charCov && charCov.priorityMissing.length > 0 && (
                  <div className="flex items-start gap-2 text-[10px] text-destructive bg-destructive/5 rounded p-2">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      Priority states missing: <strong>{charCov.priorityMissing.join(', ')}</strong>
                    </span>
                  </div>
                )}

                {/* Collapse detection + Wardrobe Intelligence Health Summary */}
                {states.length >= 2 && char.profile && (() => {
                  const resolvedStates = states.map(s => {
                    const canonInputs = deriveCanonInputsFromProfile(char.profile!, temporalTruth);
                    const pkg = resolveStateWardrobePackage(char.profile!, s, temporalTruth, canonInputs);
                    return {
                      stateKey: s.state_key,
                      label: s.label,
                      displayGarments: pkg.displayGarments,
                      isPrimarilyFallback: pkg.isPrimarilyFallback,
                      usedStateReconstruction: pkg.usedStateReconstruction,
                      intelligenceSources: pkg.intelligenceSources,
                      transformationAxes: pkg.transformationAxes,
                      packageStrength: pkg.packageStrength,
                    };
                  });

                  const collapse = states.length >= 3 ? detectStateCollapse(resolvedStates) : null;
                  const profileDrivenCount = resolvedStates.filter(s => s.usedStateReconstruction && !s.isPrimarilyFallback).length;
                  const fallbackCount = resolvedStates.filter(s => s.isPrimarilyFallback).length;
                  const totalReconstructed = resolvedStates.filter(s => s.usedStateReconstruction).length;

                  // IEL TRIPWIRE: Health label must be derived from actual resolved state diagnostics.
                  // "strong" is NEVER valid when profileDrivenCount is zero or collapse is active.
                  // classifyWardrobeHealth() is the SOLE authority for this label.
                  const healthLabel = classifyWardrobeHealth(
                    profileDrivenCount, fallbackCount, totalReconstructed, resolvedStates.length,
                    collapse,
                  );
                  const healthColor = healthLabel === 'strong'
                    ? 'text-emerald-500'
                    : healthLabel === 'moderate'
                    ? 'text-amber-500'
                    : 'text-destructive';

                  return (
                    <>
                      {/* Health summary bar */}
                      <div className="flex items-center gap-2 text-[10px] bg-muted/15 rounded px-2.5 py-1.5">
                        <span className="text-muted-foreground font-medium">Wardrobe Intelligence:</span>
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${healthColor} border-current/20`}>
                          {healthLabel}
                        </Badge>
                        <span className="text-muted-foreground/70">
                          {profileDrivenCount}/{totalReconstructed || resolvedStates.length} profile-driven
                          {fallbackCount > 0 && ` · ${fallbackCount} fallback-heavy`}
                        </span>
                      </div>

                      {/* Collapse warning */}
                      {collapse?.collapsed && (
                        <div className="flex items-start gap-2 text-[10px] text-amber-600 bg-amber-500/5 rounded p-2">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span>
                            Wardrobe state differentiation degraded — {collapse.collapseCount}/{collapse.totalStates} states
                            resolved to the same outfit ({collapse.distinctArrays} distinct).
                            Strengthen upstream wardrobe truth or state semantics.
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* State rows */}
                {states.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No wardrobe states derived.</p>
                )}
                <div className="space-y-1.5">
                  {states.map((state) => {
                    const lookSet = costume.getLookSet(char.characterKey, state.state_key);
                    const locked = costume.isLookLocked(char.characterKey, state.state_key);
                    const slots = slotsForChar[state.state_key] || [];
                    const genKey = `${char.characterKey}:${state.state_key}`;

                    return (
                      <StateRow
                        key={state.state_key}
                        characterKey={char.characterKey}
                        characterName={char.characterName}
                        state={state}
                        lookSet={lookSet ? { id: lookSet.id, status: lookSet.status } : null}
                        locked={locked}
                        slots={slots}
                        onGenerate={() => handleGenerate(char.characterKey, state.state_key)}
                        onApproveAll={() => lookSet && handleApproveAllSafe(lookSet.id)}
                        onApproveSlot={handleApproveSlot}
                        onLock={() => lookSet && handleLockSet(lookSet.id)}
                        onRejectSlot={handleRejectSlot}
                        onRedoSlot={(slotId, slotKey) => handleRedoSlot(char.characterKey, state.state_key, slotId, slotKey)}
                        wardrobeProfile={char.profile}
                        temporalTruth={temporalTruth}
                        onInspectSlot={(imageId, slot) => {
                          const idx = slots.findIndex(s => s.id === slot.id);
                          setInspectImageId(imageId);
                          setInspectContext({
                            characterName: char.characterName,
                            stateLabel: state.label,
                            slotLabel: slot.slot_label,
                            slotState: slot.state,
                            slots,
                            currentSlotIndex: idx >= 0 ? idx : 0,
                          });
                        }}
                        isGenerating={generatingStates.has(genKey)}
                        isActioning={isActioning}
                        activeRunId={activeRunId}
                        showActiveRunOnly={showActiveRunOnly}
                      />
                    );
                  })}
                </div>

                {/* Slot definitions legend */}
                <div className="pt-2 border-t border-border">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">Look slots per state:</p>
                  <div className="flex flex-wrap gap-1">
                    {costume.lookSlots.map(slot => (
                      <Badge key={slot.key} variant="outline" className="text-[10px] px-1 py-0">
                        {slot.label}{slot.required ? ' *' : ''}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Image Inspection Drawer — canonical VisualImageDetailDrawer */}
      {projectId && (
        <VisualImageDetailDrawer
          open={!!inspectImageId}
          onClose={() => { setInspectImageId(null); setInspectContext(null); }}
          imageId={inspectImageId}
          projectId={projectId}
          slotLabel={inspectContext ? `${inspectContext.slotLabel} (${inspectContext.slotState})` : undefined}
          familyLabel={inspectContext ? `${inspectContext.characterName} — ${inspectContext.stateLabel}` : undefined}
        />
      )}
    </div>
  );
}
