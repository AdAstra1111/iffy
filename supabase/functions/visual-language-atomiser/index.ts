// @ts-nocheck
/**
 * visual-language-atomiser -- Phase 5 v2 (Graph-First Architecture)
 *
 * Extracts visual language concepts from narrative content and generates
 * projection data + graph relations.
 *
 * Tables:
 *   visual_language_atoms       -- identity layer (stable concepts)
 *   visual_language_projections -- projection layer (production-specific expression)
 *   visual_language_relations   -- graph edge layer (concept relationships)
 *
 * CDG: D7 (visual_language), upstream C5 (narrative spine)
 *
 * Actions:
 *   extract      -- LLM-derive VL concepts -> create identity atom stubs
 *   generate     -- LLM-generate projections + relations for pending atoms
 *   status       -- return all VL atoms + projections + relation counts
 *   reset_failed -- reset failed/running atoms back to pending
 *   reset-failed -- alias for reset_failed
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { recoverStaleRunning } from "../_shared/stale-running-recovery.ts";
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


async function fetchProjectDocuments(admin, projectId) {
  const docTypes = ["story_outline", "beat_sheet", "character_bible", "creative_brief", "canon", "season_arc", "vertical_episode_beats"];

  const { data: docs, error } = await admin
    .from("project_documents")
    .select("id, doc_type, latest_version_id")
    .eq("project_id", projectId)
    .in("doc_type", docTypes);

  if (error || !docs || docs.length === 0) {
    return { storyOutline: "", beatSheet: "", characterBible: "", scenes: [], existingVLNames: [] };
  }

  const results = {};
  for (const doc of docs) {
    if (!doc.latest_version_id) continue;
    const { data: version } = await admin
      .from("project_document_versions")
      .select("plaintext")
      .eq("id", doc.latest_version_id)
      .single();
    results[doc.doc_type] = version?.plaintext || "";
  }

  const { data: sceneVersions } = await admin
    .from("scene_graph_versions")
    .select("scene_id, slugline, summary")
    .eq("project_id", projectId)
    .limit(50);

  const sceneSummaries = (sceneVersions || [])
    .map(s => `[${s.slugline || s.scene_id}]: ${(s.summary || "").substring(0, 200)}`)
    .join("\n\n");

  const { data: themeAtoms } = await admin
    .from("visual_language_atoms")
    .select("canonical_name")
    .eq("project_id", projectId);

  return {
    storyOutline: results["story_outline"] || "",
    beatSheet: results["beat_sheet"] || "",
    characterBible: results["character_bible"] || "",
    creativeBrief: results["creative_brief"] || "",
    canon: results["canon"] || "",
    seasonArc: results["season_arc"] || "",
    verticalEpisodeBeats: results["vertical_episode_beats"] || "",
    scenes: sceneSummaries,
    existingVLNames: (themeAtoms || []).map(a => a.canonical_name),
  };
}

function simpleHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function makeStableKey(projectId, canonicalName) {
  return `vl_${simpleHash(projectId + ":" + canonicalName.toUpperCase())}`;
}

async function handleExtract(projectId) {
  const admin = makeAdminClient();
  await recoverStaleRunning(admin, projectId, "visual_language").catch(() => ({}));

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  const { storyOutline, beatSheet, characterBible, creativeBrief, canon, seasonArc, verticalEpisodeBeats, scenes, existingVLNames } = await fetchProjectDocuments(admin, projectId);

  const hasContent = !!(storyOutline || beatSheet || creativeBrief || canon || seasonArc || verticalEpisodeBeats);
  if (!hasContent) {
    return { error: "no_content", message: "No source documents found" };
  }

  const existingStr = existingVLNames.length > 0
    ? `\n\nEXISTING VL ATOMS (DO NOT DUPLICATE):\n${existingVLNames.map(n => `- ${n}`).join("\n")}`
    : "";

  const extractPrompt = `You are a visual storytelling analyst. Identify distinct Visual Language patterns from this story.

Each VL pattern describes HOW the story should be visually expressed -- the visual storytelling concept, NOT camera techniques.

Examples:
- Surveillance Visual Language
- Isolation Visual Language
- Claustrophobic Framing
- Documentary Handheld
- Dreamlike Subjectivity
- Institutional Oppression
- Cosmic Dread Language

For each pattern, respond as JSON with:
- canonical_name (string): short label like "Surveillance Visual Language"
- description (string): 2-3 sentences what this concept IS
- visual_intent (string): narrative purpose
- cinematic_function (string): how it operates conceptually
- pressure_signatures (array): choose from isolation, observation, entrapment, loss_of_control, fragmentation, desire, obsession, paranoia, longing, moral_corrosion

Extract 3-8 VL patterns. Respond with ONLY a JSON array of objects. No markdown.

${storyOutline ? `STORY OUTLINE:\n${storyOutline.substring(0, 5000)}\n\n` : ""}
${beatSheet ? `BEAT SHEET:\n${beatSheet.substring(0, 5000)}\n\n` : ""}
${creativeBrief ? `CREATIVE BRIEF:\n${creativeBrief.substring(0, 3000)}\n\n` : ""}
${canon ? `CANON:\n${canon.substring(0, 3000)}\n\n` : ""}
${scenes ? `SCENE SUMMARIES:\n${scenes.substring(0, 3000)}\n\n` : ""}
${existingStr}
Respond with JSON array.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://iffy-analysis.vercel.app",
      "X-Title": "IFFY VL Atomiser",
    },
    body: JSON.stringify({
      model: "minimax/minimax-m2.7",
      messages: [{ role: "user", content: extractPrompt }],
      temperature: 0.5,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter error: ${response.status} ${err}`);
  }

  const aiData = await response.json();
  const rawContent = aiData.choices?.[0]?.message?.content || "";

  let vlConcepts = [];
  try {
    const cleaned = rawContent.replace(/```json\s*/i, "").replace(/```\s*/i, "").trim();
    vlConcepts = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse: ${rawContent.substring(0, 200)}`);
  }

  if (!Array.isArray(vlConcepts) || vlConcepts.length === 0) {
    throw new Error("No VL concepts returned");
  }

  const existingUpper = new Set(existingVLNames.map(n => n.toUpperCase()));
  const newConcepts = vlConcepts.filter(c => !existingUpper.has((c.canonical_name || "").toUpperCase()));

  if (newConcepts.length === 0) {
    return { created: 0, message: "All VL concepts already exist" };
  }

  const now = new Date().toISOString();
  let created = 0;
  for (const concept of newConcepts) {
    const stableKey = makeStableKey(projectId, concept.canonical_name);
    const { error: insertErr } = await admin.from("visual_language_atoms").insert({
      project_id: projectId,
      stable_key: stableKey,
      canonical_name: concept.canonical_name,
      description: concept.description || "",
      visual_intent: concept.visual_intent || "",
      cinematic_function: concept.cinematic_function || "",
      pressure_signatures: concept.pressure_signatures || [],
      confidence: 0,
      generation_status: "pending",
      readiness_state: "stub",
      attributes: {},
      created_at: now,
      updated_at: now,
    });

    if (insertErr) {
      if (insertErr.code === "23505") continue;
      throw new Error(`Insert error: ${insertErr.message}`);
    }
    created++;
  }

  return { created, concepts: newConcepts.map(c => c.canonical_name) };
}

