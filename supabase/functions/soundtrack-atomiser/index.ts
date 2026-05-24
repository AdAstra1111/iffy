// @ts-nocheck
/**
 * soundtrack-atomiser — Phase 5
 *
 * Derives the music and audio identity of the project.
 * Analyses tonal/emotional data to determine sonic palette.
 * For VD projects with a season_script, creates one atom per episode.
 *
 * Actions:
 *   extract      — create soundtrack atom stub(s) (project-level or per-episode)
 *   generate     — LLM-generate sonic palette from tone + era + beat sheet (background)
 *   status       — return all soundtrack atoms for project
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
 * Fetch project content needed for soundtrack analysis.
 * For VD projects, episodeNumber can be specified to get that episode's text from season_script.
 */
async function fetchProjectData(admin: any, projectId: string, episodeNumber?: number) {
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

  const { data: enrichments } = await admin
    .from("scene_enrichment")
    .select("scene_id, emotional_tone, thematic_tags")
    .eq("project_id", projectId)
    .limit(50);

  const emotionalData = (enrichments || [])
    .map((e: any) => `${e.emotional_tone || "neutral"} | ${(e.thematic_tags || []).join(", ")}`)
    .join("\n");

  return {
    storyOutline: results["story_outline"] || "",
    beatSheet: results["beat_sheet"] || "",
    seasonScript,
    episodeScript: results["episode_script"] || "",
    emotionalData,
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
      .eq("project_id", projectId).eq("atom_type", "soundtrack");

    const existingNames = new Set((existing || []).map((a: any) => a.canonical_name));
    const now = new Date().toISOString();
    let created = 0;

    for (const ep of episodes) {
      const canonicalName = `Episode ${ep.number} Soundtrack`;
      if (existingNames.has(canonicalName)) continue;

      const { error } = await admin.from("atoms").insert({
        project_id: projectId,
        atom_type: "soundtrack",
        entity_id: null,
        canonical_name: canonicalName,
        priority: 50,
        confidence: 0,
        readiness_state: "stub",
        generation_status: "pending",
        attributes: {
          scoreType: "",
          dominantInstruments: [],
          eraAlignment: "",
          composerReference: "",
          tempoPalette: [],
          diegeticMusic: [],
          nonDiegeticMusic: [],
          act1MusicalCharacter: "",
          act2MusicalCharacter: "",
          act3MusicalCharacter: "",
          culturalAuthenticity: "",
          soundtrackTags: [],
          budgetForMusic: "",
          musicLicensingNotes: "",
          audioIdentityStatement: "",
          confidence: 0,
          readinessBadge: "foundation",
          generationStatus: "pending",
        },
        created_at: now,
        updated_at: now,
      });

      if (error) {
        console.error(`Failed to insert soundtrack atom for episode ${ep.number}: ${error.message}`);
        continue;
      }
      created++;
    }

    return { created, message: created > 0 ? `Created ${created} episode soundtrack atoms` : "No new episode soundtrack atoms needed" };
  }

  // Feature film path: create a single project-level soundtrack atom
  const { data: existing } = await admin
    .from("atoms").select("id")
    .eq("project_id", projectId).eq("atom_type", "soundtrack");

  if (existing && existing.length > 0) {
    return { created: 0, message: "Soundtrack atom already exists for this project" };
  }

  const now = new Date().toISOString();
  const { error } = await admin.from("atoms").insert({
    project_id: projectId,
    atom_type: "soundtrack",
    entity_id: null,
    canonical_name: "Soundtrack Profile",
    priority: 50,
    confidence: 0,
    readiness_state: "stub",
    generation_status: "pending",
    attributes: {
      scoreType: "",
      dominantInstruments: [],
      eraAlignment: "",
      composerReference: "",
      tempoPalette: [],
      diegeticMusic: [],
      nonDiegeticMusic: [],
      act1MusicalCharacter: "",
      act2MusicalCharacter: "",
      act3MusicalCharacter: "",
      culturalAuthenticity: "",
      soundtrackTags: [],
      budgetForMusic: "",
      musicLicensingNotes: "",
      audioIdentityStatement: "",
      confidence: 0,
      readinessBadge: "foundation",
      generationStatus: "pending",
    },
    created_at: now,
    updated_at: now,
  });

  if (error) throw new Error(`Failed to insert soundtrack atom: ${error.message}`);
  return { created: 1 };
}

async function handleStatus(projectId: string) {
  const admin = makeAdminClient();
  const { data: atoms, error } = await admin
    .from("atoms").select("*").eq("project_id", projectId).eq("atom_type", "soundtrack");
  if (error) throw new Error(`Failed to load soundtrack atoms: ${error.message}`);
  return { atoms: atoms || [], count: atoms?.length || 0 };
}

