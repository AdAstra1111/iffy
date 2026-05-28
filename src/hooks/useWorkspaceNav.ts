/**
 * useWorkspaceNav — derives current workspace context from URL path
 * and returns workspace metadata including availability and progression.
 */

import { useLocation } from 'react-router-dom'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import type { FeatureFlags } from '@/config/featureFlags'
import { WORKSPACE_FLAG_MAP } from '@/config/featureFlags'

// ── Phase order ──────────────────────────────────────────────────────────────

export const ALL_PHASES = [
  'concept',
  'develop',
  'visualize',
  'cast',
  'produce',
  'package',
  'deliver',
] as const

export type PhaseName = (typeof ALL_PHASES)[number]

// ── Workspace info interface ────────────────────────────────────────────────

export interface WorkspaceInfo {
  /** The currently active workspace phase (from URL), or null */
  active: PhaseName | null
  /** Phases that come before the active phase (considered completed) */
  completed: PhaseName[]
  /** All phases in order */
  allPhases: readonly PhaseName[]
  /** Check if a phase is available (feature-flag-enabled or always-on) */
  isAvailable: (name: string) => boolean
}

// ── Legacy fallback URLs for flagged-off workspaces ─────────────────────────

const LEGACY_FALLBACKS: Record<string, string> = {
  develop: '/projects/:id/development',
  visualize: '/projects/:id/visual-dev',
  cast: '/projects/:id/casting',
  produce: '/projects/:id/cockpit',
  package: '/projects/:id',
  deliver: '/projects/:id',
}

/**
 * Get the legacy fallback URL for a phase when its flag is disabled.
 * Substitutes :id with the actual project ID from the current path.
 */
export function getLegacyFallbackUrl(phase: string, projectId: string): string {
  const template = LEGACY_FALLBACKS[phase] ?? '/projects/:id'
  return template.replace(':id', projectId)
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useWorkspaceNav(): WorkspaceInfo {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)

  // Extract active phase from URL path
  let active: PhaseName | null = null
  let projectId: string | null = null

  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i] === 'projects') {
      projectId = segments[i + 1]
      // Check the next segment for a phase match
      const nextSeg = segments[i + 2]
      if (nextSeg && (ALL_PHASES as readonly string[]).includes(nextSeg)) {
        active = nextSeg as PhaseName
      }
      break
    }
  }

  // Compute completed phases (all phases before the active one)
  const completed: PhaseName[] = []
  if (active) {
    const activeIdx = ALL_PHASES.indexOf(active)
    for (let i = 0; i < activeIdx; i++) {
      completed.push(ALL_PHASES[i])
    }
  }

  // isAvailable check: concept is always available; others use feature flags
  const isAvailable = (name: string): boolean => {
    if (name === 'concept') return true
    const flagKey = WORKSPACE_FLAG_MAP[name]
    if (!flagKey) return false
    // We inline the flag check using useFeatureFlag — but since this is a
    // callback, we resolve eagerly for all phases so the closure captures them.
    return resolvedFlags[flagKey] ?? false
  }

  // Resolve all workspace flags eagerly so isAvailable() works as a pure function
  const resolvedFlags: Partial<Record<keyof FeatureFlags, boolean>> = {}

  // We need to check each flag individually — but useFeatureFlag can't be
  // called conditionally. Call them all at the top level.
  const developEnabled = useFeatureFlag('NEW_WORKSPACE_DEVELOP')
  const visualizeEnabled = useFeatureFlag('NEW_WORKSPACE_VISUALIZE')
  const castEnabled = useFeatureFlag('NEW_WORKSPACE_CAST')
  const produceEnabled = useFeatureFlag('NEW_WORKSPACE_PRODUCE')
  const packageEnabled = useFeatureFlag('NEW_WORKSPACE_PACKAGE')
  const deliverEnabled = useFeatureFlag('NEW_WORKSPACE_DELIVER')

  resolvedFlags['NEW_WORKSPACE_DEVELOP'] = developEnabled
  resolvedFlags['NEW_WORKSPACE_VISUALIZE'] = visualizeEnabled
  resolvedFlags['NEW_WORKSPACE_CAST'] = castEnabled
  resolvedFlags['NEW_WORKSPACE_PRODUCE'] = produceEnabled
  resolvedFlags['NEW_WORKSPACE_PACKAGE'] = packageEnabled
  resolvedFlags['NEW_WORKSPACE_DELIVER'] = deliverEnabled

  return {
    active,
    completed,
    allPhases: ALL_PHASES,
    isAvailable,
  }
}

/**
 * Extracts the projectId from the current URL path.
 */
export function useProjectIdFromPath(): string | null {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i] === 'projects') {
      return segments[i + 1]
    }
  }
  return null
}