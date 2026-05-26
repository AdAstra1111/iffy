/**
 * RewriteTrajectoryObservatory — Read-only diagnostics panel for rewrite trajectory.
 *
 * Displays: version timeline, score trajectory, note evolution, rewrite behavior,
 * diagnostic flags, threshold transparency, missing-data report.
 *
 * ZERO WRITES. ZERO MUTATIONS. ZERO BEHAVIOR CHANGES.
 */

import React, { useState, useMemo } from 'react';
import { useRewriteTrajectory, type ObservatoryState } from '@/hooks/useRewriteTrajectory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  RefreshCw, ChevronDown, ChevronRight,
  AlertTriangle, CircleCheck, Info, AlertCircle,
  BarChart3, Clock, FileText,
} from 'lucide-react';

// ── Sparkline (reuse ConvergencePanel pattern) ──────────────────

function Sparkline({ ciValues, gpValues }: { ciValues: number[]; gpValues: (number | null)[] }) {
  if (ciValues.length < 2) return null;
  const w = 200, h = 40, pad = 4;
  const all = [...ciValues, ...gpValues.filter((v): v is number => v !== null)];
  if (all.length === 0) return null;
  const min = Math.min(...all, 0);
  const max = Math.max(...all, 100);
  const range = max - min || 1;

  const toPath = (pts: number[]) => pts.map((v, i) => {
    const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');

  const ciPath = toPath(ciValues);
  const gpFiltered = gpValues.filter((v): v is number => v !== null);
  const gpPath = gpFiltered.length > 0 ? toPath(gpFiltered) : '';

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[240px]">
      <line x1={pad} y1={h - pad - ((85 - min) / range) * (h - pad * 2)}
            x2={w - pad} y2={h - pad - ((85 - min) / range) * (h - pad * 2)}
            stroke="hsl(var(--primary)/0.3)" strokeWidth="1" strokeDasharray="4 2" />
      <path d={ciPath} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" />
      {gpPath && (
        <path d={gpPath} fill="none" stroke="hsl(142 71% 45%)" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 2" />
      )}
    </svg>
  );
}

// ── Section header ──────────────────────────────────────────────

function SectionHeader({
  title,
  icon,
  count,
  open,
  onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 w-full text-left py-1.5 px-0 hover:bg-muted/20 rounded-sm transition-colors"
    >
      {open ? (
        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
      ) : (
        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
      )}
      {icon}
      <span className="text-[10px] font-semibold uppercase tracking-wider">{title}</span>
      {count !== undefined && count > 0 && (
        <Badge variant="outline" className="text-[8px] px-1 py-0 ml-1">{count}</Badge>
      )}
    </button>
  );
}

// ── Flag severity badge ─────────────────────────────────────────

function FlagBadge({ level }: { level: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const style =
    level === 'HIGH'
      ? 'bg-destructive/15 text-destructive border-destructive/30'
      : level === 'MEDIUM'
      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
      : 'bg-muted/20 text-muted-foreground border-border/30';
  return (
    <Badge variant="outline" className={`text-[8px] px-1.5 py-0 ${style}`}>
      {level}
    </Badge>
  );
}

// ── Main component ──────────────────────────────────────────────

interface Props {
  projectId: string | undefined;
  documentId: string | undefined;
}

export function RewriteTrajectoryObservatory({ projectId, documentId }: Props) {
  const { state, isLoading, error, refetchAll } = useRewriteTrajectory({ projectId, documentId });
  const [sections, setSections] = useState<Record<string, boolean>>({
    timeline: false,
    scores: true, // open by default
    notes: false,
    behavior: false,
    flags: true, // open by default
    thresholds: false,
    missing: false,
  });

  const toggle = (key: string) => setSections(s => ({ ...s, [key]: !s[key] }));

  // ── Loading ──
  if (isLoading && state.versions.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <BarChart3 className="h-3 w-3" />
            Rewrite Trajectory Observatory
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  // ── Empty ──
  if (!isLoading && state.versions.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <BarChart3 className="h-3 w-3" />
            Rewrite Trajectory Observatory
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="flex items-center gap-2 p-2 rounded bg-muted/20 border border-border/30">
            <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <p className="text-[9px] text-muted-foreground">
              No version data available for the selected document. Select a document with rewrite history to load the observatory.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <Card className="border-border/50">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <BarChart3 className="h-3 w-3" />
            Rewrite Trajectory Observatory
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
            <p className="text-[9px] text-destructive">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { v } = state;
  const latestPair = state.versionPairs[state.versionPairs.length - 1];
  const activeFlags = state.diagnosticFlags.filter(f => f.detected);
  const highFlags = activeFlags.filter(f => f.level === 'HIGH');

  return (
    <Card className="border-border/50">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <BarChart3 className="h-3 w-3" />
            Rewrite Trajectory Observatory
            <span className="text-[8px] text-muted-foreground font-normal">
              v{state.versions[0]?.version_number ?? '?'}–v{state.versions[state.versions.length - 1]?.version_number ?? '?'}
            </span>
          </CardTitle>
          <div className="flex items-center gap-1">
            {highFlags.length > 0 && (
              <Badge variant="outline" className="text-[8px] px-1.5 py-0 bg-destructive/15 text-destructive border-destructive/30">
                {highFlags.length} flags
              </Badge>
            )}
            <button onClick={() => refetchAll()} className="p-0.5 hover:bg-muted/20 rounded" title="Refresh">
              <RefreshCw className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-3 pb-3 space-y-1">

        {/* ── Diagnostic flags summary (always visible) ── */}
        {activeFlags.length > 0 && (
          <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20 space-y-1">
            <p className="text-[8px] font-bold text-amber-400 uppercase tracking-wider">
              {activeFlags.length} diagnostic flag{activeFlags.length !== 1 ? 's' : ''} raised
            </p>
            {activeFlags.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <FlagBadge level={f.level} />
                <span className="text-[8px] text-amber-300/90 font-mono">{f.flag}</span>
                <span className="text-[7px] text-amber-400/60 ml-auto">{f.explanation}</span>
              </div>
            ))}
          </div>
        )}

        {/* ═══ 1. Version Timeline ═══ */}
        <div>
          <SectionHeader
            title="Version Timeline"
            icon={<Clock className="h-3 w-3 text-muted-foreground" />}
            count={state.versions.length}
            open={sections.timeline}
            onToggle={() => toggle('timeline')}
          />
          {sections.timeline && (
            <div className="pl-1 space-y-[1px]">
              <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 text-[7px] text-muted-foreground/60 uppercase tracking-wider px-2 py-0.5">
                <span>#</span>
                <span>Content</span>
                <span>Chg Sum</span>
                <span>Status</span>
              </div>
              {state.versions.map((v, i) => {
                const prevText = i > 0 ? state.versions[i - 1].plaintext : '';
                const charDelta = i > 0 ? (v.plaintext?.length ?? 0) - (prevText?.length ?? 0) : 0;
                const timeDelta = i > 0
                  ? Math.round((new Date(v.created_at).getTime() - new Date(state.versions[i - 1].created_at).getTime()) / 60000)
                  : 0;
                return (
                  <div key={v.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 text-[8px] px-2 py-0.5 rounded hover:bg-muted/20 items-center">
                    <span className="font-mono text-muted-foreground">{v.version_number}</span>
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="truncate text-foreground/80">{v.label || '(unnamed)'}</span>
                      {v.is_current && (
                        <Badge variant="outline" className="text-[6px] px-0.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shrink-0">
                          CUR
                        </Badge>
                      )}
                    </div>
                    <span className={`font-mono text-right ${charDelta > 0 ? 'text-emerald-400/70' : charDelta < 0 ? 'text-destructive/70' : 'text-muted-foreground/50'}`}>
                      {charDelta > 0 ? '+' : ''}{charDelta}c
                    </span>
                    <span className="text-muted-foreground/60 text-right">
                      {v.approval_status === 'approved' ? '✓' : v.approval_status === 'draft' ? '○' : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══ 2. Score Trajectory ═══ */}
        <div>
          <SectionHeader
            title="Score Trajectory"
            icon={<BarChart3 className="h-3 w-3 text-muted-foreground" />}
            count={state.scorePoints.length}
            open={sections.scores}
            onToggle={() => toggle('scores')}
          />
          {sections.scores && (
            <div className="pl-1 space-y-1.5">
              {state.scorePoints.length >= 2 ? (
                <>
                  <Sparkline
                    ciValues={state.scorePoints.filter(s => s.ci !== null).map(s => s.ci!)}
                    gpValues={state.scorePoints.filter(s => s.gp !== null).map(s => s.gp!)}
                  />
                  <div className="grid grid-cols-4 gap-1 text-center text-[8px]">
                    <div>
                      <p className="text-muted-foreground/60">CI trend</p>
                      <p className={state.ciTrend.direction === 'improving' ? 'text-emerald-400' : state.ciTrend.direction === 'degrading' ? 'text-destructive' : 'text-foreground'}>
                        {state.ciTrend.direction}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground/60">GP trend</p>
                      <p className={state.gpTrend.direction === 'improving' ? 'text-emerald-400' : state.gpTrend.direction === 'degrading' ? 'text-destructive' : 'text-foreground'}>
                        {state.gpTrend.direction}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground/60">CI/ver</p>
                      <p className="text-foreground">{state.ciTrend.gradient.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground/60">GP/ver</p>
                      <p className="text-foreground">{state.gpTrend.gradient.toFixed(1)}</p>
                    </div>
                  </div>
                  <div className="text-[7px] text-muted-foreground/50 italic">
                    Gate threshold: CI ≥ 85, GP ≥ 85 (dashed line)
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 p-2 rounded bg-muted/20 border border-border/30">
                  <Info className="h-3 w-3 text-muted-foreground shrink-0" />
                  <p className="text-[8px] text-muted-foreground">
                    Insufficient score data (need 2+ data points, have {state.scorePoints.length}). Run convergence analysis to populate score trajectory.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══ 3. Note Evolution ═══ */}
        <div>
          <SectionHeader
            title="Note Evolution"
            icon={<FileText className="h-3 w-3 text-muted-foreground" />}
            count={state.noteEntries.length}
            open={sections.notes}
            onToggle={() => toggle('notes')}
          />
          {sections.notes && (
            <div className="pl-1 space-y-1">
              {state.noteEntries.length > 0 ? (
                <>
                  <div className="grid grid-cols-[auto_1fr_auto] gap-x-2 text-[7px] text-muted-foreground/60 uppercase tracking-wider px-2 py-0.5">
                    <span>V</span>
                    <span>Note</span>
                    <span>Res</span>
                  </div>
                  {state.noteEntries.slice(0, 20).map((n, i) => (
                    <div key={i} className="grid grid-cols-[auto_1fr_auto] gap-x-2 text-[8px] px-2 py-0.5 rounded hover:bg-muted/20 items-start">
                      <span className="font-mono text-muted-foreground mt-[1px]">{n.versionNumber}</span>
                      <div className="min-w-0">
                        <p className="truncate text-foreground/80">{n.description || n.noteKey}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {n.severity && (
                            <Badge variant="outline" className={`text-[6px] px-0.5 py-0 ${
                              n.severity === 'critical' ? 'bg-destructive/15 text-destructive border-destructive/30' :
                              n.severity === 'high' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                              'bg-muted/20 text-muted-foreground border-border/30'
                            }`}>
                              {n.severity}
                            </Badge>
                          )}
                          {n.regressed && (
                            <Badge variant="outline" className="text-[6px] px-0.5 py-0 bg-destructive/15 text-destructive border-destructive/30">
                              REGRESSED
                            </Badge>
                          )}
                        </div>
                      </div>
                      <span className={n.resolved ? 'text-emerald-400/70' : 'text-muted-foreground/40'}>
                        {n.resolved ? '✓' : '○'}
                      </span>
                    </div>
                  ))}
                  {state.noteEntries.length > 20 && (
                    <p className="text-[7px] text-muted-foreground/60 text-center">
                      +{state.noteEntries.length - 20} more notes
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-[8px] text-muted-foreground/60 pt-0.5">
                    <span>Overlap: {state.noteOverlapPct.toFixed(0)}%</span>
                    <span>Resolved: {state.noteEntries.filter(n => n.resolved).length}/{state.noteEntries.length}</span>
                    <span>Regressed: {state.noteEntries.filter(n => n.regressed).length}</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 p-2 rounded bg-muted/20 border border-border/30">
                  <Info className="h-3 w-3 text-muted-foreground shrink-0" />
                  <p className="text-[8px] text-muted-foreground">
                    No note data for this document. Run convergence analysis to generate notes.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══ 4. Rewrite Behavior ═══ */}
        <div>
          <SectionHeader
            title="Rewrite Behavior"
            icon={<FileText className="h-3 w-3 text-muted-foreground" />}
            count={state.versionPairs.length}
            open={sections.behavior}
            onToggle={() => toggle('behavior')}
          />
          {sections.behavior && (
            <div className="pl-1 space-y-1">
              {state.versionPairs.length > 0 ? (
                <>
                  <div className="grid grid-cols-[auto_auto_auto_auto_auto] gap-x-1 text-[7px] text-muted-foreground/60 uppercase tracking-wider px-2 py-0.5">
                    <span>Pair</span>
                    <span>Sim</span>
                    <span>Para</span>
                    <span>ΔChar</span>
                    <span>Ents</span>
                  </div>
                  {state.versionPairs.map((p, i) => (
                    <div key={i} className="grid grid-cols-[auto_auto_auto_auto_auto] gap-x-1 text-[8px] px-2 py-0.5 rounded hover:bg-muted/20 font-mono">
                      <span className="text-muted-foreground">{p.fromVersion}→{p.toVersion}</span>
                      <span className={p.jaccardSimilarity > 0.85 ? 'text-amber-400' : 'text-foreground/80'}>
                        {p.jaccardSimilarity.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground/80">
                        {p.paragraphChangeRatio.toFixed(2)}
                      </span>
                      <span className={p.charDelta > 0 ? 'text-emerald-400/70' : p.charDelta < 0 ? 'text-destructive/70' : 'text-muted-foreground/50'}>
                        {p.charDelta > 0 ? '+' : ''}{p.charDelta}
                      </span>
                      <span className="text-muted-foreground/80">
                        {p.properNounCountFrom}→{p.properNounCountTo}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-[8px] text-muted-foreground/60 pt-0.5">
                    <span>Noop (sim>0.95): {state.rewriteNoopSameContent}</span>
                    <span>Labeled rewrites: {state.rewriteCreatedNewVersion}</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 p-2 rounded bg-muted/20 border border-border/30">
                  <Info className="h-3 w-3 text-muted-foreground shrink-0" />
                  <p className="text-[8px] text-muted-foreground">
                    Need 2+ versions to compare. Select a document with multiple versions.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══ 5. Diagnostic Flags ═══ */}
        <div>
          <SectionHeader
            title="Diagnostic Flags"
            icon={<AlertTriangle className="h-3 w-3 text-muted-foreground" />}
            count={activeFlags.length}
            open={sections.flags}
            onToggle={() => toggle('flags')}
          />
          {sections.flags && (
            <div className="pl-1 space-y-1">
              {state.diagnosticFlags.map((flag, i) => {
                const isRaised = flag.detected;
                return (
                  <div
                    key={i}
                    className={`p-2 rounded border ${
                      isRaised && flag.level === 'HIGH'
                        ? 'bg-destructive/10 border-destructive/20'
                        : isRaised && flag.level === 'MEDIUM'
                        ? 'bg-amber-500/10 border-amber-500/20'
                        : 'bg-muted/10 border-border/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isRaised ? (
                          <AlertTriangle className="h-3 w-3 shrink-0 mt-[1px] text-destructive" />
                        ) : (
                          <CircleCheck className="h-3 w-3 shrink-0 mt-[1px] text-emerald-400/50" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <code className="text-[8px] font-bold font-mono">{flag.flag}</code>
                            <FlagBadge level={flag.level} />
                          </div>
                          <p className="text-[8px] text-muted-foreground/80 mt-0.5">{flag.triggerCondition}</p>
                        </div>
                      </div>
                    </div>
                    {/* Observed values */}
                    <div className="mt-1 text-[7px] font-mono text-muted-foreground/60 space-y-0.5">
                      <p>Observed: {JSON.stringify(flag.observedValues, null, 0).slice(0, 200)}</p>
                      <p>Threshold: {flag.thresholdUsed}</p>
                      <p>Data state: {flag.missingDataState}</p>
                      {flag.explanation && (
                        <p className={`${isRaised ? 'text-amber-400/80' : 'text-muted-foreground/50'} font-sans`}>
                          {flag.explanation}
                        </p>
                      )}
                    </div>
                    {flag.involvedVersions.length > 0 && (
                      <div className="mt-1 flex items-center gap-1">
                        <span className="text-[7px] text-muted-foreground/50">Versions:</span>
                        <span className="text-[7px] font-mono text-muted-foreground/70">
                          {flag.involvedVersions.join(', ')}
                        </span>
                      </div>
                    )}
                    {isRaised && (
                      <div className="mt-1 text-[7px] italic text-destructive/60">
                        This is an observational indicator only — not a truth claim about content quality.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══ 6. Threshold Transparency ═══ */}
        <div>
          <SectionHeader
            title="Threshold Transparency"
            icon={<Info className="h-3 w-3 text-muted-foreground" />}
            open={sections.thresholds}
            onToggle={() => toggle('thresholds')}
          />
          {sections.thresholds && (
            <div className="pl-1 text-[8px] space-y-1">
              <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 text-[8px] px-2 py-1 rounded bg-muted/20 border border-border/30">
                <span className="text-muted-foreground/80">POSSIBLE_PARAPHRASE_LOOP</span>
                <code className="font-mono text-foreground/80 text-right">sim>0.85 × flat CI/GP × 3+ consecutive</code>
                <span className="text-muted-foreground/80">POSSIBLE_FALSE_CONVERGENCE</span>
                <code className="font-mono text-foreground/80 text-right">scores≥80 × sim<0.3 × 2+ pairs</code>
                <span className="text-muted-foreground/80">POSSIBLE_SPECIFICITY_COLLAPSE</span>
                <code className="font-mono text-foreground/80 text-right">entity drop>30% × 3 versions</code>
                <span className="text-muted-foreground/80">POSSIBLE_COSMETIC_REWRITE</span>
                <code className="font-mono text-foreground/80 text-right">sim>0.95 × para change<10%</code>
                <span className="text-muted-foreground/80">NOTE_CHURN</span>
                <code className="font-mono text-foreground/80 text-right">overlap>80% × 3+ versions</code>
                <span className="text-muted-foreground/80">DIMINISHING_RETURNS</span>
                <code className="font-mono text-foreground/80 text-right">version≥4 × CI/GP gradient<1</code>
              </div>
            </div>
          )}
        </div>

        {/* ═══ 7. Missing Data Report ═══ */}
        <div>
          <SectionHeader
            title="Missing Data Report"
            icon={<AlertCircle className="h-3 w-3 text-muted-foreground" />}
            open={sections.missing}
            onToggle={() => toggle('missing')}
          />
          {sections.missing && (
            <div className="pl-1 space-y-1">
              <div className={`p-2 rounded border ${
                state.missingData.versionsMissingScores.length > 0 ||
                state.missingData.versionsMissingNotes.length > 0 ||
                state.missingData.versionsMissingText.length > 0
                  ? 'bg-amber-500/10 border-amber-500/20'
                  : 'bg-emerald-500/10 border-emerald-500/20'
              }`}>
                <p className="text-[8px] font-semibold">{state.missingData.summary}</p>
                {state.missingData.versionsMissingScores.length > 0 && (
                  <p className="text-[7px] text-muted-foreground/70 mt-0.5">
                    Missing CI/GP scores: v{state.missingData.versionsMissingScores.join(', v')}
                  </p>
                )}
                {state.missingData.versionsMissingNotes.length > 0 && (
                  <p className="text-[7px] text-muted-foreground/70 mt-0.5">
                    Missing notes: v{state.missingData.versionsMissingNotes.join(', v')}
                  </p>
                )}
                {state.missingData.versionsMissingText.length > 0 && (
                  <p className="text-[7px] text-muted-foreground/70 mt-0.5">
                    Empty/no content: v{state.missingData.versionsMissingText.join(', v')}
                  </p>
                )}
                {state.missingData.versionsDuplicates.length > 0 && (
                  <p className="text-[7px] text-muted-foreground/70 mt-0.5">
                    Duplicate content hashes: v{state.missingData.versionsDuplicates.join(', v')}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="text-[6px] text-muted-foreground/40 text-center pt-1">
          Read-only diagnostic surface. ZERO writes. Analysis based on {state.versions.length} versions.
        </div>

      </CardContent>
    </Card>
  );
}
