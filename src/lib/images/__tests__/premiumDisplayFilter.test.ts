/**
 * Tests for premiumDisplayFilter — governance at display boundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { filterForDisplay } from '../premiumDisplayFilter';

// Suppress console.warn in tests
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

function makeImg(overrides: Partial<any> = {}): any {
  return {
    id: 'img-1',
    subject: null,
    subject_type: null,
    generation_config: { model: 'google/gemini-3-pro-image-preview', identity_locked: true },
    width: 1920,
    height: 1080,
    asset_group: 'hero_frame',
    generation_purpose: 'hero_frame',
    strategy_key: null,
    prestige_style: null,
    ...overrides,
  };
}

describe('filterForDisplay', () => {
  it('passes premium-approved images in premium sections', () => {
    const img = makeImg();
    const { governed, excluded } = filterForDisplay([img], 'hero_frames');
    expect(governed).toHaveLength(1);
    expect(excluded).toHaveLength(0);
  });

  it('excludes legacy model images from premium sections', () => {
    const img = makeImg({ id: 'legacy', generation_config: { model: 'google/gemini-2.5-flash-image' } });
    const { governed, excluded } = filterForDisplay([img], 'hero_frames');
    expect(governed).toHaveLength(0);
    expect(excluded).toHaveLength(1);
  });

  it('excludes missing-provenance images from premium sections', () => {
    const img = makeImg({ id: 'no-model', generation_config: {} });
    const { governed, excluded } = filterForDisplay([img], 'hero_frames');
    expect(governed).toHaveLength(0);
    expect(excluded).toHaveLength(1);
  });

  it('excludes identity-drift images from character-bearing sections', () => {
    const img = makeImg({
      id: 'drift',
      subject_type: 'character',
      subject: 'Alice',
      generation_config: { model: 'google/gemini-3-pro-image-preview', identity_locked: false },
    });
    const { governed, excluded, summary } = filterForDisplay([img], 'hero_frames');
    expect(governed).toHaveLength(0);
    expect(excluded).toHaveLength(1);
    expect(summary.identityExcluded).toBe(1);
  });

  it('does NOT apply premium gate to non-premium sections', () => {
    const img = makeImg({
      id: 'legacy-ok',
      subject_type: 'location',
      generation_config: { model: 'google/gemini-2.5-flash-image' },
    });
    const { governed, excluded } = filterForDisplay([img], 'texture_detail');
    expect(governed).toHaveLength(1);
    expect(excluded).toHaveLength(0);
  });

  it('hero_frames and poster_directions apply the same premium governance', () => {
    const legacy = makeImg({ id: 'leg', generation_config: { model: 'google/gemini-2.5-flash-image' } });
    const heroResult = filterForDisplay([legacy], 'hero_frames');
    const posterResult = filterForDisplay([legacy], 'poster_directions');
    expect(heroResult.excluded).toHaveLength(1);
    expect(posterResult.excluded).toHaveLength(1);
  });

  it('stale active primary failing premium gate is excluded from display', () => {
    const staleImg = makeImg({
      id: 'stale-primary',
      is_primary: true,
      curation_state: 'active',
      generation_config: { model: 'google/gemini-2.5-flash-image' },
    });
    const { governed, excluded } = filterForDisplay([staleImg], 'hero_frames');
    expect(governed).toHaveLength(0);
    expect(excluded).toHaveLength(1);
  });

  it('stale active primary with missing provenance is excluded from display', () => {
    const staleImg = makeImg({
      id: 'no-prov-primary',
      is_primary: true,
      curation_state: 'active',
      generation_config: null,
      subject_type: 'character',
      subject: 'Alice',
    });
    const { governed, excluded } = filterForDisplay([staleImg], 'hero_frames');
    expect(governed).toHaveLength(0);
    expect(excluded).toHaveLength(1);
  });

  it('mixed pool: only governance-passing images survive', () => {
    const images = [
      makeImg({ id: 'good', generation_config: { model: 'google/gemini-3-pro-image-preview', identity_locked: true } }),
      makeImg({ id: 'legacy', generation_config: { model: 'google/gemini-2.5-flash-image' } }),
      makeImg({ id: 'no-model', generation_config: {} }),
    ];
    const { governed, excluded, summary } = filterForDisplay(images, 'poster_directions');
    expect(governed).toHaveLength(1);
    expect(governed[0].id).toBe('good');
    expect(excluded).toHaveLength(2);
    // One is premium-excluded, the other may be identity or premium excluded
    expect(summary.premiumExcluded + summary.identityExcluded).toBe(2);
  });

  it('surfaces shortfall honestly — empty governed set when all fail', () => {
    const images = [
      makeImg({ id: 'a', generation_config: { model: 'google/gemini-2.5-flash-image' } }),
      makeImg({ id: 'b', generation_config: {} }),
    ];
    const { governed } = filterForDisplay(images, 'hero_frames');
    expect(governed).toHaveLength(0);
  });
});
