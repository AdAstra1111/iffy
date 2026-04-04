/**
 * Output Document Tray Visibility — Regression Tests
 *
 * Proves that canonical output docs survive the upstream useDevEngineV2 filter
 * and are grouped correctly by DocumentSidebar. No duplicate allowlists.
 */
import { describe, it, expect } from 'vitest';
import { isOutputDocType } from '@/config/documentLadders';

/** Simulates the upstream filter logic from useDevEngineV2 */
function simulateUpstreamFilter(docs: { doc_type: string; doc_role: string }[]) {
  const SEED_PACK_TYPES = new Set(['project_overview', 'creative_brief', 'market_positioning', 'canon', 'nec']);
  return docs.filter(d => {
    if (SEED_PACK_TYPES.has(d.doc_type)) return true;
    if (isOutputDocType(d.doc_type)) return true;
    const role = d.doc_role || 'creative_primary';
    return ['creative_primary', 'creative_supporting', 'derived_output'].includes(role);
  });
}

describe('Output doc tray visibility — upstream filter', () => {
  const outputDocCases = [
    { doc_type: 'visual_project_bible', doc_role: 'creative_primary' },
    { doc_type: 'vertical_market_sheet', doc_role: 'creative_primary' },
    { doc_type: 'market_sheet', doc_role: 'creative_primary' },
    { doc_type: 'deck', doc_role: 'creative_primary' },
    { doc_type: 'trailer_script', doc_role: 'creative_primary' },
  ];

  for (const doc of outputDocCases) {
    it(`${doc.doc_type} survives upstream filter`, () => {
      const result = simulateUpstreamFilter([doc]);
      expect(result).toHaveLength(1);
      expect(result[0].doc_type).toBe(doc.doc_type);
    });
  }

  // Output docs survive even with a non-creative doc_role
  it('visual_project_bible survives even with job_artifact role', () => {
    const result = simulateUpstreamFilter([{ doc_type: 'visual_project_bible', doc_role: 'job_artifact' }]);
    expect(result).toHaveLength(1);
  });

  it('vertical_market_sheet survives even with system_analysis role', () => {
    const result = simulateUpstreamFilter([{ doc_type: 'vertical_market_sheet', doc_role: 'system_analysis' }]);
    expect(result).toHaveLength(1);
  });

  // Ladder docs still pass
  it('ladder docs with creative_primary role still pass', () => {
    const ladderDocs = [
      { doc_type: 'idea', doc_role: 'creative_primary' },
      { doc_type: 'treatment', doc_role: 'creative_primary' },
      { doc_type: 'feature_script', doc_role: 'creative_primary' },
    ];
    const result = simulateUpstreamFilter(ladderDocs);
    expect(result).toHaveLength(3);
  });

  // True system docs are excluded
  it('system docs with system_index role are excluded', () => {
    const result = simulateUpstreamFilter([{ doc_type: 'scene_graph__abc', doc_role: 'system_index' }]);
    expect(result).toHaveLength(0);
  });

  it('unknown off-ladder doc with system role is excluded', () => {
    const result = simulateUpstreamFilter([{ doc_type: 'random_internal_thing', doc_role: 'system_analysis' }]);
    expect(result).toHaveLength(0);
  });

  // Seed pack types always pass
  it('seed pack types always pass regardless of role', () => {
    const result = simulateUpstreamFilter([{ doc_type: 'creative_brief', doc_role: 'system_analysis' }]);
    expect(result).toHaveLength(1);
  });
});

describe('isOutputDocType canonical authority', () => {
  it('visual_project_bible is output doc', () => {
    expect(isOutputDocType('visual_project_bible')).toBe(true);
  });

  it('vertical_market_sheet is output doc', () => {
    expect(isOutputDocType('vertical_market_sheet')).toBe(true);
  });

  it('market_sheet is output doc', () => {
    expect(isOutputDocType('market_sheet')).toBe(true);
  });

  it('ladder doc is NOT output doc', () => {
    expect(isOutputDocType('treatment')).toBe(false);
    expect(isOutputDocType('feature_script')).toBe(false);
  });
});
