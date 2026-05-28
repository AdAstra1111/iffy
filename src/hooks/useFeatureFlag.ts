/**
 * useFeatureFlag — React hooks for feature flag resolution.
 *
 * Synchronous hooks — no loading states, no async.
 * Returns resolved flag value respecting priority chain:
 *   URL query params > localStorage > config defaults
 */

import { useSyncExternalStore } from 'react'
import type { FeatureFlags } from '@/config/featureFlags'
import { DEFAULT_FLAGS, FLAG_NAMES } from '@/config/featureFlags'
import { resolveFlag, resolveAllFlags } from '@/lib/flags/flagResolver'

// ── Subscription helpers for useSyncExternalStore ──────────────────────────

/**
 * A simple store that notifies subscribers when flags may have changed.
 * This is used to re-render hooks when localStorage or URL changes.
 *
 * Note: In dev, you can trigger re-renders by calling notifyFlagChange()
 * after modifying localStorage or URL params.
 */

type Listener = () => void
const listeners = new Set<Listener>()

function subscribeToFlagStore(cb: Listener): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getFlagStoreSnapshot(): number {
  return flagStoreVersion
}

let flagStoreVersion = 0

/**
 * Notify all subscribers that flags may have changed.
 * Call this after modifying localStorage or URL params to trigger re-render.
 *
 * In production, flags are typically set once on page load and don't change
 * at runtime. This is primarily useful for dev environments.
 */
export function notifyFlagChange(): void {
  flagStoreVersion++
  listeners.forEach((cb) => cb())
}

// ── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Resolve a single feature flag by name.
 *
 * Synchronous — returns the resolved boolean value immediately.
 * Fail-closed: invalid flag names return false.
 *
 * @param name - The canonical flag name (must be a key of FeatureFlags)
 */
export function useFeatureFlag(name: keyof FeatureFlags): boolean {
  // Subscribe to version changes to re-render when flags are updated
  useSyncExternalStore(subscribeToFlagStore, getFlagStoreSnapshot, getFlagStoreSnapshot)

  return resolveFlag(name)
}

/**
 * Resolve ALL feature flags at once.
 *
 * Synchronous — returns the full resolved FeatureFlags object immediately.
 * Fail-closed: any error returns all flags as false.
 */
export function useFeatureFlags(): FeatureFlags {
  // Subscribe to version changes to re-render when flags are updated
  useSyncExternalStore(subscribeToFlagStore, getFlagStoreSnapshot, getFlagStoreSnapshot)

  return resolveAllFlags()
}

/**
 * Check if a workspace flag is enabled.
 *
 * Convenience hook for workspace gating.
 *
 * @param workspace - Short workspace name (e.g. 'develop', 'cast', 'visualize')
 */
export function useIsWorkspaceEnabled(workspace: string): boolean {
  const flags = useFeatureFlags()
  const flagKey = workspace.toUpperCase() as keyof FeatureFlags
  const canonicalName = `NEW_WORKSPACE_${flagKey}` as keyof FeatureFlags

  // Validate: check if this is a known flag
  if (!FLAG_NAMES.includes(canonicalName)) return false

  return flags[canonicalName]
}