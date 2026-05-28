/**
 * Test: tmdb-lookup — TMDB API error detection
 *
 * Tests the three error detection paths in the tmdb-lookup Supabase Edge Function:
 * 1. Non-ok HTTP response structured JSON error parsing (lines 48-61)
 * 2. HTTP 200 error payload detection after search parse (lines 63-70)
 * 3. Defense-in-depth on detail response after Promise.all (lines 123-129)
 *
 * The function uses Deno.serve() at the top level, so we mock Deno.serve
 * to capture the handler, then invoke it with mocked fetch responses.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

// ── Types ──

type TMDbHandler = (req: Request) => Promise<Response>;

// ── Mocks ──

const mockEnv: Record<string, string> = {};
const captured: { handler?: TMDbHandler } = {};

/**
 * Mock Deno.serve to capture the handler function instead of starting a server.
 * Mock Deno.env.get to return controllable values.
 */
function setupDenoMock() {
  // Reset
  captured.handler = undefined;
  delete captured.handler;
  mockEnv.TMDB_API_KEY = "test-v3-api-key-12345";

  (globalThis as any).Deno = {
    env: {
      get: vi.fn((key: string) => mockEnv[key] ?? undefined),
    },
    serve: vi.fn((handler: TMDbHandler) => {
      captured.handler = handler;
    }),
  };
}

/**
 * Create a mock Request object for testing.
 */
