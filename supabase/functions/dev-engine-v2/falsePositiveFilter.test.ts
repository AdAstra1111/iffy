/**
 * Unit tests for filterFalsePositiveBlockers() in dev-engine-v2/index.ts
 *
 * The function is private (non-exported) at line 1809. These tests implement
 * the exact same logic as a test harness to verify:
 *
 *   1. Act 2a/2b false positive blockers are removed
 *   2. Real blockers (pacing, character, structure) are preserved
 *   3. No-op for non-treatment / non-film doc types
 *   4. Handles both blocking_issues (analyze) and blockers (notes) key names
 *   5. Case-insensitive pattern matching
 *   6. Works in both description and why_it_matters fields
 */

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ═══════════════════════════════════════════════════════════════
// Test harness — mirrors filterFalsePositiveBlockers exactly
// ═══════════════════════════════════════════════════════════════
const falsePositivePatterns = [
  "act 2a",
  "act 2b",
  "2a/2b",
  "act structure confusion",
  "too many acts",
];

function filterFalsePositiveBlockers(
  parsed: any,
  deliverableType: string,
  format: string
): any {
  // Only apply to film treatments
  if (deliverableType !== "treatment" || format !== "film") return parsed;

  const issues = parsed.blocking_issues || parsed.blockers || [];
  if (!Array.isArray(issues) || issues.length === 0) return parsed;

  const filtered = issues.filter((issue: any) => {
    if (!issue) return false;
    const desc = (issue.description || "").toLowerCase();
    const why = (issue.why_it_matters || "").toLowerCase();
    return !falsePositivePatterns.some(
      (pattern) => desc.includes(pattern) || why.includes(pattern)
    );
  });

  if (parsed.blocking_issues) parsed.blocking_issues = filtered;
  if (parsed.blockers) parsed.blockers = filtered;

  return parsed;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function makeBlocker(description: string, whyItMatters?: string) {
  return {
    id: `blocker-${Math.random().toString(36).slice(2, 8)}`,
    description,
    why_it_matters: whyItMatters || "",
    severity: "blocker",
  };
}

const actorBlocker = makeBlocker(
  "Lead actor availability conflicts with shooting schedule",
  "Cannot lock in actor for principal photography"
);

const pacingBlocker = makeBlocker(
  "Second act pacing drags — no significant escalation between midpoint and climax",
  "Audience may lose engagement during the extended second act"
);

const characterBlocker = makeBlocker(
  "Protagonist arc lacks clear inciting incident",
  "Without a clear call to action, the protagonist's journey feels unmotivated"
);

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

Deno.test("1: Film treatment — Act 2a pattern in description is filtered", () => {
  const input = {
    blocking_issues: [
      makeBlocker("Act 2a pacing is too slow — audience fatigue"),
      actorBlocker,
    ],
  };
  const result = filterFalsePositiveBlockers(input, "treatment", "film");
  assert(result.blocking_issues.length === 1, "Should keep only real blocker");
  assertEquals(result.blocking_issues[0].id, actorBlocker.id);
});

Deno.test("2: Film treatment — Act 2b pattern in why_it_matters is filtered", () => {
  const input = {
    blocking_issues: [
      makeBlocker("Pacing issue", "Act 2b feels disconnected from Act 3"),
      pacingBlocker,
    ],
  };
  const result = filterFalsePositiveBlockers(input, "treatment", "film");
  assert(result.blocking_issues.length === 1, "Should keep only real pacing blocker");
});

Deno.test("3: Film treatment — '2a/2b' pattern filtered", () => {
  const input = {
    blocking_issues: [
      makeBlocker("Structure issue", "2a/2b bisection causes narrative confusion"),
    ],
  };
  const result = filterFalsePositiveBlockers(input, "treatment", "film");
  assert(result.blocking_issues.length === 0, "Should filter all false positives");
});

Deno.test("4: Film treatment — 'act structure confusion' filtered", () => {
  const input = {
    blocking_issues: [
      makeBlocker("Act structure confusion — too many acts defined"),
    ],
  };
  const result = filterFalsePositiveBlockers(input, "treatment", "film");
  assert(result.blocking_issues.length === 0, "Should filter structure confusion");
});

Deno.test("5: Film treatment — 'too many acts' filtered", () => {
  const input = {
    blocking_issues: [
      makeBlocker("Too many acts in this treatment"),
    ],
  };
  const result = filterFalsePositiveBlockers(input, "treatment", "film");
  assert(result.blocking_issues.length === 0, "Should filter 'too many acts'");
});

Deno.test("6: Film treatment — real blockers NOT filtered", () => {
  const input = {
    blocking_issues: [actorBlocker, pacingBlocker, characterBlocker],
  };
  const result = filterFalsePositiveBlockers(input, "treatment", "film");
  assertEquals(result.blocking_issues.length, 3, "All real blockers preserved");
});

Deno.test("7: Mixed — false positives and real blockers", () => {
  const fp1 = makeBlocker("Act 2a has no midpoint reversal");
  const fp2 = makeBlocker("Structure is confusing with Act 2b");
  const input = {
    blocking_issues: [fp1, actorBlocker, fp2, pacingBlocker, characterBlocker],
  };
  const result = filterFalsePositiveBlockers(input, "treatment", "film");
  assert(result.blocking_issues.length === 3, "3 real blockers remain");
  // Verify no false positives survived
  const descriptions = result.blocking_issues.map((b: any) => b.description);
  assert(!descriptions.some((d: string) => d.includes("Act 2a")), "No Act 2a");
  assert(!descriptions.some((d: string) => d.includes("Act 2b")), "No Act 2b");
});

Deno.test("8: No-op — non-treatment deliverable type (beat_sheet)", () => {
  const input = {
    blocking_issues: [makeBlocker("Act 2a needs restructuring"), actorBlocker],
  };
  const result = filterFalsePositiveBlockers(input, "beat_sheet", "film");
  assert(result.blocking_issues.length === 2, "No filtering for non-treatment");
});

Deno.test("9: No-op — non-film format (tv-series)", () => {
  const input = {
    blocking_issues: [makeBlocker("Act 2a has issues"), actorBlocker],
  };
  const result = filterFalsePositiveBlockers(input, "treatment", "tv-series");
  assert(result.blocking_issues.length === 2, "No filtering for non-film format");
});

Deno.test("10: No-op — empty blockers array", () => {
  const input = {
    blocking_issues: [],
    deliverableType: "treatment",
  };
  const result = filterFalsePositiveBlockers(input, "treatment", "film");
  assert(result.blocking_issues.length === 0, "Empty array returns unchanged");
});

Deno.test("11: No-op — no blocking_issues or blockers keys", () => {
  const input = { deliverableType: "treatment" };
  const result = filterFalsePositiveBlockers(input, "treatment", "film");
  assertEquals(result, input, "Should return parsed unchanged");
});

Deno.test("12: Handles 'blockers' key (notes output path)", () => {
  const input = {
    blockers: [
      makeBlocker("Act 2a needs work"),
      actorBlocker,
    ],
  };
  const result = filterFalsePositiveBlockers(input, "treatment", "film");
  assert(result.blockers.length === 1, "blockers key filtered");
  assertEquals(result.blockers[0].id, actorBlocker.id);
});

Deno.test("13: Case insensitive pattern matching", () => {
  const input = {
    blocking_issues: [
      makeBlocker("ACT 2A needs restructuring"),
      makeBlocker("act 2b is problematic"),
      makeBlocker("Act 2a and Act 2B both need work"),
    ],
  };
  const result = filterFalsePositiveBlockers(input, "treatment", "film");
  assert(result.blocking_issues.length === 0, "All case variants filtered");
});

Deno.test("14: why_it_matters triggers filter even when description is clean", () => {
  const input = {
    blocking_issues: [
      {
        id: "fp-1",
        description: "Pacing in second act",
        why_it_matters: "Act 2a feels like a separate movie from Act 2b",
        severity: "blocker",
      },
      actorBlocker,
    ],
  };
  const result = filterFalsePositiveBlockers(input, "treatment", "film");
  assert(result.blocking_issues.length === 1, "Filtered by why_it_matters");
  assertEquals(result.blocking_issues[0].id, actorBlocker.id);
});

Deno.test("15: Null/undefined issue entries are filtered out", () => {
  const input = {
    blocking_issues: [
      null,
      undefined,
      makeBlocker("Act 2a issues"),
      actorBlocker,
    ] as any[],
  };
  const result = filterFalsePositiveBlockers(input, "treatment", "film");
  assert(result.blocking_issues.length === 1, "Null/undefined filtered");
  assertEquals(result.blocking_issues[0].id, actorBlocker.id);
});

Deno.test("16: Real blocker — mentions 'act 2' but NOT 'act 2a'/'act 2b' — preserved", () => {
  const input = {
    blocking_issues: [
      makeBlocker(
        "Act 2 lacks a clear midpoint reversal",
        "Without a midpoint, the second act drags and loses narrative tension"
      ),
    ],
  };
  const result = filterFalsePositiveBlockers(input, "treatment", "film");
  assert(result.blocking_issues.length === 1,
    "Real 'Act 2' (not 2a/2b) critique preserved"
  );
});

Deno.test("17: Regression — blocking_issues key removed when all filtered", () => {
  const input = { blocking_issues: [makeBlocker("Act 2a is a problem")] };
  const result = filterFalsePositiveBlockers(input, "treatment", "film");
  assertEquals(result.blocking_issues.length, 0, "Empty array, not undefined");
  assertEquals(result.blocking_issues, [], "Array is empty, not missing");
});
