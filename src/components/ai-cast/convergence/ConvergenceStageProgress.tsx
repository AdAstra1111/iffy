/**
 * ConvergenceStageProgress — Shows the canonical round stage pipeline.
 * Derives from actual backend stage, not invented percentages.
 */
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const STAGES = [
  { key: 'generating',  label: 'Generating',  desc: 'Creating candidate variants' },
  { key: 'validating',  label: 'Validating',  desc: 'Evaluating identity consistency' },
  { key: 'scoring',     label: 'Scoring',     desc: 'Computing canonical scores' },
  { key: 'selecting',   label: 'Selecting',   desc: 'Ranking and choosing keepers' },
  { key: 'refining',    label: 'Refining',    desc: 'Planning next-round improvements' },
  { key: 'complete',    label: 'Complete',    desc: 'Round finished' },
] as const;

interface Props {
  currentStage: string;
  isRunActive: boolean;
}

export function ConvergenceStageProgress({ currentStage, isRunActive }: Props) {
  const currentIdx = STAGES.findIndex(s => s.key === currentStage);
  const activeStage = STAGES.find(s => s.key === currentStage);

  return (
    <div className="space-y-3">
      {/* Stage pipeline */}
      <div className="flex items-center gap-0.5">
        {STAGES.map((stage, i) => {
          const isDone = i < currentIdx || currentStage === 'complete';
          const isActive = i === currentIdx && currentStage !== 'complete';
          const isPending = i > currentIdx;

          return (
            <div key={stage.key} className="flex-1 flex flex-col items-center gap-1.5">
              {/* Dot/icon */}
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium transition-all',
                isDone && 'bg-emerald-500/15 text-emerald-500',
                isActive && 'bg-primary/15 text-primary ring-2 ring-primary/30',
                isPending && 'bg-muted text-muted-foreground/40',
              )}>
                {isDone ? (
                  <Check className="w-3.5 h-3.5" />
                ) : isActive ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              {/* Label */}
              <span className={cn(
                'text-[10px] font-medium leading-tight text-center',
                isDone && 'text-emerald-500/70',
                isActive && 'text-primary',
                isPending && 'text-muted-foreground/40',
              )}>
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Active stage message */}
      {isRunActive && activeStage && activeStage.key !== 'complete' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
          <span className="text-xs text-primary font-medium">{activeStage.desc}…</span>
        </div>
      )}
    </div>
  );
}
