// ── Invariant Guard for Runtime Bindings ──
// Called BEFORE any consumer uses a binding for a side-effect operation.
// Returns eligibility verdict + ALL violations (not short-circuited) for debugging.

import type { RuntimeBinding, InvariantCheck, BindingContext } from './documentRuntimeBindingTypes';

export interface EligibilityResult {
  eligible: boolean;
  violations: { invariantId: number; message: string }[];
}

const INVARIANT_NAMES: Record<number, string> = {
  1: 'UI_AUTHORITY_OVERRIDE',
  2: 'GATE_VERSION_REBIND',
  3: 'POLLER_AUTHORITY_DRIFT',
  4: 'RENDER_SWITCH_DURING_PROMOTE',
  5: 'BOUND_UNRESOLVED',
  6: 'RENDER_TRIGGERED_PIPELINE',
  7: 'INSUFFICIENT_CONTENT',
  8: 'CROSS_DOC_TYPE_BINDING_LEAK',
  9: 'IMPLICIT_MUTATION',
  10: 'TERMINAL_VALIDATION_ERROR',
};

/**
 * Assert that a runtime binding operation is eligible given current bindings and context.
 * Returns ALL violations for debugging (not short-circuited).
 */
export function assertRuntimeBindingEligible(
  binding: RuntimeBinding | null,
  context: Partial<BindingContext>,
): EligibilityResult {
  const violations: { invariantId: number; message: string }[] = [];
  const allBindings: RuntimeBinding[] = (context as any)._allBindings || [];

  // Invariant 1: UI cannot choose authoritative version locally
  if (context.operation === 'set_current' && context.sourceBinding === 'authoritative') {
    // Guard: set_current is the SOLE valid write path for authoritative version changes.
    // If the UI tries to change authoritative without going through the resolver, block it.
    // This is enforced by requiring the binding to come from the resolver.
    if (binding?.type !== 'authoritative') {
      violations.push({
        invariantId: 1,
        message: `UI_AUTHORITY_OVERRIDE — authoritative binding must use resolver, not local state`,
      });
    }
  }

  // Invariant 2: Promotion gate cannot rebind versions (no selectedVersionId fallthrough)
  if (context.operation === 'gate_analysis' && context.sourceBinding === 'promotion_gate') {
    if (!binding || binding.source === 'user_selected') {
      violations.push({
        invariantId: 2,
        message: `GATE_VERSION_REBIND — promotion_gate binding must use resolver, never selectedVersionId fallthrough`,
      });
    }
  }

  // Invariant 3: Background poller cannot change authoritative version
  // (authoritative binding only changes on explicit approval+current mutation)
  // This is a design-time invariant enforced by the resolver pattern itself.

  // Invariant 4: Promote-to-script cannot scan/switch versions on render
  if (context.operation === 'promote') {
    if (binding?.type === 'render') {
      violations.push({
        invariantId: 4,
        message: `RENDER_SWITCH_DURING_PROMOTE — render binding cannot be re-resolved mid-promote`,
      });
    }
  }

  // Invariant 5: Feature script writer cannot start without valid bound source and target
  if (context.operation === 'render_init' || context.operation === 'pipeline_trigger') {
    const renderBinding = allBindings.find(b => b.type === 'render');
    const pipelineBinding = allBindings.find(b => b.type === 'pipeline');
    if (!renderBinding?.versionId || !pipelineBinding?.versionId) {
      violations.push({
        invariantId: 5,
        message: `BOUND_UNRESOLVED — both render (source) and pipeline (target) must resolve to non-null versionIds`,
      });
    }
  }

  // Invariant 6: dev-engine-v2 cannot fire from render/remount/query success
  if (context.operation === 'pipeline_trigger' && context.sourceBinding === 'render') {
    violations.push({
      invariantId: 6,
      message: `RENDER_TRIGGERED_PIPELINE — render binding changes must not trigger pipeline operations; only explicit user action can`,
    });
  }

  // Invariant 7: Missing/short content must become visible blocker
  if (context.operation === 'render_init') {
    if (binding?.versionId && context.targetAction === 'render_with_empty_content') {
      violations.push({
        invariantId: 7,
        message: `INSUFFICIENT_CONTENT — render binding resolves but content is empty/null; caller must show blocker UI, not retry`,
      });
    }
  }

  // Invariant 8: Every doc_type has isolated binding state
  if (context.targetDocType && binding && binding.docType && binding.docType !== context.targetDocType) {
    violations.push({
      invariantId: 8,
      message: `CROSS_DOC_TYPE_BINDING_LEAK — binding docType "${binding.docType}" does not match target docType "${context.targetDocType}"`,
    });
  }

  // Invariant 9: Every mutation requires explicit source binding + target action
  if (context.operation === 'promote' || context.operation === 'set_current') {
    if (!context.sourceBinding) {
      violations.push({
        invariantId: 9,
        message: `IMPLICIT_MUTATION — operation "${context.operation}" must carry { sourceBinding, targetAction } in the context`,
      });
    }
  }

  // Invariant 10: 400/404/406 errors are terminal — fail closed
  // This is a runtime policy enforced at the call site, not detectable here.

  // Log violations
  for (const v of violations) {
    console.info(`[ui][IEL] runtime_binding_violation { invariant_id: ${v.invariantId}, name: "${INVARIANT_NAMES[v.invariantId] || 'UNKNOWN'}", message: "${v.message}", operation: "${context.operation}" }`);
  }

  return {
    eligible: violations.length === 0,
    violations,
  };
}