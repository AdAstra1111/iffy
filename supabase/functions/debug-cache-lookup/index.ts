import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { projectId, characterId } = await req.json();
  
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseClient = createClient(supabaseUrl, serviceRoleKey);
  
  // Try cache lookup
  const { data: cached, error: cacheErr } = await supabaseClient
    .from("character_scene_contexts")
    .select("id, character_id, scene_id, character_name, scene_number")
    .eq("character_id", characterId)
    .eq("project_id", projectId)
    .limit(5);
  
  // Try raw SQL
  const { data: rawRows, error: rawErr } = await supabaseClient.rpc("exec_sql", {
    sql: `SELECT COUNT(*) as cnt FROM character_scene_contexts WHERE character_id = '${characterId}' AND project_id = '${projectId}';`
  }).catch(() => ({ data: null, error: "rpc not found" }));
  
  return Response.json({
    characterId,
    projectId,
    cacheLookup: { data: cached, error: cacheErr ? cacheErr.message : null },
    rawCount: rawRows,
    rawError: rawErr,
  }, { headers: { "Content-Type": "application/json" } });
});
