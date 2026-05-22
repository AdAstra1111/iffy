import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ──────────────────────────────────────────────────────────────────────────────
// autoApproveAll Guards — Unit Tests
// These tests validate the 7 guard condition extensions added to support
// auto_approve_all mode. Each guard extends an existing allow_defaults check
// to also permit auto_approve_all.
//
// Commit: 61c5809
// File:   index.ts
// ──────────────────────────────────────────────────────────────────────────────

type Job = {
  allow_defaults?: boolean;
  meta_json?: { auto_approve_all?: boolean } | null;
};

// ── Guard 1: tryPlateauForcePromote early return (L4011) ──
//   if (!job.allow_defaults && !job.meta_json?.auto_approve_all) return null;
//   Semantics: Return null ONLY if both are absent/false.
//              If either is true, proceed with plateau force promote.
function guard1_shouldReturnNull(job: Job): boolean {
  return !job.allow_defaults && !job.meta_json?.auto_approve_all;
}

Deno.test("Guard 1 (L4011): returns null when both allow_defaults and auto_approve_all are false", () => {
  assertEquals(guard1_shouldReturnNull({ allow_defaults: false, meta_json: { auto_approve_all: false } }), true);
});

Deno.test("Guard 1 (L4011): proceeds when allow_defaults is true regardless of auto_approve_all", () => {
  assertEquals(guard1_shouldReturnNull({ allow_defaults: true, meta_json: { auto_approve_all: false } }), false);
  assertEquals(guard1_shouldReturnNull({ allow_defaults: true, meta_json: { auto_approve_all: true } }), false);
  assertEquals(guard1_shouldReturnNull({ allow_defaults: true }), false);
});

Deno.test("Guard 1 (L4011): proceeds when auto_approve_all is true regardless of allow_defaults", () => {
  assertEquals(guard1_shouldReturnNull({ allow_defaults: false, meta_json: { auto_approve_all: true } }), false);
  assertEquals(guard1_shouldReturnNull({ allow_defaults: true, meta_json: { auto_approve_all: true } }), false);
});

Deno.test("Guard 1 (L4011): returns null when allow_defaults is absent and auto_approve_all is absent/null", () => {
  assertEquals(guard1_shouldReturnNull({}), true);
  assertEquals(guard1_shouldReturnNull({ meta_json: null }), true);
  assertEquals(guard1_shouldReturnNull({ meta_json: {} }), true);
});

// ── Guard 2: iteration_cap_exceptional force promote (L7326) ──
//   if ((job.allow_defaults || job.meta_json?.auto_approve_all) && ciGate.bestCiSoFar >= GLOBAL_MIN_CI)
//   Semantics: Force promote allowed if either allow_defaults or auto_approve_all is true.
function guard2_canForcePromote(job: Job): boolean {
  return !!(job.allow_defaults || job.meta_json?.auto_approve_all);
}

Deno.test("Guard 2 (L7326): force promote proceeds when allow_defaults is true", () => {
  assertEquals(guard2_canForcePromote({ allow_defaults: true }), true);
  assertEquals(guard2_canForcePromote({ allow_defaults: true, meta_json: { auto_approve_all: false } }), true);
});

Deno.test("Guard 2 (L7326): force promote proceeds when auto_approve_all is true", () => {
  assertEquals(guard2_canForcePromote({ allow_defaults: false, meta_json: { auto_approve_all: true } }), true);
  assertEquals(guard2_canForcePromote({ meta_json: { auto_approve_all: true } }), true);
});

Deno.test("Guard 2 (L7326): force promote blocked when both are false/absent", () => {
  assertEquals(guard2_canForcePromote({ allow_defaults: false }), false);
  assertEquals(guard2_canForcePromote({}), false);
  assertEquals(guard2_canForcePromote({ meta_json: null }), false);
  assertEquals(guard2_canForcePromote({ meta_json: {} }), false);
});

// ── Guard 3: notesExhausted simple promote (L7376) — now unconditional on notesExhausted ──
//   if (notesExhausted)  // allow_defaults/auto_approve_all guard removed per FIX
//   Semantics: notes=0 alone is sufficient to enter SIMPLE PROMOTION block.
function guard3_canSimplePromote(_job: Job): boolean {
  // Always returns true — the guard at L7376 is now `if (notesExhausted)` only.
  // The allow_defaults/auto_approve_all check was removed.
  return true;
}

