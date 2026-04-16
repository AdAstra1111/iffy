// @ts-nocheck
/**
 * theme-atomiser — Phase 5
 *
 * Extracts and generates thematic atoms from project content.
 * Themes are derived holistically from story_outline + beat_sheet + scene summaries.
 *
 * Actions:
 *   extract      — LLM-derive themes from project content → create theme atom stubs
 *   generate     — LLM-generate rich attributes for pending theme atoms (background)
 *   status       — return all theme atoms for project
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
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function fetchProjectDocuments(admin: any, projectId: string) {
  // Fetch current versions of key documents
  const docTypes = ["story_outline", "beat_sheet", "character_bible"];

  const { data: docs, error } = await admin
    .from("project_documents")
    .select("id, document_type, current_version_id")
    .eq("project_id", projectId)
    .in("document_type", docTypes);

  if (error || !docs || docs.length === 0) {
    return { storyOutline: "", beatSheet: "", characterBible: "", scenes: [] };
  }

  const results: Record<string, any> = {};
  for (const doc of docs) {
    if (!doc.current_version_id) continue;
    const { data: version } = await admin
      .from("project_document_versions")
      .select("content, plaintext")
      .eq("id", doc.current_version_id)
      .single();
    results[doc.document_type] = version?.plaintext || version?.content || "";
  }

  // Fetch scene summaries
  const { data: sceneVersions } = await admin
    .from("scene_graph_versions")
    .select("scene_id, slugline, summary")
    .eq("project_id", projectId)
    .limit(50);

  const sceneSummaries = (sceneVersions || [])
    .map((s: any) => `[${s.slugline || s.scene_id}]: ${(s.summary || "").substring(0, 200)}`)
    .join("\n\n");

  return {
    storyOutline: results["story_outline"] || "",
    beatSheet: results["beat_sheet"] || "",
    characterBible: results["character_bible"] || "",
    scenes: sceneSummaries,
  };
}

async function handleExtract(projectId: string) {
  const admin = makeAdminClient();
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  // Fetch project content
  const { storyOutline, beatSheet, characterBible, scenes } = await fetchProjectDocuments(admin, projectId);

  if (!storyOutline && !beatSheet) {
    return { error: "no_content", message: "No story_outline or beat_sheet found for this project" };
  }

  // Check existing theme atoms to avoid duplicates
  const { data: existingAtoms } = await admin
    .from("atoms")
    .select("canonical_name")
    .eq("project_id", projectId)
    .eq("atom_type", "theme");

  const existingNames = new Set((existingAtoms || []).map((a: any) => a.canonical_name.toUpperCase()));

  // Use LLM to derive themes from content
  const extractPrompt = `You are a narrative analyst. Analyse the following project content and identify the dominant thematic threads.

Extract between 3 and 8 core thematic atoms. Each theme should be:
- A distinct thematic thread (not a plot element)
- Named with a short, sharp label (1-3 words)
- Central to the story's meaning

Respond with ONLY a JSON array of theme names (strings). No explanation, no markdown.

Example: ["Betrayal and Loyalty", "Identity and Deception", "Survival vs Sacrifice"]

PROJECT STORY OUTLINE:
${storyOutline.substring(0, 5000)}

BEAT SHEET:
${beatSheet.substring(0, 5000)}

SCENE SUMMARIES (sample):
${scenes.substring(0, 3000)}

Respond with a JSON array of theme name strings.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://iffy-analysis.vercel.app",
      "X-Title": "IFFY Theme Atomiser",
    },
    body: JSON.stringify({
      model: "minimax/minimax-m2.7",
      messages: [{ role: "user", content: extractPrompt }],
      temperature: 0.5,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter error during theme extraction: ${response.status} ${err}`);
  }

  const aiData = await response.json();
  const rawContent = aiData.choices?.[0]?.message?.content || "";

  let themeNames: string[] = [];
  try {
    const cleaned = rawContent.replace(/```json\s*/i, "").replace(/```\s*/i, "").trim();
    themeNames = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse theme names from LLM response: ${rawContent.substring(0, 200)}`);
  }

  if (!Array.isArray(themeNames) || themeNames.length === 0) {
    throw new Error("LLM returned no themes");
  }

  // Filter out existing
  const newThemes = themeNames.filter((t: string) => !existingNames.has(t.toUpperCase()));

  if (newThemes.length === 0) {
    return { created: 0, message: "All themes already exist" };
  }

  // Create stub atoms
  const now = new Date().toISOString();
  const toInsert = newThemes.map((name: string) => ({
    project_id: projectId,
    atom_type: "theme",
    entity_id: null,
    canonical_name: name,
    priority: 50,
    confidence: 0,
    readiness_state: "stub",
    generation_status: "pending",
    attributes: {
      themeName: name,
      thematicCategory: "",
      treatment: "",
      narrativeExpression: "",
      thematicDuality: "",
      audienceResonance: "",
      thematicArc: "",
      moralValence: "",
      thematicUrgency: "",
      genreIntersection: "",
      marketingHook: "",
      criticalLens: "",
      thematicTags: [],
      subtextLayer: "",
      productionToneAlignment: "",
      crossProjectRelevance: "",
      confidence: 0,
      readinessBadge: "foundation",
      generationStatus: "pending",
    },
    created_at: now,
    updated_at: now,
  }));

  const { data: inserted, error: insertErr } = await admin
    .from("atoms")
    .insert(toInsert)
    .select("id");

  if (insertErr) throw new Error(`Failed to insert theme atoms: ${insertErr.message}`);

  return { created: inserted?.length || 0, themes: newThemes };
}

