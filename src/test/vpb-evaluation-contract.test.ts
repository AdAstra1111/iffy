/**
 * VPB Evaluation Contract — Regression tests.
 *
 * Ensures visual_project_bible is registered as a first-class deliverable
 * and never falls through to concept_brief.
 */
import { describe, it, expect } from 'vitest';
import { defaultDeliverableForDocType, DELIVERABLE_LABELS } from '@/lib/dev-os-config';

describe('VPB deliverable registration', () => {
  it('defaultDeliverableForDocType("visual_project_bible") returns "visual_project_bible"', () => {
    expect(defaultDeliverableForDocType('visual_project_bible')).toBe('visual_project_bible');
  });

  it('VPB does NOT fall through to concept_brief', () => {
    expect(defaultDeliverableForDocType('visual_project_bible')).not.toBe('concept_brief');
  });

  it('DELIVERABLE_LABELS includes visual_project_bible', () => {
    expect(DELIVERABLE_LABELS.visual_project_bible).toBe('Visual Project Bible');
  });
});

describe('Ladder/output doc regression', () => {
  it('concept_brief still resolves to concept_brief', () => {
    expect(defaultDeliverableForDocType('concept_brief')).toBe('concept_brief');
  });

  it('idea still resolves to idea', () => {
    expect(defaultDeliverableForDocType('idea')).toBe('idea');
  });

  it('market_sheet still resolves to market_sheet', () => {
    expect(defaultDeliverableForDocType('market_sheet')).toBe('market_sheet');
  });

  it('vertical_market_sheet still resolves to vertical_market_sheet', () => {
    expect(defaultDeliverableForDocType('vertical_market_sheet')).toBe('vertical_market_sheet');
  });

  it('unknown types still fall back to concept_brief', () => {
    expect(defaultDeliverableForDocType('totally_unknown')).toBe('concept_brief');
  });
});
