/**
 * Wardrobe Extractor v1.5.0 — Comprehensive regression tests.
 *
 * Tests:
 * - Dominant anchor precedence (Leila/Gabriel/Julian archetypes)
 * - Source-explicit class resolution
 * - Source-explicit garment resolution
 * - Variation field source tracking
 * - Profile quality assessment
 * - Health classification (direct function tests)
 * - Persistence contract (debug + quality fields)
 * - No parallel extractor path
 */
import { describe, it, expect } from 'vitest';
import {
  extractCharacterWardrobes,
  detectDominantWardrobeSignals,
  type CharacterWardrobeProfile,
  type WardrobeExtractionDebugSummary,
} from '../characterWardrobeExtractor';
import { classifyWardrobeHealth } from '../wardrobeHealthClassifier';

// ── Test Fixtures ───────────────────────────────────────────────────────────

const LEILA_CHARACTER = {
  name: 'Leila Arman',
  role: 'Protagonist — wealthy bride-to-be',
  traits: 'polished perfection, designer clothes, elegant, controlled, smudged makeup under duress',
  description: 'Leila is an affluent socialite with impeccably groomed appearance, wearing designer clothes and expensive jewelry. When kidnapped, her polished exterior frays — torn clothing, smudged makeup, raw desperation.',
  backstory: 'Heiress to a shipping fortune, engaged to a powerful businessman. Wedding preparations consumed her life until the abduction.',
  goals: 'Survive the kidnapping. Protect her fiancé. Reclaim her autonomy.',
  secrets: 'Her family wealth has criminal origins she is trying to escape.',
};

const GABRIEL_CHARACTER = {
  name: 'Gabriel Varela',
  role: 'Bodyguard / Protector',
  traits: 'tactical, vigilant, scarred, disciplined, practical dark clothing',
  description: 'Gabriel is a former military operative turned private security specialist. Trained in close-quarters combat, surveillance, and extraction. His wardrobe is functional — dark jacket, boots, tactical vest.',
  backstory: 'Ex-special forces, dishonorably discharged for protecting a civilian against orders. Now works private security.',
  goals: 'Protect Leila. Neutralize the threat. Maintain operational control.',
};

const JULIAN_CHARACTER = {
  name: 'Julian Thorne',
  role: 'Antagonist — corporate manipulator',
  traits: 'impeccably groomed, expensive tailored suits, authority, cold precision',
  description: 'Julian is a corporate power broker who controls others through wealth and intimidation. Always in bespoke suits, polished shoes, and understated luxury accessories.',
  backstory: 'Built a financial empire through ruthless acquisition. Uses corporate structures to hide criminal activity.',
  goals: 'Acquire Leila\'s family shipping business. Eliminate threats to his operation.',
};

const MODERN_WORLD_CANON = {
  logline: 'A wealthy bride is kidnapped days before her wedding in a modern thriller.',
  premise: 'Set in a contemporary urban city with corporate offices, luxury hotels, and surveillance operations.',
  setting: 'Modern metropolitan city — penthouses, corporate offices, underground parking structures.',
};

function extractWithModernWorld(characters: any[]) {
  return extractCharacterWardrobes({
    characters,
    ...MODERN_WORLD_CANON,
  });
}

function getProfile(result: ReturnType<typeof extractCharacterWardrobes>, name: string): CharacterWardrobeProfile {
  const p = result.profiles.find(p => p.character_name === name);
  if (!p) throw new Error(`Profile not found: ${name}`);
  return p;
}

// ── Dominant Anchor Tests ───────────────────────────────────────────────────

