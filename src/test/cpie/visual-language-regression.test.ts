/** 
 * Visual Language Regression Tests
 * Tests cross-genre isolation and invariants
 */
import { describe, it, expect } from 'vitest';
import { inferVL } from '../../lib/cpie/vl';
import { runCPIEInference } from '../../lib/cpie/engine';
import { checkVLtoPDConsistency } from '../../lib/cpie/vl-consistency';
import { buildCDGRegistration } from '../../lib/cpie/cdg-integration';
import { calculateICS } from '../../lib/cpie/ics';
import type { CPIEPCPContext } from '../../lib/cpie/types';

function noirContext(): CPIEPCPContext {
  return {
    project_id: 'test-regression-noir', genre: ['noir', 'crime'], period: 'contemporary',
    climate: 'temperate_rainy', technology_level: 'contemporary', culture: ['Western'],
    profession_map: {
      'detective': { character_name: 'Harry', profession: 'detective', role_archetype: 'investigator',
        authority_level: 'law_enforcement', institutional_affiliation: 'NYPD',
        confidence: 0.95, source: 'extracted' },
    },
    pcp_resolution_timestamp: '2026-01-01',
    visual_tone: 'dark', production_language: 'gritty_realism',
  };
}

describe('VL Regression — ICS', () => {
  it('has valid ICS calculation', () => {
    const r = inferVL(noirContext());
    const ics = calculateICS(r.inferences, 'vl');
    expect(ics).toBeGreaterThan(0.5);
    expect(ics).toBeLessThanOrEqual(1.0);
  });
});

describe('VL Regression — CDG Registration', () => {
  it('registers with D7 node mapping', () => {
    const r = inferVL(noirContext());
    const reg = buildCDGRegistration('test-vl', 'vl', 'project', r.inferences);
    expect(reg).not.toBeNull();
    expect(reg!.node_id).toBe('D7');
    expect(reg!.cpie_node_id).toBe('C7');
    expect(reg!.upstream_dependencies).toContain('genre');
  });
});

describe('VL Regression — Cross-genre isolation', () => {
  it('genre-specific fields do not leak across genres', () => {
    const noir = inferVL(noirContext());
    const noirColour = noir.inferences.find(i => i.field === 'colour_philosophy')!.value;
    
    const fantasyCtx: CPIEPCPContext = {
      project_id: 'test-fantasy', genre: ['fantasy', 'epic'], period: 'fantasy_medieval',
      climate: 'temperate', technology_level: 'pre_industrial', culture: ['Feudal'],
      profession_map: {}, pcp_resolution_timestamp: '2026-01-01',
      visual_tone: 'moody', production_language: 'heightened_reality',
    };
    const fantasy = inferVL(fantasyCtx);
    const fantasyColour = fantasy.inferences.find(i => i.field === 'colour_philosophy')!.value;
    
    expect(noirColour).not.toBe(fantasyColour);
  });
});

describe('VL Regression — toPD Consistency', () => {
  it('passes when PD aligns with VL', () => {
    const result = checkVLtoPDConsistency(
      { colour_philosophy: 'warm_amber', saturation_profile: 'muted_warm',
        contrast_model: 'high_contrast_noir', lighting_philosophy: 'low_key_practical',
        realism_level: 'grounded', atmosphere_philosophy: 'haze_light' },
      { set_dressing_colors: 'warm_amber_wood', wall_treatment_colors: 'dark_wainscoting',
        practical_lamp_type: 'amber_bulb_practical', smoke_element: 'present_light_haze' },
    );
    expect(result.passed).toBe(true);
  });

  it('fails on forbidden divergence (saturated dressing with desaturated VL)', () => {
    const result = checkVLtoPDConsistency(
      { colour_philosophy: 'desaturated_muddy', saturation_profile: 'desaturated_pale',
        contrast_model: 'harsh_deep', lighting_philosophy: 'single_source',
        realism_level: 'grounded', atmosphere_philosophy: 'fog_heavy' },
      { set_dressing_colors: 'bright_vibrant_neon', wall_treatment_colors: 'white',
        practical_lamp_type: 'diffused_led_panel', smoke_element: 'none' },
    );
    expect(result.passed).toBe(false);
    expect(result.forbidden_divergences.length).toBeGreaterThan(0);
  });

  it('passes when no PD data available (no false positive)', () => {
    const result = checkVLtoPDConsistency(
      { colour_philosophy: 'warm_amber', saturation_profile: 'muted_warm',
        contrast_model: 'high_contrast', lighting_philosophy: 'low_key',
        realism_level: 'grounded', atmosphere_philosophy: 'none' },
      {},
    );
    expect(result.passed).toBe(true);
  });
});

describe('VL Regression — Engine integration', () => {
  it('runCPIEInference includes VL domain', () => {
    const ctx = noirContext();
    // Add required PCP fields for other domains
    const result = runCPIEInference(ctx);
    expect(result.domains).toHaveProperty('vl');
    expect(result.domains.vl.inference_count).toBeGreaterThan(0);
  });

  it('VL is in ICS summary', () => {
    const result = runCPIEInference(noirContext());
    expect(result.ics).toHaveProperty('vl');
    expect(result.ics.vl).toBeGreaterThan(0);
  });
});
