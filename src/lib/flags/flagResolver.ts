/**
 * Flag Resolver — core resolution logic.
 *
 * Pure functions with no React dependency. Resolves flags using the priority chain:
 *   URL query params > localStorage > config defaults
 *
 * Fail-closed: if resolution fails for ANY reason, returns false.
 */

import type { FeatureFlags } from '@/config/featureFlags'
import { DEFAULT_FLAGS, FLAG_NAMES } from '@/config/featureFlags'

// ── Constants ───────────────────────────────────────────────────────────────

const LOCAL_STORAGE_KEY = 'iffy_flags'
const URL_FLAGS_PARAM = 'flags'

// ── URL param parser ────────────────────────────────────────────────────────

/**
 * Parse URL query param overrides from `?flags=NAME=true,NAME2=false`.
 * Returns a partial FeatureFlags object with only explicitly provided values.
 * Malformed entries are silently ignored (fail-closed).
 */
export function parseUrlFlags(): Partial<FeatureFlags> {
  try {
    const params = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.search : ''
    )
    const raw = params.get(URL_FLAGS_PARAM)
    if (!raw) return {}

    return raw
      .split(',')
      .reduce<Partial<FeatureFlags>>((acc, pair) => {
        const trimmed = pair.trim()
        if (!trimmed) return acc

        const eqIdx = trimmed.indexOf('=')
        if (eqIdx === -1) return acc

        const name = trimmed.slice(0, eqIdx).trim() as keyof FeatureFlags
        const value = trimmed.slice(eqIdx + 1).trim()

        // Validate flag name — unknown flags silently ignored (fail-closed)
        if (!FLAG_NAMES.includes(name)) return acc

        // Parse boolean value — anything other than 'true' is false
        if (value.toLowerCase() !== 'true' && value.toLowerCase() !== 'false') return acc

        acc[name] = value.toLowerCase() === 'true'
        return acc
      }, {})
  } catch {
    // Fail-closed: any exception → no overrides
    return {}
  }
}

// ── LocalStorage parser ─────────────────────────────────────────────────────

/**
 * Parse localStorage overrides from the `iffy_flags` JSON key.
 * Returns a partial FeatureFlags object with only valid flags.
 * Malformed JSON or invalid values are silently ignored (fail-closed).
 */
export function parseLocalStorageFlags(): Partial<FeatureFlags> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}

    return Object.keys(parsed).reduce<Partial<FeatureFlags>>((acc, key) => {
      const flagKey = key as keyof FeatureFlags

      // Validate flag name — unknown flags silently ignored
      if (!FLAG_NAMES.includes(flagKey)) return acc

      const value = parsed[key]
      // Only accept strict booleans — fail-closed on anything else
      if (typeof value !== 'boolean') return acc

      acc[flagKey] = value
      return acc
    }, {})
  } catch {
    // Fail-closed: any exception → no overrides
    return {}
  }
}

// ── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve a single feature flag by name.
 *
 * Priority chain: URL query params > localStorage > config defaults.
 * Fail-closed: returns false for invalid flag names or any error.
 */
export function resolveFlag(name: keyof FeatureFlags): boolean {
  try {
    // Validate flag name — unknown flags fail-closed to false
    if (!FLAG_NAMES.includes(name)) return false

    // Priority 1: URL query params
    const urlFlags = parseUrlFlags()
    if (name in urlFlags) {
      return urlFlags[name] as boolean
    }

    // Priority 2: localStorage
    const lsFlags = parseLocalStorageFlags()
    if (name in lsFlags) {
      return lsFlags[name] as boolean
    }

    // Priority 3: Config defaults
    return DEFAULT_FLAGS[name]
  } catch {
    // Fail-closed: any error → false
    return false
  }
}

/**
 * Resolve ALL feature flags.
 *
 * Each flag follows the priority chain independently.
 */
export function resolveAllFlags(): FeatureFlags {
  try {
    const urlFlags = parseUrlFlags()
    const lsFlags = parseLocalStorageFlags()

    const result = { ...DEFAULT_FLAGS }

    // Apply localStorage overrides (priority 2)
    for (const key of FLAG_NAMES) {
      if (key in lsFlags) {
        result[key] = lsFlags[key] as boolean
      }
    }

    // Apply URL query param overrides (priority 1 — highest)
    for (const key of FLAG_NAMES) {
      if (key in urlFlags) {
        result[key] = urlFlags[key] as boolean
      }
    }

    return result
  } catch {
    // Fail-closed: any error → all flags false
    return { ...DEFAULT_FLAGS }
  }
}