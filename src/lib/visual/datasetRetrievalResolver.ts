/**
 * datasetRetrievalResolver — Canonical retrieval resolver for Location Visual Datasets.
 *
 * This is the authoritative downstream path used by prompt builders.
 * Handles: dataset lookup, freshness evaluation, slot mapping,
 * parent/child inheritance, and explicit provenance.
 *
 * No silent fallbacks. Every resolution returns explicit mode.
 */

import type { LocationVisualDataset, SlotKey } from '@/hooks/useLocationVisualDatasets';
import { getSlotTruth, buildPromptFromSlotTruth } from '@/hooks/useLocationVisualDatasets';
import { mapPDSlotToDatasetSlot, type DatasetSlotMappingResult } from './datasetSlotMapping';
import { evaluateFreshness } from './datasetCanonHash';
import { buildHierarchyPromptBlock, getHierarchyNegatives, type LocationHierarchyResult } from './locationHierarchy';

// ── Resolution Result ────────────────────────────────────────────────────────

export type DatasetResolutionMode =
  | 'fresh_dataset'
  | 'stale_dataset'
  | 'semantic_fallback'
  | 'unmapped_slot'
  | 'missing_dataset';

export interface DatasetResolutionResult {
  mode: DatasetResolutionMode;
  datasetId: string | null;
  canonLocationId: string | null;
  pdSlotKey: string;
  datasetSlotKey: SlotKey | null;
  freshnessStatus: 'fresh' | 'stale' | 'unknown' | null;
  sourceHash: string | null;

  /** Prompt blocks from structured dataset truth */
  promptBlocks: {
    primaryBlock: string;
    secondaryBlock: string;
    contextualBlock: string;
    forbiddenBlock: string;
    hierarchyBlock: string;
  } | null;
  negatives: string[];

  /** Inheritance notes */
  inheritanceApplied: boolean;
  inheritanceNotes: string | null;

  /** Fallback reason when dataset not used */
  fallbackReason: string | null;
}

// ── Non-Inheritable Traits ───────────────────────────────────────────────────

const DEFAULT_NON_INHERITABLE_TRAITS = ['occupation_trace', 'contextual_dressing'];

/**
 * Check if a trait should be inherited from parent to child.
 */
function isTraitInheritable(traitName: string, nonInheritable: string[]): boolean {
  return !nonInheritable.includes(traitName) && !DEFAULT_NON_INHERITABLE_TRAITS.includes(traitName);
}

// ── Merge parent truth into child ────────────────────────────────────────────

function mergeParentSlotTruth(
  childTruth: ReturnType<typeof getSlotTruth>,
  parentTruth: ReturnType<typeof getSlotTruth>,
  nonInheritable: string[],
  slotKey: SlotKey,
): ReturnType<typeof getSlotTruth> {
  // For slots that are structural/atmospheric, inherit parent primary/secondary truths
  // But never inherit occupation_trace or contextual_dressing specific items
  const isStructuralSlot = ['establishing', 'architectural_detail', 'surface_language'].includes(slotKey);
  const isAtmosphericSlot = ['atmosphere', 'time_variant'].includes(slotKey);

  if (!isStructuralSlot && !isAtmosphericSlot) return childTruth;

  // Check if occupation/contextual dressing inheritance is blocked
  const blockOccupation = !isTraitInheritable('occupation_trace', nonInheritable);
  const blockDressing = !isTraitInheritable('contextual_dressing', nonInheritable);

  // Merge secondary truths from parent (additive, not overriding)
  const mergedSecondary = [...(childTruth.secondary_truths || [])];
  for (const truth of parentTruth.secondary_truths || []) {
    if (!mergedSecondary.includes(truth)) {
      mergedSecondary.push(truth);
    }
  }

  // Merge hard negatives from parent
  const mergedNegatives = [...(childTruth.hard_negatives || [])];
  for (const neg of parentTruth.hard_negatives || []) {
    if (!mergedNegatives.includes(neg)) {
      mergedNegatives.push(neg);
    }
  }

  // Merge forbidden dominance from parent
  const mergedForbidden = [...(childTruth.forbidden_dominance || [])];
  if (blockOccupation && !mergedForbidden.includes('craft activity')) {
    mergedForbidden.push('craft activity', 'occupation tools');
  }
  if (blockDressing && !mergedForbidden.includes('workshop-specific dressing')) {
    mergedForbidden.push('workshop-specific dressing');
  }

  return {
    ...childTruth,
    secondary_truths: mergedSecondary,
    hard_negatives: mergedNegatives,
    forbidden_dominance: mergedForbidden,
  };
}

