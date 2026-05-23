// @ts-nocheck
/**
 * enrich-visual-dna-from-atoms — maps completed atom data into versioned
 * visual DNA storage tables (character_visual_dna and location_visual_datasets).
 *
 * Actions:
 *   enrich   — query completed atoms and upsert matching DNA records
 *   status   — return summary counts of ready atoms vs existing DNA records
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ── Character DNA layer constructors ────────────────────────────────────────

function buildScriptTruth(attrs: Record<string, any>): any[] {
  const items: any[] = [];
  if (attrs.script_description) {
    items.push({ source: "script_description", value: attrs.script_description });
  }
  if (attrs.backstory) {
    items.push({ source: "backstory", value: attrs.backstory });
  }
  if (attrs.character_summary || attrs.summary) {
    items.push({ source: "character_summary", value: attrs.character_summary || attrs.summary });
  }
  if (attrs.introduction_context) {
    items.push({ source: "introduction_context", value: attrs.introduction_context });
  }
  if (attrs.origin) {
    items.push({ source: "origin", value: attrs.origin });
  }
  return items.length > 0 ? items : [{ source: "atom_attributes", note: "No explicit script truth fields found in attributes" }];
}

function buildNarrativeMarkers(attrs: Record<string, any>): any[] {
  const items: any[] = [];
  if (attrs.narrative_role) {
    items.push({ type: "narrative_role", value: attrs.narrative_role });
  }
  if (attrs.role_in_story || attrs.story_role) {
    items.push({ type: "story_role", value: attrs.role_in_story || attrs.story_role });
  }
  if (attrs.character_arc) {
    items.push({ type: "character_arc", value: attrs.character_arc });
  }
  if (attrs.arc) {
    items.push({ type: "arc", value: attrs.arc });
  }
  if (attrs.character_archetype || attrs.archetype) {
    items.push({ type: "archetype", value: attrs.character_archetype || attrs.archetype });
  }
  if (attrs.journey_stage) {
    items.push({ type: "journey_stage", value: attrs.journey_stage });
  }
  if (attrs.primary_motivation) {
    items.push({ type: "primary_motivation", value: attrs.primary_motivation });
  }
  if (attrs.conflict_role) {
    items.push({ type: "conflict_role", value: attrs.conflict_role });
  }
  if (attrs.relationship_summary) {
    items.push({ type: "relationship_summary", value: attrs.relationship_summary });
  }
  if (attrs.emotional_journey) {
    items.push({ type: "emotional_journey", value: attrs.emotional_journey });
  }
  return items.length > 0 ? items : [{ note: "No narrative marker fields found in attributes" }];
}

function buildInferredGuidance(attrs: Record<string, any>): any[] {
  const items: any[] = [];
  if (attrs.personality) {
    items.push({ domain: "personality", value: attrs.personality });
  }
  if (attrs.personality_traits) {
    const traits = Array.isArray(attrs.personality_traits) ? attrs.personality_traits : [attrs.personality_traits];
    items.push({ domain: "personality_traits", value: traits });
  }
  if (attrs.motivation) {
    items.push({ domain: "motivation", value: attrs.motivation });
  }
  if (attrs.drives || attrs.driving_force) {
    items.push({ domain: "drives", value: attrs.drives || attrs.driving_force });
  }
  if (attrs.fears) {
    items.push({ domain: "fears", value: attrs.fears });
  }
  if (attrs.flaws) {
    items.push({ domain: "flaws", value: attrs.flaws });
  }
  if (attrs.strengths) {
    items.push({ domain: "strengths", value: attrs.strengths });
  }
  if (attrs.values) {
    items.push({ domain: "values", value: attrs.values });
  }
  if (attrs.casting_suggestions) {
    items.push({ domain: "casting_direction", value: attrs.casting_suggestions });
  }
  if (attrs.visual_complexity) {
    items.push({ domain: "visual_complexity", value: attrs.visual_complexity });
  }
  if (attrs.cultural_context) {
    items.push({ domain: "cultural_context", value: attrs.cultural_context });
  }
  return items.length > 0 ? items : [{ note: "No inferred guidance fields found in attributes" }];
}

function buildLockedInvariants(attrs: Record<string, any>): any[] {
  const items: any[] = [];
  if (attrs.physical_description) {
    items.push({ trait: "physical_description", value: attrs.physical_description });
  }
  if (attrs.age_estimate || attrs.age) {
    items.push({ trait: "age", value: attrs.age_estimate || attrs.age });
  }
  if (attrs.build) {
    items.push({ trait: "build", value: attrs.build });
  }
  if (attrs.height_estimate) {
    items.push({ trait: "height", value: attrs.height_estimate });
  }
  if (attrs.skin_tone) {
    items.push({ trait: "skin_tone", value: attrs.skin_tone });
  }
  if (attrs.hair) {
    items.push({ trait: "hair", value: attrs.hair });
  }
  if (attrs.eyes) {
    items.push({ trait: "eyes", value: attrs.eyes });
  }
  if (attrs.distinctive_features) {
    items.push({ trait: "distinctive_features", value: attrs.distinctive_features });
  }
  if (attrs.physical_markings) {
    items.push({ trait: "physical_markings", value: attrs.physical_markings });
  }
  if (attrs.ethnicity) {
    items.push({ trait: "ethnicity", value: attrs.ethnicity });
  }
  if (attrs.gender_presentation) {
    items.push({ trait: "gender_presentation", value: attrs.gender_presentation });
  }
  if (attrs.movement_gait) {
    items.push({ trait: "movement_gait", value: attrs.movement_gait });
  }
  if (attrs.facial_expression_range) {
    items.push({ trait: "facial_expression_range", value: attrs.facial_expression_range });
  }
  if (attrs.wardrobe_notes) {
    items.push({ trait: "wardrobe_notes", value: attrs.wardrobe_notes });
  }
  return items.length > 0 ? items : [{ note: "No locked invariant fields found in attributes" }];
}

function buildFlexibleAxes(attrs: Record<string, any>): any[] {
  const items: any[] = [];
  if (attrs.flexible_aspects) {
    const flex = Array.isArray(attrs.flexible_aspects) ? attrs.flexible_aspects : [attrs.flexible_aspects];
    items.push({ domain: "flexible_aspects", value: flex });
  }
  if (attrs.allowable_variations) {
    items.push({ domain: "allowable_variations", value: attrs.allowable_variations });
  }
  if (attrs.variable_attributes) {
    items.push({ domain: "variable_attributes", value: attrs.variable_attributes });
  }
  if (attrs.expression_range) {
    items.push({ domain: "expression_range", value: attrs.expression_range });
  }
  if (attrs.costume_variants) {
    items.push({ domain: "costume_variants", value: attrs.costume_variants });
  }
  // If no explicit flexible axes, derive from absence in locked_invariants
  if (items.length === 0) {
    items.push({ note: "No explicit flexible axes declared; all non-invariant traits are considered flexible by default" });
  }
  return items;
}

function buildContradictionFlags(attrs: Record<string, any>): any[] {
  const items: any[] = [];
  if (attrs.contradictions) {
    const c = Array.isArray(attrs.contradictions) ? attrs.contradictions : [attrs.contradictions];
    items.push(...c.map((v: any) => typeof v === "string" ? { description: v } : v));
  }
  if (attrs.conflicting_traits) {
    items.push({ category: "conflicting_traits", value: attrs.conflicting_traits });
  }
  if (attrs.notes?.contradiction) {
    items.push({ note: attrs.notes.contradiction });
  }
  return items;
}

function buildMissingClarifications(attrs: Record<string, any>): any[] {
  const items: any[] = [];
  if (attrs.unknowns) {
    const u = Array.isArray(attrs.unknowns) ? attrs.unknowns : [attrs.unknowns];
    items.push(...u.map((v: any) => typeof v === "string" ? { gap: v } : v));
  }
  if (attrs.gaps) {
    items.push({ category: "gaps", value: attrs.gaps });
  }
  if (attrs.clarifications_needed) {
    items.push({ category: "clarifications_needed", value: attrs.clarifications_needed });
  }
  if (attrs.ambiguous_traits) {
    items.push({ category: "ambiguous_traits", value: attrs.ambiguous_traits });
  }
  if (attrs.questions_remaining) {
    items.push({ category: "questions_remaining", value: attrs.questions_remaining });
  }
  return items;
}

function buildIdentitySignature(attrs: Record<string, any>, canonicalName: string): Record<string, any> {
  return {
    canonical_name: canonicalName,
    physical_summary: attrs.physical_description || null,
    archetype: attrs.character_archetype || attrs.archetype || null,
    narrative_role: attrs.narrative_role || attrs.role_in_story || null,
    personality_core: attrs.personality || null,
    motivation: attrs.motivation || attrs.primary_motivation || null,
    key_traits: [
      attrs.age_estimate || attrs.age,
      attrs.build,
      attrs.skin_tone,
      attrs.hair,
      attrs.eyes,
    ].filter(Boolean),
  };
}

// ── Location DNA layer constructors ─────────────────────────────────────────

function buildStructuralSubstrate(attrs: Record<string, any>): Record<string, any> {
  const primary: any[] = [];
  const secondary: any[] = [];
  if (attrs.architectureStyle) primary.push({ aspect: "architecture_style", value: attrs.architectureStyle });
  if (attrs.architecture_style) primary.push({ aspect: "architecture_style", value: attrs.architecture_style });
  if (attrs.settingType) primary.push({ aspect: "setting_type", value: attrs.settingType });
  if (attrs.setting_type) primary.push({ aspect: "setting_type", value: attrs.setting_type });
  if (attrs.era) primary.push({ aspect: "era", value: attrs.era });
  if (attrs.period) primary.push({ aspect: "period", value: attrs.period });
  if (attrs.signatureArchitecturalFeatures?.length) {
    primary.push({ aspect: "signature_features", values: attrs.signatureArchitecturalFeatures });
  }
  if (attrs.signature_architectural_features?.length) {
    primary.push({ aspect: "signature_features", values: attrs.signature_architectural_features });
  }
  if (attrs.structural_material) secondary.push({ aspect: "structural_material", value: attrs.structural_material });
  if (attrs.structuralMaterials) secondary.push({ aspect: "structural_material", value: attrs.structuralMaterials });
  if (attrs.building_materials?.length) secondary.push({ aspect: "building_materials", values: attrs.building_materials });
  if (attrs.buildingMaterials?.length) secondary.push({ aspect: "building_materials", values: attrs.buildingMaterials });
  return { primary, secondary, notes: attrs.structural_notes || attrs.architecturalNotes || "" };
}

function buildSurfaceCondition(attrs: Record<string, any>): Record<string, any> {
  const primary: any[] = [];
  const secondary: any[] = [];
  if (attrs.surface_texture) primary.push({ aspect: "surface_texture", value: attrs.surface_texture });
  if (attrs.surfaceTexture) primary.push({ aspect: "surface_texture", value: attrs.surfaceTexture });
  if (attrs.wall_finish) primary.push({ aspect: "wall_finish", value: attrs.wall_finish });
  if (attrs.wallFinish) primary.push({ aspect: "wall_finish", value: attrs.wallFinish });
  if (attrs.flooring) primary.push({ aspect: "flooring", value: attrs.flooring });
  if (attrs.materials) {
    const mats = Array.isArray(attrs.materials) ? attrs.materials : [attrs.materials];
    secondary.push({ aspect: "materials", values: mats });
  }
  if (attrs.condition) secondary.push({ aspect: "condition", value: attrs.condition });
  if (attrs.age_impression) secondary.push({ aspect: "age_impression", value: attrs.age_impression });
  if (attrs.wear_tear) secondary.push({ aspect: "wear_tear", value: attrs.wear_tear });
  return { primary, secondary, notes: attrs.surfaceNotes || attrs.surface_notes || "" };
}

function buildAtmosphereBehavior(attrs: Record<string, any>): Record<string, any> {
  const primary: any[] = [];
  const secondary: any[] = [];
  if (attrs.lightingCharacter) primary.push({ aspect: "lighting_character", value: attrs.lightingCharacter });
  if (attrs.lighting_character) primary.push({ aspect: "lighting_character", value: attrs.lighting_character });
  if (attrs.atmosphericMood?.length) {
    primary.push({ aspect: "atmospheric_mood", values: attrs.atmosphericMood });
  }
  if (attrs.atmospheric_mood?.length) {
    primary.push({ aspect: "atmospheric_mood", values: attrs.atmospheric_mood });
  }
  if (attrs.acousticCharacter) secondary.push({ aspect: "acoustic_character", value: attrs.acousticCharacter });
  if (attrs.acoustic_character) secondary.push({ aspect: "acoustic_character", value: attrs.acoustic_character });
  if (attrs.temperatureImpression) secondary.push({ aspect: "temperature_impression", value: attrs.temperatureImpression });
  if (attrs.temperature_impression) secondary.push({ aspect: "temperature_impression", value: attrs.temperature_impression });
  if (attrs.sensoryTexture?.length) secondary.push({ aspect: "sensory_textures", values: attrs.sensoryTexture });
  if (attrs.sensory_texture?.length) secondary.push({ aspect: "sensory_textures", values: attrs.sensory_texture });
  if (attrs.ambiance) secondary.push({ aspect: "ambiance", value: attrs.ambiance });
  return { primary, secondary, notes: attrs.atmosphereNotes || attrs.atmosphere_notes || "" };
}

function buildSpatialCharacter(attrs: Record<string, any>): Record<string, any> {
  const primary: any[] = [];
  const secondary: any[] = [];
  if (attrs.spatial_layout) primary.push({ aspect: "spatial_layout", value: attrs.spatial_layout });
  if (attrs.spatialLayout) primary.push({ aspect: "spatial_layout", value: attrs.spatialLayout });
  if (attrs.floor_plan) primary.push({ aspect: "floor_plan", value: attrs.floor_plan });
  if (attrs.floorPlan) primary.push({ aspect: "floor_plan", value: attrs.floorPlan });
  if (attrs.dimensions) primary.push({ aspect: "dimensions", value: attrs.dimensions });
  if (attrs.room_count) secondary.push({ aspect: "room_count", value: attrs.room_count });
  if (attrs.roomCount) secondary.push({ aspect: "room_count", value: attrs.roomCount });
  if (attrs.zones) secondary.push({ aspect: "zones", value: attrs.zones });
  if (attrs.circulation) secondary.push({ aspect: "circulation", value: attrs.circulation });
  if (attrs.verticality) secondary.push({ aspect: "verticality", value: attrs.verticality });
  return { primary, secondary, notes: attrs.spatialNotes || attrs.spatial_notes || "" };
}

function buildStatusSignal(attrs: Record<string, any>): Record<string, any> {
  const primary: any[] = [];
  const secondary: any[] = [];
  if (attrs.status_signals) {
    const sigs = Array.isArray(attrs.status_signals) ? attrs.status_signals : [attrs.status_signals];
    primary.push({ aspect: "status_signals", values: sigs });
  }
  if (attrs.statusSignals) {
    const sigs = Array.isArray(attrs.statusSignals) ? attrs.statusSignals : [attrs.statusSignals];
    primary.push({ aspect: "status_signals", values: sigs });
  }
  if (attrs.wealth_indicators) primary.push({ aspect: "wealth_indicators", value: attrs.wealth_indicators });
  if (attrs.wealthIndicators) primary.push({ aspect: "wealth_indicators", value: attrs.wealthIndicators });
  if (attrs.social_class) secondary.push({ aspect: "social_class", value: attrs.social_class });
  if (attrs.socialClass) secondary.push({ aspect: "social_class", value: attrs.socialClass });
  if (attrs.power_symbols) secondary.push({ aspect: "power_symbols", value: attrs.power_symbols });
  if (attrs.powerSymbols) secondary.push({ aspect: "power_symbols", value: attrs.powerSymbols });
  return { primary, secondary, notes: attrs.statusNotes || attrs.status_notes || "" };
}

function buildContextualDressing(attrs: Record<string, any>): Record<string, any> {
  const primary: any[] = [];
  const secondary: any[] = [];
  if (attrs.furnishings) primary.push({ aspect: "furnishings", value: attrs.furnishings });
  if (attrs.furniture) primary.push({ aspect: "furniture", value: attrs.furniture });
  if (attrs.decor) primary.push({ aspect: "decor", value: attrs.decor });
  if (attrs.dominantColors?.length) primary.push({ aspect: "dominant_colors", values: attrs.dominantColors });
  if (attrs.dominant_colors?.length) primary.push({ aspect: "dominant_colors", values: attrs.dominant_colors });
  if (attrs.color_palette) primary.push({ aspect: "color_palette", value: attrs.color_palette });
  if (attrs.colorPalette) primary.push({ aspect: "color_palette", value: attrs.colorPalette });
  if (attrs.textiles) secondary.push({ aspect: "textiles", value: attrs.textiles });
  if (attrs.artwork) secondary.push({ aspect: "artwork", value: attrs.artwork });
  if (attrs.lightingFixtures) secondary.push({ aspect: "lighting_fixtures", value: attrs.lightingFixtures });
  if (attrs.lighting_fixtures) secondary.push({ aspect: "lighting_fixtures", value: attrs.lighting_fixtures });
  return { primary, secondary, notes: attrs.dressingNotes || attrs.dressing_notes || "" };
}

function buildOccupationTrace(attrs: Record<string, any>): Record<string, any> {
  const primary: any[] = [];
  const secondary: any[] = [];
  if (attrs.traces_of_use) {
    const traces = Array.isArray(attrs.traces_of_use) ? attrs.traces_of_use : [attrs.traces_of_use];
    primary.push({ aspect: "traces_of_use", values: traces });
  }
  if (attrs.tracesOfUse) {
    const traces = Array.isArray(attrs.tracesOfUse) ? attrs.tracesOfUse : [attrs.tracesOfUse];
    primary.push({ aspect: "traces_of_use", values: traces });
  }
  if (attrs.activity_residue) primary.push({ aspect: "activity_residue", value: attrs.activity_residue });
  if (attrs.activityResidue) primary.push({ aspect: "activity_residue", value: attrs.activityResidue });
  if (attrs.wear_patterns) secondary.push({ aspect: "wear_patterns", value: attrs.wear_patterns });
  if (attrs.wearPatterns) secondary.push({ aspect: "wear_patterns", value: attrs.wearPatterns });
  if (attrs.clutter) secondary.push({ aspect: "clutter", value: attrs.clutter });
  if (attrs.organization_level) secondary.push({ aspect: "organization_level", value: attrs.organization_level });
  if (attrs.organizationLevel) secondary.push({ aspect: "organization_level", value: attrs.organizationLevel });
  return { primary, secondary, forbidden_as_dominant: true, notes: attrs.occupationNotes || attrs.occupation_notes || "" };
}

function buildSymbolicMotif(attrs: Record<string, any>): Record<string, any> {
  const primary: any[] = [];
  const secondary: any[] = [];
  if (attrs.thematicSymbolism) primary.push({ aspect: "thematic_symbolism", value: attrs.thematicSymbolism });
  if (attrs.thematic_symbolism) primary.push({ aspect: "thematic_symbolism", value: attrs.thematic_symbolism });
  if (attrs.symbolic_elements?.length) primary.push({ aspect: "symbolic_elements", values: attrs.symbolic_elements });
  if (attrs.symbolicElements?.length) primary.push({ aspect: "symbolic_elements", values: attrs.symbolicElements });
  if (attrs.motif_tags?.length) primary.push({ aspect: "motif_tags", values: attrs.motif_tags });
  if (attrs.motifTags?.length) primary.push({ aspect: "motif_tags", values: attrs.motifTags });
  if (attrs.narrativeFunction) secondary.push({ aspect: "narrative_function", value: attrs.narrativeFunction });
  if (attrs.narrative_function) secondary.push({ aspect: "narrative_function", value: attrs.narrative_function });
  if (attrs.moodBoardReference) secondary.push({ aspect: "mood_board_reference", value: attrs.moodBoardReference });
  if (attrs.mood_board_reference) secondary.push({ aspect: "mood_board_reference", value: attrs.mood_board_reference });
  return { primary, secondary, notes: attrs.symbolismNotes || attrs.symbolism_notes || "" };
}

// ── Character enrichment ────────────────────────────────────────────────────

function buildCharacterDnaRecord(
  projectId: string,
  atom: any,
  existingVersion: number | null,
): any {
  const attrs = (atom.attributes || {}) as Record<string, any>;
  const versionNumber = existingVersion !== null ? existingVersion + 1 : 1;

  return {
    project_id: projectId,
    character_name: atom.canonical_name,
    version_number: versionNumber,
    is_current: true,
    script_truth: buildScriptTruth(attrs),
    narrative_markers: buildNarrativeMarkers(attrs),
    inferred_guidance: buildInferredGuidance(attrs),
    locked_invariants: buildLockedInvariants(attrs),
    flexible_axes: buildFlexibleAxes(attrs),
    contradiction_flags: buildContradictionFlags(attrs),
    missing_clarifications: buildMissingClarifications(attrs),
    identity_signature: buildIdentitySignature(attrs, atom.canonical_name),
    identity_strength: computeIdentityStrength(attrs),
  };
}

function computeIdentityStrength(attrs: Record<string, any>): string {
  const invariantFields = [
    attrs.physical_description,
    attrs.age_estimate || attrs.age,
    attrs.build,
    attrs.height_estimate,
    attrs.skin_tone,
    attrs.hair,
    attrs.eyes,
    attrs.distinctive_features,
  ];
  const filled = invariantFields.filter(Boolean).length;
  if (filled >= 6) return "strong";
  if (filled >= 3) return "moderate";
  return "weak";
}

async function handleCharacterEnrich(
  supabase: any,
  projectId: string,
  entityIds: string[] | null,
): Promise<any> {
  let query = supabase
    .from("atoms")
    .select("id, entity_id, canonical_name, attributes")
    .eq("project_id", projectId)
    .eq("atom_type", "character")
    .in("generation_status", ["completed", "complete"]);

  if (entityIds && entityIds.length > 0) {
    query = query.in("id", entityIds);
  }

  const { data: atoms, error: atomErr } = await query;
  if (atomErr) throw new Error(`Failed to query character atoms: ${atomErr.message}`);

  if (!atoms || atoms.length === 0) {
    console.log("[enrich-visual-dna] No completed character atoms found");
    return { enriched: 0, skipped: 0, message: "No completed character atoms found" };
  }

  console.log(`[enrich-visual-dna] Found ${atoms.length} completed character atoms`);

  let enriched = 0;
  let skipped = 0;
  const results: any[] = [];

  for (const atom of atoms) {
    const name = atom.canonical_name;
    console.log(`[enrich-visual-dna] Processing character atom: "${name}" (${atom.id})`);

    // Find existing current DNA record for this character
    const { data: existing, error: existingErr } = await supabase
      .from("character_visual_dna")
      .select("id, version_number")
      .eq("project_id", projectId)
      .eq("character_name", name)
      .eq("is_current", true)
      .maybeSingle();

    if (existingErr) {
      console.error(`[enrich-visual-dna] Error checking existing DNA for "${name}": ${existingErr.message}`);
      skipped++;
      continue;
    }

    const currentVersion = existing?.version_number || null;

    // Mark existing record as not current if found
    if (existing) {
      const { error: updateErr } = await supabase
        .from("character_visual_dna")
        .update({ is_current: false })
        .eq("id", existing.id);

      if (updateErr) {
        console.error(`[enrich-visual-dna] Failed to deprecate old DNA for "${name}": ${updateErr.message}`);
        skipped++;
        continue;
      }
      console.log(`[enrich-visual-dna] Deprecated old DNA v${existing.version_number} for "${name}"`);
    }

    // Build and insert new DNA record
    const record = buildCharacterDnaRecord(projectId, atom, currentVersion);
    const { data: inserted, error: insertErr } = await supabase
      .from("character_visual_dna")
      .insert(record)
      .select("id, version_number")
      .single();

    if (insertErr) {
      console.error(`[enrich-visual-dna] Failed to insert DNA for "${name}": ${insertErr.message}`);
      skipped++;
      continue;
    }

    console.log(`[enrich-visual-dna] Created DNA v${inserted.version_number} for "${name}"`);
    enriched++;
    results.push({
      entity_id: atom.id,
      canonical_name: name,
      dna_id: inserted.id,
      version: inserted.version_number,
    });
  }

  return { enriched, skipped, total_atoms: atoms.length, results };
}

// ── Location enrichment ─────────────────────────────────────────────────────

function buildLocationDatasetRecord(
  projectId: string,
  atom: any,
  existingVersion: number | null,
): any {
  const attrs = (atom.attributes || {}) as Record<string, any>;
  const datasetVersion = existingVersion !== null ? existingVersion + 1 : 1;

  return {
    project_id: projectId,
    location_name: atom.canonical_name,
    dataset_version: datasetVersion,
    is_current: true,
    source_mode: "reverse_engineered",
    provenance: { source_atom_id: atom.id, source_atom_type: "location" },
    completeness_score: computeCompletenessScore(attrs),
    location_class: inferLocationClass(attrs),
    structural_substrate: buildStructuralSubstrate(attrs),
    surface_condition: buildSurfaceCondition(attrs),
    atmosphere_behavior: buildAtmosphereBehavior(attrs),
    spatial_character: buildSpatialCharacter(attrs),
    status_signal: buildStatusSignal(attrs),
    contextual_dressing: buildContextualDressing(attrs),
    occupation_trace: buildOccupationTrace(attrs),
    symbolic_motif: buildSymbolicMotif(attrs),
    freshness_status: "fresh",
  };
}

function computeCompletenessScore(attrs: Record<string, any>): number {
  let filled = 0;
  const checks = [
    attrs.architectureStyle || attrs.architecture_style,
    attrs.settingType || attrs.setting_type,
    attrs.era,
    attrs.period,
    attrs.lightingCharacter || attrs.lighting_character,
    attrs.atmosphericMood?.length || attrs.atmospheric_mood?.length,
    attrs.dominantColors?.length || attrs.dominant_colors?.length,
    attrs.sensoryTexture?.length || attrs.sensory_texture?.length,
    attrs.thematicSymbolism || attrs.thematic_symbolism,
    attrs.signatureArchitecturalFeatures?.length || attrs.signature_architectural_features?.length,
  ];
  for (const c of checks) {
    if (c) filled++;
  }
  return Math.round((filled / checks.length) * 100) / 100;
}

function inferLocationClass(attrs: Record<string, any>): string {
  const type = (attrs.settingType || attrs.setting_type || "").toLowerCase();
  if (/courtyard|plaza|garden|patio|yard/i.test(type)) return "courtyard";
  if (/exterior|street|alley|outdoor|outside|bridge|road|highway/i.test(type)) return "exterior";
  if (/storage|warehouse|vault|basement|attic|closet/i.test(type)) return "storage";
  if (/passage|hallway|corridor|tunnel|stairwell|entrance/i.test(type)) return "passage";
  if (/workshop|studio|lab|garage|kitchen|factory/i.test(type)) return "workshop";
  if (/room|office|bedroom|living|dining|bath|chamber/i.test(type)) return "sub_space";
  return "primary_space";
}

async function handleLocationEnrich(
  supabase: any,
  projectId: string,
  entityIds: string[] | null,
): Promise<any> {
  let query = supabase
    .from("atoms")
    .select("id, entity_id, canonical_name, attributes")
    .eq("project_id", projectId)
    .eq("atom_type", "location")
    .in("generation_status", ["completed", "complete"]);

  if (entityIds && entityIds.length > 0) {
    query = query.in("id", entityIds);
  }

  const { data: atoms, error: atomErr } = await query;
  if (atomErr) throw new Error(`Failed to query location atoms: ${atomErr.message}`);

  if (!atoms || atoms.length === 0) {
    console.log("[enrich-visual-dna] No completed location atoms found");
    return { enriched: 0, skipped: 0, message: "No completed location atoms found" };
  }

  console.log(`[enrich-visual-dna] Found ${atoms.length} completed location atoms`);

  let enriched = 0;
  let skipped = 0;
  const results: any[] = [];

  for (const atom of atoms) {
    const name = atom.canonical_name;
    console.log(`[enrich-visual-dna] Processing location atom: "${name}" (${atom.id})`);

    // Find existing current dataset record for this location
    const { data: existing, error: existingErr } = await supabase
      .from("location_visual_datasets")
      .select("id, dataset_version")
      .eq("project_id", projectId)
      .eq("location_name", name)
      .eq("is_current", true)
      .maybeSingle();

    if (existingErr) {
      console.error(`[enrich-visual-dna] Error checking existing dataset for "${name}": ${existingErr.message}`);
      skipped++;
      continue;
    }

    const currentVersion = existing?.dataset_version || null;

    // Mark existing record as not current if found
    if (existing) {
      const { error: updateErr } = await supabase
        .from("location_visual_datasets")
        .update({ is_current: false })
        .eq("id", existing.id);

      if (updateErr) {
        console.error(`[enrich-visual-dna] Failed to deprecate old dataset for "${name}": ${updateErr.message}`);
        skipped++;
        continue;
      }
      console.log(`[enrich-visual-dna] Deprecated old dataset v${existing.dataset_version} for "${name}"`);
    }

    // Build and insert new dataset record
    const record = buildLocationDatasetRecord(projectId, atom, currentVersion);
    const { data: inserted, error: insertErr } = await supabase
      .from("location_visual_datasets")
      .insert(record)
      .select("id, dataset_version")
      .single();

    if (insertErr) {
      console.error(`[enrich-visual-dna] Failed to insert dataset for "${name}": ${insertErr.message}`);
      skipped++;
      continue;
    }

    console.log(`[enrich-visual-dna] Created dataset v${inserted.dataset_version} for "${name}"`);
    enriched++;
    results.push({
      entity_id: atom.id,
      location_name: name,
      dataset_id: inserted.id,
      version: inserted.dataset_version,
    });
  }

  return { enriched, skipped, total_atoms: atoms.length, results };
}

// ── Status action ───────────────────────────────────────────────────────────

async function handleStatus(
  supabase: any,
  projectId: string,
  entityType: string,
): Promise<any> {
  // Count ready atoms
  const { data: readyAtoms, error: atomErr } = await supabase
    .from("atoms")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("atom_type", entityType)
    .in("generation_status", ["completed", "complete"]);

  if (atomErr) throw new Error(`Failed to count ready atoms: ${atomErr.message}`);

  // Count total atoms of this type
  const { count: totalAtoms, error: totalErr } = await supabase
    .from("atoms")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("atom_type", entityType);

  if (totalErr) throw new Error(`Failed to count total atoms: ${totalErr.message}`);

  // Count current DNA records
  let dnaCount = 0;
  if (entityType === "character") {
    const { count, error: dnaErr } = await supabase
      .from("character_visual_dna")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("is_current", true);

    if (dnaErr) throw new Error(`Failed to count DNA records: ${dnaErr.message}`);
    dnaCount = count || 0;
  } else if (entityType === "location") {
    const { count, error: dnaErr } = await supabase
      .from("location_visual_datasets")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("is_current", true);

    if (dnaErr) throw new Error(`Failed to count dataset records: ${dnaErr.message}`);
    dnaCount = count || 0;
  }

  return {
    entity_type: entityType,
    project_id: projectId,
    total_atoms: totalAtoms || 0,
    ready_atoms: readyAtoms?.length || 0,
    current_dna_records: dnaCount,
    pending_enrichment: (readyAtoms?.length || 0) - dnaCount,
  };
}

// ── Main handler ────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = adminClient();
    const body = await req.json();
    const { action, project_id, entity_type, entity_ids } = body;

    if (!project_id) {
      return json({ error: "project_id is required" }, 400);
    }

    console.log(`[enrich-visual-dna] Action: ${action}, Project: ${project_id}, Entity: ${entity_type || "any"}`);

    switch (action) {
      case "enrich": {
        if (!entity_type || !["character", "location"].includes(entity_type)) {
          return json({ error: "entity_type must be 'character' or 'location'" }, 400);
        }

        let result: any;
        if (entity_type === "character") {
          result = await handleCharacterEnrich(supabase, project_id, entity_ids || null);
        } else {
          result = await handleLocationEnrich(supabase, project_id, entity_ids || null);
        }

        return json({
          action: "enrich",
          entity_type,
          project_id,
          ...result,
        });
      }

      case "status": {
        if (!entity_type || !["character", "location"].includes(entity_type)) {
          return json({ error: "entity_type must be 'character' or 'location' for status" }, 400);
        }

        const status = await handleStatus(supabase, project_id, entity_type);
        return json(status);
      }

      default:
        return json({ error: `Unknown action: ${action}. Supported: enrich, status` }, 400);
    }
  } catch (e: any) {
    console.error(`[enrich-visual-dna] Error:`, e.message);
    return json({ error: e.message }, 500);
  }
});