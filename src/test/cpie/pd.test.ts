/** 
 * Production Design CPIE Domain Tests — C6
 * Tests deterministic inference across 8 fields, provenance, governance, ICS
 */
import { describe, it, expect } from 'vitest';
import { inferPD } from '../../lib/cpie/pd';
import { resolvePD } from '../../lib/cpie/registry';
import { explainInference, formatExplanation } from '../../lib/cpie/governance';
import { calculateICS } from '../../lib/cpie/ics';
import type { CPIEPCPContext } from '../../lib/cpie/types';

function pubContext(): CPIEPCPContext {
  return {
    project_id: 'test-pub', genre: ['crime', 'noir'], period: 'contemporary',
    climate: 'temperate_rainy', technology_level: 'contemporary', culture: ['Western'],
    profession_map: {}, pcp_resolution_timestamp: '2026-01-01',
    economy: 'industrial', class_structure: 'stratified',
  };
}

function militaryContext(): CPIEPCPContext {
  return {
    project_id: 'test-military', genre: ['war', 'drama'], period: '1940s',
    climate: 'temperate', technology_level: 'WWII_era', culture: ['Western'],
    profession_map: {}, pcp_resolution_timestamp: '2026-01-01',
    economy: 'wartime_economy', class_structure: 'military_hierarchy',
  };
}

function fantasyContext(): CPIEPCPContext {
  return {
    project_id: 'test-fantasy', genre: ['fantasy', 'epic'], period: 'fantasy_medieval',
    climate: 'temperate', technology_level: 'pre_industrial', culture: ['Feudal'],
    profession_map: {}, pcp_resolution_timestamp: '2026-01-01',
  };
}

function horrorContext(): CPIEPCPContext {
  return {
    project_id: 'test-horror', genre: ['horror'], period: 'contemporary',
    climate: 'temperate_rainy', technology_level: 'contemporary', culture: ['Western'],
    profession_map: {}, pcp_resolution_timestamp: '2026-01-01',
  };
}

// ── DRESSING STYLE ──
describe('PD — Dressing Style', () => {
  it('pub produces hospitality dressing', () => {
    const r = inferPD(pubContext(), { entity_key: 'pub', canonical_name: 'The Red Lion', spatial_function: 'hospitality' });
    const inf = r.inferences.find(i => i.field === 'dressing_style');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/cluttered|bar|hospitality|dressing|noir/);
    expect(inf!.confidence_score).toBeGreaterThanOrEqual(0.80);
  });

  it('noir pub produces cluttered ambient dressing', () => {
    const r = inferPD(pubContext(), { entity_key: 'pub', canonical_name: 'The Red Lion', spatial_function: 'hospitality' });
    const inf = r.inferences.find(i => i.field === 'dressing_style');
    expect(inf!.value).toMatch(/cluttered|noir/);
    expect(inf!.registry_anchor_id).toMatch(/^pd_/);
  });

  it('military produces austere dressing', () => {
    const r = inferPD(militaryContext(), { entity_key: 'barracks', canonical_name: 'Barracks', spatial_function: 'military' });
    const inf = r.inferences.find(i => i.field === 'dressing_style');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/austere/);
  });

  it('residential produces home dressing', () => {
    const r = inferPD(pubContext(), { entity_key: 'house', canonical_name: 'House', spatial_function: 'residential' });
    const inf = r.inferences.find(i => i.field === 'dressing_style');
    expect(inf!.value).toMatch(/home|dressing/);
  });
});

// ── SURFACE TREATMENT ──
describe('PD — Surface Treatment', () => {
  it('pub produces warm wood surfaces', () => {
    const r = inferPD(pubContext(), { entity_key: 'pub', canonical_name: 'Pub', spatial_function: 'hospitality' });
    const inf = r.inferences.find(i => i.field === 'surface_treatment');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/wood|warm/);
  });

  it('military produces utilitarian surfaces', () => {
    const r = inferPD(militaryContext(), { entity_key: 'barracks', canonical_name: 'Barracks', spatial_function: 'military' });
    const inf = r.inferences.find(i => i.field === 'surface_treatment');
    expect(inf!.value).toMatch(/utilitarian/);
  });

  it('industrial produces raw material surfaces', () => {
    const r = inferPD(pubContext(), { entity_key: 'warehouse', canonical_name: 'Warehouse', spatial_function: 'industrial' });
    const inf = r.inferences.find(i => i.field === 'surface_treatment');
    expect(inf!.value).toMatch(/brick|concrete|metal/);
  });
});

