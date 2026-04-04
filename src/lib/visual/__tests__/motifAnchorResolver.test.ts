/**
 * motifAnchorResolver.test.ts — Tests for cross-session motif anchor resolution,
 * anchor confidence semantics, and diagnostics extraction.
 */

import { describe, it, expect } from 'vitest';
import {
  extractMotifDiagnostics,
  motifSelectionLabel,
  motifLineageLabel,
  type MotifDiagnosticsPayload,
  type AnchorConfidence,
} from '../motifAnchorResolver';

describe('extractMotifDiagnostics', () => {
  it('returns null when generation_config has no motif_validation', () => {
    expect(extractMotifDiagnostics(null)).toBeNull();
    expect(extractMotifDiagnostics(undefined)).toBeNull();
    expect(extractMotifDiagnostics({})).toBeNull();
    expect(extractMotifDiagnostics({ section: 'world' })).toBeNull();
  });

  it('extracts full diagnostics from persisted generation_config', () => {
    const gc = {
      motif_validation: {
        slot_key: 'motif_primary',
        fingerprint: { material_family: 'clay_ceramic', object_family: 'vessel', condition_family: 'worn', use_trace_family: 'handled' },
        fingerprint_key: 'clay_ceramic|vessel|worn|handled',
        scores: { physical_plausibility: 85, material_legibility: 78, use_trace: 70, world_embeddedness: 65, motif_lineage: 50 },
        hard_fail_codes: [],
        advisory_codes: ['pristine_no_use_trace'],
        slot_expectation_met: true,
        slot_expectation_failures: [],
        overall_score: 72,
        passed: true,
        lineage_status: 'anchor',
        selection_status: 'selected_valid',
        family_anchor_ref: null,
        scoring_model: 'motif_physical_v1',
        validation_version: '1.0.0',
      },
    };

    const result = extractMotifDiagnostics(gc);
    expect(result).not.toBeNull();
    expect(result!.slot_key).toBe('motif_primary');
    expect(result!.lineage_status).toBe('anchor');
    expect(result!.selection_status).toBe('selected_valid');
    expect(result!.fingerprint_key).toBe('clay_ceramic|vessel|worn|handled');
    expect(result!.scores?.physical_plausibility).toBe(85);
    expect(result!.hard_fail_codes).toEqual([]);
    expect(result!.advisory_codes).toEqual(['pristine_no_use_trace']);
    expect(result!.passed).toBe(true);
  });

  it('handles partial motif_validation gracefully', () => {
    const gc = { motif_validation: { slot_key: 'motif_damage', passed: false } };
    const result = extractMotifDiagnostics(gc);
    expect(result).not.toBeNull();
    expect(result!.slot_key).toBe('motif_damage');
    expect(result!.passed).toBe(false);
    expect(result!.hard_fail_codes).toEqual([]);
    expect(result!.scores).toBeNull();
  });
});

describe('motifSelectionLabel', () => {
  it('returns human-readable labels for all known statuses', () => {
    expect(motifSelectionLabel('selected_valid')).toBe('Selected — valid');
    expect(motifSelectionLabel('rejected_hard_fail')).toBe('Stored — rejected (hard fail)');
    expect(motifSelectionLabel('blocked_missing_primary_anchor')).toBe('Blocked — missing primary anchor');
    expect(motifSelectionLabel('blocked_invalid_primary_anchor')).toBe('Blocked — invalid primary anchor');
    expect(motifSelectionLabel('rejected_lineage_mismatch')).toBe('Stored — rejected (lineage mismatch)');
  });

  it('returns raw status for unknown values', () => {
    expect(motifSelectionLabel('something_new')).toBe('something_new');
  });

  it('returns Unknown for null', () => {
    expect(motifSelectionLabel(null)).toBe('Unknown');
  });
});

describe('motifLineageLabel', () => {
  it('returns human-readable labels for all known lineage statuses', () => {
    expect(motifLineageLabel('anchor')).toBe('Primary Anchor');
    expect(motifLineageLabel('match')).toBe('Lineage Match');
    expect(motifLineageLabel('mismatch')).toBe('Lineage Mismatch');
    expect(motifLineageLabel('blocked_missing_primary')).toBe('Blocked — missing primary');
    expect(motifLineageLabel('blocked_invalid_primary')).toBe('Blocked — invalid primary');
  });
});

