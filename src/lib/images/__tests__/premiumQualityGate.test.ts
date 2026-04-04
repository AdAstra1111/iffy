/**
 * Tests for premiumQualityGate — PRIMARY eligibility + premium active governance.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyPremiumImageQuality,
  classifyPrimaryEligibility,
  isPrimaryEligibleImage,
  assertPrimaryEligible,
  filterPremiumActiveImages,
} from '../premiumQualityGate';

// ── Helpers ──

function makeImage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'img-test-1',
    subject_type: 'location',  // non-character by default to isolate premium gate tests
    subject: null,
    generation_config: {},
    width: 1920,
    height: 1080,
    asset_group: 'hero_frame',
    generation_purpose: 'hero_frame',
    strategy_key: null,
    prestige_style: null,
    ...overrides,
  };
}

/** Character image that passes identity gate */
function makeCharacterImage(overrides: Record<string, unknown> = {}) {
  return makeImage({
    subject_type: 'character',
    subject: 'hana',
    generation_config: { identity_locked: true, model: 'google/gemini-3-pro-image-preview' },
    ...overrides,
  });
}

// ── classifyPremiumImageQuality ──

describe('classifyPremiumImageQuality', () => {
  it('passes for approved premium model', () => {
    const result = classifyPremiumImageQuality(makeImage({
      generation_config: { model: 'google/gemini-3-pro-image-preview', provider: 'lovable-ai' },
    }));
    expect(result.status).toBe('premium_pass');
    expect(result.reasons).toHaveLength(0);
  });

  it('passes for approved standard model', () => {
    const result = classifyPremiumImageQuality(makeImage({
      generation_config: { model: 'google/gemini-3.1-flash-image-preview' },
    }));
    expect(result.status).toBe('premium_pass');
  });

  it('fails for legacy/fast model', () => {
    const result = classifyPremiumImageQuality(makeImage({
      generation_config: { model: 'google/gemini-2.5-flash-image' },
    }));
    expect(result.status).toBe('premium_fail');
    expect(result.reasons[0]).toContain('Legacy/fast model');
  });

  it('fails for missing model provenance (fail-closed)', () => {
    const result = classifyPremiumImageQuality(makeImage({
      generation_config: {},
    }));
    expect(result.status).toBe('premium_fail');
    expect(result.reasons[0]).toContain('No model provenance');
  });

  it('fails for unknown model (fail-closed)', () => {
    const result = classifyPremiumImageQuality(makeImage({
      generation_config: { model: 'some-new-model/v99' },
    }));
    expect(result.status).toBe('premium_fail');
    expect(result.reasons[0]).toContain('Unknown model');
  });

  it('warns for low resolution', () => {
    const result = classifyPremiumImageQuality(makeImage({
      width: 400, height: 300,
      generation_config: { model: 'google/gemini-3-pro-image-preview' },
    }));
    expect(result.status).toBe('premium_warn');
    expect(result.reasons[0]).toContain('Resolution too low');
  });
});

// ── classifyPrimaryEligibility ──

describe('classifyPrimaryEligibility', () => {
  it('blocks identity-drifted character image from primary', () => {
    const result = classifyPrimaryEligibility(makeCharacterImage({
      generation_config: { actor_identity_gate_status: 'fail', model: 'google/gemini-3-pro-image-preview' },
    }), 'hero_frames');
    expect(result.eligible).toBe(false);
    expect(result.status).toBe('blocked_identity');
  });

  it('blocks legacy model from primary in premium section', () => {
    const result = classifyPrimaryEligibility(makeImage({
      generation_config: { model: 'google/gemini-2.5-flash-image', identity_locked: true },
    }), 'hero_frames');
    expect(result.eligible).toBe(false);
    expect(result.status).toBe('blocked_quality');
  });

  it('allows premium model image as primary in hero_frames', () => {
    const result = classifyPrimaryEligibility(makeImage({
      generation_config: { model: 'google/gemini-3-pro-image-preview' },
    }), 'hero_frames');
    expect(result.eligible).toBe(true);
    expect(result.status).toBe('eligible');
  });

  it('blocks portrait aspect in premium landscape section', () => {
    const result = classifyPrimaryEligibility(makeImage({
      width: 600, height: 900,
      generation_config: { model: 'google/gemini-3-pro-image-preview' },
    }), 'hero_frames');
    expect(result.eligible).toBe(false);
    expect(result.status).toBe('blocked_quality');
    expect(result.reasons[0]).toContain('Aspect ratio');
  });

  it('allows any quality in non-premium section', () => {
    const result = classifyPrimaryEligibility(makeImage({
      generation_config: { model: 'google/gemini-2.5-flash-image' },
    }), 'world_locations');
    expect(result.eligible).toBe(true);
  });

  it('hard primary gate failure cannot be overridden by score rank', () => {
    // Simulates: top-ranked image that fails quality gate
    const img = makeImage({
      generation_config: { model: 'google/gemini-2.5-flash-image', identity_locked: true },
    });
    expect(isPrimaryEligibleImage(img as any, 'hero_frames')).toBe(false);
  });
});

