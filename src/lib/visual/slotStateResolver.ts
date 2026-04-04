/**
 * slotStateResolver.ts — Universal Visual Slot Truth Layer
 *
 * Canonical resolver and reconciler for visual_set_slots.
 * Raw slot.state is treated as a cache; the resolver computes
 * canonical display state from the union of slot fields + candidate rows.
 *
 * Precedence: locked > approved > candidate_present > needs_replacement > empty
 */

import { supabase } from '@/integrations/supabase/client';
import { isCandidateAdmitted, isProducerDecisionEligible } from './costumeIdentityGate';

// ── Types ──

export type CanonicalSlotDisplayState = 'locked' | 'approved' | 'candidate_present' | 'needs_replacement' | 'empty';

export interface ResolvedSlotState {
  display_state: CanonicalSlotDisplayState;
  best_candidate_id: string | null;
  candidate_count: number;
  best_score: number | null;
  attempt_count: number;
  last_fail_reason: string | null;
  is_historical_only: boolean;
  selected_image_id: string | null;
  approved_image_id: string | null;
  invariant_violations: string[];
}

export interface SlotLike {
  id: string;
  state: string;
  selected_image_id?: string | null;
  best_candidate_id?: string | null;
  best_score?: number | null;
  attempt_count?: number | null;
  convergence_state?: Record<string, unknown> | null;
  is_required?: boolean;
}

export interface CandidateLike {
  id: string;
  visual_set_slot_id: string;
  image_id: string;
  selected_for_slot: boolean;
  producer_decision: string;
  /** Gate admission payload — if present, used to filter non-admitted candidates */
  generation_config?: Record<string, unknown> | null;
}

// ── Pure Deterministic Resolver ──

/**
 * resolveVisualSlotState — Compute canonical display state from slot + candidates.
 *
 * RULE: A slot is NEVER empty if any viable candidate exists for that exact slot.
 * Viable = producer_decision NOT in ('rejected').
 */
export function resolveVisualSlotState(
  slot: SlotLike,
  candidates: CandidateLike[],
  activeRunId?: string | null,
): ResolvedSlotState {
  const violations: string[] = [];
  const rawState = slot.state as CanonicalSlotDisplayState;
  const convState = (slot.convergence_state || {}) as Record<string, any>;

  // Filter candidates for this exact slot
  const slotCandidates = candidates.filter(c => c.visual_set_slot_id === slot.id);
  // IDENTITY GATE + PRODUCER DECISION: Only candidates that pass both checks count as viable
  const viableCandidates = slotCandidates.filter(c =>
    isProducerDecisionEligible(c.producer_decision) && isCandidateAdmitted(c.generation_config)
  );
  const approvedCandidates = slotCandidates.filter(c => c.producer_decision === 'approved');
  const selectedCandidates = slotCandidates.filter(c =>
    c.selected_for_slot && isCandidateAdmitted(c.generation_config)
  );

  const candidateCount = viableCandidates.length;
  const bestCandidateId = slot.best_candidate_id || selectedCandidates[0]?.id || viableCandidates[0]?.id || null;
  const bestScore = slot.best_score ?? null;
  const attemptCount = slot.attempt_count ?? 0;
  const lastFailReason = (convState.last_fail_reason || convState.exhaustion_reason || null) as string | null;

  // Determine selected/approved image
  const selectedImageId = slot.selected_image_id || selectedCandidates[0]?.image_id || null;
  const approvedImageId = approvedCandidates[0]?.image_id || null;

  // Detect historical-only (no candidates from active run)
  const candidateRunId = convState.costume_run_id as string | undefined;
  const isHistoricalOnly = !!activeRunId && (!candidateRunId || candidateRunId !== activeRunId) && candidateCount > 0;

  // ── Resolve canonical display state with precedence ──

  let display_state: CanonicalSlotDisplayState;

  if (rawState === 'locked') {
    display_state = 'locked';
    // Invariant: locked slot must have selected image
    if (!selectedImageId) {
      violations.push(`IEL: Slot ${slot.id} is locked but has no selected_image_id`);
    }
  } else if (rawState === 'approved') {
    display_state = 'approved';
    if (!selectedImageId) {
      violations.push(`IEL: Slot ${slot.id} is approved but has no selected_image_id`);
    }
  } else if (
    candidateCount > 0 ||
    bestCandidateId ||
    selectedImageId
  ) {
    // KEY RULE: candidate/selected truth outranks stale empty state.
    // We intentionally honor reconciled slot cache here so UIs that only load
    // slot rows (and not candidate rows) still render candidate truth.
    display_state = 'candidate_present';

    // Invariant logging: raw state says empty but candidate truth exists
    if (rawState === 'empty') {
      const truthSource = selectedImageId
        ? 'selected_image_id'
        : bestCandidateId
          ? 'best_candidate_id'
          : `${candidateCount} viable candidate(s)`;
      violations.push(`IEL: Slot ${slot.id} raw state is 'empty' but ${truthSource} exists — correcting to candidate_present`);
    }
  } else if (rawState === 'candidate_present') {
    // RISK 4 HARDENING: raw state says candidate_present but NO viable candidates,
    // NO best_candidate_id, and NO selected_image_id back it up.
    // This is a stale cache — downgrade to empty and log violation.
    display_state = 'empty';
    violations.push(`IEL: Slot ${slot.id} cache says candidate_present but no viable candidate truth exists — downgrading to empty`);
  } else if (rawState === 'needs_replacement') {
    display_state = 'needs_replacement';
  } else {
    display_state = 'empty';
    // Invariant: if best_candidate_id is set but no candidates found
    if (slot.best_candidate_id) {
      violations.push(`IEL: Slot ${slot.id} has best_candidate_id=${slot.best_candidate_id} but no candidate rows found`);
    }
  }

  // Log violations
  for (const v of violations) {
    console.warn(`[SlotStateResolver] ${v}`);
  }

  return {
    display_state,
    best_candidate_id: bestCandidateId,
    candidate_count: candidateCount,
    best_score: bestScore,
    attempt_count: attemptCount,
    last_fail_reason: lastFailReason,
    is_historical_only: isHistoricalOnly,
    selected_image_id: selectedImageId,
    approved_image_id: approvedImageId,
    invariant_violations: violations,
  };
}

