/**
 * trailer-continuity-engine — Pure function tests
 *
 * Covers: simpleHash, resolveSpecFields, DEFAULT_SETTINGS
 */
import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ─── Pure function mirrors ───

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 2654435761);
  }
  return (h >>> 0).toString(36);
}

const DEFAULT_SETTINGS = {
  direction_weight: 0.25,
  eyeline_weight: 0.20,
  lighting_weight: 0.15,
  palette_weight: 0.10,
  energy_weight: 0.20,
  pacing_weight: 0.10,
  min_transition_score: 0.60,
  allow_intentional_breaks: true,
  break_allowed_phases: ["twist", "crescendo"],
};

function resolveSpecFields(clip: any): Record<string, any> {
  const gp = clip.gen_params || {};

  // Priority 1: gen_params.shot_spec_used (inline object from pipeline)
  if (gp.shot_spec_used && typeof gp.shot_spec_used === "object") {
    return gp.shot_spec_used;
  }

  // Priority 2: will be resolved from DB via shot_spec_id (handled by caller)
  // Priority 3: fall back to gen_params clip_spec fields
  return {
    camera_move: gp.camera_move || gp.clip_spec?.camera_move || "unknown",
    shot_type: gp.shot_type || gp.clip_spec?.shot_type || "unknown",
    lens_mm: gp.lens_mm || gp.clip_spec?.lens_mm || null,
    movement_intensity: gp.movement_intensity || gp.clip_spec?.movement_intensity || 5,
    depth_strategy: gp.depth_strategy || gp.clip_spec?.depth_strategy || null,
    transition_in: gp.transition_in || gp.clip_spec?.transition_in || null,
    transition_out: gp.transition_out || gp.clip_spec?.transition_out || null,
    phase: gp.phase || gp.clip_spec?.phase || "unknown",
  };
}

// ════════════════════════════════════════
// simpleHash tests
// ════════════════════════════════════════

Deno.test("simpleHash: deterministic — same input yields same hash", () => {
  const h1 = simpleHash("hello world");
  const h2 = simpleHash("hello world");
  assertEquals(h1, h2);
});

Deno.test("simpleHash: different inputs produce different hashes", () => {
  const h1 = simpleHash("hello");
  const h2 = simpleHash("world");
  assert(h1 !== h2, "different inputs should produce different hashes");
});

Deno.test("simpleHash: empty string produces a hash", () => {
  const h = simpleHash("");
  assertEquals(typeof h, "string");
  assert(h.length > 0);
});

Deno.test("simpleHash: hash of JSON.stringify settings object is deterministic", () => {
  const settings = { direction_weight: 0.25, eyeline_weight: 0.20 };
  const h1 = simpleHash(JSON.stringify(settings));
  const h2 = simpleHash(JSON.stringify(settings));
  assertEquals(h1, h2);
});

Deno.test("simpleHash: different objects produce different hashes", () => {
  const a = simpleHash(JSON.stringify({ x: 1 }));
  const b = simpleHash(JSON.stringify({ x: 2 }));
  assert(a !== b);
});

Deno.test("simpleHash: longer strings produce hashes", () => {
  const long = "a".repeat(1000);
  const h = simpleHash(long);
  assertEquals(typeof h, "string");
  assert(h.length > 0);
});

// ════════════════════════════════════════
// DEFAULT_SETTINGS tests
// ════════════════════════════════════════

Deno.test("DEFAULT_SETTINGS: weights sum to ~1.0", () => {
  const sum = DEFAULT_SETTINGS.direction_weight + DEFAULT_SETTINGS.eyeline_weight
    + DEFAULT_SETTINGS.lighting_weight + DEFAULT_SETTINGS.palette_weight
    + DEFAULT_SETTINGS.energy_weight + DEFAULT_SETTINGS.pacing_weight;
  assert(Math.abs(sum - 1.0) < 0.001, `sum ${sum} should be approximately 1.0`);
});

