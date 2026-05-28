/**
 * ExpertDevelopPanel — Expert mode metadata strip for the Develop workspace.
 *
 * Shows:
 * - Quality score breakdown (per-dimension: narrative, structure, character)
 * - Last generation timestamp + model used
 * - Document version number
 *
 * Collapsible section at bottom of workspace.
 * ONLY mounts when expert mode is enabled (via React.lazy + ExpertModeGate).
 */

import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Clock, Hash, BrainCircuit } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { cn } from '@/lib/utils'

interface ExpertDevelopPanelProps {
  projectId: string
  /** Current document ID to fetch metadata for */
  docId?: string | null
}

interface ScoreBreakdown {
  narrative: number | null
  structure: number | null
  character: number | null
}

interface GenerationMeta {
  timestamp: string | null
  model: string | null
  versionNumber: number | null
}

export default function ExpertDevelopPanel({ projectId, docId }: ExpertDevelopPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [scores, setScores] = useState<ScoreBreakdown>({
    narrative: null,
    structure: null,
    character: null,
  })
  const [generationMeta, setGenerationMeta] = useState<GenerationMeta>({
    timestamp: null,
    model: null,
    versionNumber: null,
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId || !docId || !expanded) return

    let cancelled = false
    setLoading(true)

    const fetchMetadata = async () => {
      try {
        // Fetch latest version for this document
        const { data: version } = await supabase
          .from('project_document_versions')
          .select('id, version_number, created_at, meta_json')
          .eq('document_id', docId)
          .order('version_number', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (cancelled) return

        if (version) {
          setGenerationMeta({
            timestamp: version.created_at || null,
            model: (version.meta_json as any)?.model || null,
            versionNumber: version.version_number || null,
          })

          // Fetch latest convergence run for this version
          const { data: run } = await supabase
            .from('development_runs')
            .select('output_json')
            .eq('version_id', version.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (cancelled) return

          if (run?.output_json) {
            const output = run.output_json as any
            setScores({
              narrative: output.narrative_score != null
                ? Math.round(output.narrative_score * 100)
                : null,
              structure: output.structure_score != null
                ? Math.round(output.structure_score * 100)
                : null,
              character: output.character_score != null
                ? Math.round(output.character_score * 100)
                : null,
            })
          }
        }
      } catch {
        // Non-critical — metadata is additive
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchMetadata()

    return () => {
      cancelled = true
    }
  }, [projectId, docId, expanded])

  if (!docId) {
    return (
      <div className="border-t border-border/20 px-6 py-3 bg-muted/5">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50 italic">
          <BrainCircuit className="h-3 w-3" />
          Select a document to view expert metadata
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-border/20 bg-muted/5">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-2 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <BrainCircuit className="h-3 w-3" />
          Expert Metadata
        </span>
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-6 pb-3 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 py-2">
              <div className="h-3 w-3 rounded-full border border-border/30 border-t-border animate-spin" />
              <span className="text-[10px] text-muted-foreground/50">Loading metadata...</span>
            </div>
          ) : (
            <>
              {/* Quality score breakdown */}
              <div>
                <h4 className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1.5">
                  Quality Score Breakdown
                </h4>
                <div className="space-y-1">
                  <ScoreRow label="Narrative" score={scores.narrative} />
                  <ScoreRow label="Structure" score={scores.structure} />
                  <ScoreRow label="Character" score={scores.character} />
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-border/10" />

              {/* Generation metadata */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
                  <Clock className="h-3 w-3" />
                  <span className="font-medium">Last generated:</span>
                  <span>{generationMeta.timestamp
                    ? new Date(generationMeta.timestamp).toLocaleString()
                    : 'N/A'}
                  </span>
                </div>
                {generationMeta.model && (
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
                    <BrainCircuit className="h-3 w-3" />
                    <span className="font-medium">Model:</span>
                    <span className="font-mono">{generationMeta.model}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
                  <Hash className="h-3 w-3" />
                  <span className="font-medium">Version:</span>
                  <span className="font-mono">
                    {generationMeta.versionNumber != null
                      ? `v${generationMeta.versionNumber}`
                      : 'N/A'}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Single dimension score row */
function ScoreRow({ label, score }: { label: string; score: number | null }) {
  const color = score == null
    ? 'text-muted-foreground/40'
    : score >= 75
      ? 'text-green-500'
      : score >= 50
        ? 'text-amber-500'
        : 'text-red-500'

  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground/60">{label}</span>
      <span className={cn('font-mono font-medium', color)}>
        {score != null ? score : '--'}
      </span>
    </div>
  )
}