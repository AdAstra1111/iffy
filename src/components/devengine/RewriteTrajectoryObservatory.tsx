import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  FileText,
  BarChart3,
  Eye,
  ShieldAlert,
  Database,
  Info,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { useRewriteTrajectory, type VersionTimelineEntry, type ConvergencePoint, type BlockerNoteGroup, type EntropyMetric, type RiskIndicator, type MissingDataReport, type RewriteTrajectoryData } from '@/hooks/useRewriteTrajectory'

/* ------------------------------------------------------------------ */
/*  Types (imported from hook to stay in sync)                       */
/* ------------------------------------------------------------------ */
/*  See: useRewriteTrajectory.ts for VersionTimelineEntry,
 *  ConvergencePoint, BlockerNoteGroup, EntropyMetric, RiskIndicator,
 *  MissingDataReport, RewriteTrajectoryData                           */

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface RewriteTrajectoryObservatoryProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId?: string
  projectId?: string
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function specificityPercent(score: number): string {
  return `${Math.round(Math.min(score, 100))}%`
}

function severityVariant(severity: 'low' | 'medium' | 'high') {
  switch (severity) {
    case 'high':
      return 'destructive' as const
    case 'medium':
      return 'warning' as const
    case 'low':
      return 'secondary' as const
  }
}

function severityIcon(severity: 'low' | 'medium' | 'high') {
  switch (severity) {
    case 'high':
      return <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
    case 'medium':
      return <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
    case 'low':
      return <Info className="h-3.5 w-3.5 text-yellow-400" />
  }
}

function triggerBadgeVariant(trigger: 'ai_rewrite' | 'human_edit') {
  return trigger === 'ai_rewrite' ? 'default' : 'secondary'
}

function triggerLabel(trigger: 'ai_rewrite' | 'human_edit') {
  return trigger === 'ai_rewrite' ? 'AI Rewrite' : 'Human Edit'
}

/* ------------------------------------------------------------------ */
/*  Section 1 — Version Timeline                                       */
/* ------------------------------------------------------------------ */

