/**
 * SceneDemoGeneratorPanel — UI for generating, validating, approving, and locking scene demos.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useSceneDemoGenerator, type SceneDemoImage } from '@/hooks/useSceneDemoGenerator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ChevronDown, Film, CheckCircle2, AlertCircle, XCircle,
  Loader2, Play, Image, RefreshCw, Lock, ShieldAlert, CheckCheck,
  RotateCcw, ThumbsDown, Star, StarOff,
} from 'lucide-react';
import { SCENE_DEMO_PURPOSES, type SceneDemoPlan } from '@/lib/visual/sceneDemoPlanner';
import {
  isSlotApprovable,
  summarizeSlotValidation,
  type SceneDemoSlotValidation,
} from '@/lib/visual/sceneDemoValidation';

interface Props {
  projectId: string | undefined;
}

export function SceneDemoGeneratorPanel({ projectId }: Props) {
  const gen = useSceneDemoGenerator(projectId);

  if (gen.plannerLoading || gen.runsLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading scene demo generator...</div>;
  }

  const purposeLabel = (key: string) =>
    SCENE_DEMO_PURPOSES.find(p => p.key === key)?.label || key;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Image className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">Scene Demo Generation</h3>
        <Badge variant="outline" className="text-xs">{gen.readyPlans.length} ready</Badge>
        <Badge variant="secondary" className="text-xs">{gen.runs.length} runs</Badge>
      </div>

      {gen.readyPlans.length === 0 && gen.runs.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            <Film className="mx-auto mb-2 h-8 w-8 opacity-40" />
            <p>No ready scene demo plans. Ensure actors, costumes, and locations are locked.</p>
          </CardContent>
        </Card>
      )}

      {gen.readyPlans.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Ready to Generate</p>
          {gen.readyPlans.map(plan => {
            const existingRun = gen.getRunForScene(plan.scene_id);
            return (
              <Card key={plan.scene_demo_id}>
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {plan.slugline || plan.scene_key || plan.scene_id.slice(0, 8)}
                    </span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{purposeLabel(plan.scene_purpose)}</Badge>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{plan.characters.length} chars</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {existingRun && (
                      <RunStatusBadge status={existingRun.status} />
                    )}
                    <Button
                      size="sm"
                      variant={existingRun ? 'outline' : 'default'}
                      className="text-xs gap-1 h-7"
                      onClick={() => gen.generate(plan).catch(() => {})}
                      disabled={gen.isGenerating}
                    >
                      {gen.isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> :
                        existingRun ? <RefreshCw className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      {existingRun ? 'Redo' : 'Generate'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {gen.runs.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Generation Runs</p>
          {gen.runs.map(run => (
            <SceneDemoRunCard key={run.id} run={run} gen={gen} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Status Badge ──

function RunStatusBadge({ status, isCanonical }: { status: string; isCanonical?: boolean }) {
  const variant = status === 'locked' ? 'default' :
    status === 'approved' ? 'default' :
    status === 'stale' ? 'destructive' :
    status === 'failed' ? 'destructive' : 'secondary';
  const icon = status === 'locked' ? <Lock className="h-3 w-3" /> :
    status === 'stale' ? <ShieldAlert className="h-3 w-3" /> : null;

  return (
    <span className="flex items-center gap-1">
      {isCanonical && (
        <Badge variant="default" className="text-[10px] gap-0.5 bg-amber-500/90 hover:bg-amber-500 text-white border-0">
          <Star className="h-3 w-3" />Canon
        </Badge>
      )}
      <Badge variant={variant} className="text-[10px] gap-0.5">
        {icon}{status}
      </Badge>
    </span>
  );
}

// ── Run Card ──

function SceneDemoRunCard({ run, gen }: {
  run: { id: string; scene_id: string; plan_snapshot: any; status: string; slot_count: number; completed_count: number; error: string | null; created_at: string; is_canonical?: boolean };
  gen: ReturnType<typeof useSceneDemoGenerator>;
}) {
  const [images, setImages] = useState<SceneDemoImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const plan = run.plan_snapshot as SceneDemoPlan;
  const staleness = gen.checkRunStaleness(run as any);
  const isCanonical = !!(run as any).is_canonical;

  const loadImages = useCallback(() => {
    if (!loadingImages) {
      setLoadingImages(true);
      gen.fetchImagesForRun(run.id).then(setImages).finally(() => setLoadingImages(false));
    }
  }, [run.id, gen, loadingImages]);

  useEffect(() => {
    if (isOpen && images.length === 0) loadImages();
  }, [isOpen, images.length, loadImages]);

  const slugline = plan?.slugline || plan?.scene_key || run.scene_id.slice(0, 8);
  const isLocked = run.status === 'locked';

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={
        isCanonical ? 'border-amber-500/50 bg-amber-500/5' :
        staleness.stale ? 'border-destructive/40' :
        isLocked ? 'border-primary/40' : ''
      }>
        <CollapsibleTrigger className="w-full">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {isCanonical ? <Star className="h-4 w-4 text-amber-500" /> :
                isLocked ? <Lock className="h-4 w-4 text-primary" /> :
                staleness.stale ? <ShieldAlert className="h-4 w-4 text-destructive" /> :
                run.status === 'failed' ? <XCircle className="h-4 w-4 text-destructive" /> :
                run.status === 'running' ? <Loader2 className="h-4 w-4 text-primary animate-spin" /> :
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
              <CardTitle className="text-sm font-medium truncate">{slugline}</CardTitle>
              <Badge variant="outline" className="text-[10px] shrink-0">{run.completed_count}/{run.slot_count}</Badge>
              <RunStatusBadge status={staleness.stale ? 'stale' : run.status} isCanonical={isCanonical} />
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-3 px-4 space-y-3">
            {staleness.stale && (
              <div className="text-[10px] text-destructive bg-destructive/5 rounded p-2 border border-destructive/20">
                <ShieldAlert className="inline h-3 w-3 mr-1" />
                Upstream drift: {staleness.reasons.join('; ')}
              </div>
            )}

            {run.error && <p className="text-[10px] text-destructive">Error: {run.error}</p>}

            {loadingImages && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading...
              </div>
            )}

            {images.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {images.map(img => (
                    <SlotCard key={img.id} image={img} plan={plan} isRunLocked={isLocked} isStale={staleness.stale} gen={gen} onRefresh={loadImages} />
                  ))}
                </div>

                <div className="flex gap-2 pt-1 flex-wrap">
                  {!isLocked && !staleness.stale && (
                    <>
                      <Button size="sm" variant="outline" className="text-xs gap-1 h-7"
                        onClick={() => gen.approveAllSafe({ runId: run.id, images, plan }).then(loadImages).catch(() => {})}
                        disabled={gen.isApproving}>
                        <CheckCheck className="h-3 w-3" /> Approve All Safe
                      </Button>
                      <Button size="sm" className="text-xs gap-1 h-7"
                        onClick={() => gen.lockRun({ runId: run.id, plan }).catch(() => {})}
                        disabled={gen.isLocking}>
                        <Lock className="h-3 w-3" /> Lock Run
                      </Button>
                    </>
                  )}
                  {isLocked && !isCanonical && (
                    <Button size="sm" variant="outline" className="text-xs gap-1 h-7"
                      onClick={() => gen.setCanonical(run.id).catch(() => {})}
                      disabled={gen.isSettingCanonical}>
                      <Star className="h-3 w-3" /> Set as Canonical
                    </Button>
                  )}
                  {isCanonical && (
                    <Button size="sm" variant="outline" className="text-xs gap-1 h-7"
                      onClick={() => gen.unsetCanonical(run.id).catch(() => {})}
                      disabled={gen.isSettingCanonical}>
                      <StarOff className="h-3 w-3" /> Remove Canonical
                    </Button>
                  )}
                </div>
              </>
            )}

            <p className="text-[10px] text-muted-foreground">
              Created: {new Date(run.created_at).toLocaleString()}
            </p>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ── Slot Card ──

function SlotCard({ image, plan, isRunLocked, isStale, gen, onRefresh }: {
  image: SceneDemoImage;
  plan: SceneDemoPlan;
  isRunLocked: boolean;
  isStale: boolean;
  gen: ReturnType<typeof useSceneDemoGenerator>;
  onRefresh: () => void;
}) {
  const validation = image.status === 'done' ? gen.validateSlot(image, plan) : null;
  const approvable = isSlotApprovable(validation);
  const isApproved = image.approval_status === 'approved';
  const isRejected = image.approval_status === 'rejected';

  const handleApprove = async () => {
    try {
      await gen.approveSlot({ imageId: image.id, plan });
      onRefresh();
    } catch {}
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <p className="text-[10px] font-medium text-muted-foreground flex-1">{image.slot_key}</p>
        {isApproved && <Badge variant="default" className="text-[9px] h-4 px-1">Approved</Badge>}
        {isRejected && <Badge variant="destructive" className="text-[9px] h-4 px-1">Rejected</Badge>}
        {image.approval_status === 'redo_requested' && <Badge variant="secondary" className="text-[9px] h-4 px-1">Redo</Badge>}
      </div>

      {image.public_url ? (
        <img
          src={image.public_url}
          alt={image.slot_key}
          className={`w-full rounded-md border aspect-video object-cover ${
            isApproved ? 'border-primary/50' : isRejected ? 'border-destructive/50' : 'border-border/30'
          }`}
          loading="lazy"
        />
      ) : image.status === 'failed' ? (
        <div className="w-full rounded-md border border-destructive/20 bg-destructive/5 aspect-video flex items-center justify-center">
          <XCircle className="h-4 w-4 text-destructive/50" />
        </div>
      ) : image.status === 'running' ? (
        <div className="w-full rounded-md border border-border/30 bg-muted/20 aspect-video flex items-center justify-center">
          <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
        </div>
      ) : (
        <div className="w-full rounded-md border border-border/30 bg-muted/10 aspect-video flex items-center justify-center">
          <Image className="h-4 w-4 text-muted-foreground/30" />
        </div>
      )}

      {/* Validation summary */}
      {validation && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`text-[9px] px-1.5 py-0.5 rounded ${
                validation.passed ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
              }`}>
                {validation.overall_score}/100
                {validation.hard_fail_codes.length > 0 && ` · ${validation.hard_fail_codes.length} fail`}
                {validation.advisory_codes.length > 0 && ` · ${validation.advisory_codes.length} advisory`}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px] max-w-xs">
              {summarizeSlotValidation(validation)}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {image.error && <p className="text-[9px] text-destructive truncate">{image.error}</p>}

      {/* Controls */}
      {!isRunLocked && !isStale && image.status === 'done' && image.approval_status === 'pending' && (
        <div className="flex gap-1">
          <Button
            size="sm" variant="outline" className="text-[10px] h-6 px-2 gap-0.5 flex-1"
            onClick={handleApprove}
            disabled={!approvable || gen.isApproving}
          >
            <CheckCircle2 className="h-3 w-3" /> Approve
          </Button>
          <Button
            size="sm" variant="outline" className="text-[10px] h-6 px-2 gap-0.5"
            onClick={() => gen.rejectSlot(image.id).then(onRefresh).catch(() => {})}
          >
            <ThumbsDown className="h-3 w-3" />
          </Button>
          <Button
            size="sm" variant="outline" className="text-[10px] h-6 px-2 gap-0.5"
            onClick={() => gen.redoSlot(image.id).then(onRefresh).catch(() => {})}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
