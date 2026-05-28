/**
 * Flag Resolver — Edge Case Tests
 *
 * Boundary conditions, corrupt inputs, and fail-closed edge cases
 * that extend beyond the initial 12 unit tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  parseUrlFlags,
  parseLocalStorageFlags,
  resolveFlag,
  resolveAllFlags,
} from '../flagResolver'

const LOCAL_STORAGE_KEY = 'iffy_flags'

/** Set window.location.search for URL-based overrides */
function setUrlSearch(search: string): void {
  Object.defineProperty(window, 'location', {
    value: { search },
    writable: true,
  })
}

beforeEach(() => {
  localStorage.clear()
  setUrlSearch('')
})

afterEach(() => {
  localStorage.clear()
  setUrlSearch('')
})

// ── URL Parser Edge Cases ────────────────────────────────────────────────────

describe('parseUrlFlags — edge cases', () => {
  it('returns empty object when window is undefined (SSR safety)', () => {
    // Simulate SSR — temporarily make window undefined
    const savedWindow = globalThis.window
    delete (globalThis as any).window
    try {
      expect(parseUrlFlags()).toEqual({})
    } finally {
      globalThis.window = savedWindow as any
    }
  })

  it('handles empty flags param', () => {
    setUrlSearch('?flags=')
    expect(parseUrlFlags()).toEqual({})
  })

  it('handles flags with only whitespace entries', () => {
    setUrlSearch('?flags=  ,,  ,')
    expect(parseUrlFlags()).toEqual({})
  })

  it('handles non-boolean string values (fail-closed)', () => {
    setUrlSearch('?flags=NEW_SYSTEM_MODE=yes,NEW_EXPERT_MODE=1,NEW_IFFY_SHELL=no')
    const result = parseUrlFlags()
    // All should be ignored (fail-closed)
    expect(result).not.toHaveProperty('NEW_SYSTEM_MODE')
    expect(result).not.toHaveProperty('NEW_EXPERT_MODE')
    expect(result).not.toHaveProperty('NEW_IFFY_SHELL')
  })

  it('treats case-insensitive "TRUE" and "FALSE" as valid', () => {
    setUrlSearch('?flags=NEW_SYSTEM_MODE=TRUE,NEW_EXPERT_MODE=FALSE')
    const result = parseUrlFlags()
    expect(result).toHaveProperty('NEW_SYSTEM_MODE', true)
    expect(result).toHaveProperty('NEW_EXPERT_MODE', false)
  })

  it('handles invalid flag names with spaces in URL param', () => {
    setUrlSearch('?flags=INVALID FLAG=true,NEW_IFFY_SHELL=true')
    const result = parseUrlFlags()
    expect(result).not.toHaveProperty('INVALID FLAG')
    expect(result).toHaveProperty('NEW_IFFY_SHELL', true)
  })

  it('handles URL with many overrides at once (all 10 flags)', () => {
    setUrlSearch(
      '?flags=' +
        'NEW_IFFY_SHELL=true,' +
        'NEW_WORKSPACE_DEVELOP=true,' +
        'NEW_WORKSPACE_VISUALIZE=true,' +
        'NEW_WORKSPACE_CAST=true,' +
        'NEW_WORKSPACE_PRODUCE=true,' +
        'NEW_WORKSPACE_PACKAGE=true,' +
        'NEW_WORKSPACE_DELIVER=true,' +
        'NEW_INTELLIGENCE_LAYER=true,' +
        'NEW_EXPERT_MODE=true,' +
        'NEW_SYSTEM_MODE=true',
    )
    const result = parseUrlFlags()
    expect(Object.keys(result)).toHaveLength(10)
    for (const value of Object.values(result)) {
      expect(value).toBe(true)
    }
  })
})

// ── LocalStorage Parser Edge Cases ──────────────────────────────────────────

describe('parseLocalStorageFlags — edge cases', () => {
  it('returns empty object for corrupt JSON (non-string)', () => {
    // We can't store non-string in localStorage, but test via direct setItem
    localStorage.setItem(LOCAL_STORAGE_KEY, '{broken json')
    expect(parseLocalStorageFlags()).toEqual({})
  })

  it('returns empty object for non-object JSON (array)', () => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(['a', 'b', 'c']))
    expect(parseLocalStorageFlags()).toEqual({})
  })

  it('returns empty object for null JSON', () => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(null))
    expect(parseLocalStorageFlags()).toEqual({})
  })

  it('returns empty object for number JSON', () => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(42))
    expect(parseLocalStorageFlags()).toEqual({})
  })

  it('returns empty object for string JSON', () => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify('not-an-object'))
    expect(parseLocalStorageFlags()).toEqual({})
  })

  it('ignores numeric values (fail-closed — only strict booleans)', () => {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_IFFY_SHELL: 1, NEW_SYSTEM_MODE: 0 }),
    )
    const result = parseLocalStorageFlags()
    expect(result).not.toHaveProperty('NEW_IFFY_SHELL')
    expect(result).not.toHaveProperty('NEW_SYSTEM_MODE')
  })

  it('ignores null values in object', () => {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_IFFY_SHELL: null, NEW_WORKSPACE_DEVELOP: true }),
    )
    const result = parseLocalStorageFlags()
    expect(result).not.toHaveProperty('NEW_IFFY_SHELL')
    expect(result).toHaveProperty('NEW_WORKSPACE_DEVELOP', true)
  })

  it('ignores undefined values in object', () => {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_IFFY_SHELL: undefined, NEW_WORKSPACE_DEVELOP: true }),
    )
    const result = parseLocalStorageFlags()
    expect(result).not.toHaveProperty('NEW_IFFY_SHELL')
    expect(result).toHaveProperty('NEW_WORKSPACE_DEVELOP', true)
  })

  it('filters out unknown flags while keeping valid ones', () => {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        UNKNOWN_FLAG_A: true,
        NEW_WORKSPACE_CAST: true,
        UNKNOWN_FLAG_B: false,
      }),
    )
    const result = parseLocalStorageFlags()
    expect(result).not.toHaveProperty('UNKNOWN_FLAG_A')
    expect(result).toHaveProperty('NEW_WORKSPACE_CAST', true)
    expect(result).not.toHaveProperty('UNKNOWN_FLAG_B')
  })
})

