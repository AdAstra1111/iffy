/**
 * VPB Identity, Convergence, and Tray Visibility — Regression Tests
 */
import { describe, it, expect } from 'vitest';
import { getDocTypeLabel, getDocDisplayName, ALL_DOC_TYPE_LABELS } from '@/lib/can-promote-to-script';
import { isOutputDocType, BASE_DOC_TYPES } from '@/config/documentLadders';
import {
  evaluateVPBConvergence,
  resolveVPBStatus,
  type ShepherdingDecision,
} from '@/lib/visual/vpbConvergence';

// ── PART 1: Tray Identity ───────────────────────────────────────────────────

describe('VPB tray identity — label resolution', () => {
  it('visual_project_bible resolves to "Visual Project Bible", not "Document"', () => {
    expect(getDocTypeLabel('visual_project_bible')).toBe('Visual Project Bible');
  });

  it('vertical_market_sheet does not resolve to "Document"', () => {
    const label = getDocTypeLabel('vertical_market_sheet');
    expect(label).not.toBe('Document');
    expect(label).toBe('Market Sheet (VD)');
  });

  it('market_sheet does not resolve to "Document"', () => {
    expect(getDocTypeLabel('market_sheet')).toBe('Market Sheet');
  });

  it('deck does not resolve to "Document"', () => {
    expect(getDocTypeLabel('deck')).toBe('Deck');
  });

  it('trailer_script does not resolve to "Document"', () => {
    expect(getDocTypeLabel('trailer_script')).toBe('Trailer Script');
  });

  it('episode_beats does not resolve to "Document"', () => {
    expect(getDocTypeLabel('episode_beats')).not.toBe('Document');
    expect(getDocTypeLabel('episode_beats')).toBe('Episode Beats');
  });

  it('ALL_DOC_TYPE_LABELS includes visual_project_bible', () => {
    expect(ALL_DOC_TYPE_LABELS['visual_project_bible']).toBe('Visual Project Bible');
  });

  it('getDocDisplayName for VPB includes project title', () => {
    const name = getDocDisplayName('My Project', 'visual_project_bible');
    expect(name).toBe('My Project — Visual Project Bible');
  });

  it('unknown doc type still falls back to "Document"', () => {
    expect(getDocTypeLabel('completely_unknown_type_xyz')).toBe('Document');
  });
});

describe('VPB registry parity', () => {
  it('BASE_DOC_TYPES and ALL_DOC_TYPE_LABELS both register visual_project_bible', () => {
    expect(BASE_DOC_TYPES.visual_project_bible).toBeDefined();
    expect(ALL_DOC_TYPE_LABELS['visual_project_bible']).toBeDefined();
  });

  it('isOutputDocType recognizes visual_project_bible', () => {
    expect(isOutputDocType('visual_project_bible')).toBe(true);
  });

  it('all output doc types have labels in ALL_DOC_TYPE_LABELS', () => {
    const outputTypes = ['visual_project_bible', 'market_sheet', 'vertical_market_sheet', 'deck', 'trailer_script'];
    for (const dt of outputTypes) {
      expect(ALL_DOC_TYPE_LABELS[dt]).toBeDefined();
      expect(ALL_DOC_TYPE_LABELS[dt]).not.toBe('Document');
    }
  });
});

// ── PART 2: Convergence Governance ──────────────────────────────────────────

