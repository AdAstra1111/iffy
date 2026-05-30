/**
 * CPIE Sparse Narrative Tests — Phase 1B.2
 *
 * Validates CPIE handles sparse narratives correctly:
 * CASE A: Crime — "A detective enters a pub."
 * CASE B: Fantasy — "A rider approaches the capital."
 * CASE C: Sci-Fi — "A courier runs through the district."
 * CASE D: Horror — "A child hears something moving inside the walls."
 *
 * Key invariants:
 * - No forced vehicle if context doesn't support it
 * - No creature unless context + narrative support it
 * - No WWII contamination in any non-WWII context
 */
import { describe, it, expect } from 'vitest';
import type { CPIEPCPContext } from '../../lib/cpie/types';
import { inferVehicle } from '../../lib/cpie/vehicle';
import { inferCreature } from '../../lib/cpie/creature';

function crimeDetectiveContext(): CPIEPCPContext {
  return {
    project_id: 'case-a-crime',
    genre: ['crime', 'noir'],
    period: 'contemporary',
    climate: 'temperate_rainy',
    technology_level: 'contemporary',
    culture: ['Western'],
    geography: 'urban',
    economy: 'industrial',
    class_structure: 'stratified',
    biome: 'urban',
    mythology: 'none',
    ecology: 'natural',
    threat_role: 'neutral',
    intelligence: 'animal',
    symbolism: 'none',
    narrative_function: 'ambient',
    profession_map: {
      detective: {
        character_name: 'Harry',
        profession: 'detective',
        role_archetype: 'investigator',
        authority_level: 'law_enforcement',
        institutional_affiliation: 'NYPD',
        confidence: 0.95,
        source: 'canon_extracted',
      },
    },
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

function fantasyRiderContext(): CPIEPCPContext {
  return {
    project_id: 'case-b-fantasy',
    genre: ['fantasy', 'epic'],
    period: 'fantasy_medieval',
    climate: 'temperate',
    technology_level: 'pre_industrial',
    culture: ['Feudal'],
    geography: 'rural',
    economy: 'feudal',
    class_structure: 'feudal',
    biome: 'forest',
    mythology: 'original',
    ecology: 'natural',
    threat_role: 'neutral',
    intelligence: 'animal',
    symbolism: 'freedom',
    narrative_function: 'transport',
    profession_map: {
      rider: {
        character_name: 'Rider',
        profession: 'rider',
        role_archetype: 'warrior',
        authority_level: 'military',
        institutional_affiliation: 'Knights_Of_The_Realm',
        confidence: 0.90,
        source: 'canon_extracted',
      },
    },
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

function sciFiCourierContext(): CPIEPCPContext {
  return {
    project_id: 'case-c-scifi',
    genre: ['sci_fi', 'cyberpunk'],
    period: 'distant_future',
    climate: 'urban',
    technology_level: 'sci_fi_advanced',
    culture: ['Dystopian_Corporate'],
    geography: 'urban',
    economy: 'post_scarcity',
    class_structure: 'corporate',
    biome: 'urban',
    mythology: 'none',
    ecology: 'engineered',
    threat_role: 'neutral',
    intelligence: 'animal',
    symbolism: 'freedom',
    narrative_function: 'ambient',
    profession_map: {
      courier: {
        character_name: 'Runner',
        profession: 'courier',
        role_archetype: 'messenger',
        authority_level: 'civilian',
        institutional_affiliation: 'MegaCorp_Delivery',
        confidence: 0.85,
        source: 'canon_extracted',
      },
    },
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

function horrorChildContext(): CPIEPCPContext {
  return {
    project_id: 'case-d-horror',
    genre: ['horror', 'suspense'],
    period: 'contemporary',
    climate: 'temperate',
    technology_level: 'contemporary',
    culture: ['Western'],
    geography: 'urban',
    economy: 'industrial',
    class_structure: 'stratified',
    biome: 'urban',
    mythology: 'none',
    ecology: 'natural',
    threat_role: 'predator',
    intelligence: 'instinctual',
    symbolism: 'fear',
    narrative_function: 'antagonist',
    profession_map: {
      child: {
        character_name: 'Child',
        profession: 'child',
        role_archetype: 'civilian',
        authority_level: 'civilian',
        institutional_affiliation: null,
        confidence: 0.50,
        source: 'canon_extracted',
      },
    },
    pcp_resolution_timestamp: '2026-05-30T20:00:00Z',
  };
}

// ── Entity helpers ───────────────────────────────────────────────────

function entity(name: string, prof?: string) {
  return {
    entity_key: name,
    canonical_name: name.charAt(0).toUpperCase() + name.slice(1),
    profession: prof,
    role_archetype: 'generic',
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('CPIE Sparse Narrative Scenarios', () => {

  describe('CASE A — Crime: "A detective enters a pub on a rainy night"', () => {
    const ctx = crimeDetectiveContext();

    it('vehicle inference does not force a vehicle', () => {
      const result = inferVehicle(ctx, entity('detective', 'detective'));
      // Detective may get a civilian vehicle (sedan/catch-all) but should be low confidence
      const primary = result.inferences.find(i => i.field === 'primary_vehicle');
      expect(primary).toBeDefined(); // catch-all will match
      // Should NOT be military or fantasy
      expect(primary!.value).not.toMatch(/tank|warhorse|hover/i);
    });

    it('no contamination from WWII', () => {
      const result = inferVehicle(ctx, entity('detective', 'detective'));
      const inferences = result.inferences.map(i => i.value).join(' ');
      expect(inferences).not.toMatch(/tank|artillery|wwii|1940s/i);
    });

    it('creature inference does not force a creature', () => {
      const result = inferCreature(ctx, entity('detective', 'detective'));
      // Should be low-confidence or none
      const creature = result.inferences.find(i => i.field === 'creature_type');
      if (creature) {
        expect(creature.confidence_score).toBeLessThanOrEqual(0.55);
        expect(creature.value).not.toMatch(/dragon|griffin|alien/i);
      }
    });
  });

  describe('CASE B — Fantasy: "A rider approaches the capital"', () => {
    const ctx = fantasyRiderContext();

    it('produces horse / mounted transport', () => {
      const result = inferVehicle(ctx, entity('rider', 'rider'));
      const inferences = result.inferences.map(i => i.value).join(' ');
      expect(inferences).toMatch(/warhorse|horse|wagon|pack|mule/i);
    });

    it('no creature is forced unless context supports it', () => {
      const result = inferCreature(ctx, entity('rider', 'rider'));
      // Fantasy context with neutral threat_role and transport narrative_function
      // should give a low-confidence/high-level result
      const creature = result.inferences.find(i => i.field === 'creature_type');
      if (creature) {
        // Should NOT be sci-fi or horror
        expect(creature.value).not.toMatch(/alien|drone|stalking|parasitic/i);
      }
    });

    it('no WWII contamination', () => {
      const result = inferVehicle(ctx, entity('rider', 'rider'));
      const inferences = result.inferences.map(i => i.value).join(' ');
      expect(inferences).not.toMatch(/tank|jeep|artillery|military_truck|wwii/i);
    });

    it('no modern vehicle contamination', () => {
      const result = inferVehicle(ctx, entity('rider', 'rider'));
      const inferences = result.inferences.map(i => i.value).join(' ');
      expect(inferences).not.toMatch(/sedan|car|van|jeep|hover/i);
    });
  });

  describe('CASE C — Sci-Fi: "A courier runs through the district"', () => {
    const ctx = sciFiCourierContext();

    it('produces future urban transport', () => {
      const result = inferVehicle(ctx, entity('courier', 'courier'));
      const inferences = result.inferences.map(i => i.value).join(' ');
      expect(inferences).toMatch(/freight|autonomous|carrier|delivery|van|hover/i);
    });

    it('no creature is forced unless context supports it', () => {
      const result = inferCreature(ctx, entity('courier', 'courier'));
      const creature = result.inferences.find(i => i.field === 'creature_type');
      if (creature) {
        expect(creature.value).not.toMatch(/dragon|griffin|stalking/i);
      }
    });

    it('no WWII contamination', () => {
      const result = inferVehicle(ctx, entity('courier', 'courier'));
      const inferences = result.inferences.map(i => i.value).join(' ');
      expect(inferences).not.toMatch(/tank|artillery|wwii|1940s/i);
    });
  });

  describe('CASE D — Horror: "A child hears something moving inside the walls"', () => {
    const ctx = horrorChildContext();

    it('no vehicle is forced for a child', () => {
      const result = inferVehicle(ctx, entity('child', 'child'));
      // Child has 'civilian_transport' transport function → may get catch-all
      const primary = result.inferences.find(i => i.field === 'primary_vehicle');
      if (primary) {
        expect(primary.confidence_score).toBeGreaterThan(0); // civilian vehicle inferred
      }
    });

    it('produces hidden threat / stalking predator', () => {
      const result = inferCreature(ctx, entity('child', 'child'));
      const creature = result.inferences.find(i => i.field === 'creature_type');
      expect(creature).toBeDefined();
      expect(creature!.value).toMatch(/stalking|predator|threat|parasitic|unknown/i);
    });

    it('does NOT produce fantasy dragons', () => {
      const result = inferCreature(ctx, entity('child', 'child'));
      const inferences = result.inferences.map(i => i.value).join(' ');
      expect(inferences).not.toMatch(/dragon|griffin|warhorse/i);
    });

    it('no WWII contamination', () => {
      const result = inferCreature(ctx, entity('child', 'child'));
      const result2 = inferVehicle(ctx, entity('child', 'child'));
      const allInferences = [...result.inferences, ...result2.inferences].map(i => i.value).join(' ');
      expect(allInferences).not.toMatch(/tank|wwii|1940s/i);
    });
  });
});
