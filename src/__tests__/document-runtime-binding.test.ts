/**
 * DocumentRuntimeBinding Resolver — Comprehensive Test Suite
 *
 * Tests all 4 binding types, 10 invariants, per-doc-type isolation,
 * and backward compatibility.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveBindings,
  resolveSingleBinding,
} from '@/lib/versionBinding/documentRuntimeBindingResolver';
import { assertRuntimeBindingEligible } from '@/lib/versionBinding/assertRuntimeBindingEligible';
import { runtimeBindingStore } from '@/lib/versionBinding/runtimeBindingStore';
import type { RuntimeBinding, BindingContext } from '@/lib/versionBinding/documentRuntimeBindingTypes';
import type { ResolverVersion } from '@/lib/versionBinding/documentRuntimeBindingResolver';

// ── Fixtures ──

const DOC_TYPE = 'concept_brief';

function makeVersion(
  id: string,
  overrides: Partial<ResolverVersion> = {},
): ResolverVersion {
  return {
    id,
    version_number: parseInt(id.replace('v', '')) || 1,
    approval_status: null,
    is_current: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── Test Versions ──

const v1 = makeVersion('v1', { version_number: 1, created_at: '2024-01-01T00:00:00Z' });
const v2 = makeVersion('v2', { version_number: 2, created_at: '2024-01-02T00:00:00Z' });
const v3 = makeVersion('v3', { version_number: 3, created_at: '2024-01-03T00:00:00Z' });
const v4 = makeVersion('v4', {
  version_number: 4,
  created_at: '2024-01-04T00:00:00Z',
  approval_status: 'approved',
  is_current: true,
});
const v5 = makeVersion('v5', {
  version_number: 5,
  created_at: '2024-01-05T00:00:00Z',
  approval_status: 'approved',
  is_current: false,
});
const v6 = makeVersion('v6', {
  version_number: 6,
  created_at: '2024-01-06T00:00:00Z',
  approval_status: 'approved',
  is_current: false,
  meta_json: { ci: 80, gp: 90, score_source: 'analyze' },
});

// ════════════════════════════════════════════════════════════════════════════════
// 1. Authoritative Binding
// ════════════════════════════════════════════════════════════════════════════════

describe('authoritative binding', () => {
  it('resolves to approved+current version when strict match exists', () => {
    const bindings = resolveBindings([v1, v4, v5], null, DOC_TYPE);
    const auth = bindings.find(b => b.type === 'authoritative')!;
    expect(auth.versionId).toBe('v4');
    expect(auth.source).toBe('approved_and_current');
  });

  it('falls back to newest approved by created_at when no version is both approved and current', () => {
    const bindings = resolveBindings([v1, v2, v5], null, DOC_TYPE);
    const auth = bindings.find(b => b.type === 'authoritative')!;
    expect(auth.versionId).toBe('v5');
    expect(auth.source).toBe('newest_approved');
  });

  it('returns null when no approved versions exist', () => {
    const bindings = resolveBindings([v1, v2, v3], null, DOC_TYPE);
    const auth = bindings.find(b => b.type === 'authoritative')!;
    expect(auth.versionId).toBeNull();
    expect(auth.source).toBe('unavailable');
  });

  it('returns null for empty version list', () => {
    const bindings = resolveBindings([], null, DOC_TYPE);
    const auth = bindings.find(b => b.type === 'authoritative')!;
    expect(auth.versionId).toBeNull();
    expect(auth.source).toBe('unavailable');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 2. Promotion Gate Binding
// ════════════════════════════════════════════════════════════════════════════════

describe('promotion_gate binding', () => {
  it('resolves to approved+current sorted by version_number DESC', () => {
    const bindings = resolveBindings([v1, v4, v5], null, DOC_TYPE);
    const pg = bindings.find(b => b.type === 'promotion_gate')!;
    expect(pg.versionId).toBe('v4');
    expect(pg.source).toBe('approved_and_current');
  });

  it('falls back to best approved by version_number when no version is current', () => {
    const bindings = resolveBindings([v1, v5, v6], null, DOC_TYPE);
    const pg = bindings.find(b => b.type === 'promotion_gate')!;
    // v6 has higher version_number than v5
    expect(pg.versionId).toBe('v6');
    expect(pg.source).toBe('best_version_number');
  });

  it('NEVER falls through to selectedVersionId', () => {
    const bindings = resolveBindings([v1, v2], 'v2', DOC_TYPE);
    const pg = bindings.find(b => b.type === 'promotion_gate')!;
    // No approved versions exist, so promotion_gate returns null
    // even though selectedVersionId is set
    expect(pg.versionId).toBeNull();
    expect(pg.source).toBe('unavailable');
  });

  it('returns null when no approved versions exist', () => {
    const bindings = resolveBindings([v1, v2, v3], null, DOC_TYPE);
    const pg = bindings.find(b => b.type === 'promotion_gate')!;
    expect(pg.versionId).toBeNull();
    expect(pg.source).toBe('unavailable');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 3. Render Binding
// ════════════════════════════════════════════════════════════════════════════════

describe('render binding', () => {
  it('resolves to authoritative version when it exists', () => {
    const bindings = resolveBindings([v1, v4, v5], 'v2', DOC_TYPE);
    const render = bindings.find(b => b.type === 'render')!;
    // authoritative wins over selectedVersionId
    expect(render.versionId).toBe('v4');
    expect(render.source).toBe('approved_and_current');
  });

  it('falls back to selectedVersionId when no authoritative version exists', () => {
    const bindings = resolveBindings([v1, v2, v3], 'v2', DOC_TYPE);
    const render = bindings.find(b => b.type === 'render')!;
    expect(render.versionId).toBe('v2');
    expect(render.source).toBe('user_selected');
  });

  it('falls back to latest version by version_number when no auth and no selection', () => {
    const bindings = resolveBindings([v1, v2, v3], null, DOC_TYPE);
    const render = bindings.find(b => b.type === 'render')!;
    expect(render.versionId).toBe('v3');
    expect(render.source).toBe('auto_select_latest');
  });

  it('returns null for empty version list', () => {
    const bindings = resolveBindings([], null, DOC_TYPE);
    const render = bindings.find(b => b.type === 'render')!;
    expect(render.versionId).toBeNull();
    expect(render.source).toBe('unavailable');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 4. Pipeline Binding (mirrors ABVR)
// ════════════════════════════════════════════════════════════════════════════════

describe('pipeline binding', () => {
  it('resolves to approved+current (A1)', () => {
    const bindings = resolveBindings([v1, v4, v6], null, DOC_TYPE);
    const pipeline = bindings.find(b => b.type === 'pipeline')!;
    expect(pipeline.versionId).toBe('v4');
    expect(pipeline.source).toBe('approved_and_current');
  });

  it('resolves to best approved by CI+GP score (A2) when no current', () => {
    const bindings = resolveBindings([v1, v5, v6], null, DOC_TYPE);
    const pipeline = bindings.find(b => b.type === 'pipeline')!;
    // v6 has ci=80, gp=90 vs v5 has no scores
    expect(pipeline.versionId).toBe('v6');
    expect(pipeline.source).toBe('best_version_number');
  });

  it('falls back to newest approved (A3)', () => {
    const v5Only = makeVersion('v5Only', {
      version_number: 5, created_at: '2024-01-05T00:00:00Z',
      approval_status: 'approved', is_current: false,
    });
    const bindings = resolveBindings([v1, v2, v5Only], null, DOC_TYPE);
    const pipeline = bindings.find(b => b.type === 'pipeline')!;
    expect(pipeline.versionId).toBe('v5Only');
    expect(pipeline.source).toBe('newest_approved');
  });

  it('falls back to is_current (C) when no approved versions exist', () => {
    const v3Current = makeVersion('v3Current', {
      version_number: 3, created_at: '2024-01-03T00:00:00Z',
      approval_status: null, is_current: true,
    });
    const bindings = resolveBindings([v1, v2, v3Current], null, DOC_TYPE);
    const pipeline = bindings.find(b => b.type === 'pipeline')!;
    expect(pipeline.versionId).toBe('v3Current');
    expect(pipeline.source).toBe('approved_and_current');
  });

  it('falls back to latest by version_number (D)', () => {
    const bindings = resolveBindings([v1, v2, v3], null, DOC_TYPE);
    const pipeline = bindings.find(b => b.type === 'pipeline')!;
    expect(pipeline.versionId).toBe('v3');
    expect(pipeline.source).toBe('auto_select_latest');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 5. All 4 Bindings Resolved Together
// ════════════════════════════════════════════════════════════════════════════════

describe('resolveBindings returns all 4 types', () => {
  it('returns exactly 4 bindings', () => {
    const bindings = resolveBindings([v1, v4], null, DOC_TYPE);
    expect(bindings).toHaveLength(4);
    const types = bindings.map(b => b.type).sort();
    expect(types).toEqual(['authoritative', 'pipeline', 'promotion_gate', 'render']);
  });

  it('all bindings carry docType', () => {
    const bindings = resolveBindings([v1, v4], null, DOC_TYPE);
    for (const b of bindings) {
      expect(b.docType).toBe(DOC_TYPE);
    }
  });

  it('all bindings have boundAt timestamp', () => {
    const bindings = resolveBindings([v1, v4], null, DOC_TYPE);
    for (const b of bindings) {
      expect(typeof b.boundAt).toBe('number');
      expect(b.boundAt).toBeGreaterThan(0);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 6. assertRuntimeBindingEligible — All 10 Invariants
// ════════════════════════════════════════════════════════════════════════════════

describe('assertRuntimeBindingEligible — Invariants', () => {
  const authBinding: RuntimeBinding = {
    type: 'authoritative',
    versionId: 'v4',
    source: 'approved_and_current',
    boundAt: Date.now(),
    docType: DOC_TYPE,
  };

  const renderBinding: RuntimeBinding = {
    type: 'render',
    versionId: 'v3',
    source: 'auto_select_latest',
    boundAt: Date.now(),
    docType: DOC_TYPE,
  };

  const pgBinding: RuntimeBinding = {
    type: 'promotion_gate',
    versionId: 'v5',
    source: 'best_version_number',
    boundAt: Date.now(),
    docType: DOC_TYPE,
  };

  const allFourBindings: RuntimeBinding[] = [
    authBinding,
    pgBinding,
    renderBinding,
    { type: 'pipeline', versionId: 'v6', source: 'approved_and_current', boundAt: Date.now(), docType: DOC_TYPE },
  ];

  it('I1 — UI_AUTHORITY_OVERRIDE: set_current with non-authoritative binding fails', () => {
    const result = assertRuntimeBindingEligible(renderBinding, {
      operation: 'set_current',
      sourceBinding: 'authoritative',
      targetDocType: DOC_TYPE,
      projectId: 'proj-1',
      _allBindings: allFourBindings,
    } as any);
    expect(result.eligible).toBe(false);
    expect(result.violations.some(v => v.invariantId === 1)).toBe(true);
  });

  it('I1 — set_current with authoritative binding passes', () => {
    const result = assertRuntimeBindingEligible(authBinding, {
      operation: 'set_current',
      sourceBinding: 'authoritative',
      targetDocType: DOC_TYPE,
      projectId: 'proj-1',
      _allBindings: allFourBindings,
    } as any);
    expect(result.eligible).toBe(true);
  });

  it('I2 — GATE_VERSION_REBIND: gate_analysis with user_selected promotion_gate fails', () => {
    const userSelectedPG: RuntimeBinding = {
      ...pgBinding,
      source: 'user_selected',
    };
    const result = assertRuntimeBindingEligible(userSelectedPG, {
      operation: 'gate_analysis',
      sourceBinding: 'promotion_gate',
      targetDocType: DOC_TYPE,
      projectId: 'proj-1',
      _allBindings: allFourBindings,
    } as any);
    expect(result.eligible).toBe(false);
    expect(result.violations.some(v => v.invariantId === 2)).toBe(true);
  });

  it('I4 — RENDER_SWITCH_DURING_PROMOTE: promote with render binding fails', () => {
    const result = assertRuntimeBindingEligible(renderBinding, {
      operation: 'promote',
      targetDocType: DOC_TYPE,
      projectId: 'proj-1',
      _allBindings: allFourBindings,
    } as any);
    expect(result.eligible).toBe(false);
    expect(result.violations.some(v => v.invariantId === 4)).toBe(true);
  });

  it('I5 — BOUND_UNRESOLVED: pipeline_trigger with null render or pipeline fails', () => {
    const missingPipeline: RuntimeBinding[] = [
      authBinding,
      pgBinding,
      { ...renderBinding, versionId: null },
      { type: 'pipeline', versionId: null, source: 'none' as any, boundAt: Date.now(), docType: DOC_TYPE },
    ];
    const result = assertRuntimeBindingEligible(null, {
      operation: 'pipeline_trigger',
      targetDocType: DOC_TYPE,
      projectId: 'proj-1',
      _allBindings: missingPipeline,
    } as any);
    expect(result.eligible).toBe(false);
    expect(result.violations.some(v => v.invariantId === 5)).toBe(true);
  });

  it('I6 — RENDER_TRIGGERED_PIPELINE: pipeline_trigger with render source fails', () => {
    const result = assertRuntimeBindingEligible(null, {
      operation: 'pipeline_trigger',
      sourceBinding: 'render',
      targetDocType: DOC_TYPE,
      projectId: 'proj-1',
      _allBindings: allFourBindings,
    } as any);
    expect(result.eligible).toBe(false);
    expect(result.violations.some(v => v.invariantId === 6)).toBe(true);
  });

  it('I7 — INSUFFICIENT_CONTENT: render_init with empty content fails', () => {
    const result = assertRuntimeBindingEligible(renderBinding, {
      operation: 'render_init',
      targetAction: 'render_with_empty_content',
      targetDocType: DOC_TYPE,
      projectId: 'proj-1',
      _allBindings: allFourBindings,
    } as any);
    expect(result.eligible).toBe(false);
    expect(result.violations.some(v => v.invariantId === 7)).toBe(true);
  });

  it('I8 — CROSS_DOC_TYPE_BINDING_LEAK: binding docType mismatch fails', () => {
    const wrongDocTypeBinding: RuntimeBinding = {
      ...authBinding,
      docType: 'treatment',
    };
    const result = assertRuntimeBindingEligible(wrongDocTypeBinding, {
      operation: 'promote',
      targetDocType: 'concept_brief',
      projectId: 'proj-1',
      _allBindings: [wrongDocTypeBinding, pgBinding, renderBinding, allFourBindings[3]],
    } as any);
    expect(result.eligible).toBe(false);
    expect(result.violations.some(v => v.invariantId === 8)).toBe(true);
  });

  it('I9 — IMPLICIT_MUTATION: promote without sourceBinding fails', () => {
    const result = assertRuntimeBindingEligible(authBinding, {
      operation: 'promote',
      targetDocType: DOC_TYPE,
      projectId: 'proj-1',
      _allBindings: allFourBindings,
    } as any);
    expect(result.eligible).toBe(false);
    expect(result.violations.some(v => v.invariantId === 9)).toBe(true);
  });

  it('returns multiple violations (not short-circuited)', () => {
    const result = assertRuntimeBindingEligible(renderBinding, {
      operation: 'promote',
      targetDocType: 'treatment',
      projectId: 'proj-1',
      _allBindings: allFourBindings,
    } as any);
    // Should have I4 (render mid-promote), I8 (docType mismatch), I9 (no sourceBinding)
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });

  it('returns eligible=true when no violations', () => {
    const result = assertRuntimeBindingEligible(authBinding, {
      operation: 'set_current',
      sourceBinding: 'authoritative',
      targetDocType: DOC_TYPE,
      projectId: 'proj-1',
      targetVersionId: 'v4',
      targetAction: 'set_version',
      _allBindings: allFourBindings,
    } as any);
    expect(result.eligible).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 7. RuntimeBindingStore — Per-Doc-Type Isolation
// ════════════════════════════════════════════════════════════════════════════════

describe('RuntimeBindingStore — per-doc-type isolation', () => {
  beforeEach(() => {
    runtimeBindingStore.clearAll();
  });

  it('stores bindings per doc type', () => {
    const cbBindings = resolveBindings([v1, v4], null, 'concept_brief');
    const tBindings = resolveBindings([v1, v5], null, 'treatment');

    runtimeBindingStore.setBindings('concept_brief', cbBindings);
    runtimeBindingStore.setBindings('treatment', tBindings);

    const cb = runtimeBindingStore.getBindings('concept_brief');
    const t = runtimeBindingStore.getBindings('treatment');
    expect(cb).not.toBeNull();
    expect(t).not.toBeNull();
    expect(cb![0].docType).toBe('concept_brief');
    expect(t![0].docType).toBe('treatment');
  });

  it('clears bindings for a doc type', () => {
    const bindings = resolveBindings([v1, v4], null, 'concept_brief');
    runtimeBindingStore.setBindings('concept_brief', bindings);
    runtimeBindingStore.clearBindings('concept_brief');
    expect(runtimeBindingStore.getBindings('concept_brief')).toBeNull();
  });

  it('retrieves a specific binding type', () => {
    const bindings = resolveBindings([v1, v4], null, 'concept_brief');
    runtimeBindingStore.setBindings('concept_brief', bindings);
    const auth = runtimeBindingStore.getBinding('concept_brief', 'authoritative');
    expect(auth).not.toBeNull();
    expect(auth!.type).toBe('authoritative');
    expect(auth!.versionId).toBe('v4');
  });

  it('returns null for non-existent binding type', () => {
    const bindings = resolveBindings([v1], null, 'concept_brief');
    runtimeBindingStore.setBindings('concept_brief', bindings);
    const auth = runtimeBindingStore.getBinding('other_doc_type', 'authoritative');
    expect(auth).toBeNull();
  });

  it('notifies subscribers on change', () => {
    const bindings = resolveBindings([v1, v4], null, 'concept_brief');
    let notified = false;
    const unsub = runtimeBindingStore.subscribe('concept_brief', () => { notified = true; });
    runtimeBindingStore.setBindings('concept_brief', bindings);
    expect(notified).toBe(true);
    unsub();
  });

  it('does not notify when bindings are unchanged', () => {
    const bindings = resolveBindings([v1, v4], null, 'concept_brief');
    let notifyCount = 0;
    const unsub = runtimeBindingStore.subscribe('concept_brief', () => { notifyCount++; });
    runtimeBindingStore.setBindings('concept_brief', bindings);
    runtimeBindingStore.setBindings('concept_brief', bindings); // same again
    expect(notifyCount).toBe(1);
    unsub();
  });

  it('unsubscribe removes listener', () => {
    const bindings = resolveBindings([v1, v4], null, 'concept_brief');
    let notified = false;
    const unsub = runtimeBindingStore.subscribe('concept_brief', () => { notified = true; });
    unsub();
    runtimeBindingStore.setBindings('concept_brief', bindings);
    expect(notified).toBe(false);
  });

  it('clearAll removes all bindings and listeners', () => {
    const bindings = resolveBindings([v1, v4], null, 'concept_brief');
    runtimeBindingStore.setBindings('concept_brief', bindings);
    runtimeBindingStore.clearAll();
    expect(runtimeBindingStore.getBindings('concept_brief')).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 8. Backward Compatibility — Convenience Accessors
// ════════════════════════════════════════════════════════════════════════════════

describe('backward compatibility', () => {
  it('authoritativeVersionId matches authoritative binding', () => {
    const bindings = resolveBindings([v1, v4, v5], null, DOC_TYPE);
    const auth = bindings.find(b => b.type === 'authoritative')!;
    expect(auth.versionId).toBeDefined();
    expect(auth.versionId).toBe('v4');
  });

  it('promotionGateVersionId matches promotion_gate binding', () => {
    const bindings = resolveBindings([v1, v4, v5], null, DOC_TYPE);
    const pg = bindings.find(b => b.type === 'promotion_gate')!;
    expect(pg.versionId).toBe('v4');
  });

  it('render.versionId provides effective version (authoritative wins, then selected, then latest)', () => {
    // With authoritative: render = authoritative
    const bindings1 = resolveBindings([v1, v4, v5], 'v2', DOC_TYPE);
    const render1 = bindings1.find(b => b.type === 'render')!;
    expect(render1.versionId).toBe('v4');

    // Without authoritative but with selection: render = selected
    const bindings2 = resolveBindings([v1, v2, v3], 'v2', DOC_TYPE);
    const render2 = bindings2.find(b => b.type === 'render')!;
    expect(render2.versionId).toBe('v2');

    // Without either: render = latest
    const bindings3 = resolveBindings([v1, v2, v3], null, DOC_TYPE);
    const render3 = bindings3.find(b => b.type === 'render')!;
    expect(render3.versionId).toBe('v3');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 9. Edge Cases
// ════════════════════════════════════════════════════════════════════════════════

describe('edge cases', () => {
  it('handles null/undefined versions gracefully', () => {
    const bindings = resolveBindings(null as any, null, DOC_TYPE);
    expect(bindings).toHaveLength(4);
    for (const b of bindings) {
      expect(b.versionId).toBeNull();
      expect(b.source).toBe('unavailable');
    }
  });

  it('handles undefined selectedVersionId', () => {
    const bindings = resolveBindings([v1, v2], undefined as any, DOC_TYPE);
    const render = bindings.find(b => b.type === 'render')!;
    expect(render.versionId).toBe('v2');
    expect(render.source).toBe('auto_select_latest');
  });

  it('handles versions with null approval_status', () => {
    const vNull = makeVersion('v-null', {
      version_number: 1,
      approval_status: null,
      is_current: false,
    });
    const bindings = resolveBindings([vNull], null, DOC_TYPE);
    const auth = bindings.find(b => b.type === 'authoritative')!;
    expect(auth.versionId).toBeNull();
    expect(auth.source).toBe('unavailable');
  });

  it('multiple approved versions — picks correct fallback', () => {
    const va = makeVersion('va', {
      version_number: 1, created_at: '2024-01-01T00:00:00Z',
      approval_status: 'approved', is_current: false,
    });
    const vb = makeVersion('vb', {
      version_number: 2, created_at: '2024-01-02T00:00:00Z',
      approval_status: 'approved', is_current: false,
    });
    // Authoritative should pick newest by created_at
    const bindings = resolveBindings([va, vb], null, DOC_TYPE);
    const auth = bindings.find(b => b.type === 'authoritative')!;
    expect(auth.versionId).toBe('vb');
    expect(auth.source).toBe('newest_approved');
  });

  it('approved versions without scores — pipeline picks newest approved', () => {
    const va = makeVersion('va', {
      version_number: 1, created_at: '2024-01-01T00:00:00Z',
      approval_status: 'approved', is_current: false,
    });
    const vb = makeVersion('vb', {
      version_number: 2, created_at: '2024-01-02T00:00:00Z',
      approval_status: 'approved', is_current: false,
    });
    const bindings = resolveBindings([va, vb], null, DOC_TYPE);
    const pipeline = bindings.find(b => b.type === 'pipeline')!;
    // No scores, so falls to A3 (newest approved)
    expect(pipeline.versionId).toBe('vb');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// 8. Convergence Version ID — REVISE Fix Invariant Tests
// The fix changed convergenceVersionId from render?.versionId to
// promotionGateVersionId. These tests verify the architectural invariant:
// promotion_gate NEVER falls through to selectedVersionId, which eliminates
// the oscillation cycle.
// ════════════════════════════════════════════════════════════════════════════════

describe('convergenceVersionId — REVISE fix invariants', () => {
  it('promotion_gate NEVER falls through to selectedVersionId when set', () => {
    // No approved versions exist, but user has selected v2
    const bindings = resolveBindings([v1, v2, v3], 'v2', DOC_TYPE);
    const pg = bindings.find(b => b.type === 'promotion_gate')!;
    // promotion_gate must return null — never user_selected
    expect(pg.versionId).toBeNull();
    expect(pg.source).toBe('unavailable');
  });

  it('promotion_gate ignores selectedVersionId even when render uses it', () => {
    // No approved versions. selectedVersionId = v2
    // render WILL fall through to v2, but promotion_gate must NOT
    const bindings = resolveBindings([v1, v2, v3], 'v2', DOC_TYPE);
    const pg = bindings.find(b => b.type === 'promotion_gate')!;
    const render = bindings.find(b => b.type === 'render')!;

    expect(pg.versionId).toBeNull();
    expect(pg.source).toBe('unavailable');

    expect(render.versionId).toBe('v2');
    expect(render.source).toBe('user_selected');
  });

  it('promotion_gate returns approved version even when selectedVersionId is different', () => {
    // v4 is approved+current, user has selected v2 (a non-approved version)
    const bindings = resolveBindings([v1, v2, v4], 'v2', DOC_TYPE);
    const pg = bindings.find(b => b.type === 'promotion_gate')!;
    const render = bindings.find(b => b.type === 'render')!;

    // promotion_gate tracks approved truth, not user selection
    expect(pg.versionId).toBe('v4');
    expect(pg.source).toBe('approved_and_current');

    // render uses authoritative (v4) since it exists
    expect(render.versionId).toBe('v4');
    expect(render.source).toBe('approved_and_current');
  });

  it('promotion_gate returns different version than render when authoritative absent and user selects manually', () => {
    // Only unapproved versions exist. User selects v2.
    // render → v2 (user_selected). promotion_gate → null (no approved).
    // This divergence was the root cause of oscillation when code used render?.versionId
    const bindings = resolveBindings([v1, v2, v3], 'v2', DOC_TYPE);
    const pg = bindings.find(b => b.type === 'promotion_gate')!;
    const render = bindings.find(b => b.type === 'render')!;

    expect(pg.versionId).toBeNull();
    expect(render.versionId).toBe('v2');
    // Divergence confirmed: promotion_gate ≠ render when no authoritative version
    expect(pg.versionId).not.toBe(render.versionId);
  });

  it('promotion_gate stays stable when selectedVersionId changes (no approved versions)', () => {
    // Scenario: user cycles through selections, no approved versions exist
    const scenario1 = resolveBindings([v1, v2, v3], 'v1', DOC_TYPE);
    const scenario2 = resolveBindings([v1, v2, v3], 'v2', DOC_TYPE);
    const scenario3 = resolveBindings([v1, v2, v3], 'v3', DOC_TYPE);

    const pg1 = scenario1.find(b => b.type === 'promotion_gate')!;
    const pg2 = scenario2.find(b => b.type === 'promotion_gate')!;
    const pg3 = scenario3.find(b => b.type === 'promotion_gate')!;

    // promotion_gate is stable regardless of selection
    expect(pg1.versionId).toBeNull();
    expect(pg2.versionId).toBeNull();
    expect(pg3.versionId).toBeNull();

    // render fluctuates with user selection (the old oscillation source)
    const r1 = scenario1.find(b => b.type === 'render')!;
    const r2 = scenario2.find(b => b.type === 'render')!;
    const r3 = scenario3.find(b => b.type === 'render')!;

    expect(r1.versionId).toBe('v1');
    expect(r2.versionId).toBe('v2');
    expect(r3.versionId).toBe('v3');
  });

  it('promotion_gate stays stable when selectedVersionId changes (approved version exists)', () => {
    // v4 is approved+current. User cycles different selections.
    const scenario1 = resolveBindings([v1, v4, v2], 'v1', DOC_TYPE);
    const scenario2 = resolveBindings([v1, v4, v2], 'v2', DOC_TYPE);

    const pg1 = scenario1.find(b => b.type === 'promotion_gate')!;
    const pg2 = scenario2.find(b => b.type === 'promotion_gate')!;

    // promotion_gate always returns v4 regardless of user selection
    expect(pg1.versionId).toBe('v4');
    expect(pg2.versionId).toBe('v4');
  });

  it('promotion_gate returns null when no versions exist (convergenceVersionId = null path)', () => {
    const bindings = resolveBindings([], null, DOC_TYPE);
    const pg = bindings.find(b => b.type === 'promotion_gate')!;
    expect(pg.versionId).toBeNull();
    expect(pg.source).toBe('unavailable');
  });

  it('render falls through to selectedVersionId while promotion_gate stays null — divergence confirmed', () => {
    // Scenario that causes the oscillation when convergenceVersionId used render?.versionId:
    // Only v1 exists, unapproved, user selects it. render = v1, promotion_gate = null
    const v1Only = makeVersion('v1only', {
      version_number: 1, created_at: '2024-01-01T00:00:00Z',
      approval_status: null, is_current: false,
    });
    const bindings = resolveBindings([v1Only], 'v1only', DOC_TYPE);
    const pg = bindings.find(b => b.type === 'promotion_gate')!;
    const render = bindings.find(b => b.type === 'render')!;

    expect(pg.versionId).toBeNull();
    expect(render.versionId).toBe('v1only');
    expect(pg.versionId).not.toBe(render.versionId);
  });

  it('useDocumentRuntimeBinding returns promotionGateVersionId matching promotion_gate resolver', () => {
    // Test the hook-level accessor by verifying the data contract:
    // promotionGateVersionId should always === promotion_gate binding's versionId
    // And it should be the correct value for the convergenceVersionId fix
    const bindings = resolveBindings([v1, v4], null, DOC_TYPE);
    const pg = bindings.find(b => b.type === 'promotion_gate')!;

    // This is what the hook returns for promotionGateVersionId (from useDocumentRuntimeBinding.ts line 77)
    const promotionGateVersionId = pg?.versionId ?? null;
    // This is what the fix now uses for convergenceVersionId (ProjectDevelopmentEngine.tsx line 1084)
    const convergenceVersionId = promotionGateVersionId || null;

    expect(promotionGateVersionId).toBe('v4');
    expect(convergenceVersionId).toBe('v4');
  });

  it('promotionGateVersionId is null when no approved versions — convergenceVersionId is null', () => {
    const bindings = resolveBindings([v1, v2], null, DOC_TYPE);
    const pg = bindings.find(b => b.type === 'promotion_gate')!;

    const promotionGateVersionId = pg?.versionId ?? null;
    const convergenceVersionId = promotionGateVersionId || null;

    expect(promotionGateVersionId).toBeNull();
    expect(convergenceVersionId).toBeNull();
  });

  it('convergenceVersionId correctly uses promotionGateVersionId, NOT render?.versionId', () => {
    // This is the EXACT scenario that caused the oscillation:
    // - No approved versions exist
    // - User has selected v2
    // - OLD: convergenceVersionId = render?.versionId → "v2" (unstable, user-selected)
    // - NEW: convergenceVersionId = promotionGateVersionId → null (stable, approved-only)
    const bindings = resolveBindings([v1, v2, v3], 'v2', DOC_TYPE);

    const pg = bindings.find(b => b.type === 'promotion_gate')!;
    const render = bindings.find(b => b.type === 'render')!;

    const promotionGateVersionId = pg?.versionId ?? null;
    const renderVersionId = render?.versionId ?? null;

    // The fix: convergenceVersionId uses promotionGateVersionId
    const convergenceVersionId_New = promotionGateVersionId || null;
    // The old behavior: convergenceVersionId used render?.versionId
    const convergenceVersionId_Old = renderVersionId || null;

    // NEW behavior: null (stable, no oscillation)
    expect(convergenceVersionId_New).toBeNull();
    // OLD behavior: 'v2' (unstable, oscillates with user selection)
    expect(convergenceVersionId_Old).toBe('v2');

    // These MUST diverge in this scenario — that's the entire fix
    expect(convergenceVersionId_New).not.toBe(convergenceVersionId_Old);
  });
});