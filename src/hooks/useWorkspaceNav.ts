/**
 * useWorkspaceNav — derives current workspace context from URL path.
 *
 * Returns the active workspace name (e.g. 'develop', 'cast') or null
 * when no workspace is detected.
 */

import { useLocation } from 'react-router-dom'

const WORKSPACE_SEGMENTS = [
  'develop',
  'visualize',
  'cast',
  'produce',
  'package',
  'deliver',
] as const

export type WorkspaceName = (typeof WORKSPACE_SEGMENTS)[number]

export function useWorkspaceNav(): WorkspaceName | null {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)

  // Check each path segment for a workspace match
  for (const segment of segments) {
    const matched = WORKSPACE_SEGMENTS.find((ws) => segment === ws)
    if (matched) return matched
  }

  return null
}