// ── Main Resolver ────────────────────────────────────────────────────────────

/**
 * Resolve dataset truth for a given PD slot.
 *
 * This is the canonical entry point for all dataset-driven prompt building.
 * Never returns silently — always provides explicit mode and provenance.
 */
export function resolveDatasetForSlot(params: {
  pdSlotKey: string;
  canonLocationId: string | null;
  datasets: LocationVisualDataset[];
  currentCanonHash: string | null;
  parentDataset?: LocationVisualDataset | null;
}): DatasetResolutionResult {
  const { pdSlotKey, canonLocationId, datasets, currentCanonHash, parentDataset } = params;

  // 1. Map PD slot to dataset slot
  const mapping = mapPDSlotToDatasetSlot(pdSlotKey);
  if (mapping.status === 'unmapped') {
    return {
      mode: 'unmapped_slot',
      datasetId: null,
      canonLocationId,
      pdSlotKey,
      datasetSlotKey: null,
      freshnessStatus: null,
      sourceHash: null,
      promptBlocks: null,
      negatives: [],
      inheritanceApplied: false,
      inheritanceNotes: null,
      fallbackReason: `PD slot '${pdSlotKey}' has no dataset mapping`,
    };
  }

  const datasetSlotKey = mapping.datasetSlotKey;

  // 2. Find dataset for this location
  if (!canonLocationId) {
    return {
      mode: 'missing_dataset',
      datasetId: null,
      canonLocationId: null,
      pdSlotKey,
      datasetSlotKey,
      freshnessStatus: null,
      sourceHash: null,
      promptBlocks: null,
      negatives: [],
      inheritanceApplied: false,
      inheritanceNotes: null,
      fallbackReason: 'No canon_location_id provided — cannot resolve dataset',
    };
  }

  const dataset = datasets.find(d => d.canon_location_id === canonLocationId && d.is_current);
  if (!dataset) {
    return {
      mode: 'missing_dataset',
      datasetId: null,
      canonLocationId,
      pdSlotKey,
      datasetSlotKey,
      freshnessStatus: null,
      sourceHash: null,
      promptBlocks: null,
      negatives: [],
      inheritanceApplied: false,
      inheritanceNotes: null,
      fallbackReason: `No current dataset found for canon_location_id=${canonLocationId}`,
    };
  }

  // 3. Evaluate freshness
  const freshness = currentCanonHash
    ? evaluateFreshness(dataset.source_canon_hash, currentCanonHash)
    : { status: 'unknown' as const, reason: 'No current hash available for comparison' };

  // 4. Get slot truth
  let slotTruth = getSlotTruth(dataset, datasetSlotKey);

  // 5. Apply parent inheritance if applicable
  let inheritanceApplied = false;
  let inheritanceNotes: string | null = null;

  if (dataset.inherits_from_parent && parentDataset) {
    const parentSlotTruth = getSlotTruth(parentDataset, datasetSlotKey);
    const nonInheritable = [
      ...(dataset.non_inheritable_traits || []),
      // Workshop/storage children always block occupation inheritance to parent
      ...(dataset.location_class === 'workshop' || dataset.location_class === 'storage'
        ? ['occupation_trace', 'contextual_dressing']
        : []),
    ];
    slotTruth = mergeParentSlotTruth(slotTruth, parentSlotTruth, nonInheritable, datasetSlotKey);
    inheritanceApplied = true;
    inheritanceNotes = `Inherited from parent dataset (${parentDataset.location_name}), non_inheritable: [${nonInheritable.join(', ')}]`;
  }

  // 6. Build prompt blocks
  const truth = buildPromptFromSlotTruth(
    // Create a temporary dataset-like object with merged truth
    { ...dataset, [`slot_${datasetSlotKey}`]: slotTruth } as LocationVisualDataset,
    datasetSlotKey,
  );

  const hasContent = truth.primaryBlock || truth.secondaryBlock || truth.contextualBlock || truth.forbiddenBlock;

  if (!hasContent) {
    return {
      mode: 'semantic_fallback',
      datasetId: dataset.id,
      canonLocationId,
      pdSlotKey,
      datasetSlotKey,
      freshnessStatus: freshness.status,
      sourceHash: dataset.source_canon_hash,
      promptBlocks: null,
      negatives: [],
      inheritanceApplied,
      inheritanceNotes,
      fallbackReason: `Dataset exists but slot '${datasetSlotKey}' has no content — falling back to semantic interpretation`,
    };
  }

  const mode: DatasetResolutionMode = freshness.status === 'stale' ? 'stale_dataset' : 'fresh_dataset';

  // Build hierarchy prompt block from dataset's socio-economic fields
  let hierarchyBlock = '';
  if (dataset.status_tier && dataset.material_hierarchy) {
    const h = {
      status_tier: dataset.status_tier,
      material_privilege: dataset.material_privilege || { allowed: [], restricted: [], signature: [] },
      craft_level: dataset.craft_level,
      density_profile: dataset.density_profile || { clutter: 'medium', object_density: 'balanced', negative_space: 'moderate' },
      spatial_intent: dataset.spatial_intent || { purpose: 'lived_in', symmetry: 'none', flow: 'organic' },
      material_hierarchy: dataset.material_hierarchy,
    } as LocationHierarchyResult;
    hierarchyBlock = buildHierarchyPromptBlock(h);
    const hierarchyNegatives = getHierarchyNegatives(h);
    truth.negatives = [...truth.negatives, ...hierarchyNegatives];
  }

  return {
    mode,
    datasetId: dataset.id,
    canonLocationId,
    pdSlotKey,
    datasetSlotKey,
    freshnessStatus: freshness.status,
    sourceHash: dataset.source_canon_hash,
    promptBlocks: {
      primaryBlock: truth.primaryBlock,
      secondaryBlock: truth.secondaryBlock,
      contextualBlock: truth.contextualBlock,
      forbiddenBlock: truth.forbiddenBlock,
      hierarchyBlock,
    },
    negatives: truth.negatives,
    inheritanceApplied,
    inheritanceNotes,
    fallbackReason: freshness.status === 'stale' ? freshness.reason : null,
  };
}

/**
 * Find the parent dataset for a given dataset, if applicable.
 */
export function findParentDataset(
  dataset: LocationVisualDataset,
  allDatasets: LocationVisualDataset[],
): LocationVisualDataset | null {
  if (!dataset.parent_location_id) return null;
  return allDatasets.find(d => d.id === dataset.parent_location_id && d.is_current) || null;
}

/**
 * Format resolution result as a log-friendly string for IEL.
 */
export function formatResolutionLog(result: DatasetResolutionResult): string {
  const parts = [
    `[LVD_RESOLVE] mode=${result.mode}`,
    `slot=${result.pdSlotKey}→${result.datasetSlotKey || 'unmapped'}`,
    `fresh=${result.freshnessStatus || 'n/a'}`,
    `dataset=${result.datasetId?.slice(0, 8) || 'none'}`,
  ];
  if (result.inheritanceApplied) parts.push('inheritance=yes');
  if (result.fallbackReason) parts.push(`reason="${result.fallbackReason}"`);
  return parts.join(' | ');
}
