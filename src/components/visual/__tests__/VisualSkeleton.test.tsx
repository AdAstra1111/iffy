/**
 * VisualSkeleton — Loading skeleton component tests
 *
 * Tests that all 8 variants render without crashing
 * and respond to custom props.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { VisualSkeleton } from '../VisualSkeleton';

describe('VisualSkeleton', () => {
  it('renders panel variant by default', () => {
    const { container } = render(<VisualSkeleton />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders card variant', () => {
    const { container } = render(<VisualSkeleton variant="card" />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders list variant', () => {
    const { container } = render(<VisualSkeleton variant="list" count={3} />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders table-row variant', () => {
    const { container } = render(<VisualSkeleton variant="table-row" />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders text-block variant with custom lines', () => {
    const { container } = render(<VisualSkeleton variant="text-block" lines={5} />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders icon-badge variant', () => {
    const { container } = render(<VisualSkeleton variant="icon-badge" />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders image-grid variant', () => {
    const { container } = render(<VisualSkeleton variant="image-grid" />);
<<<<<<< Updated upstream
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
=======

    // Image grid defaults to count=3 from VisualSkeleton props (passed to ImageGridSkeleton)
    expect(container.querySelectorAll('.aspect-square').length).toBe(3);
  });

  it('renders image-grid variant with custom count', () => {
    const { container } = render(<VisualSkeleton variant="image-grid" count={3} />);

    expect(container.querySelectorAll('.aspect-square').length).toBe(3);
>>>>>>> Stashed changes
  });

  it('renders form variant', () => {
    const { container } = render(<VisualSkeleton variant="form" />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('accepts custom className', () => {
    const { container } = render(<VisualSkeleton className="custom-class" />);
    expect(container.querySelector('.custom-class')).toBeTruthy();
  });

  it('renders without crashing for all 8 variants', () => {
    const variants = ['panel', 'card', 'list', 'table-row', 'text-block', 'icon-badge', 'image-grid', 'form'] as const;
    for (const v of variants) {
      expect(() => render(<VisualSkeleton variant={v} />)).not.toThrow();
    }
  });
});
