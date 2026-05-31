// run-costume-debug — debug costume atoms
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(supabaseUrl, serviceKey);

  const CONCRETE = "b6ae36fb-805b-4ff5-84ba-91fbccd46334";

  // Query all atom types for this project
  const { data: atomTypes } = await sb
    .from("atoms")
    .select("atom_type, count(*)")
    .eq("project_id", CONCRETE)
    .limit(10);

  // Query costume atoms specifically - try with and without atom_type filter
  const { data: costume1 } = await sb
    .from("atoms")
    .select("id, entity_name, entity_id")
    .eq("project_id", CONCRETE)
    .eq("atom_type", "costume")
    .limit(5);

  // Try without type filter  
  const { data: all } = await sb
    .from("atoms")
    .select("id, entity_name, atom_type, status")
    .eq("project_id", CONCRETE)
    .limit(10);

  return new Response(JSON.stringify({
    atom_types: atomTypes || "none",
    costume_direct: costume1 || "none",
    any_atoms: all || "none",
  }), { headers: { "Content-Type": "application/json" } });
});