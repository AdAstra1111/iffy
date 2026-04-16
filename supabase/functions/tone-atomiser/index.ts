// @ts-nocheck
/**
 * tone-atomiser — Phase 5
 *
 * Maps the emotional register and mood texture of a project.
 * Generates a global tone profile plus act-level breakdown.
 *
 * Actions:
 *   extract      — create a single tone atom stub (tone is project-level)
 *   generate     — LLM-generate rich tone attributes (background)
 *   status       — return all tone atoms for project
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

async function fetchProjectContent(admin: any, projectId: string) {
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

  return { storyOutline: results["story_outline"] || "", beatSheet: results["beat_sheet"] || "", scenes };
}

async function handleExtract(projectId: string) {
  const admin = makeAdminClient();

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
  const admin = makeAdminClient();
  const { data: atoms, error } = await admin
    .from("atoms").select("*").eq("project_id", projectId).eq("atom_type", "tone");
  if (error) throw new Error(`Failed to load tone atoms: ${error.message}`);
  return { atoms: atoms || [], count: atoms?.length || 0 };
}

async function handleResetFailed(projectId: string) {
  const admin = makeAdminClient();
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

  const { storyOutline, beatSheet, scenes } = await fetchProjectContent(admin, projectId);
  const atomIds = pendingAtoms.map((a: any) => a.id);
  await admin.from("atoms").update({ generation_status: "running", updated_at: new Date().toISOString() }).in("id", atomIds);

  // @ts-ignore
  EdgeRuntime.waitUntil(
    (async () => {
      for (const atom of pendingAtoms) {
        try {
          const sceneContexts = scenes.map((s: any) =>
            `[${s.slugline}]: ${s.summary.substring(0, 150)} | emotional: ${s.emotional_register} | themes: ${(s.thematic_tags || []).join(", ")}`
          ).join("\n");

          const prompt = `You are an emotional tone analyst. Analyse this project's tone and generate a complete ToneAtomAttributes JSON object.

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

          console.log(`✓ Generated tone atom`);
        } catch (err) {
          console.error(`Error for tone atom:`, err);
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
    console.error("tone-atomiser error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
