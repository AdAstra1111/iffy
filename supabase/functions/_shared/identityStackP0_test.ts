/**
 * identityStackP0_test.ts
 *
 * Unit tests for the Identity Stack P0 shadow-mode library.
 *
 * Tests:
 * - Contract lookup + validation
 * - Shape Δ computation
 * - Facts Δ computation
 * - Payload Δ computation
 * - IRS calculation
 * - Repair Plan generation
 * - Full pipeline (computeIdentityStackShadow)
 * - Fail-soft behavior
 * - Deterministic output
 *
 * Run: deno test supabase/functions/_shared/identityStackP0_test.ts --allow-none
 */

import { assertEquals, assert, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import type { StoredCIP } from "./ncpTypes.ts";
import {
  getProjectionContract,
  validateProjectionContract,
  listProjectionTypes,
  isDimensionIgnored,
  isDimensionInScope,
} from "./identityStackP0/projectionContracts.ts";
import { computeShapeDelta } from "./identityStackP0/shapeDelta.ts";
import { computeFactsDelta } from "./identityStackP0/factsDelta.ts";
import { computePayloadDelta } from "./identityStackP0/payloadDelta.ts";
import { computeIRS } from "./identityStackP0/irs.ts";
import { generateRepairPlan } from "./identityStackP0/repairPlan.ts";
import { computeIdentityDelta } from "./identityStackP0/identityDelta.ts";
import { computeIdentityStackShadow } from "./identityStackP0/index.ts";

// ── Test Fixtures ──────────────────────────────────────────────────────────

const SAMPLE_SCREENPLAY = `INT. SARAH'S APARTMENT - DAY

SARAH (30s, weary) sits at a cluttered desk.

SARAH
I can't do this anymore.

INT. OFFICE - DAY

AKARI (40s, professional) types at a computer.

AKARI
(without looking up)
You've been saying that for weeks.

EXT. PARK - DUSK

Sarah and Akari walk together.

SARAH
What if we just walked away?

AKARI
From all of it?

The scene is the midpoint of their journey.`;

const SAMPLE_CIP: StoredCIP = {
  version: 1,
  extracted_at: new Date().toISOString(),
  extracted_from: {
    treatment_version_id: "t1",
    character_bible_version_id: "cb1",
    story_outline_version_id: "so1",
    beat_sheet_version_id: "bs1",
  },
  facts: {
    characters: [
      { name: "Sarah", role: "protagonist" },
      { name: "Akari", role: "supporting" },
    ],
    key_events: [{ description: "Sarah decides to leave" }],
    relationships: [{ pair: ["Sarah", "Akari"] }],
    setting: { world: "Contemporary city", time_period: "Contemporary" },
  },
  payload: {
    genre: "Prestige Drama",
    primitives: {
      pressure: "Escalation-driven pressure",
      transformation: "Internal character change",
      connection: "Relational dynamics",
    },
  },
  theme: {
    central_question: "Can acceptance heal what justice cannot reach?",
  },
  narrative_shape: {
    total_estimated_scenes: 45,
    act_distribution: [
      { act: 1, estimated_scenes: 14 },
      { act: 2, estimated_scenes: 22 },
      { act: 3, estimated_scenes: 9 },
    ],
    trajectory: "rising_falling",
    key_positions: [
      { label: "Opening Image", estimated_scene: 1 },
      { label: "Inciting Incident", estimated_scene: 8 },
      { label: "Midpoint", estimated_scene: 25 },
    ],
    three_sentence_summary: "A story about acceptance and healing.",
  },
};

const SAMPLE_PROJECTION_TYPE = "feature_script";

// ── 1. Contract Lookup ─────────────────────────────────────────────────────

Deno.test("projectionContracts: returns contract for known type", () => {
  const contract = getProjectionContract("feature_script");
  assert(contract !== null, "feature_script contract should exist");
  assertEquals(contract?.projection_type, "feature_script");
  assertEquals(contract?.irs_threshold, 80);
});

Deno.test("projectionContracts: returns null for unknown type", () => {
  const contract = getProjectionContract("not_a_real_type");
  assertEquals(contract, null);
});

Deno.test("projectionContracts: validates all 6 registered types", () => {
  const types = listProjectionTypes();
  assertEquals(types.length, 6);
  assert(types.includes("feature_script"));
  assert(types.includes("treatment"));
  assert(types.includes("beat_sheet"));
  assert(types.includes("production_draft"));
  assert(types.includes("hero_frames"));
  assert(types.includes("lookbook"));
});

Deno.test("projectionContracts: validates known type returns valid", () => {
  const result = validateProjectionContract("feature_script");
  assertEquals(result.valid, true);
  assertEquals(result.errors.length, 0);
});

Deno.test("projectionContracts: validates unknown type returns invalid", () => {
  const result = validateProjectionContract("unknown");
  assertEquals(result.valid, false);
  assert(result.errors.length > 0);
});

Deno.test("projectionContracts: production_draft ignores payload and theme", () => {
  assert(isDimensionIgnored("production_draft", "payload"));
  assert(isDimensionIgnored("production_draft", "theme"));
  assert(!isDimensionIgnored("production_draft", "shape"));
  assert(!isDimensionInScope("production_draft", "payload"));
  assert(!isDimensionInScope("production_draft", "theme"));
  assert(isDimensionInScope("production_draft", "shape"));
});

// ── 2. Shape Δ ─────────────────────────────────────────────────────────────

Deno.test("shapeDelta: counts sluglines correctly", () => {
  const delta = computeShapeDelta(SAMPLE_SCREENPLAY, SAMPLE_CIP);
  assert(delta.available, "Shape delta should be available");
  assertEquals(delta.scene_count.observed, 3);
});

Deno.test("shapeDelta: detects scene count deviation", () => {
  const delta = computeShapeDelta(SAMPLE_SCREENPLAY, SAMPLE_CIP);
  assertEquals(delta.scene_count.expected, 45);
  assertEquals(delta.scene_count.delta, 3 - 45); // -42 scenes
  assert(delta.sps !== null && delta.sps < 50); // Large deviation → low SPS
});

Deno.test("shapeDelta: returns unavailable for empty input", () => {
  const delta = computeShapeDelta("", SAMPLE_CIP);
  assertEquals(delta.available, false);
  assertEquals(delta.scene_count.observed, null);
});

Deno.test("shapeDelta: returns unavailable for null input", () => {
  const delta = computeShapeDelta(null, SAMPLE_CIP);
  assertEquals(delta.available, false);
});

Deno.test("shapeDelta: handles missing CIP gracefully", () => {
  const delta = computeShapeDelta(SAMPLE_SCREENPLAY, null);
  assert(delta.available, "Should be available from document alone");
  assertEquals(delta.scene_count.expected, null); // No CIP → no expected
  assertEquals(delta.scene_count.observed, 3);
  assertEquals(delta.sps, null); // No CIP → no SPS
});

// ── 3. Facts Δ ─────────────────────────────────────────────────────────────

Deno.test("factsDelta: detects characters present in document", () => {
  const delta = computeFactsDelta(SAMPLE_SCREENPLAY, SAMPLE_CIP);
  assert(delta.available);
  assert(delta.characters_present.includes("Sarah"), "Sarah should be present");
  assert(delta.characters_present.includes("AKARI") || delta.characters_present.includes("Akari"),
    "Akari should be present (upper or mixed case)");
});

Deno.test("factsDelta: detects characters present handles upper case dialogue cues", () => {
  // In screenplay formatting, character names appear in ALL CAPS
  const screenplay = `SARAH\nI can't do this.\n\nAKARI (V.O.)\nYes you can.`;
  const delta = computeFactsDelta(screenplay, SAMPLE_CIP);
  assert(delta.available);
  // At least one CIP character should be detected via dialogue cues
  assert(delta.characters_present.length > 0, "Should detect at least one character");
});

Deno.test("factsDelta: returns null fidelity when CIP has no characters", () => {
  const emptyCip: StoredCIP = {
    ...SAMPLE_CIP,
    facts: { ...SAMPLE_CIP.facts, characters: [] },
  };
  const delta = computeFactsDelta(SAMPLE_SCREENPLAY, emptyCip);
  assertEquals(delta.fact_fidelity, null);
});

Deno.test("factsDelta: handles null CIP gracefully", () => {
  const delta = computeFactsDelta(SAMPLE_SCREENPLAY, null);
  assertEquals(delta.fact_fidelity, null); // No CIP → no baseline
});

Deno.test("factsDelta: handles null text gracefully", () => {
  const delta = computeFactsDelta(null, SAMPLE_CIP);
  assertEquals(delta.available, false);
});

// ── 4. Payload Δ ───────────────────────────────────────────────────────────

Deno.test("payloadDelta: returns unavailable when no scene data provided", () => {
  const delta = computePayloadDelta(null, SAMPLE_CIP);
  assertEquals(delta.available, false);
});

Deno.test("payloadDelta: computes function distribution from scene data", () => {
  const scenes = [
    { function_type: "conflict" },
    { function_type: "conflict" },
    { function_type: "reveal" },
    { function_type: "aftermath" },
    { function_type: "character_moment" },
  ];
  const delta = computePayloadDelta(scenes, SAMPLE_CIP);
  assert(delta.available);
  assertEquals(delta.function_distribution["conflict"]?.observed, 2);
  assertEquals(delta.function_distribution["reveal"]?.observed, 1);
});

Deno.test("payloadDelta: computes PRS from function distribution", () => {
  const scenes = Array(10).fill({ function_type: "conflict" });
  const delta = computePayloadDelta(scenes, SAMPLE_CIP);
  assert(delta.available);
  assert(delta.prs !== null);
  assert(delta.prs >= 0 && delta.prs <= 100);
});

// ── 5. Identity Delta Orchestrator ─────────────────────────────────────────

Deno.test("identityDelta: computes complete delta from all available data", () => {
  const delta = computeIdentityDelta(SAMPLE_SCREENPLAY, SAMPLE_CIP);
  assert(delta.shape_delta.available);
  assert(delta.facts_delta.available);
  assert(!delta.theme_delta.available); // Theme skipped in P0
  assertEquals(delta.theme_delta.reason, "Theme Δ requires LLM — skipped in Phase 7.2A P0");
  assert(delta.warnings.length >= 0);
});

Deno.test("identityDelta: includes warnings for unavailable dimensions", () => {
  const delta = computeIdentityDelta(SAMPLE_SCREENPLAY, SAMPLE_CIP);
  // Payload should warn since no DAB/scene data provided
  assert(delta.warnings.some(w => w.includes("Payload") || w.includes("Shape")));
});

Deno.test("identityDelta: handles null text gracefully", () => {
  const delta = computeIdentityDelta(null, SAMPLE_CIP);
  assertEquals(delta.shape_delta.available, false);
  assertEquals(delta.facts_delta.available, false);
});

Deno.test("identityDelta: handles null CIP gracefully", () => {
  const delta = computeIdentityDelta(SAMPLE_SCREENPLAY, null);
  assert(delta.shape_delta.available); // Shape from doc alone
  assertEquals(delta.shape_delta.scene_count.expected, null);
  assertEquals(delta.facts_delta.fact_fidelity, null);
});

// ── 6. IRS ─────────────────────────────────────────────────────────────────

Deno.test("IRS: returns unmeasurable for null delta", () => {
  const result = computeIRS(null, null);
  assertEquals(result.score, null);
  assertEquals(result.graded_as, "unmeasurable");
});

Deno.test("IRS: computes score from available dimensions", () => {
  const delta = computeIdentityDelta(SAMPLE_SCREENPLAY, SAMPLE_CIP);
  const contract = getProjectionContract("feature_script");
  const result = computeIRS(delta, contract);
  // Should have a score (shape + facts available)
  assert(result.score !== null, "IRS score should not be null");
  assert(result.score >= 0 && result.score <= 100);
  assertEquals(result.contract_id, "feature_script_v1");
});

Deno.test("IRS: respects contract ignored dimensions (production_draft)", () => {
  const delta = computeIdentityDelta(SAMPLE_SCREENPLAY, SAMPLE_CIP);
  const contract = getProjectionContract("production_draft");
  const result = computeIRS(delta, contract);
  assert(result.warnings.some(w => w.includes("Payload") || w.includes("ignored")));
});

Deno.test("IRS: grades correctly for good scores", () => {
  // Create a perfectly-matching delta (scene count matches exactly)
  const highFidelityCip: StoredCIP = {
    ...SAMPLE_CIP,
    narrative_shape: {
      ...SAMPLE_CIP.narrative_shape,
      total_estimated_scenes: 3, // matches our 3-scene fixture
    },
  };
  const delta = computeIdentityDelta(SAMPLE_SCREENPLAY, highFidelityCip);
  const contract = getProjectionContract("feature_script");
  const result = computeIRS(delta, contract);
  // Should grade acceptable or better — IRS with matching scene count
  // (3 exact-match scenes → SPS=100, 2 CIP chars → Fact=100 → IRS ≈ 100)
  assert(result.score !== null, "IRS should have a score");
  assert(result.score >= 80, "IRS should be >= 80 for matching document");
  assert(
    result.graded_as === "convergent" || result.graded_as === "acceptable",
    "Should grade convergent or acceptable for matching doc",
  );
});

// ── 7. Repair Plan ─────────────────────────────────────────────────────────

Deno.test("repairPlan: returns no operations for null delta", () => {
  const plan = generateRepairPlan(null);
  assertEquals(plan.available, false);
  assertEquals(plan.operations.length, 0);
});

Deno.test("repairPlan: generates operations from delta with deviations", () => {
  const delta = computeIdentityDelta(SAMPLE_SCREENPLAY, SAMPLE_CIP);
  const plan = generateRepairPlan(delta);
  // Scene count deviation of -42 should trigger S1
  assert(plan.operations.length > 0, "Should generate at least one operation");
  const shapeOps = plan.operations.filter(op => op.dimension === "shape");
  assert(shapeOps.length > 0, "Should have shape operations");
});

Deno.test("repairPlan: all operations have proposed status", () => {
  const delta = computeIdentityDelta(SAMPLE_SCREENPLAY, SAMPLE_CIP);
  const plan = generateRepairPlan(delta);
  for (const op of plan.operations) {
    assertEquals(op.status, "proposed");
  }
});

Deno.test("repairPlan: operations sorted by severity", () => {
  const delta = computeIdentityDelta(SAMPLE_SCREENPLAY, SAMPLE_CIP);
  const plan = generateRepairPlan(delta);
  const severityOrder = ["critical", "high", "medium", "low"];
  let lastSeverity = -1;
  for (const op of plan.operations) {
    const idx = severityOrder.indexOf(op.severity);
    assert(idx >= lastSeverity, `Operation ${op.operation_id} severity ${op.severity} out of order`);
    lastSeverity = idx;
  }
});

// ── 8. Full Stack Shadow ───────────────────────────────────────────────────

Deno.test("computeIdentityStackShadow: returns null without required inputs", () => {
  const result = computeIdentityStackShadow(null, "feature_script", null);
  assertEquals(result, null);
});

Deno.test("computeIdentityStackShadow: returns null without projection type", () => {
  const result = computeIdentityStackShadow(SAMPLE_SCREENPLAY, null, null);
  assertEquals(result, null);
});

Deno.test("computeIdentityStackShadow: computes complete shadow with all inputs", () => {
  const result = computeIdentityStackShadow(
    SAMPLE_SCREENPLAY,
    "feature_script",
    SAMPLE_CIP,
  );
  assert(result !== null, "Result should not be null");
  assert(result.identity_delta !== null);
  assert(result.irs !== null);
  assert(result.repair_plan !== null);
  assert(result.metadata.available);
  assert(result.metadata.version === 1);
  assert(result.metadata.compute_ms >= 0);
});

Deno.test("computeIdentityStackShadow: metadata indicates CIP availability", () => {
  const result = computeIdentityStackShadow(
    SAMPLE_SCREENPLAY,
    "feature_script",
    SAMPLE_CIP,
  );
  assert(result !== null);
  assertEquals(result.metadata.cip_available, true);
  assertEquals(result.metadata.dab_available, false);
});

Deno.test("computeIdentityStackShadow: validation and convergence are null until 7.2B", () => {
  const result = computeIdentityStackShadow(
    SAMPLE_SCREENPLAY,
    "feature_script",
    SAMPLE_CIP,
  );
  assert(result !== null);
  assertEquals(result.validation, null);
  assertEquals(result.convergence, null);
});

// ── 9. Determinism ─────────────────────────────────────────────────────────

Deno.test("determinism: same inputs produce same shape delta", () => {
  const delta1 = computeShapeDelta(SAMPLE_SCREENPLAY, SAMPLE_CIP);
  const delta2 = computeShapeDelta(SAMPLE_SCREENPLAY, SAMPLE_CIP);
  assertEquals(delta1.scene_count.observed, delta2.scene_count.observed);
  assertEquals(delta1.scene_count.delta, delta2.scene_count.delta);
  assertEquals(delta1.sps, delta2.sps);
});

Deno.test("determinism: same inputs produce same facts delta", () => {
  const delta1 = computeFactsDelta(SAMPLE_SCREENPLAY, SAMPLE_CIP);
  const delta2 = computeFactsDelta(SAMPLE_SCREENPLAY, SAMPLE_CIP);
  assertEquals(delta1.characters_present.length, delta2.characters_present.length);
  assertEquals(delta1.fact_fidelity, delta2.fact_fidelity);
});

Deno.test("determinism: same inputs produce same repair plan", () => {
  const delta = computeIdentityDelta(SAMPLE_SCREENPLAY, SAMPLE_CIP);
  const plan1 = generateRepairPlan(delta);
  const plan2 = generateRepairPlan(delta);
  assertEquals(plan1.operations.length, plan2.operations.length);
  assertEquals(plan1.effort, plan2.effort);
});
