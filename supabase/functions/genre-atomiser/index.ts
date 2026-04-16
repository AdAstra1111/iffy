// @ts-nocheck
/**
 * genre-atomiser — Phase 5
 *
 * Classifies project against genre templates and generates genre atoms.
 *
 * Actions:
 *   extract      — LLM-classify project genre from content → create genre atom stubs
 *   generate     — LLM-generate rich attributes for pending genre atoms (background)
 *   status       — return all genre atoms for project
 *   reset_failed — reset failed/running atoms back to pending
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function makeAdminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function fetchProjectDocuments(admin: any, projectId: string) {
  const docTypes = ["story_outline", "beat_sheet"];
  const { data: docs } = await admin
    .from("project_documents")
    .select("id, document_type, current_version_id")
    .eq("project_id", projectId)
    .in("document_type", docTypes);

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

  const { data: sceneVersions } = await admin
    .from("scene_graph_versions")
    .select("scene_id, slugline, summary")
    .eq("project_id", projectId)
    .limit(30);

  const sceneText = (sceneVersions || [])
    .map((s: any) => `[${s.slugline || s.scene_id}]: ${(s.summary || "").substring(0, 150)}`)
    .join("\n");

  return {
    storyOutline: results["story_outline"] || "",
    beatSheet: results["beat_sheet"] || "",
    scenes: sceneText,
  };
}

async function handleExtract(projectId: string) {
  const admin = makeAdminClient();
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  const { storyOutline, beatSheet, scenes } = await fetchProjectDocuments(admin, projectId);
  if (!storyOutline && !beatSheet) {
    return { error: "no_content", message: "No story_outline or beat_sheet found" };
  }

  const { data: existingAtoms } = await admin
    .from("atoms")
    .select("canonical_name")
    .eq("project_id", projectId)
    .eq("atom_type", "genre");

  const existingNames = new Set((existingAtoms || []).map((a: any) => a.canonical_name.toUpperCase()));

  // LLM determines genre classification
  const extractPrompt = `You are a film genre analyst. Classify the following project against known genre templates.

Return a JSON array of genre labels (3-6 labels) representing the genre profile:
- Primary genre (what the film IS primarily)
- Secondary genres (what else it draws from)
- Subgenre tags (setting, tone, or structural subtypes)
- Tonal tags (how it FEELS emotionally)

Be specific. Use established film genre terminology.
Example output: ["War Thriller", "Spy Espionage", "Film Noir", "WWII", "Gritty", "Period-Authentic"]

PROJECT:
${storyOutline.substring(0, 4000)}

BEAT SHEET:
${beatSheet.substring(0, 4000)}

SCENE SUMMARIES:
${scenes.substring(0, 2000)}

Respond with ONLY a JSON array of strings. No explanation.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://iffy-analysis.vercel.app",
      "X-Title": "IFFY Genre Atomiser",
    },
    body: JSON.stringify({
      model: "minimax/minimax-m2.7",
      messages: [{ role: "user", content: extractPrompt }],
      temperature: 0.5,
      max_tokens: 800,
    }),
  });

  if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`);
  const aiData = await response.json();
  const rawContent = aiData.choices?.[0]?.message?.content || "";

  let genreLabels: string[] = [];
  try {
    const cleaned = rawContent.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    genreLabels = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse genre labels: ${rawContent.substring(0, 200)}`);
  }

  if (!Array.isArray(genreLabels) || genreLabels.length === 0) {
    throw new Error("LLM returned no genre labels");
  }

  const newGenres = genreLabels.filter((g: string) => !existingNames.has(g.toUpperCase()));
  if (newGenres.length === 0) return { created: 0, message: "All genre atoms already exist" };

  const now = new Date().toISOString();
  const toInsert = newGenres.map((name: string) => ({
    project_id: projectId,
    atom_type: "genre",
    entity_id: null,
    canonical_name: name,
    priority: 50,
    confidence: 0,
    readiness_state: "stub",
    generation_status: "pending",
    attributes: {
      genreLabel: name,
      primaryGenre: "",
      secondaryGenres: [],
      subgenreTags: [],
      genreMashupNotes: "",
      toneTags: [],
      intendedRating: "",
      narrativeStructure: "",
      pacingClass: [],
      settingClassification: [],
      comparableFilms: [],
      audienceProfile: "",
      genrePurity: "",
      genreTags: [],
      marketingClassification: "",
      confidence: 0,
      readinessBadge: "foundation",
      generationStatus: "pending",
    },
    created_at: now,
    updated_at: now,
  }));

  const { data: inserted, error } = await admin.from("atoms").insert(toInsert).select("id");
  if (error) throw new Error(`Failed to insert genre atoms: ${error.message}`);
  return { created: inserted?.length || 0, genres: newGenres };
}

async function handleStatus(projectId: string) {
  const admin = makeAdminClient();
  const { data: atoms, error } = await admin
    .from("atoms").select("*").eq("project_id", projectId).eq("atom_type", "genre")
    .order("priority", { ascending: false });
  if (error) throw new Error(`Failed to load genre atoms: ${error.message}`);
  return { atoms: atoms || [], count: atoms?.length || 0 };
}

async function handleResetFailed(projectId: string) {
  const admin = makeAdminClient();
  const { count, error } = await admin
    .from("atoms")
    .update({ generation_status: "pending", updated_at: new Date().toISOString() })
    .in("generation_status", ["failed", "running"])
    .eq("project_id", projectId).eq("atom_type", "genre")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Failed to reset atoms: ${error.message}`);
  return { reset: count || 0 };
}

async function handleGenerate(projectId: string) {
  const admin = makeAdminClient();
  const { data: pendingAtoms, error: fetchErr } = await admin
    .from("atoms").select("id, canonical_name, attributes")
    .eq("project_id", projectId).eq("atom_type", "genre").eq("generation_status", "pending");
  if (fetchErr) throw new Error(`Failed to fetch pending atoms: ${fetchErr.message}`);
  if (!pendingAtoms || pendingAtoms.length === 0) return { spawned: false, message: "No pending genre atoms" };

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  const { storyOutline, beatSheet, scenes } = await fetchProjectDocuments(admin, projectId);
  const atomIds = pendingAtoms.map((a: any) => a.id);
  await admin.from("atoms").update({ generation_status: "running", updated_at: new Date().toISOString() }).in("id", atomIds);

  // @ts-ignore
  EdgeRuntime.waitUntil(
    (async () => {
      for (const atom of pendingAtoms) {
        try {
          const prompt = `You are a film genre analyst. Generate rich genre attributes for the genre label: "${atom.canonical_name}".

Project context:
STORY: ${storyOutline.substring(0, 3000)}
BEATS: ${beatSheet.substring(0, 3000)}
SCENES: ${scenes.substring(0, 1500)}

Output ONLY a valid JSON object (no markdown, no commentary) with ALL fields:
- primaryGenre (string)
- secondaryGenres (array of 2-3 secondary genre strings)
- subgenreTags (array of 3-5 setting/tone/structural subtype strings)
- genreMashupNotes (string: where genres blend)
- toneTags (array of 3-5 emotional tone strings)
- intendedRating (string: PG-13 | R | etc)
- narrativeStructure (string: three_act | non_linear | episodic | anthology)
- pacingClass (array: slow_burn | intense | mixed)
- settingClassification (array: era/setting tags)
- comparableFilms (array of 3 film title strings)
- audienceProfile (string: who this is for)
- genrePurity (string: pure_genre | genre_hybrid | genre_subversion)
- genreTags (array of 4-6 genre keyword strings)
- marketingClassification (string: how this would be marketed)
- confidence (number 0.0-1.0)
- readinessBadge (string: "foundation" | "rich" | "verified")`;

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${openrouterKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://iffy-analysis.vercel.app", "X-Title": "IFFY Genre Atomiser" },
            body: JSON.stringify({ model: "minimax/minimax-m2.7", messages: [{ role: "user", content: prompt }], temperature: 0.7, max_tokens: 1500 }),
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

          const finalAttributes = { ...attrs, genreLabel: atom.canonical_name, generationStatus: "completed" };
          await admin.from("atoms").update({
            generation_status: "complete", readiness_state: "generated",
            confidence: Math.round((attrs.confidence || 0.5) * 100),
            attributes: finalAttributes, updated_at: new Date().toISOString(),
          }).eq("id", atom.id);

          console.log(`✓ Generated genre: ${atom.canonical_name}`);
        } catch (err) {
          console.error(`Error for genre ${atom.id}:`, err);
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
    console.error("genre-atomiser error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
