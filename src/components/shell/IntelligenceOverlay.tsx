/**
 * IntelligenceOverlay — slide-out panel from the right.
 * Renders 3 context-aware insight cards from real project data.
 */

import { useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { X, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useProject, useProjectDocuments } from '@/hooks/useProjects'
import { useActiveSignals } from '@/hooks/useTrends'

interface IntelligenceOverlayProps {
  open: boolean
  onClose: () => void
}

// ── Skeleton card ──────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border/10 bg-muted/20 p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded bg-muted-foreground/20" />
        <div className="h-3.5 w-28 rounded bg-muted-foreground/20" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-muted-foreground/15" />
        <div className="h-3 w-3/4 rounded bg-muted-foreground/15" />
      </div>
    </div>
  )
}

// ── Insight card ───────────────────────────────────────────────────

interface InsightCardProps {
  icon: string
  title: string
  text: string
  className?: string
}

function InsightCard({ icon, title, text, className }: InsightCardProps) {
  return (
    <div className={cn(
      'rounded-lg border border-border/10 bg-card/60 p-4 space-y-1.5',
      'hover:border-border/20 transition-colors',
      className,
    )}>
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
          {title}
        </span>
      </div>
      <p className="text-xs text-muted-foreground/70 leading-relaxed">
        {text}
      </p>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="text-center max-w-[280px]">
        <div className="text-3xl mb-3 opacity-20">✦</div>
        <p className="text-sm text-muted-foreground/60 font-medium">
          Insights will appear as you develop your project
        </p>
        <p className="text-xs text-muted-foreground/40 mt-2 leading-relaxed">
          The Intelligence overlay surfaces market trends, project quality metrics,
          and creative insights based on your project data and signal analysis.
          Add documents, set genres, and generate analysis to unlock personalised intelligence.
        </p>
      </div>
    </div>
  )
}

// ── Error state ────────────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="text-center max-w-[280px]">
        <div className="text-3xl mb-3 opacity-20">⚠</div>
        <p className="text-sm text-muted-foreground/60 font-medium">
          Could not load intelligence data
        </p>
        <p className="text-xs text-muted-foreground/40 mt-2 mb-4 leading-relaxed">
          Something went wrong while fetching your intelligence data.
          This may be a temporary connection issue.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={onRetry}
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </Button>
      </div>
    </div>
  )
}

// ── Powered by footer ─────────────────────────────────────────────

