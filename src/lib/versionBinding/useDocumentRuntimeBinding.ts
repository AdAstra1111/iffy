// ── useDocumentRuntimeBinding ──
// React hook that wires resolver, store, and invariant guard together.
// Replaces inline useMemo blocks in DevelopmentEngine.tsx (lines 843-864).

import { useMemo, useEffect } from 'react';
import type { RuntimeBinding, BindingType, BindingContext, BindingResult } from './documentRuntimeBindingTypes';
import type { ResolverVersion } from './documentRuntimeBindingResolver';
import { resolveBindings, resolveSingleBinding } from './documentRuntimeBindingResolver';
import { assertRuntimeBindingEligible } from './assertRuntimeBindingEligible';
import { runtimeBindingStore } from './runtimeBindingStore';

export interface DocumentRuntimeBindingResult {
  // All 4 resolved bindings
  authoritative: RuntimeBinding | null;
  promotionGate: RuntimeBinding | null;
  render: RuntimeBinding | null;
  pipeline: RuntimeBinding | null;

  // Convenience accessors (mirrors existing API for backward compat)
  authoritativeVersionId: string | null;
  promotionGateVersionId: string | null;
  effectiveVersionId: string | null;

  // Guard
  assertEligible: (
    operation: BindingContext['operation'],
    context?: Partial<BindingContext>,
  ) => BindingResult;

  // State
  isLoaded: boolean;
  error: string | null;
}

/**
 * React hook that resolves document runtime bindings.
 *
 * @param docType - The document type (e.g. "concept_brief", "treatment")
 * @param versions - Array of versions (from polled query)
 * @param selectedVersionId - Currently user-selected version ID
 * @returns All 4 bindings + convenience accessors + invariant guard
 */
export function useDocumentRuntimeBinding(
  docType: string | null,
  versions: ResolverVersion[],
  selectedVersionId: string | null,
): DocumentRuntimeBindingResult {
  // Resolve all 4 bindings — only recalculates when inputs change
  const resolvedBindings = useMemo<RuntimeBinding[]>(() => {
    if (!docType || !versions || versions.length === 0) {
      const empty: RuntimeBinding[] = [
        { type: 'authoritative', versionId: null, source: 'pending', boundAt: Date.now(), docType },
        { type: 'promotion_gate', versionId: null, source: 'pending', boundAt: Date.now(), docType },
        { type: 'render', versionId: null, source: 'pending', boundAt: Date.now(), docType },
        { type: 'pipeline', versionId: null, source: 'pending', boundAt: Date.now(), docType },
      ];
      return empty;
    }
    return resolveBindings(versions, selectedVersionId, docType);
  }, [docType, versions, selectedVersionId]);

  // Write to store whenever bindings resolve
  useEffect(() => {
    if (docType && resolvedBindings.length > 0) {
      runtimeBindingStore.setBindings(docType, resolvedBindings);
    }
  }, [docType, resolvedBindings]);

  // Extract individual bindings (stable refs unless values change)
  const authoritative = resolvedBindings.find(b => b.type === 'authoritative') || null;
  const promotionGate = resolvedBindings.find(b => b.type === 'promotion_gate') || null;
  const render = resolvedBindings.find(b => b.type === 'render') || null;
  const pipeline = resolvedBindings.find(b => b.type === 'pipeline') || null;

  // Convenience accessors (mirrors existing API)
  const authoritativeVersionId = authoritative?.versionId ?? null;
  const promotionGateVersionId = promotionGate?.versionId ?? null;
  const effectiveVersionId = authoritative?.versionId || selectedVersionId || null;

  // Invariant guard — bound to current bindings
  const assertEligible = (
    operation: BindingContext['operation'],
    context?: Partial<BindingContext>,
  ): BindingResult => {
    // Resolve source binding: context can pass either a type name string or a RuntimeBinding object
    const sourceBindingVal = context?.sourceBinding;
    const targetBinding = resolvedBindings.find(b => {
      if (typeof sourceBindingVal === 'string') {
        return b.type === sourceBindingVal;
      }
      if (sourceBindingVal && typeof sourceBindingVal === 'object' && 'type' in sourceBindingVal) {
        return b.type === (sourceBindingVal as RuntimeBinding).type;
      }
      return false;
    }) || null;

    const fullContext: Partial<BindingContext> = {
      ...context,
      operation,
      targetDocType: context?.targetDocType || docType || '',
      // Pass all bindings for invariant checks that need cross-binding knowledge
      _allBindings: resolvedBindings,
    } as any;

    const result = assertRuntimeBindingEligible(targetBinding, fullContext);

    return {
      binding: targetBinding || {
        type: 'authoritative',
        versionId: null,
        source: 'unavailable',
        boundAt: Date.now(),
        docType: docType || null,
      },
      eligible: result.eligible,
      invariants: result.violations.map(v => ({
        invariantId: v.invariantId,
        name: v.message.split(' — ')[0] || `INVARIANT_${v.invariantId}`,
        passed: false,
        detail: v.message,
      })),
    };
  };

  const isLoaded = docType !== null;
  const error = null;

  return {
    authoritative,
    promotionGate,
    render,
    pipeline,
    authoritativeVersionId,
    promotionGateVersionId,
    effectiveVersionId,
    assertEligible,
    isLoaded,
    error,
  };
}