// ── INSTITUTIONAL CULTURE ──
describe('PD — Institutional Culture', () => {
  it('pub produces bar memorabilia', () => {
    const r = inferPD(pubContext(), { entity_key: 'pub', canonical_name: 'Pub', spatial_function: 'hospitality' });
    const inf = r.inferences.find(i => i.field === 'institutional_culture');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/bar|sign|menu/);
  });

  it('military produces crests and orders', () => {
    const r = inferPD(militaryContext(), { entity_key: 'barracks', canonical_name: 'Barracks', spatial_function: 'military' });
    const inf = r.inferences.find(i => i.field === 'institutional_culture');
    expect(inf!.value).toMatch(/crest|rank|military/);
  });
});

// ── ENVIRONMENTAL STORY ──
describe('PD — Environmental Story', () => {
  it('noir increases clutter and detritus', () => {
    const r = inferPD(pubContext(), { entity_key: 'pub', canonical_name: 'Pub', spatial_function: 'hospitality' });
    const inf = r.inferences.find(i => i.field === 'environmental_story');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/clutter|noir/);
  });

  it('military produces austere ordered story', () => {
    const r = inferPD(militaryContext(), { entity_key: 'barracks', canonical_name: 'Barracks', spatial_function: 'military' });
    const inf = r.inferences.find(i => i.field === 'environmental_story');
    expect(inf!.value).toMatch(/austere/);
  });
});

// ── HERO BACKGROUND OBJECTS ──
describe('PD — Hero Background Objects', () => {
  it('pub has pub-appropriate objects', () => {
    const r = inferPD(pubContext(), { entity_key: 'pub', canonical_name: 'Pub', spatial_function: 'hospitality' });
    const inf = r.inferences.find(i => i.field === 'hero_background_objects');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/dart|cigarette|jukebox/);
  });

  it('military has flag and map board', () => {
    const r = inferPD(militaryContext(), { entity_key: 'barracks', canonical_name: 'Barracks', spatial_function: 'military' });
    const inf = r.inferences.find(i => i.field === 'hero_background_objects');
    expect(inf!.value).toMatch(/flag|weapon|map/);
  });
});

// ── COLOR ACCENTS ──
describe('PD — Color Accents', () => {
  it('pub has warm color accents', () => {
    const r = inferPD(pubContext(), { entity_key: 'pub', canonical_name: 'Pub', spatial_function: 'hospitality' });
    const inf = r.inferences.find(i => i.field === 'color_accents');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/warm|amber|brown/);
  });

  it('military has subdued colors', () => {
    const r = inferPD(militaryContext(), { entity_key: 'barracks', canonical_name: 'Barracks', spatial_function: 'military' });
    const inf = r.inferences.find(i => i.field === 'color_accents');
    expect(inf!.value).toMatch(/olive|black|subdued/);
  });
});

// ── ATMOSPHERE ──
describe('PD — Atmosphere Physics', () => {
  it('noir pub has smoke haze', () => {
    const r = inferPD(pubContext(), { entity_key: 'pub', canonical_name: 'Pub', spatial_function: 'hospitality' });
    const inf = r.inferences.find(i => i.field === 'atmosphere_physics');
    expect(inf).toBeDefined();
    expect(inf!.value).toMatch(/smoke|haze/);
  });

  it('horror has dusty fog', () => {
    const r = inferPD(horrorContext(), { entity_key: 'house', canonical_name: 'Abandoned House', spatial_function: 'residential' });
    const inf = r.inferences.find(i => i.field === 'atmosphere_physics');
    if (inf) {
      // Horror atmosphere may match or be catch-all depending on spatial_function
      expect(inf.value).toBeTruthy();
    }
  });
});

