/**
 * AxisScoreBar — score visualization for a single convergence diagnostic axis.
 * 0–100 scale, color-coded: green ≥70, amber ≥50, red <50.
 * Shows icon, label, bar, score, diagnosis text.
 */
import { CircleCheck, AlertTriangle, Minus } from 'lucide-react';

interface AxisScoreBarProps {
  axis: string;
  score: number;         // 0–100
  status: 'converged' | 'diverged' | 'unknown';
  diagnosis: string;
  className?: string;
}

export function AxisScoreBar({ axis, score, status, diagnosis, className }: AxisScoreBarProps) {
  const color =
    score >= 70 ? 'bg-emerald-500' :
    score >= 50 ? 'bg-amber-500' :
    'bg-destructive';

  const icon =
    score >= 70 ? <CircleCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> :
    score >= 50 ? <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" /> :
    <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />;

  const statusColor =
    status === 'converged' ? 'text-emerald-400' :
    status === 'diverged' ? 'text-amber-400' :
    'text-muted-foreground';

  return (
    <div className={`space-y-1.5 ${className || ''}`}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {icon}
          <span className="text-xs font-medium text-foreground capitalize truncate">
            {axis.replace(/_/g, ' ')}
          </span>
          <span className={`text-[10px] ${statusColor} capitalize shrink-0`}>
            ({status})
          </span>
        </div>
        <span className="text-xs font-mono text-muted-foreground shrink-0">
          {Math.round(score)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>

      {/* Diagnosis */}
      <p className="text-[10px] text-muted-foreground leading-snug">{diagnosis}</p>
    </div>
  );
}