/**
 * entity-staleness-engine
 *
 * Gap C read path: detects when entity links are stale relative to source scene content.
 *
 * Takes a project ID (and optionally specific scene IDs) and checks whether
 * stored `inputs_used.parent_plaintext` hash matches the current scene content hash.
 * A mismatch means the scene changed since entity extraction last ran — the link is stale.
 *
 * Returns a list of stale scene/entity pairs so the caller can trigger re-extraction
 * via entity-links-engine for only the affected scenes.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ─────────────────────────────────────────────────────────────────
   SHA-256 content hash — same algorithm as entity-links-engine
   Must be deterministic: same scene content always produces the same hash.
   ───────────────────────────────────────────────────────────────── */

async function computeContentHash(
  slugline: string,
  sceneText: string,
  characters: string[],
): Promise<string> {
  const input = [
    slugline || "",
    sceneText || "",
    [...characters].sort().join(","),
  ].join("|");

  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

interface StalenessResult {
  scene_id: string;
  entity_id: string;
  stored_hash: string | null;
  current_hash: string;
  is_stale: boolean;
}

/* ─────────────────────────────────────────────────────────────────
   Main handler
   POST body: { projectId: string, sceneIds?: string[] }
   ───────────────────────────────────────────────────────────────── */

serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, sceneIds } = await req.json();
    if (!projectId) {
      return new Response(JSON.stringify({ error: "projectId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client — reads all data
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Step 1: Get the latest scene versions for the project
    // If sceneIds is provided, filter to those; otherwise get all scenes
    let sceneQuery = supabase
      .from("scene_graph_scenes")
      .select("id")
      .eq("project_id", projectId);

    if (sceneIds && sceneIds.length > 0) {
      sceneQuery = sceneQuery.in("id", sceneIds);
    }

    const { data: scenes, error: sceneError } = await sceneQuery;

    if (sceneError) {
      return new Response(JSON.stringify({ error: `Failed to fetch scenes: ${sceneError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!scenes || scenes.length === 0) {
      return new Response(JSON.stringify({ ok: true, staleCount: 0, results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sceneIdsToCheck = scenes.map(s => s.id);

    // Step 2: Get the latest version for each scene (highest version_number where status = 'draft')
    // Fetch all draft versions ordered desc, then deduplicate keeping only the latest per scene_id
    const { data: allVersions, error: versionError } = await supabase
      .from("scene_graph_versions")
      .select("scene_id, slugline, content, characters_present, version_number")
      .in("scene_id", sceneIdsToCheck)
      .eq("status", "draft")
      .order("version_number", { ascending: false });

    if (versionError) {
      return new Response(JSON.stringify({ error: `Failed to fetch versions: ${versionError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build scene_id → latest version map (first occurrence after ordering desc = highest version_number)
    const versionMap = new Map<string, any>();
    for (const v of allVersions ?? []) {
      if (!versionMap.has(v.scene_id)) {
        versionMap.set(v.scene_id, v);
      }
    }

    // Step 3: Get stored inputs_used from narrative_scene_entity_links
    const { data: links, error: linksError } = await supabase
      .from("narrative_scene_entity_links")
      .select("id, scene_id, entity_id, inputs_used")
      .eq("project_id", projectId)
      .in("scene_id", sceneIdsToCheck);

    if (linksError) {
      return new Response(JSON.stringify({ error: `Failed to fetch links: ${linksError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 4: Compute current hash and compare with stored for each link
    const results: StalenessResult[] = [];

    for (const link of links ?? []) {
      const v = versionMap.get(link.scene_id);
      if (!v) {
        // Scene has no version — treat as non-stale (nothing to compare against)
        continue;
      }

      const currentHash = await computeContentHash(
        v.slugline || "",
        v.content || "",
        v.characters_present || [],
      );

      const storedHash: string | null =
        (link.inputs_used as Record<string, any>)?.parent_plaintext ?? null;

      const isStale = storedHash !== null && storedHash !== currentHash;

      results.push({
        scene_id: link.scene_id,
        entity_id: link.entity_id,
        stored_hash: storedHash,
        current_hash: currentHash,
        is_stale: isStale,
      });
    }

    // Step 5: Also check narrative_entities inputs_used for entity-level staleness
    // Entity records store a composite of all scene hashes (sorted, comma-joined).
    // We need to recompute: for each entity, what are the scene hashes of all
    // the scenes it appears in, and does that match the stored composite?
    const { data: entities, error: entityError } = await supabase
      .from("narrative_entities")
      .select("id, inputs_used")
      .eq("project_id", projectId);

    if (entityError) {
      return new Response(JSON.stringify({ error: `Failed to fetch entities: ${entityError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build entity → scene hashes map from current links
    const entitySceneHashes = new Map<string, string[]>();
    for (const link of links ?? []) {
      const v = versionMap.get(link.scene_id);
      if (!v) continue;
      const hash = await computeContentHash(
        v.slugline || "",
        v.content || "",
        v.characters_present || [],
      );
      if (!entitySceneHashes.has(link.entity_id)) {
        entitySceneHashes.set(link.entity_id, []);
      }
      entitySceneHashes.get(link.entity_id)!.push(hash);
    }

    for (const entity of entities ?? []) {
      const sceneHashes = entitySceneHashes.get(entity.id) || [];
      const storedComposite: string | null =
        (entity.inputs_used as Record<string, any>)?.parent_plaintext ?? null;
      const currentComposite = sceneHashes.length > 0
        ? [...sceneHashes].sort().join(",")
        : null;

      // An entity is stale if its composite hash doesn't match
      // (scene was added/removed/changed for this entity)
      const isStale = storedComposite !== null && storedComposite !== currentComposite;

      if (isStale) {
        results.push({
          scene_id: "__entity__",
          entity_id: entity.id,
          stored_hash: storedComposite,
          current_hash: currentComposite,
          is_stale: true,
        });
      }
    }

    const staleCount = results.filter(r => r.is_stale).length;

    return new Response(JSON.stringify({
      ok: true,
      totalChecked: results.length,
      staleCount,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
