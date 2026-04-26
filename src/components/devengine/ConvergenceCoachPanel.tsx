/**
 * ConvergenceCoachPanel — UI for convergence-coach-engine output.
 *
 * Shows axis breakdown bars, trajectory sparkline, top prescriptions.
 * Triggered by "Coaching" button in ConvergencePanel.
 *
 * Read-only — never writes canonical data.
 */
import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronDown, ChevronUp, Lightbulb, AlertTriangle, CircleCheck,
  ArrowUpCircle, ArrowDownCircle, Minus, Zap, Shield, Clock
} from 'lucide-react';
import { useConvergenceCoach, type ConvergenceCoachOutput } from '@/hooks/useConvergenceCoach';

/* ── Axis score bar ────────────────────────────────────────────── */
function AxisBar({ axis, score, diagnosis, finding }: {
  axis: string;
  score: number;
  diagnosis: string;
  finding?: string;
}) {
  const color = score >= 70 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-destructive';
  const statusIcon = score >= 70
    ? <CircleCheck className="h-3 w-3 text-emerald-400" />
    : score >= 50
    ? <AlertTriangle className="h-3 w-3 text-amber-400" />
    : <AlertTriangle className="h-3 w-3 text-destructive" />;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {statusIcon}
          <span className="text-[10px] font-medium text-foreground capitalize">{axis.replace(/_/g, ' ')}</span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">{Math.round(score)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <p className="text-[9px] text-muted-foreground">{diagnosis}</p>
      {finding && <p className="text-[8px] text-muted-foreground/70 italic">{finding}</p>}
    </div>
  );
}

/* ── Trajectory sparkline ─────────────────────────────────────── */
function TrajectorySparkline({ trend, trendReason }: {
  trend: 'improving' | 'stable' | 'degrading' | 'unknown';
  trendReason: string;
}) {
  const icon = trend === 'improving'
    ? <ArrowUpCircle className="h-4 w-4 text-emerald-400" />
    : trend === 'degrading'
    ? <ArrowDownCircle className="h-4 w-4 text-destructive" />
    : trend === 'stable'
    ? <CircleCheck className="h-4 w-4 text-muted-foreground" />
    : <Minus className="h-4 w-4 text-muted-foreground" />;

  const color = trend === 'improving'
    ? 'text-emerald-400'
    : trend === 'degrading'
    ? 'text-destructive'
    : 'text-muted-foreground';

  return (
    <div className="flex items-start gap-2 p-2 rounded bg-muted/30 border border-border/30">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-semibold capitalize ${color}`}>{trend}</span>
        </div>
        <p className="text-[9px] text-muted-foreground/80 leading-tight">{trendReason}</p>
      </div>
    </div>
  );
}

/* ── Prescription card ─────────────────────────────────────────── */
const SEVERITY_BG: Record<string, string> = {
  critical: 'bg-destructive/10',
  high: 'bg-amber-500/10',
  medium: 'bg-yellow-500/10',
  low: 'bg-muted/20',
};

const SEVERITY_BORDER: Record<string, string> = {
  critical: 'border-destructive/20',
  high: 'border-amber-500/20',
  medium: 'border-yellow-500/20',
  low: 'border-border/30',
};

const PROP_COLOR: Record<string, string> = {
  none: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  high: 'bg-destructive/10 text-destructive border-destructive/20',
};

interface PrescriptionCardProps {
  prescription: string;
  whyItMatters: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  axis: string;
  scene_prescription?: string;
  estimated_gp_impact?: number;
  propagation_risk?: 'none' | 'low' | 'medium' | 'high';
  estimated_effort?: 'minor' | 'moderate' | 'significant';
  index: number;
}

function PrescriptionCard({ prescription, whyItMatters, severity, axis, scene_prescription, estimated_gp_impact, propagation_risk, estimated_effort, index }: PrescriptionCardProps) {
  const [open, setOpen] = useState(false);
  const bg = SEVERITY_BG[severity] || SEVERITY_BG['low'];
  const border = SEVERITY_BORDER[severity] || SEVERITY_BORDER['low'];

  return (
    <div className={`rounded border p-2 space-y-1.5 ${bg} ${border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Badge variant="outline" className={`text-[8px] px-1 py-0 bg-destructive/10 text-destructive border-destructive/20`}>
            {severity}
          </Badge>
          <span className="text-[9px] text-muted-foreground/80">#{index + 1}</span>
          <span className="text-[9px] text-muted-foreground/60 capitalize">{axis.replace(/_/g, ' ')}</span>
        </div>
        <button onClick={() => setOpen(o => !o)} className="text-muted-foreground hover:text-foreground shrink-0">
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Main prescription */}
      <p className="text-[10px] font-medium leading-tight">
        {scene_prescription || prescription}
      </p>

      {/* Propagation risk badge */}
      {propagation_risk && propagation_risk !== 'none' && (
        <div className="flex items-center gap-1">
          <Shield className="h-2.5 w-2.5" />
          <Badge variant="outline" className={`text-[8px] px-1 py-0 ${PROP_COLOR[propagation_risk] || ''}`}>
            {propagation_risk} propagation risk
          </Badge>
        </div>
      )}

      {/* Effort badge */}
      {estimated_effort && (
        <Badge variant="outline" className="text-[8px] px-1 py-0 bg-muted/20 text-muted-foreground">
          {estimated_effort} effort
        </Badge>
      )}

      {/* GP impact */}
      {estimated_gp_impact && (
        <span className="text-[8px] font-mono text-emerald-400/70">
          +{estimated_gp_impact.toFixed(2)} GP
        </span>
      )}

      {/* Expanded: why it matters */}
      {open && (
        <div className="pt-1.5 border-t border-border/20 space-y-1">
          <p className="text-[9px] text-muted-foreground/60">Why it matters:</p>
          <p className="text-[9px] text-muted-foreground/80">{whyItMatters}</p>
        </div>
      )}
    </div>
  );
}

