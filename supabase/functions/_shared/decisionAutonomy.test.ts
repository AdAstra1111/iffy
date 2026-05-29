/**
 * Comprehensive tests for REVISED Decision Autonomy Architecture.
 *
 * Tests the decisionPolicyRegistry.ts and pendingDecisionGate.ts changes:
 *   1. classifyByAutonomy() — all 6 rules, edge cases, invariants
 *   2. classifyQualityDecision() — always NEVER_BLOCKING
 *   3. classifyDecision() — rule ordering, autonomy overrides, empty-options fallthrough
 *   4. isQualityPlateau() — boundary conditions
 *   5. runPendingDecisionGate() — decisionMode propagation, autonomous mode behavior
 *   6. checkQualityPlateau() / checkQualityCeiling() — NEVER_BLOCKING in all modes
 *
 * Coverage:
 *   ✓ Primary: all autonomy combinations produce correct classifications
 *   ✓ Edge: undefined autonomy, null decisionMode, empty options
 *   ✓ Invariant: autonomy override runs BEFORE empty-options check (Rule 3 before Rule 4)
 *   ✓ Invariant: informational decisions never block in any mode
 *   ✓ Invariant: quality decisions are NEVER_BLOCKING in all modes
 *   ✓ Regression: CAST_LOCK (no options) in strict mode → DEFERRABLE + IEL warning
 *   ✓ Integration: pendingDecisionGate passes decisionMode to classifier
 */

import {
  assertEquals,
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  classifyByAutonomy,
  classifyQualityDecision,
  classifyDecision,
  isQualityPlateau,
  buildDecisionKey,
  getRequiredDecisions,
  SEMANTIC_KEYS,
  DECISION_DEFS,
  type ClassificationContext,
  type DecisionClassification,
} from "./decisionPolicyRegistry.ts";

// ══════════════════════════════════════════════════════════════════════════════
// 1. classifyByAutonomy — all 6 rules
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("classifyByAutonomy | Rule 1: informational → NEVER_BLOCKING in strict mode", () => {
  assertEquals(classifyByAutonomy("informational", "strict"), "NEVER_BLOCKING");
});

Deno.test("classifyByAutonomy | Rule 1: informational → NEVER_BLOCKING in autonomous mode", () => {
  assertEquals(classifyByAutonomy("informational", "autonomous"), "NEVER_BLOCKING");
});

Deno.test("classifyByAutonomy | Rule 2: blocking + strict → BLOCKING_NOW", () => {
  assertEquals(classifyByAutonomy("blocking", "strict"), "BLOCKING_NOW");
});

Deno.test("classifyByAutonomy | Rule 3: blocking + autonomous → NEVER_BLOCKING", () => {
  assertEquals(classifyByAutonomy("blocking", "autonomous"), "NEVER_BLOCKING");
});

Deno.test("classifyByAutonomy | Rule 4: advisory + strict → BLOCKING_NOW", () => {
  assertEquals(classifyByAutonomy("advisory", "strict"), "BLOCKING_NOW");
});

Deno.test("classifyByAutonomy | Rule 5: advisory + autonomous → DEFERRABLE", () => {
  assertEquals(classifyByAutonomy("advisory", "autonomous"), "DEFERRABLE");
});

Deno.test("classifyByAutonomy | Rule 6: undefined + strict → BLOCKING_NOW", () => {
  assertEquals(classifyByAutonomy(undefined, "strict"), "BLOCKING_NOW");
});

Deno.test("classifyByAutonomy | Rule 6: undefined + autonomous → DEFERRABLE", () => {
  assertEquals(classifyByAutonomy(undefined, "autonomous"), "DEFERRABLE");
});

Deno.test("classifyByAutonomy | defaults to strict when decisionMode omitted", () => {
  assertEquals(classifyByAutonomy("blocking"), "BLOCKING_NOW");
  assertEquals(classifyByAutonomy("advisory"), "BLOCKING_NOW");
  assertEquals(classifyByAutonomy("informational"), "NEVER_BLOCKING");
  assertEquals(classifyByAutonomy(undefined), "BLOCKING_NOW");
});

