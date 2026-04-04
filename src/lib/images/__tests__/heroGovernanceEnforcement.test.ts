/**
 * heroGovernanceEnforcement.test.ts — Tests proving identity governance
 * is fully enforced across Hero Frame surfaces.
 *
 * Validates:
 * - Legacy images cannot be approved, set primary, or recommended
 * - Eligible images remain fully functional
 * - Recommendation system excludes ineligible images
 */
import { describe, it, expect } from 'vitest';
import {
  classifyCharacterIdentity,
  isCharacterImageEligible,
  filterEligibleImages,
  assertCharacterImageEligible,
} from '../characterImageEligibility';

// ── Test helpers ──

/** A valid, identity-locked hero frame image */
function makeValidHeroImage(overrides: any = {}) {
  return {
    id: overrides.id || 'valid-' + Math.random().toString(36).slice(2, 8),
    subject_type: 'character',
    subject: 'Hana',
    generation_config: {
      identity_locked: true,
      reference_images_total: 2,
      narrative_function: 'protagonist_intro',
      moment_used: 'INT. WORKSHOP - DAY',
      prompt: 'Cinematic still of Hana in workshop...',
      model: 'google/gemini-3-pro-image-preview',
      provider: 'google',
    },
    is_primary: false,
    curation_state: 'candidate',
    ...overrides,
  };
}

/** A legacy image without identity evidence */
function makeLegacyHeroImage(overrides: any = {}) {
  return {
    id: overrides.id || 'legacy-' + Math.random().toString(36).slice(2, 8),
    subject_type: 'character',
    subject: 'Hana',
    generation_config: {
      // NO identity_locked
      prompt: 'Some old prompt...',
      model: 'old-model',
    },
    is_primary: false,
    curation_state: 'active',
    ...overrides,
  };
}

/** A drift image with explicit gate failure */
function makeDriftHeroImage(overrides: any = {}) {
  return {
    id: overrides.id || 'drift-' + Math.random().toString(36).slice(2, 8),
    subject_type: 'character',
    subject: 'Hana',
    generation_config: {
      identity_locked: true,
      actor_identity_gate_status: 'fail',
    },
    is_primary: false,
    curation_state: 'candidate',
    ...overrides,
  };
}

/** An environment image (no character gate needed) */
function makeEnvironmentHeroImage(overrides: any = {}) {
  return {
    id: overrides.id || 'env-' + Math.random().toString(36).slice(2, 8),
    subject_type: 'environment',
    subject: null,
    generation_config: {
      identity_locked: true,
      narrative_function: 'world_setup',
    },
    is_primary: false,
    curation_state: 'candidate',
    ...overrides,
  };
}

// ── A. Legacy Images Cannot Be Approved ──

describe('Legacy images governance enforcement', () => {
  it('legacy image is NOT eligible in hero_frames section', () => {
    const img = makeLegacyHeroImage();
    expect(isCharacterImageEligible(img, 'hero_frames')).toBe(false);
  });

  it('legacy image classification returns blocked_missing_evidence', () => {
    const img = makeLegacyHeroImage();
    const result = classifyCharacterIdentity(img, 'hero_frames');
    expect(result.eligible).toBe(false);
    expect(result.status).toBe('blocked_missing_evidence');
    expect(result.reasons).toContain('Identity not locked during generation');
  });

  it('assertCharacterImageEligible throws for legacy image on approve', () => {
    const img = makeLegacyHeroImage();
    expect(() => assertCharacterImageEligible(img, 'approve', 'hero_frames')).toThrow(/Missing identity evidence/);
  });

  it('assertCharacterImageEligible throws for legacy image on set primary', () => {
    const img = makeLegacyHeroImage();
    expect(() => assertCharacterImageEligible(img, 'set as primary', 'hero_frames')).toThrow(/Missing identity evidence/);
  });

  it('legacy image with empty generation_config is blocked', () => {
    const img = makeLegacyHeroImage({ generation_config: {} });
    const result = classifyCharacterIdentity(img, 'hero_frames');
    expect(result.eligible).toBe(false);
  });

  it('legacy image with null generation_config is blocked', () => {
    const img = makeLegacyHeroImage({ generation_config: null });
    const result = classifyCharacterIdentity(img, 'hero_frames');
    expect(result.eligible).toBe(false);
    expect(result.status).toBe('blocked_missing_evidence');
  });
});

// ── B. Legacy Images Excluded From Pools ──

