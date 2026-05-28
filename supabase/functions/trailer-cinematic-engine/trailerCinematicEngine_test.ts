/**
 * trailer-cinematic-engine — Pure function tests
 *
 * Covers: resolveSeed, mulberry32, PHASES_ORDERED, buildAudioPlan,
 *         buildLookBibleSection, buildStyleOptionsSection, buildInspirationSection,
 *         runScriptGates, runJudgeGates, buildShotDesignStyleDirectives, buildFallbackShotSpecs,
 *         VALID_CAMERA_MOVES, CAMERA_MOVE_REMAP, VALID_SHOT_TYPES, VALID_TRANSITIONS, VALID_DEPTH
 */
import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ─── Constant mirrors ───

const PHASES_ORDERED = ["hook", "setup", "escalation", "twist", "crescendo", "button"] as const;

const VALID_CAMERA_MOVES = new Set([
  "push_in", "pull_out", "track", "arc", "handheld", "whip_pan",
  "crane", "tilt", "dolly_zoom", "static", "kinetic", "drift",
  "orbit", "float", "rise", "descend", "lateral", "boom",
]);

const CAMERA_MOVE_REMAP: Record<string, string> = {
  kinetic: "handheld", drift: "track", orbit: "arc", float: "crane",
  rise: "crane", descend: "crane", lateral: "track", boom: "crane",
};

const VALID_SHOT_TYPES = new Set(["wide", "medium", "close", "insert", "montage", "aerial", "macro"]);
const VALID_TRANSITIONS = new Set([
  "hard_cut", "match_cut", "whip_pan", "smash_cut", "l_cut",
  "j_cut", "dissolve", "dip_to_black", "strobe_cut",
]);
const VALID_DEPTH = new Set(["shallow", "deep", "mixed"]);

// ─── Pure function mirrors ───

