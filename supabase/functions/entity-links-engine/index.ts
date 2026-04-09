/**
 * entity-links-engine
 *
 * Links narrative units (entities) to scenes by analyzing scene content
 * and writing to narrative_scene_entity_links.
 *
 * Self-contained: when narrative_units is empty, extracts entities inline
 * from scene_graph_versions.characters_present and sluglines — no cross-
 * function calls needed.
 *
 * DB Schema:
 * - narrative_scene_entity_links.entity_id → narrative_units(id)
 * - confidence must be 'deterministic' or 'inferred'
 * - relation_type: character_present | arc_carrier | conflict_arena |
 *   entity_mentioned | prop_present | location_present
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── inline entity extractor (mirrors text-extract-engine logic) ── */

const NOISE_WORDS = new Set([
  "SOUNDS","SOUND","RINGING","GUNSHOTS","GUNSHOT","EXPLOSIONS","EXPLOSION",
  "MUSIC","SONG","CHORD","HOWLING","SCREAMING","SHOUTING","CHEERING",
  "APPLAUSE","LAUGHTER","GROANING","MOANING","CRYING","WHISPERING",
  "BANGING","CRASHING","SPLASHING","HONKING","SIRENS","ALARMS",
  "BLASTING","THUNDER","RAIN","WIND","FOOTSTEPS","DOOR","DOORS",
  "VARIOUS","ANOTHER","CONTINUED","CONT","BACK","SHOT","ANGLE",
  "CLOSEUP","WIDE","PAN","TILT","ZOOM","REVERSE","INSERT",
  "FOREGROUND","BACKGROUND","MIDGROUND","FLASHBACK","FLASH","MONTAGE",
  "SEQUENCE","INTERCUT","TITLE","CAPTION","TEXT","SUPER",
  "STREETS","STREET","CITY","TOWN","ROAD","BRIDGE","ROOMS","ROOM",
  "FLOOR","FLOORS","WALL","WALLS","CEILING","WINDOW","WINDOWS",
  "BUILDING","BUILDINGS","OFFICE","OFFICES","HOUSE","HOMES",
  "RUNNING","WALKING","STANDING","SITTING","MOVING","LOOKING",
  "TURNING","COMING","GOING","LEANING","SLUMPING","RISING",
]);

