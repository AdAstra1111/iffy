/**
 * sectionScoringEngine — Unit tests for the canonical scoring engine.
 */
import { describe, it, expect } from 'vitest';
import { scoreSection, type ImageInput } from '@/lib/images/sectionScoringEngine';

function makeImage(overrides: Partial<ImageInput> = {}): ImageInput {
  return {
    id: overrides.id || 'test-' + Math.random().toString(36).slice(2, 8),
    width: 1920,
    height: 1080,
    is_primary: false,
    curation_state: 'candidate',
    created_at: new Date().toISOString(),
    shot_type: null,
    generation_purpose: null,
    strategy_key: null,
    asset_group: null,
    subject: null,
    subject_type: null,
    lane_compliance_score: null,
    generation_config: null,
    prompt_used: '',
    prestige_style: null,
    ...overrides,
  };
}

describe('scoreSection', () => {
  it('returns empty result for no images', () => {
    const result = scoreSection([], 'hero_frames');
    expect(result.scored).toHaveLength(0);
    expect(result.recommendedPrimary).toBeNull();
    expect(result.diagnostics.candidateCount).toBe(0);
  });

  it('ranks landscape higher than portrait for hero_frames', () => {
    const landscape = makeImage({ id: 'landscape', width: 1920, height: 1080 });
    const portrait = makeImage({ id: 'portrait', width: 1080, height: 1920 });

    const result = scoreSection([landscape, portrait], 'hero_frames');
    expect(result.scored[0].id).toBe('landscape');
    expect(result.scored[0].totalScore).toBeGreaterThan(result.scored[1].totalScore);
  });

  it('scores anamorphic 2.39:1 as high as 16:9 for hero_frames', () => {
    const wide16x9 = makeImage({ id: 'wide16x9', width: 1920, height: 1080 });
    const anamorphic = makeImage({ id: 'anamorphic', width: 1600, height: 672 });

    const result = scoreSection([wide16x9, anamorphic], 'hero_frames');
    const score16x9 = result.scored.find(s => s.id === 'wide16x9')!;
    const scoreAnamo = result.scored.find(s => s.id === 'anamorphic')!;
    // Both should get high aspect-ratio fit (>=12), not 3
    expect(score16x9.scoreBreakdown.sectionDetails.aspectRatioFit).toBeGreaterThanOrEqual(12);
    expect(scoreAnamo.scoreBreakdown.sectionDetails.aspectRatioFit).toBeGreaterThanOrEqual(12);
  });

  it('preserves primary as absolute survivor', () => {
    const primary = makeImage({ id: 'primary', is_primary: true });
    const others = Array.from({ length: 20 }, (_, i) =>
      makeImage({ id: `other-${i}`, created_at: new Date(Date.now() - i * 60000).toISOString() })
    );

    const result = scoreSection([primary, ...others], 'hero_frames');
    const survivorIds = result.survivors.map(s => s.id);
    expect(survivorIds).toContain('primary');
  });

  it('recommends primary when no primary is set', () => {
    const a = makeImage({ id: 'a', width: 1920, height: 1080 });
    const b = makeImage({ id: 'b', width: 800, height: 600 });

    const result = scoreSection([a, b], 'hero_frames');
    const primaryRec = result.scored.find(s => s.recommendedAction === 'recommend_primary');
    expect(primaryRec).toBeDefined();
  });

  it('applies symbolic penalty for literal scene language', () => {
    const symbolic = makeImage({
      id: 'symbolic',
      prompt_used: 'A shattered mirror reflecting a shadow, dreamlike surreal motif of duality',
    });
    const literal = makeImage({
      id: 'literal',
      prompt_used: 'She walks into the room and sits down looking at the window',
    });

    const result = scoreSection([symbolic, literal], 'symbolic_motifs');
    const symbolicScore = result.scored.find(s => s.id === 'symbolic')!;
    const literalScore = result.scored.find(s => s.id === 'literal')!;
    expect(symbolicScore.totalScore).toBeGreaterThan(literalScore.totalScore);
  });

  it('deterministic — same inputs produce same output', () => {
    const images = [
      makeImage({ id: 'a', created_at: '2025-01-01T10:00:00Z' }),
      makeImage({ id: 'b', created_at: '2025-01-01T11:00:00Z' }),
    ];
    const r1 = scoreSection(images, 'atmosphere_lighting');
    const r2 = scoreSection(images, 'atmosphere_lighting');
    expect(r1.scored.map(s => s.id)).toEqual(r2.scored.map(s => s.id));
    expect(r1.scored.map(s => s.totalScore)).toEqual(r2.scored.map(s => s.totalScore));
  });

  it('produces diagnostics with coverage summary', () => {
    const images = [
      makeImage({ id: 'a', shot_type: 'atmospheric' }),
      makeImage({ id: 'b', shot_type: 'time_variant' }),
      makeImage({ id: 'c', shot_type: 'atmospheric' }),
    ];
    const result = scoreSection(images, 'atmosphere_lighting');
    expect(result.diagnostics.candidateCount).toBe(3);
    expect(result.diagnostics.coverageSummary).toBeDefined();
  });

  it('archives excess images beyond maxAlternates', () => {
    const images = Array.from({ length: 10 }, (_, i) =>
      makeImage({ id: `img-${i}`, created_at: new Date(Date.now() - i * 60000).toISOString() })
    );
    // texture_detail has maxAlternates=3, so maxKeep = 4 (no primary)
    const result = scoreSection(images, 'texture_detail');
    expect(result.survivors.length).toBeLessThanOrEqual(4);
    expect(result.archiveCandidates.length + result.rejectCandidates.length).toBeGreaterThan(0);
  });
});