function resolveSeed(seed?: string): string {
  return seed || `cs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function mulberry32(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 2654435761);
  }
  return () => {
    h |= 0; h = h + 0x6D2B79F5 | 0;
    let t = Math.imul(h ^ h >>> 15, 1 | h);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function buildAudioPlan(rhythmRun: any, styleOptions: Record<string, any> = {}): any {
  const hitPoints = rhythmRun.hit_points_json || [];
  const silenceWindows = rhythmRun.silence_windows_json || [];
  const phaseTimings = rhythmRun.phase_timings_json || {};
  const bpm = rhythmRun.bpm || 110;
  const dropMs = rhythmRun.drop_timestamp_ms || null;

  const trackStructure: any[] = [];
  const phaseToSection: Record<string, string> = {
    hook: "intro", setup: "intro", escalation: "build",
    twist: "build", crescendo: "drop", button: "aftermath",
  };
  const sectionMap: Record<string, { start_ms: number; end_ms: number }> = {};
  for (const [phase, timing] of Object.entries(phaseTimings) as [string, any][]) {
    const section = phaseToSection[phase] || "build";
    if (!sectionMap[section]) {
      sectionMap[section] = { start_ms: timing.start_ms || 0, end_ms: timing.end_ms || 0 };
    } else {
      sectionMap[section].start_ms = Math.min(sectionMap[section].start_ms, timing.start_ms || 0);
      sectionMap[section].end_ms = Math.max(sectionMap[section].end_ms, timing.end_ms || 0);
    }
  }
  for (const [section, range] of Object.entries(sectionMap)) {
    trackStructure.push({ section, start_ms: range.start_ms, end_ms: range.end_ms });
  }
  trackStructure.sort((a, b) => a.start_ms - b.start_ms);

  const sfxCues: any[] = [];
  for (const hp of hitPoints) {
    if (hp.type === "bass_drop" || (hp.phase === "crescendo" && hp.strength >= 8)) {
      const riserStart = Math.max(0, (hp.t_ms || 0) - 3000);
      sfxCues.push({ type: "riser", target_hit: hp.type, start_ms: riserStart, end_ms: hp.t_ms || 0 });
      sfxCues.push({ type: "impact", target_hit: hp.type, timestamp_ms: hp.t_ms || 0 });
    } else if (hp.type === "sting" || hp.type === "impact") {
      sfxCues.push({ type: "sting", target_hit: hp.type, timestamp_ms: hp.t_ms || 0 });
    } else if (hp.type === "button_stinger") {
      sfxCues.push({ type: "button_decay", target_hit: hp.type, timestamp_ms: hp.t_ms || 0 });
    }
  }

  const dropStyle = styleOptions.dropStyle || "hard_drop";
  if (dropMs) {
    const existingSilence = silenceWindows.find((sw: any) =>
      sw.end_ms >= dropMs - 500 && sw.start_ms <= dropMs
    );
    if (!existingSilence) {
      let silenceDur = 1000;
      if (dropStyle === "delayed_drop") silenceDur = 2000;
      if (dropStyle === "false_drop") silenceDur = 1200;
      silenceWindows.push({
        beat_index: null,
        start_ms: dropMs - silenceDur,
        end_ms: dropMs,
        reason: "pre_drop_silence",
      });
    }
  }

  const minSilence = styleOptions.minSilenceWindows ?? 2;
  if (silenceWindows.length < minSilence) {
    const intents = rhythmRun.beat_hit_intents_json || [];
    const candidates = intents
      .filter((i: any) => i.primary_hit === "none" && !silenceWindows.some((sw: any) => sw.beat_index === i.beat_index))
      .sort((a: any, b: any) => (a.beat_index || 0) - (b.beat_index || 0));

    for (const c of candidates) {
      if (silenceWindows.length >= minSilence) break;
      const beatGrid = rhythmRun.beat_grid_json || [];
      const beatEntry = beatGrid.find((bg: any) => bg.beat_index === c.beat_index);
      if (beatEntry) {
        silenceWindows.push({
          beat_index: c.beat_index,
          start_ms: beatEntry.start_ms || 0,
          end_ms: (beatEntry.start_ms || 0) + 800,
          reason: "enforced_minimum",
        });
      }
    }
  }

  return {
    bpm,
    track_structure: trackStructure,
    hit_markers: hitPoints,
    silence_windows: silenceWindows,
    sfx_cues: sfxCues,
    drop_ms: dropMs,
    drop_style: dropStyle,
    generated_at: new Date().toISOString(),
  };
}

function buildLookBibleSection(lb: any): string {
  if (!lb) return "";
  const locked = lb.is_locked;
  const prefix = locked ? "LOOK BIBLE (HARD CONSTRAINTS — must obey exactly)" : "LOOK BIBLE (style guidance — follow closely)";
  const lines: string[] = [
    "------------------------------------------------------------",
    prefix,
    "------------------------------------------------------------",
  ];
  if (lb.palette) lines.push(`PALETTE: ${lb.palette}`);
  if (lb.lighting_style) lines.push(`LIGHTING: ${lb.lighting_style}`);
  if (lb.contrast) lines.push(`CONTRAST: ${lb.contrast}`);
  if (lb.camera_language) lines.push(`CAMERA LANGUAGE: ${lb.camera_language}`);
  if (lb.grain) lines.push(`GRAIN/TEXTURE: ${lb.grain}`);
  if (lb.color_grade) lines.push(`COLOR GRADE: ${lb.color_grade}`);
  if (lb.reference_assets_notes) lines.push(`REFERENCE NOTES: ${lb.reference_assets_notes}`);
  if (lb.custom_directives) lines.push(`CUSTOM DIRECTIVES: ${lb.custom_directives}`);
  if (lb.avoid_list && lb.avoid_list.length > 0) {
    lines.push(`NEGATIVES (AVOID): ${lb.avoid_list.join(", ")}`);
    if (locked) {
      lines.push(`HARD NEGATIVE LIST — if any generated visual contains these elements, it MUST be rejected: ${lb.avoid_list.join(", ")}`);
    }
  }
  return "\n" + lines.join("\n") + "\n";
}

function buildStyleOptionsSection(so: Record<string, any>, trailerType: string): string {
  if (!so || Object.keys(so).length === 0) return "";
  const lines: string[] = [
    "------------------------------------------------------------",
    "STYLE OPTIONS (obey these creative directives)",
    "------------------------------------------------------------",
  ];
  const beatRanges: Record<string, string> = {
    teaser: "6–9 beats, 30–60s implied pacing",
    main: "8–14 beats, 90–120s",
    character: "8–12 beats, 60–90s",
    tone: "6–10 beats, 45–75s",
    sales: "10–16 beats, 120–180s",
  };
  lines.push(`BEAT RANGE: ${beatRanges[trailerType] || beatRanges.main}`);
  if (so.tonePreset) {
    const toneGuides: Record<string, string> = {
      a24: "Restrained early movement, implication over spectacle, slow build, textural visuals, patient silence.",
      prestige_dark: "Dark atmosphere, chiaroscuro lighting, deliberate pacing, weighted dialogue fragments.",
      blockbuster: "Higher contrast, clearer setup, big crescendo, spectacle beats, punchy text cards.",
      comedy_pop: "Brighter tone, faster hook, energetic pacing, punchy button with comedic timing.",
      horror_dread: "More negative space, extended silence windows, slow push-ins, dread over shock.",
      romance_warm: "Warm colour palette, gentle movement, intimate close-ups, emotional restraint then release.",
      thriller_taut: "Taut pacing, withholding information, sharp cuts, tension-forward movement.",
    };
    lines.push(`TONE PRESET: ${so.tonePreset} — ${toneGuides[so.tonePreset] || so.tonePreset}`);
  }
  if (so.pacingProfile) {
    const pacingGuides: Record<string, string> = {
      slow_burn_spike: "Low intensity early (1-4), then rapid spike at twist/crescendo (7-10).",
      steady_escalation: "Gradual increase across all phases, no sudden jumps.",
      fast_dense: "Higher shot_density_target across ALL phases (min 1.5). Rapid cuts throughout.",
      silence_heavy: "At least 3 beats with silence windows. Use silence as a compositional tool.",
      dialogue_forward: "Prioritise quoted_dialogue fragments. At least 4 beats should include dialogue.",
      music_forward: "Minimal dialogue, rely on visual rhythm and music cues. Fewer text cards.",
    };
    lines.push(`PACING: ${so.pacingProfile} — ${pacingGuides[so.pacingProfile] || so.pacingProfile}`);
  }
  if (so.revealStrategy) {
    const revealGuides: Record<string, string> = {
      withhold_twist: "Do NOT reveal the twist. Use withholding_note on twist beats. Imply, never show.",
      hint_twist: "Hint at the twist obliquely. Allow audience to infer but not confirm.",
      show_twist_spoiler: "Reveal the twist clearly. Allow later-story beats for maximum hook.",
      no_third_act: "Explicitly forbid any beats referencing third-act resolution or climax.",
    };
    lines.push(`REVEAL: ${so.revealStrategy} — ${revealGuides[so.revealStrategy] || so.revealStrategy}`);
  }
  if (so.movementOverall != null) {
    const mv = Number(so.movementOverall);
    lines.push(`MOVEMENT BASELINE: ${mv}/10 — Use ${mv} as the central gravity for movement_intensity_target. Early phases can be ${Math.max(1, mv - 3)}-${mv}, crescendo should reach ${Math.min(10, mv + 2)}-10.`);
  }
  if (so.cameraStyle) {
    const camGuides: Record<string, string> = {
      measured: "Controlled, deliberate camera moves. Cranes, slow dollies, composed arcs.",
      kinetic: "Energetic camera work. Tracking shots, push-ins, dynamic movement.",
      handheld: "Handheld throughout. Micro-shake, intimate energy, documentary feel.",
      floating: "Steadicam/gimbal floating. Dreamlike, weightless camera movement.",
      whip_heavy: "Frequent whip pans and fast transitions. High-energy editorial style.",
    };
    lines.push(`CAMERA STYLE: ${so.cameraStyle} — ${camGuides[so.cameraStyle] || so.cameraStyle}`);
  }
  if (so.lensBias) {
    const lensGuides: Record<string, string> = {
      wide: "Favour wide lenses (16-35mm). Spatial depth, environment-forward.",
      normal: "Favour normal lenses (40-50mm). Natural perspective.",
      portrait: "Favour portrait lenses (85-135mm). Compressed, intimate, shallow DOF.",
      mixed: "Mix lens lengths. Vary by phase: wide for setup, portrait for emotion, wide for crescendo.",
    };
    lines.push(`LENS BIAS: ${so.lensBias} — ${lensGuides[so.lensBias] || so.lensBias}`);
  }
  return "\n" + lines.join("\n") + "\n";
}

function buildInspirationSection(inspirationRefs: any[], referenceNotes: string, avoidNotes: string): string {
  const sections: string[] = [];
  if (inspirationRefs && inspirationRefs.length > 0) {
    sections.push("------------------------------------------------------------");
    sections.push("INSPIRATIONS (STYLE ONLY — DO NOT COPY)");
    sections.push("------------------------------------------------------------");
    sections.push("For each inspiration trailer, use only high-level style cues (pacing, tone, typography, sound strategy). Do NOT reference them verbatim. Do NOT copy lines. Do NOT mention the inspiration titles in output.");
    for (const insp of inspirationRefs.slice(0, 5)) {
      const parts = [insp.title || "Untitled"];
      if (insp.url) parts.push(insp.url);
      if (insp.notes) parts.push(insp.notes);
      sections.push(`- ${parts.join(" — ")}`);
    }
  }
  if (referenceNotes && referenceNotes.trim().length > 0) {
    sections.push("------------------------------------------------------------");
    sections.push("REFERENCE NOTES (EMULATE)");
    sections.push("------------------------------------------------------------");
    sections.push(referenceNotes.trim().slice(0, 2000));
  }
  if (avoidNotes && avoidNotes.trim().length > 0) {
    sections.push("------------------------------------------------------------");
    sections.push("AVOID LIST");
    sections.push("------------------------------------------------------------");
    sections.push(avoidNotes.trim().slice(0, 2000));
  }
  return sections.length > 0 ? "\n" + sections.join("\n") + "\n" : "";
}

function runScriptGates(beats: any[], scriptRun?: any, opts?: any) {
  const failures: string[] = [];
  const minSilence = opts?.minSilenceWindows ?? 2;
  const micro = opts?.microMontageIntensity ?? "medium";
  const strict = (opts?.strictCanonMode ?? "strict") === "strict";
  const canonText = opts?.canonText || "";
  const tType = opts?.trailerType || scriptRun?.trailer_type || "main";

  if (scriptRun && !scriptRun.canon_context_hash) {
    failures.push("Script run has no canon_context_hash — was it generated without a canon pack?");
  }

  const missingRefs = beats.filter((b: any) => !b.source_refs_json || (Array.isArray(b.source_refs_json) && b.source_refs_json.length === 0));
  if (missingRefs.length > 0) {
    failures.push(`${missingRefs.length} beat(s) missing source citations (source_refs_json empty): indices ${missingRefs.map((b: any) => b.beat_index).join(", ")}`);
  }

  const byPhase: Record<string, any[]> = {};
  for (const b of beats) {
    const p = b.phase;
    if (!byPhase[p]) byPhase[p] = [];
    byPhase[p].push(b);
  }
  let prevMaxIntensity = 0;
  for (const phase of PHASES_ORDERED) {
    const phaseBeats = byPhase[phase] || [];
    for (const b of phaseBeats) {
      const intensity = b.movement_intensity_target || 5;
      if (intensity < prevMaxIntensity - 1) {
        if (!b.withholding_note || b.withholding_note.trim().length === 0) {
          failures.push(`Beat #${b.beat_index} (${phase}): movement_intensity_target=${intensity} drops from ${prevMaxIntensity} without withholding_note`);
        }
      }
      prevMaxIntensity = Math.max(prevMaxIntensity, intensity);
    }
  }

  const silenceCount = beats.filter((b: any) => (b.silence_before_ms > 0) || (b.silence_after_ms > 0)).length;
  if (silenceCount < minSilence) {
    failures.push(`Only ${silenceCount} beat(s) have silence windows; minimum ${minSilence} required`);
  }

  const crescendoBeats = beats.filter((b: any) => b.phase === "crescendo");
  let reqDensity = 2.0, reqMovement = 7;
  if (micro === "medium") { reqDensity = 2.4; reqMovement = 7; }
  if (micro === "high") { reqDensity = 2.8; reqMovement = 8; }
  const hasMicroMontage = crescendoBeats.some((b: any) =>
    (b.shot_density_target || 0) >= reqDensity && (b.movement_intensity_target || 0) >= reqMovement
  );
  if (crescendoBeats.length > 0 && !hasMicroMontage) {
    failures.push(`Crescendo phase lacks micro-montage intent (need shot_density_target>=${reqDensity} AND movement_intensity_target>=${reqMovement} for ${micro} intensity)`);
  }

  const beatRanges: Record<string, [number, number]> = {
    teaser: [6, 9], main: [8, 14], character: [8, 12], tone: [6, 10], sales: [10, 16],
  };
  const [minBeats, maxBeats] = beatRanges[tType] || [8, 14];
  if (beats.length < minBeats || beats.length > maxBeats) {
    failures.push(`Beat count ${beats.length} outside ${tType} range [${minBeats}–${maxBeats}]`);
  }

  return { passed: failures.length === 0, failures };
}

