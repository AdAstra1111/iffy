/**
 * Tests for Vercel proxy handlers for 11 visual edge functions
 *
 * Each handler follows the same dev-engine-v2 pattern:
 * - maxDuration = 300
 * - Constructs target URL to Supabase edge function
 * - Forwards auth headers with env var fallback chain
 * - Proxies the fetch response
 * - Handles errors with 500 status
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock setup ---

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// The 11 handler paths
const HANDLER_PATHS = [
  'generate-shot-list',
  'generate-scene-demo',
  'generate-framing',
  'extract-visual-dna',
  'auto-populate-visual-set',
  'render-animatic',
  'evaluate-visual-similarity',
  'export-lookbook-pdf',
  'comps-engine',
  'comps-style-fingerprint',
  'generate-casting-candidates',
] as const;

// Supabase URL (consistent across all handlers)
const SUPABASE_URL = 'https://hdfderbphdobomkdjypc.supabase.co';

/**
 * Create a mock VercelResponse with Jest-style spies
 */
function createMockRes() {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn().mockReturnThis();
  const send = vi.fn().mockReturnThis();
  const setHeader = vi.fn().mockReturnThis();
  return { status, json, send, setHeader };
}

/**
 * Create a mock VercelRequest with configurable properties
 */
function createMockReq(overrides: Record<string, any> = {}) {
  return {
    method: 'POST',
    headers: {},
    body: { test: 'data' },
    query: {},
    cookies: {},
    ...overrides,
  };
}

/**
 * Helper: dynamically import a handler by path name
 * Returns { handler, maxDuration } from the module
 */
async function loadHandler(name: string) {
  // Dynamic import path relative to project root
  const mod = await import(
    `../../../api/supabase-proxy/functions/v1/${name}.ts`
  );
  return { handler: mod.default, maxDuration: mod.maxDuration };
}

/**
 * Helper: create a mock successful fetch response
 */
function createSuccessResponse(data: any, statusCode = 200) {
  return {
    status: statusCode,
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    headers: new Map([['content-type', 'application/json']]),
  };
}

/**
 * Helper: create a mock error fetch response
 */
function createErrorResponse(statusCode = 500, body = 'Internal Error') {
  return {
    status: statusCode,
    text: vi.fn().mockResolvedValue(body),
    headers: new Map(),
  };
}

// --- Tests ---

