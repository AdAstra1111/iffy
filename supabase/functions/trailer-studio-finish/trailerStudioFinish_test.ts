/**
 * trailer-studio-finish — Pure function tests
 *
 * Covers: SOCIAL_VARIANTS, buildFinishingFilterGraph, computeColorCorrections
 */
import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ─── Pure function mirrors ───

const SOCIAL_VARIANTS: Record<string, { width: number; height: number; label: string }> = {
  master_16x9: { width: 1920, height: 1080, label: "Master 16:9" },
  social_9x16: { width: 1080, height: 1920, label: "Social 9:16 (Stories/Reels)" },
  feed_4x5: { width: 1080, height: 1350, label: "Feed 4:5 (Instagram)" },
  square_1x1: { width: 1080, height: 1080, label: "Square 1:1" },
};

function buildFinishingFilterGraph(profile: any): {
  video_filters: string[];
  audio_filters: string[];
  render_instructions: Record<string, any>;
} {
  const videoFilters: string[] = [];
  const audioFilters: string[] = [];

  // 1) Contrast + Saturation via eq
  if (profile.contrast_boost || profile.saturation_boost) {
    const contrast = 1 + (profile.contrast_boost || 0);
    const saturation = 1 + (profile.saturation_boost || 0);
    videoFilters.push(`eq=contrast=${contrast.toFixed(2)}:saturation=${saturation.toFixed(2)}`);
  }

  // 2) LUT (3D LUT file)
  if (profile.lut_storage_path) {
    videoFilters.push(`lut3d='${profile.lut_storage_path}'`);
  }

  // 3) Highlights rolloff (simple curves approximation)
  if (profile.highlights_rolloff > 0) {
    const rolloff = Math.min(1, profile.highlights_rolloff);
    const highPoint = Math.round(255 * (1 - rolloff * 0.3));
    videoFilters.push(`curves=highlights='0/0 0.5/0.5 1/${(highPoint / 255).toFixed(2)}'`);
  }

  // 4) Sharpen
  if (profile.sharpen_amount > 0) {
    const amount = Math.min(2, profile.sharpen_amount);
    videoFilters.push(`unsharp=5:5:${amount.toFixed(1)}:5:5:0`);
  }

  // 5) Film grain via noise
  if (profile.grain_amount > 0) {
    const strength = Math.round(profile.grain_amount * 30);
    videoFilters.push(`noise=alls=${strength}:allf=t+u`);
  }

  // 6) Vignette
  if (profile.vignette_amount > 0) {
    const angle = `PI/${Math.round(4 / Math.max(0.1, profile.vignette_amount))}`;
    videoFilters.push(`vignette=angle=${angle}`);
  }

  // Audio: loudness normalization
  audioFilters.push(
    `loudnorm=I=${profile.lufs_target || -14}:TP=${profile.true_peak_db || -1.0}:LRA=11`
  );

  return {
    video_filters: videoFilters,
    audio_filters: audioFilters,
    render_instructions: {
      codec: "libx264",
      crf: 18,
      preset: "medium",
      movflags: "+faststart",
      pix_fmt: "yuv420p",
      letterbox: profile.letterbox_enabled ? { ratio: profile.letterbox_ratio || "2.39" } : null,
      color_consistency: profile.color_consistency_enabled ? { strength: profile.color_consistency_strength || 0.6 } : null,
    },
  };
}

function computeColorCorrections(
  clips: any[],
  referenceClipId: string | null,
  strength: number = 0.6,
): { reference_clip_id: string | null; corrections: any[]; strength: number } {
  const reference = referenceClipId
    ? clips.find((c: any) => c.id === referenceClipId)
    : clips.find((c: any) => c.has_clip && !c.is_text_card);

  if (!reference) {
    return { reference_clip_id: null, corrections: [], strength };
  }

  const refProvider = reference.provider || "veo";
  const corrections = clips.map((clip: any) => {
    if (!clip.has_clip || clip.is_text_card || clip.clip_id === reference.clip_id) {
      return { beat_index: clip.beat_index, skip: true, reason: "reference or text card" };
    }

    const clipProvider = clip.provider || "veo";
    let rShift = 0, gShift = 0, bShift = 0;
    let contrastAdj = 0;

    if (clipProvider !== refProvider) {
      if (clipProvider === "runway" && refProvider === "veo") {
        rShift = -3; gShift = 0; bShift = 2; contrastAdj = 0.02;
      } else if (clipProvider === "veo" && refProvider === "runway") {
        rShift = 3; gShift = 0; bShift = -2; contrastAdj = -0.02;
      }
    }

    rShift = Math.round(rShift * strength);
    gShift = Math.round(gShift * strength);
    bShift = Math.round(bShift * strength);
    contrastAdj = contrastAdj * strength;

    return {
      beat_index: clip.beat_index,
      clip_id: clip.clip_id,
      provider: clipProvider,
      corrections: {
        r_shift: rShift,
        g_shift: gShift,
        b_shift: bShift,
        contrast_adj: Math.round(contrastAdj * 100) / 100,
      },
      filter: rShift || gShift || bShift
        ? `lutrgb=r=val+${rShift}:g=val+${gShift}:b=val+${bShift}`
        : null,
    };
  });

  return {
    reference_clip_id: reference.clip_id || reference.id,
    corrections,
    strength,
  };
}

