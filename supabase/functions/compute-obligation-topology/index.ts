import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { computeObligationTopology, type ObligationTopologyComputeOptions } from "../_shared/obligation-topology.ts";

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
  if (req.method === "GET") return jsonRes({ ok: true, build: "compute-obligation-topology-v1" });

  try {
    const body = await req.json().catch(() => ({}));
    const { project_id, scene_ids, version_id, force_recompute } = body;

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

    // 1. Look up existing cache entries
    const { data: cachedEntries } = await supabase
      .from("obligation_topology_cache")
      .select("*")
      .in("scene_id", scene_ids)
      .eq("project_id", project_id);

    const cacheMap = new Map<string, any>();
    if (cachedEntries) {
      for (const entry of cachedEntries) {
        cacheMap.set(entry.scene_id, entry);
      }
    }

    // 2. Determine which scenes need computation vs can be returned from cache
    const needsCompute: string[] = [];
    if (!force_recompute) {
      for (const sceneId of scene_ids) {
        if (!cacheMap.has(sceneId)) {
          needsCompute.push(sceneId);
        }
      }
    } else {
      needsCompute.push(...scene_ids);
    }

    // 3. Fetch scene data for uncached scenes
    const states: Record<string, any> = {};

    // Return cached results first
    if (!force_recompute && cachedEntries) {
      for (const entry of cachedEntries) {
        states[entry.scene_id] = entry.topology_state;
      }
    }

    // 4. Compute for uncached scenes
    if (needsCompute.length > 0) {
      const { data: scenes } = await supabase
        .from("scene_graph_scenes")
        .select("scene_id, scene_number, scene_text, slugline")
        .in("scene_id", needsCompute);

      const sceneMap = new Map<string, any>();
      if (scenes) {
        for (const s of scenes) {
          sceneMap.set(s.scene_id, s);
        }
      }

      for (const sceneId of needsCompute) {
        const scene = sceneMap.get(sceneId);
        if (!scene) {
          states[sceneId] = { error: `Scene not found: ${sceneId}` };
          continue;
        }

        // Fetch character keys for this scene from narrative_entities
        const { data: entities } = await supabase
          .from("narrative_entities")
          .select("entity_key")
          .eq("project_id", project_id);

        const characterKeys: string[] = entities?.map((e: any) => e.entity_key) || [];

        // Build compute options
        const options: ObligationTopologyComputeOptions = {
          projectId: project_id,
          sceneId: sceneId,
          sceneNumber: scene.scene_number || 1,
          sceneText: scene.scene_text || "",
          characterKeys,
          versionId: version_id || undefined,
        };

        try {
          const state = computeObligationTopology(options);
          states[sceneId] = state;

          // Cache the result
          await supabase
            .from("obligation_topology_cache")
            .upsert({
              project_id: project_id,
              scene_id: sceneId,
              version_id: version_id || null,
              input_hash: state.meta.inputHash,
              topology_state: state,
              computed_at: new Date().toISOString(),
            }, {
              onConflict: "project_id, scene_id",
              ignoreDuplicates: false,
            });

        } catch (computeErr) {
          console.error(`Compute error for scene ${sceneId}:`, computeErr);
          states[sceneId] = { error: computeErr instanceof Error ? computeErr.message : "Computation failed" };
        }
      }
    }

    return jsonRes({
      states,
      total_scenes: scene_ids.length,
      computed: needsCompute.length,
      cached: scene_ids.length - needsCompute.length,
    });
  } catch (err) {
    console.error("compute-obligation-topology error:", err);
    return jsonRes({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});