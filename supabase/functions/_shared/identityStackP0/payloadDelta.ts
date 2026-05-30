/**
 * identityStackP0/payloadDelta.ts
 *
 * Payload Δ computation for Identity Delta P0.
 * 100% deterministic — reads existing Dramatic Architecture Blueprint
 * and NCP data if available.
 *
 * Compares function type distribution from DAB/Scene Architecture
 * against CIP primitives. Only computed when structured data is available.
 *
 * Phase 7.2A — tension curve and promise tracking skipped in P0
 * (requires NCP which may not be reliably available).
 */

import type { StoredCIP } from "../ncpTypes.ts";
import type { PayloadDelta } from "./types.ts";

/**
 * Scene function types used in DAB and Scene Architecture.
 */
export const SCENE_FUNCTION_TYPES = [
  "exposition",
  "conflict",
  "reveal",
  "aftermath",
  "transition",
  "set_piece",
  "character_moment",
  "confrontation",
  "negotiation",
  "discovery",
  "suspense",
  "reaction",
  "preparation",
  "montage",
  "inciting_event",
] as const;

export type SceneFunctionType = typeof SCENE_FUNCTION_TYPES[number];

/**
 * Reflection-related function types — scenes where characters process events.
 */
const REFLECTION_FUNCTIONS: Set<string> = new Set([
  "aftermath",
  "reaction",
  "character_moment",
]);

/**
 * Escalation-related function types — scenes where tension rises.
 */
const ESCALATION_FUNCTIONS: Set<string> = new Set([
  "conflict",
  "confrontation",
  "set_piece",
  "suspense",
]);

/**
 * Count scene function types from a scene array.
 * Handles both Scene Architecture slots and Scene Plan entries.
 */
function countFunctionTypes(
  scenes: Array<{ function_type?: string; function?: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const scene of scenes) {
    const type = scene.function_type || scene.function;
    if (type) {
      counts[type] = (counts[type] || 0) + 1;
    }
  }
  return counts;
}

/**
 * Compute Payload Δ from structured scene metadata.
 *
 * @param dabOrScenes - DAB movements or Scene Architecture slots with function_type info, or null
 * @param cip - Canon Identity Profile for primitive expectations, or null
 * @returns PayloadDelta
 */
export function computePayloadDelta(
  dabOrScenes: Array<{ function_type?: string; function?: string }> | null | undefined,
  cip: StoredCIP | null | undefined,
): PayloadDelta {
  // Fail-soft: no structured data available
  if (!dabOrScenes || dabOrScenes.length === 0) {
    return {
      available: false,
      function_distribution: {},
      prs: null,
    };
  }

  const observedFunctions = countFunctionTypes(dabOrScenes);
  const totalObserved = Object.values(observedFunctions).reduce((s, v) => s + v, 0);

  // Expected distribution is projected from CIP primitives when available
  const expectedFunctions: Record<string, number> = {};
  if (cip?.payload?.primitives) {
    const primCount = Object.keys(cip.payload.primitives).length;
    if (primCount > 0 && totalObserved > 0) {
      // Distribute expected scenes proportionally based on primitives
      const scenesPerPrimitive = Math.max(1, Math.round(totalObserved / primCount));
      if (cip.payload.primitives.pressure) {
        expectedFunctions["conflict"] = scenesPerPrimitive;
        expectedFunctions["confrontation"] = scenesPerPrimitive;
        expectedFunctions["suspense"] = Math.max(1, Math.round(scenesPerPrimitive * 0.5));
      }
      if (cip.payload.primitives.transformation) {
        expectedFunctions["character_moment"] = scenesPerPrimitive;
        expectedFunctions["aftermath"] = Math.max(1, Math.round(scenesPerPrimitive * 0.5));
      }
      if (cip.payload.primitives.connection) {
        expectedFunctions["negotiation"] = Math.max(1, Math.round(scenesPerPrimitive * 0.5));
        expectedFunctions["character_moment"] = (expectedFunctions["character_moment"] || 0) + Math.max(1, Math.round(scenesPerPrimitive * 0.5));
      }
      if (cip.payload.primitives.wonder) {
        expectedFunctions["discovery"] = scenesPerPrimitive;
        expectedFunctions["reveal"] = scenesPerPrimitive;
      }
      if (cip.payload.primitives.meaning) {
        expectedFunctions["aftermath"] = (expectedFunctions["aftermath"] || 0) + Math.max(1, Math.round(scenesPerPrimitive * 0.5));
        expectedFunctions["reaction"] = Math.max(1, Math.round(scenesPerPrimitive * 0.5));
      }
    }
  }

  // Function distribution comparison — only for types found in either set
  const allTypes = new Set([
    ...Object.keys(observedFunctions),
    ...Object.keys(expectedFunctions),
  ]);
  const functionDistribution: Record<string, { expected: number; observed: number }> = {};
  for (const type of allTypes) {
    functionDistribution[type] = {
      expected: expectedFunctions[type] || 0,
      observed: observedFunctions[type] || 0,
    };
  }

  // PRS — Payload Retention Score
  // Measures how well observed function distribution matches expected
  let prs: number | null = null;
  if (Object.keys(expectedFunctions).length > 0 && totalObserved > 0) {
    // Compute: sum of min(expectedPct, observedPct) for each function type
    // This measures overlap between expected and observed distributions
    const totalExpected = Object.values(expectedFunctions).reduce((s, v) => s + v, 0);
    if (totalExpected > 0) {
      let overlap = 0;
      for (const type of allTypes) {
        const expPct = (expectedFunctions[type] || 0) / totalExpected;
        const obsPct = (observedFunctions[type] || 0) / totalObserved;
        overlap += Math.min(expPct, obsPct);
      }
      prs = Math.round(overlap * 100);
    }
  }

  return {
    available: true,
    function_distribution: functionDistribution,
    prs,
  };
}
