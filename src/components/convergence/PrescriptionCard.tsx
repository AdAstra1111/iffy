/**
 * PrescriptionCard — actionable revision recommendation from ConvergenceCoach.
 * Expandable card showing priority, prescription, propagation risk, GP impact.
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp, Shield, Zap, ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { RevisionPrescription } from '@/hooks/useConvergenceCoach';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-destructive/15 border-destructive/40 text-destructive',
  high: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
  medium: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400',
  low: 'bg-muted/30 border-border/50 text-muted-foreground',
};

const PROP_COLORS: Record<string, string> = {
  none: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  low: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  medium: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  high: 'bg-destructive/10 border-destructive/20 text-destructive',
};

const EFFORT_COLORS: Record<string, string> = {
  minor: 'bg-emerald-500/10 text-emerald-400',
  moderate: 'bg-amber-500/10 text-amber-400',
  significant: 'bg-destructive/10 text-destructive',
};

interface PrescriptionCardProps {
  prescription: RevisionPrescription;
  index: number;
  className?: string;
}

export function PrescriptionCard({ prescription: rx, index, className }: PrescriptionCardProps) {
  const [open, setOpen] = useState(false);

  const severity = rx.severity ?? 'low';
  const sevColor = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.low;
  const propColor = PROP_COLORS[rx.propagation_risk ?? 'none'] ?? PROP_COLORS.none;
  const effortColor = EFFORT_COLORS[rx.estimated_effort ?? 'minor'] ?? EFFORT_COLORS.minor;

  return (
    <div className={`rounded-md border p-2.5 space-y-2 ${sevColor} ${className || ''}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
          <Badge variant="outline" className={`text-[8px] px-1 py-0 ${sevColor}`}>
            {severity}
          </Badge>
          <span className="text-[9px] text-muted-foreground/70">
            #{index + 1}
          </span>
          <span className="text-[9px] text-muted-foreground/60 capitalize">
            {rx.axis.replace(/_/g, ' ')}
          </span>
          {rx.priority && (
            <span className="text-[9px] font-mono text-muted-foreground/50">
              P{rx.priority}
            </span>
          )}
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Prescription text — always visible */}
      <p className="text-[11px] font-medium text-foreground leading-snug">
        {rx.scene_prescription || rx.prescription}
      </p>

      {/* Meta badges — always visible */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* GP impact */}
        {rx.estimated_gp_impact != null && (
          <span className="flex items-center gap-0.5 text-[9px] font-mono text-emerald-400/80">
            <Zap className="h-2.5 w-2.5" />
            +{rx.estimated_gp_impact.toFixed(2)} GP
          </span>
        )}

        {/* Propagation risk */}
        {rx.propagation_risk && rx.propagation_risk !== 'none' && (
          <Badge variant="outline" className={`text-[8px] px-1 py-0 ${propColor}`}>
            <Shield className="h-2 w-2 mr-0.5" />
            {rx.propagation_risk} risk
          </Badge>
        )}

        {/* Effort */}
        {rx.estimated_effort && (
          <Badge variant="outline" className={`text-[8px] px-1 py-0 ${effortColor}`}>
            {rx.estimated_effort} effort
          </Badge>
        )}
      </div>

      {/* Expanded details */}
      {open && (
        <div className="pt-2 border-t border-border/20 space-y-1.5">
          {/* Why it matters */}
          {rx.whyItMatters && (
            <div>
              <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-0.5">
                Why it matters
              </p>
              <p className="text-[10px] text-muted-foreground/80 leading-snug">
                {rx.whyItMatters}
              </p>
            </div>
          )}

          {/* Upstream change */}
          {rx.upstreamChange && (
            <div className="flex items-start gap-1">
              <ArrowUpRight className="h-2.5 w-2.5 text-amber-400/70 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-400/80 leading-snug">
                {rx.upstreamChange}
              </p>
            </div>
          )}

          {/* Scene prescription (if not used as main text) */}
          {rx.scene_prescription && rx.prescription !== rx.scene_prescription && (
            <div>
              <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-0.5">
                Scene prescription
              </p>
              <p className="text-[10px] text-muted-foreground/80 leading-snug">
                {rx.scene_prescription}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}