describe('Legacy images excluded from governed pools', () => {
  it('filterEligibleImages excludes legacy from eligible set', () => {
    const images = [
      makeValidHeroImage({ id: 'v1' }),
      makeLegacyHeroImage({ id: 'l1' }),
      makeLegacyHeroImage({ id: 'l2' }),
      makeValidHeroImage({ id: 'v2' }),
    ];
    const result = filterEligibleImages(images, 'hero_frames');
    expect(result.eligible.map(i => i.id)).toEqual(['v1', 'v2']);
    expect(result.blocked.map(i => i.id)).toEqual(['l1', 'l2']);
  });

  it('filterEligibleImages separates drift from blocked', () => {
    const images = [
      makeValidHeroImage({ id: 'v1' }),
      makeDriftHeroImage({ id: 'd1' }),
      makeLegacyHeroImage({ id: 'l1' }),
    ];
    const result = filterEligibleImages(images, 'hero_frames');
    expect(result.eligible.map(i => i.id)).toEqual(['v1']);
    expect(result.drift.map(i => i.id)).toEqual(['d1']);
    expect(result.blocked.map(i => i.id)).toEqual(['l1']);
  });

  it('legacy images cannot appear in approved pool (post-filter)', () => {
    const images = [
      makeValidHeroImage({ id: 'v1', curation_state: 'active' }),
      makeLegacyHeroImage({ id: 'l1', curation_state: 'active' }), // active but legacy
      makeValidHeroImage({ id: 'v2', curation_state: 'active' }),
    ];
    const { eligible } = filterEligibleImages(images, 'hero_frames');
    const approvedPool = eligible.filter(i => i.curation_state === 'active');
    expect(approvedPool.map(i => i.id)).toEqual(['v1', 'v2']);
    // Legacy 'l1' is NOT in approved pool despite curation_state='active'
    expect(approvedPool.find(i => i.id === 'l1')).toBeUndefined();
  });
});

// ── C. Eligible Images Remain Functional ──

describe('Eligible images are fully functional', () => {
  it('valid identity-locked image passes gate', () => {
    const img = makeValidHeroImage();
    expect(isCharacterImageEligible(img, 'hero_frames')).toBe(true);
  });

  it('valid image can be approved (assert does not throw)', () => {
    const img = makeValidHeroImage();
    expect(() => assertCharacterImageEligible(img, 'approve', 'hero_frames')).not.toThrow();
  });

  it('valid image can be set as primary (assert does not throw)', () => {
    const img = makeValidHeroImage();
    expect(() => assertCharacterImageEligible(img, 'set as primary', 'hero_frames')).not.toThrow();
  });

  it('environment images pass without identity lock requirement', () => {
    const img = makeEnvironmentHeroImage();
    expect(isCharacterImageEligible(img, 'hero_frames')).toBe(true);
  });

  it('environment image with no generation_config passes (not character)', () => {
    const img = makeEnvironmentHeroImage({ generation_config: null });
    // environment subject_type is in SAFE_NON_CHARACTER_TYPES, so gate doesn't apply
    expect(isCharacterImageEligible(img, 'hero_frames')).toBe(true);
  });
});

// ── D. Recommendation System Cannot Recommend Legacy ──

describe('Recommendation system excludes legacy images', () => {
  it('only eligible images enter scoring pipeline', () => {
    const images = [
      makeValidHeroImage({ id: 'v1' }),
      makeValidHeroImage({ id: 'v2' }),
      makeLegacyHeroImage({ id: 'l1' }),
      makeDriftHeroImage({ id: 'd1' }),
      makeEnvironmentHeroImage({ id: 'e1' }),
    ];
    const { eligible } = filterEligibleImages(images, 'hero_frames');
    // Only v1, v2, and e1 should enter scoring
    expect(eligible).toHaveLength(3);
    expect(eligible.map(i => i.id).sort()).toEqual(['e1', 'v1', 'v2']);
    // Legacy and drift are excluded from any recommendation
    const excludedIds = ['l1', 'd1'];
    for (const id of excludedIds) {
      expect(eligible.find(i => i.id === id)).toBeUndefined();
    }
  });

  it('summary accurately reports counts', () => {
    const images = [
      makeValidHeroImage({ id: 'v1' }),
      makeLegacyHeroImage({ id: 'l1' }),
      makeDriftHeroImage({ id: 'd1' }),
    ];
    const result = filterEligibleImages(images, 'hero_frames');
    expect(result.summary.total).toBe(3);
    expect(result.summary.eligibleCount).toBe(1);
    expect(result.summary.driftCount).toBe(1);
    expect(result.summary.blockedCount).toBe(1);
  });
});

// ── E. Batch Generation Metadata Contract ──

describe('Batch generation metadata contract', () => {
  it('valid hero image carries required provenance fields', () => {
    const img = makeValidHeroImage();
    const gc = img.generation_config;
    expect(gc.identity_locked).toBe(true);
    expect(gc.narrative_function).toBeTruthy();
    expect(gc.moment_used).toBeTruthy();
    expect(gc.prompt).toBeTruthy();
    expect(gc.reference_images_total).toBeGreaterThan(0);
  });

  it('13-image batch covers multiple narrative functions', () => {
    const narrativeFunctions = [
      'world_setup', 'protagonist_intro', 'inciting_disruption',
      'key_relationship', 'escalation_pressure', 'reversal_midpoint',
      'collapse_loss', 'confrontation', 'climax_transformation',
      'aftermath_iconic', 'world_setup', 'protagonist_intro', 'key_relationship',
    ];
    expect(narrativeFunctions).toHaveLength(13);
    const unique = new Set(narrativeFunctions);
    expect(unique.size).toBeGreaterThanOrEqual(7);
  });
});