Deno.test("DEFAULT_SETTINGS: min_transition_score is 0.60", () => {
  assertEquals(DEFAULT_SETTINGS.min_transition_score, 0.60);
});

Deno.test("DEFAULT_SETTINGS: intentional breaks allowed", () => {
  assertEquals(DEFAULT_SETTINGS.allow_intentional_breaks, true);
});

Deno.test("DEFAULT_SETTINGS: break_allowed_phases contains twist and crescendo", () => {
  assert(DEFAULT_SETTINGS.break_allowed_phases.includes("twist"));
  assert(DEFAULT_SETTINGS.break_allowed_phases.includes("crescendo"));
  assertEquals(DEFAULT_SETTINGS.break_allowed_phases.length, 2);
});

// ════════════════════════════════════════
// resolveSpecFields tests
// ════════════════════════════════════════

Deno.test("resolveSpecFields: returns shot_spec_used when present as object", () => {
  const clip = {
    gen_params: {
      shot_spec_used: { camera_move: "track", shot_type: "wide", lens_mm: 24 },
      camera_move: "push_in", // should be overridden
    },
  };
  const result = resolveSpecFields(clip);
  assertEquals(result.camera_move, "track");
  assertEquals(result.shot_type, "wide");
  assertEquals(result.lens_mm, 24);
});

Deno.test("resolveSpecFields: falls back to gen_params top-level fields when no shot_spec_used", () => {
  const clip = {
    gen_params: {
      camera_move: "push_in",
      shot_type: "close",
      movement_intensity: 7,
      phase: "crescendo",
    },
  };
  const result = resolveSpecFields(clip);
  assertEquals(result.camera_move, "push_in");
  assertEquals(result.shot_type, "close");
  assertEquals(result.movement_intensity, 7);
  assertEquals(result.phase, "crescendo");
});

Deno.test("resolveSpecFields: falls back to clip_spec sub-object fields", () => {
  const clip = {
    gen_params: {
      clip_spec: { camera_move: "arc", shot_type: "medium", lens_mm: 50 },
    },
  };
  const result = resolveSpecFields(clip);
  assertEquals(result.camera_move, "arc");
  assertEquals(result.shot_type, "medium");
  assertEquals(result.lens_mm, 50);
});

Deno.test("resolveSpecFields: uses default 'unknown' for missing fields", () => {
  const clip = { gen_params: {} };
  const result = resolveSpecFields(clip);
  assertEquals(result.camera_move, "unknown");
  assertEquals(result.shot_type, "unknown");
  assertEquals(result.phase, "unknown");
});

Deno.test("resolveSpecFields: uses default 5 for movement_intensity", () => {
  const clip = { gen_params: {} };
  const result = resolveSpecFields(clip);
  assertEquals(result.movement_intensity, 5);
});

Deno.test("resolveSpecFields: returns null for missing lens_mm", () => {
  const clip = { gen_params: {} };
  const result = resolveSpecFields(clip);
  assertEquals(result.lens_mm, null);
});

Deno.test("resolveSpecFields: returns null for missing depth_strategy/transitions", () => {
  const clip = { gen_params: {} };
  const result = resolveSpecFields(clip);
  assertEquals(result.depth_strategy, null);
  assertEquals(result.transition_in, null);
  assertEquals(result.transition_out, null);
});

Deno.test("resolveSpecFields: gen_params top-level beats clip_spec for same field", () => {
  const clip = {
    gen_params: {
      camera_move: "track",
      clip_spec: { camera_move: "static" },
    },
  };
  const result = resolveSpecFields(clip);
  // top-level gen_params takes priority over clip_spec
  assertEquals(result.camera_move, "track");
});

Deno.test("resolveSpecFields: handles null gen_params gracefully", () => {
  const clip = { gen_params: null };
  const result = resolveSpecFields(clip);
  assertEquals(result.camera_move, "unknown");
  assertEquals(result.shot_type, "unknown");
});