/**
 * Flag Resolver — Unit Tests
 *
 * 10 tests covering URL parsing, localStorage parsing, priority chain,
 * fail-closed behaviour, unknown flags, and resolveAllFlags edge cases.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  parseUrlFlags,
  parseLocalStorageFlags,
  resolveFlag,
  resolveAllFlags,
} from '../flagResolver'

// ── Helpers ──────────────────────────────────────────────────────────────────

const LOCAL_STORAGE_KEY = 'iffy_flags'

/** Set window.location.search for testing URL parsing */
function setUrlSearch(search: string): void {
  Object.defineProperty(window, 'location', {
    value: { search },
    writable: true,
  })
}

/** Set localStorage content for testing LS parsing */
function setLocalStorageFlags(data: Record<string, unknown> | null): void {
  if (data === null) {
    localStorage.removeItem(LOCAL_STORAGE_KEY)
  } else {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data))
  }
}

beforeEach(() => {
  localStorage.clear()
  setUrlSearch('')
})

afterEach(() => {
  localStorage.clear()
  setUrlSearch('')
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('parseUrlFlags', () => {
  it('parses valid flags from query params', () => {
    setUrlSearch('?flags=NEW_SYSTEM_MODE=true,NEW_EXPERT_MODE=false')
    const result = parseUrlFlags()
    expect(result).toHaveProperty('NEW_SYSTEM_MODE', true)
    expect(result).toHaveProperty('NEW_EXPERT_MODE', false)
  })

  it('returns empty object when no flags param present', () => {
    setUrlSearch('?page=1&view=grid')
    expect(parseUrlFlags()).toEqual({})
  })

  it('ignores unknown flag names (fail-closed)', () => {
    setUrlSearch('?flags=UNKNOWN_FLAG=true,NEW_IFFY_SHELL=true')
    const result = parseUrlFlags()
    expect(result).not.toHaveProperty('UNKNOWN_FLAG')
    expect(result).toHaveProperty('NEW_IFFY_SHELL', true)
  })

  it('ignores malformed entries (missing = sign)', () => {
    // First entry is valid, second has no `=` sign
    setUrlSearch('?flags=NEW_SYSTEM_MODE=true,NEW_EXPERT_MODE')
    const result = parseUrlFlags()
    expect(result).toHaveProperty('NEW_SYSTEM_MODE', true)
    expect(result).not.toHaveProperty('NEW_EXPERT_MODE')
  })
})

describe('parseLocalStorageFlags', () => {
  it('parses valid flags from localStorage', () => {
    setLocalStorageFlags({
      NEW_WORKSPACE_DEVELOP: true,
      NEW_WORKSPACE_CAST: false,
    })
    const result = parseLocalStorageFlags()
    expect(result).toHaveProperty('NEW_WORKSPACE_DEVELOP', true)
    expect(result).toHaveProperty('NEW_WORKSPACE_CAST', false)
  })

  it('ignores non-boolean values (fail-closed)', () => {
    setLocalStorageFlags({
      NEW_SYSTEM_MODE: 'string-value',
      NEW_IFFY_SHELL: true,
    })
    const result = parseLocalStorageFlags()
    expect(result).not.toHaveProperty('NEW_SYSTEM_MODE')
    expect(result).toHaveProperty('NEW_IFFY_SHELL', true)
  })

  it('handles malformed JSON silently (fail-closed)', () => {
    localStorage.setItem(LOCAL_STORAGE_KEY, 'not-valid-json')
    expect(parseLocalStorageFlags()).toEqual({})
  })
})

describe('resolveFlag', () => {
  it('respects priority chain: URL > localStorage > config default', () => {
    // Default for NEW_WORKSPACE_DEVELOP is false
    // Set localStorage to true (priority 2)
    setLocalStorageFlags({ NEW_WORKSPACE_DEVELOP: true })

    // URL should win: set it to false (priority 1)
    setUrlSearch('?flags=NEW_WORKSPACE_DEVELOP=false')

    expect(resolveFlag('NEW_WORKSPACE_DEVELOP')).toBe(false)
  })

  it('falls back to localStorage when URL does not override', () => {
    setLocalStorageFlags({ NEW_WORKSPACE_DEVELOP: true })
    // No URL override — should resolve from LS
    expect(resolveFlag('NEW_WORKSPACE_DEVELOP')).toBe(true)
  })

  it('returns default value when no overrides exist', () => {
    // All flags default to false — no overrides set
    expect(resolveFlag('NEW_WORKSPACE_DEVELOP')).toBe(false)
  })

  it('returns false for unknown flag names (fail-closed)', () => {
    expect(resolveFlag('NOT_A_REAL_FLAG_NAME' as any)).toBe(false)
  })
})

describe('resolveAllFlags', () => {
  it('merges URL, localStorage, and defaults correctly', () => {
    // Defaults: all false
    // LS: set DEVELOP and VISUALIZE to true
    setLocalStorageFlags({
      NEW_WORKSPACE_DEVELOP: true,
      NEW_WORKSPACE_VISUALIZE: true,
    })
    // URL: override VISUALIZE back to false
    setUrlSearch('?flags=NEW_WORKSPACE_VISUALIZE=false')

    const result = resolveAllFlags()

    // URL wins for VISUALIZE
    expect(result.NEW_WORKSPACE_VISUALIZE).toBe(false)
    // LS applies for DEVELOP (no URL override)
    expect(result.NEW_WORKSPACE_DEVELOP).toBe(true)
    // Default applies for flags with no overrides
    expect(result.NEW_IFFY_SHELL).toBe(false)
    // All 10 keys present
    expect(Object.keys(result).length).toBe(10)
  })
})