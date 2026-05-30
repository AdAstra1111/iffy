/** 
 * Production Design Sparse Narrative Tests
 * Tests PD inference from minimal context
 */
import { describe, it, expect } from 'vitest';
import { inferPD } from '../../lib/cpie/pd';
import { buildCDGRegistration } from '../../lib/cpie/cdg-integration';
import type { CPIEPCPContext } from '../../lib/cpie/types';

// "A detective enters a pub."
function detectivePubContext(): CPIEPCPContext {
  return {
    project_id: 'test-detective-pub',
    genre: ['crime', 'noir'],
    period: 'contemporary',
    climate: 'temperate_rainy',
    technology_level: 'contemporary',
    culture: ['Western'],
    profession_map: {
      'detective-1': { character_name: 'Detective', profession: 'detective',
        role_archetype: 'investigator', authority_level: 'law_enforcement',
        institutional_affiliation: 'NYPD', confidence: 0.95, source: 'extracted' },
    },
    pcp_resolution_timestamp: '2026-01-01',
    economy: 'industrial',
    class_structure: 'stratified',
  };
}

// "A rider approaches a capital."
function fantasyCapitalContext(): CPIEPCPContext {
  return {
    project_id: 'test-fantasy-capital',
    genre: ['fantasy', 'epic'],
    period: 'fantasy_medieval',
    climate: 'temperate',
    technology_level: 'pre_industrial',
    culture: ['Feudal'],
    profession_map: {},
    pcp_resolution_timestamp: '2026-01-01',
  };
}

// "A courier runs through a district."
function scifiDistrictContext(): CPIEPCPContext {
  return {
    project_id: 'test-scifi-district',
    genre: ['sci_fi', 'cyberpunk'],
    period: 'future',
    climate: 'temperate',
    technology_level: 'sci_fi_advanced',
    culture: ['Cosmopolitan'],
    profession_map: {},
    pcp_resolution_timestamp: '2026-01-01',
  };
}

// "A child hears something inside the walls."
function horrorHouseContext(): CPIEPCPContext {
  return {
    project_id: 'test-horror-house',
    genre: ['horror'],
    period: 'contemporary',
    climate: 'temperate_rainy',
    technology_level: 'contemporary',
    culture: ['Western'],
    profession_map: {},
    pcp_resolution_timestamp: '2026-01-01',
  };
}

describe('PD — Sparse: "A detective enters a pub"', () => {
  it('produces dressing_style for pub', () => {
    const r = inferPD(detectivePubContext(), { entity_key: 'pub', canonical_name: 'The Red Lion', spatial_function: 'hospitality' });
    const inf = r.inferences.find(i => i.field === 'dressing_style');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/cluttered|bar|dressing/);
  });

  it('produces environmental story', () => {
    const r = inferPD(detectivePubContext(), { entity_key: 'pub', canonical_name: 'The Red Lion', spatial_function: 'hospitality' });
    const inf = r.inferences.find(i => i.field === 'environmental_story');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/clutter|noir/);
  });

  it('has full provenance', () => {
    const r = inferPD(detectivePubContext(), { entity_key: 'pub', canonical_name: 'The Red Lion', spatial_function: 'hospitality' });
    expect(r.inferences.length).toBeGreaterThanOrEqual(6);
    for (const inf of r.inferences) {
      expect(inf.registry_anchor_id).toMatch(/^pd_/);
    }
  });

  it('does NOT produce LC fields (architecture, lighting)', () => {
    const r = inferPD(detectivePubContext(), { entity_key: 'pub', canonical_name: 'The Red Lion', spatial_function: 'hospitality' });
    const fields = r.inferences.map(i => i.field);
    expect(fields).not.toContain('architecture_style');
    expect(fields).not.toContain('lighting_character');
    expect(fields).not.toContain('material_palette');
  });

  it('does NOT produce VL fields (contrast, colour)', () => {
    const r = inferPD(detectivePubContext(), { entity_key: 'pub', canonical_name: 'The Red Lion', spatial_function: 'hospitality' });
    const fields = r.inferences.map(i => i.field);
    expect(fields).not.toContain('contrast_model');
    expect(fields).not.toContain('colour_philosophy');
    expect(fields).not.toContain('lighting_philosophy');
  });

  it('does NOT produce prop fields (primary_prop)', () => {
    const r = inferPD(detectivePubContext(), { entity_key: 'pub', canonical_name: 'The Red Lion', spatial_function: 'hospitality' });
    const fields = r.inferences.map(i => i.field);
    expect(fields).not.toContain('primary_prop');
  });
});

