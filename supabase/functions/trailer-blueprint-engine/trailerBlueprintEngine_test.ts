/**
 * trailer-blueprint-engine — Pure function tests
 *
 * Covers: ARC_TEMPLATES, buildGeneratorHint
 */
import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ─── Pure function mirrors ───

const ARC_TEMPLATES: Record<string, any> = {
  teaser: {
    name: "Teaser",
    target_duration_s: 30,
    beats: [
      { role: "hook", duration_range: [2, 4], description: "Striking visual or question" },
      { role: "world", duration_range: [3, 5], description: "Establish world/setting" },
      { role: "intrigue", duration_range: [3, 5], description: "Hint at conflict" },
      { role: "reveal", duration_range: [2, 4], description: "Character or twist reveal" },
      { role: "title_card", duration_range: [3, 5], description: "Title + release info" },
    ],
  },
  main: {
    name: "Main Trailer",
    target_duration_s: 90,
    beats: [
      { role: "cold_open", duration_range: [3, 5], description: "Provocative opening image or line" },
      { role: "world_establish", duration_range: [5, 8], description: "Set the world, genre, tone" },
      { role: "protagonist_intro", duration_range: [4, 7], description: "Meet the lead" },
      { role: "inciting_incident", duration_range: [4, 6], description: "The thing that changes everything" },
      { role: "rising_action_1", duration_range: [5, 8], description: "Stakes escalate" },
      { role: "rising_action_2", duration_range: [5, 8], description: "Complications, obstacles" },
      { role: "montage_peak", duration_range: [8, 15], description: "Fast-cut montage of spectacle" },
      { role: "emotional_beat", duration_range: [4, 6], description: "Quiet moment / emotional core" },
      { role: "climax_tease", duration_range: [5, 8], description: "Biggest visual spectacle hint" },
      { role: "stinger", duration_range: [2, 4], description: "Final surprise or button" },
      { role: "title_card", duration_range: [4, 6], description: "Title + date + credits" },
    ],
  },
  character: {
    name: "Character Trailer",
    target_duration_s: 60,
    beats: [
      { role: "character_intro", duration_range: [3, 5], description: "Who is this person?" },
      { role: "ordinary_world", duration_range: [4, 7], description: "Their world before" },
      { role: "call_to_action", duration_range: [3, 5], description: "What drives them" },
      { role: "struggle", duration_range: [5, 8], description: "Their obstacles" },
      { role: "transformation", duration_range: [4, 7], description: "How they change" },
      { role: "declaration", duration_range: [3, 5], description: "Defining moment/line" },
      { role: "title_card", duration_range: [3, 5], description: "Title card" },
    ],
  },
  tone: {
    name: "Tone Piece",
    target_duration_s: 45,
    beats: [
      { role: "atmosphere", duration_range: [5, 8], description: "Pure mood/texture" },
      { role: "world_detail", duration_range: [4, 7], description: "Specific visual details" },
      { role: "tension_build", duration_range: [5, 8], description: "Slow build of unease/wonder" },
      { role: "rupture", duration_range: [3, 5], description: "Something breaks the mood" },
      { role: "aftermath", duration_range: [4, 6], description: "New state / question mark" },
      { role: "title_card", duration_range: [3, 5], description: "Title card" },
    ],
  },
};

function buildGeneratorHint(params: { role: string; durationS: number; clipSpec: any }) {
  const { role, durationS, clipSpec } = params;

  const heroRoles = [
    "hook", "cold_open", "climax_tease", "stinger", "montage_peak",
    "rupture", "inciting_incident", "transformation", "declaration",
  ];
  const isHero = heroRoles.includes(role);

  const preferredProvider = isHero ? "runway" : "veo";

  const candidates =
    (role === "montage_peak" || role === "climax_tease") ? 3 :
    (role === "hook" || role === "cold_open" || role === "stinger") ? 2 :
    (role === "inciting_incident" || role === "rupture") ? 2 : 1;

  return {
    preferred_provider: preferredProvider,
    preferred_mode: "text_to_video" as const,
    candidates,
    length_ms: Math.round(durationS * 1000),
    aspect_ratio: "16:9",
    fps: 24,
    style_lock: true,
    init_images: {
      source: "storyboard_best_frame",
      frame_paths: [] as string[],
    },
  };
}

// ════════════════════════════════════════
// ARC_TEMPLATES tests
// ════════════════════════════════════════

Deno.test("ARC_TEMPLATES: all four templates exist", () => {
  assertEquals(Object.keys(ARC_TEMPLATES).length, 4);
  assert("teaser" in ARC_TEMPLATES);
  assert("main" in ARC_TEMPLATES);
  assert("character" in ARC_TEMPLATES);
  assert("tone" in ARC_TEMPLATES);
});

Deno.test("ARC_TEMPLATES: teaser has 5 beats, 30s target", () => {
  const t = ARC_TEMPLATES.teaser;
  assertEquals(t.name, "Teaser");
  assertEquals(t.target_duration_s, 30);
  assertEquals(t.beats.length, 5);
});

Deno.test("ARC_TEMPLATES: main trailer has 11 beats, 90s target", () => {
  const t = ARC_TEMPLATES.main;
  assertEquals(t.name, "Main Trailer");
  assertEquals(t.target_duration_s, 90);
  assertEquals(t.beats.length, 11);
});

Deno.test("ARC_TEMPLATES: character has 7 beats, 60s target", () => {
  const t = ARC_TEMPLATES.character;
  assertEquals(t.name, "Character Trailer");
  assertEquals(t.target_duration_s, 60);
  assertEquals(t.beats.length, 7);
});

