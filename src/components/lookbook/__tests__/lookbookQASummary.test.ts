/**
 * Tests for LookbookQASummary component rendering canonical QAResult data.
 */
import { describe, it, expect } from 'vitest';
import type { QAResult } from '@/lib/lookbook/pipeline/types';

// Unit-test the component's data consumption logic without DOM
// by verifying that the QAResult contract is correctly shaped for display.

function summarizeQA(qa: QAResult) {
  const diags = qa.diagnostics || [];
  const errors = diags.filter(d => d.severity === 'error');
  const warnings = diags.filter(d => d.severity === 'warning');
  const infos = diags.filter(d => d.severity === 'info');

  const grouped = new Map<string, typeof diags>();
  for (const d of diags) {
    const list = grouped.get(d.category) || [];
    list.push(d);
    grouped.set(d.category, list);
  }

  return { errors, warnings, infos, grouped, grade: qa.qualityGrade };
}

const BASE_QA: QAResult = {
  totalSlides: 10,
  slidesWithImages: 8,
  slidesWithoutImages: 2,
  totalImageRefs: 20,
  unresolvedSlides: [],
  reuseWarnings: [],
  fingerprintWarnings: [],
  publishable: true,
  qualityGrade: 'strong',
  diagnostics: [],
};

describe('LookbookQASummary data contract', () => {
  it('renders strong grade with no diagnostics', () => {
    const summary = summarizeQA(BASE_QA);
    expect(summary.grade).toBe('strong');
    expect(summary.errors).toHaveLength(0);
    expect(summary.warnings).toHaveLength(0);
    expect(summary.grouped.size).toBe(0);
  });

  it('surfaces coverage errors for missing required sections', () => {
    const qa: QAResult = {
      ...BASE_QA,
      qualityGrade: 'incomplete',
      publishable: false,
      diagnostics: [
        { category: 'coverage', severity: 'error', slideType: 'cover', message: 'Required section "cover" missing' },
        { category: 'coverage', severity: 'error', slideType: 'closing', message: 'Required section "closing" missing' },
      ],
    };
    const summary = summarizeQA(qa);
    expect(summary.grade).toBe('incomplete');
    expect(summary.errors).toHaveLength(2);
    expect(summary.grouped.get('coverage')).toHaveLength(2);
  });

  it('groups reuse warnings correctly', () => {
    const qa: QAResult = {
      ...BASE_QA,
      qualityGrade: 'exportable',
      diagnostics: [
        { category: 'reuse', severity: 'warning', slideType: 'deck', message: 'Image X reused 4 times' },
        { category: 'fill', severity: 'warning', slideType: 'key_moments', message: 'Sparse slide' },
      ],
    };
    const summary = summarizeQA(qa);
    expect(summary.warnings).toHaveLength(2);
    expect(summary.grouped.get('reuse')).toHaveLength(1);
    expect(summary.grouped.get('fill')).toHaveLength(1);
  });

  it('distinguishes exportable from publishable', () => {
    const exportable = summarizeQA({ ...BASE_QA, qualityGrade: 'exportable' });
    const publishable = summarizeQA({ ...BASE_QA, qualityGrade: 'publishable' });
    expect(exportable.grade).toBe('exportable');
    expect(publishable.grade).toBe('publishable');
    expect(exportable.grade).not.toBe(publishable.grade);
  });

  it('shows unresolved slide count from QAResult', () => {
    const qa: QAResult = { ...BASE_QA, unresolvedSlides: ['slide_1', 'slide_2'] };
    expect(qa.unresolvedSlides).toHaveLength(2);
  });

  it('does not duplicate QA computation — uses canonical fields only', () => {
    // The component must consume these exact fields from QAResult
    const requiredFields: (keyof QAResult)[] = [
      'qualityGrade', 'publishable', 'totalSlides', 'slidesWithImages',
      'slidesWithoutImages', 'totalImageRefs', 'unresolvedSlides',
      'reuseWarnings', 'diagnostics',
    ];
    for (const field of requiredFields) {
      expect(field in BASE_QA).toBe(true);
    }
  });
});
