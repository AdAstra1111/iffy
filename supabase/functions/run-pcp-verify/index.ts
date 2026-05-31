// run-pcp-verify — verify PCP profile creation
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(supabaseUrl, serviceKey);

  const CONCRETE = "b6ae36fb-805b-4ff5-84ba-91fbccd46334";

  // 1. Check if the table exists
  const { data: tables } = await sb.rpc("get_tables").catch(() => null);
  
  // 2. Try querying project_context_profiles directly
  const { data: pcp, error: pcpErr } = await sb.from("project_context_profiles").select("*").eq("project_id", CONCRETE).limit(5);
  
  // 3. Check if the profile got stored elsewhere
  const { data: pcpAll } = await sb.from("project_context_profiles").select("id").limit(1);
  
  // 4. Check columns
  const { data: cols } = await sb.rpc("get_table_columns", { p_table: "project_context_profiles" }).catch(() => null);

  return new Response(JSON.stringify({
    pcp_query_error: pcpErr?.message || null,
    pcp_rows: pcp || "none",
    any_pcp_rows: pcpAll || "none",
  }, null, 2), { headers: { "Content-Type": "application/json" } });
});