/**
 * identityStackP0/repairPlan.ts
 *
 * Repair Plan generation (P0 subset).
 *
 * P0 includes only deterministic repair operations:
 * - Facts: F1 (INSERT_ENTITY), F2 (REMOVE_ENTITY), F7 (REMOVE_INVENTED)
 * - Shape: S1 (INSERT_SCENES), S2 (REMOVE_SCENES), S3 (REBALANCE_ACTS),
 *          S4 (CORRECT_TRAJECTORY), S5 (UNCOMPRESS_BEAT)
 * - Payload: P1 (INSERT_FUNCTION), P3 (REBALANCE_FUNCTIONS)
 *
 * Theme operations (T1-T4) are skipped in P0.
 * All operations are deterministic — no LLM.
 * No execution — only plan generation.
 */

import type { IdentityDelta, RepairPlan, RepairOperation, RepairOperationId } from "./types.ts";

// ── Thresholds ─────────────────────────────────────────────────────────────

/** Minimum scene count deviation to trigger S1 */
const SCENE_COUNT_DEVIATION_THRESHOLD = 0.15; // ±15%

/** Minimum act distribution deviation to trigger S3 */
const ACT_DISTRIBUTION_DEVIATION_THRESHOLD = 0.08; // ±8 percentage points

/** Minimum compression ratio deviation to trigger S5 */
const COMPRESSION_RATIO_DEVIATION_THRESHOLD = 0.5; // 0.5 scenes/beat

// ── Main Generator ─────────────────────────────────────────────────────────

/**
 * Generate a Repair Plan from Identity Delta (P0 subset).
 * Deterministic — same delta always produces the same plan.
 * Never throws. Always returns a RepairPlan object.
 *
 * @param delta - Identity Delta from computeIdentityDelta()
 * @returns RepairPlan — operations are always status="proposed"
 */
