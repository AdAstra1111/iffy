/**
 * Unit tests for callAI retry/timeout pattern in dev-engine-v2/index.ts
 *
 * callAI is a private (non-exported) function at line 1031 of dev-engine-v2/index.ts.
 * These tests verify the retry/timeout algorithm by implementing the same pattern,
 * focusing on what's UNIQUE to callAI vs the shared callLLM:
 *
 * Key differences from callLLM:
 *   1. 120s timeout (vs 45s in callLLM) — AI gen can be slower
 *   2. Separate try/catch for body read with independent retry
 *   3. clearTimeout on BOTH fetch error AND body read error paths
 *   4. Same exponential backoff (3s/6s/12s) and HTTP error handling
 *
 * The shared callLLM (in _shared/llm.ts) is tested exhaustively in llm.test.ts.
 * This file supplements with callAI-specific scenarios.
 */

import { assertEquals, assert, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ─── callAI Pattern Test Harness ───
// Mirrors the exact retry/timeout logic from dev-engine-v2/index.ts lines 1031-1127
// so we can test it without exporting the private function.

interface CallAIOpts {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  seed?: number;
}

async function callAIPattern(opts: CallAIOpts, fetchMock: (url: string, init: any) => Promise<Response>): Promise<string> {
  const { apiKey, model, system, user, temperature = 0.3, maxTokens = 32000, seed } = opts;
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    let response: Response;
    try {
      response = await fetchMock("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          temperature,
          max_tokens: maxTokens,
          ...(seed !== undefined ? { seed } : {}),
        }),
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      const isTimeout = fetchErr?.name === "AbortError";
      console.error(`AI fetch error (attempt ${attempt + 1}/${MAX_RETRIES}):`, isTimeout ? "TIMEOUT after 120s" : (fetchErr?.message || fetchErr));
      if (attempt < MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * 3000;
        console.log(`Retrying after ${isTimeout ? "timeout" : "connection error"} in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new Error(`${isTimeout ? "FETCH_TIMEOUT" : `AI connection failed after ${MAX_RETRIES} attempts`}: ${fetchErr?.message || "unknown"}`);
    }
    clearTimeout(timeoutId);

    // Read body safely — connection can drop during body read
    let text: string;
    try {
      text = await response.text();
    } catch (bodyErr: any) {
      console.error(`AI body read error (attempt ${attempt + 1}/${MAX_RETRIES}):`, bodyErr?.message || bodyErr);
      if (attempt < MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * 3000;
        console.log(`Retrying after body read error in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new Error(`AI body read failed after ${MAX_RETRIES} attempts: ${bodyErr?.message || "unknown"}`);
    }

    if (response.ok) {
      if (!text || text.trim().length === 0) {
        console.error(`Empty response body from AI (attempt ${attempt + 1}/${MAX_RETRIES})`);
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 2000));
          continue;
        }
        throw new Error("AI returned empty response after retries");
      }
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        const lastBrace = text.lastIndexOf("}");
        if (lastBrace > 0) {
          try {
            data = JSON.parse(text.substring(0, lastBrace + 1));
            console.warn("Recovered truncated JSON from AI response");
          } catch {
            throw new Error("AI returned unparseable response");
          }
        } else {
          throw new Error("AI returned unparseable response");
        }
      }
      return data.choices?.[0]?.message?.content || "";
    }

    console.error(`AI error (attempt ${attempt + 1}/${MAX_RETRIES}):`, response.status, text);
    if (response.status === 429) throw new Error("RATE_LIMIT");
    if (response.status === 402) throw new Error("PAYMENT_REQUIRED");
    if (response.status === 401) {
      console.error("AI gateway 401: API key rejected");
      throw new Error("AI_AUTH_FAILED");
    }
    if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
      const delay = Math.pow(2, attempt) * 2000;
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    throw new Error(`AI call failed: ${response.status}`);
  }
  throw new Error("AI call failed after retries");
}

// ─── Helpers ───

function makeOkResponse(content: string): Response {
  const body = JSON.stringify({
    choices: [{ message: { content, role: "assistant" } }],
  });
  return new Response(body, { status: 200 });
}

function makeErrorResponse(status: number): Response {
  return new Response(JSON.stringify({ error: "test" }), { status });
}

