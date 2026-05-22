/**
 * canonicalize-scene-substrate
 *
 * Phase 1 — Canonicalize Scene Substrate (Constitution Article 1)
 *
 * Reads a project's feature_script, extracts scenes via dev-engine-v2's
 * scene_graph_extract action (which has sophisticated slugline parsing),
 * then enriches the result with act assignments and provenance data.
 *
 * Deterministic + idempotent. Safe to re-run.
 *
 * Handles the critical edge case: scene_graph_extract only searches for
 * "script", "script_pdf", or "treatment" doc types by default. This function
 * always passes the explicit feature_script document/version IDs so the
 * actual script content is always used.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── ACT BOUNDARIES (heuristic — standard feature film page distribution) ───
function assignAct(sceneIndex: number, totalScenes: number): number {
  const pct = sceneIndex / totalScenes;
  if (pct < 0.22) return 1;
  if (pct < 0.50) return 2;
  if (pct < 0.78) return 3;
  return 4;
}

// ─── HANDLER ─────────────────────────────────────────────────────────────────
serve(async (req) => {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId") || "";

  if (!projectId) {
    return new Response(JSON.stringify({ error: "projectId required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Get the feature_script doc and its current version
    const { data: featureDocs } = await sb
      .from("project_documents")
      .select("id")
      .eq("project_id", projectId)
      .eq("doc_type", "feature_script")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!featureDocs || featureDocs.length === 0) {
      return new Response(JSON.stringify({ error: "No feature_script document found for this project" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docId = featureDocs[0].id;

    const { data: vers } = await sb
      .from("project_document_versions")
      .select("id")
      .eq("document_id", docId)
      .eq("is_current", true)
      .order("version_number", { ascending: false })
      .limit(1);

    if (!vers || vers.length === 0) {
      return new Response(JSON.stringify({ error: "Feature script has no current version" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const versionId = vers[0].id;

    // 2. Call dev-engine-v2 scene_graph_extract with explicit source doc/version IDs
    // This handles all slugline parsing: INT./EXT. with various formats,
    // orphaned scene numbers, bare sluglines, page breaks, etc.
    console.log(`[canonicalize-scene-substrate] Calling scene_graph_extract for ${projectId} (doc=${docId}, ver=${versionId})`);

    const extractResp = await fetch(`${SUPABASE_URL}/functions/v1/dev-engine-v2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        action: "scene_graph_extract",
        projectId,
        sourceDocumentId: docId,
        sourceVersionId: versionId,
        force: true,
      }),
    });

    if (!extractResp.ok) {
      const errText = await extractResp.text();
      throw new Error(`scene_graph_extract failed (${extractResp.status}): ${errText.slice(0, 400)}`);
    }

    const extractResult = await extractResp.json();

    if (!extractResult.scenes || !Array.isArray(extractResult.scenes)) {
      throw new Error("scene_graph_extract returned no scenes array");
    }

    const scenes = extractResult.scenes;
    console.log(`[canonicalize-scene-substrate] Extracted ${scenes.length} scenes for "${extractResult.project_title || projectId}"`);

    // 3. Enrich each scene: assign act, write provenance
    const totalScenes = scenes.length;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneNumber = i + 1;
      const act = assignAct(i, totalScenes);

      // Update scene_graph_order with act assignment
      await sb
        .from("scene_graph_order")
        .update({ act })
        .eq("project_id", projectId)
        .eq("scene_id", scene.scene_id);

      // Write provenance to scene_graph_scenes
      await sb
        .from("scene_graph_scenes")
        .update({
          provenance: {
            source_version_id: versionId,
            source_doc_type: "feature_script",
            scene_number: sceneNumber,
            act,
            canonicalized_at: new Date().toISOString(),
            canonicalization_pass: "v1",
          },
        })
        .eq("id", scene.scene_id);
    }

    // 4. Return summary
    const actDistribution = [1, 2, 3, 4].map((a) => ({
      act: a,
      scene_count: scenes.filter((_: any, i: number) => assignAct(i, totalScenes) === a).length,
    }));

    return new Response(
      JSON.stringify({
        ok: true,
        project_id: projectId,
        source_version_id: versionId,
        scenes_canonicalized: totalScenes,
        act_distribution: actDistribution,
        first_scene: scenes[0]?.latest_version?.slugline || null,
        last_scene: scenes[scenes.length - 1]?.latest_version?.slugline || null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e: any) {
    console.error("[canonicalize-scene-substrate] error:", e.message);
    return new Response(
      JSON.stringify({ error: e.message || "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});