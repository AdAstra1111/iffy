/**
 * canonFirstWardrobe.test.ts — Tests for canon-first wardrobe derivation pipeline.
 *
 * Validates:
 * 1. Script-led override
 * 2. Class differentiation
 * 3. Period constraint enforcement
 * 4. State transformation (baseline → distinct outputs)
 */

import { describe, it, expect } from 'vitest';
import { resolveBaselineWardrobe, type CanonWardrobeInputs } from '../stateWardrobeReconstructor';
import type { CharacterWardrobeProfile } from '../characterWardrobeExtractor';
import type { TemporalTruth } from '../temporalTruthResolver';

// ── Helpers ──

function makeProfile(overrides: Partial<CharacterWardrobeProfile> = {}): CharacterWardrobeProfile {
  return {
    character_name: 'Test Character',
    class_status_expression: '',
    wardrobe_identity_summary: '',
    silhouette_language: '',
    fabric_language: '',
    signature_garments: [],
    signature_accessories: [],
    costume_constraints: [],
    labor_formality_variation: '',
    ceremonial_variation: '',
    public_private_variation: '',
    damage_wear_logic: '',
    source_doc_types: [],
    ...overrides,
  } as CharacterWardrobeProfile;
}

const modernTemporal: TemporalTruth = {
  era: 'modern',
  family: 'modern',
  confidence: 'high',
  forbidden_garment_families: [],
  label: 'Modern',
  provenance: 'explicit',
  evidence: [],
  contributing_sources: [],
  contradictions: [],
  era_garments: [],
  summary: 'Modern era',
};

const medievalTemporal: TemporalTruth = {
  era: 'medieval',
  family: 'historical',
  confidence: 'high',
  forbidden_garment_families: ['jeans', 'sneakers', 't-shirt'],
  label: 'Medieval',
  provenance: 'explicit',
  evidence: [],
  contributing_sources: [],
  contradictions: [],
  era_garments: [],
  summary: 'Medieval era',
};

// ── 1. Script-led override ──

describe('Script-led override', () => {
  it('uses script wardrobe hints when present and sufficient', () => {
    const profile = makeProfile({ signature_garments: ['generic shirt', 'generic pants'] });
    const canon: CanonWardrobeInputs = {
      scriptWardrobeHints: ['leather duster', 'worn boots', 'gun belt'],
    };
    const baseline = resolveBaselineWardrobe(profile, canon, modernTemporal);
    expect(baseline.baselineSource).toBe('script');
    expect(baseline.baseGarments).toContain('leather duster');
    expect(baseline.baseGarments).toContain('worn boots');
    // Should NOT contain profile fallback garments
    expect(baseline.baseGarments).not.toContain('generic shirt');
  });

  it('falls back to profile when script hints are insufficient (<2)', () => {
    const profile = makeProfile({ signature_garments: ['tunic', 'boots', 'belt'] });
    const canon: CanonWardrobeInputs = {
      scriptWardrobeHints: ['cloak'],
    };
    const baseline = resolveBaselineWardrobe(profile, canon, modernTemporal);
    // Single script hint is merged with profile, not enough alone
    expect(baseline.baselineSource).not.toBe('script');
  });
});

// ── 2. Class differentiation ──

describe('Class differentiation', () => {
  it('elite character gets fine quality prefix', () => {
    const profile = makeProfile({
      class_status_expression: 'elite aristocrat',
      wardrobe_identity_summary: 'wears a tailored jacket and silk vest',
    });
    const baseline = resolveBaselineWardrobe(profile, undefined, modernTemporal);
    const joined = baseline.baseGarments.join(' ');
    expect(joined).toMatch(/fine/i);
  });

  it('working class character gets sturdy quality prefix', () => {
    const profile = makeProfile({
      class_status_expression: 'working class laborer',
      wardrobe_identity_summary: 'wears a work shirt and heavy trousers',
    });
    const baseline = resolveBaselineWardrobe(profile, undefined, modernTemporal);
    const joined = baseline.baseGarments.join(' ');
    expect(joined).toMatch(/sturdy/i);
  });

  it('elite and working produce different fabrics', () => {
    const elite = makeProfile({ class_status_expression: 'elite noble' });
    const working = makeProfile({ class_status_expression: 'working peasant' });
    const eliteBaseline = resolveBaselineWardrobe(elite, undefined, modernTemporal);
    const workingBaseline = resolveBaselineWardrobe(working, undefined, modernTemporal);
    expect(eliteBaseline.baseFabrics.join(',')).not.toBe(workingBaseline.baseFabrics.join(','));
  });
});

