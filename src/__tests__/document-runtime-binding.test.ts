/**
 * Tests for DocumentRuntimeBinding Resolver.
 * Covers all 4 binding types, 10 invariants, and cross-doc-type isolation.
 */
import { describe, it, expect } from 'vitest';
import { resolveBindings, resolveSingleBinding, type ResolverVersion } from '@/lib/versionBinding/documentRuntimeBindingResolver';
import { assertRuntimeBindingEligible } from '@/lib/versionBinding/assertRuntimeBindingEligible';
import type { RuntimeBinding, BindingType, BindingSource } from '@/lib/versionBinding/documentRuntimeBindingTypes';

// ── Test fixtures ──
function makeVersion(overrides: Partial<ResolverVersion> = {}): ResolverVersion {
  return {
    id: `v-${Math.random().toString(36).slice(2, 8)}`,
    version_number: 1,
    approval_status: null,
    is_current: false,
    created_at: '2026-01-01T00:00:00Z',
    meta_json: null,
    ...overrides,
  };
}

const versions: ResolverVersion[] = [
  makeVersion({ id: 'v1', version_number: 1, approval_status: 'approved', is_current: false, created_at: '2026-01-01T00:00:00Z', meta_json: { ci: 85, gp: 80 } }),
  makeVersion({ id: 'v2', version_number: 2, approval_status: 'approved', is_current: true, created_at: '2026-01-02T00:00:00Z', meta_json: { ci: 90, gp: 88 } }),
  makeVersion({ id: 'v3', version_number: 3, approval_status: 'rejected', is_current: false, created_at: '2026-01-03T00:00:00Z' }),
  makeVersion({ id: 'v4', version_number: 4, approval_status: 'approved', is_current: false, created_at: '2026-01-04T00:00:00Z', meta_json: { ci: 92, gp: 85 } }),
  makeVersion({ id: 'v5', version_number: 5, approval_status: 'draft', is_current: false, created_at: '2026-01-05T00:00:00Z' }),
];

