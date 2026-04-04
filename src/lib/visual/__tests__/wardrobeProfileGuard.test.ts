/**
 * wardrobeProfileGuard.test.ts — Tests for placeholder/degraded profile detection.
 */
import { describe, it, expect } from 'vitest';
import { validateWardrobeProfile } from '../wardrobeProfileGuard';
import type { CharacterWardrobeProfile } from '../characterWardrobeExtractor';

function makeProfile(overrides: Partial<CharacterWardrobeProfile> = {}): CharacterWardrobeProfile {
  return {
    character_name: 'Hana',
    character_id_or_key: 'hana',
    wardrobe_identity_summary: 'artisan potter — apron, smock, work robe',
    silhouette_language: 'Practical, fitted upper body',
    fabric_language: 'linen, hemp, cotton',
    palette_logic: 'Work-stained',
    grooming_compatibility: 'Practical',
    class_status_expression: 'artisan (potter)',
    public_private_variation: 'Moderate',
    labor_formality_variation: 'Work state defined by potter occupation',
    ceremonial_variation: 'Ceremonial garments expected',
    damage_wear_logic: 'Regular wear expected',
    signature_garments: ['apron', 'smock', 'work robe'],
    signature_accessories: ['tools'],
    costume_constraints: [],
    confidence: 'high',
    source_doc_types: ['character_role'],
    extraction_version: '1.0.0',
    extracted_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('validateWardrobeProfile', () => {
  it('valid profile passes', () => {
    const result = validateWardrobeProfile(makeProfile());
    expect(result.valid).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it('null profile is degraded', () => {
    const result = validateWardrobeProfile(null);
    expect(result.valid).toBe(false);
    expect(result.degraded).toBe(true);
  });

  it('undetermined in summary is degraded', () => {
    const result = validateWardrobeProfile(makeProfile({
      wardrobe_identity_summary: 'undetermined unspecified — generic garments',
    }));
    expect(result.degraded).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('generic garments in summary is degraded', () => {
    const result = validateWardrobeProfile(makeProfile({
      wardrobe_identity_summary: 'elite advisor — generic garments',
    }));
    expect(result.degraded).toBe(true);
  });

  it('empty signature_garments is degraded', () => {
    const result = validateWardrobeProfile(makeProfile({
      signature_garments: [],
    }));
    expect(result.degraded).toBe(true);
  });

  it('trivial fabric language is degraded', () => {
    const result = validateWardrobeProfile(makeProfile({
      fabric_language: 'woven',
    }));
    expect(result.degraded).toBe(true);
  });

  it('low confidence is degraded', () => {
    const result = validateWardrobeProfile(makeProfile({
      confidence: 'low',
    }));
    expect(result.degraded).toBe(true);
  });

  it('valid elite profile with real garments passes', () => {
    const result = validateWardrobeProfile(makeProfile({
      wardrobe_identity_summary: 'elite advisor — robe, kimono, haori',
      signature_garments: ['robe', 'kimono', 'haori'],
      fabric_language: 'silk, brocade, fine cotton',
      confidence: 'high',
    }));
    expect(result.valid).toBe(true);
    expect(result.degraded).toBe(false);
  });
});
