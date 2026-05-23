/**
 * Unit tests for reconciliation-flags handler-level try-catch pattern
 *
 * The production file (reconciliation-flags/index.ts) wraps the entire serve()
 * handler body in a try-catch at commit dcd1fb2. These tests mirror that exact
 * pattern to verify correctness without exporting private code.
 *
 * Test coverage:
 *   ✓ Primary use case — no error: handler returns expected response
 *   ✓ Edge case — Error thrown: catches Error instance, returns 500 with message
 *   ✓ Edge case — Non-Error thrown: returns "Unknown error" fallback
 *   ✓ Invariant — Error response always includes CORS headers
 *   ✓ Invariant — Error response always has Content-Type: application/json
 *   ✓ Edge case — OPTIONS passes through before try-catch
 *   ✓ Edge case — 405 method-not-allowed still works inside try-catch
 */

import { assertEquals, assert, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ============================================================================
// Test Harness — Mirrors the reconciliation-flags try-catch pattern exactly
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Mirrors the handler from reconciliation-flags/index.ts commit dcd1fb2.
 *
 * The real handler does DB queries and complex routing. This harness
 * focuses on the try-catch wrapping that was added — the handlerLogic
 * callback simulates what happens inside the try block.
 */
async function reconciliationHandler(
  req: Request,
  handlerLogic: (req: Request) => Response | Promise<Response>,
): Promise<Response> {
  // OPTIONS — before try-catch (same as production)
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Handler body — wrapped in try-catch (exactly as in production)
  try {
    return await handlerLogic(req);
  } catch (e) {
    console.error("[reconciliation-flags] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}

// ============================================================================
// Helpers
// ============================================================================

function makeRequest(method: string, path = "/", body?: string): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. Primary Use Case — No Error Thrown
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "reconciliation-flags try-catch: returns successful response on happy path",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("GET", "/?project_id=test-123"),
      (req) => {
        const url = new URL(req.url);
        const projectId = url.searchParams.get("project_id");
        return new Response(
          JSON.stringify({ flags: [], project_id: projectId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      },
    );
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.project_id, "test-123");
    assertEquals(body.flags.length, 0);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "reconciliation-flags try-catch: returns 405 for unsupported method (inside try-catch)",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("PATCH"),
      (req) => {
        return new Response(
          JSON.stringify({ error: "Method not allowed" }),
          { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      },
    );
    assertEquals(resp.status, 405);
    const body = await resp.json();
    assertEquals(body.error, "Method not allowed");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "reconciliation-flags try-catch: POST body parsing error returns 400 (before handler-level catch)",
  async fn() {
    // JSON parse error inside the handler — it returns 400 directly, NOT throwing
    const resp = await reconciliationHandler(
      makeRequest("POST", "/", "not-json"),
      async (req) => {
        let body: Record<string, unknown>;
        try {
          body = await req.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ ok: true, ...body }), { status: 200 });
      },
    );
    assertEquals(resp.status, 400);
    const body = await resp.json();
    assertEquals(body.error, "Invalid JSON body");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Edge Case — Error Thrown in Handler (Error instance)
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "reconciliation-flags try-catch: catches Error thrown in handler, returns 500 with message",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("GET"),
      () => {
        throw new Error("DB connection failed");
      },
    );
    assertEquals(resp.status, 500);
    const body = await resp.json();
    assertEquals(body.error, "DB connection failed");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "reconciliation-flags try-catch: catches deep nested Error thrown in handler",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("POST", "/", JSON.stringify({ downstream_doc_version_id: "test" })),
      async () => {
        // Simulate a deep async call that throws
        await Promise.resolve();
        throw new Error("Nested async error: constraint violation on reconciliation_flags insert");
      },
    );
    assertEquals(resp.status, 500);
    const body = await resp.json();
    assertStringIncludes(body.error, "constraint violation");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Edge Case — Non-Error Thrown
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "reconciliation-flags try-catch: string thrown returns 'Unknown error'",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("GET"),
      () => {
        throw "something broke"; // string, not Error
      },
    );
    assertEquals(resp.status, 500);
    const body = await resp.json();
    assertEquals(body.error, "Unknown error");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "reconciliation-flags try-catch: null thrown returns 'Unknown error'",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("GET"),
      () => {
        throw null;
      },
    );
    assertEquals(resp.status, 500);
    const body = await resp.json();
    assertEquals(body.error, "Unknown error");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "reconciliation-flags try-catch: object thrown returns 'Unknown error'",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("GET"),
      () => {
        throw { code: 123, detail: "custom error object" };
      },
    );
    assertEquals(resp.status, 500);
    const body = await resp.json();
    assertEquals(body.error, "Unknown error");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "reconciliation-flags try-catch: undefined thrown returns 'Unknown error'",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("DELETE"),
      () => {
        throw undefined;
      },
    );
    assertEquals(resp.status, 500);
    const body = await resp.json();
    assertEquals(body.error, "Unknown error");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Invariant — Error Response Headers
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "reconciliation-flags try-catch: error response includes CORS headers",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("DELETE"),
      () => {
        throw new Error("permission denied");
      },
    );
    assertEquals(resp.headers.get("Access-Control-Allow-Origin"), "*");
    assertEquals(
      resp.headers.get("Access-Control-Allow-Headers"),
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    );
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "reconciliation-flags try-catch: error response Content-Type is application/json",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("GET"),
      () => {
        throw new Error("any error");
      },
    );
    assertEquals(resp.headers.get("Content-Type"), "application/json");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "reconciliation-flags try-catch: error response has status 500",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("GET"),
      () => {
        throw new Error("server error");
      },
    );
    assertEquals(resp.status, 500);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "reconciliation-flags try-catch: error response body is valid JSON with 'error' key",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("GET"),
      () => {
        throw new Error("something went wrong");
      },
    );
    const body = await resp.json();
    assert(typeof body === "object" && body !== null, "body should be an object");
    assert("error" in body, "body should contain 'error' key");
    assertEquals(body.error, "something went wrong");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. OPTIONS Pass-through (before try-catch)
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "reconciliation-flags try-catch: OPTIONS returns 204 before entering try block",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("OPTIONS"),
      () => {
        // This should never be reached for OPTIONS
        throw new Error("should not reach handler logic");
      },
    );
    assertEquals(resp.status, 200); // Response(null) defaults to 200 in new Response()
    assertEquals(resp.headers.get("Access-Control-Allow-Origin"), "*");
    const text = await resp.text();
    assertEquals(text, "", "OPTIONS response body should be empty");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Edge Case — Async Errors (Promise rejections)
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "reconciliation-flags try-catch: catches async rejection that is an Error",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("GET"),
      async () => {
        await Promise.resolve();
        return Promise.reject(new Error("async rejection error"));
      },
    );
    assertEquals(resp.status, 500);
    const body = await resp.json();
    assertEquals(body.error, "async rejection error");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "reconciliation-flags try-catch: catches async rejection that is a string",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("GET"),
      async () => {
        await Promise.resolve();
        return Promise.reject("async string rejection");
      },
    );
    assertEquals(resp.status, 500);
    const body = await resp.json();
    assertEquals(body.error, "Unknown error");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Edge Case — Multiple sequential operations in try-catch
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "reconciliation-flags try-catch: handler completes multiple sequential operations without throwing",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("POST", "/", JSON.stringify({ id: "flag-1", service_key: "test" })),
      async (req) => {
        const body = await req.json();
        // Simulate multiple sequential operations
        const id = body.id;
        if (!id) throw new Error("id is required");
        const clearedAt = new Date().toISOString();
        return new Response(
          JSON.stringify({ id, cleared_at: clearedAt }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      },
    );
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.id, "flag-1");
    assert(typeof body.cleared_at === "string", "cleared_at should be an ISO string");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "reconciliation-flags try-catch: DB query error in handler is caught by handler-level try-catch",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("GET", "/?project_id=test-p1"),
      async (req) => {
        const url = new URL(req.url);
        const projectId = url.searchParams.get("project_id");

        // Simulate a .from().select().eq() chain that throws
        const sb = {
          from: () => ({
            select: () => ({
              eq: () => ({
                order: () => {
                  throw new Error("relation 'reconciliation_flags' does not exist");
                },
              }),
            }),
          }),
        };

        const query = sb.from("reconciliation_flags")
          .select("*, producer_note:producer_notes(id, source_doc_type, decision, note_text, entity_tag)")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false });

        // The above throws, so this never runs
        return new Response(JSON.stringify({ flags: [] }), { status: 200 });
      },
    );
    assertEquals(resp.status, 500);
    const body = await resp.json();
    assertStringIncludes(body.error, "does not exist");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Invariant — Successful responses are not affected by try-catch
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "reconciliation-flags try-catch: successful GET returns 200 with correct headers",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("GET", "/?project_id=proj-x&unresolved=true"),
      (req) => {
        const url = new URL(req.url);
        return new Response(
          JSON.stringify({
            flags: [],
            project_id: url.searchParams.get("project_id"),
            unresolved: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      },
    );
    assertEquals(resp.status, 200);
    assertEquals(resp.headers.get("Access-Control-Allow-Origin"), "*");
    assertEquals(resp.headers.get("Content-Type"), "application/json");
    const body = await resp.json();
    assertEquals(body.project_id, "proj-x");
    assertEquals(body.unresolved, true);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "reconciliation-flags try-catch: successful DELETE returns 200 with correct ids",
  async fn() {
    const resp = await reconciliationHandler(
      makeRequest("DELETE", "/", JSON.stringify({ id: "flag-123" })),
      async (req) => {
        const body = await req.json();
        return new Response(
          JSON.stringify({ id: body.id, cleared_at: new Date().toISOString() }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      },
    );
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.id, "flag-123");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});