function PoweredByFooter() {
  return (
    <div className="px-4 py-2.5 border-t border-border/10 shrink-0">
      <p className="text-[10px] text-muted-foreground/30 text-center tracking-wider uppercase">
        Powered by IFFY Intelligence
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────

export function IntelligenceOverlay({ open, onClose }: IntelligenceOverlayProps) {
  const panelRef = useRef<HTMLElement>(null)

  // Get current project ID from URL params (works on /projects/:id/* routes)
  const { id: projectId } = useParams<{ id: string }>()

  // Query hooks
  const { project, isLoading: projectLoading, error: projectError, refetch: refetchProject } = useProject(projectId)
  const { data: signals = [], isLoading: signalsLoading, error: signalsError, refetch: refetchSignals } = useActiveSignals(
    project?.format ? { productionType: project.format } : undefined
  )
  const { data: documents = [], isLoading: docsLoading } = useProjectDocuments(projectId)

  // Body scroll lock
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Focus panel on open
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  if (!open) return null

  // ── Compute state ───────────────────────────────────────────────
  const isLoading = projectLoading || signalsLoading || docsLoading
  const hasError = Boolean(projectError || signalsError)

  // ── Derive insights (only when not loading and no error) ────────
  const getInsights = () => {
    if (isLoading) return null
    if (hasError) return null

    // Insight 1: Market / Trend
    const totalSignals = signals.length
    const highStrengthSignals = signals.filter((s: any) => (s.strength ?? 0) >= 7)
    let marketInsight: { icon: string; title: string; text: string } | null = null

    if (totalSignals > 0) {
      const phaseBreakdown = signals.reduce((acc: Record<string, number>, s: any) => {
        acc[s.cycle_phase] = (acc[s.cycle_phase] || 0) + 1
        return acc
      }, {})
      const phaseSummary = Object.entries(phaseBreakdown)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 2)
        .map(([phase, count]) => `${count} ${phase}`)
        .join(', ')

      marketInsight = {
        icon: '💡',
        title: 'Market Trends',
        text: `${totalSignals} active signal${totalSignals !== 1 ? 's' : ''} detected` +
          (phaseSummary ? ` — ${phaseSummary}` : '') +
          (highStrengthSignals.length > 0
            ? `. ${highStrengthSignals.length} high-strength signal${highStrengthSignals.length !== 1 ? 's' : ''} worth monitoring.`
            : '.'),
      }
    } else {
      marketInsight = projectId
        ? { icon: '💡', title: 'Market Trends', text: 'No trends data loaded yet. Generate documents to activate trend signals.' }
        : { icon: '💡', title: 'Market Trends', text: 'Open a project to see market trend insights based on your format and genre.' }
    }

    // Insight 2: Project Quality
    let projectInsight: { icon: string; title: string; text: string } | null = null

    if (project) {
      const conf = project.confidence
      const docCount = documents.length
      const stage = project.pipeline_stage
      const hasGenres = project.genres && project.genres.length > 0

      const confidenceLabel = conf !== null && conf !== undefined
        ? conf >= 80 ? 'strong' : conf >= 50 ? 'moderate' : 'developing'
        : 'unscored'

      const parts: string[] = []
      parts.push(`Confidence: ${confidenceLabel}${conf !== null && conf !== undefined ? ` (${Math.round(conf)}%)` : ''}`)

      if (docCount > 0) {
        parts.push(`${docCount} document${docCount !== 1 ? 's' : ''} generated`)
      } else {
        parts.push('no documents yet')
      }

      if (stage) {
        parts.push(`stage: ${stage}`)
      }

      if (hasGenres) {
        parts.push(`genres: ${project.genres!.slice(0, 3).join(', ')}`)
      }

      projectInsight = {
        icon: '📊',
        title: 'Project Quality',
        text: parts.join(' · ') + '.',
      }
    } else if (projectId) {
      projectInsight = {
        icon: '📊',
        title: 'Project Quality',
        text: 'Generate your first document to see project quality insights.',
      }
    } else {
      projectInsight = {
        icon: '📊',
        title: 'Project Quality',
        text: 'Open a project to see quality metrics including confidence scoring and document progress.',
      }
    }

    // Insight 3: Creative
    let creativeInsight: { icon: string; title: string; text: string } | null = null

    if (project) {
      const parts: string[] = []
      const format = project.format
      const tone = project.tone
      const comparable = project.comparable_titles
      const lane = project.assigned_lane

      if (format) {
        parts.push(`Format: ${format}`)
      }
      if (tone && tone !== 'none' && tone !== '') {
        parts.push(`Tone: ${tone}`)
      }
      if (lane) {
        parts.push(`Lane: ${lane}`)
      }

      if (comparable && comparable !== '' && comparable !== 'none') {
        creativeInsight = {
          icon: '🎬',
          title: 'Creative Profile',
          text: parts.length > 0
            ? `${parts.join(' · ')}. Comparable: ${comparable.slice(0, 100)}${comparable.length > 100 ? '...' : ''}`
            : `Comparable titles: ${comparable.slice(0, 120)}${comparable.length > 120 ? '...' : ''}`,
        }
      } else if (parts.length > 0) {
        creativeInsight = {
          icon: '🎬',
          title: 'Creative Profile',
          text: parts.join(' · ') + '. Add comparable titles to strengthen your creative positioning.',
        }
      } else {
        creativeInsight = {
          icon: '🎬',
          title: 'Creative Profile',
          text: 'Project insights will appear as you develop. Add format, tone, and comparable titles to build your creative profile.',
        }
      }
    } else if (projectId) {
      creativeInsight = {
        icon: '🎬',
        title: 'Creative Profile',
        text: 'Project insights will appear as you develop. Start by setting your project format and genres.',
      }
    } else {
      creativeInsight = {
        icon: '🎬',
        title: 'Creative Profile',
        text: 'Open a project to see creative insights based on your format, tone, and narrative metadata.',
      }
    }

    return [marketInsight, projectInsight, creativeInsight]
  }

  const insights = getInsights()
  const isEmpty = !isLoading && !hasError && (!projectId || (insights?.every(i => !i) ?? true))

  return (
    <>
      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 z-40 bg-background/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Slide-out panel */}
      <aside
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'fixed top-0 bottom-0 right-0 z-50',
          'w-[420px] max-w-[90vw]',
          'border-l border-border/15',
          'bg-card/95 backdrop-blur-xl',
          'flex flex-col shadow-2xl outline-none',
          'animate-in slide-in-from-right-4 duration-150',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Intelligence</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-y-auto px-4 py-4 gap-3">
          {isLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : hasError ? (
            <ErrorState
              onRetry={() => {
                refetchProject()
                refetchSignals()
              }}
            />
          ) : isEmpty ? (
            <EmptyState />
          ) : insights ? (
            insights.filter(Boolean).map((insight, i) => (
              insight && (
                <InsightCard
                  key={i}
                  icon={insight.icon}
                  title={insight.title}
                  text={insight.text}
                />
              )
            ))
          ) : (
            <EmptyState />
          )}
        </div>

        {/* Powered by footer */}
        <PoweredByFooter />
      </aside>
    </>
  )
}