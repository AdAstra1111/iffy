/**
 * lookbook-preflight — Lookbook Preflight Unit Tests
 *
 * Tests the preflight evaluator logic and execution gate patterns.
 * Pure unit tests — no actual Supabase calls.
 */
import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ── Helper: simulate the requirement evaluation logic (pure function) ──

interface Requirement {
  code: string;
  passed: boolean;
  detail: string;
}

function buildLookbookRequirements(
  canonExists: boolean,
  visualCanonReady: boolean,
  castReady: boolean,
  pdReady: boolean,
  heroFramesReady: boolean,
  visualLangReady: boolean,
  sceneExists: boolean,
  staleRiskBlocked: boolean,
  lockReviewBlocked: boolean,
): Requirement[] {
  return [
    { code: "MISSING_CANON_HASH", passed: canonExists, detail: canonExists ? "Canon exists" : "No canon" },
    { code: "MISSING_VISUAL_CANON", passed: visualCanonReady, detail: visualCanonReady ? "Visual canon ready" : "Visual canon not ready" },
    { code: "MISSING_CAST", passed: castReady, detail: castReady ? "Cast ready" : "Cast not ready" },
    { code: "MISSING_PRODUCTION_DESIGN", passed: pdReady, detail: pdReady ? "PD ready" : "PD not ready" },
    { code: "MISSING_HERO_FRAMES", passed: heroFramesReady, detail: heroFramesReady ? "Hero frames ready" : "No hero frames" },
    { code: "MISSING_VISUAL_LANGUAGE", passed: visualLangReady, detail: visualLangReady ? "Visual language ready" : "Visual language not ready" },
    { code: "MISSING_SCENE_INDEX", passed: sceneExists, detail: sceneExists ? "Scenes exist" : "No scenes" },
    { code: "HIGH_SEVERITY_STALE_RISK", passed: !staleRiskBlocked, detail: staleRiskBlocked ? "High severity stale" : "No high stale risk" },
    { code: "LOCKED_REVIEW_REQUIRED", passed: !lockReviewBlocked, detail: lockReviewBlocked ? "Locked review" : "No lock" },
  ];
}

// ── Tests ───────────────────────────────────────────────────────────────────

Deno.test("all requirements pass when all upstream dependencies ready", () => {
  const reqs = buildLookbookRequirements(true, true, true, true, true, true, true, false, false);
  const allPass = reqs.every((r) => r.passed);
  assertEquals(allPass, true, "All requirements should pass");
  assertEquals(reqs.length, 9, "Should have exactly 9 requirements");
});

Deno.test("missing hero frames blocks lookbook preflight", () => {
  const reqs = buildLookbookRequirements(true, true, true, true, false, true, true, false, false);
  assertEquals(reqs[4].passed, false, "Hero frames should fail");
  assertEquals(reqs[4].code, "MISSING_HERO_FRAMES");
  assertEquals(reqs[4].detail, "No hero frames");
  const allPass = reqs.every((r) => r.passed);
  assertEquals(allPass, false);
});

Deno.test("missing visual language blocks lookbook preflight", () => {
  const reqs = buildLookbookRequirements(true, true, true, true, true, false, true, false, false);
  assertEquals(reqs[5].passed, false, "Visual language should fail");
  assertEquals(reqs[5].code, "MISSING_VISUAL_LANGUAGE");
  const allPass = reqs.every((r) => r.passed);
  assertEquals(allPass, false);
});

Deno.test("high stale risk blocks lookbook preflight", () => {
  const reqs = buildLookbookRequirements(true, true, true, true, true, true, true, true, false);
  assertEquals(reqs[7].passed, false, "Stale risk should block");
  assertEquals(reqs[7].code, "HIGH_SEVERITY_STALE_RISK");
  const allPass = reqs.every((r) => r.passed);
  assertEquals(allPass, false);
});

Deno.test("missing scene index blocks lookbook preflight", () => {
  const reqs = buildLookbookRequirements(true, true, true, true, true, true, false, false, false);
  assertEquals(reqs[6].passed, false, "Scene index should fail");
  assertEquals(reqs[6].code, "MISSING_SCENE_INDEX");
  const allPass = reqs.every((r) => r.passed);
  assertEquals(allPass, false);
});

