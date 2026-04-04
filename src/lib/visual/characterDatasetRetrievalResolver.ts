/**
 * characterDatasetRetrievalResolver — Canonical retrieval resolver for Character Visual Datasets.
 *
 * Authoritative downstream path for character identity prompt building.
 * Handles: dataset lookup, freshness evaluation, slot mapping, explicit provenance.
 *
 * No silent fallbacks. Every resolution returns explicit mode.
 */

import type { CharacterSlotKey } from './characterDatasetSlotMapping';
import { mapCastSlotToDatasetSlot } from './characterDatasetSlotMapping';
import { evaluateCharacterFreshness } from './characterDatasetCanonHash';

// ── Dataset Type (matches DB row) ────────────────────────────────────────────

export interface CharacterVisualDataset {
  id: string;
  project_id: string;
  canonical_character_id: string | null;
  ai_actor_id: string | null;
  dataset_version: number;
  canonical_name: string;
  source_mode: string;
  provenance: Record<string, string>;
  completeness_score: number;
  is_current: boolean;
  freshness_status: string;
  stale_reason: string | null;
  source_canon_hash: string | null;

  identity_type: string;
  age_band: string | null;
  sex_gender_presentation: string | null;
  ethnicity_ancestry_expression: string | null;
  cultural_context: string | null;
  beauty_mode: string | null;
  casting_labels: string[];
  reusable_scope: string;

  identity_core: any;
  proportion_silhouette: any;
  surface_identity: any;
  presence_behavior: any;
  lighting_response: any;
  styling_affinity: any;
  narrative_read: any;

  identity_invariants: any;
  allowed_variation: any;
  forbidden_drift: any;
  anti_confusion: any;
  validation_requirements: any;

  slot_portrait: any;
  slot_profile: any;
  slot_three_quarter: any;
  slot_full_body: any;
  slot_expression: any;
  slot_lighting_response: any;

  created_at: string;
  updated_at: string;
}

// ── Resolution Result ────────────────────────────────────────────────────────

export type CharacterDatasetResolutionMode =
  | 'fresh_dataset'
  | 'stale_dataset'
  | 'semantic_fallback'
  | 'unmapped_slot'
  | 'missing_dataset';

export interface CharacterDatasetResolutionResult {
  mode: CharacterDatasetResolutionMode;
  datasetId: string | null;
  characterName: string | null;
  castSlotKey: string;
  datasetSlotKey: CharacterSlotKey | null;
  freshnessStatus: 'fresh' | 'stale' | 'unknown' | null;
  sourceHash: string | null;

  promptBlocks: {
    primaryBlock: string;
    secondaryBlock: string;
    contextualBlock: string;
    forbiddenBlock: string;
    invariantsBlock: string;
  } | null;
  negatives: string[];

  fallbackReason: string | null;
}

// ── Slot Truth Retrieval ─────────────────────────────────────────────────────

const SLOT_FIELD_MAP: Record<CharacterSlotKey, string> = {
  portrait: 'slot_portrait',
  profile: 'slot_profile',
  three_quarter: 'slot_three_quarter',
  full_body: 'slot_full_body',
  expression: 'slot_expression',
  lighting_response: 'slot_lighting_response',
};

function getCharacterSlotTruth(dataset: CharacterVisualDataset, slotKey: CharacterSlotKey) {
  const field = SLOT_FIELD_MAP[slotKey];
  return (dataset as any)[field] || {
    primary_truths: [],
    secondary_truths: [],
    contextual: [],
    forbidden_drift: [],
    hard_negatives: [],
    notes: '',
  };
}

/**
 * Build prompt fragments from character slot truth.
 */
export function buildCharacterPromptFromSlotTruth(
  dataset: CharacterVisualDataset,
  slotKey: CharacterSlotKey,
): {
  primaryBlock: string;
  secondaryBlock: string;
  contextualBlock: string;
  forbiddenBlock: string;
  invariantsBlock: string;
  negatives: string[];
} {
  const truth = getCharacterSlotTruth(dataset, slotKey);
  const invariants = dataset.identity_invariants?.invariants || [];

  return {
    primaryBlock: truth.primary_truths?.length > 0
      ? `PRIMARY IDENTITY TRUTH: ${truth.primary_truths.join('; ')}`
      : '',
    secondaryBlock: truth.secondary_truths?.length > 0
      ? `SECONDARY IDENTITY: ${truth.secondary_truths.join('; ')}`
      : '',
    contextualBlock: truth.contextual?.length > 0
      ? `CONTEXTUAL: ${truth.contextual.join('; ')}`
      : '',
    forbiddenBlock: truth.forbidden_drift?.length > 0
      ? `FORBIDDEN DRIFT: ${truth.forbidden_drift.join('; ')}`
      : '',
    invariantsBlock: invariants.length > 0
      ? `IDENTITY INVARIANTS (must not change): ${invariants.join('; ')}`
      : '',
    negatives: truth.hard_negatives || [],
  };
}

