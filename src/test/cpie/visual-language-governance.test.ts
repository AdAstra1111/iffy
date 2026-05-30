/** 
 * Visual Language Governance Tests
 * Tests explainInference() for VL inferences
 */
import { describe, it, expect } from 'vitest';
import { inferVL } from '../../lib/cpie/vl';
import { explainInference, formatExplanation } from '../../lib/cpie/governance';
import type { CPIEPCPContext } from '../../lib/cpie/types';

function noirContext(): CPIEPCPContext {
  return {
    project_id: 'test-noir', genre: ['noir', 'crime'], period: 'contemporary',
    climate: 'temperate_rainy', technology_level: 'contemporary', culture: ['Western'],
    profession_map: {}, pcp_resolution_timestamp: '2026-01-01',
    visual_tone: 'dark', production_language: 'gritty_realism',
  };
}

describe('VL Governance — explainInference', () => {
  it('explains why low_key_contrast was chosen', () => {
    const r = inferVL(noirContext());
    const inf = r.inferences.find(i => i.field === 'contrast_model')!;
    const expl = explainInference(inf, noirContext(), 'project', 'vl');
    expect(expl.field).toBe('contrast_model');
    expect(expl.value).toMatch(/high_contrast/);
    expect(expl.pcp_dependencies).toContain('genre');
    expect(expl.pcp_values_snapshot.genre).toContain('noir');
  });

  it('explains why desaturated palette was chosen', () => {
    const r = inferVL(noirContext());
    const inf = r.inferences.find(i => i.field === 'saturation_profile')!;
    const expl = explainInference(inf, noirContext(), 'project', 'vl');
    expect(expl.field).toBe('saturation_profile');
    expect(expl.value).toMatch(/muted/);
  });

  it('explains why practical-lightning was chosen', () => {
    const r = inferVL(noirContext());
    const inf = r.inferences.find(i => i.field === 'lighting_philosophy')!;
    const expl = explainInference(inf, noirContext(), 'project', 'vl');
    expect(expl.field).toBe('lighting_philosophy');
    expect(expl.value).toMatch(/practical/);
  });

  it('formatExplanation produces readable output', () => {
    const r = inferVL(noirContext());
    const inf = r.inferences[0];
    const expl = explainInference(inf, noirContext(), 'project', 'vl');
    const formatted = formatExplanation(expl);
    expect(formatted).toContain('Source');
    expect(formatted).toContain('Registry rule');
    expect(formatted).toContain('Dependencies');
  });
});

describe('VL Governance — registry_anchor_id convention', () => {
  it('all anchors start with vl_', () => {
    const r = inferVL(noirContext());
    for (const inf of r.inferences) {
      expect(inf.registry_anchor_id).toMatch(/^vl_/);
    }
  });

  it('no inference has opaque or missing anchor_id', () => {
    const r = inferVL(noirContext());
    for (const inf of r.inferences) {
      expect(inf.registry_anchor_id).toBeTruthy();
      expect(inf.registry_anchor_id.length).toBeGreaterThan(5);
    }
  });
});
