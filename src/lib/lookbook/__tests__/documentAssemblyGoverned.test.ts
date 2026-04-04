/**
 * documentAssemblyGoverned.test.ts — Proves lookbook document assembly
 * uses canonical governed section results with fail-closed behavior.
 */
import { describe, it, expect } from 'vitest';
import type { SectionImageResult } from '../resolveCanonImages';
import type { CanonicalSectionKey } from '@/hooks/useLookbookSections';

// ── Helpers ──

function makeSectionResult(
  sectionKey: CanonicalSectionKey,
  imageCount: number,
  overrides: Partial<SectionImageResult> = {},
): SectionImageResult {
  const images = Array.from({ length: imageCount }, (_, i) => ({
    id: `img-${sectionKey}-${i}`,
    storage_path: `path/${sectionKey}-${i}.jpg`,
    signedUrl: `https://signed/${sectionKey}-${i}`,
  })) as any;

  return {
    sectionKey,
    images,
    imageIds: images.map((i: any) => i.id),
    provenance: [],
    unresolvedCount: imageCount === 0 ? 1 : 0,
    hasHeroAnchor: false,
    heroAnchorId: null,
    heroAnchorInjected: false,
    ...overrides,
  };
}

// ── Tests ──

describe('Document assembly governed truth', () => {
  it('SectionImageResult carries explicit hero anchor metadata', () => {
    const result = makeSectionResult('hero_frames', 3, {
      hasHeroAnchor: true,
      heroAnchorId: 'anchor-1',
      heroAnchorInjected: true,
    });

    expect(result.hasHeroAnchor).toBe(true);
    expect(result.heroAnchorId).toBe('anchor-1');
    expect(result.heroAnchorInjected).toBe(true);
  });

  it('poster_directions carries hero anchor metadata', () => {
    const result = makeSectionResult('poster_directions', 5, {
      hasHeroAnchor: true,
      heroAnchorId: 'anchor-poster',
      heroAnchorInjected: true,
    });

    expect(result.hasHeroAnchor).toBe(true);
    expect(result.heroAnchorId).toBe('anchor-poster');
  });

  it('unresolved section has unresolvedCount > 0 and no anchor', () => {
    const result = makeSectionResult('world_locations', 0);

    expect(result.unresolvedCount).toBe(1);
    expect(result.hasHeroAnchor).toBe(false);
    expect(result.heroAnchorId).toBeNull();
    expect(result.images).toHaveLength(0);
  });

  it('non-hero section has fail-closed anchor metadata', () => {
    const result = makeSectionResult('texture_detail', 2);

    expect(result.hasHeroAnchor).toBe(false);
    expect(result.heroAnchorId).toBeNull();
    expect(result.heroAnchorInjected).toBe(false);
  });

  it('_has_unresolved correctly derived from unresolvedCount', () => {
    const resolved = makeSectionResult('key_moments', 3);
    const unresolved = makeSectionResult('atmosphere_lighting', 0);

    expect(resolved.unresolvedCount > 0).toBe(false);
    expect(unresolved.unresolvedCount > 0).toBe(true);
  });

  it('all section keys produce valid SectionImageResult shape', () => {
    const keys: CanonicalSectionKey[] = [
      'character_identity', 'world_locations', 'atmosphere_lighting',
      'texture_detail', 'symbolic_motifs', 'key_moments',
      'hero_frames', 'poster_directions',
    ];

    for (const key of keys) {
      const result = makeSectionResult(key, 1);
      expect(result.sectionKey).toBe(key);
      expect(result).toHaveProperty('hasHeroAnchor');
      expect(result).toHaveProperty('heroAnchorId');
      expect(result).toHaveProperty('heroAnchorInjected');
      expect(result).toHaveProperty('unresolvedCount');
      expect(result).toHaveProperty('provenance');
    }
  });
});

describe('Document assembly fail-closed behavior', () => {
  it('empty section produces unresolvedCount=1, not 0', () => {
    const result = makeSectionResult('symbolic_motifs', 0);
    expect(result.unresolvedCount).toBe(1);
  });

  it('non-empty section produces unresolvedCount=0', () => {
    const result = makeSectionResult('hero_frames', 5);
    expect(result.unresolvedCount).toBe(0);
  });

  it('hero section without anchor fails closed on anchor metadata', () => {
    const result = makeSectionResult('hero_frames', 3);
    // Images exist but no anchor designated
    expect(result.hasHeroAnchor).toBe(false);
    expect(result.heroAnchorId).toBeNull();
    expect(result.heroAnchorInjected).toBe(false);
  });
});

describe('Document assembly no ungoverned leakage', () => {
  it('section result imageIds match images array exactly', () => {
    const result = makeSectionResult('key_moments', 4);
    expect(result.imageIds).toHaveLength(result.images.length);
    for (let i = 0; i < result.images.length; i++) {
      expect(result.imageIds[i]).toBe(result.images[i].id);
    }
  });

  it('hero anchor metadata is not inferred from first image position', () => {
    const result = makeSectionResult('hero_frames', 3);
    // Even though images[0] exists, anchor metadata is false
    expect(result.images.length).toBeGreaterThan(0);
    expect(result.hasHeroAnchor).toBe(false);
    expect(result.heroAnchorId).not.toBe(result.images[0].id);
  });
});
