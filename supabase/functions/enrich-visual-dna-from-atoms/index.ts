// @ts-nocheck
/**
 * enrich-visual-dna-from-atoms — Bridge between atom generation and visual DNA layers.
 *
 * Phase 1A: Character atoms → character_visual_dna.inferred_guidance
 * Phase 1B: Location atoms → location_visual_datasets structured columns
 *
 * Reads completed atoms from the atoms table and merges physical descriptions
 * into the visual DNA layer, updating identity signatures and dataset entries.
 * No LLM calls — pure data mapping and DB operations.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EnrichInput {
  project_id: string;
  entity_name: string;
  entity_type: "character" | "location";
  mode?: "aggressive" | "conservative";
}

interface DNATrait {
  label: string;
  category: string;
  confidence: "high" | "medium" | "low";
  source: string;
  value: string;
}

interface IdentitySignature {
  face: Record<string, any>;
  body: Record<string, any>;
  silhouette: Record<string, any>;
  wardrobe: Record<string, any>;
  derived_at: string;
  source: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: EnrichInput = await req.json();
    const { project_id, entity_name, entity_type, mode = "aggressive" } = body;

    if (!project_id || !entity_name || !entity_type) {
      return new Response(
        JSON.stringify({ error: "project_id, entity_name, and entity_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!["character", "location"].includes(entity_type)) {
      return new Response(
        JSON.stringify({ error: `Invalid entity_type: ${entity_type}. Must be 'character' or 'location'.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    if (entity_type === "character") {
      return await enrichCharacter(sb, project_id, entity_name, mode);
    } else {
      return await enrichLocation(sb, project_id, entity_name, mode);
    }
  } catch (e: any) {
    console.error("enrich-visual-dna-from-atoms error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Enrich character_visual_dna from character atom attributes.
 */
