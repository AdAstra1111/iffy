/**
 * useExpertMode — Expert mode toggle hooks.
 *
 * useExpertMode()          → boolean — reads NEW_EXPERT_MODE flag
 * useExpertModeContext()   → { enabled: boolean; toggle: () => void }
 *                           toggle persists to localStorage (iffy_flags key)
 *
 * Both hooks synchronously resolve the flag. No loading states, no async.
 * Toggle writes to the existing localStorage key so the flag resolver picks it up.
 */

import { useCallback } from 'react'
import { useFeatureFlag, useFeatureFlags, notifyFlagChange } from '@/hooks/useFeatureFlag'

const LOCAL_STORAGE_KEY = 'iffy_flags'

/**
 * Read-only boolean — is expert mode currently enabled?
 * Uses the existing feature flag resolution chain:
 *   URL query params > localStorage > config defaults
 */
export function useExpertMode(): boolean {
  return useFeatureFlag('NEW_EXPERT_MODE')
}

/**
 * Context hook with toggle.
 *
 * Returns `enabled` (current state) and `toggle()` which flips the flag
 * in localStorage and triggers re-render via notifyFlagChange().
 *
 * URL query params will override the toggle — that's by design (dev override).
 */
export function useExpertModeContext(): { enabled: boolean; toggle: () => void } {
  const flags = useFeatureFlags()
  const enabled = flags.NEW_EXPERT_MODE

  const toggle = useCallback(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
      const parsed: Record<string, unknown> = raw ? JSON.parse(raw) : {}
      parsed.NEW_EXPERT_MODE = !enabled
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed))
      notifyFlagChange()
    } catch {
      // Fail silently — localStorage can throw in private browsing or quota
    }
  }, [enabled])

  return { enabled, toggle }
}