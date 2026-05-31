// @ts-nocheck
/**
 * structure-atomiser — Phase 5
 *
 * Analyses the narrative architecture of the project.
 * Extracts act breaks, turning points, set pieces, and structural rhythm.
 * For VD projects with a season_script, creates one atom per episode.
 *
 * Actions:
 *   extract      — create structure atom stub(s) (project-level or per-episode)
 *   generate     — LLM-analyse beat sheet + story outline for structural analysis (background)
 *   status       — return all structure atoms for project
 *   reset_failed — reset failed/running atoms back to pending
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recoverStaleRunning } from "../_shared/stale-running-recovery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function makeAdminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/**
 * Parse episode blocks from a season_script document formatted with
 * `## EPISODE N: Title` markers. Returns an ordered array of episodes.
 */
function parseEpisodes(seasonScript: string): { number: number; title: string; text: string }[] {
  const episodeRegex = /##\s*EPISODE\s+(\d+):\s*(.*?)(?:\n|$)/gi;
  const episodes: { number: number; title: string; text: string }[] = [];
  let match;
  let lastIndex = 0;
  let lastEp: { number: number; title: string; text: string } | null = null;

  while ((match = episodeRegex.exec(seasonScript)) !== null) {
    if (lastEp) {
      lastEp.text = seasonScript.substring(lastIndex, match.index).trim();
      episodes.push(lastEp);
    }
    lastEp = { number: parseInt(match[1], 10), title: match[2].trim(), text: "" };
    lastIndex = match.index;
  }
  if (lastEp) {
    lastEp.text = seasonScript.substring(lastIndex).trim();
    episodes.push(lastEp);
  }
  return episodes;
}

/**
 * Fetch project content needed for structure analysis.
 * For VD projects, episodeNumber can be specified to get that episode's text from season_script.
 */
async function fetchBeatSheetAndOutline(admin: any, projectId: string, episodeNumber?: number) {
  const { data: docs } = await admin
    .from("project_documents")
    .select("id, doc_type, latest_version_id")
    .eq("project_id", projectId)
    .in("doc_type", ["story_outline", "beat_sheet", "season_script"]);

  const results: Record<string, string> = {};
  let seasonScript = "";
  for (const doc of docs || []) {
    if (!doc.latest_version_id) continue;
    const { data: version } = await admin
      .from("project_document_versions")
      .select("plaintext")
      .eq("id", doc.latest_version_id)
      .single();
    const text = version?.plaintext || "";
    if (doc.doc_type === "season_script") {
      seasonScript = text;
    } else {
      results[doc.doc_type] = text;
    }
  }

  // If episode number is provided and season_script exists, extract that episode's text
  if (episodeNumber !== undefined && seasonScript) {
    const episodes = parseEpisodes(seasonScript);
    const ep = episodes.find((e) => e.number === episodeNumber);
    if (ep) {
      results["episode_script"] = ep.text;
    }
  }

  const { data: sceneCount } = await admin
    .from("scene_graph_versions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  return {
    storyOutline: results["story_outline"] || "",
    beatSheet: results["beat_sheet"] || "",
    seasonScript,
    episodeScript: results["episode_script"] || "",
    sceneCount: sceneCount?.length || 0,
  };
}

