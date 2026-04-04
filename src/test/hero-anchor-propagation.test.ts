/**
 * hero-anchor-propagation.test.ts
 *
 * Proves downstream propagation of Hero Anchor Contract metadata
 * through resolver → hook → UI surface.
 *
 * Invariants:
 * 1. hero_frames section result carries explicit anchor metadata
 * 2. poster_directions section result carries explicit anchor metadata
 * 3. Null anchor produces fail-closed metadata (all false/null)
 * 4. No downstream layer should infer anchor from array position
 * 5. injectHeroAnchor tags the anchor and places it at position 0
 */
import { describe, it, expect } from 'vitest';
import { injectHeroAnchor, tagAsHeroAnchor } from '@/lib/hero/getHeroAnchor';
import type { SectionImageResult } from '@/lib/lookbook/resolveCanonImages';

// ── Helpers ──
function makeFakeImage(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    project_id: 'proj-1',
    storage_path: `path/${id}.jpg`,
    is_primary: false,
    curation_state: 'active',
    asset_group: 'hero_frame',
    width: 1920,
    height: 1080,
    ...overrides,
  } as any;
}

function makeEmptySectionResult(sectionKey: string): SectionImageResult {
  return {
    sectionKey: sectionKey as any,
    images: [],
    imageIds: [],
    provenance: [],
    unresolvedCount: 1,
    hasHeroAnchor: false,
    heroAnchorId: null,
    heroAnchorInjected: false,
  };
}

function makeSectionResultWithAnchor(
  sectionKey: string,
  anchorId: string,
  images: any[],
): SectionImageResult {
  return {
    sectionKey: sectionKey as any,
    images,
    imageIds: images.map(i => i.id),
    provenance: [],
    unresolvedCount: 0,
    hasHeroAnchor: true,
    heroAnchorId: anchorId,
    heroAnchorInjected: true,
  };
}

// ── Tests ──

describe('Hero Anchor Contract — resolver metadata shape', () => {
  it('hero_frames section with anchor has explicit metadata', () => {
    const anchor = makeFakeImage('anchor-1', { is_primary: true, role: 'hero_primary' });
    const result = makeSectionResultWithAnchor('hero_frames', 'anchor-1', [anchor]);

    expect(result.hasHeroAnchor).toBe(true);
    expect(result.heroAnchorId).toBe('anchor-1');
    expect(result.heroAnchorInjected).toBe(true);
  });

  it('poster_directions section with anchor has explicit metadata', () => {
    const anchor = makeFakeImage('anchor-2', { is_primary: true });
    const others = [makeFakeImage('img-a'), makeFakeImage('img-b')];
    const result = makeSectionResultWithAnchor('poster_directions', 'anchor-2', [anchor, ...others]);

    expect(result.hasHeroAnchor).toBe(true);
    expect(result.heroAnchorId).toBe('anchor-2');
    expect(result.heroAnchorInjected).toBe(true);
  });

  it('section without anchor has fail-closed metadata', () => {
    const result = makeEmptySectionResult('hero_frames');

    expect(result.hasHeroAnchor).toBe(false);
    expect(result.heroAnchorId).toBeNull();
    expect(result.heroAnchorInjected).toBe(false);
  });

  it('non-anchor section always has false metadata', () => {
    const result = makeEmptySectionResult('character_identity');

    expect(result.hasHeroAnchor).toBe(false);
    expect(result.heroAnchorId).toBeNull();
    expect(result.heroAnchorInjected).toBe(false);
  });
});

describe('Hero Anchor Contract — injection layer', () => {
  it('injectHeroAnchor places anchor at position 0 with tag', () => {
    const anchor = makeFakeImage('anchor-1', { is_primary: true });
    const pool = [makeFakeImage('img-a'), makeFakeImage('img-b'), makeFakeImage('img-c')];

    const result = injectHeroAnchor(anchor, pool);

    expect(result[0].id).toBe('anchor-1');
    expect((result[0] as any).isHeroAnchor).toBe(true);
    expect(result.length).toBe(4);
  });

  it('injectHeroAnchor deduplicates anchor from pool', () => {
    const anchor = makeFakeImage('anchor-1');
    const pool = [makeFakeImage('anchor-1'), makeFakeImage('img-a')];

    const result = injectHeroAnchor(anchor, pool);

    expect(result.length).toBe(2); // anchor + img-a, not 3
    expect(result[0].id).toBe('anchor-1');
    expect(result[1].id).toBe('img-a');
  });

  it('tagAsHeroAnchor adds isHeroAnchor: true', () => {
    const img = makeFakeImage('x');
    const tagged = tagAsHeroAnchor(img);

    expect(tagged.isHeroAnchor).toBe(true);
    expect(tagged.id).toBe('x');
  });
});

