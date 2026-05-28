/**
 * ExpertCastPanel — Expert mode metadata strip for the Cast workspace.
 *
 * Shows:
 * - Match scoring methodology (how actor-character matches are computed)
 * - Cast validation results (roster-ready checks, binding integrity)
 *
 * Collapsible section at bottom of workspace.
 * ONLY mounts when expert mode is enabled (via React.lazy + ExpertModeGate).
 */

import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, BarChart3, CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { cn } from '@/lib/utils'

interface ExpertCastPanelProps {
  projectId: string
}

interface ValidationResult {
  characterName: string
  actorName: string | null
  rosterReady: boolean | null
  bindingValid: boolean
}

export default function ExpertCastPanel({ projectId }: ExpertCastPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [validations, setValidations] = useState<ValidationResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId || !expanded) return

    let cancelled = false
    setLoading(true)

    const fetchData = async () => {
      try {
        // Fetch project characters with bindings
        const { data: chars } = await supabase
          .from('project_characters')
          .select('id, name')
          .eq('project_id', projectId)

        if (cancelled || !chars) return

        const charIds = chars.map(c => c.id)

        // Fetch cast bindings
        const { data: bindings } = await supabase
          .from('project_ai_cast')
          .select('character_key, ai_actor_id, ai_actor_version_id')
          .eq('project_id', projectId)

        if (cancelled) return

        const bindingMap = new Map<string, { actorId: string; versionId: string | null }>()
        for (const b of (bindings || []) as any[]) {
          const key = (b.character_key || '').toLowerCase().replace(/[^a-z0-9]/g, '')
          if (key) bindingMap.set(key, { actorId: b.ai_actor_id, versionId: b.ai_actor_version_id })
        }

        // Get roster-ready status for bound actors
        const actorIds = [...new Set(
          [...bindingMap.values()].map(b => b.actorId).filter(Boolean)
        )] as string[]

        const rosterMap = new Map<string, boolean>()
        if (actorIds.length > 0) {
          const { data: actors } = await supabase
            .from('ai_actors')
            .select('id, roster_ready')
            .in('id', actorIds)

          if (actors) {
            for (const a of actors as any[]) {
              rosterMap.set(a.id, a.roster_ready)
            }
          }
        }

        if (cancelled) return

        const results: ValidationResult[] = chars.map(char => {
          const normalizedKey = char.name.toLowerCase().replace(/[^a-z0-9]/g, '')
          const binding = bindingMap.get(normalizedKey)

          if (!binding) {
            return {
              characterName: char.name,
              actorName: null,
              rosterReady: null,
              bindingValid: true, // No binding = no validation issue
            }
          }

          const rosterReady = rosterMap.get(binding.actorId) ?? null
          return {
            characterName: char.name,
            actorName: binding.actorId.slice(0, 8),
            rosterReady,
            bindingValid: rosterReady !== false, // Valid if not explicitly false
          }
        })

        setValidations(results)
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
          <BarChart3 className="h-3 w-3" />
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
              {/* Match Scoring Methodology */}
              <section>
                <h4 className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1.5">
                  Match Scoring Methodology
                </h4>
                <div className="space-y-1 text-[10px] text-muted-foreground/70">
                  <p>• Tag overlap with character name: up to <strong>40 pts</strong></p>
                  <p>• Roster-ready bonus: <strong>20 pts</strong></p>
                  <p>• Name similarity match: <strong>+5 pts</strong> per shared word</p>
                  <p>• Tag count (versatility): up to <strong>15 pts</strong></p>
                  <p>• Description richness: up to <strong>10 pts</strong></p>
                  <p className="text-muted-foreground/40 mt-1">
                    Final score clamped to 0–100. Sorted descending for display.
                  </p>
                </div>
              </section>

              {/* Cast Validation Results */}
              <section>
                <h4 className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1.5">
                  Cast Validation
                </h4>
                {validations.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground/40 italic py-1">No characters to validate</p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {validations.map((v, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-[10px] text-muted-foreground/70"
                      >
                        <span className="truncate max-w-[160px]">{v.characterName}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {v.actorName ? (
                            <>
                              <span className="font-mono text-muted-foreground/50">{v.actorName}…</span>
                              {v.rosterReady !== null && (
                                v.rosterReady
                                  ? <CheckCircle2 className="h-3 w-3 text-green-500/60" />
                                  : <AlertCircle className="h-3 w-3 text-amber-500/60" />
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground/40">Uncast</span>
                          )}
                        </div>
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