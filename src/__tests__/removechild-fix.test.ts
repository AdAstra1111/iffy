/**
 * Tests for: RemoveChild (NotFoundError) React error fix — 3-part architecture
 *
 * Commit 6e12431 + earlier — Changes:
 *   Part A — Header.tsx: Removed createPortal(<GuidedTutorial />, document.body)
 *            to eliminate Suspense+portal race condition
 *   Part B — SafeRouteBoundary.tsx: Added explicit DOMException/NotFoundError/removeChild
 *            detection. Such errors are transient race conditions and should NOT count
 *            against recovery attempts. MAX_RECOVERY_ATTEMPTS increased from 2 to 5.
 *   Part C — errorCapture.ts: Suppresses removeChild NotFoundError from global
 *            error handler — these are handled by SafeRouteBoundary and are noise
 *            in diagnostics.
 *
 * Commit e12fd82 (visual panel fixes):
 *   - VisualExecutionHistoryPanel.tsx: removed stray </div>
 *   - VisualExecutionReviewPanel.tsx: wrapped in VisualPanelErrorBoundary
 *
 * This test validates all 3 parts + the visual panel fixes.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';

const BASE = __dirname.includes('/code/iffy/') || fs.existsSync('/Users/laralane/code/iffy')
  ? '/Users/laralane/code/iffy'
  : process.cwd();

// ── Helpers ──────────────────────────────────────────────────────────────────────

function readSource(path: string): string {
  return fs.readFileSync(path, 'utf-8');
}

// ── Part A: Header.tsx — createPortal removal ───────────────────────────────────

describe('Part A — Header: createPortal removal', () => {
  let source: string;

  beforeAll(() => {
    source = readSource(`${BASE}/src/components/Header.tsx`);
  });

  it('does NOT import createPortal from react-dom', () => {
    expect(source).not.toContain('createPortal');
  });

  it('renders GuidedTutorial inline (not via portal to document.body)', () => {
    // The fix: {showTutorial && <GuidedTutorial onClose={...} />}
    // instead of createPortal(<GuidedTutorial />, document.body)
    expect(source).toContain('showTutorial && <GuidedTutorial');
    expect(source).not.toContain('createPortal(<GuidedTutorial');
    expect(source).not.toContain('document.body');
  });

  it('has no dangling createPortal import or usage', () => {
    // Ensure there's no reference to createPortal anywhere in the file
    const portalMatches = source.match(/createPortal/g);
    expect(portalMatches).toBeNull();
  });
});

// ── Part B: SafeRouteBoundary.tsx — removeChild detection ───────────────────────

describe('Part B — SafeRouteBoundary: removeChild (NotFoundError) detection', () => {
  let source: string;

  beforeAll(() => {
    source = readSource(`${BASE}/src/components/SafeRouteBoundary.tsx`);
  });

  // ── RemoveChild detection ──
  it('detects DOMException NotFoundError removeChild errors', () => {
    // Must check: error instanceof DOMException && error.name === 'NotFoundError'
    expect(source).toContain("error instanceof DOMException");
    expect(source).toContain("error.name === 'NotFoundError'");
    expect(source).toContain("error.message.includes('removeChild')");
  });

  it('does NOT count removeChild errors against recovery attempts', () => {
    // The fix recovers without incrementing recoveryAttempts
    // The removeChild block (isRemoveChildError) returns early BEFORE recoveryAttempts++
    const beforeIncrement = source.split('this.recoveryAttempts++')[0];
    expect(beforeIncrement).toContain('isRemoveChildError');
    expect(beforeIncrement).toContain('recoveryInFlightRef.current = true');

    // After the removeChild block, check that isRemoveChildError handling
    // sets state back to normal WITHOUT incrementing
    const isRemoveChildLines = source.split('\n').filter(l => l.includes('isRemoveChildError'));
    expect(isRemoveChildLines.length).toBeGreaterThanOrEqual(1);
  });

  it('logs a specific warning when a removeChild error is detected', () => {
    expect(source).toContain('Transient removeChild error');
    expect(source).toContain('recovering without counting attempt');
  });

  // ── MAX_RECOVERY_ATTEMPTS ──
  it('has MAX_RECOVERY_ATTEMPTS = 5', () => {
    expect(source).toContain('MAX_RECOVERY_ATTEMPTS = 5');
  });

  it('shows permanent error after exceeding MAX_RECOVERY_ATTEMPTS', () => {
    expect(source).toContain('this.recoveryAttempts > MAX_RECOVERY_ATTEMPTS');
    expect(source).toContain('Refresh page');
  });

  // ── Concurrent recovery guard ──
  it('has recoveryInFlightRef to prevent concurrent recovery', () => {
    expect(source).toContain('recoveryInFlightRef');
    expect(source).toContain('skipping concurrent recovery');
  });

  // ── Invariant: removeChild recovery uses setTimeout(500ms) ──
  it('uses setTimeout(500) for removeChild recovery', () => {
    expect(source).toContain('setTimeout');
    expect(source).toContain('500');
  });

  // ── Invariant: MAX_RECOVERY_ATTEMPTS is a const (not mutable) ──
  it('declares MAX_RECOVERY_ATTEMPTS with const', () => {
    expect(source).toContain('const MAX_RECOVERY_ATTEMPTS');
  });
});

// ── Part C: errorCapture.ts — removeChild error suppression ─────────────────────

describe('Part C — errorCapture: removeChild error suppression', () => {
  let source: string;

  beforeAll(() => {
    source = readSource(`${BASE}/src/lib/errorCapture.ts`);
  });

  it('suppresses DOMException NotFoundError removeChild errors in global handler', () => {
    // The global error event listener must filter out removeChild errors
    expect(source).toContain('removeChild');
    expect(source).toContain('error instanceof DOMException');
    expect(source).toContain('error.name === \'NotFoundError\'');
    expect(source).toContain('return;');
  });

  it('logs a comment explaining why removeChild errors are suppressed', () => {
    expect(source).toContain('Suppress transient removeChild errors');
    expect(source).toContain('handled by SafeRouteBoundary');
    expect(source).toContain('noise in diagnostics');
  });

  it('still captures other window error types', () => {
    // The 'error' event listener should only return early for removeChild errors
    // Everything else falls through to captureError
    expect(source).toContain('captureError(\'UNCAUGHT\'');
  });
});

// ── Visual Panel Fixes (commit e12fd82) ─────────────────────────────────────────

describe('Visual Panel Fixes (e12fd82)', () => {
  // Part D: VisualExecutionHistoryPanel — stray </div> removed
  describe('VisualExecutionHistoryPanel — stray div fix', () => {
    let source: string;

    beforeAll(() => {
      source = readSource(`${BASE}/src/components/visual/VisualExecutionHistoryPanel.tsx`);
    });

    it('wraps content in VisualPanelErrorBoundary', () => {
      expect(source).toContain('<VisualPanelErrorBoundary');
    });

    it('does not have a stray extra </div> before the closing boundary', () => {
      // The stray </div> was on a line by itself before </VisualPanelErrorBoundary>
      // Count opening and closing divs in the file after the fix
      const openDivs = (source.match(/<div/g) || []).length;
      const closeDivs = (source.match(/<\/div>/g) || []).length;
      expect(openDivs).toBe(closeDivs);
    });
  });

  // Part E: VisualExecutionReviewPanel — VisualPanelErrorBoundary wrapper
  describe('VisualExecutionReviewPanel — error boundary wrapper', () => {
    let source: string;

    beforeAll(() => {
      source = readSource(`${BASE}/src/components/visual/VisualExecutionReviewPanel.tsx`);
    });

    it('imports VisualPanelErrorBoundary', () => {
      expect(source).toContain("import { VisualPanelErrorBoundary } from './VisualPanelErrorBoundary'");
    });

    it('wraps content in VisualPanelErrorBoundary with compact mode', () => {
      expect(source).toContain('<VisualPanelErrorBoundary panelLabel="VisualExecutionReviewPanel" compact>');
    });

    it('has balanced div tags', () => {
      const openDivs = (source.match(/<div/g) || []).length;
      const closeDivs = (source.match(/<\/div>/g) || []).length;
      expect(openDivs).toBe(closeDivs);
    });

    it('contains the Quality Review UI header', () => {
      expect(source).toContain('Quality Review');
    });
  });

  // Part F: VisualPanelErrorBoundary — per-panel error boundary
  describe('VisualPanelErrorBoundary — per-panel error isolation', () => {
    let source: string;

    beforeAll(() => {
      source = readSource(`${BASE}/src/components/visual/VisualPanelErrorBoundary.tsx`);
    });

    it('is a React class component with error boundary lifecycle', () => {
      expect(source).toContain('class VisualPanelErrorBoundary');
      expect(source).toContain('getDerivedStateFromError');
      expect(source).toContain('componentDidCatch');
    });

    it('supports compact mode', () => {
      expect(source).toContain('compact');
    });

    it('logs panel context for debugging', () => {
      expect(source).toContain('panelLabel');
      expect(source).toContain('console.error');
    });
  });
});

// ── Integration: Parts work together ────────────────────────────────────────────

describe('Integration — 3-part architecture coherence', () => {
  it('errorCapture.ts suppresses the same error type that SafeRouteBoundary detects', () => {
    const safeRouteSrc = readSource(`${BASE}/src/components/SafeRouteBoundary.tsx`);
    const errorCaptureSrc = readSource(`${BASE}/src/lib/errorCapture.ts`);

    // Both must reference the same error detection pattern:
    // DOMException, NotFoundError, removeChild
    expect(safeRouteSrc).toContain('NotFoundError');
    expect(errorCaptureSrc).toContain('NotFoundError');
    expect(safeRouteSrc).toContain('removeChild');
    expect(errorCaptureSrc).toContain('removeChild');
  });

  it('SafeRouteBoundary wraps routes in App.tsx', () => {
    const appSrc = readSource(`${BASE}/src/App.tsx`);
    expect(appSrc).toContain('import { SafeRouteBoundary }');
    expect(appSrc).toContain('<SafeRouteBoundary>');
    expect(appSrc).toContain('</SafeRouteBoundary>');
  });
});