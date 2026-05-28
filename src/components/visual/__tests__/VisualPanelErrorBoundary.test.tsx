/**
 * VisualPanelErrorBoundary — Error boundary component tests
 *
 * Focus on data contract / rendering behavior:
 * - renders children normally when no error
 * - catches errors and shows fallback UI
 * - compact and standard variants
 * - custom fallback override
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { VisualPanelErrorBoundary } from '../VisualPanelErrorBoundary';

// Error-throwing child as a class component (must extend Component to satisfy JSX type)
class ThrowingChild extends Component<{ message?: string }> {
  override render(): ReactNode {
    throw new Error(this.props.message || 'Test error');
  }
}

describe('VisualPanelErrorBoundary', () => {
  it('renders children normally when no error occurs', () => {
    render(
      <VisualPanelErrorBoundary>
        <div data-testid="child">Normal content</div>
      </VisualPanelErrorBoundary>,
    );
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(screen.getByText('Normal content')).toBeTruthy();
  });

  it('catches errors and shows fallback UI', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <VisualPanelErrorBoundary panelLabel="Test Panel">
        <ThrowingChild />
      </VisualPanelErrorBoundary>,
    );
    expect(screen.getByText('Test Panel')).toBeTruthy();
    expect(screen.getByText('Test error')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it('shows "Panel error" default label when panelLabel not provided', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <VisualPanelErrorBoundary>
        <ThrowingChild />
      </VisualPanelErrorBoundary>,
    );
    expect(screen.getByText('Panel error')).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it('uses custom fallback when provided', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <VisualPanelErrorBoundary fallback={<div data-testid="custom">Custom error UI</div>}>
        <ThrowingChild />
      </VisualPanelErrorBoundary>,
    );
    expect(screen.getByTestId('custom')).toBeTruthy();
    expect(screen.getByText('Custom error UI')).toBeTruthy();
    // The standard fallback should not render
    expect(screen.queryByRole('alert')).toBeFalsy();
    consoleSpy.mockRestore();
  });

  it('renders compact variant', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <VisualPanelErrorBoundary panelLabel="Compact Panel" compact>
        <ThrowingChild message="Something broke" />
      </VisualPanelErrorBoundary>,
    );
    expect(screen.getByText('Compact Panel')).toBeTruthy();
    expect(screen.getByText('Something broke')).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it('calls console.error with panel context on error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <VisualPanelErrorBoundary panelLabel="Hero Panel">
        <ThrowingChild />
      </VisualPanelErrorBoundary>,
    );
    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleSpy.mock.calls.some((call) =>
      call[0].includes('Hero Panel'),
    )).toBe(true);
    consoleSpy.mockRestore();
  });
});