// Speed up timers so tests don't wait 3s+
function fastTimers(): void {
  const orig = globalThis.setTimeout.bind(globalThis);
  globalThis.setTimeout = ((fn: (...args: unknown[]) => void, _ms: number, ...args: unknown[]) => {
    return orig(fn, 1, ...args);
  }) as typeof globalThis.setTimeout;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. Primary Use Case — Happy Path
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "callAI pattern: returns content on successful response",
  async fn() {
    fastTimers();
    const result = await callAIPattern(
      { apiKey: "sk-test", model: "test", system: "s", user: "u" },
      async () => makeOkResponse("hello from AI"),
    );
    assertEquals(result, "hello from AI");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callAI pattern: returns empty string for empty message content",
  async fn() {
    fastTimers();
    const result = await callAIPattern(
      { apiKey: "sk-test", model: "test", system: "s", user: "u" },
      async () => {
        const body = JSON.stringify({ choices: [{ message: { content: "", role: "assistant" } }] });
        return new Response(body, { status: 200 });
      },
    );
    assertEquals(result, "");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Timeout — Abort + Retry
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "callAI pattern: throws FETCH_TIMEOUT after all retries on abort",
  async fn() {
    fastTimers();
    let callCount = 0;
    try {
      await callAIPattern(
        { apiKey: "sk-test", model: "test", system: "s", user: "u" },
        async () => {
          callCount++;
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          throw err;
        },
      );
      assert(false, "Should have thrown");
    } catch (e: any) {
      assertStringIncludes(e.message, "FETCH_TIMEOUT");
      assertEquals(callCount, 3, "should have exhausted all 3 retries");
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callAI pattern: retries after timeout then succeeds",
  async fn() {
    fastTimers();
    let callCount = 0;
    const result = await callAIPattern(
      { apiKey: "sk-test", model: "test", system: "s", user: "u" },
      async () => {
        callCount++;
        if (callCount < 2) {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          throw err;
        }
        return makeOkResponse("recovered after timeout");
      },
    );
    assertEquals(result, "recovered after timeout");
    assertEquals(callCount, 2, "should have retried once after timeout");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callAI pattern: clearTimeout called on timeout path (fetch throws)",
  async fn() {
    fastTimers();
    let clearCalled = false;
    const origClear = globalThis.clearTimeout.bind(globalThis);
    globalThis.clearTimeout = ((id: number | undefined) => {
      if (id !== undefined) clearCalled = true;
      return origClear(id);
    }) as typeof globalThis.clearTimeout;

    try {
      await callAIPattern(
        { apiKey: "sk-test", model: "test", system: "s", user: "u" },
        async () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          throw err;
        },
      );
    } catch {
      // Expected
    }
    assert(clearCalled, "clearTimeout should be called on fetch error path");
    globalThis.clearTimeout = origClear;
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callAI pattern: clearTimeout called on success path",
  async fn() {
    fastTimers();
    let clearCalled = false;
    const origClear = globalThis.clearTimeout.bind(globalThis);
    globalThis.clearTimeout = ((id: number | undefined) => {
      if (id !== undefined) clearCalled = true;
      return origClear(id);
    }) as typeof globalThis.clearTimeout;

    await callAIPattern(
      { apiKey: "sk-test", model: "test", system: "s", user: "u" },
      async () => makeOkResponse("ok"),
    );
    assert(clearCalled, "clearTimeout should be called on success path");
    globalThis.clearTimeout = origClear;
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Body Read Error Handling — UNIQUE TO callAI
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "callAI pattern: retries when body read fails then succeeds",
  async fn() {
    fastTimers();
    let callCount = 0;
    const result = await callAIPattern(
      { apiKey: "sk-test", model: "test", system: "s", user: "u" },
      async () => {
        callCount++;
        if (callCount < 2) {
          // Return a response whose .text() throws (simulating connection drop during body read)
          return {
            ok: true,
            status: 200,
            text: () => Promise.reject(new Error("connection lost during body read")),
            json: () => Promise.reject(new Error("connection lost")),
          } as unknown as Response;
        }
        return makeOkResponse("recovered after body read error");
      },
    );
    assertEquals(result, "recovered after body read error");
    assertEquals(callCount, 2, "should have retried after body read error");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callAI pattern: throws body read error after all retries",
  async fn() {
    fastTimers();
    try {
      await callAIPattern(
        { apiKey: "sk-test", model: "test", system: "s", user: "u" },
        async () => ({
          ok: true,
          status: 200,
          text: () => Promise.reject(new Error("connection lost during body read")),
          json: () => Promise.reject(new Error("connection lost")),
        }) as unknown as Response,
      );
      assert(false, "Should have thrown");
    } catch (e: any) {
      assertStringIncludes(e.message, "AI body read failed after 3 attempts");
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callAI pattern: clearTimeout called on body read error path",
  async fn() {
    fastTimers();
    let clearCalled = false;
    const origClear = globalThis.clearTimeout.bind(globalThis);
    globalThis.clearTimeout = ((id: number | undefined) => {
      if (id !== undefined) clearCalled = true;
      return origClear(id);
    }) as typeof globalThis.clearTimeout;

    try {
      await callAIPattern(
        { apiKey: "sk-test", model: "test", system: "s", user: "u" },
        async () => ({
          ok: true,
          status: 200,
          text: () => Promise.reject(new Error("connection lost")),
          json: () => Promise.reject(new Error("connection lost")),
        }) as unknown as Response,
      );
    } catch {
      // Expected
    }
    assert(clearCalled, "clearTimeout should be called on body read error path");
    globalThis.clearTimeout = origClear;
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. HTTP Error Codes
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "callAI pattern: throws RATE_LIMIT on 429 (no retry)",
  async fn() {
    fastTimers();
    try {
      await callAIPattern(
        { apiKey: "sk-test", model: "test", system: "s", user: "u" },
        async () => makeErrorResponse(429),
      );
      assert(false, "Should have thrown");
    } catch (e: any) {
      assertEquals(e.message, "RATE_LIMIT");
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callAI pattern: throws PAYMENT_REQUIRED on 402 (no retry)",
  async fn() {
    fastTimers();
    try {
      await callAIPattern(
        { apiKey: "sk-test", model: "test", system: "s", user: "u" },
        async () => makeErrorResponse(402),
      );
      assert(false, "Should have thrown");
    } catch (e: any) {
      assertEquals(e.message, "PAYMENT_REQUIRED");
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callAI pattern: throws AI_AUTH_FAILED on 401 (no retry)",
  async fn() {
    fastTimers();
    try {
      await callAIPattern(
        { apiKey: "sk-test", model: "test", system: "s", user: "u" },
        async () => makeErrorResponse(401),
      );
      assert(false, "Should have thrown");
    } catch (e: any) {
      assertEquals(e.message, "AI_AUTH_FAILED");
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Retry on 5xx
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "callAI pattern: retries on 500 then succeeds",
  async fn() {
    fastTimers();
    let callCount = 0;
    const result = await callAIPattern(
      { apiKey: "sk-test", model: "test", system: "s", user: "u" },
      async () => {
        callCount++;
        if (callCount < 2) return makeErrorResponse(500);
        return makeOkResponse("recovered after 500");
      },
    );
    assertEquals(result, "recovered after 500");
    assertEquals(callCount, 2, "should have retried once after 500");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Empty Body Retry
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "callAI pattern: retries on empty body then succeeds",
  async fn() {
    fastTimers();
    let callCount = 0;
    const result = await callAIPattern(
      { apiKey: "sk-test", model: "test", system: "s", user: "u" },
      async () => {
        callCount++;
        if (callCount < 2) {
          return new Response("", { status: 200 });
        }
        return makeOkResponse("recovered after empty body");
      },
    );
    assertEquals(result, "recovered after empty body");
    assertEquals(callCount, 2, "should have retried once after empty body");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Truncated JSON Recovery
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "callAI pattern: recovers truncated JSON by slicing to last brace",
  async fn() {
    fastTimers();
    // Pattern: valid JSON followed by trailing garbage (sliced at outermost } boundary)
    const truncated = '{"id":"test","choices":[{"index":0,"message":{"content":"truncated recovery","role":"assistant"},"finish_reason":"stop"}],"usage":{"total_tokens":10}} extra junk';
    const result = await callAIPattern(
      { apiKey: "sk-test", model: "test", system: "s", user: "u" },
      async () => new Response(truncated, { status: 200 }),
    );
    assertEquals(result, "truncated recovery");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callAI pattern: throws on completely unparseable response",
  async fn() {
    fastTimers();
    try {
      await callAIPattern(
        { apiKey: "sk-test", model: "test", system: "s", user: "u" },
        async () => new Response("not json at all", { status: 200 }),
      );
      assert(false, "Should have thrown");
    } catch (e: any) {
      assertStringIncludes(e.message, "unparseable");
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Connection Error (non-timeout) — Exhaust all retries
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "callAI pattern: throws connection error after all retries",
  async fn() {
    fastTimers();
    let callCount = 0;
    try {
      await callAIPattern(
        { apiKey: "sk-test", model: "test", system: "s", user: "u" },
        async () => {
          callCount++;
          throw new Error("DNS resolution failed");
        },
      );
      assert(false, "Should have thrown");
    } catch (e: any) {
      assertStringIncludes(e.message, "AI connection failed after 3 attempts");
      assertEquals(callCount, 3, "should have exhausted all 3 retries");
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callAI pattern: connection error then recover",
  async fn() {
    fastTimers();
    let callCount = 0;
    const result = await callAIPattern(
      { apiKey: "sk-test", model: "test", system: "s", user: "u" },
      async () => {
        callCount++;
        if (callCount < 2) throw new Error("connection timeout");
        return makeOkResponse("recovered after connection error");
      },
    );
    assertEquals(result, "recovered after connection error");
    assertEquals(callCount, 2, "should have recovered after one retry");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});