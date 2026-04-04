import { describe, it, expect } from 'vitest';
import {
  classifyImageIdentity,
  filterHeroFramesByIdentity,
  isHeroFrameIdentityValid,
  type IdentityClusterStatus,
} from '../heroFrameIdentityFilter';
import type { ImageInput } from '../sectionScoringEngine';

function makeImage(overrides: Partial<ImageInput> = {}): ImageInput {
  return {
    id: overrides.id || 'img-1',
    width: 1920,
    height: 1080,
    is_primary: false,
    curation_state: 'candidate',
    created_at: '2026-01-01T00:00:00Z',
    shot_type: null,
    generation_purpose: 'hero_frame',
    strategy_key: null,
    asset_group: 'hero_frame',
    subject: null,
    subject_type: null,
    lane_compliance_score: null,
    generation_config: null,
    prompt_used: '',
    prestige_style: null,
    ...overrides,
  };
}

describe('classifyImageIdentity', () => {
  it('marks legacy images (no generation_config) as valid (grandfathered)', () => {
    const img = makeImage({ generation_config: null });
    const result = classifyImageIdentity(img, null);
    expect(result.identityStatus).toBe('valid');
    expect(result.driftReasons).toHaveLength(0);
  });

  it('marks identity-locked images as valid', () => {
    const img = makeImage({ generation_config: { identity_locked: true } });
    const result = classifyImageIdentity(img, null);
    expect(result.identityStatus).toBe('valid');
  });

  it('marks gate-failed images as drift', () => {
    const img = makeImage({ generation_config: { actor_identity_gate_status: 'fail' } });
    const result = classifyImageIdentity(img, null);
    expect(result.identityStatus).toBe('drift');
    expect(result.driftReasons).toContain('Failed actor identity gate');
  });

  it('marks gate-rejected images as drift', () => {
    const img = makeImage({ generation_config: { gate_admitted: false } });
    const result = classifyImageIdentity(img, null);
    expect(result.identityStatus).toBe('drift');
    expect(result.driftReasons).toContain('Rejected by admission gate');
  });

  it('marks unlocked images with gc as drift', () => {
    const img = makeImage({ generation_config: { prompt: 'test' } });
    const result = classifyImageIdentity(img, null);
    expect(result.identityStatus).toBe('drift');
    expect(result.driftReasons.some(r => r.includes('not locked'))).toBe(true);
  });
});

describe('filterHeroFramesByIdentity', () => {
  it('separates valid from drift', () => {
    const images = [
      makeImage({ id: 'a', generation_config: { identity_locked: true } }),
      makeImage({ id: 'b', generation_config: { actor_identity_gate_status: 'fail' } }),
      makeImage({ id: 'c', generation_config: null }),
    ];
    const result = filterHeroFramesByIdentity(images);
    expect(result.valid).toHaveLength(2); // locked + legacy both valid
    expect(result.drift).toHaveLength(1);
    expect(result.drift[0].id).toBe('b');
    expect(result.unverified).toHaveLength(0); // legacy with null gc → valid
    expect(result.summary.validCount).toBe(2);
    expect(result.summary.driftCount).toBe(1);
    expect(result.summary.unverifiedCount).toBe(0);
  });

  it('returns all valid when all locked', () => {
    const images = [
      makeImage({ id: 'a', generation_config: { identity_locked: true } }),
      makeImage({ id: 'b', generation_config: { identity_locked: true, anchor_image_ids: ['x'] } }),
    ];
    const result = filterHeroFramesByIdentity(images);
    expect(result.valid).toHaveLength(2);
    expect(result.drift).toHaveLength(0);
  });
});

describe('isHeroFrameIdentityValid', () => {
  it('returns true for locked images', () => {
    expect(isHeroFrameIdentityValid(makeImage({ generation_config: { identity_locked: true } }))).toBe(true);
  });

  it('returns false for gate-failed images', () => {
    expect(isHeroFrameIdentityValid(makeImage({ generation_config: { actor_identity_gate_status: 'fail' } }))).toBe(false);
  });

  it('returns true for legacy images', () => {
    expect(isHeroFrameIdentityValid(makeImage({ generation_config: null }))).toBe(true);
  });
});
