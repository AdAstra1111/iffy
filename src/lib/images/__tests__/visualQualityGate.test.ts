/**
 * Tests for visualQualityGate — unified quality enforcement.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateVisualQuality,
  filterVisualQuality,
  filterPremiumPoolEligible,
  assertVisualQuality,
  toQualityGateDbPayload,
  computeQualityGateForInsert,
} from '../visualQualityGate';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
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
    prompt_used: 'A cinematic wide shot of the protagonist standing at the edge of a rain-soaked rooftop, city lights reflecting in puddles, dramatic side lighting from a neon sign, tension in posture',
    shot_type: 'wide',
    ...overrides,
  };
}

describe('validateVisualQuality', () => {
  it('passes a fully premium image', () => {
    const result = validateVisualQuality(makeImg(), 'hero_frames');
    expect(result.verdict).toBe('pass');
    expect(result.premiumEligible).toBe(true);
    expect(result.score).toBe(100);
  });

  it('rejects legacy model images', () => {
    const result = validateVisualQuality(
      makeImg({ generation_config: { model: 'google/gemini-2.5-flash-image' } }),
      'hero_frames',
    );
    expect(result.verdict).toBe('reject');
    expect(result.rejectedDimensions).toContain('model_provenance');
    expect(result.premiumEligible).toBe(false);
  });

  it('rejects low resolution images', () => {
    const result = validateVisualQuality(
      makeImg({ width: 400, height: 300 }),
      null,
    );
    expect(result.verdict).toBe('reject');
    expect(result.rejectedDimensions).toContain('resolution');
  });

  it('rejects identity drift in character-bearing sections', () => {
    const result = validateVisualQuality(
      makeImg({
        subject_type: 'character',
        subject: 'Alice',
        generation_config: { model: 'google/gemini-3-pro-image-preview', identity_locked: false },
      }),
      'hero_frames',
    );
    expect(result.verdict).toBe('reject');
    expect(result.rejectedDimensions).toContain('identity_integrity');
  });

  it('warns on shallow prompts', () => {
    const result = validateVisualQuality(
      makeImg({ prompt_used: 'A person' }),
      null,
    );
    expect(result.verdict).toBe('warn');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('warns on missing prompt', () => {
    const result = validateVisualQuality(
      makeImg({ prompt_used: null }),
      null,
    );
    expect(result.verdict).toBe('warn');
  });

  it('rejects extreme aspect ratios', () => {
    const result = validateVisualQuality(
      makeImg({ width: 100, height: 3000 }),
      null,
    );
    expect(result.verdict).toBe('reject');
    // Low res will also fail
    expect(result.rejectedDimensions).toContain('resolution');
  });
});

describe('filterVisualQuality', () => {
  it('separates passed from rejected', () => {
    const images = [
      makeImg({ id: 'good' }),
      makeImg({ id: 'bad', generation_config: { model: 'google/gemini-2.5-flash-image' } }),
      makeImg({ id: 'low-res', width: 200, height: 200 }),
    ];
    const result = filterVisualQuality(images, 'hero_frames');
    expect(result.passed).toHaveLength(1);
    expect(result.passed[0].id).toBe('good');
    expect(result.rejected).toHaveLength(2);
    expect(result.summary.rejectionBreakdown.model_provenance).toBe(1);
    expect(result.summary.rejectionBreakdown.resolution).toBe(1);
  });
});

describe('filterPremiumPoolEligible', () => {
  it('only admits premium-eligible images', () => {
    const images = [
      makeImg({ id: 'premium' }),
      makeImg({ id: 'warn-only', prompt_used: 'short' }), // warn but still premium eligible
      makeImg({ id: 'legacy', generation_config: { model: 'google/gemini-2.5-flash-image' } }),
    ];
    const { eligible, ineligible } = filterPremiumPoolEligible(images);
    expect(eligible).toHaveLength(2);
    expect(ineligible).toHaveLength(1);
    expect(ineligible[0].id).toBe('legacy');
  });
});

describe('assertVisualQuality', () => {
  it('throws on rejected image', () => {
    const img = makeImg({ generation_config: {} });
    expect(() => assertVisualQuality(img, 'admit to poster pool', 'hero_frames')).toThrow();
  });

  it('does not throw on passing image', () => {
    const img = makeImg();
    expect(() => assertVisualQuality(img, 'admit to poster pool')).not.toThrow();
});

describe('toQualityGateDbPayload', () => {
  it('maps pass result to DB columns', () => {
    const result = validateVisualQuality(makeImg());
    const payload = toQualityGateDbPayload(result);
    expect(payload.quality_status).toBe('pass');
    expect(payload.premium_eligible).toBe(true);
    expect(payload.quality_score).toBe(100);
    expect(payload.quality_rejection_codes).toEqual([]);
  });

  it('maps rejected result to DB columns', () => {
    const result = validateVisualQuality(makeImg({ generation_config: { model: 'google/gemini-2.5-flash-image' } }));
    const payload = toQualityGateDbPayload(result);
    expect(payload.quality_status).toBe('reject');
    expect(payload.premium_eligible).toBe(false);
    expect(payload.quality_rejection_codes).toContain('model_provenance');
  });
});

describe('computeQualityGateForInsert', () => {
  it('returns result and dbPayload together', () => {
    const { result, dbPayload } = computeQualityGateForInsert(makeImg());
    expect(result.status).toBe('pass');
    expect(dbPayload.quality_status).toBe('pass');
    expect(dbPayload.premium_eligible).toBe(true);
  });
});
});
