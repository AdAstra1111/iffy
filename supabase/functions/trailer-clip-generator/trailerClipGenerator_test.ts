/**
 * trailer-clip-generator — Clip Generation Unit Tests
 *
 * Tests pure functions for content policy detection, prompt truncation,
 * look bible prompt building, generation profile resolution, and prompt builders.
 * Pure unit tests — no actual API calls or Supabase.
 */
import { assertEquals, assert, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ── Constants (mirrored from index.ts) ──────────────────────────────────────

const BLUEPRINT_READY_STATUSES = ["complete", "ready", "v2_shim"] as const;

const VEO_CONTENT_POLICY_PATTERNS = [
  "usage guidelines",
  "content policy",
  "safety filter",
  "safety settings",
  "blocked by safety",
  "prohibited content",
  "violates",
  "SAFETY",
  "ResponsibleAI",
] as const;

const RUNWAY_MAX_PROMPT_CHARS = 990;

interface GenerationProfile {
  key: string;
  prompt_prefix: string;
  motion_directives: string[];
  subject_clarity_directives: string[];
  negative_directives: string[];
  veo_params: Record<string, any>;
  runway_params: Record<string, any>;
  default_fps: number;
  motion_boost: number;
}

const GENERATION_PROFILES: Record<string, GenerationProfile> = {
  measured_prestige: {
    key: "measured_prestige",
    prompt_prefix: "Cinematic prestige drama. Controlled, deliberate camera movement. Rich shadows, naturalistic light.",
    motion_directives: [
      "slow measured dolly or track", "motivated push-in on emotional beats",
      "minimal handheld — steady controlled movement", "parallax through layered foreground elements",
    ],
    subject_clarity_directives: [
      "subject always sharp and centered in depth of field",
      "intentional rack focus for dramatic emphasis",
      "clean silhouette separation from background",
    ],
    negative_directives: [
      "no rapid cuts or whip pans", "no text overlays or logos", "no warping or morphing",
      "do not invent characters or locations", "no shaky amateur handheld",
    ],
    veo_params: { motion: "stable", clarity: "high", subject_lock: true },
    runway_params: { motion: "medium", camera: "dolly", guidance: "strong", aesthetic: "cinematic" },
    default_fps: 24,
    motion_boost: 1,
  },
  kinetic_trailer: {
    key: "kinetic_trailer",
    prompt_prefix: "High-energy cinematic trailer. Dynamic camera movement. Bold contrast, punchy color grading.",
    motion_directives: [
      "aggressive tracking shots with parallax", "motivated push-ins building tension",
      "whip pans and smash transitions between shots", "subject crosses frame with camera following",
      "depth shifts and rack focus for reveals",
    ],
    subject_clarity_directives: [
      "hero subject always readable even in motion",
      "strong foreground-background separation",
      "punchy lighting with dramatic key-fill ratio",
    ],
    negative_directives: [
      "no static locked-off shots unless intentional stillness beat",
      "no text overlays or logos", "no warping or face morphing",
      "do not invent characters or locations or props",
    ],
    veo_params: { motion: "high", clarity: "high", subject_lock: true },
    runway_params: { motion: "high", camera: "tracking", guidance: "strong", aesthetic: "cinematic" },
    default_fps: 24,
    motion_boost: 2,
  },
  handheld_doc: {
    key: "handheld_doc",
    prompt_prefix: "Documentary-style handheld camera. Naturalistic, observational, intimate. Available light.",
    motion_directives: [
      "organic handheld movement with subtle drift", "observational following of subject",
      "gentle reframing as action unfolds", "shallow depth breathing with subject",
    ],
    subject_clarity_directives: [
      "subject in natural context, not artificially lit",
      "allow slight softness for authenticity",
      "environmental framing — subject within world",
    ],
    negative_directives: [
      "no slick crane or dolly moves", "no text overlays or logos",
      "no artificial perfect framing", "do not invent characters or locations",
    ],
    veo_params: { motion: "medium", clarity: "medium" },
    runway_params: { motion: "medium", camera: "handheld", aesthetic: "documentary" },
    default_fps: 24,
    motion_boost: 1,
  },
  floating_dream: {
    key: "floating_dream",
    prompt_prefix: "Ethereal floating camera. Dreamlike, weightless movement. Soft diffused lighting, atmospheric haze.",
    motion_directives: [
      "slow floating crane movement", "weightless drift through space",
      "gentle arc around subject", "dreamy parallax with soft foreground bokeh",
    ],
    subject_clarity_directives: [
      "subject emerges from atmosphere", "soft glow on key elements",
      "deliberate shallow depth creating layered depth planes",
    ],
    negative_directives: [
      "no harsh or sudden movements", "no text overlays or logos",
      "no jarring cuts — everything flows", "do not invent characters or locations",
    ],
    veo_params: { motion: "stable", clarity: "medium" },
    runway_params: { motion: "low", camera: "crane", aesthetic: "dreamlike" },
    default_fps: 24,
    motion_boost: 1,
  },
  whip_promo: {
    key: "whip_promo",
    prompt_prefix: "Fast-cut promotional energy. Whip pans, smash cuts, high velocity. Bold saturated color.",
    motion_directives: [
      "rapid whip pans between elements", "aggressive push-ins with speed ramp feel",
      "subject snap-to with kinetic energy", "quick arc reveals with motion blur",
    ],
    subject_clarity_directives: [
      "hero moment freeze clarity amid motion",
      "strong graphic composition for impact frames",
      "high contrast pop on key subjects",
    ],
    negative_directives: [
      "no slow contemplative movement", "no text overlays or logos",
      "no warping or morphing artifacts", "do not invent characters or locations",
    ],
    veo_params: { motion: "high", clarity: "high" },
    runway_params: { motion: "high", camera: "whip", guidance: "strong", aesthetic: "promo" },
    default_fps: 24,
    motion_boost: 3,
  },
  horror_dread_slow: {
    key: "horror_dread_slow",
    prompt_prefix: "Slow dread horror. Creeping camera movement. Deep shadows, desaturated palette, tension through stillness broken by movement.",
    motion_directives: [
      "creeping slow push-in building unease", "static hold then sudden motivated move",
      "slow tracking revealing hidden details", "parallax through doorways and corridors",
    ],
    subject_clarity_directives: [
      "subject partially obscured — revealed through movement",
      "deep shadows with selective edge lighting",
      "negative space creating tension around subject",
    ],
    negative_directives: [
      "no bright cheerful lighting", "no text overlays or logos",
      "no fast whip pans unless scare beat", "do not invent characters or locations",
    ],
    veo_params: { motion: "stable", clarity: "high", subject_lock: true },
    runway_params: { motion: "low", camera: "dolly", guidance: "strong", aesthetic: "horror" },
    default_fps: 24,
    motion_boost: 1,
  },
};

// ── Pure functions (mirrored from index.ts) ──────────────────────────────────

function isContentPolicyError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return VEO_CONTENT_POLICY_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}

