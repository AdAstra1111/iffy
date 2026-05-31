// run-costume-debug2 — check ALL tables for costume data
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(supabaseUrl, serviceKey);

  const pid = "b6ae36fb-805b-4ff5-84ba-91fbccd46334";

  // Check many possible tables
  async function checkTable(table, filters = {}) {
    let q = sb.from(table).select("*", { count: "exact", head: true }).eq("project_id", pid);
    const { count, error } = await q;
    return { table, count, error: error?.message || null };
  }

  const tables = ["atoms", "costume_atoms", "visual_set_slots", "visual_set_candidates", 
    "wardrobe_profiles", "character_wardrobe", "project_visual_sets", "costume_templates",
    "production_atoms", "scene_costumes"];

  const results = [];
  for (const t of tables) {
    try {
      const r = await checkTable(t);
      results.push(r);
    } catch (e) {
      results.push({ table: t, error: e.message });
    }
  }

  // Also check atoms without atom_type filter
  const { data: anyAtoms } = await sb.from("atoms").select("id, atom_type, entity_name, generation_status").eq("project_id", pid).limit(5);
  
  // Check ALL atoms regardless of project
  const { data: allAtomTypes } = await sb.from("atoms").select("atom_type").limit(5);

  return new Response(JSON.stringify({
    table_counts: results,
    any_concrete_atoms: anyAtoms || "none",
    any_atoms_at_all: allAtomTypes || "none",
  }), { headers: { "Content-Type": "application/json" } });
});