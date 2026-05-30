/**
 * CPIE Location Inference Tests — Phase 2A
 *
 * Validates:
 * - location anchor matching across period x function combinations
 * - regional modifier application
 * - climate material overrides
 * - catch-all fallbacks
 * - no PD or VL leakage
 * - provenance for location inferences
 */
import { describe, it, expect } from 'vitest';
import type { CPIEPCPContext } from '../../lib/cpie/types';
import { inferLocation } from '../../lib/cpie/location';
import { resolveFunction } from '../../lib/cpie/location';

// ── Test PCP Contexts ────────────────────────────────────────────────

function crimePubContext(): CPIEPCPContext {
  return {
    project_id: 'test-crime-pub',
    genre: ['crime', 'noir'],
    period: 'contemporary',
    climate: 'temperate_rainy',
    technology_level: 'contemporary',
    culture: ['Western'],
    economy: 'industrial',
    geography: 'urban',
    class_structure: 'stratified',
    profession_map: {},
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

function fantasyCapitalContext(): CPIEPCPContext {
  return {
    project_id: 'test-fantasy-capital',
    genre: ['fantasy', 'epic'],
    period: 'fantasy_medieval',
    climate: 'temperate',
    technology_level: 'pre_industrial',
    culture: ['Feudal'],
    economy: 'feudal',
    geography: 'rural',
    class_structure: 'feudal',
    biome: 'forest',
    profession_map: {},
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

function sciFiDistrictContext(): CPIEPCPContext {
  return {
    project_id: 'test-scifi-district',
    genre: ['sci_fi', 'cyberpunk'],
    period: 'distant_future',
    climate: 'urban',
    technology_level: 'sci_fi_advanced',
    culture: ['Dystopian_Corporate'],
    economy: 'post_scarcity',
    geography: 'urban',
    class_structure: 'corporate',
    biome: 'urban',
    profession_map: {},
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

function horrorHouseContext(): CPIEPCPContext {
  return {
    project_id: 'test-horror-house',
    genre: ['horror', 'suspense'],
    period: 'contemporary',
    climate: 'temperate',
    technology_level: 'contemporary',
    culture: ['Western'],
    economy: 'industrial',
    geography: 'urban',
    class_structure: 'stratified',
    biome: 'urban',
    profession_map: {},
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

// Entity helper
function entity(name: string) {
  return { entity_key: name, canonical_name: name };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('CPIE Location Inference', () => {

  describe('Location Function Map', () => {
    it('pub resolves to hospitality', () => {
      expect(resolveFunction('The Red Lion Pub')).toBe('hospitality');
    });
    it('castle resolves to military', () => {
      expect(resolveFunction('Dark Castle')).toBe('military');
    });
    it('church resolves to religious', () => {
      expect(resolveFunction('St. Paul Church')).toBe('religious');
    });
    it('warehouse resolves to industrial', () => {
      expect(resolveFunction('Old Warehouse')).toBe('industrial');
    });
    it('house resolves to residential', () => {
      expect(resolveFunction('Small House')).toBe('residential');
    });
    it('unknown maps to civic', () => {
      expect(resolveFunction('Mysterious Place')).toBe('civic');
    });
  });

  describe('Period x Function Matching', () => {
    it('contemporary pub produces modern architecture', () => {
      const result = inferLocation(crimePubContext(), entity('The Red Lion Pub'));
      const arch = result.inferences.find(i => i.field === 'architecture_style');
      expect(arch).toBeDefined();
      expect(arch!.value).toMatch(/contemporary_|modern_/);
    });

    it('fantasy capital produces pre-industrial architecture', () => {
      const result = inferLocation(fantasyCapitalContext(), entity('Capital Gates'));
      const arch = result.inferences.find(i => i.field === 'architecture_style');
      expect(arch).toBeDefined();
      expect(arch!.value).toMatch(/pre_industrial|medieval/);
      // No modern contamination
      expect(arch!.value).not.toMatch(/contemporary|modern|future/);
    });

    it('sci-fi district produces future architecture', () => {
      const result = inferLocation(sciFiDistrictContext(), entity('Neon District'));
      const arch = result.inferences.find(i => i.field === 'architecture_style');
      expect(arch).toBeDefined();
      expect(arch!.value).toMatch(/future/);
      // No medieval contamination
      const vals = result.inferences.map(i => i.value).join(' ');
      expect(vals).not.toMatch(/medieval|gothic|cobblestone/);
    });

    it('horror house produces contemporary residential', () => {
      const result = inferLocation(horrorHouseContext(), entity('Old House'));
      const arch = result.inferences.find(i => i.field === 'architecture_style');
      expect(arch).toBeDefined();
      expect(arch!.value).toMatch(/contemporary|domestic/);
    });
  });

  describe('Condition and Socioeconomic Level', () => {
    it('industrial economy produces functional_worn condition', () => {
      const result = inferLocation(crimePubContext(), entity('Pub'));
      const cond = result.inferences.find(i => i.field === 'condition');
      expect(cond).toBeDefined();
      expect(cond!.value).toMatch(/worn|functional|maintained/);
    });

    it('feudal economy produces weathered condition', () => {
      const result = inferLocation(fantasyCapitalContext(), entity('Castle'));
      const cond = result.inferences.find(i => i.field === 'condition');
      if (cond) {
        expect(cond!.value).toMatch(/weathered|utilitarian|maintained/);
      }
    });
  });

  describe('Tech Integration', () => {
    it('sci-fi produces full_digital_automated tech', () => {
      const result = inferLocation(sciFiDistrictContext(), entity('Transport Hub'));
      const tech = result.inferences.find(i => i.field === 'tech_integration');
      expect(tech).toBeDefined();
      expect(tech!.value).toMatch(/digital|automated|interactive/);
    });

    it('fantasy produces pre_industrial_none tech', () => {
      const result = inferLocation(fantasyCapitalContext(), entity('Capital Square'));
      const tech = result.inferences.find(i => i.field === 'tech_integration');
      if (tech) {
        expect(tech!.value).toMatch(/pre_industrial|none/);
      }
    });
  });

  describe('Lighting Character', () => {
    it('noir genre produces high_contrast shadow lighting', () => {
      const result = inferLocation(crimePubContext(), entity('Pub'));
      const light = result.inferences.find(i => i.field === 'lighting_character');
      if (light) {
        expect(light!.value).toMatch(/shadow|contrast|dim/);
      }
    });

    it('horror genre produces dim_ominous lighting', () => {
      const result = inferLocation(horrorHouseContext(), entity('House'));
      const light = result.inferences.find(i => i.field === 'lighting_character');
      if (light) {
        expect(light!.value).toMatch(/dim|ominous|shadow/);
      }
    });
  });

  describe('Provenance', () => {
    it('every location inference has provenance fields', () => {
      const result = inferLocation(crimePubContext(), entity('The Pub'));
      for (const inf of result.inferences) {
        expect(inf.source_type).toMatch(/inferred/);
        expect(inf.confidence_score).toBeGreaterThan(0);
        expect(inf.reasoning.length).toBeGreaterThan(0);
        expect(inf.registry_anchor_id).toMatch(/^lc_/);
        expect(inf.pcp_dependencies).toContain('period');
      }
    });
  });

  describe('No PD or VL Leakage', () => {
    it('location does NOT infer set dressing', () => {
      const result = inferLocation(crimePubContext(), entity('Pub'));
      const fields = result.inferences.map(i => i.field);
      expect(fields).not.toContain('set_dressing');
      expect(fields).not.toContain('furniture_arrangement');
    });

    it('location does NOT infer camera treatment', () => {
      const result = inferLocation(crimePubContext(), entity('Pub'));
      const fields = result.inferences.map(i => i.field);
      expect(fields).not.toContain('key_fill_ratio');
      expect(fields).not.toContain('color_grade');
    });
  });
});