function truncatePrompt(prompt: string, maxChars: number): string {
  if (prompt.length <= maxChars) return prompt;
  return prompt.slice(0, maxChars - 3) + "...";
}

function buildLookBiblePromptSuffix(lb: any): string {
  if (!lb) return "";
  const parts: string[] = [];
  if (lb.palette) parts.push(`Color palette: ${lb.palette}`);
  if (lb.lighting_style) parts.push(`Lighting: ${lb.lighting_style}`);
  if (lb.contrast) parts.push(`Contrast: ${lb.contrast}`);
  if (lb.camera_language) parts.push(`Camera: ${lb.camera_language}`);
  if (lb.grain) parts.push(`Film texture: ${lb.grain}`);
  if (lb.color_grade) parts.push(`Grade: ${lb.color_grade}`);
  if (lb.custom_directives) parts.push(lb.custom_directives);
  const positives = parts.join(". ");
  const negatives = (lb.avoid_list || []).length > 0
    ? `Absolutely avoid: ${lb.avoid_list.join(", ")}.`
    : "";
  return [positives, negatives].filter(Boolean).join(". ");
}

function resolveProfile(styleOptions: Record<string, any>): { profile: GenerationProfile; reason: string } {
  const tone = styleOptions?.tonePreset || "";
  const cam = styleOptions?.cameraStyle || "";

  if (tone === "horror_dread" || tone === "horror_dread_slow")
    return { profile: GENERATION_PROFILES.horror_dread_slow, reason: `tonePreset=${tone}` };
  if (cam === "handheld")
    return { profile: GENERATION_PROFILES.handheld_doc, reason: `cameraStyle=handheld` };
  if (cam === "floating")
    return { profile: GENERATION_PROFILES.floating_dream, reason: `cameraStyle=floating` };
  if (cam === "whip_heavy")
    return { profile: GENERATION_PROFILES.whip_promo, reason: `cameraStyle=whip_heavy` };
  if (cam === "measured" && ["a24", "prestige_dark"].includes(tone))
    return { profile: GENERATION_PROFILES.measured_prestige, reason: `cameraStyle=measured+tonePreset=${tone}` };

  return { profile: GENERATION_PROFILES.kinetic_trailer, reason: "default" };
}

