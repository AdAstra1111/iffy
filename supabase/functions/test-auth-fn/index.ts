import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers });
  
  try {
    const auth = req.headers.get("Authorization") || "none";
    const body = await req.json();
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    
    const isSRK = token === SRK;
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      SRK
    );
    const { data: proj } = await supabase
      .from("projects")
      .select("user_id")
      .eq("id", body.projectId || "none")
      .limit(1)
      .maybeSingle();
    
    return new Response(JSON.stringify({
      auth_working: true,
      is_srk_call: isSRK,
      token_prefix: token.substring(0, 10) + "...",
      project_owner: proj?.user_id || null,
      body_received: !!body.projectId,
      srk_prefix: SRK.substring(0, 10) + "...",
    }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack?.split("\n").slice(0,5).join("\n") }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
