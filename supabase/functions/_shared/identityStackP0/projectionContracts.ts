/**
 * identityStackP0/projectionContracts.ts
 *
 * Projection Contract Registry V1.
 * Maps projection types to their identity obligations and thresholds.
 *
 * Phase 7.2A — 6 projection types defined.
 * Static configuration — no runtime registration, no UI.
 */

import type { ProjectionContract } from "./types.ts";

/**
 * V1 Contract Registry.
 * Each projection declares which CIP dimensions it must/should/may deliver,
 * which it ignores, and its IRS threshold for identity convergence.
 */
const PROJECTION_CONTRACTS_V1: Record<string, ProjectionContract> = {
  feature_script: {
    id: "feature_script_v1",
    projection_type: "feature_script",
    description: "Feature-length screenplay — primary identity carrier",
    dimensions: {
      facts: { obligation: "must", min_threshold: 70 },
      payload: { obligation: "must", min_threshold: 60 },
      theme: { obligation: "must", min_threshold: 50 },
      shape: { obligation: "must", min_threshold: 60 },
    },
    irs_threshold: 80,
    ignores: [],
  },

  treatment: {
    id: "treatment_v1",
    projection_type: "treatment",
    description: "Prose narrative — identity depth",
    dimensions: {
      facts: { obligation: "must", min_threshold: 70 },
      payload: { obligation: "should", min_threshold: 50 },
      theme: { obligation: "must", min_threshold: 50 },
      shape: { obligation: "should", min_threshold: 40 },
    },
    irs_threshold: 70,
    ignores: [],
  },

  beat_sheet: {
    id: "beat_sheet_v1",
    projection_type: "beat_sheet",
    description: "Structural beat architecture",
    dimensions: {
      facts: { obligation: "may", min_threshold: 30 },
      payload: { obligation: "must", min_threshold: 60 },
      theme: { obligation: "should", min_threshold: 40 },
      shape: { obligation: "must", min_threshold: 80 },
    },
    irs_threshold: 70,
    ignores: [],
  },

  production_draft: {
    id: "production_draft_v1",
    projection_type: "production_draft",
    description: "Production-planning document — scope only",
    dimensions: {
      facts: { obligation: "must", min_threshold: 60 },
      payload: { obligation: "not", min_threshold: 0 },
      theme: { obligation: "not", min_threshold: 0 },
      shape: { obligation: "must", min_threshold: 80 },
    },
    irs_threshold: 70,
    ignores: ["payload", "theme"],
  },

  hero_frames: {
    id: "hero_frames_v1",
    projection_type: "hero_frames",
    description: "Character visual representation",
    dimensions: {
      facts: { obligation: "must", min_threshold: 80 },
      payload: { obligation: "may", min_threshold: 0 },
      theme: { obligation: "may", min_threshold: 0 },
      shape: { obligation: "not", min_threshold: 0 },
    },
    irs_threshold: 70,
    ignores: ["shape"],
  },

  lookbook: {
    id: "lookbook_v1",
    projection_type: "lookbook",
    description: "Visual design collection",
    dimensions: {
      facts: { obligation: "must", min_threshold: 60 },
      payload: { obligation: "should", min_threshold: 40 },
      theme: { obligation: "may", min_threshold: 0 },
      shape: { obligation: "not", min_threshold: 0 },
    },
    irs_threshold: 60,
    ignores: ["shape"],
  },
};

/**
 * Resolve a ProjectionContract by projection type.
 * Returns null for unknown types (fail-soft).
 */
export function getProjectionContract(
  projectionType: string,
): ProjectionContract | null {
  return PROJECTION_CONTRACTS_V1[projectionType] ?? null;
}

/**
 * Validate that a projection type has a valid contract.
 * Returns true if contract exists and all dimensions have valid configs.
 */
export function validateProjectionContract(
  projectionType: string,
): { valid: boolean; errors: string[] } {
  const contract = PROJECTION_CONTRACTS_V1[projectionType];
  if (!contract) {
    return { valid: false, errors: ["Unknown projection type: " + projectionType] };
  }

  const errors: string[] = [];
  const dims = ["facts", "payload", "theme", "shape"] as const;
  for (const dim of dims) {
    const cfg = contract.dimensions[dim];
    if (!cfg) {
      errors.push(`Missing dimension config: ${dim}`);
      continue;
    }
    if (cfg.obligation !== "must" && cfg.obligation !== "should" &&
        cfg.obligation !== "may" && cfg.obligation !== "not") {
      errors.push(`Invalid obligation '${cfg.obligation}' for dimension '${dim}'`);
    }
    if (typeof cfg.min_threshold !== "number" || cfg.min_threshold < 0 || cfg.min_threshold > 100) {
      errors.push(`Invalid threshold for dimension '${dim}': ${cfg.min_threshold}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check whether a dimension should be ignored for a projection type.
 */
export function isDimensionIgnored(
  projectionType: string,
  dimension: string,
): boolean {
  const contract = getProjectionContract(projectionType);
  if (!contract) return false;
  return contract.ignores.includes(dimension);
}

/**
 * Check whether a dimension is within the projection's scope at all.
 * Returns false for "not" obligation (not responsible).
 */
export function isDimensionInScope(
  projectionType: string,
  dimension: string,
): boolean {
  const contract = getProjectionContract(projectionType);
  if (!contract) return false;
  const cfg = contract.dimensions[dimension as keyof typeof contract.dimensions];
  return cfg && cfg.obligation !== "not";
}

/** List all registered projection types. */
export function listProjectionTypes(): string[] {
  return Object.keys(PROJECTION_CONTRACTS_V1);
}