export function generateRepairPlan(
  delta: IdentityDelta | null | undefined,
): RepairPlan {
  if (!delta) {
    return {
      available: false,
      operations: [],
      effort: 0,
      completeness: "full",
      warnings: ["Identity Delta not available — no repair plan generated"],
    };
  }

  const operations: RepairOperation[] = [];
  const warnings: string[] = [];

  // ── Facts Repair Operations ──────────────────────────────────────────

  if (delta.facts_delta?.available) {
    // F1 — Insert missing entities
    for (const char of (delta.facts_delta.characters_missing ?? [])) {
      operations.push({
        operation_id: "F1" as RepairOperationId,
        dimension: "facts",
        severity: "high",
        target: char,
        reason: `Character '${char}' is in CIP but missing from document`,
        expected_identity_gain: Math.round(100 / Math.max(1, delta.facts_delta.characters_missing.length)),
        prerequisites: [],
        status: "proposed",
      });
    }

    // F2 — Remove entities that have wrong characteristics
    // In P0, this is simplified: if characters are present but fact_fidelity is low
    if ((delta.facts_delta.fact_fidelity ?? 100) < 70 && delta.facts_delta.characters_present.length > 0) {
      // We add F2 for characters that may need role correction
      // In P0 this is a placeholder — full entity correction requires deeper analysis
      if (delta.facts_delta.fact_fidelity !== null && delta.facts_delta.fact_fidelity < 70 && delta.facts_delta.fact_fidelity >= 50) {
        // Borderline: characters present but may not match role
        operations.push({
          operation_id: "F2" as RepairOperationId,
          dimension: "facts",
          severity: "medium",
          target: "character_roles",
          reason: "Character roles may deviate from CIP — Fact Fidelity below 70%",
          expected_identity_gain: 10,
          prerequisites: [],
          status: "proposed",
        });
      }
    }

    // F7 — Remove invented entities
    for (const added of (delta.facts_delta.characters_added ?? [])) {
      operations.push({
        operation_id: "F7" as RepairOperationId,
        dimension: "facts",
        severity: "medium",
        target: added,
        reason: `Character '${added}' appears in document but is not in CIP`,
        expected_identity_gain: 5,
        prerequisites: [],
        status: "proposed",
      });
    }
  }

  // ── Shape Repair Operations ──────────────────────────────────────────

  if (delta.shape_delta?.available) {
    const shape = delta.shape_delta;

    // S1 — Insert scenes (when count is below expected)
    if (shape.scene_count.expected !== null && shape.scene_count.observed !== null) {
      const deviation = Math.abs(shape.scene_count.delta ?? 0) / Math.max(1, shape.scene_count.expected);
      if (deviation > SCENE_COUNT_DEVIATION_THRESHOLD && (shape.scene_count.delta ?? 0) < 0) {
        const missingCount = Math.abs(shape.scene_count.delta ?? 0);
        operations.push({
          operation_id: "S1" as RepairOperationId,
          dimension: "shape",
          severity: missingCount > 10 ? "critical" : "high",
          target: `add_${missingCount}_scenes`,
          reason: `Document has ${shape.scene_count.observed} scenes, CIP expects ${shape.scene_count.expected} (${missingCount} missing)`,
          expected_identity_gain: Math.min(30, Math.round((missingCount / shape.scene_count.expected) * 30)),
          prerequisites: [],
          status: "proposed",
        });
      }
      // S2 — Remove scenes (when count is above expected)
      if (deviation > SCENE_COUNT_DEVIATION_THRESHOLD && (shape.scene_count.delta ?? 0) > 0) {
        const excessCount = Math.abs(shape.scene_count.delta ?? 0);
        operations.push({
          operation_id: "S2" as RepairOperationId,
          dimension: "shape",
          severity: "medium",
          target: `remove_${excessCount}_scenes`,
          reason: `Document has ${shape.scene_count.observed} scenes, CIP expects ${shape.scene_count.expected} (${excessCount} excess)`,
          expected_identity_gain: Math.min(15, Math.round((excessCount / shape.scene_count.expected) * 15)),
          prerequisites: [],
          status: "proposed",
        });
      }
    }

    // S3 — Rebalance acts (when act distribution deviates)
    for (const act of shape.act_distribution) {
      if (act.expected_pct !== null && act.observed_pct !== null) {
        const deviation = Math.abs(act.observed_pct - act.expected_pct);
        if (deviation > ACT_DISTRIBUTION_DEVIATION_THRESHOLD * 100) {
          operations.push({
            operation_id: "S3" as RepairOperationId,
            dimension: "shape",
            severity: deviation > 15 ? "high" : "medium",
            target: `act_${act.act}`,
            reason: `Act ${act.act}: expected ${act.expected_pct}% of scenes, observed ${act.observed_pct}% (${Math.abs(Math.round(act.observed_pct - act.expected_pct))}pp deviation)`,
            expected_identity_gain: Math.min(15, Math.round(deviation * 0.5)),
            prerequisites: [],
            status: "proposed",
          });
        }
      }
    }

    // S4 — Correct trajectory
    if (shape.trajectory_match === false) {
      operations.push({
        operation_id: "S4" as RepairOperationId,
        dimension: "shape",
        severity: "high",
        target: "narrative_trajectory",
        reason: "Document narrative trajectory does not match CIP trajectory",
        expected_identity_gain: 10,
        prerequisites: [],
        status: "proposed",
      });
    }

    // S5 — Uncompress beats
    if (shape.compression_ratio.expected !== null && shape.compression_ratio.observed !== null) {
      const ratioDelta = Math.abs(shape.compression_ratio.observed - shape.compression_ratio.expected);
      if (ratioDelta > COMPRESSION_RATIO_DEVIATION_THRESHOLD) {
        operations.push({
          operation_id: "S5" as RepairOperationId,
          dimension: "shape",
          severity: "medium",
          target: "beat_compression",
          reason: `Compression ratio ${shape.compression_ratio.observed} vs expected ${shape.compression_ratio.expected} (${Math.round(ratioDelta * 10) / 10} scenes/beat deviation)`,
          expected_identity_gain: 8,
          prerequisites: [],
          status: "proposed",
        });
      }
    }
  }

  // ── Payload Repair Operations ────────────────────────────────────────

  if (delta.payload_delta?.available && delta.payload_delta.prs !== null) {
    const prs = delta.payload_delta.prs;

    // P1 — Insert missing function types
    if (prs < 60) {
      const missingFunctions = Object.entries(delta.payload_delta.function_distribution)
        .filter(([_, counts]) => counts.expected > 0 && counts.observed === 0)
        .map(([type]) => type);

      for (const fnType of missingFunctions.slice(0, 3)) {
        operations.push({
          operation_id: "P1" as RepairOperationId,
          dimension: "payload",
          severity: "medium",
          target: fnType,
          reason: `Function type '${fnType}' is expected by CIP but missing from document`,
          expected_identity_gain: Math.round((100 - prs) / Math.max(1, missingFunctions.length)),
          prerequisites: [],
          status: "proposed",
        });
      }
    }

    // P3 — Rebalance function distribution
    if (prs < 70) {
      const distributionStr = Object.entries(delta.payload_delta.function_distribution)
        .filter(([_, counts]) => Math.abs(counts.expected - counts.observed) > 1)
        .map(([type, counts]) => `${type}: ${counts.expected}exp/${counts.observed}obs`)
        .join("; ");

      if (distributionStr) {
        operations.push({
          operation_id: "P3" as RepairOperationId,
          dimension: "payload",
          severity: "low",
          target: "function_distribution",
          reason: `Function distribution deviates from CIP expectation: ${distributionStr}`,
          expected_identity_gain: Math.min(10, Math.round((100 - prs) * 0.3)),
          prerequisites: [],
          status: "proposed",
        });
      }
    }
  }

  // Sort by severity
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  operations.sort((a, b) => (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99));

  // Compute effort (0-100) based on number and complexity of operations
  const effort = Math.min(100, operations.length * 10);

  // Determine completeness
  // Always partial in P0 (theme skipped — always false)
  const completeness = "partial" as const;

  return {
    available: operations.length > 0,
    operations,
    effort,
    completeness: completeness as "partial" | "full",
    warnings: delta.warnings.filter((w) => w.includes("Theme")),
  };
}
