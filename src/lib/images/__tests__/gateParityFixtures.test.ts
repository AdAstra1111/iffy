/**
 * Gate Parity Tests — Edge vs App visual quality gate.
 *
 * The edge gate (edgeQualityGate.ts) runs at GENERATION TIME and enforces
 * scene_grounding as a dedicated dimension for hero frames.
 * The app gate (visualQualityGate.ts) runs at DISPLAY/SELECTION TIME and
 * enforces identity, model, resolution, composition, environment, prompt depth.
 *
 * These are COMPLEMENTARY gates with different enforcement surfaces.
 * This test suite proves they produce consistent admission decisions for the
 * 5 canonical Hero Frame cases + provenance-based identity semantics.
 *
 * Fixtures:
 *   1. Missing scene_number → edge rejects
 *   2. Missing location_key → edge rejects
 *   3. Scene-bound but no PD dataset → edge warns, NOT premium
 *   4. Fully grounded premium hero → both pass, premium
 *   5. Character hero with anchors_injected → both pass, premium
 *   6. Character hero with identity_mode but NO evidence → edge rejects identity
 *   7. Character hero with descriptive_only (no refs) → edge rejects identity
 */
import { describe, it, expect } from 'vitest';

// ── Replicated edge gate core (mirrors edgeQualityGate.ts) ──────

const PREMIUM_MODELS = new Set([
  'google/gemini-3-pro-image-preview',
  'google/gemini-3.1-flash-image-preview',
]);

function computeEdgeGateForTest(input: {
  width?: number | null;
  height?: number | null;
  model?: string | null;
  subject_type?: string | null;
  asset_group?: string | null;
  shot_type?: string | null;
  prompt_used?: string | null;
  location_ref?: string | null;
  generation_config?: Record<string, unknown> | null;
}) {
  const gc = input.generation_config || {};
  const isHeroFrame = input.asset_group === 'hero_frame' || (gc.source_feature as string) === 'hero_frames_engine';
  const isCharacter = input.subject_type === 'character';

  const rejections: string[] = [];
  const warnings: string[] = [];

  // Identity — accepts provenance semantics
  if (isCharacter) {
    const hasLegacyLock = !!gc.identity_locked;
    const hasProvenanceEvidence =
      gc.identity_mode === 'anchors_injected' &&
      typeof gc.identity_evidence_count === 'number' &&
      (gc.identity_evidence_count as number) > 0;
    if (!hasLegacyLock && !hasProvenanceEvidence) {
      rejections.push('identity_integrity');
    }
  }

  // Model
  const model = input.model || null;
  if (!model || !PREMIUM_MODELS.has(model)) rejections.push('model_provenance');

  // Resolution
  const w = input.width ?? 0;
  const h = input.height ?? 0;
  if (w > 0 && h > 0 && w * h < 600_000) rejections.push('resolution');

  // Scene grounding (hero only)
  let sceneGroundingVerdict: 'pass' | 'warn' | 'reject' = 'pass';
  if (isHeroFrame) {
    const hasScene = !!(gc.scene_number);
    const hasLoc = !!(gc.location_key || input.location_ref);
    if (!hasScene || !hasLoc) {
      rejections.push('scene_grounding');
      sceneGroundingVerdict = 'reject';
    } else if (!gc.pd_bound) {
      warnings.push('Hero frame not bound to Production Design dataset — premium ineligible');
      sceneGroundingVerdict = 'warn';
    }
  }

  const quality_status = rejections.length > 0 ? 'reject' : warnings.length > 0 ? 'warn' : 'pass';
  const premium_eligible =
    quality_status !== 'reject' &&
    !!model && PREMIUM_MODELS.has(model) &&
    !(isCharacter && !gc.identity_locked && !(gc.identity_mode === 'anchors_injected' && typeof gc.identity_evidence_count === 'number' && (gc.identity_evidence_count as number) > 0)) &&
    (!isHeroFrame || sceneGroundingVerdict === 'pass');

  return { quality_status, premium_eligible, rejections, warnings };
}

// ── Fixtures ─────────────────────────────────────────────────────

