/** 
 * Visual Language CPIE Domain Tests — C7
 * Tests deterministic inference across 5 genres + tonal overrides + sparse narrative
 */
import { describe, it, expect } from 'vitest';
import { inferVL } from '../../lib/cpie/vl';
import type { CPIEPCPContext } from '../../lib/cpie/types';

function noirContext(overrides?: Partial<CPIEPCPContext>): CPIEPCPContext {
  return {
    project_id: 'test-noir', genre: ['noir', 'crime'], period: 'contemporary',
    climate: 'temperate_rainy', technology_level: 'contemporary', culture: ['Western'],
    profession_map: {}, pcp_resolution_timestamp: '2026-01-01',
    visual_tone: 'dark', production_language: 'gritty_realism',
    ...overrides,
  };
}

function fantasyContext(overrides?: Partial<CPIEPCPContext>): CPIEPCPContext {
  return {
    project_id: 'test-fantasy', genre: ['fantasy', 'epic'], period: 'fantasy_medieval',
    climate: 'temperate', technology_level: 'pre_industrial', culture: ['Feudal'],
    profession_map: {}, pcp_resolution_timestamp: '2026-01-01',
    visual_tone: 'moody', production_language: 'heightened_reality',
    ...overrides,
  };
}

function sciFiContext(overrides?: Partial<CPIEPCPContext>): CPIEPCPContext {
  return {
    project_id: 'test-scifi', genre: ['sci_fi', 'cyberpunk'], period: 'future',
    climate: 'temperate', technology_level: 'sci_fi_advanced', culture: ['Cosmopolitan'],
    profession_map: {}, pcp_resolution_timestamp: '2026-01-01',
    visual_tone: 'moody', production_language: 'minimalist',
    ...overrides,
  };
}

function horrorContext(overrides?: Partial<CPIEPCPContext>): CPIEPCPContext {
  return {
    project_id: 'test-horror', genre: ['horror'], period: 'contemporary',
    climate: 'temperate_rainy', technology_level: 'contemporary', culture: ['Western'],
    profession_map: {}, pcp_resolution_timestamp: '2026-01-01',
    visual_tone: 'dark', ...overrides,
  };
}

function dramaContext(overrides?: Partial<CPIEPCPContext>): CPIEPCPContext {
  return {
    project_id: 'test-drama', genre: ['drama', 'romance'], period: 'contemporary',
    climate: 'temperate', technology_level: 'contemporary', culture: ['Western'],
    profession_map: {}, pcp_resolution_timestamp: '2026-01-01',
    visual_tone: 'moody', ...overrides,
  };
}

// ── Noir Tests ──
describe('VL — Noir/Crime', () => {
  it('produces high_contrast_noir', () => {
    const r = inferVL(noirContext());
    const inf = r.inferences.find(i => i.field === 'contrast_model');
    expect(inf).toBeDefined();
    expect(inf!.value).toBe('high_contrast_noir');
    expect(inf!.confidence_score).toBeGreaterThanOrEqual(0.85);
    expect(inf!.source_type).toBe('inferred');
    expect(inf!.registry_anchor_id).toMatch(/^vl_noir_contrast/);
  });

  it('produces warm_amber_with_teal_shadows', () => {
    const r = inferVL(noirContext());
    const inf = r.inferences.find(i => i.field === 'colour_philosophy');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/warm_amber/);
    expect(inf!.confidence_score).toBeGreaterThanOrEqual(0.85);
  });

  it('produces low_key_practical_motivated lighting', () => {
    const r = inferVL(noirContext());
    const inf = r.inferences.find(i => i.field === 'lighting_philosophy');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/low_key/);
  });

  it('produces deep_crushing shadows', () => {
    const r = inferVL(noirContext());
    const inf = r.inferences.find(i => i.field === 'shadow_philosophy');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/deep_crushing/);
  });

  it('produces muted_warm saturation', () => {
    const r = inferVL(noirContext());
    const inf = r.inferences.find(i => i.field === 'saturation_profile');
    expect(inf).toBeDefined();
    expect(inf!.value).toBe('muted_warm');
  });

  it('produces moderate_balanced_scale', () => {
    const r = inferVL(noirContext());
    const inf = r.inferences.find(i => i.field === 'visual_scale');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/moderate/);
  });

  it('has 8+ inferences (all deterministic fields filled)', () => {
    const r = inferVL(noirContext());
    expect(r.inference_count).toBeGreaterThanOrEqual(8);
  });
});

// ── Fantasy Tests ──
describe('VL — Fantasy/Epic', () => {
  it('produces soft_contrast_fantasy', () => {
    const r = inferVL(fantasyContext());
    const inf = r.inferences.find(i => i.field === 'contrast_model');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/soft/);
  });

  it('produces rich_saturated_nature_tones', () => {
    const r = inferVL(fantasyContext());
    const inf = r.inferences.find(i => i.field === 'colour_philosophy');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/saturated/);
  });

  it('produces candle_firelight_ambient lighting', () => {
    const r = inferVL(fantasyContext());
    const inf = r.inferences.find(i => i.field === 'lighting_philosophy');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/candle|fire/);
  });

  it('produces vibrant_enriched saturation', () => {
    const r = inferVL(fantasyContext());
    const inf = r.inferences.find(i => i.field === 'saturation_profile');
    expect(inf!.value).toBe('vibrant_enriched');
  });

  it('produces soft_magical shadows', () => {
    const r = inferVL(fantasyContext());
    const inf = r.inferences.find(i => i.field === 'shadow_philosophy');
    expect(inf!.value).toMatch(/soft/);
  });
});

