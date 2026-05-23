/**
 * Tests for enrich-visual-dna-from-atoms — maps completed atom data into
 * versioned visual DNA storage tables.
 *
 * Tests all pure-logic builder functions:
 *   Character DNA: buildScriptTruth, buildNarrativeMarkers, buildInferredGuidance,
 *     buildLockedInvariants, buildFlexibleAxes, buildContradictionFlags,
 *     buildMissingClarifications, buildIdentitySignature, computeIdentityStrength,
 *     buildCharacterDnaRecord
 *   Location DNA: buildStructuralSubstrate, buildSurfaceCondition,
 *     buildAtmosphereBehavior, buildSpatialCharacter, buildStatusSignal,
 *     buildContextualDressing, buildOccupationTrace, buildSymbolicMotif,
 *     computeCompletenessScore, inferLocationClass, buildLocationDatasetRecord
 *   Handler-level: serve wrapper (cors, validation, error handling)
 *
 * Covers:
 *   ✓ Primary use cases — full attribute sets produce correct output
 *   ✓ Edge cases — empty, missing, null attributes
 *   ✓ Invariants — version increment, fallback notes, type safety
 */

import {
  assertEquals,
  assert,
  assertObjectMatch,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ══════════════════════════════════════════════════════════════════════════════
// Mirrored harness — pure logic extracted from enrich-visual-dna-from-atoms
// ══════════════════════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Character DNA builders ──────────────────────────────────────────────────

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
  return items.length > 0
    ? items
    : [{ source: "atom_attributes", note: "No explicit script truth fields found in attributes" }];
}

function buildNarrativeMarkers(attrs: Record<string, any>): any[] {
  const items: any[] = [];
  if (attrs.narrative_role) items.push({ type: "narrative_role", value: attrs.narrative_role });
  if (attrs.role_in_story || attrs.story_role) items.push({ type: "story_role", value: attrs.role_in_story || attrs.story_role });
  if (attrs.character_arc) items.push({ type: "character_arc", value: attrs.character_arc });
  if (attrs.arc) items.push({ type: "arc", value: attrs.arc });
  if (attrs.character_archetype || attrs.archetype) items.push({ type: "archetype", value: attrs.character_archetype || attrs.archetype });
  if (attrs.journey_stage) items.push({ type: "journey_stage", value: attrs.journey_stage });
  if (attrs.primary_motivation) items.push({ type: "primary_motivation", value: attrs.primary_motivation });
  if (attrs.conflict_role) items.push({ type: "conflict_role", value: attrs.conflict_role });
  if (attrs.relationship_summary) items.push({ type: "relationship_summary", value: attrs.relationship_summary });
  if (attrs.emotional_journey) items.push({ type: "emotional_journey", value: attrs.emotional_journey });
  return items.length > 0
    ? items
    : [{ note: "No narrative marker fields found in attributes" }];
}

function buildInferredGuidance(attrs: Record<string, any>): any[] {
  const items: any[] = [];
  if (attrs.personality) items.push({ domain: "personality", value: attrs.personality });
  if (attrs.personality_traits) {
    const traits = Array.isArray(attrs.personality_traits) ? attrs.personality_traits : [attrs.personality_traits];
    items.push({ domain: "personality_traits", value: traits });
  }
  if (attrs.motivation) items.push({ domain: "motivation", value: attrs.motivation });
  if (attrs.drives || attrs.driving_force) items.push({ domain: "drives", value: attrs.drives || attrs.driving_force });
  if (attrs.fears) items.push({ domain: "fears", value: attrs.fears });
  if (attrs.flaws) items.push({ domain: "flaws", value: attrs.flaws });
  if (attrs.strengths) items.push({ domain: "strengths", value: attrs.strengths });
  if (attrs.values) items.push({ domain: "values", value: attrs.values });
  if (attrs.casting_suggestions) items.push({ domain: "casting_direction", value: attrs.casting_suggestions });
  if (attrs.visual_complexity) items.push({ domain: "visual_complexity", value: attrs.visual_complexity });
  if (attrs.cultural_context) items.push({ domain: "cultural_context", value: attrs.cultural_context });
  return items.length > 0
    ? items
    : [{ note: "No inferred guidance fields found in attributes" }];
}