async function handleResetFailed(projectId: string) {
  const admin = makeAdminClient();
  const { count, error } = await admin
    .from("atoms")
    .update({ generation_status: "pending", updated_at: new Date().toISOString() })
    .in("generation_status", ["failed", "running"])
    .eq("project_id", projectId).eq("atom_type", "soundtrack")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Failed to reset: ${error.message}`);
  return { reset: count || 0 };
}

async function handleGenerate(projectId: string) {
  const admin = makeAdminClient();
  const { data: pendingAtoms, error: fetchErr } = await admin
    .from("atoms").select("id, canonical_name")
    .eq("project_id", projectId).eq("atom_type", "soundtrack").eq("generation_status", "pending");
  if (fetchErr) throw new Error(`Failed to fetch: ${fetchErr.message}`);
  if (!pendingAtoms || pendingAtoms.length === 0) return { spawned: false, message: "No pending soundtrack atoms" };

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  const { storyOutline, beatSheet, seasonScript, episodeScript, emotionalData } = await fetchProjectData(admin, projectId);
  const atomIds = pendingAtoms.map((a: any) => a.id);
  await admin.from("atoms").update({ generation_status: "running", updated_at: new Date().toISOString() }).in("id", atomIds);

  // @ts-ignore
  EdgeRuntime.waitUntil(
    (async () => {
      for (const atom of pendingAtoms) {
        try {
          // Extract episode number from canonical_name (e.g. "Episode 3 Soundtrack" -> 3)
          const epMatch = atom.canonical_name?.match(/^Episode\s+(\d+)/i);
          const episodeNumber = epMatch ? parseInt(epMatch[1], 10) : undefined;

          // If this is an episode atom, fetch episode-specific content
          let effectiveEpisodeScript = episodeScript;
          let effectiveBeatSheet = beatSheet;
          let effectiveStoryOutline = storyOutline;
          let effectiveEmotionalData = emotionalData;

          if (episodeNumber !== undefined && seasonScript) {
            const epContent = await fetchProjectData(admin, projectId, episodeNumber);
            effectiveEpisodeScript = epContent.episodeScript;
            effectiveBeatSheet = epContent.beatSheet;
            effectiveStoryOutline = epContent.storyOutline;
            effectiveEmotionalData = epContent.emotionalData;
          }

          let prompt: string;
          if (episodeNumber !== undefined) {
            prompt = `You are a film music supervisor and composer consultant. Recommend the soundtrack for Episode ${episodeNumber} of this vertical drama series and generate a complete SoundtrackAtomAttributes JSON object.

EPISODE SCRIPT (Episode ${episodeNumber}):
${effectiveEpisodeScript.substring(0, 4000)}

EMOTIONAL/TONAL DATA (scene-level):
${effectiveEmotionalData.substring(0, 2000)}

Output ONLY a valid JSON object (no markdown, no commentary) with ALL fields:
- scoreType (string: orchestral | electronic | hybrid | diegetic_led | minimal)
- dominantInstruments (array of 3-5 instrument/ensemble strings for this episode)
- composerReference (string: what this episode's music sounds like)
- tempoPalette (array of 3-5 tempo/mood strings for this episode, e.g. ["slow_burn_strings", "urgent_brass"])
- diegeticMusic (array of 2-4 diegetic music moment descriptions for this episode)
- nonDiegeticMusic (array of 2-4 score function descriptions for this episode)
- culturalAuthenticity (string: genre-appropriate authenticity description)
- soundtrackTags (array of 3-5 keyword strings for this episode)
- budgetForMusic (string: library_music | original_score | both)
- musicLicensingNotes (string: any songs that need licensing for this episode, or "none")
- audioIdentityStatement (string: one-line description of this episode's sonic world)
- confidence (number 0.0-1.0)
- readinessBadge (string: "foundation" | "rich" | "verified")`;
          } else {
            prompt = `You are a film music supervisor and composer consultant. Analyse this project's story, genre, era, and emotional texture and generate a complete SoundtrackAtomAttributes JSON object.

STORY OUTLINE:
${storyOutline.substring(0, 3000)}

BEAT SHEET:
${beatSheet.substring(0, 3000)}

EMOTIONAL/TONAL DATA (scene-level):
${emotionalData.substring(0, 2000)}

Output ONLY a valid JSON object (no markdown, no commentary) with ALL fields:
- scoreType (string: orchestral | electronic | hybrid | diegetic_led)
- dominantInstruments (array of 4-6 instrument/ensemble strings)
- eraAlignment (string: 1940s_period | contemporary | hybrid_period)
- composerReference (string: what this sounds like — e.g. "Hans Zimmer meets Ennio Morricone")
- tempoPalette (array of 3-5 tempo/mood strings, e.g. ["slow_burn_strings", "urgent_brass", "quiet_piano"])
- diegeticMusic (array of 3-5 diegetic music moment descriptions)
- nonDiegeticMusic (array of 3-5 score function descriptions)
- act1MusicalCharacter (string: musical character of act 1)
- act2MusicalCharacter (string: musical character of act 2)
- act3MusicalCharacter (string: musical character of act 3)
- culturalAuthenticity (string: 1940s authenticity | stylised | anachronistic_elements)
- soundtrackTags (array of 4-6 keyword strings)
- budgetForMusic (string: library_music | original_score | both)
- musicLicensingNotes (string: any period songs that need licensing, or "none")
- audioIdentityStatement (string: one-line description of the sonic world)
- confidence (number 0.0-1.0)
- readinessBadge (string: "foundation" | "rich" | "verified")`;
          }

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${openrouterKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://iffy-analysis.vercel.app", "X-Title": "IFFY Soundtrack Atomiser" },
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

          console.log(`✓ Generated soundtrack atom: ${atom.canonical_name}`);
        } catch (err) {
          console.error(`Error for soundtrack atom ${atom.canonical_name}:`, err);
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
    console.error("soundtrack-atomiser error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});