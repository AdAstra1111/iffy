/**
 * characterLockGap.ts — Canonical Lock Gap Resolver
 *
 * Single source of truth for:
 * - Whether a character is lockable
 * - Exactly what prevents lock
 * - Per-state, per-slot breakdown of issues
 * - Canonical display status for character cards
 *
 * ALL UI/CTA/lock logic must consume this resolver.
 * No component should independently determine lockability.
 *
 * IEL: This module is the ONLY place lock-gap truth is computed.
 */

import type { VisualSetSlot } from '@/hooks/useVisualSets';
import type { CharacterCoverage, CharacterBlockReason } from '@/hooks/useCostumeOnActor';
import { resolveSlotDisplayFromFields, type SlotLike } from './slotStateResolver';

// ── Issue Types ──

export type LockGapIssueType =
  | 'missing_state'       // No visual set exists for this state
  | 'missing_slot'        // Slot exists but has no candidate/image
  | 'unattempted'         // Slot has 0 attempts
  | 'identity_fail'       // Best candidate failed identity gate
  | 'continuity_fail'     // Best candidate failed continuity gate
  | 'rejected'            // Producer rejected candidate
  | 'below_threshold'     // Score below minimum viable
  | 'not_approved'        // Candidate exists but not yet approved
  | 'stale_epoch'         // Candidate from wrong epoch
  | 'no_admitted_candidate'; // Attempts made but no gate-admitted candidate

export interface LockGapIssue {
  type: LockGapIssueType;
  slot_key: string;
  slot_label: string;
  is_required: boolean;
  detail?: string;
}

export interface StateLockGap {
  state_key: string;
  state_label: string;
  has_set: boolean;
  is_locked: boolean;
  slots_total: number;
  slots_lock_ready: number;
  issues: LockGapIssue[];
}

export interface CharacterLockGap {
  character_key: string;
  character_name: string;
  lock_ready: boolean;
  display_status: CharacterLockDisplayStatus;
  blocking_states: string[];
  blocking_slots: LockGapIssue[];
  totals: {
    total_states: number;
    locked_states: number;
    total_required_slots: number;
    lock_ready_slots: number;
    missing_slots: number;
    unattempted_slots: number;
    failed_slots: number;
    rejected_slots: number;
    identity_failed_slots: number;
    continuity_failed_slots: number;
    not_approved_slots: number;
  };
  per_state: StateLockGap[];
}

export type CharacterLockDisplayStatus =
  | 'blocked'
  | 'needs_required'
  | 'needs_completion'
  | 'lock_ready'
  | 'locked'
  | 'generating';

// ── Resolver ──

export interface LockGapInput {
  coverage: CharacterCoverage;
  states: Array<{ state_key: string; label: string; explicit_or_inferred: 'explicit' | 'inferred' }>;
  slotsPerState: Record<string, VisualSetSlot[]>;
  setsPerState: Record<string, { id: string; status: string } | null>;
  isGenerating: boolean;
}

/**
 * resolveCharacterLockGap — Canonical lock-gap analysis at slot level.
 *
 * This is the SINGLE SOURCE OF TRUTH for:
 * - Is this character lockable?
 * - What exact slots/issues block lock?
 * - What display status should the card show?
 */