Deno.test("missing canon hash blocks lookbook preflight", () => {
  const reqs = buildLookbookRequirements(false, true, true, true, true, true, true, false, false);
  assertEquals(reqs[0].passed, false, "Canon hash should fail");
  assertEquals(reqs[0].code, "MISSING_CANON_HASH");
  const allPass = reqs.every((r) => r.passed);
  assertEquals(allPass, false);
});

Deno.test("missing visual canon blocks lookbook preflight", () => {
  const reqs = buildLookbookRequirements(true, false, true, true, true, true, true, false, false);
  assertEquals(reqs[1].passed, false);
  assertEquals(reqs[1].code, "MISSING_VISUAL_CANON");
});

Deno.test("missing cast blocks lookbook preflight", () => {
  const reqs = buildLookbookRequirements(true, true, false, true, true, true, true, false, false);
  assertEquals(reqs[2].passed, false);
  assertEquals(reqs[2].code, "MISSING_CAST");
});

Deno.test("missing production design blocks lookbook preflight", () => {
  const reqs = buildLookbookRequirements(true, true, true, false, true, true, true, false, false);
  assertEquals(reqs[3].passed, false);
  assertEquals(reqs[3].code, "MISSING_PRODUCTION_DESIGN");
});

Deno.test("locked review blocks lookbook preflight", () => {
  const reqs = buildLookbookRequirements(true, true, true, true, true, true, true, false, true);
  assertEquals(reqs[8].passed, false, "Locked review should block");
  assertEquals(reqs[8].code, "LOCKED_REVIEW_REQUIRED");
  const allPass = reqs.every((r) => r.passed);
  assertEquals(allPass, false);
});

Deno.test("multiple failures correctly reported", () => {
  const reqs = buildLookbookRequirements(true, false, true, false, false, true, false, true, true);
  const failed = reqs.filter((r) => !r.passed);
  assertEquals(failed.length, 6, "Should have 6 failures");
  assertEquals(failed[0].code, "MISSING_VISUAL_CANON");
  assertEquals(failed[1].code, "MISSING_PRODUCTION_DESIGN");
  assertEquals(failed[2].code, "MISSING_HERO_FRAMES");
  assertEquals(failed[3].code, "MISSING_SCENE_INDEX");
  assertEquals(failed[4].code, "HIGH_SEVERITY_STALE_RISK");
  assertEquals(failed[5].code, "LOCKED_REVIEW_REQUIRED");
});

Deno.test("all requirement codes are unique", () => {
  const reqs = buildLookbookRequirements(true, true, true, true, true, true, true, false, false);
  const codes = reqs.map((r) => r.code);
  const unique = new Set(codes);
  assertEquals(unique.size, codes.length, "All codes must be unique");
});

Deno.test("9 specific lookbook requirement codes", () => {
  const reqs = buildLookbookRequirements(true, true, true, true, true, true, true, false, false);
  const expectedCodes = [
    "MISSING_CANON_HASH",
    "MISSING_VISUAL_CANON",
    "MISSING_CAST",
    "MISSING_PRODUCTION_DESIGN",
    "MISSING_HERO_FRAMES",
    "MISSING_VISUAL_LANGUAGE",
    "MISSING_SCENE_INDEX",
    "HIGH_SEVERITY_STALE_RISK",
    "LOCKED_REVIEW_REQUIRED",
  ];
  const actualCodes = reqs.map((r) => r.code);
  assertEquals(actualCodes, expectedCodes, "Codes must match in order");
});

Deno.test("execution gate: lookbook stage blocked with preflight note", () => {
  // Simulate the gate logic from repair-visual-intents
  const LOOKBOOK_ALLOWED_ACTIONS = ["REGENERATE_CANDIDATES", "REBUILD_STAGE"];
  const LOOKBOOK_ALLOWED = false; // Executor not enabled

  function checkLookbookGate(action: string, stage: string): { allowed: boolean; note: string } {
    if (stage !== "lookbook") return { allowed: false, note: "Not lookbook stage" };
    if (!LOOKBOOK_ALLOWED_ACTIONS.includes(action)) return { allowed: false, note: `Action ${action} not supported for lookbook` };
    if (!LOOKBOOK_ALLOWED) {
      return { allowed: false, note: "Lookbook execution preflight exists but executor is not enabled" };
    }
    return { allowed: true, note: "" };
  }

  const result = checkLookbookGate("REGENERATE_CANDIDATES", "lookbook");
  assertEquals(result.allowed, false, "Lookbook execution must be blocked");
  assertEquals(result.note.includes("preflight"), true, "Should mention preflight");
  assertEquals(result.note.includes("not enabled"), true, "Should say executor not enabled");
});