// ══════════════════════════════════════════════════════════════════════════════
// BLUEPRINT_READY_STATUSES
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("BLUEPRINT_READY_STATUSES: has all expected statuses", () => {
  assertEquals(BLUEPRINT_READY_STATUSES.length, 3);
  assert(BLUEPRINT_READY_STATUSES.includes("complete"));
  assert(BLUEPRINT_READY_STATUSES.includes("ready"));
  assert(BLUEPRINT_READY_STATUSES.includes("v2_shim"));
});

// ══════════════════════════════════════════════════════════════════════════════
// VEO_CONTENT_POLICY_PATTERNS
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("VEO_CONTENT_POLICY_PATTERNS: has all 9 patterns", () => {
  assertEquals(VEO_CONTENT_POLICY_PATTERNS.length, 9);
});

Deno.test("RUNWAY_MAX_PROMPT_CHARS: is 990", () => {
  assertEquals(RUNWAY_MAX_PROMPT_CHARS, 990);
});

// ══════════════════════════════════════════════════════════════════════════════
// isContentPolicyError
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("isContentPolicyError: detects 'usage guidelines'", () => {
  assert(isContentPolicyError("Error: This content violates usage guidelines"));
});

Deno.test("isContentPolicyError: detects 'content policy'", () => {
  assert(isContentPolicyError("Blocked by content policy restrictions"));
});

Deno.test("isContentPolicyError: detects 'SAFETY' (case-insensitive)", () => {
  assert(isContentPolicyError("Blocked by SAFETY filters"));
});

Deno.test("isContentPolicyError: detects 'safety filter'", () => {
  assert(isContentPolicyError("The safety filter blocked this request"));
});

Deno.test("isContentPolicyError: detects 'violates'", () => {
  assert(isContentPolicyError("Response violates terms of service"));
});

Deno.test("isContentPolicyError: returns false for non-policy errors", () => {
  assertEquals(isContentPolicyError("Rate limit exceeded"), false);
  assertEquals(isContentPolicyError("Internal server error"), false);
  assertEquals(isContentPolicyError("Invalid API key"), false);
  assertEquals(isContentPolicyError("Timeout"), false);
});

Deno.test("isContentPolicyError: returns false for empty string", () => {
  assertEquals(isContentPolicyError(""), false);
});

Deno.test("isContentPolicyError: case-insensitive matching works", () => {
  assert(isContentPolicyError("USAGE GUIDELINES"));
  assert(isContentPolicyError("Safety Settings"));
  assert(isContentPolicyError("Prohibited Content"));
  assert(isContentPolicyError("responsibleai"));
});

// ══════════════════════════════════════════════════════════════════════════════
// truncatePrompt
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("truncatePrompt: returns prompt unchanged when under limit", () => {
  assertEquals(truncatePrompt("short", 990), "short");
});

Deno.test("truncatePrompt: returns prompt unchanged when exactly at limit", () => {
  const exact = "x".repeat(990);
  assertEquals(truncatePrompt(exact, 990), exact);
});

Deno.test("truncatePrompt: truncates with ellipsis when over limit", () => {
  const long = "x".repeat(1000);
  const result = truncatePrompt(long, 990);
  assertEquals(result.length, 990);
  assert(result.endsWith("..."));
});

Deno.test("truncatePrompt: empty string returns empty", () => {
  assertEquals(truncatePrompt("", 990), "");
});

Deno.test("truncatePrompt: low maxChars value works", () => {
  const result = truncatePrompt("hello world", 8);
  assertEquals(result, "hello...");
  assertEquals(result.length, 8);
});

