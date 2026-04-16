// @ts-nocheck
/**
 * dialogue-atomiser — Phase 5
 *
 * Extracts speech identity per character from feature_script.
 * Generates linguistic fingerprints: register, vocabulary, sentence structure,
 * accent guidance, signature phrases, verbal tics.
 *
 * Actions:
 *   extract      — derive character list from feature_script → create dialogue atom stubs
 *   generate     — LLM-analyse dialogue patterns per character → rich attributes (background)
 *   status       — return all dialogue atoms for project
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

async function fetchCharacterDialogue(admin: any, projectId: string) {
  // Get character atoms to have character list + IDs
  const { data: charAtoms } = await admin
    .from("atoms")
    .select("id, entity_id, canonical_name, attributes")
    .eq("project_id", projectId)
    .eq("atom_type", "character")
    .in("generation_status", ["completed", "complete"]);

  // Get feature_script for dialogue content
  const { data: docs } = await admin
    .from("project_documents")
    .select("id, document_type, current_version_id")
    .eq("project_id", projectId)
    .eq("document_type", "feature_script");

  let scriptContent = "";
  if (docs && docs.length > 0 && docs[0].current_version_id) {
    const { data: version } = await admin
      .from("project_document_versions")
      .select("plaintext")
      .eq("id", docs[0].current_version_id)
      .single();
    scriptContent = version?.plaintext || "";
  }

  return { characters: charAtoms || [], scriptContent };
}

async function handleExtract(projectId: string) {
  const admin = makeAdminClient();
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  const { characters, scriptContent } = await fetchCharacterDialogue(admin, projectId);

  if (characters.length === 0) {
    return { error: "no_characters", message: "Generate character atoms first" };
  }

  if (!scriptContent) {
    return { error: "no_script", message: "No feature_script found for this project" };
  }

  // Check existing dialogue atoms
  const { data: existingAtoms } = await admin
    .from("atoms").select("entity_id")
    .eq("project_id", projectId).eq("atom_type", "dialogue");

  const existingEntityIds = new Set((existingAtoms || []).map((a: any) => a.entity_id).filter(Boolean));

  const now = new Date().toISOString();
  const toInsert = [];

  for (const char of characters) {
    if (existingEntityIds.has(char.entity_id)) continue;

    toInsert.push({
      project_id: projectId,
      atom_type: "dialogue",
      entity_id: char.entity_id,
      canonical_name: char.canonical_name,
      priority: 50,
      confidence: 0,
      readiness_state: "stub",
      generation_status: "pending",
      attributes: {
        characterName: char.canonical_name,
        characterId: char.entity_id,
        speechRegister: "",
        vocabularyComplexity: "",
        sentenceStructure: "",
        accentGuidance: "",
        dialectMarkers: [],
        signaturePhrases: [],
        verbalTics: [],
        speechTempo: "",
        emotionalRange: "",
        subtextCapability: "",
        expositionStyle: "",
        dialogueTags: [],
        sampleLines: [],
        audiencePerception: "",
        castingDirection: "",
        dialogueWeakness: "",
        confidence: 0,
        readinessBadge: "foundation",
        generationStatus: "pending",
      },
      created_at: now,
      updated_at: now,
    });
  }

  if (toInsert.length === 0) {
    return { created: 0, message: "All dialogue atoms already exist" };
  }

  const { data: inserted, error } = await admin.from("atoms").insert(toInsert).select("id");
  if (error) throw new Error(`Failed to insert dialogue atoms: ${error.message}`);
  return { created: inserted?.length || 0 };
}

async function handleStatus(projectId: string) {
  const admin = makeAdminClient();
  const { data: atoms, error } = await admin
    .from("atoms").select("*").eq("project_id", projectId).eq("atom_type", "dialogue")
    .order("priority", { ascending: false });
  if (error) throw new Error(`Failed to load dialogue atoms: ${error.message}`);
  return { atoms: atoms || [], count: atoms?.length || 0 };
}

async function handleResetFailed(projectId: string) {
  const admin = makeAdminClient();
  const { count, error } = await admin
    .from("atoms")
    .update({ generation_status: "pending", updated_at: new Date().toISOString() })
    .in("generation_status", ["failed", "running"])
    .eq("project_id", projectId).eq("atom_type", "dialogue")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Failed to reset: ${error.message}`);
  return { reset: count || 0 };
}

async function handleGenerate(projectId: string) {
  const admin = makeAdminClient();
  const { data: pendingAtoms, error: fetchErr } = await admin
    .from("atoms").select("id, entity_id, canonical_name, attributes")
    .eq("project_id", projectId).eq("atom_type", "dialogue").eq("generation_status", "pending");
  if (fetchErr) throw new Error(`Failed to fetch: ${fetchErr.message}`);
  if (!pendingAtoms || pendingAtoms.length === 0) return { spawned: false, message: "No pending dialogue atoms" };

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  const { characters, scriptContent } = await fetchCharacterDialogue(admin, projectId);
  const charMap = new Map(characters.map((c: any) => [c.entity_id || c.id, c]));

  // Extract dialogue for each pending character
  const atomIds = pendingAtoms.map((a: any) => a.id);
  await admin.from("atoms").update({ generation_status: "running", updated_at: new Date().toISOString() }).in("id", atomIds);

  // @ts-ignore
  EdgeRuntime.waitUntil(
    (async () => {
      for (const atom of pendingAtoms) {
        try {
          const charName = atom.canonical_name;

          // Extract all dialogue lines for this character from the script
          // Simple extraction: find paragraphs with character name in slugline or as speaker
          const dialoguePattern = new RegExp(
            `(?:^|\\n)([^\\n]*(?:${charName.replace(/[.*+?^${}()|[\]]\\]/g, '\\$&')}|${charName.toUpperCase()})[^\\n]*\\n+)([\\s\\S]{0,800})`,
            "i"
          );

          let dialogueExcerpt = "";
          const match = scriptContent.match(dialoguePattern);
          if (match) {
            dialogueExcerpt = match[0].substring(0, 1500);
          } else {
            // Fall back: first 1000 chars of script
            dialogueExcerpt = scriptContent.substring(0, 1000);
          }

          const prompt = `You are a dialogue analyst. Analyse the speech patterns of the character "${charName}" from the screenplay excerpt below and generate a complete DialogueAtomAttributes JSON object.

SCREENPLAY EXCERPT (${charName}'s scenes):
${dialogueExcerpt || "No dialogue found for this character in the provided script."}

Output ONLY a valid JSON object (no markdown, no commentary) with ALL fields:
- speechRegister (string: military_precision | formal | colloquial | educated | working_class)
- vocabularyComplexity (string: simple | moderate | sophisticated | literary)
- sentenceStructure (string: short_and_punchy | long_and_complex | fragmented | mixed)
- accentGuidance (string: Received Pronunciation | American_Mid_Atlantic | German | North_African_Arabic | etc)
- dialectMarkers (array of 3-5 dialect/speech characteristic strings, e.g. ["clipped consonants", "formal address", "military slang"])
- signaturePhrases (array of 3-5 phrase strings this character repeat uses)
- verbalTics (array of 2-4 filler words, repeated phrases, or catchphrases)
- speechTempo (string: rapid | measured | deliberate | slow_burn)
- emotionalRange (string: narrow | moderate | wide | extreme)
- subtextCapability (string: how much subtext this character carries in dialogue)
- expositionStyle (string: direct | indirect | avoids_exposition | explanation_heavy)
- dialogueTags (array of 4-6 keyword strings, e.g. ["military", "sardonic", "WWII", "clipped"])
- sampleLines (array of 3-5 of the best/most characteristic lines for this character)
- audiencePerception (string: how audiences will read this character from dialogue alone)
- castingDirection (string: actor type and accent requirements)
- dialogueWeakness (string: any detected issues — exposition dumps, on_the_nose, generic — or "none detected")
- confidence (number 0.0-1.0)
- readinessBadge (string: "foundation" | "rich" | "verified")`;

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${openrouterKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://iffy-analysis.vercel.app", "X-Title": "IFFY Dialogue Atomiser" },
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

          const finalAttributes = {
            ...attrs,
            characterName: charName,
            characterId: atom.entity_id,
            generationStatus: "completed",
          };

          await admin.from("atoms").update({
            generation_status: "complete", readiness_state: "generated",
            confidence: Math.round((attrs.confidence || 0.5) * 100),
            attributes: finalAttributes, updated_at: new Date().toISOString(),
          }).eq("id", atom.id);

          console.log(`✓ Generated dialogue atom: ${charName}`);
        } catch (err) {
          console.error(`Error for dialogue atom ${atom.id}:`, err);
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
    console.error("dialogue-atomiser error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