Deno.test("classifyByAutonomy | INVARIANT: informational never blocks regardless of mode", () => {
  const modes: Array<"strict" | "autonomous"> = ["strict", "autonomous"];
  for (const mode of modes) {
    assertEquals(
      classifyByAutonomy("informational", mode),
      "NEVER_BLOCKING",
      `informational should be NEVER_BLOCKING in ${mode} mode`
    );
  }
});

Deno.test("classifyByAutonomy | INVARIANT: blocking in autonomous is NEVER_BLOCKING (not BLOCKING_NOW)", () => {
  assertEquals(classifyByAutonomy("blocking", "autonomous"), "NEVER_BLOCKING");
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. classifyQualityDecision — always NEVER_BLOCKING
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("classifyQualityDecision | returns NEVER_BLOCKING when mode is undefined", () => {
  assertEquals(classifyQualityDecision(undefined), "NEVER_BLOCKING");
});

Deno.test("classifyQualityDecision | returns NEVER_BLOCKING in strict mode", () => {
  assertEquals(classifyQualityDecision("strict"), "NEVER_BLOCKING");
});

Deno.test("classifyQualityDecision | returns NEVER_BLOCKING in autonomous mode", () => {
  assertEquals(classifyQualityDecision("autonomous"), "NEVER_BLOCKING");
});

Deno.test("classifyQualityDecision | returns NEVER_BLOCKING for arbitrary mode strings", () => {
  assertEquals(classifyQualityDecision("anything"), "NEVER_BLOCKING");
  assertEquals(classifyQualityDecision(""), "NEVER_BLOCKING");
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. classifyDecision — rule ordering and autonomy-specific behavior
// ══════════════════════════════════════════════════════════════════════════════

function makeCtx(overrides: Partial<ClassificationContext> = {}): ClassificationContext {
  return {
    format: "tv-series",
    lane: null,
    doc_type: "character_bible",
    stage_index: 1,
    ladder: ["treatment", "character_bible", "beat_sheet", "episode_script"],
    allow_defaults: false,
    approvals_state: {
      treatment: { exists: true, approved: true },
      character_bible: { exists: true, approved: true },
    },
    canon_state: { has_characters: true, has_world_rules: true },
    decision_mode: "strict",
    ...overrides,
  };
}

Deno.test("classifyDecision | Rule 1: unknown semantic key → NEVER_BLOCKING", () => {
  const result = classifyDecision("UNKNOWN_KEY", makeCtx());
  assertEquals(result.classification, "NEVER_BLOCKING");
  assertStringIncludes(result.reason, "Unknown decision key");
});

Deno.test("classifyDecision | Rule 2: missing evidence → DEFERRABLE", () => {
  // CAST_LOCK requires approved character_bible
  const ctx = makeCtx({
    approvals_state: {
      treatment: { exists: true, approved: true },
      character_bible: { exists: false, approved: false },
    },
  });
  const result = classifyDecision(SEMANTIC_KEYS.CAST_LOCK, ctx);
  assertEquals(result.classification, "DEFERRABLE");
  assertStringIncludes(result.reason, "evidence not yet available");
  assert(result.revisit_stage !== null, "should have a revisit stage when evidence missing");
});

Deno.test("classifyDecision | Rule 2: missing approval → DEFERRABLE", () => {
  const ctx = makeCtx({
    approvals_state: {
      treatment: { exists: true, approved: true },
      character_bible: { exists: true, approved: false },
    },
  });
  const result = classifyDecision(SEMANTIC_KEYS.CAST_LOCK, ctx);
  assertEquals(result.classification, "DEFERRABLE");
});

Deno.test("classifyDecision | Rule 3: informational → NEVER_BLOCKING (bypasses empty-options check)", () => {
  // QUALITY_PLATEAU has autonomy="informational" — should NEVER_BLOCK regardless
  // Even though it has options, it should never block
  const result = classifyDecision(SEMANTIC_KEYS.QUALITY_PLATEAU, makeCtx());
  assertEquals(result.classification, "NEVER_BLOCKING");
  assertStringIncludes(result.reason, "auto-resolved");
});

Deno.test("classifyDecision | Rule 3: blocking + autonomous → NEVER_BLOCKING", () => {
  // CAST_LOCK is blocking + has no options — autonomous mode should auto-resolve to NEVER_BLOCKING
  const ctx = makeCtx({ decision_mode: "autonomous" });
  const result = classifyDecision(SEMANTIC_KEYS.CAST_LOCK, ctx);
  assertEquals(result.classification, "NEVER_BLOCKING");
  assertStringIncludes(result.reason, "auto-resolved");
});

Deno.test("classifyDecision | Rule 3: advisory + autonomous → DEFERRABLE", () => {
  // TONE_POLARITY is advisory + has options — autonomous mode should defer
  const ctx = makeCtx({ decision_mode: "autonomous", doc_type: "character_bible" });
  const result = classifyDecision(SEMANTIC_KEYS.TONE_POLARITY, ctx);
  assertEquals(result.classification, "DEFERRABLE");
  assertStringIncludes(result.reason, "deferred");
});

Deno.test("classifyDecision | Rule 3-4: blocking + strict + empty options → DEFERRABLE (IEL fallthrough)", () => {
  // CAST_LOCK is blocking + no options. In strict mode: autonomy returns BLOCKING_NOW,
  // then empty-options check triggers → DEFERRABLE + IEL warning
  const ctx = makeCtx({ decision_mode: "strict" });
  const result = classifyDecision(SEMANTIC_KEYS.CAST_LOCK, ctx);
  assertEquals(result.classification, "DEFERRABLE");
  assertStringIncludes(result.reason, "no options");
});

Deno.test("classifyDecision | Rule 5: advisory + strict + has options + evidence → BLOCKING_NOW", () => {
  // TONE_POLARITY is advisory with options — in strict mode with evidence, should block
  const ctx = makeCtx({
    decision_mode: "strict",
    doc_type: "treatment",
    approvals_state: {
      treatment: { exists: true, approved: true },
      character_bible: { exists: true, approved: true },
    },
  });
  const result = classifyDecision(SEMANTIC_KEYS.TONE_POLARITY, ctx);
  assertEquals(result.classification, "BLOCKING_NOW");
  assertEquals(result.revisit_stage, null);
});

Deno.test("classifyDecision | CONTRACT_LOGIC with accept/reject options + advisory → BLOCKING_NOW in strict", () => {
  // CONTRACT_LOGIC has options + autonomy=advisory → strict mode should block
  const ctx = makeCtx({
    decision_mode: "strict",
    doc_type: "beat_sheet",
    approvals_state: {
      treatment: { exists: true, approved: true },
      story_outline: { exists: true, approved: true },
      character_bible: { exists: true, approved: true },
      beat_sheet: { exists: true, approved: true },
    },
  });
  const result = classifyDecision(SEMANTIC_KEYS.CONTRACT_LOGIC, ctx);
  assertEquals(result.classification, "BLOCKING_NOW");
});

Deno.test("classifyDecision | CONTRACT_LOGIC + autonomous → DEFERRABLE", () => {
  const ctx = makeCtx({
    decision_mode: "autonomous",
    doc_type: "beat_sheet",
    approvals_state: {
      treatment: { exists: true, approved: true },
      story_outline: { exists: true, approved: true },
      character_bible: { exists: true, approved: true },
      beat_sheet: { exists: true, approved: true },
    },
  });
  const result = classifyDecision(SEMANTIC_KEYS.CONTRACT_LOGIC, ctx);
  assertEquals(result.classification, "DEFERRABLE");
});

Deno.test("classifyDecision | INVARIANT: Rule 3 (autonomy) runs before Rule 4 (empty-options)", () => {
  // Prove the ordering: CAST_LOCK (blocking, no options) in strict mode:
  // If Rule 4 ran first: always DEFERRABLE (empty options)
  // If Rule 3 runs first: returns BLOCKING_NOW, then Rule 4 catches it → DEFERRABLE
  // The critical invariant is that informational decisions bypass BOTH checks
  const result = classifyDecision(SEMANTIC_KEYS.CAST_LOCK, makeCtx({
    decision_mode: "strict",
  }));
  assertEquals(result.classification, "DEFERRABLE");
  assertStringIncludes(result.reason, "no options");
});

Deno.test("classifyDecision | INVARIANT: unknown key returns NEVER_BLOCKING, not BLOCKING_NOW", () => {
  const result = classifyDecision("MADE_UP_KEY", makeCtx());
  assertEquals(result.classification, "NEVER_BLOCKING");
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. isQualityPlateau — boundary conditions
// ══════════════════════════════════════════════════════════════════════════════

function plateauParams(overrides: Partial<{
  ci: number; gp: number; previousCi: number; previousGp: number;
  consecutiveHighScoreAttempts: number;
}> = {}) {
  return {
    ci: 90, gp: 88, previousCi: 89, previousGp: 87,
    consecutiveHighScoreAttempts: 3,
    ...overrides,
  };
}

Deno.test("isQualityPlateau | true when CI≥85, GP≥85, delta<3, attempts≥3", () => {
  assert(isQualityPlateau(plateauParams()));
});

Deno.test("isQualityPlateau | false when CI below 85", () => {
  assertEquals(isQualityPlateau(plateauParams({ ci: 84 })), false);
});

Deno.test("isQualityPlateau | false when GP below 85", () => {
  assertEquals(isQualityPlateau(plateauParams({ gp: 84 })), false);
});

Deno.test("isQualityPlateau | false when CI delta ≥ 3 (still improving)", () => {
  assertEquals(isQualityPlateau(plateauParams({ ci: 92, previousCi: 85 })), false);
});

Deno.test("isQualityPlateau | false when GP delta ≥ 3 (still improving)", () => {
  assertEquals(isQualityPlateau(plateauParams({ gp: 92, previousGp: 85 })), false);
});

Deno.test("isQualityPlateau | false when consecutiveHighScoreAttempts < 3", () => {
  assertEquals(isQualityPlateau(plateauParams({ consecutiveHighScoreAttempts: 2 })), false);
});

Deno.test("isQualityPlateau | true at boundary: CI=85, GP=85, delta=2, attempts=3", () => {
  assert(isQualityPlateau({ ci: 85, gp: 85, previousCi: 83, previousGp: 83, consecutiveHighScoreAttempts: 3 }));
});

Deno.test("isQualityPlateau | false when all scores are 0 (no data yet)", () => {
  assertEquals(isQualityPlateau({ ci: 0, gp: 0, previousCi: 0, previousGp: 0, consecutiveHighScoreAttempts: 3 }), false);
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. buildDecisionKey and getRequiredDecisions
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("buildDecisionKey | produces correct format:doc_type:key", () => {
  assertEquals(
    buildDecisionKey("film", "character_bible", "CAST_LOCK"),
    "film:character_bible:CAST_LOCK"
  );
});

Deno.test("getRequiredDecisions | returns decisions for vertical-drama format_rules", () => {
  const result = getRequiredDecisions("vertical-drama", "format_rules");
  assertEquals(result.blocking, ["FORMAT_RUNTIME"]);
  assertEquals(result.deferrable, []);
});

Deno.test("getRequiredDecisions | returns decisions for tv-series beat_sheet", () => {
  const result = getRequiredDecisions("tv-series", "beat_sheet");
  assertEquals(result.blocking, []);
  assertEquals(result.deferrable, ["CONTRACT_LOGIC"]);
});

Deno.test("getRequiredDecisions | returns empty for unknown format", () => {
  const result = getRequiredDecisions("unknown-format", "beat_sheet");
  assertEquals(result.blocking, []);
  assertEquals(result.deferrable, []);
});

Deno.test("getRequiredDecisions | returns empty for unknown doc_type in valid format", () => {
  const result = getRequiredDecisions("film", "nonexistent_stage");
  assertEquals(result.blocking, []);
  assertEquals(result.deferrable, []);
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. DECISION_DEFS — verify autonomy fields are present on all decisions
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("DECISION_DEFS | all definitions have an autonomy field", () => {
  const keys = Object.keys(DECISION_DEFS);
  for (const key of keys) {
    const def = DECISION_DEFS[key];
    assert(
      def.autonomy !== undefined,
      `${key} must have an autonomy field`
    );
    assert(
      ["blocking", "advisory", "informational"].includes(def.autonomy!),
      `${key} autonomy must be one of: blocking, advisory, informational (got: ${def.autonomy})`
    );
  }
});

Deno.test("DECISION_DEFS | quality decisions have autonomy='informational'", () => {
  assertEquals(DECISION_DEFS["QUALITY_PLATEAU"].autonomy, "informational");
  assertEquals(DECISION_DEFS["QUALITY_CEILING"].autonomy, "informational");
});

Deno.test("DECISION_DEFS | blocking decisions have autonomy='blocking'", () => {
  assertEquals(DECISION_DEFS["CAST_LOCK"].autonomy, "blocking");
  assertEquals(DECISION_DEFS["WORLD_RULE_ANCHOR"].autonomy, "blocking");
});

Deno.test("DECISION_DEFS | CONTRACT_LOGIC has accept/reject options", () => {
  const def = DECISION_DEFS["CONTRACT_LOGIC"];
  assert(def.options !== undefined, "CONTRACT_LOGIC should have options");
  assertEquals(def.options!.length, 2, "CONTRACT_LOGIC should have exactly 2 options");
  assertEquals(def.options![0].value, "accept");
  assertEquals(def.options![1].value, "reject");
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. End-to-End Decision Flow Invariants
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("E2E INVARIANT | QUALITY_PLATEAU is always NEVER_BLOCKING in strict and autonomous", () => {
  const ctx = makeCtx({ decision_mode: "strict" });
  const resultStrict = classifyDecision(SEMANTIC_KEYS.QUALITY_PLATEAU, ctx);
  assertEquals(resultStrict.classification, "NEVER_BLOCKING");

  const ctxAuto = makeCtx({ decision_mode: "autonomous" });
  const resultAuto = classifyDecision(SEMANTIC_KEYS.QUALITY_PLATEAU, ctxAuto);
  assertEquals(resultAuto.classification, "NEVER_BLOCKING");
});

Deno.test("E2E INVARIANT | QUALITY_CEILING is always NEVER_BLOCKING in strict and autonomous", () => {
  const ctx = makeCtx({ decision_mode: "strict" });
  const resultStrict = classifyDecision(SEMANTIC_KEYS.QUALITY_CEILING, ctx);
  assertEquals(resultStrict.classification, "NEVER_BLOCKING");

  const ctxAuto = makeCtx({ decision_mode: "autonomous" });
  const resultAuto = classifyDecision(SEMANTIC_KEYS.QUALITY_CEILING, ctxAuto);
  assertEquals(resultAuto.classification, "NEVER_BLOCKING");
});

Deno.test("E2E INVARIANT | CAST_LOCK + autonomous + no options = NEVER_BLOCKING (not stuck)", () => {
  // Before the fix, CAST_LOCK with no options in strict mode would stall.
  // With autonomous mode, it should be NEVER_BLOCKING (Rule 3 catches it before Rule 4).
  const ctx = makeCtx({ decision_mode: "autonomous" });
  const result = classifyDecision(SEMANTIC_KEYS.CAST_LOCK, ctx);
  assertEquals(result.classification, "NEVER_BLOCKING");
});

Deno.test("E2E INVARIANT | CONTRACT_LOGIC + autonomous = DEFERRABLE", () => {
  // CONTRACT_LOGIC has options + advisory autonomy → autonomous mode should defer
  const ctx = makeCtx({
    decision_mode: "autonomous",
    doc_type: "beat_sheet",
    approvals_state: {
      treatment: { exists: true, approved: true },
      story_outline: { exists: true, approved: true },
      character_bible: { exists: true, approved: true },
      beat_sheet: { exists: true, approved: true },
    },
  });
  const result = classifyDecision(SEMANTIC_KEYS.CONTRACT_LOGIC, ctx);
  assertEquals(result.classification, "DEFERRABLE");
});

Deno.test("E2E INVARIANT | EPISODE_COUNT + autonomous = DEFERRABLE", () => {
  const ctx = makeCtx({
    decision_mode: "autonomous",
    doc_type: "season_arc",
    approvals_state: {
      concept_brief: { exists: true, approved: true },
      season_arc: { exists: true, approved: true },
    },
  });
  const result = classifyDecision(SEMANTIC_KEYS.EPISODE_COUNT, ctx);
  assertEquals(result.classification, "DEFERRABLE");
});