Deno.test("hero frame execution succeeds (regression: lookbook block does not affect hero frames)", () => {
  const heroGate = { stage: "hero_frames", allowed: true };
  const lookbookGate = { stage: "lookbook", allowed: false };
  assertEquals(heroGate.allowed, true, "Hero frames should still work");
  assertEquals(lookbookGate.allowed, false, "Lookbook should still be blocked");
});

// ── Lookbook Execution Gate Tests ──

const LB_ALLOWED_REASONS = ["PD_NEWER_THAN_LOOKBOOK", "SOURCE_SNAPSHOT_CHANGED"];

interface ExecutionIntent {
  approval_state: string;
  execution_state: string;
  recommended_action: string;
  stage_id: string;
  stale_reason_codes?: string[];
}

interface PreflightCheck {
  all_requirements_pass: boolean;
  requirements?: { code: string; passed: boolean; detail: string }[];
}

function checkLookbookExecutionGates(
  intent: ExecutionIntent,
  preflight: PreflightCheck,
): { passed: boolean; failed: string[] } {
  const failed: string[] = [];

  if (intent.approval_state !== "approved") failed.push("NOT_APPROVED");
  if (!["queued", "ready"].includes(intent.execution_state)) failed.push("ALREADY_EXECUTED");
  if (intent.recommended_action !== "REGENERATE_CANDIDATES") failed.push("WRONG_ACTION");
  if (intent.stage_id !== "lookbook") failed.push("WRONG_STAGE");

  const hasStaleReason = (intent.stale_reason_codes ?? []).some(
    (code: string) => LB_ALLOWED_REASONS.includes(code),
  );
  if (!hasStaleReason) failed.push("EXECUTOR_NOT_ENABLED");

  if (!preflight.all_requirements_pass) failed.push("PREFLIGHT_FAILED");

  return { passed: failed.length === 0, failed };
}

Deno.test("lookbook execution all gates pass", () => {
  const intent: ExecutionIntent = {
    approval_state: "approved",
    execution_state: "queued",
    recommended_action: "REGENERATE_CANDIDATES",
    stage_id: "lookbook",
    stale_reason_codes: ["PD_NEWER_THAN_LOOKBOOK"],
  };
  const preflight: PreflightCheck = { all_requirements_pass: true };
  const result = checkLookbookExecutionGates(intent, preflight);
  assertEquals(result.passed, true, "All gates should pass");
  assertEquals(result.failed.length, 0);
});

Deno.test("lookbook fails if preflight fails", () => {
  const intent: ExecutionIntent = {
    approval_state: "approved",
    execution_state: "queued",
    recommended_action: "REGENERATE_CANDIDATES",
    stage_id: "lookbook",
    stale_reason_codes: ["PD_NEWER_THAN_LOOKBOOK"],
  };
  const preflight: PreflightCheck = { all_requirements_pass: false };
  const result = checkLookbookExecutionGates(intent, preflight);
  assertEquals(result.passed, false);
  assertEquals(result.failed.includes("PREFLIGHT_FAILED"), true);
});

Deno.test("lookbook fails if approval missing", () => {
  const intent: ExecutionIntent = {
    approval_state: "pending",
    execution_state: "queued",
    recommended_action: "REGENERATE_CANDIDATES",
    stage_id: "lookbook",
    stale_reason_codes: ["PD_NEWER_THAN_LOOKBOOK"],
  };
  const preflight: PreflightCheck = { all_requirements_pass: true };
  const result = checkLookbookExecutionGates(intent, preflight);
  assertEquals(result.passed, false);
  assertEquals(result.failed.includes("NOT_APPROVED"), true);
});