async function enrichCharacter(
  sb: any,
  projectId: string,
  characterName: string,
  mode: "aggressive" | "conservative",
): Promise<Response> {
  // 1. Find completed character atoms
  const { data: atoms, error: atomError } = await sb
    .from("atoms")
    .select("id, canonical_name, attributes, generation_status, readiness_state")
    .eq("project_id", projectId)
    .eq("atom_type", "character")
    .ilike("canonical_name", characterName)
    .eq("generation_status", "complete");

  if (atomError) {
    return respond({ enriched: false, error: `Atom query failed: ${atomError.message}` }, 500);
  }

  if (!atoms || atoms.length === 0) {
    return respond({
      enriched: false,
      traits_added: 0,
      dna_version_id: null,
      identity_updated: false,
      errors: [`No completed character atoms found for "${characterName}"`],
    });
  }

  // 2. Extract physical traits from atom attributes
  const traits: DNATrait[] = [];
  const primaryAtom = atoms[0]; // Most recent/targeted atom
  const attrs = (primaryAtom.attributes || {}) as Record<string, any>;

  const traitMappings: { key: string; category: string; source: string }[] = [
    { key: "physical_description", category: "other", source: "atom_physical_description" },
    { key: "age_estimate", category: "age", source: "atom_age" },
    { key: "build", category: "build", source: "atom_build" },
    { key: "height_estimate", category: "build", source: "atom_height" },
    { key: "skin_tone", category: "skin", source: "atom_skin" },
    { key: "hair", category: "hair", source: "atom_hair" },
    { key: "eyes", category: "face", source: "atom_eyes" },
    { key: "distinctive_features", category: "marker", source: "atom_distinctive" },
    { key: "wardrobe_notes", category: "clothing", source: "atom_wardrobe" },
    { key: "physical_markings", category: "marker", source: "atom_markings" },
    { key: "movement_gait", category: "posture", source: "atom_gait" },
    { key: "facial_expression_range", category: "face", source: "atom_expression" },
    { key: "casting_suggestions", category: "other", source: "atom_casting" },
    { key: "casting_type_tags", category: "other", source: "atom_casting_tags" },
    { key: "visual_complexity", category: "other", source: "atom_visual_complexity" },
  ];

  for (const mapping of traitMappings) {
    const value = attrs[mapping.key];
    if (value && typeof value === "string" && value.trim().length > 0) {
      traits.push({
        label: mapping.key.replace(/_/g, " "),
        category: mapping.category,
        confidence: mode === "aggressive" ? "high" : "medium",
        source: mapping.source,
        value: value.trim(),
      });
    }
  }

  if (traits.length === 0) {
    return respond({
      enriched: false,
      traits_added: 0,
      dna_version_id: null,
      identity_updated: false,
      errors: [`No enrichable traits found in atom for "${characterName}"`],
    });
  }

  // 3. Build inferred_guidance from traits
  const inferredGuidance = traits.map((t) => ({
    label: t.label,
    value: t.value,
    confidence: t.confidence,
    source: t.source,
    category: t.category,
  }));

  // 4. Build identity_signature from key physical traits
  const identitySignature: IdentitySignature = {
    face: {
      eyes: attrs.eyes || null,
      skin_tone: attrs.skin_tone || null,
      distinctive_features: attrs.distinctive_features || null,
      facial_expression_range: attrs.facial_expression_range || null,
    },
    body: {
      build: attrs.build || null,
      height_estimate: attrs.height_estimate || null,
      movement_gait: attrs.movement_gait || null,
    },
    silhouette: {
      physical_markings: attrs.physical_markings || null,
      visual_complexity: attrs.visual_complexity || null,
    },
    wardrobe: {
      wardrobe_notes: attrs.wardrobe_notes || null,
    },
    derived_at: new Date().toISOString(),
    source: "atom_enrichment",
  };

  // 5. Read current character_visual_dna for this character
  const { data: currentDNA } = await sb
    .from("character_visual_dna")
    .select("id, version_number, inferred_guidance, identity_signature, identity_strength")
    .eq("project_id", projectId)
    .eq("character_name", characterName)
    .eq("is_current", true)
    .maybeSingle();

  let dnaVersionId: string | null = null;
  let identityUpdated = false;

  if (!currentDNA) {
    // No existing DNA — insert new row
    const { data: inserted, error: insertError } = await sb
      .from("character_visual_dna")
      .insert({
        project_id: projectId,
        character_name: characterName,
        version_number: 1,
        script_truth: [],
        narrative_markers: [],
        inferred_guidance: inferredGuidance,
        locked_invariants: [],
        flexible_axes: [],
        contradiction_flags: [],
        missing_clarifications: [],
        identity_signature: identitySignature,
        identity_strength: mode === "aggressive" ? "strong" : "medium",
        is_current: true,
      })
      .select("id")
      .single();

    if (insertError) {
      return respond({ enriched: false, traits_added: traits.length, dna_version_id: null, identity_updated: false, errors: [insertError.message] }, 500);
    }
    dnaVersionId = inserted.id;
    identityUpdated = true;
  } else {
    // Merge atom data into existing DNA
    const existingInferred = (currentDNA.inferred_guidance || []) as any[];
    const existingLabels = new Set(existingInferred.map((t: any) => t.label));
    const novelTraits = inferredGuidance.filter((t) => !existingLabels.has(t.label));

    if (novelTraits.length === 0 && mode === "conservative") {
      // No new traits in conservative mode — skip
      return respond({
        enriched: false,
        traits_added: 0,
        dna_version_id: currentDNA.id,
        identity_updated: false,
        errors: [],
      });
    }

    const mergedInferred = mode === "aggressive"
      ? [...existingInferred.filter((t: any) => !novelTraits.some((n) => n.label === t.label)), ...novelTraits]
      : [...existingInferred, ...novelTraits];

    // Merge identity signature (atom traits overwrite matching keys, novel keys append)
    const existingSig = (currentDNA.identity_signature || {}) as Record<string, any>;
    const mergedSignature = deepMergeIdentity(existingSig, identitySignature);

    const { error: updateError, data: updated } = await sb
      .from("character_visual_dna")
      .update({
        inferred_guidance: mergedInferred,
        identity_signature: mergedSignature,
        identity_strength: mode === "aggressive" ? "strong" : "medium",
        is_current: true,
      })
      .eq("id", currentDNA.id)
      .select("id")
      .single();

    if (updateError) {
      return respond({ enriched: false, traits_added: novelTraits.length, dna_version_id: null, identity_updated: false, errors: [updateError.message] }, 500);
    }
    dnaVersionId = updated.id;
    identityUpdated = novelTraits.length > 0;
  }

  return respond({
    enriched: true,
    traits_added: traits.length,
    dna_version_id: dnaVersionId,
    identity_updated: identityUpdated,
    errors: [],
  });
}

