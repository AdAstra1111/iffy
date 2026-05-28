/**
 * Route Gate — route-level gating for workspace flags.
 *
 * When a workspace flag is false, the route should render the legacy page.
 * This component provides the check — the actual routing is handled elsewhere.
 *
 * Pure functions, no React dependency. Can be used in route guards and loaders.
 */

import type { FeatureFlags } from '@/config/featureFlags'
import { WORKSPACE_FLAG_MAP } from '@/config/featureFlags'
import { resolveFlag, resolveAllFlags } from './flagResolver'

/**
 * Check if a workspace is enabled (flag is true).
 *
 * Uses the canonical priority chain: URL > localStorage > config.
 * Unknown workspace names return false (fail-closed).
 *
 * @param workspace - Short workspace name (e.g. 'develop', 'cast', 'visualize')
 */
export function isWorkspaceEnabled(workspace: string): boolean {
  const flagKey = WORKSPACE_FLAG_MAP[workspace.toLowerCase()]
  if (!flagKey) return false // Unknown workspace → fail-closed
  return resolveFlag(flagKey)
}

/**
 * Check if the new PlatformShell is enabled.
 */
export function isNewShellEnabled(): boolean {
  return resolveFlag('NEW_IFFY_SHELL')
}

/**
 * Get all workspace enablement states.
 * Returns a map of workspace name → enabled status.
 */
export function getWorkspaceEnablement(): Record<string, boolean> {
  const flags = resolveAllFlags()
  const result: Record<string, boolean> = {}

  for (const [workspace, flagKey] of Object.entries(WORKSPACE_FLAG_MAP)) {
    result[workspace] = flags[flagKey as keyof FeatureFlags]
  }

  return result
}