// ── Sci-Fi Tests ──
describe('VL — Sci-Fi/Cyberpunk', () => {
  it('produces clean_crisp_contrast', () => {
    const r = inferVL(sciFiContext());
    const inf = r.inferences.find(i => i.field === 'contrast_model');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/clean|crisp/);
  });

  it('produces cool_blue_teal_neon_accent', () => {
    const r = inferVL(sciFiContext());
    const inf = r.inferences.find(i => i.field === 'colour_philosophy');
    expect(inf!.value).toMatch(/cool|blue|teal|neon/);
  });

  it('produces neon_and_ambient_glow lighting', () => {
    const r = inferVL(sciFiContext());
    const inf = r.inferences.find(i => i.field === 'lighting_philosophy');
    expect(inf!.value).toMatch(/neon/);
  });

  it('produces cool_leaning palette bias', () => {
    const r = inferVL(sciFiContext());
    const inf = r.inferences.find(i => i.field === 'palette_bias');
    expect(inf!.value).toMatch(/cool/);
  });

  it('produces clean_digital_crisp texture', () => {
    const r = inferVL(sciFiContext());
    const inf = r.inferences.find(i => i.field === 'texture_philosophy');
    expect(inf!.value).toMatch(/clean_digital/);
  });
});

// ── Horror Tests ──
describe('VL — Horror', () => {
  it('produces harsh_deep_contrast', () => {
    const r = inferVL(horrorContext());
    const inf = r.inferences.find(i => i.field === 'contrast_model');
    expect(inf!.value).toMatch(/harsh|deep/);
  });

  it('produces desaturated_muddy colour', () => {
    const r = inferVL(horrorContext());
    const inf = r.inferences.find(i => i.field === 'colour_philosophy');
    expect(inf!.value).toMatch(/desaturated|muddy/);
  });

  it('produces single_source_ominous lighting', () => {
    const r = inferVL(horrorContext());
    const inf = r.inferences.find(i => i.field === 'lighting_philosophy');
    expect(inf!.value).toMatch(/single_source/);
  });

  it('produces impenetrable_black shadows', () => {
    const r = inferVL(horrorContext());
    const inf = r.inferences.find(i => i.field === 'shadow_philosophy');
    expect(inf!.value).toMatch(/impenetrable|black/);
  });

  it('produces claustrophobic_tight scale', () => {
    const r = inferVL(horrorContext());
    const inf = r.inferences.find(i => i.field === 'visual_scale');
    expect(inf!.value).toMatch(/claustrophobic/);
  });
});

// ── Drama Tests ──
describe('VL — Drama/Romance', () => {
  it('produces naturalistic_contrast', () => {
    const r = inferVL(dramaContext());
    const inf = r.inferences.find(i => i.field === 'contrast_model');
    expect(inf!.value).toMatch(/naturalistic/);
  });

  it('produces natural_muted_earthy colour', () => {
    const r = inferVL(dramaContext());
    const inf = r.inferences.find(i => i.field === 'colour_philosophy');
    expect(inf!.value).toMatch(/natural|muted|earthy/);
  });

  it('produces soft_naturalistic lighting', () => {
    const r = inferVL(dramaContext());
    const inf = r.inferences.find(i => i.field === 'lighting_philosophy');
    expect(inf!.value).toMatch(/soft|natural/);
  });

  it('produces intimate_close scale', () => {
    const r = inferVL(dramaContext());
    const inf = r.inferences.find(i => i.field === 'visual_scale');
    expect(inf!.value).toMatch(/intimate/);
  });
});

// ── Provenance Tests ──
describe('VL — Provenance', () => {
  it('every inference has required fields', () => {
    const r = inferVL(noirContext());
    for (const inf of r.inferences) {
      expect(inf.source_type).toMatch(/inferred/);
      expect(inf.confidence_score).toBeGreaterThan(0);
      expect(inf.reasoning.length).toBeGreaterThan(0);
      expect(inf.registry_anchor_id).toMatch(/^vl_/);
    }
  });

  it('generated_at is valid ISO timestamp', () => {
    const r = inferVL(noirContext());
    expect(r.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('pcp_dependencies contains genre', () => {
    const r = inferVL(noirContext());
    for (const inf of r.inferences) {
      expect(inf.pcp_dependencies).toContain('genre');
    }
  });
});

// ── Edge Cases ──
describe('VL — Edge Cases', () => {
  it('handles empty genre list with catch-all', () => {
    const ctx = noirContext({ genre: [] });
    const r = inferVL(ctx);
    expect(r.inference_count).toBeGreaterThanOrEqual(3);
  });

  it('does NOT produce camera/framing/movement/composition (LLM-only)', () => {
    const r = inferVL(noirContext());
    const llmFields = r.inferences.filter(i =>
      ['camera_philosophy', 'framing_philosophy', 'movement_philosophy', 'composition_philosophy'].includes(i.field)
    );
    expect(llmFields.length).toBe(0);
  });
});
