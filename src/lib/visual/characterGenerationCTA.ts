/**
 * characterGenerationCTA.ts — Canonical CTA resolver for character costume generation.
 *
 * Determines the correct generation action based on canonical lock-gap truth.
 * SINGLE SOURCE OF TRUTH for which generation button to show per character.
 *
 * IEL: This resolver is the ONLY place CTA logic should live.
 * UI components must consume this, never derive CTA state independently.
 *
 * Now driven entirely by CharacterLockGap — no coverage-level heuristics.
 */

import type { CharacterLockGap, CharacterLockDisplayStatus } from '@/lib/visual/characterLockGap';

// ── Types ──

export type CharacterCTAAction = 'generate_required' | 'complete_character' | 'none';

export interface CharacterGenerationCTA {
  /** Which action this CTA represents */
  action: CharacterCTAAction;
  /** Button label */
  label: string;
  /** Helper description */
  description: string;
  /** Whether the CTA should be rendered at all */
  visible: boolean;
  /** Whether the button should be enabled (may be disabled during builds) */
  enabled: boolean;
}

// ── Resolver ──

/**
 * Resolve the canonical generation CTA for a character.
 *
 * Decision tree (fail-closed), driven by lock-gap display status:
 * 1. blocked → none
 * 2. locked → none
 * 3. lock_ready → none (nothing to generate)
 * 4. generating → none (already in progress)
 * 5. needs_completion → complete_character
 * 6. needs_required → generate_required
 * 7. fallback → none
 */
export function resolveCharacterGenerationCTA(
  lockGap: CharacterLockGap,
  isBuildActive: boolean,
): CharacterGenerationCTA {
  const NONE: CharacterGenerationCTA = {
    action: 'none',
    label: '',
    description: '',
    visible: false,
    enabled: false,
  };

  const status = lockGap.display_status;

  // No CTA for blocked, locked, lock-ready, or generating
  if (status === 'blocked' || status === 'locked' || status === 'lock_ready' || status === 'generating') {
    return NONE;
  }

  // Needs completion: all states have sets but slots still have issues
  if (status === 'needs_completion') {
    return {
      action: 'complete_character',
      label: 'Complete Character',
      description: `Fill ${lockGap.blocking_slots.length} remaining slot(s) needed for lock`,
      visible: true,
      enabled: !isBuildActive,
    };
  }

  // Needs required: missing states or required slots
  if (status === 'needs_required') {
    return {
      action: 'generate_required',
      label: 'Generate Required',
      description: 'Create the minimum required slots',
      visible: true,
      enabled: !isBuildActive,
    };
  }

  // Fail-closed fallback
  return NONE;
}
