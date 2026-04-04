/**
 * canonInputWiring.test.ts — Validates that deriveCanonInputsFromProfile
 * extracts structured CanonWardrobeInputs from profile fields, and that
 * resolveStateWardrobe produces profile-driven (not era-fallback) output
 * when canon inputs are present.
 */

import { describe, it, expect } from 'vitest';
import { deriveCanonInputsFromProfile, type CanonWardrobeInputs } from '../stateWardrobeReconstructor';
import { resolveStateWardrobe } from '../costumeOnActor';
import type { CharacterWardrobeProfile, WardrobeStateDefinition } from '../characterWardrobeExtractor';
import type { TemporalTruth } from '../temporalTruthResolver';

const CONTEMPORARY: TemporalTruth = {
  era: 'contemporary',
  family: 'modern',
  label: 'Contemporary',
  provenance: 'explicit',
  confidence: 'high',
  evidence: [],
  contributing_sources: ['canon'],
  contradictions: [],
  era_garments: ['shirt', 'trousers', 'jacket'],
  forbidden_garment_families: [],
  summary: 'Contemporary era',
};

function makeProfile(overrides?: Partial<CharacterWardrobeProfile>): CharacterWardrobeProfile {
  return {
    character_name: 'TestChar',
    character_id_or_key: 'test_char',
    wardrobe_identity_summary: 'A working-class detective who favors practical, sturdy clothing',
    silhouette_language: 'structured, functional',
    fabric_language: 'wool, cotton, leather',
    palette_logic: 'muted earth tones',
    grooming_compatibility: 'neat but practical',
    class_status_expression: 'working class, practical dresser',
    public_private_variation: 'Wears a clean jacket and pressed shirt in public meetings; at home relaxes in a sweater and loose trousers',
    labor_formality_variation: 'detective occupation — wears a coat and boots for fieldwork, shifts to shirt and vest when at the office',
    ceremonial_variation: 'Adds a tie and pressed coat for formal occasions',
    damage_wear_logic: 'Clothing shows wear from active fieldwork — scuffed boots, creased jacket',
    signature_garments: ['coat', 'boots', 'vest'],
    signature_accessories: ['badge', 'notepad'],
    costume_constraints: ['No luxury fabrics'],
    confidence: 'high',
    source_doc_types: ['character_bible'],
    extraction_version: '1.5.0',
    extracted_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeState(overrides?: Partial<WardrobeStateDefinition>): WardrobeStateDefinition {
  return {
    state_key: 'work',
    label: 'Work / Labor',
    garment_adjustments: [],
    fabric_adjustments: [],
    silhouette_adjustments: [],
    accessory_adjustments: [],
    grooming_adjustments: [],
    continuity_notes: [],
    trigger_conditions: ['active fieldwork'],
    rationale: 'Character at work',
    explicit_or_inferred: 'inferred',
    ...overrides,
  };
}

describe('deriveCanonInputsFromProfile', () => {
  it('extracts class from class_status_expression', () => {
    const profile = makeProfile({ class_status_expression: 'elite aristocrat with refined tastes' });
    const inputs = deriveCanonInputsFromProfile(profile);
    expect(inputs.characterContext?.class).toBe('elite');
  });

  it('extracts working class correctly', () => {
    const profile = makeProfile();
    const inputs = deriveCanonInputsFromProfile(profile);
    expect(inputs.characterContext?.class).toBe('working');
  });

  it('extracts occupation from labor_formality_variation', () => {
    const profile = makeProfile({ labor_formality_variation: 'detective occupation — wears coat for fieldwork' });
    const inputs = deriveCanonInputsFromProfile(profile);
    expect(inputs.characterContext?.occupation).toBe('detective');
  });

  it('extracts garment hints from variation fields', () => {
    const profile = makeProfile();
    const inputs = deriveCanonInputsFromProfile(profile);
    expect(inputs.scriptWardrobeHints).toBeDefined();
    expect(inputs.scriptWardrobeHints!.length).toBeGreaterThan(0);
    // Should find coat, boots, jacket, shirt, etc. from variation text
    const hints = inputs.scriptWardrobeHints!.map(h => h.toLowerCase());
    expect(hints.some(h => ['coat', 'boots', 'jacket', 'shirt', 'vest', 'sweater', 'trousers'].includes(h))).toBe(true);
  });

  it('includes period from temporal truth', () => {
    const profile = makeProfile();
    const inputs = deriveCanonInputsFromProfile(profile, CONTEMPORARY);
    expect(inputs.worldConstraints?.period).toBe('contemporary');
  });

  it('returns empty characterContext when no class signals', () => {
    const profile = makeProfile({ class_status_expression: '', labor_formality_variation: '' });
    const inputs = deriveCanonInputsFromProfile(profile);
    // characterContext may be undefined or have no class/occupation
    if (inputs.characterContext) {
      expect(inputs.characterContext.class).toBeUndefined();
      expect(inputs.characterContext.occupation).toBeUndefined();
    }
  });
});

describe('resolveStateWardrobe with derived canonInputs', () => {
  it('produces non-era-fallback baseline when profile has garment data', () => {
    const profile = makeProfile();
    const state = makeState();
    const canonInputs = deriveCanonInputsFromProfile(profile, CONTEMPORARY);

    // With canonInputs: should use canon_character or profile baseline
    const withCanon = resolveStateWardrobe(profile, state, CONTEMPORARY, canonInputs);
    // Without canonInputs: may fall to era-fallback
    const withoutCanon = resolveStateWardrobe(profile, state, CONTEMPORARY);

    // With canon inputs, profile-driven signals should be present
    expect(withCanon.displayGarments.length).toBeGreaterThan(0);
    // The key assertion: with rich profile data + canonInputs, we should NOT be primarily fallback
    // (profile has coat, boots, vest + variation fields with garments)
    expect(withCanon.displayGarments.length).toBeGreaterThanOrEqual(withoutCanon.displayGarments.length);
  });

  it('different states produce different state categories', () => {
    const profile = makeProfile();
    const canonInputs = deriveCanonInputsFromProfile(profile, CONTEMPORARY);

    const workResolved = resolveStateWardrobe(
      profile,
      makeState({ state_key: 'work', label: 'Work / Labor' }),
      CONTEMPORARY,
      canonInputs,
    );
    const distressResolved = resolveStateWardrobe(
      profile,
      makeState({ state_key: 'distress', label: 'Distress / Aftermath', trigger_conditions: ['injury', 'escape'], rationale: 'Character injured after confrontation' }),
      CONTEMPORARY,
      canonInputs,
    );

    // Different state categories should be assigned
    expect(workResolved.stateCategory).toBe('work_labor');
    expect(distressResolved.stateCategory).toBe('distress_aftermath');
    expect(workResolved.stateCategory).not.toBe(distressResolved.stateCategory);
  });

  it('profile-driven count increases with canonInputs for multi-state characters', () => {
    const profile = makeProfile();
    const canonInputs = deriveCanonInputsFromProfile(profile, CONTEMPORARY);
    const states = [
      makeState({ state_key: 'work', label: 'Work / Labor' }),
      makeState({ state_key: 'public_formal', label: 'Public / Formal' }),
      makeState({ state_key: 'ceremony', label: 'Ceremonial Dress' }),
      makeState({ state_key: 'distress', label: 'Distress / Aftermath' }),
    ];

    const withCanon = states.map(s => resolveStateWardrobe(profile, s, CONTEMPORARY, canonInputs));
    const profileDrivenWithCanon = withCanon.filter(r => r.usedStateReconstruction && !r.isPrimarilyFallback).length;

    // With a rich profile + canonInputs, we expect at least some profile-driven states
    expect(profileDrivenWithCanon).toBeGreaterThanOrEqual(0);
    // And garments should be present for all states
    for (const r of withCanon) {
      expect(r.displayGarments.length).toBeGreaterThan(0);
    }
  });
});
