/**
 * datasetSlotMapping — Centralized canonical mapping between PD slot keys
 * and Location Visual Dataset slot keys.
 *
 * This is the single source of truth for slot routing.
 * Do NOT duplicate this mapping in orchestrator, hook, or UI code.
 */

import type { SlotKey } from '@/hooks/useLocationVisualDatasets';

// ── PD Slot → Dataset Slot Mapping ──────────────────────────────────────────

/**
 * Maps a PD generation slot_key to the corresponding dataset SlotKey.
 * Returns null if the PD slot has no dataset mapping.
 */
const PD_TO_DATASET_SLOT: Record<string, SlotKey | null> = {
  // Location family slots
  establishing_wide: 'establishing',
  atmospheric: 'atmosphere',
  detail: 'architectural_detail',
  time_variant: 'time_variant',

  // Atmosphere family slots → atmosphere dataset
  atmosphere_primary: 'atmosphere',
  atmosphere_variant: 'atmosphere',
  lighting_study: 'atmosphere',

  // Surface language family slots → surface_language dataset
  texture_primary: 'surface_language',
  texture_detail: 'architectural_detail',
  texture_variant: 'surface_language',

  // Motif family slots → motif dataset
  motif_primary: 'motif',
  motif_variant: 'motif',
};

export type DatasetSlotMappingResult =
  | { status: 'mapped'; datasetSlotKey: SlotKey }
  | { status: 'unmapped'; pdSlotKey: string };

/**
 * Resolve a PD slot key to a dataset slot key.
 * Returns explicit status so callers never silently fall through.
 */
export function mapPDSlotToDatasetSlot(pdSlotKey: string): DatasetSlotMappingResult {
  const mapped = PD_TO_DATASET_SLOT[pdSlotKey];
  if (mapped) {
    return { status: 'mapped', datasetSlotKey: mapped };
  }
  return { status: 'unmapped', pdSlotKey };
}

/**
 * Get all PD slot keys that have dataset mappings.
 */
export function getAllMappedPDSlots(): string[] {
  return Object.entries(PD_TO_DATASET_SLOT)
    .filter(([, v]) => v !== null)
    .map(([k]) => k);
}