// ══════════════════════════════════════════════════════════════════════════════
// buildLookBiblePromptSuffix
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("buildLookBiblePromptSuffix: null/undefined returns empty", () => {
  assertEquals(buildLookBiblePromptSuffix(null), "");
  assertEquals(buildLookBiblePromptSuffix(undefined), "");
});

Deno.test("buildLookBiblePromptSuffix: builds suffix from all fields", () => {
  const lb = {
    palette: "warm amber",
    lighting_style: "naturalistic",
    contrast: "medium",
    camera_language: "handheld intimate",
    grain: "16mm",
    color_grade: "teal-orange",
    custom_directives: "Slow burn tension throughout",
    avoid_list: ["lens flare", "overexposure"],
  };
  const result = buildLookBiblePromptSuffix(lb);
  assert(result.includes("Color palette: warm amber"));
  assert(result.includes("Lighting: naturalistic"));
  assert(result.includes("Contrast: medium"));
  assert(result.includes("Camera: handheld intimate"));
  assert(result.includes("Film texture: 16mm"));
  assert(result.includes("Grade: teal-orange"));
  assert(result.includes("Slow burn tension throughout"));
  assert(result.includes("Absolutely avoid: lens flare, overexposure"));
});

Deno.test("buildLookBiblePromptSuffix: partial lb only includes present fields", () => {
  const lb = { palette: "dark moody" };
  const result = buildLookBiblePromptSuffix(lb);
  assert(result.includes("Color palette: dark moody"));
  assertEquals(result.includes("Lighting:"), false);
  assertEquals(result.includes("Absolutely avoid:"), false);
});

Deno.test("buildLookBiblePromptSuffix: no avoid list produces no negative section", () => {
  const lb = { palette: "dark", lighting_style: "low-key" };
  const result = buildLookBiblePromptSuffix(lb);
  assertEquals(result.includes("Absolutely avoid:"), false);
});

Deno.test("buildLookBiblePromptSuffix: empty avoid list produces no negative section", () => {
  const lb = { palette: "dark", avoid_list: [] };
  const result = buildLookBiblePromptSuffix(lb);
  assertEquals(result.includes("Absolutely avoid:"), false);
});

Deno.test("buildLookBiblePromptSuffix: custom_directives appended as-is", () => {
  const lb = { custom_directives: "Use anamorphic flares on highlights." };
  const result = buildLookBiblePromptSuffix(lb);
  assert(result.includes("Use anamorphic flares on highlights."));
});

Deno.test("buildLookBiblePromptSuffix: joins fields with '. '", () => {
  const lb = { palette: "cool blue", lighting_style: "high contrast" };
  const result = buildLookBiblePromptSuffix(lb);
  assert(result.includes(". "));
});

// ══════════════════════════════════════════════════════════════════════════════
// GENERATION_PROFILES — constant integrity
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("GENERATION_PROFILES: has all 6 profiles", () => {
  const keys = Object.keys(GENERATION_PROFILES);
  assertEquals(keys.length, 6);
  assert(keys.includes("measured_prestige"));
  assert(keys.includes("kinetic_trailer"));
  assert(keys.includes("handheld_doc"));
  assert(keys.includes("floating_dream"));
  assert(keys.includes("whip_promo"));
  assert(keys.includes("horror_dread_slow"));
});

Deno.test("GENERATION_PROFILES: all profiles have non-empty fields", () => {
  for (const [key, profile] of Object.entries(GENERATION_PROFILES)) {
    assertEquals(profile.key, key, `Profile ${key} key mismatch`);
    assert(profile.prompt_prefix.length > 0, `${key}: prompt_prefix empty`);
    assert(profile.motion_directives.length > 0, `${key}: motion_directives empty`);
    assert(profile.subject_clarity_directives.length > 0, `${key}: subject_clarity_directives empty`);
    assert(profile.negative_directives.length > 0, `${key}: negative_directives empty`);
    assert(typeof profile.default_fps === "number", `${key}: default_fps not a number`);
    assert(typeof profile.motion_boost === "number", `${key}: motion_boost not a number`);
    assert(profile.motion_boost >= 0 && profile.motion_boost <= 3, `${key}: motion_boost out of range`);
  }
});

