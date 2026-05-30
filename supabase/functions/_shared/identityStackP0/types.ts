/**
 * identityStackP0/types.ts
 *
 * Type definitions for the Identity Stack P0 shadow-mode library.
 * All types for Identity Delta, IRS, Repair Plan, Projection Contracts,
 * and shadow telemetry.
 *
 * Phase 7.2A — No wiring into live orchestration yet.
 * Theme Δ skipped in P0 (requires LLM).
 * All computations $0 LLM, deterministic where possible.
 */

// ── Projection Contract Types ──────────────────────────────────────────────

export type DimensionObligation = "must" | "should" | "may" | "not";

export interface DimensionConfig {
  obligation: DimensionObligation;
  min_threshold: number; // 0-100
}

export interface ProjectionContract {
  id: string;
  projection_type: string;
  description: string;
  dimensions: {
    facts: DimensionConfig;
    payload: DimensionConfig;
    theme: DimensionConfig;
    shape: DimensionConfig;
  };
  irs_threshold: number; // 0-100
  ignores: string[]; // dimensions explicitly ignored
}

// ── Identity Delta Types ───────────────────────────────────────────────────

export interface ShapeDelta {
  available: boolean;
  scene_count: {
    expected: number | null;
    observed: number | null;
    delta: number | null; // absolute difference
  };
  act_distribution: Array<{
    act: number;
    expected_pct: number | null;
    observed_pct: number | null;
  }>;
  compression_ratio: {
    expected: number | null;
    observed: number | null;
  };
  trajectory_match: boolean | null;
  key_positions_found: string[];
  sps: number | null; // Shape Preservation Score 0-100
}

export interface FactsDelta {
  available: boolean;
  characters_present: string[];
  characters_missing: string[];
  characters_added: string[];
  fact_fidelity: number | null; // 0-100
}

export interface PayloadDelta {
  available: boolean;
  function_distribution: Record<string, { expected: number; observed: number }>;
  prs: number | null; // Payload Retention Score 0-100
}

export interface ThemeDelta {
  available: false; // Always false in P0
  reason: string;
}

export interface IdentityDelta {
  facts_delta: FactsDelta;
  payload_delta: PayloadDelta;
  theme_delta: ThemeDelta;
  shape_delta: ShapeDelta;
  computed_at: string; // ISO timestamp
  warnings: string[];
}

// ── IRS Types ──────────────────────────────────────────────────────────────

export type IRSGrading = "convergent" | "acceptable" | "divergent" | "critical" | "unmeasurable";

export interface IRSResult {
  score: number | null;
  graded_as: IRSGrading;
  dimension_scores: {
    facts: number | null;
    payload: number | null;
    shape: number | null;
  };
  threshold: number;
  contract_id: string | null;
  warnings: string[];
}

// ── Repair Plan Types ───────────────────────────────────────────────────────

export type RepairOperationId =
  | "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7"
  | "P1" | "P2" | "P3" | "P4" | "P5" | "P6"
  | "T1" | "T2" | "T3" | "T4"
  | "S1" | "S2" | "S3" | "S4" | "S5";

export interface RepairOperation {
  operation_id: RepairOperationId;
  dimension: "facts" | "payload" | "theme" | "shape";
  severity: "critical" | "high" | "medium" | "low";
  target: string;
  reason: string;
  expected_identity_gain: number; // 0-100 estimated points
  prerequisites: string[]; // Operation IDs that must be completed first
  status: "proposed";
}

export interface RepairPlan {
  available: boolean;
  operations: RepairOperation[];
  effort: number; // 0-100 estimated total effort
  completeness: "partial" | "full";
  warnings: string[];
}

// ── Validation Result Types ────────────────────────────────────────────────

export interface DimensionValidationResult {
  dimension: string;
  obligation: DimensionObligation;
  score: number | null;
  verdict: "pass" | "warn" | "fail" | "unmeasurable";
}

export interface ValidationResult {
  contract_id: string;
  dimensions: DimensionValidationResult[];
  irs: number | null;
  irs_threshold: number;
  overall_verdict: "pass" | "warn" | "fail" | "unmeasurable";
}

// ── Convergence Comparison Types ───────────────────────────────────────────

export interface ConvergenceComparison {
  old_converged: boolean;
  identity_converged: boolean;
  agreement: string;
  divergence_type: string | null;
  irs: number | null;
  remaining_steps: number;
}

// ── Shadow Telemetry Top-Level ─────────────────────────────────────────────

export interface IdentityStackShadowTelemetry {
  identity_delta: IdentityDelta | null;
  irs: IRSResult | null;
  repair_plan: RepairPlan | null;
  validation: ValidationResult | null;
  convergence: ConvergenceComparison | null;
  metadata: {
    version: 1;
    compute_ms: number;
    available: boolean;
    cip_available: boolean;
    dab_available: boolean;
  };
}
