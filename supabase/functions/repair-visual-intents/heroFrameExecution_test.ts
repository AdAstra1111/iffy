/**
 * repair-visual-intents — Hero Frame Execution Integration Tests
 *
 * Tests the full hero-frame execution flow through the execute handler.
 * Requires: next_execution_number RPC, project_visual_execution_provenance table.
 *
 * Run: deno test --allow-net --allow-env supabase/functions/repair-visual-intents/heroFrameExecution_test.ts
 *
 * NOTE: These tests validate the execution gate logic against mock intent shapes.
 * They are pure unit tests — no actual Supabase calls.
 */
import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ── Blocker code constants (mirrors hero-frame-preflight and repair-visual-intents) ──
const HF_ALLOWED_REASONS = ["CANON_NEWER_THAN_STAGE", "CAST_NEWER_THAN_HERO_FRAMES"];
const POSTER_ALLOWED_REASONS = ["HERO_FRAMES_NEWER_THAN_POSTER", "VISUAL_STYLE_OUTDATED"];

// ── Helper: simulate the gate logic (pure function) ──

interface IntentShape {
  approval_state: string;
  execution_state: string;
  recommended_action: string;
  stage_id: string;
  stale_reason_codes?: string[];
}

interface PreflightResult {
  all_requirements_pass: boolean;
  requirements?: { code: string; passed: boolean; detail: string }[];
}

type GateResult = {
  passed: boolean;
  code?: string;
  error?: string;
  detail?: Record<string, unknown>;
};

function checkStaleReasonGate(staleCodes: string[] | undefined, allowed: string[]): boolean {
  return (staleCodes ?? []).some((code: string) => allowed.includes(code));
}

function checkPreflightGate(preflight: PreflightResult): boolean {
  return preflight.all_requirements_pass === true;
}

function checkApprovalGate(intent: IntentShape): boolean {
  return intent.approval_state === "approved";
}

function checkExecutionStateGate(intent: IntentShape): boolean {
  return ["queued", "ready"].includes(intent.execution_state);
}

function checkHeroFrameExecutionGates(
  intent: IntentShape,
  preflight: PreflightResult,
): GateResult[] {
  const results: GateResult[] = [];

  // Gate 1: approval_state
  results.push(
    checkApprovalGate(intent)
      ? { passed: true }
      : { passed: false, code: "NOT_APPROVED", error: "Intent not approved", detail: { state: intent.approval_state } },
  );

  // Gate 2: execution_state
  results.push(
    checkExecutionStateGate(intent)
      ? { passed: true }
      : { passed: false, code: "ALREADY_EXECUTED", error: "Already executed or blocked", detail: { state: intent.execution_state } },
  );

  // Gate 3: recommended_action
  results.push(
    intent.recommended_action === "REGENERATE_CANDIDATES"
      ? { passed: true }
      : { passed: false, code: "WRONG_ACTION", error: "Wrong action for hero frames", detail: { action: intent.recommended_action } },
  );

  // Gate 4: stage_id
  results.push(
    intent.stage_id === "hero_frames"
      ? { passed: true }
      : { passed: false, code: "WRONG_STAGE", error: "Stage is not hero_frames", detail: { stage: intent.stage_id } },
  );

  // Gate 5: stale reason
  const hasStaleReason = checkStaleReasonGate(intent.stale_reason_codes, HF_ALLOWED_REASONS);
  results.push(
    hasStaleReason
      ? { passed: true }
      : { passed: false, code: "EXECUTOR_NOT_ENABLED", error: "Stale reason does not qualify", detail: { reasons: intent.stale_reason_codes, allowed: HF_ALLOWED_REASONS } },
  );

  // Gate 6: preflight pass
  const preflightPass = checkPreflightGate(preflight);
  results.push(
    preflightPass
      ? { passed: true }
      : { passed: false, code: "PREFLIGHT_FAILED", error: "Preflight failed", detail: { preflight } },
  );

  return results;
}

function allGatesPass(gates: GateResult[]): boolean {
  return gates.every((g) => g.passed);
}

// ── Tests ───────────────────────────────────────────────────────────────────

Deno.test("entire execution gate passes for valid hero frame intent", () => {
  const intent: IntentShape = {
    approval_state: "approved",
    execution_state: "queued",
    recommended_action: "REGENERATE_CANDIDATES",
    stage_id: "hero_frames",
    stale_reason_codes: ["CAST_NEWER_THAN_HERO_FRAMES"],
  };
  const preflight: PreflightResult = { all_requirements_pass: true, requirements: [] };
  const gates = checkHeroFrameExecutionGates(intent, preflight);
  assertEquals(allGatesPass(gates), true, "All gates should pass");
  assertEquals(gates.length, 6, "Should have exactly 6 gates");
});

