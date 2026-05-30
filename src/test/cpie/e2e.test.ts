/**
 * CPIE ICS Tests + Sparse Narrative Tests + Regression
 */
import { describe, it, expect } from 'vitest';
import { calculateICS, calculateICSBreakdown, getTotalPossibleFields } from '../../lib/cpie/ics';
import { runCPIEInference } from '../../lib/cpie/engine';
import { buildCDGRegistration } from '../../lib/cpie/cdg-integration';
import { explainInference, formatExplanation } from '../../lib/cpie/governance';
import { crimeDetectiveContext, fantasyRiderContext, sciFiCourierContext } from './helpers';
import type { CPIEInference } from '../../lib/cpie/types';

function mi(field: string): CPIEInference {
  return { field, value: 'test', source_type: 'inferred', confidence_score: 0.8,
    reasoning: ['test'], registry_anchor_id: 'test', pcp_dependencies: ['profession_map'],
    generated_at: '2026-01-01', generated_by: 'cpie_registry' };
}

// ---- ICS Tests ----
describe('ICS', () => {
  it('0 for empty', () => expect(calculateICS([], 'wardrobe')).toBe(0));
  it('3/10 = 0.3', () => expect(calculateICS([mi('a'),mi('b'),mi('c')], 'wardrobe')).toBe(0.3));
  it('breakdown', () => {
    const r = calculateICSBreakdown('wardrobe', [mi('a')], 1, 1);
    expect(r.ics).toBe(0.3);
    expect(r.breakdown.inferred_pct).toBe(10);
  });
  it('wardrobe has 10 total', () => expect(getTotalPossibleFields('wardrobe')).toBe(10));
  it('prop has 8 total', () => expect(getTotalPossibleFields('prop')).toBe(8));
});

// ---- Sparse Narrative Cases (integrated) ----
describe('CASE A -- Detective in Pub (Crime)', () => {
  const session = runCPIEInference(crimeDetectiveContext());
  it('non-empty wardrobe', () => {
    const c = session.domains.wardrobe.reduce((s, w) => s + w.inference_count, 0);
    expect(c).toBeGreaterThan(0);
  });
  it('non-empty props', () => {
    const c = session.domains.props.reduce((s, p) => s + p.inference_count, 0);
    expect(c).toBeGreaterThan(0);
  });
  it('governance works', () => {
    const w = session.domains.wardrobe[0];
    if (w && w.inferences.length > 0) {
      const exp = explainInference(w.inferences[0], session.context, w.entity_key, 'wardrobe');
      expect(exp.field).toBeTruthy();
      expect(formatExplanation(exp)).toContain('Source: inferred');
    }
  });
  it('CDG registration works', () => {
    for (const w of session.domains.wardrobe) {
      const reg = buildCDGRegistration('test', 'wardrobe', w.entity_key, w.inferences);
      expect(reg).not.toBeNull();
      expect(reg!.node_id).toBe('D1');
      expect(reg!.cpie_node_id).toBe('C1');
    }
  });
});

describe('CASE B -- Rider at Capital (Fantasy)', () => {
  const session = runCPIEInference(fantasyRiderContext());
  it('non-empty wardrobe', () => {
    const c = session.domains.wardrobe.reduce((s, w) => s + w.inference_count, 0);
    expect(c).toBeGreaterThan(0);
  });
  it('non-empty props', () => {
    const c = session.domains.props.reduce((s, p) => s + p.inference_count, 0);
    expect(c).toBeGreaterThan(0);
  });
  it('no modern contamination', () => {
    const bad = ['trench_coat', 'fedora', 'blazer', 'smartphone', 'radio'];
    for (const w of session.domains.wardrobe)
      for (const inf of w.inferences) expect(bad).not.toContain(inf.value);
    for (const p of session.domains.props)
      for (const inf of p.inferences) expect(bad).not.toContain(inf.value);
  });
});

describe('CASE C -- Courier in District (Sci-Fi)', () => {
  const session = runCPIEInference(sciFiCourierContext());
  it('non-empty wardrobe', () => {
    const c = session.domains.wardrobe.reduce((s, w) => s + w.inference_count, 0);
    expect(c).toBeGreaterThan(0);
  });
  it('non-empty props', () => {
    const c = session.domains.props.reduce((s, p) => s + p.inference_count, 0);
    expect(c).toBeGreaterThan(0);
  });
  it('no WWII contamination', () => {
    const bad = ['fedora', 'tank', 'jeep', 'stethoscope', 'sword', 'horse'];
    for (const w of session.domains.wardrobe)
      for (const inf of w.inferences) expect(bad).not.toContain(inf.value);
    for (const p of session.domains.props)
      for (const inf of p.inferences) expect(bad).not.toContain(inf.value);
  });
});

// ---- Full Pipeline ----
describe('Full Pipeline', () => {
  it('creates complete session', () => {
    const s = runCPIEInference(crimeDetectiveContext());
    expect(s.project_id).toBeTruthy();
    expect(s.ics).toBeDefined();
    expect(s.registry_metadata).toBeDefined();
    expect(s.generated_at).toBeTruthy();
    expect(s.domains.wardrobe.length).toBeGreaterThan(0);
    expect(s.domains.props.length).toBeGreaterThan(0);
  });
});
