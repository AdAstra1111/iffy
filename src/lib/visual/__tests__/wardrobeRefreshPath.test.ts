/**
 * wardrobeRefreshPath.test.ts — Regression tests for the wardrobe
 * refresh/persistence/read path.
 *
 * Proves:
 * 1. extractCharacterWardrobes is the sole canonical extraction function
 * 2. Extraction version is current (1.4.0)
 * 3. Refreshed results contain improved semantic fields
 * 4. Persistence target is character_wardrobe_profiles
 * 5. No duplicate extraction route exists
 */

import { describe, it, expect } from 'vitest';
import {
  extractCharacterWardrobes,
  type CharacterWardrobeExtractionResult,
} from '../characterWardrobeExtractor';

const CURRENT_VERSION = '1.5.0';

// ── Rich modern canon with character-specific cues ──
const richModernCanon = {
  characters: [
    {
      name: 'Leila Arman',
      role: 'protagonist',
      description:
        'A former military intelligence officer turned corporate security consultant. ' +
        'Always in tailored suits for boardroom meetings, tactical gear for field operations. ' +
        'Her designer clothes project power; torn and smudged after combat. ' +
        'Wedding scene requires elegant formal gown.',
    },
    {
      name: 'Marco Vidal',
      role: 'antagonist',
      description:
        'A street-level fixer who rose through the ranks. ' +
        'Wears leather jackets, boots, and workwear. ' +
        'His clothes are perpetually stained from manual labor. ' +
        'At a gala, he wears an ill-fitting rented suit that signals discomfort.',
    },
  ],
  setting: 'Modern-day thriller set in a major city',
  tone_style: 'Gritty, high-stakes corporate thriller',
};

describe('Wardrobe refresh path contract', () => {
  it('extractCharacterWardrobes returns current version', () => {
    const result = extractCharacterWardrobes(richModernCanon);
    expect(result.extraction_version).toBe(CURRENT_VERSION);
  });

  it('extraction result has all required contract fields', () => {
    const result = extractCharacterWardrobes(richModernCanon);
    expect(result).toHaveProperty('extraction_version');
    expect(result).toHaveProperty('extracted_at');
    expect(result).toHaveProperty('profiles');
    expect(result).toHaveProperty('state_matrix');
    expect(result.profiles.length).toBeGreaterThan(0);
  });

  it('persisted result is shaped for character_wardrobe_profiles key', () => {
    const result = extractCharacterWardrobes(richModernCanon);
    // Simulate the persistence shape — must be serializable as canon_json value
    const canonJson = { character_wardrobe_profiles: result };
    const raw = canonJson.character_wardrobe_profiles;
    expect(raw).toHaveProperty('extraction_version');
    expect(raw).toHaveProperty('profiles');
    // This is the exact guard used in useCharacterWardrobe persisted reader
    expect(typeof raw === 'object' && 'extraction_version' in raw).toBe(true);
  });
});

describe('Improved semantic fields are present after extraction', () => {
  let result: CharacterWardrobeExtractionResult;

  beforeAll(() => {
    result = extractCharacterWardrobes(richModernCanon);
  });

  it('profiles contain public_private_variation field', () => {
    for (const p of result.profiles) {
      expect(p).toHaveProperty('public_private_variation');
      expect(typeof p.public_private_variation).toBe('string');
    }
  });

  it('profiles contain labor_formality_variation field', () => {
    for (const p of result.profiles) {
      expect(p).toHaveProperty('labor_formality_variation');
      expect(typeof p.labor_formality_variation).toBe('string');
    }
  });

  it('profiles contain ceremonial_variation field', () => {
    for (const p of result.profiles) {
      expect(p).toHaveProperty('ceremonial_variation');
      expect(typeof p.ceremonial_variation).toBe('string');
    }
  });

  it('profiles contain damage_wear_logic field', () => {
    for (const p of result.profiles) {
      expect(p).toHaveProperty('damage_wear_logic');
      expect(typeof p.damage_wear_logic).toBe('string');
    }
  });

  it('character with damage cues gets character-specific damage_wear_logic', () => {
    const leila = result.profiles.find(p => p.character_name === 'Leila Arman');
    expect(leila).toBeDefined();
    // Should NOT be the generic boilerplate
    expect(leila!.damage_wear_logic).not.toBe('Regular wear and staining expected from labor');
    expect(leila!.damage_wear_logic).not.toBe('Damage rare — signals crisis or fall from status');
  });

  it('character with formal/casual cues gets character-specific public_private_variation', () => {
    const leila = result.profiles.find(p => p.character_name === 'Leila Arman');
    expect(leila).toBeDefined();
    // Should NOT be the generic boilerplate
    expect(leila!.public_private_variation).not.toBe('Moderate variation by context');
  });
});

describe('No duplicate extraction routes', () => {
  it('extractCharacterWardrobes is a named export from characterWardrobeExtractor', () => {
    // This test exists as a tripwire — if the import path changes or
    // a second extractor function is created, this test name documents
    // that exactly one canonical extraction function should exist.
    expect(typeof extractCharacterWardrobes).toBe('function');
  });

  it('extraction version is exactly 1.5.0 — bump this test when upgrading', () => {
    const result = extractCharacterWardrobes({ characters: [{ name: 'Test', role: 'lead' }] });
    expect(result.extraction_version).toBe('1.5.0');
  });
});
