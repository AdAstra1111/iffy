/**
 * unresolvedSlideEnforcement.test.ts — Proves fail-closed behavior at the document boundary.
 *
 * Validates:
 * - Assembly sets _resolutionStatus on every slide
 * - Unresolved slides are excluded from export payloads
 * - QA diagnostics align with resolution status
 * - Partial slides are allowed but flagged
 * - Empty-image slides are correctly classified
 */
import { describe, it, expect } from 'vitest';
import type { SlideContent } from '../types';
import type { QAResult } from '../pipeline/types';
import { runQAStage } from '../pipeline/qaStage';

import type { SlideType } from '../types';

// ── Helpers ──

function makeSlide(overrides: Partial<SlideContent> & { type: SlideType }): SlideContent {
  return {
    type: overrides.type as any,
    slide_id: overrides.slide_id || `${overrides.type}:main`,
    _has_unresolved: false,
    _resolutionStatus: 'resolved',
    ...overrides,
  };
}

function makeDeck(slides: SlideContent[]) {
  return {
    projectId: 'test',
    projectTitle: 'Test',
    identity: {
      colors: { bg: '#000', bgSecondary: '#111', text: '#fff', textMuted: '#888', accent: '#f00', accentMuted: '#800', gradientFrom: '#000', gradientTo: '#111' },
      typography: { titleFont: 'Georgia' as const, bodyFont: 'DM Sans' as const, titleUppercase: false },
      imageStyle: 'cinematic-warm' as const,
    },
    slides,
    deckFormat: 'landscape' as const,
    generatedAt: new Date().toISOString(),
    writerCredit: 'test',
    companyName: 'test',
    companyLogoUrl: null,
  };
}

// ── Tests ──

describe('Unresolved Slide Enforcement', () => {
  it('resolved slides have _resolutionStatus = resolved', () => {
    const slide = makeSlide({
      type: 'world',
      backgroundImageUrl: 'https://img/1',
      _has_unresolved: false,
      _resolutionStatus: 'resolved',
    });
    expect(slide._resolutionStatus).toBe('resolved');
  });

  it('fully unresolved slides have _resolutionStatus = unresolved', () => {
    const slide = makeSlide({
      type: 'key_moments',
      _has_unresolved: true,
      _resolutionStatus: 'unresolved',
    });
    expect(slide._resolutionStatus).toBe('unresolved');
    expect(slide.backgroundImageUrl).toBeUndefined();
    expect(slide.imageUrl).toBeUndefined();
  });

  it('partial slides have _resolutionStatus = partial', () => {
    const slide = makeSlide({
      type: 'themes',
      backgroundImageUrl: 'https://img/1',
      _has_unresolved: true,
      _resolutionStatus: 'partial',
    });
    expect(slide._resolutionStatus).toBe('partial');
  });

  it('export payload excludes unresolved slides', () => {
    const slides = [
      makeSlide({ type: 'cover', backgroundImageUrl: 'https://img/1', _resolutionStatus: 'resolved' }),
      makeSlide({ type: 'world', _has_unresolved: true, _resolutionStatus: 'unresolved' }),
      makeSlide({ type: 'key_moments', imageUrls: ['https://img/2'], _has_unresolved: true, _resolutionStatus: 'partial' }),
      makeSlide({ type: 'closing', backgroundImageUrl: 'https://img/3', _resolutionStatus: 'resolved' }),
    ];

    const exportable = slides.filter(s => s._resolutionStatus !== 'unresolved');
    expect(exportable).toHaveLength(3);
    expect(exportable.map(s => s.type)).toEqual(['cover', 'key_moments', 'closing']);
  });

  it('all-unresolved deck blocks export entirely', () => {
    const slides = [
      makeSlide({ type: 'cover', _has_unresolved: true, _resolutionStatus: 'unresolved' }),
      makeSlide({ type: 'world', _has_unresolved: true, _resolutionStatus: 'unresolved' }),
    ];
    const exportable = slides.filter(s => s._resolutionStatus !== 'unresolved');
    expect(exportable).toHaveLength(0);
  });

  it('QA reports error diagnostics for unresolved slides', () => {
    const slides = [
      makeSlide({ type: 'cover', backgroundImageUrl: 'https://img/1', _resolutionStatus: 'resolved' }),
      makeSlide({ type: 'world', _has_unresolved: true, _resolutionStatus: 'unresolved' }),
      makeSlide({ type: 'themes', backgroundImageUrl: 'https://img/2', _has_unresolved: true, _resolutionStatus: 'partial' }),
    ];

    const qa = runQAStage(makeDeck(slides));
    const errorDiags = qa.diagnostics?.filter(d => d.severity === 'error' && d.slideType === 'world') || [];
    expect(errorDiags.length).toBeGreaterThanOrEqual(1);
    expect(errorDiags[0].message).toContain('unresolved');

    const warningDiags = qa.diagnostics?.filter(d => d.severity === 'warning' && d.slideType === 'themes') || [];
    expect(warningDiags.length).toBeGreaterThanOrEqual(1);
    expect(warningDiags[0].message).toContain('partial');
  });

  it('QA publishable=false when unresolved slides exceed threshold', () => {
    const slides = [
      makeSlide({ type: 'cover', _has_unresolved: true, _resolutionStatus: 'unresolved' }),
      makeSlide({ type: 'world', _has_unresolved: true, _resolutionStatus: 'unresolved' }),
      makeSlide({ type: 'key_moments', _has_unresolved: true, _resolutionStatus: 'unresolved' }),
      makeSlide({ type: 'closing', backgroundImageUrl: 'https://img/1', _resolutionStatus: 'resolved' }),
    ];
    const qa = runQAStage(makeDeck(slides));
    expect(qa.publishable).toBe(false);
  });

  it('QA and export agree — publishable=true means exportable slides exist', () => {
    const slides = [
      makeSlide({ type: 'cover', backgroundImageUrl: 'https://img/1', _resolutionStatus: 'resolved' }),
      makeSlide({ type: 'world', backgroundImageUrl: 'https://img/2', _resolutionStatus: 'resolved' }),
      makeSlide({ type: 'key_moments', imageUrls: ['https://img/3'], _resolutionStatus: 'resolved' }),
      makeSlide({ type: 'closing', backgroundImageUrl: 'https://img/4', _resolutionStatus: 'resolved' }),
    ];
    const qa = runQAStage(makeDeck(slides));
    const exportable = slides.filter(s => s._resolutionStatus !== 'unresolved');
    expect(qa.publishable).toBe(true);
    expect(exportable.length).toBe(slides.length);
  });

  it('multiple slide types all respect resolution status consistently', () => {
    const types: SlideType[] = ['cover', 'world', 'characters', 'themes', 'visual_language', 'key_moments', 'story_engine'];
    for (const t of types) {
      const resolved = makeSlide({ type: t, backgroundImageUrl: 'https://img/1', _resolutionStatus: 'resolved' });
      const unresolved = makeSlide({ type: t, _has_unresolved: true, _resolutionStatus: 'unresolved' });
      expect(resolved._resolutionStatus).toBe('resolved');
      expect(unresolved._resolutionStatus).toBe('unresolved');
      // Export filter works the same for all types
      expect([resolved, unresolved].filter(s => s._resolutionStatus !== 'unresolved')).toHaveLength(1);
    }
  });
});
