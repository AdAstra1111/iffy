/**
 * stateWardrobeIntelligence.test.ts — Regression tests proving state wardrobe
 * reconstruction is character-specific, not just era-generic.
 *
 * Tests the contract that profile semantic fields (labor_formality_variation,
 * ceremonial_variation, public_private_variation, damage_wear_logic, etc.)
 * actually influence the resolved garments and reduce fallback dependence.
 */

import { describe, it, expect } from 'vitest';
import { reconstructStateGarments, classifyStateCategory, type StateCategory } from '../stateWardrobeReconstructor';
import { resolveStateWardrobe } from '../costumeOnActor';
import type { CharacterWardrobeProfile, WardrobeStateDefinition } from '../characterWardrobeExtractor';
import type { TemporalTruth } from '../temporalTruthResolver';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<CharacterWardrobeProfile> = {}): CharacterWardrobeProfile {
  return {
    character_name: 'Test Character',
    character_id_or_key: 'test_char',
    wardrobe_identity_summary: 'A humble potter in a feudal village',
    silhouette_language: 'loose, layered, practical',
    fabric_language: 'hemp, rough cotton, undyed linen',
    palette_logic: 'earth tones, clay browns, faded indigo',
    grooming_compatibility: 'tied back, simple',
    class_status_expression: 'working class artisan',
    public_private_variation: 'Wears a clean tunic with a formal sash for public occasions; at home, a worn shift and bare feet',
    labor_formality_variation: 'At the kiln: leather apron over work tunic, rolled sleeves, sturdy sandals. Formal: cleaner tunic with belt.',
    ceremonial_variation: 'Borrows a fine robe for ceremonies, wears a ceremonial sash and clean sandals',
    damage_wear_logic: 'After conflict: torn tunic, bare feet, smeared clay on arms. Carries emotional weight in disheveled state.',
    signature_garments: ['tunic', 'apron', 'sandals'],
    signature_accessories: ['clay tools', 'belt pouch'],
    costume_constraints: ['Never wears armor', 'Always has clay-stained hands'],
    confidence: 'high',
    source_doc_types: ['blueprint', 'character_bible'],
    extraction_version: '1.3.0',
    extracted_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeState(key: string, label: string, triggers: string[] = []): WardrobeStateDefinition {
  return {
    state_key: key,
    label,
    rationale: `State for ${label}`,
    explicit_or_inferred: 'inferred',
    trigger_conditions: triggers,
    garment_adjustments: [],
    fabric_adjustments: [],
    silhouette_adjustments: [],
    accessory_adjustments: [],
    grooming_adjustments: [],
    continuity_notes: [],
  };
}

const FEUDAL_TEMPORAL: TemporalTruth = {
  era: 'feudal',
  family: 'historical',
  label: 'Feudal',
  provenance: 'explicit',
  confidence: 'high',
  evidence: [],
  contributing_sources: ['canon'],
  contradictions: [],
  era_garments: ['kimono', 'hakama', 'robe'],
  forbidden_garment_families: ['jeans', 'sneakers', 'hoodie', 't-shirt', 'blazer'],
  summary: 'Feudal Japan setting',
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('State Wardrobe Intelligence — Character-Specific Reconstruction', () => {
  const richProfile = makeProfile();

  it('work_labor state extracts garments from labor_formality_variation', () => {
    const state = makeState('work', 'Work / Labor', ['kiln', 'workshop']);
    const result = reconstructStateGarments(richProfile, state, FEUDAL_TEMPORAL);

    expect(result.intelligenceSources).toContain('profile_labor_variation');
    expect(result.isPrimarilyFallback).toBe(false);
    // Should contain garments extracted from labor_formality_variation prose
    const gLower = result.garments.map(g => g.toLowerCase());
    expect(gLower.some(g => g.includes('apron') || g.includes('tunic') || g.includes('sandals'))).toBe(true);
  });

  it('ceremonial state extracts garments from ceremonial_variation', () => {
    const state = makeState('ceremony', 'Ceremonial', ['festival', 'ritual']);
    const result = reconstructStateGarments(richProfile, state, FEUDAL_TEMPORAL);

    expect(result.intelligenceSources).toContain('profile_ceremonial_variation');
    expect(result.isPrimarilyFallback).toBe(false);
    const gLower = result.garments.map(g => g.toLowerCase());
    expect(gLower.some(g => g.includes('robe') || g.includes('sash') || g.includes('sandals'))).toBe(true);
  });

  it('domestic_private state extracts from public_private_variation', () => {
    const state = makeState('domestic', 'Domestic / Private', ['home', 'chamber']);
    const result = reconstructStateGarments(richProfile, state, FEUDAL_TEMPORAL);

    expect(result.intelligenceSources).toContain('profile_public_private_variation');
    expect(result.isPrimarilyFallback).toBe(false);
    const gLower = result.garments.map(g => g.toLowerCase());
    expect(gLower.some(g => g.includes('tunic') || g.includes('shift') || g.includes('sash'))).toBe(true);
  });

  it('distress state extracts from damage_wear_logic', () => {
    const state = makeState('distress', 'Distress / Aftermath', ['wound', 'escape']);
    const result = reconstructStateGarments(richProfile, state, FEUDAL_TEMPORAL);

    expect(result.intelligenceSources).toContain('profile_damage_wear_logic');
    expect(result.isPrimarilyFallback).toBe(false);
    const gLower = result.garments.map(g => g.toLowerCase());
    expect(gLower.some(g => g.includes('tunic') || g.includes('torn'))).toBe(true);
  });

  it('public_formal state extracts from public_private_variation', () => {
    const state = makeState('public', 'Public / Formal', ['gathering', 'meeting']);
    const result = reconstructStateGarments(richProfile, state, FEUDAL_TEMPORAL);

    expect(result.intelligenceSources).toContain('profile_public_private_variation');
    expect(result.isPrimarilyFallback).toBe(false);
  });

  it('different states produce different garments for the SAME character', () => {
    const workState = makeState('work', 'Work / Labor', ['kiln']);
    const ceremonyState = makeState('ceremony', 'Ceremonial', ['festival']);
    const distressState = makeState('distress', 'Distress / Aftermath', ['wound']);
    const domesticState = makeState('domestic', 'Domestic / Private', ['home']);

    const workResult = reconstructStateGarments(richProfile, workState, FEUDAL_TEMPORAL);
    const ceremonyResult = reconstructStateGarments(richProfile, ceremonyState, FEUDAL_TEMPORAL);
    const distressResult = reconstructStateGarments(richProfile, distressState, FEUDAL_TEMPORAL);
    const domesticResult = reconstructStateGarments(richProfile, domesticState, FEUDAL_TEMPORAL);

    const fingerprint = (r: { garments: string[] }) => [...r.garments].sort().join('|').toLowerCase();

    const fps = new Set([
      fingerprint(workResult),
      fingerprint(ceremonyResult),
      fingerprint(distressResult),
      fingerprint(domesticResult),
    ]);

    // At least 3 out of 4 should be distinct
    expect(fps.size).toBeGreaterThanOrEqual(3);
  });

  it('class expression changes output deterministically', () => {
    const nobleProfile = makeProfile({
      class_status_expression: 'noble elite aristocrat',
      labor_formality_variation: '', // empty — forces era vocab path with class mod
      wardrobe_identity_summary: 'A noble in a feudal court',
    });
    const workerProfile = makeProfile({
      class_status_expression: 'working peasant laborer',
      labor_formality_variation: '', // empty
      wardrobe_identity_summary: 'A field laborer',
    });

    const state = makeState('work', 'Work / Labor', ['duty']);
    const nobleResult = reconstructStateGarments(nobleProfile, state, FEUDAL_TEMPORAL);
    const workerResult = reconstructStateGarments(workerProfile, state, FEUDAL_TEMPORAL);

    // Noble should get 'fine' prefix, worker should get 'sturdy' prefix
    const nobleFirst = nobleResult.garments[0]?.toLowerCase() || '';
    const workerFirst = workerResult.garments[0]?.toLowerCase() || '';

    expect(nobleFirst).toContain('fine');
    expect(workerFirst).toContain('sturdy');
    expect(nobleFirst).not.toBe(workerFirst);
  });

  it('profile with empty semantic fields falls back to era vocabulary and flags it', () => {
    const emptyProfile = makeProfile({
      labor_formality_variation: '',
      ceremonial_variation: '',
      public_private_variation: '',
      damage_wear_logic: '',
      wardrobe_identity_summary: '',
      class_status_expression: '',
    });

    const state = makeState('work', 'Work / Labor', ['craft']);
    const result = reconstructStateGarments(emptyProfile, state, FEUDAL_TEMPORAL);

    expect(result.isPrimarilyFallback).toBe(true);
    expect(result.intelligenceSources).toContain('era_vocabulary');
    expect(result.intelligenceDiagnostic).toContain('era vocabulary');
  });

  it('rich profile reduces era-fallback contribution', () => {
    const state = makeState('work', 'Work / Labor', ['kiln']);
    const richResult = reconstructStateGarments(richProfile, state, FEUDAL_TEMPORAL);

    expect(richResult.isPrimarilyFallback).toBe(false);
    expect(richResult.intelligenceSources.some(s => s.startsWith('profile_'))).toBe(true);
  });

  it('resolveStateWardrobe surfaces intelligence diagnostics', () => {
    const state = makeState('work', 'Work / Labor', ['workshop']);
    // Force reconstruction by making profile garments all forbidden
    const profileWithForbidden = makeProfile({
      signature_garments: ['jeans', 'sneakers', 'hoodie'],
    });

    const resolved = resolveStateWardrobe(profileWithForbidden, state, FEUDAL_TEMPORAL);

    expect(resolved.usedStateReconstruction).toBe(true);
    expect(resolved.intelligenceSources.length).toBeGreaterThan(0);
    expect(typeof resolved.intelligenceDiagnostic).toBe('string');
    expect(resolved.intelligenceDiagnostic.length).toBeGreaterThan(0);
  });

  it('forbidden garments never appear in reconstructed output', () => {
    const states = [
      makeState('work', 'Work / Labor', ['craft']),
      makeState('ceremony', 'Ceremonial', ['ritual']),
      makeState('distress', 'Distress / Aftermath', ['wound']),
      makeState('public', 'Public / Formal', ['gathering']),
    ];

    for (const state of states) {
      const result = reconstructStateGarments(richProfile, state, FEUDAL_TEMPORAL);
      const forbidden = new Set(FEUDAL_TEMPORAL.forbidden_garment_families.map(f => f.toLowerCase()));
      for (const g of result.garments) {
        const words = g.toLowerCase().split(/\s+/);
        for (const w of words) {
          expect(forbidden.has(w)).toBe(false);
        }
      }
    }
  });
});
