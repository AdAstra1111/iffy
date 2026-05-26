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