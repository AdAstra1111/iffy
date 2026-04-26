/**
 * ConvergenceCoachPanel — main coaching UI for convergence-coach-engine output.
 *
 * Displays:
 *   - 6 diagnostic axes with scores (Narrative Structure, Feasibility × narrative/commercial)
 *   - Findings with severity badges
 *   - Trajectory indicator
 *   - Actionable prescriptions
 *
 * Wire into: ProjectDevelopmentEngine TabsContent value="convergence"
 * Read-only — never writes canonical data.
 */
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Lightbulb,
  Zap,
  ArrowUpCircle,
  ArrowDownCircle,
  Minus,
  CircleCheck,
  AlertTriangle,
  Clock,
  Shield,
  ChevronRight,
} from 'lucide-react';
import { useConvergenceCoach, type ConvergenceCoachOutput } from '@/hooks/useConvergenceCoach';
import { AxisScoreBar } from './AxisScoreBar';
import { FindingCard } from './FindingCard';
import { PrescriptionCard } from './PrescriptionCard';

/* ── Trajectory indicator ─────────────────────────────────────── */
function TrajectoryIndicator({ trend, trendReason }: {
  trend: NonNullable<ConvergenceCoachOutput['convergenceTrajectory']>['trend'];
  trendReason: string;
}) {
  const config = {
    improving:   { icon: ArrowUpCircle,   color: 'text-emerald-400',   bg: 'bg-emerald-500/10',  border: 'border-emerald-500/30' },
    stable:      { icon: Minus,           color: 'text-muted-foreground', bg: 'bg-muted/20',        border: 'border-border/30' },
    degrading:   { icon: ArrowDownCircle, color: 'text-destructive',    bg: 'bg-destructive/10',  border: 'border-destructive/30' },
    unknown:     { icon: Minus,           color: 'text-muted-foreground', bg: 'bg-muted/20',        border: 'border-border/30' },
  }[trend] ?? { icon: Minus, color: 'text-muted-foreground', bg: 'bg-muted/20', border: 'border-border/30' };

  const Icon = config.icon;

  return (
    <div className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${config.bg} ${config.border}`}>
      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${config.color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-[10px] font-semibold capitalize ${config.color}`}>
            {trend}
          </span>
        </div>
        <p className="text-[9px] text-muted-foreground/80 leading-snug">{trendReason}</p>
      </div>
    </div>
  );
}