describe('Visual Edge Proxy Handlers', () => {

  beforeEach(() => {
    mockFetch.mockReset();
    // Set default env vars for tests
    process.env.SUPABASE_ANON_KEY = 'test-supabase-key';
    process.env.VITE_SUPABASE_ANON_KEY = 'test-vite-key';
  });

  describe.each(HANDLER_PATHS)('%s', (handlerName) => {
    const expectedPath = `functions/v1/${handlerName}`;
    const expectedUrl = `${SUPABASE_URL}/${expectedPath}`;

    it('exports maxDuration = 300', async () => {
      const { maxDuration } = await loadHandler(handlerName);
      expect(maxDuration).toBe(300);
    });

    it('proxies POST request to correct Supabase URL', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq({ method: 'POST', body: { prompt: 'test' } });
      const res = createMockRes();

      const mockResponse = createSuccessResponse({ success: true });
      mockFetch.mockResolvedValue(mockResponse);

      await handler(req, res);

      // Verify fetch was called with correct URL
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [actualUrl, options] = mockFetch.mock.calls[0];
      expect(actualUrl).toBe(expectedUrl);

      // Verify POST body serialization
      expect(options.method).toBe('POST');
      expect(options.body).toBe(JSON.stringify({ prompt: 'test' }));
    });

    it('forwards x-supabase-key from request headers', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq({
        headers: { 'x-supabase-key': 'client-provided-key' },
      });
      const res = createMockRes();

      mockFetch.mockResolvedValue(createSuccessResponse({ ok: true }));

      await handler(req, res);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.apikey).toBe('client-provided-key');
    });

    it('forwards Authorization header from request', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq({
        headers: { authorization: 'Bearer client-token' },
      });
      const res = createMockRes();

      mockFetch.mockResolvedValue(createSuccessResponse({ ok: true }));

      await handler(req, res);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBe('Bearer client-token');
    });

    it('falls back to SUPABASE_ANON_KEY env var when no headers provided', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq({ headers: {} });
      const res = createMockRes();

      mockFetch.mockResolvedValue(createSuccessResponse({ ok: true }));

      await handler(req, res);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.apikey).toBe('test-supabase-key');
      expect(options.headers.Authorization).toBe('Bearer test-supabase-key');
    });

    it('falls back to VITE_SUPABASE_ANON_KEY when SUPABASE_ANON_KEY is not set', async () => {
      delete process.env.SUPABASE_ANON_KEY;
      process.env.VITE_SUPABASE_ANON_KEY = 'vite-fallback-key';

      const { handler } = await loadHandler(handlerName);
      const req = createMockReq({ headers: {} });
      const res = createMockRes();

      mockFetch.mockResolvedValue(createSuccessResponse({ ok: true }));

      await handler(req, res);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.apikey).toBe('vite-fallback-key');
      expect(options.headers.Authorization).toBe('Bearer vite-fallback-key');
    });

    it('uses empty string when no env vars are set', async () => {
      delete process.env.SUPABASE_ANON_KEY;
      delete process.env.VITE_SUPABASE_ANON_KEY;

      const { handler } = await loadHandler(handlerName);
      const req = createMockReq({ headers: {} });
      const res = createMockRes();

      mockFetch.mockResolvedValue(createSuccessResponse({ ok: true }));

      await handler(req, res);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.apikey).toBe('');
      expect(options.headers.Authorization).toBe('Bearer ');
    });

    it('sends No body for GET requests', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq({ method: 'GET' });
      const res = createMockRes();

      mockFetch.mockResolvedValue(createSuccessResponse({ ok: true }));

      await handler(req, res);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('GET');
      expect(options.body).toBeUndefined();
    });

    it('sends No body for DELETE requests', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq({ method: 'DELETE' });
      const res = createMockRes();

      mockFetch.mockResolvedValue(createSuccessResponse({ ok: true }));

      await handler(req, res);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('DELETE');
      expect(options.body).toBeUndefined();
    });

    it('sends No body for HEAD requests', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq({ method: 'HEAD' });
      const res = createMockRes();

      mockFetch.mockResolvedValue(createSuccessResponse({ ok: true }));

      await handler(req, res);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('HEAD');
      expect(options.body).toBeUndefined();
    });

    it('sends body for PUT requests', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq({ method: 'PUT', body: { update: true } });
      const res = createMockRes();

      mockFetch.mockResolvedValue(createSuccessResponse({ ok: true }));

      await handler(req, res);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('PUT');
      expect(options.body).toBe(JSON.stringify({ update: true }));
    });

    it('sends body for PATCH requests', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq({ method: 'PATCH', body: { patch: true } });
      const res = createMockRes();

      mockFetch.mockResolvedValue(createSuccessResponse({ ok: true }));

      await handler(req, res);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('PATCH');
      expect(options.body).toBe(JSON.stringify({ patch: true }));
    });

    it('defaults to POST method when no method specified', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq({ method: undefined });
      const res = createMockRes();

      mockFetch.mockResolvedValue(createSuccessResponse({ ok: true }));

      await handler(req, res);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');
    });

    it('always includes x-supabase-client-platform: web header', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq();
      const res = createMockRes();

      mockFetch.mockResolvedValue(createSuccessResponse({ ok: true }));

      await handler(req, res);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['x-supabase-client-platform']).toBe('web');
    });

    it('always includes Content-Type: application/json header', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq();
      const res = createMockRes();

      mockFetch.mockResolvedValue(createSuccessResponse({ ok: true }));

      await handler(req, res);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('forwards upstream status code and body to client', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq();
      const res = createMockRes();

      const upstreamData = { result: 'generated', id: 'abc-123' };
      mockFetch.mockResolvedValue(createSuccessResponse(upstreamData, 201));

      await handler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.send).toHaveBeenCalledWith(JSON.stringify(upstreamData));
    });

    it('forwards 4xx error from upstream', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq();
      const res = createMockRes();

      mockFetch.mockResolvedValue(createErrorResponse(400, 'Bad Request'));

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Bad Request');
    });

    it('forwards 404 error from upstream', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq();
      const res = createMockRes();

      mockFetch.mockResolvedValue(createErrorResponse(404, 'Not Found'));

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('Not Found');
    });

    it('returns 500 JSON error when fetch throws', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq();
      const res = createMockRes();

      mockFetch.mockRejectedValue(new Error('Network failure'));

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Network failure' });
    });

    it('returns 500 with default message when error has no message', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq();
      const res = createMockRes();

      mockFetch.mockRejectedValue({});

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Proxy failed' });
    });

    it('handles empty request body for POST', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq({ method: 'POST', body: null });
      const res = createMockRes();

      mockFetch.mockResolvedValue(createSuccessResponse({ ok: true }));

      await handler(req, res);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe('null');
    });

    it('handles empty request body for POST (undefined)', async () => {
      const { handler } = await loadHandler(handlerName);
      const req = createMockReq({ method: 'POST', body: undefined });
      const res = createMockRes();

      mockFetch.mockResolvedValue(createSuccessResponse({ ok: true }));

      await handler(req, res);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe(undefined);
    });
  });

  describe('vercel.json configuration', () => {
    it('has all 11 handler entries in vercel.json functions block', async () => {
      const fs = await import('fs');
      const vercelJson = JSON.parse(
        fs.readFileSync('/Users/laralane/code/iffy/vercel.json', 'utf-8')
      );

      const functions = vercelJson.functions || {};
      const handlerEntries = HANDLER_PATHS.map(
        (name) => `api/supabase-proxy/functions/v1/${name}.ts`
      );

      for (const entry of handlerEntries) {
        expect(functions).toHaveProperty(entry);
        expect(functions[entry].maxDuration).toBe(300);
      }
    });

    it('preserves the catch-all [...path].ts handler', async () => {
      const fs = await import('fs');
      const vercelJson = JSON.parse(
        fs.readFileSync('/Users/laralane/code/iffy/vercel.json', 'utf-8')
      );

      const functions = vercelJson.functions || {};
      expect(functions).toHaveProperty('api/supabase-proxy/[...path].ts');
      expect(functions['api/supabase-proxy/[...path].ts'].maxDuration).toBe(300);
    });

    it('preserves existing non-visual handler entries', async () => {
      const fs = await import('fs');
      const vercelJson = JSON.parse(
        fs.readFileSync('/Users/laralane/code/iffy/vercel.json', 'utf-8')
      );

      const functions = vercelJson.functions || {};
      // These entries should still exist
      const existingEntries = [
        'api/supabase-proxy/functions/v1/reverse-engineer-script.ts',
        'api/supabase-proxy/functions/v1/dev-engine-v2.ts',
        'api/supabase-proxy/functions/v1/auto-run.ts',
        'api/supabase-proxy/functions/v1/canonicalize-scene-substrate.ts',
        'api/supabase-proxy/functions/v1/generate-document.ts',
        'api/supabase-proxy/functions/v1/promote-to-devseed.ts',
        'api/supabase-proxy/functions/v1/devseed-autopilot.ts',
        'api/supabase-proxy/functions/v1/project-folder-engine.ts',
        'api/nit-sync-proxy.ts',
        'api/reverse-engineer-status-proxy.ts',
        'api/re_status.ts',
        'api/entity-links-engine.ts',
      ];

      for (const entry of existingEntries) {
        expect(functions).toHaveProperty(entry);
      }
    });
  });
});