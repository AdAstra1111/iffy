import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { computeObligationTopology, type Scene } from "../_shared/obligation-topology.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonRes(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return jsonRes({ ok: true, build: "compute-obligation-topology-v3" });

  try {
    const body = await req.json().catch(() => ({}));
    const { project_id, scene_ids, force_recompute } = body;

    if (!project_id || !scene_ids || !Array.isArray(scene_ids) || scene_ids.length === 0) {
      return jsonRes({ error: "project_id and scene_ids (non-empty array) are required" }, 400);
    }

    if (scene_ids.length > 50) {
      return jsonRes({ error: "Maximum 50 scene IDs per request" }, 400);
    }

    // Create Supabase admin client for DB access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch scene data: title, act_id from scene_graph_scenes
    const { data: scenesData } = await supabase
      .from("scene_graph_scenes")
      .select("scene_id, scene_number, scene_text, slugline")
      .in("scene_id", scene_ids);

    if (!scenesData || scenesData.length === 0) {
      return jsonRes({ error: "No scenes found for the given scene_ids" }, 404);
    }

    // Fetch entity keys for this project (used as scene entities)
    const { data: entitiesData } = await supabase
      .from("narrative_entities")
      .select("entity_key")
      .eq("project_id", project_id);

    const allEntityKeys: string[] = entitiesData?.map((e: any) => e.entity_key) || [];

    // Build Scene[] for the new computeObligationTopology API
    // Map over all scene_ids so we get results in the requested order
    const sceneIdSet = new Set(scenesData.map((s: any) => s.scene_id));

    // Build act assignment from scene data — group by act boundary heuristics
    // We need act_id for each scene. The scene_graph_scenes table may not have
    // a direct act_id column, so we derive it from slugline or scene_number.
    const scenes: Scene[] = scenesData.map((s: any) => {
      // Derive act_id from scene_number or slugline patterns
      let actId = "act_1";
      const num = s.scene_number || 1;
      if (num >= 20) actId = "act_3";
      else if (num >= 10) actId = "act_2";
      return {
        id: s.scene_id,
        act_id: actId,
        title: s.slugline || `Scene ${s.scene_number || s.scene_id}`,
        entities: allEntityKeys,
      };
    });

    // Compute topology — uses entity overlap across scenes
    const result = computeObligationTopology({ scenes });

    // Return the full topology result
    return jsonRes({
      topology: result,
      total_scenes: scene_ids.length,
    });
  } catch (err) {
    console.error("compute-obligation-topology error:", err);
    return jsonRes({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});