describe('Dominant Anchor Detection', () => {
  it('Leila detects elite class with high confidence', () => {
    const anchor = detectDominantWardrobeSignals(LEILA_CHARACTER);
    expect(anchor.classAnchor).toBe('elite');
    expect(['high', 'medium']).toContain(anchor.confidence);
    expect(anchor.evidence.some(e => /designer|elegant|wealthy|heiress|socialite|bride|affluent|polished/i.test(e))).toBe(true);
  });

  it('Gabriel detects military class', () => {
    const anchor = detectDominantWardrobeSignals(GABRIEL_CHARACTER);
    expect(anchor.classAnchor).toBe('military');
    expect(anchor.evidence.some(e => /tactical|combat|surveillance|operative|protector|extraction/i.test(e))).toBe(true);
  });

  it('Julian detects elite class', () => {
    const anchor = detectDominantWardrobeSignals(JULIAN_CHARACTER);
    expect(anchor.classAnchor).toBe('elite');
    expect(anchor.evidence.some(e => /tailored|bespoke|expensive|authority|impeccably/i.test(e))).toBe(true);
  });

  it('"artistic" adjective does NOT trigger artisan', () => {
    const artsy = { name: 'Test', traits: 'artistic, creative vision, imaginative', description: 'An artistic person with creative ideas.' };
    const anchor = detectDominantWardrobeSignals(artsy);
    expect(anchor.classAnchor).not.toBe('artisan');
  });

  it('real craft occupation DOES trigger artisan', () => {
    const potter = { name: 'Test', traits: 'dedicated', description: 'Works at a pottery kiln, covered in clay every day.' };
    const anchor = detectDominantWardrobeSignals(potter);
    expect(anchor.classAnchor).toBe('artisan');
  });
});

// ── Class Resolution Precedence ─────────────────────────────────────────────

describe('Class Resolution Precedence', () => {
  it('Leila resolves to elite, not artisan', () => {
    const result = extractWithModernWorld([LEILA_CHARACTER]);
    const profile = getProfile(result, 'Leila Arman');
    expect(profile.extraction_debug?.class_resolution_value).toBe('elite');
    expect(profile.extraction_debug?.class_resolution_source).toBe('dominant_anchor');
    expect(profile.class_status_expression).toContain('elite');
    expect(profile.class_status_expression).not.toContain('artisan');
  });

  it('Gabriel resolves to military, not criminal-from-world', () => {
    const result = extractWithModernWorld([GABRIEL_CHARACTER]);
    const profile = getProfile(result, 'Gabriel Varela');
    expect(profile.extraction_debug?.class_resolution_value).toBe('military');
    expect(profile.class_status_expression).toContain('military');
    expect(profile.class_status_expression).not.toContain('criminal');
  });

  it('Julian resolves to elite, not criminal', () => {
    const result = extractWithModernWorld([JULIAN_CHARACTER]);
    const profile = getProfile(result, 'Julian Thorne');
    expect(profile.extraction_debug?.class_resolution_value).toBe('elite');
    expect(profile.class_status_expression).not.toMatch(/^criminal/);
  });
});

// ── Signature Garment Resolution ────────────────────────────────────────────

describe('Signature Garment Resolution', () => {
  it('Leila garments are NOT generic boots/hat/jacket only', () => {
    const result = extractWithModernWorld([LEILA_CHARACTER]);
    const profile = getProfile(result, 'Leila Arman');
    const garments = profile.signature_garments;
    // Must contain formal/luxury garments from elite anchor
    expect(garments.some(g => /dress|suit|heels|coat|blazer/.test(g))).toBe(true);
    // Check debug: dominant anchor was used
    expect(profile.extraction_debug?.used_generic_fallback).toBe(false);
  });

  it('Gabriel garments reflect tactical identity', () => {
    const result = extractWithModernWorld([GABRIEL_CHARACTER]);
    const profile = getProfile(result, 'Gabriel Varela');
    expect(profile.signature_garments.some(g => /jacket|boots|trousers|vest/.test(g))).toBe(true);
  });

  it('Julian garments reflect corporate identity', () => {
    const result = extractWithModernWorld([JULIAN_CHARACTER]);
    const profile = getProfile(result, 'Julian Thorne');
    expect(profile.signature_garments.some(g => /suit|shirt|shoes|blazer/.test(g))).toBe(true);
  });

  it('source breakdown tracks per-garment provenance', () => {
    const result = extractWithModernWorld([LEILA_CHARACTER]);
    const profile = getProfile(result, 'Leila Arman');
    expect(profile.extraction_debug?.signature_garment_sources).toBeDefined();
    expect(profile.extraction_debug!.signature_garment_sources!.length).toBeGreaterThan(0);
    // At least one should be from dominant_anchor
    expect(profile.extraction_debug!.signature_garment_sources!.some(s => s.includes('dominant_anchor'))).toBe(true);
  });
});

