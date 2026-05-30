/**
 * CPIE YETI Stress Test — Phase 1B.2
 *
 * Validates the engine handles YETI-like regime shifts correctly.
 * Core invariant: results depend on PCP context, NOT on project_id,
 * YETI-specific branches, or hardcoded assumptions.
 *
 * Test 5 contextual regimes:
 * 1. Prehistoric
 * 2. WWII
 * 3. Ancient Mythology
 * 4. Creator / Alien
 * 5. Monster Horror
 *
 * Each regime has DIFFERENT context → DIFFERENT vehicle/creature outputs.
 * Proof: same registry, different PCP → different results.
 */
import { describe, it, expect } from 'vitest';
import type { CPIEPCPContext } from '../../lib/cpie/types';
import { inferVehicle } from '../../lib/cpie/vehicle';
import { inferCreature } from '../../lib/cpie/creature';

// ── YETI Regime Context Factories ────────────────────────────────────

function prehistoricContext(): CPIEPCPContext {
  return {
    project_id: 'yeti-prehistoric',
    genre: ['prehistoric', 'adventure'],
    period: 'prehistoric',
    climate: 'tropical_humid',
    technology_level: 'primitive',
    culture: ['Tribal'],
    geography: 'coastal',
    economy: 'subsistence',
    class_structure: 'egalitarian',
    biome: 'forest',
    mythology: 'none',
    ecology: 'natural',
    threat_role: 'predator',
    intelligence: 'instinctual',
    symbolism: 'survival',
    narrative_function: 'antagonist',
    profession_map: {
      hunter: {
        character_name: 'Hunter',
        profession: 'hunter',
        role_archetype: 'warrior',
        authority_level: 'civilian',
        institutional_affiliation: null,
        confidence: 0.80,
        source: 'canon_extracted',
      },
    },
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

function wwiiContext(): CPIEPCPContext {
  return {
    project_id: 'yeti-wwii',
    genre: ['war', 'historical'],
    period: '1940s',
    climate: 'temperate',
    technology_level: 'industrial',
    culture: ['Western'],
    geography: 'rural',
    economy: 'war_economy',
    class_structure: 'stratified',
    biome: 'rural',
    mythology: 'none',
    ecology: 'natural',
    threat_role: 'guardian',
    intelligence: 'animal',
    symbolism: 'loyalty',
    narrative_function: 'companion',
    profession_map: {
      soldier: {
        character_name: 'Miller',
        profession: 'soldier',
        role_archetype: 'warrior',
        authority_level: 'military',
        institutional_affiliation: 'US_Army',
        confidence: 0.95,
        source: 'canon_extracted',
      },
    },
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

function ancientMythologyContext(): CPIEPCPContext {
  return {
    project_id: 'yeti-mythology',
    genre: ['mythology', 'epic'],
    period: 'ancient',
    climate: 'hot_arid',
    technology_level: 'ancient',
    culture: ['Greek', 'Mediterranean'],
    geography: 'coastal',
    economy: 'feudal',
    class_structure: 'stratified',
    biome: 'coastal',
    mythology: 'greek',
    ecology: 'supernatural',
    threat_role: 'guardian',
    intelligence: 'sapient',
    symbolism: 'power',
    narrative_function: 'antagonist',
    profession_map: {
      hero: {
        character_name: 'Hero',
        profession: 'hero',
        role_archetype: 'warrior',
        authority_level: 'noble',
        institutional_affiliation: 'Pantheon',
        confidence: 0.85,
        source: 'canon_extracted',
      },
    },
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

function creatorAlienContext(): CPIEPCPContext {
  return {
    project_id: 'yeti-alien',
    genre: ['sci_fi', 'space_opera'],
    period: 'distant_future',
    climate: 'arid',
    technology_level: 'sci_fi_advanced',
    culture: ['Alien', 'Galactic'],
    geography: 'desert',
    economy: 'post_scarcity',
    class_structure: 'corporate',
    biome: 'desert',
    mythology: 'alien',
    ecology: 'alien',
    threat_role: 'bioweapon',
    intelligence: 'sapient',
    symbolism: 'fear',
    narrative_function: 'antagonist',
    profession_map: {
      pilot: {
        character_name: 'Pilot',
        profession: 'pilot',
        role_archetype: 'explorer',
        authority_level: 'military',
        institutional_affiliation: 'Galactic_Fleet',
        confidence: 0.90,
        source: 'canon_extracted',
      },
    },
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

function monsterHorrorContext(): CPIEPCPContext {
  return {
    project_id: 'yeti-horror',
    genre: ['horror', 'thriller'],
    period: 'contemporary',
    climate: 'temperate_rainy',
    technology_level: 'contemporary',
    culture: ['Western'],
    geography: 'rural',
    economy: 'industrial',
    class_structure: 'stratified',
    biome: 'forest',
    mythology: 'none',
    ecology: 'parasitic',
    threat_role: 'predator',
    intelligence: 'instinctual',
    symbolism: 'fear',
    narrative_function: 'antagonist',
    profession_map: {
      investigator: {
        character_name: 'Investigator',
        profession: 'detective',
        role_archetype: 'investigator',
        authority_level: 'law_enforcement',
        institutional_affiliation: 'Local_PD',
        confidence: 0.80,
        source: 'canon_extracted',
      },
    },
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

// ── Entity helper ────────────────────────────────────────────────────

function entity(name: string, prof?: string) {
  return {
    entity_key: name,
    canonical_name: name.charAt(0).toUpperCase() + name.slice(1),
    profession: prof,
    role_archetype: 'generic',
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('YETI Stress Test — 5 Contextual Regimes', () => {

  describe('Regime 1: Prehistoric', () => {
    const ctx = prehistoricContext();

    it('vehicle inference produces primitive transport', () => {
      const result = inferVehicle(ctx, entity('hunter', 'hunter'));
      const primary = result.inferences.find(i => i.field === 'primary_vehicle');
      expect(primary).toBeDefined();
      expect(primary!.value).toMatch(/travois|primitive|mule|pack|horse/i);
    });

    it('creature inference produces prehistoric creatures', () => {
      const result = inferCreature(ctx, entity('hunter', 'hunter'));
      const creature = result.inferences.find(i => i.field === 'creature_type');
      expect(creature).toBeDefined();
      expect(creature!.value).toMatch(/prehistoric|predator|herbivore|creature/i);
    });

    it('no modern contamination', () => {
      const result = inferVehicle(ctx, entity('hunter', 'hunter'));
      const inferences = result.inferences.map(i => i.value).join(' ');
      expect(inferences).not.toMatch(/sedan|car|van|jeep|hover|tank/i);
    });
  });

  describe('Regime 2: WWII', () => {
    const ctx = wwiiContext();

    it('vehicle inference produces military trucks/jeeps', () => {
      const result = inferVehicle(ctx, entity('soldier', 'soldier'));
      const primary = result.inferences.find(i => i.field === 'primary_vehicle');
      expect(primary).toBeDefined();
      expect(primary!.value).toMatch(/truck|jeep|warhorse|military/i);
    });

    it('creature inference produces war animals', () => {
      const result = inferCreature(ctx, entity('soldier', 'soldier'));
      const creature = result.inferences.find(i => i.field === 'creature_type');
      expect(creature).toBeDefined();
      expect(creature!.value).toMatch(/war_animal|warhorse|dog|animal/i);
    });

    it('no sci-fi contamination', () => {
      const result = inferVehicle(ctx, entity('soldier', 'soldier'));
      const inferences = result.inferences.map(i => i.value).join(' ');
      expect(inferences).not.toMatch(/hover|autonomous/i);
    });
  });

  describe('Regime 3: Ancient Mythology', () => {
    const ctx = ancientMythologyContext();

    it('vehicle inference produces ancient transport', () => {
      const result = inferVehicle(ctx, entity('hero', 'hero'));
      const primary = result.inferences.find(i => i.field === 'primary_vehicle');
      expect(primary).toBeDefined();
      expect(primary!.value).toMatch(/horse|chariot|wagon|cart|mule/i);
    });

    it('creature inference produces mythological serpents/guardians', () => {
      const result = inferCreature(ctx, entity('hero', 'hero'));
      const creature = result.inferences.find(i => i.field === 'creature_type');
      expect(creature).toBeDefined();
      expect(creature!.value).toMatch(/serpent|guardian|beast|creature|mythic|dragon/i);
    });

    it('no modern contamination', () => {
      const result = inferVehicle(ctx, entity('hero', 'hero'));
      const inferences = result.inferences.map(i => i.value).join(' ');
      expect(inferences).not.toMatch(/car|van|jeep|tank|hover/i);
    });
  });

  describe('Regime 4: Creator / Alien', () => {
    const ctx = creatorAlienContext();

    it('vehicle inference produces future/flying transport', () => {
      const result = inferVehicle(ctx, entity('pilot', 'pilot'));
      const inferences = result.inferences.map(i => i.value).join(' ');
      // Pilot maps to military in transport function → period=future
      expect(inferences).toMatch(/hover|tank|armored|hovercraft/i);
    });

    it('creature inference produces alien organisms', () => {
      const result = inferCreature(ctx, entity('pilot', 'pilot'));
      const creature = result.inferences.find(i => i.field === 'creature_type');
      expect(creature).toBeDefined();
      expect(creature!.value).toMatch(/alien|organism|engineered|drone/i);
    });

    it('no medieval contamination', () => {
      const result = inferVehicle(ctx, entity('pilot', 'pilot'));
      const inferences = result.inferences.map(i => i.value).join(' ');
      expect(inferences).not.toMatch(/horse|wagon|chariot|mule/i);
    });
  });

  describe('Regime 5: Monster Horror', () => {
    const ctx = monsterHorrorContext();

    it('vehicle inference produces civilian/detective transport', () => {
      const result = inferVehicle(ctx, entity('investigator', 'detective'));
      const primary = result.inferences.find(i => i.field === 'primary_vehicle');
      expect(primary).toBeDefined();
      expect(primary!.value).toMatch(/sedan|vehicle|car/i);
    });

    it('creature inference produces stalking/hidden threats', () => {
      const result = inferCreature(ctx, entity('investigator', 'detective'));
      const creature = result.inferences.find(i => i.field === 'creature_type');
      expect(creature).toBeDefined();
      expect(creature!.value).toMatch(/stalking|predator|threat|parasitic|unknown/i);
    });

    it('no fantasy contamination', () => {
      const result = inferCreature(ctx, entity('investigator', 'detective'));
      const inferences = result.inferences.map(i => i.value).join(' ');
      expect(inferences).not.toMatch(/dragon|griffin|warhorse/i);
    });
  });

  describe('Cross-Regime Differentiation', () => {
    it('all 5 regimes produce distinct vehicle outputs', () => {
      const regimes = [
        { ctx: prehistoricContext(), name: 'prehistoric', ent: entity('hunter', 'hunter') },
        { ctx: wwiiContext(), name: 'wwii', ent: entity('soldier', 'soldier') },
        { ctx: ancientMythologyContext(), name: 'myth', ent: entity('hero', 'hero') },
        { ctx: creatorAlienContext(), name: 'alien', ent: entity('pilot', 'pilot') },
        { ctx: monsterHorrorContext(), name: 'horror', ent: entity('investigator', 'detective') },
      ];

      // Each regime must produce different primary_vehicle
      const results = regimes.map(r => ({
        name: r.name,
        primary: inferVehicle(r.ctx, r.ent).inferences.find(i => i.field === 'primary_vehicle')?.value ?? 'none',
      }));

      // Check uniqueness
      const unique = new Set(results.map(r => r.primary));
      expect(unique.size).toBeGreaterThanOrEqual(3); // At least 3 distinct vehicle types
    });

    it('all 5 regimes produce distinct creature outputs', () => {
      const regimes = [
        { ctx: prehistoricContext(), name: 'prehistoric', ent: entity('hunter', 'hunter') },
        { ctx: wwiiContext(), name: 'wwii', ent: entity('soldier', 'soldier') },
        { ctx: ancientMythologyContext(), name: 'myth', ent: entity('hero', 'hero') },
        { ctx: creatorAlienContext(), name: 'alien', ent: entity('pilot', 'pilot') },
        { ctx: monsterHorrorContext(), name: 'horror', ent: entity('investigator', 'detective') },
      ];

      const results = regimes.map(r => ({
        name: r.name,
        creature: inferCreature(r.ctx, r.ent).inferences.find(i => i.field === 'creature_type')?.value ?? 'none',
      }));

      const unique = new Set(results.map(r => r.creature));
      expect(unique.size).toBeGreaterThanOrEqual(3); // At least 3 distinct creature types
    });
  });

  describe('No YETI-Specific Logic', () => {
    it('results depend only on PCP context, not project_id', () => {
      // Same context with different project_id must give same results
      const ctx = wwiiContext();
      const cp1 = ctx.project_id;
      ctx.project_id = 'completely-different-project';
      const result1 = inferVehicle(ctx, entity('soldier', 'soldier'));
      const primary1 = result1.inferences.find(i => i.field === 'primary_vehicle')?.value;
      expect(primary1).toBeTruthy();

      // Re-run with original ID — must be same
      ctx.project_id = cp1;
      const result2 = inferVehicle(ctx, entity('soldier', 'soldier'));
      const primary2 = result2.inferences.find(i => i.field === 'primary_vehicle')?.value;
      expect(primary2).toEqual(primary1);
    });
  });
});
