/**
 * vcsInputAssembler tests — pure input assembly and effective profile wiring.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveCharacterVCSInputs,
  assembleVCSInputs,
} from '../vcsInputAssembler';
import type { CharacterWardrobeProfile } from '../characterWardrobeExtractor';
import type { TemporalTruth } from '../temporalTruthResolver';

function makeTemporal(overrides: Partial<TemporalTruth> = {}): TemporalTruth {
  return {
    era: 'contemporary',
    family: 'modern',
    label: 'Contemporary',
    provenance: 'explicit',
    confidence: 'high',
    evidence: [],
    contributing_sources: ['canon'],
    contradictions: [],
    era_garments: [],
    forbidden_garment_families: ['tunic', 'cloak', 'kimono'],
    summary: 'Contemporary setting',
    ...overrides,
  };
}

function makeProfile(name: string, garments: string[]): CharacterWardrobeProfile {
  return {
    character_name: name,
    character_id_or_key: name.toLowerCase(),
    wardrobe_identity_summary: `${name} wears ${garments.join(', ')}`,
    silhouette_language: 'fitted',
    fabric_language: 'cotton, linen',
    palette_logic: 'neutral',
    grooming_compatibility: 'modern',
    class_status_expression: 'working',
    public_private_variation: 'minimal',
    labor_formality_variation: 'casual to formal',
    ceremonial_variation: 'none',
    damage_wear_logic: 'realistic',
    signature_garments: garments,
    signature_accessories: [],
    costume_constraints: [],
    confidence: 'high',
    source_doc_types: ['canon'],
    extraction_version: '1.3.0',
    extracted_at: new Date().toISOString(),
  };
}

describe('resolveCharacterVCSInputs', () => {
  it('resolves real effective profiles from raw wardrobe data', () => {
    const temporal = makeTemporal();
    const chars = [
      { name: 'Alice', rawProfile: makeProfile('Alice', ['blazer', 'trousers']), hasLockedActor: true, hasHeroFrame: true },
      { name: 'Bob', rawProfile: makeProfile('Bob', ['tunic', 'cloak', 'boots']), hasLockedActor: false, hasHeroFrame: false },
    ];

    const result = resolveCharacterVCSInputs(chars, temporal);
    expect(result.withProfiles).toBe(2);
    expect(result.withoutProfiles).toBe(0);

    // Alice: modern garments should survive
    const alice = result.characters.find(c => c.name === 'Alice')!;
    expect(alice.effectiveProfile).not.toBeNull();
    expect(alice.effectiveProfile!.effective_signature_garments).toContain('blazer');
    expect(alice.effectiveProfile!.was_temporally_normalized).toBe(false);

    // Bob: tunic/cloak forbidden in contemporary — should be excluded
    const bob = result.characters.find(c => c.name === 'Bob')!;
    expect(bob.effectiveProfile).not.toBeNull();
    expect(bob.effectiveProfile!.effective_signature_garments).not.toContain('tunic');
    expect(bob.effectiveProfile!.effective_signature_garments).not.toContain('cloak');
    expect(bob.effectiveProfile!.effective_signature_garments).toContain('boots');
    expect(bob.effectiveProfile!.was_temporally_normalized).toBe(true);
    expect(bob.effectiveProfile!.excluded_garments.length).toBeGreaterThan(0);
  });

  it('counts characters without profiles', () => {
    const temporal = makeTemporal();
    const chars = [
      { name: 'Alice', rawProfile: makeProfile('Alice', ['blazer']), hasLockedActor: true, hasHeroFrame: true },
      { name: 'Unknown', rawProfile: null, hasLockedActor: false, hasHeroFrame: false },
    ];

    const result = resolveCharacterVCSInputs(chars, temporal);
    expect(result.withProfiles).toBe(1);
    expect(result.withoutProfiles).toBe(1);
  });

  it('handles null temporal truth gracefully', () => {
    const chars = [
      { name: 'Alice', rawProfile: makeProfile('Alice', ['tunic', 'blazer']), hasLockedActor: true, hasHeroFrame: true },
    ];
    const result = resolveCharacterVCSInputs(chars, null);
    expect(result.withProfiles).toBe(1);
    // Without temporal truth, no normalization happens
    const alice = result.characters[0];
    expect(alice.effectiveProfile!.was_temporally_normalized).toBe(false);
    expect(alice.effectiveProfile!.effective_signature_garments).toContain('tunic');
  });
});

describe('assembleVCSInputs', () => {
  it('hasWorldSystem is false when only canon exists', () => {
    const assembly = assembleVCSInputs({
      format: 'feature',
      genre: 'drama',
      tone: 'cinematic',
      temporalTruth: makeTemporal(),
      temporalSource: 'persisted',
      characters: [],
      charactersWithProfiles: 0,
      charactersWithoutProfiles: 0,
      pdFamiliesTotal: 0,
      pdFamiliesLocked: 0,
      pdDomainsCovered: [],
      heroFrameCount: 0,
      heroFrameApproved: 0,
      heroFramePrimaryApproved: false,
      hasWorldSystem: false, // explicit: no world_system doc
      hasVisualStyle: true,
      hasCanon: true,
    });

    expect(assembly.inputs.hasWorldSystem).toBe(false);
    expect(assembly.inputs.hasCanon).toBe(true);
    expect(assembly.diagnostics.worldSystemFound).toBe(false);
  });

  it('diagnostics reflect temporal source accurately', () => {
    const assembly = assembleVCSInputs({
      format: 'feature',
      genre: 'drama',
      tone: 'prestige',
      temporalTruth: makeTemporal(),
      temporalSource: 'fallback',
      characters: [],
      charactersWithProfiles: 0,
      charactersWithoutProfiles: 0,
      pdFamiliesTotal: 3,
      pdFamiliesLocked: 3,
      pdDomainsCovered: ['environment_atmosphere'],
      heroFrameCount: 2,
      heroFrameApproved: 1,
      heroFramePrimaryApproved: false,
      hasWorldSystem: true,
      hasVisualStyle: true,
      hasCanon: true,
    });

    expect(assembly.diagnostics.temporalSource).toBe('fallback');
    expect(assembly.diagnostics.temporalEra).toBe('contemporary');
  });

  it('diagnostics count characters accurately', () => {
    const temporal = makeTemporal();
    const chars = resolveCharacterVCSInputs([
      { name: 'A', rawProfile: makeProfile('A', ['blazer']), hasLockedActor: true, hasHeroFrame: false },
      { name: 'B', rawProfile: null, hasLockedActor: false, hasHeroFrame: false },
    ], temporal);

    const assembly = assembleVCSInputs({
      format: 'vertical',
      genre: 'thriller',
      tone: 'tense',
      temporalTruth: temporal,
      temporalSource: 'persisted',
      characters: chars.characters,
      charactersWithProfiles: chars.withProfiles,
      charactersWithoutProfiles: chars.withoutProfiles,
      pdFamiliesTotal: 0,
      pdFamiliesLocked: 0,
      pdDomainsCovered: [],
      heroFrameCount: 0,
      heroFrameApproved: 0,
      heroFramePrimaryApproved: false,
      hasWorldSystem: false,
      hasVisualStyle: false,
      hasCanon: true,
    });

    expect(assembly.diagnostics.totalCharacters).toBe(2);
    expect(assembly.diagnostics.charactersWithEffectiveProfiles).toBe(1);
    expect(assembly.diagnostics.charactersWithoutProfiles).toBe(1);
  });
});