function runJudgeGates(scores: Record<string, number>): { passed: boolean; blockers: string[]; repairActions: any[] } {
  const blockers: string[] = [];
  const repairActions: any[] = [];

  if ((scores.canon_adherence || 0) < 0.9) {
    blockers.push(`canon_adherence=${scores.canon_adherence} < 0.9`);
    repairActions.push({ type: "improve_citations", target: "script_beats", reason: "Canon adherence below threshold" });
  }
  if ((scores.movement_escalation || 0) < 0.75) {
    blockers.push(`movement_escalation=${scores.movement_escalation} < 0.75`);
    repairActions.push({ type: "fix_movement_curve", target: "script_beats", reason: "Movement escalation too flat" });
  }
  if ((scores.contrast_density || 0) < 0.75) {
    blockers.push(`contrast_density=${scores.contrast_density} < 0.75`);
    repairActions.push({ type: "increase_contrast", target: "script_beats", reason: "Contrast density below threshold" });
  }

  return { passed: blockers.length === 0, blockers, repairActions };
}

function buildShotDesignStyleDirectives(so: Record<string, any>, trailerType: string, platformKey: string, targetLengthMs?: number): string {
  const lines: string[] = [
    "------------------------------------------------------------",
    "STYLE DIRECTIVES (obey these)",
    "------------------------------------------------------------",
    `TRAILER TYPE: ${trailerType}`,
    `PLATFORM: ${platformKey}`,
  ];
  if (targetLengthMs) lines.push(`TARGET LENGTH: ~${Math.round(targetLengthMs / 1000)}s`);
  if (so.tonePreset) lines.push(`TONE: ${so.tonePreset}`);
  if (so.pacingProfile) lines.push(`PACING: ${so.pacingProfile}`);
  if (so.revealStrategy) lines.push(`REVEAL: ${so.revealStrategy}`);
  if (so.movementOverall != null) lines.push(`MOVEMENT BASELINE: ${so.movementOverall}/10`);
  if (so.cameraStyle) {
    const camMap: Record<string, string> = {
      measured: "Controlled, deliberate moves. Cranes, slow dollies, composed arcs.",
      kinetic: "Energetic tracking, push-ins, dynamic movement.",
      handheld: "Handheld micro-shake throughout, intimate documentary energy.",
      floating: "Steadicam/gimbal floating, dreamlike weightless movement.",
      whip_heavy: "Frequent whip pans and fast transitions, high-energy editorial.",
    };
    lines.push(`CAMERA STYLE: ${so.cameraStyle} — ${camMap[so.cameraStyle] || so.cameraStyle}`);
  }
  if (so.lensBias) {
    const lensMap: Record<string, string> = {
      wide: "Favour 16–35mm. Spatial depth, environment-forward.",
      normal: "Favour 40–50mm. Natural perspective.",
      portrait: "Favour 65–135mm. Compressed, intimate, shallow DOF.",
      mixed: "Vary by phase: wide for setup, portrait for emotion, wide+inserts for crescendo.",
    };
    lines.push(`LENS BIAS: ${so.lensBias} — ${lensMap[so.lensBias] || so.lensBias}`);
  }
  if (so.microMontageIntensity) {
    const mmMap: Record<string, string> = { low: "Crescendo: 3 shots, density ~2.0", medium: "Crescendo: 4-5 shots, density ~2.5", high: "Crescendo: 5-7 shots, density ~3.0, rapid-fire" };
    lines.push(`MICRO-MONTAGE: ${so.microMontageIntensity} — ${mmMap[so.microMontageIntensity] || so.microMontageIntensity}`);
  }
  if (so.dropStyle) {
    const dropMap: Record<string, string> = { hard_drop: "Sharp silence before crescendo, clean hard cut.", delayed_drop: "Extended silence (1500-3000ms) before crescendo.", false_drop: "False drop mid-escalation, then real crescendo drop." };
    lines.push(`DROP STYLE: ${so.dropStyle} — ${dropMap[so.dropStyle] || so.dropStyle}`);
  }
  if (so.sfxEmphasis) lines.push(`SFX EMPHASIS: ${so.sfxEmphasis}`);
  return lines.join("\n");
}

