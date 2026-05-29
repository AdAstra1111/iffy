import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// ── Global error capture ──────────────────────────────────────────────────────
// Logs to window.__IFFY_ERRORS__ for diagnostics on any device
function captureErr(type: string, msg: string, details?: any) {
  (window as any).__IFFY_ERRORS__ = (window as any).__IFFY_ERRORS__ || [];
  (window as any).__IFFY_ERRORS__.push({ type, message: msg, details, timestamp: new Date().toISOString(), url: window.location.href });
}
try {
  window.addEventListener('error', (e) => {
    captureErr('UNCAUGHT', e.message, { filename: e.filename, lineno: e.lineno, stack: e.error?.stack });
  });
  window.addEventListener('unhandledrejection', (e) => {
    captureErr('UNHANDLED_REJECTION', String(e.reason), { stack: e.reason?.stack });
  });
} catch (_) { /* harmless */ }

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
  || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase environment not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

function createProxiedClient(url: string, key: string) {
  // ── GoTrueClient singleton guard ──────────────────────────────────────────
  // Lazy-loaded route chunks can re-execute module scope, creating duplicate
  // GoTrueClient instances. Guard on window.__IFFY_SUPABASE_SINGLETON__ with
  // ?.auth check to prevent false positives from stale window references.
  const existingSingleton = (window as any).__IFFY_SUPABASE_SINGLETON__;
  if (existingSingleton?.auth) {
    try { captureErr('CLIENT_INIT', 'returning existing singleton (lazy chunk dedup)', {}); } catch (_) {}
    return existingSingleton;
  }

  try {
    captureErr('CLIENT_INIT', 'createProxiedClient starting', { url, keyLen: key.length });
  } catch (_) { /* if window not available yet */ }

  let client: SupabaseClient;
  try {
    client = createClient<Database>(url, key, {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    captureErr('CLIENT_INIT', 'createClient succeeded', { hasFrom: typeof client.from === 'function' });
  } catch (err: any) {
    captureErr('CLIENT_INIT_FAILED', err.message, { stack: err.stack });
    throw err;
  }

  // Override supabase.functions.invoke to route through Vercel proxy
  // This avoids changing any frontend call sites
  (client.functions as any).invoke = async function(fn: string, options: any = {}) {
    try { captureErr('INVOKE', `calling ${fn}`, { options: typeof options }); } catch (_) {}
    const proxyUrl = `/api/supabase-proxy/functions/v1/${fn}`;
    const body = options.body !== undefined ? options.body : options;
    // NOTE: refreshSession was removed — autoRefreshToken in client config handles this.
    // Manual refreshSession() was creating new GoTrueClient instances ("Multiple GoTrueClient instances detected").
    // NOTE: refreshSession removed — autoRefreshToken already handles this. Multiple GoTrueClient instances caused auth thrash.
    const { data: sessionData } = await client.auth.getSession();
    const authToken = sessionData?.session?.access_token || key;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-supabase-key': key,
      'Authorization': `Bearer ${authToken}`,
    };
    if (options.headers) {
      Object.assign(headers, options.headers);
    }
    try {
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(600000),
      });
      const text = await response.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = text; }
      if (!response.ok) {
        return { data: null, error: { message: text, status: response.status, context: data } };
      }
      return { data, error: null };
    } catch (error: any) {
      try { captureErr('INVOKE_ERROR', `invoke ${fn} threw`, { message: error.message }); } catch (_) {}
      return { data: null, error: { message: error.message, context: null } };
    }
  };

  try {
    captureErr('CLIENT_INIT', 'createProxiedClient complete', {});
  } catch (_) {}

  (window as any).__IFFY_SUPABASE_SINGLETON__ = client;
  return client;
}

export const supabase: SupabaseClient = createProxiedClient(SUPABASE_URL, SUPABASE_ANON_KEY);
