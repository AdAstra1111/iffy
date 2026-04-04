/**
 * Tests proving Hero Frame generation contract alignment with governance gate.
 * 
 * Verifies that the metadata shape produced by generate-hero-frames
 * satisfies filterEligibleImages('hero_frames') requirements.
 */
import { describe, it, expect } from 'vitest';
import { filterEligibleImages } from '@/lib/images/characterImageEligibility';
import { filterPremiumActiveImages } from '@/lib/images/premiumQualityGate';

/** Simulates the exact shape written by the PATCHED generate-hero-frames edge function */
function makeGeneratedHeroImage(overrides: Record<string, unknown> = {}) {
  return {
    id: `img-${Math.random().toString(36).slice(2, 8)}`,
    // ── PATCHED: subject_type is now set based on character presence ──
    subject_type: 'character' as string | null,
    subject: 'Test Character' as string | null,
    generation_config: {
      model: 'google/gemini-3-pro-image-preview',
      provider: 'lovable-ai',
      quality_target: 'premium',
      source_feature: 'hero_frames_engine',
      // ── CRITICAL: identity_locked is now always true ──
      identity_locked: true,
      identity_mode: 'strict_with_image_anchors',
      narrative_function: 'protagonist_intro',
      character_count: 2,
      characters_bound: [{ name: 'Test', actorVersionId: 'v1', anchorCount: 2, referenceImagesInjected: 2 }],
      reference_images_total: 2,
    },
    width: 1344,
    height: 768,
    curation_state: 'candidate',
    is_primary: false,
    role: 'hero_variant',
    ...overrides,
  };
}

/** Simulates OLD generation shape (missing identity_locked, null subject_type) */
function makeLegacyHeroImage(overrides: Record<string, unknown> = {}) {
  return {
    id: `img-${Math.random().toString(36).slice(2, 8)}`,
    subject_type: null as string | null,
    subject: null as string | null,
    generation_config: {
      model: 'google/gemini-3-pro-image-preview',
      provider: 'lovable-ai',
      identity_mode: 'strict_with_image_anchors',
      // identity_locked is ABSENT — the old bug
    },
    width: 1344,
    height: 768,
    curation_state: 'candidate',
    is_primary: false,
    role: 'hero_variant',
    ...overrides,
  };
}

describe('Hero Frame generation contract alignment', () => {
  it('NEW generation shape passes identity gate in hero_frames section', () => {
    const images = [makeGeneratedHeroImage()];
    const { eligible, blocked, drift } = filterEligibleImages(images, 'hero_frames');
    expect(eligible.length).toBe(1);
    expect(blocked.length).toBe(0);
    expect(drift.length).toBe(0);
  });

  it('OLD generation shape (missing identity_locked) is blocked', () => {
    const images = [makeLegacyHeroImage()];
    const { eligible, blocked } = filterEligibleImages(images, 'hero_frames');
    expect(eligible.length).toBe(0);
    expect(blocked.length).toBe(1);
  });

  it('NEW shape also passes premium quality gate', () => {
    const images = [makeGeneratedHeroImage()];
    const { eligible } = filterEligibleImages(images, 'hero_frames');
    const { admitted, excluded } = filterPremiumActiveImages(eligible, 'hero_frames');
    expect(admitted.length).toBe(1);
    expect(excluded.length).toBe(0);
  });

  it('batch of new-shape images: zero blocked', () => {
    const images = Array.from({ length: 6 }, (_, i) => makeGeneratedHeroImage({
      generation_config: {
        model: 'google/gemini-3-pro-image-preview',
        provider: 'lovable-ai',
        identity_locked: true,
        narrative_function: ['world_setup', 'protagonist_intro', 'inciting_disruption', 'key_relationship', 'climax_transformation', 'aftermath_iconic'][i],
      },
    }));
    const { eligible, blocked } = filterEligibleImages(images, 'hero_frames');
    expect(eligible.length).toBe(6);
    expect(blocked.length).toBe(0);
  });

  it('environment-only frames (no characters) with identity_locked pass the gate', () => {
    const images = [makeGeneratedHeroImage({
      subject_type: 'environment',
      subject: null,
      generation_config: {
        model: 'google/gemini-3-pro-image-preview',
        provider: 'lovable-ai',
        identity_locked: true,
        narrative_function: 'world_setup',
        character_count: 0,
      },
    })];
    const { eligible, blocked } = filterEligibleImages(images, 'hero_frames');
    expect(eligible.length).toBe(1);
    expect(blocked.length).toBe(0);
  });

  it('narrative_function metadata is preserved through filtering', () => {
    const img = makeGeneratedHeroImage({
      generation_config: {
        model: 'google/gemini-3-pro-image-preview',
        provider: 'lovable-ai',
        identity_locked: true,
        narrative_function: 'climax_transformation',
      },
    });
    const { eligible } = filterEligibleImages([img], 'hero_frames');
    expect(eligible.length).toBe(1);
    const gc = (eligible[0].generation_config || {}) as Record<string, unknown>;
    expect(gc.narrative_function).toBe('climax_transformation');
  });
});