/**
 * Enrich location_visual_datasets from location atom attributes.
 */
async function enrichLocation(
  sb: any,
  projectId: string,
  locationName: string,
  mode: "aggressive" | "conservative",
): Promise<Response> {
  // 1. Find completed location atoms
  const { data: atoms, error: atomError } = await sb
    .from("atoms")
    .select("id, canonical_name, attributes, generation_status, readiness_state")
    .eq("project_id", projectId)
    .eq("atom_type", "location")
    .ilike("canonical_name", locationName)
    .eq("generation_status", "complete");

  if (atomError) {
    return respond({ enriched: false, entity_type: "location", entity_name: locationName, dataset_version: 0, fields_mapped: [], errors: [`Atom query failed: ${atomError.message}`] }, 500);
  }

  if (!atoms || atoms.length === 0) {
    return respond({
      enriched: false,
      entity_type: "location",
      entity_name: locationName,
      dataset_version: 0,
      fields_mapped: [],
      errors: [`No completed location atoms found for "${locationName}"`],
    });
  }

  const primaryAtom = atoms[0];
  const attrs = (primaryAtom.attributes || {}) as Record<string, any>;

  // 2. Map atom attributes to location_visual_datasets columns
  // structural_substrate: architecture + geography + era_relevance
  const structuralSubstrate = {
    primary: [attrs.architectureStyle || attrs.architecture || ""].filter(Boolean),
    secondary: [attrs.geography || attrs.geographyDescription || ""].filter(Boolean),
    notes: [attrs.era || attrs.period || attrs.era_relevance || ""].filter(Boolean).join("; "),
  };

  // atmosphere_behavior: atmosphere + lightingCharacter + sensoryTexture
  const atmosphereBehavior = {
    primary: [attrs.atmosphere || ""].filter(Boolean),
    secondary: [
      attrs.lightingCharacter ? `Lighting: ${attrs.lightingCharacter}` : "",
      attrs.acousticCharacter ? `Acoustic: ${attrs.acousticCharacter}` : "",
      attrs.temperatureImpression ? `Temperature: ${attrs.temperatureImpression}` : "",
    ].filter(Boolean),
    notes: [attrs.sensoryTexture ? `Sensory: ${(Array.isArray(attrs.sensoryTexture) ? attrs.sensoryTexture : [attrs.sensoryTexture]).join(", ")}` : ""].filter(Boolean).join("; "),
  };

  // slot_architectural_detail: signatureArchitecturalFeatures + dominantColors + settingType
  const slotArchitecturalDetail = {
    primary_truths: [
      ...(attrs.signatureArchitecturalFeatures ? (Array.isArray(attrs.signatureArchitecturalFeatures) ? attrs.signatureArchitecturalFeatures : [attrs.signatureArchitecturalFeatures]) : []),
      attrs.settingType || "",
    ].filter(Boolean),
    secondary_truths: [],
    contextual: [],
    forbidden_dominance: [],
    hard_negatives: [],
    notes: (attrs.dominantColors ? `Colors: ${(Array.isArray(attrs.dominantColors) ? attrs.dominantColors : [attrs.dominantColors]).join(", ")}` : ""),
  };

  // slot_atmosphere: atmosphericMood + temperatureImpression
  const slotAtmosphere = {
    primary_truths: [
      ...(attrs.atmosphericMood ? (Array.isArray(attrs.atmosphericMood) ? attrs.atmosphericMood : [attrs.atmosphericMood]) : []),
    ].filter(Boolean),
    secondary_truths: [attrs.atmosphere || ""].filter(Boolean),
    contextual: [],
    forbidden_dominance: [],
    hard_negatives: [],
    notes: attrs.temperatureImpression ? `Temperature impression: ${attrs.temperatureImpression}` : "",
  };

  // symbolic_motif: thematicSymbolism
  const symbolicMotif = {
    primary: attrs.thematicSymbolism ? [attrs.thematicSymbolism].filter(Boolean) : [],
    secondary: [],
    notes: "",
  };

  // status_expression_mode based on visualComplexity
  const visualComplexity = (attrs.visualComplexity || "").toLowerCase();
  let statusMode = "spatial";
  if (visualComplexity.includes("high") || visualComplexity.includes("complex")) {
    statusMode = "ornamental";
  } else if (visualComplexity.includes("medium") || visualComplexity.includes("moderate")) {
    statusMode = "material";
  } else if (visualComplexity.includes("austere") || visualComplexity.includes("minimal")) {
    statusMode = "austere";
  }

  // 3. Check for existing location_visual_datasets row
  const { data: existingDS } = await sb
    .from("location_visual_datasets")
    .select("id, dataset_version")
    .eq("project_id", projectId)
    .eq("location_name", locationName)
    .eq("is_current", true)
    .maybeSingle();

  let datasetVersion = 1;
  const fieldsMapped = [
    "structural_substrate",
    "atmosphere_behavior",
    "slot_architectural_detail",
    "slot_atmosphere",
    "symbolic_motif",
    "status_expression_mode",
  ];

  if (!existingDS) {
    const { error: insertError } = await sb
      .from("location_visual_datasets")
      .insert({
        project_id: projectId,
        location_name: locationName,
        dataset_version: 1,
        source_mode: "reverse_engineered",
        location_class: "primary_space",
        inherits_from_parent: false,
        structural_substrate: structuralSubstrate,
        surface_condition: { primary: [], secondary: [], notes: "" },
        atmosphere_behavior: atmosphereBehavior,
        spatial_character: { primary: [], secondary: [], notes: "" },
        status_signal: { primary: [], secondary: [], notes: "" },
        contextual_dressing: { primary: [], secondary: [], notes: "" },
        occupation_trace: { primary: [], secondary: [], forbidden_as_dominant: true, notes: "" },
        symbolic_motif: symbolicMotif,
        slot_establishing: { primary_truths: [], secondary_truths: [], contextual: [], forbidden_dominance: [], hard_negatives: [], notes: "" },
        slot_atmosphere: slotAtmosphere,
        slot_architectural_detail: slotArchitecturalDetail,
        slot_time_variant: { primary_truths: [], secondary_truths: [], contextual: [], forbidden_dominance: [], hard_negatives: [], notes: "" },
        slot_surface_language: { primary_truths: [], secondary_truths: [], contextual: [], forbidden_dominance: [], hard_negatives: [], notes: "" },
        slot_motif: { primary_truths: [], secondary_truths: [], contextual: [], forbidden_dominance: [], hard_negatives: [], notes: "" },
        status_expression_mode: statusMode,
        freshness_status: "fresh",
        is_current: true,
      });

    if (insertError) {
      return respond({ enriched: false, entity_type: "location", entity_name: locationName, dataset_version: 0, fields_mapped: [], errors: [insertError.message] }, 500);
    }
  } else {
    datasetVersion = existingDS.dataset_version + 1;

    const { error: updateError } = await sb
      .from("location_visual_datasets")
      .update({
        structural_substrate: structuralSubstrate,
        atmosphere_behavior: atmosphereBehavior,
        slot_architectural_detail: slotArchitecturalDetail,
        slot_atmosphere: slotAtmosphere,
        symbolic_motif: symbolicMotif,
        status_expression_mode: statusMode,
        dataset_version: datasetVersion,
        freshness_status: "fresh",
        source_mode: "reverse_engineered",
        is_current: true,
      })
      .eq("id", existingDS.id);

    if (updateError) {
      return respond({ enriched: false, entity_type: "location", entity_name: locationName, dataset_version: existingDS.dataset_version, fields_mapped: [], errors: [updateError.message] }, 500);
    }
  }

  return respond({
    enriched: true,
    entity_type: "location",
    entity_name: locationName,
    dataset_version: datasetVersion,
    fields_mapped: fieldsMapped,
    errors: [],
  });
}

/**
 * Deep merge identity signatures — atom traits overwrite matching keys, novel keys append.
 */
function deepMergeIdentity(existing: Record<string, any>, atom: Record<string, any>): Record<string, any> {
  const result = { ...existing };
  for (const [key, value] of Object.entries(atom)) {
    if (!value) continue;
    if (typeof value === "object" && !Array.isArray(value) && value !== null) {
      result[key] = { ...(result[key] || {}), ...value };
    } else {
      result[key] = value;
    }
  }
  result.derived_at = atom.derived_at || new Date().toISOString();
  result.source = "atom_enrichment";
  return result;
}

function respond(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}