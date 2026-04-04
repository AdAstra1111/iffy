/**
 * lookbookCompletenessGate.test.ts — Tests for deterministic lookbook quality grading.
 *
 * Validates: required section coverage, sparse slide detection, duplicate image
 * overuse, quality grade computation, and exportable vs publishable distinction.
 */
import { describe, it, expect } from 'vitest';
import { runQAStage, computeQualityGrade, type QADiagnostic } from '../pipeline/qaStage';
import type { LookBookData, SlideContent } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSlide(type: string, overrides: Partial<SlideContent> = {}): SlideContent {
  return {
    type: type as SlideContent['type'],
    slide_id: `${type}:main`,
    title: type,
    composition: 'full_bleed_hero',
    ...overrides,
  } as SlideContent;
}

function makeDeck(slideTypes: string[], withImages = true): LookBookData {
  const slides = slideTypes.map(t => {
    const base = makeSlide(t);
    if (withImages && t !== 'creative_statement') {
      base.backgroundImageUrl = `https://img.test/${t}-bg.jpg`;
      base.imageUrl = `https://img.test/${t}.jpg`;
    }
    if (t === 'characters') {
      base.characters = [
        { name: 'Alice', role: 'Lead', description: 'The protagonist', imageUrl: withImages ? 'https://img.test/alice.jpg' : undefined },
        { name: 'Bob', role: 'Support', description: 'The ally', imageUrl: withImages ? 'https://img.test/bob.jpg' : undefined },
      ];
    }
    return base;
  });
  return {
    slides,
    totalImageRefs: slides.reduce((n, s) => n + (s.backgroundImageUrl ? 1 : 0) + (s.imageUrl ? 1 : 0), 0),
  } as LookBookData;
}

const FULL_DECK_TYPES = ['cover', 'creative_statement', 'world', 'key_moments', 'characters', 'visual_language', 'themes', 'story_engine', 'closing'];

// ── A. Required Section Coverage ─────────────────────────────────────────────