describe('PD — Sparse: "A rider approaches a capital"', () => {
  it('produces civic dressing_style for capital', () => {
    const r = inferPD(fantasyCapitalContext(), { entity_key: 'capital', canonical_name: 'Capital', spatial_function: 'civic' });
    const inf = r.inferences.find(i => i.field === 'dressing_style');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/civic|institutional|formal/);
  });

  it('produces surface_treatment', () => {
    const r = inferPD(fantasyCapitalContext(), { entity_key: 'capital', canonical_name: 'Capital', spatial_function: 'civic' });
    const inf = r.inferences.find(i => i.field === 'surface_treatment');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/painted|institutional|neutral/);
  });

  it('produces different dressing than pub', () => {
    const pub = inferPD(detectivePubContext(), { entity_key: 'pub', canonical_name: 'Pub', spatial_function: 'hospitality' });
    const cap = inferPD(fantasyCapitalContext(), { entity_key: 'capital', canonical_name: 'Capital', spatial_function: 'civic' });
    const pubDress = pub.inferences.find(i => i.field === 'dressing_style')!.value;
    const capDress = cap.inferences.find(i => i.field === 'dressing_style')!.value;
    expect(pubDress).not.toBe(capDress);
  });
});

describe('PD — Sparse: "A courier runs through a district"', () => {
  it('produces dressing via catch-all or match for unknown spatial context', () => {
    const r = inferPD(scifiDistrictContext(), { entity_key: 'district', canonical_name: 'District', spatial_function: 'commercial' });
    expect(r.inference_count).toBeGreaterThanOrEqual(4);
    const inf = r.inferences.find(i => i.field === 'dressing_style');
    expect(inf).toBeDefined();
  });
});

describe('PD — Sparse: "A child hears something inside the walls"', () => {
  it('produces horror-appropriate atmosphere', () => {
    const r = inferPD(horrorHouseContext(), { entity_key: 'house', canonical_name: 'House', spatial_function: 'residential' });
    const inf = r.inferences.find(i => i.field === 'atmosphere_physics');
    // May match horror anchor or catch-all
    expect(inf).toBeDefined();
  });

  it('produces dressing_style for house', () => {
    const r = inferPD(horrorHouseContext(), { entity_key: 'house', canonical_name: 'House', spatial_function: 'residential' });
    const inf = r.inferences.find(i => i.field === 'dressing_style');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/home|dressing/);
  });
});

describe('PD — Cross-Regime Differentiation', () => {
  it('noir pub vs fantasy capital produce different dressing', () => {
    const pub = inferPD(detectivePubContext(), { entity_key: 'pub', canonical_name: 'Pub', spatial_function: 'hospitality' });
    const cap = inferPD(fantasyCapitalContext(), { entity_key: 'capital', canonical_name: 'Capital', spatial_function: 'civic' });
    expect(pub.inference_count).toBeGreaterThan(0);
    expect(cap.inference_count).toBeGreaterThan(0);
    const pubFields = pub.inferences.filter(i => i.field === 'dressing_style' || i.field === 'surface_treatment').map(i => i.value);
    const capFields = cap.inferences.filter(i => i.field === 'dressing_style' || i.field === 'surface_treatment').map(i => i.value);
    for (const pf of pubFields) {
      expect(capFields).not.toContain(pf);
    }
  });
});

describe('PD — CDG Registration', () => {
  it('registers with D6 node', () => {
    const r = inferPD(detectivePubContext(), { entity_key: 'pub', canonical_name: 'Pub', spatial_function: 'hospitality' });
    const reg = buildCDGRegistration('test-pd', 'pd', 'pub', r.inferences);
    expect(reg).not.toBeNull();
    expect(reg!.node_id).toBe('D6');
    expect(reg!.cpie_node_id).toBe('C6');
  });
});