function VersionTimelineSection({
  entries,
}: {
  entries: VersionTimelineEntry[]
}) {
  if (entries.length === 0) {
    return (
      <Card className="border-zinc-700/50 bg-zinc-900/95">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-zinc-100 text-sm">
            <FileText className="h-4 w-4 text-zinc-400" />
            Version Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No version history available.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-zinc-700/50 bg-zinc-900/95">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-zinc-100 text-sm">
          <FileText className="h-4 w-4 text-zinc-400" />
          Version Timeline
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-700/50 text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Label</th>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Trigger</th>
                <th className="px-3 py-2 text-right font-medium">
                  Specificity
                </th>
                <th className="px-3 py-2 text-right font-medium">Chars</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                >
                  <td className="px-3 py-2 text-zinc-100 font-mono">
                    v{entry.versionNumber}
                  </td>
                  <td className="px-3 py-2 text-zinc-300 max-w-[160px] truncate">
                    {entry.label ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {formatDate(entry.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={triggerBadgeVariant(entry.triggerType)}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {triggerLabel(entry.triggerType)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-300 font-mono">
                    {entry.specificity.specificityScore.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground font-mono">
                    {entry.charCount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Section 2 — Convergence Trajectory (chart)                         */
/* ------------------------------------------------------------------ */

const CHART_COLORS = {
  creative: '#3b82f6',
  greenlight: '#10b981',
}

function ConvergenceTrajectorySection({
  points,
}: {
  points: ConvergencePoint[]
}) {
  if (points.length === 0) {
    return (
      <Card className="border-zinc-700/50 bg-zinc-900/95">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-zinc-100 text-sm">
            <TrendingUp className="h-4 w-4 text-zinc-400" />
            Convergence Trajectory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            No convergence data available.
          </div>
        </CardContent>
      </Card>
    )
  }

  const chartData = points
    .slice()
    .sort((a, b) => a.versionNumber - b.versionNumber)
    .map((p) => ({
      version: p.versionNumber,
      creative_score: p.creativeScore,
      greenlight_score: p.greenlightScore,
      gap: p.gap,
    }))

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="rounded-md border border-zinc-700/50 bg-zinc-900 px-3 py-2 text-xs shadow-lg">
        <p className="text-zinc-100 font-medium mb-1">Version {label}</p>
        {payload.map((entry: any) => (
          <p key={entry.name} style={{ color: entry.color }}>
            {entry.name === 'creative_score' ? 'Creative' : 'Greenlight'}:{' '}
            {entry.value.toFixed(2)}
          </p>
        ))}
        <p className="text-muted-foreground mt-1">
          Gap: {payload[0]?.payload.gap?.toFixed(2) ?? 'N/A'}
        </p>
      </div>
    )
  }

  return (
    <Card className="border-zinc-700/50 bg-zinc-900/95">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-zinc-100 text-sm">
          <TrendingUp className="h-4 w-4 text-zinc-400" />
          Convergence Trajectory
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="version"
                stroke="#71717a"
                tick={{ fill: '#71717a', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#27272a' }}
              />
              <YAxis
                domain={[0, 1]}
                stroke="#71717a"
                tick={{ fill: '#71717a', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#27272a' }}
              />
              <RechartsTooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }}
                iconType="circle"
              />
              <Line
                type="monotone"
                dataKey="creative_score"
                stroke={CHART_COLORS.creative}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_COLORS.creative }}
                activeDot={{ r: 5 }}
                name="creative_score"
              />
              <Line
                type="monotone"
                dataKey="greenlight_score"
                stroke={CHART_COLORS.greenlight}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_COLORS.greenlight }}
                activeDot={{ r: 5 }}
                name="greenlight_score"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Section 3 — Blocker & Note Evolution                               */
/* ------------------------------------------------------------------ */

function BlockerEvolutionSection({
  groups,
}: {
  groups: BlockerNoteGroup[]
}) {
  if (groups.length === 0) {
    return (
      <Card className="border-zinc-700/50 bg-zinc-900/95">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-zinc-100 text-sm">
            <ShieldAlert className="h-4 w-4 text-zinc-400" />
            Blocker &amp; Note Evolution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No blocker or note history recorded.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-zinc-700/50 bg-zinc-900/95">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-zinc-100 text-sm">
          <ShieldAlert className="h-4 w-4 text-zinc-400" />
          Blocker &amp; Note Evolution
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-zinc-800/50">
          {groups.map((group) => (
            <div
              key={group.versionId}
              className="flex items-center justify-between px-4 py-2.5 text-sm"
            >
              <span className="text-zinc-100 font-mono text-xs">
                v{group.versionNumber}
              </span>
              <div className="flex items-center gap-3">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Database className="h-3 w-3" />
                        {group.total}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Total notes</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <Badge
                  variant="outline"
                  className="border-emerald-700/50 text-emerald-400 bg-emerald-950/30 text-[10px] px-1.5"
                >
                  <CheckCircle2 className="h-3 w-3 mr-0.5" />
                  {group.resolved}
                </Badge>

                <Badge
                  variant="outline"
                  className="border-red-700/50 text-red-400 bg-red-950/30 text-[10px] px-1.5"
                >
                  <XCircle className="h-3 w-3 mr-0.5" />
                  {group.unresolved}
                </Badge>

                <Badge
                  variant="outline"
                  className="border-amber-700/50 text-amber-400 bg-amber-950/30 text-[10px] px-1.5"
                >
                  <AlertCircle className="h-3 w-3 mr-0.5" />
                  {group.regressed}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Section 4 — Entropy Metrics                                        */
/* ------------------------------------------------------------------ */

function EntropyMetricsSection({
  metrics,
}: {
  metrics: EntropyMetric[]
}) {
  if (metrics.length === 0) {
    return (
      <Card className="border-zinc-700/50 bg-zinc-900/95">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-zinc-100 text-sm">
            <Activity className="h-4 w-4 text-zinc-400" />
            Entropy Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No entropy metrics available.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-zinc-700/50 bg-zinc-900/95">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-zinc-100 text-sm">
          <Activity className="h-4 w-4 text-zinc-400" />
          Entropy Metrics
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-zinc-800/50">
          {metrics.map((metric) => (
            <div key={metric.versionId} className="px-4 py-3 space-y-1.5">
              {/* Version header */}
              <div className="flex items-center justify-between">
                <span className="text-zinc-100 font-mono text-xs">
                  v{metric.versionNumber}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  Specificity:{' '}
                  {metric.specificity.specificityScore.toFixed(1)}
                  /100
                </span>
              </div>

              {/* Specificity progress bar */}
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all"
                  style={{
                    width: specificityPercent(
                      metric.specificity.specificityScore
                    ),
                  }}
                />
              </div>

              {/* Detail metrics */}
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
                <span>
                  Entities: {metric.specificity.entityCount}
                </span>
                <span>Nouns: {metric.specificity.nounCount}</span>
                <span>
                  Lex div:{' '}
                  {metric.specificity.lexicalDiversity.toFixed(2)}
                </span>
                <span>
                  Avg WL: {metric.specificity.avgWordLength.toFixed(1)}
                </span>
              </div>

              {/* Change metrics (null for version 1) */}
              {metric.changes ? (
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground border-t border-zinc-800/50 pt-1">
                  <span>
                    Jaccard: {metric.changes.jaccard.toFixed(3)}
                  </span>
                  <span>
                    Entity overlap:{' '}
                    {metric.changes.entityOverlap.toFixed(3)}
                  </span>
                  <span>
                    Noun overlap:{' '}
                    {metric.changes.nounOverlap.toFixed(3)}
                  </span>
                  <span>
                    Δ chars:{' '}
                    {metric.changes.textLengthDelta > 0 ? '+' : ''}
                    {metric.changes.textLengthDelta}
                  </span>
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground italic border-t border-zinc-800/50 pt-1">
                  N/A — first version, no prior diff
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Section 5 — Risk Indicators                                        */
/* ------------------------------------------------------------------ */

function RiskIndicatorsSection({
  indicators,
}: {
  indicators: RiskIndicator[]
}) {
  if (indicators.length === 0) {
    return (
      <Card className="border-zinc-700/50 bg-zinc-900/95">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-zinc-100 text-sm">
            <AlertTriangle className="h-4 w-4 text-zinc-400" />
            Risk Indicators
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-emerald-400 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            No risk indicators detected.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-zinc-700/50 bg-zinc-900/95">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-zinc-100 text-sm">
          <AlertTriangle className="h-4 w-4 text-zinc-400" />
          Risk Indicators
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-zinc-800/50">
          {indicators.map((indicator, idx) => (
            <div
              key={`${indicator.type}-${idx}`}
              className="flex items-start gap-3 px-4 py-2.5"
            >
              <span className="mt-0.5 shrink-0">
                {severityIcon(indicator.severity)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-zinc-100 text-sm font-medium">
                    {indicator.label}
                  </span>
                  <Badge
                    variant={
                      indicator.severity === 'high'
                        ? 'destructive'
                        : indicator.severity === 'medium'
                          ? 'outline'
                          : 'secondary'
                    }
                    className={`text-[10px] px-1.5 ${
                      indicator.severity === 'medium'
                        ? 'border-amber-600/50 text-amber-400 bg-amber-950/30'
                        : indicator.severity === 'low'
                          ? 'border-yellow-600/50 text-yellow-400 bg-yellow-950/30'
                          : ''
                    }`}
                  >
                    {indicator.severity}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {indicator.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Section 6 — Missing Data Report                                    */
/* ------------------------------------------------------------------ */

function MissingDataReportSection({
  reports,
}: {
  reports: MissingDataReport[]
}) {
  if (reports.length === 0) {
    return (
      <Card className="border-zinc-700/50 bg-zinc-900/95">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-zinc-100 text-sm">
            <Database className="h-4 w-4 text-zinc-400" />
            Missing Data Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            All data sections are complete.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-zinc-700/50 bg-zinc-900/95">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-zinc-100 text-sm">
          <Database className="h-4 w-4 text-zinc-400" />
          Missing Data Report
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-zinc-800/50">
          {reports.map((report, idx) => (
            <div
              key={`${report.section}-${idx}`}
              className="flex items-center justify-between px-4 py-2.5 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {report.present ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                )}
                <span className="text-zinc-100 text-xs truncate">
                  {report.section}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-muted-foreground text-[10px] font-mono">
                  {report.count} items
                </span>
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 ${
                    report.present
                      ? 'border-emerald-700/50 text-emerald-400 bg-emerald-950/30'
                      : 'border-red-700/50 text-red-400 bg-red-950/30'
                  }`}
                >
                  {report.present ? 'Present' : 'Missing'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
        {/* Notes section for reports with non-empty notes */}
        {reports.some((r) => r.note.length > 0) && (
          <div className="border-t border-zinc-800/50 px-4 py-2 space-y-1">
            {reports
              .filter((r) => r.note.length > 0)
              .map((report, idx) => (
                <p
                  key={`note-${idx}`}
                  className="text-[10px] text-muted-foreground"
                >
                  <span className="font-medium text-zinc-400">
                    {report.section}:
                  </span>{' '}
                  {report.note}
                </p>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Loading State                                                      */
/* ------------------------------------------------------------------ */

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin mb-3 text-zinc-400" />
      <p className="text-sm">Loading trajectory data...</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                        */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <BarChart3 className="h-10 w-10 mb-3 text-zinc-600" />
      <p className="text-sm">No version data available.</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Error State                                                        */
/* ------------------------------------------------------------------ */

function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <AlertTriangle className="h-10 w-10 mb-3 text-red-400" />
      <p className="text-sm mb-2">Failed to load trajectory data.</p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="border-zinc-700/50 text-zinc-300 hover:bg-zinc-800"
        >
          Retry
        </Button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function RewriteTrajectoryObservatory({
  open,
  onOpenChange,
  documentId,
  projectId,
}: RewriteTrajectoryObservatoryProps) {
  const { data, isLoading, error, refetch } = useRewriteTrajectory(
    documentId,
    projectId
  )

  const isEmpty = !isLoading && !error && (!data || data.versionTimeline.length === 0)

  const hasData =
    !isLoading && !error && data !== undefined && data.versionTimeline.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-full bg-zinc-950 border-zinc-700/50 text-zinc-100">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Eye className="h-5 w-5 text-zinc-400" />
            <DialogTitle className="text-zinc-100 text-lg">
              Rewrite Trajectory Observatory
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground text-sm">
            Read-only diagnostics dashboard
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh] pr-2">
          <div className="space-y-4 pb-4">
            {isLoading && <LoadingState />}

            {error && !isLoading && (
              <ErrorState
                onRetry={() => refetch()}
              />
            )}

            {isEmpty && <EmptyState />}

            {hasData && data && (
              <>
                <VersionTimelineSection entries={data.versionTimeline} />

                <ConvergenceTrajectorySection
                  points={data.convergenceTrajectory}
                />

                <BlockerEvolutionSection
                  groups={data.blockerEvolution}
                />

                <EntropyMetricsSection metrics={data.entropyMetrics} />

                <RiskIndicatorsSection
                  indicators={data.riskIndicators}
                />

                <MissingDataReportSection
                  reports={data.missingDataReport}
                />
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export default RewriteTrajectoryObservatory