// ── resolveFlag Edge Cases ───────────────────────────────────────────────────

describe('resolveFlag — edge cases', () => {
  it('prioritizes URL param over localStorage when both set for different flags', () => {
    // LS sets DEVELOP = true, URL sets SYSTEM_MODE = true
    // There's no overlap — both should be true
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_WORKSPACE_DEVELOP: true }),
    )
    setUrlSearch('?flags=NEW_SYSTEM_MODE=true')

    expect(resolveFlag('NEW_WORKSPACE_DEVELOP')).toBe(true)
    expect(resolveFlag('NEW_SYSTEM_MODE')).toBe(true)
  })

  it('returns false when URL param has a known flag with invalid boolean', () => {
    // Flag name is valid, value is "banana" — should be ignored
    setUrlSearch('?flags=NEW_IFFY_SHELL=banana')
    // Falls through to default (false)
    expect(resolveFlag('NEW_IFFY_SHELL')).toBe(false)
  })

  it('returns the correct value after URL override of localStorage', () => {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_WORKSPACE_DEVELOP: true }),
    )
    expect(resolveFlag('NEW_WORKSPACE_DEVELOP')).toBe(true)

    // Now URL overrides it to false
    setUrlSearch('?flags=NEW_WORKSPACE_DEVELOP=false')
    expect(resolveFlag('NEW_WORKSPACE_DEVELOP')).toBe(false)
  })
})

// ── resolveAllFlags Edge Cases ──────────────────────────────────────────────

describe('resolveAllFlags — edge cases', () => {
  it('returns defaults when localStorage and URL are both empty', () => {
    const result = resolveAllFlags()
    expect(result).toEqual({
      NEW_IFFY_SHELL: false,
      NEW_WORKSPACE_DEVELOP: false,
      NEW_WORKSPACE_VISUALIZE: false,
      NEW_WORKSPACE_CAST: false,
      NEW_WORKSPACE_PRODUCE: false,
      NEW_WORKSPACE_PACKAGE: false,
      NEW_WORKSPACE_DELIVER: false,
      NEW_INTELLIGENCE_LAYER: false,
      NEW_EXPERT_MODE: false,
      NEW_SYSTEM_MODE: false,
    })
  })

  it('handles corrupt localStorage gracefully (returns defaults)', () => {
    localStorage.setItem(LOCAL_STORAGE_KEY, '{{{corrupt')
    const result = resolveAllFlags()
    // All should be defaults (false)
    expect(Object.values(result).every((v) => v === false)).toBe(true)
  })

  it('merges overrides correctly with mixed sources', () => {
    // URL: SYSTEM_MODE = true (highest priority)
    // LS: DEVELOP = true, SYSTEM_MODE = false (should be overridden by URL)
    setUrlSearch('?flags=NEW_SYSTEM_MODE=true')
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        NEW_WORKSPACE_DEVELOP: true,
        NEW_SYSTEM_MODE: false,
      }),
    )

    const result = resolveAllFlags()
    expect(result.NEW_SYSTEM_MODE).toBe(true)   // URL wins
    expect(result.NEW_WORKSPACE_DEVELOP).toBe(true) // LS applies
    expect(result.NEW_IFFY_SHELL).toBe(false)       // Default
  })

  it('all 10 keys are always present', () => {
    const result = resolveAllFlags()
    expect(Object.keys(result).sort()).toEqual([
      'NEW_EXPERT_MODE',
      'NEW_IFFY_SHELL',
      'NEW_INTELLIGENCE_LAYER',
      'NEW_SYSTEM_MODE',
      'NEW_WORKSPACE_CAST',
      'NEW_WORKSPACE_DELIVER',
      'NEW_WORKSPACE_DEVELOP',
      'NEW_WORKSPACE_PACKAGE',
      'NEW_WORKSPACE_PRODUCE',
      'NEW_WORKSPACE_VISUALIZE',
    ])
  })
})