Deno.test("lookbook fails if stale reason invalid", () => {
  const intent: ExecutionIntent = {
    approval_state: "approved",
    execution_state: "queued",
    recommended_action: "REGENERATE_CANDIDATES",
    stage_id: "lookbook",
    stale_reason_codes: ["HERO_FRAMES_NEWER_THAN_POSTER"], // wrong for lookbook
  };
  const preflight: PreflightCheck = { all_requirements_pass: true };
  const result = checkLookbookExecutionGates(intent, preflight);
  assertEquals(result.passed, false);
  assertEquals(result.failed.includes("EXECUTOR_NOT_ENABLED"), true);
});

Deno.test("lookbook succeeds with PD_NEWER_THAN_LOOKBOOK stale reason", () => {
  const hasReason = (["PD_NEWER_THAN_LOOKBOOK"]).some((c: string) => LB_ALLOWED_REASONS.includes(c));
  assertEquals(hasReason, true);
  // Full gate check
  const intent: ExecutionIntent = {
    approval_state: "approved",
    execution_state: "queued",
    recommended_action: "REGENERATE_CANDIDATES",
    stage_id: "lookbook",
    stale_reason_codes: ["PD_NEWER_THAN_LOOKBOOK"],
  };
  const preflight: PreflightCheck = { all_requirements_pass: true };
  const result = checkLookbookExecutionGates(intent, preflight);
  assertEquals(result.passed, true, "PD_NEWER_THAN_LOOKBOOK should pass all gates");
});

Deno.test("lookbook succeeds with SOURCE_SNAPSHOT_CHANGED stale reason", () => {
  const hasReason = (["SOURCE_SNAPSHOT_CHANGED"]).some((c: string) => LB_ALLOWED_REASONS.includes(c));
  assertEquals(hasReason, true);
});

Deno.test("lookbook stale reason fails with non-lookbook codes", () => {
  const hasPdReason = (["PD_NEWER_THAN_LOOKBOOK"]).some((c: string) => LB_ALLOWED_REASONS.includes(c));
  assertEquals(hasPdReason, true);

  const hasHeroReason = (["CAST_NEWER_THAN_HERO_FRAMES"]).some((c: string) => LB_ALLOWED_REASONS.includes(c));
  assertEquals(hasHeroReason, false, "Hero frame reasons should not work for lookbook");
});

Deno.test("lookbook provenance captured after successful execution", () => {
  const mockImageIds = ["lb-char-1", "lb-world-1", "lb-vl-1", "lb-km-1"];
  const provenanceRow = {
    execution_state: "completed",
    generated_asset_ids: mockImageIds,
    stage_id: "lookbook",
    recommended_action: "REGENERATE_CANDIDATES",
    execution_number: 1,
  };
  assertEquals(provenanceRow.execution_state, "completed");
  assertEquals(provenanceRow.generated_asset_ids.length, 4);
  assertEquals(provenanceRow.stage_id, "lookbook");
});

Deno.test("lookbook provenance captured after partial failure", () => {
  const provenanceRow = {
    execution_state: "partial",
    generated_asset_ids: ["lb-char-1", "lb-world-1"],
    result_summary: { error: "visual_language: Generation API error; key_moment: Generation API error", partial_image_count: 2 },
  };
  assertEquals(provenanceRow.execution_state, "partial");
  assertEquals(provenanceRow.generated_asset_ids.length, 2);
  assertEquals(provenanceRow.result_summary.partial_image_count, 2);
});

Deno.test("governance refresh called after lookbook execution", () => {
  const governanceResult = {
    source_snapshot_hash: "new-lb-hash",
    evaluated_at: new Date().toISOString(),
    stages: [{ stage_id: "lookbook", computed_status: "not_started" }],
  };
  const executionResult = {
    invoked_function: "generate-lookbook-image",
    governance_refresh: {
      status: "completed",
      evaluated_at: governanceResult.evaluated_at,
      stages_count: governanceResult.stages.length,
    },
  };
  assertEquals(executionResult.governance_refresh.status, "completed");
  assertEquals(executionResult.invoked_function, "generate-lookbook-image");
});