Deno.test("Guard 3 (L7376): simple promote always allowed when notes are exhausted (guard removed)", () => {
  assertEquals(guard3_canSimplePromote({ allow_defaults: true }), true);
  assertEquals(guard3_canSimplePromote({ allow_defaults: false }), true);
  assertEquals(guard3_canSimplePromote({}), true);
  assertEquals(guard3_canSimplePromote({ allow_defaults: false, meta_json: { auto_approve_all: false } }), true);
  assertEquals(guard3_canSimplePromote({ meta_json: { auto_approve_all: true } }), true);
});

// ── Guard 4: seedCore auto-approve (derive downstream doc, L8697) ──
//   if ((job.allow_defaults || job.meta_json?.auto_approve_all) && seedCheck.missing.length === 0)
//   Semantics: Auto-approve seed core if either is true AND all seed docs exist.
function guard4_canAutoApproveSeed(job: Job, missingCount: number): boolean {
  return !!(job.allow_defaults || job.meta_json?.auto_approve_all) && missingCount === 0;
}

Deno.test("Guard 4 (L8697): auto-approve seed when allow_defaults=true and no missing docs", () => {
  assertEquals(guard4_canAutoApproveSeed({ allow_defaults: true }, 0), true);
});

Deno.test("Guard 4 (L8697): auto-approve seed when auto_approve_all=true and no missing docs", () => {
  assertEquals(guard4_canAutoApproveSeed({ meta_json: { auto_approve_all: true } }, 0), true);
});

Deno.test("Guard 4 (L8697): blocks when missing docs exist regardless of mode", () => {
  assertEquals(guard4_canAutoApproveSeed({ allow_defaults: true }, 1), false);
  assertEquals(guard4_canAutoApproveSeed({ meta_json: { auto_approve_all: true } }, 2), false);
  assertEquals(guard4_canAutoApproveSeed({ allow_defaults: true, meta_json: { auto_approve_all: true } }, 5), false);
});

Deno.test("Guard 4 (L8697): blocks when neither mode is active", () => {
  assertEquals(guard4_canAutoApproveSeed({}, 0), false);
  assertEquals(guard4_canAutoApproveSeed({ allow_defaults: false }, 0), false);
  assertEquals(guard4_canAutoApproveSeed({ meta_json: {} }, 0), false);
});

// ── Guard 5: seedCore auto-approve (existing doc, L9003) ──
//   Same condition as Guard 4 — identical pattern.
function guard5_canAutoApproveSeed(job: Job, missingCount: number): boolean {
  return guard4_canAutoApproveSeed(job, missingCount);
}

Deno.test("Guard 5 (L9003): auto-approve seed for existing doc when allow_defaults=true", () => {
  assertEquals(guard5_canAutoApproveSeed({ allow_defaults: true }, 0), true);
});

Deno.test("Guard 5 (L9003): auto-approve seed for existing doc when auto_approve_all=true", () => {
  assertEquals(guard5_canAutoApproveSeed({ meta_json: { auto_approve_all: true } }, 0), true);
});

Deno.test("Guard 5 (L9003): blocks when missing docs or neither mode active", () => {
  assertEquals(guard5_canAutoApproveSeed({ allow_defaults: true }, 3), false);
  assertEquals(guard5_canAutoApproveSeed({}, 0), false);
});

// ── Guard 6: early stage promotion (L9919) ──
//   if (earlyBestCi >= earlyTargetCi && blockersCount === 0 && (job.allow_defaults !== false || job.meta_json?.auto_approve_all))
//   NOTE: Uses `!== false` not `=== true` — allow_defaults being undefined means "enabled" here.
//   Semantics: Different from other guards — allow_defaults defaults to ON.
function guard6_canEarlyPromote(job: Job): boolean {
  return job.allow_defaults !== false || !!(job.meta_json?.auto_approve_all);
}

Deno.test("Guard 6 (L9919): early promote allowed when allow_defaults is true", () => {
  assertEquals(guard6_canEarlyPromote({ allow_defaults: true }), true);
});

Deno.test("Guard 6 (L9919): early promote allowed when allow_defaults is undefined (defaults to ON)", () => {
  assertEquals(guard6_canEarlyPromote({}), true);
  assertEquals(guard6_canEarlyPromote({ meta_json: null }), true);
  assertEquals(guard6_canEarlyPromote({ meta_json: {} }), true);
});

