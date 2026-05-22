/**
 * canonicalize-scene-substrate
 *
 * Phase 1 — Canonicalize Scene Substrate (Constitution Article 1)
 *
 * Reads a project's script (feature_script, episode_script, or format-appropriate
 * script doc type), extracts scenes via dev-engine-v2's scene_graph_extract action,
 * then enriches the result with format-aware act assignments (via sceneGraphActAssigner)
 * and provenance data.
 *
 * Format-aware: reads project.assigned_lane + beat_sheet to determine act boundaries
 * rather than using the old hardcoded 4-act heuristic.
 *
 * Deterministic + idempotent. Safe to re-run.
 *
 * Handles the critical edge case: scene_graph_extract only searches for
 * "script", "script_pdf", or "treatment" doc types by default. This function
 * always passes the explicit script document/version IDs so the actual
 * script content is always used.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assignSceneActs } from "../_shared/sceneGraphActAssigner.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Script doc types, ordered by priority — the first one found with a current
// version is used. Covers all formats in the stage ladders.
const SCRIPT_DOC_TYPES = [
  "feature_script",
  "episode_script",
  "season_script",
  "pilot_script",
  "vertical_episode_beats",
];

// ─── HANDLER ─────────────────────────────────────────────────────────────────
serve(async (req) => {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId") || "";

  // Also accept projectId from POST body (used by the intake pipeline)
  let bodyProjectId = "";
  try {
    const body = await req.clone().json().catch(() => ({}));
    bodyProjectId = body.projectId || "";
  } catch {}

  const pid = projectId || bodyProjectId;

  if (!pid) {
    return new Response(JSON.stringify({ error: "projectId required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Fetch project's assigned_lane for format-aware act thresholds
    const { data: project } = await sb
      .from("projects")
      .select("assigned_lane")
      .eq("id", pid)
      .maybeSingle();

    const assignedLane = project?.assigned_lane || "unspecified";
    console.log(`[canonicalize-scene-substrate] Project ${pid}: lane=${assignedLane}`);

    // 2. Find the script document — try each script doc type in priority order
    let docId: string | null = null;
    let docType: string | null = null;
    let versionId: string | null = null;

    for (const st of SCRIPT_DOC_TYPES) {
      const { data: docs } = await sb
        .from("project_documents")
        .select("id")
        .eq("project_id", pid)
        .eq("doc_type", st)
        .order("created_at", { ascending: false })
        .limit(1);

      if (docs && docs.length > 0) {
        const candidateId = docs[0].id;
        // Check for a current version
        const { data: vers } = await sb
          .from("project_document_versions")
          .select("id")
          .eq("document_id", candidateId)
          .eq("is_current", true)
          .order("version_number", { ascending: false })
          .limit(1);

        if (vers && vers.length > 0) {
          docId = candidateId;
          docType = st;
          versionId = vers[0].id;
          console.log(`[canonicalize-scene-substrate] Found script: docType=${st}, docId=${candidateId}, versionId=${versionId}`);
          break;
        }
      }
    }

    if (!docId || !versionId) {
      return new Response(JSON.stringify({
        error: "No script document found for this project",
        checked_types: SCRIPT_DOC_TYPES,
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Try to load the beat_sheet for act-aware distribution
    let beatSheetText: string | null = null;
    try {
      const { data: beatDocs } = await sb
        .from("project_documents")
        .select("id")
        .eq("project_id", pid)
        .eq("doc_type", "beat_sheet")
        .order("created_at", { ascending: false })
        .limit(1);

      if (beatDocs && beatDocs.length > 0) {
        const { data: beatVer } = await sb
          .from("project_document_versions")
          .select("plaintext")
          .eq("document_id", beatDocs[0].id)
          .eq("is_current", true)
          .maybeSingle();

        if (beatVer?.plaintext) {
          beatSheetText = beatVer.plaintext;
          console.log(`[canonicalize-scene-substrate] Loaded beat sheet (${beatSheetText.length} chars)`);
        }
      }
    } catch (e) {
      console.warn("[canonicalize-scene-substrate] Beat sheet load failed (non-fatal):", e?.message);
    }

    // 4. Call dev-engine-v2 scene_graph_extract with explicit source doc/version IDs
    // This handles all slugline parsing: INT./EXT. with various formats,
    // orphaned scene numbers, bare sluglines, page breaks, etc.
    console.log(`[canonicalize-scene-substrate] Calling scene_graph_extract for ${pid} (doc=${docId}, ver=${versionId})`);

    const extractResp = await fetch(`${SUPABASE_URL}/functions/v1/dev-engine-v2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        action: "scene_graph_extract",
        projectId: pid,
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
    console.log(`[canonicalize-scene-substrate] Extracted ${scenes.length} scenes for "${extractResult.project_title || pid}"`);

    // 5. Assign acts using format-aware sceneGraphActAssigner
    const totalScenes = scenes.length;
    const actResult = assignSceneActs({
      totalScenes,
      assignedLane,
      beatSheetText,
    });

    console.log(`[canonicalize-scene-substrate] Act assignment: path=${actResult.path}, resolvedLane=${actResult.resolvedLane}`);

    // 6. Enrich each scene: assign act, write provenance
    // Use Promise.all for parallel DB updates — scene-level updates are independent
    // (was: sequential for-await loop, 166 round-trips for 83 scenes — perf regression)
    const enrichResults = await Promise.all(
      scenes.map(async (scene, i) => {
        const sceneNumber = i + 1;
        const { act } = actResult.assignments[i];

        // Update scene_graph_order with act assignment
        await sb
          .from("scene_graph_order")
          .update({ act })
          .eq("project_id", pid)
          .eq("scene_id", scene.scene_id);

        // Write provenance to scene_graph_scenes
        await sb
          .from("scene_graph_scenes")
          .update({
            provenance: {
              source_version_id: versionId,
              source_doc_type: docType,
              scene_number: sceneNumber,
              act,
              canonicalized_at: new Date().toISOString(),
              canonicalization_pass: "v2-format-aware",
              assignment_path: actResult.path,
              resolved_lane: actResult.resolvedLane,
            },
          })
          .eq("id", scene.scene_id);

        return { scene_id: scene.scene_id, act };
      }),
    );

    // 7. Build act distribution for response
    const actDistribution: Record<number, number> = {};
    for (const a of actResult.assignments) {
      actDistribution[a.act] = (actDistribution[a.act] || 0) + 1;
    }
    const actDistributionArr = Object.entries(actDistribution)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([act, count]) => ({ act: Number(act), scene_count: count }));

    return new Response(
      JSON.stringify({
        ok: true,
        project_id: pid,
        source_version_id: versionId,
        source_doc_type: docType,
        scenes_canonicalized: totalScenes,
        act_distribution: actDistributionArr,
        assignment_path: actResult.path,
        resolved_lane: actResult.resolvedLane,
        beats_found: actResult.beatsFound || 0,
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