/* ── Axis section with findings ───────────────────────────────── */
function AxisSection({ label, status, score, findings }: {
  label: string;
  status: 'converged' | 'diverged' | 'unknown';
  score: number;       // 0–100
  findings: ConvergenceCoachOutput['narrativeStructureAxis']['findings'];
}) {
  return (
    <div className="space-y-2">
      {/* Axis label */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <Badge
          variant="outline"
          className={`text-[8px] px-1 py-0 ${
            status === 'converged'
              ? 'border-emerald-500/30 text-emerald-400'
              : status === 'diverged'
              ? 'border-amber-500/30 text-amber-400'
              : 'border-border/30 text-muted-foreground'
          }`}
        >
          {status}
        </Badge>
      </div>

      {/* Score bar */}
      <AxisScoreBar
        axis={label}
        score={score}
        status={status}
        diagnosis={status === 'converged' ? 'No structural issues detected' : `${findings.length} finding${findings.length !== 1 ? 's' : ''} found`}
      />

      {/* Findings list */}
      {findings.length > 0 && (
        <div className="pl-2 space-y-1.5 border-l-2 border-border/40">
          {findings.map((f, i) => (
            <FindingCard
              key={i}
              checkId={f.checkId}
              severity={f.severity}
              upstreamDoc={f.upstreamDoc}
              downstreamDoc={f.downstreamDoc}
              description={f.description}
              divergenceType={f.divergenceType}
              affectedElements={f.affectedElements}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Fixable blockers list ───────────────────────────────────── */
function FixableList({ fixable }: { fixable: NonNullable<ConvergenceCoachOutput['convergenceTrajectory']>['fixable'] }) {
  if (!fixable || fixable.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
        Fixable Now
      </p>
      {fixable.map((f, i) => (
        <div
          key={i}
          className="flex items-start gap-2 p-2 rounded bg-emerald-500/5 border border-emerald-500/20"
        >
          <ChevronRight className="h-3 w-3 text-emerald-400/70 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-emerald-400/90 font-medium">{f.description}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] text-muted-foreground/60">Fix by: {f.fixBy}</span>
              <span className="text-[9px] text-muted-foreground/60">({f.estimatedEffort})</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Blocker list ────────────────────────────────────────────── */
function BlockerList({ blockers }: { blockers: NonNullable<ConvergenceCoachOutput['convergenceTrajectory']>['blockers'] }) {
  if (!blockers || blockers.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[9px] font-bold text-destructive uppercase tracking-wider">
        Blockers
      </p>
      {blockers.map((b, i) => (
        <div
          key={i}
          className="flex items-start gap-2 p-2 rounded bg-destructive/5 border border-destructive/20"
        >
          <AlertTriangle className="h-3 w-3 text-destructive/70 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-destructive/90">{b.cannotFixWithout}</p>
            <p className="text-[9px] text-destructive/50">Upstream: {b.upstreamSource}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Main panel ───────────────────────────────────────────────── */
interface ConvergenceCoachPanelProps {
  projectId: string;
  latestAnalysis?: unknown;
  className?: string;
}

export function ConvergenceCoachPanel({ projectId, latestAnalysis, className }: ConvergenceCoachPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const { runCoach, loading, data, error } = useConvergenceCoach();

  useEffect(() => {
    if (expanded && projectId && !data && !loading) {
      runCoach(projectId);
    }
  }, [expanded, projectId, data, loading, runCoach]);

  return (
    <div className={`space-y-2 ${className || ''}`}>
      {/* Toggle */}
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs gap-2"
        onClick={() => setExpanded(e => !e)}
        disabled={loading}
      >
        {loading ? (
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border border-muted-foreground/30 border-t-muted-foreground animate-spin" />
            Running Coach…
          </span>
        ) : (
          <>
            <Lightbulb className="h-3.5 w-3.5" />
            Convergence Coach {expanded ? '▼' : '▶'}
          </>
        )}
      </Button>

      {/* Coach output */}
      {expanded && (
        <Card className="border-muted/40">
          <CardHeader className="py-2 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <Zap className="h-3 w-3" />
              Convergence Coach
            </CardTitle>
            {data && (
              <span className="text-[8px] text-muted-foreground">
                {new Date(data.generatedAt).toLocaleTimeString()}
              </span>
            )}
          </CardHeader>

          <CardContent className="px-4 pb-4 space-y-4">
            {/* Loading */}
            {loading && (
              <div className="space-y-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-5 w-1/2" />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-xs text-destructive">Engine error: {error}</p>
              </div>
            )}

            {/* Results */}
            {data && !loading && (
              <>
                {/* ── Axis 1: Narrative Structure ── */}
                <AxisSection
                  label="Narrative Structure"
                  status={data.narrativeStructureAxis.status}
                  score={data.narrativeStructureAxis.score * 100}
                  findings={data.narrativeStructureAxis.findings}
                />

                {/* ── Axis 2: Feasibility ── */}
                <AxisSection
                  label="Feasibility"
                  status={data.feasibilityAxis.status}
                  score={data.feasibilityAxis.score * 100}
                  findings={data.feasibilityAxis.findings as any}
                />

                {/* ── Trajectory ── */}
                {data.convergenceTrajectory && (
                  <TrajectoryIndicator
                    trend={data.convergenceTrajectory.trend}
                    trendReason={data.convergenceTrajectory.trendReason}
                  />
                )}

                {/* ── Blockers (if any) ── */}
                <BlockerList blockers={data.convergenceTrajectory?.blockers ?? []} />

                {/* ── Fixable (if any) ── */}
                <FixableList fixable={data.convergenceTrajectory?.fixable ?? []} />

                {/* ── Prescriptions ── */}
                {data.revisionPrescriptions && data.revisionPrescriptions.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        Prescriptions
                      </span>
                      <Badge variant="outline" className="text-[8px] px-1 py-0 text-muted-foreground">
                        {data.revisionPrescriptions.length}
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                      {data.revisionPrescriptions.map((rx, i) => (
                        <PrescriptionCard key={i} prescription={rx} index={i} />
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Fully converged state ── */}
                {data.revisionPrescriptions.length === 0 &&
                 data.narrativeStructureAxis.findings.length === 0 &&
                 (data.feasibilityAxis.findings as any).length === 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <CircleCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                    <p className="text-xs text-emerald-400">Full convergence — no prescriptions needed.</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}