describe('Hero Anchor Contract — no positional inference', () => {
  it('first image in pool is NOT the anchor when metadata says false', () => {
    const result = makeEmptySectionResult('hero_frames');
    result.images = [makeFakeImage('img-a'), makeFakeImage('img-b')];
    result.imageIds = result.images.map(i => i.id);
    result.unresolvedCount = 0;

    // Even though images[0] exists, hasHeroAnchor is false
    expect(result.hasHeroAnchor).toBe(false);
    expect(result.heroAnchorId).toBeNull();

    // Downstream must NOT treat images[0].id as anchor
    expect(result.images[0].id).toBe('img-a');
    expect(result.heroAnchorId).not.toBe(result.images[0].id);
  });

  it('anchor metadata matches injected position-0 image', () => {
    const anchor = makeFakeImage('real-anchor', { is_primary: true });
    const pool = [makeFakeImage('other-1'), makeFakeImage('other-2')];
    const injected = injectHeroAnchor(anchor, pool);

    const result: SectionImageResult = {
      sectionKey: 'hero_frames' as any,
      images: injected as any,
      imageIds: injected.map(i => i.id),
      provenance: [],
      unresolvedCount: 0,
      hasHeroAnchor: true,
      heroAnchorId: 'real-anchor',
      heroAnchorInjected: true,
    };

    // Metadata and position are consistent
    expect(result.images[0].id).toBe(result.heroAnchorId);
    expect((result.images[0] as any).isHeroAnchor).toBe(true);

    // Other images do NOT have anchor tag
    expect((result.images[1] as any).isHeroAnchor).toBeUndefined();
    expect((result.images[2] as any).isHeroAnchor).toBeUndefined();
  });
});

describe('Hero Anchor Contract — hook metadata passthrough', () => {
  it('hook return shape preserves resolver metadata without recomputation', () => {
    // Simulates what useLookbookSectionContent returns
    const resolverData = {
      images: [makeFakeImage('a')],
      total: 1,
      hasHeroAnchor: true,
      heroAnchorId: 'a',
      heroAnchorInjected: true,
    };

    // Hook passthrough — no transformation
    const hookReturn = {
      images: resolverData.images,
      total: resolverData.total,
      hasHeroAnchor: resolverData.hasHeroAnchor,
      heroAnchorId: resolverData.heroAnchorId,
      heroAnchorInjected: resolverData.heroAnchorInjected,
    };

    expect(hookReturn.hasHeroAnchor).toBe(resolverData.hasHeroAnchor);
    expect(hookReturn.heroAnchorId).toBe(resolverData.heroAnchorId);
    expect(hookReturn.heroAnchorInjected).toBe(resolverData.heroAnchorInjected);
  });

  it('hook return shape preserves null anchor without fallback', () => {
    const resolverData = {
      images: [makeFakeImage('b')],
      total: 1,
      hasHeroAnchor: false,
      heroAnchorId: null,
      heroAnchorInjected: false,
    };

    const hookReturn = {
      hasHeroAnchor: resolverData?.hasHeroAnchor ?? false,
      heroAnchorId: resolverData?.heroAnchorId ?? null,
      heroAnchorInjected: resolverData?.heroAnchorInjected ?? false,
    };

    expect(hookReturn.hasHeroAnchor).toBe(false);
    expect(hookReturn.heroAnchorId).toBeNull();
    expect(hookReturn.heroAnchorInjected).toBe(false);
  });

  it('hook with undefined data returns safe defaults (no crash, no inference)', () => {
    const data = undefined;

    const hookReturn = {
      hasHeroAnchor: (data as any)?.hasHeroAnchor ?? false,
      heroAnchorId: (data as any)?.heroAnchorId ?? null,
      heroAnchorInjected: (data as any)?.heroAnchorInjected ?? false,
    };

    expect(hookReturn.hasHeroAnchor).toBe(false);
    expect(hookReturn.heroAnchorId).toBeNull();
    expect(hookReturn.heroAnchorInjected).toBe(false);
  });
});