/**
 * characterDatasetSlotMapping — Centralized canonical mapping between
 * AI Cast / validation slot keys and Character Visual Dataset slot keys.
 *
 * Single source of truth for character slot routing.
 * Do NOT duplicate this mapping elsewhere.
 */

export type CharacterSlotKey =
  | 'portrait'
  | 'profile'
  | 'three_quarter'
  | 'full_body'
  | 'expression'
  | 'lighting_response';

// ── Cast/Validation Slot → Dataset Slot Mapping ─────────────────────────────

const CAST_TO_DATASET_SLOT: Record<string, CharacterSlotKey | null> = {
  // Identity slots
  identity_headshot: 'portrait',
  identity_profile: 'profile',
  identity_full_body: 'full_body',

  // Validation pack slots
  headshot: 'portrait',
  profile: 'profile',
  three_quarter: 'three_quarter',
  full_body: 'full_body',
  expression_neutral: 'expression',
  expression_intense: 'expression',
  expression_warm: 'expression',
  lighting_high_key: 'lighting_response',
  lighting_low_key: 'lighting_response',
  lighting_dramatic: 'lighting_response',

  // Screen test slots
  screen_test_headshot: 'portrait',
  screen_test_full_body: 'full_body',
  screen_test_profile: 'profile',

  // Convergence slots
  convergence_headshot: 'portrait',
  convergence_full_body: 'full_body',
  convergence_three_quarter: 'three_quarter',
};

export type CharacterDatasetSlotMappingResult =
  | { status: 'mapped'; datasetSlotKey: CharacterSlotKey }
  | { status: 'unmapped'; castSlotKey: string };

/**
 * Resolve a cast/validation slot key to a character dataset slot key.
 */
export function mapCastSlotToDatasetSlot(castSlotKey: string): CharacterDatasetSlotMappingResult {
  const mapped = CAST_TO_DATASET_SLOT[castSlotKey];
  if (mapped) {
    return { status: 'mapped', datasetSlotKey: mapped };
  }
  return { status: 'unmapped', castSlotKey };
}

/**
 * Get all cast slot keys that have dataset mappings.
 */
export function getAllMappedCastSlots(): string[] {
  return Object.entries(CAST_TO_DATASET_SLOT)
    .filter(([, v]) => v !== null)
    .map(([k]) => k);
}
