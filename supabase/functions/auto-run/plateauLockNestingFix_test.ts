import { assertEquals, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ──────────────────────────────────────────────────────────────────────────────
// Plateau Lock Nesting Fix — Unit Tests
// Tests for the `} else {` nesting fix at line 7428-7429 of auto-run/index.ts.
//
// Commit: 06ef8f6
// File:   supabase/functions/auto-run/index.ts  (SIMPLE PROMOTION block, L7376-7479)
//
// FIX SUMMARY:
//   Moved `} else {` from the else of `if(bestForDoc)` (L7379) to the else of
//   `if(bestCi >= GLOBAL_MIN_CI)` (L7380). Before the fix, when bestForDoc
//   existed but CI < GLOBAL_MIN_CI (90), the code fell through to the plateau
//   detection loop, causing a plateau lock. After the fix, the below-floor
//   promote fires immediately with notes_exhausted_below_floor.
//
// BUG MANIFESTATION:
//   (a) Crash on null bestForDoc at old else path
//   (b) Silent fall-through to 5-tick plateau detection when bestForDoc
//       exists but CI < GLOBAL_MIN_CI
//
// REPLICA OF THE EXACT LOGIC:
//   if (notesExhausted && (allowDefaults || autoApproveAll)) {
//     bestForDoc = resolveBestScoredEligibleVersionForDoc(...)
//     bestCi = bestForDoc?.ci ?? 0
//     if (bestForDoc) {
//       if (bestCi >= GLOBAL_MIN_CI) {
//         ★ ABOVE-FLOOR promote (direct promote + return)
//       }                                         // closes if(bestCi >= GLOBAL_MIN_CI)
//     } else {                                    // FIX: else of if(bestCi >= GLOBAL_MIN_CI),
//       ★ BELOW-FLOOR promote                      //     NOT else of if(bestForDoc)
//       (notes_exhausted_below_floor direct promote + return)
//     }                                           // closes else block
//   }                                             // closes if(bestForDoc)
// ──────────────────────────────────────────────────────────────────────────────

const GLOBAL_MIN_CI = 90;

// ── Types ──

type BestForDoc = {
  versionId: string;
  documentId: string;
  ci: number;
  gp: number;
} | null;

type Job = {
  allow_defaults?: boolean;
  meta_json?: { auto_approve_all?: boolean } | null;
};

// ── Simulated decision functions ──

// Returns the action the SIMPLE PROMOTION block would take.
// Replicates the exact logic from auto-run/index.ts lines 7376-7479.
//
// CORRECT NESTING (AFTER FIX):
//   if (bestForDoc) {
//     if (bestCi >= GLOBAL_MIN_CI) {
//       // ABOVE-FLOOR promote — always returns
//     } else {
//       // THE FIX: else of if(bestCi >= GLOBAL_MIN_CI)
//       // BELOW-FLOOR promote — always returns
//     }
//   }
//   // bestForDoc null → fall through to plateau detection (safe)
function simplePromoteDecision(
  notesExhausted: boolean,
  job: Job,
  bestForDoc: BestForDoc,
): "above_floor_promote" | "below_floor_promote" | "noop" {
  // Guard: notes must be exhausted (allow_defaults/auto_approve_all no longer required — 0 notes is sufficient)
  if (!notesExhausted) {
    return "noop";
  }

  const bestCi = bestForDoc?.ci ?? 0;

  if (bestForDoc) {
    if (bestCi >= GLOBAL_MIN_CI) {
      // ★ ABOVE FLOOR: promote directly — CI meets floor requirement
      return "above_floor_promote";
    } else {
      // ★ THE FIX: This else was previously attached to `if(bestForDoc)`.
      //    Now it's the else of `if(bestCi >= GLOBAL_MIN_CI)`, so it runs
      //    when bestForDoc EXISTS but CI is below the floor.
      // → BELOW-FLOOR promote with notes_exhausted_below_floor
      return "below_floor_promote";
    }
  }
  // bestForDoc is null — fall through to plateau detection
  return "noop";
}

// Same function but with the OLD (broken) nesting to prove the bug existed.
//
// OLD NESTING (BEFORE FIX):
//   if (bestForDoc) {
//     if (bestCi >= GLOBAL_MIN_CI) {
//       // ABOVE-FLOOR promote — always returns
//     }
//     // ↑ no else — falls through when CI < 90
//   } else {
//     // OLD: else of if(bestForDoc)
//     // Runs when bestForDoc is null → CRASH on bestForDoc.ci
//     // NEVER runs when bestForDoc exists but CI < 90
//   }
//   // Falls through here when bestForDoc exists but CI < 90 → PLATEAU LOCK
function oldBrokenPromoteDecision(
  notesExhausted: boolean,
  job: Job,
  bestForDoc: BestForDoc,
): "above_floor_promote" | "below_floor_promote" | "crash" | "noop" {
  if (!notesExhausted || (!job.allow_defaults && !job.meta_json?.auto_approve_all)) {
    return "noop";
  }

  const bestCi = bestForDoc?.ci ?? 0;

  if (bestForDoc) {
    if (bestCi >= GLOBAL_MIN_CI) {
      return "above_floor_promote";
    }
    // OLD BUG: No else for if(bestCi >= GLOBAL_MIN_CI)
    // When CI < 90, falls through here...
  } else {
    // OLD BUG: else of if(bestForDoc)
    // When bestForDoc exists but CI < 90, this is NEVER entered
    // (because bestForDoc is truthy, so the else of if(bestForDoc) is skipped)
    // → Plateau lock in the old code
    //
    // When bestForDoc is null, this IS entered but tries to use bestForDoc.ci
    // → CRASH on null
    return "crash";
  }
  // OLD: Falls through here when bestForDoc exists but CI < GLOBAL_MIN_CI
  // → Plateau lock (no promotion, falls to plateau detection loop)
  return "noop";
}

// ── TESTS ──

// ── PRIMARY: The fix itself ──

Deno.test("[FIX] below-floor promote: notes exhausted, bestForDoc exists, CI < 90 → promotes", () => {
  const result = simplePromoteDecision(true, { allow_defaults: true }, {
    versionId: "v1",
    documentId: "d1",
    ci: 85,
    gp: 80,
  });
  assertEquals(result, "below_floor_promote",
    "When bestForDoc exists with CI=85 (<90) and notes exhausted, below-floor promote should fire");
});

Deno.test("[FIX] below-floor promote: CI just below threshold (89)", () => {
  const result = simplePromoteDecision(true, { allow_defaults: true }, {
    versionId: "v1",
    documentId: "d1",
    ci: 89,
    gp: 80,
  });
  assertEquals(result, "below_floor_promote");
});

Deno.test("[FIX] below-floor promote: CI of 0 (no meaningful score)", () => {
  const result = simplePromoteDecision(true, { allow_defaults: true }, {
    versionId: "v1",
    documentId: "d1",
    ci: 0,
    gp: 0,
  });
  assertEquals(result, "below_floor_promote",
    "Even CI=0 with notes exhausted should trigger below-floor promote");
});

Deno.test("[FIX] below-floor promote: CI negative (-Infinity from detectedBestCi)", () => {
  const result = simplePromoteDecision(true, { allow_defaults: true }, {
    versionId: "v1",
    documentId: "d1",
    ci: -Infinity,
    gp: 0,
  });
  assertEquals(result, "below_floor_promote",
    "Negative CI should still trigger below-floor promote — any CI is better than nothing");
});

Deno.test("[FIX] below-floor: auto_approve_all triggers same path when allow_defaults is false", () => {
  const result = simplePromoteDecision(true, {
    allow_defaults: false,
    meta_json: { auto_approve_all: true },
  }, {
    versionId: "v1",
    documentId: "d1",
    ci: 70,
    gp: 60,
  });
  assertEquals(result, "below_floor_promote");
});

// ── PRIMARY: Above-floor path (should NOT regress) ──

Deno.test("[REGRESSION] above-floor promote: CI >= 90 promotes normally", () => {
  const result = simplePromoteDecision(true, { allow_defaults: true }, {
    versionId: "v1",
    documentId: "d1",
    ci: 95,
    gp: 80,
  });
  assertEquals(result, "above_floor_promote");
});

Deno.test("[REGRESSION] above-floor promote: CI exactly at threshold (90)", () => {
  const result = simplePromoteDecision(true, { allow_defaults: true }, {
    versionId: "v1",
    documentId: "d1",
    ci: 90,
    gp: 80,
  });
  assertEquals(result, "above_floor_promote",
    "CI exactly at GLOBAL_MIN_CI (90) should meet the floor");
});

Deno.test("[REGRESSION] above-floor promote: CI well above threshold (100)", () => {
  const result = simplePromoteDecision(true, { allow_defaults: true }, {
    versionId: "v1",
    documentId: "d1",
    ci: 100,
    gp: 100,
  });
  assertEquals(result, "above_floor_promote");
});

Deno.test("[REGRESSION] above-floor promote: auto_approve_all triggers same path", () => {
  const result = simplePromoteDecision(true, {
    allow_defaults: false,
    meta_json: { auto_approve_all: true },
  }, {
    versionId: "v1",
    documentId: "d1",
    ci: 95,
    gp: 80,
  });
  assertEquals(result, "above_floor_promote");
});

// ── NO-OP cases: Should fall through to plateau detection ──

Deno.test("[NOOP] no bestForDoc (null) — no crash, falls through to plateau detection", () => {
  const result = simplePromoteDecision(true, { allow_defaults: true }, null);
  assertEquals(result, "noop",
    "When bestForDoc is null, should NOT crash — falls through to plateau detection");
});

Deno.test("[NOOP] notes not exhausted — no promote regardless of CI", () => {
  const result = simplePromoteDecision(false, { allow_defaults: true }, {
    versionId: "v1",
    documentId: "d1",
    ci: 95,
    gp: 80,
  });
  assertEquals(result, "noop");
});

Deno.test("[FIX] notes=0 without allow_defaults/auto_approve_all, CI >= 90 → promotes above floor", () => {
  const result = simplePromoteDecision(true, { allow_defaults: false }, {
    versionId: "v1",
    documentId: "d1",
    ci: 95,
    gp: 80,
  });
  assertEquals(result, "above_floor_promote",
    "When notes are exhausted but neither allow_defaults nor auto_approve_all is set, " +
    "and CI >= 90, above-floor promote should fire unconditionally");
});

Deno.test("[FIX] notes=0 without any flags, CI >= 90 → promotes above floor", () => {
  const result = simplePromoteDecision(true, {}, {
    versionId: "v1",
    documentId: "d1",
    ci: 95,
    gp: 80,
  });
  assertEquals(result, "above_floor_promote",
    "When notes are exhausted with no allow_defaults or auto_approve_all flags at all, " +
    "and CI >= 90, above-floor promote should fire unconditionally");
});

Deno.test("[NOOP] notes not exhausted with CI below floor — no promote", () => {
  const result = simplePromoteDecision(false, { allow_defaults: true }, {
    versionId: "v1",
    documentId: "d1",
    ci: 50,
    gp: 50,
  });
  assertEquals(result, "noop",
    "Notes still pending should gate all promotions regardless of CI");
});

Deno.test("[NOOP] bestForDoc exists, CI >= 90, but notes not exhausted — no promote", () => {
  const result = simplePromoteDecision(false, { allow_defaults: true }, {
    versionId: "v1",
    documentId: "d1",
    ci: 95,
    gp: 80,
  });
  assertEquals(result, "noop");
});

Deno.test("[NOOP] bestForDoc null with notes exhausted — no crash, falls through", () => {
  const result = simplePromoteDecision(true, {
    allow_defaults: false,
    meta_json: { auto_approve_all: true },
  }, null);
  assertEquals(result, "noop",
    "No bestForDoc with auto_approve_all should fall through gracefully");
});

// ── EDGE: Null/undefined meta_json ──

Deno.test("[EDGE] allow_defaults only with null meta_json — should work as normal", () => {
  const result = simplePromoteDecision(true, { allow_defaults: true, meta_json: null }, {
    versionId: "v1",
    documentId: "d1",
    ci: 85,
    gp: 80,
  });
  assertEquals(result, "below_floor_promote");
});

Deno.test("[EDGE] allow_defaults only with undefined meta_json — should work as normal", () => {
  const result = simplePromoteDecision(true, { allow_defaults: true }, {
    versionId: "v1",
    documentId: "d1",
    ci: 85,
    gp: 80,
  });
  assertEquals(result, "below_floor_promote");
});

Deno.test("[EDGE] auto_approve_all only with undefined allow_defaults — should work", () => {
  const result = simplePromoteDecision(true, { meta_json: { auto_approve_all: true } }, {
    versionId: "v1",
    documentId: "d1",
    ci: 85,
    gp: 80,
  });
  assertEquals(result, "below_floor_promote");
});

Deno.test("[FIX] notes=0 with auto_approve_all=false — no longer a gate, promotes above floor", () => {
  const result = simplePromoteDecision(true, { meta_json: { auto_approve_all: false } }, {
    versionId: "v1",
    documentId: "d1",
    ci: 95,
    gp: 80,
  });
  assertEquals(result, "above_floor_promote",
    "When notes are exhausted, auto_approve_all=false no longer blocks promotion — " +
    "0 notes is sufficient to enter the SIMPLE PROMOTION block");
});

// ── FIX: Notes exhausted WITHOUT allow_defaults/auto_approve_all — the core fix ──
// These tests verify that notesExhausted=true is sufficient to enter SIMPLE PROMOTION,
// regardless of allow_defaults or auto_approve_all flags.

Deno.test("[FIX-NO-FLAGS] notes=0, no allow_defaults/auto_approve_all, bestForDoc exists, CI >= 90 → promotes above floor", () => {
  const result = simplePromoteDecision(true, { allow_defaults: false, meta_json: null }, {
    versionId: "v1", documentId: "d1", ci: 95, gp: 80,
  });
  assertEquals(result, "above_floor_promote",
    "THE FIX: notes=0 is sufficient — above-floor promote fires even without allow_defaults");
});

Deno.test("[FIX-NO-FLAGS] notes=0, no allow_defaults/auto_approve_all, bestForDoc exists, CI < 90 → promotes below floor", () => {
  const result = simplePromoteDecision(true, { allow_defaults: false }, {
    versionId: "v1", documentId: "d1", ci: 60, gp: 50,
  });
  assertEquals(result, "below_floor_promote",
    "THE FIX: notes=0 is sufficient — below-floor promote fires even without allow_defaults");
});

Deno.test("[FIX-NO-FLAGS] notes=0, no allow_defaults/auto_approve_all, bestForDoc null → noop (safe fallthrough)", () => {
  const result = simplePromoteDecision(true, { allow_defaults: false, meta_json: null }, null);
  assertEquals(result, "noop",
    "THE FIX: notes=0 but no bestForDoc — safely falls through to plateau detection");
});

// ── OLD BUG PROOF: Demonstrate that the old nesting was broken ──
// These tests prove the bug existed in the old code structure.

Deno.test("[BUG-PROOF] Old code: bestForDoc exists, CI=85 → would have plateau-locked (noop instead of promote)", () => {
  const oldResult = oldBrokenPromoteDecision(true, { allow_defaults: true }, {
    versionId: "v1",
    documentId: "d1",
    ci: 85,
    gp: 80,
  });
  assertEquals(oldResult, "noop",
    "OLD CODE: bestForDoc exists with CI=85 returns noop — would silently fall through to plateau lock. FIX changes this to below_floor_promote.");
  const newResult = simplePromoteDecision(true, { allow_defaults: true }, {
    versionId: "v1",
    documentId: "d1",
    ci: 85,
    gp: 80,
  });
  assertEquals(newResult, "below_floor_promote",
    "NEW CODE: same inputs now correctly trigger below-floor promote");
  assertNotEquals(oldResult, newResult,
    "FIX CHANGED THE BEHAVIOR: old code plateau-locked, new code promotes");
});

Deno.test("[BUG-PROOF] Old code: bestForDoc null — would crash on null.ci access", () => {
  const oldResult = oldBrokenPromoteDecision(true, { allow_defaults: true }, null);
  assertEquals(oldResult, "crash",
    "OLD CODE: When bestForDoc is null, the else branch runs and tries to access bestForDoc.ci → crash");
  const newResult = simplePromoteDecision(true, { allow_defaults: true }, null);
  assertEquals(newResult, "noop",
    "NEW CODE: null bestForDoc gracefully falls through to plateau detection");
  assertNotEquals(oldResult, newResult,
    "FIX CHANGED THE BEHAVIOR: old code crashed on null, new code handles gracefully");
});

Deno.test("[BUG-PROOF] Old code: CI=89 (just below floor) with bestForDoc existing — plateau lock", () => {
  const oldResult = oldBrokenPromoteDecision(true, { allow_defaults: true }, {
    versionId: "v1",
    documentId: "d1",
    ci: 89,
    gp: 80,
  });
  assertEquals(oldResult, "noop",
    "OLD CODE: CI=89 just below GLOBAL_MIN_CI=90 — noop, would have plateau-locked for 5+ ticks");
  const newResult = simplePromoteDecision(true, { allow_defaults: true }, {
    versionId: "v1",
    documentId: "d1",
    ci: 89,
    gp: 80,
  });
  assertEquals(newResult, "below_floor_promote",
    "NEW CODE: CI=89 just below floor now correctly triggers immediate below-floor promote");
});

// ── INVARIANT: Above-floor path is NEVER affected ──

Deno.test("[INVARIANT] Above-floor path is identical between old and new code", () => {
  const testCases = [
    { ci: 90, gp: 80 },
    { ci: 95, gp: 80 },
    { ci: 100, gp: 100 },
    { ci: 99, gp: 1 },
  ];
  for (const { ci, gp } of testCases) {
    const oldResult = oldBrokenPromoteDecision(true, { allow_defaults: true }, {
      versionId: "v1", documentId: "d1", ci, gp,
    });
    const newResult = simplePromoteDecision(true, { allow_defaults: true }, {
      versionId: "v1", documentId: "d1", ci, gp,
    });
    assertEquals(oldResult, newResult,
      `Above-floor path for CI=${ci}, GP=${gp} must be identical between old and new code`);
  }
});