describe('Required Section Coverage', () => {
  it('detects missing required sections', () => {
    const deck = makeDeck(['cover', 'world']); // missing creative_statement, characters, key_moments, closing
    const qa = runQAStage(deck);
    const coverageDiags = qa.diagnostics?.filter(d => d.category === 'coverage') || [];
    const errors = coverageDiags.filter(d => d.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(3); // missing creative_statement, characters, key_moments, closing
    expect(errors.some(d => d.message.includes('characters'))).toBe(true);
    expect(errors.some(d => d.message.includes('key_moments'))).toBe(true);
  });

  it('detects missing recommended sections', () => {
    const deck = makeDeck(['cover', 'creative_statement', 'characters', 'key_moments', 'closing']);
    const qa = runQAStage(deck);
    const coverageWarnings = qa.diagnostics?.filter(d => d.category === 'coverage' && d.severity === 'warning') || [];
    expect(coverageWarnings.some(d => d.message.includes('world'))).toBe(true);
    expect(coverageWarnings.some(d => d.message.includes('visual_language'))).toBe(true);
    expect(coverageWarnings.some(d => d.message.includes('themes'))).toBe(true);
  });

  it('no coverage errors when all required sections present', () => {
    const deck = makeDeck(FULL_DECK_TYPES);
    const qa = runQAStage(deck);
    const coverageErrors = qa.diagnostics?.filter(d => d.category === 'coverage' && d.severity === 'error') || [];
    expect(coverageErrors).toHaveLength(0);
  });
});

// ── B. Sparse Slide Detection ────────────────────────────────────────────────

describe('Sparse Slide Detection', () => {
  it('flags key_moments with only 1 image as sparse', () => {
    const slide = makeSlide('key_moments', { imageUrls: ['https://img.test/km1.jpg'] });
    const deck = { slides: [slide], totalImageRefs: 1 } as LookBookData;
    const qa = runQAStage(deck);
    const sparseWarnings = qa.diagnostics?.filter(d => d.slideType === 'key_moments' && d.message.includes('sparse')) || [];
    expect(sparseWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag world with 1 background as sparse', () => {
    const slide = makeSlide('world', { backgroundImageUrl: 'https://img.test/world-bg.jpg' });
    const deck = { slides: [slide], totalImageRefs: 1 } as LookBookData;
    const qa = runQAStage(deck);
    const sparseWarnings = qa.diagnostics?.filter(d => d.slideType === 'world' && d.message.includes('sparse')) || [];
    expect(sparseWarnings).toHaveLength(0);
  });
});

// ── C. Duplicate Image Overuse ───────────────────────────────────────────────

describe('Duplicate Image Overuse', () => {
  it('flags image reused 3+ times across slides', () => {
    const sharedUrl = 'https://img.test/shared.jpg';
    const slides = [
      makeSlide('cover', { backgroundImageUrl: sharedUrl }),
      makeSlide('world', { backgroundImageUrl: sharedUrl }),
      makeSlide('closing', { backgroundImageUrl: sharedUrl }),
    ];
    const deck = { slides, totalImageRefs: 3 } as LookBookData;
    const qa = runQAStage(deck);
    const reuseDiags = qa.diagnostics?.filter(d => d.category === 'reuse') || [];
    expect(reuseDiags.length).toBeGreaterThanOrEqual(1);
    expect(reuseDiags[0].message).toContain('reused');
  });

  it('does not flag image used only twice', () => {
    const sharedUrl = 'https://img.test/shared.jpg';
    const slides = [
      makeSlide('cover', { backgroundImageUrl: sharedUrl }),
      makeSlide('closing', { backgroundImageUrl: sharedUrl }),
      makeSlide('world', { backgroundImageUrl: 'https://img.test/unique.jpg' }),
    ];
    const deck = { slides, totalImageRefs: 3 } as LookBookData;
    const qa = runQAStage(deck);
    const reuseDiags = qa.diagnostics?.filter(d => d.category === 'reuse') || [];
    expect(reuseDiags).toHaveLength(0);
  });

  it('detects deck-level high reuse ratio', () => {
    // 1 unique image used 5 times
    const url = 'https://img.test/only.jpg';
    const slides = ['cover', 'world', 'key_moments', 'themes', 'closing'].map(t =>
      makeSlide(t, { backgroundImageUrl: url })
    );
    const deck = { slides, totalImageRefs: 5 } as LookBookData;
    const qa = runQAStage(deck);
    const deckReuse = qa.diagnostics?.filter(d => d.category === 'reuse' && d.slideType === 'deck') || [];
    expect(deckReuse.length).toBeGreaterThanOrEqual(1);
    expect(deckReuse[0].message).toContain('shallow');
  });
});

// ── D. Quality Grade Computation ─────────────────────────────────────────────

describe('Quality Grade', () => {
  it('returns incomplete when required sections missing', () => {
    expect(computeQualityGrade({
      totalSlides: 5, slidesWithImages: 4, unresolvedCount: 0,
      requiredMissing: 1, recommendedMissing: 0,
      errorCount: 0, warningCount: 0, reuseCount: 0,
      uniqueImages: 10, totalImageSlots: 12, publishable: true,
    })).toBe('incomplete');
  });

  it('returns incomplete when not publishable', () => {
    expect(computeQualityGrade({
      totalSlides: 5, slidesWithImages: 1, unresolvedCount: 4,
      requiredMissing: 0, recommendedMissing: 0,
      errorCount: 0, warningCount: 0, reuseCount: 0,
      uniqueImages: 1, totalImageSlots: 1, publishable: false,
    })).toBe('incomplete');
  });

  it('returns exportable when errors present', () => {
    expect(computeQualityGrade({
      totalSlides: 9, slidesWithImages: 8, unresolvedCount: 0,
      requiredMissing: 0, recommendedMissing: 0,
      errorCount: 1, warningCount: 0, reuseCount: 0,
      uniqueImages: 10, totalImageSlots: 12, publishable: true,
    })).toBe('exportable');
  });

  it('returns exportable when too many warnings', () => {
    expect(computeQualityGrade({
      totalSlides: 9, slidesWithImages: 8, unresolvedCount: 0,
      requiredMissing: 0, recommendedMissing: 0,
      errorCount: 0, warningCount: 6, reuseCount: 0,
      uniqueImages: 10, totalImageSlots: 12, publishable: true,
    })).toBe('exportable');
  });

  it('returns publishable for decent deck with minor gaps', () => {
    expect(computeQualityGrade({
      totalSlides: 9, slidesWithImages: 7, unresolvedCount: 0,
      requiredMissing: 0, recommendedMissing: 1,
      errorCount: 0, warningCount: 1, reuseCount: 0,
      uniqueImages: 8, totalImageSlots: 10, publishable: true,
    })).toBe('publishable');
  });

  it('returns strong for complete deck with good diversity', () => {
    expect(computeQualityGrade({
      totalSlides: 9, slidesWithImages: 9, unresolvedCount: 0,
      requiredMissing: 0, recommendedMissing: 0,
      errorCount: 0, warningCount: 0, reuseCount: 0,
      uniqueImages: 15, totalImageSlots: 18, publishable: true,
    })).toBe('strong');
  });

  it('publishable is stricter than exportable', () => {
    const baseInputs = {
      totalSlides: 9, slidesWithImages: 8, unresolvedCount: 0,
      requiredMissing: 0, recommendedMissing: 0,
      uniqueImages: 10, totalImageSlots: 12, publishable: true,
    };
    const exportable = computeQualityGrade({ ...baseInputs, errorCount: 1, warningCount: 0, reuseCount: 0 });
    const publishable = computeQualityGrade({ ...baseInputs, errorCount: 0, warningCount: 3, reuseCount: 0, recommendedMissing: 1 });
    expect(exportable).toBe('exportable');
    expect(publishable).toBe('publishable');
  });
});

// ── E. End-to-End QA with Full Deck ──────────────────────────────────────────

describe('End-to-End QA Quality Grading', () => {
  it('full deck with images grades as strong or publishable', () => {
    const deck = makeDeck(FULL_DECK_TYPES);
    const qa = runQAStage(deck);
    expect(['strong', 'publishable']).toContain(qa.qualityGrade);
  });

  it('minimal deck grades as incomplete', () => {
    const deck = makeDeck(['cover']);
    const qa = runQAStage(deck);
    expect(qa.qualityGrade).toBe('incomplete');
  });

  it('deck with all required but no images grades exportable or incomplete', () => {
    const deck = makeDeck(FULL_DECK_TYPES, false);
    const qa = runQAStage(deck);
    expect(['exportable', 'incomplete']).toContain(qa.qualityGrade);
  });
});
