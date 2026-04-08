/**
 * entity-links-engine — NEW intake stage for IFFY entity pipeline
 *
 * Creates narrative_scene_entity_links by matching entities (from narrative_units)
 * to scenes (from scene_graph_scenes) based on content.
 *
 * Logic:
 * - Characters: check if entity's canonical_name appears in scene content
 * - Locations: check if scene heading matches entity's location name
 * - Props/Wardrobe: check if entity name appears in scene content
 *
 * Idempotent: deletes existing links for the project before creating new ones.
 * Can be re-run safely.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/* ── helpers ── */

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check if entity appears in scene content.
 * For characters: matches canonical name (case-insensitive)
 * For locations: matches location field of scene
 * For props/wardrobe: matches entity name in content
 */
function entityAppearsInScene(
  entityName: string,
  entityType: string,
  sceneContent: string,
  sceneLocation: string | null
): boolean {
  const name = entityName.toLowerCase();
  const content = sceneContent.toLowerCase();
  const heading = sceneLocation?.toLowerCase() || "";

  if (entityType === "location") {
    // Match location entity against scene heading
    return heading.includes(name) || name.includes(heading);
  }

  // For characters, props, wardrobe - match against full content
  return content.includes(name);
}

/* ── main handler ── */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { projectId, forceRefresh } = body;

    if (!projectId) {
      throw new Error("projectId required");
    }

    console.log(`[entity-links] Starting for project ${projectId}`);

    // ── 1. Get all scenes with latest version content ────────────────────────
    const { data: scenes, error: scenesErr } = await supabase
      .from("scene_graph_scenes")
      .select("id, scene_key, project_id")
      .eq("project_id", projectId)
      .is("deprecated_at", null);

    if (scenesErr) throw new Error(`Failed to fetch scenes: ${scenesErr.message}`);
    if (!scenes || scenes.length === 0) {
      return new Response(JSON.stringify({ ok: true, linked: 0, message: "No scenes found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[entity-links] Found ${scenes.length} scenes`);

    // ── 2. Get latest version content + location for each scene ───────────────
    const sceneIds = scenes.map((s) => s.id);
    const { data: versions, error: verErr } = await supabase
      .from("scene_graph_versions")
      .select("id, scene_id, content, location")
      .in("scene_id", sceneIds)
      .order("version_number", { ascending: false });

    if (verErr) throw new Error(`Failed to fetch versions: ${verErr.message}`);

    // Build scene_id → {id, content, location} map
    const versionMap = new Map<string, { id: string; content: string; location: string | null }>();
    for (const v of versions || []) {
      if (!versionMap.has(v.scene_id)) {
        versionMap.set(v.scene_id, {
          id: v.id,
          content: v.content || "",
          location: v.location || null,
        });
      }
    }

    // ── 3. Get all entities for this project ──────────────────────────────────
    const { data: entities, error: entErr } = await supabase
      .from("narrative_units")
      .select("id, unit_key, unit_type, payload_json")
      .eq("project_id", projectId);

    if (entErr) throw new Error(`Failed to fetch entities: ${entErr.message}`);
    if (!entities || entities.length === 0) {
      return new Response(JSON.stringify({ ok: true, linked: 0, message: "No entities found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[entity-links] Found ${entities.length} entities`);

    // ── 4. Clear existing links for this project (idempotent) ─────────────────
    const { error: delErr } = await supabase
      .from("narrative_scene_entity_links")
      .delete()
      .eq("project_id", projectId);

    if (delErr) {
      console.warn("[entity-links] Warning: could not delete existing links:", delErr.message);
      // Continue anyway - we'll upsert
    }

    // ── 5. Match entities to scenes and create links ─────────────────────────
    const now = new Date().toISOString();
    const links: Array<{
      project_id: string;
      scene_id: string;
      entity_id: string;
      relation_type: string;
      confidence: string;
      source_version_id: string | null;
      created_at: string;
      updated_at: string;
    }> = [];

    for (const scene of scenes) {
      const version = versionMap.get(scene.id);
      if (!version) continue;

      const sceneContent = version.content;
      const sceneLocation = version.location;

      for (const entity of entities) {
        const entityName = entity.payload_json?.name || entity.unit_key;
        const appears = entityAppearsInScene(
          entityName,
          entity.unit_type,
          sceneContent,
          sceneLocation
        );

        if (appears) {
          let relationType: string;
          switch (entity.unit_type) {
            case "character":
              relationType = "character_present";
              break;
            case "location":
              relationType = "location_present";
              break;
            case "prop":
              relationType = "prop_present";
              break;
            case "wardrobe":
              relationType = "entity_mentioned"; // wardrobe is mentioned, not present
              break;
            default:
              relationType = "entity_mentioned";
          }

          links.push({
            project_id: projectId,
            scene_id: scene.id,
            entity_id: entity.id,
            relation_type: relationType,
            confidence: "deterministic",
            source_version_id: version.id,
            created_at: now,
            updated_at: now,
          });
        }
      }
    }

    console.log(`[entity-links] Created ${links.length} entity-scene links`);

    if (links.length === 0) {
      return new Response(JSON.stringify({ ok: true, linked: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 6. Insert links ────────────────────────────────────────────────────────
    const { error: insertErr } = await supabase
      .from("narrative_scene_entity_links")
      .insert(links);

    if (insertErr) {
      console.error("[entity-links] Insert error:", insertErr);
      throw new Error(`Failed to insert links: ${insertErr.message}`);
    }

    // ── 7. Summary ────────────────────────────────────────────────────────────
    const characterLinks = links.filter((l) => l.relation_type === "character_present").length;
    const locationLinks = links.filter((l) => l.relation_type === "location_present").length;
    const propLinks = links.filter((l) => l.relation_type === "prop_present").length;
    const otherLinks = links.length - characterLinks - locationLinks - propLinks;

    return new Response(
      JSON.stringify({
        ok: true,
        linked: links.length,
        byType: {
          character_present: characterLinks,
          location_present: locationLinks,
          prop_present: propLinks,
          entity_mentioned: otherLinks,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[entity-links] Error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