function buildFallbackShotSpecs(beats: any[], seed: string): any[] {
  const rand = mulberry32(`${seed}-shot-fallback`);
  const movesByPhase: Record<string, string[]> = {
    hook: ["push_in", "track", "arc"],
    setup: ["track", "push_in", "tilt"],
    escalation: ["handheld", "track", "push_in", "arc"],
    twist: ["pull_out", "dolly_zoom", "smash_cut" as any],
    crescendo: ["whip_pan", "handheld", "track", "arc", "push_in"],
    button: ["pull_out", "crane", "dissolve" as any],
  };
  const transitions = ["hard_cut", "match_cut", "whip_pan", "smash_cut", "l_cut", "j_cut", "dissolve", "dip_to_black", "strobe_cut"];
  const shotTypes = ["wide", "medium", "close", "insert"];
  const motifs = ["impact", "eyes", "hands", "silhouette", "door", "running", "fire", "water"];

  const specs: any[] = [];
  for (const b of beats) {
    const hint = b.generator_hint_json || {};
    const hasSilence = (b.silence_before_ms > 0) || (b.silence_after_ms > 0);
    const hasWithholding = !!(b.withholding_note && String(b.withholding_note).trim().length > 0);
    const baseMove = movesByPhase[b.phase]?.[0] || "push_in";
    const movePool = movesByPhase[b.phase] || ["push_in", "track", "arc"];

    let targetShots = 1;
    if (b.phase === "crescendo") targetShots = 6;
    else if ((b.shot_density_target || 1) >= 1.8) targetShots = 2;

    for (let i = 0; i < targetShots; i++) {
      const moveCandidate = hint.camera_move || movePool[(i + Math.floor(rand() * 10)) % movePool.length] || baseMove;
      const cameraMove = moveCandidate === "smash_cut" || moveCandidate === "dissolve"
        ? (hasSilence || hasWithholding ? "static" : "push_in")
        : moveCandidate;
      const movementTarget = Number(b.movement_intensity_target || 5);
      const movementIntensity = b.phase === "crescendo"
        ? Math.min(10, Math.max(8, movementTarget + (i % 2)))
        : Math.min(10, Math.max(1, movementTarget + (i === 0 ? 0 : 1)));
      const inTrans = b.phase === "crescendo"
        ? ["whip_pan", "smash_cut", "strobe_cut"][i % 3]
        : transitions[(b.beat_index + i) % transitions.length];
      const outTrans = b.phase === "button"
        ? (i === targetShots - 1 ? "dissolve" : "hard_cut")
        : transitions[(b.beat_index + i + 1) % transitions.length];

      const shot: any = {
        beat_index: b.beat_index,
        shot_index: i,
        shot_type: b.phase === "crescendo" ? shotTypes[(i + 1) % shotTypes.length] : (hint.shot_type || shotTypes[i % shotTypes.length]),
        lens_mm: hint.lens_mm ?? [24, 35, 50, 85][(b.beat_index + i) % 4],
        camera_move: cameraMove,
        movement_intensity: movementIntensity,
        depth_strategy: hint.depth_strategy || (i % 2 === 0 ? "deep" : "shallow"),
        foreground_element: hint.foreground_element || null,
        lighting_note: hint.lighting_note || `${b.phase} cinematic lighting`,
        subject_action: hint.subject_action || b.emotional_intent || "ambient motion",
        reveal_mechanic: hint.reveal_mechanic || "progressive reveal through motion",
        transition_in: inTrans,
        transition_out: outTrans,
        target_duration_ms: b.phase === "crescendo" ? 900 : (b.phase === "button" ? 2600 : 1800),
        prompt_hint_json: {
          visual_prompt: hint.visual_prompt || `${b.phase} beat: ${b.emotional_intent || "cinematic action"}`,
          style: hint.style || null,
          preferred_provider: hint.preferred_provider || "veo",
        },
      };
      if (b.phase === "crescendo") {
        shot.prompt_hint_json.montage_group_id = `mg-${b.beat_index}`;
        shot.prompt_hint_json.cut_on_action = true;
        shot.prompt_hint_json.motif_tag = motifs[(i + b.beat_index) % motifs.length];
      }
      specs.push(shot);
    }
  }
  return specs;
}

