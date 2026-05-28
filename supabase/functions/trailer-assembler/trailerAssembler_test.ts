/**
 * trailer-assembler — Pure function tests
 *
 * Covers: formatTimecode, computeTrims, recomputeTimeline
 */
import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ─── Pure function mirrors ───

function formatTimecode(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const frac = Math.round((totalSec % 1) * 100);
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(frac).padStart(2, "0")}`;
}

function computeTrims(beat: any, clipDurationMs?: number | null): { trim_in_ms: number; trim_out_ms: number } {
  const plannedMs = beat.duration_ms || 3000;
  const trimIn = beat.trim_in_ms || 0;
  if (clipDurationMs && clipDurationMs > 0) {
    return { trim_in_ms: trimIn, trim_out_ms: Math.min(clipDurationMs, plannedMs) };
  }
  return { trim_in_ms: trimIn, trim_out_ms: plannedMs };
}

function recomputeTimeline(timeline: any[]): any[] {
  let currentMs = 0;
  return timeline.map((entry: any, idx: number) => {
    const trimIn = Math.max(0, entry.trim_in_ms || 0);
    const trimOut = Math.max(trimIn, entry.trim_out_ms ?? (entry.duration_ms || 0));
    const effectiveDuration = Math.max(0, trimOut - trimIn);
    const result = {
      ...entry,
      beat_index: idx,
      trim_in_ms: trimIn,
      trim_out_ms: trimOut,
      start_ms: currentMs,
      effective_duration_ms: effectiveDuration,
    };
    currentMs += effectiveDuration;
    return result;
  });
}

// ════════════════════════════════════════
// formatTimecode tests
// ════════════════════════════════════════

Deno.test("formatTimecode: zero ms", () => {
  assertEquals(formatTimecode(0), "00:00.00");
});

Deno.test("formatTimecode: exactly 1 second", () => {
  assertEquals(formatTimecode(1000), "00:01.00");
});

Deno.test("formatTimecode: 1 minute 30 seconds", () => {
  assertEquals(formatTimecode(90000), "01:30.00");
});

Deno.test("formatTimecode: with fractional seconds (1500ms)", () => {
  assertEquals(formatTimecode(1500), "00:01.50");
});

Deno.test("formatTimecode: rounds fraction (1999ms rounds to 100 centiseconds)", () => {
  assertEquals(formatTimecode(1999), "00:01.100");
});

Deno.test("formatTimecode: large value (5min 23.7s)", () => {
  assertEquals(formatTimecode(323700), "05:23.70");
});

Deno.test("formatTimecode: sub-second (450ms)", () => {
  assertEquals(formatTimecode(450), "00:00.45");
});

Deno.test("formatTimecode: exactly one hour boundary (3600000ms)", () => {
  assertEquals(formatTimecode(3600000), "60:00.00");
});

// ════════════════════════════════════════
// computeTrims tests
// ════════════════════════════════════════

Deno.test("computeTrims: uses duration_ms from beat when no clip duration", () => {
  const beat = { duration_ms: 5000, trim_in_ms: 0 };
  const result = computeTrims(beat, null);
  assertEquals(result.trim_in_ms, 0);
  assertEquals(result.trim_out_ms, 5000);
});

Deno.test("computeTrims: uses 3000 default when beat has no duration_ms", () => {
  const beat = { trim_in_ms: 0 };
  const result = computeTrims(beat, null);
  assertEquals(result.trim_out_ms, 3000);
});

Deno.test("computeTrims: caps trim_out to clip duration when clip is shorter than planned", () => {
  const beat = { duration_ms: 8000, trim_in_ms: 500 };
  const result = computeTrims(beat, 4000);
  assertEquals(result.trim_in_ms, 500);
  assertEquals(result.trim_out_ms, 4000);
});

Deno.test("computeTrims: uses planned duration when clip is longer", () => {
  const beat = { duration_ms: 3000, trim_in_ms: 200 };
  const result = computeTrims(beat, 10000);
  assertEquals(result.trim_in_ms, 200);
  assertEquals(result.trim_out_ms, 3000);
});

Deno.test("computeTrims: preserves existing trim_in_ms", () => {
  const beat = { duration_ms: 5000, trim_in_ms: 1000 };
  const result = computeTrims(beat, null);
  assertEquals(result.trim_in_ms, 1000);
  assertEquals(result.trim_out_ms, 5000);
});

Deno.test("computeTrims: clipDurationMs of 0 treated as no clip", () => {
  const beat = { duration_ms: 4000, trim_in_ms: 0 };
  const result = computeTrims(beat, 0);
  assertEquals(result.trim_out_ms, 4000);
});

// ════════════════════════════════════════
// recomputeTimeline tests
// ════════════════════════════════════════

Deno.test("recomputeTimeline: single entry starts at 0", () => {
  const input = [{ duration_ms: 3000, trim_in_ms: 0, trim_out_ms: 3000 }];
  const result = recomputeTimeline(input);
  assertEquals(result.length, 1);
  assertEquals(result[0].start_ms, 0);
  assertEquals(result[0].effective_duration_ms, 3000);
  assertEquals(result[0].beat_index, 0);
});

Deno.test("recomputeTimeline: two entries chain start_ms correctly", () => {
  const input = [
    { duration_ms: 3000, trim_in_ms: 0, trim_out_ms: 3000 },
    { duration_ms: 2000, trim_in_ms: 0, trim_out_ms: 2000 },
  ];
  const result = recomputeTimeline(input);
  assertEquals(result[0].start_ms, 0);
  assertEquals(result[0].effective_duration_ms, 3000);
  assertEquals(result[1].start_ms, 3000);
  assertEquals(result[1].effective_duration_ms, 2000);
});

Deno.test("recomputeTimeline: three entries with varying durations", () => {
  const input = [
    { duration_ms: 1500, trim_in_ms: 0, trim_out_ms: 1500 },
    { duration_ms: 4000, trim_in_ms: 500, trim_out_ms: 3500 },
    { duration_ms: 1000, trim_in_ms: 0, trim_out_ms: 1000 },
  ];
  const result = recomputeTimeline(input);
  assertEquals(result[0].start_ms, 0);
  assertEquals(result[0].effective_duration_ms, 1500);
  assertEquals(result[1].start_ms, 1500);
  assertEquals(result[1].effective_duration_ms, 3000);
  assertEquals(result[2].start_ms, 4500);
  assertEquals(result[2].effective_duration_ms, 1000);
});

Deno.test("recomputeTimeline: clamps trim_in to 0 (no negatives)", () => {
  const input = [{ duration_ms: 3000, trim_in_ms: -100, trim_out_ms: 2000 }];
  const result = recomputeTimeline(input);
  assertEquals(result[0].trim_in_ms, 0);
});

Deno.test("recomputeTimeline: handles empty trim fields", () => {
  const input = [{ duration_ms: 3000 }];
  const result = recomputeTimeline(input);
  assertEquals(result[0].trim_in_ms, 0);
  assertEquals(result[0].trim_out_ms, 3000);
  assertEquals(result[0].effective_duration_ms, 3000);
});

Deno.test("recomputeTimeline: preserves extra fields on entries", () => {
  const input = [
    { duration_ms: 2000, trim_in_ms: 0, trim_out_ms: 2000, role: "hook", clip_id: "abc-123" },
  ];
  const result = recomputeTimeline(input);
  assertEquals(result[0].role, "hook");
  assertEquals(result[0].clip_id, "abc-123");
});

Deno.test("recomputeTimeline: handles trimOut less than trimIn by clamping to trimIn", () => {
  const input = [{ duration_ms: 5000, trim_in_ms: 3000, trim_out_ms: 1000 }];
  const result = recomputeTimeline(input);
  assertEquals(result[0].trim_out_ms, 3000);
  assertEquals(result[0].effective_duration_ms, 0);
});

Deno.test("recomputeTimeline: beat_index is assigned sequentially", () => {
  const input = [
    { duration_ms: 1000, trim_in_ms: 0, trim_out_ms: 1000 },
    { duration_ms: 2000, trim_in_ms: 0, trim_out_ms: 2000 },
    { duration_ms: 3000, trim_in_ms: 0, trim_out_ms: 3000 },
  ];
  const result = recomputeTimeline(input);
  assertEquals(result[0].beat_index, 0);
  assertEquals(result[1].beat_index, 1);
  assertEquals(result[2].beat_index, 2);
});

Deno.test("recomputeTimeline: total duration sums correctly", () => {
  const input = [
    { duration_ms: 3000, trim_in_ms: 500, trim_out_ms: 2500 },
    { duration_ms: 5000, trim_in_ms: 1000, trim_out_ms: 4000 },
  ];
  const result = recomputeTimeline(input);
  const total = result.reduce((s: number, t: any) => s + t.effective_duration_ms, 0);
  assertEquals(total, 5000); // 2000 + 3000
});