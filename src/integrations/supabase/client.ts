import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
  || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase environment not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

function createProxiedClient(url: string, key: string) {
  const client = createClient<Database>(url, key, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  // Override supabase.functions.invoke to route through Vercel proxy
  // This avoids changing any frontend call sites
  const originalInvoke = (client.functions as any).invoke.bind(client.functions);
  (client.functions as any).invoke = async function(fn: string, options: any = {}) {
    const proxyUrl = `/api/supabase-proxy/functions/v1/${fn}`;
    const body = options.body !== undefined ? options.body : options;
    // Use the user's session access_token so edge functions can authenticate the user.
    // Fall back to the anon key only if no session is available.
    const { data: sessionData } = await client.auth.getSession();
    const authToken = sessionData?.session?.access_token || key;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-supabase-key': key,
      'Authorization': `Bearer ${authToken}`,
    };
    // Pass through custom headers if provided
    if (options.headers) {
      Object.assign(headers, options.headers);
    }
    try {
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = text; }
      if (!response.ok) {
        return { data: null, error: { message: text, status: response.status, context: data } };
      }
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error: { message: error.message, context: null } };
    }
  };

  return client;
}

export const supabase: SupabaseClient = createProxiedClient(SUPABASE_URL, SUPABASE_ANON_KEY);
