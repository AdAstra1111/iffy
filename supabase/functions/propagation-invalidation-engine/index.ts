/**
 * propagation-invalidation-engine — Phase 4.3
 *
 * Called after scene-enrichment-engine or character-data changes.
 * Uses scene_graph_versions (current = superseded_at IS NULL).
 * Computes depends_on_resolver_hash from scene content + beats hashes.
 *
 * Input: {
 *   projectId: string,
 *   triggeredBy: 'scene-enrichment-engine' | 'character-bible-generator' | 'character-performance-generator',
 *   affectedEntityIds?: string[]  // scene IDs or character IDs
 * }
 *
 * Output: {
 *   ok: true,
 *   invalidated: string[],
 *   dispatched: string[],
 *   alreadyCurrent: string[]
 * }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface PropagationInput {
  projectId: string;
  triggeredBy:
    | "scene-enrichment-engine"
    | "character-bible-generator"
    | "character-performance-generator"
    | "dev-engine-rewrite";
  affectedEntityIds?: string[];
}

// ── Hash ─────────────────────────────────────────────────────────────────────

async function computeHash(str: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-1", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function computeCombinedHash(hashes: string[]): Promise<string> {
  const sorted = [...new Set(hashes)].sort();
  return computeHash(sorted.join("|"));
}

// ── Compute scene content hash for a set of scene IDs ─────────────────────────

async function computeSceneContentHash(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  sceneIds: string[],
): Promise<string> {
  if (sceneIds.length === 0) return "";

  const { data: sgRows } = await supabase
    .from("scene_graph_versions")
    .select("id, beats, summary, content")
    .eq("project_id", projectId)
    .in("scene_id", sceneIds)
    .is("superseded_at", null);

  const hashes = await Promise.all(
    (sgRows ?? []).map(async (sg: Record<string, unknown>) => {
      const content = String(sg.content ?? sg.summary ?? "");
      const beatsJson =
        Array.isArray(sg.beats)
          ? JSON.stringify(sg.beats)
          : "";
      return computeHash(
        (sg.id as string) + "|" + content.slice(0, 200) + "|" + beatsJson,
      );
    }),
  );

  hashes.sort();
  return hashes.join("|");
}

// ── Dispatch bible build ─────────────────────────────────────────────────────

async function dispatchBuild(
  supabaseUrl: string,
  serviceKey: string,
  projectId: string,
  characterId: string,
): Promise<boolean> {
  try {
    const resp = await fetch(
      `${supabaseUrl}/functions/v1/character-performance-bible-builder`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          "x-supabase-client": "edge-functions",
        },
        body: JSON.stringify({ projectId, characterId }),
      },
    );
    return resp.ok;
  } catch {
    return false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const body: PropagationInput = await req.json();
    const { projectId, triggeredBy, affectedEntityIds } = body;

    if (!projectId || !triggeredBy) {
      return Response.json(
        { ok: false, error: "projectId and triggeredBy are required" },
        { status: 400 },
      );
    }

    const invalidated: string[] = [];
    const dispatched: string[] = [];
    const alreadyCurrent: string[] = [];

    // Determine affected characters
    let characterIds: string[] = [];

    if (
      triggeredBy === "scene-enrichment-engine" ||
      triggeredBy === "character-performance-generator"
    ) {
      // affectedEntityIds = scene IDs → get characters in those scenes
      const sceneIds = affectedEntityIds ?? [];
      if (sceneIds.length > 0) {
        const { data: links } = await supabaseClient
          .from("narrative_scene_entity_links")
          .select("entity_id")
          .eq("project_id", projectId)
          .in("scene_id", sceneIds);
        characterIds = [
          ...new Set((links ?? []).map((l: { entity_id: string }) => l.entity_id)),
        ];
      }
    } else if (triggeredBy === "character-bible-generator") {
      // affectedEntityIds = character IDs directly
      characterIds = affectedEntityIds ?? [];
    } else if (triggeredBy === "dev-engine-rewrite") {
      // After a concept_brief or idea rewrite, invalidate ALL character bibles in the project.
      // The full document rewrite could have introduced new characters or changed existing ones.
      const { data: allChars } = await supabaseClient
        .from("narrative_entities")
        .select("id")
        .eq("project_id", projectId)
        .eq("entity_type", "character");
      characterIds = (allChars ?? []).map((c: any) => c.id);
    }

    if (characterIds.length === 0) {
      return Response.json({ ok: true, invalidated: [], dispatched: [], alreadyCurrent: [] });
    }

    for (const characterId of characterIds) {
      // Get scene IDs for this character
      const { data: sceneLinks } = await supabaseClient
        .from("narrative_scene_entity_links")
        .select("scene_id")
        .eq("entity_id", characterId)
        .eq("project_id", projectId);

      const sceneIds = (sceneLinks ?? []).map(
        (l: { scene_id: string }) => l.scene_id,
      );

      // Compute current scene content hash
      const currentSceneHash = await computeSceneContentHash(
        supabaseClient,
        projectId,
        sceneIds,
      );

      // Fetch current bible
      const { data: currentBible } = await supabaseClient
        .from("character_performance_bibles")
        .select("id, depends_on_resolver_hash")
        .eq("project_id", projectId)
        .eq("character_id", characterId)
        .eq("is_current", true)
        .maybeSingle();

      if (!currentBible) {
        const ok = await dispatchBuild(supabaseUrl, serviceKey, projectId, characterId);
        if (ok) dispatched.push(characterId);
        continue;
      }

      const bibleHash = (currentBible as { depends_on_resolver_hash?: string })
        .depends_on_resolver_hash ?? "";

      if (currentSceneHash !== bibleHash) {
        await supabaseClient
          .from("character_performance_bibles")
          .update({
            is_current: false,
            invalidated_at: new Date().toISOString(),
          })
          .eq("id", (currentBible as { id: string }).id);

        invalidated.push((currentBible as { id: string }).id);

        const ok = await dispatchBuild(supabaseUrl, serviceKey, projectId, characterId);
        if (ok) dispatched.push(characterId);
      } else {
        alreadyCurrent.push(characterId);
      }
    }

    return Response.json({ ok: true, invalidated, dispatched, alreadyCurrent });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
