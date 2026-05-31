// run-costume-debug3 — check atom type distribution + costume atoms properly
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(supabaseUrl, serviceKey);

  const pid = "b6ae36fb-805b-4ff5-84ba-91fbccd46334";

  // Get atom types for this project
  const { data: types } = await sb.rpc("get_atom_types_for_project", { p_project_id: pid }).catch(() => null);
  
  // Try raw query with distinct atom_type
  const { data: rawTypes } = await sb.from("atoms").select("atom_type").eq("project_id", pid);
  
  // Count by atom_type
  const typeCounts = {};
  if (rawTypes) {
    for (const r of rawTypes) {
      const t = r.atom_type || "unknown";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
  }

  // Get sample costume atoms if any
  const { data: costumeSamples } = await sb.from("atoms").select("*").eq("project_id", pid).eq("atom_type", "costume").limit(5);
  
  // Get ALL atom types present
  const allTypes = [...new Set((rawTypes || []).map(r => r.atom_type))];

  return new Response(JSON.stringify({
    total_rows: (rawTypes || []).length,
    type_counts: typeCounts,
    all_types_present: allTypes,
    costume_samples: costumeSamples || "none",
  }), { headers: { "Content-Type": "application/json" } });
});