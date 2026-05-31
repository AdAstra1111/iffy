// run-pcp — create PCP profiles for both projects
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(supabaseUrl, serviceKey);

  const CONCRETE = "b6ae36fb-805b-4ff5-84ba-91fbccd46334";
  const EVENT = "6c4e2f48-fe9c-47b6-aac8-656a3ed4274b";

  async function makePCP(projectId) {
    // Get project metadata
    const { data: proj } = await sb.from("projects").select("title, format, logline").eq("id", projectId).single();
    
    // Build minimal input for pcp-resolver
    const input = {
      project_id: projectId,
      project_metadata: {
        format: (proj?.format || "film").replace(/_/g, "_"),
        genre_tags: ["drama"],
        target_audience: "adults_25-55",
      },
      canon_json: {
        logline: proj?.logline || "",
        synopsis: "",
        characters: [],
        setting: { period: "contemporary", geography: "urban", climate: "temperate" },
      },
      user_overrides: {},
    };
    
    // Call pcp-resolver
    const r = await fetch(supabaseUrl + "/functions/v1/pcp-resolver", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + serviceKey },
      body: JSON.stringify(input),
    });
    const result = await r.json();
    
    // Verify PCP was created
    const { data: pcp } = await sb.from("project_context_profiles").select("id, profile_type, status").eq("project_id", projectId).limit(1);
    
    return {
      http_status: r.status,
      has_error: !!result.error,
      pcp_created: pcp && pcp.length > 0,
      pcp_status: pcp?.[0]?.status || null,
    };
  }

  const con = await makePCP(CONCRETE);
  const ev = await makePCP(EVENT);

  return new Response(JSON.stringify({ concrete_angels: con, event_horizon: ev }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});