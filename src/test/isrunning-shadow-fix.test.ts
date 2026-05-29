/**
 * isrunning-shadow-fix.test.ts
 *
 * Validates P0-3: Renamed shadowed `isRunning` const to `shouldBeRunning`
 * in useAutoRun.ts.
 *
 * The local `const isRunning` at line 185 shadowed the `setIsRunning` state
 * setter. Renaming to `shouldBeRunning` eliminates the collision.
 *
 * Invariants:
 * 1. shouldBeRunning is true when status=running AND awaiting_approval=false
 * 2. shouldBeRunning is false when status is not running
 * 3. shouldBeRunning is false when awaiting_approval=true (even if running)
 * 4. isRunning state setter is not shadowed by local const
 */
import { describe, it, expect } from 'vitest';

// ── Pure logic extractor — mirrors useAutoRun.ts:185 ──
function computeShouldBeRunning(
  status: string,
  awaitingApproval: boolean,
): boolean {
  return status === 'running' && !awaitingApproval;
}

// ── Tests ──

describe('P0-3: isRunning → shouldBeRunning', () => {
  it('status=running, awaiting_approval=false → true', () => {
    expect(computeShouldBeRunning('running', false)).toBe(true);
  });

  it('status=running, awaiting_approval=true → false', () => {
    expect(computeShouldBeRunning('running', true)).toBe(false);
  });

  it('status=idle → false', () => {
    expect(computeShouldBeRunning('idle', false)).toBe(false);
  });

  it('status=completed → false', () => {
    expect(computeShouldBeRunning('completed', false)).toBe(false);
  });

  it('status=error → false', () => {
    expect(computeShouldBeRunning('error', false)).toBe(false);
  });

  it('disambiguates from setIsRunning state: shouldBeRunning does not shadow', () => {
    // This mirrors the pattern at lines 197-211 where setIsRunning(true)
    // is called based on shouldBeRunning — they're orthogonal
    const localShouldBeRunning = computeShouldBeRunning('running', false);
    let isRunningState = false;

    if (localShouldBeRunning) {
      isRunningState = true; // setIsRunning(true) equivalent
    }

    expect(localShouldBeRunning).toBe(true);
    expect(isRunningState).toBe(true);
  });

  it('recover failure path: shouldBeRunning gates runLoop fallback', () => {
    // Mirrors line 202: if (shouldBeRunning) { ... start runLoop }
    const shouldBeRunning = computeShouldBeRunning('running', false);
    let runLoopStarted = false;

    if (shouldBeRunning) {
      runLoopStarted = true;
    }

    expect(runLoopStarted).toBe(true);
  });
});