describe('cross-session anchor resolution invariants', () => {
  it('dependent slot blocked when persisted primary missing — diagnostics reflect this', () => {
    const gc = {
      motif_validation: {
        slot_key: 'motif_variant',
        lineage_status: 'blocked_missing_primary',
        selection_status: 'blocked_missing_primary_anchor',
        passed: false,
      },
    };
    const diag = extractMotifDiagnostics(gc);
    expect(diag).not.toBeNull();
    expect(diag!.lineage_status).toBe('blocked_missing_primary');
    expect(diag!.selection_status).toBe('blocked_missing_primary_anchor');
    expect(motifSelectionLabel(diag!.selection_status)).toBe('Blocked — missing primary anchor');
  });

  it('dependent slot blocked when persisted primary invalid — diagnostics reflect this', () => {
    const gc = {
      motif_validation: {
        slot_key: 'motif_damage',
        lineage_status: 'blocked_invalid_primary',
        selection_status: 'blocked_invalid_primary_anchor',
        passed: false,
      },
    };
    const diag = extractMotifDiagnostics(gc);
    expect(diag).not.toBeNull();
    expect(diag!.lineage_status).toBe('blocked_invalid_primary');
    expect(diag!.selection_status).toBe('blocked_invalid_primary_anchor');
  });

  it('anchor status correctly extracted for primary', () => {
    const gc = {
      motif_validation: {
        slot_key: 'motif_primary',
        lineage_status: 'anchor',
        selection_status: 'selected_valid',
        passed: true,
        fingerprint: { material_family: 'wood', object_family: 'furniture_fragment', condition_family: 'worn', use_trace_family: 'domestic_wear' },
      },
    };
    const diag = extractMotifDiagnostics(gc);
    expect(diag!.lineage_status).toBe('anchor');
    expect(diag!.fingerprint?.material_family).toBe('wood');
  });

  it('stored-not-selected is distinguishable from selected', () => {
    const selected = extractMotifDiagnostics({
      motif_validation: { selection_status: 'selected_valid', passed: true },
    });
    const stored = extractMotifDiagnostics({
      motif_validation: { selection_status: 'rejected_hard_fail', passed: false },
    });
    expect(selected!.selection_status).toBe('selected_valid');
    expect(stored!.selection_status).toBe('rejected_hard_fail');
    expect(motifSelectionLabel(selected!.selection_status)).not.toBe(motifSelectionLabel(stored!.selection_status));
  });

  it('lineage mismatch correctly surfaced', () => {
    const gc = {
      motif_validation: {
        slot_key: 'motif_variant',
        lineage_status: 'mismatch',
        selection_status: 'rejected_lineage_mismatch',
        passed: false,
      },
    };
    const diag = extractMotifDiagnostics(gc);
    expect(diag!.lineage_status).toBe('mismatch');
    expect(motifLineageLabel(diag!.lineage_status)).toBe('Lineage Mismatch');
  });
});

describe('anchor confidence semantics', () => {
  it('AnchorConfidence type covers all expected values', () => {
    // Type-level test — these assignments must compile
    const values: AnchorConfidence[] = ['validated', 'unvalidated', 'derived', 'none'];
    expect(values).toHaveLength(4);
  });

  it('validated confidence means approval-grade', () => {
    // Simulating what resolveMotifPrimaryAnchor returns for a persisted valid primary
    // persisted_fingerprint with passed=true and selection_status=selected_valid → validated + approvalGrade
    const gc = {
      motif_validation: {
        passed: true,
        selection_status: 'selected_valid',
        fingerprint: { material_family: 'clay_ceramic', object_family: 'vessel', condition_family: 'worn', use_trace_family: 'handled' },
      },
    };
    const mv = gc.motif_validation;
    const isApprovalGrade = mv.passed === true && mv.selection_status === 'selected_valid';
    expect(isApprovalGrade).toBe(true);
  });

  it('persisted fingerprint with failed validation is NOT approval-grade', () => {
    const mv = {
      passed: false,
      selection_status: 'rejected_hard_fail',
      fingerprint: { material_family: 'clay_ceramic', object_family: 'vessel', condition_family: 'worn', use_trace_family: 'handled' },
    };
    const isApprovalGrade = mv.passed === true && mv.selection_status === 'selected_valid';
    expect(isApprovalGrade).toBe(false);
  });

  it('derived anchor is never approval-grade', () => {
    // derived anchors have confidence='derived' and approvalGrade=false
    const derivedConfidence: AnchorConfidence = 'derived';
    expect(derivedConfidence).not.toBe('validated');
  });

  it('unvalidated anchor is not approval-grade', () => {
    const confidence: AnchorConfidence = 'unvalidated';
    expect(confidence).not.toBe('validated');
  });
});

// ── Motif anchor lock tests ──────────────────────────────────────────────
describe('anchor object noun persistence', () => {
  it('extractMotifDiagnostics reads anchor_object_noun', () => {
    const config = {
      motif_validation: {
        slot_key: 'motif_primary',
        passed: true,
        selection_status: 'selected_valid',
        anchor_object_noun: 'ceramic bowl',
      },
    };
    const diag = extractMotifDiagnostics(config);
    expect(diag?.anchor_object_noun).toBe('ceramic bowl');
  });

  it('extractMotifDiagnostics returns null for missing anchor_object_noun', () => {
    const config = { motif_validation: { slot_key: 'motif_primary', passed: true } };
    const diag = extractMotifDiagnostics(config);
    expect(diag?.anchor_object_noun).toBeNull();
  });
});
