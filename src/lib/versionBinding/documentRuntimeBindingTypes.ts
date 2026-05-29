// ── DocumentRuntimeBinding Types ──
// Canonical type definitions for the Centralized Runtime Binding Resolver.
// Zero dependencies. Pure TS. Schema-less (all in-memory).

export type BindingType = 'authoritative' | 'promotion_gate' | 'render' | 'pipeline';

export interface RuntimeBinding {
  type: BindingType;
  versionId: string | null;
  source: BindingSource;
  boundAt: number;
  docType: string | null;
}

export type BindingSource =
  | 'approved_and_current'        // strict invariant match
  | 'newest_approved'             // fallback by created_at
  | 'best_version_number'         // highest version_number among approved
  | 'user_selected'               // explicitly picked by user
  | 'auto_select_latest'          // default when nothing is selected
  | 'pending'                     // not yet resolved
  | 'error'                       // resolution failed
  | 'unavailable';                // no versions exist

export interface BindingResult {
  binding: RuntimeBinding;
  eligible: boolean;
  invariants: InvariantCheck[];
}

export interface InvariantCheck {
  invariantId: number;
  name: string;
  passed: boolean;
  detail: string | null;
}

export interface BindingContext {
  operation: 'promote' | 'gate_analysis' | 'notes_fetch' | 'render_init' | 'pipeline_trigger' | 'set_current';
  targetDocType: string;
  projectId: string;
  jobId?: string;
  /** Can be a binding type name string (e.g. 'authoritative', 'render') or a resolved RuntimeBinding object */
  sourceBinding?: RuntimeBinding | string | null;
  targetVersionId?: string;
  targetAction?: string;
}