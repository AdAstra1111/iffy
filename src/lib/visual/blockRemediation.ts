/**
 * blockRemediation.ts — Canonical block-reason → remediation mapping.
 *
 * Single source of truth for:
 * - block reason → human label
 * - block reason → repair eligibility
 * - block reason → repair action descriptor
 *
 * No UI logic. No Supabase calls. Pure deterministic classification.
 */

import type { CharacterBlockReason } from '@/hooks/useCostumeOnActor';

export type RepairAction = 'reextract_wardrobe_profile';

export interface BlockRemediation {
  label: string;
  canAutoRepair: boolean;
  repairAction: RepairAction | null;
  repairLabel: string | null;
  repairDescription: string | null;
}

const REMEDIATION_MAP: Record<CharacterBlockReason, BlockRemediation> = {
  no_actor_binding: {
    label: 'No actor bound',
    canAutoRepair: false,
    repairAction: null,
    repairLabel: null,
    repairDescription: null,
  },
  no_actor_version: {
    label: 'No actor version pinned',
    canAutoRepair: false,
    repairAction: null,
    repairLabel: null,
    repairDescription: null,
  },
  no_wardrobe_profile: {
    label: 'No wardrobe profile extracted',
    canAutoRepair: true,
    repairAction: 'reextract_wardrobe_profile',
    repairLabel: 'Extract Wardrobe Profile',
    repairDescription: 'Run wardrobe extraction to generate a profile from canonical evidence.',
  },
  degraded_wardrobe_profile: {
    label: 'Wardrobe profile is degraded — re-extract required',
    canAutoRepair: true,
    repairAction: 'reextract_wardrobe_profile',
    repairLabel: 'Re-extract Wardrobe',
    repairDescription: 'Current profile contains placeholder values. Re-extraction will attempt to derive a valid profile from updated canon.',
  },
};

/**
 * Get the canonical remediation descriptor for a block reason.
 */
export function getBlockRemediation(reason: CharacterBlockReason | null | undefined): BlockRemediation | null {
  if (!reason) return null;
  return REMEDIATION_MAP[reason] || null;
}

/**
 * Check if a block reason supports auto-repair.
 */
export function isRepairAvailable(reason: CharacterBlockReason | null | undefined): boolean {
  const rem = getBlockRemediation(reason);
  return rem?.canAutoRepair ?? false;
}

/**
 * Get the human-readable label for a block reason.
 */
export function getBlockReasonLabel(reason: CharacterBlockReason | null | undefined): string {
  if (!reason) return 'Missing requirements';
  return REMEDIATION_MAP[reason]?.label || reason;
}
