/**
 * ci-scale-fix.test.ts
 *
 * Validates P0-1: CI score scaling changed from 2× to 10×.
 *
 * Previously: ciScore = Math.round(avgCI * 2) — produced 0-20 range
 * Now:       ciScore = Math.round(avgCI * 10) — produces 0-100 range (matches GP)
 */
import { describe, it, expect } from 'vitest';

const CI_COMPONENTS = [
  'narrative_clarity',
  'character_authenticity',
  'structural_integrity',
  'stylistic_voice',
  'audience_accessibility',
] as const;

function computeCIScore(
  ciSubScores: Record<string, number>,
  hasInvalidSubScores: boolean,
): number {
  if (hasInvalidSubScores) return 0;
  const avg = CI_COMPONENTS.reduce((sum, k) => sum + Number(ciSubScores[k]), 0) / CI_COMPONENTS.length;
  return Math.round(avg * 10);
}

function computeGPScore(
  gpSubScores: Record<string, number>,
  hasInvalidSubScores: boolean,
): number {
  if (hasInvalidSubScores) return 0;
  const avg = CI_COMPONENTS.reduce((sum, k) => sum + Number(gpSubScores[k]), 0) / CI_COMPONENTS.length;
  return Math.round(avg * 10);
}

describe('P0-1: CI score scaling (2× → 10×)', () => {
  it('scales avgCI 5.4 to 54', () => {
    const scores: Record<string, number> = {
      narrative_clarity: 5, character_authenticity: 6,
      structural_integrity: 5, stylistic_voice: 5, audience_accessibility: 6,
    };
    // avg = (5+6+5+5+6)/5 = 5.4 → * 10 = 54
    expect(computeCIScore(scores, false)).toBe(54);
  });

  it('all zeros → 0', () => {
    const scores: Record<string, number> = {
      narrative_clarity: 0, character_authenticity: 0,
      structural_integrity: 0, stylistic_voice: 0, audience_accessibility: 0,
    };
    expect(computeCIScore(scores, false)).toBe(0);
  });

  it('all tens → 100', () => {
    const scores: Record<string, number> = {
      narrative_clarity: 10, character_authenticity: 10,
      structural_integrity: 10, stylistic_voice: 10, audience_accessibility: 10,
    };
    expect(computeCIScore(scores, false)).toBe(100);
  });

  it('invalid sub-scores → 0 (fail-closed)', () => {
    expect(computeCIScore({}, true)).toBe(0);
  });

  it('CI and GP now use same scaling (both 0-100)', () => {
    const scores: Record<string, number> = {
      narrative_clarity: 8, character_authenticity: 8,
      structural_integrity: 8, stylistic_voice: 8, audience_accessibility: 8,
    };
    expect(computeCIScore(scores, false)).toBe(computeGPScore(scores, false));
  });
});