async function handleStatus(projectId: string) {
  const admin = makeAdminClient();
  const { data: atoms, error } = await admin
    .from("atoms")
    .select("*")
    .eq("project_id", projectId)
    .eq("atom_type", "theme")
    .order("priority", { ascending: false });

  if (error) throw new Error(`Failed to load theme atoms: ${error.message}`);
  return { atoms: atoms || [], count: atoms?.length || 0 };
}

async function handleResetFailed(projectId: string) {
  const admin = makeAdminClient();
  const { count, error } = await admin
    .from("atoms")
    .update({ generation_status: "pending", updated_at: new Date().toISOString() })
    .in("generation_status", ["failed", "running"])
    .eq("project_id", projectId)
    .eq("atom_type", "theme")
    .select("id", { count: "exact", head: true });

  if (error) throw new Error(`Failed to reset atoms: ${error.message}`);
  return { reset: count || 0 };
}

async function handleGenerate(projectId: string) {
  const admin = makeAdminClient();

  const { data: pendingAtoms, error: fetchErr } = await admin
    .from("atoms")
    .select("id, canonical_name, attributes")
    .eq("project_id", projectId)
    .eq("atom_type", "theme")
    .eq("generation_status", "pending");

  if (fetchErr) throw new Error(`Failed to fetch pending atoms: ${fetchErr.message}`);
  if (!pendingAtoms || pendingAtoms.length === 0) {
    return { spawned: false, message: "No pending theme atoms" };
  }

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  const atomIds = pendingAtoms.map((a: any) => a.id);
  await admin
    .from("atoms")
    .update({ generation_status: "running", updated_at: new Date().toISOString() })
    .in("id", atomIds);

  const { storyOutline, beatSheet, characterBible, scenes } = await fetchProjectDocuments(admin, projectId);

  // @ts-ignore
  EdgeRuntime.waitUntil(
    (async () => {
      for (const atom of pendingAtoms) {
        try {
          console.log(`Generating theme atom: ${atom.canonical_name}`);

          const prompt = `You are a narrative analyst and thematic consultant. Generate a rich thematic atom for the theme: "${atom.canonical_name}".

Analyse the full project content to understand how this theme manifests, and generate a complete ThemeAtomAttributes JSON object.

PROJECT STORY OUTLINE:
${storyOutline.substring(0, 4000)}

BEAT SHEET:
${beatSheet.substring(0, 4000)}

CHARACTER BIBLE (arc tensions):
${characterBible.substring(0, 2000)}

SCENE SUMMARIES (sample):
${scenes.substring(0, 2000)}

Output ONLY a valid JSON object (no markdown, no commentary) with ALL of the following fields:
- thematicCategory (string: "moral" | "political" | "psychological" | "relational" | "existential")
- treatment (string: how the theme is explored — cynical | hopeful | ambivalent | didactic)
- narrativeExpression (string: specific story events that embody this theme)
- thematicDuality (string: the opposing force or counter-theme)
- audienceResonance (string: why this theme matters to viewers)
- thematicArc (string: does the theme intensify | resolve | complicate | get abandoned)
- moralValence (string: dark | ambiguous | redemptive | nihilistic)
- thematicUrgency (string: peripheral | supporting | dominant)
- genreIntersection (string: where this theme intersects with genre conventions)
- marketingHook (string: one-line description of the thematic promise)
- criticalLens (string: what a reviewer would focus on — feminist | political | psychological | etc)
- thematicTags (array of 3-6 thematic tag strings)
- subtextLayer (string: what the story says on the surface vs what it means underneath)
- productionToneAlignment (string: how this theme shapes production design choices)
- crossProjectRelevance (string: whether this theme generalises to a broader audience)
- confidence (number 0.0-1.0)
- readinessBadge (string: "foundation" | "rich" | "verified")`;

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openrouterKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://iffy-analysis.vercel.app",
              "X-Title": "IFFY Theme Atomiser",
            },
            body: JSON.stringify({
              model: "minimax/minimax-m2.7",
              messages: [{ role: "user", content: prompt }],
              temperature: 0.7,
              max_tokens: 2000,
            }),
          });

          if (!response.ok) {
            console.error(`OpenRouter error for ${atom.canonical_name}:`, response.status);
            await admin.from("atoms").update({ generation_status: "failed", updated_at: new Date().toISOString() }).eq("id", atom.id);
            continue;
          }

          const aiData = await response.json();
          const rawContent = aiData.choices?.[0]?.message?.content || "";

          let attrs: Record<string, any> = {};
          try {
            const cleaned = rawContent.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
            attrs = JSON.parse(cleaned);
          } catch {
            console.error(`Parse error for ${atom.canonical_name}:`, rawContent.substring(0, 200));
            await admin.from("atoms").update({ generation_status: "failed", updated_at: new Date().toISOString() }).eq("id", atom.id);
            continue;
          }

          const finalAttributes = {
            ...attrs,
            themeName: atom.canonical_name,
            generationStatus: "completed",
          };

          await admin
            .from("atoms")
            .update({
              generation_status: "complete",
              readiness_state: "generated",
              confidence: Math.round((attrs.confidence || 0.5) * 100),
              attributes: finalAttributes,
              updated_at: new Date().toISOString(),
            })
            .eq("id", atom.id);

          console.log(`✓ Generated theme: ${atom.canonical_name}`);
        } catch (err) {
          console.error(`Error processing theme ${atom.id}:`, err);
          await admin.from("atoms").update({ generation_status: "failed", updated_at: new Date().toISOString() }).eq("id", atom.id);
        }
      }
      console.log(`Theme atomiser complete for ${pendingAtoms.length} atoms`);
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

    console.log(`theme-atomiser: action=${action} project=${projectId}`);

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
    console.error("theme-atomiser error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