// ════════════════════════════════════════
// resolveSeed tests
// ════════════════════════════════════════

Deno.test("resolveSeed: returns provided seed as-is", () => {
  const result = resolveSeed("my-fixed-seed");
  assertEquals(result, "my-fixed-seed");
});

Deno.test("resolveSeed: returns generated seed when none provided", () => {
  const result = resolveSeed();
  assert(typeof result === "string");
  assert(result.startsWith("cs-"));
  assert(result.length > 3);
});

// ════════════════════════════════════════
// mulberry32 PRNG tests
// ════════════════════════════════════════

Deno.test("mulberry32: deterministic — same seed produces same sequence", () => {
  const rng1 = mulberry32("test-seed");
  const rng2 = mulberry32("test-seed");
  for (let i = 0; i < 10; i++) {
    assertEquals(rng1(), rng2());
  }
});

Deno.test("mulberry32: different seeds produce different sequences", () => {
  const rng1 = mulberry32("seed-a");
  const rng2 = mulberry32("seed-b");
  const seq1 = Array.from({ length: 5 }, () => rng1());
  const seq2 = Array.from({ length: 5 }, () => rng2());
  const allEqual = seq1.every((v, i) => v === seq2[i]);
  assert(!allEqual, "different seeds should produce different sequences");
});

Deno.test("mulberry32: values are between 0 and 1", () => {
  const rng = mulberry32("range-test");
  for (let i = 0; i < 100; i++) {
    const v = rng();
    assert(v >= 0 && v < 1, `Value ${v} should be in [0, 1)`);
  }
});

// ════════════════════════════════════════
// PHASES_ORDERED tests
// ════════════════════════════════════════