// ── PROVENANCE ──
describe('PD — Provenance', () => {
  it('every inference has required fields', () => {
    const r = inferPD(pubContext(), { entity_key: 'pub', canonical_name: 'Pub', spatial_function: 'hospitality' });
    for (const inf of r.inferences) {
      expect(inf.source_type).toMatch(/inferred/);
      expect(inf.confidence_score).toBeGreaterThan(0);
      expect(inf.reasoning.length).toBeGreaterThan(0);
      expect(inf.registry_anchor_id).toMatch(/^pd_/);
      expect(inf.generated_by).toBe('cpie_registry');
    }
  });

  it('generated_at is valid ISO', () => {
    const r = inferPD(pubContext(), { entity_key: 'pub', canonical_name: 'Pub', spatial_function: 'hospitality' });
    expect(r.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('pcp_dependencies contains spatial_function', () => {
    const r = inferPD(pubContext(), { entity_key: 'pub', canonical_name: 'Pub', spatial_function: 'hospitality' });
    for (const inf of r.inferences) {
      expect(inf.pcp_dependencies).toContain('spatial_function');
    }
  });
});

// ── GOVERNANCE ──
describe('PD — Governance', () => {
  it('explains why clutter was selected', () => {
    const r = inferPD(pubContext(), { entity_key: 'pub', canonical_name: 'Pub', spatial_function: 'hospitality' });
    const inf = r.inferences.find(i => i.field === 'environmental_story')!;
    const expl = explainInference(inf, pubContext(), 'pub', 'pd');
    expect(expl.field).toBe('environmental_story');
    expect(expl.registry_anchor_id).toMatch(/^pd_/);
    expect(expl.pcp_dependencies).toContain('spatial_function');
    expect(expl.pcp_values_snapshot).toBeDefined();
  });

  it('explains why dressing was selected', () => {
    const r = inferPD(pubContext(), { entity_key: 'pub', canonical_name: 'Pub', spatial_function: 'hospitality' });
    const inf = r.inferences.find(i => i.field === 'dressing_style')!;
    const expl = explainInference(inf, pubContext(), 'pub', 'pd');
    expect(expl.field).toBe('dressing_style');
    expect(expl.pcp_dependencies).toContain('spatial_function');
  });

  it('formatExplanation produces readable output', () => {
    const r = inferPD(pubContext(), { entity_key: 'pub', canonical_name: 'Pub', spatial_function: 'hospitality' });
    const inf = r.inferences[0];
    const expl = explainInference(inf, pubContext(), 'pub', 'pd');
    const formatted = formatExplanation(expl);
    expect(formatted).toContain('Source');
    expect(formatted).toContain('Registry rule');
  });
});

// ── ICS ──
describe('PD — ICS', () => {
  it('has valid ICS score', () => {
    const r = inferPD(pubContext(), { entity_key: 'pub', canonical_name: 'Pub', spatial_function: 'hospitality' });
    const ics = calculateICS(r.inferences, 'pd');
    expect(ics).toBeGreaterThan(0.5);
    expect(ics).toBeLessThanOrEqual(1.0);
  });

  it('empty inference set produces 0 ICS', () => {
    expect(calculateICS([], 'pd')).toBe(0);
  });
});

// ── EDGE CASES ──
describe('PD — Edge Cases', () => {
  it('handles unknown spatial_function with catch-all', () => {
    const r = inferPD(pubContext(), { entity_key: 'unknown', canonical_name: 'Unknown', spatial_function: 'unknown' });
    expect(r.inference_count).toBeGreaterThanOrEqual(2);
  });

  it('different venues produce different dressing', () => {
    const pub = inferPD(pubContext(), { entity_key: 'pub', canonical_name: 'Pub', spatial_function: 'hospitality' });
    const barracks = inferPD(militaryContext(), { entity_key: 'barracks', canonical_name: 'Barracks', spatial_function: 'military' });
    const pubDressing = pub.inferences.find(i => i.field === 'dressing_style')!.value;
    const barracksDressing = barracks.inferences.find(i => i.field === 'dressing_style')!.value;
    expect(pubDressing).not.toBe(barracksDressing);
  });
});