async function handleStatus(projectId) {
  const admin = makeAdminClient();
  await recoverStaleRunning(admin, projectId, "visual_language").catch(() => ({}));

  const { data: atoms, error } = await admin
    .from("visual_language_atoms")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load: ${error.message}`);

  const enriched = await Promise.all((atoms || []).map(async (atom) => {
    const { data: projection } = await admin
      .from("visual_language_projections")
      .select("*")
      .eq("vl_atom_id", atom.id)
      .maybeSingle();

    const { count: outCount } = await admin
      .from("visual_language_relations")
      .select("id", { count: "exact", head: true })
      .eq("from_atom_id", atom.id);

    const { count: inCount } = await admin
      .from("visual_language_relations")
      .select("id", { count: "exact", head: true })
      .eq("to_atom_id", atom.id);

    return { ...atom, projection: projection || null, outgoing_relations: outCount || 0, incoming_relations: inCount || 0 };
  }));

  return { atoms: enriched, count: enriched.length };
}

async function handleResetFailed(projectId) {
  const admin = makeAdminClient();
  await recoverStaleRunning(admin, projectId, "visual_language").catch(() => ({}));

  const { count, error } = await admin
    .from("visual_language_atoms")
    .update({ generation_status: "pending", updated_at: new Date().toISOString() })
    .in("generation_status", ["failed", "running"])
    .eq("project_id", projectId)
    .select("id", { count: "exact", head: true });

  if (error) throw new Error(`Reset error: ${error.message}`);
  return { reset: count || 0 };
}

async function handleGenerate(projectId) {
  const admin = makeAdminClient();
  await recoverStaleRunning(admin, projectId, "visual_language").catch(() => ({}));

  const { data: pendingAtoms, error: fetchErr } = await admin
    .from("visual_language_atoms")
    .select("id, canonical_name, description, visual_intent, cinematic_function, pressure_signatures, attributes")
    .eq("project_id", projectId)
    .eq("generation_status", "pending");

  if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);
  if (!pendingAtoms || pendingAtoms.length === 0) {
    return { spawned: false, message: "No pending VL atoms" };
  }

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  const atomIds = pendingAtoms.map(a => a.id);
  await admin
    .from("visual_language_atoms")
    .update({ generation_status: "running", updated_at: new Date().toISOString() })
    .in("id", atomIds);

  const { scenes, existingVLNames } = await fetchProjectDocuments(admin, projectId);
  const { data: allVLAtoms } = await admin
    .from("visual_language_atoms")
    .select("id, canonical_name")
    .eq("project_id", projectId)
    .neq("generation_status", "failed");

  const atomIdByName = new Map();
  const atomNameById = new Map();
  for (const a of allVLAtoms || []) {
    atomIdByName.set(a.canonical_name.toUpperCase(), a.id);
    atomNameById.set(a.id, a.canonical_name);
  }

  const existingStr = existingVLNames.length > 0
    ? `\n\nTARGET VL ATOMS:\n${existingVLNames.map(n => `- ${n}`).join("\n")}`
    : "";

  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(
      (async () => {
        for (const atom of pendingAtoms) {
          try {
            console.log(`Generating: ${atom.canonical_name}`);

            const genPrompt = `Generate projection data and relations for VL concept: "${atom.canonical_name}"

Description: ${atom.description || ""}
Visual Intent: ${atom.visual_intent || ""}
Cinematic Function: ${atom.cinematic_function || ""}
Pressure: ${(atom.pressure_signatures || []).join(", ")}

TASK 1: Generate CPIE-compatible projection:
- colour_philosophy, contrast_model, lighting_philosophy, shadow_philosophy, lens_philosophy
- saturation_profile, palette_bias, texture_philosophy, atmosphere_philosophy
- focus_philosophy, depth_philosophy, realism_level, visual_scale

TASK 2: Generate relations to other VL atoms using:
- enables, depends_on, evolves_into, contrasts_with, mirrors, visualises, intensifies, resolves

Respond with ONLY JSON: {"projection": {all 13 fields}, "relations": [{target_name, relation_type, confidence}]}
${existingStr}
${scenes ? `SCENE CONTEXT:\n${scenes.substring(0, 2000)}\n` : ""}
No markdown.`;

            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${openrouterKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://iffy-analysis.vercel.app",
                "X-Title": "IFFY VL Atomiser",
              },
              body: JSON.stringify({
                model: "minimax/minimax-m2.7",
                messages: [{ role: "user", content: genPrompt }],
                temperature: 0.7,
                max_tokens: 3000,
              }),
            });

            if (!response.ok) {
              console.error(`OpenRouter error for ${atom.canonical_name}: ${response.status}`);
              await admin.from("visual_language_atoms").update({ generation_status: "failed", updated_at: new Date().toISOString() }).eq("id", atom.id);
              continue;
            }

            const aiData = await response.json();
            const rawContent = aiData.choices?.[0]?.message?.content || "";

            let genResult = {};
            try {
              const cleaned = rawContent.replace(/^\`\`\`json\s*/i, "").replace(/^\`\`\`\s*/i, "").replace(/\`\`\`\s*$/i, "").trim();
              genResult = JSON.parse(cleaned);
            } catch {
              console.error(`Parse error for ${atom.canonical_name}`);
              await admin.from("visual_language_atoms").update({ generation_status: "failed", updated_at: new Date().toISOString() }).eq("id", atom.id);
              continue;
            }

            // Upsert projection
            const proj = genResult.projection || {};
            await admin.from("visual_language_projections").upsert({
              project_id: projectId,
              vl_atom_id: atom.id,
              colour_philosophy: proj.colour_philosophy || "",
              contrast_model: proj.contrast_model || "",
              lighting_philosophy: proj.lighting_philosophy || "",
              shadow_philosophy: proj.shadow_philosophy || "",
              lens_philosophy: proj.lens_philosophy || "",
              saturation_profile: proj.saturation_profile || "",
              palette_bias: proj.palette_bias || "",
              texture_philosophy: proj.texture_philosophy || "",
              atmosphere_philosophy: proj.atmosphere_philosophy || "",
              focus_philosophy: proj.focus_philosophy || "",
              depth_philosophy: proj.depth_philosophy || "",
              realism_level: proj.realism_level || "",
              visual_scale: proj.visual_scale || "",
              provenance: "atomiser_generated",
              confidence: 70,
            }).onConflict("project_id,vl_atom_id").merge();

            // Insert relations
            const relations = genResult.relations || [];
            for (const rel of relations) {
              const targetId = atomIdByName.get((rel.target_name || "").toUpperCase());
              if (!targetId || targetId === atom.id) continue;

              await admin.from("visual_language_relations").insert({
                project_id: projectId,
                from_atom_id: atom.id,
                to_atom_id: targetId,
                relation_type: rel.relation_type,
                confidence: rel.confidence || 50,
                provenance: "atomiser_generated",
              }).catch(() => {});
            }

            await admin.from("visual_language_atoms").update({
              generation_status: "complete",
              readiness_state: "generated",
              confidence: 75,
              updated_at: new Date().toISOString(),
            }).eq("id", atom.id);

            console.log(`Done: ${atom.canonical_name}`);
          } catch (err) {
            console.error(`Error: ${err.message}`);
            await admin.from("visual_language_atoms").update({ generation_status: "failed", updated_at: new Date().toISOString() }).eq("id", atom.id);
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

    console.log(`vl-atomiser: action=${action} project=${projectId}`);

    let result;
    switch (action) {
      case "extract": result = await handleExtract(projectId); break;
      case "generate": result = await handleGenerate(projectId); break;
      case "status": result = await handleStatus(projectId); break;
      case "reset-failed":
      case "reset_failed": result = await handleResetFailed(projectId); break;
      default: return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("vl-atomiser error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
