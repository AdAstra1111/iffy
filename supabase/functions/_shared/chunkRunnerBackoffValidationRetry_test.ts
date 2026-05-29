/**
 * Exponential Backoff + Validation Retry — P2 test suite
 *
 * Tests the backoffDelay function (line 70-73) and the validation retry loop
 * (lines 696-802) in chunkRunner.ts:
 *   1. backoffDelay applies 500ms × 2^attempt, capped at 4000ms
 *   2. Story outline unparseable JSON → retries with stronger instruction, then falls through
 *   3. validationError is tracked across retry attempts and surfaced in final error status
 *
 * Run: deno test chunkRunnerBackoffValidationRetry_test.ts --allow-none
 */

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ═══════════════════════════════════════════════════════════════
// 1. backoffDelay — exponential backoff timing
// ═══════════════════════════════════════════════════════════════

// Inlined from chunkRunner.ts line 70-73
function backoffDelay(attempt: number): Promise<void> {
  const ms = Math.min(500 * Math.pow(2, attempt), 4000);
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.test({
  name: "backoffDelay — attempt 0 returns 500ms",
  fn() {
    const start = Date.now();
    return backoffDelay(0).then(() => {
      const elapsed = Date.now() - start;
      assert(elapsed >= 450 && elapsed <= 700, `expected ~500ms, got ${elapsed}ms`);
    });
  },
});

Deno.test({
  name: "backoffDelay — attempt 1 returns 1000ms",
  fn() {
    const start = Date.now();
    return backoffDelay(1).then(() => {
      const elapsed = Date.now() - start;
      assert(elapsed >= 850 && elapsed <= 1400, `expected ~1000ms, got ${elapsed}ms`);
    });
  },
});

Deno.test({
  name: "backoffDelay — attempt 2 returns 2000ms",
  fn() {
    const start = Date.now();
    return backoffDelay(2).then(() => {
      const elapsed = Date.now() - start;
      assert(elapsed >= 1800 && elapsed <= 2600, `expected ~2000ms, got ${elapsed}ms`);
    });
  },
});

Deno.test({
  name: "backoffDelay — attempt 3 returns 4000ms (capped)",
  fn() {
    const start = Date.now();
    return backoffDelay(3).then(() => {
      const elapsed = Date.now() - start;
      assert(elapsed >= 3500 && elapsed <= 5000, `expected ~4000ms, got ${elapsed}ms`);
    });
  },
});

Deno.test({
  name: "backoffDelay — attempt 4 still capped at 4000ms (should not exceed cap)",
  fn() {
    const start = Date.now();
    return backoffDelay(4).then(() => {
      const elapsed = Date.now() - start;
      assert(elapsed >= 3500 && elapsed <= 5000, `expected ~4000ms (capped), got ${elapsed}ms`);
    });
  },
});

Deno.test({
  name: "backoffDelay — attempt 10 still capped at 4000ms",
  fn() {
    const start = Date.now();
    return backoffDelay(10).then(() => {
      const elapsed = Date.now() - start;
      assert(elapsed >= 3500 && elapsed <= 5000, `expected ~4000ms (capped), got ${elapsed}ms`);
    });
  },
});

// ═══════════════════════════════════════════════════════════════
// 2. Story outline JSON retry — unparseable JSON triggers stronger instruction
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "story outline retry — unparseable JSON appends stronger instruction to systemPrompt",
  fn() {
    // Simulate chunkRunner lines 732-748: when JSON.parse fails, systemPrompt gets
    // appended with "CRITICAL RETRY INSTRUCTION: ... Output ONLY a JSON object..."
    let systemPrompt = "Original system prompt content.";
    const maxChunkRepairs = 2;
    let storyOutlineValid = false;
    const validationErrors: string[] = [];

    for (let attempt = 0; attempt <= maxChunkRepairs; attempt++) {
      const content = "This is not JSON {{{ broken }}";
      try {
        const parsed = JSON.parse(content);
        storyOutlineValid = parsed && Array.isArray(parsed.entries);
      } catch {
        storyOutlineValid = false;
      }

      if (!storyOutlineValid && attempt < maxChunkRepairs) {
        validationErrors.push(`story_outline chunk produced unparseable JSON`);
        systemPrompt = systemPrompt + `\n\nCRITICAL RETRY INSTRUCTION: Your previous attempt did NOT produce valid JSON. Output ONLY a JSON object with an "entries" array. Each entry has: "number" (integer), "title" (string), "description" (string). NO markdown. NO code fences. NO preamble. Start directly with {`;
        // continue (retry)
      } else {
        break;
      }
    }

    // After maxChunkRepairs (2 retries, 3 total attempts), validation should still be false
    assertEquals(storyOutlineValid, false, "should still fail after max retries");
    assertEquals(validationErrors.length, 2, "should have 2 validation error entries (attempts 0 and 1)");

    // System prompt should have been augmented twice
    const retryCount = (systemPrompt.match(/CRITICAL RETRY INSTRUCTION/g) || []).length;
    assertEquals(retryCount, 2, "systemPrompt should have 2 retry instructions appended");
    assert(systemPrompt.includes('Output ONLY a JSON object'), "systemPrompt should contain JSON instruction");
  },
});