Deno.test("ARC_TEMPLATES: tone has 6 beats, 45s target", () => {
  const t = ARC_TEMPLATES.tone;
  assertEquals(t.name, "Tone Piece");
  assertEquals(t.target_duration_s, 45);
  assertEquals(t.beats.length, 6);
});

Deno.test("ARC_TEMPLATES: every beat has duration_range array with 2 elements", () => {
  for (const [key, tmpl] of Object.entries(ARC_TEMPLATES)) {
    for (const beat of tmpl.beats) {
      assert(Array.isArray(beat.duration_range), `${key} beat ${beat.role} missing duration_range`);
      assertEquals(beat.duration_range.length, 2, `${key} beat ${beat.role} duration_range not length 2`);
      assert(typeof beat.duration_range[0] === "number", `${key} beat ${beat.role} duration_range[0] not number`);
      assert(typeof beat.duration_range[1] === "number", `${key} beat ${beat.role} duration_range[1] not number`);
    }
  }
});

Deno.test("ARC_TEMPLATES: all beats have role and description", () => {
  for (const [key, tmpl] of Object.entries(ARC_TEMPLATES)) {
    for (const beat of tmpl.beats) {
      assert(typeof beat.role === "string", `${key} beat missing role string`);
      assert(typeof beat.description === "string", `${key} beat ${beat.role} missing description`);
    }
  }
});

Deno.test("ARC_TEMPLATES: each template has title_card beat", () => {
  for (const [key, tmpl] of Object.entries(ARC_TEMPLATES)) {
    const hasTitleCard = tmpl.beats.some((b: any) => b.role === "title_card");
    assert(hasTitleCard, `${key} template missing title_card beat`);
  }
});

Deno.test("ARC_TEMPLATES: duration_ranges are non-negative", () => {
  for (const [key, tmpl] of Object.entries(ARC_TEMPLATES)) {
    for (const beat of tmpl.beats) {
      assert(beat.duration_range[0] >= 0, `${key} beat ${beat.role} has negative lower bound`);
      assert(beat.duration_range[1] >= beat.duration_range[0], `${key} beat ${beat.role} has upper < lower`);
    }
  }
});

// ════════════════════════════════════════
// buildGeneratorHint tests
// ════════════════════════════════════════

Deno.test("buildGeneratorHint: hero roles map to runway provider", () => {
  const heroRoles = ["hook", "cold_open", "climax_tease", "stinger", "montage_peak", "rupture", "inciting_incident"];
  for (const role of heroRoles) {
    const hint = buildGeneratorHint({ role, durationS: 3, clipSpec: {} });
    assertEquals(hint.preferred_provider, "runway", `${role} should map to runway`);
  }
});

Deno.test("buildGeneratorHint: non-hero roles map to veo provider", () => {
  const nonHeroRoles = ["setup", "world", "intrigue", "reveal", "title_card", "aftermath", "atmosphere"];
  for (const role of nonHeroRoles) {
    const hint = buildGeneratorHint({ role, durationS: 3, clipSpec: {} });
    assertEquals(hint.preferred_provider, "veo", `${role} should map to veo`);
  }
});

Deno.test("buildGeneratorHint: montage_peak and climax_tease get 3 candidates", () => {
  for (const role of ["montage_peak", "climax_tease"]) {
    const hint = buildGeneratorHint({ role, durationS: 5, clipSpec: {} });
    assertEquals(hint.candidates, 3);
  }
});

Deno.test("buildGeneratorHint: hook, cold_open, stinger get 2 candidates", () => {
  for (const role of ["hook", "cold_open", "stinger"]) {
    const hint = buildGeneratorHint({ role, durationS: 3, clipSpec: {} });
    assertEquals(hint.candidates, 2);
  }
});

Deno.test("buildGeneratorHint: inciting_incident and rupture get 2 candidates", () => {
  for (const role of ["inciting_incident", "rupture"]) {
    const hint = buildGeneratorHint({ role, durationS: 4, clipSpec: {} });
    assertEquals(hint.candidates, 2);
  }
});

Deno.test("buildGeneratorHint: regular roles get 1 candidate", () => {
  const hint = buildGeneratorHint({ role: "title_card", durationS: 3, clipSpec: {} });
  assertEquals(hint.candidates, 1);
});

Deno.test("buildGeneratorHint: length_ms is durationS * 1000 rounded", () => {
  const hint = buildGeneratorHint({ role: "hook", durationS: 3.5, clipSpec: {} });
  assertEquals(hint.length_ms, 3500);
});

Deno.test("buildGeneratorHint: default format parameters", () => {
  const hint = buildGeneratorHint({ role: "world", durationS: 5, clipSpec: {} });
  assertEquals(hint.aspect_ratio, "16:9");
  assertEquals(hint.fps, 24);
  assertEquals(hint.style_lock, true);
  assertEquals(hint.preferred_mode, "text_to_video");
});

Deno.test("buildGeneratorHint: init_images has storyboard_best_frame source", () => {
  const hint = buildGeneratorHint({ role: "hook", durationS: 3, clipSpec: {} });
  assertEquals(hint.init_images.source, "storyboard_best_frame");
  assertEquals(hint.init_images.frame_paths.length, 0);
});

Deno.test("buildGeneratorHint: role not in any special category gets 1 candidate + veo", () => {
  const hint = buildGeneratorHint({ role: "setup_quiet", durationS: 3, clipSpec: {} });
  assertEquals(hint.candidates, 1);
  assertEquals(hint.preferred_provider, "veo");
});