function buildLockedInvariants(attrs: Record<string, any>): any[] {
  const items: any[] = [];
  if (attrs.physical_description) items.push({ trait: "physical_description", value: attrs.physical_description });
  if (attrs.age_estimate || attrs.age) items.push({ trait: "age", value: attrs.age_estimate || attrs.age });
  if (attrs.build) items.push({ trait: "build", value: attrs.build });
  if (attrs.height_estimate) items.push({ trait: "height", value: attrs.height_estimate });
  if (attrs.skin_tone) items.push({ trait: "skin_tone", value: attrs.skin_tone });
  if (attrs.hair) items.push({ trait: "hair", value: attrs.hair });
  if (attrs.eyes) items.push({ trait: "eyes", value: attrs.eyes });
  if (attrs.distinctive_features) items.push({ trait: "distinctive_features", value: attrs.distinctive_features });
  if (attrs.physical_markings) items.push({ trait: "physical_markings", value: attrs.physical_markings });
  if (attrs.ethnicity) items.push({ trait: "ethnicity", value: attrs.ethnicity });
  if (attrs.gender_presentation) items.push({ trait: "gender_presentation", value: attrs.gender_presentation });
  if (attrs.movement_gait) items.push({ trait: "movement_gait", value: attrs.movement_gait });
  if (attrs.facial_expression_range) items.push({ trait: "facial_expression_range", value: attrs.facial_expression_range });
  if (attrs.wardrobe_notes) items.push({ trait: "wardrobe_notes", value: attrs.wardrobe_notes });
  return items.length > 0
    ? items
    : [{ note: "No locked invariant fields found in attributes" }];
}

function buildFlexibleAxes(attrs: Record<string, any>): any[] {
  const items: any[] = [];
  if (attrs.flexible_aspects) {
    const flex = Array.isArray(attrs.flexible_aspects) ? attrs.flexible_aspects : [attrs.flexible_aspects];
    items.push({ domain: "flexible_aspects", value: flex });
  }
  if (attrs.allowable_variations) items.push({ domain: "allowable_variations", value: attrs.allowable_variations });
  if (attrs.variable_attributes) items.push({ domain: "variable_attributes", value: attrs.variable_attributes });
  if (attrs.expression_range) items.push({ domain: "expression_range", value: attrs.expression_range });
  if (attrs.costume_variants) items.push({ domain: "costume_variants", value: attrs.costume_variants });
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
  if (attrs.conflicting_traits) items.push({ category: "conflicting_traits", value: attrs.conflicting_traits });
  if (attrs.notes?.contradiction) items.push({ note: attrs.notes.contradiction });
  return items;
}