function mockRequest(
  body: Record<string, unknown>,
  method = "POST"
): Request {
  return new Request("http://localhost/tmdb-lookup", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Mock fetch with controllable responses.
 * Each call returns the next response from the queue.
 */
function mockFetch(responses: Response[]) {
  const responseQueue = [...responses];
  (globalThis as any).fetch = vi.fn(() => {
    if (responseQueue.length === 0) {
      return Promise.reject(new Error("Unexpected fetch call — no more mocked responses"));
    }
    return Promise.resolve(responseQueue.shift()!);
  });
}

/**
 * Helper to create a TMDB success search response.
 */
function tmdbSearchResponse(results: any[]): Response {
  return new Response(
    JSON.stringify({ results }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * Helper to create a TMDB detail response.
 */
function tmdbDetailResponse(overrides: Record<string, any> = {}): Response {
  return new Response(
    JSON.stringify({
      success: true,
      id: 12345,
      name: "Test Person",
      biography: "A test biography",
      birthday: "1990-01-01",
      place_of_birth: "Test City",
      profile_path: "/test.jpg",
      known_for_department: "Acting",
      popularity: 42.5,
      ...overrides,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * Helper to create a TMDB credits response.
 */
function tmdbCreditsResponse(overrides: Record<string, any> = {}): Response {
  return new Response(
    JSON.stringify({
      cast: [
        {
          title: "Test Movie",
          release_date: "2020-01-01",
          character: "Lead Role",
          media_type: "movie",
          popularity: 50,
        },
      ],
      crew: [],
      ...overrides,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * Helper to create a TMDB external IDs response.
 */
function tmdbExternalIdsResponse(overrides: Record<string, any> = {}): Response {
  return new Response(
    JSON.stringify({
      imdb_id: "tt1234567",
      ...overrides,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

// ── Import the module (triggers Deno.serve) ──

beforeAll(async () => {
  setupDenoMock();
  // Dynamic import to trigger Deno.serve on module load
  await import("/Users/laralane/code/iffy/supabase/functions/tmdb-lookup/index.ts");
});

// ── Tests ──

describe("tmdb-lookup — error detection", () => {
  // ──────────────────────────────────────────────
  // PATH 1: Non-ok HTTP response error parsing
  // ──────────────────────────────────────────────

  describe("Path 1: Non-ok HTTP response → structured JSON error extraction", () => {
    it("extracts status_message from TMDB JSON error body on non-ok response", async () => {
      mockFetch([
        new Response(
          JSON.stringify({
            status_message: "Invalid API key: You must be granted a valid key.",
            status_code: 7,
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        ),
      ]);

      const res = await captured.handler!(mockRequest({ name: "Tom Hanks", mode: "lookup" }));
      const data = await res.json();

      expect(res.status).toBe(502);
      expect(data.tmdb_error).toBe(true);
      expect(data.tmdb_message).toBe(
        "Invalid API key: You must be granted a valid key."
      );
      expect(data.tmdb_status_code).toBe(401);
    });

    it("falls back to HTTP status when error body is not valid JSON", async () => {
      mockFetch([
        new Response("Gateway Timeout", {
          status: 504,
          headers: { "Content-Type": "text/plain" },
        }),
      ]);

      const res = await captured.handler!(mockRequest({ name: "Tom Hanks", mode: "lookup" }));
      const data = await res.json();

      expect(res.status).toBe(502);
      expect(data.tmdb_error).toBe(true);
      expect(data.tmdb_message).toBe("HTTP 504");
      expect(data.tmdb_status_code).toBe(504);
    });

    it("falls back to HTTP status when error body JSON has no status_message", async () => {
      mockFetch([
        new Response(
          JSON.stringify({ error: "unknown" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        ),
      ]);

      const res = await captured.handler!(mockRequest({ name: "Tom Hanks", mode: "lookup" }));
      const data = await res.json();

      expect(res.status).toBe(502);
      expect(data.tmdb_error).toBe(true);
      expect(data.tmdb_message).toBe("HTTP 403");
      expect(data.tmdb_status_code).toBe(403);
    });

    it("handles 429 rate limit response", async () => {
      mockFetch([
        new Response(
          JSON.stringify({
            status_message: "Too many requests. Rate limit exceeded.",
            status_code: 25,
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        ),
      ]);

      const res = await captured.handler!(mockRequest({ name: "Tom Hanks", mode: "lookup" }));
      const data = await res.json();

      expect(res.status).toBe(502);
      expect(data.tmdb_error).toBe(true);
      expect(data.tmdb_message).toBe("Too many requests. Rate limit exceeded.");
      expect(data.tmdb_status_code).toBe(429);
    });
  });

  // ──────────────────────────────────────────────
  // PATH 2: HTTP 200 error payload detection
  // ──────────────────────────────────────────────

  describe("Path 2: HTTP 200 response with error payload (invalid v3 key)", () => {
    it("detects { success: false } payload on HTTP 200", async () => {
      mockFetch([
        new Response(
          JSON.stringify({
            success: false,
            status_code: 7,
            status_message: "Invalid API key: You must be granted a valid key.",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        ),
      ]);

      const res = await captured.handler!(mockRequest({ name: "Tom Hanks", mode: "lookup" }));
      const data = await res.json();

      expect(res.status).toBe(502);
      expect(data.tmdb_error).toBe(true);
      expect(data.tmdb_status_code).toBe(7);
      expect(data.tmdb_message).toBe(
        "Invalid API key: You must be granted a valid key."
      );
    });

    it("detects error payload with status_message but no success field", async () => {
      mockFetch([
        new Response(
          JSON.stringify({
            status_code: 6,
            status_message: "Invalid id: The pre-requisite id is invalid or not found.",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        ),
      ]);

      const res = await captured.handler!(mockRequest({ name: "Tom Hanks", mode: "lookup" }));
      const data = await res.json();

      expect(res.status).toBe(502);
      expect(data.tmdb_error).toBe(true);
      expect(data.tmdb_status_code).toBe(6);
    });
  });

  // ──────────────────────────────────────────────
  // PATH 3: Detail response error detection
  // ──────────────────────────────────────────────

  describe("Path 3: Defense-in-depth on detail response error detection", () => {
    it("catches detail.success === false in detail response", async () => {
      mockFetch([
        tmdbSearchResponse([
          { id: 12345, name: "Test Person", known_for_department: "Acting", popularity: 10, profile_path: null, known_for: [] },
        ]),
        // detail response with error
        new Response(
          JSON.stringify({
            success: false,
            status_code: 34,
            status_message: "The resource you requested could not be found.",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        ),
        tmdbCreditsResponse(),
        tmdbExternalIdsResponse(),
      ]);

      const res = await captured.handler!(mockRequest({ name: "Test Person", mode: "lookup" }));
      const data = await res.json();

      expect(res.status).toBe(502);
      expect(data.tmdb_error).toBe(true);
      expect(data.tmdb_message).toBe(
        "The resource you requested could not be found."
      );
    });

    it("catches detail with status_message but no success field", async () => {
      mockFetch([
        tmdbSearchResponse([
          { id: 12345, name: "Test Person", known_for_department: "Acting", popularity: 10, profile_path: null, known_for: [] },
        ]),
        tmdbDetailResponse({ success: undefined, status_message: "Something went wrong" }),
        tmdbCreditsResponse(),
        tmdbExternalIdsResponse(),
      ]);

      const res = await captured.handler!(mockRequest({ name: "Test Person", mode: "lookup" }));
      const data = await res.json();

      expect(res.status).toBe(502);
      expect(data.tmdb_error).toBe(true);
      expect(data.tmdb_message).toBe("Something went wrong");
    });
  });

  // ──────────────────────────────────────────────
  // Happy path — full successful lookup
  // ──────────────────────────────────────────────

  describe("Happy path", () => {
    it("returns full person details on successful lookup", async () => {
      mockFetch([
        tmdbSearchResponse([
          { id: 12345, name: "Tom Hanks", known_for_department: "Acting", popularity: 50, profile_path: "/abc.jpg", known_for: [
            { title: "Forrest Gump", release_date: "1994-07-06", media_type: "movie" },
          ]},
        ]),
        tmdbDetailResponse({
          id: 12345,
          name: "Tom Hanks",
          biography: "Thomas Jeffrey Hanks is an American actor...",
          birthday: "1956-07-09",
          place_of_birth: "Concord, California, USA",
          profile_path: "/abc.jpg",
          known_for_department: "Acting",
          popularity: 85.3,
        }),
        tmdbCreditsResponse({
          cast: [
            { title: "Forrest Gump", release_date: "1994-07-06", character: "Forrest Gump", media_type: "movie", popularity: 90 },
            { title: "Cast Away", release_date: "2000-12-22", character: "Chuck Noland", media_type: "movie", popularity: 70 },
          ],
          crew: [],
        }),
        tmdbExternalIdsResponse({ imdb_id: "tt0000000" }),
      ]);

      const res = await captured.handler!(mockRequest({ name: "Tom Hanks", mode: "lookup" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.found).toBe(true);
      expect(data.name).toBe("Tom Hanks");
      expect(data.tmdb_id).toBe(12345);
      expect(data.biography).toContain("American actor");
      expect(data.birthday).toBe("1956-07-09");
      expect(data.imdb_id).toBe("tt0000000");
      expect(data.credits).toHaveLength(2);
      expect(data.credits[0].title).toBe("Forrest Gump");
    });

    it("returns top 8 search results when mode=search", async () => {
      const results = Array.from({ length: 12 }, (_, i) => ({
        id: 10000 + i,
        name: `Actor ${i + 1}`,
        known_for_department: "Acting",
        popularity: 50 - i,
        profile_path: i % 2 === 0 ? `/actor${i}.jpg` : null,
        known_for: [],
      }));

      mockFetch([
        new Response(
          JSON.stringify({ results }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        ),
      ]);

      const res = await captured.handler!(mockRequest({ name: "Actor", mode: "search" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.results).toHaveLength(8);
      expect(data.results[0].name).toBe("Actor 1");
      expect(data.results[0].profile_url).toContain("w185");
    });

    it("returns found:false when no search results", async () => {
      mockFetch([
        new Response(
          JSON.stringify({ results: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        ),
      ]);

      const res = await captured.handler!(mockRequest({ name: "Nonexistent Person", mode: "lookup" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.found).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Validations — input validation
  // ──────────────────────────────────────────────

  describe("Input validation", () => {
    it("returns 400 when name is missing", async () => {
      const res = await captured.handler!(mockRequest({ mode: "lookup" }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("name is required");
    });

    it("returns 400 when request body is empty JSON", async () => {
      const res = await captured.handler!(mockRequest({}));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("name is required");
    });

    it("returns 500 when TMDB_API_KEY is not configured", async () => {
      delete mockEnv.TMDB_API_KEY;

      const res = await captured.handler!(mockRequest({ name: "Tom Hanks", mode: "lookup" }));
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBe("TMDB_API_KEY not configured");

      // Restore
      mockEnv.TMDB_API_KEY = "test-v3-api-key-12345";
    });
  });

  // ──────────────────────────────────────────────
  // Invariant: v4 read access token auth header
  // ──────────────────────────────────────────────

  describe("V4 read access token authorization", () => {
      // Ensure clean env state between v4 and v3 tests
      afterEach(() => {
        mockEnv.TMDB_API_KEY = "test-v3-api-key-12345";
      });

      it("sends Bearer token for v4 keys (starting with eyJ)", async () => {
        mockEnv.TMDB_API_KEY = "eyJhbG...wIn0";

        mockFetch([
          tmdbSearchResponse([
            { id: 999, name: "Bearer Token Person", known_for_department: "Acting", popularity: 10, profile_path: null, known_for: [] },
          ]),
          tmdbDetailResponse({ id: 999, name: "Bearer Token Person" }),
          tmdbCreditsResponse(),
          tmdbExternalIdsResponse(),
        ]);

        const res = await captured.handler!(mockRequest({ name: "Bearer Token Person", mode: "lookup" }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.found).toBe(true);
        expect(data.name).toBe("Bearer Token Person");

        // Verify fetch was called with the Bearer auth header
        const fetchCalls = (globalThis as any).fetch.mock.calls;
        const firstCallUrl = fetchCalls[0][0];
        const firstCallOpts = fetchCalls[0][1];
        expect(firstCallUrl).toContain("api.themoviedb.org/3/search/person");
        expect(firstCallOpts.headers.Authorization).toBe("Bearer eyJhbG...wIn0");
        expect(firstCallUrl).not.toContain("api_key="); // v4 keys don't use query param
      });

      it("uses query param api_key for v3 keys (not starting with eyJ)", async () => {
        mockFetch([
          tmdbSearchResponse([
            { id: 888, name: "V3 Key Person", known_for_department: "Acting", popularity: 10, profile_path: null, known_for: [] },
          ]),
          tmdbDetailResponse({ id: 888, name: "V3 Key Person" }),
          tmdbCreditsResponse(),
          tmdbExternalIdsResponse(),
        ]);

        const res = await captured.handler!(mockRequest({ name: "V3 Key Person", mode: "lookup" }));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.found).toBe(true);

        const fetchCalls = (globalThis as any).fetch.mock.calls;
        const firstCallUrl = fetchCalls[0][0];
        expect(firstCallUrl).toContain("api_key=test-v3-api-key-12345");
      });
    });

  // ──────────────────────────────────────────────
  // Edge: No results edge cases
  // ──────────────────────────────────────────────

  describe("Edge cases", () => {
    it("handles null results gracefully", async () => {
      mockFetch([
        new Response(
          JSON.stringify({}),
          { status: 200, headers: { "Content-Type": "application/json" } }
        ),
      ]);

      const res = await captured.handler!(mockRequest({ name: "Nobody", mode: "lookup" }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.found).toBe(false);
    });

    it("handles empty name string", async () => {
      const res = await captured.handler!(mockRequest({ name: "", mode: "lookup" }));
      const data = await res.json();

      // TMDB will just return no results for empty query
      expect(res.status).toBe(400);
      expect(data.error).toBe("name is required");
    });

    it("handles OPTIONS preflight request", async () => {
      const req = new Request("http://localhost/tmdb-lookup", { method: "OPTIONS" });
      const res = await captured.handler!(req);

      expect(res.status).toBe(200);
      const headers = res.headers;
      expect(headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(headers.get("Access-Control-Allow-Headers")).toContain("authorization");
    });
  });

  // ──────────────────────────────────────────────
  // Exception handling — catch-all
  // ──────────────────────────────────────────────

  describe("Exception handling", () => {
    it("returns 500 when fetch throws an exception", async () => {
      (globalThis as any).fetch = vi.fn(() =>
        Promise.reject(new Error("Network failure: connection reset"))
      );

      const res = await captured.handler!(mockRequest({ name: "Tom Hanks", mode: "lookup" }));
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toContain("Network failure");
    });
  });
});