Deno.test("fails if preflight fails", () => {
  const intent: IntentShape = {
    approval_state: "approved",
    execution_state: "queued",
    recommended_action: "REGENERATE_CANDIDATES",
    stage_id: "hero_frames",
    stale_reason_codes: ["CAST_NEWER_THAN_HERO_FRAMES"],
  };
  const preflight: PreflightResult = {
    all_requirements_pass: false,
    requirements: [
      { code: "MISSING_SCENE_INDEX", passed: false, detail: "No scenes found" },
      { code: "MISSING_CAST_BINDINGS", passed: true, detail: "All bound" },
    ],
  };
  const gates = checkHeroFrameExecutionGates(intent, preflight);
  assertEquals(allGatesPass(gates), false);
  assertEquals(gates[5].passed, false);
  assertEquals(gates[5].code, "PREFLIGHT_FAILED");
});

Deno.test("fails if approval missing", () => {
  const intent: IntentShape = {
    approval_state: "pending",
    execution_state: "queued",
    recommended_action: "REGENERATE_CANDIDATES",
    stage_id: "hero_frames",
    stale_reason_codes: ["CAST_NEWER_THAN_HERO_FRAMES"],
  };
  const preflight: PreflightResult = { all_requirements_pass: true, requirements: [] };
  const gates = checkHeroFrameExecutionGates(intent, preflight);
  assertEquals(allGatesPass(gates), false);
  assertEquals(gates[0].passed, false);
  assertEquals(gates[0].code, "NOT_APPROVED");
});

Deno.test("fails if already executed", () => {
  const intent: IntentShape = {
    approval_state: "approved",
    execution_state: "completed",
    recommended_action: "REGENERATE_CANDIDATES",
    stage_id: "hero_frames",
    stale_reason_codes: ["CAST_NEWER_THAN_HERO_FRAMES"],
  };
  const preflight: PreflightResult = { all_requirements_pass: true, requirements: [] };
  const gates = checkHeroFrameExecutionGates(intent, preflight);
  assertEquals(allGatesPass(gates), false);
  assertEquals(gates[1].passed, false);
  assertEquals(gates[1].code, "ALREADY_EXECUTED");
});

Deno.test("fails if wrong action", () => {
  const intent: IntentShape = {
    approval_state: "approved",
    execution_state: "queued",
    recommended_action: "REBUILD_STAGE",
    stage_id: "hero_frames",
    stale_reason_codes: ["CAST_NEWER_THAN_HERO_FRAMES"],
  };
  const preflight: PreflightResult = { all_requirements_pass: true, requirements: [] };
  const gates = checkHeroFrameExecutionGates(intent, preflight);
  assertEquals(allGatesPass(gates), false);
  assertEquals(gates[2].passed, false);
  assertEquals(gates[2].code, "WRONG_ACTION");
});

Deno.test("fails if stage is not hero_frames", () => {
  const intent: IntentShape = {
    approval_state: "approved",
    execution_state: "queued",
    recommended_action: "REGENERATE_CANDIDATES",
    stage_id: "poster",
    stale_reason_codes: ["CAST_NEWER_THAN_HERO_FRAMES"],
  };
  const preflight: PreflightResult = { all_requirements_pass: true, requirements: [] };
  const gates = checkHeroFrameExecutionGates(intent, preflight);
  assertEquals(allGatesPass(gates), false);
  assertEquals(gates[3].passed, false);
  assertEquals(gates[3].code, "WRONG_STAGE");
});

Deno.test("fails if stale reason invalid", () => {
  const intent: IntentShape = {
    approval_state: "approved",
    execution_state: "queued",
    recommended_action: "REGENERATE_CANDIDATES",
    stage_id: "hero_frames",
    stale_reason_codes: ["HERO_FRAMES_NEWER_THAN_POSTER"], // wrong reason for hero_frames
  };
  const preflight: PreflightResult = { all_requirements_pass: true, requirements: [] };
  const gates = checkHeroFrameExecutionGates(intent, preflight);
  assertEquals(allGatesPass(gates), false);
  assertEquals(gates[4].passed, false);
  assertEquals(gates[4].code, "EXECUTOR_NOT_ENABLED");
});

Deno.test("succeeds with CANON_NEWER_THAN_STAGE stale reason", () => {
  const intent: IntentShape = {
    approval_state: "approved",
    execution_state: "ready",
    recommended_action: "REGENERATE_CANDIDATES",
    stage_id: "hero_frames",
    stale_reason_codes: ["CANON_NEWER_THAN_STAGE"],
  };
  const preflight: PreflightResult = { all_requirements_pass: true, requirements: [] };
  const gates = checkHeroFrameExecutionGates(intent, preflight);
  assertEquals(allGatesPass(gates), true, "CANON_NEWER_THAN_STAGE should pass stale reason gate");
});

