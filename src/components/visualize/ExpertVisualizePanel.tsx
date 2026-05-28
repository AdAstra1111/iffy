/**
 * ExpertVisualizePanel — Expert mode metadata strip for the Visualize workspace.
 *
 * Shows:
 * - Generation history per entity (what was generated, when)
 * - Auto-extraction log (what entities were extracted from where)
 *
 * Collapsible section at bottom of workspace.
 * ONLY mounts when expert mode is enabled (via React.lazy + ExpertModeGate).
 */

import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Hash, Clock, FileText } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { cn } from '@/lib/utils'

interface ExpertVisualizePanelProps {
  projectId: string
}

interface GenerationHistoryItem {
  entityName: string
  entityType: string
  createdAt: string
  status: string
}

interface ExtractionLogItem {
  entityName: string
  entityType: string
  source: string
  extractedAt: string
}

export default function ExpertVisualizePanel({ projectId }: ExpertVisualizePanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [genHistory, setGenHistory] = useState<GenerationHistoryItem[]>([])
  const [extractionLog, setExtractionLog] = useState<ExtractionLogItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId || !expanded) return

    let cancelled = false
    setLoading(true)

    const fetchData = async () => {
      try {
        // Get entity generation history from project_images
        const { data: images } = await supabase
          .from('project_images')
          .select(`
            id,
            created_at,
            status,
            entity_type,
            entity_id
          `)
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(50)

        if (cancelled) return

        // Try to resolve entity names from either project_characters or canon_locations
        const entityIds = [...new Set((images || []).map(i => i.entity_id))]
        const entityNames = new Map<string, string>()

        if (entityIds.length > 0) {
          // Try characters
          const { data: chars } = await supabase
            .from('project_characters')
            .select('id, name')
            .in('id', entityIds)

          if (chars) {
            for (const c of chars) {
              entityNames.set(c.id, c.name)
            }
          }

          // Try locations
          const { data: locs } = await supabase
            .from('canon_locations')
            .select('id, name')
            .in('id', entityIds.filter(id => !entityNames.has(id)))

          if (locs) {
            for (const l of locs) {
              entityNames.set(l.id, l.name)
            }
          }
        }

        if (cancelled) return

        setGenHistory(
          (images || []).map(img => ({
            entityName: entityNames.get(img.entity_id) || img.entity_id.slice(0, 8),
            entityType: img.entity_type,
            createdAt: img.created_at,
            status: img.status || 'pending',
          }))
        )

        // Try to fetch extraction log from project_canon or auto-extraction tables
        const { data: canon } = await supabase
          .from('project_canon')
          .select('canon_json, created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (cancelled) return

        if (canon?.canon_json) {
          const canonData = canon.canon_json as any
          const extracted: ExtractionLogItem[] = []

          if (canonData.characters) {
            for (const c of (canonData.characters as any[]) || []) {
              extracted.push({
                entityName: c.name || 'Unnamed',
                entityType: 'character',
                source: c.source || 'concept_brief',
                extractedAt: canon.created_at,
              })
            }
          }
          if (canonData.locations) {
            for (const l of (canonData.locations as any[]) || []) {
              extracted.push({
                entityName: typeof l === 'string' ? l : l.name || 'Unknown',
                entityType: 'location',
                source: (typeof l === 'object' ? l.source : null) || 'concept_brief',
                extractedAt: canon.created_at,
              })
            }
          }

          setExtractionLog(extracted)
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

  return (
    <div className="border-t border-border/20 bg-muted/5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-2 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <Hash className="h-3 w-3" />
          Expert Metadata
        </span>
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>

      {expanded && (
        <div className="px-6 pb-3 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 py-2">
              <div className="h-3 w-3 rounded-full border border-border/30 border-t-border animate-spin" />
              <span className="text-[10px] text-muted-foreground/50">Loading metadata...</span>
            </div>
          ) : (
            <>
              {/* Generation History */}
              <section>
                <h4 className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Generation History
                </h4>
                {genHistory.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground/40 italic py-1">No generations recorded</p>
                ) : (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {genHistory.slice(0, 20).map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-[10px] text-muted-foreground/70"
                      >
                        <span className="truncate max-w-[180px]">
                          {item.entityName}
                          <span className="text-muted-foreground/40 ml-1">({item.entityType})</span>
                        </span>
                        <span className="font-mono shrink-0">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                    {genHistory.length > 20 && (
                      <p className="text-[9px] text-muted-foreground/40">
                        +{genHistory.length - 20} more
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* Auto-Extraction Log */}
              <section>
                <h4 className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  Auto-Extraction Log
                </h4>
                {extractionLog.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground/40 italic py-1">No extractions recorded</p>
                ) : (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {extractionLog.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-[10px] text-muted-foreground/70"
                      >
                        <span className="truncate max-w-[180px]">
                          {item.entityName}
                          <span className="text-muted-foreground/40 ml-1">({item.entityType})</span>
                        </span>
                        <span className="text-muted-foreground/40 text-[9px]">
                          from {item.source}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  )
}