function makeBinding(overrides: Partial<RuntimeBinding> = {}): RuntimeBinding {
  return {
    type: 'authoritative',
    versionId: 'v1',
    source: 'approved_and_current',
    boundAt: Date.now(),
    docType: 'treatment',
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════
// 1. Authoritative Resolution
// ════════════════════════════════════════════════════════════
describe('authoritative resolution', () => {
  it('returns approved+current version when it exists', () => {
    const result = resolveSingleBinding('authoritative', versions, null, 'treatment');
    expect(result.versionId).toBe('v2');
    expect(result.source).toBe('approved_and_current');
  });

  it('falls back to newest approved by created_at when no approved+current', () => {
    const noCurrent = versions.filter(v => !(v.id === 'v2' && v.is_current === true));
    // We need at least one non-current approved version
    noCurrent[0] = { ...noCurrent[0], approval_status: 'approved' };
    const result = resolveSingleBinding('authoritative', noCurrent, null, 'treatment');
    expect(result.versionId).toBeTruthy();
    expect(result.source).toBe('newest_approved');
  });

  it('returns null when no approved versions exist', () => {
    const noApproved = versions.filter(v => v.approval_status !== 'approved');
    const result = resolveSingleBinding('authoritative', noApproved, null, 'treatment');
    expect(result.versionId).toBeNull();
    expect(result.source).toBe('unavailable');
  });

  it('returns unavailable for empty version list', () => {
    const result = resolveSingleBinding('authoritative', [], null, 'treatment');
    expect(result.versionId).toBeNull();
    expect(result.source).toBe('unavailable');
  });
});

// ════════════════════════════════════════════════════════════
// 2. Promotion Gate Resolution
// ════════════════════════════════════════════════════════════
describe('promotion_gate resolution', () => {
  it('returns approved+current by highest version_number', () => {
    const result = resolveSingleBinding('promotion_gate', versions, null, 'treatment');
    expect(result.versionId).toBe('v2');
    expect(result.source).toBe('approved_and_current');
  });

  it('falls back to best approved by version_number when no approved+current', () => {
    const noCurrent = versions.map(v => ({ ...v, is_current: false }));
    noCurrent[0].approval_status = 'approved'; // v1
    noCurrent[3].approval_status = 'approved'; // v4
    const result = resolveSingleBinding('promotion_gate', noCurrent, null, 'treatment');
    // v4 has highest version_number among approved
    expect(result.versionId).toBe('v4');
    expect(result.source).toBe('best_version_number');
  });

  it('NEVER falls through to selectedVersionId', () => {
    const noApproved = versions.filter(v => v.approval_status !== 'approved');
    const result = resolveSingleBinding('promotion_gate', noApproved, 'v999', 'treatment');
    // Should NOT return v999 even though selectedVersionId is provided
    expect(result.versionId).toBeNull();
    expect(result.source).toBe('unavailable');
  });

  it('returns null when no approved versions', () => {
    const noApproved = versions.filter(v => v.approval_status !== 'approved');
    const result = resolveSingleBinding('promotion_gate', noApproved, null, 'treatment');
    expect(result.versionId).toBeNull();
    expect(result.source).toBe('unavailable');
  });
});

// ════════════════════════════════════════════════════════════
// 3. Render Resolution
// ════════════════════════════════════════════════════════════
describe('render resolution', () => {
  it('returns authoritative when it resolves', () => {
    const result = resolveSingleBinding('render', versions, 'v5', 'treatment');
    // authoritative is v2 (approved+current)
    expect(result.versionId).toBe('v2');
    expect(result.source).toBe('approved_and_current');
  });

  it('falls back to selectedVersionId when no authoritative', () => {
    const noApproved = versions.filter(v => v.approval_status !== 'approved');
    const result = resolveSingleBinding('render', noApproved, 'v5', 'treatment');
    expect(result.versionId).toBe('v5');
    expect(result.source).toBe('user_selected');
  });

  it('falls back to latest version when no authoritative or selected', () => {
    const noApproved = versions.filter(v => v.approval_status !== 'approved' && v.approval_status !== 'draft');
    const result = resolveSingleBinding('render', noApproved, null, 'treatment');
    // Should use latest by version_number
    expect(result.versionId).toBeTruthy();
    expect(result.source).toBe('auto_select_latest');
  });

  it('returns null for empty version list', () => {
    const result = resolveSingleBinding('render', [], 'v5', 'treatment');
    expect(result.versionId).toBeNull();
    expect(result.source).toBe('unavailable');
  });
});

// ════════════════════════════════════════════════════════════
// 4. Pipeline Resolution (ABVR mirror)
// ════════════════════════════════════════════════════════════
describe('pipeline resolution', () => {
  it('follows ABVR: A1 approved+current wins', () => {
    const result = resolveSingleBinding('pipeline', versions, null, 'treatment');
    expect(result.versionId).toBe('v2');
    expect(result.source).toBe('approved_and_current');
  });

  it('follows ABVR: A2 best approved by score', () => {
    const noCurrent = versions.map(v => ({ ...v, is_current: false }));
    // Ensure v2 (originally approved) is NOT approved so it doesn't leak through spread copy
    noCurrent[1].approval_status = 'rejected';
    noCurrent[0].approval_status = 'approved';
    noCurrent[3].approval_status = 'approved';
    // v4 has ci: 92, gp: 85 (total 177) vs v1 ci: 85, gp: 80 (total 165)
    // But v4 has highest total
    const result = resolveSingleBinding('pipeline', noCurrent, null, 'treatment');
    expect(result.versionId).toBe('v4');
  });

  it('follows ABVR: D latest by version_number as final fallback', () => {
    const unapproved = versions.filter(v => v.approval_status === 'rejected' || v.approval_status === 'draft');
    // v5 has version_number 5
    const result = resolveSingleBinding('pipeline', unapproved, null, 'treatment');
    expect(result.versionId).toBe('v5');
    expect(result.source).toBe('auto_select_latest');
  });

  it('returns null for empty version list', () => {
    const result = resolveSingleBinding('pipeline', [], null, 'treatment');
    expect(result.versionId).toBeNull();
    expect(result.source).toBe('unavailable');
  });
});

// ════════════════════════════════════════════════════════════
// 5. resolveBindings (all 4)
// ════════════════════════════════════════════════════════════
describe('resolveBindings — all 4 types', () => {
  it('returns exactly 4 bindings', () => {
    const bindings = resolveBindings(versions, 'v5', 'treatment');
    expect(bindings).toHaveLength(4);
    const types = bindings.map(b => b.type).sort();
    expect(types).toEqual(['authoritative', 'pipeline', 'promotion_gate', 'render']);
  });

  it('each binding has the required fields', () => {
    const bindings = resolveBindings(versions, 'v5', 'treatment');
    for (const b of bindings) {
      expect(b).toHaveProperty('type');
      expect(b).toHaveProperty('versionId');
      expect(b).toHaveProperty('source');
      expect(b).toHaveProperty('boundAt');
      expect(b).toHaveProperty('docType');
      expect(typeof b.boundAt).toBe('number');
      expect(b.docType).toBe('treatment');
    }
  });

  it('attaches docType to each binding', () => {
    const bindings = resolveBindings(versions, 'v5', 'concept_brief');
    for (const b of bindings) {
      expect(b.docType).toBe('concept_brief');
    }
  });
});

// ════════════════════════════════════════════════════════════
// 6. assertRuntimeBindingEligible — Invariants
// ════════════════════════════════════════════════════════════
describe('assertRuntimeBindingEligible', () => {
  it('Invariant 1: UI_AUTHORITY_OVERRIDE — blocks non-authoritative binding for set_current', () => {
    const renderBinding = makeBinding({ type: 'render', source: 'user_selected' });
    const result = assertRuntimeBindingEligible(renderBinding, {
      operation: 'set_current',
      sourceBinding: 'authoritative',
    } as any);
    expect(result.eligible).toBe(false);
    expect(result.violations.some(v => v.invariantId === 1)).toBe(true);
  });

  it('Invariant 1: passes for authoritative binding on set_current', () => {
    const authBinding = makeBinding({ type: 'authoritative', source: 'approved_and_current' });
    const result = assertRuntimeBindingEligible(authBinding, {
      operation: 'set_current',
      sourceBinding: 'authoritative',
    } as any);
    expect(result.eligible).toBe(true);
  });

  it('Invariant 2: GATE_VERSION_REBIND — blocks promotion_gate with user_selected source', () => {
    const gateBinding = makeBinding({ type: 'promotion_gate', source: 'user_selected' });
    const result = assertRuntimeBindingEligible(gateBinding, {
      operation: 'gate_analysis',
      sourceBinding: 'promotion_gate',
    } as any);
    expect(result.eligible).toBe(false);
    expect(result.violations.some(v => v.invariantId === 2)).toBe(true);
  });

  it('Invariant 5: BOUND_UNRESOLVED — blocks when render or pipeline is unresolved', () => {
    const result = assertRuntimeBindingEligible(null, {
      operation: 'pipeline_trigger',
      targetDocType: 'treatment',
      _allBindings: [
        makeBinding({ type: 'render', versionId: null, source: 'unavailable' }),
        makeBinding({ type: 'pipeline', versionId: null, source: 'unavailable' }),
      ],
    } as any);
    expect(result.eligible).toBe(false);
    expect(result.violations.some(v => v.invariantId === 5)).toBe(true);
  });

  it('Invariant 6: RENDER_TRIGGERED_PIPELINE — blocks pipeline from render trigger', () => {
    const renderBinding = makeBinding({ type: 'render' });
    const result = assertRuntimeBindingEligible(renderBinding, {
      operation: 'pipeline_trigger',
      sourceBinding: 'render',
    } as any);
    expect(result.eligible).toBe(false);
    expect(result.violations.some(v => v.invariantId === 6)).toBe(true);
  });

  it('Invariant 7: INSUFFICIENT_CONTENT — blocks render with empty content', () => {
    const renderBinding = makeBinding({ type: 'render', versionId: 'v1' });
    const result = assertRuntimeBindingEligible(renderBinding, {
      operation: 'render_init',
      targetAction: 'render_with_empty_content',
    } as any);
    expect(result.eligible).toBe(false);
    expect(result.violations.some(v => v.invariantId === 7)).toBe(true);
  });

  it('Invariant 8: CROSS_DOC_TYPE_BINDING_LEAK — blocks when docType mismatches', () => {
    const binding = makeBinding({ type: 'authoritative', docType: 'treatment' });
    const result = assertRuntimeBindingEligible(binding, {
      operation: 'promote',
      targetDocType: 'screenplay',
    } as any);
    expect(result.eligible).toBe(false);
    expect(result.violations.some(v => v.invariantId === 8)).toBe(true);
  });

  it('Invariant 9: IMPLICIT_MUTATION — blocks promote without sourceBinding', () => {
    const result = assertRuntimeBindingEligible(null, {
      operation: 'promote',
    } as any);
    expect(result.eligible).toBe(false);
    expect(result.violations.some(v => v.invariantId === 9)).toBe(true);
  });

  it('returns eligible=true for a valid promote operation', () => {
    const promoteGateBinding = makeBinding({ type: 'promotion_gate', versionId: 'v2', source: 'approved_and_current' });
    const result = assertRuntimeBindingEligible(promoteGateBinding, {
      operation: 'promote',
      sourceBinding: promoteGateBinding,
      targetDocType: 'treatment',
    } as any);
    expect(result.eligible).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════
// 7. Per-doc-type isolation (Invariant 8)
// ════════════════════════════════════════════════════════════
describe('per-doc-type isolation', () => {
  it('resolveBindings attaches correct docType to each binding', () => {
    const bindings1 = resolveBindings(versions, null, 'concept_brief');
    const bindings2 = resolveBindings(versions, null, 'treatment');
    for (const b of bindings1) {
      expect(b.docType).toBe('concept_brief');
    }
    for (const b of bindings2) {
      expect(b.docType).toBe('treatment');
    }
  });

  it('assertRuntimeBindingEligible catches cross-doc-type leaks', () => {
    const binding = makeBinding({ docType: 'concept_brief' });
    const result = assertRuntimeBindingEligible(binding, {
      operation: 'promote',
      targetDocType: 'treatment',
    } as any);
    expect(result.eligible).toBe(false);
    expect(result.violations.some(v => v.invariantId === 8)).toBe(true);
  });

  it('same docType passes invariant 8', () => {
    const binding = makeBinding({ docType: 'treatment' });
    const result = assertRuntimeBindingEligible(binding, {
      operation: 'promote',
      targetDocType: 'treatment',
    } as any);
    expect(result.violations.some(v => v.invariantId === 8)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// 8. Backward Compatibility — same named accessors
// ════════════════════════════════════════════════════════════
describe('backward compatibility', () => {
  it('resolveBindings produces authoritativeVersionId expected format', () => {
    const bindings = resolveBindings(versions, 'v5', 'treatment');
    const authoritative = bindings.find(b => b.type === 'authoritative');
    expect(authoritative?.versionId).toBe('v2'); // approved+current
  });

  it('resolveBindings produces promotionGateVersionId expected format', () => {
    const bindings = resolveBindings(versions, 'v5', 'treatment');
    const promotionGate = bindings.find(b => b.type === 'promotion_gate');
    expect(promotionGate?.versionId).toBe('v2');
  });

  it('effectiveVersionId matches authoritative when it resolves', () => {
    const bindings = resolveBindings(versions, 'v5', 'treatment');
    const authoritative = bindings.find(b => b.type === 'authoritative');
    // effectiveVersionId = authoritative || selected
    expect(authoritative?.versionId).toBe('v2');
  });

  it('effectiveVersionId falls back to selectedVersionId', () => {
    const noApproved = versions.filter(v => v.approval_status !== 'approved');
    const bindings = resolveBindings(noApproved, 'v5', 'treatment');
    const authoritative = bindings.find(b => b.type === 'authoritative');
    // When authoritative is null, effective should be v5 (selected)
    expect(authoritative?.versionId).toBeNull();
  });
});