describe('VPB convergence evaluation', () => {
  const baseInput = {
    sections_present: 10,
    sections_total: 12,
    character_count: 3,
    location_count: 2,
    asset_count: 5,
    enrichment_applied: true,
    visual_canon_available: true,
    shepherding_decisions: [] as ShepherdingDecision[],
  };

  it('returns pass for well-formed VPB with full sections', () => {
    const result = evaluateVPBConvergence({ ...baseInput, sections_present: 12 });
    expect(result.verdict).toBe('pass');
    expect(result.score).toBeGreaterThan(60);
  });

  it('returns blocked when visual canon is missing', () => {
    const result = evaluateVPBConvergence({ ...baseInput, visual_canon_available: false });
    expect(result.verdict).toBe('blocked');
    expect(result.blockers.some(b => b.blocker_class === 'missing_source_truth')).toBe(true);
  });

  it('returns blocked when no characters', () => {
    const result = evaluateVPBConvergence({ ...baseInput, character_count: 0 });
    expect(result.verdict).toBe('blocked');
    expect(result.blockers.some(b => b.blocker_class === 'character_visual_gap')).toBe(true);
  });

  it('shepherding decisions improve convergence score', () => {
    const without = evaluateVPBConvergence(baseInput);
    const decisions: ShepherdingDecision[] = [
      { id: '1', domain: 'world_visual_direction', decision_text: 'Prestige realism', decided_at: '', decided_by: null, is_active: true },
      { id: '2', domain: 'aesthetic_tier', decision_text: 'High-end', decided_at: '', decided_by: null, is_active: true },
    ];
    const withDecisions = evaluateVPBConvergence({ ...baseInput, shepherding_decisions: decisions });
    expect(withDecisions.score).toBeGreaterThanOrEqual(without.score);
  });

  it('inactive shepherding decisions do not affect score', () => {
    const decisions: ShepherdingDecision[] = [
      { id: '1', domain: 'world_visual_direction', decision_text: 'test', decided_at: '', decided_by: null, is_active: false },
    ];
    const withInactive = evaluateVPBConvergence({ ...baseInput, shepherding_decisions: decisions });
    const withNone = evaluateVPBConvergence(baseInput);
    expect(withInactive.score).toBe(withNone.score);
  });
});

// ── PART 3: Status Model ────────────────────────────────────────────────────

describe('VPB status model', () => {
  it('missing when document does not exist', () => {
    const report = resolveVPBStatus({
      document_exists: false,
      sections_present: 0, sections_total: 12,
      character_count: 0, location_count: 0, asset_count: 0,
      last_assembled_at: null,
      convergence_result: null,
      visual_canon_available: false,
      enrichment_applied: false,
    });
    expect(report.status).toBe('missing');
    expect(report.exists).toBe(false);
  });

  it('assembled_unreviewed when exists but no convergence', () => {
    const report = resolveVPBStatus({
      document_exists: true,
      sections_present: 10, sections_total: 12,
      character_count: 2, location_count: 1, asset_count: 3,
      last_assembled_at: '2026-01-01',
      convergence_result: null,
      visual_canon_available: true,
      enrichment_applied: true,
    });
    expect(report.status).toBe('assembled_unreviewed');
  });

  it('blocked when convergence has hard blockers — CANNOT be approved', () => {
    const blockedResult = evaluateVPBConvergence({
      sections_present: 10, sections_total: 12,
      character_count: 0, location_count: 0, asset_count: 0,
      enrichment_applied: false,
      visual_canon_available: false,
      shepherding_decisions: [],
    });
    const report = resolveVPBStatus({
      document_exists: true,
      sections_present: 10, sections_total: 12,
      character_count: 0, location_count: 0, asset_count: 0,
      last_assembled_at: '2026-01-01',
      convergence_result: blockedResult,
      visual_canon_available: false,
      enrichment_applied: false,
    });
    expect(report.status).toBe('blocked');
    expect(report.status).not.toBe('approved_for_visual_pipeline');
  });

  it('approved_for_visual_pipeline only when convergence passes', () => {
    const passResult = evaluateVPBConvergence({
      sections_present: 12, sections_total: 12,
      character_count: 5, location_count: 3, asset_count: 8,
      enrichment_applied: true,
      visual_canon_available: true,
      shepherding_decisions: [],
    });
    const report = resolveVPBStatus({
      document_exists: true,
      sections_present: 12, sections_total: 12,
      character_count: 5, location_count: 3, asset_count: 8,
      last_assembled_at: '2026-01-01',
      convergence_result: passResult,
      visual_canon_available: true,
      enrichment_applied: true,
    });
    expect(report.status).toBe('approved_for_visual_pipeline');
  });
});
