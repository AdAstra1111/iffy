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
import { createAtomiserRepository } from "../_shared/atomiser-repository.ts";
import { recoverStaleRunning } from "../_shared/stale-running-recovery.ts";

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
function makeRepository() {
  return createAtomiserRepository({
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    supabaseKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  });
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


/**
 * Convert a flat atom row to CanonEmission format for repository upsert.
 * Routes all atom persistence through the AtomiserRepository provenance guard.
 */
function toCanonEmission(row: Record<string, unknown>): import("../_shared/atomiser-repository.ts").CanonEmission {
  const attrs = (row.attributes as Record<string, unknown>) || {};
  return {
    entity_key: (row.canonical_name as string) || "",
    canon_object: attrs,
    provenance: {
      source_type: "extracted",
      confidence_score: (row.confidence as number) || 0.5,
      reasoning: ["extracted_from_script_reference"],
      pcp_dependencies: ["genre", "geographic_context", "spatial_function"],
    },
    cdg_context: {
      node_id: "D5",
      staleness: "FRESH",
      upstream_node: "C5",
      regeneration_count: 0,
    },
    ics_metadata: [],
    generated_at: (row.created_at as string) || new Date().toISOString(),
    generated_by: "location_atomiser_extract",
    entity_id: (row.entity_id as string) || null,
    priority: (row.priority as number) || 50,
    readiness_state: (row.readiness_state as string) || "stub",
    generation_status: (row.generation_status as string) || "pending",
  };
}

async function handleExtract(projectId: string) {
  const admin = makeAdminClient();
  // P0.1: Auto-recover stale running atoms
  const staleRecovery = await recoverStaleRunning(admin, projectId, "location").catch(() => ({ recovered: 0 }));
  if (staleRecovery.recovered > 0) {
    console.log("[StaleRecovery] Recovered " + staleRecovery.recovered + " stale location atoms on status check");
  }
  const repo = makeRepository();

  // 1. Load all location entities for this project
  const { data: locationEntities, error: entErr } = await admin
    .from("narrative_entities")
    .select("id, entity_key, canonical_name, entity_type, scene_count, meta_json")
    .eq("project_id", projectId)
    .eq("entity_type", "location");

  if (entErr) throw new Error(`Failed to load location entities: ${entErr.message}`);
  
  // If no location entities exist in narrative_entities, try extracting from season_script sluglines
  if (!locationEntities || locationEntities.length === 0) {
    // Scan season_script for INT./EXT. slugline locations
    const { data: ssDocs } = await admin
      .from("project_documents")
      .select("id, latest_version_id")
      .eq("project_id", projectId)
      .eq("doc_type", "season_script");

    if (ssDocs && ssDocs.length > 0 && ssDocs[0].latest_version_id) {
      const { data: version } = await admin
        .from("project_document_versions")
        .select("plaintext")
        .eq("id", ssDocs[0].latest_version_id)
        .single();

      if (version?.plaintext) {
        // Extract location names from INT./EXT. sluglines
        const sluglineRegex = /(?:^|\n)\s*(INT|EXT|INT\.|EXT\.)\s*\.?\s*(.+?)\s*[-–—]\s*(?:DAY|NIGHT|DUSK|DAWN|LATER|CONTINUOUS|MORNING|EVENING|SUNSET|SUNRISE|MOMENTS?\s*LATER|THE\s+NEXT\s+\w+)/gmi;
        const locationNames = new Set<string>();
        let slugMatch;
        while ((slugMatch = sluglineRegex.exec(version.plaintext)) !== null) {
          const locationName = slugMatch[2].trim();
          // Clean up: remove parenthetical notes, trailing periods
          const cleanName = locationName.replace(/\(.*?\)/g, '').replace(/\.$/, '').trim();
          if (cleanName.length > 2 && !cleanName.match(/^\d/)) {
            locationNames.add(cleanName);
          }
        }

        if (locationNames.size > 0) {
          console.log(`[location-atomiser] Extracted ${locationNames.size} locations from season_script sluglines`);

          // Create location atoms directly without needing narrative_entities
          const now = new Date().toISOString();
          const { data: existingLocAtoms } = await admin
            .from("atoms")
            .select("canonical_name")
            .eq("project_id", projectId)
            .eq("atom_type", "location");

          const existingNames = new Set((existingLocAtoms || []).map((a: any) => a.canonical_name.toUpperCase()));

          const toInsert = Array.from(locationNames)
            .filter((name) => !existingNames.has(name.toUpperCase()))
            .map((name) => ({
              project_id: projectId,
              atom_type: "location",
              entity_id: null,
              canonical_name: name,
              priority: 50,
              confidence: 0,
              readiness_state: "stub",
              generation_status: "pending",
              attributes: {
                canonicalName: name,
                aliases: [],
                scene_count: 0,
                era: "",
                periodContext: "",
                architecturalStyle: "",
                functionInScript: "",
                sensoryTexture: [],
                acousticCharacter: "",
                temperatureImpression: "",
                atmosphericMood: [],
                narrativeFunction: "",
                frequencyInScript: 0,
                associatedCharacters: [],
                keyScenes: [],
                thematicSymbolism: "",
                budgetClassification: "",
                setBuildingNotes: "",
                confidence: 0,
                readinessBadge: "foundation",
                generationStatus: "pending",
              },
              created_at: now,
              updated_at: now,
            }));

          if (toInsert.length > 0) {
            const emissions = toInsert.map(toCanonEmission);
            const result = await repo.upsertAtoms(projectId, emissions, "location");
            if (!result.success) {
              throw new Error(`Failed to insert location atoms: ${result.errors.join(", ")}`);
            }
            return { created: result.inserted_count, source: "season_script_sluglines" };
          }
          return { created: 0, message: "All slugline locations already have atoms" };
        }
      }
    }
    return { created: 0, message: "No location entities or season_script found for this project" };
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
      const batchEmissions = batch.map(toCanonEmission);
      const result = await repo.upsertAtoms(projectId, batchEmissions, "location");
      if (!result.success) {
        console.error("Insert batch error:", result.errors.join(", "));
        throw new Error(`Failed to insert atoms batch: ${result.errors.join(", ")}`);
      }
      totalCreated += result.inserted_count;
    }

    console.log(`Created ${totalCreated} location atom stubs`);
    return { created: totalCreated };
}

async function handleStatus(projectId: string) {
  const admin = makeAdminClient();
  // P0.1: Auto-recover stale running atoms
  const staleRecovery = await recoverStaleRunning(admin, projectId, "location").catch(() => ({ recovered: 0 }));
  if (staleRecovery.recovered > 0) {
    console.log("[StaleRecovery] Recovered " + staleRecovery.recovered + " stale location atoms on status check");
  }
  const repo = makeRepository();

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
  // P0.1: Auto-recover stale running atoms
  const staleRecovery = await recoverStaleRunning(admin, projectId, "location").catch(() => ({ recovered: 0 }));
  if (staleRecovery.recovered > 0) {
    console.log("[StaleRecovery] Recovered " + staleRecovery.recovered + " stale location atoms on status check");
  }
  const repo = makeRepository();

  const count = await repo.bulkUpdateAtomsByStatus(projectId, "location", ["failed", "running"], { generation_status: "pending" });

  return { reset: count || 0 };
}

async function handleGenerate(projectId: string) {
  const admin = makeAdminClient();
  // P0.1: Auto-recover stale running atoms
  const staleRecovery = await recoverStaleRunning(admin, projectId, "location").catch(() => ({ recovered: 0 }));
  if (staleRecovery.recovered > 0) {
    console.log("[StaleRecovery] Recovered " + staleRecovery.recovered + " stale location atoms on status check");
  }
  const repo = makeRepository();

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
  await repo.bulkUpdateAtomsByIds(projectId, atomIds, { generation_status: "running" });

  // Get entity IDs to look up scene context
  const entityIds = pendingAtoms.map((a) => a.entity_id).filter(Boolean);

  // Background generation
  // @ts-ignore — EdgeRuntime is Deno Deploy global
  if (typeof EdgeRuntime !== "undefined") {
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

                    // ── CPIE Inference Integration (HARD PATH) ──
          // CPIE provides deterministic location inferences as ground truth
          let cpieInferences: Array<{field: string; value: string; confidence: number; reasoning: string[]; registry_anchor_id: string; pcp_dependencies: string[]; generated_at: string; generated_by: string}> = [];
          const cpieUrl = Deno.env.get("CPIE_ENDPOINT_URL");
          if (!cpieUrl) {
            throw new Error("CPIE_ENDPOINT_URL not configured — CPIE required for location atomiser");
          }
          
          const { data: pcpRow } = await admin
            .from("project_context_profiles")
            .select("profile")
            .eq("project_id", projectId)
            .maybeSingle();

          if (pcpRow?.profile) {
            const pcp = (pcpRow.profile as any).categories || pcpRow.profile;
            // Determine spatial_function from atom attributes or location name
            const locationName = (atom.canonical_name || "").toLowerCase();
            let spatialFunction = "civic";
            if (/house|home|apartment|room|bedroom|kitchen|bathroom|inn|tavern/.test(locationName)) spatialFunction = "residential";
            else if (/shop|market|store|bazaar|mall|restaurant|cafe|bar/.test(locationName)) spatialFunction = "commercial";
            else if (/church|temple|cathedral|mosque|shrine|altar/.test(locationName)) spatialFunction = "religious";
            else if (/castle|fort|fortress|barracks|guard|watchtower/.test(locationName)) spatialFunction = "military";
            else if (/factory|mill|plant|foundry|workshop|mine|quarry/.test(locationName)) spatialFunction = "industrial";
            else if (/road|street|bridge|port|harbor|station|airport/.test(locationName)) spatialFunction = "transportation";
            else if (/park|garden|plaza|square|field|forest|lake|river|mountain|valley/.test(locationName)) spatialFunction = "recreational";
            
            const cpieCtx = {
              project_id: projectId,
              genre: pcp.project_identity?.genre?.value || pcp.genre || ["unknown"],
              period: pcp.temporal_context?.period?.value || pcp.period || "contemporary",
              climate: pcp.geographic_context?.climate?.value || pcp.climate || "temperate",
              technology_level: pcp.technology_context?.level?.value || pcp.technology_level || "contemporary",
              culture: pcp.cultural_context?.dominant_cultures?.value || pcp.culture || ["Western"],
              infrastructure: pcp.geographic_context?.infrastructure?.value || pcp.infrastructure || "",
              geography: pcp.geographic_context?.terrain?.value || pcp.geography || "",
              economy: pcp.economic_context?.economic_system?.value || pcp.economy || "",
              class_structure: pcp.social_context?.class_structure?.value || pcp.class_structure || "",
              biome: pcp.geographic_context?.biome?.value || pcp.biome || "",
              spatial_function: spatialFunction,
              profession_map: pcp.professional_context?.profession_map?.value || pcp.profession_map || {},
              pcp_resolution_timestamp: new Date().toISOString(),
            };

            const cpieResponse = await fetch(cpieUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pcp: cpieCtx, domains: ["location"] }),
            });

            if (cpieResponse.ok) {
              const cpieResult = await cpieResponse.json();
              const entityResults = cpieResult.domains?.location || [];
              if (entityResults.length > 0) {
                cpieInferences = entityResults[0].inferences.map((inf: any) => ({
                  field: inf.field, value: inf.value,
                  confidence: inf.confidence_score, reasoning: inf.reasoning,

                  registry_anchor_id: inf.registry_anchor_id,

                  pcp_dependencies: inf.pcp_dependencies,

                  generated_at: inf.generated_at,

                  generated_by: inf.generated_by,

                  }));
              }
            }
          }

          // CPIE may return empty for location (needs profession_map entries)
          // Not required to be non-empty — location has fewer deterministic anchors
          const cpieContext = cpieInferences.length > 0
            ? cpieInferences.map(i => `  - ${i.field}: ${i.value} (confidence: ${i.confidence}, reasoning: ${i.reasoning.join(", ")})`).join("\n")
            : "  (no CPIE data available)";

