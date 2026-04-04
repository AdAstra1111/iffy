/**
 * effectiveProfileResolver tests — Canonical wardrobe normalization regression suite.
 *
 * Proves:
 * 1. Raw forbidden garments are removed from effective profile
 * 2. Allowed garments are preserved
 * 3. Scene-explicit garments bypass exclusion
 * 4. Identity summary is cleaned
 * 5. resolveStateWardrobe uses effective profile
 */

import { describe, it, expect } from 'vitest';
import { resolveEffectiveProfile, resolveEffectiveProfileOrNull } from '../effectiveProfileResolver';
import { resolveStateWardrobe } from '../costumeOnActor';
import type { CharacterWardrobeProfile, WardrobeStateDefinition } from '../characterWardrobeExtractor';
import type { TemporalTruth } from '../temporalTruthResolver';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<CharacterWardrobeProfile> = {}): CharacterWardrobeProfile {
  return {
    character_name: 'Elena',
    character_id_or_key: 'elena',
    wardrobe_identity_summary: 'artisan protagonist — gown, tunic, cloak',
    silhouette_language: 'flowing silhouette',
    fabric_language: 'cotton, linen',
    palette_logic: 'earth tones',
    grooming_compatibility: 'natural',
    class_status_expression: 'artisan [world-inferred]',
    public_private_variation: '',
    labor_formality_variation: '',
    ceremonial_variation: '',
    damage_wear_logic: '',
    signature_garments: ['gown', 'tunic', 'cloak', 'boots', 'jacket'],
    signature_accessories: ['scarf'],
    costume_constraints: [],
    confidence: 'medium',
    source_doc_types: ['canon'],
    extraction_version: '1.3.0',
    extracted_at: new Date().toISOString(),
    ...overrides,
  };
}

const CONTEMPORARY_TRUTH: TemporalTruth = {
  era: 'contemporary',
  family: 'modern',
  label: 'Contemporary (21st Century)',
  provenance: 'explicit',
  confidence: 'high',
  evidence: [{ source: 'project_canon.setting', text_snippet: 'modern day city', matched_era: 'contemporary', strength: 'strong' }],
  contributing_sources: ['project_canon'],
  contradictions: [],
  era_garments: ['shirt', 'jeans', 'jacket', 'sneakers', 'hoodie'],
  forbidden_garment_families: ['tunic', 'cloak', 'robe', 'kimono', 'toga', 'tabard', 'doublet', 'bodice', 'corset', 'gown', 'cape'],
  summary: 'Contemporary (21st Century) (explicit, high confidence)',
};

const LOW_CONFIDENCE_TRUTH: TemporalTruth = {
  ...CONTEMPORARY_TRUTH,
  confidence: 'low',
};