Deno.test("PHASES_ORDERED: has correct order and length", () => {
  assertEquals(PHASES_ORDERED.length, 6);
  assertEquals(PHASES_ORDERED[0], "hook");
  assertEquals(PHASES_ORDERED[2], "escalation");
  assertEquals(PHASES_ORDERED[4], "crescendo");
  assertEquals(PHASES_ORDERED[5], "button");
});

// ════════════════════════════════════════
// buildAudioPlan tests
// ════════════════════════════════════════

Deno.test("buildAudioPlan: produces track_structure from phase_timings", () => {
  const run = {
    bpm: 120,
    phase_timings_json: {
      hook: { start_ms: 0, end_ms: 3000 },
      setup: { start_ms: 3000, end_ms: 10000 },
    },
    hit_points_json: [],
    silence_windows_json: [],
  };
  const result = buildAudioPlan(run);
  assert(result.track_structure.length > 0);
  assertEquals(result.bpm, 120);
});

Deno.test("buildAudioPlan: creates sfx_cues from hit points (bass_drop -> riser+impact)", () => {
  const run = {
    hit_points_json: [
      { t_ms: 45000, type: "bass_drop", phase: "crescendo", strength: 9 },
    ],
    silence_windows_json: [],
    phase_timings_json: {},
  };
  const result = buildAudioPlan(run);
  assert(result.sfx_cues.some((c: any) => c.type === "riser"));
  assert(result.sfx_cues.some((c: any) => c.type === "impact"));
});

Deno.test("buildAudioPlan: creates sting cue from sting hit point", () => {
  const run = {
    hit_points_json: [{ t_ms: 5000, type: "sting", strength: 7 }],
    silence_windows_json: [],
    phase_timings_json: {},
  };
  const result = buildAudioPlan(run);
  assert(result.sfx_cues.some((c: any) => c.type === "sting"));
});

Deno.test("buildAudioPlan: adds pre_drop_silence when drop_ms present", () => {
  const run = {
    drop_timestamp_ms: 45000,
    hit_points_json: [],
    silence_windows_json: [],
    phase_timings_json: {},
  };
  const result = buildAudioPlan(run);
  assert(result.silence_windows.some((sw: any) => sw.reason === "pre_drop_silence"));
});

Deno.test("buildAudioPlan: enforces minimum silence windows from beat_hit_intents", () => {
  const run = {
    hit_points_json: [],
    silence_windows_json: [],
    phase_timings_json: {},
    beat_hit_intents_json: [
      { beat_index: 0, primary_hit: "none" },
    ],
    beat_grid_json: [
      { beat_index: 0, start_ms: 1000 },
    ],
  };
  const result = buildAudioPlan(run, { minSilenceWindows: 1 });
  assert(result.silence_windows.some((sw: any) => sw.reason === "enforced_minimum"));
});

Deno.test("buildAudioPlan: uses delayed_drop silence duration", () => {
  const run = {
    drop_timestamp_ms: 30000,
    hit_points_json: [],
    silence_windows_json: [],
    phase_timings_json: {},
  };
  const result = buildAudioPlan(run, { dropStyle: "delayed_drop" });
  const preDrop = result.silence_windows.find((sw: any) => sw.reason === "pre_drop_silence");
  assert(preDrop);
  // delayed_drop = 2000ms silence
  assertEquals(preDrop.end_ms - preDrop.start_ms, 2000);
});

// ════════════════════════════════════════
// buildLookBibleSection tests
// ════════════════════════════════════════

Deno.test("buildLookBibleSection: returns empty string for null", () => {
  assertEquals(buildLookBibleSection(null), "");
});

Deno.test("buildLookBibleSection: returns empty string for undefined", () => {
  assertEquals(buildLookBibleSection(undefined), "");
});

Deno.test("buildLookBibleSection: locked bible uses HARD CONSTRAINTS prefix", () => {
  const result = buildLookBibleSection({ is_locked: true });
  assert(result.includes("HARD CONSTRAINTS"));
});

Deno.test("buildLookBibleSection: unlocked bible uses style guidance prefix", () => {
  const result = buildLookBibleSection({ is_locked: false });
  assert(result.includes("style guidance"));
});

Deno.test("buildLookBibleSection: includes palette and lighting fields", () => {
  const result = buildLookBibleSection({ palette: "cool tones", lighting_style: "low key" });
  assert(result.includes("PALETTE: cool tones"));
  assert(result.includes("LIGHTING: low key"));
});

Deno.test("buildLookBibleSection: locked bible with avoid_list includes hard negative", () => {
  const result = buildLookBibleSection({ is_locked: true, avoid_list: ["lens flare", "grain"] });
  assert(result.includes("HARD NEGATIVE LIST"));
  assert(result.includes("lens flare"));
});

// ════════════════════════════════════════
// buildStyleOptionsSection tests
// ════════════════════════════════════════

Deno.test("buildStyleOptionsSection: returns empty for empty options", () => {
  assertEquals(buildStyleOptionsSection({}, "main"), "");
});

Deno.test("buildStyleOptionsSection: includes beat range for specific trailer type", () => {
  const result = buildStyleOptionsSection({ tonePreset: "blockbuster" }, "teaser");
  assert(result.includes("6–9 beats"));
});

Deno.test("buildStyleOptionsSection: includes tone preset guide", () => {
  const result = buildStyleOptionsSection({ tonePreset: "a24" }, "main");
  assert(result.includes("Restrained early movement"));
});