// ════════════════════════════════════════
// SOCIAL_VARIANTS tests
// ════════════════════════════════════════

Deno.test("SOCIAL_VARIANTS: master_16x9 is 1920x1080", () => {
  assertEquals(SOCIAL_VARIANTS.master_16x9.width, 1920);
  assertEquals(SOCIAL_VARIANTS.master_16x9.height, 1080);
});

Deno.test("SOCIAL_VARIANTS: social_9x16 is 1080x1920", () => {
  assertEquals(SOCIAL_VARIANTS.social_9x16.width, 1080);
  assertEquals(SOCIAL_VARIANTS.social_9x16.height, 1920);
});

Deno.test("SOCIAL_VARIANTS: feed_4x5 is 1080x1350", () => {
  assertEquals(SOCIAL_VARIANTS.feed_4x5.width, 1080);
  assertEquals(SOCIAL_VARIANTS.feed_4x5.height, 1350);
});

Deno.test("SOCIAL_VARIANTS: square_1x1 is 1080x1080", () => {
  assertEquals(SOCIAL_VARIANTS.square_1x1.width, 1080);
  assertEquals(SOCIAL_VARIANTS.square_1x1.height, 1080);
});

Deno.test("SOCIAL_VARIANTS: all four variants exist", () => {
  assertEquals(Object.keys(SOCIAL_VARIANTS).length, 4);
});

// ════════════════════════════════════════
// buildFinishingFilterGraph tests
// ════════════════════════════════════════

Deno.test("buildFinishingFilterGraph: empty profile produces default audio loudnorm only", () => {
  const result = buildFinishingFilterGraph({});
  assertEquals(result.video_filters.length, 0);
  assertEquals(result.audio_filters.length, 1);
  assert(result.audio_filters[0].startsWith("loudnorm"));
});

Deno.test("buildFinishingFilterGraph: contrast and saturation produce eq filter", () => {
  const result = buildFinishingFilterGraph({ contrast_boost: 0.15, saturation_boost: 0.1 });
  assert(result.video_filters.some((f) => f.startsWith("eq=")));
});

Deno.test("buildFinishingFilterGraph: lut_storage_path adds lut3d filter", () => {
  const result = buildFinishingFilterGraph({ lut_storage_path: "/path/to/lut.cube" });
  assert(result.video_filters.some((f) => f.includes("lut3d")));
});

Deno.test("buildFinishingFilterGraph: highlights_rolloff adds curves filter", () => {
  const result = buildFinishingFilterGraph({ highlights_rolloff: 0.5 });
  assert(result.video_filters.some((f) => f.startsWith("curves")));
});

Deno.test("buildFinishingFilterGraph: sharpen_amount adds unsharp filter", () => {
  const result = buildFinishingFilterGraph({ sharpen_amount: 1.5 });
  assert(result.video_filters.some((f) => f.startsWith("unsharp")));
});

Deno.test("buildFinishingFilterGraph: grain_amount adds noise filter", () => {
  const result = buildFinishingFilterGraph({ grain_amount: 0.3 });
  assert(result.video_filters.some((f) => f.startsWith("noise")));
});

Deno.test("buildFinishingFilterGraph: vignette_amount adds vignette filter", () => {
  const result = buildFinishingFilterGraph({ vignette_amount: 0.8 });
  assert(result.video_filters.some((f) => f.startsWith("vignette")));
});

Deno.test("buildFinishingFilterGraph: letterbox_enabled sets render_instructions.letterbox", () => {
  const result = buildFinishingFilterGraph({ letterbox_enabled: true });
  assertEquals(result.render_instructions.letterbox?.ratio, "2.39");
});

Deno.test("buildFinishingFilterGraph: multiple effects produce multiple filters", () => {
  const profile = {
    contrast_boost: 0.1,
    saturation_boost: 0.05,
    sharpen_amount: 0.8,
    grain_amount: 0.2,
    highlights_rolloff: 0.3,
  };
  const result = buildFinishingFilterGraph(profile);
  assert(result.video_filters.length >= 3);
});

