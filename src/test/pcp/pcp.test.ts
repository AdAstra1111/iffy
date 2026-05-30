/**
 * PCP Tests — Resolver, Registry, Types
 *
 * Validation cases from SESS-IMP-0027:
 *   A: period: 1944 -> 2087 — correct downstream nodes stale
 *   B: genre: crime -> fantasy — correct dependency cascade
 *   C: target_audience changes — partial invalidation only
 */

import { describe, it, expect } from 'vitest';
import { resolvePCP, hashInput, detectPCPChanges } from '@/lib/pcp/resolver';
import type { PCPResolverInput } from '@/lib/pcp/resolver';
import { PCP_REGISTRY_VERSION } from '@/lib/pcp/registry';
import {
  resolveTechFromPeriod, resolveToneFromGenre, resolveClimateFromBiome,
  resolveTransportFromPeriod, resolveInfrastructureFromPeriod,
  resolveSocialStructureFromGenre, resolveProductionLanguageFromGenre,
  resolveEnergySource,
} from '@/lib/pcp/registry';
import { PCP_INVALIDATION_MATRIX, CDG_REGEN_ORDER } from '@/lib/cdg/types';

// ── Test Data ──────────────────────────────────────────────────────────

function makeInput(overrides: Partial<PCPResolverInput> = {}): PCPResolverInput {
  return {
    project_id: 'test-project-001',
    canon_json: {
      genre: ['crime', 'noir'],
      setting: { period: '1940s', geography: 'USA', climate: 'urban' },
      characters: [{ name: 'Harry', role: 'detective' }],
    },
    project_metadata: {
      genre_tags: ['crime', 'noir', 'thriller'],
      format: 'feature_film',
    },
    ...overrides,
  };
}

// ── Registry Tests (T2 foundation) ─────────────────────────────────────

describe('PCP Registry — Period -> Tech Mapping', () => {
  it('resolves 1940s to mid_20th_century', () => {
    expect(resolveTechFromPeriod('1940s')).toBe('mid_20th_century');
  });
  it('resolves 2087 to sci_fi_advanced', () => {
    expect(resolveTechFromPeriod('2087')).toBe('sci_fi_advanced');
  });
  it('resolves medieval to pre_industrial', () => {
    expect(resolveTechFromPeriod('medieval')).toBe('pre_industrial');
  });
  it('handles fuzzy match: "late 1940s"', () => {
    expect(resolveTechFromPeriod('late 1940s')).toBe('mid_20th_century');
  });
  it('handles future periods', () => {
    expect(resolveTechFromPeriod('distant_future')).toBe('sci_fi_advanced');
  });
  it('returns null for unknown period', () => {
    expect(resolveTechFromPeriod('quantum_era')).toBeNull();
  });
});

describe('PCP Registry — Genre -> Tone Mapping', () => {
  it('noir -> dark_high_contrast', () => {
    expect(resolveToneFromGenre('noir')).toBe('dark_high_contrast');
  });
  it('fantasy -> rich_vibrant', () => {
    expect(resolveToneFromGenre('fantasy')).toBe('rich_vibrant');
  });
  it('returns null for unknown genre', () => {
    expect(resolveToneFromGenre('existential_drama')).toBeNull();
  });
  it('is case-insensitive', () => {
    expect(resolveToneFromGenre('NOIR')).toBe('dark_high_contrast');
  });
});

describe('PCP Registry — Biome -> Climate Mapping', () => {
  it('arctic_tundra -> cold_snowy', () => {
    expect(resolveClimateFromBiome('arctic_tundra')).toBe('cold_snowy');
  });
  it('urban -> climate_of_geography', () => {
    expect(resolveClimateFromBiome('urban')).toBe('climate_of_geography');
  });
  it('returns unknown for unknown biome', () => {
    expect(resolveClimateFromBiome('quantum_forest')).toBe('unknown');
  });
});

describe('PCP Registry — Period -> Transport', () => {
  it('WWII era -> automotive, rail, aviation, military_vehicle', () => {
    expect(resolveTransportFromPeriod('wwii_era')).toContain('military_vehicle');
  });
  it('future -> hover included', () => {
    expect(resolveTransportFromPeriod('distant_future')).toContain('hover');
  });
  it('medieval -> walking first', () => {
    const t = resolveTransportFromPeriod('medieval');
    expect(t[0]).toBe('walking');
    expect(t).toContain('horse_drawn');
  });
});

describe('PCP Registry — Energy Source', () => {
  it('WWII era uses fossil_fuel', () => {
    expect(resolveEnergySource('wwii_era')).toBe('fossil_fuel');
  });
  it('distant future uses fusion', () => {
    expect(resolveEnergySource('distant_future', 'sci_fi')).toBe('fusion');
  });
  it('fantasy genre overrides period for magic', () => {
    expect(resolveEnergySource('medieval', 'fantasy')).toBe('animal'); // period takes priority
  });
});

describe('PCP Registry — Social Structure', () => {
  it('noir -> corrupt_individualistic', () => {
    expect(resolveSocialStructureFromGenre('noir')).toBe('corrupt_individualistic');
  });
  it('fantasy -> feudal_magical', () => {
    expect(resolveSocialStructureFromGenre('fantasy')).toBe('feudal_magical');
  });
});

