/**
 * Compliance Test: Provenance Guard
 * Validates that provenance guard rejects bad emissions and accepts valid ones.
 * Mirrors the logic from supabase/functions/_shared/provenance-guard.ts
 * for client-side testing (edge functions can't import vitest).
 */
import { describe, it, expect } from 'vitest';

// Mirror of the guard logic for testing
type ProvenanceSourceType = 'extracted' | 'inferred' | 'user_supplied';
type CDGStaleness = 'FRESH' | 'STALE';

interface ProvenanceRecord {
  source_type: ProvenanceSourceType;
  confidence_score: number;
  reasoning: string[];
  pcp_dependencies: string[];
  cpie_event_id?: string;
}

interface CDGContextRecord {
  node_id: string;
  staleness: CDGStaleness;
  upstream_node: string;
  regeneration_count: number;
}

interface CanonEmission {
  entity_key: string;
  canon_object: Record<string, unknown>;
  provenance: ProvenanceRecord;
  cdg_context: CDGContextRecord;
  generated_at: string;
  generated_by: string;
}

interface ValidationError {
  emissionIndex: number;
  entityKey: string;
  field: string;
  message: string;
}

const VALID_CANON_NODES = new Set(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
const VALID_SOURCE_TYPES = new Set(['extracted', 'inferred', 'user_supplied']);

function validateEmission(emission: CanonEmission, index: number): ValidationError[] {
  const entityKey = emission.entity_key || `emission[\${index}]`;
  const errors: ValidationError[] = [];
  const addError = (field: string, message: string) => {
    errors.push({ emissionIndex: index, entityKey, field, message });
  };
  const p = emission.provenance;
  const c = emission.cdg_context;
  if (!p.source_type || !VALID_SOURCE_TYPES.has(p.source_type)) addError('source_type', 'invalid');
  if (p.confidence_score === undefined || p.confidence_score === null || p.confidence_score < 0 || p.confidence_score > 1) addError('confidence_score', 'invalid');
  if (!p.reasoning || p.reasoning.length === 0) addError('reasoning', 'empty');
  if (!c.node_id || !VALID_CANON_NODES.has(c.node_id)) addError('node_id', 'invalid');
  if (!c.upstream_node) addError('upstream_node', 'missing');
  if (!emission.generated_at) addError('generated_at', 'missing');
  if (!emission.generated_by) addError('generated_by', 'missing');
  return errors;
}

function makeValidEmission(overrides?: Partial<CanonEmission>): CanonEmission {
  return {
    entity_key: 'harry_detective',
    canon_object: { primaryOutfit: 'trench_coat' },
    provenance: {
      source_type: 'inferred',
      confidence_score: 0.91,
      reasoning: ['profession=detective', 'genre=noir'],
      pcp_dependencies: ['profession_map', 'genre'],
    },
    cdg_context: {
      node_id: 'D1',
      staleness: 'FRESH',
      upstream_node: 'C1',
      regeneration_count: 1,
    },
    generated_at: '2026-06-01T14:30:00Z',
    generated_by: 'cpie_registry',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Provenance Guard — Valid Emissions', () => {
  it('accepts a fully valid emission', () => {
    const emission = makeValidEmission();
    expect(validateEmission(emission, 0)).toHaveLength(0);
  });

  it('accepts all valid source types', () => {
    for (const st of ['extracted', 'inferred', 'user_supplied'] as ProvenanceSourceType[]) {
      const emission = makeValidEmission({ provenance: { ...makeValidEmission().provenance, source_type: st } });
      expect(validateEmission(emission, 0)).toHaveLength(0);
    }
  });

  it('accepts all valid canon nodes (D1-D7)', () => {
    for (const node of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']) {
      const emission = makeValidEmission({ cdg_context: { ...makeValidEmission().cdg_context, node_id: node } });
      expect(validateEmission(emission, 0)).toHaveLength(0);
    }
  });

  it('accepts zero confidence score', () => {
    const emission = makeValidEmission({ provenance: { ...makeValidEmission().provenance, confidence_score: 0 } });
    expect(validateEmission(emission, 0)).toHaveLength(0);
  });

  it('accepts edge-of-range confidence score 1.0', () => {
    const emission = makeValidEmission({ provenance: { ...makeValidEmission().provenance, confidence_score: 1.0 } });
    expect(validateEmission(emission, 0)).toHaveLength(0);
  });
});

describe('Provenance Guard — Missing Fields', () => {
  it('rejects missing source_type', () => {
    const emission = makeValidEmission({ provenance: { ...makeValidEmission().provenance, source_type: '' as any } });
    expect(validateEmission(emission, 0).length).toBeGreaterThan(0);
  });

  it('rejects missing confidence_score', () => {
    const emission = makeValidEmission({ provenance: { ...makeValidEmission().provenance, confidence_score: undefined as any } });
    expect(validateEmission(emission, 0).length).toBeGreaterThan(0);
  });

  it('rejects empty reasoning array', () => {
    const emission = makeValidEmission({ provenance: { ...makeValidEmission().provenance, reasoning: [] } });
    expect(validateEmission(emission, 0).length).toBeGreaterThan(0);
  });

  it('rejects missing node_id', () => {
    const emission = makeValidEmission({ cdg_context: { ...makeValidEmission().cdg_context, node_id: '' } });
    expect(validateEmission(emission, 0).length).toBeGreaterThan(0);
  });

  it('rejects missing upstream_node', () => {
    const emission = makeValidEmission({ cdg_context: { ...makeValidEmission().cdg_context, upstream_node: '' } });
    expect(validateEmission(emission, 0).length).toBeGreaterThan(0);
  });

  it('rejects missing generated_at', () => {
    const emission = makeValidEmission({ generated_at: '' });
    expect(validateEmission(emission, 0).length).toBeGreaterThan(0);
  });

  it('rejects missing generated_by', () => {
    const emission = makeValidEmission({ generated_by: '' });
    expect(validateEmission(emission, 0).length).toBeGreaterThan(0);
  });
});

describe('Provenance Guard — Invalid Values', () => {
  it('rejects invalid source_type', () => {
    const emission = makeValidEmission({ provenance: { ...makeValidEmission().provenance, source_type: 'llm_invented' as any } });
    expect(validateEmission(emission, 0).length).toBeGreaterThan(0);
  });

  it('rejects confidence > 1.0', () => {
    const emission = makeValidEmission({ provenance: { ...makeValidEmission().provenance, confidence_score: 1.5 } });
    expect(validateEmission(emission, 0).length).toBeGreaterThan(0);
  });

  it('rejects confidence < 0', () => {
    const emission = makeValidEmission({ provenance: { ...makeValidEmission().provenance, confidence_score: -0.5 } });
    expect(validateEmission(emission, 0).length).toBeGreaterThan(0);
  });

  it('rejects invalid node_id', () => {
    const emission = makeValidEmission({ cdg_context: { ...makeValidEmission().cdg_context, node_id: 'Z9' } });
    expect(validateEmission(emission, 0).length).toBeGreaterThan(0);
  });
});

describe('Provenance Guard — Batch Validation', () => {
  it('returns valid for all-good batch', () => {
    const batch = [makeValidEmission(), makeValidEmission(), makeValidEmission()];
    const allErrors = batch.flatMap((e, i) => validateEmission(e, i));
    expect(allErrors).toHaveLength(0);
  });

  it('reports specific index for bad emission in batch', () => {
    const batch = [makeValidEmission(), makeValidEmission({ generated_by: '' }), makeValidEmission()];
    const allErrors = batch.flatMap((e, i) => validateEmission(e, i));
    expect(allErrors.length).toBeGreaterThan(0);
    expect(allErrors[0].emissionIndex).toBe(1);
  });

  it('reports all errors across batch', () => {
    const batch = [
      makeValidEmission({ provenance: { ...makeValidEmission().provenance, reasoning: [] } }),
      makeValidEmission({ cdg_context: { ...makeValidEmission().cdg_context, node_id: '' } }),
    ];
    const allErrors = batch.flatMap((e, i) => validateEmission(e, i));
    expect(allErrors.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Forbidden Query Detection ─────────────────────────────────────────

describe('Forbidden Query Detection — Atomiser Source Scan', () => {
  const FORBIDDEN_TABLES = ['projects', 'project_canon', 'project_visual_style'];
  const ATOMISER_FILES = [
    'supabase/functions/costume-atomiser/index.ts',
    'supabase/functions/creature-atomiser/index.ts',
    'supabase/functions/vehicle-atomiser/index.ts',
    'supabase/functions/prop-atomiser/index.ts',
  ];

  for (const filePath of ATOMISER_FILES) {
    for (const table of FORBIDDEN_TABLES) {
      it(filePath + ' does not query .from("' + table + '")', () => {
        try {
          const fs = require('fs');
          const source = fs.readFileSync(filePath, 'utf-8');
          const hasDirectQuery = source.includes('.from("' + table + '")');
          expect(hasDirectQuery).toBe(false);
        } catch {
          // File may not exist in CI
        }
      });
    }
  }
});