/**
 * identityStackP0/irs.ts
 *
 * Identity Restoration Score calculation.
 *
 * Implements Phase 5.4 Model D — Constraint Model:
 * - Facts gate everything (if Fact Fidelity < 70, IRS dominated by facts)
 * - Shape is next (if SPS < 70, SPS dominated)
 * - Payload is third
 * - Theme is skipped in P0 (returns null)
 *
 * Respects projection contract: ignores dimensions with "not" obligation.
 * Always returns a result — never throws.
 */

import type { IdentityDelta, IRSResult, IRSGrading, ProjectionContract } from "./types.ts";

/**
 * Compute Identity Restoration Score from Identity Delta.
 *
 * @param delta - Identity Delta from computeIdentityDelta()
 * @param contract - ProjectionContract for this projection type (or null)
 * @returns IRSResult — never null, always returns graded result
 */
export function computeIRS(
  delta: IdentityDelta | null | undefined,
  contract: ProjectionContract | null | undefined,
): IRSResult {
  const warnings: string[] = [];

  if (!delta) {
    return {
      score: null,
      graded_as: "unmeasurable",
      dimension_scores: { facts: null, payload: null, shape: null },
      threshold: contract?.irs_threshold ?? 80,
      contract_id: contract?.id ?? null,
      warnings: ["Identity Delta not available"],
    };
  }

  // Gather available dimension scores
  const factScore = delta.facts_delta?.available
    ? delta.facts_delta.fact_fidelity
    : null;
  const shapeScore = delta.shape_delta?.available
    ? delta.shape_delta.sps
    : null;
  const payloadScore = delta.payload_delta?.available
    ? delta.payload_delta.prs
    : null;

  // Apply contract scope: ignore dimensions with "not" obligation
  const ignoreFacts = contract?.dimensions?.facts?.obligation === "not";
  const ignorePayload = contract?.dimensions?.payload?.obligation === "not";
  const ignoreShape = contract?.dimensions?.shape?.obligation === "not";

  const effectiveFactScore = ignoreFacts ? null : factScore;
  const effectivePayloadScore = ignorePayload ? null : payloadScore;
  const effectiveShapeScore = ignoreShape ? null : shapeScore;

  if (ignoreFacts) warnings.push("Facts dimension ignored per contract");
  if (ignorePayload) warnings.push("Payload dimension ignored per contract");
  if (ignoreShape) warnings.push("Shape dimension ignored per contract");

  // Warnings for missing dimensions
  if (!delta.facts_delta?.available && !ignoreFacts) {
    warnings.push("Facts delta not available");
  }
  if (!delta.payload_delta?.available && !ignorePayload) {
    warnings.push("Payload delta not available (DAB/Scene Architecture needed)");
  }
  if (!delta.shape_delta?.available && !ignoreShape) {
    warnings.push("Shape delta not available");
  }

  // Model D — Constraint Model
  const f = effectiveFactScore ?? 100; // Default to 100 if not applicable
  const s = effectiveShapeScore ?? 100;
  const p = effectivePayloadScore ?? 100;

  let irs: number | null = null;

  if (effectiveFactScore !== null && effectiveFactScore < 70) {
    // Facts gate: IRS dominated by facts
    irs = Math.round(f * 0.7 + s * 0.3);
  } else if (effectiveShapeScore !== null && effectiveShapeScore < 70) {
    // Shape gate
    irs = Math.round(s * 0.6 + f * 0.3 + p * 0.1);
  } else if (effectivePayloadScore !== null && effectivePayloadScore < 70) {
    // Payload gate
    irs = Math.round(p * 0.5 + f * 0.3 + s * 0.2);
  } else {
    // Weighted average (all dimensions above thresholds or not available)
    const totalWeight = (effectiveFactScore !== null ? 35 : 0)
      + (effectivePayloadScore !== null ? 25 : 0)
      + (effectiveShapeScore !== null ? 25 : 0);
    if (totalWeight > 0) {
      irs = Math.round(
        ((effectiveFactScore ?? 0) * 35
          + (effectivePayloadScore ?? 0) * 25
          + (effectiveShapeScore ?? 0) * 25) / totalWeight
      );
    }
  }

  // Grading
  const threshold = contract?.irs_threshold ?? 80;
  let gradedAs: IRSGrading = "unmeasurable";
  if (irs !== null) {
    if (irs >= threshold) gradedAs = "convergent";
    else if (irs >= threshold - 15) gradedAs = "acceptable";
    else if (irs >= threshold - 35) gradedAs = "divergent";
    else gradedAs = "critical";
  }

  return {
    score: irs,
    graded_as: gradedAs,
    dimension_scores: {
      facts: effectiveFactScore,
      payload: effectivePayloadScore,
      shape: effectiveShapeScore,
    },
    threshold,
    contract_id: contract?.id ?? null,
    warnings,
  };
}