async function handleExtract(projectId: string) {
  const admin = makeAdminClient();

  // Check for season_script (VD path)
  const { data: ssDocs } = await admin
    .from("project_documents")
    .select("id, latest_version_id")
    .eq("project_id", projectId)
    .eq("doc_type", "season_script")
    .limit(1);

  let seasonScriptText = "";
  if (ssDocs && ssDocs.length > 0 && ssDocs[0].latest_version_id) {
    const { data: version } = await admin
      .from("project_document_versions")
      .select("plaintext")
      .eq("id", ssDocs[0].latest_version_id)
      .single();
    seasonScriptText = version?.plaintext || "";
  }

  // VD path: create one atom per episode
  if (seasonScriptText) {
    const episodes = parseEpisodes(seasonScriptText);
    if (episodes.length === 0) {
      return { created: 0, message: "Season script found but no episodes parsed" };
    }

    // Get existing episode atoms to avoid duplicates
    const { data: existing } = await admin
      .from("atoms").select("canonical_name")
      .eq("project_id", projectId).eq("atom_type", "structure");

    const existingNames = new Set((existing || []).map((a: any) => a.canonical_name));
    const now = new Date().toISOString();
    let created = 0;

    for (const ep of episodes) {
      const canonicalName = `Episode ${ep.number} Structure`;
      if (existingNames.has(canonicalName)) continue;

      const { error } = await admin.from("atoms").insert({
        project_id: projectId,
        atom_type: "structure",
        entity_id: null,
        canonical_name: canonicalName,
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

      if (error) {
        console.error(`Failed to insert structure atom for episode ${ep.number}: ${error.message}`);
        continue;
      }
      created++;
    }

    return { created, message: created > 0 ? `Created ${created} episode structure atoms` : "No new episode structure atoms needed" };
  }

  // Feature film path: create a single project-level structure atom
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
    console.log("[StaleRecovery] Recovered " + staleRecovery.recovered + " stale structure atoms on status check");
  }

async function handleResetFailed(projectId: string) {
  const admin = makeAdminClient();
  // P0.1: Auto-recover stale running atoms
  const staleRecovery = await recoverStaleRunning(admin, projectId, "structure").catch(() => ({ recovered: 0 }));
  if (staleRecovery.recovered > 0) {
    console.log("[StaleRecovery] Recovered " + staleRecovery.recovered + " stale structure atoms on status check");
  }

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
    .from("atoms").select("id, canonical_name")
    .eq("project_id", projectId).eq("atom_type", "structure").eq("generation_status", "pending");
  if (fetchErr) throw new Error(`Failed to fetch: ${fetchErr.message}`);
  if (!pendingAtoms || pendingAtoms.length === 0) return { spawned: false, message: "No pending structure atoms" };

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  const { storyOutline, beatSheet, seasonScript, episodeScript, sceneCount } = await fetchBeatSheetAndOutline(admin, projectId);
  const atomIds = pendingAtoms.map((a: any) => a.id);
  await admin.from("atoms").update({ generation_status: "running", updated_at: new Date().toISOString() }).in("id", atomIds);

  // @ts-ignore
  if (typeof EdgeRuntime !== "undefined") {
  EdgeRuntime.waitUntil(
    (async () => {
      for (const atom of pendingAtoms) {
        try {
          // Extract episode number from canonical_name (e.g. "Episode 3 Structure" -> 3)
          const epMatch = atom.canonical_name?.match(/^Episode\s+(\d+)/i);
          const episodeNumber = epMatch ? parseInt(epMatch[1], 10) : undefined;

          // If this is an episode atom, fetch episode-specific content
          let effectiveEpisodeScript = episodeScript;
          let effectiveBeatSheet = beatSheet;
          let effectiveStoryOutline = storyOutline;

          if (episodeNumber !== undefined && seasonScript) {
            const epContent = await fetchBeatSheetAndOutline(admin, projectId, episodeNumber);
            effectiveEpisodeScript = epContent.episodeScript;
            effectiveBeatSheet = epContent.beatSheet;
            effectiveStoryOutline = epContent.storyOutline;
          }

          let prompt: string;
          if (episodeNumber !== undefined) {
            prompt = `You are a narrative structure analyst. Analyse the narrative structure of Episode ${episodeNumber} of this vertical drama series and generate a complete StructureAtomAttributes JSON object.

EPISODE SCRIPT (Episode ${episodeNumber}):
${effectiveEpisodeScript.substring(0, 5000)}

Output ONLY a valid JSON object (no markdown, no commentary) with ALL fields:
- structureType (string: episodic | serialised | anthology | hybrid)
- actCount (number: number of story segments in this episode, typically 3-5)
- actBreaks (array: key turning point positions within the episode)
- midpointLocation (string: e.g. "around the middle of the episode")
- act1Summary (string: 1-2 sentence description of the opening segment)
- act2Summary (string: 1-2 sentence description of the middle segment)
- act3Summary (string: 1-2 sentence description of the closing segment)
- turningPoints (array of 2-3 turning point descriptions for this episode)
- midpointSignificance (string: revelation | reversal | cliffhanger)
- structuralWeaknesses (array of 1-3 structural weakness strings, or empty array if clean)
- setPieceCount (number: estimated major set pieces in this episode)
- pacingAssessment (string: even | front_loaded | back_loaded | mixed)
- structuralTags (array of 3-5 structural keyword strings for this episode)
- narrativeEngineeringScore (number: 1-10, how sound the episode structure is)
- comparisonToParity (string: how this episode compares to genre expectations)
- productionNotes (string: which segments need most shooting days)
- confidence (number 0.0-1.0)
- readinessBadge (string: "foundation" | "rich" | "verified")`;
          } else {
            prompt = `You are a narrative structure analyst. Analyse this film's story and beat sheet and generate a complete StructureAtomAttributes JSON object.

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
          }

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

          console.log(`✓ Generated structure atom: ${atom.canonical_name}`);
        } catch (err) {
          console.error(`Error for structure atom ${atom.canonical_name}:`, err);
          await admin.from("atoms").update({ generation_status: "failed", updated_at: new Date().toISOString() }).eq("id", atom.id);
        }
      }
    })()
  );
  }

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
            case "reset-failed":
        result = await handleResetFailed(projectId);
        break;
case "reset_failed": result = await handleResetFailed(projectId); break;
      default: return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("structure-atomiser error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});