// ── Main Resolver ────────────────────────────────────────────────────────────

/**
 * Resolve character dataset truth for a given cast/validation slot.
 */
export function resolveCharacterDatasetForSlot(params: {
  castSlotKey: string;
  characterName: string;
  datasets: CharacterVisualDataset[];
  currentCanonHash: string | null;
}): CharacterDatasetResolutionResult {
  const { castSlotKey, characterName, datasets, currentCanonHash } = params;

  // 1. Map cast slot to dataset slot
  const mapping = mapCastSlotToDatasetSlot(castSlotKey);
  if (mapping.status === 'unmapped') {
    return {
      mode: 'unmapped_slot',
      datasetId: null,
      characterName,
      castSlotKey,
      datasetSlotKey: null,
      freshnessStatus: null,
      sourceHash: null,
      promptBlocks: null,
      negatives: [],
      fallbackReason: `Cast slot '${castSlotKey}' has no character dataset mapping`,
    };
  }

  const datasetSlotKey = mapping.datasetSlotKey;

  // 2. Find dataset for this character
  const normName = characterName.toLowerCase().trim();
  const dataset = datasets.find(d =>
    d.canonical_name.toLowerCase().trim() === normName && d.is_current
  );

  if (!dataset) {
    return {
      mode: 'missing_dataset',
      datasetId: null,
      characterName,
      castSlotKey,
      datasetSlotKey,
      freshnessStatus: null,
      sourceHash: null,
      promptBlocks: null,
      negatives: [],
      fallbackReason: `No current dataset found for character '${characterName}'`,
    };
  }

  // 3. Evaluate freshness
  const freshness = currentCanonHash
    ? evaluateCharacterFreshness(dataset.source_canon_hash, currentCanonHash)
    : { status: 'unknown' as const, reason: 'No current hash available' };

  // 4. Build prompt blocks
  const truth = buildCharacterPromptFromSlotTruth(dataset, datasetSlotKey);
  const hasContent = truth.primaryBlock || truth.secondaryBlock || truth.invariantsBlock;

  if (!hasContent) {
    return {
      mode: 'semantic_fallback',
      datasetId: dataset.id,
      characterName,
      castSlotKey,
      datasetSlotKey,
      freshnessStatus: freshness.status,
      sourceHash: dataset.source_canon_hash,
      promptBlocks: null,
      negatives: [],
      fallbackReason: `Dataset exists but slot '${datasetSlotKey}' has no content`,
    };
  }

  const mode: CharacterDatasetResolutionMode = freshness.status === 'stale' ? 'stale_dataset' : 'fresh_dataset';

  return {
    mode,
    datasetId: dataset.id,
    characterName,
    castSlotKey,
    datasetSlotKey,
    freshnessStatus: freshness.status,
    sourceHash: dataset.source_canon_hash,
    promptBlocks: {
      primaryBlock: truth.primaryBlock,
      secondaryBlock: truth.secondaryBlock,
      contextualBlock: truth.contextualBlock,
      forbiddenBlock: truth.forbiddenBlock,
      invariantsBlock: truth.invariantsBlock,
    },
    negatives: truth.negatives,
    fallbackReason: freshness.status === 'stale' ? freshness.reason : null,
  };
}

/**
 * Format resolution result as a log-friendly string.
 */
export function formatCharacterResolutionLog(result: CharacterDatasetResolutionResult): string {
  const parts = [
    `[CVD_RESOLVE] mode=${result.mode}`,
    `slot=${result.castSlotKey}→${result.datasetSlotKey || 'unmapped'}`,
    `fresh=${result.freshnessStatus || 'n/a'}`,
    `dataset=${result.datasetId?.slice(0, 8) || 'none'}`,
    `character=${result.characterName || 'unknown'}`,
  ];
  if (result.fallbackReason) parts.push(`reason="${result.fallbackReason}"`);
  return parts.join(' | ');
}
