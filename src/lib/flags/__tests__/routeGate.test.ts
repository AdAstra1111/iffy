/**
 * Route Gate — Unit Tests
 *
 * Tests for isWorkspaceEnabled, isNewShellEnabled, and getWorkspaceEnablement.
 * Uses the actual flagResolver (no mocking) for integration-style coverage.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  isWorkspaceEnabled,
  isNewShellEnabled,
  getWorkspaceEnablement,
} from '../routeGate'

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

describe('isWorkspaceEnabled', () => {
  it('returns false by default for all workspaces (all flags default to false)', () => {
    expect(isWorkspaceEnabled('develop')).toBe(false)
    expect(isWorkspaceEnabled('visualize')).toBe(false)
    expect(isWorkspaceEnabled('cast')).toBe(false)
    expect(isWorkspaceEnabled('produce')).toBe(false)
    expect(isWorkspaceEnabled('package')).toBe(false)
    expect(isWorkspaceEnabled('deliver')).toBe(false)
  })

  it('returns true when localStorage overrides the flag', () => {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_WORKSPACE_DEVELOP: true }),
    )
    expect(isWorkspaceEnabled('develop')).toBe(true)
  })

  it('returns false when URL overrides the flag to false (URL > localStorage)', () => {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_WORKSPACE_DEVELOP: true }),
    )
    setUrlSearch('?flags=NEW_WORKSPACE_DEVELOP=false')
    expect(isWorkspaceEnabled('develop')).toBe(false)
  })

  it('returns false for unknown workspace names (fail-closed)', () => {
    expect(isWorkspaceEnabled('nonexistent_workspace')).toBe(false)
  })

  it('is case-insensitive for workspace names', () => {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_WORKSPACE_CAST: true }),
    )
    expect(isWorkspaceEnabled('CAST')).toBe(true)
    expect(isWorkspaceEnabled('Cast')).toBe(true)
    expect(isWorkspaceEnabled('cast')).toBe(true)
  })

  it('handles URL override for workspace flag', () => {
    setUrlSearch('?flags=NEW_WORKSPACE_VISUALIZE=true')
    expect(isWorkspaceEnabled('visualize')).toBe(true)
  })
})

describe('isNewShellEnabled', () => {
  it('returns false by default (NEW_IFFY_SHELL defaults to false)', () => {
    expect(isNewShellEnabled()).toBe(false)
  })

  it('returns true when localStorage overrides the flag', () => {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_IFFY_SHELL: true }),
    )
    expect(isNewShellEnabled()).toBe(true)
  })

  it('respects URL override over localStorage', () => {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_IFFY_SHELL: true }),
    )
    setUrlSearch('?flags=NEW_IFFY_SHELL=false')
    expect(isNewShellEnabled()).toBe(false)
  })
})

describe('getWorkspaceEnablement', () => {
  it('returns all 6 workspace flags as a map', () => {
    const result = getWorkspaceEnablement()
    expect(Object.keys(result)).toHaveLength(6)
    expect(result).toHaveProperty('develop')
    expect(result).toHaveProperty('visualize')
    expect(result).toHaveProperty('cast')
    expect(result).toHaveProperty('produce')
    expect(result).toHaveProperty('package')
    expect(result).toHaveProperty('deliver')
  })

  it('all entries are false by default', () => {
    const result = getWorkspaceEnablement()
    for (const value of Object.values(result)) {
      expect(value).toBe(false)
    }
  })

  it('reflects localStorage overrides', () => {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_WORKSPACE_DEVELOP: true, NEW_WORKSPACE_CAST: true }),
    )
    const result = getWorkspaceEnablement()
    expect(result.develop).toBe(true)
    expect(result.cast).toBe(true)
    expect(result.visualize).toBe(false)
  })

  it('applies URL overrides with highest priority', () => {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_WORKSPACE_DEVELOP: true }),
    )
    setUrlSearch('?flags=NEW_WORKSPACE_DEVELOP=false,NEW_WORKSPACE_VISUALIZE=true')
    const result = getWorkspaceEnablement()
    expect(result.develop).toBe(false)   // URL overrides LS
    expect(result.visualize).toBe(true)  // URL sets it
  })
})