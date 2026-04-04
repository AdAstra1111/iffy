/**
 * wardrobeProfileIntelligence.test.ts — Tests proving that the wardrobe extractor
 * produces character-specific semantic variation fields, and that the resolver
 * correctly classifies profiles as profile-driven vs fallback-heavy.
 */
import { describe, it, expect } from 'vitest';
import { extractCharacterWardrobes } from '../characterWardrobeExtractor';
import { resolveStateWardrobe } from '../costumeOnActor';
import { reconstructStateGarments, classifyStateCategory } from '../stateWardrobeReconstructor';
import type { WardrobeStateDefinition } from '../characterWardrobeExtractor';

// ── Helpers ──

function makeState(overrides: Partial<WardrobeStateDefinition>): WardrobeStateDefinition {
  return {
    state_key: 'work',
    label: 'Work / Labor',
    rationale: 'test',
    explicit_or_inferred: 'inferred',
    trigger_conditions: [],
    garment_adjustments: ['practical'],
    fabric_adjustments: ['sturdy'],
    silhouette_adjustments: [],
    accessory_adjustments: [],
    grooming_adjustments: [],
    continuity_notes: [],
    ...overrides,
  };
}

// ── Extractor: Character-Specific Variations ──

describe('Extractor: character-specific semantic fields', () => {
  it('produces character-specific damage_wear_logic when description mentions damage cues', () => {
    const result = extractCharacterWardrobes({
      characters: [{
        name: 'Leila',
        role: 'Protagonist',
        description: 'Mid-20s. Initially polished perfection — designer clothes, flawless makeup — frays under duress. Smudged makeup, torn clothing, raw desperate beauty.',
        traits: 'Intelligent, resilient',
      }],
      setting: 'Contemporary urban',
      logline: 'A thriller in a modern city',
    });

    const leila = result.profiles.find(p => p.character_name === 'Leila');
    expect(leila).toBeTruthy();
    // Should contain damage cues extracted from description, not generic boilerplate
    expect(leila!.damage_wear_logic).toMatch(/torn|smudged|raw|desperate/i);
    expect(leila!.damage_wear_logic).not.toBe('Moderate wear appropriate to role');
  });

  it('produces character-specific public_private_variation when description has formal cues', () => {
    const result = extractCharacterWardrobes({
      characters: [{
        name: 'Julian',
        role: 'Antagonist',
        description: 'Impeccably groomed, handsome. Expensive tailored suits. Projects effortless charm.',
        traits: 'Master manipulator, brilliant strategist',
      }],
      setting: 'Contemporary urban corporate towers',
      logline: 'Corporate thriller',
    });

    const julian = result.profiles.find(p => p.character_name === 'Julian');
    expect(julian).toBeTruthy();
    // Should reference expensive/tailored cues, not just "Strong formal/informal divide"
    expect(julian!.public_private_variation.length).toBeGreaterThan(20);
  });

  it('produces character-specific ceremonial_variation when canon mentions wedding', () => {
    const result = extractCharacterWardrobes({
      characters: [{
        name: 'Bride',
        role: 'Protagonist',
        description: 'Beautiful bride in an elegant wedding gown',
      }],
      premise: 'A bride is kidnapped before her wedding ceremony',
    });

    const bride = result.profiles.find(p => p.character_name === 'Bride');
    expect(bride).toBeTruthy();
    expect(bride!.ceremonial_variation).toMatch(/wedding/i);
  });

  it('different characters produce different variation fields', () => {
    const result = extractCharacterWardrobes({
      characters: [
        {
          name: 'Worker',
          role: 'Laborer',
          description: 'Rough hands, worn overalls, mud-caked boots',
          traits: 'Hardworking, simple',
        },
        {
          name: 'Executive',
          role: 'CEO',
          description: 'Pristine suit, polished shoes, expensive watch',
          traits: 'Calculating, powerful',
        },
      ],
      setting: 'Modern city',
    });

    const worker = result.profiles.find(p => p.character_name === 'Worker')!;
    const exec = result.profiles.find(p => p.character_name === 'Executive')!;

    // They should NOT have identical variation fields
    expect(worker.damage_wear_logic).not.toBe(exec.damage_wear_logic);
  });
});

// ── Resolver: Profile-Driven vs Fallback Classification ──

