/**
 * trailer-audio-engine — Audio Mix & Generation Unit Tests
 *
 * Tests the DEFAULT_MIX constants and audio stash state flow.
 * Pure unit tests — no actual Supabase or API calls.
 */
import { assertEquals, assert, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ── Constants (mirrored from index.ts) ──────────────────────────────────────

const DEFAULT_MIX = {
  music_gain_db: -10,
  sfx_gain_db: -6,
  dialogue_duck_db: -8,
  duck_attack_ms: 30,
  duck_release_ms: 250,
  target_lufs: -14,
};

const VALID_JOB_STATUSES = ["queued", "running", "succeeded", "failed"] as const;

const AUDIO_JOB_TYPES = ["voiceover", "music", "sfx", "mix", "ambient"] as const;

// ── Pure logic: STASH state machine ──

type StashState = "empty" | "partial" | "ready" | "exporting" | "done" | "failed";

interface StashStateRule {
  current: StashState;
  provided: string[];
  expected: StashState;
}

function resolveStashState(provided: string[], totalTypes: string[]): StashState {
  if (provided.length === 0) return "empty";
  if (provided.length >= totalTypes.length) return "ready";
  // Check if any are marked as failed
  return "partial";
}

// ── WAV header validation ──

function validateWavHeader(bytes: Uint8Array): { valid: boolean; sampleRate: number; channels: number } {
  if (bytes.length < 44) return { valid: false, sampleRate: 0, channels: 0 };
  const decoder = new TextDecoder();
  const riff = decoder.decode(bytes.slice(0, 4));
  const wave = decoder.decode(bytes.slice(8, 12));
  if (riff !== "RIFF" || wave !== "WAVE") return { valid: false, sampleRate: 0, channels: 0 };
  const view = new DataView(bytes.buffer);
  const sampleRate = view.getUint32(24, true);
  const channels = view.getUint16(22, true);
  return { valid: true, sampleRate, channels };
}

// ══════════════════════════════════════════════════════════════════════════════
// DEFAULT_MIX constants
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("DEFAULT_MIX: music_gain_db is -10", () => {
  assertEquals(DEFAULT_MIX.music_gain_db, -10);
});

Deno.test("DEFAULT_MIX: sfx_gain_db is -6", () => {
  assertEquals(DEFAULT_MIX.sfx_gain_db, -6);
});

Deno.test("DEFAULT_MIX: dialogue_duck_db is -8", () => {
  assertEquals(DEFAULT_MIX.dialogue_duck_db, -8);
});

Deno.test("DEFAULT_MIX: duck_attack_ms is 30", () => {
  assertEquals(DEFAULT_MIX.duck_attack_ms, 30);
});

Deno.test("DEFAULT_MIX: duck_release_ms is 250", () => {
  assertEquals(DEFAULT_MIX.duck_release_ms, 250);
});

Deno.test("DEFAULT_MIX: target_lufs is -14", () => {
  assertEquals(DEFAULT_MIX.target_lufs, -14);
});

Deno.test("DEFAULT_MIX: all 6 fields present", () => {
  const fields = Object.keys(DEFAULT_MIX);
  assertEquals(fields.length, 6);
  assert(fields.includes("music_gain_db"));
  assert(fields.includes("sfx_gain_db"));
  assert(fields.includes("dialogue_duck_db"));
  assert(fields.includes("duck_attack_ms"));
  assert(fields.includes("duck_release_ms"));
  assert(fields.includes("target_lufs"));
});

Deno.test("DEFAULT_MIX: music_gain_db is lowest gain (most reduction)", () => {
  // Music should be quieter than SFX
  assert(DEFAULT_MIX.music_gain_db < DEFAULT_MIX.sfx_gain_db);
});

Deno.test("DEFAULT_MIX: attack is faster than release", () => {
  assert(DEFAULT_MIX.duck_attack_ms < DEFAULT_MIX.duck_release_ms);
});

Deno.test("DEFAULT_MIX: target_lufs is broadcast-compliant", () => {
  // -14 LUFS is the standard for broadcast/movie trailers
  assertEquals(DEFAULT_MIX.target_lufs, -14);
});

// ══════════════════════════════════════════════════════════════════════════════
// Valid job type constants
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("VALID_JOB_STATUSES: has all expected statuses", () => {
  assertEquals(VALID_JOB_STATUSES.length, 4);
  assert(VALID_JOB_STATUSES.includes("queued"));
  assert(VALID_JOB_STATUSES.includes("running"));
  assert(VALID_JOB_STATUSES.includes("succeeded"));
  assert(VALID_JOB_STATUSES.includes("failed"));
});

Deno.test("AUDIO_JOB_TYPES: has all expected types", () => {
  assertEquals(AUDIO_JOB_TYPES.length, 5);
  assert(AUDIO_JOB_TYPES.includes("voiceover"));
  assert(AUDIO_JOB_TYPES.includes("music"));
  assert(AUDIO_JOB_TYPES.includes("sfx"));
  assert(AUDIO_JOB_TYPES.includes("mix"));
  assert(AUDIO_JOB_TYPES.includes("ambient"));
});

// ══════════════════════════════════════════════════════════════════════════════
// Stash state machine
// ══════════════════════════════════════════════════════════════════════════════

const TOTAL_AUDIO_TYPES = ["voiceover", "music", "sfx", "ambient"];

Deno.test("stash: empty provided -> state=empty", () => {
  const state = resolveStashState([], TOTAL_AUDIO_TYPES);
  assertEquals(state, "empty");
});

Deno.test("stash: partial provided -> state=partial", () => {
  const state = resolveStashState(["voiceover"], TOTAL_AUDIO_TYPES);
  assertEquals(state, "partial");
});

Deno.test("stash: half provided -> state=partial", () => {
  const state = resolveStashState(["voiceover", "music"], TOTAL_AUDIO_TYPES);
  assertEquals(state, "partial");
});

Deno.test("stash: all provided -> state=ready", () => {
  const state = resolveStashState(TOTAL_AUDIO_TYPES, TOTAL_AUDIO_TYPES);
  assertEquals(state, "ready");
});

Deno.test("stash: more provided than types -> state=ready", () => {
  const state = resolveStashState([...TOTAL_AUDIO_TYPES, "custom"], TOTAL_AUDIO_TYPES);
  assertEquals(state, "ready");
});

// ══════════════════════════════════════════════════════════════════════════════
// WAV stub validation
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("WAV: empty buffer is invalid", () => {
  const result = validateWavHeader(new Uint8Array(0));
  assertEquals(result.valid, false);
});

Deno.test("WAV: short buffer is invalid", () => {
  const result = validateWavHeader(new Uint8Array(10));
  assertEquals(result.valid, false);
});

Deno.test("WAV: stub WAV header validates correctly", () => {
  // Build the same 44-byte WAV header from the source stub
  const sampleRate = 44100;
  const numChannels = 1;
  const bitsPerSample = 16;
  const dataSize = sampleRate * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const result = validateWavHeader(new Uint8Array(buffer));
  assertEquals(result.valid, true);
  assertEquals(result.sampleRate, 44100);
  assertEquals(result.channels, 1);
});

Deno.test("WAV: non-WAV bytes are invalid", () => {
  const result = validateWavHeader(new Uint8Array(44));
  assertEquals(result.valid, false);
});