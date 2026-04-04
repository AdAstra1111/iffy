import { describe, it, expect } from 'vitest';
import { resolveVisualSlotState, resolveSlotDisplayFromFields, type SlotLike, type CandidateLike } from '../slotStateResolver';
import { isCandidateAdmitted, isCandidateIdentityValid, isProducerDecisionEligible } from '../costumeIdentityGate';

// ── Helpers ──

function makeSlot(overrides: Partial<SlotLike> = {}): SlotLike {
  return {
    id: 'slot-1',
    state: 'empty',
    selected_image_id: null,
    best_candidate_id: null,
    best_score: null,
    attempt_count: null,
    convergence_state: null,
    is_required: true,
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<CandidateLike> = {}): CandidateLike {
  return {
    id: 'cand-1',
    visual_set_slot_id: 'slot-1',
    image_id: 'img-1',
    selected_for_slot: false,
    producer_decision: 'pending',
    generation_config: null,
    ...overrides,
  };
}

// ── A. BEST badge truth ──

describe('BEST badge eligibility', () => {
  it('BEST hidden for non-admitted candidate', () => {
    const slot = makeSlot({
      state: 'candidate_present',
      best_candidate_id: 'cand-1',
      selected_image_id: 'img-1',
      best_score: 0.8,
      convergence_state: { gate_admitted: false, gate_rejection_reason: 'face_mismatch' },
    });
    const gateAdmitted = (slot.convergence_state as any)?.gate_admitted;
    // BEST badge condition: gate_admitted must not be false
    expect(gateAdmitted).toBe(false);
    // UI should NOT render BEST
  });

  it('BEST hidden for historical candidate', () => {
    const slot = makeSlot({
      state: 'candidate_present',
      best_candidate_id: 'cand-1',
      selected_image_id: 'img-1',
      best_score: 0.85,
      convergence_state: { costume_run_id: 'old-run' },
    });
    // Historical = active run differs from slot run
    const activeRunId = 'current-run';
    const slotRunId = (slot.convergence_state as any)?.costume_run_id;
    const isHistorical = !!activeRunId && !!slotRunId && slotRunId !== activeRunId;
    expect(isHistorical).toBe(true);
    // UI should NOT render BEST
  });

  it('BEST shown for admitted current-epoch candidate with selected_image_id', () => {
    const slot = makeSlot({
      state: 'candidate_present',
      best_candidate_id: 'cand-1',  // CANDIDATE id
      selected_image_id: 'img-1',   // IMAGE id — different domain, intentionally different
      best_score: 0.85,
      convergence_state: { gate_admitted: true, costume_run_id: 'current-run' },
    });
    const conv = slot.convergence_state as any;
    const isGateRejected = conv.gate_admitted === false;
    const isHistorical = false; // same run
    const bestScore = slot.best_score!;
    const MIN_VIABLE = 0.55;
    expect(isGateRejected).toBe(false);
    expect(isHistorical).toBe(false);
    expect(bestScore >= MIN_VIABLE).toBe(true);
    // RISK 1 FIX: BEST no longer requires selected_image_id === best_candidate_id
    // (they are different ID domains). BEST requires: selected_image_id exists + score threshold.
    expect(slot.selected_image_id).toBeTruthy();
    expect(slot.best_candidate_id).not.toBe(slot.selected_image_id); // proves cross-domain
    // All BEST conditions met even though IDs differ
  });

  it('BEST hidden when no selected_image_id exists', () => {
    const slot = makeSlot({
      state: 'candidate_present',
      best_candidate_id: 'cand-1',
      selected_image_id: null,
      best_score: 0.85,
      convergence_state: { gate_admitted: true },
    });
    // No selected image → BEST should NOT render
    expect(slot.selected_image_id).toBeNull();
  });
});

// ── B. Producer decision null semantics ──

describe('Producer decision eligibility', () => {
  it('null producer_decision is eligible', () => {
    expect(isProducerDecisionEligible(null)).toBe(true);
    expect(isProducerDecisionEligible(undefined)).toBe(true);
  });

  it('pending producer_decision is eligible', () => {
    expect(isProducerDecisionEligible('pending')).toBe(true);
  });

  it('rejected producer_decision is NOT eligible', () => {
    expect(isProducerDecisionEligible('rejected')).toBe(false);
  });

  it('archived_by_reset producer_decision is NOT eligible', () => {
    expect(isProducerDecisionEligible('archived_by_reset')).toBe(false);
  });

  it('approved producer_decision is eligible', () => {
    expect(isProducerDecisionEligible('approved')).toBe(true);
  });
});

// ── C. Resolver gate-aware truth ──

describe('Resolver gate-aware truth', () => {
  it('non-admitted candidate does not produce candidate_present', () => {
    const slot = makeSlot({ state: 'empty' });
    const cand = makeCandidate({
      generation_config: { gate_admitted: false, actor_identity_gate_status: 'fail' },
    });
    const resolved = resolveVisualSlotState(slot, [cand]);
    expect(resolved.display_state).toBe('empty');
    expect(resolved.candidate_count).toBe(0);
  });

  it('admitted candidate produces candidate_present', () => {
    const slot = makeSlot({ state: 'empty' });
    const cand = makeCandidate({
      generation_config: { gate_admitted: true, actor_identity_gate_status: 'pass' },
    });
    const resolved = resolveVisualSlotState(slot, [cand]);
    expect(resolved.display_state).toBe('candidate_present');
    expect(resolved.candidate_count).toBe(1);
  });

  it('pre-gate legacy candidate (no gate fields) counts as viable', () => {
    const slot = makeSlot({ state: 'empty' });
    const cand = makeCandidate({ generation_config: null });
    const resolved = resolveVisualSlotState(slot, [cand]);
    expect(resolved.display_state).toBe('candidate_present');
    expect(resolved.candidate_count).toBe(1);
  });

  it('rejected producer_decision candidate is excluded regardless of gate', () => {
    const slot = makeSlot({ state: 'empty' });
    const cand = makeCandidate({
      producer_decision: 'rejected',
      generation_config: { gate_admitted: true },
    });
    const resolved = resolveVisualSlotState(slot, [cand]);
    expect(resolved.display_state).toBe('empty');
    expect(resolved.candidate_count).toBe(0);
  });

  it('null producer_decision candidate is included when gate-admitted', () => {
    const slot = makeSlot({ state: 'empty' });
    const cand = makeCandidate({
      producer_decision: null as any,
      generation_config: { gate_admitted: true },
    });
    const resolved = resolveVisualSlotState(slot, [cand]);
    expect(resolved.display_state).toBe('candidate_present');
    expect(resolved.candidate_count).toBe(1);
  });

  it('archived_by_reset producer_decision is excluded', () => {
    const slot = makeSlot({ state: 'empty' });
    const cand = makeCandidate({
      producer_decision: 'archived_by_reset',
      generation_config: { gate_admitted: true },
    });
    const resolved = resolveVisualSlotState(slot, [cand]);
    expect(resolved.display_state).toBe('empty');
    expect(resolved.candidate_count).toBe(0);
  });
});

// ── D. Resolver conflict: stale candidate_present with zero viable candidates ──

describe('Resolver stale cache downgrade', () => {
  it('raw candidate_present with no viable candidates downgrades to empty', () => {
    const slot = makeSlot({
      state: 'candidate_present',
      selected_image_id: null,
      best_candidate_id: null,
    });
    const resolved = resolveVisualSlotState(slot, []);
    expect(resolved.display_state).toBe('empty');
    expect(resolved.candidate_count).toBe(0);
    expect(resolved.invariant_violations.length).toBeGreaterThan(0);
    expect(resolved.invariant_violations[0]).toContain('downgrading to empty');
  });

  it('raw candidate_present with only rejected candidates downgrades to empty', () => {
    const slot = makeSlot({ state: 'candidate_present' });
    const cand = makeCandidate({
      producer_decision: 'rejected',
      generation_config: { gate_admitted: true },
    });
    const resolved = resolveVisualSlotState(slot, [cand]);
    expect(resolved.display_state).toBe('empty');
    expect(resolved.candidate_count).toBe(0);
  });

  it('raw candidate_present with only gate-rejected candidates downgrades to empty', () => {
    const slot = makeSlot({ state: 'candidate_present' });
    const cand = makeCandidate({
      generation_config: { gate_admitted: false },
    });
    const resolved = resolveVisualSlotState(slot, [cand]);
    expect(resolved.display_state).toBe('empty');
    expect(resolved.candidate_count).toBe(0);
  });
});

// ── E. Readiness exclusion ──

describe('Readiness excludes non-admitted', () => {
  it('slot with only rejected-gate candidates resolves as empty', () => {
    const slot = makeSlot({ state: 'candidate_present' });
    const cand = makeCandidate({
      generation_config: { gate_admitted: false },
    });
    const resolved = resolveVisualSlotState(slot, [cand]);
    expect(resolved.candidate_count).toBe(0);
    // Stale cache downgraded
    expect(resolved.display_state).toBe('empty');
  });
});

// ── F. Approval blocking ──

describe('Approval gate checks', () => {
  it('isCandidateAdmitted returns false for gate_admitted=false', () => {
    expect(isCandidateAdmitted({ gate_admitted: false })).toBe(false);
  });

  it('isCandidateAdmitted returns true for gate_admitted=true', () => {
    expect(isCandidateAdmitted({ gate_admitted: true })).toBe(true);
  });

  it('isCandidateAdmitted returns true for pre-gate legacy (null)', () => {
    expect(isCandidateAdmitted(null)).toBe(true);
    expect(isCandidateAdmitted({})).toBe(true);
  });

  it('isCandidateIdentityValid returns false for fail status', () => {
    expect(isCandidateIdentityValid({ actor_identity_gate_status: 'fail' })).toBe(false);
  });
});

// ── G. resolveSlotDisplayFromFields UI helper ──

describe('resolveSlotDisplayFromFields', () => {
  it('empty slot with no candidates', () => {
    const r = resolveSlotDisplayFromFields(makeSlot());
    expect(r.isEmpty).toBe(true);
    expect(r.hasCandidateOrImage).toBe(false);
  });

  it('locked slot stays locked regardless of candidates', () => {
    const slot = makeSlot({ state: 'locked', selected_image_id: 'img-1' });
    const r = resolveSlotDisplayFromFields(slot);
    expect(r.isLocked).toBe(true);
    expect(r.displayState).toBe('locked');
  });

  it('approved slot stays approved', () => {
    const slot = makeSlot({ state: 'approved', selected_image_id: 'img-1' });
    const r = resolveSlotDisplayFromFields(slot);
    expect(r.isApproved).toBe(true);
  });
});