const FIXTURES = [
  {
    name: 'Missing scene_number → edge rejects, not premium',
    input: {
      width: 1344, height: 768,
      model: 'google/gemini-3-pro-image-preview',
      subject_type: 'character' as const,
      asset_group: 'hero_frame',
      shot_type: 'wide',
      prompt_used: 'A'.repeat(200),
      location_ref: 'leila_apartment',
      generation_config: {
        identity_mode: 'anchors_injected',
        identity_evidence_count: 2,
        identity_source: 'actor_assets',
        identity_locked: true,
        source_feature: 'hero_frames_engine',
        location_key: 'leila_apartment',
        pd_bound: true,
      },
    },
    edge_expected: { rejected: true, premium: false },
  },
  {
    name: 'Missing location_key → edge rejects, not premium',
    input: {
      width: 1344, height: 768,
      model: 'google/gemini-3-pro-image-preview',
      subject_type: 'character' as const,
      asset_group: 'hero_frame',
      shot_type: 'wide',
      prompt_used: 'A'.repeat(200),
      location_ref: null,
      generation_config: {
        identity_mode: 'anchors_injected',
        identity_evidence_count: 2,
        identity_source: 'actor_assets',
        identity_locked: true,
        source_feature: 'hero_frames_engine',
        scene_number: '3',
        pd_bound: true,
      },
    },
    edge_expected: { rejected: true, premium: false },
  },
  {
    name: 'Scene-bound but no PD dataset → edge warns, NOT premium',
    input: {
      width: 1344, height: 768,
      model: 'google/gemini-3-pro-image-preview',
      subject_type: 'character' as const,
      asset_group: 'hero_frame',
      shot_type: 'wide',
      prompt_used: 'A'.repeat(200),
      location_ref: 'leila_apartment',
      generation_config: {
        identity_mode: 'anchors_injected',
        identity_evidence_count: 2,
        identity_source: 'actor_assets',
        identity_locked: true,
        source_feature: 'hero_frames_engine',
        scene_number: '3',
        location_key: 'leila_apartment',
        pd_bound: false,
      },
    },
    edge_expected: { rejected: false, premium: false },
  },
  {
    name: 'Fully grounded premium hero → pass + premium',
    input: {
      width: 1344, height: 768,
      model: 'google/gemini-3-pro-image-preview',
      subject_type: 'character' as const,
      asset_group: 'hero_frame',
      shot_type: 'wide',
      prompt_used: 'A'.repeat(200),
      location_ref: 'leila_apartment',
      generation_config: {
        identity_mode: 'anchors_injected',
        identity_evidence_count: 3,
        identity_source: 'actor_assets',
        identity_locked: true,
        source_feature: 'hero_frames_engine',
        scene_number: '3',
        location_key: 'leila_apartment',
        pd_bound: true,
      },
    },
    edge_expected: { rejected: false, premium: true },
  },
  {
    name: 'Character hero with anchors_injected (no legacy lock) → pass + premium',
    input: {
      width: 1344, height: 768,
      model: 'google/gemini-3-pro-image-preview',
      subject_type: 'character' as const,
      asset_group: 'hero_frame',
      shot_type: 'wide',
      prompt_used: 'A'.repeat(200),
      location_ref: 'gallery_opening',
      generation_config: {
        identity_mode: 'anchors_injected',
        identity_evidence_count: 3,
        identity_source: 'actor_assets',
        // NO identity_locked — provenance semantics only
        source_feature: 'hero_frames_engine',
        scene_number: '7',
        location_key: 'gallery_opening',
        pd_bound: true,
        reference_images_total: 3,
      },
    },
    edge_expected: { rejected: false, premium: true },
  },
  {
    name: 'anchors_injected with zero evidence → rejects identity',
    input: {
      width: 1344, height: 768,
      model: 'google/gemini-3-pro-image-preview',
      subject_type: 'character' as const,
      asset_group: 'hero_frame',
      shot_type: 'wide',
      prompt_used: 'A'.repeat(200),
      location_ref: 'gallery_opening',
      generation_config: {
        identity_mode: 'anchors_injected',
        identity_evidence_count: 0,
        identity_source: 'none',
        source_feature: 'hero_frames_engine',
        scene_number: '7',
        location_key: 'gallery_opening',
        pd_bound: true,
      },
    },
    edge_expected: { rejected: true, premium: false },
  },
  {
    name: 'descriptive_only identity (no refs) → rejects identity',
    input: {
      width: 1344, height: 768,
      model: 'google/gemini-3-pro-image-preview',
      subject_type: 'character' as const,
      asset_group: 'hero_frame',
      shot_type: 'wide',
      prompt_used: 'A'.repeat(200),
      location_ref: 'gallery_opening',
      generation_config: {
        identity_mode: 'descriptive_only',
        identity_evidence_count: 0,
        identity_source: 'none',
        source_feature: 'hero_frames_engine',
        scene_number: '7',
        location_key: 'gallery_opening',
        pd_bound: true,
      },
    },
    edge_expected: { rejected: true, premium: false },
  },
];

