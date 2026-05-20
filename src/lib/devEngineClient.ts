// ── Supabase Edge Function direct client ──
// Bypasses the Vercel proxy to avoid 10s Hobby plan timeout.
import { supabase } from "@/integrations/supabase/client";

export type DevEngineBody = Record<string, any> & { action: string };

export async function callDevEngine(body: DevEngineBody): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("dev-engine-v2", {
    method: "POST",
    body,
  });

  if (error) {
    const msg = typeof error === "object" ? (error as any).message || JSON.stringify(error) : String(error);
    throw new Error(msg);
  }

  return data;
}