const prompt = `ENHANCEMENT MODE — Core location decisions made by CPIE.

DETERMINISTIC CPIE INFERENCES (must use):
${cpieContext}

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
            await repo.updateAtom(projectId, atom.id, {
                generation_status: "failed",
                updated_at: new Date().toISOString(),
              });
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
            await repo.updateAtom(projectId, atom.id, {
                generation_status: "failed",
                updated_at: new Date().toISOString(),
              });
            continue;
          }

          // Merge CPIE provenance into atom attributes
          if (cpieInferences.length > 0) {
            generatedAttrs.cpie_inferences_used = cpieInferences.length;
            generatedAttrs._provenance = {
              source_type: "inferred",
              confidence_score: Math.min(...cpieInferences.map(i => i.confidence)),
              reasoning: cpieInferences.map(i => `field=${i.field} value="${i.value}" anchor=${i.registry_anchor_id || "unknown"} confidence=${i.confidence}`),
              pcp_dependencies: [...new Set(cpieInferences.flatMap(i => i.pcp_dependencies || []))],
            };
            generatedAttrs._ics_metadata = cpieInferences.map(i => ({
              field_name: i.field,
              filled_by: "inferred",
              confidence_at_creation: i.confidence,
              registry_anchor_id: i.registry_anchor_id || "",
            }));
            generatedAttrs._generated_by = "cpie_registry";
            generatedAttrs._generated_at = new Date().toISOString();
            generatedAttrs.generated_from_cpie = true;
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
          const updateErr = await repo.updateAtom(projectId, atom.id, {
              generation_status: "complete",
              readiness_state: "generated",
              confidence: Math.round((generatedAttrs.confidence || 0.5) * 100),
              attributes: finalAttributes,
              updated_at: new Date().toISOString(),
            });

          if (updateErr) {
            console.error(`Failed to update atom ${atom.id}:`, updateErr);
          } else {
            console.log(`✓ Generated: ${atom.canonical_name}`);
          }
        } catch (atomErr) {
          console.error(`Error processing atom ${atom.id} (${atom.canonical_name}):`, atomErr);
          await repo.updateAtom(projectId, atom.id, {
              generation_status: "failed",
              updated_at: new Date().toISOString(),
            });
        }
      }

      console.log(`Location atomiser generation complete for ${pendingAtoms.length} atoms`);
    })()
  );
  }

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
      case "reset-failed":
        result = await handleResetFailed(projectId);
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
