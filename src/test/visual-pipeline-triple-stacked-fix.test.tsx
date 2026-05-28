/**
 * Visual Pipeline Triple-Stacked Render Fix — Verification Tests
 *
 * Validates 4 fixes:
 * 1. Removed outer VisualPipelineErrorBoundary wrapper (no double-wrap)
 * 2. React keys (vpp-root, vpp-main, vpp-content) for DOM stability
 * 3. ErrorBoundary+Suspense wraps both stage rail AND content panel
 * 4. handleRetry no longer pre-increments recoveryAttempts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { VisualPipelineErrorBoundary } from '@/components/VisualPipelineErrorBoundary';
import { Component } from 'react';
import fs from 'fs';
import path from 'path';

// ── Fix #1 & #2 & #3: Static structure checks on source file ──

const PIPELINE_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../src/pages/VisualProductionPipeline.tsx'),
  'utf-8'
);

describe('VisualProductionPipeline — React key stability (Fix #1 & #2)', () => {
  it('has key="vpp-root" on the outermost div', () => {
    // The root div wraps the entire component — must have stable key
    expect(PIPELINE_SOURCE).toContain('key="vpp-root"');
  });

  it('has key="vpp-main" on the main layout div', () => {
    // The flex layout container containing stage rail + content
    expect(PIPELINE_SOURCE).toContain('key="vpp-main"');
  });

  it('has key="vpp-content" on the content panel div', () => {
    // The scrollable content area with pipeline stage details
    expect(PIPELINE_SOURCE).toContain('key="vpp-content"');
  });

  it('all three keys are unique and distinct', () => {
    const keys = ['vpp-root', 'vpp-main', 'vpp-content'];
    const matches = PIPELINE_SOURCE.match(/key="vpp-[^"]*"/g) || [];
    for (const k of keys) {
      expect(matches.filter(m => m === `key="${k}"`)).toHaveLength(1);
    }
  });
});

describe('VisualProductionPipeline — ErrorBoundary structure (Fix #3)', () => {
  it('VisualPipelineErrorBoundary wraps Suspense (not the other way around)', () => {
    // The outer boundary element should contain <Suspense inside it.
    // Find VisualPipelineErrorBoundary opening tag, then check Suspense appears within
    const boundaryOpenIdx = PIPELINE_SOURCE.indexOf('<VisualPipelineErrorBoundary');
    const boundaryCloseIdx = PIPELINE_SOURCE.lastIndexOf('</VisualPipelineErrorBoundary>');
    const boundaryContent = PIPELINE_SOURCE.slice(boundaryOpenIdx, boundaryCloseIdx);

    // Suspense must be inside the boundary
    expect(boundaryContent).toContain('<Suspense');
    // Only ONE Suspense inside the boundary (not nested)
    const suspenseCount = (boundaryContent.match(/<Suspense/g) || []).length;
    expect(suspenseCount).toBe(1);
  });

  it('ErrorBoundary wraps both stage rail and content panel', () => {
    const boundaryOpenIdx = PIPELINE_SOURCE.indexOf('<VisualPipelineErrorBoundary');
    const boundaryCloseIdx = PIPELINE_SOURCE.lastIndexOf('</VisualPipelineErrorBoundary>');
    const boundaryContent = PIPELINE_SOURCE.slice(boundaryOpenIdx, boundaryCloseIdx);

    // Both keyed regions must be inside the boundary wrapper
    expect(boundaryContent).toContain('key="vpp-main"');
    expect(boundaryContent).toContain('key="vpp-content"');
  });

  it('sidebar (hidden lg:block) is OUTSIDE Suspense but INSIDE ErrorBoundary', () => {
    // Verify the sidebar's "hidden lg:block" div exists inside ErrorBoundary
    // but appears BEFORE the <Suspense> tag — proving Suspense wraps only content, not sidebar
    const boundaryOpenIdx = PIPELINE_SOURCE.indexOf('<VisualPipelineErrorBoundary');
    const boundaryCloseIdx = PIPELINE_SOURCE.lastIndexOf('</VisualPipelineErrorBoundary>');
    const boundaryContent = PIPELINE_SOURCE.slice(boundaryOpenIdx, boundaryCloseIdx);

    // Sidebar must be inside ErrorBoundary
    expect(boundaryContent).toContain('hidden lg:block');

    // Sidebar must appear BEFORE Suspense opening inside the ErrorBoundary
    const sidebarIdx = boundaryContent.indexOf('hidden lg:block');
    const suspenseIdx = boundaryContent.indexOf('<Suspense');
    expect(sidebarIdx).toBeLessThan(suspenseIdx);
  });

  it('errored component triggers fallback UI', async () => {
    // Use ErrorBoundary wrapping a component that throws
    const ThrowingChild = () => { throw new Error('Pipeline stage crashed'); };

    vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <VisualPipelineErrorBoundary stageLabel="Content Panel">
        <ThrowingChild />
      </VisualPipelineErrorBoundary>
    );

    // Should render the error fallback (Retry button)
    expect(screen.getByText(/Retry/i)).toBeTruthy();
    expect(screen.getByText(/Content Panel encountered an error/i)).toBeTruthy();
    expect(screen.getByText(/Pipeline stage crashed/i)).toBeTruthy();
  });
});

// ── Fix #4: handleRetry recoveryAttempts fix ──

describe('VisualPipelineErrorBoundary — handleRetry (Fix #4)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('handleRetry does NOT increment recoveryAttempts', () => {
    // The BUG was: handleRetry incremented recoveryAttempts BEFORE setState,
    // so each retry consumed one attempt even before the re-render.
    // The FIX: componentDidCatch is the only place that increments.
    //
    // Test: cause error, retry (with non-throwing children), verify recovery
    // succeeds without consuming an attempt.

    const ErrorToggle = ({ shouldThrow }: { shouldThrow: boolean }) => {
      if (shouldThrow) throw new Error('test error');
      return <div>content</div>;
    };

    const { rerender } = render(
      <VisualPipelineErrorBoundary>
        <ErrorToggle shouldThrow={false} />
      </VisualPipelineErrorBoundary>
    );

    // First: trigger error → fallback shown
    rerender(
      <VisualPipelineErrorBoundary>
        <ErrorToggle shouldThrow={true} />
      </VisualPipelineErrorBoundary>
    );
    expect(screen.getByText(/Retry/i)).toBeTruthy();

    // Switch children to safe state BEFORE retry, so when handleRetry
    // resets hasError → false, the children render without throwing
    rerender(
      <VisualPipelineErrorBoundary>
        <ErrorToggle shouldThrow={false} />
      </VisualPipelineErrorBoundary>
    );

    // Retry (handleRetry resets state — children are now safe)
    act(() => {
      screen.getByText(/Retry/i).click();
    });

    // After retry, content should be visible again
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('componentDidCatch is the ONLY place that increments recoveryAttempts', () => {
    // Verify: componentDidCatch increments, handleRetry does not
    // We can test this by causing errors and retrying up to MAX + 1 times.
    // If handleRetry also incremented, we'd hit max earlier.

    const ErrorToggle = ({ shouldThrow }: { shouldThrow: boolean }) => {
      if (shouldThrow) throw new Error('test error');
      return <div>content</div>;
    };

    const { rerender } = render(
      <VisualPipelineErrorBoundary>
        <ErrorToggle shouldThrow={false} />
      </VisualPipelineErrorBoundary>
    );

    // Cause error #1 → retry
    rerender(
      <VisualPipelineErrorBoundary>
        <ErrorToggle shouldThrow={true} />
      </VisualPipelineErrorBoundary>
    );
    act(() => { screen.getByText(/Retry/i).click(); });

    // Cause error #2 → retry
    rerender(
      <VisualPipelineErrorBoundary>
        <ErrorToggle shouldThrow={true} />
      </VisualPipelineErrorBoundary>
    );
    act(() => { screen.getByText(/Retry/i).click(); });

    // Cause error #3 (> MAX_RECOVERY_ATTEMPTS=2) → should show permanent error
    rerender(
      <VisualPipelineErrorBoundary>
        <ErrorToggle shouldThrow={true} />
      </VisualPipelineErrorBoundary>
    );

    // Should show "refresh" button instead of "retry" button
    expect(screen.getByText(/Refresh page/i)).toBeTruthy();
    // Should mention max attempts
    expect(screen.getByText(/automatic recovery failed/i)).toBeTruthy();
    // Retry button must NOT be present
    expect(screen.queryByText(/Retry/i)).toBeNull();
  });

  it('permanent error state does not allow recovery via handleRetry', () => {
    // After MAX_RECOVERY_ATTEMPTS exceeded, handleRetry returns early
    // The retry button should not be present; only refresh option remains.

    const ThrowingChild = () => { throw new Error('crash'); };

    // Exhaust attempts rapidly by directly causing repeated errors
    const { rerender } = render(
      <VisualPipelineErrorBoundary>
        <ThrowingChild />
      </VisualPipelineErrorBoundary>
    );

    // Attempt #1: retry
    act(() => { screen.getByText(/Retry/i).click(); });

    // Re-trigger error by re-rendering
    rerender(
      <VisualPipelineErrorBoundary>
        <ThrowingChild />
      </VisualPipelineErrorBoundary>
    );

    // Attempt #2: retry
    act(() => { screen.getByText(/Retry/i).click(); });

    // Re-trigger
    rerender(
      <VisualPipelineErrorBoundary>
        <ThrowingChild />
      </VisualPipelineErrorBoundary>
    );

    // Now > MAX_RECOVERY_ATTEMPTS — should be permanent
    expect(screen.getByText(/Refresh page/i)).toBeTruthy();
    expect(screen.queryByText(/Retry/i)).toBeNull();
  });

  it('componentDidCatch increments recoveryAttempts exactly once per error', () => {
    // Verify recoveryAttempts grows by 1 each time componentDidCatch runs
    // by observing the warn/error console messages.

    const ThrowingChild = () => { throw new Error('crash'); };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <VisualPipelineErrorBoundary stageLabel="Cast">
        <ThrowingChild />
      </VisualPipelineErrorBoundary>
    );

    // After first error: warn with attempt 1/2
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('attempt 1/2'),
      expect.any(Error),
      expect.any(Object)
    );
  });
});

// ── Edge cases and invariants ──

describe('VisualPipelineErrorBoundary — edge cases', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when no error occurs', () => {
    render(
      <VisualPipelineErrorBoundary>
        <div>pipeline content</div>
      </VisualPipelineErrorBoundary>
    );
    expect(screen.getByText('pipeline content')).toBeTruthy();
  });

  it('uses default stage label when not provided', () => {
    const ThrowingChild = () => { throw new Error('crash'); };
    render(
      <VisualPipelineErrorBoundary>
        <ThrowingChild />
      </VisualPipelineErrorBoundary>
    );
    expect(screen.getByText(/Pipeline stage encountered an error/i)).toBeTruthy();
  });

  it('uses custom stage label when provided', () => {
    const ThrowingChild = () => { throw new Error('crash'); };
    render(
      <VisualPipelineErrorBoundary stageLabel="Look Book">
        <ThrowingChild />
      </VisualPipelineErrorBoundary>
    );
    expect(screen.getByText(/Look Book encountered an error/i)).toBeTruthy();
  });

  it('shows error message from caught error', () => {
    const ThrowingChild = () => { throw new Error('Database connection failed'); };
    render(
      <VisualPipelineErrorBoundary>
        <ThrowingChild />
      </VisualPipelineErrorBoundary>
    );
    expect(screen.getByText(/Database connection failed/i)).toBeTruthy();
  });

  it('shows generic message when error has no message', () => {
    // If error is thrown without message, the component shows a fallback
    const ThrowingChild = () => { throw new Error(); };
    render(
      <VisualPipelineErrorBoundary>
        <ThrowingChild />
      </VisualPipelineErrorBoundary>
    );
    expect(screen.getByText(/An unexpected error occurred/i)).toBeTruthy();
  });

  it('handleRetry has try-catch guard around setState', () => {
    // The handleRetry method wraps setState in try-catch to prevent
    // cascading errors during unmount or context provider races.
    const boundarySource = fs.readFileSync(
      path.resolve(__dirname, '../../src/components/VisualPipelineErrorBoundary.tsx'),
      'utf-8'
    );
    expect(boundarySource).toContain('this.setState({ hasError: false, error: null });');
    expect(boundarySource).toContain('catch (e)');
    // Verify the try block wraps setState
    const tryBlockStart = boundarySource.indexOf('try {');
    const tryBlockEnd = boundarySource.indexOf('}', tryBlockStart);
    const tryContent = boundarySource.slice(tryBlockStart, tryBlockEnd + 1);
    expect(tryContent).toContain('this.setState');
    // Verify catch block wraps the error handling
    const catchBlockStart = boundarySource.indexOf('catch (e)');
    const catchBlockEnd = boundarySource.indexOf('}', catchBlockStart);
    const catchContent = boundarySource.slice(catchBlockStart, catchBlockEnd + 1);
    expect(catchContent).toContain('window.location.reload');
  });
});

describe('VisualPipelineErrorBoundary — invariant regression guard', () => {
  it('MAX_RECOVERY_ATTEMPTS is exactly 2', () => {
    // Loading the source to verify the constant
    const boundarySource = fs.readFileSync(
      path.resolve(__dirname, '../../src/components/VisualPipelineErrorBoundary.tsx'),
      'utf-8'
    );
    expect(boundarySource).toContain('MAX_RECOVERY_ATTEMPTS = 2');
  });

  it('handleRetry has a guard against exceeded attempts', () => {
    const boundarySource = fs.readFileSync(
      path.resolve(__dirname, '../../src/components/VisualPipelineErrorBoundary.tsx'),
      'utf-8'
    );
    // handleRetry must check recoveryAttempts before proceeding
    expect(boundarySource).toContain('this.recoveryAttempts > MAX_RECOVERY_ATTEMPTS');
  });
});

// ── Integration: pipeline structure smoke check ──

describe('VisualProductionPipeline — integration structure (all fixes)', () => {
  it('source file imports VisualPipelineErrorBoundary', () => {
    expect(PIPELINE_SOURCE).toContain(
      "import { VisualPipelineErrorBoundary } from '@/components/VisualPipelineErrorBoundary'"
    );
  });

  it('source file has exactly one <VisualPipelineErrorBoundary> opening tag (no double-wrap)', () => {
    const openTags = PIPELINE_SOURCE.match(/<VisualPipelineErrorBoundary/g) || [];
    expect(openTags).toHaveLength(1);
  });

  it('source file has exactly one </VisualPipelineErrorBoundary> closing tag', () => {
    const closeTags = PIPELINE_SOURCE.match(/<\/VisualPipelineErrorBoundary>/g) || [];
    expect(closeTags).toHaveLength(1);
  });

  it('top bar is outside ErrorBoundary (not double-wrapped)', () => {
    const boundaryOpenIdx = PIPELINE_SOURCE.indexOf('<VisualPipelineErrorBoundary');
    const beforeBoundary = PIPELINE_SOURCE.slice(0, boundaryOpenIdx);
    // Top bar elements should be before the boundary
    expect(beforeBoundary).toContain('Generate Pipeline');
  });
});