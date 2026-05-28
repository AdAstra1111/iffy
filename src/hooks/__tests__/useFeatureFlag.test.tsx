/**
 * useFeatureFlag — Store Subscription Tests
 *
 * Tests that useSyncExternalStore-based hooks re-render when
 * notifyFlagChange() is called, verifying the store subscription works.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, renderHook, act } from '@testing-library/react'
import React from 'react'

// Use the actual hooks — no mocking for these tests
import {
  useFeatureFlag,
  useFeatureFlags,
  useIsWorkspaceEnabled,
  notifyFlagChange,
} from '@/hooks/useFeatureFlag'

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

// ── useFeatureFlag ───────────────────────────────────────────────────────────

describe('useFeatureFlag', () => {
  it('returns false by default for any flag', () => {
    const { result } = renderHook(() => useFeatureFlag('NEW_IFFY_SHELL'))
    expect(result.current).toBe(false)
  })

  it('returns true after localStorage override + notifyFlagChange triggers re-render', () => {
    function TestComponent(): React.ReactElement {
      const enabled = useFeatureFlag('NEW_WORKSPACE_DEVELOP')
      return React.createElement('div', { 'data-testid': 'flag-value' }, String(enabled))
    }

    render(React.createElement(TestComponent))

    // Initially false (default)
    expect(screen.getByTestId('flag-value').textContent).toBe('false')

    // Write override to localStorage
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_WORKSPACE_DEVELOP: true }),
    )

    // Notify subscribers — should trigger re-render
    act(() => {
      notifyFlagChange()
    })

    // Now the component should reflect the new value
    expect(screen.getByTestId('flag-value').textContent).toBe('true')
  })

  it('returns URL override value after notifyFlagChange', () => {
    function TestComponent(): React.ReactElement {
      const enabled = useFeatureFlag('NEW_EXPERT_MODE')
      return React.createElement('div', { 'data-testid': 'flag-value' }, String(enabled))
    }

    render(React.createElement(TestComponent))

    // Set URL override
    setUrlSearch('?flags=NEW_EXPERT_MODE=true')
    act(() => {
      notifyFlagChange()
    })

    expect(screen.getByTestId('flag-value').textContent).toBe('true')
  })

  it('fail-closed: returns false for invalid flag names', () => {
    const { result } = renderHook(() =>
      useFeatureFlag('NOT_A_REAL_FLAG' as any),
    )
    expect(result.current).toBe(false)
  })

  it('re-renders when localStorage is cleared and notifyFlagChange called', () => {
    function TestComponent(): React.ReactElement {
      const enabled = useFeatureFlag('NEW_WORKSPACE_VISUALIZE')
      return React.createElement('div', { 'data-testid': 'flag-value' }, String(enabled))
    }

    render(React.createElement(TestComponent))

    // Enable via localStorage
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_WORKSPACE_VISUALIZE: true }),
    )
    act(() => { notifyFlagChange() })
    expect(screen.getByTestId('flag-value').textContent).toBe('true')

    // Clear localStorage
    localStorage.removeItem(LOCAL_STORAGE_KEY)
    act(() => { notifyFlagChange() })
    expect(screen.getByTestId('flag-value').textContent).toBe('false')
  })
})

// ── useFeatureFlags ──────────────────────────────────────────────────────────

describe('useFeatureFlags', () => {
  it('returns all 10 flags by default (all false)', () => {
    const { result } = renderHook(() => useFeatureFlags())
    expect(Object.keys(result.current)).toHaveLength(10)
    for (const value of Object.values(result.current)) {
      expect(value).toBe(false)
    }
  })

  it('re-renders all flags after localStorage write + notifyFlagChange', () => {
    function TestComponent(): React.ReactElement {
      const flags = useFeatureFlags()
      return React.createElement('div', { 'data-testid': 'flag-summary' },
        Object.entries(flags)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(','),
      )
    }

    render(React.createElement(TestComponent))

    // Initially no enabled flags
    expect(screen.getByTestId('flag-summary').textContent).toBe('')

    // Enable two flags
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        NEW_WORKSPACE_DEVELOP: true,
        NEW_WORKSPACE_CAST: true,
      }),
    )
    act(() => { notifyFlagChange() })

    // Should show both flag names
    const summary = screen.getByTestId('flag-summary').textContent!
    expect(summary).toContain('NEW_WORKSPACE_DEVELOP')
    expect(summary).toContain('NEW_WORKSPACE_CAST')
  })
})

// ── useIsWorkspaceEnabled ────────────────────────────────────────────────────

describe('useIsWorkspaceEnabled', () => {
  it('returns false by default for any workspace', () => {
    const { result } = renderHook(() => useIsWorkspaceEnabled('develop'))
    expect(result.current).toBe(false)
  })

  it('returns true when the corresponding flag is enabled', () => {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_WORKSPACE_DEVELOP: true }),
    )

    function TestComponent(): React.ReactElement {
      const enabled = useIsWorkspaceEnabled('develop')
      return React.createElement('div', { 'data-testid': 'flag-value' }, String(enabled))
    }

    render(React.createElement(TestComponent))
    act(() => { notifyFlagChange() })
    expect(screen.getByTestId('flag-value').textContent).toBe('true')
  })

  it('returns false for unknown workspace names (fail-closed)', () => {
    const { result } = renderHook(() =>
      useIsWorkspaceEnabled('nonexistent'),
    )
    expect(result.current).toBe(false)
  })

  it('is case-insensitive', () => {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_WORKSPACE_CAST: true }),
    )

    function TestComponent(): React.ReactElement {
      const enabled = useIsWorkspaceEnabled('CAST')
      return React.createElement('div', { 'data-testid': 'flag-value' }, String(enabled))
    }

    render(React.createElement(TestComponent))
    act(() => { notifyFlagChange() })
    expect(screen.getByTestId('flag-value').textContent).toBe('true')
  })

  it('follows URL overrides (URL > localStorage)', () => {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_WORKSPACE_VISUALIZE: true }),
    )
    setUrlSearch('?flags=NEW_WORKSPACE_VISUALIZE=false')

    function TestComponent(): React.ReactElement {
      const enabled = useIsWorkspaceEnabled('visualize')
      return React.createElement('div', { 'data-testid': 'flag-value' }, String(enabled))
    }

    render(React.createElement(TestComponent))
    act(() => { notifyFlagChange() })
    expect(screen.getByTestId('flag-value').textContent).toBe('false')
  })
})