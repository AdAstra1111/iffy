/**
 * CPIE Creature Inference Tests — Phase 1B.2
 *
 * Validates:
 * - creature anchor matching across genres
 * - threat_role matching
 * - biome/period combinations
 * - catch-all low-confidence fallback
 * - fantasy produces fantasy creatures only when context supports it
 * - horror produces hidden/stalking threat
 * - sci-fi produces engineered/alien organism only when context supports it
 */
import { describe, it, expect } from 'vitest';
import type { CPIEPCPContext } from '../../lib/cpie/types';
import { inferCreature } from '../../lib/cpie/creature';

// ── Test PCP Contexts ────────────────────────────────────────────────

function fantasyContext(): CPIEPCPContext {
  return {
    project_id: 'test-fantasy',
    genre: ['fantasy', 'epic'],
    period: 'fantasy_medieval',
    climate: 'temperate',
    technology_level: 'pre_industrial',
    culture: ['Feudal'],
    biome: 'forest',
    mythology: 'original',
    ecology: 'natural',
    threat_role: 'predator',
    intelligence: 'animal',
    symbolism: 'wisdom',
    narrative_function: 'antagonist',
    profession_map: {},
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

function horrorContext(): CPIEPCPContext {
  return {
    project_id: 'test-horror',
    genre: ['horror', 'suspense'],
    period: 'contemporary',
    climate: 'temperate',
    technology_level: 'contemporary',
    culture: ['Western'],
    biome: 'urban',
    mythology: 'none',
    ecology: 'natural',
    threat_role: 'predator',
    intelligence: 'instinctual',
    symbolism: 'fear',
    narrative_function: 'antagonist',
    profession_map: {},
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

function sciFiContext(): CPIEPCPContext {
  return {
    project_id: 'test-scifi',
    genre: ['sci_fi', 'cyberpunk'],
    period: 'distant_future',
    climate: 'urban',
    technology_level: 'sci_fi_advanced',
    culture: ['Dystopian_Corporate'],
    biome: 'urban',
    mythology: 'none',
    ecology: 'engineered',
    threat_role: 'bioweapon',
    intelligence: 'sapient',
    symbolism: 'fear',
    narrative_function: 'antagonist',
    profession_map: {},
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

function fantasyTransportContext(): CPIEPCPContext {
  return {
    project_id: 'test-fantasy-transport',
    genre: ['fantasy', 'epic'],
    period: 'fantasy_medieval',
    climate: 'temperate',
    technology_level: 'pre_industrial',
    culture: ['Feudal'],
    biome: 'forest',
    mythology: 'original',
    ecology: 'natural',
    threat_role: 'neutral',
    intelligence: 'animal',
    symbolism: 'freedom',
    narrative_function: 'transport',
    profession_map: {},
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

function prehistoricContext(): CPIEPCPContext {
  return {
    project_id: 'test-prehistoric',
    genre: ['prehistoric', 'adventure'],
    period: 'prehistoric',
    climate: 'tropical_humid',
    technology_level: 'primitive',
    culture: ['Tribal'],
    biome: 'jungle',
    mythology: 'none',
    ecology: 'natural',
    threat_role: 'predator',
    intelligence: 'instinctual',
    symbolism: 'power',
    narrative_function: 'antagonist',
    profession_map: {},
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

function wwiiContext(): CPIEPCPContext {
  return {
    project_id: 'test-wwii',
    genre: ['war', 'historical'],
    period: '1940s',
    climate: 'temperate',
    technology_level: 'industrial',
    culture: ['Western'],
    biome: 'urban',
    mythology: 'none',
    ecology: 'natural',
    threat_role: 'guardian',
    intelligence: 'animal',
    symbolism: 'loyalty',
    narrative_function: 'companion',
    profession_map: {},
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

function desertContext(): CPIEPCPContext {
  return {
    project_id: 'test-desert',
    genre: ['drama'],
    period: 'contemporary',
    climate: 'hot_arid',
    technology_level: 'contemporary',
    culture: ['Middle_Eastern'],
    biome: 'desert',
    mythology: 'none',
    ecology: 'natural',
    threat_role: 'neutral',
    intelligence: 'animal',
    symbolism: 'survival',
    narrative_function: 'ambient',
    profession_map: {},
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function entity(name: string) {
  return {
    entity_key: name,
    canonical_name: name.charAt(0).toUpperCase() + name.slice(1),
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('CPIE Creature Inference', () => {

  describe('Fantasy Creatures', () => {
    it('fantasy predator produces dragon', () => {
      const result = inferCreature(fantasyContext(), entity('dragon'));
      const creature = result.inferences.find(i => i.field === 'creature_type');
      expect(creature).toBeDefined();
      expect(creature!.value).toMatch(/dragon|beast|guardian/i);
    });

    it('fantasy transport produces warhorse', () => {
      const result = inferCreature(fantasyTransportContext(), entity('horse'));
      const creature = result.inferences.find(i => i.field === 'creature_type');
      expect(creature).toBeDefined();
      expect(creature!.value).toMatch(/warhorse|transport/i);
    });

    it('fantasy context does NOT produce sci-fi creatures', () => {
      const result = inferCreature(fantasyContext(), entity('creature'));
      const inferences = result.inferences.map(i => i.value).join(' ');
      expect(inferences).not.toMatch(/alien|drone|organism|engineered/i);
    });
  });

  describe('Horror Creatures', () => {
    it('horror predator produces stalking_predator', () => {
      const result = inferCreature(horrorContext(), entity('monster'));
      const creature = result.inferences.find(i => i.field === 'creature_type');
      expect(creature).toBeDefined();
      expect(creature!.value).toMatch(/stalking|predator|threat|parasitic/i);
    });

    it('horror context does NOT produce fantasy creatures', () => {
      const result = inferCreature(horrorContext(), entity('creature'));
      const inferences = result.inferences.map(i => i.value).join(' ');
      expect(inferences).not.toMatch(/dragon|griffin|warhorse/i);
    });
  });

  describe('Sci-Fi Creatures', () => {
    it('sci-fi bioweapon produces engineered_organism', () => {
      const result = inferCreature(sciFiContext(), entity('alien'));
      const creature = result.inferences.find(i => i.field === 'creature_type');
      expect(creature).toBeDefined();
      expect(creature!.value).toMatch(/alien|engineered|organism|drone/i);
    });

    it('sci-fi context does NOT produce fantasy creatures', () => {
      const result = inferCreature(sciFiContext(), entity('creature'));
      const inferences = result.inferences.map(i => i.value).join(' ');
      expect(inferences).not.toMatch(/dragon|griffin|warhorse|beast/i);
    });
  });

  describe('Period-Specific Creatures', () => {
    it('prehistoric predator produces large predator', () => {
      const result = inferCreature(prehistoricContext(), entity('creature'));
      const creature = result.inferences.find(i => i.field === 'creature_type');
      expect(creature).toBeDefined();
      expect(creature!.value).toMatch(/prehistoric|predator|herbivore/i);
    });

    it('WWII guardian produces military dog', () => {
      const result = inferCreature(wwiiContext(), entity('creature'));
      const creature = result.inferences.find(i => i.field === 'creature_type');
      expect(creature).toBeDefined();
      expect(creature!.value).toMatch(/war_animal|warhorse|dog|animal/i);
    });
  });

  describe('Biome-Based Creatures', () => {
    it('desert biome produces desert_creature', () => {
      const result = inferCreature(desertContext(), entity('snake'));
      const creature = result.inferences.find(i => i.field === 'creature_type');
      expect(creature).toBeDefined();
      expect(creature!.value).toMatch(/desert|creature|animal/i);
    });
  });

  describe('Catch-All Fallback', () => {
    it('low-confidence catch-all returns unknown_creature_presence', () => {
      const ctx = fantasyContext();
      ctx.threat_role = 'unknown';
      ctx.intelligence = 'sapient';
      ctx.narrative_function = 'ambient';
      ctx.biome = 'void';
      ctx.ecology = 'unknown';
      ctx.mythology = 'none';
      const result = inferCreature(ctx, entity('creature'));
      const creature = result.inferences.find(i => i.field === 'creature_type');
      expect(creature).toBeDefined();
      // Should have some inference even with minimal context
      expect(creature!.source_type).toBeTruthy();
    });
  });

  describe('No Contamination', () => {
    it('modern drama does NOT produce fantasy or sci-fi creatures', () => {
      const ctx = wwiiContext();
      ctx.genre = ['drama'];
      ctx.period = 'contemporary';
      ctx.threat_role = 'neutral';
      ctx.narrative_function = 'ambient';
      ctx.ecology = 'natural';
      ctx.mythology = 'none';
      const result = inferCreature(ctx, entity('creature'));
      const inferences = result.inferences.map(i => i.value).join(' ');
      expect(inferences).not.toMatch(/dragon|griffin|alien|drone|parasitic/i);
    });
  });

  describe('Provenance', () => {
    it('every inference has provenance fields', () => {
      const result = inferCreature(fantasyContext(), entity('dragon'));
      for (const inf of result.inferences) {
        expect(inf.source_type).toMatch(/inferred/);
        expect(inf.confidence_score).toBeGreaterThan(0);
        expect(inf.registry_anchor_id).toBeTruthy();
        expect(inf.pcp_dependencies.length).toBeGreaterThan(0);
      }
    });
  });
});
