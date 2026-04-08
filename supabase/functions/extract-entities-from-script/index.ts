/**
 * extract-entities-from-script
 *
 * Extracts characters and locations directly from the script text stored in
 * scene_graph_versions and populates:
 *   - narrative_units (character, location entities)
 *   - narrative_scene_entity_links (entity-to-scene links)
 *
 * Character source: character_bible document (authoritative) + fallback to script parsing
 * Location source: sluglines from scene_graph_versions
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
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

    // ── Step 1: Get all scenes with their latest versions ─────────────────────
    const { data: scenes, error: scenesError } = await adminClient
      .from("scene_graph_scenes")
      .select("id, scene_key, scene_kind")
      .eq("project_id", projectId)
      .is("deprecated_at", null);

    if (scenesError) throw new Error(`Failed to fetch scenes: ${scenesError.message}`);
    if (!scenes || scenes.length === 0) {
      return new Response(JSON.stringify({ ok: true, characters: 0, locations: 0, links: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sceneIds = scenes.map((s: any) => s.id);

    const { data: versions } = await adminClient
      .from("scene_graph_versions")
      .select("id, scene_id, content, slugline, location")
      .in("scene_id", sceneIds)
      .order("version_number", { ascending: false });

    const latestVersionByScene = new Map<string, any>();
    for (const v of versions ?? []) {
      if (!latestVersionByScene.has(v.scene_id)) {
        latestVersionByScene.set(v.scene_id, v);
      }
    }

    // Aggregate script text (latest versions only)
    const allScriptText = (versions ?? [])
      .filter(v => latestVersionByScene.get(v.scene_id)?.id === v.id)
      .map(v => (v.content || "").replace(/--- PAGE BREAK ---/g, "\n"))
      .join("\n");

    // ── Step 2: Get known character names from character_bible document ─────────────
    const { data: charBibleDoc } = await adminClient
      .from("project_documents")
      .select("latest_version_id")
      .eq("project_id", projectId)
      .eq("doc_type", "character_bible")
      .maybeSingle();

    let knownCharacters: string[] = [];
    if (charBibleDoc?.latest_version_id) {
      const { data: ver } = await adminClient
        .from("project_document_versions")
        .select("plaintext")
        .eq("id", charBibleDoc.latest_version_id)
        .maybeSingle();

      if (ver?.plaintext) {
        try {
          const parsed = JSON.parse(ver.plaintext);
          knownCharacters = (parsed.characters || []).map((c: any) => c.name as string);
        } catch (_) {}
      }
    }

    // ── Step 3: Extract characters ───────────────────────────────────────────────
    // For each known character, find all their name variants in the script
    const NON_CHAR_WORDS = new Set([
      "INT", "EXT", "DAY", "NIGHT", "MORNING", "EVENING", "DAWN", "DUSK",
      "CUT", "FADE", "SMASH", "MATCH", "DISSOLVE", "PAGE", "BREAK",
      "THE", "AND", "BUT", "FOR", "WITH", "FROM", "INTO", "INNER", "OUTER",
      "HIS", "HER", "THEY", "THEM", "WHAT", "WHEN", "WERE", "WHERE",
      "CONT", "CONTINUED", "OUT", "BACK", "OVER", "MORE", "THAN",
      "UPPER", "LOWER", "SOLDIER", "GUNFIRE", "ROCKET", "RIFLE", "SIREN",
      "HORN", "WATER", "STONE", "STONES", "ROCK", "ROCKS", "DUST",
      "SMOKE", "FIRE", "FIRES", "BLAST", "FLASH", "BLOOD",
      "PLATEAU", "UNDERGROUND", "MOUNTAIN", "VILLAGE", "CAVE", "RUINS",
      "KINGDOM", "LEDGE", "TREETOPS", "AIRSTRIP", "ALLEY", "COMPOUND",
      "WAREHOUSE", "COURTYARD", "HUT", "WOODS", "WOODLANDS", "NEPAL",
      "DESERT", "LAKE", "HORSE", "TRUCK", "JEEP", "PLANE", "BOAT",
      "BCE", "CE", "HISS", "SAME", "SIR", "MAAM", "LADY", "SIR.",
      "V.O.", "O.S.", "O.C.", "CONT'D",
    ]);

    // Build searchable name variants for each known character
    interface CharEntity {
      canonicalName: string;
      searchTerms: string[]; // all uppercase variations to search for
      unitKey: string;
    }

    const charEntities: CharEntity[] = [];

    for (const name of knownCharacters) {
      const upper = name.toUpperCase();
      const parts = upper.split(/\s+/);
      const unitKeyBase = upper.replace(/[^A-Z0-9]+/g, "_").toLowerCase();

      const searchTerms: string[] = [upper]; // Full name

      if (parts.length > 1) {
        // Add last name / surname
        searchTerms.push(parts[parts.length - 1]);
        // Add nickname in quotes e.g. "JOCK" from "Fergus 'Jock' Walker"
        const nicknameMatch = name.match(/'([^']+)'/);
        if (nicknameMatch) searchTerms.push(nicknameMatch[1].toUpperCase());
        // Add initials: "F.J.WALKER"
        if (parts.length >= 3) {
          searchTerms.push(parts.map(p => p[0]).join("."));
        }
      }

      charEntities.push({
        canonicalName: name,
        searchTerms,
        unitKey: `char_${unitKeyBase}`.replace(/^char_/, ""),
      });
    }

    // Count occurrences of each search term in the script
    const termCounts = new Map<string, number>();
    for (const term of new Set(charEntities.flatMap(c => c.searchTerms))) {
      const regex = new RegExp(`\\b${term.replace(/[^A-Z0-9]/g, "\\W*")}\\b`, "i");
      const matches = allScriptText.match(regex);
      termCounts.set(term, matches ? matches.length : 0);
    }

    // For each character, pick the best (most frequent) search term as their identifier
    const usedTerms = new Set<string>();
    const charNamesToUse = new Map<string, { canonicalName: string; unitKey: string }>();

    for (const char of charEntities) {
      // Find the search term with highest count that hasn't been used
      const best = char.searchTerms
        .filter(t => !usedTerms.has(t))
        .sort((a, b) => (termCounts.get(b) || 0) - (termCounts.get(a) || 0))[0];

      if (best && termCounts.get(best)! >= 1) {
        usedTerms.add(best);
        charNamesToUse.set(char.canonicalName, {
          canonicalName: char.canonicalName,
          unitKey: char.unitKey,
        });
      }
    }

    // ── Step 4: Extract locations from sluglines ──────────────────────────────
    const locationSet = new Map<string, number>();
    for (const scene of scenes) {
      const ver = latestVersionByScene.get(scene.id);
      if (!ver) continue;
      const slugline = ver.slugline || "";
      const locField = ver.location || "";

      // Extract from slugline: "EXT. DESERT ROAD. NIGHT" → "DESERT ROAD"
      const m = slugline.match(/(?:INT\.|EXT\.)\s*(.+?)\s*[.,\-]/i);
      if (m) {
        const loc = m[1].trim().replace(/\s+/g, " ").toUpperCase();
        if (loc.length > 2 && !/^(INT|EXT|DAY|NIGHT|MORNING|EVENING|DAWN|DUSK)/i.test(loc)) {
          locationSet.set(loc, (locationSet.get(loc) || 0) + 1);
        }
      }

      if (locField && locField.trim()) {
        const cleanLoc = locField.replace(/^(INT\.|EXT\.)/i, "").trim().replace(/\s+/g, " ").toUpperCase();
        if (cleanLoc.length > 2) {
          locationSet.set(cleanLoc, (locationSet.get(cleanLoc) || 0) + 1);
        }
      }
    }

    const locationsToUse = Array.from(locationSet.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    // ── Step 5: Delete old and insert fresh entities ──────────────────────────
    await adminClient
      .from("narrative_units")
      .delete()
      .eq("project_id", projectId)
      .in("unit_type", ["character", "location", "prop", "wardrobe"]);

    const entityRows: any[] = [];

    for (const { canonicalName, unitKey } of charNamesToUse.values()) {
      entityRows.push({
        unit_key: unitKey,
        unit_type: "character",
        payload_json: { name: canonicalName, source: "character_bible" },
      });
    }

    for (const locName of locationsToUse) {
      const unitKey = "loc_" + locName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (!unitKey || unitKey === "loc_") continue;
      entityRows.push({
        unit_key: unitKey,
        unit_type: "location",
        payload_json: { name: locName, source: "script_slugline" },
      });
    }

    if (entityRows.length > 0) {
      const seenKeys = new Set<string>();
      const uniqueRows = entityRows.filter(r => {
        if (seenKeys.has(r.unit_key)) return false;
        seenKeys.add(r.unit_key);
        return true;
      });

      const { error: insertError } = await adminClient
        .from("narrative_units")
        .insert(uniqueRows.map(r => ({
          project_id: projectId,
          ...r,
          source_doc_type: "script",
          confidence: 1.0,
          extraction_method: "bible_plus_script",
          status: "active",
        })));

      if (insertError) throw new Error(`Failed to insert entities: ${insertError.message}`);
    }

    // ── Step 6: Reload to get IDs, then create entity links ──────────────────
    const { data: newEntities } = await adminClient
      .from("narrative_units")
      .select("id, unit_key, unit_type, payload_json")
      .eq("project_id", projectId)
      .in("unit_type", ["character", "location"]);

    const entityByKey = new Map<string, any>();
    for (const e of newEntities ?? []) {
      entityByKey.set(e.unit_key, e);
    }

    await adminClient
      .from("narrative_scene_entity_links")
      .delete()
      .eq("project_id", projectId);

    const linkRows: any[] = [];
    const seenLink = new Set<string>();

    for (const scene of scenes) {
      const ver = latestVersionByScene.get(scene.id);
      if (!ver) continue;

      const content = (ver.content || "").toLowerCase();
      const slugline = (ver.slugline || "").toLowerCase();
      const locField = (ver.location || "").toLowerCase();
      const sceneText = `${slugline} ${locField} ${content}`;

      for (const [, entity] of entityByKey) {
        const char = entity.payload_json?.name || "";
        const charUpper = char.toUpperCase();

        if (entity.unit_type === "character") {
          // For characters, try all their name variants
          let found = false;
          const charEntry = charEntities.find(ce => ce.canonicalName === char);
          const termsToCheck = charEntry?.searchTerms || [charUpper];

          for (const term of termsToCheck) {
            if (sceneText.includes(term.toLowerCase())) {
              found = true;
              break;
            }
          }

          if (found) {
            const key = `${scene.id}::${entity.id}::character_present`;
            if (!seenLink.has(key)) {
              seenLink.add(key);
              linkRows.push({
                project_id: projectId,
                scene_id: scene.id,
                entity_id: entity.id,
                relation_type: "character_present",
                confidence: "deterministic",
              });
            }
          }
        } else if (entity.unit_type === "location") {
          const locName = entity.payload_json?.name?.toUpperCase() || "";
          const slugUpper = (ver.slugline || "").toUpperCase();
          const locUpper = (ver.location || "").toUpperCase();
          if (slugUpper.includes(locName) || locUpper.includes(locName)) {
            const key = `${scene.id}::${entity.id}::location_present`;
            if (!seenLink.has(key)) {
              seenLink.add(key);
              linkRows.push({
                project_id: projectId,
                scene_id: scene.id,
                entity_id: entity.id,
                relation_type: "location_present",
                confidence: "deterministic",
              });
            }
          }
        }
      }
    }

    if (linkRows.length > 0) {
      const { error: linkError } = await adminClient
        .from("narrative_scene_entity_links")
        .insert(linkRows);
      if (linkError) throw new Error(`Failed to insert links: ${linkError.message}`);
    }

    return new Response(JSON.stringify({
      ok: true,
      characters: charNamesToUse.size,
      locations: locationsToUse.length,
      links: linkRows.length,
      characterList: Array.from(charNamesToUse.values()).map(v => v.canonicalName),
      locationList: locationsToUse.slice(0, 30),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
