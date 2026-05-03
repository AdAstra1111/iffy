import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
serve(async (req) => {
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY_FOR_SUPABASE");
  const deprecatedKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return new Response(JSON.stringify({
    SERVICE_ROLE_KEY_FOR_SUPABASE: serviceKey ? { hasKey: true, length: serviceKey.length, prefix: serviceKey.substring(0, 20) } : null,
    SUPABASE_SERVICE_ROLE_KEY: deprecatedKey ? { hasKey: true, length: deprecatedKey.length, prefix: deprecatedKey.substring(0, 20) } : null,
  }), { headers: { "Content-Type": "application/json" } });
});