export function resolveCharacterLockGap(input: LockGapInput): CharacterLockGap {
  const { coverage, states, slotsPerState, setsPerState, isGenerating } = input;

  // ── Blocked characters ──
  if (coverage.readiness === 'blocked' || !coverage.isEligible) {
    return makeBlockedGap(coverage);
  }

  // ── Fully locked ──
  if (coverage.readiness === 'fully_locked') {
    return makeLockedGap(coverage, states);
  }

  // ── Analyze per-state, per-slot ──
  const perState: StateLockGap[] = [];
  const allIssues: LockGapIssue[] = [];
  let totalRequiredSlots = 0;
  let lockReadySlots = 0;
  let missingSlots = 0;
  let unattemptedSlots = 0;
  let failedSlots = 0;
  let rejectedSlots = 0;
  let identityFailedSlots = 0;
  let continuityFailedSlots = 0;
  let notApprovedSlots = 0;
  let lockedStates = 0;
  const blockingStates: string[] = [];

  for (const state of states) {
    const set = setsPerState[state.state_key];
    const slots = slotsPerState[state.state_key] || [];

    // No set exists for this state
    if (!set) {
      const issue: LockGapIssue = {
        type: 'missing_state',
        slot_key: '*',
        slot_label: state.label,
        is_required: true,
        detail: `No visual set created for ${state.label}`,
      };
      allIssues.push(issue);
      blockingStates.push(state.state_key);
      perState.push({
        state_key: state.state_key,
        state_label: state.label,
        has_set: false,
        is_locked: false,
        slots_total: 0,
        slots_lock_ready: 0,
        issues: [issue],
      });
      continue;
    }

    // Set is locked — no issues
    if (set.status === 'locked') {
      lockedStates++;
      perState.push({
        state_key: state.state_key,
        state_label: state.label,
        has_set: true,
        is_locked: true,
        slots_total: slots.length,
        slots_lock_ready: slots.length,
        issues: [],
      });
      continue;
    }

    // Analyze individual slots
    const stateIssues: LockGapIssue[] = [];
    let stateLockReady = 0;

    for (const slot of slots) {
      if (!slot.is_required) continue; // Only required slots block lock
      totalRequiredSlots++;

      const resolved = resolveSlotDisplayFromFields(slot as SlotLike);
      const convState = (slot.convergence_state || {}) as Record<string, any>;

      if (resolved.isLocked) {
        lockReadySlots++;
        stateLockReady++;
        continue;
      }

      if (resolved.isApproved) {
        lockReadySlots++;
        stateLockReady++;
        continue;
      }

      // Slot is NOT lock-ready — classify the issue
      const issue = classifySlotIssue(slot, resolved, convState);
      stateIssues.push(issue);
      allIssues.push(issue);

      // Count by type
      switch (issue.type) {
        case 'missing_slot': missingSlots++; break;
        case 'unattempted': unattemptedSlots++; break;
        case 'identity_fail': identityFailedSlots++; break;
        case 'continuity_fail': continuityFailedSlots++; break;
        case 'rejected': rejectedSlots++; break;
        case 'below_threshold': failedSlots++; break;
        case 'not_approved': notApprovedSlots++; break;
        case 'no_admitted_candidate': failedSlots++; break;
        default: failedSlots++; break;
      }
    }

    if (stateIssues.length > 0) {
      blockingStates.push(state.state_key);
    }

    perState.push({
      state_key: state.state_key,
      state_label: state.label,
      has_set: true,
      is_locked: false,
      slots_total: slots.filter(s => s.is_required).length,
      slots_lock_ready: stateLockReady,
      issues: stateIssues,
    });
  }

  const lockReady = allIssues.length === 0 && states.length > 0 &&
    perState.every(s => !s.has_set || s.is_locked || s.issues.length === 0) &&
    !perState.some(s => !s.has_set);

  // ── Display status ──
  let displayStatus: CharacterLockDisplayStatus;
  if (isGenerating) {
    displayStatus = 'generating';
  } else if (lockReady) {
    displayStatus = 'lock_ready';
  } else if (coverage.requiredReady || perState.every(s => s.has_set)) {
    // All states have sets but some slots still have issues
    displayStatus = 'needs_completion';
  } else {
    displayStatus = 'needs_required';
  }

  return {
    character_key: coverage.characterKey,
    character_name: coverage.characterName,
    lock_ready: lockReady,
    display_status: displayStatus,
    blocking_states: blockingStates,
    blocking_slots: allIssues,
    totals: {
      total_states: states.length,
      locked_states: lockedStates,
      total_required_slots: totalRequiredSlots,
      lock_ready_slots: lockReadySlots,
      missing_slots: missingSlots,
      unattempted_slots: unattemptedSlots,
      failed_slots: failedSlots,
      rejected_slots: rejectedSlots,
      identity_failed_slots: identityFailedSlots,
      continuity_failed_slots: continuityFailedSlots,
      not_approved_slots: notApprovedSlots,
    },
    per_state: perState,
  };
}