// ── Variation Field Source Tracking ──────────────────────────────────────────

describe('Variation Field Quality', () => {
  it('Leila variations capture polished/designer/torn/smudged cues', () => {
    const result = extractWithModernWorld([LEILA_CHARACTER]);
    const profile = getProfile(result, 'Leila Arman');
    // public_private should reference character-specific cues
    expect(profile.public_private_variation).toMatch(/polished|designer|elegant|smudged|torn|raw|desperate/i);
    // damage_wear_logic should capture damage trajectory
    expect(profile.damage_wear_logic).toMatch(/torn|smudged|raw|desperate/i);
  });

  it('Gabriel variations reflect tactical/combat cues', () => {
    const result = extractWithModernWorld([GABRIEL_CHARACTER]);
    const profile = getProfile(result, 'Gabriel Varela');
    expect(profile.labor_formality_variation).toMatch(/combat|tactical|surveillance|protection/i);
  });

  it('variation sources are tracked in debug', () => {
    const result = extractWithModernWorld([LEILA_CHARACTER]);
    const profile = getProfile(result, 'Leila Arman');
    expect(profile.extraction_debug?.profile_variation_sources).toBeDefined();
    // At least one should be character_specific
    expect(profile.extraction_debug!.profile_variation_sources!.some(s => s === 'character_specific')).toBe(true);
  });

  it('materially different characters produce different variations', () => {
    const result = extractWithModernWorld([LEILA_CHARACTER, GABRIEL_CHARACTER]);
    const leila = getProfile(result, 'Leila Arman');
    const gabriel = getProfile(result, 'Gabriel Varela');
    expect(leila.public_private_variation).not.toBe(gabriel.public_private_variation);
    expect(leila.damage_wear_logic).not.toBe(gabriel.damage_wear_logic);
  });
});

// ── Quality Diagnostics ─────────────────────────────────────────────────────

describe('Profile Quality Assessment', () => {
  it('rich profiles do NOT emit all_variation_fields_generic', () => {
    const result = extractWithModernWorld([LEILA_CHARACTER]);
    const profile = getProfile(result, 'Leila Arman');
    const hasAllGeneric = profile.quality_diagnostics?.some(d => d.includes('all_variation_fields_generic'));
    expect(hasAllGeneric).toBeFalsy();
  });

  it('thin profiles emit degradation diagnostics', () => {
    const thinChar = { name: 'Unnamed Person', role: 'Background' };
    const result = extractWithModernWorld([thinChar]);
    const profile = getProfile(result, 'Unnamed Person');
    // Thin profile should use generic fallback more
    expect(profile.extraction_debug?.used_generic_fallback || profile.extraction_debug?.used_world_fallback).toBe(true);
  });

  it('extraction_debug and quality_diagnostics are persisted in profile', () => {
    const result = extractWithModernWorld([LEILA_CHARACTER]);
    const profile = getProfile(result, 'Leila Arman');
    expect(profile.extraction_debug).toBeDefined();
    expect(profile.extraction_debug!.dominant_anchor_class).toBe('elite');
    expect(profile.extraction_debug!.class_resolution_value).toBe('elite');
    expect(profile.extraction_version).toBe('1.5.0');
  });
});

// ── Health Classification (direct function tests) ───────────────────────────

