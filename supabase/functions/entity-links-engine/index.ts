/**
 * entity-links-engine
 *
 * Links narrative units (entities) to scenes by analyzing scene content
 * and writing to narrative_scene_entity_links.
 *
 * DB Schema:
 * - narrative_scene_entity_links.entity_id → narrative_units(id)
 * - confidence must be 'deterministic' or 'inferred'
 * - relation_type must be one of: character_present, arc_carrier, conflict_arena,
 *   entity_mentioned, prop_present, location_present
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { projectId } = await req.json();
    if (!projectId) throw new Error("projectId required");

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Step 1: Get all entity-type units from narrative_units ─────────────────
    const { data: entities, error: entityError } = await adminClient
      .from("narrative_units")
      .select("id, unit_key, unit_type, payload_json")
      .eq("project_id", projectId)
      .in("unit_type", ["character", "location", "prop", "arc", "conflict"]);

    if (entityError) throw new Error(`Failed to fetch entities: ${entityError.message}`);
    if (!entities || entities.length === 0) {
      return new Response(JSON.stringify({ ok: true, linked: 0, byType: {}, message: "No entities found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 2: Get all scenes with latest versions ───────────────────────────
    const { data: scenes, error: scenesError } = await adminClient
      .from("scene_graph_scenes")
      .select("id, scene_key, scene_kind")
      .eq("project_id", projectId)
      .is("deprecated_at", null);

    if (scenesError) throw new Error(`Failed to fetch scenes: ${scenesError.message}`);
    if (!scenes || scenes.length === 0) {
      return new Response(JSON.stringify({ ok: true, linked: 0, byType: {}, message: "No scenes found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sceneIds = scenes.map((s: any) => s.id);

    // Get latest version for each scene
    const { data: versions, error: versionsError } = await adminClient
      .from("scene_graph_versions")
      .select("id, scene_id, content, characters_present, location, slugline")
      .in("scene_id", sceneIds)
      .order("version_number", { ascending: false });

    if (versionsError) throw new Error(`Failed to fetch scene versions: ${versionsError.message}`);

    // Index versions by scene_id (latest only)
    const latestVersionByScene = new Map();
    for (const v of versions ?? []) {
      if (!latestVersionByScene.has(v.scene_id)) {
        latestVersionByScene.set(v.scene_id, v);
      }
    }

    // ── Step 3: Match entities to scenes ──────────────────────────────────────
    interface Link {
      scene_id: string;
      entity_id: string;
      relation_type: string;
    }

    const linksToInsert: Link[] = [];
    const seen = new Set();

    for (const scene of scenes) {
      const version = latestVersionByScene.get(scene.id);
      if (!version) continue;

      const content = (version.content || "").toLowerCase();
      const charactersPresent: string[] = version.characters_present || [];
      const slugline = (version.slugline || "").toLowerCase();
      const location = (version.location || "").toLowerCase();
      const sceneText = `${slugline} ${location} ${content}`;

      for (const entity of entities) {
        const unitKey = entity.unit_key.toLowerCase();
        // payload_json.name contains the entity name (e.g. "SOPHIA HOLMES")
        const payload = entity.payload_json || {};
        // Fall back to stripping type prefix from unit_key
        const rawName = (payload.name || unitKey.replace(/^(char|loc|prop|arc|conflict)_/i, "").replace(/_/g, " ")).toLowerCase();
        // Extract first name for flexible matching
        const nameParts = rawName.split(/\s+/).filter((p: string) => p.length > 2);
        const firstName = nameParts[0] || "";

        let relationType = "entity_mentioned";
        if (entity.unit_type === "character") {
          const charMatch = charactersPresent.some((cp: string) => {
            const cpLower = cp.toLowerCase();
            return cpLower.includes(rawName) || cpLower.includes(firstName) || cpLower.includes(unitKey.replace(/^char_/, ""));
          });
          // Match on first name appearing in scene text too
          if (charMatch || sceneText.includes(rawName) || (firstName && sceneText.includes(firstName))) {
            relationType = "character_present";
          }
        } else if (entity.unit_type === "location") {
          const locMatch = unitKey.replace(/^loc_/, "").replace(/_/g, " ");
          if (sceneText.includes(rawName) || sceneText.includes(locMatch)) {
            relationType = "location_present";
          }
        } else if (entity.unit_type === "prop") {
          const propMatch = unitKey.replace(/^prop_/, "").replace(/_/g, " ");
          if (sceneText.includes(rawName) || sceneText.includes(propMatch)) {
            relationType = "prop_present";
          }
        }

        // Only add if there's a match
        const isMentioned = sceneText.includes(rawName) || (firstName && sceneText.includes(firstName));
        if (!isMentioned && relationType === "entity_mentioned") continue;

        if (entity.unit_type === "character" && relationType === "entity_mentioned") {
          const charMatch = charactersPresent.some((cp: string) => {
            const cpLower = cp.toLowerCase();
            return cpLower.includes(rawName) || cpLower.includes(firstName) || cpLower.includes(unitKey.replace(/^char_/, ""));
          });
          if (!charMatch) continue;
          relationType = "character_present";
        }

        const uniq = `${scene.id}::${entity.id}::${relationType}`;
        if (seen.has(uniq)) continue;
        seen.add(uniq);

        linksToInsert.push({
          scene_id: scene.id,
          entity_id: entity.id,
          relation_type: relationType,
        });
      }
    }

    // ── Step 4: Clear old links and insert new ones ───────────────────────────
    await adminClient
      .from("narrative_scene_entity_links")
      .delete()
      .eq("project_id", projectId);

    if (linksToInsert.length > 0) {
      const { error: insertError } = await adminClient
        .from("narrative_scene_entity_links")
        .insert(linksToInsert.map((l) => ({
          project_id: projectId,
          scene_id: l.scene_id,
          entity_id: l.entity_id,
          relation_type: l.relation_type,
          confidence: "deterministic",
          source_version_id: latestVersionByScene.get(l.scene_id)?.id || null,
        })));

      if (insertError) {
        throw new Error(`Failed to insert links: ${insertError.message}`);
      }
    }

    // Tally by type
    const byType: Record<string, number> = {};
    for (const l of linksToInsert) {
      byType[l.relation_type] = (byType[l.relation_type] || 0) + 1;
    }

    return new Response(
      JSON.stringify({ ok: true, linked: linksToInsert.length, byType }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
