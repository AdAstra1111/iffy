import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
serve(async (req) => {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  return new Response(JSON.stringify({ 
    hasKey: !!key, 
    keyLength: key?.length,
    keyPrefix: key?.substring(0, 15),
  }), { headers: { "Content-Type": "application/json" } });
});