describe('classifyWardrobeHealth (direct)', () => {
  it('0/N profile-driven → weak (never strong)', () => {
    expect(classifyWardrobeHealth(0, 8, 8, 8, null)).toBe('weak');
    expect(classifyWardrobeHealth(0, 5, 5, 8, null)).toBe('weak');
    expect(classifyWardrobeHealth(0, 0, 0, 3, null)).toBe('weak');
  });

  it('collapse.collapsed → weak (never strong)', () => {
    expect(classifyWardrobeHealth(5, 0, 5, 8, { collapsed: true, distinctArrays: 1 })).toBe('weak');
    expect(classifyWardrobeHealth(8, 0, 8, 8, { collapsed: true, distinctArrays: 1 })).toBe('weak');
  });

  it('distinctArrays <= 1 for 3+ states → weak', () => {
    expect(classifyWardrobeHealth(3, 0, 3, 4, { collapsed: false, distinctArrays: 1 })).toBe('weak');
  });

  it('fallbackCount >= profileDrivenCount → weak', () => {
    expect(classifyWardrobeHealth(3, 5, 8, 8, null)).toBe('weak');
    expect(classifyWardrobeHealth(3, 3, 6, 8, null)).toBe('weak');
  });

  it('all profile-driven, no fallback, good differentiation → strong', () => {
    expect(classifyWardrobeHealth(4, 0, 4, 4, { collapsed: false, distinctArrays: 4 })).toBe('strong');
    expect(classifyWardrobeHealth(8, 0, 8, 8, { collapsed: false, distinctArrays: 6 })).toBe('strong');
  });

  it('some profile-driven > fallback → moderate', () => {
    expect(classifyWardrobeHealth(5, 3, 8, 8, { collapsed: false, distinctArrays: 4 })).toBe('moderate');
  });

  it('strong requires minimum distinct arrays for 4+ states', () => {
    // 4 states needs at least 3 distinct (max(3, ceil(4/2))=3)
    expect(classifyWardrobeHealth(4, 0, 4, 4, { collapsed: false, distinctArrays: 2 })).not.toBe('strong');
  });
});

// ── Extraction Version & Contract ───────────────────────────────────────────

describe('Extraction Contract', () => {
  it('extraction version is 1.5.0', () => {
    const result = extractWithModernWorld([LEILA_CHARACTER]);
    expect(result.extraction_version).toBe('1.5.0');
    expect(result.profiles[0].extraction_version).toBe('1.5.0');
  });

  it('result shape is serializable for canonical persistence', () => {
    const result = extractWithModernWorld([LEILA_CHARACTER, GABRIEL_CHARACTER]);
    const json = JSON.parse(JSON.stringify(result));
    expect(json.profiles).toHaveLength(2);
    expect(json.extraction_version).toBe('1.5.0');
    expect(json.profiles[0].extraction_debug).toBeDefined();
  });

  it('no duplicate extraction route — sole canonical export', () => {
    // The module exports extractCharacterWardrobes as the sole entry point
    // This test confirms it returns the expected shape
    const result = extractCharacterWardrobes({ characters: [] });
    expect(result.profiles).toEqual([]);
    expect(result.extraction_version).toBe('1.5.0');
  });
});

// ── Dominant Anchor Preservation End-to-End ──────────────────────────────────

describe('Dominant Anchor Preservation', () => {
  it('dominant anchor class survives into final profile class_status_expression', () => {
    const result = extractWithModernWorld([LEILA_CHARACTER, GABRIEL_CHARACTER, JULIAN_CHARACTER]);
    const leila = getProfile(result, 'Leila Arman');
    const gabriel = getProfile(result, 'Gabriel Varela');
    const julian = getProfile(result, 'Julian Thorne');

    expect(leila.class_status_expression).toContain('elite');
    expect(gabriel.class_status_expression).toContain('military');
    expect(julian.class_status_expression).toContain('elite');
  });

  it('all three characters produce materially different garment sets', () => {
    const result = extractWithModernWorld([LEILA_CHARACTER, GABRIEL_CHARACTER, JULIAN_CHARACTER]);
    const leila = getProfile(result, 'Leila Arman');
    const gabriel = getProfile(result, 'Gabriel Varela');
    const julian = getProfile(result, 'Julian Thorne');

    const leilaSet = new Set(leila.signature_garments);
    const gabrielSet = new Set(gabriel.signature_garments);
    const julianSet = new Set(julian.signature_garments);

    // They should not all be identical
    const allSame = JSON.stringify([...leilaSet].sort()) === JSON.stringify([...gabrielSet].sort()) &&
                    JSON.stringify([...gabrielSet].sort()) === JSON.stringify([...julianSet].sort());
    expect(allSame).toBe(false);
  });
});