/* ── Fail-closed states ───────────────────────────────────────── */
function FailClosedMessage({ status }: { status: string }) {
  if (status === 'pre_convergence') {
    return (
      <div className="flex items-center gap-2 p-3 rounded bg-amber-500/10 border border-amber-500/20">
        <Clock className="h-4 w-4 text-amber-400 shrink-0" />
        <div>
          <p className="text-[10px] font-semibold text-amber-400">Pre-Convergence</p>
          <p className="text-[9px] text-amber-400/70">Run convergence analysis first before coaching.</p>
        </div>
      </div>
    );
  }
  if (status === 'insufficient_data') {
    return (
      <div className="flex items-center gap-2 p-3 rounded bg-destructive/10 border border-destructive/20">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        <div>
          <p className="text-[10px] font-semibold text-destructive">Insufficient Data</p>
          <p className="text-[9px] text-destructive/70">Scene extraction required before coaching can run.</p>
        </div>
      </div>
    );
  }
  return null;
}

/* ── Main panel ───────────────────────────────────────────────── */
interface ConvergenceCoachPanelProps {
  projectId: string;
  latestAnalysis?: any;
  className?: string;
}

export function ConvergenceCoachPanel({ projectId, latestAnalysis, className }: ConvergenceCoachPanelProps) {
  const [open, setOpen] = useState(false);
  const { runCoach, loading, data, error } = useConvergenceCoach();

  useEffect(() => {
    if (open && projectId && !data && !loading) {
      runCoach(projectId);
    }
  }, [open, projectId, data, loading, runCoach]);

  return (
    <div className={`space-y-2 ${className || ''}`}>
      {/* Toggle button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs gap-2"
        onClick={() => setOpen(o => !o)}
        disabled={loading}
      >
        {loading ? (
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border border-muted-foreground/30 border-t-muted-foreground animate-spin" />
            Running Coach...
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Lightbulb className="h-3 w-3" />
            Coaching {open ? '▼' : '▶'}
          </span>
        )}
      </Button>

      {/* Coach output */}
      {open && (
        <Card className="border-muted/30">
          <CardHeader className="py-1.5 px-3">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <Zap className="h-3 w-3" />
              Convergence Coaching
            </CardTitle>
            {data && (
              <span className="text-[8px] text-muted-foreground">
                Generated {new Date(data.generatedAt).toLocaleTimeString()}
              </span>
            )}
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-3">
            {loading && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            )}

            {error && (
              <div className="p-2 rounded bg-destructive/10 border border-destructive/20">
                <p className="text-[10px] text-destructive">Engine error: {error}</p>
              </div>
            )}

            {data && !loading && (
              <div className="space-y-3">
                {/* Narrative Structure Axis */}
                <div className="space-y-1.5">
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                    Narrative Structure
                  </p>
                  <div className="pl-2 space-y-1.5 border-l-2 border-muted/50">
                    {data.narrativeStructureAxis.findings.length === 0 ? (
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <CircleCheck className="h-3 w-3" />
                        <span className="text-[9px]">Converged — no structural issues</span>
                      </div>
                    ) : (
                      <AxisBar
                        axis="narrative_structure"
                        score={data.narrativeStructureAxis.score * 100}
                        diagnosis={data.narrativeStructureAxis.status}
                        finding={data.narrativeStructureAxis.findings[0]?.description}
                      />
                    )}
                  </div>
                </div>

                {/* Feasibility Axis */}
                <div className="space-y-1.5">
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                    Feasibility
                  </p>
                  <div className="pl-2 space-y-1.5 border-l-2 border-muted/50">
                    {data.feasibilityAxis.findings.length === 0 ? (
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <CircleCheck className="h-3 w-3" />
                        <span className="text-[9px]">Converged — no feasibility issues</span>
                      </div>
                    ) : (
                      <AxisBar
                        axis="feasibility"
                        score={data.feasibilityAxis.score * 100}
                        diagnosis={data.feasibilityAxis.status}
                        finding={data.feasibilityAxis.findings[0]?.description}
                      />
                    )}
                  </div>
                </div>

                {/* Trajectory */}
                {data.convergenceTrajectory && (
                  <TrajectorySparkline
                    trend={data.convergenceTrajectory.trend}
                    trendReason={data.convergenceTrajectory.trendReason}
                  />
                )}

                {/* Top Prescriptions (up to 3) */}
                {data.revisionPrescriptions && data.revisionPrescriptions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                      Top Prescriptions
                    </p>
                    <div className="space-y-1.5">
                      {data.revisionPrescriptions.slice(0, 3).map((rx, i) => (
                        <PrescriptionCard
                          key={i}
                          prescription={rx.prescription}
                          whyItMatters={rx.whyItMatters}
                          severity={(rx as any).severity || 'medium'}
                          axis={rx.axis}
                          scene_prescription={rx.scene_prescription}
                          estimated_gp_impact={rx.estimated_gp_impact}
                          propagation_risk={rx.propagation_risk}
                          estimated_effort={rx.estimated_effort}
                          index={i}
                        />
                      ))}
                    </div>
                    {data.revisionPrescriptions.length > 3 && (
                      <p className="text-[8px] text-muted-foreground/60 text-center">
                        +{data.revisionPrescriptions.length - 3} more prescriptions
                      </p>
                    )}
                  </div>
                )}

                {/* Blockers */}
                {data.convergenceTrajectory?.blockers?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold text-destructive uppercase tracking-wider">Blockers</p>
                    {data.convergenceTrajectory.blockers.map((b, i) => (
                      <div key={i} className="p-1.5 rounded bg-destructive/10 border border-destructive/20">
                        <p className="text-[9px] text-destructive/90">{b.cannotFixWithout}</p>
                        <p className="text-[8px] text-destructive/50">Upstream: {b.upstreamSource}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty: all converged */}
                {data.revisionPrescriptions.length === 0 &&
                 data.narrativeStructureAxis.findings.length === 0 &&
                 data.feasibilityAxis.findings.length === 0 && (
                  <div className="flex items-center gap-1.5 text-emerald-400 p-2">
                    <CircleCheck className="h-4 w-4" />
                    <span className="text-[10px]">Full convergence — no prescriptions needed</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}