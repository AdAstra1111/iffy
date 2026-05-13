/**
 * Unit tests for callLLM — timeout, retry, error handling, clearTimeout coverage.
 *
 * This suite verifies the stall-root-cause fix for Treatment generation + Apply Notes:
 *   - AbortController with 45s timeout
 *   - clearTimeout on BOTH success and error paths (critical — missing a clearTimeout
 *     causes Deno hang on Supabase edge function shutdown)
 *   - Exponential backoff retry (3s/6s/12s)
 *   - Typed errors: FETCH_TIMEOUT, RATE_LIMIT, PAYMENT_REQUIRED, AI_AUTH_FAILED
 *   - 500+ retry, empty body retry, truncated JSON recovery
 */

import { assertEquals, assert, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { callLLM } from "./llm.ts";

// ─── Global State Management ───
// Each test must fully restore all globals it modifies.

let _origFetch: typeof globalThis.fetch;
let _origClearTimeout: typeof globalThis.clearTimeout;
let _origSetTimeout: typeof globalThis.setTimeout;

function saveGlobals(): void {
  _origFetch = globalThis.fetch;
  _origClearTimeout = globalThis.clearTimeout;
  _origSetTimeout = globalThis.setTimeout;
}

function restoreGlobals(): void {
  globalThis.fetch = _origFetch;
  globalThis.clearTimeout = _origClearTimeout;
  globalThis.setTimeout = _origSetTimeout;
}

/** Ensure env is set so resolveGateway() works. */
function ensureEnv(): void {
  Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key-for-testing");
}

/** Speed up setTimeout so retry delays don't block tests. Replaces global setTimeout. */
function useFastTimers(): void {
  globalThis.setTimeout = ((fn: (...args: unknown[]) => void, _ms: number, ...args: unknown[]) => {
    return _origSetTimeout(fn, 1, ...args);
  }) as typeof globalThis.setTimeout;
}

// ─── Test Fixture Helpers ───

function makeOkResponse(content: string): Response {
  const body = JSON.stringify({
    choices: [{ message: { content, role: "assistant" } }],
    usage: { total_tokens: 10 },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
}

function makeErrorResponse(status: number): Response {
  return new Response(JSON.stringify({ error: "test error" }), { status });
}

/** Make fetch throw an AbortError (simulates AbortController abort). */
function makeFetchThrowAbort(): void {
  globalThis.fetch = () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    throw err;
  };
}

const BASE_OPTS = {
  apiKey: "sk-test",
  model: "google/gemini-2.5-flash",
  system: "You are a test.",
  user: "Test input.",
};

// ══════════════════════════════════════════════════════════════════════════════
// 1. Primary Use Case — Happy Path
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "callLLM: returns content on successful response",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    globalThis.fetch = () => Promise.resolve(makeOkResponse('{"result": "hello world"}'));
    try {
      const result = await callLLM({ ...BASE_OPTS, retries: 1 });
      assertEquals(result.content, '{"result": "hello world"}');
      assert(result.raw !== undefined, "raw response should be present");
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callLLM: returns empty content when message content is empty",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    globalThis.fetch = () => {
      const body = JSON.stringify({ choices: [{ message: { content: "", role: "assistant" } }] });
      return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "application/json" } }));
    };
    try {
      const result = await callLLM({ ...BASE_OPTS, retries: 1, temperature: 0 });
      assertEquals(result.content, "");
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callLLM: preserves tool_calls in response",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    const toolCalls = [{ id: "call_1", type: "function" as const, function: { name: "test", arguments: "{}" } }];
    globalThis.fetch = () => {
      const body = JSON.stringify({
        choices: [{ message: { content: "result", tool_calls: toolCalls, role: "assistant" } }],
      });
      return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "application/json" } }));
    };
    try {
      const result = await callLLM({
        ...BASE_OPTS,
        retries: 1,
        tools: [{ type: "function" as const, function: { name: "test", description: "test", parameters: {} } }],
      });
      assertEquals(result.toolCalls?.length, 1);
      assertEquals(result.toolCalls?.[0]?.id, "call_1");
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Timeout — AbortController Behavior
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "callLLM: throws FETCH_TIMEOUT when all retries exhausted on abort",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    makeFetchThrowAbort();
    try {
      await callLLM({ ...BASE_OPTS, retries: 1 });
      assert(false, "Should have thrown");
    } catch (e: any) {
      assertStringIncludes(e.message, "FETCH_TIMEOUT");
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callLLM: retries after timeout then succeeds",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    let callCount = 0;
    globalThis.fetch = () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        throw err;
      }
      return Promise.resolve(makeOkResponse('{"success": true}'));
    };
    try {
      const result = await callLLM({ ...BASE_OPTS, retries: 2 });
      assertEquals(result.content, '{"success": true}');
      assertEquals(callCount, 2, "should have retried once after timeout");
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callLLM: clearTimeout called on success path",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    let clearTimeoutCalled = false;
    globalThis.clearTimeout = ((id: number | undefined) => {
      if (id !== undefined) clearTimeoutCalled = true;
      return _origClearTimeout(id);
    }) as typeof globalThis.clearTimeout;
    globalThis.fetch = () => Promise.resolve(makeOkResponse('{"ok": true}'));
    try {
      await callLLM({ ...BASE_OPTS, retries: 1 });
      assert(clearTimeoutCalled, "clearTimeout should be called after successful fetch");
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callLLM: clearTimeout called on timeout path (fetch throws abort)",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    let clearTimeoutCalled = false;
    globalThis.clearTimeout = ((id: number | undefined) => {
      if (id !== undefined) clearTimeoutCalled = true;
      return _origClearTimeout(id);
    }) as typeof globalThis.clearTimeout;
    makeFetchThrowAbort();
    try {
      await callLLM({ ...BASE_OPTS, retries: 1 });
    } catch {
      // Expected
    }
    assert(clearTimeoutCalled, "clearTimeout should be called when fetch throws abort error");
    restoreGlobals();
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. HTTP Error Codes — Typed Errors
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "callLLM: throws RATE_LIMIT on 429 (no retry)",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    globalThis.fetch = () => Promise.resolve(makeErrorResponse(429));
    try {
      await callLLM({ ...BASE_OPTS, retries: 3 });
      assert(false, "Should have thrown");
    } catch (e: any) {
      assertEquals(e.message, "RATE_LIMIT");
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callLLM: throws PAYMENT_REQUIRED on 402 (no retry)",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    globalThis.fetch = () => Promise.resolve(makeErrorResponse(402));
    try {
      await callLLM({ ...BASE_OPTS, retries: 3 });
      assert(false, "Should have thrown");
    } catch (e: any) {
      assertEquals(e.message, "PAYMENT_REQUIRED");
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callLLM: throws AI_AUTH_FAILED on 401 (no retry)",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    globalThis.fetch = () => Promise.resolve(makeErrorResponse(401));
    try {
      await callLLM({ ...BASE_OPTS, retries: 3 });
      assert(false, "Should have thrown");
    } catch (e: any) {
      assertEquals(e.message, "AI_AUTH_FAILED");
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Retry on 5xx
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "callLLM: retries on 500 then succeeds",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    let callCount = 0;
    globalThis.fetch = () => {
      callCount++;
      if (callCount < 3) return Promise.resolve(makeErrorResponse(500));
      return Promise.resolve(makeOkResponse('{"recovered": true}'));
    };
    try {
      const result = await callLLM({ ...BASE_OPTS, retries: 3 });
      assertEquals(result.content, '{"recovered": true}');
      assertEquals(callCount, 3, "should have retried twice after 500");
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callLLM: throws status error when all retries exhausted on 5xx",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    globalThis.fetch = () => Promise.resolve(makeErrorResponse(500));
    try {
      await callLLM({ ...BASE_OPTS, retries: 1 });
      assert(false, "Should have thrown");
    } catch (e: any) {
      assertStringIncludes(e.message, "AI call failed: 500");
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Empty Body Retry
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "callLLM: retries on empty response body then succeeds",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    let callCount = 0;
    globalThis.fetch = () => {
      callCount++;
      if (callCount < 2) {
        return Promise.resolve(new Response("", { status: 200, headers: { "Content-Type": "application/json" } }));
      }
      return Promise.resolve(makeOkResponse('{"recovered": true}'));
    };
    try {
      const result = await callLLM({ ...BASE_OPTS, retries: 2 });
      assertEquals(result.content, '{"recovered": true}');
      assertEquals(callCount, 2, "should have retried once after empty body");
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callLLM: throws on all retries exhausted with empty body",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    globalThis.fetch = () => Promise.resolve(new Response("", { status: 200, headers: { "Content-Type": "application/json" } }));
    try {
      await callLLM({ ...BASE_OPTS, retries: 1 });
      assert(false, "Should have thrown");
    } catch (e: any) {
      assertStringIncludes(e.message, "empty response");
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Truncated JSON Recovery
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "callLLM: recovers truncated JSON by slicing to last brace",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    // Pattern: AI response contains valid JSON followed by trailing garbage
    // {"choices":[{"message":{"content":"hello"}}]}extra garbage
    // JSON.parse fails on whole string, but truncation to last } recovers valid JSON
    const withGarbage = '{"choices":[{"index":0,"message":{"content":"hello","role":"assistant"},"finish_reason":"stop"}]}```markdown\nsome trailing commentary';
    globalThis.fetch = () => Promise.resolve(new Response(withGarbage, { status: 200, headers: { "Content-Type": "application/json" } }));
    try {
      const result = await callLLM({ ...BASE_OPTS, retries: 1 });
      assertEquals(result.content, "hello");
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callLLM: throws on completely unparseable response",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    globalThis.fetch = () => Promise.resolve(new Response("not json at all", { status: 200, headers: { "Content-Type": "application/json" } }));
    try {
      await callLLM({ ...BASE_OPTS, retries: 1 });
      assert(false, "Should have thrown");
    } catch (e: any) {
      assertStringIncludes(e.message, "unparseable");
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Edge Cases — Missing env / defaults
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "callLLM: throws when no apiKey and no env var set",
  async fn() {
    saveGlobals();
    Deno.env.delete("OPENROUTER_API_KEY");
    Deno.env.delete("OPENAI_API_KEY");
    useFastTimers();
    try {
      await callLLM({ ...BASE_OPTS, apiKey: "" } as any);
      assert(false, "Should have thrown");
    } catch (e: any) {
      assertStringIncludes(e.message, "No AI gateway key configured");
    } finally {
      Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key-for-testing");
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callLLM: uses defaults for optional params",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    globalThis.fetch = () => Promise.resolve(makeOkResponse('{"ok": true}'));
    try {
      const result = await callLLM({
        apiKey: "sk-test",
        model: "test-model",
        system: "test",
        user: "test",
        retries: 1,
      });
      assertEquals(result.content, '{"ok": true}');
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Connection Error Handling (non-timeout fetch error)
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "callLLM: retries on connection error then succeeds",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    let callCount = 0;
    globalThis.fetch = () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("fetch failed: connection refused");
      }
      return Promise.resolve(makeOkResponse('{"connected": true}'));
    };
    try {
      const result = await callLLM({ ...BASE_OPTS, retries: 2 });
      assertEquals(result.content, '{"connected": true}');
      assertEquals(callCount, 2, "should have retried after connection error");
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "callLLM: throws connection failed error after all retries exhausted",
  async fn() {
    saveGlobals();
    ensureEnv();
    useFastTimers();
    globalThis.fetch = () => { throw new Error("fetch failed: DNS lookup failed"); };
    try {
      await callLLM({ ...BASE_OPTS, retries: 1 });
      assert(false, "Should have thrown");
    } catch (e: any) {
      assertStringIncludes(e.message, "AI connection failed after 1 attempts");
      assertStringIncludes(e.message, "DNS lookup failed");
    } finally {
      restoreGlobals();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});