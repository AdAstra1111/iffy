/**
 * Production Activation Layer — regression tests.
 */
import { describe, it, expect } from 'vitest';
import {
  canActivateVisualProduction,
  isProductionActivationDoc,
  readProductionFlags,
} from '@/lib/production-activation';

describe('isProductionActivationDoc', () => {
  it('returns true for visual_project_bible', () => {
    expect(isProductionActivationDoc('visual_project_bible')).toBe(true);
  });
  it('returns false for ladder docs', () => {
    expect(isProductionActivationDoc('concept_brief')).toBe(false);
    expect(isProductionActivationDoc('script')).toBe(false);
  });
  it('returns false for null/undefined', () => {
    expect(isProductionActivationDoc(null)).toBe(false);
    expect(isProductionActivationDoc(undefined)).toBe(false);
  });
});

describe('canActivateVisualProduction', () => {
  it('eligible when VPB converged with no blockers', () => {
    const result = canActivateVisualProduction({
      docType: 'visual_project_bible',
      ciScore: 80,
      gpScore: 75,
      blockers: [],
    });
    expect(result.eligible).toBe(true);
  });

  it('not eligible with blockers', () => {
    const result = canActivateVisualProduction({
      docType: 'visual_project_bible',
      ciScore: 80,
      gpScore: 75,
      blockers: ['weak reference frames'],
    });
    expect(result.eligible).toBe(false);
  });

  it('not eligible with low CI', () => {
    const result = canActivateVisualProduction({
      docType: 'visual_project_bible',
      ciScore: 40,
      gpScore: 75,
      blockers: [],
    });
    expect(result.eligible).toBe(false);
  });

  it('not eligible for non-VPB doc', () => {
    const result = canActivateVisualProduction({
      docType: 'concept_brief',
      ciScore: 90,
      gpScore: 90,
      blockers: [],
    });
    expect(result.eligible).toBe(false);
  });

  it('not eligible with null scores', () => {
    const result = canActivateVisualProduction({
      docType: 'visual_project_bible',
      ciScore: null,
      gpScore: null,
      blockers: [],
    });
    expect(result.eligible).toBe(false);
  });
});

describe('readProductionFlags', () => {
  it('returns empty for null', () => {
    expect(readProductionFlags(null)).toEqual({});
  });
  it('reads visual_locked', () => {
    expect(readProductionFlags({ production_flags: { visual_locked: true } })).toEqual({ visual_locked: true });
  });
  it('handles missing production_flags key', () => {
    expect(readProductionFlags({ some_other: 'value' })).toEqual({});
  });
});
