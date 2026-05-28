/**
 * ExpertPackagePanel — Expert mode metadata strip for the Package workspace.
 *
 * Shows:
 * - Package delta / change tracking (what changed between refreshes)
 *
 * Collapsible section at bottom of workspace.
 * ONLY mounts when expert mode is enabled (via React.lazy + ExpertModeGate).
 */

import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronRight, GitCompare, Clock, ArrowUp, ArrowDown } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { cn } from '@/lib/utils'

interface ExpertPackagePanelProps {
  projectId: string
}

interface PackageChange {
  itemType: string
  itemLabel: string
  previousStatus: string
  currentStatus: string
  changedAt: string
}

const ITEM_LABELS: Record<string, string> = {
  pitch_deck: 'Pitch Deck',
  market_sheet: 'Market Sheet',
  lookbook: 'Lookbook',
  share_pack: 'Share Pack',
}

export default function ExpertPackagePanel({ projectId }: ExpertPackagePanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [changes, setChanges] = useState<PackageChange[]>([])
  const [loading, setLoading] = useState(false)
  const prevSnapshot = useRef<Record<string, string> | null>(null)

  useEffect(() => {
    if (!projectId || !expanded) return

    let cancelled = false
    setLoading(true)

    const fetchDelta = async () => {
      try {
        const itemTypes = ['pitch_deck', 'market_sheet', 'lookbook', 'share_pack']
        const currentSnapshot: Record<string, string> = {}

        // Fetch current status for each item type
        // Pitch deck
        const { data: pitchDecks } = await supabase
          .from('pitch_decks' as any)
          .select('status')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        currentSnapshot.pitch_deck = (pitchDecks as any)?.status || 'not_started'

        // Market sheet
        const { data: marketSheet } = await supabase
          .from('project_documents')
          .select('approval_status')
          .eq('project_id', projectId)
          .eq('doc_type', 'market_sheet')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        currentSnapshot.market_sheet = (marketSheet as any)?.approval_status === 'approved'
          ? 'ready'
          : marketSheet
            ? 'complete'
            : 'not_started'

        // Lookbook
        const { data: lookbookJobs } = await supabase
          .from('export_jobs' as any)
          .select('status')
          .eq('project_id', projectId)
          .eq('export_type', 'lookbook')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        currentSnapshot.lookbook = (lookbookJobs as any)?.status || 'not_started'

        // Share pack
        const { data: sharePack } = await supabase
          .from('project_share_packs' as any)
          .select('id')
          .eq('project_id', projectId)
          .limit(1)
          .maybeSingle()

        currentSnapshot.share_pack = sharePack ? 'ready' : 'not_started'

        if (cancelled) return

        // Compute delta from previous snapshot
        const detectedChanges: PackageChange[] = []

        if (prevSnapshot.current) {
          for (const type of itemTypes) {
            const prev = prevSnapshot.current[type] || 'not_started'
            const curr = currentSnapshot[type]
            if (prev !== curr) {
              detectedChanges.push({
                itemType: type,
                itemLabel: ITEM_LABELS[type] || type,
                previousStatus: prev,
                currentStatus: curr,
                changedAt: new Date().toISOString(),
              })
            }
          }
        }

        // Update snapshot
        prevSnapshot.current = currentSnapshot
        setChanges(detectedChanges)
      } catch {
        // Non-critical
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchDelta()
    return () => { cancelled = true }
  }, [projectId, expanded])

  const statusColor = (status: string) => {
    switch (status) {
      case 'ready':
      case 'completed':
      case 'complete':
        return 'text-green-500/70'
      case 'generating':
      case 'running':
      case 'pending':
        return 'text-amber-500/70'
      case 'failed':
        return 'text-red-500/70'
      default:
        return 'text-muted-foreground/40'
    }
  }

  return (
    <div className="border-t border-border/20 bg-muted/5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-2 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <GitCompare className="h-3 w-3" />
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
          ) : (
            <>
              {/* Change tracking */}
              <section>
                <h4 className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Change Tracking
                </h4>
                {changes.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground/40 italic py-1">
                    No changes detected since this panel opened.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {changes.map((change, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-[10px] text-muted-foreground/70"
                      >
                        <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                          <ArrowUp className="h-3 w-3 text-amber-500/60 shrink-0" />
                          <span className="truncate">{change.itemLabel}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={cn(statusColor(change.previousStatus))}>
                            {change.previousStatus}
                          </span>
                          <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/30" />
                          <span className={cn(statusColor(change.currentStatus))}>
                            {change.currentStatus}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Current snapshot */}
              {prevSnapshot.current && (
                <section>
                  <h4 className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1.5">
                    Current State
                  </h4>
                  <div className="space-y-0.5">
                    {Object.entries(prevSnapshot.current).map(([type, status]) => (
                      <div
                        key={type}
                        className="flex items-center justify-between text-[10px] text-muted-foreground/70"
                      >
                        <span>{ITEM_LABELS[type] || type}</span>
                        <span className={cn('font-medium', statusColor(status))}>
                          {status}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ArrowRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}