function buildMissingClarifications(attrs: Record<string, any>): any[] {
  const items: any[] = [];
  if (attrs.unknowns) {
    const u = Array.isArray(attrs.unknowns) ? attrs.unknowns : [attrs.unknowns];
    items.push(...u.map((v: any) => typeof v === "string" ? { gap: v } : v));
  }
  if (attrs.gaps) items.push({ category: "gaps", value: attrs.gaps });
  if (attrs.clarifications_needed) items.push({ category: "clarifications_needed", value: attrs.clarifications_needed });
  if (attrs.ambiguous_traits) items.push({ category: "ambiguous_traits", value: attrs.ambiguous_traits });
  if (attrs.questions_remaining) items.push({ category: "questions_remaining", value: attrs.questions_remaining });
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

// ── Location DNA builders ───────────────────────────────────────────────────

function buildStructuralSubstrate(attrs: Record<string, any>): Record<string, any> {
  const primary: any[] = [];
  const secondary: any[] = [];
  if (attrs.architectureStyle) primary.push({ aspect: "architecture_style", value: attrs.architectureStyle });
  if (attrs.architecture_style) primary.push({ aspect: "architecture_style", value: attrs.architecture_style });
  if (attrs.settingType) primary.push({ aspect: "setting_type", value: attrs.settingType });
  if (attrs.setting_type) primary.push({ aspect: "setting_type", value: attrs.setting_type });
  if (attrs.era) primary.push({ aspect: "era", value: attrs.era });
  if (attrs.period) primary.push({ aspect: "period", value: attrs.period });
  if (attrs.signatureArchitecturalFeatures?.length) primary.push({ aspect: "signature_features", values: attrs.signatureArchitecturalFeatures });
  if (attrs.signature_architectural_features?.length) primary.push({ aspect: "signature_features", values: attrs.signature_architectural_features });
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
  if (attrs.atmosphericMood?.length) primary.push({ aspect: "atmospheric_mood", values: attrs.atmosphericMood });
  if (attrs.atmospheric_mood?.length) primary.push({ aspect: "atmospheric_mood", values: attrs.atmospheric_mood });
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

// ── Handler-level harness ───────────────────────────────────────────────────

async function handlerWrapper(
  req: Request,
  handlerLogic: (req: Request) => Promise<Response> | Response,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    return await handlerLogic(req);
  } catch (e: any) {
    console.error("[enrich-visual-dna] Error:", e.message || e);
    return json({ error: e.message || e }, 500);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1: buildScriptTruth — Character Script Truth
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildScriptTruth: full attribute set produces all 5 items",
  fn() {
    const attrs = {
      script_description: "A hero's journey",
      backstory: "Orphaned at young age",
      character_summary: "Brave and resourceful",
      introduction_context: "First seen in battle",
      origin: "Outer Rim Territories",
    };
    const result = buildScriptTruth(attrs);
    assertEquals(result.length, 5, "all 5 fields present");
    assertEquals(result[0].source, "script_description");
    assertEquals(result[4].source, "origin");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildScriptTruth: empty attributes returns fallback note",
  fn() {
    const result = buildScriptTruth({});
    assertEquals(result.length, 1, "fallback item");
    assertEquals(result[0].source, "atom_attributes");
    assert(result[0].note.includes("No explicit script truth"), "fallback note present");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildScriptTruth: character_summary fallback to summary",
  fn() {
    const r1 = buildScriptTruth({ character_summary: "Direct" });
    assert(r1.some((i: any) => i.value === "Direct"), "prefers character_summary");

    const r2 = buildScriptTruth({ summary: "Fallback" });
    assert(r2.some((i: any) => i.value === "Fallback"), "falls back to summary");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildScriptTruth: partial attributes only includes present fields",
  fn() {
    const result = buildScriptTruth({ backstory: "Grew up in war" });
    assertEquals(result.length, 1);
    assertEquals(result[0].source, "backstory");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2: buildNarrativeMarkers — Narrative Role/Markers
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildNarrativeMarkers: full set produces 10 items",
  fn() {
    const result = buildNarrativeMarkers({
      narrative_role: "protagonist",
      role_in_story: "leader",
      character_arc: "redemption",
      arc: "heroic",
      character_archetype: "hero",
      journey_stage: "crossing threshold",
      primary_motivation: "save family",
      conflict_role: "antagonist foil",
      relationship_summary: "mentor to apprentice",
      emotional_journey: "from fear to courage",
    });
    assertEquals(result.length, 10, "all 10 marker fields present");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildNarrativeMarkers: role_in_story fallback to story_role",
  fn() {
    const r1 = buildNarrativeMarkers({ role_in_story: "guide" });
    assert(r1.some((i: any) => i.value === "guide"), "role_in_story works");

    const r2 = buildNarrativeMarkers({ story_role: "villain" });
    assert(r2.some((i: any) => i.value === "villain"), "story_role fallback works");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildNarrativeMarkers: empty returns fallback note",
  fn() {
    const result = buildNarrativeMarkers({});
    assertEquals(result.length, 1);
    assert(result[0].note.includes("No narrative marker"), "fallback note present");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3: buildInferredGuidance — Personality/Guidance
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildInferredGuidance: full set produces 11 items",
  fn() {
    const result = buildInferredGuidance({
      personality: "Determined",
      personality_traits: ["Brave", "Loyal"],
      motivation: "Justice",
      drives: "Protect the weak",
      fears: "Failure",
      flaws: "Stubborn",
      strengths: "Strategic mind",
      values: "Honor",
      casting_suggestions: "A-list actor",
      visual_complexity: "Medium",
      cultural_context: "Feudal Japan",
    });
    assertEquals(result.length, 11, "all 11 guidance fields present");
    assert(result.some((i: any) => i.domain === "personality"));
    assert(result.some((i: any) => i.domain === "casting_direction"));
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildInferredGuidance: personality_traits array handling",
  fn() {
    const arr = buildInferredGuidance({ personality_traits: ["Brave", "Loyal"] });
    const item = arr.find((i: any) => i.domain === "personality_traits");
    assert(item, "personality_traits present");
    assertEquals(item.value.length, 2, "array preserved");

    const single = buildInferredGuidance({ personality_traits: "Brave" });
    const sItem = single.find((i: any) => i.domain === "personality_traits");
    assert(sItem, "string wrapped into array");
    assertEquals(sItem.value.length, 1, "string becomes single-item array");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildInferredGuidance: drives/driving_force fallback",
  fn() {
    const r1 = buildInferredGuidance({ drives: "Power" });
    assert(r1.some((i: any) => i.value === "Power"));

    const r2 = buildInferredGuidance({ driving_force: "Survival" });
    assert(r2.some((i: any) => i.value === "Survival"));
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildInferredGuidance: empty returns fallback note",
  fn() {
    const result = buildInferredGuidance({});
    assertEquals(result.length, 1);
    assert(result[0].note.includes("No inferred guidance"), "fallback note present");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4: buildLockedInvariants — Physical invariants
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildLockedInvariants: full set produces 14 items",
  fn() {
    const result = buildLockedInvariants({
      physical_description: "Tall lean figure",
      age_estimate: "30s",
      build: "Athletic",
      height_estimate: "6'0\"",
      skin_tone: "Fair",
      hair: "Dark brown",
      eyes: "Hazel",
      distinctive_features: "Scar on cheek",
      physical_markings: "Tattoo on arm",
      ethnicity: "Caucasian",
      gender_presentation: "Masculine",
      movement_gait: "Purposeful stride",
      facial_expression_range: "Intense",
      wardrobe_notes: "Dark clothing",
    });
    assertEquals(result.length, 14, "all 14 invariant fields present");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildLockedInvariants: age fallback age_estimate",
  fn() {
    const r1 = buildLockedInvariants({ age_estimate: "40s" });
    assert(r1.some((i: any) => i.value === "40s"));

    const r2 = buildLockedInvariants({ age: "50s" });
    assert(r2.some((i: any) => i.value === "50s"));
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildLockedInvariants: empty returns fallback note",
  fn() {
    const result = buildLockedInvariants({});
    assertEquals(result.length, 1);
    assert(result[0].note.includes("No locked invariant"), "fallback note present");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 5: buildFlexibleAxes — Flexible/Variable traits
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildFlexibleAxes: explicit flexible aspects",
  fn() {
    const result = buildFlexibleAxes({
      flexible_aspects: ["hairstyle", "clothing"],
      allowable_variations: "Minor changes only",
      variable_attributes: "Expression range",
      expression_range: "Subtle to intense",
      costume_variants: "3 outfits",
    });
    assertEquals(result.length, 5, "all 5 items present");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildFlexibleAxes: flexible_aspects normalized to array",
  fn() {
    const r1 = buildFlexibleAxes({ flexible_aspects: ["a", "b"] });
    const i1 = r1.find((i: any) => i.domain === "flexible_aspects");
    assertEquals(i1.value.length, 2, "array preserved");

    const r2 = buildFlexibleAxes({ flexible_aspects: "single" });
    const i2 = r2.find((i: any) => i.domain === "flexible_aspects");
    assertEquals(i2.value.length, 1, "string wrapped to array");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildFlexibleAxes: empty falls back to default note",
  fn() {
    const result = buildFlexibleAxes({});
    assertEquals(result.length, 1, "fallback item");
    assert(result[0].note.includes("No explicit flexible axes"), "fallback note");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 6: buildContradictionFlags — Contradictions
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildContradictionFlags: contradictions array expands to items",
  fn() {
    const result = buildContradictionFlags({
      contradictions: ["Age vs appearance mismatch", "Personality inconsistency"],
      conflicting_traits: "Loyal but betrays",
      notes: { contradiction: "Script says one thing, actions another" },
    });
    assertEquals(result.length, 4, "4 items: 2 contradictions + conflicting_traits + notes");
    assertEquals(result[0].description, "Age vs appearance mismatch");
    assertEquals(result[1].description, "Personality inconsistency");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildContradictionFlags: string contradictions wrapped in description",
  fn() {
    const result = buildContradictionFlags({
      contradictions: "Single contradiction string",
    });
    assertEquals(result.length, 1);
    assertEquals(result[0].description, "Single contradiction string");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildContradictionFlags: object contradictions passed through",
  fn() {
    const result = buildContradictionFlags({
      contradictions: [{ severity: "high", description: "Plot hole" }],
    });
    assertEquals(result.length, 1);
    assertEquals(result[0].severity, "high");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildContradictionFlags: empty returns empty array",
  fn() {
    const result = buildContradictionFlags({});
    assertEquals(result.length, 0, "no contradictions -> empty");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 7: buildMissingClarifications — Unknowns/Gaps
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildMissingClarifications: full set produces 5 items",
  fn() {
    const result = buildMissingClarifications({
      unknowns: ["Backstory unknown"],
      gaps: "Missing mid-section motivation",
      clarifications_needed: "Confirm character age",
      ambiguous_traits: "Eye color uncertain",
      questions_remaining: "Is this a red herring?",
    });
    assertEquals(result.length, 5, "all 5 clarification fields present");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildMissingClarifications: unknowns normalizes",
  fn() {
    const r1 = buildMissingClarifications({ unknowns: ["Gap A", "Gap B"] });
    assertEquals(r1.length, 2, "array items exploded");
    assertEquals(r1[0].gap, "Gap A");

    const r2 = buildMissingClarifications({ unknowns: "Single gap" });
    assertEquals(r2.length, 1, "string wrapped");
    assertEquals(r2[0].gap, "Single gap");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildMissingClarifications: empty returns empty array",
  fn() {
    const result = buildMissingClarifications({});
    assertEquals(result.length, 0, "no clarifications -> empty");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 8: buildIdentitySignature — Identity summary
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildIdentitySignature: full build with all fields",
  fn() {
    const result = buildIdentitySignature(
      {
        physical_description: "Tall, scarred warrior",
        character_archetype: "Hero",
        narrative_role: "Protagonist",
        personality: "Stoic but kind",
        motivation: "Revenge",
        age_estimate: "30s",
        build: "Muscular",
        skin_tone: "Tan",
        hair: "Black",
        eyes: "Brown",
      },
      "Aragorn II",
    );
    assertEquals(result.canonical_name, "Aragorn II");
    assertEquals(result.physical_summary, "Tall, scarred warrior");
    assertEquals(result.archetype, "Hero");
    assertEquals(result.narrative_role, "Protagonist");
    assertEquals(result.personality_core, "Stoic but kind");
    assertEquals(result.motivation, "Revenge");
    assertEquals(result.key_traits.length, 5, "5 key traits");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildIdentitySignature: minimal — nulls for missing, key_traits filter",
  fn() {
    const result = buildIdentitySignature({}, "Unknown");
    assertEquals(result.canonical_name, "Unknown");
    assertEquals(result.physical_summary, null);
    assertEquals(result.archetype, null);
    assertEquals(result.narrative_role, null);
    assertEquals(result.personality_core, null);
    assertEquals(result.motivation, null);
    assertEquals(result.key_traits.length, 0, "no traits filled");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildIdentitySignature: fallback chains for archetype, narrative_role, motivation",
  fn() {
    const r1 = buildIdentitySignature({ archetype: "Villain" }, "X");
    assertEquals(r1.archetype, "Villain", "archetype fallback");

    const r2 = buildIdentitySignature({ character_archetype: "Mentor" }, "X");
    assertEquals(r2.archetype, "Mentor", "character_archetype preferred");

    const r3 = buildIdentitySignature({ role_in_story: "Sidekick" }, "X");
    assertEquals(r3.narrative_role, "Sidekick", "role_in_story fallback");

    const r4 = buildIdentitySignature({ primary_motivation: "Duty" }, "X");
    assertEquals(r4.motivation, "Duty", "primary_motivation fallback");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 9: computeIdentityStrength — Strength classification
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "computeIdentityStrength: 6+ filled = strong",
  fn() {
    const result = computeIdentityStrength({
      physical_description: "Tall",
      age_estimate: "30s",
      build: "Athletic",
      height_estimate: "6ft",
      skin_tone: "Fair",
      hair: "Brown",
      eyes: "Blue",
    });
    assertEquals(result, "strong");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "computeIdentityStrength: 3-5 filled = moderate",
  fn() {
    const r1 = computeIdentityStrength({ physical_description: "Tall", age_estimate: "30s", build: "Athletic" });
    assertEquals(r1, "moderate", "3 filled = moderate");

    const r2 = computeIdentityStrength({
      physical_description: "Tall",
      age_estimate: "30s",
      build: "Athletic",
      skin_tone: "Fair",
      hair: "Brown",
    });
    assertEquals(r2, "moderate", "5 filled = moderate");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "computeIdentityStrength: 0-2 filled = weak",
  fn() {
    const r1 = computeIdentityStrength({});
    assertEquals(r1, "weak", "0 filled = weak");

    const r2 = computeIdentityStrength({ physical_description: "Tall", age_estimate: "30s" });
    assertEquals(r2, "weak", "2 filled = weak");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 10: buildCharacterDnaRecord — Full record assembly
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildCharacterDnaRecord: new record (no existing) gets version 1",
  fn() {
    const result = buildCharacterDnaRecord(
      "proj-123",
      { id: "atom-1", canonical_name: "Sarah Connor", attributes: { physical_description: "Lean" } },
      null,
    );
    assertEquals(result.project_id, "proj-123");
    assertEquals(result.character_name, "Sarah Connor");
    assertEquals(result.version_number, 1, "new record starts at v1");
    assertEquals(result.is_current, true);
    assertEquals(result.identity_strength, "weak");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildCharacterDnaRecord: existing record increments version",
  fn() {
    const result = buildCharacterDnaRecord(
      "proj-123",
      { id: "atom-1", canonical_name: "Sarah Connor", attributes: { physical_description: "Lean" } },
      3,
    );
    assertEquals(result.version_number, 4, "existing v3 -> new v4");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildCharacterDnaRecord: null attributes handled gracefully",
  fn() {
    const result = buildCharacterDnaRecord(
      "proj-123",
      { id: "atom-1", canonical_name: "Unknown", attributes: null },
      null,
    );
    assertEquals(result.version_number, 1);
    assertEquals(result.identity_strength, "weak");
    assertEquals(result.script_truth.length, 1, "fallback for empty attrs");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 11: Location DNA — Structural Substrate
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildStructuralSubstrate: camelCase field preferred over snake_case",
  fn() {
    const r1 = buildStructuralSubstrate({
      architectureStyle: "Gothic",
      settingType: "Castle",
      era: "Medieval",
      period: "13th century",
      signatureArchitecturalFeatures: ["Towers", "Moat"],
    });
    assertEquals(r1.primary.length, 5, "5 primary fields");
    assert(r1.primary.some((i: any) => i.aspect === "signature_features"));

    const r2 = buildStructuralSubstrate({
      architecture_style: "Gothic",
      setting_type: "Castle",
    });
    assert(r2.primary.some((i: any) => i.value === "Gothic"));
    assert(r2.primary.some((i: any) => i.value === "Castle"));
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildStructuralSubstrate: secondary fields and notes",
  fn() {
    const result = buildStructuralSubstrate({
      structural_material: "Stone",
      structuralMaterials: "Brick",
      building_materials: ["Limestone", "Granite"],
      buildingMaterials: ["Marble"],
      structural_notes: "Well preserved",
    });
    assert(result.secondary.some((i: any) => i.aspect === "structural_material"));
    assertEquals(result.notes, "Well preserved");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildStructuralSubstrate: empty returns empty sections",
  fn() {
    const result = buildStructuralSubstrate({});
    assertEquals(result.primary.length, 0);
    assertEquals(result.secondary.length, 0);
    assertEquals(result.notes, "");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 12: Location DNA — Surface Condition
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildSurfaceCondition: all fields present",
  fn() {
    const result = buildSurfaceCondition({
      surface_texture: "Rough stone",
      wall_finish: "Whitewash",
      flooring: "Flagstone",
      materials: ["Stone", "Mortar"],
      condition: "Weathered",
      age_impression: "Old",
      wear_tear: "Visible cracks",
    });
    assertEquals(result.primary.length, 3, "3 primary (surface_texture, wall_finish, flooring)");
    assertEquals(result.secondary.length, 4, "4 secondary (materials, condition, age_impression, wear_tear)");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildSurfaceCondition: camelCase fields",
  fn() {
    const result = buildSurfaceCondition({
      surfaceTexture: "Smooth",
      wallFinish: "Paint",
      surfaceNotes: "Newly renovated",
    });
    assert(result.primary.some((i: any) => i.aspect === "surface_texture"));
    assertEquals(result.notes, "Newly renovated");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 13: Location DNA — Atmosphere Behavior
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildAtmosphereBehavior: all fields present",
  fn() {
    const result = buildAtmosphereBehavior({
      lightingCharacter: "Dim candlelight",
      atmosphericMood: ["Mysterious", "Somber"],
      acousticCharacter: "Echoing",
      temperatureImpression: "Cold",
      sensoryTexture: ["Damp", "Musty"],
      ambiance: "Foreboding",
    });
    assertEquals(result.primary.length, 2, "2 primary (lighting + mood)");
    assertEquals(result.secondary.length, 4, "4 secondary");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildAtmosphereBehavior: snake_case fallback",
  fn() {
    const result = buildAtmosphereBehavior({
      lighting_character: "Bright fluorescent",
      atmospheric_mood: ["Sterile"],
      atmoshereNotes: "Hospital corridor vibe",
    });
    assert(result.primary.some((i: any) => i.value === "Bright fluorescent"));
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 14: Location DNA — Spatial Character
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildSpatialCharacter: all fields present",
  fn() {
    const result = buildSpatialCharacter({
      spatial_layout: "Open plan",
      floor_plan: "Rectangular",
      dimensions: "40x60ft",
      room_count: 5,
      zones: "Living, dining, kitchen",
      circulation: "Central hallway",
      verticality: "Single story",
    });
    assertEquals(result.primary.length, 3, "3 primary (spatial_layout, floor_plan, dimensions)");
    assertEquals(result.secondary.length, 4, "4 secondary (room_count, zones, circulation, verticality)");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 15: Location DNA — Status Signal
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildStatusSignal: all fields present",
  fn() {
    const result = buildStatusSignal({
      status_signals: ["Wealthy", "Noble"],
      wealth_indicators: "Gold trim",
      social_class: "Upper",
      power_symbols: "Family crest",
    });
    assert(result.primary.some((i: any) => i.aspect === "status_signals"));
    assertEquals(result.primary.length, 2, "2 primary");
    assertEquals(result.secondary.length, 2, "2 secondary");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildStatusSignal: camelCase fields",
  fn() {
    const result = buildStatusSignal({
      statusSignals: ["Prestige"],
      wealthIndicators: "Silk curtains",
      socialClass: "Aristocrat",
      powerSymbols: "Throne",
    });
    assert(result.primary.some((i: any) => i.aspect === "status_signals"));
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 16: Location DNA — Contextual Dressing
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildContextualDressing: all fields present",
  fn() {
    const result = buildContextualDressing({
      furnishings: "Leather sofa",
      furniture: "Oak table",
      decor: "Renaissance paintings",
      dominantColors: ["Gold", "Crimson"],
      color_palette: "Warm tones",
      textiles: "Velvet curtains",
      artwork: "Portrait gallery",
      lightingFixtures: "Chandelier",
    });
    assertEquals(result.primary.length, 5, "5 primary (furnishings, furniture, decor, dominantColors, color_palette)");
    assertEquals(result.secondary.length, 3, "3 secondary (textiles, artwork, lightingFixtures)");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 17: Location DNA — Occupation Trace
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildOccupationTrace: all fields with forbidden_as_dominant flag",
  fn() {
    const result = buildOccupationTrace({
      traces_of_use: ["Worn floor", "Faded wallpaper"],
      activity_residue: "Candle wax",
      wear_patterns: "High traffic path",
      clutter: "Scattered papers",
      organization_level: "Disorganized",
    });
    assertEquals(result.forbidden_as_dominant, true, "forbidden_as_dominant flag");
    assertEquals(result.primary.length, 2, "2 primary");
    assertEquals(result.secondary.length, 3, "3 secondary");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 18: Location DNA — Symbolic Motif
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildSymbolicMotif: all fields present",
  fn() {
    const result = buildSymbolicMotif({
      thematicSymbolism: "Power corrupts",
      symbolic_elements: ["Throne", "Crown"],
      motif_tags: ["Royal", "Decay"],
      narrativeFunction: "Symbol of authority",
      moodBoardReference: "Medieval court",
    });
    assertEquals(result.primary.length, 3, "3 primary");
    assertEquals(result.secondary.length, 2, "2 secondary");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 19: computeCompletenessScore
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "computeCompletenessScore: all 10 fields filled = 1.0",
  fn() {
    const result = computeCompletenessScore({
      architectureStyle: "Gothic",
      settingType: "Castle",
      era: "Medieval",
      period: "13thC",
      lightingCharacter: "Dim",
      atmosphericMood: ["Mysterious"],
      dominantColors: ["Grey"],
      sensoryTexture: ["Cold"],
      thematicSymbolism: "Power",
      signatureArchitecturalFeatures: ["Towers"],
    });
    assertEquals(result, 1.0, "perfect score");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "computeCompletenessScore: 5 filled = 0.5",
  fn() {
    const result = computeCompletenessScore({
      architectureStyle: "Gothic",
      settingType: "Castle",
      era: "Medieval",
      lightingCharacter: "Dim",
      thematicSymbolism: "Power",
    });
    assertEquals(result, 0.5, "half score");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "computeCompletenessScore: 0 filled = 0.0",
  fn() {
    const result = computeCompletenessScore({});
    assertEquals(result, 0, "empty score");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 20: inferLocationClass — Classification
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "inferLocationClass: courtyard types",
  fn() {
    assertEquals(inferLocationClass({ settingType: "courtyard" }), "courtyard");
    assertEquals(inferLocationClass({ setting_type: "plaza" }), "courtyard");
    assertEquals(inferLocationClass({ settingType: "garden" }), "courtyard");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "inferLocationClass: exterior types",
  fn() {
    assertEquals(inferLocationClass({ settingType: "exterior" }), "exterior");
    assertEquals(inferLocationClass({ setting_type: "street" }), "exterior");
    assertEquals(inferLocationClass({ settingType: "bridge" }), "exterior");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "inferLocationClass: storage types",
  fn() {
    assertEquals(inferLocationClass({ settingType: "warehouse" }), "storage");
    assertEquals(inferLocationClass({ setting_type: "basement" }), "storage");
    assertEquals(inferLocationClass({ settingType: "vault" }), "storage");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "inferLocationClass: passage types",
  fn() {
    assertEquals(inferLocationClass({ settingType: "hallway" }), "passage");
    assertEquals(inferLocationClass({ setting_type: "corridor" }), "passage");
    assertEquals(inferLocationClass({ settingType: "stairwell" }), "passage");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "inferLocationClass: workshop types",
  fn() {
    assertEquals(inferLocationClass({ settingType: "workshop" }), "workshop");
    assertEquals(inferLocationClass({ setting_type: "kitchen" }), "workshop");
    assertEquals(inferLocationClass({ settingType: "lab" }), "workshop");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "inferLocationClass: sub_space types",
  fn() {
    assertEquals(inferLocationClass({ settingType: "room" }), "sub_space");
    assertEquals(inferLocationClass({ setting_type: "bedroom" }), "sub_space");
    assertEquals(inferLocationClass({ settingType: "chamber" }), "sub_space");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "inferLocationClass: unknown types default to primary_space",
  fn() {
    assertEquals(inferLocationClass({ settingType: "unknown" }), "primary_space");
    assertEquals(inferLocationClass({ setting_type: "forest" }), "primary_space");
    assertEquals(inferLocationClass({}), "primary_space", "empty defaults");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 21: buildLocationDatasetRecord — Full record assembly
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildLocationDatasetRecord: new record gets version 1",
  fn() {
    const result = buildLocationDatasetRecord(
      "proj-123",
      { id: "atom-l1", canonical_name: "Cyberdyne HQ", attributes: { settingType: "corporate" } },
      null,
    );
    assertEquals(result.project_id, "proj-123");
    assertEquals(result.location_name, "Cyberdyne HQ");
    assertEquals(result.dataset_version, 1);
    assertEquals(result.is_current, true);
    assertEquals(result.source_mode, "reverse_engineered");
    assertEquals(result.freshness_status, "fresh");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildLocationDatasetRecord: existing record increments dataset_version",
  fn() {
    const result = buildLocationDatasetRecord(
      "proj-123",
      { id: "atom-l2", canonical_name: "Safe House", attributes: {} },
      2,
    );
    assertEquals(result.dataset_version, 3, "existing v2 -> new v3");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildLocationDatasetRecord: provenance includes source atom info",
  fn() {
    const result = buildLocationDatasetRecord(
      "proj-1",
      { id: "atom-l3", canonical_name: "The Wall", attributes: { settingType: "exterior" } },
      null,
    );
    assertEquals(result.provenance.source_atom_id, "atom-l3");
    assertEquals(result.provenance.source_atom_type, "location");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 22: Handler-level — CORS, validation, error handling
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "handler: OPTIONS returns 200 with CORS headers before handler logic",
  async fn() {
    const resp = await handlerWrapper(
      new Request("http://localhost/", { method: "OPTIONS" }),
      () => { throw new Error("should not reach"); },
    );
    assertEquals(resp.status, 200);
    assertEquals(resp.headers.get("Access-Control-Allow-Origin"), "*");
    const text = await resp.text();
    assertEquals(text, "", "OPTIONS body empty");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "handler: missing project_id validation in handler logic",
  async fn() {
    const resp = await handlerWrapper(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enrich" }),
      }),
      async (req) => {
        const body = await req.json();
        if (!body.project_id) {
          return json({ error: "project_id is required" }, 400);
        }
        return json({ ok: true });
      },
    );
    assertEquals(resp.status, 400);
    const body = await resp.json();
    assertEquals(body.error, "project_id is required");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "handler: unknown action returns 400",
  async fn() {
    const resp = await handlerWrapper(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invalid", project_id: "p1" }),
      }),
      async (req) => {
        const body = await req.json();
        const { action } = body;
        switch (action) {
          case "enrich":
          case "status":
            return json({ ok: true });
          default:
            return json({ error: `Unknown action: ${action}. Supported: enrich, status` }, 400);
        }
      },
    );
    assertEquals(resp.status, 400);
    const body = await resp.json();
    assert(body.error.includes("Unknown action"), "unknown action error");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "handler: enrich without entity_type returns 400",
  async fn() {
    const resp = await handlerWrapper(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enrich", project_id: "p1" }),
      }),
      async (req) => {
        const body = await req.json();
        const { action, entity_type } = body;
        if (action === "enrich" && (!entity_type || !["character", "location"].includes(entity_type))) {
          return json({ error: "entity_type must be 'character' or 'location'" }, 400);
        }
        return json({ ok: true });
      },
    );
    assertEquals(resp.status, 400);
    const body = await resp.json();
    assert(body.error.includes("entity_type"), "entity_type validation");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "handler: status without entity_type returns 400",
  async fn() {
    const resp = await handlerWrapper(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", project_id: "p1" }),
      }),
      async (req) => {
        const body = await req.json();
        const { action, entity_type } = body;
        if (action === "status" && (!entity_type || !["character", "location"].includes(entity_type))) {
          return json({ error: "entity_type must be 'character' or 'location' for status" }, 400);
        }
        return json({ ok: true });
      },
    );
    assertEquals(resp.status, 400);
    const body = await resp.json();
    assert(body.error.includes("entity_type"), "entity_type validation for status");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "handler: Error thrown in handler caught by try-catch, returns 500",
  async fn() {
    const resp = await handlerWrapper(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enrich", project_id: "p1", entity_type: "character" }),
      }),
      () => {
        throw new Error("Database connection failed");
      },
    );
    assertEquals(resp.status, 500);
    const body = await resp.json();
    assertEquals(body.error, "Database connection failed");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "handler: error response includes CORS headers",
  async fn() {
    const resp = await handlerWrapper(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      () => { throw new Error("crash"); },
    );
    assertEquals(resp.headers.get("Access-Control-Allow-Origin"), "*");
    assertEquals(resp.headers.get("Content-Type"), "application/json");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "handler: non-Error thrown returns 500 with message",
  async fn() {
    const resp = await handlerWrapper(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      () => { throw "string error"; },
    );
    assertEquals(resp.status, 500);
    const body = await resp.json();
    assertEquals(body.error, "string error");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
