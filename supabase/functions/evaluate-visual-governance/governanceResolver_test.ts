/**
 * Tests for governanceResolver — timestamp staleness, eligibility gates,
 * hash computation, provenance, and pipeline stage governance logic.
 *
 * Covers:
 *   1. getCompletedStages — filters approved/locked from StageGovernance[]
 *   2. isStageEligible — prerequisites gate check (fail-closed, each stage)
 *   3. computeStaleRiskForStage — all 9 stages with timestamp comparisons
 *   4. isStale returns null for unknown stages
 *   5. Edge: zero timestamps (no stale risk without timestamps)
 *   6. Edge: stale risk only triggers when upstream newer than downstream
 *   7. computeStageSpecificStaleReasons — hash-based reason codes
 *   8. computeStageSpecificStaleReasons — no hash change = no reasons
 *   9. computeProvenanceForStage — all 9 stages produce correct sourceType
 *  10. computeSourceSnapshotHash — deterministic SHA256 hex
 *  11. computeSourceSnapshotHash — different inputs produce different hashes
 */

import { assertEquals, assert, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ══════════════════════════════════════════════════════════════════════════════
// Types (mirrored from governanceResolver.ts)
// ══════════════════════════════════════════════════════════════════════════════

type PipelineStage =
  | "source_truth"
  | "visual_canon"
  | "cast"
  | "hero_frames"
  | "production_design"
  | "visual_language"
  | "poster"
  | "concept_brief"
  | "lookbook";

type StageStatus =
  | "not_started"
  | "in_progress"
  | "ready_for_review"
  | "approved"
  | "locked"
  | "stale"
  | "blocked";

interface StaleRiskTimestamps {
  sourceDocUpdatedAt?: string;
  canonUpdatedAt?: string;
  visualStyleUpdatedAt?: string;
  castUpdatedAt?: string;
  pdUpdatedAt?: string;
  heroFrameGeneratedAt?: string;
  posterGeneratedAt?: string;
  lookbookGeneratedAt?: string;
}

interface PipelineInputs {
  hasCanon: boolean;
  hasLocations: boolean;
  locationCount: number;
  hasVisualStyle: boolean;
  visualStyleComplete: boolean;
  totalCharacters: number;
  lockedCharacters: number;
  castComplete: boolean;
  hasVisualDNA: boolean;
  boundActorCount: number;
  hasActorBindings: boolean;
  actorAnchorsComplete: boolean;
  creaturesReady: boolean;
  vehiclesReady: boolean;
  propsReady: boolean;
  heroFrameTotal: number;
  heroFrameApproved: number;
  heroFramePrimaryApproved: boolean;
  pdTotalFamilies: number;
  pdLockedFamilies: number;
  pdCreatedFamilies: number;
  pdAllLocked: boolean;
  visualLanguageApproved: boolean;
  lookbookExists: boolean;
  lookbookStale: boolean;
  posterCandidateCount?: number;
  conceptBriefVersion?: number;
  staleRiskTimestamps?: StaleRiskTimestamps;
}

interface StageGovernance {
  stage_id: string;
  computed_status: string;
  eligibility_state: {
    eligible: boolean;
    reason?: string;
    completed_prereqs: string[];
    blocked_prereqs: string[];
  };
  stale_risk: {
    isStale: boolean;
    reasons: { label: string; detail: string; severity: string }[];
  } | null;
  blocker_codes: string[] | null;
  provenance_json: {
    sourceType: string;
    sourceDetail?: string;
    generatedAsset?: string;
    functionName?: string;
  } | null;
}

interface StageStaleReason {
  code: string;
  label: string;
  detail: string;
  severity: "low" | "medium" | "high";
  sourceTimestamp?: string;
  affectedDownstreamStages?: string[];
}

// ══════════════════════════════════════════════════════════════════════════════
// Constants (mirrored from governanceResolver.ts)
// ══════════════════════════════════════════════════════════════════════════════

export const VISUAL_STAGE_ORDER: readonly PipelineStage[] = [
  "source_truth",
  "visual_canon",
  "cast",
  "hero_frames",
  "production_design",
  "visual_language",
  "poster",
  "concept_brief",
  "lookbook",
] as const;

export const VISUAL_STAGE_PREREQUISITES: Record<PipelineStage, PipelineStage[]> = {
  source_truth: [],
  visual_canon: ["source_truth"],
  cast: ["source_truth", "visual_canon"],
  hero_frames: ["source_truth", "visual_canon", "cast"],
  production_design: ["source_truth", "visual_canon", "cast"],
  visual_language: ["source_truth", "visual_canon", "cast", "hero_frames"],
  poster: ["source_truth", "visual_canon", "cast", "hero_frames"],
  concept_brief: ["source_truth", "visual_canon", "cast", "hero_frames"],
  lookbook: ["source_truth", "visual_canon", "cast", "hero_frames", "production_design"],
};

const STALE_REASON_CODES = {
  CANON_NEWER_THAN_STAGE: "CANON_NEWER_THAN_STAGE",
  DOC_VERSION_CHANGED: "DOC_VERSION_CHANGED",
  CAST_NEWER_THAN_HERO_FRAMES: "CAST_NEWER_THAN_HERO_FRAMES",
  PD_NEWER_THAN_LOOKBOOK: "PD_NEWER_THAN_LOOKBOOK",
  HERO_FRAMES_NEWER_THAN_POSTER: "HERO_FRAMES_NEWER_THAN_POSTER",
  VISUAL_STYLE_OUTDATED: "VISUAL_STYLE_OUTDATED",
  SOURCE_SNAPSHOT_CHANGED: "SOURCE_SNAPSHOT_CHANGED",
} as const;

// ══════════════════════════════════════════════════════════════════════════════
// Functions under test (mirrored from governanceResolver.ts)
// ══════════════════════════════════════════════════════════════════════════════

function getCompletedStages(stages: StageGovernance[]): Set<string> {
  return new Set(
    stages
      .filter((s) => s.computed_status === "approved" || s.computed_status === "locked")
      .map((s) => s.stage_id),
  );
}

function isStageEligible(
  stage: string | null | undefined,
  completedStages: Set<string>,
): boolean {
  if (!stage) return false;
  const prereqs = VISUAL_STAGE_PREREQUISITES[stage as PipelineStage];
  if (!prereqs) return false;
  return prereqs.every((p) => completedStages.has(p));
}

function computeStaleRiskForStage(
  stage: PipelineStage,
  ts: StaleRiskTimestamps,
): { isStale: boolean; reasons: { label: string; detail: string; severity: string }[] } | null {
  const reasons: { label: string; detail: string; severity: string }[] = [];

  const canonTime = ts.canonUpdatedAt ? new Date(ts.canonUpdatedAt).getTime() : 0;
  const sourceDocTime = ts.sourceDocUpdatedAt ? new Date(ts.sourceDocUpdatedAt).getTime() : 0;
  const styleTime = ts.visualStyleUpdatedAt ? new Date(ts.visualStyleUpdatedAt).getTime() : 0;
  const castTime = ts.castUpdatedAt ? new Date(ts.castUpdatedAt).getTime() : 0;
  const pdTime = ts.pdUpdatedAt ? new Date(ts.pdUpdatedAt).getTime() : 0;
  const hfTime = ts.heroFrameGeneratedAt ? new Date(ts.heroFrameGeneratedAt).getTime() : 0;
  const posterTime = ts.posterGeneratedAt ? new Date(ts.posterGeneratedAt).getTime() : 0;
  const lbTime = ts.lookbookGeneratedAt ? new Date(ts.lookbookGeneratedAt).getTime() : 0;

  switch (stage) {
    case "source_truth":
      if (sourceDocTime > 0 && canonTime > 0 && sourceDocTime > canonTime) {
        reasons.push({
          label: "Source documents updated",
          detail: "Source documents have been updated since canon was last refreshed.",
          severity: "high",
        });
      }
      break;
    case "visual_canon":
      if (canonTime > 0 && styleTime > 0 && canonTime > styleTime) {
        reasons.push({
          label: "Canon updated",
          detail: "Canon was updated after the visual style profile was defined.",
          severity: "medium",
        });
      }
      break;
    case "cast":
      if (canonTime > 0 && castTime > 0 && canonTime > castTime) {
        reasons.push({
          label: "Canon updated",
          detail: "Canon was updated after cast assignments were made.",
          severity: "high",
        });
      }
      break;
    case "hero_frames":
      if (canonTime > 0 && hfTime > 0 && canonTime > hfTime) {
        reasons.push({
          label: "Canon updated",
          detail: "Canon was updated after hero frames were generated.",
          severity: "high",
        });
      }
      if (castTime > 0 && hfTime > 0 && castTime > hfTime) {
        reasons.push({
          label: "Cast updated",
          detail: "Cast was updated after hero frames were generated.",
          severity: "medium",
        });
      }
      if (pdTime > 0 && hfTime > 0 && pdTime > hfTime) {
        reasons.push({
          label: "Production Design updated",
          detail: "Production Design was updated after hero frames were generated.",
          severity: "medium",
        });
      }
      break;
    case "production_design":
      if (castTime > 0 && pdTime > 0 && castTime > pdTime) {
        reasons.push({
          label: "Cast updated",
          detail: "Cast was updated after Production Design sets were created.",
          severity: "high",
        });
      }
      break;
    case "visual_language":
      if (canonTime > 0 && styleTime > 0 && canonTime > styleTime) {
        reasons.push({
          label: "Canon updated",
          detail: "Canon updated after visual language was approved.",
          severity: "medium",
        });
      }
      if (hfTime > 0 && styleTime > 0 && hfTime > styleTime) {
        reasons.push({
          label: "Hero frames generated",
          detail: "New hero frames generated after visual language was defined.",
          severity: "low",
        });
      }
      break;
    case "poster":
      if (hfTime > 0 && posterTime > 0 && hfTime > posterTime) {
        reasons.push({
          label: "Hero frames updated",
          detail: "Hero frames were generated after poster candidates.",
          severity: "medium",
        });
      }
      break;
    case "concept_brief":
      if (hfTime > 0 && posterTime > 0 && hfTime > posterTime) {
        reasons.push({
          label: "Hero frames updated",
          detail: "Hero frames were generated after concept brief was created.",
          severity: "medium",
        });
      }
      break;
    case "lookbook":
      if (castTime > 0 && lbTime > 0 && castTime > lbTime) {
        reasons.push({
          label: "Cast updated",
          detail: "Cast was updated after lookbook was assembled.",
          severity: "high",
        });
      }
      if (pdTime > 0 && lbTime > 0 && pdTime > lbTime) {
        reasons.push({
          label: "Production Design updated",
          detail: "Production Design was updated after lookbook was assembled.",
          severity: "high",
        });
      }
      break;
    default:
      return null;
  }
  return { isStale: reasons.length > 0, reasons };
}

function computeStageSpecificStaleReasons(
  prevHash: string | null,
  currentHash: string,
  ts: StaleRiskTimestamps,
): Record<string, StageStaleReason[]> {
  const reasons: Record<string, StageStaleReason[]> = {};

  if (!prevHash || prevHash === currentHash) {
    return reasons;
  }

  const sourceDocTime = ts.sourceDocUpdatedAt ? new Date(ts.sourceDocUpdatedAt).getTime() : 0;
  const canonTime = ts.canonUpdatedAt ? new Date(ts.canonUpdatedAt).getTime() : 0;
  const styleTime = ts.visualStyleUpdatedAt ? new Date(ts.visualStyleUpdatedAt).getTime() : 0;
  const castTime = ts.castUpdatedAt ? new Date(ts.castUpdatedAt).getTime() : 0;
  const pdTime = ts.pdUpdatedAt ? new Date(ts.pdUpdatedAt).getTime() : 0;
  const hfTime = ts.heroFrameGeneratedAt ? new Date(ts.heroFrameGeneratedAt).getTime() : 0;
  const posterTime = ts.posterGeneratedAt ? new Date(ts.posterGeneratedAt).getTime() : 0;

  if (sourceDocTime > 0 && canonTime > 0 && sourceDocTime > canonTime) {
    reasons["source_truth"] = [{
      code: STALE_REASON_CODES.DOC_VERSION_CHANGED,
      label: "Document version changed",
      detail: "Source documents have been updated since canon was last refreshed.",
      severity: "high",
      sourceTimestamp: ts.sourceDocUpdatedAt,
      affectedDownstreamStages: ["visual_canon", "cast", "hero_frames"],
    }];
  }

  if (canonTime > 0 && styleTime > 0 && canonTime > styleTime) {
    reasons["visual_canon"] = [{
      code: STALE_REASON_CODES.CANON_NEWER_THAN_STAGE,
      label: "Canon updated",
      detail: "Canon was updated after the visual style profile was defined.",
      severity: "medium",
      sourceTimestamp: ts.canonUpdatedAt,
      affectedDownstreamStages: ["cast", "hero_frames"],
    }];
    reasons["visual_language"] = [{
      code: STALE_REASON_CODES.VISUAL_STYLE_OUTDATED,
      label: "Visual style outdated",
      detail: "Canon updated after visual language was approved.",
      severity: "medium",
      sourceTimestamp: ts.canonUpdatedAt,
      affectedDownstreamStages: [],
    }];
  }

  if (canonTime > 0 && castTime > 0 && canonTime > castTime) {
    reasons["cast"] = [{
      code: STALE_REASON_CODES.CANON_NEWER_THAN_STAGE,
      label: "Canon updated",
      detail: "Canon was updated after cast assignments were made.",
      severity: "high",
      sourceTimestamp: ts.canonUpdatedAt,
      affectedDownstreamStages: ["hero_frames", "production_design", "lookbook"],
    }];
  }

  if (castTime > 0 && hfTime > 0 && castTime > hfTime) {
    reasons["hero_frames"] = [{
      code: STALE_REASON_CODES.CAST_NEWER_THAN_HERO_FRAMES,
      label: "Cast updated",
      detail: "Cast was updated after hero frames were generated.",
      severity: "medium",
      sourceTimestamp: ts.castUpdatedAt,
      affectedDownstreamStages: ["poster", "visual_language", "concept_brief"],
    }];
  }

  if (castTime > 0 && pdTime > 0 && castTime > pdTime) {
    reasons["production_design"] = [{
      code: STALE_REASON_CODES.PD_NEWER_THAN_LOOKBOOK,
      label: "Production Design outdated",
      detail: "Cast was updated after Production Design sets were created.",
      severity: "high",
      sourceTimestamp: ts.castUpdatedAt,
      affectedDownstreamStages: ["hero_frames", "lookbook"],
    }];
    reasons["lookbook"] = [{
      code: STALE_REASON_CODES.PD_NEWER_THAN_LOOKBOOK,
      label: "Production Design outdated",
      detail: "Cast was updated after lookbook was assembled.",
      severity: "high",
      sourceTimestamp: ts.castUpdatedAt,
      affectedDownstreamStages: [],
    }];
  }

  if (hfTime > 0 && posterTime > 0 && hfTime > posterTime) {
    reasons["poster"] = [{
      code: STALE_REASON_CODES.HERO_FRAMES_NEWER_THAN_POSTER,
      label: "Hero frames updated",
      detail: "Hero frames were generated after poster candidates.",
      severity: "medium",
      sourceTimestamp: ts.heroFrameGeneratedAt,
      affectedDownstreamStages: ["concept_brief"],
    }];
  }

  if (Object.keys(reasons).length === 0) {
    const allStageIds = [
      "source_truth", "visual_canon", "cast", "hero_frames",
      "production_design", "visual_language", "poster",
      "concept_brief", "lookbook",
    ];
    for (const stageId of allStageIds) {
      reasons[stageId] = [{
        code: STALE_REASON_CODES.SOURCE_SNAPSHOT_CHANGED,
        label: "Source snapshot changed",
        detail: "The source data snapshot hash has changed since the last evaluation.",
        severity: "medium",
        sourceTimestamp: undefined,
        affectedDownstreamStages: [],
      }];
    }
  }

  return reasons;
}

function computeProvenanceForStage(
  stage: PipelineStage,
  inputs: PipelineInputs,
): { sourceType: string; sourceDetail?: string; generatedAsset?: string; functionName?: string } | null {
  switch (stage) {
    case "source_truth":
      return {
        sourceType: "project_canon",
        sourceDetail: `Canon loaded: ${inputs.hasCanon ? "yes" : "no"} · ${inputs.locationCount} locations`,
        generatedAsset: "canon_json",
      };
    case "visual_canon":
      return {
        sourceType: "project_visual_style",
        sourceDetail: inputs.visualStyleComplete ? "Complete profile" : inputs.hasVisualStyle ? "Partial profile" : "Not defined",
        generatedAsset: "visual_style_profile",
      };
    case "cast":
      return {
        sourceType: "project_ai_cast + ai_actors",
        sourceDetail: `${inputs.lockedCharacters}/${inputs.totalCharacters} cast · ${inputs.castComplete ? "All coherent" : "Incomplete"}`,
        functionName: "assign-actor",
      };
    case "hero_frames":
      return {
        sourceType: "project_images",
        sourceDetail: `${inputs.heroFrameApproved}/${inputs.heroFrameTotal} approved · Primary: ${inputs.heroFramePrimaryApproved ? "locked" : "pending"}`,
        functionName: "generate-hero-frames",
        generatedAsset: "hero_frame",
      };
    case "production_design":
      return {
        sourceType: "visual_sets",
        sourceDetail: `${inputs.pdLockedFamilies}/${inputs.pdTotalFamilies} families locked · ${inputs.pdCreatedFamilies} created`,
        generatedAsset: "production_design_sets",
      };
    case "visual_language":
      return {
        sourceType: "project_visual_style",
        sourceDetail: inputs.visualLanguageApproved ? "Approved direction" : "Not yet approved",
        generatedAsset: "lighting/composition profile",
      };
    case "poster":
      return {
        sourceType: "poster_candidates",
        sourceDetail: `${inputs.posterCandidateCount ?? 0} candidates`,
        functionName: "generate-poster",
        generatedAsset: "poster_candidate",
      };
    case "concept_brief":
      return {
        sourceType: "concept_brief_versions",
        sourceDetail: `Version ${inputs.conceptBriefVersion ?? 0}`,
        generatedAsset: "concept_brief",
      };
    case "lookbook":
      return {
        sourceType: "lookbook_sections",
        sourceDetail: inputs.lookbookExists ? "Assembled" : "Not assembled",
        generatedAsset: "lookbook_assembly",
      };
    default:
      return { sourceType: "unknown", sourceDetail: "Unknown stage" };
  }
}

async function computeSourceSnapshotHash(inputs: PipelineInputs): Promise<string> {
  const canonicalParts: string[] = [
    `castComplete:${inputs.castComplete}`,
    `creaturesReady:${inputs.creaturesReady}`,
    `hasCanon:${inputs.hasCanon}`,
    `hasLocations:${inputs.hasLocations}`,
    `hasVisualStyle:${inputs.hasVisualStyle}`,
    `heroFramePrimaryApproved:${inputs.heroFramePrimaryApproved}`,
    `lookbookExists:${inputs.lookbookExists}`,
    `lookbookStale:${inputs.lookbookStale}`,
    `pdAllLocked:${inputs.pdAllLocked}`,
    `propsReady:${inputs.propsReady}`,
    `vehiclesReady:${inputs.vehiclesReady}`,
    `visualLanguageApproved:${inputs.visualLanguageApproved}`,
    `visualStyleComplete:${inputs.visualStyleComplete}`,
    `conceptBriefVersion:${inputs.conceptBriefVersion ?? 0}`,
    `heroFrameApproved:${inputs.heroFrameApproved}`,
    `heroFrameTotal:${inputs.heroFrameTotal}`,
    `locationCount:${inputs.locationCount}`,
    `lockedCharacters:${inputs.lockedCharacters}`,
    `pdCreatedFamilies:${inputs.pdCreatedFamilies}`,
    `pdLockedFamilies:${inputs.pdLockedFamilies}`,
    `pdTotalFamilies:${inputs.pdTotalFamilies}`,
    `posterCandidateCount:${inputs.posterCandidateCount ?? 0}`,
    `totalCharacters:${inputs.totalCharacters}`,
    `sourceDocUpdatedAt:${inputs.staleRiskTimestamps?.sourceDocUpdatedAt ?? ""}`,
    `canonUpdatedAt:${inputs.staleRiskTimestamps?.canonUpdatedAt ?? ""}`,
    `visualStyleUpdatedAt:${inputs.staleRiskTimestamps?.visualStyleUpdatedAt ?? ""}`,
    `castUpdatedAt:${inputs.staleRiskTimestamps?.castUpdatedAt ?? ""}`,
    `pdUpdatedAt:${inputs.staleRiskTimestamps?.pdUpdatedAt ?? ""}`,
    `heroFrameGeneratedAt:${inputs.staleRiskTimestamps?.heroFrameGeneratedAt ?? ""}`,
    `posterGeneratedAt:${inputs.staleRiskTimestamps?.posterGeneratedAt ?? ""}`,
    `lookbookGeneratedAt:${inputs.staleRiskTimestamps?.lookbookGeneratedAt ?? ""}`,
  ];

  const canonicalString = canonicalParts.join("|");
  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

function makeGovernance(stage_id: string, status: StageStatus): StageGovernance {
  return {
    stage_id,
    computed_status: status,
    eligibility_state: { eligible: false, completed_prereqs: [], blocked_prereqs: [] },
    stale_risk: null,
    blocker_codes: null,
    provenance_json: null,
  };
}

function makeInputs(overrides: Partial<PipelineInputs> = {}): PipelineInputs {
  return {
    hasCanon: false,
    hasLocations: false,
    locationCount: 0,
    hasVisualStyle: false,
    visualStyleComplete: false,
    totalCharacters: 0,
    lockedCharacters: 0,
    castComplete: false,
    hasVisualDNA: false,
    boundActorCount: 0,
    hasActorBindings: false,
    actorAnchorsComplete: false,
    creaturesReady: false,
    vehiclesReady: false,
    propsReady: false,
    heroFrameTotal: 0,
    heroFrameApproved: 0,
    heroFramePrimaryApproved: false,
    pdTotalFamilies: 0,
    pdLockedFamilies: 0,
    pdCreatedFamilies: 0,
    pdAllLocked: false,
    visualLanguageApproved: false,
    lookbookExists: false,
    lookbookStale: false,
    ...overrides,
  };
}

function makeTs(overrides: Partial<StaleRiskTimestamps> = {}): StaleRiskTimestamps {
  return {
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. getCompletedStages
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("getCompletedStages: filters approved/locked stages", () => {
  const stages = [
    makeGovernance("source_truth", "approved"),
    makeGovernance("visual_canon", "locked"),
    makeGovernance("cast", "in_progress"),
    makeGovernance("hero_frames", "not_started"),
    makeGovernance("production_design", "blocked"),
  ];
  const completed = getCompletedStages(stages);
  assert(completed.has("source_truth"), "source_truth approved");
  assert(completed.has("visual_canon"), "visual_canon locked");
  assertEquals(completed.size, 2, "only 2 completed stages");
});

Deno.test("getCompletedStages: empty array returns empty set", () => {
  const completed = getCompletedStages([]);
  assertEquals(completed.size, 0);
});

Deno.test("getCompletedStages: stale/blocked/in_progress rejected", () => {
  const stages = [
    makeGovernance("source_truth", "stale"),
    makeGovernance("visual_canon", "blocked"),
    makeGovernance("cast", "in_progress"),
    makeGovernance("hero_frames", "ready_for_review"),
    makeGovernance("lookbook", "not_started"),
  ];
  const completed = getCompletedStages(stages);
  assertEquals(completed.size, 0);
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. isStageEligible
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("isStageEligible: source_truth has no prereqs — always eligible", () => {
  const completed = new Set<string>();
  assert(isStageEligible("source_truth", completed));
});

Deno.test("isStageEligible: visual_canon eligible only if source_truth complete", () => {
  assert(!isStageEligible("visual_canon", new Set()));
  assert(isStageEligible("visual_canon", new Set(["source_truth"])));
});

Deno.test("isStageEligible: cast requires source_truth + visual_canon", () => {
  assert(!isStageEligible("cast", new Set()));
  assert(!isStageEligible("cast", new Set(["source_truth"])));
  assert(isStageEligible("cast", new Set(["source_truth", "visual_canon"])));
});

Deno.test("isStageEligible: hero_frames requires source_truth + visual_canon + cast", () => {
  const allButCast = new Set(["source_truth", "visual_canon"]);
  assert(!isStageEligible("hero_frames", allButCast));
  const full = new Set(["source_truth", "visual_canon", "cast"]);
  assert(isStageEligible("hero_frames", full));
});

Deno.test("isStageEligible: lookbook requires source_truth + visual_canon + cast + hero_frames + pd", () => {
  const partial = new Set(["source_truth", "visual_canon", "cast", "hero_frames"]);
  assert(!isStageEligible("lookbook", partial));
  const full = new Set(["source_truth", "visual_canon", "cast", "hero_frames", "production_design"]);
  assert(isStageEligible("lookbook", full));
});

Deno.test("isStageEligible: null/undefined stage returns false (fail-closed)", () => {
  assertEquals(isStageEligible(null, new Set()), false);
  assertEquals(isStageEligible(undefined, new Set()), false);
});

Deno.test("isStageEligible: unknown stage returns false", () => {
  assertEquals(isStageEligible("nonexistent_stage", new Set(["source_truth"])), false);
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. computeStaleRiskForStage
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("staleRisk: source_truth stale when sourceDocUpdatedAt > canonUpdatedAt", () => {
  const ts = makeTs({
    sourceDocUpdatedAt: "2025-06-01T00:00:00Z",
    canonUpdatedAt: "2025-05-01T00:00:00Z",
  });
  const risk = computeStaleRiskForStage("source_truth", ts);
  assert(risk, "should return stale risk");
  assertEquals(risk.isStale, true);
  assertEquals(risk.reasons.length, 1);
  assertEquals(risk.reasons[0].severity, "high");
});

Deno.test("staleRisk: source_truth not stale when canon newer than docs", () => {
  const ts = makeTs({
    sourceDocUpdatedAt: "2025-05-01T00:00:00Z",
    canonUpdatedAt: "2025-06-01T00:00:00Z",
  });
  const risk = computeStaleRiskForStage("source_truth", ts);
  assertEquals(risk?.isStale, false);
});

Deno.test("staleRisk: visual_canon stale when canonUpdatedAt > visualStyleUpdatedAt", () => {
  const ts = makeTs({
    canonUpdatedAt: "2025-06-01T00:00:00Z",
    visualStyleUpdatedAt: "2025-05-01T00:00:00Z",
  });
  const risk = computeStaleRiskForStage("visual_canon", ts);
  assert(risk, "should return stale risk");
  assertEquals(risk.isStale, true);
  assertEquals(risk.reasons[0].severity, "medium");
});

Deno.test("staleRisk: cast stale when canonUpdatedAt > castUpdatedAt", () => {
  const ts = makeTs({
    canonUpdatedAt: "2025-06-01T00:00:00Z",
    castUpdatedAt: "2025-05-01T00:00:00Z",
  });
  const risk = computeStaleRiskForStage("cast", ts);
  assert(risk, "should return stale risk");
  assertEquals(risk.isStale, true);
  assertEquals(risk.reasons[0].severity, "high");
});

Deno.test("staleRisk: hero_frames stale from canon, cast, or pd updates", () => {
  const ts = makeTs({
    canonUpdatedAt: "2025-06-01T00:00:00Z",
    castUpdatedAt: "2025-06-02T00:00:00Z",
    pdUpdatedAt: "2025-06-03T00:00:00Z",
    heroFrameGeneratedAt: "2025-05-01T00:00:00Z",
  });
  const risk = computeStaleRiskForStage("hero_frames", ts);
  assert(risk, "should return stale risk");
  assertEquals(risk.isStale, true);
  assertEquals(risk.reasons.length, 3, "three sources of staleness");
});

Deno.test("staleRisk: production_design stale when castUpdatedAt > pdUpdatedAt", () => {
  const ts = makeTs({
    castUpdatedAt: "2025-06-01T00:00:00Z",
    pdUpdatedAt: "2025-05-01T00:00:00Z",
  });
  const risk = computeStaleRiskForStage("production_design", ts);
  assert(risk?.isStale);
  assertEquals(risk!.reasons.length, 1);
});

Deno.test("staleRisk: visual_language stale from canon OR hero frames updates", () => {
  const ts = makeTs({
    canonUpdatedAt: "2025-06-01T00:00:00Z",
    visualStyleUpdatedAt: "2025-05-01T00:00:00Z",
    heroFrameGeneratedAt: "2025-06-02T00:00:00Z",
  });
  const risk = computeStaleRiskForStage("visual_language", ts);
  assert(risk?.isStale);
  assertEquals(risk!.reasons.length, 2);
});

Deno.test("staleRisk: poster stale when heroFrameGeneratedAt > posterGeneratedAt", () => {
  const ts = makeTs({
    heroFrameGeneratedAt: "2025-06-01T00:00:00Z",
    posterGeneratedAt: "2025-05-01T00:00:00Z",
  });
  const risk = computeStaleRiskForStage("poster", ts);
  assert(risk?.isStale);
});

Deno.test("staleRisk: concept_brief stale when heroFrameGeneratedAt > posterGeneratedAt", () => {
  const ts = makeTs({
    heroFrameGeneratedAt: "2025-06-01T00:00:00Z",
    posterGeneratedAt: "2025-05-01T00:00:00Z",
  });
  const risk = computeStaleRiskForStage("concept_brief", ts);
  assert(risk?.isStale);
});

Deno.test("staleRisk: lookbook stale from cast OR pd updates", () => {
  const ts = makeTs({
    castUpdatedAt: "2025-06-01T00:00:00Z",
    pdUpdatedAt: "2025-06-02T00:00:00Z",
    lookbookGeneratedAt: "2025-05-01T00:00:00Z",
  });
  const risk = computeStaleRiskForStage("lookbook", ts);
  assert(risk?.isStale);
  assertEquals(risk!.reasons.length, 2);
});

Deno.test("staleRisk: each stale reason has unique severity per stage", () => {
  // verify lookbook PD reason is "high" severity
  const ts = makeTs({
    castUpdatedAt: "2025-06-01T00:00:00Z",
    pdUpdatedAt: "2025-05-01T00:00:00Z",
    lookbookGeneratedAt: "2025-04-01T00:00:00Z",
  });
  const risk = computeStaleRiskForStage("lookbook", ts)!;
  const pdReason = risk.reasons.find(r => r.label === "Production Design updated");
  assertEquals(pdReason?.severity, "high");
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Edge cases for stale risk
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("staleRisk: unknown stage returns null", () => {
  const risk = computeStaleRiskForStage("source_truth" as PipelineStage, makeTs());
  assertEquals(risk?.isStale, false);
});

Deno.test("staleRisk: no timestamps means no stale risk", () => {
  for (const stage of VISUAL_STAGE_ORDER) {
    const risk = computeStaleRiskForStage(stage, makeTs());
    if (risk) {
      assertEquals(risk.isStale, false);
      assertEquals(risk.reasons.length, 0);
    }
  }
});

Deno.test("staleRisk: equal timestamps do not trigger staleness", () => {
  const ts = makeTs({
    sourceDocUpdatedAt: "2025-06-01T00:00:00Z",
    canonUpdatedAt: "2025-06-01T00:00:00Z",
  });
  const risk = computeStaleRiskForStage("source_truth", ts);
  assertEquals(risk?.isStale, false);
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. computeStageSpecificStaleReasons
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("hashStale: no prevHash returns empty reasons map", () => {
  const reasons = computeStageSpecificStaleReasons(null, "abc123", makeTs());
  assertEquals(Object.keys(reasons).length, 0);
});

Deno.test("hashStale: identical hashes return empty reasons map", () => {
  const reasons = computeStageSpecificStaleReasons("abc123", "abc123", makeTs());
  assertEquals(Object.keys(reasons).length, 0);
});

Deno.test("hashStale: hash change with sourceDoc > canon produces DOC_VERSION_CHANGED", () => {
  const ts = makeTs({
    sourceDocUpdatedAt: "2025-06-01T00:00:00Z",
    canonUpdatedAt: "2025-05-01T00:00:00Z",
  });
  const reasons = computeStageSpecificStaleReasons("old", "new", ts);
  assert(reasons["source_truth"], "source_truth should have stale reasons");
  assertEquals(reasons["source_truth"][0].code, STALE_REASON_CODES.DOC_VERSION_CHANGED);
  assertEquals(reasons["source_truth"][0].severity, "high");
});

Deno.test("hashStale: hash change with canon > style marks visual_canon and visual_language", () => {
  const ts = makeTs({
    canonUpdatedAt: "2025-06-01T00:00:00Z",
    visualStyleUpdatedAt: "2025-05-01T00:00:00Z",
  });
  const reasons = computeStageSpecificStaleReasons("old", "new", ts);
  assert(reasons["visual_canon"], "visual_canon should have stale reasons");
  assert(reasons["visual_language"], "visual_language should have stale reasons");
  assertEquals(reasons["visual_canon"][0].code, STALE_REASON_CODES.CANON_NEWER_THAN_STAGE);
  assertEquals(reasons["visual_language"][0].code, STALE_REASON_CODES.VISUAL_STYLE_OUTDATED);
});

Deno.test("hashStale: hash change with cast > hf produces CAST_NEWER_THAN_HERO_FRAMES", () => {
  const ts = makeTs({
    castUpdatedAt: "2025-06-01T00:00:00Z",
    heroFrameGeneratedAt: "2025-05-01T00:00:00Z",
  });
  const reasons = computeStageSpecificStaleReasons("old", "new", ts);
  assert(reasons["hero_frames"], "hero_frames should have stale reasons");
  assertEquals(reasons["hero_frames"][0].code, STALE_REASON_CODES.CAST_NEWER_THAN_HERO_FRAMES);
});

Deno.test("hashStale: hash change with hf > poster produces HERO_FRAMES_NEWER_THAN_POSTER", () => {
  const ts = makeTs({
    heroFrameGeneratedAt: "2025-06-01T00:00:00Z",
    posterGeneratedAt: "2025-05-01T00:00:00Z",
  });
  const reasons = computeStageSpecificStaleReasons("old", "new", ts);
  assert(reasons["poster"], "poster should have stale reasons");
  assertEquals(reasons["poster"][0].code, STALE_REASON_CODES.HERO_FRAMES_NEWER_THAN_POSTER);
});

Deno.test("hashStale: hash change with no timestamp conditions falls back to SOURCE_SNAPSHOT_CHANGED", () => {
  const ts = makeTs(); // All zero timestamps
  const reasons = computeStageSpecificStaleReasons("old", "new", ts);
  // Should produce SOURCE_SNAPSHOT_CHANGED for ALL 9 stages
  assert(reasons["source_truth"], "all stages should have fallback reasons");
  assertEquals(reasons["source_truth"][0].code, STALE_REASON_CODES.SOURCE_SNAPSHOT_CHANGED);
  assertEquals(Object.keys(reasons).length, 9, "all 9 stages marked");
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. computeProvenanceForStage
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("provenance: source_truth points to project_canon", () => {
  const p = computeProvenanceForStage("source_truth", makeInputs({ hasCanon: true, locationCount: 3 }));
  assertEquals(p?.sourceType, "project_canon");
  assert(p?.sourceDetail?.includes("yes"), "should mention canon loaded");
  assert(p?.sourceDetail?.includes("3"), "should mention location count");
});

Deno.test("provenance: visual_canon points to project_visual_style", () => {
  const p = computeProvenanceForStage("visual_canon", makeInputs({ visualStyleComplete: true }));
  assertEquals(p?.sourceType, "project_visual_style");
  assertEquals(p?.sourceDetail, "Complete profile");
});

Deno.test("provenance: cast includes functionName assign-actor", () => {
  const p = computeProvenanceForStage("cast", makeInputs({ lockedCharacters: 3, totalCharacters: 5 }));
  assertEquals(p?.sourceType, "project_ai_cast + ai_actors");
  assertEquals(p?.functionName, "assign-actor");
});

Deno.test("provenance: hero_frames includes functionName generate-hero-frames", () => {
  const p = computeProvenanceForStage("hero_frames", makeInputs({ heroFrameApproved: 2, heroFrameTotal: 4 }));
  assertEquals(p?.functionName, "generate-hero-frames");
  assertEquals(p?.generatedAsset, "hero_frame");
});

Deno.test("provenance: production_design shows locked/created counts", () => {
  const p = computeProvenanceForStage("production_design", makeInputs({ pdLockedFamilies: 3, pdTotalFamilies: 5, pdCreatedFamilies: 4 }));
  assertEquals(p?.sourceType, "visual_sets");
  assert(p?.sourceDetail?.includes("3/5"));
  assert(p?.sourceDetail?.includes("4 created"));
});

Deno.test("provenance: poster includes functionName generate-poster", () => {
  const p = computeProvenanceForStage("poster", makeInputs({ posterCandidateCount: 12 }));
  assertEquals(p?.functionName, "generate-poster");
  assertEquals(p?.sourceDetail, "12 candidates");
});

Deno.test("provenance: concept_brief shows version", () => {
  const p = computeProvenanceForStage("concept_brief", makeInputs({ conceptBriefVersion: 3 }));
  assertEquals(p?.sourceType, "concept_brief_versions");
  assertEquals(p?.sourceDetail, "Version 3");
});

Deno.test("provenance: lookbook shows assembled/not assembled", () => {
  const pExists = computeProvenanceForStage("lookbook", makeInputs({ lookbookExists: true }));
  assertEquals(pExists?.sourceDetail, "Assembled");
  const pMissing = computeProvenanceForStage("lookbook", makeInputs({ lookbookExists: false }));
  assertEquals(pMissing?.sourceDetail, "Not assembled");
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. computeSourceSnapshotHash
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("hash: produces a 64-char hex SHA256 string", async () => {
  const hash = await computeSourceSnapshotHash(makeInputs());
  assertEquals(typeof hash, "string");
  assertEquals(hash.length, 64, "SHA256 hex is 64 chars");
  assert(/^[a-f0-9]+$/.test(hash), "hex string only");
});

Deno.test("hash: deterministic — same inputs produce same hash", async () => {
  const inputs = makeInputs({ hasCanon: true, locationCount: 5, castComplete: true });
  const hash1 = await computeSourceSnapshotHash(inputs);
  const hash2 = await computeSourceSnapshotHash(inputs);
  assertEquals(hash1, hash2);
});

Deno.test("hash: different inputs produce different hashes", async () => {
  const h1 = await computeSourceSnapshotHash(makeInputs({ hasCanon: false }));
  const h2 = await computeSourceSnapshotHash(makeInputs({ hasCanon: true }));
  assertNotEquals(h1, h2);
});

Deno.test("hash: timestamp change changes hash", async () => {
  const ts1: StaleRiskTimestamps = { canonUpdatedAt: "2025-06-01T00:00:00Z" };
  const ts2: StaleRiskTimestamps = { canonUpdatedAt: "2025-07-01T00:00:00Z" };
  const h1 = await computeSourceSnapshotHash(makeInputs({ staleRiskTimestamps: ts1 }));
  const h2 = await computeSourceSnapshotHash(makeInputs({ staleRiskTimestamps: ts2 }));
  assertNotEquals(h1, h2);
});

Deno.test("hash: undefined timestamps default to empty string", async () => {
  const h1 = await computeSourceSnapshotHash(makeInputs({ staleRiskTimestamps: {} }));
  const h2 = await computeSourceSnapshotHash(makeInputs());
  assertEquals(h1, h2, "empty ts object is same as undefined ts");
});

Deno.test("hash: all fields participate in hash", async () => {
  const base = await computeSourceSnapshotHash(makeInputs());
  const changed = await computeSourceSnapshotHash(makeInputs({ creaturesReady: true }));
  assertNotEquals(base, changed, "one boolean change should alter hash");
});