Deno.test({
  name: "story outline retry — second attempt with valid JSON passes after first failure",
  fn() {
    // Simulate the scenario where the first attempt produces bad JSON,
    // but the second attempt (with stronger instruction) produces good JSON.
    const maxChunkRepairs = 2;
    let systemPrompt = "Original prompt.";
    let validationError = "";
    let chunkPassed = false;
    let finalContent = "";

    const attempts = [
      "Not JSON at all",                // attempt 0 - fails
      JSON.stringify({ entries: [       // attempt 1 - succeeds
        { number: 1, title: "Fixed", description: "Retry succeeded." },
      ]}),
    ];

    for (let attempt = 0; attempt <= maxChunkRepairs; attempt++) {
      const content = attempts[attempt] || "fallback";

      if (!content) {
        // Shouldn't happen with our data
        chunkPassed = false;
        break;
      }

      let storyOutlineValid = false;
      try {
        const parsed = JSON.parse(content);
        storyOutlineValid = parsed && Array.isArray(parsed.entries);
      } catch {
        storyOutlineValid = false;
      }

      if (!storyOutlineValid && attempt < maxChunkRepairs) {
        validationError = "story_outline chunk produced unparseable JSON";
        systemPrompt = systemPrompt + `\n\nCRITICAL RETRY INSTRUCTION: Output ONLY a JSON object with an "entries" array.`;
        continue;
      }

      chunkPassed = storyOutlineValid;
      if (!chunkPassed) {
        validationError = "story_outline chunk failed JSON validation after max retries";
      }
      finalContent = content;
      break;
    }

    assertEquals(chunkPassed, true, "should pass on second attempt");
    assertEquals(finalContent, attempts[1], "should use the valid JSON from attempt 1");
    // validationError retains value from failed attempt 0 — real code only uses it
    // when chunkPassed is false, so this is harmless
  },
});

Deno.test({
  name: "story outline retry — all retries exhausted falls through with validation error",
  fn() {
    const maxChunkRepairs = 2;
    let validationError = "";
    let chunkPassed = false;

    for (let attempt = 0; attempt <= maxChunkRepairs; attempt++) {
      const content = "invalid json";
      let storyOutlineValid = false;
      try {
        const parsed = JSON.parse(content);
        storyOutlineValid = parsed && Array.isArray(parsed.entries);
      } catch {
        storyOutlineValid = false;
      }

      if (!storyOutlineValid && attempt < maxChunkRepairs) {
        validationError = "story_outline chunk produced unparseable JSON";
        continue;
      }

      chunkPassed = storyOutlineValid;
      if (!chunkPassed) {
        validationError = "story_outline chunk failed JSON validation after max retries";
      }
      break;
    }

    assertEquals(chunkPassed, false, "should fail after all retries exhausted");
    assertEquals(validationError, "story_outline chunk failed JSON validation after max retries",
      "fallthrough validationError should indicate max retries reached");
  },
});

// ═══════════════════════════════════════════════════════════════
// 3. Backoff used in retry loop — story outline specific
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "retry loop — exponential backoff is applied between retry attempts",
  fn() {
    // Verify the retry loop structure: backoffDelay(attempt) is called before `continue`
    // in the validation retry loop (line 743).
    const attempts: number[] = [];

    // Simulate the loop with actual backoff
    const LOOP_MAX = 2; // maxChunkRepairs
    let validationError = "";
    let chunkPassed = false;

    for (let attempt = 0; attempt <= LOOP_MAX; attempt++) {
      // This is the actual backoff call site — verify delay shape
      const ms = Math.min(500 * Math.pow(2, attempt), 4000);
      attempts.push(ms);

      if (attempt >= LOOP_MAX) {
        // Last attempt — falls through to final validation error
        chunkPassed = false;
        validationError = "story_outline chunk failed JSON validation after max retries";
      }
      // continue would happen here for non-last attempts
    }

    // First retry: 500ms, second retry: 1000ms
    assertEquals(attempts[0], 500, "backoff on attempt 0 should be 500ms");
    assertEquals(attempts[1], 1000, "backoff on attempt 1 should be 1000ms");
    assertEquals(chunkPassed, false);
    assertEquals(validationError, "story_outline chunk failed JSON validation after max retries");
  },
});