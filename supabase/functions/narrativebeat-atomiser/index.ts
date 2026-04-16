// @ts-nocheck
/**
 * narrativebeat-atomiser — Phase 5
 *
 * Extracts key experiential story beats — memorable moments that deliver
 * emotional impact, revelation, or tonal shift.
 *
 * Actions:
 *   extract      — LLM-derive key narrative beats from scene enrichment data → create stubs
 *   generate     — LLM-generate rich beat attributes (background)
 *   status       — return all narrativebeat atoms for project
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

async function fetchSceneData(admin: any, projectId: string) {
  // Get scene enrichment data (tension, momentum, narrative_beat flags)
  const { data: enrichments } = await admin
    .from("scene_enrichment")
    .select("scene_id, scene_slugline, tension_level, emotional_tone, narrative_momentum, narrative_beat")
    .eq("project_id", projectId)
    .order("tension_level", { ascending: false })
    .limit(80);

  // Get scene graph versions for content
  const { data: sceneVersions } = await admin
    .from("scene_graph_versions")
    .select("scene_id, slugline, summary, content")
    .eq("project_id", projectId)
    .limit(80);

  const versionMap = new Map((sceneVersions || []).map((s: any) => [s.scene_id, s]));
  const scenes = (enrichments || []).map((e: any) => ({
    ...e,
    content: versionMap.get(e.scene_id)?.content || "",
    slugline: e.scene_slugline || versionMap.get(e.scene_id)?.slugline || e.scene_id,
  }));

  return { scenes };
}

async function handleExtract(projectId: string) {
  const admin = makeAdminClient();
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  const { scenes } = await fetchSceneData(admin, projectId);
  if (scenes.length === 0) {
    return { error: "no_scenes", message: "No scene enrichment data found. Run scene enrichment first." };
  }

  // Filter to high-momentum / high-tension scenes
  const candidateScenes = scenes
    .filter((s: any) => s.narrative_momentum === "high" || s.narrative_momentum === "peak" || (s.tension_level && s.tension_level >= 7))
    .slice(0, 30);

  if (candidateScenes.length < 3) {
    // Fall back to top tension scenes
    candidateScenes.splice(0, candidateScenes.length, ...scenes.slice(0, 20));
  }

  // Check existing beat atoms
  const { data: existingAtoms } = await admin
    .from("atoms").select("canonical_name")
    .eq("project_id", projectId).eq("atom_type", "narrativebeat");

  const existingNames = new Set((existingAtoms || []).map((a: any) => a.canonical_name.toUpperCase()));

  // LLM identifies key beats
  const sceneContexts = candidateScenes.map((s: any, i: number) =>
    `[Beat ${i + 1}] ${s.slugline}: tension=${s.tension_level} momentum=${s.narrative_momentum} | ${(s.summary || s.content || "").substring(0, 200)}`
  ).join("\n\n");

  const extractPrompt = `You are a story beat analyst. Identify the most important experiential beats in this film — the specific moments that deliver emotional impact, revelation, or tonal shift.

These are "memorable moments" not just plot points. A good beat is something audiences remember.

Return a JSON array of beat names (3-10 beats). Each beat should be a short, descriptive label (3-8 words) naming the specific moment.

Example: ["The Betrayal Reveal", "Desert Chase Sequence", "Underground Interrogation", "The Dead Drop"]

SCENE DATA:
${sceneContexts}

Respond with ONLY a JSON array of beat name strings. No explanation.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://iffy-analysis.vercel.app",
      "X-Title": "IFFY NarrativeBeat Atomiser",
    },
    body: JSON.stringify({
      model: "minimax/minimax-m2.7",
      messages: [{ role: "user", content: extractPrompt }],
      temperature: 0.5,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`);
  const aiData = await response.json();
  const rawContent = aiData.choices?.[0]?.message?.content || "";

  let beatNames: string[] = [];
  try {
    const cleaned = rawContent.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    beatNames = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse beat names: ${rawContent.substring(0, 200)}`);
  }

  if (!Array.isArray(beatNames) || beatNames.length === 0) throw new Error("LLM returned no beats");

  const newBeats = beatNames.filter((b: string) => !existingNames.has(b.toUpperCase()));
  if (newBeats.length === 0) return { created: 0, message: "All narrative beats already exist" };

  const now = new Date().toISOString();
  const toInsert = newBeats.map((name: string, i: number) => ({
    project_id: projectId,
    atom_type: "narrativebeat",
    entity_id: null,
    canonical_name: name,
    priority: 80 - i * 5,
    confidence: 0,
    readiness_state: "stub",
    generation_status: "pending",
    attributes: {
      beatName: name,
      beatType: "",
      sceneReference: "",
      emotionalImpact: "",
      structuralFunction: "",
      narrativeMomentum: "",
      charactersInvolved: [],
      beatSequenceOrder: i + 1,
      precededBy: "",
      followedBy: "",
      setPieceRequirement: "",
      beatTags: [],
      marketingRelevance: false,
      productionCriticality: "",
      confidence: 0,
      readinessBadge: "foundation",
      generationStatus: "pending",
    },
    created_at: now,
    updated_at: now,
  }));

  const { data: inserted, error } = await admin.from("atoms").insert(toInsert).select("id");
  if (error) throw new Error(`Failed to insert narrativebeat atoms: ${error.message}`);
  return { created: inserted?.length || 0, beats: newBeats };
}

async function handleStatus(projectId: string) {
  const admin = makeAdminClient();
  const { data: atoms, error } = await admin
    .from("atoms").select("*").eq("project_id", projectId).eq("atom_type", "narrativebeat")
    .order("priority", { ascending: false });
  if (error) throw new Error(`Failed to load narrativebeat atoms: ${error.message}`);
  return { atoms: atoms || [], count: atoms?.length || 0 };
}

async function handleResetFailed(projectId: string) {
  const admin = makeAdminClient();
  const { count, error } = await admin
    .from("atoms")
    .update({ generation_status: "pending", updated_at: new Date().toISOString() })
    .in("generation_status", ["failed", "running"])
    .eq("project_id", projectId).eq("atom_type", "narrativebeat")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Failed to reset: ${error.message}`);
  return { reset: count || 0 };
}

async function handleGenerate(projectId: string) {
  const admin = makeAdminClient();
  const { data: pendingAtoms, error: fetchErr } = await admin
    .from("atoms").select("id, canonical_name, attributes")
    .eq("project_id", projectId).eq("atom_type", "narrativebeat").eq("generation_status", "pending");
  if (fetchErr) throw new Error(`Failed to fetch: ${fetchErr.message}`);
  if (!pendingAtoms || pendingAtoms.length === 0) return { spawned: false, message: "No pending narrativebeat atoms" };

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  const { scenes } = await fetchSceneData(admin, projectId);
  const atomIds = pendingAtoms.map((a: any) => a.id);
  await admin.from("atoms").update({ generation_status: "running", updated_at: new Date().toISOString() }).in("id", atomIds);

  // @ts-ignore
  EdgeRuntime.waitUntil(
    (async () => {
      for (const atom of pendingAtoms) {
        try {
          // Find the most relevant scene context for this beat
          const relevantScenes = scenes
            .filter((s: any) => {
              const summary = (s.summary || "").toLowerCase();
              const content = (s.content || "").toLowerCase();
              const beat = atom.canonical_name.toLowerCase();
              return summary.includes(beat.substring(0, 10)) || content.includes(beat.substring(0, 10));
            })
            .slice(0, 5);

          const sceneContext = relevantScenes.length > 0
            ? relevantScenes.map((s: any) => `[${s.slugline}]: ${(s.summary || s.content || "").substring(0, 300)}`).join("\n\n")
            : scenes.slice(0, 3).map((s: any) => `[${s.slugline}]: ${(s.summary || s.content || "").substring(0, 200)}`).join("\n\n");

          const prompt = `You are a story beat analyst. Generate rich attributes for the narrative beat: "${atom.canonical_name}".

This beat appears in the context of these scenes:
${sceneContext}

Output ONLY a valid JSON object (no markdown, no commentary) with ALL fields:
- beatType (string: revelation | action_climax | emotional_turn | tonal_shift | setup)
- sceneReference (string: the slugline or scene_id where this beat occurs, if identifiable)
- emotionalImpact (string: what the audience feels at this beat)
- structuralFunction (string: act_turn | midpoint | climax | resolution | setup)
- narrativeMomentum (string: low | medium | high | peak)
- charactersInvolved (array of 1-4 character names)
- beatSequenceOrder (number: approximate order in the film, 1 = beginning)
- precededBy (string: what sets this beat up)
- followedBy (string: what this beat leads to)
- setPieceRequirement (string: minimal | practical | full_production)
- beatTags (array of 3-5 keyword strings)
- marketingRelevance (boolean: is this a trailer beat?)
- productionCriticality (string: can_this_be_restructured | must_it_stay)
- confidence (number 0.0-1.0)
- readinessBadge (string: "foundation" | "rich" | "verified")`;

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${openrouterKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://iffy-analysis.vercel.app", "X-Title": "IFFY NarrativeBeat Atomiser" },
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

          const finalAttributes = { ...attrs, beatName: atom.canonical_name, generationStatus: "completed" };
          await admin.from("atoms").update({
            generation_status: "complete", readiness_state: "generated",
            confidence: Math.round((attrs.confidence || 0.5) * 100),
            attributes: finalAttributes, updated_at: new Date().toISOString(),
          }).eq("id", atom.id);

          console.log(`✓ Generated narrativebeat: ${atom.canonical_name}`);
        } catch (err) {
          console.error(`Error for narrativebeat ${atom.id}:`, err);
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
    console.error("narrativebeat-atomiser error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
