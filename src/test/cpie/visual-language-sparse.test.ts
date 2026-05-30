/** 
 * Visual Language Sparse Narrative Tests
 * "A detective enters a pub." — must produce noir VL without cross-contamination
 */
import { describe, it, expect } from 'vitest';
import { inferVL } from '../../lib/cpie/vl';
import type { CPIEPCPContext } from '../../lib/cpie/types';

function sparseDetectivePubContext(): CPIEPCPContext {
  return {
    project_id: 'test-detective-pub',
    genre: ['crime', 'noir'],
    period: 'contemporary',
    climate: 'temperate_rainy',
    technology_level: 'contemporary',
    culture: ['Western'],
    profession_map: {
      'detective-1': {
        character_name: 'Detective',
        profession: 'detective',
        role_archetype: 'investigator',
        authority_level: 'law_enforcement',
        institutional_affiliation: 'NYPD',
        confidence: 0.95, source: 'extracted',
      },
    },
    pcp_resolution_timestamp: '2026-01-01',
    visual_tone: 'dark',
    production_language: 'gritty_realism',
  };
}

function sparseFantasyContext(): CPIEPCPContext {
  return {
    project_id: 'test-fantasy-rider',
    genre: ['fantasy', 'epic'],
    period: 'fantasy_medieval',
    climate: 'temperate',
    technology_level: 'pre_industrial',
    culture: ['Feudal'],
    profession_map: {},
    pcp_resolution_timestamp: '2026-01-01',
    visual_tone: 'moody',
    production_language: 'heightened_reality',
  };
}

function sparseSciFiContext(): CPIEPCPContext {
  return {
    project_id: 'test-scifi-courier',
    genre: ['sci_fi', 'cyberpunk'],
    period: 'future',
    climate: 'temperate',
    technology_level: 'sci_fi_advanced',
    culture: ['Cosmopolitan'],
    profession_map: {},
    pcp_resolution_timestamp: '2026-01-01',
    visual_tone: 'moody',
    production_language: 'minimalist',
  };
}

function sparseHorrorContext(): CPIEPCPContext {
  return {
    project_id: 'test-horror',
    genre: ['horror'],
    period: 'contemporary',
    climate: 'temperate_rainy',
    technology_level: 'contemporary',
    culture: ['Western'],
    profession_map: {},
    pcp_resolution_timestamp: '2026-01-01',
    visual_tone: 'dark',
  };
}

describe('VL — Sparse: "A detective enters a pub"', () => {
  it('produces low_key contrast (noir)', () => {
    const r = inferVL(sparseDetectivePubContext());
    const inf = r.inferences.find(i => i.field === 'contrast_model');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/high_contrast/);
  });

  it('produces restrained palette (noir)', () => {
    const r = inferVL(sparseDetectivePubContext());
    const inf = r.inferences.find(i => i.field === 'colour_philosophy');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/warm_amber/);
  });

  it('produces practical_motivated lighting', () => {
    const r = inferVL(sparseDetectivePubContext());
    const inf = r.inferences.find(i => i.field === 'lighting_philosophy');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/practical_motivated/);
  });

  it('produces deep_crushing shadows', () => {
    const r = inferVL(sparseDetectivePubContext());
    const inf = r.inferences.find(i => i.field === 'shadow_philosophy');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/deep|crushing/);
  });

  it('does NOT contaminate fantasy', () => {
    const noir = inferVL(sparseDetectivePubContext());
    const fantasy = inferVL(sparseFantasyContext());
    const noirContrast = noir.inferences.find(i => i.field === 'contrast_model')!.value;
    const fantasyContrast = fantasy.inferences.find(i => i.field === 'contrast_model')!.value;
    expect(noirContrast).not.toBe(fantasyContrast);
  });

  it('does NOT contaminate sci-fi', () => {
    const noir = inferVL(sparseDetectivePubContext());
    const scifi = inferVL(sparseSciFiContext());
    const noirLighting = noir.inferences.find(i => i.field === 'lighting_philosophy')!.value;
    const scifiLighting = scifi.inferences.find(i => i.field === 'lighting_philosophy')!.value;
    expect(noirLighting).not.toBe(scifiLighting);
  });

  it('does NOT contaminate horror', () => {
    const noir = inferVL(sparseDetectivePubContext());
    const horror = inferVL(sparseHorrorContext());
    const noirColour = noir.inferences.find(i => i.field === 'colour_philosophy')!.value;
    const horrorColour = horror.inferences.find(i => i.field === 'colour_philosophy')!.value;
    expect(noirColour).not.toBe(horrorColour);
  });
});