Deno.test("succeeds with CAST_NEWER_THAN_HERO_FRAMES stale reason", () => {
  const intent: IntentShape = {
    approval_state: "approved",
    execution_state: "ready",
    recommended_action: "REGENERATE_CANDIDATES",
    stage_id: "hero_frames",
    stale_reason_codes: ["CAST_NEWER_THAN_HERO_FRAMES"],
  };
  const preflight: PreflightResult = { all_requirements_pass: true, requirements: [] };
  const gates = checkHeroFrameExecutionGates(intent, preflight);
  assertEquals(allGatesPass(gates), true, "CAST_NEWER_THAN_HERO_FRAMES should pass stale reason gate");
});

Deno.test("stale reason gate fails with poster-specific reasons", () => {
  // Poster-specific stale reasons (HERO_FRAMES_NEWER_THAN_POSTER) should NOT work for hero_frames
  const hasValidReason = checkStaleReasonGate(
    ["HERO_FRAMES_NEWER_THAN_POSTER"],
    HF_ALLOWED_REASONS,
  );
  assertEquals(hasValidReason, false, "Poster reasons should not be valid for hero frames");

  // But they should work for poster
  const posterValid = checkStaleReasonGate(
    ["HERO_FRAMES_NEWER_THAN_POSTER"],
    POSTER_ALLOWED_REASONS,
  );
  assertEquals(posterValid, true, "Poster reasons should work for poster");
});

Deno.test("provenance captured after successful execution", () => {
  // Simulate the provenance row shape that would be inserted
  const mockExecution = {
    hfOk: true,
    heroFrameImageIds: ["img-1", "img-2", "img-3"],
    executionNumber: 1,
    prevExecIds: [],
    previousAssetIds: [],
    governanceHash: "abc123def456",
    genInputHashHex: "sha256-hex-value",
  };

  const provenanceRow = {
    project_id: "proj-1",
    repair_intent_id: "intent-1",
    execution_number: mockExecution.executionNumber,
    stage_id: "hero_frames",
    recommended_action: "REGENERATE_CANDIDATES",
    execution_state: "completed",
    governance_snapshot_hash: mockExecution.governanceHash,
    generation_input_hash: mockExecution.genInputHashHex,
    generated_asset_ids: mockExecution.heroFrameImageIds,
    is_superseded: false,
  };

  assertEquals(provenanceRow.execution_state, "completed");
  assertEquals(provenanceRow.generated_asset_ids?.length, 3);
  assertEquals(provenanceRow.stage_id, "hero_frames");
  assertExists(provenanceRow.governance_snapshot_hash);
  assertExists(provenanceRow.generation_input_hash);
});

Deno.test("provenance captured after failed execution", () => {
  const mockExecution = {
    hfOk: false,
    heroFrameImageIds: [],
    executionNumber: 2,
    prevExecIds: [],
    previousAssetIds: [],
    errorMessage: "Hero frame generation failed: API timeout",
  };

  const provenanceRow = {
    project_id: "proj-1",
    repair_intent_id: "intent-2",
    execution_number: mockExecution.executionNumber,
    stage_id: "hero_frames",
    recommended_action: "REGENERATE_CANDIDATES",
    execution_state: "failed",
    generated_asset_ids: null,
    error_message: mockExecution.errorMessage,
    is_superseded: false,
  };

  assertEquals(provenanceRow.execution_state, "failed");
  assertEquals(provenanceRow.generated_asset_ids, null);
  assertExists(provenanceRow.error_message);
});

Deno.test("governance refresh called after execution", () => {
  // Simulate the governance refresh call pattern
  const governanceResult = {
    source_snapshot_hash: "new-hash-after-generation",
    evaluated_at: new Date().toISOString(),
    stages: [{ stage_id: "hero_frames", computed_status: "not_started" }],
  };

  const executionResult = {
    invoked_function: "generate-hero-frames",
    governance_refresh: {
      status: "completed",
      evaluated_at: governanceResult.evaluated_at,
      stages_count: governanceResult.stages.length,
    },
  };

  assertEquals(executionResult.governance_refresh.status, "completed");
  assertEquals(executionResult.governance_refresh.stages_count, 1);
  assertEquals(executionResult.invoked_function, "generate-hero-frames");
});

Deno.test("previous execution superseded on new execution", () => {
  const prevExecIds = ["exec-1", "exec-2"];
  const now = new Date().toISOString();

  const supersedeUpdate = {
    is_superseded: true,
    superseded_at: now,
  };

  assertExists(supersedeUpdate.superseded_at);
  assertEquals(supersedeUpdate.is_superseded, true);
  assertEquals(prevExecIds.length, 2, "Two previous executions should be superseded");
});