function makeState(overrides: Partial<WardrobeStateDefinition> = {}): WardrobeStateDefinition {
  return {
    state_key: 'default',
    label: 'Default',
    rationale: 'baseline',
    explicit_or_inferred: 'inferred',
    trigger_conditions: [],
    garment_adjustments: [],
    fabric_adjustments: [],
    silhouette_adjustments: [],
    accessory_adjustments: [],
    grooming_adjustments: [],
    continuity_notes: [],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('resolveEffectiveProfile', () => {
  it('removes forbidden garments from contemporary profile', () => {
    const profile = makeProfile();
    const result = resolveEffectiveProfile(profile, CONTEMPORARY_TRUTH);

    expect(result.effective_signature_garments).not.toContain('tunic');
    expect(result.effective_signature_garments).not.toContain('cloak');
    expect(result.effective_signature_garments).not.toContain('gown');
    expect(result.effective_signature_garments).toContain('boots');
    expect(result.effective_signature_garments).toContain('jacket');
    // signature_garments is also overwritten
    expect(result.signature_garments).toEqual(result.effective_signature_garments);
  });

  it('records exclusions with provenance', () => {
    const profile = makeProfile();
    const result = resolveEffectiveProfile(profile, CONTEMPORARY_TRUTH);

    expect(result.excluded_garments.length).toBeGreaterThanOrEqual(3);
    expect(result.excluded_garments.some(e => e.item === 'tunic')).toBe(true);
    expect(result.excluded_garments[0].reason).toBe('temporal_forbidden');
    expect(result.was_temporally_normalized).toBe(true);
    expect(result.normalization_reasons.length).toBeGreaterThan(0);
  });

  it('cleans identity summary of forbidden garment names', () => {
    const profile = makeProfile();
    const result = resolveEffectiveProfile(profile, CONTEMPORARY_TRUTH);

    expect(result.effective_identity_summary).not.toMatch(/tunic/i);
    expect(result.effective_identity_summary).not.toMatch(/cloak/i);
    expect(result.effective_identity_summary).not.toMatch(/gown/i);
  });

  it('preserves all garments when no temporal truth', () => {
    const profile = makeProfile();
    const result = resolveEffectiveProfile(profile, null);

    expect(result.effective_signature_garments).toEqual(profile.signature_garments);
    expect(result.excluded_garments).toEqual([]);
    expect(result.was_temporally_normalized).toBe(false);
  });

  it('preserves all garments when temporal confidence is low', () => {
    const profile = makeProfile();
    const result = resolveEffectiveProfile(profile, LOW_CONFIDENCE_TRUTH);

    expect(result.effective_signature_garments).toEqual(profile.signature_garments);
    expect(result.was_temporally_normalized).toBe(false);
  });

  it('scene-explicit forbidden garments are excluded with contradiction reason', () => {
    const profile = makeProfile({ signature_garments: ['tunic', 'boots'] });
    // tunic is forbidden — scene evidence does NOT bypass temporal exclusion
    const result = resolveEffectiveProfile(profile, CONTEMPORARY_TRUTH, ['tunic']);

    expect(result.effective_signature_garments).not.toContain('tunic');
    expect(result.effective_signature_garments).toContain('boots');
    expect(result.excluded_garments.length).toBe(1);
    expect(result.excluded_garments[0].item).toBe('tunic');
    expect(result.excluded_garments[0].reason).toBe('contradiction_demoted');
  });

  it('resolveEffectiveProfileOrNull returns null for null profile', () => {
    const result = resolveEffectiveProfileOrNull(null, CONTEMPORARY_TRUTH);
    expect(result).toBeNull();
  });
});

describe('resolveStateWardrobe with effective profile', () => {
  it('state garments from clean effective profile only', () => {
    const profile = makeProfile();
    const state = makeState();
    const result = resolveStateWardrobe(profile, state, CONTEMPORARY_TRUTH);

    // No forbidden garments should appear
    const garmentNames = result.garments.map(g => g.toLowerCase());
    expect(garmentNames).not.toContain('tunic');
    expect(garmentNames).not.toContain('cloak');
    expect(garmentNames).not.toContain('gown');
    expect(garmentNames).toContain('boots');
    expect(garmentNames).toContain('jacket');
  });

  it('scene-explicit forbidden garments are excluded even at state level', () => {
    const profile = makeProfile({ signature_garments: ['tunic', 'boots'] });
    // scene delivers tunic explicitly via garment_adjustments
    const state = makeState({
      explicit_or_inferred: 'explicit',
      trigger_conditions: ['scene:3'],
      garment_adjustments: ['tunic'],
    });
    const result = resolveStateWardrobe(profile, state, CONTEMPORARY_TRUTH);

    // tunic from scene should NOT survive — temporal truth wins
    expect(result.garments.map(g => g.toLowerCase())).not.toContain('tunic');
    expect(result.exclusions.some(e => e.item === 'tunic')).toBe(true);
    expect(result.exclusions.find(e => e.item === 'tunic')?.reason).toBe('contradiction_demoted');
  });

  it('exclusions array populated from effective profile', () => {
    const profile = makeProfile();
    const state = makeState();
    const result = resolveStateWardrobe(profile, state, CONTEMPORARY_TRUTH);

    expect(result.exclusions.length).toBeGreaterThanOrEqual(1);
    expect(result.exclusions.some(e => e.item === 'tunic')).toBe(true);
  });
});