Deno.test("GENERATION_PROFILES: all profiles have default_fps divisible by frame rate standards", () => {
  for (const [key, profile] of Object.entries(GENERATION_PROFILES)) {
    const validFps = [23.976, 24, 25, 29.97, 30, 48, 50, 60];
    assert(validFps.includes(profile.default_fps), `${key}: default_fps ${profile.default_fps} not standard`);
  }
});

Deno.test("GENERATION_PROFILES: measured_prestige has lowest motion_boost", () => {
  const mp = GENERATION_PROFILES.measured_prestige.motion_boost;
  assert(mp >= 0 && mp <= 1, "measured_prestige motion_boost should be low");
});

Deno.test("GENERATION_PROFILES: whip_promo has highest motion_boost", () => {
  assertEquals(GENERATION_PROFILES.whip_promo.motion_boost, 3);
});

Deno.test("GENERATION_PROFILES: kinetic_trailer has motion_boost=2", () => {
  assertEquals(GENERATION_PROFILES.kinetic_trailer.motion_boost, 2);
});

// ══════════════════════════════════════════════════════════════════════════════
// resolveProfile
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("resolveProfile: horror_dread tone returns horror_dread_slow profile", () => {
  const result = resolveProfile({ tonePreset: "horror_dread" });
  assertEquals(result.profile.key, "horror_dread_slow");
  assert(result.reason.includes("tonePreset"));
});

Deno.test("resolveProfile: horror_dread_slow tone returns horror_dread_slow profile", () => {
  const result = resolveProfile({ tonePreset: "horror_dread_slow" });
  assertEquals(result.profile.key, "horror_dread_slow");
});

Deno.test("resolveProfile: cameraStyle=handheld returns handheld_doc profile", () => {
  const result = resolveProfile({ cameraStyle: "handheld" });
  assertEquals(result.profile.key, "handheld_doc");
  assert(result.reason.includes("cameraStyle"));
});

Deno.test("resolveProfile: cameraStyle=floating returns floating_dream profile", () => {
  const result = resolveProfile({ cameraStyle: "floating" });
  assertEquals(result.profile.key, "floating_dream");
});

Deno.test("resolveProfile: cameraStyle=whip_heavy returns whip_promo profile", () => {
  const result = resolveProfile({ cameraStyle: "whip_heavy" });
  assertEquals(result.profile.key, "whip_promo");
});

Deno.test("resolveProfile: cameraStyle=measured + a24 tone returns measured_prestige", () => {
  const result = resolveProfile({ cameraStyle: "measured", tonePreset: "a24" });
  assertEquals(result.profile.key, "measured_prestige");
  assert(result.reason.includes("cameraStyle=measured+tonePreset=a24"));
});

Deno.test("resolveProfile: cameraStyle=measured + prestige_dark tone returns measured_prestige", () => {
  const result = resolveProfile({ cameraStyle: "measured", tonePreset: "prestige_dark" });
  assertEquals(result.profile.key, "measured_prestige");
});

Deno.test("resolveProfile: default (no options) returns kinetic_trailer", () => {
  const result = resolveProfile({});
  assertEquals(result.profile.key, "kinetic_trailer");
  assertEquals(result.reason, "default");
});

Deno.test("resolveProfile: empty styleOptions returns kinetic_trailer (null-safe via optional chaining)", () => {
  // The actual function handles null/undefined via styleOptions?.tonePreset
  // which returns undefined for null/undefined input, falling to default
  const nullResult = resolveProfile(null as unknown as Record<string, any>);
  assertEquals(nullResult.profile.key, "kinetic_trailer");
  const undefResult = resolveProfile(undefined as unknown as Record<string, any>);
  assertEquals(undefResult.profile.key, "kinetic_trailer");
});

Deno.test("resolveProfile: cameraStyle=measured without matching tone returns kinetic_trailer", () => {
  const result = resolveProfile({ cameraStyle: "measured", tonePreset: "comedic" });
  assertEquals(result.profile.key, "kinetic_trailer");
});

Deno.test("resolveProfile: empty options with tonePreset=something_else drops to default", () => {
  const result = resolveProfile({ tonePreset: "something_else" });
  assertEquals(result.profile.key, "kinetic_trailer");
});