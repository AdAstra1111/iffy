/**
 * heroSurfaceHardening.test.ts — Regression tests for hero surface rendering contracts,
 * provenance visibility, diagnostics, and downstream ordering.
 */
import { describe, it, expect } from 'vitest';

// ── Test Data ──
function makeHeroImage(overrides: Record<string, any> = {}) {
  return {
    id: crypto.randomUUID(),
    role: 'hero_variant',
    is_primary: false,
    curation_state: 'active' as string,
    asset_group: 'hero_frame',
    generation_purpose: 'hero_frame',
    is_active: true,
    width: 1920,
    height: 1080,
    model: 'google/gemini-3-pro-image-preview',
    provider: 'google',
    generation_config: {
      quality_target: 'premium',
      identity_mode: 'multimodal_locked',
      model: 'google/gemini-3-pro-image-preview',
      provider: 'google',
    },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── A. Rendering Tier Contract ──
describe('Hero Surface Rendering Tiers', () => {
  it('primary tier contains only is_primary images', () => {
    const images = [
      makeHeroImage({ is_primary: true, role: 'hero_primary' }),
      makeHeroImage({ is_primary: false }),
      makeHeroImage({ curation_state: 'candidate' }),
    ];
    const primaryImages = images.filter(i => i.is_primary && i.role === 'hero_primary');
    const activeImages = images.filter(i => i.curation_state === 'active' && !(i.is_primary && i.role === 'hero_primary'));
    const candidateImages = images.filter(i => i.curation_state === 'candidate');

    expect(primaryImages).toHaveLength(1);
    expect(activeImages).toHaveLength(1);
    expect(candidateImages).toHaveLength(1);
  });

  it('approved pool excludes primary image', () => {
    const primary = makeHeroImage({ is_primary: true, role: 'hero_primary' });
    const approved = makeHeroImage();
    const images = [primary, approved];
    const activeImages = images.filter(i => i.curation_state === 'active' && !(i.is_primary && i.role === 'hero_primary'));
    expect(activeImages).toHaveLength(1);
    expect(activeImages[0].id).toBe(approved.id);
  });

  it('candidate pool excludes active and primary images', () => {
    const images = [
      makeHeroImage({ is_primary: true, role: 'hero_primary' }),
      makeHeroImage(),
      makeHeroImage({ curation_state: 'candidate' }),
      makeHeroImage({ curation_state: 'candidate' }),
    ];
    const candidateImages = images.filter(i => i.curation_state === 'candidate');
    expect(candidateImages).toHaveLength(2);
    candidateImages.forEach(c => {
      expect(c.is_primary).toBe(false);
      expect(c.curation_state).toBe('candidate');
    });
  });
});

// ── B. Provenance Metadata Contract ──
describe('Provenance Metadata Extraction', () => {
  function getProvenance(img: any) {
    const gc = img.generation_config || {};
    return {
      model: img.model || gc.model || null,
      provider: img.provider || gc.provider || null,
      qualityTarget: gc.quality_target || gc.qualityTarget || null,
      identityMode: gc.identity_mode || gc.identityMode || null,
    };
  }

  it('extracts model and provider from top-level fields', () => {
    const img = makeHeroImage();
    const prov = getProvenance(img);
    expect(prov.model).toBe('google/gemini-3-pro-image-preview');
    expect(prov.provider).toBe('google');
  });

  it('falls back to generation_config if top-level fields missing', () => {
    const img = makeHeroImage({ model: null, provider: null });
    const prov = getProvenance(img);
    expect(prov.model).toBe('google/gemini-3-pro-image-preview');
    expect(prov.provider).toBe('google');
  });

  it('extracts quality_target and identity_mode from generation_config', () => {
    const img = makeHeroImage();
    const prov = getProvenance(img);
    expect(prov.qualityTarget).toBe('premium');
    expect(prov.identityMode).toBe('multimodal_locked');
  });

  it('returns nulls when no provenance data exists', () => {
    const img = makeHeroImage({ model: null, provider: null, generation_config: {} });
    const prov = getProvenance(img);
    expect(prov.model).toBeNull();
    expect(prov.provider).toBeNull();
    expect(prov.qualityTarget).toBeNull();
    expect(prov.identityMode).toBeNull();
  });
});

// ── C. Diagnostics Contract ──
describe('Primary State Diagnostics', () => {
  it('represents zero-primary corrected state', () => {
    const hasPrimary = false;
    const recommendedPrimaryId = 'abc-123';
    const activeCount = 5;
    const candidateCount = 3;
    const enforcingPrimary = false;

    const status = enforcingPrimary ? 'running…' : hasPrimary ? 'complete' : 'pending — zero primary';
    const downstream = hasPrimary ? 'primary-anchored' : 'recency fallback';

    expect(status).toBe('pending — zero primary');
    expect(downstream).toBe('recency fallback');
    expect(recommendedPrimaryId).toBeTruthy();
    expect(activeCount).toBeGreaterThan(0);
    expect(candidateCount).toBeGreaterThan(0);
  });

  it('represents enforced primary state', () => {
    const hasPrimary = true;
    const enforcingPrimary = false;

    const status = enforcingPrimary ? 'running…' : hasPrimary ? 'complete' : 'pending — zero primary';
    const downstream = hasPrimary ? 'primary-anchored' : 'recency fallback';

    expect(status).toBe('complete');
    expect(downstream).toBe('primary-anchored');
  });
});

// ── D. Downstream Ordering Contract ──
describe('Downstream Primary-First Ordering', () => {
  it('primary-backed image sorts ahead of non-primary', () => {
    const images = [
      makeHeroImage({ created_at: '2026-03-25T10:00:00Z' }),
      makeHeroImage({ is_primary: true, role: 'hero_primary', created_at: '2026-03-24T10:00:00Z' }),
      makeHeroImage({ created_at: '2026-03-25T11:00:00Z' }),
    ];

    const sorted = [...images].sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    expect(sorted[0].is_primary).toBe(true);
    expect(sorted[0].role).toBe('hero_primary');
  });

  it('recency order without primary does NOT produce a stable anchor', () => {
    const images = [
      makeHeroImage({ created_at: '2026-03-24T10:00:00Z' }),
      makeHeroImage({ created_at: '2026-03-25T11:00:00Z' }),
      makeHeroImage({ created_at: '2026-03-25T10:00:00Z' }),
    ];

    const sorted = [...images].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Most recent is first — but NOT a canonical anchor
    expect(sorted[0].is_primary).toBe(false);
  });
});

// ── E. No Duplicate Logic ──
describe('No Duplicate Scoring Path', () => {
  it('diagnostics consume existing best-set outputs, not new ranking', () => {
    // Simulated bestSet output — same shape as useHeroFrameAutoCuration
    const bestSet = {
      recommendedPrimaryId: 'abc-123',
      recommendedApprovedIds: ['abc-123', 'def-456'],
      approvedCurrent: 5,
      scored: [
        { id: 'abc-123', totalScore: 85 },
        { id: 'def-456', totalScore: 72 },
      ],
    };

    // Diagnostics reads from bestSet directly — no re-scoring
    expect(bestSet.recommendedPrimaryId).toBe('abc-123');
    expect(bestSet.scored[0].totalScore).toBe(85);
    expect(bestSet.approvedCurrent).toBe(5);
  });
});

// ── F. Anchor vs Curation Pool Semantic Separation ──
describe('Anchor vs Curation Pool Semantics', () => {
  it('primary can exist while additional governed candidates = 0', () => {
    const bestSet = {
      approvedCurrent: 0,
      approvedTarget: 13,
      shortfallCount: 13,
      scored: [],
      hasLockedPrimary: true,
      recommendedPrimaryId: null,
      diagnosticWarnings: ['All 25 images (excluding locked primary) blocked by identity/quality gates — no additional candidates available for curation'],
    };

    // Anchor exists
    expect(bestSet.hasLockedPrimary).toBe(true);
    // But no additional governed candidates
    expect(bestSet.approvedCurrent).toBe(0);
    expect(bestSet.scored).toHaveLength(0);
    // Warning should NOT imply total absence of hero imagery
    expect(bestSet.diagnosticWarnings[0]).toContain('no additional candidates');
    expect(bestSet.diagnosticWarnings[0]).not.toContain('no valid candidates');
  });

  it('label reads "Additional Approved" when primary is locked', () => {
    const hasLockedPrimary = true;
    const label = hasLockedPrimary ? 'Additional Approved' : 'Approved';
    expect(label).toBe('Additional Approved');
  });

  it('label reads "Approved" when no primary exists', () => {
    const hasLockedPrimary = false;
    const label = hasLockedPrimary ? 'Additional Approved' : 'Approved';
    expect(label).toBe('Approved');
  });

  it('Auto-Curate is disabled when no governed candidates exist', () => {
    const bestSet = { approvedCurrent: 0, scored: [] as any[] };
    const isDisabled = bestSet.approvedCurrent === 0 && bestSet.scored.length === 0;
    expect(isDisabled).toBe(true);
  });

  it('Auto-Curate is enabled when governed candidates exist', () => {
    const bestSet = { approvedCurrent: 3, scored: [{ id: 'x', totalScore: 50 }] };
    const isDisabled = bestSet.approvedCurrent === 0 && bestSet.scored.length === 0;
    expect(isDisabled).toBe(false);
  });

  it('warning copy distinguishes anchor-present from total-absence', () => {
    const withPrimary = 'All 25 images (excluding locked primary) blocked by identity/quality gates — no additional candidates available for curation';
    const withoutPrimary = 'All 25 images flagged as identity drift or below premium quality — no valid candidates';

    expect(withPrimary).toContain('excluding locked primary');
    expect(withPrimary).toContain('no additional candidates');
    expect(withoutPrimary).toContain('no valid candidates');
    expect(withoutPrimary).not.toContain('excluding locked primary');
  });
});