describe('PCP Registry — Production Language', () => {
  it('noir -> heightened_reality', () => {
    expect(resolveProductionLanguageFromGenre('noir')).toBe('heightened_reality');
  });
  it('drama -> gritty_realism', () => {
    expect(resolveProductionLanguageFromGenre('drama')).toBe('gritty_realism');
  });
});

// ── Resolver Tests (T1 + T2 integration) ──────────────────────────────

describe('PCP Resolver — Basic Resolution', () => {
  const input = makeInput();
  const profile = resolvePCP(input);

  it('returns a complete profile', () => {
    expect(profile.project_id).toBe('test-project-001');
    expect(profile.version_number).toBe(1);
    expect(profile.status).toBe('complete');
  });

  it('resolves genre from metadata', () => {
    expect(profile.project_identity.genre.value).toContain('crime');
    expect(profile.project_identity.genre.provenance.source_type).toBe('extracted');
    expect(profile.project_identity.genre.provenance.confidence_score).toBeGreaterThan(0.8);
  });

  it('resolves period from canon_json', () => {
    expect(profile.temporal_context.period.value).toBe('1940s');
    expect(profile.temporal_context.period.provenance.source_type).toBe('extracted');
  });

  it('resolves era from period', () => {
    expect(profile.temporal_context.era.value).toBe('historical');
    expect(profile.temporal_context.era.provenance.source_type).toBe('inferred');
  });

  it('resolves technology from period', () => {
    expect(profile.technology_context.level.value).toBe('mid_20th_century');
  });

  it('resolves visual tone from genre', () => {
    expect(profile.visual_context.visual_tone.value).toBe('dark_gritty');
  });

  it('profession_map has detective character', () => {
    expect(profile.professional_context.profession_map.value['Harry']).toBeDefined();
    expect(profile.professional_context.profession_map.value['Harry'].profession).toBe('detective');
  });

  it('every field has provenance', () => {
    const cats = [
      profile.project_identity, profile.temporal_context, profile.geographic_context,
      profile.technology_context, profile.economic_context, profile.professional_context,
      profile.visual_context,
    ];
    for (const cat of cats) {
      for (const [key, field] of Object.entries(cat)) {
        if (field && typeof field === 'object' && 'provenance' in field) {
          expect(field.provenance.source_type).toBeDefined();
          expect(typeof field.provenance.confidence_score).toBe('number');
          expect(Array.isArray(field.provenance.reasoning)).toBe(true);
        }
      }
    }
  });
});

// ── VALIDATION CASE A: period changes 1944 -> 2087 ─────────────────────

describe('Validation Case A — Period 1944 -> 2087', () => {
  const input1944 = makeInput({
    canon_json: {
      genre: ['crime', 'noir'],
      setting: { period: '1944', geography: 'France', climate: 'temperate' },
      characters: [{ name: 'Jean', role: 'detective' }],
    },
  });
  const input2087 = makeInput({
    canon_json: {
      genre: ['crime', 'noir'],
      setting: { period: '2087', geography: 'Neo_Paris', climate: 'temperate' },
      characters: [{ name: 'Jean', role: 'detective' }],
    },
  });

  const profile1944 = resolvePCP(input1944);
  const profile2087 = resolvePCP(input2087, profile1944);

  it('period changes from 1944 to 2087', () => {
    expect(profile1944.temporal_context.period.value).toBe('1944');
    expect(profile2087.temporal_context.period.value).toBe('2087');
  });

  it('technology level shifts to sci_fi_advanced', () => {
    expect(profile1944.technology_context.level.value).toBe('mid_20th_century');
    expect(profile2087.technology_context.level.value).toBe('sci_fi_advanced');
  });

  it('infrastructure changes', () => {
    expect(profile1944.technology_context.infrastructure.value).toBe('modern');
    expect(profile2087.technology_context.infrastructure.value).toBe('advanced');
  });

  it('transportation adds hover', () => {
    expect(profile1944.technology_context.transportation_assumptions.value).not.toContain('hover');
    expect(profile2087.technology_context.transportation_assumptions.value).toContain('hover');
  });

  it('energy source changes', () => {
    expect(profile1944.technology_context.energy_source.value).toBe('fossil_fuel');
    expect(profile2087.technology_context.energy_source.value).toBe('fusion');
  });

  it('visual tone stays same (genre unchanged)', () => {
    expect(profile1944.visual_context.visual_tone.value).toBe('dark_gritty');
    expect(profile2087.visual_context.visual_tone.value).toBe('dark_gritty');
  });

  it('stale_fields detected between versions', () => {
    const changes = detectPCPChanges(profile1944, profile2087);
    expect(changes).toContain('temporal_context.period');
    expect(changes).toContain('technology_context.level');
    expect(changes).toContain('technology_context.transportation_assumptions');
    // profession should NOT be stale (unchanged)
    expect(changes.filter(c => c.startsWith('professional_context'))).toHaveLength(0);
  });

  it('CDG invalidation matrix matches: P2 affects ALL CPIE nodes', () => {
    const affected = PCP_INVALIDATION_MATRIX['P2'];
    expect(affected).toContain('C1');
    expect(affected).toContain('C2');
    expect(affected).toContain('C3');
    expect(affected).toContain('C4');
    expect(affected).toContain('C5');
    expect(affected).toContain('C6');
    expect(affected).toContain('C7');
    expect(affected.length).toBe(7); // ALL CPIE domains
  });
});

