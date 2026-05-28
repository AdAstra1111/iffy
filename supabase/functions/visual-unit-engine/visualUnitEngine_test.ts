/**
 * Tests for visual-unit-engine — JWT parsing, diff computation helpers,
 * and pure utility functions.
 *
 * Covers:
 *   1. parseUserId — extracts sub from valid JWT payload
 *   2. parseUserId — throws on expired token
 *   3. parseUserId — throws on malformed token
 *   4. parseUserId — throws on missing sub claim
 *   5. Diff computation — changed_fields detects changes
 *   6. Diff computation — score_deltas computed correctly
 *   7. Diff computation — shot_deltas computed correctly
 *   8. Diff computation — identical payloads produce no changed_fields
 *   9. Diff computation — nested JSON values compared via JSON.stringify
 */

import { assertEquals, assert, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

const DOC_TYPE_PRIORITY = [
  "shot_list", "scene_list", "screenplay", "script", "episode_script",
  "season_script", "beat_sheet", "character_bible", "series_overview",
  "season_arc", "episode_grid", "lookbook", "world_tone",
];

// ══════════════════════════════════════════════════════════════════════════════
// Functions under test (mirrored from visual-unit-engine/index.ts)
// ══════════════════════════════════════════════════════════════════════════════

function parseUserId(token: string): string {
  const payload = JSON.parse(atob(token.split(".")[1]));
  if (!payload.sub || (payload.exp && payload.exp < Date.now() / 1000)) throw new Error("expired");
  return payload.sub;
}

function computeDiff(payloadA: Record<string, any>, payloadB: Record<string, any>): {
  changedFields: any[];
  scoreDeltas: Record<string, number>;
  shotDeltas: { added: number; removed: number };
} {
  const allKeys = new Set([...Object.keys(payloadA), ...Object.keys(payloadB)]);
  const changedFields: any[] = [];
  const scoreDeltaFields = ["trailer_value", "storyboard_value", "pitch_value", "complexity"];
  const scoreDeltas: Record<string, number> = {};

  for (const key of allKeys) {
    const va = JSON.stringify(payloadA[key]);
    const vb = JSON.stringify(payloadB[key]);
    if (va !== vb) {
      changedFields.push({ field: key, from: payloadA[key], to: payloadB[key] });
      if (scoreDeltaFields.includes(key)) {
        scoreDeltas[key] = (payloadB[key] || 0) - (payloadA[key] || 0);
      }
    }
  }

  const shotsA = payloadA.suggested_shots || [];
  const shotsB = payloadB.suggested_shots || [];
  const shotDeltas = {
    added: Math.max(0, shotsB.length - shotsA.length),
    removed: Math.max(0, shotsA.length - shotsB.length),
  };

  return { changedFields, scoreDeltas, shotDeltas };
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Create a mock JWT with the given payload (base64url-encoded).
 * Format: header.payload.signature
 */
function makeToken(payload: Record<string, any>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  const sig = btoa("fake-signature");
  return `${header}.${body}.${sig}`;
}

/** Create a token expiring N seconds from now. */
function makeExpiringToken(expiresInSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return makeToken({ sub: "user_abc123", exp });
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. parseUserId — valid token
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("parseUserId: extracts sub from valid token", () => {
  const token = makeToken({ sub: "user_abc123", exp: Date.now() / 1000 + 3600 });
  const userId = parseUserId(token);
  assertEquals(userId, "user_abc123");
});

Deno.test("parseUserId: extracts sub with UUID value", () => {
  const token = makeToken({ sub: "550e8400-e29b-41d4-a716-446655440000", exp: 9999999999 });
  const userId = parseUserId(token);
  assertEquals(userId, "550e8400-e29b-41d4-a716-446655440000");
});

Deno.test("parseUserId: extracts sub with numeric string", () => {
  const token = makeToken({ sub: "12345", exp: 9999999999 });
  const userId = parseUserId(token);
  assertEquals(userId, "12345");
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. parseUserId — expired token throws
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("parseUserId: throws on expired token", () => {
  const token = makeExpiringToken(-3600); // Expired 1 hour ago
  try {
    parseUserId(token);
    assert(false, "should have thrown for expired token");
  } catch (e) {
    assertEquals((e as Error).message, "expired");
  }
});

Deno.test("parseUserId: throws on just-expired token (exp === now)", () => {
  const token = makeExpiringToken(0); // Expires right now
  try {
    parseUserId(token);
    assert(false, "should have thrown when exp <= now");
  } catch (e) {
    assertEquals((e as Error).message, "expired");
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. parseUserId — malformed token throws
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("parseUserId: throws on token without dot separators", () => {
  try {
    parseUserId("no-dots-here");
    assert(false, "should have thrown");
  } catch (e) {
    assert(e instanceof Error, "should throw an error");
  }
});

Deno.test("parseUserId: throws on non-JSON payload", () => {
  const token = `header.${btoa("not-json")}.signature`;
  try {
    parseUserId(token);
    assert(false, "should have thrown");
  } catch {
    // Expected
  }
});

Deno.test("parseUserId: throws on empty payload", () => {
  const token = `header.${btoa("")}.signature`;
  try {
    parseUserId(token);
    assert(false, "should have thrown");
  } catch {
    // Expected
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. parseUserId — missing sub claim
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("parseUserId: throws on missing sub claim", () => {
  const token = makeToken({ exp: 9999999999 }); // No sub
  try {
    parseUserId(token);
    assert(false, "should have thrown for missing sub");
  } catch (e) {
    assertEquals((e as Error).message, "expired");
  }
});

Deno.test("parseUserId: valid token with null sub throws", () => {
  const token = makeToken({ sub: null, exp: 9999999999 });
  try {
    parseUserId(token);
    assert(false, "should have thrown for null sub");
  } catch (e) {
    assertEquals((e as Error).message, "expired");
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Diff computation — changed_fields detects changes
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("diff: detects changed fields between two payloads", () => {
  const a = { location: "INT. HOUSE", tone: ["dramatic"], trailer_value: 7 };
  const b = { location: "EXT. FIELD", tone: ["dramatic", "tense"], trailer_value: 9 };
  const result = computeDiff(a, b);
  assertEquals(result.changedFields.length, 2, "location and trailer_value changed");
  assert(result.changedFields.some(f => f.field === "location"), "location in changes");
  assert(result.changedFields.some(f => f.field === "trailer_value"), "trailer_value in changes");
  assert(!result.changedFields.some(f => f.field === "tone"), "tone unchanged (same JSON)");
});

Deno.test("diff: detects added fields", () => {
  const a = { location: "HOUSE" };
  const b = { location: "HOUSE", characters_present: ["A"] };
  const result = computeDiff(a, b);
  assert(result.changedFields.some(f => f.field === "characters_present"), "new field detected");
  assertEquals(result.changedFields[0].from, undefined);
  assertEquals(result.changedFields[0].to, ["A"]);
});

Deno.test("diff: detects removed fields", () => {
  const a = { location: "HOUSE", complexity: 5 };
  const b = { location: "HOUSE" };
  const result = computeDiff(a, b);
  assert(result.changedFields.some(f => f.field === "complexity"), "removed field detected");
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Diff computation — score_deltas
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("diff: computes score deltas for matching fields", () => {
  const a = { trailer_value: 5, storyboard_value: 7, pitch_value: 3, complexity: 4 };
  const b = { trailer_value: 8, storyboard_value: 5, pitch_value: 3, complexity: 6 };
  const result = computeDiff(a, b);
  assertEquals(result.scoreDeltas["trailer_value"], 3);
  assertEquals(result.scoreDeltas["storyboard_value"], -2);
  assertEquals(result.scoreDeltas["pitch_value"], 0); // Unchanged
  assertEquals(result.scoreDeltas["complexity"], 2);
});

Deno.test("diff: score deltas treat missing as 0", () => {
  const a = {};
  const b = { trailer_value: 10 };
  const result = computeDiff(a, b);
  assertEquals(result.scoreDeltas["trailer_value"], 10);
});

Deno.test("diff: score deltas with removed field", () => {
  const a = { trailer_value: 10 };
  const b = {};
  const result = computeDiff(a, b);
  assertEquals(result.scoreDeltas["trailer_value"], -10);
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Diff computation — shot_deltas
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("diff: shot deltas count added shots", () => {
  const a = { suggested_shots: [{ type: "wide" }] };
  const b = { suggested_shots: [{ type: "wide" }, { type: "close_up" }, { type: "medium" }] };
  const result = computeDiff(a, b);
  assertEquals(result.shotDeltas.added, 2);
  assertEquals(result.shotDeltas.removed, 0);
});

Deno.test("diff: shot deltas count removed shots", () => {
  const a = { suggested_shots: [{ type: "wide" }, { type: "close_up" }, { type: "medium" }] };
  const b = { suggested_shots: [{ type: "wide" }] };
  const result = computeDiff(a, b);
  assertEquals(result.shotDeltas.added, 0);
  assertEquals(result.shotDeltas.removed, 2);
});

Deno.test("diff: shot deltas with no shots array are 0", () => {
  const a = {};
  const b = {};
  const result = computeDiff(a, b);
  assertEquals(result.shotDeltas.added, 0);
  assertEquals(result.shotDeltas.removed, 0);
});

Deno.test("diff: shot deltas when shots array missing on one side", () => {
  const a = {};
  const b = { suggested_shots: [{ type: "wide" }] };
  const result = computeDiff(a, b);
  assertEquals(result.shotDeltas.added, 1);
  assertEquals(result.shotDeltas.removed, 0);
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Diff — identical payloads
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("diff: identical payloads produce no changed_fields", () => {
  const payload = { location: "HOUSE", tone: ["dramatic"], trailer_value: 7 };
  const result = computeDiff(payload, payload);
  assertEquals(result.changedFields.length, 0);
  assertEquals(Object.keys(result.scoreDeltas).length, 0);
});

Deno.test("diff: identical empty payloads produce no changes", () => {
  const result = computeDiff({}, {});
  assertEquals(result.changedFields.length, 0);
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. Diff — nested JSON comparison via JSON.stringify
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("diff: detects changes in nested objects via stringify", () => {
  const a = { nested: { a: 1, b: 2 } };
  const b = { nested: { a: 1, b: 3 } };
  const result = computeDiff(a, b);
  assertEquals(result.changedFields.length, 1);
  assertEquals(result.changedFields[0].field, "nested");
});

Deno.test("diff: arrays compared by JSON.stringify", () => {
  const a = { items: ["a", "b"] };
  const b = { items: ["a", "b", "c"] };
  const result = computeDiff(a, b);
  assertEquals(result.changedFields.length, 1);
});

Deno.test("diff: null vs undefined recognized as different", () => {
  const a = { field: null };
  const b = { field: undefined };
  const result = computeDiff(a, b);
  assertEquals(result.changedFields.length, 1);
});