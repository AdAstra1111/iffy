/**
 * identityStackP0/index.ts
 *
 * Public API for the Identity Stack P0 shadow-mode library.
 *
 * Exports the primary computation pipeline:
 * 1. getProjectionContract() / validateProjectionContract() — contract lookup
 * 2. computeIdentityDelta() — 4-dimension delta (Theme skipped in P0)
 * 3. computeIRS() — Identity Restoration Score
 * 4. generateRepairPlan() — deterministic repair operations
 *
 * ALL functions are imported locally AND re-exported.
 * ALL functions are fail-soft (never throw), deterministic where possible,
 * and require $0 LLM.
 *
 * NOT wired into live orchestration in Phase 7.2A.
 */

import { getProjectionContract } from "./projectionContracts.ts";
import { computeIdentityDelta } from "./identityDelta.ts";
import { computeIRS } from "./irs.ts";
import { generateRepairPlan } from "./repairPlan.ts";
import type { StoredCIP } from "../ncpTypes.ts";
import type { IdentityStackShadowTelemetry } from "./types.ts";

// Re-export everything
export { getProjectionContract, validateProjectionContract, listProjectionTypes, isDimensionIgnored, isDimensionInScope } from "./projectionContracts.ts";
export { computeIdentityDelta } from "./identityDelta.ts";
export { computeShapeDelta } from "./shapeDelta.ts";
export { computeFactsDelta } from "./factsDelta.ts";
export { computePayloadDelta } from "./payloadDelta.ts";
export { computeIRS } from "./irs.ts";
export { generateRepairPlan } from "./repairPlan.ts";

// Re-export types
export type {
  ShapeDelta,
  FactsDelta,
  PayloadDelta,
  ThemeDelta,
  IdentityDelta,
  IRSResult,
  IRSGrading,
  RepairPlan,
  RepairOperation,
  RepairOperationId,
  ProjectionContract,
  DimensionConfig,
  DimensionObligation,
  IdentityStackShadowTelemetry,
  DimensionValidationResult,
  ValidationResult,
  ConvergenceComparison,
} from "./types.ts";

/**
 * Run the full Identity Stack shadow computation.
 * Calls all sub-computations and returns complete shadow telemetry data.
 * Never throws — returns null if critical inputs are missing.
 */
export function computeIdentityStackShadow(
  documentText: string | null | undefined,
  projectionType: string | null | undefined,
  cip: StoredCIP | null | undefined,
  dabOrScenes?: Array<{ function_type?: string; function?: string }> | null,
): IdentityStackShadowTelemetry | null {
  const startTime = performance.now();

  if (!documentText || !projectionType) {
    return null;
  }

  const contract = getProjectionContract(projectionType);
  const delta = computeIdentityDelta(documentText, cip, dabOrScenes ?? null);
  const irs = computeIRS(delta, contract);
  const plan = generateRepairPlan(delta);

  const computeMs = Math.round(performance.now() - startTime);

  return {
    identity_delta: delta,
    irs,
    repair_plan: plan,
    validation: null, // Phase 7.2B
    convergence: null, // Phase 7.2B
    metadata: {
      version: 1,
      compute_ms: computeMs,
      available: true,
      cip_available: !!cip,
      dab_available: !!(dabOrScenes && dabOrScenes.length > 0),
    },
  };
}

// Also re-export StoredCIP type for convenience
export type { StoredCIP };
