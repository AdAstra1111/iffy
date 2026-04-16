// @ts-nocheck
/**
 * structure-atomiser — Phase 5
 *
 * Analyses the narrative architecture of the project.
 * Extracts act breaks, turning points, set pieces, and structural rhythm.
 *
 * Actions:
 *   extract      — create a single structure atom stub (structure is project-level)
 *   generate     — LLM-analyse beat sheet + story outline for structural analysis (background)
 *   status       — return all structure atoms for project
 *   reset_failed — reset failed/running atoms back to pending
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function makeAdminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function fetchBeatSheetAndOutline(admin: any, projectId: string) {
  const { data: docs } = await admin
    .from("project_documents")
    .select("id, document_type, current_version_id")
    .eq("project_id", projectId)
    .in("document_type", ["story_outline", "beat_sheet"]);

  const results: Record<string, string> = {};
  for (const doc of docs || []) {
    if (!doc.current_version_id) continue;
    const { data: version } = await admin
      .from("project_document_versions")
      .select("plaintext")
      .eq("id", doc.current_version_id)
      .single();
    results[doc.document_type] = version?.plaintext || "";
  }

  const { data: sceneCount } = await admin
    .from("scene_graph_versions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  return {
    storyOutline: results["story_outline"] || "",
    beatSheet: results["beat_sheet"] || "",
    sceneCount: sceneCount?.length || 0,
  };
}

async function handleExtract(projectId: string) {
  const admin = makeAdminClient();

  const { data: existing } = await admin
    .from("atoms").select("id")
    .eq("project_id", projectId).eq("atom_type", "structure");

  if (existing && existing.length > 0) {
    return { created: 0, message: "Structure atom already exists for this project" };
  }

  const { sceneCount } = await fetchBeatSheetAndOutline(admin, projectId);
  const now = new Date().toISOString();
  const { error } = await admin.from("atoms").insert({
    project_id: projectId,
    atom_type: "structure",
    entity_id: null,
    canonical_name: "Narrative Structure Analysis",
    priority: 50,
    confidence: 0,
    readiness_state: "stub",
    generation_status: "pending",
    attributes: {
      structureType: "",
      actCount: 0,
      actBreaks: [],
      pageCountEstimate: 0,
      sceneCountEstimate: 0,
      midpointLocation: "",
      act1Summary: "",
      act2Summary: "",
      act3Summary: "",
      turningPoints: [],
      midpointSignificance: "",
      structuralWeaknesses: [],
      setPieceCount: 0,
      pacingAssessment: "",
      structuralTags: [],
      narrativeEngineeringScore: 0,
      comparisonToParity: "",
      editoriallyCriticalPages: [],
      productionNotes: "",
      confidence: 0,
      readinessBadge: "foundation",
      generationStatus: "pending",
    },
    created_at: now,
    updated_at: now,
  });

  if (error) throw new Error(`Failed to insert structure atom: ${error.message}`);
  return { created: 1, sceneCount };
}

async function handleStatus(projectId: string) {
  const admin = makeAdminClient();
  const { data: atoms, error } = await admin
    .from("atoms").select("*").eq("project_id", projectId).eq("atom_type", "structure");
  if (error) throw new Error(`Failed to load structure atoms: ${error.message}`);
  return { atoms: atoms || [], count: atoms?.length || 0 };
}

async function handleResetFailed(projectId: string) {
  const admin = makeAdminClient();
  const { count, error } = await admin
    .from("atoms")
    .update({ generation_status: "pending", updated_at: new Date().toISOString() })
    .in("generation_status", ["failed", "running"])
    .eq("project_id", projectId).eq("atom_type", "structure")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Failed to reset: ${error.message}`);
  return { reset: count || 0 };
}

async function handleGenerate(projectId: string) {
  const admin = makeAdminClient();
  const { data: pendingAtoms, error: fetchErr } = await admin
    .from("atoms").select("id")
    .eq("project_id", projectId).eq("atom_type", "structure").eq("generation_status", "pending");
  if (fetchErr) throw new Error(`Failed to fetch: ${fetchErr.message}`);
  if (!pendingAtoms || pendingAtoms.length === 0) return { spawned: false, message: "No pending structure atoms" };

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  const { storyOutline, beatSheet, sceneCount } = await fetchBeatSheetAndOutline(admin, projectId);
  const atomIds = pendingAtoms.map((a: any) => a.id);
  await admin.from("atoms").update({ generation_status: "running", updated_at: new Date().toISOString() }).in("id", atomIds);

  // @ts-ignore
  EdgeRuntime.waitUntil(
    (async () => {
      for (const atom of pendingAtoms) {
        try {
          const prompt = `You are a narrative structure analyst. Analyse this film's story and beat sheet and generate a complete StructureAtomAttributes JSON object.

STORY OUTLINE:
${storyOutline.substring(0, 4000)}

BEAT SHEET:
${beatSheet.substring(0, 5000)}

Scene count: approximately ${sceneCount} scenes.

Output ONLY a valid JSON object (no markdown, no commentary) with ALL fields:
- structureType (string: three_act | five_act | hero_journey | mystery_structure | episodic)
- actCount (number: 3 | 4 | 5)
- actBreaks (array of 3-5 page/beat position strings, e.g. ["page_25", "page_55", "page_85"])
- pageCountEstimate (number)
- sceneCountEstimate (number)
- midpointLocation (string: e.g. "around page 55-60")
- act1Summary (string: 1-2 sentence description of act 1)
- act2Summary (string: 1-2 sentence description of act 2)
- act3Summary (string: 1-2 sentence description of act 3)
- turningPoints (array of 3-4 turning point descriptions)
- midpointSignificance (string: revelation | reversal | both)
- structuralWeaknesses (array of 2-4 structural weakness strings, or empty array if clean)
- setPieceCount (number: estimated major set pieces)
- pacingAssessment (string: even | front_loaded | back_loaded | mixed)
- structuralTags (array of 4-6 structural keyword strings)
- narrativeEngineeringScore (number: 1-10, how sound the structure is)
- comparisonToParity (string: how this compares to genre expectations)
- editoriallyCriticalPages (array of 2-4 page range strings for critical editorial moments)
- productionNotes (string: which acts need most shooting days)
- confidence (number 0.0-1.0)
- readinessBadge (string: "foundation" | "rich" | "verified")`;

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${openrouterKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://iffy-analysis.vercel.app", "X-Title": "IFFY Structure Atomiser" },
            body: JSON.stringify({ model: "minimax/minimax-m2.7", messages: [{ role: "user", content: prompt }], temperature: 0.7, max_tokens: 2000 }),
          });

          if (!response.ok) {
            await admin.from("atoms").update({ generation_status: "failed", updated_at: new Date().toISOString() }).eq("id", atom.id);
            continue;
          }

          const aiData = await response.json();
          let attrs: Record<string, any> = {};
          try {
            const cleaned = (aiData.choices?.[0]?.message?.content || "").replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
            attrs = JSON.parse(cleaned);
          } catch {
            await admin.from("atoms").update({ generation_status: "failed", updated_at: new Date().toISOString() }).eq("id", atom.id);
            continue;
          }

          const finalAttributes = { ...attrs, generationStatus: "completed" };
          await admin.from("atoms").update({
            generation_status: "complete", readiness_state: "generated",
            confidence: Math.round((attrs.confidence || 0.5) * 100),
            attributes: finalAttributes, updated_at: new Date().toISOString(),
          }).eq("id", atom.id);

          console.log(`✓ Generated structure atom`);
        } catch (err) {
          console.error(`Error for structure atom:`, err);
          await admin.from("atoms").update({ generation_status: "failed", updated_at: new Date().toISOString() }).eq("id", atom.id);
        }
      }
    })()
  );

  return { spawned: true, count: pendingAtoms.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { action, project_id: projectId } = body;
    if (!projectId) return new Response(JSON.stringify({ error: "Missing project_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!action) return new Response(JSON.stringify({ error: "Missing action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    let result: any;
    switch (action) {
      case "extract": result = await handleExtract(projectId); break;
      case "generate": result = await handleGenerate(projectId); break;
      case "status": result = await handleStatus(projectId); break;
      case "reset_failed": result = await handleResetFailed(projectId); break;
      default: return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("structure-atomiser error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