Deno.test("buildFinishingFilterGraph: render_instructions contains standard ffmpeg params", () => {
  const result = buildFinishingFilterGraph({});
  assertEquals(result.render_instructions.codec, "libx264");
  assertEquals(result.render_instructions.crf, 18);
  assertEquals(result.render_instructions.preset, "medium");
});

// ════════════════════════════════════════
// computeColorCorrections tests
// ════════════════════════════════════════

Deno.test("computeColorCorrections: returns empty when no reference clip found", () => {
  const clips = [{ beat_index: 0, has_clip: false }];
  const result = computeColorCorrections(clips, null, 0.6);
  assertEquals(result.corrections.length, 0);
  assertEquals(result.reference_clip_id, null);
});

Deno.test("computeColorCorrections: skips text cards and reference clip itself", () => {
  const clips = [
    { id: "ref-1", clip_id: "ref-1", beat_index: 0, has_clip: true, is_text_card: false, provider: "veo" },
    { clip_id: "clip-2", beat_index: 1, has_clip: true, is_text_card: true, provider: "veo" },
    { clip_id: "clip-3", beat_index: 2, has_clip: true, is_text_card: false, provider: "runway" },
  ];
  const result = computeColorCorrections(clips, "ref-1", 0.6);
  // clip-2 is text card → skip, clip-1 is reference → skip
  const skips = result.corrections.filter((c) => c.skip);
  assertEquals(skips.length, 2);
});

Deno.test("computeColorCorrections: cross-provider runway→veo applies negative r shift", () => {
  const clips = [
    { id: "veo-1", clip_id: "veo-1", beat_index: 0, has_clip: true, is_text_card: false, provider: "veo" },
    { clip_id: "runway-1", beat_index: 1, has_clip: true, is_text_card: false, provider: "runway" },
  ];
  const result = computeColorCorrections(clips, "veo-1", 1.0);
  const correction = result.corrections.find((c) => c.clip_id === "runway-1");
  assert(correction);
  assertEquals(correction.corrections.r_shift, -3);
  assertEquals(correction.corrections.b_shift, 2);
});

Deno.test("computeColorCorrections: cross-provider veo→runway applies positive r shift", () => {
  const clips = [
    { id: "runway-1", clip_id: "runway-1", beat_index: 0, has_clip: true, is_text_card: false, provider: "runway" },
    { clip_id: "veo-1", beat_index: 1, has_clip: true, is_text_card: false, provider: "veo" },
  ];
  const result = computeColorCorrections(clips, "runway-1", 1.0);
  const correction = result.corrections.find((c) => c.clip_id === "veo-1");
  assert(correction);
  assertEquals(correction.corrections.r_shift, 3);
  assertEquals(correction.corrections.b_shift, -2);
});

Deno.test("computeColorCorrections: same provider yields no shift", () => {
  const clips = [
    { id: "veo-1", clip_id: "veo-1", beat_index: 0, has_clip: true, is_text_card: false, provider: "veo" },
    { clip_id: "veo-2", beat_index: 1, has_clip: true, is_text_card: false, provider: "veo" },
  ];
  const result = computeColorCorrections(clips, "veo-1", 1.0);
  const correction = result.corrections.find((c) => c.clip_id === "veo-2");
  assert(correction);
  assertEquals(correction.corrections.r_shift, 0);
  assertEquals(correction.corrections.g_shift, 0);
  assertEquals(correction.corrections.b_shift, 0);
});

Deno.test("computeColorCorrections: strength scales the shifts", () => {
  const clips = [
    { id: "veo-1", clip_id: "veo-1", beat_index: 0, has_clip: true, is_text_card: false, provider: "veo" },
    { clip_id: "runway-1", beat_index: 1, has_clip: true, is_text_card: false, provider: "runway" },
  ];
  const result = computeColorCorrections(clips, "veo-1", 0.5);
  const correction = result.corrections.find((c) => c.clip_id === "runway-1");
  assert(correction);
  // Math.round(-3 * 0.5) = Math.round(-1.5) = -1
  assertEquals(correction.corrections.r_shift, -1);
});

Deno.test("computeColorCorrections: returns lutrgb filter string only when shift present", () => {
  const clips = [
    { id: "veo-1", clip_id: "veo-1", beat_index: 0, has_clip: true, is_text_card: false, provider: "veo" },
    { clip_id: "veo-2", beat_index: 1, has_clip: true, is_text_card: false, provider: "veo" },
  ];
  const result = computeColorCorrections(clips, "veo-1", 1.0);
  const correction = result.corrections.find((c) => c.clip_id === "veo-2");
  assert(correction);
  assertEquals(correction.filter, null);
});