/**
 * FlagDebugPanel — Component Tests
 *
 * Tests visibility gating (NEW_SYSTEM_MODE), toggle button interaction,
 * reset functionality, and re-render triggering via notifyFlagChange.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FlagDebugPanel } from '../FlagDebugPanel'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUseFeatureFlag = vi.fn()
const mockUseFeatureFlags = vi.fn()
const mockNotifyFlagChange = vi.fn()

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFeatureFlag: (...args: unknown[]) => mockUseFeatureFlag(...args),
  useFeatureFlags: (...args: unknown[]) => mockUseFeatureFlags(...args),
  notifyFlagChange: (...args: unknown[]) => mockNotifyFlagChange(...args),
}))

const LOCAL_STORAGE_KEY = 'iffy_flags'

beforeEach(() => {
  mockUseFeatureFlag.mockReset()
  mockUseFeatureFlags.mockReset()
  mockNotifyFlagChange.mockReset()
  localStorage.clear()
})

// ── Visibility Tests ─────────────────────────────────────────────────────────

describe('FlagDebugPanel — Visibility', () => {
  it('renders nothing when NEW_SYSTEM_MODE is false', () => {
    mockUseFeatureFlag.mockReturnValue(false)
    mockUseFeatureFlags.mockReturnValue({
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

    const { container } = render(<FlagDebugPanel />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the debug panel when NEW_SYSTEM_MODE is true', () => {
    mockUseFeatureFlag.mockReturnValue(true)
    mockUseFeatureFlags.mockReturnValue({
      NEW_IFFY_SHELL: false,
      NEW_WORKSPACE_DEVELOP: false,
      NEW_WORKSPACE_VISUALIZE: false,
      NEW_WORKSPACE_CAST: false,
      NEW_WORKSPACE_PRODUCE: false,
      NEW_WORKSPACE_PACKAGE: false,
      NEW_WORKSPACE_DELIVER: false,
      NEW_INTELLIGENCE_LAYER: false,
      NEW_EXPERT_MODE: false,
      NEW_SYSTEM_MODE: true,
    })

    render(<FlagDebugPanel />)
    expect(screen.getByText('Feature Flags (Debug)')).toBeTruthy()
  })

  it('shows all 10 flags when visible', () => {
    mockUseFeatureFlag.mockReturnValue(true)
    mockUseFeatureFlags.mockReturnValue({
      NEW_IFFY_SHELL: false,
      NEW_WORKSPACE_DEVELOP: false,
      NEW_WORKSPACE_VISUALIZE: false,
      NEW_WORKSPACE_CAST: false,
      NEW_WORKSPACE_PRODUCE: false,
      NEW_WORKSPACE_PACKAGE: false,
      NEW_WORKSPACE_DELIVER: false,
      NEW_INTELLIGENCE_LAYER: false,
      NEW_EXPERT_MODE: false,
      NEW_SYSTEM_MODE: true,
    })

    render(<FlagDebugPanel />)
    expect(screen.getByText('New Shell')).toBeTruthy()
    expect(screen.getByText('Develop')).toBeTruthy()
    expect(screen.getByText('Visualize')).toBeTruthy()
    expect(screen.getByText('Cast')).toBeTruthy()
    expect(screen.getByText('Produce')).toBeTruthy()
    expect(screen.getByText('Package')).toBeTruthy()
    expect(screen.getByText('Deliver')).toBeTruthy()
    expect(screen.getByText('Intelligence')).toBeTruthy()
    expect(screen.getByText('Expert Mode')).toBeTruthy()
    expect(screen.getByText('System Mode')).toBeTruthy()
  })

  it('shows ON/OFF button states matching flag values', () => {
    mockUseFeatureFlag.mockReturnValue(true)
    mockUseFeatureFlags.mockReturnValue({
      NEW_IFFY_SHELL: true,
      NEW_WORKSPACE_DEVELOP: false,
      NEW_WORKSPACE_VISUALIZE: false,
      NEW_WORKSPACE_CAST: false,
      NEW_WORKSPACE_PRODUCE: false,
      NEW_WORKSPACE_PACKAGE: false,
      NEW_WORKSPACE_DELIVER: false,
      NEW_INTELLIGENCE_LAYER: false,
      NEW_EXPERT_MODE: false,
      NEW_SYSTEM_MODE: true,
    })

    render(<FlagDebugPanel />)

    // NEW_IFFY_SHELL and NEW_SYSTEM_MODE are ON (2 buttons)
    const onButtons = screen.getAllByText('ON')
    expect(onButtons.length).toBe(2)
    // All others are OFF (8 buttons)
    const offButtons = screen.getAllByText('OFF')
    expect(offButtons.length).toBe(8)
  })

  it('renders the Reset All button', () => {
    mockUseFeatureFlag.mockReturnValue(true)
    mockUseFeatureFlags.mockReturnValue({
      NEW_IFFY_SHELL: false,
      NEW_WORKSPACE_DEVELOP: false,
      NEW_WORKSPACE_VISUALIZE: false,
      NEW_WORKSPACE_CAST: false,
      NEW_WORKSPACE_PRODUCE: false,
      NEW_WORKSPACE_PACKAGE: false,
      NEW_WORKSPACE_DELIVER: false,
      NEW_INTELLIGENCE_LAYER: false,
      NEW_EXPERT_MODE: false,
      NEW_SYSTEM_MODE: true,
    })

    render(<FlagDebugPanel />)
    expect(screen.getByText('Reset All')).toBeTruthy()
  })
})

// ── Interaction Tests ────────────────────────────────────────────────────────

describe('FlagDebugPanel — Interactions', () => {
  it('toggle button click calls notifyFlagChange and writes to localStorage', () => {
    mockUseFeatureFlag.mockReturnValue(true)
    mockUseFeatureFlags.mockReturnValue({
      NEW_IFFY_SHELL: false,
      NEW_WORKSPACE_DEVELOP: false,
      NEW_WORKSPACE_VISUALIZE: false,
      NEW_WORKSPACE_CAST: false,
      NEW_WORKSPACE_PRODUCE: false,
      NEW_WORKSPACE_PACKAGE: false,
      NEW_WORKSPACE_DELIVER: false,
      NEW_INTELLIGENCE_LAYER: false,
      NEW_EXPERT_MODE: false,
      NEW_SYSTEM_MODE: true,
    })

    render(<FlagDebugPanel />)

    // Click the toggle for "New Shell" — find its button
    const shellRow = screen.getByText('New Shell').closest('div')!
    const toggleButton = shellRow.querySelector('button')!
    fireEvent.click(toggleButton)

    // Should have written to localStorage
    const stored = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}')
    expect(stored).toHaveProperty('NEW_IFFY_SHELL')
    expect(stored.NEW_IFFY_SHELL).toBe(true) // flipped from false

    // Should have called notifyFlagChange
    expect(mockNotifyFlagChange).toHaveBeenCalled()
  })

  it('toggle flips an enabled flag to false', () => {
    // Pre-populate localStorage so the toggle flips from true to false
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ NEW_IFFY_SHELL: true }))

    mockUseFeatureFlag.mockReturnValue(true)
    mockUseFeatureFlags.mockReturnValue({
      NEW_IFFY_SHELL: true,
      NEW_WORKSPACE_DEVELOP: false,
      NEW_WORKSPACE_VISUALIZE: false,
      NEW_WORKSPACE_CAST: false,
      NEW_WORKSPACE_PRODUCE: false,
      NEW_WORKSPACE_PACKAGE: false,
      NEW_WORKSPACE_DELIVER: false,
      NEW_INTELLIGENCE_LAYER: false,
      NEW_EXPERT_MODE: false,
      NEW_SYSTEM_MODE: true,
    })

    render(<FlagDebugPanel />)

    const shellRow = screen.getByText('New Shell').closest('div')!
    const toggleButton = shellRow.querySelector('button')!
    fireEvent.click(toggleButton)

    const stored = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}')
    expect(stored.NEW_IFFY_SHELL).toBe(false) // flipped from true
  })

  it('Reset All button clears localStorage and calls notifyFlagChange', () => {
    // Pre-populate localStorage with some overrides
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ NEW_IFFY_SHELL: true, NEW_WORKSPACE_DEVELOP: true }),
    )

    mockUseFeatureFlag.mockReturnValue(true)
    mockUseFeatureFlags.mockReturnValue({
      NEW_IFFY_SHELL: true,
      NEW_WORKSPACE_DEVELOP: true,
      NEW_WORKSPACE_VISUALIZE: false,
      NEW_WORKSPACE_CAST: false,
      NEW_WORKSPACE_PRODUCE: false,
      NEW_WORKSPACE_PACKAGE: false,
      NEW_WORKSPACE_DELIVER: false,
      NEW_INTELLIGENCE_LAYER: false,
      NEW_EXPERT_MODE: false,
      NEW_SYSTEM_MODE: true,
    })

    render(<FlagDebugPanel />)
    fireEvent.click(screen.getByText('Reset All'))

    // localStorage should be cleared
    expect(localStorage.getItem(LOCAL_STORAGE_KEY)).toBeNull()
    expect(mockNotifyFlagChange).toHaveBeenCalled()
  })
})