// ── Slot Issue Classifier ──

function classifySlotIssue(
  slot: VisualSetSlot,
  resolved: ReturnType<typeof resolveSlotDisplayFromFields>,
  convState: Record<string, any>,
): LockGapIssue {
  const attempts = slot.attempt_count ?? 0;
  const bestScore = slot.best_score ?? 0;
  const gateAdmitted = convState.gate_admitted;
  const gateStatus = convState.actor_identity_gate_status;
  const continuityStatus = convState.continuity_gate_status;

  // Empty with no attempts
  if (resolved.isEmpty && attempts === 0) {
    return {
      type: 'unattempted',
      slot_key: slot.slot_key,
      slot_label: slot.slot_label,
      is_required: !!slot.is_required,
      detail: 'Not yet attempted',
    };
  }

  // Empty with attempts but no viable candidate
  if (resolved.isEmpty && attempts > 0) {
    // Check if gate rejected
    if (gateAdmitted === false) {
      if (gateStatus === 'fail') {
        return {
          type: 'identity_fail',
          slot_key: slot.slot_key,
          slot_label: slot.slot_label,
          is_required: !!slot.is_required,
          detail: `Identity gate failed after ${attempts} attempt(s)`,
        };
      }
      if (continuityStatus === 'fail') {
        return {
          type: 'continuity_fail',
          slot_key: slot.slot_key,
          slot_label: slot.slot_label,
          is_required: !!slot.is_required,
          detail: `Continuity gate failed after ${attempts} attempt(s)`,
        };
      }
    }
    return {
      type: 'no_admitted_candidate',
      slot_key: slot.slot_key,
      slot_label: slot.slot_label,
      is_required: !!slot.is_required,
      detail: `${attempts} attempt(s), no admitted candidate`,
    };
  }

  // Has candidate but gate rejected
  if (gateAdmitted === false) {
    if (gateStatus === 'fail') {
      return {
        type: 'identity_fail',
        slot_key: slot.slot_key,
        slot_label: slot.slot_label,
        is_required: !!slot.is_required,
        detail: 'Best candidate failed identity gate',
      };
    }
    if (continuityStatus === 'fail') {
      return {
        type: 'continuity_fail',
        slot_key: slot.slot_key,
        slot_label: slot.slot_label,
        is_required: !!slot.is_required,
        detail: 'Best candidate failed continuity gate',
      };
    }
    return {
      type: 'rejected',
      slot_key: slot.slot_key,
      slot_label: slot.slot_label,
      is_required: !!slot.is_required,
      detail: 'Candidate rejected by gate',
    };
  }

  // Has candidate but not approved — most common case
  if (resolved.hasCandidateOrImage && !resolved.isApproved && !resolved.isLocked) {
    return {
      type: 'not_approved',
      slot_key: slot.slot_key,
      slot_label: slot.slot_label,
      is_required: !!slot.is_required,
      detail: 'Candidate present but not yet approved',
    };
  }

  // Fallback: missing slot
  return {
    type: 'missing_slot',
    slot_key: slot.slot_key,
    slot_label: slot.slot_label,
    is_required: !!slot.is_required,
  };
}

// ── Factory Helpers ──

function makeBlockedGap(coverage: CharacterCoverage): CharacterLockGap {
  return {
    character_key: coverage.characterKey,
    character_name: coverage.characterName,
    lock_ready: false,
    display_status: 'blocked',
    blocking_states: [],
    blocking_slots: [],
    totals: emptyTotals(),
    per_state: [],
  };
}

