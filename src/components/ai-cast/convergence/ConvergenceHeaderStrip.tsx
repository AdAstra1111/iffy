/**
 * ConvergenceHeaderStrip — Top-level run summary for Mission Control.
 * Shows mode, status, round progress, best score, and recommendation.
 */
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Zap, Shield, Target, CheckCircle2, XCircle, Pause, Clock, AlertTriangle,
} from 'lucide-react';
import type { ConvergenceRun } from '@/lib/aiCast/convergenceEngine';

interface Props {
  run: ConvergenceRun;
  bestScore: number | null;
}

const STATUS_CONFIG: Record<string, { icon: typeof Target; label: string; className: string }> = {
  pending:   { icon: Clock,         label: 'Preparing',  className: 'text-muted-foreground' },
  running:   { icon: Target,        label: 'Converging', className: 'text-primary' },
  paused:    { icon: Pause,         label: 'Paused',     className: 'text-muted-foreground' },
  completed: { icon: CheckCircle2,  label: 'Complete',   className: 'text-emerald-500' },
  failed:    { icon: XCircle,       label: 'Failed',     className: 'text-destructive' },
  aborted:   { icon: AlertTriangle, label: 'Aborted',    className: 'text-muted-foreground' },
};

function scoreBandColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score >= 90) return 'text-emerald-400';
  if (score >= 75) return 'text-primary';
  if (score >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function scoreBandLabel(score: number | null): string {
  if (score === null) return '—';
  if (score >= 90) return 'Elite';
  if (score >= 75) return 'Stable';
  if (score >= 60) return 'Promising';
  return 'Weak';
}

export function ConvergenceHeaderStrip({ run, bestScore }: Props) {
  const cfg = STATUS_CONFIG[run.status] || STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;
  const isExplore = run.mode === 'exploratory';
  const roundPct = run.max_rounds > 0 ? Math.round((run.current_round / run.max_rounds) * 100) : 0;
  const isTerminal = ['completed', 'failed', 'aborted'].includes(run.status);

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg ${isExplore ? 'bg-violet-500/10' : 'bg-primary/10'}`}>
            {isExplore
              ? <Zap className="w-4 h-4 text-violet-400" />
              : <Shield className="w-4 h-4 text-primary" />
            }
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-display font-semibold text-foreground">
                {isExplore ? 'Exploratory Convergence' : 'Identity Convergence'}
              </span>
              <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${cfg.className}`}>
                <StatusIcon className="w-3 h-3 mr-0.5" />
                {cfg.label}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isExplore
                ? 'Discovering cohesive visual identity through cluster convergence'
                : 'Preserving anchor-locked identity across controlled conditions'
              }
            </p>
          </div>
        </div>

        {/* Score pill */}
        <div className="flex items-center gap-3">
          {bestScore !== null && (
            <div className="text-right">
              <div className={`text-xl font-display font-bold tabular-nums ${scoreBandColor(bestScore)}`}>
                {bestScore.toFixed(0)}
              </div>
              <div className={`text-[10px] font-medium ${scoreBandColor(bestScore)}`}>
                {scoreBandLabel(bestScore)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Progress strip */}
      <div className="px-4 pb-3 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Round {run.current_round} of {run.max_rounds}</span>
          <span className="tabular-nums">{roundPct}%</span>
        </div>
        <Progress
          value={isTerminal ? 100 : roundPct}
          className={`h-1.5 ${isTerminal && run.status === 'completed' ? '[&>div]:bg-emerald-500' : isExplore ? '[&>div]:bg-violet-500' : ''}`}
        />
      </div>

      {/* Recommendation strip */}
      {run.final_recommendation && (
        <div className="px-4 py-2 border-t border-border/40 bg-emerald-500/5">
          <p className="text-xs text-emerald-400 font-medium">{run.final_recommendation}</p>
        </div>
      )}
      {run.status === 'failed' && run.stop_reason && (
        <div className="px-4 py-2 border-t border-border/40 bg-destructive/5">
          <p className="text-xs text-destructive">{run.stop_reason}</p>
        </div>
      )}
    </div>
  );
}