// ── Reconciler ──

/**
 * reconcileVisualSetSlot — Read slot + candidates from DB, compute canonical state,
 * write back reconciled cache fields. Fail-closed on impossible states.
 *
 * NEVER downgrades locked or approved states.
 */
export async function reconcileVisualSetSlot(slotId: string): Promise<ResolvedSlotState | null> {
  // Read slot
  const { data: slot, error: slotErr } = await (supabase as any)
    .from('visual_set_slots')
    .select('*')
    .eq('id', slotId)
    .maybeSingle();

  if (slotErr || !slot) {
    console.error(`[SlotReconciler] Failed to read slot ${slotId}:`, slotErr);
    return null;
  }

  // Read candidates for this exact slot
  const { data: candidates, error: candErr } = await (supabase as any)
    .from('visual_set_candidates')
    .select('*')
    .eq('visual_set_slot_id', slotId);

  if (candErr) {
    console.error(`[SlotReconciler] Failed to read candidates for slot ${slotId}:`, candErr);
    return null;
  }

  const resolved = resolveVisualSlotState(slot, candidates || []);

  // Only update if there's a meaningful delta
  const needsUpdate =
    slot.state !== resolved.display_state ||
    slot.best_candidate_id !== resolved.best_candidate_id ||
    (!slot.selected_image_id && resolved.selected_image_id);

  // NEVER downgrade locked/approved
  const safeState = (slot.state === 'locked' || slot.state === 'approved')
    ? slot.state
    : resolved.display_state;

  if (needsUpdate) {
    const patch: Record<string, any> = {
      state: safeState,
    };

    // Only update best_candidate_id if we have a better value
    if (resolved.best_candidate_id && !slot.best_candidate_id) {
      patch.best_candidate_id = resolved.best_candidate_id;
    }

    // Auto-select image if slot has none but candidates exist
    if (!slot.selected_image_id && resolved.selected_image_id && safeState !== 'locked') {
      patch.selected_image_id = resolved.selected_image_id;
    }

    const { error: updateErr } = await (supabase as any)
      .from('visual_set_slots')
      .update(patch)
      .eq('id', slotId);

    if (updateErr) {
      console.error(`[SlotReconciler] Failed to update slot ${slotId}:`, updateErr);
    } else if (resolved.invariant_violations.length > 0) {
      console.warn(`[SlotReconciler] Reconciled slot ${slotId}: ${slot.state} -> ${safeState} (${resolved.invariant_violations.length} violations corrected)`);
    }
  }

  return resolved;
}

/**
 * reconcileVisualSet — Reconcile all slots in a visual set.
 */
export async function reconcileVisualSet(setId: string): Promise<Map<string, ResolvedSlotState>> {
  const { data: slots } = await (supabase as any)
    .from('visual_set_slots')
    .select('id')
    .eq('visual_set_id', setId);

  const results = new Map<string, ResolvedSlotState>();

  if (!slots?.length) return results;

  for (const slot of slots) {
    const resolved = await reconcileVisualSetSlot(slot.id);
    if (resolved) {
      results.set(slot.id, resolved);
    }
  }

  return results;
}

// ── UI Helper ──

/**
 * resolveSlotDisplayFromFields — Pure helper for UI components.
 * Use when you already have slot data in memory and candidates loaded.
 * Avoids the need for separate DB reads.
 */
export function resolveSlotDisplayFromFields(slot: SlotLike, candidates?: CandidateLike[]): {
  displayState: CanonicalSlotDisplayState;
  hasCandidateOrImage: boolean;
  isEmpty: boolean;
  isApproved: boolean;
  isLocked: boolean;
} {
  const resolved = resolveVisualSlotState(slot, candidates || []);
  return {
    displayState: resolved.display_state,
    hasCandidateOrImage: resolved.display_state === 'candidate_present' || resolved.display_state === 'approved' || resolved.display_state === 'locked',
    isEmpty: resolved.display_state === 'empty' || resolved.display_state === 'needs_replacement',
    isApproved: resolved.display_state === 'approved',
    isLocked: resolved.display_state === 'locked',
  };
}
