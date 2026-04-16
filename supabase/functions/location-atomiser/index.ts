// @ts-nocheck
/**
 * location-atomiser — Phase 5
 *
 * Extracts location entities from narrative_entities and generates
 * rich production-ready location atoms via OpenRouter MiniMax M2.7.
 *
 * Actions:
 *   extract      — create pending atom stubs for all locations in project
 *   generate     — LLM-generate attributes for pending location atoms (background)
 *   status       — return all location atoms for project
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

function makeStubAttributes(
  name: string,
  aliases: string[],
  sceneCount: number
) {
  return {
    canonicalName: name,
    aliases,
    era: "",
    period: "",
    architectureStyle: "",
    settingType: "INT.",
    visualComplexity: "medium",
    signatureArchitecturalFeatures: [],
    dominantColors: [],
    lightingCharacter: "",
    sensoryTexture: [],
    acousticCharacter: "",
    temperatureImpression: "",
    atmosphericMood: [],
    narrativeFunction: "",
    frequencyInScript: sceneCount,
    associatedCharacters: [],
    keyScenes: [],
    thematicSymbolism: "",
    productionComplexity: "moderate",
    setRequirements: [],
    specialConsiderations: [],
    soundstageViability: "",
    castingSuggestions: "",
    moodBoardReference: "",
    confidence: 0,
    readinessBadge: "foundation",
    generationStatus: "pending",
  };
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function handleExtract(projectId: string) {
  const admin = makeAdminClient();

  // 1. Load all location entities for this project
  const { data: locationEntities, error: entErr } = await admin
    .from("narrative_entities")
    .select("id, entity_key, canonical_name, entity_type, scene_count, meta_json")
    .eq("project_id", projectId)
    .eq("entity_type", "location");

  if (entErr) throw new Error(`Failed to load location entities: ${entErr.message}`);
  if (!locationEntities || locationEntities.length === 0) {
    return { created: 0, message: "No location entities found for this project" };
  }

  // 2. Load entity aliases to identify fragment aliases
  const { data: aliasRows } = await admin
    .from("narrative_entity_aliases")
    .select("canonical_entity_id, alias_name")
    .eq("project_id", projectId);

  // Build set of entity IDs that are canonical targets (i.e. they have aliases pointing to them)
  const canonicalEntityIds = new Set<string>(
    (aliasRows || []).map((a) => a.canonical_entity_id)
  );

  // Build map of canonical_entity_id → alias names list
  const aliasMap = new Map<string, string[]>();
  for (const row of aliasRows || []) {
    if (!aliasMap.has(row.canonical_entity_id)) {
      aliasMap.set(row.canonical_entity_id, []);
    }
    aliasMap.get(row.canonical_entity_id)!.push(row.alias_name);
  }

  // 3. Get all entity IDs that ARE aliases themselves (i.e. their canonical_name is found
  //    as an alias_name in the alias table — they are fragment duplicates)
  const allAliasNames = new Set<string>(
    (aliasRows || []).map((a) => a.alias_name.toUpperCase().trim())
  );

  // 4. Also get existing location atoms to avoid duplicates
  const { data: existingAtoms } = await admin
    .from("atoms")
    .select("entity_id")
    .eq("project_id", projectId)
    .eq("atom_type", "location");

  const existingEntityIds = new Set<string>(
    (existingAtoms || []).map((a) => a.entity_id).filter(Boolean)
  );

  // 5. For each canonical location, get scene count from narrative_scene_entity_links
  const entityIds = locationEntities.map((e) => e.id);

  // Batch fetch all location_present links for this project
  const { data: linkRows } = await admin
    .from("narrative_scene_entity_links")
    .select("entity_id, scene_id")
    .eq("project_id", projectId)
    .eq("relation_type", "location_present")
    .in("entity_id", entityIds.slice(0, 500)); // Safety cap

  // Build scene count map
  const sceneLinkMap = new Map<string, Set<string>>();
  for (const link of linkRows || []) {
    if (!sceneLinkMap.has(link.entity_id)) {
      sceneLinkMap.set(link.entity_id, new Set());
    }
    sceneLinkMap.get(link.entity_id)!.add(link.scene_id);
  }

  // 6. Build atom stubs — skip fragments and already-existing atoms
  const toInsert: any[] = [];
  const now = new Date().toISOString();

  for (const entity of locationEntities) {
    // Skip if this entity name looks like a fragment (alias of another entity)
    const nameUpper = entity.canonical_name.toUpperCase().trim();
    if (allAliasNames.has(nameUpper)) {
      console.log(`Skipping fragment alias: ${entity.canonical_name}`);
      continue;
    }

    // Skip if already have an atom for this entity
    if (existingEntityIds.has(entity.id)) {
      console.log(`Skipping existing atom for: ${entity.canonical_name}`);
      continue;
    }

    const aliases = aliasMap.get(entity.id) || [];
    const sceneLinkCount = sceneLinkMap.get(entity.id)?.size || 0;
    // Prefer link count; fall back to entity.scene_count
    const sceneCount = sceneLinkCount > 0 ? sceneLinkCount : (entity.scene_count || 0);

    toInsert.push({
      project_id: projectId,
      atom_type: "location",
      entity_id: entity.id,
      canonical_name: entity.canonical_name,
      priority: Math.min(100, sceneCount * 5 + 10),
      confidence: 0,
      readiness_state: "stub",
      generation_status: "pending",
      attributes: makeStubAttributes(entity.canonical_name, aliases, sceneCount),
      created_at: now,
      updated_at: now,
    });
  }

  if (toInsert.length === 0) {
    return { created: 0, message: "All location atoms already exist or all were fragment aliases" };
  }

  // 7. Insert in batches of 50
  let totalCreated = 0;
  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50);
    const { error: insertErr, data: inserted } = await admin
      .from("atoms")
      .insert(batch)
      .select("id");

    if (insertErr) {
      console.error("Insert batch error:", insertErr);
      throw new Error(`Failed to insert atoms batch: ${insertErr.message}`);
    }
    totalCreated += inserted?.length || 0;
  }

  console.log(`Created ${totalCreated} location atom stubs`);
  return { created: totalCreated };
}

async function handleStatus(projectId: string) {
  const admin = makeAdminClient();

  const { data: atoms, error } = await admin
    .from("atoms")
    .select("*")
    .eq("project_id", projectId)
    .eq("atom_type", "location")
    .order("priority", { ascending: false });

  if (error) throw new Error(`Failed to load location atoms: ${error.message}`);

  return { atoms: atoms || [], count: atoms?.length || 0 };
}

async function handleResetFailed(projectId: string) {
  const admin = makeAdminClient();

  const { count, error } = await admin
    .from("atoms")
    .update({ generation_status: "pending", updated_at: new Date().toISOString() })
    .in("generation_status", ["failed", "running"])
    .eq("project_id", projectId)
    .eq("atom_type", "location")
    .select("id", { count: "exact", head: true });

  if (error) throw new Error(`Failed to reset atoms: ${error.message}`);

  return { reset: count || 0 };
}

async function handleGenerate(projectId: string) {
  const admin = makeAdminClient();

  // Get pending location atoms
  const { data: pendingAtoms, error: fetchErr } = await admin
    .from("atoms")
    .select("id, entity_id, canonical_name, attributes")
    .eq("project_id", projectId)
    .eq("atom_type", "location")
    .eq("generation_status", "pending");

  if (fetchErr) throw new Error(`Failed to fetch pending atoms: ${fetchErr.message}`);
  if (!pendingAtoms || pendingAtoms.length === 0) {
    return { spawned: false, message: "No pending location atoms to generate" };
  }

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  // Mark all as running immediately
  const atomIds = pendingAtoms.map((a) => a.id);
  await admin
    .from("atoms")
    .update({ generation_status: "running", updated_at: new Date().toISOString() })
    .in("id", atomIds);

  // Get entity IDs to look up scene context
  const entityIds = pendingAtoms.map((a) => a.entity_id).filter(Boolean);

  // Background generation
  // @ts-ignore — EdgeRuntime is Deno Deploy global
  EdgeRuntime.waitUntil(
    (async () => {
      for (const atom of pendingAtoms) {
        try {
          console.log(`Generating location atom: ${atom.canonical_name}`);

          // Assemble scene context for this location
          let sceneContexts: string[] = [];
          let associatedCharacters: string[] = [];

          if (atom.entity_id) {
            // Get scene IDs linked to this location (location_present)
            const { data: locationLinks } = await admin
              .from("narrative_scene_entity_links")
              .select("scene_id")
              .eq("project_id", projectId)
              .eq("entity_id", atom.entity_id)
              .eq("relation_type", "location_present")
              .limit(50);

            const linkedSceneIds = (locationLinks || []).map((l) => l.scene_id);

            if (linkedSceneIds.length > 0) {
              // Get top 10 scenes by tension_delta (descending)
              const { data: sceneVersions } = await admin
                .from("scene_graph_versions")
                .select("scene_id, slugline, summary, content, tension_delta, characters_present")
                .eq("project_id", projectId)
                .in("scene_id", linkedSceneIds.slice(0, 100))
                .order("tension_delta", { ascending: false })
                .limit(10);

              for (const sv of sceneVersions || []) {
                const excerpt = (sv.summary || sv.content || "").substring(0, 300);
                sceneContexts.push(`[${sv.slugline || "SCENE"}] (tension: ${sv.tension_delta || 0}) — ${excerpt}`);

                // Collect characters
                if (sv.characters_present && Array.isArray(sv.characters_present)) {
                  associatedCharacters.push(...sv.characters_present);
                }
              }

              // Dedupe characters
              associatedCharacters = [...new Set(associatedCharacters)];
            }
          }

          const aliases = (atom.attributes as any)?.aliases || [];
          const sceneCount = (atom.attributes as any)?.frequencyInScript || 0;

          const prompt = `You are a production designer and visual story analyst. Generate a rich, production-ready location atom for the following location.

LOCATION: ${atom.canonical_name}
ALIASES: ${aliases.length > 0 ? aliases.join(", ") : "none"}
ASSOCIATED CHARACTERS: ${associatedCharacters.length > 0 ? associatedCharacters.slice(0, 10).join(", ") : "unknown"}
SCENE COUNT: ${sceneCount}

SCENE CONTEXTS:
${sceneContexts.length > 0 ? sceneContexts.join("\n\n") : "No scene context available — infer from location name and story world context."}

Generate a complete LocationAtomAttributes JSON object. Focus on:
1. ERA and PERIOD — what time does this place feel like?
2. ARCHITECTURE STYLE — what kind of building/space is it?
3. VISUAL COMPLEXITY — how visually dense is this location?
4. SENSORY TEXTURE — what does it smell, sound, feel like?
5. NARRATIVE FUNCTION — what role does this place play in the story?
6. PRODUCTION IMPLICATIONS — how hard is this to build/shoot?

Output ONLY a valid JSON object (no markdown, no commentary) with ALL of the following fields:
- era (string)
- period (string)
- architectureStyle (string)
- settingType (string: "INT." / "EXT." / "INT./EXT.")
- visualComplexity (string: "low" / "medium" / "high")
- signatureArchitecturalFeatures (array of 3-5 specific features)
- dominantColors (array of 3-5 colors)
- lightingCharacter (string)
- sensoryTexture (array of 3-5 sensory details)
- acousticCharacter (string)
- temperatureImpression (string)
- atmosphericMood (array of 3-5 mood adjectives)
- narrativeFunction (string)
- frequencyInScript (number)
- associatedCharacters (array of character names)
- keyScenes (array of 3-5 brief scene descriptions)
- thematicSymbolism (string)
- productionComplexity (string: "simple" / "moderate" / "complex")
- setRequirements (array of practical elements)
- specialConsiderations (array of production flags)
- soundstageViability (string)
- castingSuggestions (string)
- moodBoardReference (string: 3-5 search terms for reference images)
- confidence (number 0.0-1.0)
- readinessBadge (string: "foundation" / "rich" / "verified")

confidence should reflect how much visual/narrative information was available.`;

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openrouterKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://iffy-analysis.vercel.app",
              "X-Title": "IFFY Location Atomiser",
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
            console.error(`OpenRouter error for ${atom.canonical_name}:`, response.status, errText);
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
            // Strip markdown code blocks if present
            const cleaned = rawContent
              .replace(/^```json\s*/i, "")
              .replace(/^```\s*/i, "")
              .replace(/```\s*$/i, "")
              .trim();
            generatedAttrs = JSON.parse(cleaned);
          } catch (parseErr) {
            console.error(`Failed to parse JSON for ${atom.canonical_name}:`, parseErr, "Raw:", rawContent.substring(0, 200));
            await admin
              .from("atoms")
              .update({
                generation_status: "failed",
                updated_at: new Date().toISOString(),
              })
              .eq("id", atom.id);
            continue;
          }

          // Merge with canonical name and aliases from extract
          const finalAttributes = {
            ...generatedAttrs,
            canonicalName: atom.canonical_name,
            aliases: aliases,
            frequencyInScript: sceneCount,
            generationStatus: "completed",
          };

          // Update atom
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
            console.log(`✓ Generated: ${atom.canonical_name}`);
          }
        } catch (atomErr) {
          console.error(`Error processing atom ${atom.id} (${atom.canonical_name}):`, atomErr);
          await admin
            .from("atoms")
            .update({
              generation_status: "failed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", atom.id);
        }
      }

      console.log(`Location atomiser generation complete for ${pendingAtoms.length} atoms`);
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

    console.log(`location-atomiser: action=${action} project=${projectId}`);

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
    console.error("location-atomiser error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