function makeLockedGap(
  coverage: CharacterCoverage,
  states: Array<{ state_key: string; label: string }>,
): CharacterLockGap {
  return {
    character_key: coverage.characterKey,
    character_name: coverage.characterName,
    lock_ready: true,
    display_status: 'locked',
    blocking_states: [],
    blocking_slots: [],
    totals: {
      ...emptyTotals(),
      total_states: states.length,
      locked_states: states.length,
    },
    per_state: states.map(s => ({
      state_key: s.state_key,
      state_label: s.label,
      has_set: true,
      is_locked: true,
      slots_total: 0,
      slots_lock_ready: 0,
      issues: [],
    })),
  };
}

function emptyTotals() {
  return {
    total_states: 0,
    locked_states: 0,
    total_required_slots: 0,
    lock_ready_slots: 0,
    missing_slots: 0,
    unattempted_slots: 0,
    failed_slots: 0,
    rejected_slots: 0,
    identity_failed_slots: 0,
    continuity_failed_slots: 0,
    not_approved_slots: 0,
  };
}

// ── Display Helpers ──

const DISPLAY_STATUS_CONFIG: Record<CharacterLockDisplayStatus, {
  label: string;
  variant: 'locked' | 'ready' | 'incomplete' | 'blocked' | 'generating';
}> = {
  blocked: { label: 'Blocked', variant: 'blocked' },
  needs_required: { label: 'Needs Required', variant: 'incomplete' },
  needs_completion: { label: 'Needs Completion', variant: 'incomplete' },
  lock_ready: { label: 'Lock Ready', variant: 'ready' },
  locked: { label: 'Fully Locked', variant: 'locked' },
  generating: { label: 'Generating', variant: 'generating' },
};

export function getDisplayStatusConfig(status: CharacterLockDisplayStatus) {
  return DISPLAY_STATUS_CONFIG[status];
}

/**
 * Format lock failure message from lock gap — slot-level detail.
 */
export function formatLockFailureMessage(gap: CharacterLockGap): string {
  if (gap.lock_ready) return '';

  const lines: string[] = ['Cannot lock character costume.', '', 'Blocking issues:'];

  for (const state of gap.per_state) {
    if (state.issues.length === 0) continue;
    const issueDescs = state.issues.map(i => {
      switch (i.type) {
        case 'missing_state': return `${i.slot_label} — no set created`;
        case 'missing_slot': return `${i.slot_label} — missing`;
        case 'unattempted': return `${i.slot_label} — not attempted`;
        case 'identity_fail': return `${i.slot_label} — identity gate failed`;
        case 'continuity_fail': return `${i.slot_label} — continuity gate failed`;
        case 'rejected': return `${i.slot_label} — rejected`;
        case 'below_threshold': return `${i.slot_label} — below score threshold`;
        case 'not_approved': return `${i.slot_label} — not approved`;
        case 'no_admitted_candidate': return `${i.slot_label} — no admitted candidate`;
        default: return `${i.slot_label} — ${i.type}`;
      }
    });
    lines.push(`• ${state.state_label}: ${issueDescs.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Format concise lock gap summary for character card.
 */
export function formatLockGapSummary(gap: CharacterLockGap): string[] {
  const items: string[] = [];
  const t = gap.totals;
  if (t.missing_slots > 0) items.push(`${t.missing_slots} missing`);
  if (t.unattempted_slots > 0) items.push(`${t.unattempted_slots} unattempted`);
  if (t.not_approved_slots > 0) items.push(`${t.not_approved_slots} not approved`);
  if (t.identity_failed_slots > 0) items.push(`${t.identity_failed_slots} identity failed`);
  if (t.continuity_failed_slots > 0) items.push(`${t.continuity_failed_slots} continuity failed`);
  if (t.rejected_slots > 0) items.push(`${t.rejected_slots} rejected`);
  if (t.failed_slots > 0) items.push(`${t.failed_slots} failed`);
  return items;
}
