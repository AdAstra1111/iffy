import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const sql = await Deno.readTextFile(
      "/Users/laralane/code/iffy/supabase/migrations/20260512000000_merge_duplicate_yeti_characters.sql"
    );

    const { data, error } = await supabase.rpc("exec_sql", { query: sql });
    if (error) {
      // Try raw query as fallback
      const { error: runError } = await supabase.from("narrative_entities").select("count").limit(0);
      return new Response(JSON.stringify({ error: error.message, runError }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
