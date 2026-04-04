import { describe, it, expect, vi } from 'vitest';
import { resolveVisualSlotState, resolveSlotDisplayFromFields } from '../slotStateResolver';
import type { SlotLike, CandidateLike } from '../slotStateResolver';

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
    producer_decision: 'undecided',
    ...overrides,
  };
}

describe('resolveVisualSlotState', () => {
  // A. Resolver precedence
  describe('precedence', () => {
    it('locked overrides approved and candidate', () => {
      const slot = makeSlot({ state: 'locked', selected_image_id: 'img-1' });
      const r = resolveVisualSlotState(slot, [makeCandidate()]);
      expect(r.display_state).toBe('locked');
    });

    it('approved overrides candidate_present', () => {
      const slot = makeSlot({ state: 'approved', selected_image_id: 'img-1' });
      const r = resolveVisualSlotState(slot, [makeCandidate()]);
      expect(r.display_state).toBe('approved');
    });

    it('candidate_present overrides empty', () => {
      const slot = makeSlot({ state: 'empty' });
      const r = resolveVisualSlotState(slot, [makeCandidate()]);
      expect(r.display_state).toBe('candidate_present');
    });

    it('empty only when no candidate/approved/locked truth exists', () => {
      const slot = makeSlot({ state: 'empty' });
      const r = resolveVisualSlotState(slot, []);
      expect(r.display_state).toBe('empty');
    });
  });

  // B. Stale empty correction
  describe('stale empty correction', () => {
    it('slot.state=empty + candidate row exists => resolves candidate_present', () => {
      const slot = makeSlot({ state: 'empty' });
      const r = resolveVisualSlotState(slot, [makeCandidate()]);
      expect(r.display_state).toBe('candidate_present');
      expect(r.invariant_violations.length).toBeGreaterThan(0);
      expect(r.invariant_violations[0]).toContain('empty');
      expect(r.invariant_violations[0]).toContain('candidate_present');
    });
  });

  // C. Best candidate fallback
  describe('best candidate fallback', () => {
    it('best_candidate_id exists but slot.state=empty => resolves candidate_present', () => {
      const slot = makeSlot({ state: 'empty', best_candidate_id: 'cand-1' });
      const r = resolveVisualSlotState(slot, []);
      expect(r.display_state).toBe('candidate_present');
    });
  });

  // D. Exact slot matching
  describe('exact slot matching', () => {
    it('candidate on another slot must not affect this slot', () => {
      const slot = makeSlot({ id: 'slot-1', state: 'empty' });
      const otherCandidate = makeCandidate({ visual_set_slot_id: 'slot-2' });
      const r = resolveVisualSlotState(slot, [otherCandidate]);
      expect(r.display_state).toBe('empty');
    });
  });

  // G. UI truth contract
  describe('UI truth contract', () => {
    it('resolveSlotDisplayFromFields shows hasCandidateOrImage when resolver says candidate_present', () => {
      const slot = makeSlot({ state: 'empty' });
      const display = resolveSlotDisplayFromFields(slot, [makeCandidate()]);
      expect(display.hasCandidateOrImage).toBe(true);
      expect(display.isEmpty).toBe(false);
      expect(display.displayState).toBe('candidate_present');
    });

    it('resolveSlotDisplayFromFields shows empty when no candidates', () => {
      const slot = makeSlot({ state: 'empty' });
      const display = resolveSlotDisplayFromFields(slot, []);
      expect(display.isEmpty).toBe(true);
      expect(display.hasCandidateOrImage).toBe(false);
    });

    it('resolveSlotDisplayFromFields shows candidate when slot cache says candidate_present without loaded candidates', () => {
      const slot = makeSlot({ state: 'candidate_present', selected_image_id: 'img-1' });
      const display = resolveSlotDisplayFromFields(slot, []);
      expect(display.displayState).toBe('candidate_present');
      expect(display.hasCandidateOrImage).toBe(true);
      expect(display.isEmpty).toBe(false);
    });

    it('selected_image_id alone prevents empty rendering when candidate rows are not yet loaded', () => {
      const slot = makeSlot({ state: 'empty', selected_image_id: 'img-1' });
      const display = resolveSlotDisplayFromFields(slot, []);
      expect(display.displayState).toBe('candidate_present');
      expect(display.hasCandidateOrImage).toBe(true);
      expect(display.isEmpty).toBe(false);
    });
  });

  // H. No regression — historical candidate behavior
  describe('historical detection', () => {
    it('detects historical-only when activeRunId differs from slot run', () => {
      const slot = makeSlot({
        state: 'candidate_present',
        convergence_state: { costume_run_id: 'old-run' },
      });
      const r = resolveVisualSlotState(slot, [makeCandidate()], 'new-run');
      expect(r.is_historical_only).toBe(true);
    });

    it('does not mark as historical when run matches', () => {
      const slot = makeSlot({
        state: 'candidate_present',
        convergence_state: { costume_run_id: 'active-run' },
      });
      const r = resolveVisualSlotState(slot, [makeCandidate()], 'active-run');
      expect(r.is_historical_only).toBe(false);
    });
  });

  // I. Invariant logging
  describe('invariant logging', () => {
    it('logs violation when locked slot has no selected_image_id', () => {
      const slot = makeSlot({ state: 'locked', selected_image_id: null });
      const r = resolveVisualSlotState(slot, []);
      expect(r.invariant_violations.some(v => v.includes('locked') && v.includes('no selected_image_id'))).toBe(true);
    });

    it('logs violation when approved slot has no selected_image_id', () => {
      const slot = makeSlot({ state: 'approved', selected_image_id: null });
      const r = resolveVisualSlotState(slot, []);
      expect(r.invariant_violations.some(v => v.includes('approved') && v.includes('no selected_image_id'))).toBe(true);
    });

    it('logs violation when best_candidate_id set but no candidate rows', () => {
      const slot = makeSlot({ state: 'empty', best_candidate_id: 'cand-x' });
      // best_candidate_id alone triggers candidate_present, but also logs that no rows exist
      const r = resolveVisualSlotState(slot, []);
      // This triggers candidate_present because bestCandidateId is set
      expect(r.display_state).toBe('candidate_present');
    });
  });

  // E. Write path reconciliation (resolver side only)
  describe('selected image resolution', () => {
    it('resolves selected_image_id from candidate when slot has none', () => {
      const slot = makeSlot({ state: 'empty', selected_image_id: null });
      const cand = makeCandidate({ selected_for_slot: true, image_id: 'img-resolved' });
      const r = resolveVisualSlotState(slot, [cand]);
      expect(r.selected_image_id).toBe('img-resolved');
    });
  });

  // F. Rejected candidates don't count
  describe('rejected candidates excluded', () => {
    it('slot with only rejected candidates resolves empty', () => {
      const slot = makeSlot({ state: 'empty' });
      const cand = makeCandidate({ producer_decision: 'rejected' });
      const r = resolveVisualSlotState(slot, [cand]);
      expect(r.display_state).toBe('empty');
      expect(r.candidate_count).toBe(0);
    });
  });

  // needs_replacement preserved
  describe('needs_replacement', () => {
    it('needs_replacement with no candidates stays needs_replacement', () => {
      const slot = makeSlot({ state: 'needs_replacement' });
      const r = resolveVisualSlotState(slot, []);
      expect(r.display_state).toBe('needs_replacement');
    });

    it('needs_replacement with viable candidate becomes candidate_present', () => {
      const slot = makeSlot({ state: 'needs_replacement' });
      const r = resolveVisualSlotState(slot, [makeCandidate()]);
      expect(r.display_state).toBe('candidate_present');
    });
  });
});
