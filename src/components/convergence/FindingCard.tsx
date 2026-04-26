/**
 * FindingCard — individual diagnostic finding with severity badge.
 * Used inside ConvergenceCoachPanel for each finding in an axis.
 */
import { AlertTriangle, CircleCheck, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';

interface FindingCardProps {
  checkId: string;
  severity: FindingSeverity;
  upstreamDoc?: string;
  downstreamDoc?: string;
  entityOrSystem?: string;
  description: string;
  expected?: string;
  actual?: string;
  divergenceType?: string;
  affectedElements?: string[];
  className?: string;
}

const SEVERITY_CONFIG: Record<FindingSeverity, {
  color: string;
  borderColor: string;
  textColor: string;
  icon: typeof AlertTriangle;
}> = {
  critical: {
    color: 'bg-destructive/10',
    borderColor: 'border-destructive/40',
    textColor: 'text-destructive',
    icon: AlertTriangle,
  },
  high: {
    color: 'bg-amber-500/10',
    borderColor: 'border-amber-500/40',
    textColor: 'text-amber-400',
    icon: AlertTriangle,
  },
  medium: {
    color: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/40',
    textColor: 'text-yellow-400',
    icon: AlertTriangle,
  },
  low: {
    color: 'bg-muted/30',
    borderColor: 'border-border/50',
    textColor: 'text-muted-foreground',
    icon: Info,
  },
};

export function FindingCard({
  checkId,
  severity,
  upstreamDoc,
  downstreamDoc,
  entityOrSystem,
  description,
  expected,
  actual,
  divergenceType,
  affectedElements,
  className,
}: FindingCardProps) {
  const cfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.low;
  const Icon = cfg.icon;

  return (
    <div
      className={`rounded-md border p-2 space-y-1 ${cfg.color} ${cfg.borderColor} ${className || ''}`}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Icon className={`h-3 w-3 shrink-0 ${cfg.textColor}`} />
        <Badge
          variant="outline"
          className={`text-[9px] px-1 py-0 font-medium ${cfg.color} ${cfg.textColor} border-${cfg.borderColor}`}
        >
          {severity}
        </Badge>
        {divergenceType && (
          <span className="text-[9px] text-muted-foreground/70 capitalize">
            {divergenceType.replace(/_/g, ' ')}
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-[10px] text-foreground leading-snug">{description}</p>

      {/* Context: upstream/downstream or entity */}
      {(upstreamDoc || downstreamDoc) && (
        <div className="flex items-center gap-1.5">
          {upstreamDoc && (
            <span className="text-[9px] text-muted-foreground/60">
              From: <span className="text-muted-foreground/80">{upstreamDoc}</span>
            </span>
          )}
          {downstreamDoc && (
            <span className="text-[9px] text-muted-foreground/60">
              → <span className="text-muted-foreground/80">{downstreamDoc}</span>
            </span>
          )}
        </div>
      )}

      {entityOrSystem && (
        <p className="text-[9px] text-muted-foreground/60">
          Entity: <span className="text-muted-foreground/80">{entityOrSystem}</span>
        </p>
      )}

      {/* Expected vs Actual */}
      {expected && actual && (
        <div className="flex items-start gap-1.5 text-[9px]">
          <span className="text-emerald-400/70 shrink-0">Expected:</span>
          <span className="text-muted-foreground/80">{expected}</span>
          <span className="text-destructive/70 shrink-0">Actual:</span>
          <span className="text-muted-foreground/80">{actual}</span>
        </div>
      )}

      {/* Affected elements */}
      {affectedElements && affectedElements.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {affectedElements.map((el, i) => (
            <span
              key={i}
              className="text-[8px] px-1 py-0.5 rounded bg-muted/40 text-muted-foreground"
            >
              {el}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}