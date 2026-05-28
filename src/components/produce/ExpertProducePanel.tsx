/**
 * ExpertProducePanel — Expert mode metadata strip for the Produce workspace.
 *
 * Shows:
 * - Generation run history per asset (what was generated, when, status)
 *
 * Collapsible section at bottom of workspace.
 * ONLY mounts when expert mode is enabled (via React.lazy + ExpertModeGate).
 */

import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Clock, Film, Camera, Clapperboard, Music } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { cn } from '@/lib/utils'

interface ExpertProducePanelProps {
  projectId: string
}

interface AssetRun {
  assetType: string
  assetLabel: string
  runType: string
  createdAt: string
  status: string
  details?: string
}

const ASSET_ICONS: Record<string, React.ElementType> = {
  storyboards: Film,
  shot_list: Camera,
  trailers: Clapperboard,
  audio: Music,
}

const ASSET_LABELS: Record<string, string> = {
  storyboards: 'Storyboards',
  shot_list: 'Shot List',
  trailers: 'Trailers',
  audio: 'Audio',
}

export default function ExpertProducePanel({ projectId }: ExpertProducePanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [runs, setRuns] = useState<AssetRun[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId || !expanded) return

    let cancelled = false
    setLoading(true)

    const fetchData = async () => {
      try {
        const assetTypes = ['storyboards', 'shot_list', 'trailers', 'audio']
        const allRuns: AssetRun[] = []

        // Fetch from development_runs for storyboard/shot list generations
        const { data: devRuns } = await supabase
          .from('development_runs')
          .select('id, run_type, created_at, status, doc_type, output_json')
          .eq('project_id', projectId)
          .in('doc_type', assetTypes)
          .order('created_at', { ascending: false })
          .limit(50)

        if (!cancelled && devRuns) {
          for (const run of devRuns as any[]) {
            const docType = run.doc_type || ''
            allRuns.push({
              assetType: docType,
              assetLabel: ASSET_LABELS[docType] || docType,
              runType: run.run_type || 'GENERATION',
              createdAt: run.created_at,
              status: run.status || 'completed',
              details: (run.output_json as any)?.model || undefined,
            })
          }
        }

        // Also check trailer_audio_runs for audio/trailer runs
        if (!cancelled) {
          const { data: trailerRuns } = await supabase
            .from('trailer_audio_runs')
            .select('id, run_type, created_at, status, output_json')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
            .limit(25)

          if (trailerRuns) {
            for (const run of trailerRuns as any[]) {
              const runTypeLabel = run.run_type || 'GENERATION'
              const isTrailer = runTypeLabel.toLowerCase().includes('trailer')
              allRuns.push({
                assetType: isTrailer ? 'trailers' : 'audio',
                assetLabel: isTrailer ? 'Trailers' : 'Audio',
                runType: runTypeLabel,
                createdAt: run.created_at,
                status: run.status || 'pending',
                details: (run.output_json as any)?.model || undefined,
              })
            }
          }
        }

        if (!cancelled) {
          // Sort by date descending
          allRuns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          setRuns(allRuns)
        }
      } catch {
        // Non-critical
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [projectId, expanded])

  const grouped = runs.reduce<Record<string, AssetRun[]>>((acc, run) => {
    if (!acc[run.assetType]) acc[run.assetType] = []
    acc[run.assetType].push(run)
    return acc
  }, {})

  return (
    <div className="border-t border-border/20 bg-muted/5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-2 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <Clock className="h-3 w-3" />
          Expert Metadata
        </span>
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>

      {expanded && (
        <div className="px-6 pb-3 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 py-2">
              <div className="h-3 w-3 rounded-full border border-border/30 border-t-border animate-spin" />
              <span className="text-[10px] text-muted-foreground/50">Loading metadata...</span>
            </div>
          ) : runs.length === 0 ? (
            <p className="text-[10px] text-muted-foreground/40 italic py-1">No generation runs recorded</p>
          ) : (
            Object.entries(grouped).map(([assetType, assetRuns]) => {
              const Icon = ASSET_ICONS[assetType] || Clock
              return (
                <section key={assetType}>
                  <h4 className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Icon className="h-3 w-3" />
                    {ASSET_LABELS[assetType] || assetType}
                    <span className="text-muted-foreground/40 font-normal">
                      ({assetRuns.length} run{assetRuns.length !== 1 ? 's' : ''})
                    </span>
                  </h4>
                  <div className="space-y-0.5 max-h-32 overflow-y-auto">
                    {assetRuns.slice(0, 10).map((run, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-[10px] text-muted-foreground/70"
                      >
                        <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                          <StatusDot status={run.status} />
                          <span className="truncate">{run.runType}</span>
                        </div>
                        <span className="font-mono shrink-0 text-muted-foreground/50">
                          {new Date(run.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                    {assetRuns.length > 10 && (
                      <p className="text-[9px] text-muted-foreground/40">
                        +{assetRuns.length - 10} more
                      </p>
                    )}
                  </div>
                </section>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'completed' || status === 'complete'
    ? 'bg-green-500/60'
    : status === 'failed'
      ? 'bg-red-500/60'
      : status === 'running' || status === 'pending'
        ? 'bg-amber-500/60'
        : 'bg-muted-foreground/20'

  return <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', color)} />
}