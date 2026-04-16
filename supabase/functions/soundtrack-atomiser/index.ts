// @ts-nocheck
/**
 * soundtrack-atomiser — Phase 5
 *
 * Derives the music and audio identity of the project.
 * Analyses tonal/emotional data to determine sonic palette.
 *
 * Actions:
 *   extract      — create a single soundtrack atom stub (project-level)
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

async function fetchProjectData(admin: any, projectId: string) {
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
    emotionalData,
  };
}

async function handleExtract(projectId: string) {
  const admin = makeAdminClient();

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
    .from("atoms").select("id")
    .eq("project_id", projectId).eq("atom_type", "soundtrack").eq("generation_status", "pending");
  if (fetchErr) throw new Error(`Failed to fetch: ${fetchErr.message}`);
  if (!pendingAtoms || pendingAtoms.length === 0) return { spawned: false, message: "No pending soundtrack atoms" };

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  const { storyOutline, beatSheet, emotionalData } = await fetchProjectData(admin, projectId);
  const atomIds = pendingAtoms.map((a: any) => a.id);
  await admin.from("atoms").update({ generation_status: "running", updated_at: new Date().toISOString() }).in("id", atomIds);

  // @ts-ignore
  EdgeRuntime.waitUntil(
    (async () => {
      for (const atom of pendingAtoms) {
        try {
          const prompt = `You are a film music supervisor and composer consultant. Analyse this project's story, genre, era, and emotional texture and generate a complete SoundtrackAtomAttributes JSON object.

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

          console.log(`✓ Generated soundtrack atom`);
        } catch (err) {
          console.error(`Error for soundtrack atom:`, err);
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
