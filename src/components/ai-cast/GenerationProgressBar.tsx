/**
 * GenerationProgressBar — Shows real-time stage/count progress
 * during AI Actor image generation.
 *
 * Cinematic UX: stage-aware messaging with variation,
 * intelligence signaling during scoring, momentum indicators.
 */
import { useEffect, useState, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, Sparkles, ImageIcon, Check, AlertTriangle, Brain } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

export type GenerationStage =
  | 'preparing'
  | 'generating'
  | 'uploading'
  | 'saving'
  | 'complete'
  | 'error';

interface GenerationProgressBarProps {
  isActive: boolean;
  mode: 'exploratory' | 'reference_locked';
  total: number;
  completed?: number;
  failed?: number;
  stage?: GenerationStage;
  elapsedSeconds?: number;
  className?: string;
}

const STAGE_MESSAGES: Record<GenerationStage, string[]> = {
  preparing: [
    'Preparing generation pipeline…',
    'Setting up creative parameters…',
    'Initializing visual synthesis…',
  ],
  generating: [
    'Creating casting options…',
    'Synthesizing visual candidates…',
    'Generating identity variants…',
  ],
  uploading: [
    'Uploading generated assets…',
    'Persisting visual outputs…',
    'Saving candidate images…',
  ],
  saving: [
    'Finalizing candidate records…',
    'Committing to library…',
    'Recording generation metadata…',
  ],
  complete: [
    'Casting options ready',
    'Generation complete — review candidates',
    'Options generated successfully',
  ],
  error: [
    'Generation encountered an issue',
    'Pipeline error — check details',
    'Generation failed — retry available',
  ],
};

const STAGE_ICONS: Record<GenerationStage, { icon: 'loader' | 'sparkle' | 'image' | 'check' | 'error' | 'brain'; color: string }> = {
  preparing: { icon: 'loader', color: 'text-muted-foreground' },
  generating: { icon: 'sparkle', color: 'text-primary' },
  uploading: { icon: 'image', color: 'text-primary' },
  saving: { icon: 'loader', color: 'text-primary' },
  complete: { icon: 'check', color: 'text-emerald-400' },
  error: { icon: 'error', color: 'text-destructive' },
};

function StageIcon({ icon, className }: { icon: string; className?: string }) {
  switch (icon) {
    case 'sparkle': return <Sparkles className={cn('h-3.5 w-3.5', className)} />;
    case 'image': return <ImageIcon className={cn('h-3.5 w-3.5', className)} />;
    case 'check': return <Check className={cn('h-3.5 w-3.5', className)} />;
    case 'error': return <AlertTriangle className={cn('h-3.5 w-3.5', className)} />;
    case 'brain': return <Brain className={cn('h-3.5 w-3.5', className)} />;
    default: return <Loader2 className={cn('h-3.5 w-3.5 animate-spin', className)} />;
  }
}

function pickMessage(stage: GenerationStage, seed: number): string {
  const msgs = STAGE_MESSAGES[stage];
  return msgs[seed % msgs.length];
}

export function GenerationProgressBar({
  isActive,
  mode,
  total,
  completed = 0,
  failed = 0,
  stage: externalStage,
  className,
}: GenerationProgressBarProps) {
  const [elapsed, setElapsed] = useState(0);
  const [msgSeed] = useState(() => Math.floor(Date.now() / 1000) % 100);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!isActive) {
      setElapsed(0);
      startRef.current = Date.now();
      return;
    }
    startRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  if (!isActive && completed === 0) return null;

  const stage = externalStage || (
    completed >= total ? 'complete' :
    completed > 0 ? 'generating' :
    'preparing'
  );

  const config = STAGE_ICONS[stage];
  const message = pickMessage(stage, msgSeed);

  const progressPct = total > 0
    ? Math.round(((completed + failed) / total) * 100)
    : (stage === 'complete' ? 100 : stage === 'preparing' ? 5 : 15);

  const isExplore = mode === 'exploratory';
  const modeLabel = isExplore ? 'Exploratory' : 'Locked';

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <div className={cn(
      'rounded-lg border p-3 space-y-2 transition-all cast-reveal',
      isExplore
        ? 'border-violet-500/30 bg-violet-500/5'
        : 'border-primary/30 bg-primary/5',
      className,
    )}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StageIcon icon={config.icon} className={config.color} />
          <span className={cn('text-xs font-medium', config.color)}>{message}</span>
          <Badge variant="outline" className={cn(
            'text-[8px] h-4 px-1.5',
            isExplore ? 'border-violet-500/30 text-violet-400' : 'border-primary/30 text-primary',
          )}>
            {modeLabel}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {isActive && elapsed > 0 && (
            <span className="cast-pulse-subtle">{formatTime(elapsed)}</span>
          )}
          {total > 0 && (
            <span className="font-medium">
              {completed}/{total}
              {failed > 0 && <span className="text-destructive ml-1">({failed} failed)</span>}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <Progress
        value={progressPct}
        className={cn(
          'h-1.5',
          isExplore ? '[&>div]:bg-violet-500' : '[&>div]:bg-primary',
        )}
      />

      {/* Per-image mini dots */}
      {total > 0 && total <= 8 && (
        <div className="flex items-center gap-1.5 pt-0.5">
          {Array.from({ length: total }).map((_, i) => {
            const isDone = i < completed;
            const isFailed = i >= completed && i < completed + failed;
            const isCurrent = !isDone && !isFailed && i === completed;
            return (
              <div
                key={i}
                className={cn(
                  'w-2 h-2 rounded-full transition-all duration-300',
                  isDone && 'bg-emerald-500 scale-100',
                  isFailed && 'bg-destructive',
                  isCurrent && (isActive ? 'bg-primary animate-pulse scale-110' : 'bg-muted-foreground/30'),
                  !isDone && !isFailed && !isCurrent && 'bg-muted-foreground/20',
                )}
                title={isDone ? `Image ${i + 1}: Complete` : isFailed ? `Image ${i + 1}: Failed` : isCurrent ? `Image ${i + 1}: Creating…` : `Image ${i + 1}: Queued`}
              />
            );
          })}
        </div>
      )}

      {/* Intelligence signal during scoring phase */}
      {stage === 'generating' && completed > 0 && completed < total && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 pt-0.5">
          <Brain className="h-3 w-3 text-primary/50" />
          <span>Analyzing identity consistency across variants…</span>
        </div>
      )}
    </div>
  );
}
