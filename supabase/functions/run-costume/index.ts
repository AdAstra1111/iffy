// run-costume — run costume-atomiser for both projects
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(supabaseUrl, serviceKey);

  const CONCRETE = "b6ae36fb-805b-4ff5-84ba-91fbccd46334";
  const EVENT = "6c4e2f48-fe9c-47b6-aac8-656a3ed4274b";

  async function runCostume(projectId, label) {
    const results = { extract: null, generate: null, status: null, errors: [] };

    // Step 1: Extract costume refs
    try {
      const r1 = await fetch(supabaseUrl + "/functions/v1/costume-atomiser", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + serviceKey },
        body: JSON.stringify({ action: "extract", project_id: projectId }),
      });
      results.extract = await r1.json();
    } catch (e) { results.errors.push("extract: " + e.message); }

    // Step 2: Generate attributes for pending costume atoms
    try {
      const r2 = await fetch(supabaseUrl + "/functions/v1/costume-atomiser", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + serviceKey },
        body: JSON.stringify({ action: "generate", project_id: projectId }),
      });
      results.generate = await r2.json();
    } catch (e) { results.errors.push("generate: " + e.message); }

    // Step 3: Status
    try {
      const r3 = await fetch(supabaseUrl + "/functions/v1/costume-atomiser", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + serviceKey },
        body: JSON.stringify({ action: "status", project_id: projectId }),
      });
      results.status = await r3.json();
    } catch (e) { results.errors.push("status: " + e.message); }

    // Also query costume atoms directly
    const { data: atoms } = await sb
      .from("atoms")
      .select("id, entity_id, entity_name, atom_type, status, source_text")
      .eq("project_id", projectId)
      .eq("atom_type", "costume")
      .limit(20);
    results.atoms_from_db = atoms || [];

    return results;
  }

  const con = await runCostume(CONCRETE, "Concrete Angels");
  const ev = await runCostume(EVENT, "Event Horizon Protocol");

  return new Response(JSON.stringify({ concrete_angels: con, event_horizon: ev }), {
    headers: { "Content-Type": "application/json" },
  });
});