Deno.test("buildStyleOptionsSection: includes movement baseline", () => {
  const result = buildStyleOptionsSection({ movementOverall: 7 }, "main");
  assert(result.includes("MOVEMENT BASELINE: 7/10"));
});

// ════════════════════════════════════════
// buildInspirationSection tests
// ════════════════════════════════════════

Deno.test("buildInspirationSection: empty when no refs", () => {
  assertEquals(buildInspirationSection([], "", ""), "");
});

Deno.test("buildInspirationSection: includes inspiration titles", () => {
  const refs = [{ title: "Inception Trailer", url: "https://example.com", notes: "Great pacing" }];
  const result = buildInspirationSection(refs, "", "");
  assert(result.includes("Inception Trailer"));
  assert(result.includes("INSPIRATIONS"));
});

Deno.test("buildInspirationSection: includes avoid notes", () => {
  const result = buildInspirationSection([], "", "Avoid cliches");
  assert(result.includes("AVOID LIST"));
  assert(result.includes("Avoid cliches"));
});

Deno.test("buildInspirationSection: limits inspirations to 5", () => {
  const refs = Array.from({ length: 10 }, (_, i) => ({ title: `Trailer ${i}` }));
  const result = buildInspirationSection(refs, "", "");
  const matches = result.match(/- Trailer \d/g);
  assert(matches && matches.length <= 5);
});

// ════════════════════════════════════════
// runScriptGates tests
// ════════════════════════════════════════

Deno.test("runScriptGates: passes when all constraints satisfied", () => {
  const beats = [
    { beat_index: 0, phase: "hook", movement_intensity_target: 4, source_refs_json: [{ excerpt: "test" }], silence_before_ms: 500, silence_after_ms: 0 },
    { beat_index: 1, phase: "hook", movement_intensity_target: 5, source_refs_json: [{ excerpt: "test" }], silence_before_ms: 0, silence_after_ms: 300 },
    { beat_index: 2, phase: "setup", movement_intensity_target: 5, source_refs_json: [{ excerpt: "test" }], silence_before_ms: 200, silence_after_ms: 0 },
    { beat_index: 3, phase: "setup", movement_intensity_target: 5, source_refs_json: [{ excerpt: "test" }], silence_before_ms: 0, silence_after_ms: 0 },
    { beat_index: 4, phase: "escalation", movement_intensity_target: 6, source_refs_json: [{ excerpt: "test" }], silence_before_ms: 0, silence_after_ms: 0 },
    { beat_index: 5, phase: "escalation", movement_intensity_target: 7, source_refs_json: [{ excerpt: "test" }], silence_before_ms: 0, silence_after_ms: 0 },
    { beat_index: 6, phase: "twist", movement_intensity_target: 7, source_refs_json: [{ excerpt: "test" }], silence_before_ms: 0, silence_after_ms: 0 },
    { beat_index: 7, phase: "crescendo", movement_intensity_target: 8, shot_density_target: 2.8, source_refs_json: [{ excerpt: "test" }], silence_before_ms: 0, silence_after_ms: 0 },
    { beat_index: 8, phase: "button", movement_intensity_target: 7, source_refs_json: [{ excerpt: "test" }], silence_before_ms: 0, silence_after_ms: 0, withholding_note: "intentional cooldown" },
  ];
  const result = runScriptGates(beats, { canon_context_hash: "abc123", trailer_type: "main" });
  assertEquals(result.passed, true);
  assertEquals(result.failures.length, 0);
});

Deno.test("runScriptGates: fails when beats outside range for trailer type", () => {
  const beats = [{ beat_index: 0, phase: "hook", movement_intensity_target: 5, source_refs_json: [{ excerpt: "t" }] }];
  const result = runScriptGates(beats, { trailer_type: "main" });
  assertEquals(result.passed, false);
  assert(result.failures.some((f) => f.includes("outside")));
});

Deno.test("runScriptGates: fails when missing source_refs_json", () => {
  const beats = [
    { beat_index: 0, phase: "hook", movement_intensity_target: 5 },
    { beat_index: 1, phase: "hook", movement_intensity_target: 5, source_refs_json: [{ excerpt: "t" }] },
    { beat_index: 2, phase: "setup", movement_intensity_target: 5, source_refs_json: [{ excerpt: "t" }] },
    { beat_index: 3, phase: "setup", movement_intensity_target: 5, source_refs_json: [{ excerpt: "t" }] },
    { beat_index: 4, phase: "escalation", movement_intensity_target: 5, source_refs_json: [{ excerpt: "t" }] },
    { beat_index: 5, phase: "escalation", movement_intensity_target: 5, source_refs_json: [{ excerpt: "t" }] },
    { beat_index: 6, phase: "twist", movement_intensity_target: 5, source_refs_json: [{ excerpt: "t" }] },
    { beat_index: 7, phase: "crescendo", movement_intensity_target: 8, shot_density_target: 2.5, source_refs_json: [{ excerpt: "t" }] },
    { beat_index: 8, phase: "button", movement_intensity_target: 5, source_refs_json: [{ excerpt: "t" }] },
  ];
  const result = runScriptGates(beats, { canon_context_hash: "abc", trailer_type: "main" });
  assert(result.failures.some((f) => f.includes("missing source citations")));
});