// ── assertPrimaryEligible ──

describe('assertPrimaryEligible', () => {
  it('throws for ineligible primary', () => {
    const img = makeImage({
      generation_config: { model: 'google/gemini-2.5-flash-image' },
    });
    expect(() => assertPrimaryEligible(img as any, 'hero_frames')).toThrow('Cannot set as primary');
  });

  it('does not throw for eligible primary', () => {
    const img = makeImage({
      generation_config: { model: 'google/gemini-3-pro-image-preview' },
    });
    expect(() => assertPrimaryEligible(img as any, 'hero_frames')).not.toThrow();
  });
});

// ── filterPremiumActiveImages ──

describe('filterPremiumActiveImages', () => {
  it('excludes legacy model images from premium sections', () => {
    const images = [
      makeImage({ id: 'a', generation_config: { model: 'google/gemini-3-pro-image-preview' } }),
      makeImage({ id: 'b', generation_config: { model: 'google/gemini-2.5-flash-image' } }),
      makeImage({ id: 'c', generation_config: { model: 'google/gemini-3.1-flash-image-preview' } }),
    ];
    const { admitted, excluded } = filterPremiumActiveImages(images as any, 'hero_frames');
    expect(admitted).toHaveLength(2);
    expect(excluded).toHaveLength(1);
    expect(excluded[0].id).toBe('b');
  });

  it('passes all images in non-premium sections', () => {
    const images = [
      makeImage({ id: 'a', generation_config: { model: 'google/gemini-2.5-flash-image' } }),
    ];
    const { admitted, excluded, isFiltered } = filterPremiumActiveImages(images as any, 'texture_detail');
    expect(admitted).toHaveLength(1);
    expect(excluded).toHaveLength(0);
    expect(isFiltered).toBe(false);
  });

  it('hero_frames and poster_directions obey same premium governance', () => {
    const legacyImg = makeImage({ id: 'x', generation_config: { model: 'google/gemini-2.5-flash-image' } });
    const heroResult = filterPremiumActiveImages([legacyImg] as any, 'hero_frames');
    const posterResult = filterPremiumActiveImages([legacyImg] as any, 'poster_directions');
    expect(heroResult.excluded).toHaveLength(1);
    expect(posterResult.excluded).toHaveLength(1);
  });

  it('surfaces shortfall instead of silently filling with weak images', () => {
    // All images are legacy — admitted should be empty
    const images = [
      makeImage({ id: '1', generation_config: { model: 'google/gemini-2.5-flash-image' } }),
      makeImage({ id: '2', generation_config: { model: 'google/gemini-2.5-flash-image' } }),
    ];
    const { admitted, excluded } = filterPremiumActiveImages(images as any, 'hero_frames');
    expect(admitted).toHaveLength(0);
    expect(excluded).toHaveLength(2);
    // Shortfall is visible — system does not silently promote weak images
  });

  it('excludes images with missing model provenance from premium sections (fail-closed)', () => {
    const images = [
      makeImage({ id: 'no-model', generation_config: {} }),
      makeImage({ id: 'good', generation_config: { model: 'google/gemini-3-pro-image-preview' } }),
    ];
    const { admitted, excluded } = filterPremiumActiveImages(images as any, 'hero_frames');
    expect(admitted).toHaveLength(1);
    expect(admitted[0].id).toBe('good');
    expect(excluded).toHaveLength(1);
    expect(excluded[0].id).toBe('no-model');
  });

  it('excludes images with unknown model from premium sections (fail-closed)', () => {
    const images = [
      makeImage({ id: 'unknown', generation_config: { model: 'some-random-model' } }),
    ];
    const { admitted, excluded } = filterPremiumActiveImages(images as any, 'poster_directions');
    expect(admitted).toHaveLength(0);
    expect(excluded).toHaveLength(1);
  });

  it('no premium query path bypasses the filter for premium sections', () => {
    // Verify both hero_frames and poster_directions are filtered
    const mixedImages = [
      makeImage({ id: 'premium', generation_config: { model: 'google/gemini-3-pro-image-preview' } }),
      makeImage({ id: 'legacy', generation_config: { model: 'google/gemini-2.5-flash-image' } }),
      makeImage({ id: 'no-prov', generation_config: {} }),
    ];
    for (const section of ['hero_frames', 'poster_directions']) {
      const { admitted, excluded } = filterPremiumActiveImages(mixedImages as any, section);
      expect(admitted).toHaveLength(1);
      expect(excluded).toHaveLength(2);
    }
  });
});