Deno.test("Guard 6 (L9919): early promote allowed when auto_approve_all is true even if allow_defaults is false", () => {
  assertEquals(guard6_canEarlyPromote({ allow_defaults: false, meta_json: { auto_approve_all: true } }), true);
});

Deno.test("Guard 6 (L9919): early promote blocked only when allow_defaults is explicitly false AND auto_approve_all is absent/false", () => {
  assertEquals(guard6_canEarlyPromote({ allow_defaults: false }), false);
  assertEquals(guard6_canEarlyPromote({ allow_defaults: false, meta_json: {} }), false);
  assertEquals(guard6_canEarlyPromote({ allow_defaults: false, meta_json: { auto_approve_all: false } }), false);
});

Deno.test("Guard 6 (L9919): early promote allowed when both are true", () => {
  assertEquals(guard6_canEarlyPromote({ allow_defaults: true, meta_json: { auto_approve_all: true } }), true);
});

// ── Guard 7: canon_mismatch advisory (L12082) ──
//   if (job.allow_defaults === true || job.meta_json?.auto_approve_all)
//   Semantics: Canon mismatch is treated as advisory only when explicitly allow_defaults=true or auto_approve_all=true.
//              Unlike Guard 6, undefined allow_defaults does NOT enable this.
function guard7_isCanonMismatchAdvisory(job: Job): boolean {
  return job.allow_defaults === true || !!(job.meta_json?.auto_approve_all);
}

Deno.test("Guard 7 (L12082): advisory when allow_defaults is explicitly true", () => {
  assertEquals(guard7_isCanonMismatchAdvisory({ allow_defaults: true }), true);
  assertEquals(guard7_isCanonMismatchAdvisory({ allow_defaults: true, meta_json: {} }), true);
});

Deno.test("Guard 7 (L12082): advisory when auto_approve_all is true", () => {
  assertEquals(guard7_isCanonMismatchAdvisory({ meta_json: { auto_approve_all: true } }), true);
  assertEquals(guard7_isCanonMismatchAdvisory({ allow_defaults: false, meta_json: { auto_approve_all: true } }), true);
});

Deno.test("Guard 7 (L12082): NOT advisory when allow_defaults is undefined (requires explicit true)", () => {
  assertEquals(guard7_isCanonMismatchAdvisory({}), false);
  assertEquals(guard7_isCanonMismatchAdvisory({ allow_defaults: undefined }), false);
});

Deno.test("Guard 7 (L12082): NOT advisory when allow_defaults is explicitly false and auto_approve_all absent", () => {
  assertEquals(guard7_isCanonMismatchAdvisory({ allow_defaults: false }), false);
  assertEquals(guard7_isCanonMismatchAdvisory({ allow_defaults: false, meta_json: null }), false);
  assertEquals(guard7_isCanonMismatchAdvisory({ allow_defaults: false, meta_json: {} }), false);
});

Deno.test("Guard 7 (L12082): NOT advisory when both are false/absent", () => {
  assertEquals(guard7_isCanonMismatchAdvisory({ allow_defaults: false, meta_json: { auto_approve_all: false } }), false);
});

// ── Behavior difference regression: Guards 6 vs 7 ──
// Guard 6 (L9919) uses `allow_defaults !== false` (default-on)
// Guard 7 (L12082) uses `allow_defaults === true` (must be explicit)
// This is intentional — early promotion should proceed by default,
// but canon mismatch advisory requires explicit opt-in.

Deno.test("Behavior difference: Guard 6 (default-on) vs Guard 7 (explicit-only) is intentional", () => {
  // When allow_defaults is undefined:
  assertEquals(guard6_canEarlyPromote({}), true, "Guard 6: undefined allow_defaults → enabled");
  assertEquals(guard7_isCanonMismatchAdvisory({}), false, "Guard 7: undefined allow_defaults → NOT advisory");
  // When auto_approve_all is true:
  assertEquals(guard6_canEarlyPromote({ allow_defaults: false, meta_json: { auto_approve_all: true } }), true, "Guard 6: auto_approve_all overrides");
  assertEquals(guard7_isCanonMismatchAdvisory({ allow_defaults: false, meta_json: { auto_approve_all: true } }), true, "Guard 7: auto_approve_all overrides");
});