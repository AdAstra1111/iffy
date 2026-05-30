/**
 * Shared test helpers for CPIE tests.
 * Provides pre-built PCP contexts for the 3 sparse narrative cases.
 */
import type { CPIEPCPContext } from '../../src/lib/cpie/types';

export function crimeDetectiveContext(): CPIEPCPContext {
  return {
    project_id: 'test-crime-detective',
    genre: ['crime', 'noir'],
    period: 'contemporary',
    climate: 'temperate_rainy',
    technology_level: 'contemporary',
    culture: ['Western'],
    profession_map: {
      protagonist: {
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

export function fantasyRiderContext(): CPIEPCPContext {
  return {
    project_id: 'test-fantasy-rider',
    genre: ['fantasy', 'epic'],
    period: 'fantasy_medieval',
    climate: 'temperate',
    technology_level: 'pre_industrial',
    culture: ['Feudal'],
    profession_map: {
      rider: {
        character_name: 'Rider',
        profession: 'knight',
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

export function sciFiCourierContext(): CPIEPCPContext {
  return {
    project_id: 'test-scifi-courier',
    genre: ['sci_fi', 'cyberpunk'],
    period: 'distant_future',
    climate: 'urban',
    technology_level: 'sci_fi_advanced',
    culture: ['Dystopian_Corporate'],
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
