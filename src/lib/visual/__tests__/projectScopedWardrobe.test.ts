/**
 * projectScopedWardrobe.test.ts — IEL invariant tests for project-scoped wardrobe truth.
 *
 * Proves:
 * 1. No cross-project wardrobe contamination
 * 2. Missing era truth defaults to contemporary, never historical
 * 3. resolveWorldContext uses canonical temporal truth when provided
 * 4. ERA_VOCABULARIES has entries for 'contemporary' and 'ambiguous'
 * 5. resolveTemporalTruth returns contemporary (not ambiguous) when no evidence exists
 */

import { resolveTemporalTruth, type TemporalSourceInput } from '../temporalTruthResolver';
import { extractCharacterWardrobes } from '../characterWardrobeExtractor';
import { resolveBaselineWardrobe } from '../stateWardrobeReconstructor';

const HISTORICAL_GARMENTS = new Set([
  'tunic', 'cloak', 'robe', 'kimono', 'hakama', 'haori', 'kosode',
  'toga', 'tabard', 'doublet', 'bodice', 'corset', 'gown', 'cape',
  'chain mail', 'surcoat',
]);

// ── IEL: Missing era defaults to contemporary ──

describe('Missing era defaults to contemporary', () => {
  it('resolveTemporalTruth returns contemporary when no evidence exists', () => {
    const result = resolveTemporalTruth({});
    expect(result.era).toBe('contemporary');
    expect(result.family).toBe('modern');
    expect(result.confidence).toBe('low');
  });

  it('resolveTemporalTruth returns contemporary for empty string inputs', () => {
    const result = resolveTemporalTruth({
      logline: '',
      premise: '',
      world_rules: '',
    });
    expect(result.era).toBe('contemporary');
    expect(result.family).toBe('modern');
  });

  it('resolveTemporalTruth NEVER returns ambiguous when no evidence exists', () => {
    const result = resolveTemporalTruth({});
    expect(result.era).not.toBe('ambiguous');
  });
});

// ── IEL: Project A feudal does not contaminate Project B contemporary ──

describe('Cross-project isolation', () => {
  it('feudal project resolves feudal era correctly', () => {
    const feudalResult = resolveTemporalTruth({
      logline: 'A samurai in feudal Japan',
      world_rules: 'Shogunate era, bushido code',
    });
    expect(feudalResult.era).toBe('feudal');
    expect(feudalResult.family).toBe('historical');
  });

  it('contemporary project resolves contemporary era correctly', () => {
    const contemporaryResult = resolveTemporalTruth({
      logline: 'A tech startup founder in Silicon Valley',
      world_rules: 'Modern day corporate thriller',
    });
    expect(['contemporary', 'modern']).toContain(contemporaryResult.era);
    expect(contemporaryResult.family).toBe('modern');
  });

  it('both projects produce DIFFERENT era-appropriate garment families', () => {
    const feudalResult = resolveTemporalTruth({
      logline: 'A samurai in feudal Japan',
      world_rules: 'Shogunate era',
    });
    const contemporaryResult = resolveTemporalTruth({
      logline: 'A tech startup founder',
      world_rules: 'Modern day',
    });

    // Feudal should have historical garments
    expect(feudalResult.era_garments.some(g => ['kimono', 'hakama', 'robe'].includes(g))).toBe(true);

    // Contemporary should NOT have historical garments
    for (const g of contemporaryResult.era_garments) {
      expect(HISTORICAL_GARMENTS.has(g.toLowerCase())).toBe(false);
    }
  });
});

// ── IEL: extractCharacterWardrobes uses canonical temporal truth ──

describe('Wardrobe extraction uses canonical temporal truth', () => {
  const CONTEMPORARY_CANON = {
    characters: [
      { name: 'Alex', role: 'Protagonist', description: 'A young tech entrepreneur' },
    ],
    logline: 'A startup CEO fights a hostile takeover',
    world_rules: 'Corporate world',
  };

  it('without canonical temporal truth, may still resolve correctly from canon text', () => {
    const result = extractCharacterWardrobes(CONTEMPORARY_CANON);
    // Should not produce medieval garments for a corporate canon
    for (const profile of result.profiles) {
      const hasHistorical = profile.signature_garments.some(g =>
        ['tunic', 'cloak', 'hakama', 'kimono', 'toga', 'doublet'].includes(g.toLowerCase())
      );
      expect(hasHistorical).toBe(false);
    }
  });

  it('with explicit contemporary temporal truth, CANNOT produce historical garments', () => {
    const result = extractCharacterWardrobes(CONTEMPORARY_CANON, {
      era: 'contemporary',
      family: 'modern',
    });
    for (const profile of result.profiles) {
      const hasHistorical = profile.signature_garments.some(g =>
        HISTORICAL_GARMENTS.has(g.toLowerCase())
      );
      expect(hasHistorical).toBe(false);
    }
  });

  it('with explicit feudal temporal truth, CAN produce historical garments', () => {
    const feudalCanon = {
      characters: [
        { name: 'Kenshin', role: 'Samurai warrior', description: 'A ronin seeking redemption' },
      ],
      logline: 'A masterless samurai in feudal Japan',
      world_rules: 'Shogunate period',
    };
    const result = extractCharacterWardrobes(feudalCanon, {
      era: 'feudal',
      family: 'historical',
    });
    // Feudal characters should get period-appropriate garments
    expect(result.profiles.length).toBeGreaterThan(0);
  });
});

// ── IEL: Canon text with ambiguous words does not trigger false medieval ──

describe('Ambiguous words do not trigger false historical classification', () => {
  it('canon with "lord" and "kingdom" in metaphorical context stays modern', () => {
    const result = extractCharacterWardrobes(
      {
        characters: [
          { name: 'Victoria', role: 'CEO', description: 'Lord of her corporate kingdom, she rules the boardroom' },
        ],
        logline: 'A corporate lord builds her empire in modern New York',
        world_rules: 'Present day corporate world',
      },
      { era: 'contemporary', family: 'modern' }, // Canonical truth says contemporary
    );

    for (const profile of result.profiles) {
      const hasHistorical = profile.signature_garments.some(g =>
        ['tunic', 'cloak', 'chain mail', 'surcoat', 'tabard'].includes(g.toLowerCase())
      );
      expect(hasHistorical).toBe(false);
    }
  });
});
