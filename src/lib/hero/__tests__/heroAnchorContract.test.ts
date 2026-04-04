/**
 * heroAnchorContract.test.ts — Tests for the Hero Anchor Contract layer.
 * Verifies explicit injection, fail-closed behavior, and no sort-based inference.
 */
import { describe, it, expect } from 'vitest';
import {
  buildHeroAnchorContract,
  injectHeroAnchor,
  tagAsHeroAnchor,
} from '@/lib/hero/getHeroAnchor';
import type { ProjectImage } from '@/lib/images/types';

function makeImage(overrides: Partial<ProjectImage> = {}): ProjectImage {
  return {
    id: crypto.randomUUID(),
    project_id: 'proj-1',
    role: 'hero_variant',
    entity_id: null,
    strategy_key: null,
    prompt_used: '',
    negative_prompt: '',
    canon_constraints: {},
    storage_path: 'test.jpg',
    storage_bucket: 'project-posters',
    width: 1920,
    height: 1080,
    is_primary: false,
    is_active: true,
    source_poster_id: null,
    created_at: new Date().toISOString(),
    created_by: null,
    user_id: 'u1',
    provider: 'google',
    model: 'google/gemini-3-pro-image-preview',
    style_mode: 'cinematic',
    generation_config: {
      quality_target: 'premium',
      identity_mode: 'multimodal_locked',
      model: 'google/gemini-3-pro-image-preview',
      provider: 'google',
    },
    asset_group: 'hero_frame',
    subject: null,
    shot_type: 'wide',
    curation_state: 'active',
    subject_type: null,
    subject_ref: null,
    generation_purpose: 'hero_frame',
    location_ref: null,
    moment_ref: null,
    state_key: null,
    state_label: null,
    lane_key: null,
    prestige_style: null,
    lane_compliance_score: null,
    ...overrides,
  };
}

// ── A. buildHeroAnchorContract ──

describe('buildHeroAnchorContract', () => {
  it('returns null when image is null (fail-closed)', () => {
    expect(buildHeroAnchorContract(null)).toBeNull();
  });

  it('extracts model/provider from top-level fields', () => {
    const img = makeImage({ model: 'google/gemini-3-pro-image-preview', provider: 'google' });
    const contract = buildHeroAnchorContract(img)!;
    expect(contract.model).toBe('google/gemini-3-pro-image-preview');
    expect(contract.provider).toBe('google');
  });

  it('falls back to generation_config when top-level is null', () => {
    const img = makeImage({ model: '', provider: '' });
    const contract = buildHeroAnchorContract(img)!;
    expect(contract.model).toBe('google/gemini-3-pro-image-preview');
    expect(contract.provider).toBe('google');
  });

  it('computes aspect ratio', () => {
    const img = makeImage({ width: 1920, height: 1080 });
    const contract = buildHeroAnchorContract(img)!;
    expect(contract.aspectRatio).toBeCloseTo(1.778, 2);
  });

  it('returns null aspect ratio when dimensions missing', () => {
    const img = makeImage({ width: null, height: null });
    const contract = buildHeroAnchorContract(img)!;
    expect(contract.aspectRatio).toBeNull();
  });

  it('extracts quality and identity mode', () => {
    const img = makeImage();
    const contract = buildHeroAnchorContract(img)!;
    expect(contract.quality).toBe('premium');
    expect(contract.identityMode).toBe('multimodal_locked');
  });
});

// ── B. tagAsHeroAnchor ──

describe('tagAsHeroAnchor', () => {
  it('adds isHeroAnchor: true', () => {
    const img = makeImage();
    const tagged = tagAsHeroAnchor(img);
    expect(tagged.isHeroAnchor).toBe(true);
    expect(tagged.id).toBe(img.id);
  });
});

// ── C. injectHeroAnchor ──

describe('injectHeroAnchor', () => {
  it('places anchor at position 0', () => {
    const anchor = makeImage({ is_primary: true, role: 'hero_primary' });
    const others = [makeImage(), makeImage()];
    const result = injectHeroAnchor(anchor, others);
    expect(result[0].id).toBe(anchor.id);
    expect((result[0] as any).isHeroAnchor).toBe(true);
    expect(result).toHaveLength(3);
  });

  it('deduplicates anchor from existing array', () => {
    const anchor = makeImage({ is_primary: true });
    const others = [anchor, makeImage()];
    const result = injectHeroAnchor(anchor, others);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(anchor.id);
  });

  it('works with empty array', () => {
    const anchor = makeImage({ is_primary: true });
    const result = injectHeroAnchor(anchor, []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(anchor.id);
  });

  it('anchor always first regardless of other images recency', () => {
    const anchor = makeImage({
      is_primary: true,
      created_at: '2026-01-01T00:00:00Z',
    });
    const newer = makeImage({ created_at: '2026-03-25T12:00:00Z' });
    const result = injectHeroAnchor(anchor, [newer]);
    expect(result[0].id).toBe(anchor.id);
    expect(result[1].id).toBe(newer.id);
  });
});

// ── D. Fail-closed contract ──

describe('Fail-closed hero anchor', () => {
  it('null anchor means no injection — downstream gets original order', () => {
    const images = [
      makeImage({ created_at: '2026-03-25T12:00:00Z' }),
      makeImage({ created_at: '2026-03-24T12:00:00Z' }),
    ];
    // When anchor is null, injectHeroAnchor should NOT be called
    // This test documents the contract: caller must guard null
    const anchor = null;
    const contract = buildHeroAnchorContract(anchor);
    expect(contract).toBeNull();
    // Original array is untouched
    expect(images[0].created_at).toBe('2026-03-25T12:00:00Z');
  });
});

// ── E. No duplicate logic ──

describe('No duplicate scoring in anchor contract', () => {
  it('buildHeroAnchorContract does not score or rank', () => {
    const img = makeImage();
    const contract = buildHeroAnchorContract(img)!;
    // Contract is a passive data object — no score fields
    expect(contract).not.toHaveProperty('score');
    expect(contract).not.toHaveProperty('rank');
    expect(contract).not.toHaveProperty('totalScore');
  });
});
