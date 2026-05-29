/**
 * PosterPanel.test.tsx — Tests for Poster Candidates workspace.
 *
 * Covers:
 * 1. Loading state: VisualSkeleton rendered while data fetches
 * 2. Empty state: VisualEmptyState when no candidates exist
 * 3. Data state: candidate card grid rendered
 * 4. Typography: heading and description present
 * 5. Button label reflects state (no candidates vs re-select)
 * 6. Candidate badge shows rank position
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PosterPanel } from '@/components/visual/PosterPanel';

// ── Mock React Query ────────────────────────────────────────────────────────

const mockUseQuery = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: any[]) => mockUseQuery(...args),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// ── Mock toast ──────────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

// ── Mock supabase ───────────────────────────────────────────────────────────

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {},
}));

// ── Poster candidate factory ────────────────────────────────────────────────

function makeCandidate(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: 'candidate-1',
    source_image_id: 'img-1',
    project_id: 'proj-1',
    rank_position: 1,
    total_score: 87,
    status: 'candidate',
    score_json: { composition: 90, lighting: 85, framing: 86 },
    image: {
      id: 'img-1',
      signedUrl: 'https://example.com/poster.png',
      width: 1200,
      height: 1800,
    },
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('PosterPanel', () => {
  it('renders VisualSkeleton in loading state', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    const { container } = render(<PosterPanel projectId="proj-1" />);

    // VisualSkeleton has role="status" and aria-label="Loading"
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('renders heading and description text', () => {
    mockUseQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    render(<PosterPanel projectId="proj-1" />);

    expect(screen.getByText('Poster Candidates')).toBeTruthy();
    expect(
      screen.getByText(/Top commercially viable images selected from governed pools/),
    ).toBeTruthy();
  });

  it('renders VisualEmptyState when candidates array is empty', () => {
    mockUseQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    render(<PosterPanel projectId="proj-1" />);

    expect(screen.getByText('No poster candidates yet')).toBeTruthy();
    // "Select Poster Candidates" appears in both button and description text
    expect(screen.getAllByText(/Select Poster Candidates/).length).toBeGreaterThanOrEqual(2);
  });

  it('renders candidate cards when data is present', () => {
    const candidates = [
      makeCandidate({ id: 'c-1', rank_position: 1, total_score: 92 }),
      makeCandidate({ id: 'c-2', rank_position: 2, total_score: 85 }),
    ];

    mockUseQuery.mockReturnValue({
      data: candidates,
      isLoading: false,
      error: null,
    });

    render(<PosterPanel projectId="proj-1" />);

    // Each candidate shows its rank and score
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('#2')).toBeTruthy();
    expect(screen.getByText('Score: 92')).toBeTruthy();
    expect(screen.getByText('Score: 85')).toBeTruthy();
  });

  it('renders score badges from score_json for each candidate', () => {
    const candidates = [
      makeCandidate({
        id: 'c-1',
        score_json: { composition: 95, lighting: 88 },
      }),
    ];

    mockUseQuery.mockReturnValue({
      data: candidates,
      isLoading: false,
      error: null,
    });

    render(<PosterPanel projectId="proj-1" />);

    // Badge labels from score_json keys
    expect(screen.getByText('composition: 95')).toBeTruthy();
    expect(screen.getByText('lighting: 88')).toBeTruthy();
  });

  it('uses grid layout with one column per candidate', () => {
    const candidates = [
      makeCandidate({ id: 'c-1', rank_position: 1 }),
      makeCandidate({ id: 'c-2', rank_position: 2 }),
      makeCandidate({ id: 'c-3', rank_position: 3 }),
    ];

    mockUseQuery.mockReturnValue({
      data: candidates,
      isLoading: false,
      error: null,
    });

    const { container } = render(<PosterPanel projectId="proj-1" />);

    // Grid container should have grid-cols-1 md:grid-cols-3
    const grid = container.querySelector('.grid');
    expect(grid).toBeTruthy();
    expect(grid?.className).toContain('grid-cols-1');
    expect(grid?.className).toContain('md:grid-cols-3');
  });

  it('handles candidate with missing image (no signedUrl)', () => {
    const candidates = [
      makeCandidate({
        id: 'c-1',
        image: { id: 'img-1', signedUrl: null },
      }),
    ];

    mockUseQuery.mockReturnValue({
      data: candidates,
      isLoading: false,
      error: null,
    });

    const { container } = render(<PosterPanel projectId="proj-1" />);

    // Should render placeholder icon instead of img
    expect(screen.getByText('#1')).toBeTruthy();
    // The candidate still renders without image crash
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders button with correct label when no candidates exist', () => {
    mockUseQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    render(<PosterPanel projectId="proj-1" />);

    // Button text changes when no candidates exist
    expect(screen.getByText('Select Poster Candidates')).toBeTruthy();
  });

  it('renders button with Re-select label when candidates exist', () => {
    mockUseQuery.mockReturnValue({
      data: [makeCandidate()],
      isLoading: false,
      error: null,
    });

    render(<PosterPanel projectId="proj-1" />);

    // Button text changes when candidates exist
    expect(screen.getByText('Re-select')).toBeTruthy();
  });
});