Deno.test("runScriptGates: fails when insufficient silence windows", () => {
  const beats = Array.from({ length: 9 }, (_, i) => ({
    beat_index: i,
    phase: ["hook", "hook", "setup", "setup", "escalation", "escalation", "twist", "crescendo", "button"][i],
    movement_intensity_target: 5,
    source_refs_json: [{ excerpt: "t" }],
    silence_before_ms: 0,
    silence_after_ms: 0,
  }));
  const result = runScriptGates(beats, { canon_context_hash: "abc", trailer_type: "main" });
  assert(result.failures.some((f) => f.includes("silence windows")));
});

Deno.test("runJudgeGates: passes when all scores above thresholds", () => {
  const result = runJudgeGates({ canon_adherence: 0.95, movement_escalation: 0.85, contrast_density: 0.80 });
  assertEquals(result.passed, true);
  assertEquals(result.blockers.length, 0);
});

Deno.test("runJudgeGates: fails when canon_adherence below 0.9", () => {
  const result = runJudgeGates({ canon_adherence: 0.8, movement_escalation: 0.85, contrast_density: 0.80 });
  assertEquals(result.passed, false);
  assert(result.blockers.some((b) => b.includes("canon_adherence")));
  assert(result.repairActions.some((a) => a.type === "improve_citations"));
});

Deno.test("runJudgeGates: fails when multiple scores below threshold", () => {
  const result = runJudgeGates({ canon_adherence: 0.7, movement_escalation: 0.5, contrast_density: 0.4 });
  assertEquals(result.blockers.length, 3);
});

// ════════════════════════════════════════
// buildShotDesignStyleDirectives tests
// ════════════════════════════════════════

Deno.test("buildShotDesignStyleDirectives: includes trailer type and platform", () => {
  const result = buildShotDesignStyleDirectives({}, "main", "theatrical");
  assert(result.includes("TRAILER TYPE: main"));
  assert(result.includes("PLATFORM: theatrical"));
});

Deno.test("buildShotDesignStyleDirectives: includes target length", () => {
  const result = buildShotDesignStyleDirectives({}, "main", "theatrical", 90000);
  assert(result.includes("TARGET LENGTH: ~90s"));
});

Deno.test("buildShotDesignStyleDirectives: includes camera style description", () => {
  const result = buildShotDesignStyleDirectives({ cameraStyle: "handheld" }, "main", "theatrical");
  assert(result.includes("Handheld micro-shake throughout"));
});

// ════════════════════════════════════════
// buildFallbackShotSpecs tests
// ════════════════════════════════════════

Deno.test("buildFallbackShotSpecs: produces at least 1 shot per beat", () => {
  const beats = [{ beat_index: 0, phase: "hook", movement_intensity_target: 5 }];
  const specs = buildFallbackShotSpecs(beats, "test-seed");
  assert(specs.length >= 1);
  assertEquals(specs[0].beat_index, 0);
});

Deno.test("buildFallbackShotSpecs: crescendo beats produce 6 shots", () => {
  const beats = [{ beat_index: 0, phase: "crescendo", movement_intensity_target: 8 }];
  const specs = buildFallbackShotSpecs(beats, "test-seed");
  assertEquals(specs.length, 6);
});

Deno.test("buildFallbackShotSpecs: button phase uses longer target_duration_ms", () => {
  const beats = [{ beat_index: 0, phase: "button", movement_intensity_target: 5 }];
  const specs = buildFallbackShotSpecs(beats, "test-seed");
  assertEquals(specs[0].target_duration_ms, 2600);
});

Deno.test("buildFallbackShotSpecs: deterministic with same seed", () => {
  const beats = [
    { beat_index: 0, phase: "hook", movement_intensity_target: 5, generator_hint_json: {} },
    { beat_index: 1, phase: "setup", movement_intensity_target: 4, generator_hint_json: {} },
  ];
  const s1 = buildFallbackShotSpecs(beats, "deterministic-test");
  const s2 = buildFallbackShotSpecs(beats, "deterministic-test");
  assertEquals(s1.length, s2.length);
  assertEquals(s1[0].camera_move, s2[0].camera_move);
});

// ════════════════════════════════════════
// Constants tests
// ════════════════════════════════════════

Deno.test("VALID_CAMERA_MOVES: contains all standard moves", () => {
  assert(VALID_CAMERA_MOVES.has("push_in"));
  assert(VALID_CAMERA_MOVES.has("static"));
  assert(VALID_CAMERA_MOVES.has("whip_pan"));
  assert(VALID_CAMERA_MOVES.has("handheld"));
});

Deno.test("CAMERA_MOVE_REMAP: maps kinetic to handheld", () => {
  assertEquals(CAMERA_MOVE_REMAP.kinetic, "handheld");
});

Deno.test("CAMERA_MOVE_REMAP: maps drift to track", () => {
  assertEquals(CAMERA_MOVE_REMAP.drift, "track");
});

Deno.test("VALID_SHOT_TYPES: contains standard types", () => {
  assert(VALID_SHOT_TYPES.has("wide"));
  assert(VALID_SHOT_TYPES.has("montage"));
  assert(VALID_SHOT_TYPES.has("macro"));
});

Deno.test("VALID_TRANSITIONS: contains standard transitions", () => {
  assert(VALID_TRANSITIONS.has("hard_cut"));
  assert(VALID_TRANSITIONS.has("dissolve"));
  assert(VALID_TRANSITIONS.has("strobe_cut"));
  assertEquals(VALID_TRANSITIONS.size, 9);
});

Deno.test("VALID_DEPTH: contains all three options", () => {
  assertEquals(VALID_DEPTH.size, 3);
  assert(VALID_DEPTH.has("shallow"));
  assert(VALID_DEPTH.has("deep"));
  assert(VALID_DEPTH.has("mixed"));
});