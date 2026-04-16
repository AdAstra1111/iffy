/**
 * character-agent-engine — Phase 4.1
 *
 * LLM-free context builder for character agents.
 * Reads the Phase 1-3 substrate and assembles a CharacterAgentOutput
 * for a given (characterId, sceneId) pair.
 *
 * Schema facts:
 *   narrative_scene_entity_links.scene_id → scene_graph_scenes.id
 *   scene_graph_scenes.scene_key → scene_enrichment.scene_key
 *   scene_enrichment.protagonist_emotional_state → JSONB { primary, valence, secondary }
 *   scene_enrichment.relationship_context → JSONB []
 *   scene_enrichment.thematic_tags → TEXT[]
 *   narrative_entities.meta_json.is_protagonist → protagonist flag
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Entity {
  id: string;
  entity_key: string;
  canonical_name: string;
  entity_type: string;
  scene_count: number;
  meta_json: Record<string, unknown> | null;
}

interface SceneLink {
  entity_id: string;
}

interface EntityRelation {
  source_entity_id: string;
  target_entity_id: string;
  relation_type: string;
  confidence: number;
}

interface SceneGraphScene {
  id: string;
  scene_key: string;
}

interface SceneEnrichment {
  scene_key: string;
  tension_level: number;
  emotional_arc_direction: string;
  protagonist_emotional_state: { primary: string; valence: number; secondary: string | null } | null;
  relationship_context: string[] | null;
  thematic_tags: string[] | null;
  narrative_beat: string | null;
}

interface CharacterAgentOutput {
  ok: true;
  characterId: string;
  sceneId: string;
  projectId: string;
  characterName: string;
  isProtagonist: boolean;
  emotionalState: string;
  emotionalArc: string;
  tensionLevel: number;
  relationshipContext: string;
  thematicTags: string[];
  alliesInScene: string[];
  antagonistsInScene: string[];
  neutralInScene: string[];
  protagonistId: string;
  protagonistName: string;
  emotionalBeat: string;
  sceneNumber: string | null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { projectId, characterId, sceneId } = await req.json();

    if (!projectId) throw new Error("projectId required");
    if (!characterId) throw new Error("characterId required");
    if (!sceneId) throw new Error("sceneId required");

    // ── 1. Verify scene exists and get scene_key ──────────────────────────────
    const { data: sceneData, error: sceneError } = await admin
      .from("scene_graph_scenes")
      .select("id, scene_key")
      .eq("id", sceneId)
      .eq("project_id", projectId)
      .single();

    if (sceneError || !sceneData) {
      throw new Error(`Scene ${sceneId} not found in project ${projectId}`);
    }

    const scene = sceneData as SceneGraphScene;

    // ── 2. Fetch the character ───────────────────────────────────────────────
    const { data: character, error: charError } = await admin
      .from("narrative_entities")
      .select("*")
      .eq("id", characterId)
      .eq("project_id", projectId)
      .single();

    if (charError || !character) {
      throw new Error(`Character ${characterId} not found in project ${projectId}`);
    }

    const char = character as Entity;
    const isProtagonist = char.meta_json?.is_protagonist === true;

    // ── 3. Verify character is in this scene ────────────────────────────────
    const { data: sceneLinkRows } = await admin
      .from("narrative_scene_entity_links")
      .select("entity_id")
      .eq("scene_id", sceneId)
      .eq("project_id", projectId)
      .eq("relation_type", "character_present")
      .eq("entity_id", characterId)
      .limit(1);

    if (!sceneLinkRows || sceneLinkRows.length === 0) {
      return new Response(JSON.stringify({
        ok: false,
        error: "character_not_in_scene",
        message: `Character ${characterId} (${char.canonical_name}) is not present in scene ${sceneId} (${scene.scene_key})`,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Fetch scene enrichment via scene_key ─────────────────────────────
    const { data: enrichmentRows } = await admin
      .from("scene_enrichment")
      .select("*")
      .eq("scene_key", scene.scene_key)
      .eq("project_id", projectId)
      .eq("is_current", true)
      .limit(1);

    const enrichment: SceneEnrichment | null = (enrichmentRows && enrichmentRows.length > 0)
      ? (enrichmentRows[0] as SceneEnrichment)
      : null;

    // ── 5. Fetch all characters present in this scene ────────────────────────
    const { data: sceneLinks } = await admin
      .from("narrative_scene_entity_links")
      .select("entity_id")
      .eq("scene_id", sceneId)
      .eq("project_id", projectId)
      .eq("relation_type", "character_present");

    const presentEntityIds = [...new Set((sceneLinks || []).map((l: SceneLink) => l.entity_id))];

    const { data: presentChars } = await admin
      .from("narrative_entities")
      .select("id, canonical_name, meta_json, scene_count")
      .in("id", presentEntityIds);

    const allChars = (presentChars || []) as Entity[];
    const charMap = new Map(allChars.map(c => [c.id, c]));

    // ── 6. Find protagonist ─────────────────────────────────────────────────
    let protagonistId = "";
    let protagonistName = "";
    for (const c of allChars) {
      if (c.meta_json?.is_protagonist === true) {
        protagonistId = c.id;
        protagonistName = c.canonical_name;
        break;
      }
    }
    // Fallback: most scenes
    if (!protagonistId) {
      let maxScenes = 0;
      for (const c of allChars) {
        if ((c.scene_count || 0) > maxScenes) {
          maxScenes = c.scene_count || 0;
          protagonistId = c.id;
          protagonistName = c.canonical_name;
        }
      }
    }

    // ── 7. Fetch semantic relations for present characters ───────────────────
    const { data: relations } = await admin
      .from("narrative_entity_relations")
      .select("*")
      .eq("project_id", projectId)
      .in("source_entity_id", presentEntityIds)
      .in("target_entity_id", presentEntityIds);

    const presentIds = new Set(presentEntityIds);
    const alliesInScene = new Set<string>();
    const antagonistsInScene = new Set<string>();

    for (const rel of (relations || []) as EntityRelation[]) {
      if (!presentIds.has(rel.source_entity_id) || !presentIds.has(rel.target_entity_id)) continue;
      if (rel.relation_type === "ally_of") {
        alliesInScene.add(rel.source_entity_id === characterId ? rel.target_entity_id : rel.source_entity_id);
      } else if (rel.relation_type === "antagonist_of") {
        antagonistsInScene.add(rel.source_entity_id === characterId ? rel.target_entity_id : rel.source_entity_id);
      }
    }

    // ── 8. Resolve protagonist emotional state from JSONB ───────────────────
    let emotionalState = "neutral";
    if (enrichment?.protagonist_emotional_state) {
      const s = enrichment.protagonist_emotional_state;
      emotionalState = s?.primary?.toLowerCase() || "neutral";
    }

    // ── 9. Build output ───────────────────────────────────────────────────────
    const resolveName = (id: string) => charMap.get(id)?.canonical_name || id;

    const output: CharacterAgentOutput = {
      ok: true,
      characterId,
      sceneId,
      projectId,
      characterName: char.canonical_name,
      isProtagonist,
      emotionalState,
      emotionalArc: enrichment?.emotional_arc_direction || "FLAT",
      tensionLevel: enrichment?.tension_level || 5,
      relationshipContext: (() => {
        const ctx = enrichment?.relationship_context;
        if (!ctx || !Array.isArray(ctx) || ctx.length === 0) return "SOLO";
        // Each entry is { character: string, role: string, relationship_type: string|null }
        // Extract character names; filter null/empty
        const names = ctx
          .map((e: unknown) => {
            if (typeof e === "string") return e;
            if (typeof e === "object" && e !== null && "character" in e) {
              const val = (e as Record<string, unknown>).character;
              return typeof val === "string" ? val : null;
            }
            return null;
          })
          .filter((n): n is string => n !== null && n.length > 0);
        return names.length > 0 ? names.join(", ") : "SOLO";
      })(),
      thematicTags: (enrichment?.thematic_tags as string[]) || [],
      alliesInScene: [...alliesInScene].map(resolveName),
      antagonistsInScene: [...antagonistsInScene].map(resolveName),
      neutralInScene: [...allChars
        .filter(c => c.id !== characterId && !alliesInScene.has(c.id) && !antagonistsInScene.has(c.id))
        .map(c => c.canonical_name)],
      protagonistId,
      protagonistName,
      emotionalBeat: enrichment?.narrative_beat || "",
      sceneNumber: scene.scene_key,
    };

    return new Response(JSON.stringify(output), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
