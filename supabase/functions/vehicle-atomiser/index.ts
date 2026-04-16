// @ts-nocheck
/**
 * vehicle-atomiser — Phase 5
 *
 * Extracts vehicle entities from narrative_entities (or scene content fallback)
 * and generates rich production-ready vehicle atoms via OpenRouter MiniMax M2.7.
 *
 * Actions:
 *   extract      — create pending atom stubs for all vehicles in project
 *   generate     — LLM-generate attributes for pending vehicle atoms (background)
 *   status       — return all vehicle atoms for project
 *   reset_failed — reset failed/running atoms back to pending
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Vehicle noun patterns for fallback extraction from scene content
const VEHICLE_PATTERNS = [
  // Military
  /\b(jeep|willys|gaz-67|kübelwagen|kubelwagen)\b/gi,
  /\b(tank|panzer|tiger\s+tank|sherman|t-34|m4\s+sherman|panther\s+tank|king\s+tiger)\b/gi,
  /\b(half-?track|halftrack|sdkfz|sd\.kfz)\b/gi,
  /\b(truck|lorry|deuce[\s-]and[\s-]a[\s-]half|dodge\s+truck|opel\s+blitz|gmc\s+truck)\b/gi,
  /\b(motorcycle|motorbike|dispatch\s+bike|bmw\s+r75|zündapp|zundapp)\b/gi,
  /\b(armoured?\s+car|armored\s+car|armoured?\s+vehicle|scout\s+car|recon\s+vehicle)\b/gi,
  // Aircraft
  /\b(aircraft|aeroplane|airplane|plane|spitfire|hurricane|messerschmitt|me[\s-]?109|bf[\s-]?109|focke-?wulf|fw[\s-]?190|lancaster|wellington|b-17|b-24|b-25|c-47|dakota|stuka|ju[\s-]?87|ju[\s-]?88|p-51|mustang|p-47|thunderbolt)\b/gi,
  /\b(bomber|fighter|biplane|glider|transport\s+plane|cargo\s+plane)\b/gi,
  // Civilian/period
  /\b(car|automobile|saloon|sedan|coupe|cabriolet|staff\s+car|mercedes|bentley|rolls[- ]royce|citroen|renault|volkswagen|vw)\b/gi,
  /\b(bus|coach|ambulance|fire\s+engine|fire\s+truck|van|wagon|cart)\b/gi,
  // Horse/animal transport
  /\b(horse|horses|cavalry|horse-drawn|horse\s+drawn|stallion|mare|warhorse|charger)\b/gi,
  /\b(cart|carriage|wagon|buggy|trap|pony\s+trap)\b/gi,
  // Naval
  /\b(boat|ship|vessel|landing\s+craft|lcvp|lct|destroyer|submarine|u-?boat|torpedo\s+boat|patrol\s+boat)\b/gi,
  /\b(dinghy|rowboat|motorboat|launch)\b/gi,
  // Modern (fallback)
  /\b(bicycle|bike|scooter|tram|train|locomotive)\b/gi,
];

// Canonical vehicle name extraction from matches
function extractVehicleTerms(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  
  for (const pattern of VEHICLE_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const term = match[0].toLowerCase().trim();
      counts.set(term, (counts.get(term) || 0) + 1);
    }
  }
  
  return counts;
}

// Normalise raw vehicle terms to canonical names
function canonicalise(term: string): string {
  const map: Record<string, string> = {
    // Military jeeps
    'jeep': 'WWII Jeep (Willys MB)',
    'willys': 'WWII Jeep (Willys MB)',
    // Tanks
    'tank': 'Military Tank',
    'tiger tank': 'Tiger I Tank',
    'sherman': 'M4 Sherman Tank',
    't-34': 'T-34 Tank',
    'm4 sherman': 'M4 Sherman Tank',
    'panzer': 'Panzer Tank',
    'panther tank': 'Panther Tank',
    'king tiger': 'Tiger II Tank',
    // Aircraft
    'aircraft': 'Military Aircraft',
    'plane': 'Aircraft',
    'aeroplane': 'Aircraft',
    'airplane': 'Aircraft',
    'spitfire': 'Spitfire Fighter',
    'hurricane': 'Hurricane Fighter',
    'messerschmitt': 'Messerschmitt Bf 109',
    'me 109': 'Messerschmitt Bf 109',
    'me-109': 'Messerschmitt Bf 109',
    'bf 109': 'Messerschmitt Bf 109',
    'bf-109': 'Messerschmitt Bf 109',
    'focke-wulf': 'Focke-Wulf Fw 190',
    'fw 190': 'Focke-Wulf Fw 190',
    'stuka': 'Junkers Ju 87 Stuka',
    'ju 87': 'Junkers Ju 87 Stuka',
    'ju 88': 'Junkers Ju 88',
    'lancaster': 'Avro Lancaster Bomber',
    'b-17': 'Boeing B-17 Flying Fortress',
    'b-24': 'Consolidated B-24 Liberator',
    'p-51': 'North American P-51 Mustang',
    'mustang': 'North American P-51 Mustang',
    'c-47': 'Douglas C-47 Dakota',
    'dakota': 'Douglas C-47 Dakota',
    // Trucks/transport
    'truck': 'Military Truck',
    'lorry': 'Military Lorry',
    'opel blitz': 'Opel Blitz Truck',
    'half-track': 'Half-Track Vehicle',
    'halftrack': 'Half-Track Vehicle',
    // Motorcycles
    'motorcycle': 'Military Motorcycle',
    'motorbike': 'Military Motorcycle',
    'dispatch bike': 'Dispatch Motorcycle',
    // Horses
    'horse': 'Horse',
    'horses': 'Horse',
    'cavalry': 'Cavalry Horse',
    'warhorse': 'Warhorse',
    // Naval
    'boat': 'Boat',
    'ship': 'Ship',
    'u-boat': 'German U-Boat',
    'submarine': 'Submarine',
    'landing craft': 'Landing Craft',
    // Cars
    'car': 'Automobile',
    'staff car': 'Staff Car',
    'ambulance': 'Ambulance',
    // Default: capitalise
  };
  
  const lower = term.toLowerCase().trim();
  return map[lower] || term.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function makeStubAttributes(name: string, sceneCount: number, sourceType: 'entity' | 'extracted'): Record<string, any> {
  return {
    vehicle_type: name,
    era_alignment: "",
    make_model: "",
    period_accuracy: "accurate",
    ownership: "military",
    character_association: "",
    condition: "worn",
    distinctive_features: "",
    modification_level: "stock",
    visual_complexity: "moderate",
    set_requirements: "practical_vehicle",
    driving_context: "transport",
    sound_profile: "",
    budget_estimate: "moderate",
    availability_notes: "",
    reference_images_needed: [],
    casting_type_tags: ["vehicle", "period-piece"],
    anachronism_flags: [],
    production_notes: "",
    // Meta
    frequencyInScript: sceneCount,
    sourceType,
    generationStatus: "pending",
    confidence: 0,
    readinessBadge: "foundation",
  };
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function handleExtract(projectId: string) {
  const admin = makeAdminClient();
  const now = new Date().toISOString();

  // 1. Try primary source: narrative_entities.entity_type = 'vehicle'
  const { data: vehicleEntities, error: entErr } = await admin
    .from("narrative_entities")
    .select("id, entity_key, canonical_name, entity_type, scene_count, meta_json")
    .eq("project_id", projectId)
    .eq("entity_type", "vehicle");

  if (entErr) {
    console.warn("Error fetching vehicle entities:", entErr.message);
  }

  // 2. Get existing vehicle atoms to avoid duplicates
  const { data: existingAtoms } = await admin
    .from("atoms")
    .select("entity_id, canonical_name")
    .eq("project_id", projectId)
    .eq("atom_type", "vehicle");

  const existingEntityIds = new Set<string>(
    (existingAtoms || []).map((a) => a.entity_id).filter(Boolean)
  );
  const existingNames = new Set<string>(
    (existingAtoms || []).map((a) => a.canonical_name?.toLowerCase().trim()).filter(Boolean)
  );

  const toInsert: any[] = [];

  // 3. If narrative_entities has vehicles, use those
  if (vehicleEntities && vehicleEntities.length > 0) {
    console.log(`Found ${vehicleEntities.length} vehicle entities in narrative_entities`);

    // Get scene link counts
    const entityIds = vehicleEntities.map((e) => e.id);
    const { data: linkRows } = await admin
      .from("narrative_scene_entity_links")
      .select("entity_id, scene_id")
      .eq("project_id", projectId)
      .in("entity_id", entityIds.slice(0, 500));

    const sceneLinkMap = new Map<string, Set<string>>();
    for (const link of linkRows || []) {
      if (!sceneLinkMap.has(link.entity_id)) {
        sceneLinkMap.set(link.entity_id, new Set());
      }
      sceneLinkMap.get(link.entity_id)!.add(link.scene_id);
    }

    for (const entity of vehicleEntities) {
      if (existingEntityIds.has(entity.id)) {
        console.log(`Skipping existing atom for: ${entity.canonical_name}`);
        continue;
      }

      const sceneLinkCount = sceneLinkMap.get(entity.id)?.size || 0;
      const sceneCount = sceneLinkCount > 0 ? sceneLinkCount : (entity.scene_count || 0);

      toInsert.push({
        project_id: projectId,
        atom_type: "vehicle",
        entity_id: entity.id,
        canonical_name: entity.canonical_name,
        priority: Math.min(100, sceneCount * 5 + 10),
        confidence: 0,
        readiness_state: "stub",
        generation_status: "pending",
        attributes: makeStubAttributes(entity.canonical_name, sceneCount, 'entity'),
        created_at: now,
        updated_at: now,
      });
    }
  }

  // 4. Option A fallback: extract vehicle nouns from scene_graph_versions.content
  // Always do this as a supplementary pass even if we got entities above
  console.log("Running fallback extraction from scene content...");

  const { data: sceneVersions, error: svErr } = await admin
    .from("scene_graph_versions")
    .select("scene_id, slugline, content, summary")
    .eq("project_id", projectId)
    .limit(500);

  if (svErr) {
    console.warn("Error fetching scene versions:", svErr.message);
  }

  if (sceneVersions && sceneVersions.length > 0) {
    // Aggregate all content
    const allContent = sceneVersions
      .map((sv) => `${sv.slugline || ''} ${sv.content || ''} ${sv.summary || ''}`)
      .join('\n');

    const vehicleCounts = extractVehicleTerms(allContent);
    
    // Convert to canonical names, merge counts
    const canonicalMap = new Map<string, number>();
    for (const [term, count] of vehicleCounts) {
      const canonical = canonicalise(term);
      canonicalMap.set(canonical, (canonicalMap.get(canonical) || 0) + count);
    }

    console.log(`Extracted ${canonicalMap.size} unique vehicle types from scene content:`, [...canonicalMap.keys()]);

    // Filter out low-count one-offs (< 2 mentions) and already existing
    for (const [canonical, count] of canonicalMap) {
      if (count < 2) continue; // Skip one-off mentions
      const nameKey = canonical.toLowerCase().trim();
      if (existingNames.has(nameKey)) continue;
      // Also skip if we already have this from entities
      if (toInsert.some((t) => t.canonical_name.toLowerCase().trim() === nameKey)) continue;

      toInsert.push({
        project_id: projectId,
        atom_type: "vehicle",
        entity_id: null,
        canonical_name: canonical,
        priority: Math.min(100, count * 5 + 5),
        confidence: 0,
        readiness_state: "stub",
        generation_status: "pending",
        attributes: makeStubAttributes(canonical, count, 'extracted'),
        created_at: now,
        updated_at: now,
      });
    }
  }

  if (toInsert.length === 0) {
    return {
      created: 0,
      message: "No vehicle atoms to create — all already exist or none found",
      entity_source_count: vehicleEntities?.length || 0,
      scene_extraction_ran: true,
    };
  }

  // 5. Insert in batches of 50
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

  const vehicleNames = toInsert.map((t) => t.canonical_name);
  console.log(`Created ${totalCreated} vehicle atom stubs:`, vehicleNames);

  return {
    created: totalCreated,
    vehicles: vehicleNames,
    entity_source_count: vehicleEntities?.length || 0,
  };
}

async function handleStatus(projectId: string) {
  const admin = makeAdminClient();

  const { data: atoms, error } = await admin
    .from("atoms")
    .select("*")
    .eq("project_id", projectId)
    .eq("atom_type", "vehicle")
    .order("priority", { ascending: false });

  if (error) throw new Error(`Failed to load vehicle atoms: ${error.message}`);

  return { atoms: atoms || [], count: atoms?.length || 0 };
}

async function handleResetFailed(projectId: string) {
  const admin = makeAdminClient();

  const { count, error } = await admin
    .from("atoms")
    .update({ generation_status: "pending", updated_at: new Date().toISOString() })
    .in("generation_status", ["failed", "running"])
    .eq("project_id", projectId)
    .eq("atom_type", "vehicle")
    .select("id", { count: "exact", head: true });

  if (error) throw new Error(`Failed to reset atoms: ${error.message}`);

  return { reset: count || 0 };
}

async function handleGenerate(projectId: string) {
  const admin = makeAdminClient();

  // Get pending vehicle atoms
  const { data: pendingAtoms, error: fetchErr } = await admin
    .from("atoms")
    .select("id, entity_id, canonical_name, attributes")
    .eq("project_id", projectId)
    .eq("atom_type", "vehicle")
    .eq("generation_status", "pending");

  if (fetchErr) throw new Error(`Failed to fetch pending atoms: ${fetchErr.message}`);
  if (!pendingAtoms || pendingAtoms.length === 0) {
    return { spawned: false, message: "No pending vehicle atoms to generate" };
  }

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  // Mark all as running immediately
  const atomIds = pendingAtoms.map((a) => a.id);
  await admin
    .from("atoms")
    .update({ generation_status: "running", updated_at: new Date().toISOString() })
    .in("id", atomIds);

  // Get all scene content for context assembly
  const { data: sceneVersions } = await admin
    .from("scene_graph_versions")
    .select("scene_id, slugline, content, summary, tension_delta, characters_present")
    .eq("project_id", projectId)
    .limit(200);

  const allSceneText = (sceneVersions || [])
    .map((sv) => `[${sv.slugline || 'SCENE'}] ${sv.content || sv.summary || ''}`)
    .join('\n\n');

  // Background generation
  // @ts-ignore — EdgeRuntime is Deno Deploy global
  EdgeRuntime.waitUntil(
    (async () => {
      for (const atom of pendingAtoms) {
        try {
          console.log(`Generating vehicle atom: ${atom.canonical_name}`);

          // Find scene contexts that mention this vehicle
          const vehicleName = atom.canonical_name;
          const vehicleKeyword = vehicleName.toLowerCase().split(' ')[0]; // e.g. "jeep", "tank", "horse"

          let sceneContexts: string[] = [];
          let associatedCharacters: string[] = [];

          // If entity_id available, use scene links
          if (atom.entity_id) {
            const { data: locationLinks } = await admin
              .from("narrative_scene_entity_links")
              .select("scene_id")
              .eq("project_id", projectId)
              .eq("entity_id", atom.entity_id)
              .limit(50);

            const linkedSceneIds = new Set((locationLinks || []).map((l) => l.scene_id));

            for (const sv of sceneVersions || []) {
              if (!linkedSceneIds.has(sv.scene_id)) continue;
              const excerpt = (sv.summary || sv.content || "").substring(0, 300);
              sceneContexts.push(`[${sv.slugline || 'SCENE'}] (tension: ${sv.tension_delta || 0}) — ${excerpt}`);
              if (sv.characters_present && Array.isArray(sv.characters_present)) {
                associatedCharacters.push(...sv.characters_present);
              }
            }
          }

          // Supplementary: scan content for this vehicle type if not enough context
          if (sceneContexts.length < 3) {
            for (const sv of (sceneVersions || []).slice(0, 100)) {
              const text = `${sv.slugline || ''} ${sv.content || ''} ${sv.summary || ''}`.toLowerCase();
              if (!text.includes(vehicleKeyword)) continue;
              const excerpt = (sv.summary || sv.content || "").substring(0, 300);
              const ctx = `[${sv.slugline || 'SCENE'}] — ${excerpt}`;
              if (!sceneContexts.includes(ctx)) {
                sceneContexts.push(ctx);
                if (sv.characters_present && Array.isArray(sv.characters_present)) {
                  associatedCharacters.push(...sv.characters_present);
                }
              }
              if (sceneContexts.length >= 8) break;
            }
          }

          associatedCharacters = [...new Set(associatedCharacters)];

          const attrs = atom.attributes as any;
          const sceneCount = attrs?.frequencyInScript || 0;
          const sourceType = attrs?.sourceType || 'extracted';

          const prompt = `You are a production designer and transportation coordinator for film/TV. Generate a rich, production-ready vehicle atom for the following vehicle.

PROJECT CONTEXT: WWII-era drama/thriller (assume period accuracy is critical)
VEHICLE: ${atom.canonical_name}
SCENE COUNT: ${sceneCount}
SOURCE: ${sourceType === 'entity' ? 'Named entity from script analysis' : 'Extracted from scene content'}

SCENE CONTEXTS WHERE THIS VEHICLE APPEARS:
${sceneContexts.length > 0 ? sceneContexts.slice(0, 8).join("\n\n") : "No specific scene context — infer from vehicle type and WWII context."}

ASSOCIATED CHARACTERS: ${associatedCharacters.length > 0 ? associatedCharacters.slice(0, 10).join(", ") : "Unknown"}

Generate a complete vehicle atom as a JSON object. Focus on:
1. VEHICLE TYPE — what kind of vehicle is this exactly?
2. ERA ALIGNMENT — what period/era does it belong to?
3. MAKE/MODEL — specific make and model if identifiable
4. PERIOD ACCURACY — is it accurate, stylised, or anachronistic for the story world?
5. OWNERSHIP — military, civilian, government, character-personal?
6. CONDITION — pristine, worn, damaged, modified?
7. PRODUCTION IMPLICATIONS — how hard to source/build? CGI needed?

Output ONLY a valid JSON object (no markdown, no commentary) with ALL of the following fields:
- vehicle_type (string: specific vehicle category e.g. "WWII Military Jeep", "Fighter Aircraft", "Horse-drawn Cart")
- era_alignment (string: e.g. "1940s WWII", "1943 North Africa", "Early Cold War")
- make_model (string: specific make/model e.g. "Willys MB", "Messerschmitt Bf 109", "Horse" — empty string if unknown)
- period_accuracy (string: "accurate" | "stylised" | "anachronistic")
- ownership (string: "military" | "civilian" | "government" | "character-personal" | "enemy-forces")
- character_association (string: which character(s) primarily use this vehicle, or "various")
- condition (string: "pristine" | "worn" | "battle-damaged" | "destroyed" | "modified" | "period-correct")
- distinctive_features (string: visual details that make this vehicle recognisable on screen)
- modification_level (string: "stock" | "mildly_customised" | "heavily_modified")
- visual_complexity (string: "simple" | "moderate" | "complex")
- set_requirements (string: "practical_vehicle" | "CGI_replacement" | "partial_practical" | "full_CGI" | "prop_only")
- driving_context (string: "chase" | "transport" | "combat" | "evacuation" | "ceremonial" | "reconnaissance" | "civilian_transport")
- sound_profile (string: brief description of engine sound/character e.g. "flat-4 diesel rumble", "Merlin V12 howl")
- budget_estimate (string: "budget" | "moderate" | "expensive" | "prohibitively_expensive")
- availability_notes (string: sourcing notes e.g. "Period originals available via military museums", "CGI required for aerial shots")
- reference_images_needed (array of 3-5 strings: types of reference needed)
- casting_type_tags (array of 3-5 strings: production category tags)
- anachronism_flags (array of strings: any period accuracy concerns, empty if accurate)
- production_notes (string: any special handling, safety, stunt, or logistics notes)
- confidence (number 0.0-1.0: how confident you are in this assessment)
- readinessBadge (string: "foundation" | "rich" | "verified")
- frequencyInScript (number: ${sceneCount})
- generationStatus (string: "completed")`;

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openrouterKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://iffy-analysis.vercel.app",
              "X-Title": "IFFY Vehicle Atomiser",
            },
            body: JSON.stringify({
              model: "minimax/minimax-m2.7",
              messages: [{ role: "user", content: prompt }],
              temperature: 0.7,
              max_tokens: 2000,
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            console.error(`OpenRouter error for ${atom.canonical_name}:`, response.status, errText);
            await admin
              .from("atoms")
              .update({ generation_status: "failed", updated_at: new Date().toISOString() })
              .eq("id", atom.id);
            continue;
          }

          const aiData = await response.json();
          const rawContent = aiData.choices?.[0]?.message?.content || "";

          let generatedAttrs: Record<string, any> = {};
          try {
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
              .update({ generation_status: "failed", updated_at: new Date().toISOString() })
              .eq("id", atom.id);
            continue;
          }

          // Merge — ensure critical fields are set
          const finalAttributes = {
            ...generatedAttrs,
            vehicle_type: generatedAttrs.vehicle_type || atom.canonical_name,
            frequencyInScript: sceneCount,
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
            console.log(`✓ Generated: ${atom.canonical_name}`);
          }
        } catch (atomErr) {
          console.error(`Error processing atom ${atom.id} (${atom.canonical_name}):`, atomErr);
          await admin
            .from("atoms")
            .update({ generation_status: "failed", updated_at: new Date().toISOString() })
            .eq("id", atom.id);
        }
      }

      console.log(`Vehicle atomiser generation complete for ${pendingAtoms.length} atoms`);
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

    console.log(`vehicle-atomiser: action=${action} project=${projectId}`);

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
    console.error("vehicle-atomiser error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
