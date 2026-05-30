/**
 * WardrobeCanonPanel — Displays Wardrobe Canon state for a project.
 *
 * Shows:
 * - Characters with active wardrobe profiles
 * - Active states per character
 * - Scene assignment count
 * - Canon source labels
 */

import React from 'react'
import { useVisualCanonStatus } from '@/hooks/useVisualCanonStatus'

interface WardrobeCanonPanelProps {
  projectId?: string
}

const WardrobeCanonPanel: React.FC<WardrobeCanonPanelProps> = ({ projectId }) => {
  const { data, isLoading } = useVisualCanonStatus({ projectId })

  if (isLoading) {
    return (
      <div className="p-4 rounded-lg border border-border bg-card animate-pulse">
        <div className="h-4 w-32 bg-muted rounded mb-3" />
        <div className="h-3 w-48 bg-muted rounded" />
      </div>
    )
  }

  const wc = data?.canon_status?.wardrobe
  if (!wc?.profiles && !wc?.assignments) {
    return (
      <div className="p-4 rounded-lg border border-border bg-card">
        <h4 className="text-sm font-medium mb-2">Wardrobe Canon</h4>
        <p className="text-xs text-muted-foreground">No wardrobe canon data available.</p>
      </div>
    )
  }

  return (
    <div className="p-4 rounded-lg border border-border bg-card space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium">Wardrobe Canon</h4>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 font-medium">
          Active
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-lg font-semibold">{wc.profiles}</div>
          <div className="text-[10px] text-muted-foreground">Character Profiles</div>
        </div>
        <div>
          <div className="text-lg font-semibold">{wc.assignments}</div>
          <div className="text-[10px] text-muted-foreground">Scene Assignments</div>
        </div>
        <div>
          <div className="text-lg font-semibold">15</div>
          <div className="text-[10px] text-muted-foreground">Canonical States</div>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground/60 pt-1 border-t border-border/50">
        Sources: character_wardrobe_profiles · scene_wardrobe_assignments · wardrobe_state_taxonomy
      </div>
    </div>
  )
}

export default WardrobeCanonPanel