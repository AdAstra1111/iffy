/**
 * ConvergenceRoundTimeline — Vertical timeline of convergence rounds.
 * Shows round-over-round progression, improvement deltas, and keeper counts.
 */
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, Trophy, Target } from 'lucide-react';
import type { ConvergenceRound } from '@/lib/aiCast/convergenceEngine';

interface Props {
  rounds: ConvergenceRound[];
  currentRoundId?: string;
}

function strategyLabel(strategy: string): string {
  const map: Record<string, string> = {
    exploratory_wide: 'Wide Exploration',
    locked_tight: 'Tight Lock',
    final_confirmation: 'Final Confirmation',
    recovery_repair: 'Recovery',
  };
  return map[strategy] || strategy;
}

function refPolicyLabel(policy: string | null): string {
  if (!policy) return '';
  const map: Record<string, string> = {
    canonical_anchors: 'Anchor-Based',
    exploratory_cohesion: 'Cohesion Scoring',
    exploratory_cluster: 'Keeper Cluster',
  };
  return map[policy] || policy;
}

function DeltaIndicator({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const d = Number(delta);
  if (d > 1) return (
    <span className="flex items-center gap-0.5 text-emerald-400 text-[10px] font-medium">
      <TrendingUp className="w-3 h-3" /> +{d.toFixed(1)}
    </span>
  );
  if (d < -1) return (
    <span className="flex items-center gap-0.5 text-red-400 text-[10px] font-medium">
      <TrendingDown className="w-3 h-3" /> {d.toFixed(1)}
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-muted-foreground text-[10px]">
      <Minus className="w-3 h-3" /> Plateau
    </span>
  );
}

export function ConvergenceRoundTimeline({ rounds, currentRoundId }: Props) {
  if (rounds.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground px-1 mb-2">Round History</div>
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[13px] top-3 bottom-3 w-px bg-border/50" />

        <div className="space-y-0">
          {rounds.map((round, i) => {
            const isCurrent = round.id === currentRoundId;
            const isComplete = round.stage === 'complete';
            const isLast = i === rounds.length - 1;

            return (
              <div key={round.id} className={cn(
                'relative flex gap-3 py-2 px-1 rounded-lg transition-colors',
                isCurrent && 'bg-primary/5',
              )}>
                {/* Timeline dot */}
                <div className={cn(
                  'relative z-10 w-[26px] h-[26px] rounded-full flex items-center justify-center shrink-0 mt-0.5',
                  isCurrent ? 'bg-primary/20 text-primary ring-2 ring-primary/30' :
                  isComplete ? 'bg-emerald-500/15 text-emerald-500' :
                  'bg-muted text-muted-foreground/50',
                )}>
                  {isComplete ? (
                    <Trophy className="w-3 h-3" />
                  ) : (
                    <Target className="w-3 h-3" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-foreground">Round {round.round_number}</span>
                      <Badge variant="outline" className="text-[9px] h-4 px-1">
                        {strategyLabel(round.strategy)}
                      </Badge>
                      {round.evaluation_reference_policy && (
                        <span className="text-[9px] text-muted-foreground">
                          {refPolicyLabel(round.evaluation_reference_policy)}
                        </span>
                      )}
                    </div>
                    <DeltaIndicator delta={round.improvement_delta} />
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    {round.best_score !== null && (
                      <span>Best: <span className="text-foreground font-medium">{Number(round.best_score).toFixed(0)}</span></span>
                    )}
                    {round.avg_score !== null && (
                      <span>Avg: {Number(round.avg_score).toFixed(0)}</span>
                    )}
                    <span>
                      <Trophy className="w-3 h-3 inline text-amber-400/70 mr-0.5" />
                      {round.keeper_count} kept
                    </span>
                    {round.rejected_count > 0 && (
                      <span className="text-muted-foreground/50">{round.rejected_count} rejected</span>
                    )}
                    {round.stop_eligible && (
                      <Badge variant="outline" className="text-[8px] h-3.5 px-1 text-emerald-400 border-emerald-500/30">
                        Stop eligible
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