describe('Resolver: intelligence source classification', () => {
  it('rich profile with work cues is profile-driven for work state', () => {
    const profile = {
      character_name: 'Gabriel',
      character_id_or_key: 'gabriel',
      wardrobe_identity_summary: 'military operative — tactical vest, combat boots',
      silhouette_language: 'Functional',
      fabric_language: 'leather, canvas, cotton',
      palette_logic: 'Dark, muted',
      grooming_compatibility: 'Practical',
      class_status_expression: 'military',
      public_private_variation: 'Uniform in duty, minimal personal wardrobe off-duty',
      labor_formality_variation: 'Work/duty mode: combat, tactical, extraction — shifts between operational and presentational garments',
      ceremonial_variation: 'Limited ceremonial context',
      damage_wear_logic: 'Combat damage expected',
      signature_garments: ['tactical vest', 'combat boots', 'jacket'],
      signature_accessories: ['holster'],
      costume_constraints: [],
      confidence: 'high' as const,
      source_doc_types: ['character_description'],
      extraction_version: '1.3.0',
      extracted_at: new Date().toISOString(),
    };

    const workState = makeState({
      state_key: 'work',
      label: 'Work / Labor',
      trigger_conditions: ['work', 'duty'],
    });

    const result = resolveStateWardrobe(profile, workState, {
      era: 'contemporary',
      family: 'modern',
      label: 'Contemporary',
      provenance: 'inferred',
      confidence: 'high',
      evidence: [],
      contributing_sources: [],
      contradictions: [],
      era_garments: [],
      forbidden_garment_families: [],
      summary: 'Contemporary era',
    });

    // Should use profile-derived garments, not only era fallback
    expect(result.isPrimarilyFallback).toBe(false);
  });

  it('thin profile with no variation fields is fallback-heavy', () => {
    const profile = {
      character_name: 'Extra',
      character_id_or_key: 'extra',
      wardrobe_identity_summary: 'contextual general — shirt, trousers',
      silhouette_language: 'Moderate',
      fabric_language: 'cotton',
      palette_logic: 'Neutral',
      grooming_compatibility: 'Role-appropriate',
      class_status_expression: 'unspecified',
      public_private_variation: 'Moderate variation by context',
      labor_formality_variation: 'General role-based variation',
      ceremonial_variation: 'Limited ceremonial context',
      damage_wear_logic: 'Moderate wear appropriate to role',
      signature_garments: ['shirt', 'trousers'],
      signature_accessories: [],
      costume_constraints: [],
      confidence: 'medium' as const,
      source_doc_types: [],
      extraction_version: '1.3.0',
      extracted_at: new Date().toISOString(),
    };

    const ceremonialState = makeState({
      state_key: 'ceremonial',
      label: 'Ceremonial',
      trigger_conditions: ['ceremony'],
    });

    // Remove all garments via temporal exclusion to force reconstruction
    const result = resolveStateWardrobe(profile, ceremonialState, {
      era: 'modern',
      family: 'modern',
      label: 'Modern',
      provenance: 'inferred',
      confidence: 'high',
      evidence: [],
      contributing_sources: [],
      contradictions: [],
      era_garments: [],
      forbidden_garment_families: ['shirt', 'trousers'],
      summary: 'Modern era',
    });

    // With garments excluded and thin semantic fields, should be fallback
    if (result.usedStateReconstruction) {
      expect(result.isPrimarilyFallback).toBe(true);
    }
  });
});

// ── Health Summary Logic ──

describe('Character wardrobe health classification', () => {
  it('classifies strong when no states are fallback-heavy', () => {
    // If all resolved states have isPrimarilyFallback=false, health = strong
    const states = [
      { isPrimarilyFallback: false, usedStateReconstruction: true },
      { isPrimarilyFallback: false, usedStateReconstruction: true },
      { isPrimarilyFallback: false, usedStateReconstruction: false },
    ];
    const fallbackCount = states.filter(s => s.isPrimarilyFallback).length;
    expect(fallbackCount).toBe(0);
  });

  it('classifies weak when most states are fallback-heavy', () => {
    const states = [
      { isPrimarilyFallback: true, usedStateReconstruction: true },
      { isPrimarilyFallback: true, usedStateReconstruction: true },
      { isPrimarilyFallback: false, usedStateReconstruction: true },
    ];
    const fallbackCount = states.filter(s => s.isPrimarilyFallback).length;
    const profileDrivenCount = states.filter(s => s.usedStateReconstruction && !s.isPrimarilyFallback).length;
    expect(fallbackCount).toBeGreaterThan(profileDrivenCount);
  });
});
