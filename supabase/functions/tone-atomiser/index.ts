// @ts-nocheck
/**
 * tone-atomiser — Phase 5
 *
 * Maps the emotional register and mood texture of a project.
 * Generates a global tone profile plus act-level breakdown.
 * For VD projects with a season_script, creates one atom per episode.
 *
 * Actions:
 *   extract      — create tone atom stub(s) (project-level or per-episode)
 *   generate     — LLM-generate rich tone attributes (background)
 *   status       — return all tone atoms for project
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
 * Fetch project content needed for tone analysis.
 * For VD projects, episodeNumber can be specified to get that episode's text from season_script.
 */
async function fetchProjectContent(admin: any, projectId: string, episodeNumber?: number) {
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

  const { data: sceneVersions } = await admin
    .from("scene_graph_versions")
    .select("scene_id, slugline, summary, emotional_register, thematic_tags")
    .eq("project_id", projectId)
    .limit(50);

  const scenes = (sceneVersions || []).map((s: any) => ({
    slugline: s.slugline || s.scene_id,
    summary: s.summary || "",
    emotional_register: s.emotional_register || "",
    thematic_tags: s.thematic_tags || [],
  }));

  return { storyOutline: results["story_outline"] || "", beatSheet: results["beat_sheet"] || "", seasonScript, episodeScript: results["episode_script"] || "", scenes };
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
      .eq("project_id", projectId).eq("atom_type", "tone");

    const existingNames = new Set((existing || []).map((a: any) => a.canonical_name));
    const now = new Date().toISOString();
    let created = 0;

    for (const ep of episodes) {
      const canonicalName = `Episode ${ep.number} Tone`;
      if (existingNames.has(canonicalName)) continue;

      const { error } = await admin.from("atoms").insert({
        project_id: projectId,
        atom_type: "tone",
        entity_id: null,
        canonical_name: canonicalName,
        priority: 50,
        confidence: 0,
        readiness_state: "stub",
        generation_status: "pending",
        attributes: {
          overallTone: "",
          dominantMood: "",
          tonalPalette: [],
          moralRegister: "",
          emotionalTenor: "",
          humourRegister: "",
          dialogueTone: "",
          visualTone: "",
          act1Tone: "",
          act2Tone: "",
          act3Tone: "",
          toneConsistency: "",
          targetEmotionalResponse: "",
          toneTags: [],
          tonalReferencePoints: [],
          confidence: 0,
          readinessBadge: "foundation",
          generationStatus: "pending",
        },
        created_at: now,
        updated_at: now,
      });

      if (error) {
        console.error(`Failed to insert tone atom for episode ${ep.number}: ${error.message}`);
        continue;
      }
      created++;
    }

    return { created, message: created > 0 ? `Created ${created} episode tone atoms` : "No new episode tone atoms needed" };
  }

  // Feature film path: create a single project-level tone atom
  const { data: existing } = await admin
    .from("atoms").select("id")
    .eq("project_id", projectId).eq("atom_type", "tone");

  if (existing && existing.length > 0) {
    return { created: 0, message: "Tone atom already exists for this project (tone is project-level)" };
  }

  const now = new Date().toISOString();
  const { error } = await admin.from("atoms").insert({
    project_id: projectId,
    atom_type: "tone",
    entity_id: null,
    canonical_name: "Project Tone Profile",
    priority: 50,
    confidence: 0,
    readiness_state: "stub",
    generation_status: "pending",
    attributes: {
      overallTone: "",
      dominantMood: "",
      tonalPalette: [],
      moralRegister: "",
      emotionalTenor: "",
      humourRegister: "",
      dialogueTone: "",
      visualTone: "",
      act1Tone: "",
      act2Tone: "",
      act3Tone: "",
      toneConsistency: "",
      targetEmotionalResponse: "",
      toneTags: [],
      tonalReferencePoints: [],
      confidence: 0,
      readinessBadge: "foundation",
      generationStatus: "pending",
    },
    created_at: now,
    updated_at: now,
  });

  if (error) throw new Error(`Failed to insert tone atom: ${error.message}`);
  return { created: 1, message: "Tone atom created" };
}

async function handleStatus(projectId: string) {
    console.log("[StaleRecovery] Recovered " + staleRecovery.recovered + " stale tone atoms on status check");
  }

