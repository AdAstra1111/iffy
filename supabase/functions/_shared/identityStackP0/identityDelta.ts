/**
 * identityStackP0/identityDelta.ts
 *
 * Identity Delta orchestrator.
 * Calls each dimension-specific computation and assembles
 * the complete IdentityDelta object.
 *
 * Phase 7.2A — Theme Δ always returns { available: false }.
 * All sub-computations are fail-soft (never throw).
 */

import type { StoredCIP } from "../ncpTypes.ts";
import type {
  IdentityDelta,
  ShapeDelta,
  FactsDelta,
  PayloadDelta,
  ThemeDelta,
} from "./types.ts";
import { computeShapeDelta } from "./shapeDelta.ts";
import { computeFactsDelta } from "./factsDelta.ts";
import { computePayloadDelta } from "./payloadDelta.ts";

/**
 * Compute Identity Delta from available data.
 * All dimensions are computed independently and fail-soft.
 * Never throws — returns partial delta if inputs are insufficient.
 *
 * @param documentText - Plaintext of the projection output
 * @param cip - Canon Identity Profile (or null)
 * @param dabOrScenes - Optional DAB movements or Scene Architecture slots (for Payload Δ)
 * @returns IdentityDelta — never null, always available
 */
export function computeIdentityDelta(
  documentText: string | null | undefined,
  cip: StoredCIP | null | undefined,
  dabOrScenes?: Array<{ function_type?: string; function?: string }> | null,
): IdentityDelta {
  const warnings: string[] = [];

  // Shape Δ — always computable from document text
  const shapeDelta: ShapeDelta = computeShapeDelta(documentText, cip);
  if (!shapeDelta.available) {
    warnings.push("Shape delta not available — insufficient document text");
  }

  // Facts Δ — computable from document text + CIP
  const factsDelta: FactsDelta = computeFactsDelta(documentText, cip);
  if (!factsDelta.available) {
    warnings.push("Facts delta not available — insufficient document text");
  }

  // Payload Δ — requires structured scene data
  const payloadDelta: PayloadDelta = computePayloadDelta(dabOrScenes ?? [], cip);
  if (!payloadDelta.available) {
    warnings.push("Payload delta not available — no DAB/Scene Architecture data");
  }

  // Theme Δ — skipped in P0
  const themeDelta: ThemeDelta = {
    available: false as const,
    reason: "Theme Δ requires LLM — skipped in Phase 7.2A P0",
  };

  return {
    facts_delta: factsDelta,
    payload_delta: payloadDelta,
    theme_delta: themeDelta,
    shape_delta: shapeDelta,
    computed_at: new Date().toISOString(),
    warnings,
  };
}
