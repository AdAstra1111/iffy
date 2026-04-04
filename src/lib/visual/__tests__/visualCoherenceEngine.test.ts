/**
 * Visual Coherence Engine tests — deterministic scoring validation.
 */
import { describe, it, expect } from 'vitest';
import {
  computeVisualCoherence,
  resolveWeightingProfile,
  identifyWeakestComponent,
  meetsVCSThreshold,
  type VCSInputs,
} from '../visualCoherenceEngine';

function makeInputs(overrides: Partial<VCSInputs> = {}): VCSInputs {
  return {
    format: 'feature',
    genre: 'drama',
    tone: 'cinematic',
    temporalTruth: {
      era: 'contemporary',
      family: 'modern',
      label: 'Contemporary',
      provenance: 'explicit',
      confidence: 'high',
      evidence: [],
      contributing_sources: ['canon'],
      contradictions: [],
      era_garments: [],
      forbidden_garment_families: [],
      summary: 'Contemporary setting',
    },
    characters: [
      {
        name: 'Alice',
        effectiveProfile: {
          signature_garments: ['blazer', 'trousers'],
          effective_signature_garments: ['blazer', 'trousers'],
          excluded_garments: [],
          effective_identity_summary: 'Modern professional',
          was_temporally_normalized: false,
          normalization_reasons: [],
        } as any,
        hasLockedActor: true,
        hasHeroFrame: true,
      },
    ],
    pdFamiliesTotal: 3,
    pdFamiliesLocked: 3,
    pdDomainsCovered: ['environment_atmosphere', 'surface_language', 'symbolic_motifs'],
    heroFrameCount: 4,
    heroFrameApproved: 3,
    heroFramePrimaryApproved: true,
    hasWorldSystem: true,
    hasVisualStyle: true,
    prestigeStyleKey: 'cold_prestige',
    hasCanon: true,
    ...overrides,
  };
}

describe('resolveWeightingProfile', () => {
  it('vertical format → vertical_drama_profile', () => {
    expect(resolveWeightingProfile('vertical-drama', 'thriller', 'tense')).toBe('vertical_drama_profile');
  });

  it('prestige drama → prestige_profile', () => {
    expect(resolveWeightingProfile('feature', 'drama', 'prestige')).toBe('prestige_profile');
  });

  it('historical period → prestige_profile', () => {
    expect(resolveWeightingProfile('feature', 'period', 'epic')).toBe('prestige_profile');
  });

  it('action thriller → commercial_profile', () => {
    expect(resolveWeightingProfile('feature', 'action', 'fast-paced')).toBe('commercial_profile');
  });
});

describe('computeVisualCoherence', () => {
  it('fully complete project scores high', () => {
    const result = computeVisualCoherence(makeInputs());
    expect(result.total_score).toBeGreaterThanOrEqual(80);
    expect(result.key_failures).toHaveLength(0);
  });

  it('empty project scores low', () => {
    const result = computeVisualCoherence(makeInputs({
      hasCanon: false,
      temporalTruth: null,
      characters: [],
      pdFamiliesTotal: 0,
      pdFamiliesLocked: 0,
      pdDomainsCovered: [],
      heroFrameCount: 0,
      heroFrameApproved: 0,
      heroFramePrimaryApproved: false,
      hasWorldSystem: false,
      hasVisualStyle: false,
    }));
    expect(result.total_score).toBeLessThan(20);
    expect(result.key_failures.length).toBeGreaterThan(0);
  });

  it('different formats produce different weightings', () => {
    const vertical = computeVisualCoherence(makeInputs({ format: 'vertical-drama' }));
    const prestige = computeVisualCoherence(makeInputs({ format: 'feature', genre: 'drama', tone: 'prestige' }));
    expect(vertical.weighting_profile).toBe('vertical_drama_profile');
    expect(prestige.weighting_profile).toBe('prestige_profile');
  });

  it('temporal contradictions lower world_coherence', () => {
    const clean = computeVisualCoherence(makeInputs());
    const dirty = computeVisualCoherence(makeInputs({
      temporalTruth: {
        era: 'contemporary',
        family: 'modern',
        label: 'Contemporary',
        provenance: 'explicit',
        confidence: 'high',
        evidence: [],
        contributing_sources: [],
        contradictions: [
          { era_a: 'contemporary', era_b: 'medieval', detail: 'References medieval armor', severity: 'high' },
          { era_a: 'contemporary', era_b: 'victorian', detail: 'Mentions horse-drawn carriages', severity: 'medium' },
        ],
        era_garments: [],
        forbidden_garment_families: [],
        summary: '',
      },
    }));
    expect(dirty.components.world_coherence.score).toBeLessThan(clean.components.world_coherence.score);
  });

  it('missing hero frames zeros iconic_appeal', () => {
    const result = computeVisualCoherence(makeInputs({
      heroFrameCount: 0,
      heroFrameApproved: 0,
      heroFramePrimaryApproved: false,
    }));
    expect(result.components.iconic_appeal.score).toBe(0);
  });

  it('hero frames without PD penalizes stylistic_unity', () => {
    const result = computeVisualCoherence(makeInputs({
      pdFamiliesTotal: 0,
      pdFamiliesLocked: 0,
      pdDomainsCovered: [],
    }));
    expect(result.components.stylistic_unity.issues).toContain(
      'Hero frames generated without locked Production Design — stylistic fragmentation risk'
    );
  });
});

describe('identifyWeakestComponent', () => {
  it('returns the lowest-scoring component', () => {
    const result = computeVisualCoherence(makeInputs({
      heroFrameCount: 0,
      heroFrameApproved: 0,
      heroFramePrimaryApproved: false,
    }));
    const weakest = identifyWeakestComponent(result);
    expect(weakest.component).toBe('iconic_appeal');
    expect(weakest.score).toBe(0);
  });
});

describe('meetsVCSThreshold', () => {
  it('complete project passes default thresholds', () => {
    const result = computeVisualCoherence(makeInputs());
    const check = meetsVCSThreshold(result);
    expect(check.passes).toBe(true);
  });

  it('empty project fails thresholds', () => {
    const result = computeVisualCoherence(makeInputs({
      hasCanon: false,
      characters: [],
      heroFrameCount: 0,
      heroFrameApproved: 0,
      heroFramePrimaryApproved: false,
    }));
    const check = meetsVCSThreshold(result);
    expect(check.passes).toBe(false);
    expect(check.failures.length).toBeGreaterThan(0);
  });
});