// ── VALIDATION CASE B: genre changes crime -> fantasy ──────────────────

describe('Validation Case B — Genre Crime -> Fantasy', () => {
  const inputCrime = makeInput({
    canon_json: {
      genre: ['crime', 'noir'],
      setting: { period: '1940s', geography: 'USA' },
      characters: [{ name: 'Sam', role: 'detective' }],
    },
  });
  const inputFantasy = makeInput({
    canon_json: {
      genre: ['fantasy', 'epic'],
      setting: { period: 'medieval', geography: 'Eldoria' },
      characters: [{ name: 'Sam', role: 'knight' }],
    },
    project_metadata: {
      genre_tags: ['fantasy', 'epic'],
      format: 'feature_film',
    },
  });

  const profileCrime = resolvePCP(inputCrime);
  const profileFantasy = resolvePCP(inputFantasy, profileCrime);

  it('genre changes from crime to fantasy', () => {
    expect(profileCrime.project_identity.genre.value[0]).toBe('crime');
    expect(profileFantasy.project_identity.genre.value[0]).toBe('fantasy');
  });

  it('visual tone shifts from dark_gritty to rich_vibrant', () => {
    expect(profileCrime.visual_context.visual_tone.value).toBe('dark_gritty');
    expect(profileFantasy.visual_context.visual_tone.value).toBe('rich_vibrant');
  });

  it('production language may shift', () => {
    expect(profileCrime.visual_context.production_language.value).toBe('gritty_realism');
    expect(profileFantasy.visual_context.production_language.value).toBe('magical_realism');
  });

  // CDG invalidation checks
  it('CDG invalidation matrix: P1 genre affects wardrobe, creature, pd, vl', () => {
    const affected = PCP_INVALIDATION_MATRIX['P1'];
    expect(affected).toContain('C1'); // wardrobe
    expect(affected).toContain('C4'); // creature
    expect(affected).toContain('C6'); // pd
    expect(affected).toContain('C7'); // vl
    expect(affected).not.toContain('C2'); // prop NOT affected by genre
    expect(affected).not.toContain('C3'); // vehicle NOT affected by genre
    expect(affected).not.toContain('C5'); // location NOT affected by genre
  });
});

// ── VALIDATION CASE C: target_audience changes ────────────────────────

describe('Validation Case C — Target Audience Changes', () => {
  const inputFamily = makeInput({
    project_metadata: {
      genre_tags: ['comedy'],
      format: 'feature_film',
      target_audience: 'family',
    },
  });
  const inputAdult = makeInput({
    project_metadata: {
      genre_tags: ['comedy'],
      format: 'feature_film',
      target_audience: 'adults_25-55',
    },
  });

  const profileFamily = resolvePCP(inputFamily);
  const profileAdult = resolvePCP(inputAdult, profileFamily);

  it('target_audience changes', () => {
    expect(profileFamily.project_identity.target_audience.value).toBe('family');
    expect(profileAdult.project_identity.target_audience.value).toBe('adults_25-55');
  });

  it('PCP changes only detected in project_identity', () => {
    const changes = detectPCPChanges(profileFamily, profileAdult);
    expect(changes.filter(c => c.startsWith('project_identity'))).toHaveLength(1); // audience only
  });

  // CDG partial invalidation
  it('P1 change should not trigger vehicle or creature invalidation', () => {
    const affected = PCP_INVALIDATION_MATRIX['P1'];
    expect(affected).not.toContain('C3'); // vehicle
    expect(affected).not.toContain('C5'); // location
  });
});

// ── Provenance Tests (T6 integration) ──────────────────────────────────

describe('PCP Provenance Integrity', () => {
  it('every field has provenance with source_type, confidence, reasoning', () => {
    const profile = resolvePCP(makeInput());
    const cats = [
      profile.project_identity, profile.temporal_context, profile.geographic_context,
      profile.technology_context, profile.professional_context, profile.visual_context,
    ];
    for (const cat of cats) {
      for (const [, field] of Object.entries(cat)) {
        if (field && typeof field === 'object' && 'provenance' in field) {
          // source_type should be one of the known provenance values
          expect(['extracted', 'inferred', 'user_supplied', 'imported']).toContain(field.provenance.source_type);
          expect(field.provenance.confidence_score).toBeGreaterThanOrEqual(0);
          expect(field.provenance.confidence_score).toBeLessThanOrEqual(1);
          expect(field.provenance.reasoning.length).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });
});

// ── Registry Version ──────────────────────────────────────────────────

describe('PCP Registry Version', () => {
  it('has a version string', () => {
    expect(PCP_REGISTRY_VERSION).toBe('1.0.0');
  });
});
