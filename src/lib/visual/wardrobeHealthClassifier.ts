/**
 * wardrobeHealthClassifier.ts — Canonical wardrobe intelligence health classification.
 *
 * IEL: This is the SOLE authority for wardrobe health labels.
 * "strong" is NEVER valid when profileDrivenCount is zero, collapse is active,
 * or all states are identical.
 *
 * Exported for direct unit testing and panel consumption.
 */

/**
 * classifyWardrobeHealth — deterministic health label from resolved state diagnostics.
 *
 * IEL TRIPWIRE: "strong" is NEVER valid when:
 *   - profileDrivenCount is zero
 *   - collapse is active
 *   - all states are identical (distinctArrays <= 1 for 3+ states)
 *   - fallbackCount >= profileDrivenCount
 */
export function classifyWardrobeHealth(
  profileDrivenCount: number,
  fallbackCount: number,
  totalReconstructed: number,
  totalStates: number,
  collapse: { collapsed: boolean; distinctArrays: number } | null,
): 'strong' | 'moderate' | 'weak' {
  // Absolute disqualifiers for "strong"
  if (profileDrivenCount === 0) return 'weak';
  if (collapse?.collapsed) return 'weak';
  if (totalStates >= 3 && collapse && collapse.distinctArrays <= 1) return 'weak';
  if (fallbackCount >= profileDrivenCount && fallbackCount > 0) return 'weak';

  // Strong requires meaningful differentiation
  const minDistinct = totalStates >= 4 ? Math.max(3, Math.ceil(totalStates / 2)) : 2;
  if (
    fallbackCount === 0 &&
    profileDrivenCount > 0 &&
    (!collapse || collapse.distinctArrays >= minDistinct)
  ) {
    return 'strong';
  }

  // Moderate: some profile-driven, not fully collapsed
  if (profileDrivenCount > 0 && profileDrivenCount > fallbackCount) return 'moderate';

  return 'weak';
}
