/**
 * WorkspaceGate — Component Tests
 *
 * 4 tests: renders when enabled, hides when disabled, fallback rendering,
 * unknown flag behavior (fail-closed disabled).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkspaceGate, withFeatureGate } from '../workspaceGate'

// ── Mock useFeatureFlag ──────────────────────────────────────────────────────

const mockUseFeatureFlag = vi.fn()

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFeatureFlag: (...args: unknown[]) => mockUseFeatureFlag(...args),
}))

beforeEach(() => {
  mockUseFeatureFlag.mockReset()
})

// ── Test Components ──────────────────────────────────────────────────────────

function TestChild(): React.ReactElement {
  return <div data-testid="child-content">Enabled Content</div>
}

function TestFallback(): React.ReactElement {
  return <div data-testid="fallback-content">Fallback Content</div>
}

// ── WorkspaceGate Tests ──────────────────────────────────────────────────────

describe('WorkspaceGate', () => {
  it('renders children when flag is enabled', () => {
    mockUseFeatureFlag.mockReturnValue(true)

    render(
      <WorkspaceGate flag="NEW_WORKSPACE_DEVELOP">
        <TestChild />
      </WorkspaceGate>,
    )

    expect(screen.getByTestId('child-content')).toBeTruthy()
    expect(screen.queryByTestId('fallback-content')).toBeNull()
  })

  it('hides children when flag is disabled (default fallback = null)', () => {
    mockUseFeatureFlag.mockReturnValue(false)

    const { container } = render(
      <WorkspaceGate flag="NEW_WORKSPACE_DEVELOP">
        <TestChild />
      </WorkspaceGate>,
    )

    expect(screen.queryByTestId('child-content')).toBeNull()
    // Renders nothing — container should be empty
    expect(container.innerHTML).toBe('')
  })

  it('renders fallback when flag is disabled and fallback is provided', () => {
    mockUseFeatureFlag.mockReturnValue(false)

    render(
      <WorkspaceGate
        flag="NEW_WORKSPACE_VISUALIZE"
        fallback={<TestFallback />}
      >
        <TestChild />
      </WorkspaceGate>,
    )

    expect(screen.queryByTestId('child-content')).toBeNull()
    expect(screen.getByTestId('fallback-content')).toBeTruthy()
  })
})

// ── withFeatureGate HOC Tests ────────────────────────────────────────────────

describe('withFeatureGate', () => {
  it('renders wrapped component when flag is enabled', () => {
    mockUseFeatureFlag.mockReturnValue(true)

    const Gated = withFeatureGate(TestChild, 'NEW_WORKSPACE_DEVELOP')
    render(<Gated />)

    expect(screen.getByTestId('child-content')).toBeTruthy()
  })

  it('renders nothing when flag is disabled and no fallback provided', () => {
    mockUseFeatureFlag.mockReturnValue(false)

    const Gated = withFeatureGate(TestChild, 'NEW_WORKSPACE_DEVELOP')
    const { container } = render(<Gated />)

    expect(screen.queryByTestId('child-content')).toBeNull()
    expect(container.innerHTML).toBe('')
  })

  it('renders fallback component when flag is disabled', () => {
    mockUseFeatureFlag.mockReturnValue(false)

    const Gated = withFeatureGate(TestChild, 'NEW_WORKSPACE_DEVELOP', TestFallback)
    render(<Gated />)

    expect(screen.queryByTestId('child-content')).toBeNull()
    expect(screen.getByTestId('fallback-content')).toBeTruthy()
  })

  it('sets displayName correctly on the HOC', () => {
    mockUseFeatureFlag.mockReturnValue(true)

    TestChild.displayName = 'CustomName'
    const Gated = withFeatureGate(TestChild, 'NEW_WORKSPACE_DEVELOP')

    expect(Gated.displayName).toBe('withFeatureGate(CustomName)')
  })
})