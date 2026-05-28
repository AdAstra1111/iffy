/**
 * CanonContextRail — Right sidebar showing related canon entities.
 *
 * - Queries project_canon for characters and locations
 * - Shows character names, location names as chips
 * - Click to show brief detail via popover/inline expansion
 * - Collapsible
 */
import React, { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { cn } from '@/lib/utils'
import { Users, MapPin, ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react'

interface CanonContextRailProps {
  projectId: string
  currentDocType: string | null
}

interface CanonCharacter {
  name: string
  role?: string
  goals?: string
  traits?: string
}

interface CanonLocation {
  name: string
  description?: string
}

const CanonContextRail: React.FC<CanonContextRailProps> = ({
  projectId,
  currentDocType,
}) => {
  const [collapsed, setCollapsed] = useState(false)
  const [characters, setCharacters] = useState<CanonCharacter[]>([])
  const [locations, setLocations] = useState<CanonLocation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedChar, setExpandedChar] = useState<string | null>(null)
  const [expandedLoc, setExpandedLoc] = useState<string | null>(null)

  // Determine if canon is relevant to the current doc type
  const isRelevant = currentDocType
    ? ['treatment', 'character_bible', 'story_outline', 'beat_sheet', 'feature_script', 'episode_script', 'season_script', 'production_draft', 'concept_brief'].includes(currentDocType)
    : false

  useEffect(() => {
    if (!projectId || !isRelevant) {
      setCharacters([])
      setLocations([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .from('project_canon')
      .select('canon_json')
      .eq('project_id', projectId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return
        setLoading(false)
        if (err) {
          setError(err.message)
          return
        }
        if (!data?.canon_json) {
          setCharacters([])
          setLocations([])
          return
        }
        const canon = data.canon_json as any
        const chars: CanonCharacter[] = (canon?.characters || []).map((c: any) => ({
          name: c.name || 'Unnamed',
          role: c.role,
          goals: c.goals,
          traits: c.traits,
        }))
        const locs: CanonLocation[] = (canon?.locations || []).map((l: any) =>
          typeof l === 'string' ? { name: l } : { name: l.name || 'Unnamed', description: l.description }
        )
        setCharacters(chars)
        setLocations(locs)
      })

    return () => { cancelled = true }
  }, [projectId, isRelevant])

  if (collapsed) {
    return (
      <div className="flex flex-col items-center pt-4 border-l border-border/40 bg-background w-10">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Show canon context"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col border-l border-border/40 bg-muted/10 w-64 flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Canon Context
        </h3>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Collapse panel"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/60" />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-xs text-destructive/70 py-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && !isRelevant && (
          <p className="text-xs text-muted-foreground/60 text-center py-6">
            Canon context available for treatment, character bible, and script stages
          </p>
        )}

        {!loading && !error && isRelevant && characters.length === 0 && locations.length === 0 && (
          <p className="text-xs text-muted-foreground/60 text-center py-6">
            No canon entities found for this project
          </p>
        )}

        {/* Characters */}
        {characters.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-medium text-muted-foreground">
                Characters ({characters.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {characters.map((char) => (
                <button
                  key={char.name}
                  onClick={() => setExpandedChar(expandedChar === char.name ? null : char.name)}
                  className={cn(
                    'text-[11px] px-2 py-1 rounded-full transition-colors text-left',
                    'bg-blue-100/60 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
                    'hover:bg-blue-200/60 dark:hover:bg-blue-800/30',
                  )}
                >
                  {char.name}
                </button>
              ))}
            </div>
            {/* Expanded character detail */}
            {expandedChar && (() => {
              const char = characters.find(c => c.name === expandedChar)
              if (!char) return null
              return (
                <div className="mt-2 p-2 rounded-md bg-muted/50 text-xs space-y-1">
                  {char.role && (
                    <p><span className="text-muted-foreground">Role:</span> {char.role}</p>
                  )}
                  {char.traits && (
                    <p><span className="text-muted-foreground">Traits:</span> {char.traits}</p>
                  )}
                  {char.goals && (
                    <p><span className="text-muted-foreground">Goals:</span> {char.goals}</p>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* Locations */}
        {locations.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-medium text-muted-foreground">
                Locations ({locations.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {locations.map((loc) => (
                <button
                  key={loc.name}
                  onClick={() => setExpandedLoc(expandedLoc === loc.name ? null : loc.name)}
                  className={cn(
                    'text-[11px] px-2 py-1 rounded-full transition-colors text-left',
                    'bg-amber-100/60 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
                    'hover:bg-amber-200/60 dark:hover:bg-amber-800/30',
                  )}
                >
                  {loc.name}
                </button>
              ))}
            </div>
            {/* Expanded location detail */}
            {expandedLoc && (() => {
              const loc = locations.find(l => l.name === expandedLoc)
              if (!loc) return null
              return (
                <div className="mt-2 p-2 rounded-md bg-muted/50 text-xs space-y-1">
                  {loc.description && (
                    <p><span className="text-muted-foreground">Description:</span> {loc.description}</p>
                  )}
                </div>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}

export default CanonContextRail