// ── 3. Period constraint ──

describe('Period constraint enforcement', () => {
  it('medieval period filters out modern garments from script hints', () => {
    const profile = makeProfile();
    const canon: CanonWardrobeInputs = {
      scriptWardrobeHints: ['tunic', 'jeans', 'boots', 'sneakers'],
      worldConstraints: { period: 'medieval' },
    };
    const baseline = resolveBaselineWardrobe(profile, canon, medievalTemporal);
    expect(baseline.baseGarments).toContain('tunic');
    expect(baseline.baseGarments).toContain('boots');
    expect(baseline.baseGarments).not.toContain('jeans');
    expect(baseline.baseGarments).not.toContain('sneakers');
  });

  it('modern period does not filter standard modern garments', () => {
    const profile = makeProfile();
    const canon: CanonWardrobeInputs = {
      scriptWardrobeHints: ['jeans', 't-shirt', 'sneakers'],
      worldConstraints: { period: 'modern' },
    };
    const baseline = resolveBaselineWardrobe(profile, canon, modernTemporal);
    expect(baseline.baseGarments).toContain('jeans');
    expect(baseline.baseGarments).toContain('sneakers');
  });
});

// ── 4. State transformation (baseline preserved, axes differ) ──

describe('Baseline + state transformation', () => {
  it('resolveBaselineWardrobe returns stable baseline across calls', () => {
    const profile = makeProfile({
      class_status_expression: 'artisan merchant',
      wardrobe_identity_summary: 'wears a leather apron over a work tunic with sturdy boots',
    });
    const b1 = resolveBaselineWardrobe(profile, undefined, modernTemporal);
    const b2 = resolveBaselineWardrobe(profile, undefined, modernTemporal);
    expect(b1.baseGarments).toEqual(b2.baseGarments);
    expect(b1.baseFabrics).toEqual(b2.baseFabrics);
    expect(b1.baseSilhouette).toBe(b2.baseSilhouette);
  });

  it('baseline source reflects canon_character when profile has garments', () => {
    const profile = makeProfile({
      class_status_expression: 'working artisan',
      wardrobe_identity_summary: 'wears a leather apron and work boots daily',
    });
    const baseline = resolveBaselineWardrobe(profile, undefined, modernTemporal);
    expect(['canon_character', 'profile']).toContain(baseline.baselineSource);
    expect(baseline.baseGarments.length).toBeGreaterThanOrEqual(2);
  });

  it('climate modifier affects silhouette', () => {
    const profile = makeProfile();
    const canon: CanonWardrobeInputs = {
      scriptWardrobeHints: ['coat', 'boots', 'scarf'],
      worldConstraints: { climate: 'arctic' },
    };
    const baseline = resolveBaselineWardrobe(profile, canon, modernTemporal);
    expect(baseline.baseSilhouette).toMatch(/heavy insulated/i);
  });
});

// ── 5. Backward compatibility ──

describe('Backward compatibility', () => {
  it('resolveBaselineWardrobe works with no canon inputs', () => {
    const profile = makeProfile({ signature_garments: ['shirt', 'trousers', 'boots'] });
    const baseline = resolveBaselineWardrobe(profile, undefined, undefined);
    expect(baseline.baseGarments.length).toBeGreaterThanOrEqual(2);
  });

  it('resolveBaselineWardrobe works with empty canon inputs', () => {
    const profile = makeProfile({ signature_garments: ['dress', 'shoes'] });
    const baseline = resolveBaselineWardrobe(profile, {}, modernTemporal);
    expect(baseline.baseGarments.length).toBeGreaterThanOrEqual(2);
  });
});
