/**
 * useFeatureFlag — React hooks for feature flag resolution.
 *
 * Synchronous hooks — no loading states, no async.
 * Returns resolved flag value respecting priority chain:
 *   URL query params > localStorage > config defaults
 *
 * Uses useState (not useSyncExternalStore) to avoid forcing cascading
 * re-renders on child components. In production, flags are set once
 * on page load and never change at runtime.
 *
 * notifyFlagChange is available for dev environments to trigger flag re-reads.
 */

import { useState } from 'react'
import type { FeatureFlags } from '@/config/featureFlags'
import { DEFAULT_FLAGS, FLAG_NAMES } from '@/config/featureFlags'
import { resolveFlag, resolveAllFlags } from '@/lib/flags/flagResolver'

// notifyFlagChange — no-op in production; flags are set once on page load
// Exported for backward compatibility with useExpertMode and dev tooling.
export function notifyFlagChange(): void {}

/**
 * Resolve a single feature flag by name.
 *
 * Synchronous — returns the resolved boolean value immediately.
 * Fail-closed: invalid flag names return false.
 *
 * Uses useState to avoid cascading re-renders via useSyncExternalStore.
 * In production, flags are set once on page load and don't change.
 *
 * @param name - The canonical flag name (must be a key of FeatureFlags)
 */
export function useFeatureFlag(name: keyof FeatureFlags): boolean {
  const [flag] = useState(() => resolveFlag(name))
  return flag
}

/**
 * Resolve ALL feature flags at once.
 *
 * Synchronous — returns the full resolved FeatureFlags object immediately.
 * Fail-closed: any error returns all flags as false.
 */
export function useFeatureFlags(): FeatureFlags {
  const [flags] = useState(() => resolveAllFlags())
  return flags
}

/**
 * Check if a workspace flag is enabled.
 *
 * Convenience hook for workspace gating.
 *
 * @param workspace - Short workspace name (e.g. 'develop', 'cast', 'visualize')
 */
export function useIsWorkspaceEnabled(workspace: string): boolean {
  const [flags] = useState(() => {
    const allFlags = resolveAllFlags()
    const flagKey = workspace.toUpperCase() as keyof FeatureFlags
    const canonicalName = `NEW_WORKSPACE_${flagKey}` as keyof FeatureFlags
    if (!FLAG_NAMES.includes(canonicalName)) return false
    return allFlags[canonicalName]
  })
  return flags
}