async function handleResetFailed(projectId: string) {
  const admin = makeAdminClient();
  // P0.1: Auto-recover stale running atoms
  const staleRecovery = await recoverStaleRunning(admin, projectId, "tone").catch(() => ({ recovered: 0 }));
  if (staleRecovery.recovered > 0) {
    console.log("[StaleRecovery] Recovered " + staleRecovery.recovered + " stale tone atoms on status check");
  }

  const { count, error } = await admin
    .from("atoms")
    .update({ generation_status: "pending", updated_at: new Date().toISOString() })
    .in("generation_status", ["failed", "running"])
    .eq("project_id", projectId).eq("atom_type", "tone")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Failed to reset: ${error.message}`);
  return { reset: count || 0 };
}

async function handleGenerate(projectId: string) {
  const admin = makeAdminClient();
  const { data: pendingAtoms, error: fetchErr } = await admin
    .from("atoms").select("id, canonical_name")
    .eq("project_id", projectId).eq("atom_type", "tone").eq("generation_status", "pending");
  if (fetchErr) throw new Error(`Failed to fetch: ${fetchErr.message}`);
  if (!pendingAtoms || pendingAtoms.length === 0) return { spawned: false, message: "No pending tone atoms" };

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  const { storyOutline, beatSheet, seasonScript, episodeScript, scenes } = await fetchProjectContent(admin, projectId);
  const atomIds = pendingAtoms.map((a: any) => a.id);
  await admin.from("atoms").update({ generation_status: "running", updated_at: new Date().toISOString() }).in("id", atomIds);

  // @ts-ignore
  if (typeof EdgeRuntime !== "undefined") {
  EdgeRuntime.waitUntil(
    (async () => {
      for (const atom of pendingAtoms) {
        try {
          // Extract episode number from canonical_name (e.g. "Episode 3 Tone" -> 3)
          const epMatch = atom.canonical_name?.match(/^Episode\s+(\d+)/i);
          const episodeNumber = epMatch ? parseInt(epMatch[1], 10) : undefined;

          // If this is an episode atom, fetch episode-specific content
          let effectiveEpisodeScript = episodeScript;
          let effectiveBeatSheet = beatSheet;
          let effectiveStoryOutline = storyOutline;

          if (episodeNumber !== undefined && seasonScript) {
            // Re-fetch just this episode's content for precise context
            const epContent = await fetchProjectContent(admin, projectId, episodeNumber);
            effectiveEpisodeScript = epContent.episodeScript;
            // Use the beat sheet as context too, but episode script is primary
            effectiveBeatSheet = epContent.beatSheet;
            effectiveStoryOutline = epContent.storyOutline;
          }

          const sceneContexts = scenes.map((s: any) =>
            `[${s.slugline}]: ${s.summary.substring(0, 150)} | emotional: ${s.emotional_register} | themes: ${(s.thematic_tags || []).join(", ")}`
          ).join("\n");

          let prompt: string;
          if (episodeNumber !== undefined) {
            prompt = `You are an emotional tone analyst. Analyse the tone of Episode ${episodeNumber} of this vertical drama series and generate a complete ToneAtomAttributes JSON object.

EPISODE SCRIPT (Episode ${episodeNumber}):
${effectiveEpisodeScript.substring(0, 4000)}

Scene Emotional Data:
${sceneContexts.substring(0, 2000)}

Output ONLY a valid JSON object (no markdown, no commentary) with ALL fields:
- overallTone (string: e.g. "atmospheric thriller" describing this episode's tone)
- dominantMood (string: e.g. "tense | mysterious | emotional")
- tonalPalette (array of 4-6 mood adjectives for this episode)
- moralRegister (string: morally_grey | principled | nihilistic | redemptive)
- emotionalTenor (string: high_stakes | introspective | action_led | dialogue_driven)
- humourRegister (string: absent | dark | occasional | comic_relief)
- dialogueTone (string: punchy | naturalistic | formal | expository)
- visualTone (string: high_contrast | desaturated | golden_hour | cold_blue)
- toneConsistency (string: consistent | mixed | deliberately_shifting)
- targetEmotionalResponse (string: what the audience should feel during this episode)
- toneTags (array of 4-6 tone keyword strings for this episode)
- tonalReferencePoints (array of 3 film title strings with similar tone)
- confidence (number 0.0-1.0)
- readinessBadge (string: "foundation" | "rich" | "verified")`;
          } else {
            prompt = `You are an emotional tone analyst. Analyse this project's tone and generate a complete ToneAtomAttributes JSON object.

Story: ${storyOutline.substring(0, 3000)}

Beat Sheet: ${beatSheet.substring(0, 3000)}

Scene Emotional Data:
${sceneContexts.substring(0, 3000)}

Output ONLY a valid JSON object (no markdown, no commentary) with ALL fields:
- overallTone (string: e.g. "atmospheric WWII spy thriller")
- dominantMood (string: e.g. "tense | nostalgic | dread-filled | sardonic")
- tonalPalette (array of 4-6 mood adjectives)
- moralRegister (string: morally_grey | principled | nihilistic | redemptive)
- emotionalTenor (string: high_stakes | introspective | action_led | dialogue_driven)
- humourRegister (string: absent | dark | occasional | comic_relief)
- dialogueTone (string: punchy | naturalistic | formal_period | expository)
- visualTone (string: high_contrast | desaturated | golden_hour | cold_blue)
- act1Tone (string: what tone dominates act 1)
- act2Tone (string: what tone dominates act 2)
- act3Tone (string: what tone dominates act 3)
- toneConsistency (string: consistent | mixed | deliberately_shifting)
- targetEmotionalResponse (string: what the audience should feel)
- toneTags (array of 4-6 tone keyword strings)
- tonalReferencePoints (array of 3 film title strings with similar tone)
- confidence (number 0.0-1.0)
- readinessBadge (string: "foundation" | "rich" | "verified")`;
          }

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${openrouterKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://iffy-analysis.vercel.app", "X-Title": "IFFY Tone Atomiser" },
            body: JSON.stringify({ model: "minimax/minimax-m2.7", messages: [{ role: "user", content: prompt }], temperature: 0.7, max_tokens: 1800 }),
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

          console.log(`✓ Generated tone atom: ${atom.canonical_name}`);
        } catch (err) {
          console.error(`Error for tone atom ${atom.canonical_name}:`, err);
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
    console.error("tone-atomiser error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});