function normalizeKey(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function isNoiseName(name: string): boolean {
  const words = name.split(/\s+/);
  return words.some(w => w.length > 2 && NOISE_WORDS.has(w));
}

function extractInline(projectId: string, scenes: any[], latestVersionByScene: Map<string, any>, adminClient: any): { charMap: Map<string, string>, locMap: Map<string, string> } {
  // charMap: canonical_name → unit_key  (for characters)
  // locMap: canonical_name → unit_key    (for locations)
  const charMap = new Map<string, string>();
  const locMap = new Map<string, string>();

  // Regex: ALL-CAPS name at start of line, 1-4 words, optional (O.S.)/(V.O.)
  const charPattern = /^([A-Z]{2,}(?:\s+[A-Z]{2,}){0,3}(?:\s*\([A-Z\.]+\))?)$/gm;

  for (const scene of scenes) {
    const version = latestVersionByScene.get(scene.id);
    if (!version) continue;

    // 1. characters_present array (populated by NIT sync — may be empty)
    const chars: string[] = version.characters_present || [];
    for (const charName of chars) {
      const clean = charName.trim();
      if (!clean || clean.length < 2) continue;
      if (isNoiseName(clean)) continue;
      const key = `char_${normalizeKey(clean)}`;
      if (!charMap.has(clean)) charMap.set(clean, key);
    }

    // 2. Scan scene content for ALL-CAPS character names
    const content = version.content || "";
    let match;
    charPattern.lastIndex = 0;
    while ((match = charPattern.exec(content)) !== null) {
      const name = match[1].trim();
      // Skip known non-character patterns
      if (/^(CONT'D|CONTINUED|THE END|FADE (IN|OUT)|CUT TO|DISSOLVE TO|MATCH CUT|SWISH PAN|SMASH CUT|PAGE|BOOKING|COPYRIGHT|DEMO|PRODUCED BY|WRITTEN BY|SCENE|INTRODUCING|RELEASE)/i.test(name)) continue;
      if (/^\d+$/.test(name)) continue;
      if (isNoiseName(name)) continue;
      const key = `char_${normalizeKey(name)}`;
      if (!charMap.has(name)) charMap.set(name, key);
    }

    // 3. Extract location from slugline
    const slugline = version.slugline || "";
    const locMatch = slugline.match(/^(?:INT\.|EXT\.|int\.|ext\.)\s+([^–-]+)/m);
    if (locMatch) {
      const loc = locMatch[1].trim().replace(/\s+/g, " ").toUpperCase();
      if (loc.length >= 3 && !["VARIOUS LOCATIONS","VARIOUS","CONTINUED","SAME","INT./EXT.","INT/EXT"].includes(loc)) {
        const key = `loc_${normalizeKey(loc)}`;
        if (!locMap.has(loc)) locMap.set(loc, key);
      }
    }
  }

  return { charMap, locMap };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { projectId } = await req.json();
    if (!projectId) throw new Error("projectId required");

    // ── Step 1: Get all entity-type units from narrative_units ─────────────────
    const { data: entities, error: entityError } = await adminClient
      .from("narrative_units")
      .select("id, unit_key, unit_type, payload_json")
      .eq("project_id", projectId)
      .in("unit_type", ["character", "location", "prop", "arc", "conflict", "wardrobe"]);

    if (entityError) throw new Error(`Failed to fetch entities: ${entityError.message}`);

    let entityRecords = entities || [];

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

    const { data: versions, error: versionsError } = await adminClient
      .from("scene_graph_versions")
      .select("id, scene_id, content, characters_present, location, slugline")
      .in("scene_id", sceneIds)
      .order("version_number", { ascending: false });

    if (versionsError) throw new Error(`Failed to fetch scene versions: ${versionsError.message}`);

    const latestVersionByScene = new Map();
    for (const v of versions ?? []) {
      if (!latestVersionByScene.has(v.scene_id)) {
        latestVersionByScene.set(v.scene_id, v);
      }
    }

    // ── Step 3: If narrative_units is empty, extract inline ─────────────────
    if (entityRecords.length === 0) {
      const { charMap, locMap } = extractInline(projectId, scenes, latestVersionByScene, adminClient);

      const toUpsert: any[] = [];

      for (const [name, unitKey] of charMap) {
        toUpsert.push({
          project_id: projectId,
          unit_key: unitKey,
          unit_type: "character",
          payload_json: { name, source: "inline_extract" },
          source_doc_type: "screenplay",
        });
      }
      for (const [name, unitKey] of locMap) {
        toUpsert.push({
          project_id: projectId,
          unit_key: unitKey,
          unit_type: "location",
          payload_json: { name, source: "inline_extract" },
          source_doc_type: "screenplay",
        });
      }

      if (toUpsert.length > 0) {
        const { error: upsertErr } = await adminClient
          .from("narrative_units")
          .upsert(toUpsert, { onConflict: "project_id,unit_type,unit_key" });
        if (upsertErr) throw new Error(`Inline entity upsert failed: ${upsertErr.message}`);
      }

      // Re-fetch entities after inline extraction
      const { data: reEntities } = await adminClient
        .from("narrative_units")
        .select("id, unit_key, unit_type, payload_json")
        .eq("project_id", projectId)
        .in("unit_type", ["character", "location", "prop", "arc", "conflict", "wardrobe"]);

      entityRecords = reEntities || [];
    }

    if (entityRecords.length === 0) {
      return new Response(JSON.stringify({ ok: true, linked: 0, byType: {}, message: "No entities to link" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 4: Match entities to scenes ──────────────────────────────────────
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

      for (const entity of entityRecords) {
        const unitKey = entity.unit_key.toLowerCase();
        const payload = entity.payload_json || {};
        const rawName = (payload.name || unitKey.replace(/^(char|loc|prop|arc|conflict)_/i, "").replace(/_/g, " ")).toLowerCase();
        const nameParts = rawName.split(/\s+/).filter((p: string) => p.length > 2);
        const firstName = nameParts[0] || "";

        let relationType = "entity_mentioned";
        if (entity.unit_type === "character") {
          const charMatch = charactersPresent.some((cp: string) => {
            const cpLower = cp.toLowerCase();
            return cpLower.includes(rawName) || cpLower.includes(firstName) ||
              cpLower.includes(unitKey.replace(/^char_/, ""));
          });
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

        const isMentioned = sceneText.includes(rawName) || (firstName && sceneText.includes(firstName));
        if (!isMentioned && relationType === "entity_mentioned") continue;

        if (entity.unit_type === "character" && relationType === "entity_mentioned") {
          const charMatch = charactersPresent.some((cp: string) => {
            const cpLower = cp.toLowerCase();
            return cpLower.includes(rawName) || cpLower.includes(firstName) ||
              cpLower.includes(unitKey.replace(/^char_/, ""));
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

    // ── Step 5: Clear old links and insert new ones ───────────────────────────
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
