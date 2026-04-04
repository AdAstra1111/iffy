/**
 * Shared effective wardrobe normalizer tests — proves the pure logic
 * used by both client and edge runtimes works correctly.
 *
 * These tests validate the same algorithm that runs in edge functions
 * via supabase/functions/_shared/effectiveWardrobeNormalizer.ts
 */

import { describe, it, expect } from 'vitest';
import { normalizeWardrobe, normalizeIdentitySummary } from '../effectiveWardrobeNormalizer';
import type { TemporalTruth } from '../temporalTruthResolver';

const CONTEMPORARY: TemporalTruth = {
  era: 'contemporary',
  family: 'modern',
  label: 'Contemporary (21st Century)',
  provenance: 'explicit',
  confidence: 'high',
  evidence: [],
  contributing_sources: ['project_canon'],
  contradictions: [],
  era_garments: ['shirt', 'jeans', 'jacket'],
  forbidden_garment_families: ['tunic', 'cloak', 'robe', 'gown', 'cape'],
  summary: 'Contemporary',
};

describe('normalizeWardrobe (shared logic)', () => {
  it('removes forbidden garments in contemporary era', () => {
    const result = normalizeWardrobe(
      { garments: ['tunic', 'boots', 'cloak', 'jacket'] },
      CONTEMPORARY,
    );
    expect(result.garments).toEqual(['boots', 'jacket']);
    expect(result.exclusions).toHaveLength(2);
    expect(result.exclusions[0].reason).toBe('temporal_forbidden');
    expect(result.wasNormalized).toBe(true);
  });

  it('scene-explicit garments are excluded with contradiction diagnostics', () => {
    const result = normalizeWardrobe(
      { garments: ['tunic', 'boots'], sceneExplicitGarments: ['tunic'] },
      CONTEMPORARY,
    );
    expect(result.garments).not.toContain('tunic');
    expect(result.garments).toContain('boots');
    expect(result.exclusions).toHaveLength(1);
    expect(result.exclusions[0].reason).toBe('contradiction_demoted');
  });

  it('low confidence skips exclusion', () => {
    const low = { ...CONTEMPORARY, confidence: 'low' as const };
    const result = normalizeWardrobe({ garments: ['tunic', 'boots'] }, low);
    expect(result.garments).toEqual(['tunic', 'boots']);
    expect(result.wasNormalized).toBe(false);
  });

  it('null temporal truth passes through', () => {
    const result = normalizeWardrobe({ garments: ['tunic', 'boots'] }, null);
    expect(result.garments).toEqual(['tunic', 'boots']);
  });
});

describe('normalizeIdentitySummary (shared logic)', () => {
  it('strips forbidden garment names from summary', () => {
    const result = normalizeIdentitySummary(
      'artisan protagonist — gown, tunic, cloak',
      CONTEMPORARY,
    );
    expect(result.normalized).not.toMatch(/tunic/i);
    expect(result.normalized).not.toMatch(/cloak/i);
    expect(result.normalized).not.toMatch(/gown/i);
    expect(result.removedItems).toContain('tunic');
  });

  it('preserves summary when no temporal truth', () => {
    const result = normalizeIdentitySummary('some summary', null);
    expect(result.normalized).toBe('some summary');
    expect(result.removedItems).toHaveLength(0);
  });
});