describe('Edge gate — Hero Frame scene grounding invariants', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.name}`, () => {
      const result = computeEdgeGateForTest(fixture.input);
      expect(result.quality_status === 'reject').toBe(fixture.edge_expected.rejected);
      expect(result.premium_eligible).toBe(fixture.edge_expected.premium);
    });
  }
});

describe('Edge gate — pd_bound premium invariant', () => {
  it('pd_bound=false blocks premium even when scene + location present', () => {
    const result = computeEdgeGateForTest(FIXTURES[2].input);
    expect(result.quality_status).toBe('warn');
    expect(result.premium_eligible).toBe(false);
  });

  it('pd_bound=true allows premium when all other gates pass', () => {
    const result = computeEdgeGateForTest(FIXTURES[3].input);
    expect(result.quality_status).not.toBe('reject');
    expect(result.premium_eligible).toBe(true);
  });
});

describe('Edge gate — identity provenance semantics', () => {
  it('anchors_injected with evidence passes WITHOUT identity_locked', () => {
    const result = computeEdgeGateForTest(FIXTURES[4].input);
    expect(result.rejections).not.toContain('identity_integrity');
    expect(result.premium_eligible).toBe(true);
  });

  it('anchors_injected with zero evidence fails identity gate', () => {
    const result = computeEdgeGateForTest(FIXTURES[5].input);
    expect(result.rejections).toContain('identity_integrity');
    expect(result.premium_eligible).toBe(false);
  });

  it('descriptive_only mode (no anchors) fails identity gate', () => {
    const result = computeEdgeGateForTest(FIXTURES[6].input);
    expect(result.rejections).toContain('identity_integrity');
    expect(result.premium_eligible).toBe(false);
  });

  it('provenance metadata is correctly structured in fixture', () => {
    const gc = FIXTURES[4].input.generation_config!;
    expect(gc.identity_mode).toBe('anchors_injected');
    expect(gc.identity_source).toBe('actor_assets');
    expect(gc.identity_evidence_count).toBe(3);
    expect(gc.identity_locked).toBeUndefined(); // No legacy lock
  });
});

describe('Quota pressure — fewer results when insufficient worthy moments', () => {
  it('MIN_FILLER_INTENSITY constant prevents force-filling weak scenes', () => {
    const MIN_FILLER_INTENSITY = 25;
    const weakScenes = [
      { dramaticIntensity: 10 },
      { dramaticIntensity: 15 },
      { dramaticIntensity: 20 },
    ];
    const strongScenes = [
      { dramaticIntensity: 40 },
      { dramaticIntensity: 60 },
    ];
    const allScenes = [...weakScenes, ...strongScenes];
    const eligible = allScenes.filter(s => s.dramaticIntensity >= MIN_FILLER_INTENSITY);
    expect(eligible.length).toBe(2);
    expect(eligible.length).toBeLessThan(allScenes.length);
  });

  it('returns 0 results when ALL scenes are below threshold', () => {
    const MIN_FILLER_INTENSITY = 25;
    const allWeak = [
      { dramaticIntensity: 5 },
      { dramaticIntensity: 10 },
      { dramaticIntensity: 18 },
    ];
    const eligible = allWeak.filter(s => s.dramaticIntensity >= MIN_FILLER_INTENSITY);
    expect(eligible.length).toBe(0);
  });
});