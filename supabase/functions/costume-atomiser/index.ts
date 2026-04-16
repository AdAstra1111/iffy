// @ts-nocheck
/**
 * costume-atomiser — Phase 5
 *
 * Extracts costume entities from character atoms and generates
 * rich production-ready costume atoms via OpenRouter MiniMax M2.7.
 *
 * Actions:
 *   extract      — create pending costume atom stubs from completed character atoms
 *   generate     — LLM-generate attributes for pending costume atoms (background)
 *   status       — return all costume atoms for project
 *   reset_failed — reset failed/running atoms back to pending
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function makeStubAttributes(charName: string, charId: string) {
  return {
    characterName: charName,
    characterId: charId,
    primaryOutfit: "",
    eraAlignment: "",
    silhouette: "",
    dominantColors: [],
    fabricAndTexture: [],
    keyPieces: [],
    characterSignal: "",
    condition: "",
    distinctiveElements: [],
    fitAndMovement: "",
    associatedLocations: [],
    associatedCharacters: [],
    wardrobeEvolution: [],
    alternateOutfits: [],
    productionComplexity: "moderate",
    wardrobeRequirements: [],
    specialConsiderations: [],
    wigOrHairSystem: "",
    makeupRequirements: [],
    referenceImageTerms: [],
    costumeBudgetEstimate: "",
    confidence: 0,
    readinessBadge: "foundation",
    generationStatus: "pending",
  };
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function handleExtract(projectId: string) {
  const admin = makeAdminClient();

  // 1. Check that completed character atoms exist
  const { data: charAtoms, error: charErr } = await admin
    .from("atoms")
    .select("id, entity_id, canonical_name, attributes, confidence")
    .eq("project_id", projectId)
    .eq("atom_type", "character")
    .in("generation_status", ["completed", "complete"]);

  if (charErr) throw new Error(`Failed to load character atoms: ${charErr.message}`);

  if (!charAtoms || charAtoms.length === 0) {
    return {
      error: "character_atoms_not_ready",
      message: "Generate character atoms first",
    };
  }

  console.log(`Found ${charAtoms.length} completed character atoms`);

  // 2. Get existing costume atoms to avoid duplicates
  const { data: existingCostumes } = await admin
    .from("atoms")
    .select("entity_id")
    .eq("project_id", projectId)
    .eq("atom_type", "costume");

  const existingEntityIds = new Set<string>(
    (existingCostumes || []).map((a) => a.entity_id).filter(Boolean)
  );

  // 3. Build costume stubs for each character atom
  const toInsert: any[] = [];
  const now = new Date().toISOString();

  for (const charAtom of charAtoms) {
    // Skip if costume atom already exists for this character
    if (existingEntityIds.has(charAtom.entity_id)) {
      console.log(`Skipping existing costume atom for: ${charAtom.canonical_name}`);
      continue;
    }

    const charName = (charAtom.attributes as any)?.canonicalName || charAtom.canonical_name;

    toInsert.push({
      project_id: projectId,
      atom_type: "costume",
      entity_id: charAtom.entity_id,
      canonical_name: `${charName} — Primary Costume`,
      priority: 50,
      confidence: 0,
      readiness_state: "stub",
      generation_status: "pending",
      attributes: makeStubAttributes(charName, charAtom.entity_id),
      created_at: now,
      updated_at: now,
    });
  }

  if (toInsert.length === 0) {
    return { created: 0, message: "All costume atoms already exist" };
  }

  // 4. Insert in batches of 50
  let totalCreated = 0;
  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50);
    const { error: insertErr, data: inserted } = await admin
      .from("atoms")
      .insert(batch)
      .select("id");

    if (insertErr) {
      console.error("Insert batch error:", insertErr);
      throw new Error(`Failed to insert costume atom batch: ${insertErr.message}`);
    }
    totalCreated += inserted?.length || 0;
  }

  console.log(`Created ${totalCreated} costume atom stubs`);
  return { created: totalCreated };
}

async function handleStatus(projectId: string) {
  const admin = makeAdminClient();

  const { data: atoms, error } = await admin
    .from("atoms")
    .select("*")
    .eq("project_id", projectId)
    .eq("atom_type", "costume")
    .order("canonical_name", { ascending: true });

  if (error) throw new Error(`Failed to load costume atoms: ${error.message}`);

  return { atoms: atoms || [], count: atoms?.length || 0 };
}

async function handleResetFailed(projectId: string) {
  const admin = makeAdminClient();

  const { count, error } = await admin
    .from("atoms")
    .update({ generation_status: "pending", updated_at: new Date().toISOString() })
    .in("generation_status", ["failed", "running"])
    .eq("project_id", projectId)
    .eq("atom_type", "costume")
    .select("id", { count: "exact", head: true });

  if (error) throw new Error(`Failed to reset atoms: ${error.message}`);

  return { reset: count || 0 };
}

async function handleGenerate(projectId: string) {
  const admin = makeAdminClient();

  // Get pending costume atoms
  const { data: pendingAtoms, error: fetchErr } = await admin
    .from("atoms")
    .select("id, entity_id, canonical_name, attributes")
    .eq("project_id", projectId)
    .eq("atom_type", "costume")
    .eq("generation_status", "pending");

  if (fetchErr) throw new Error(`Failed to fetch pending atoms: ${fetchErr.message}`);
  if (!pendingAtoms || pendingAtoms.length === 0) {
    return { spawned: false, message: "No pending costume atoms to generate" };
  }

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  // Mark all as running immediately
  const atomIds = pendingAtoms.map((a) => a.id);
  await admin
    .from("atoms")
    .update({ generation_status: "running", updated_at: new Date().toISOString() })
    .in("id", atomIds);

  // Background generation
  // @ts-ignore — EdgeRuntime is Deno Deploy global
  EdgeRuntime.waitUntil(
    (async () => {
      for (const atom of pendingAtoms) {
        try {
          const charName = (atom.attributes as any)?.characterName || atom.canonical_name.replace(" — Primary Costume", "");
          console.log(`Generating costume atom: ${charName}`);

          // Get associated character atom for physical description
          let characterAtomDescription = "";
          let characterArcSummary = "";

          if (atom.entity_id) {
            const { data: charAtom } = await admin
              .from("atoms")
              .select("attributes")
              .eq("project_id", projectId)
              .eq("atom_type", "character")
              .eq("entity_id", atom.entity_id)
              .in("generation_status", ["completed", "complete"])
              .maybeSingle();

            if (charAtom?.attributes) {
              const ca = charAtom.attributes as any;
              const parts: string[] = [];
              if (ca.age_estimate || ca.age) parts.push(`Age: ${ca.age_estimate || ca.age}`);
              if (ca.build) parts.push(`Build: ${ca.build}`);
              if (ca.height_estimate) parts.push(`Height: ${ca.height_estimate}`);
              if (ca.skin_tone) parts.push(`Skin tone: ${ca.skin_tone}`);
              if (ca.hair) parts.push(`Hair: ${ca.hair}`);
              if (ca.eyes) parts.push(`Eyes: ${ca.eyes}`);
              if (ca.physical_markings) {
                const markings = Array.isArray(ca.physical_markings)
                  ? ca.physical_markings.join(", ")
                  : String(ca.physical_markings);
                if (markings) parts.push(`Physical markings: ${markings}`);
              }
              if (ca.distinctive_features) parts.push(`Distinctive features: ${ca.distinctive_features}`);
              if (ca.physical_description) parts.push(`Physical description: ${ca.physical_description}`);
              if (ca.wardrobe_notes) parts.push(`Wardrobe notes: ${ca.wardrobe_notes}`);
              if (ca.cultural_context) parts.push(`Cultural context: ${ca.cultural_context}`);
              if (ca.movement_gait) parts.push(`Movement/Gait: ${ca.movement_gait}`);
              characterAtomDescription = parts.join("\n");
              characterArcSummary = ca.wardrobe_notes || "";
            }
          }

          // Get scene contexts where this character appears
          let sceneContexts: string[] = [];
          let associatedLocations: string[] = [];
          let sceneCount = 0;

          if (atom.entity_id) {
            const { data: charLinks } = await admin
              .from("narrative_scene_entity_links")
              .select("scene_id")
              .eq("project_id", projectId)
              .eq("entity_id", atom.entity_id)
              .eq("relation_type", "character_present")
              .limit(100);

            const linkedSceneIds = (charLinks || []).map((l) => l.scene_id);
            sceneCount = linkedSceneIds.length;

            if (linkedSceneIds.length > 0) {
              const { data: sceneVersions } = await admin
                .from("scene_graph_versions")
                .select("scene_id, slugline, summary, content, tension_delta")
                .eq("project_id", projectId)
                .in("scene_id", linkedSceneIds.slice(0, 100))
                .order("tension_delta", { ascending: false })
                .limit(10);

              for (const sv of sceneVersions || []) {
                const excerpt = (sv.summary || sv.content || "").substring(0, 300);
                sceneContexts.push(`[${sv.slugline || "SCENE"}] (tension: ${sv.tension_delta || 0}) — ${excerpt}`);
              }

              // Get location names from these scenes
              const sceneIdsForLoc = linkedSceneIds.slice(0, 30);
              const { data: locLinks } = await admin
                .from("narrative_scene_entity_links")
                .select("entity_id")
                .eq("project_id", projectId)
                .eq("relation_type", "location_present")
                .in("scene_id", sceneIdsForLoc);

              if (locLinks && locLinks.length > 0) {
                const locEntityIds = [...new Set(locLinks.map((l) => l.entity_id))];
                const { data: locEntities } = await admin
                  .from("narrative_entities")
                  .select("canonical_name")
                  .in("id", locEntityIds.slice(0, 10));

                associatedLocations = (locEntities || []).map((e) => e.canonical_name);
              }
            }
          }

          // Get character relations for contrast/similarity context
          let relations: string[] = [];
          if (atom.entity_id) {
            const { data: relRows } = await admin
              .from("narrative_entity_relations")
              .select("target_entity_id, relation_type")
              .eq("project_id", projectId)
              .eq("source_entity_id", atom.entity_id)
              .limit(10);

            if (relRows && relRows.length > 0) {
              const relEntityIds = relRows.map((r) => r.target_entity_id);
              const { data: relEntities } = await admin
                .from("narrative_entities")
                .select("id, canonical_name")
                .in("id", relEntityIds);

              const entityNameMap = new Map((relEntities || []).map((e) => [e.id, e.canonical_name]));
              relations = relRows.map((r) => `${entityNameMap.get(r.target_entity_id) || "Unknown"} (${r.relation_type})`);
            }
          }

          const prompt = `You are a costume designer and character visual analyst. Generate a production-ready costume atom for the primary outfit of the following character.

CHARACTER: ${charName}
CHARACTER PHYSICAL PROFILE:
${characterAtomDescription || "No physical profile available — infer from character name and story context."}
CHARACTER ARC: ${characterArcSummary || "Unknown"}
SCENE COUNT: ${sceneCount}

ASSOCIATED CHARACTERS (for contrast/similarity): ${relations.length > 0 ? relations.join(", ") : "unknown"}
ASSOCIATED LOCATIONS (era/setting context): ${associatedLocations.length > 0 ? associatedLocations.join(", ") : "unknown"}

SCENE CONTEXTS (wardrobe cues):
${sceneContexts.length > 0 ? sceneContexts.join("\n\n") : "No scene context available — infer from character name and story world context."}

Generate a complete CostumeAtomAttributes JSON object. Focus on:
1. SILHOUETTE + ERA ALIGNMENT — what era/style does this outfit signal?
2. PRIMARY OUTFIT DESCRIPTION — specific enough to build from
3. KEY PIECES — the 3-5 statement items that define the look
4. CHARACTER SIGNAL — what does the costume COMMUNICATE about this person?
5. WARDROBE EVOLUTION — how does the costume change across acts (if at all)?
6. PRODUCTION REQUIREMENTS — how hard to build/rent?

Output ONLY a valid JSON object (no markdown, no commentary) with ALL of the following fields:
- characterName (string — use: "${charName}")
- characterId (string — use: "${atom.entity_id || ''}")
- primaryOutfit (string — 2-3 sentence description)
- eraAlignment (string — e.g. "1940s gangster", "contemporary military")
- silhouette (string — e.g. "broad-shouldered power suit", "slouchy streetwear")
- dominantColors (array of 2-4 colors)
- fabricAndTexture (array of 3-5 fabric details)
- keyPieces (array of 3-5 statement pieces)
- characterSignal (string — what does the costume communicate about this character?)
- condition (string — pristine/worn/deliberately distressed)
- distinctiveElements (array of 3-5 unique details)
- fitAndMovement (string — tailored power/flowing ease/restricted)
- associatedLocations (array of location names)
- associatedCharacters (array of character names with similar/contrasting aesthetic)
- wardrobeEvolution (array of objects with fields: act, description, trigger — only if costume changes meaningfully, else empty array)
- alternateOutfits (array of objects with fields: sceneSlugline, description, reasonForChange — only if multiple distinct outfits, else empty array)
- productionComplexity (string: "simple" / "moderate" / "complex")
- wardrobeRequirements (array of sourcing/fabrication needs)
- specialConsiderations (array of production flags: stunts, weather, quick changes)
- wigOrHairSystem (string — if applicable, else empty string)
- makeupRequirements (array — if applicable, else empty array)
- referenceImageTerms (array of 3-5 mood board search terms)
- costumeBudgetEstimate (string — e.g. "$200-500 rental", "$1500 custom build")
- confidence (number 0.0-1.0)
- readinessBadge (string: "foundation" / "rich" / "verified")
- generationStatus (string: "completed")

confidence should reflect how much visual and narrative information was available to ground the generation.`;

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openrouterKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://iffy-analysis.vercel.app",
              "X-Title": "IFFY Costume Atomiser",
            },
            body: JSON.stringify({
              model: "minimax/minimax-m2.7",
              messages: [
                {
                  role: "user",
                  content: prompt,
                },
              ],
              temperature: 0.7,
              max_tokens: 2000,
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            console.error(`OpenRouter error for ${charName}:`, response.status, errText);
            await admin
              .from("atoms")
              .update({
                generation_status: "failed",
                updated_at: new Date().toISOString(),
              })
              .eq("id", atom.id);
            continue;
          }

          const aiData = await response.json();
          const rawContent = aiData.choices?.[0]?.message?.content || "";

          // Parse JSON from response
          let generatedAttrs: Record<string, any> = {};
          try {
            const cleaned = rawContent
              .replace(/^```json\s*/i, "")
              .replace(/^```\s*/i, "")
              .replace(/```\s*$/i, "")
              .trim();
            generatedAttrs = JSON.parse(cleaned);
          } catch (parseErr) {
            console.error(`Failed to parse JSON for ${charName}:`, parseErr, "Raw:", rawContent.substring(0, 200));
            await admin
              .from("atoms")
              .update({
                generation_status: "failed",
                updated_at: new Date().toISOString(),
              })
              .eq("id", atom.id);
            continue;
          }

          // Ensure required fields
          const finalAttributes = {
            ...generatedAttrs,
            characterName: charName,
            characterId: atom.entity_id || "",
            generationStatus: "completed",
          };

          const { error: updateErr } = await admin
            .from("atoms")
            .update({
              generation_status: "complete",
              readiness_state: "generated",
              confidence: Math.round((generatedAttrs.confidence || 0.5) * 100),
              attributes: finalAttributes,
              updated_at: new Date().toISOString(),
            })
            .eq("id", atom.id);

          if (updateErr) {
            console.error(`Failed to update atom ${atom.id}:`, updateErr);
          } else {
            console.log(`✓ Generated: ${charName} — Primary Costume`);
          }
        } catch (atomErr: any) {
          const errMsg = atomErr?.message || String(atomErr);
          console.error(`Error processing atom ${atom.id} (${atom.canonical_name}):`, errMsg);
          await admin
            .from("atoms")
            .update({
              generation_status: "failed",
              attributes: { ...(atom.attributes as any || {}), _error: errMsg },
              updated_at: new Date().toISOString(),
            })
            .eq("id", atom.id);
        }
      }

      console.log(`Costume atomiser generation complete for ${pendingAtoms.length} atoms`);
    })()
  );

  return { spawned: true, count: pendingAtoms.length };
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, project_id: projectId } = body;

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "Missing project_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Missing action. Use: extract | generate | status | reset_failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`costume-atomiser: action=${action} project=${projectId}`);

    let result: any;

    switch (action) {
      case "extract":
        result = await handleExtract(projectId);
        break;
      case "generate":
        result = await handleGenerate(projectId);
        break;
      case "status":
        result = await handleStatus(projectId);
        break;
      case "reset_failed":
        result = await handleResetFailed(projectId);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}. Use: extract | generate | status | reset_failed` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("costume-atomiser error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
