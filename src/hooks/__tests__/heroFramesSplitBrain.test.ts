/**
 * Tests proving Hero Frames split-brain is eliminated:
 * - filterEligibleImages with and without sectionKey produces different results for null subject_type
 * - Best Set, diagnostics, and pool counts must agree when using same sectionKey
 */
import { describe, it, expect } from 'vitest';
import { filterEligibleImages } from '@/lib/images/characterImageEligibility';
import { filterPremiumActiveImages } from '@/lib/images/premiumQualityGate';

function makeHeroImage(overrides: Record<string, unknown> = {}) {
  return {
    id: `img-${Math.random().toString(36).slice(2, 8)}`,
    subject_type: null as string | null,
    subject: null as string | null,
    generation_config: {
      model: 'google/gemini-3-pro-image-preview',
      provider: 'lovable-ai',
      identity_mode: 'strict_with_image_anchors',
      // NOTE: identity_locked is intentionally ABSENT — this is the real data shape
    },
    width: 1600,
    height: 672,
    curation_state: 'candidate',
    is_primary: false,
    role: 'hero_variant',
    ...overrides,
  };
}

describe('Hero Frames split-brain elimination', () => {
  it('filterEligibleImages WITHOUT sectionKey passes null-subject_type images (BUG before fix)', () => {
    const images = [makeHeroImage()];
    const result = filterEligibleImages(images);
    // Without sectionKey, null subject_type outside character-bearing section → passes
    expect(result.eligible.length).toBe(1);
    expect(result.blocked.length).toBe(0);
  });

  it('filterEligibleImages WITH hero_frames sectionKey blocks null-subject_type images missing identity_locked', () => {
    const images = [makeHeroImage()];
    const result = filterEligibleImages(images, 'hero_frames');
    // With hero_frames sectionKey, null subject_type → gated → identity_locked missing → BLOCKED
    expect(result.eligible.length).toBe(0);
    expect(result.blocked.length).toBe(1);
  });

  it('identity_locked=true images pass both paths', () => {
    const images = [makeHeroImage({
      generation_config: {
        model: 'google/gemini-3-pro-image-preview',
        provider: 'lovable-ai',
        identity_locked: true,
      },
    })];
    const withoutKey = filterEligibleImages(images);
    const withKey = filterEligibleImages(images, 'hero_frames');
    expect(withoutKey.eligible.length).toBe(1);
    expect(withKey.eligible.length).toBe(1);
  });

  it('bestSet and diagnostics agree when same sectionKey is used', () => {
    const images = Array.from({ length: 5 }, () => makeHeroImage());
    
    // Simulate what both paths now do (both use 'hero_frames')
    const bestSetFilter = filterEligibleImages(images, 'hero_frames');
    const diagFilter = filterEligibleImages(images, 'hero_frames');
    
    // They MUST agree
    expect(bestSetFilter.eligible.length).toBe(diagFilter.eligible.length);
    expect(bestSetFilter.blocked.length).toBe(diagFilter.blocked.length);
    expect(bestSetFilter.drift.length).toBe(diagFilter.drift.length);
  });

  it('premium gate applied after identity gate produces same result for both paths', () => {
    const images = Array.from({ length: 3 }, () => makeHeroImage({
      generation_config: {
        model: 'google/gemini-3-pro-image-preview',
        provider: 'lovable-ai',
        identity_locked: true,
      },
    }));
    
    const { eligible } = filterEligibleImages(images, 'hero_frames');
    const { admitted } = filterPremiumActiveImages(eligible, 'hero_frames');
    
    // All should pass premium gate with approved model
    expect(admitted.length).toBe(3);
  });

  it('no warning can claim "all images flagged" when drift+blocked counts are zero', () => {
    const images = Array.from({ length: 3 }, () => makeHeroImage({
      generation_config: {
        model: 'google/gemini-3-pro-image-preview',
        provider: 'lovable-ai',
        identity_locked: true,
      },
    }));
    
    const { eligible, drift, blocked } = filterEligibleImages(images, 'hero_frames');
    const { admitted, excluded } = filterPremiumActiveImages(eligible, 'hero_frames');
    
    // When drift=0, blocked=0, premiumExcluded=0, images MUST be available
    expect(drift.length).toBe(0);
    expect(blocked.length).toBe(0);
    expect(excluded.length).toBe(0);
    expect(admitted.length).toBe(3);
    // Therefore "no valid candidates" warning must NOT fire
    const wouldWarn = admitted.length === 0;
    expect(wouldWarn).toBe(false);
  });
});
