// run-costume-check — check costume generation status for principal characters
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(supabaseUrl, serviceKey);

  const CONCRETE = "b6ae36fb-805b-4ff5-84ba-91fbccd46334";
  const EVENT = "6c4e2f48-fe9c-47b6-aac8-656a3ed4274b";

  async function checkCostumes(projectId, principalChars) {
    // Get all costume atoms
    const { data: allAtoms } = await sb
      .from("atoms")
      .select("id, canonical_name, entity_name, atom_type, status, readiness_state, generation_status, attributes, source_text")
      .eq("project_id", projectId)
      .eq("atom_type", "costume")
      .order("canonical_name");

    const total = (allAtoms || []).length;

    // Find principal character atoms
    const principalAtoms = (allAtoms || []).filter(a => {
      const name = (a.canonical_name || "").toLowerCase();
      const attrName = ((a.attributes?.characterName || a.attributes?.sourceChar || "")).toLowerCase();
      return principalChars.some(pc => name.includes(pc.toLowerCase()) || attrName.includes(pc.toLowerCase()));
    });

    // Count statuses
    const running = (allAtoms || []).filter(a => a.generation_status === "running").length;
    const pending = (allAtoms || []).filter(a => a.generation_status === "pending").length;
    const done = (allAtoms || []).filter(a => a.generation_status === "done" || a.readiness_state !== "stub").length;
    const failed = (allAtoms || []).filter(a => a.generation_status === "failed").length;

    return {
      total_atoms: total,
      running, pending, done, failed,
      principal_atoms: principalAtoms.map(a => ({
        name: a.canonical_name,
        generation_status: a.generation_status,
        readiness_state: a.readiness_state,
        has_attributes: a.attributes && Object.keys(a.attributes).length > 2,
      })),
    };
  }

  const conResult = await checkCostumes(CONCRETE, ["Captain Reyes", "Marcus Cole", "Sarah Chen", "The Architect"]);
  const evResult = await checkCostumes(EVENT, ["Alexei Volkov", "Dr. Elena Hart", "Dr. Kira Nakamura", "Dr. Marcus Webb", "Dr. Priya Sharma", "The Other Kira"]);

  return new Response(JSON.stringify({
    concrete_angels: conResult,
    event_horizon: evResult,
    note: "Costume generation runs in background (spawned). Re-call to check completion.",
  }), { headers: { "Content-Type": "application/json" } });
});