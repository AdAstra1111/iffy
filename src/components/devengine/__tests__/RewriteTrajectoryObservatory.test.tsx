/**
 * RewriteTrajectoryObservatory.test.tsx — Tests for the Rewrite Trajectory Observatory.
 *
 * Covers:
 * 1. Loading state
 * 2. Error state with retry button wiring
 * 3. Empty state (no versions)
 * 4. Data state with all sections rendering
 * 5. Edge cases: missing documentId/projectId
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RewriteTrajectoryObservatory } from '@/components/devengine/RewriteTrajectoryObservatory';

// ── Mock the hook ────────────────────────────────────────────────────────────

const mockRefetch = vi.fn();

vi.mock('@/hooks/useRewriteTrajectory', () => ({
  useRewriteTrajectory: vi.fn(),
}));

import { useRewriteTrajectory } from '@/hooks/useRewriteTrajectory';
const mockUseRewriteTrajectory = useRewriteTrajectory as ReturnType<typeof vi.fn>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeData(overrides: Record<string, any> = {}) {
  return {
    versionTimeline: [
      {
        id: 'v1',
        versionNumber: 1,
        label: 'Draft',
        createdAt: '2025-01-01T00:00:00Z',
        triggerType: 'human_edit' as const,
        specificity: {
          entityCount: 10,
          nounCount: 15,
          avgWordLength: 5.2,
          lexicalDiversity: 0.75,
          specificityScore: 65,
        },
        charCount: 500,
      },
    ],
    convergenceTrajectory: [
      {
        id: 'c1',
        creativeScore: 70,
        greenlightScore: 65,
        gap: 5,
        trajectory: 'converging',
        createdAt: '2025-01-01T00:00:00Z',
        versionId: 'v1',
      },
    ],
    blockerEvolution: [
      {
        versionId: 'v1',
        versionNumber: 1,
        total: 2,
        resolved: 1,
        unresolved: 1,
        regressed: 0,
      },
    ],
    entropyMetrics: [
      {
        versionId: 'v1',
        versionNumber: 1,
        specificity: {
          entityCount: 10,
          nounCount: 15,
          avgWordLength: 5.2,
          lexicalDiversity: 0.75,
          specificityScore: 65,
        },
        changes: null,
      },
    ],
    riskIndicators: [],
    missingDataReport: [
      { section: 'versions', present: true, count: 1, note: '1 version(s) found.' },
      { section: 'convergence', present: true, count: 1, note: '1 convergence point(s) found.' },
      { section: 'notes', present: false, count: 0, note: 'No development notes found.' },
      { section: 'readiness', present: false, count: 0, note: 'No readiness score history found.' },
    ],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RewriteTrajectoryObservatory', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    documentId: 'doc-123',
    projectId: 'proj-456',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Loading state
  it('renders loading spinner when isLoading is true', () => {
    mockUseRewriteTrajectory.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mockRefetch,
    });

    render(<RewriteTrajectoryObservatory {...defaultProps} />);
    expect(screen.getByText('Loading trajectory data...')).toBeDefined();
  });

  // 2. Error state with retry button
  it('renders error state and retry button calls refetch', () => {
    mockUseRewriteTrajectory.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to fetch'),
      refetch: mockRefetch,
    });

    render(<RewriteTrajectoryObservatory {...defaultProps} />);
    
    expect(screen.getByText('Failed to load trajectory data.')).toBeDefined();
    
    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeDefined();
    
    fireEvent.click(retryButton);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  // 3. Empty state (no versions)
  it('renders empty state when data has no versions', () => {
    mockUseRewriteTrajectory.mockReturnValue({
      data: makeData({ versionTimeline: [] }),
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<RewriteTrajectoryObservatory {...defaultProps} />);
    
    expect(screen.getByText('No version data available.')).toBeDefined();
  });

  // 4. Data state — all sections render
  it('renders all sections when data is present', () => {
    mockUseRewriteTrajectory.mockReturnValue({
      data: makeData(),
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<RewriteTrajectoryObservatory {...defaultProps} />);

    // Main component renders
    expect(screen.getByText('Rewrite Trajectory Observatory')).toBeDefined();
    expect(screen.getByText('Read-only diagnostics dashboard')).toBeDefined();
    
    // Check sections exist (using text that's likely to be present)
    expect(screen.getByText('Version Timeline')).toBeDefined();
    expect(screen.getByText('Score Trajectory')).toBeDefined();
    expect(screen.getByText('Blocker Evolution')).toBeDefined();
    expect(screen.getByText('Entropy Metrics')).toBeDefined();
    expect(screen.getByText('Risk Indicators')).toBeDefined();
    
    // Check version data renders
    expect(screen.getByText('v1')).toBeDefined();
    expect(screen.getByText('Draft')).toBeDefined();
  });

  // 5. Edge: missing documentId — should show loading state
  it('handles undefined documentId gracefully', () => {
    mockUseRewriteTrajectory.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mockRefetch,
    });

    render(
      <RewriteTrajectoryObservatory
        {...defaultProps}
        documentId={undefined}
      />,
    );
    // Should show loading
    expect(screen.getByText('Loading trajectory data...')).toBeDefined();
  });
});