// @ts-nocheck
/**
 * generate-visual-dna-from-canon — Universal Visual DNA Generator.
 *
 * Converts existing extract-visual-dna capability into a universal, persisted,
 * project-agnostic visual DNA generator that reuses existing extraction logic.
 *
 * MODES:
 *   preview_only     — Show what would be generated without persisting
 *   generate_missing — Only generate for entities without existing draft/approved DNA
 *   refresh_stale    — Regenerate all but preserve approved/locked rows
 *
 * TARGETS:
 *   character       — Single character
 *   all_characters  — Batch all characters in project
 *   project_style   — Project-level visual style
 *   location        — Single location
 *   entity          — Generic entity (character/location/object)
 *
 * DO NOT:
 *   - Duplicate extraction logic (reuses extract-visual-dna)
 *   - Hardcode YETI
 *   - Overwrite approved/locked DNA
 *   - Create AI actor bindings
 *   - Generate images
 *   - Add auto-run
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { callLLM, MODELS, resolveGateway } from "../_shared/llm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GenerateVisualDNAInput {
  project_id: string;
  target: "character" | "all_characters" | "project_style" | "location" | "entity" | "all";
  mode: "preview_only" | "generate_missing" | "refresh_stale" | "generate_from_atoms";
  entity_name?: string;
  entity_type?: "character" | "location" | "object";
}

interface ProvenanceEntry {
  evidence_source: string;
  evidence_excerpt: string;
  confidence: string;
  inference_type: "ai_extraction" | "canon_mapping" | "atom_enrichment" | "style_derivation";
  generated_at: string;
}

interface DNAReport {
  project_id: string;
  target: string;
  mode: string;
  created: number;
  skipped: number;
  updated: number;
  blocked: number;
  low_confidence: number;
  errors: string[];
  preview?: any[];
  created_items?: any[];
  governance_result?: any;
}

interface BatchSubReport {
  created: number;
  skipped: number;
  updated: number;
  blocked: number;
  low_confidence: number;
  errors: string[];
}

interface BatchResult {
  characters: BatchSubReport;
  style: BatchSubReport;
  locations: BatchSubReport;
  stale_count: number;
  location_names: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: GenerateVisualDNAInput = await req.json();
    const { project_id, target, mode, entity_name, entity_type } = body;

    if (!project_id || !target || !mode) {
      return respond(
        { error: "project_id, target, and mode are required" },
        400,
      );
    }

    const validTargets = ["character", "all_characters", "project_style", "location", "entity", "all"];
    if (!validTargets.includes(target)) {
      return respond(
        { error: `Invalid target: ${target}. Must be one of: ${validTargets.join(", ")}` },
        400,
      );
    }

    const validModes = ["preview_only", "generate_missing", "refresh_stale", "generate_from_atoms"];
    if (!validModes.includes(mode)) {
      return respond(
        { error: `Invalid mode: ${mode}. Must be one of: ${validModes.join(", ")}` },
        400,
      );
    }

    if ((target === "character" || target === "location" || target === "entity") && !entity_name) {
      return respond(
        { error: `entity_name required for target: ${target}` },
        400,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);
    const functionBase = `${supabaseUrl}/functions/v1`;

    switch (target) {
      case "character":
        return await handleCharacter(sb, functionBase, project_id, entity_name!, mode);
      case "all_characters":
        return await handleAllCharacters(sb, functionBase, project_id, mode);
      case "all":
        return await handleBatchAll(sb, functionBase, project_id, mode);
      case "project_style":
        return await handleProjectStyle(sb, project_id, mode);
      case "location":
        return await handleLocation(sb, project_id, entity_name!, mode);
      case "entity":
        return await handleEntity(sb, functionBase, project_id, entity_name!, entity_type || "character", mode);
      default:
        return respond({ error: `Unhandled target: ${target}` }, 500);
    }
  } catch (e: any) {
    console.error("generate-visual-dna-from-canon error:", e);
    return respond({ error: e.message }, 500);
  }
});

// ─── Character Handlers ───

async function handleCharacter(
  sb: any,
  functionBase: string,
  projectId: string,
  characterName: string,
  mode: string,
): Promise<Response> {
  const report: DNAReport = {
    project_id: projectId,
    target: `character:${characterName}`,
    mode,
    created: 0,
    skipped: 0,
    updated: 0,
    blocked: 0,
    low_confidence: 0,
    errors: [],
  };

  // 1. Check existing DNA for this character
  const { data: existingDNA } = await sb
    .from("character_visual_dna")
    .select("id, version_number, identity_strength, identity_signature, is_current, biological_sex, gender_presentation, age_range, ethnicity, body_type, height_class, facial_archetype, voice_quality, wardrobe_signals, social_class, role_archetype, identity_evidence, identity_confidence, identity_inference_type")
    .eq("project_id", projectId)
    .eq("character_name", characterName)
    .eq("is_current", true)
    .maybeSingle();

  const hasExisting = !!existingDNA;
  const isApprovedOrStrong = existingDNA?.identity_strength === "strong";

  // 2. Mode-specific skip/block logic
  if (mode === "generate_missing" && hasExisting) {
    report.skipped++;
    return respond(report);
  }

  if (isApprovedOrStrong && mode === "refresh_stale") {
    report.skipped++;
    return respond(report);
  }

  if (isApprovedOrStrong && mode !== "refresh_stale" && mode !== "generate_from_atoms") {
    report.blocked++;
    report.errors.push(`${characterName}: existing approved/strong DNA blocked (mode=${mode})`);
    return respond(report);
  }

  // 3. Preview mode — show what extract-visual-dna would produce
  if (mode === "preview_only") {
    const extractionResult = await callExtractDNA(functionBase, projectId, characterName);
    if (extractionResult.error) {
      report.errors.push(extractionResult.error);
      return respond(report, 500);
    }
    report.preview = [{
      target: characterName,
      target_type: "character",
      traits: extractionResult.traits || [],
      marker_candidates: extractionResult.marker_candidates || [],
      evidence_sources: extractionResult.evidence_sources || [],
      would_create: !hasExisting,
      would_update: hasExisting && !isApprovedOrStrong,
      would_block: isApprovedOrStrong,
    }];
    return respond(report);
  }

  // 4. Execute extraction and persist
  const extractionResult = await callExtractDNA(functionBase, projectId, characterName);
  if (extractionResult.error) {
    report.errors.push(extractionResult.error);
    return respond(report, 500);
  }

  const traits = extractionResult.traits || [];
  const markers = extractionResult.marker_candidates || [];
  
  // ── CPIE CANON ENRICHMENT ──
  // Enrich extraction with CPIE-certified canon values
  const cpieEnrichedTraits: Array<{
    label: string; category: string; confidence: string;
    evidence_source: string; evidence_excerpt: string;
  }> = [];
  const cpieUrl = Deno.env.get("CPIE_ENDPOINT_URL");
  if (cpieUrl) {
    try {
      const { data: pcpRow } = await sb
        .from("project_context_profiles")
        .select("profile")
        .eq("project_id", projectId)
        .maybeSingle();
      if (pcpRow?.profile) {
        const pcp = (pcpRow.profile as any).categories || pcpRow.profile;
        const cpieCtx = {
          project_id: projectId,
          genre: pcp.project_identity?.genre?.value || pcp.genre || ["unknown"],
          period: pcp.temporal_context?.period?.value || pcp.period || "contemporary",
          climate: pcp.geographic_context?.climate?.value || pcp.climate || "temperate",
          technology_level: pcp.technology_context?.level?.value || pcp.technology_level || "contemporary",
          culture: pcp.cultural_context?.dominant_cultures?.value || pcp.culture || ["Western"],
          profession_map: pcp.professional_context?.profession_map?.value || pcp.profession_map || {},
          pcp_resolution_timestamp: new Date().toISOString(),
        };
        const cpieResponse = await fetch(cpieUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pcp: cpieCtx, domains: ["wardrobe", "props"] }),
        });
        if (cpieResponse.ok) {
          const cpieResult = await cpieResponse.json();
          const wardrobeResults = cpieResult.domains?.wardrobe || [];
          const propsResults = cpieResult.domains?.props || [];
          
          // Extract CPIE wardrobe inferences
          for (const entityResult of [...wardrobeResults, ...propsResults]) {
            for (const inf of entityResult.inferences || []) {
              cpieEnrichedTraits.push({
                label: `${inf.field}: ${inf.value}`,
                category: inf.field === "primary_outfit" || inf.field === "footwear" || inf.field === "headwear"
                  ? "clothing" : inf.field === "primary_weapon" || inf.field === "primary_prop"
                  ? "clothing" : "other",
                confidence: "high",
                evidence_source: `cpie_registry:\${inf.registry_anchor_id}`,
                evidence_excerpt: `CPIE certified canon: \${inf.field} = \${inf.value} (conf: \${inf.confidence_score})`,
              });
            }
          }
        }
      }
    } catch (cpieErr) {
      console.warn("[VisualDNA] CPIE enrichment warning:", cpieErr instanceof Error ? cpieErr.message : String(cpieErr));
    }
  }
  
  // Merge CPIE traits into traits array (CPIE wins on field overlap)
  for (const cpieTrait of cpieEnrichedTraits) {
    const existingIdx = traits.findIndex((t: any) =>
      t.label?.toLowerCase().includes(cpieTrait.label.split(":")[0]?.trim().toLowerCase() || "")
    );
    if (existingIdx >= 0) {
      traits[existingIdx] = {
        ...traits[existingIdx],
        label: cpieTrait.label,
        confidence: "high",
        evidence_source: cpieTrait.evidence_source,
        evidence_excerpt: cpieTrait.evidence_excerpt,
      };
    } else {
      traits.push(cpieTrait);
    }
  }
  
  // ── CPIE HARD GATE: Wardrobe + Props ──
  // If CPIE returned wardrobe or props inferences, those domains are authoritative.
  // LLM-extracted clothing traits are removed when CPIE is available.
  // If CPIE failed or returned empty, LLM clothing traits are demoted.
  const cpieWardrobePropsSucceeded = cpieEnrichedTraits.length > 0;
  const cpieCoveredFieldPrefixes = new Set(
    cpieEnrichedTraits.map(t => t.label.split(":")[0]?.trim().toLowerCase()).filter(Boolean)
  );
  
  const gatedTraits: typeof traits = [];
  for (const t of traits) {
    const category = (t.category || "other").toLowerCase();
    const label = (t.label || "").toLowerCase();
    
    // Detect wardrobe/prop traits: explicit "clothing" category or keyword matching
    const isWardrobeProps = category === "clothing" || 
      (category === "other" && /(weapon|prop|outfit|attire|footwear|headwear|suit|uniform|robe|armor|gown|garment|apparel)/.test(label));
    
    if (isWardrobeProps) {
      if (cpieWardrobePropsSucceeded) {
        // CPIE succeeded: only keep if overwritten by CPIE (CPIE is authoritative)
        const wasOverwritten = cpieEnrichedTraits.some(ct => {
          const ctPrefix = ct.label.split(":")[0]?.trim().toLowerCase();
          return ctPrefix && label.includes(ctPrefix);
        });
        if (!wasOverwritten) {
          continue; // Remove — CPIE covers wardrobe+props, LLM extras are discarded
        }
      } else {
        // CPIE failed or empty: demote LLM wardrobe+props to low confidence
        t.confidence = "low";
        t.evidence_source = "llm_extraction_only_no_cpie";
        t.evidence_excerpt = "LLM extracted — CPIE unavailable for wardrobe/props verification";
      }
    }
    gatedTraits.push(t);
  }
  traits.length = 0;
  traits.push(...gatedTraits);
  
  const lowConfCount = traits.filter((t: any) => t.confidence === "low").length;

  // Build provenance
  const provenance: ProvenanceEntry[] = (extractionResult.evidence_sources || []).map((s: string) => ({
    evidence_source: s,
    evidence_excerpt: "",
    confidence: "medium",
    inference_type: "ai_extraction",
    generated_at: new Date().toISOString(),
  }));

  // Build inferred_guidance from traits
  const inferredGuidance = traits.map((t: any) => ({
    label: t.label,
    value: t.label,
    confidence: t.confidence,
    source: t.evidence_source || "extract-visual-dna",
    category: t.category,
    provenance: {
      evidence_source: t.evidence_source,
      evidence_excerpt: t.evidence_excerpt,
      confidence: t.confidence,
      inference_type: "ai_extraction",
      generated_at: new Date().toISOString(),
    },
  }));

  // Build evidence_traits
  const evidenceTraits = traits.map((t: any, i: number) => ({
    id: `evt_${i}_${Date.now()}`,
    label: t.label,
    category: t.category,
    confidence: t.confidence,
    source: t.evidence_source,
    excerpt: t.evidence_excerpt,
    provenance,
  }));

  // Build binding_markers
  const bindingMarkers = markers.map((m: any) => ({
    ...m,
    status: "suggested",
    provenance,
  }));

  // Build identity_signature (composite)
  const signature: Record<string, any> = {};
  for (const t of traits) {
    if (!signature[t.category]) signature[t.category] = {};
    signature[t.category][t.label] = {
      value: t.label,
      confidence: t.confidence,
      source: t.evidence_source,
    };
  }

  const identitySignature = {
    signature,
    binding_markers: bindingMarkers,
    evidence_traits: evidenceTraits,
    evidence_status: lowConfCount > traits.length / 2 ? "low_confidence" : "draft",
    transient_states: [],
  };

  const identityStrength =
    lowConfCount > traits.length / 2 ? "weak" :
    lowConfCount > 0 ? "partial" : "strong";

  // ── Build structured identity fields from traits ─────────────────
  const structuredIdentity = buildStructuredIdentityFromTraits(traits, identityStrength);

  // ── Backfill from legacy identity_signature if present ──────────
  // Recovers data from legacy flat-format or Format D signatures that
  // the extraction pipeline didn't surface (ethnicity, height, voice, etc.)
  // NEVER overwrites existing structured values — only fills true nulls.
  const existingStructured: Record<string, any> = hasExisting
    ? {
        biological_sex: existingDNA.biological_sex,
        gender_presentation: existingDNA.gender_presentation,
        age_range: existingDNA.age_range,
        ethnicity: existingDNA.ethnicity,
        body_type: existingDNA.body_type,
        height_class: existingDNA.height_class,
        facial_archetype: existingDNA.facial_archetype,
        voice_quality: existingDNA.voice_quality,
        social_class: existingDNA.social_class,
        role_archetype: existingDNA.role_archetype,
      }
    : structuredIdentity; // For new rows, compare against what we just extracted
  const backfillData = backfillIdentityFromSignature(identitySignature, existingStructured);
  // Merge: backfill fills gaps, structuredIdentity from traits takes priority
  const mergedIdentity = { ...backfillData, ...structuredIdentity };

  if (!hasExisting) {
    // Insert new row as draft
    const { error: insertError } = await sb
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
        identity_strength: identityStrength,
        is_current: true,
        // Structured identity fields (merged = backfill + extraction)
        ...mergedIdentity,
      });

    if (insertError) {
      report.errors.push(`Insert failed: ${insertError.message}`);
      return respond(report, 500);
    }
    report.created++;

    if (lowConfCount > traits.length / 2 && traits.length > 0) {
      report.low_confidence++;
    }
  } else {
    // Update existing — merge inferred_guidance (novel traits only), preserve identity if strong
    const existingInferred = existingDNA.inferred_guidance || [];
    const existingLabels = new Set(existingInferred.map((t: any) => t.label));
    const novelTraits = inferredGuidance.filter((t) => !existingLabels.has(t.label));

    if (novelTraits.length === 0) {
      report.skipped++;
      return respond(report);
    }

    const mergedInferred = [...existingInferred, ...novelTraits];

    // Merge identity signature — only if existing is not strong
    const finalSignature = isApprovedOrStrong
      ? existingDNA.identity_signature
      : mergeIdentitySignatures(existingDNA.identity_signature || {}, identitySignature);

    const { error: updateError } = await sb
      .from("character_visual_dna")
      .update({
        inferred_guidance: mergedInferred,
        identity_signature: finalSignature,
        identity_strength: isApprovedOrStrong ? existingDNA.identity_strength : identityStrength,
        is_current: true,
        // Structured identity fields — populate only if null/empty on existing row
        biological_sex: existingDNA.biological_sex ?? mergedIdentity.biological_sex ?? undefined,
        gender_presentation: existingDNA.gender_presentation ?? mergedIdentity.gender_presentation ?? undefined,
        age_range: existingDNA.age_range ?? mergedIdentity.age_range ?? undefined,
        ethnicity: existingDNA.ethnicity ?? mergedIdentity.ethnicity ?? undefined,
        body_type: existingDNA.body_type ?? mergedIdentity.body_type ?? undefined,
        height_class: existingDNA.height_class ?? mergedIdentity.height_class ?? undefined,
        facial_archetype: existingDNA.facial_archetype ?? mergedIdentity.facial_archetype ?? undefined,
        voice_quality: existingDNA.voice_quality ?? mergedIdentity.voice_quality ?? undefined,
        wardrobe_signals: existingDNA.wardrobe_signals && Object.keys(existingDNA.wardrobe_signals).length > 0
          ? existingDNA.wardrobe_signals
          : (mergedIdentity.wardrobe_signals ?? undefined),
        social_class: existingDNA.social_class ?? mergedIdentity.social_class ?? undefined,
        role_archetype: existingDNA.role_archetype ?? mergedIdentity.role_archetype ?? undefined,
        identity_evidence: existingDNA.identity_evidence && Object.keys(existingDNA.identity_evidence).length > 0
          ? existingDNA.identity_evidence
          : (mergedIdentity.identity_evidence ?? undefined),
        identity_confidence: existingDNA.identity_confidence && Object.keys(existingDNA.identity_confidence).length > 0
          ? existingDNA.identity_confidence
          : (mergedIdentity.identity_confidence ?? undefined),
        identity_inference_type: existingDNA.identity_inference_type && Object.keys(existingDNA.identity_inference_type).length > 0
          ? existingDNA.identity_inference_type
          : (mergedIdentity.identity_inference_type ?? undefined),
      })
      .eq("id", existingDNA.id);

    if (updateError) {
      report.errors.push(`Update failed: ${updateError.message}`);
      return respond(report, 500);
    }
    report.updated++;

    if (lowConfCount > traits.length / 2 && traits.length > 0) {
      report.low_confidence++;
    }
  }

  // ── G7: Auto-calculate package_strength & populate character_wardrobe_profiles ──
  // Populates the new character_wardrobe_profiles table with extracted wardrobe
  // data and calculates package_strength from wardrobe profile completeness.
  try {
    if (traits.length > 0 || mergedIdentity.wardrobe_signals) {
      // Extract clothing-related traits for wardrobe profile
      const clothingTraits = traits.filter((t: any) => t.category === "clothing");
      const wardrobeGarments = clothingTraits.map((t: any, i: number) => ({
        garment_id: `garment_${i}_${Date.now()}`,
        name: t.label,
        type: t.category,
        description: t.evidence_excerpt || t.label,
        fabric: "",
        color_palette: {},
        source: t.evidence_source || "extraction",
      }));

      // Calculate package_strength based on completeness
      const hasFabric = !!mergedIdentity.wardrobe_signals && Object.keys(mergedIdentity.wardrobe_signals).length > 0;
      const hasGarments = wardrobeGarments.length > 0;
      const hasFabricLanguage = !!(mergedIdentity as any).fabric_language;
      const hasPaletteLogic = !!(mergedIdentity as any).palette_logic;
      const hasSilhouette = !!(mergedIdentity as any).silhouette_language;

      let calculatedStrength = "unassessed";
      if (hasGarments && hasFabric && hasFabricLanguage && hasPaletteLogic) {
        calculatedStrength = "strong";
      } else if (hasGarments && (hasFabric || hasFabricLanguage)) {
        calculatedStrength = "moderate";
      } else if (hasGarments) {
        calculatedStrength = "weak";
      }

      // Upsert into character_wardrobe_profiles
      const { error: cwpError } = await sb
        .from("character_wardrobe_profiles")
        .upsert({
          project_id: projectId,
          character_name: characterName,
          profile_version: 1,
          is_current: true,
          garments: wardrobeGarments,
          fabric_language: (mergedIdentity as any).fabric_language || null,
          palette_logic: (mergedIdentity as any).palette_logic || null,
          silhouette_language: (mergedIdentity as any).silhouette_language || null,
          package_strength: calculatedStrength,
          extraction_version: "g7_auto",
          source: "generate-visual-dna-from-canon",
        }, {
          onConflict: "project_id, character_name, is_current",
        });

      if (cwpError) {
        report.errors.push(`character_wardrobe_profiles upsert failed: ${cwpError.message}`);
      }
    }
  } catch (cwpErr: any) {
    report.errors.push(`Wardrobe profile enrichment failed: ${cwpErr.message}`);
  }

  return respond(report);
}

async function processCharacterList(
  sb: any,
  functionBase: string,
  projectId: string,
  charNames: string[],
  mode: string,
  report: DNAReport,
  suppressGovernance: boolean = false,
): Promise<Response> {
  for (const charName of charNames) {
    try {
      const result = await handleCharacter(sb, functionBase, projectId, charName, mode);
      const data = await result.json();
      report.created += data.created || 0;
      report.skipped += data.skipped || 0;
      report.updated += data.updated || 0;
      report.blocked += data.blocked || 0;
      report.low_confidence += data.low_confidence || 0;
      if (data.errors) {
        report.errors.push(...data.errors.map((e: string) => `${charName}: ${e}`));
      }
    } catch (e: any) {
      report.errors.push(`${charName}: ${e.message}`);
    }
  }

  if (!suppressGovernance && mode !== "preview_only" && (report.created > 0 || report.updated > 0)) {
    try {
      const govResponse = await fetch(`${functionBase}/evaluate-visual-governance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        },
        body: JSON.stringify({ projectId }),
      });
      if (govResponse.ok) {
        report.governance_result = await govResponse.json();
      } else {
        report.errors.push(`evaluate-visual-governance returned ${govResponse.status}`);
      }
    } catch (e: any) {
      report.errors.push(`evaluate-visual-governance call failed: ${e.message}`);
    }
  }

  return respond(report);
}

async function handleAllCharacters(
  sb: any,
  functionBase: string,
  projectId: string,
  mode: string,
  suppressGovernance: boolean = false,
): Promise<Response> {
  const report: DNAReport = {
    project_id: projectId,
    target: "all_characters",
    mode,
    created: 0,
    skipped: 0,
    updated: 0,
    blocked: 0,
    low_confidence: 0,
    errors: [],
  };

  // Get all characters from project_canon
  const { data: canon } = await sb
    .from("project_canon")
    .select("canon_json")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!canon?.canon_json || mode === "generate_from_atoms") {
    // generate_from_atoms mode: use narrative_entities first, then fall back to atoms
    if (mode === "generate_from_atoms") {
      // Query narrative_entities for reliable character names
      const { data: entities } = await sb
        .from("narrative_entities")
        .select("entity_key, canonical_name")
        .eq("project_id", projectId)
        .eq("entity_type", "character")
        .eq("status", "active")
        .order("scene_count", { ascending: false });

      if (entities && entities.length > 0) {
        const charNames = [...new Set(entities.map((e: any) => e.canonical_name || e.entity_key))];
        console.log(`[generate-visual-dna] generate_from_atoms: ${charNames.length} characters from narrative_entities`);
        return await processCharacterList(sb, functionBase, projectId, charNames, mode, report);
      }
    }

    // Fallback: read characters from atoms table
    const { data: atomChars } = await sb
      .from("atoms")
      .select("canonical_name")
      .eq("project_id", projectId)
      .eq("atom_type", "character")
      .neq("readiness_state", "stub")
      .order("created_at", { ascending: true });

    if (!atomChars || atomChars.length === 0) {
      report.errors.push("No characters found in project_canon or atoms");
      return respond(report, 400);
    }

    const allCharNames = new Set<string>();
    for (const ac of atomChars) {
      if (ac.canonical_name) allCharNames.add(ac.canonical_name);
    }

    const charNames = Array.from(allCharNames);
    console.log(`[generate-visual-dna] Fallback: ${charNames.length} characters from atoms table`);
    return await processCharacterList(sb, functionBase, projectId, charNames, mode, report);
  }

  const canonJson = canon.canon_json as Record<string, any>;
  const characters = canonJson.characters || [];
  if (!Array.isArray(characters) || characters.length === 0) {
    report.errors.push("No characters found in project_canon");
    return respond(report);
  }

  // Also check project_characters table
  const { data: projChars } = await sb
    .from("project_characters")
    .select("name")
    .eq("project_id", projectId);

  const allCharNames = new Set<string>();
  for (const c of characters) {
    // Skip non-human canon entries (creature, animal, vehicle, prop, etc.)
    if (c.entity_type && c.entity_type !== "character") continue;
    const name = c.name || c.character_name || "";
    if (name) allCharNames.add(name);
  }
  if (projChars) {
    for (const pc of projChars) {
      if (pc.name) allCharNames.add(pc.name);
    }
  }

  const charNames = Array.from(allCharNames);

  return await processCharacterList(sb, functionBase, projectId, charNames, mode, report, suppressGovernance);
}

// ─── Project Style Handler ───

async function handleProjectStyle(
  sb: any,
  projectId: string,
  mode: string,
): Promise<Response> {
  const report: DNAReport = {
    project_id: projectId,
    target: "project_style",
    mode,
    created: 0,
    skipped: 0,
    updated: 0,
    blocked: 0,
    low_confidence: 0,
    errors: [],
  };

  // Check for existing project_visual_style
  const { data: existingStyle } = await sb
    .from("project_visual_style")
    .select("id, is_complete")
    .eq("project_id", projectId)
    .maybeSingle();

  if (mode === "generate_missing" && existingStyle) {
    report.skipped++;
    return respond(report);
  }

  // Preview
  if (mode === "preview_only") {
    const derivedStyle = await deriveStyleFromCanon(sb, projectId);
    report.preview = [{
      target: "project_style",
      target_type: "project_visual_style",
      would_create: !existingStyle,
      would_update: !!existingStyle && !existingStyle.is_complete,
      would_block: existingStyle?.is_complete,
      derived_style: derivedStyle,
    }];
    return respond(report);
  }

  // Derive style from canon data
  const derivedStyle = await deriveStyleFromCanon(sb, projectId);

  if (!existingStyle) {
    const { error: insertError } = await sb
      .from("project_visual_style")
      .insert({
        project_id: projectId,
        period: derivedStyle.period,
        cultural_context: derivedStyle.cultural_context,
        lighting_philosophy: derivedStyle.lighting_philosophy,
        camera_philosophy: derivedStyle.camera_philosophy,
        composition_philosophy: derivedStyle.composition_philosophy,
        texture_materiality: derivedStyle.texture_materiality,
        color_response: derivedStyle.color_response,
        environment_realism: derivedStyle.environment_realism,
        forbidden_traits: derivedStyle.forbidden_traits || [],
        is_complete: false,
      });

    if (insertError) {
      report.errors.push(`Insert project_visual_style failed: ${insertError.message}`);
      return respond(report, 500);
    }
    report.created++;
  } else if (!existingStyle.is_complete) {
    // Update only if not complete
    const { error: updateError } = await sb
      .from("project_visual_style")
      .update({
        period: derivedStyle.period,
        cultural_context: derivedStyle.cultural_context,
        lighting_philosophy: derivedStyle.lighting_philosophy,
        camera_philosophy: derivedStyle.camera_philosophy,
        composition_philosophy: derivedStyle.composition_philosophy,
        texture_materiality: derivedStyle.texture_materiality,
        color_response: derivedStyle.color_response,
        environment_realism: derivedStyle.environment_realism,
        forbidden_traits: derivedStyle.forbidden_traits || [],
      })
      .eq("id", existingStyle.id);

    if (updateError) {
      report.errors.push(`Update project_visual_style failed: ${updateError.message}`);
      return respond(report, 500);
    }
    report.updated++;
  } else {
    report.blocked++;
  }

  // ── G6: Auto-populate project_visual_language.style_profile_json ──
  // Populates the style_profile_json from derived style data (era, cultural
  // context, tone/atmosphere). This feeds into generate-hero-frames
  // resolveVisualStyleProfile() which reads style_profile_json for the
  // [VISUAL STYLE AUTHORITY] block in hero frame prompts.
  try {
    const styleProfile = {
      era: derivedStyle.period || "",
      cultural_context: derivedStyle.cultural_context || "",
      tone_atmosphere: derivedStyle.lighting_philosophy || "",
      color_palette: derivedStyle.color_response || "",
      texture_materiality: derivedStyle.texture_materiality || "",
      camera_style: derivedStyle.camera_philosophy || "",
      composition_style: derivedStyle.composition_philosophy || "",
      environment_realism: derivedStyle.environment_realism || "",
      generated_at: new Date().toISOString(),
      source: "generate-visual-dna-from-canon::handleProjectStyle",
    };

    // Filter out empty strings
    const cleanProfile: Record<string, string> = {};
    for (const [k, v] of Object.entries(styleProfile)) {
      if (v && typeof v === "string" && v.length > 0) {
        cleanProfile[k] = v;
      }
    }

    if (Object.keys(cleanProfile).length > 1) {
      // Check for existing row first
      const { data: existingVL } = await sb
        .from("project_visual_language")
        .select("id")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingVL?.id) {
        // Update existing
        const { error: vlError } = await sb
          .from("project_visual_language")
          .update({
            style_profile_json: cleanProfile,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingVL.id);

        if (vlError) {
          report.errors.push(`project_visual_language update failed: ${vlError.message}`);
        }
      } else {
        // Insert new
        const { error: vlError } = await sb
          .from("project_visual_language")
          .insert({
            project_id: projectId,
            style_profile_json: cleanProfile,
          });

        if (vlError) {
          report.errors.push(`project_visual_language insert failed: ${vlError.message}`);
        }
      }
    }
  } catch (vlErr: any) {
    report.errors.push(`Visual language enrichment failed: ${vlErr.message}`);
  }

  return respond(report);
}

/**
 * Derive visual style fields from project canon data.
 * Pure mapping — no LLM call, no extraction logic duplication.
 */
async function deriveStyleFromCanon(
  sb: any,
  projectId: string,
  functionBase?: string,
): Promise<Record<string, any>> {
  const style: Record<string, any> = {
    period: "",
    cultural_context: "",
    lighting_philosophy: "",
    camera_philosophy: "",
    composition_philosophy: "",
    texture_materiality: "",
    color_response: "",
    environment_realism: "",
    forbidden_traits: [],
  };

  // 1. From project_canon — world_rules, genre, tone
  const { data: canon } = await sb
    .from("project_canon")
    .select("canon_json")
    .eq("project_id", projectId)
    .maybeSingle();

  if (canon?.canon_json) {
    const cj = canon.canon_json as Record<string, any>;
    const worldRules = cj.world_rules || "";
    const worldRulesStr = typeof worldRules === "string" ? worldRules : JSON.stringify(worldRules);

    // Genre/tone
    const genre = cj.genre || cj.genres || "";
    const tone = cj.tone || cj.tones || "";

    // Period extraction from world rules
    if (worldRulesStr) {
      const periodMatch = worldRulesStr.match(
        /(?:set\s+in|era|period|time\s+period|century|year\s+\d{4})(?:\s*:?\s*)([^.\n]+)/i,
      );
      if (periodMatch) style.period = periodMatch[1].trim();

      const cultureMatch = worldRulesStr.match(
        /(?:cultural|culture|setting\s+location|world\s+is)(?:\s*:?\s*)([^.\n]+)/i,
      );
      if (cultureMatch) style.cultural_context = cultureMatch[1].trim();
    }

    // Lighting from world rules or description
    if (worldRulesStr) {
      const lightingMatch = worldRulesStr.match(
        /(?:lighting|illumination|light\s+sources)(?:\s*:?\s*)([^.\n]+)/i,
      );
      if (lightingMatch) style.lighting_philosophy = lightingMatch[1].trim();
    }

    // Color from world rules
    if (worldRulesStr) {
      const colorMatch = worldRulesStr.match(
        /(?:color|colour|palette|color\s+palette)(?:\s*:?\s*)([^.\n]+)/i,
      );
      if (colorMatch) style.color_response = colorMatch[1].trim();
    }

    // Genre-based defaults as fallbacks
    if (!style.lighting_philosophy) {
      const genreLower = (typeof genre === "string" ? genre : "").toLowerCase();
      if (genreLower.includes("noir") || genreLower.includes("dark")) {
        style.lighting_philosophy = "High contrast, chiaroscuro, deep shadows";
      } else if (genreLower.includes("comedy") || genreLower.includes("romance")) {
        style.lighting_philosophy = "Bright, even, naturalistic lighting";
      } else if (genreLower.includes("horror")) {
        style.lighting_philosophy = "Low key, practical sources, pools of darkness";
      }
    }

    // Genre-based composition
    if (!style.composition_philosophy) {
      const genreLower = (typeof genre === "string" ? genre : "").toLowerCase();
      if (genreLower.includes("action")) {
        style.composition_philosophy = "Dynamic, off-center, wide lenses";
      } else if (genreLower.includes("drama")) {
        style.composition_philosophy = "Classic framing, balanced, character-centered";
      }
    }
  }

  // 2. From project documents — treatment, concept brief for visual descriptions
  const { data: docs } = await sb
    .from("project_documents")
    .select("id, doc_type, latest_version_id")
    .eq("project_id", projectId)
    .in("doc_type", ["treatment", "concept_brief", "story_outline"])
    .limit(5);

  if (docs && docs.length > 0) {
    const versionIds = docs.map((d: any) => d.latest_version_id).filter(Boolean);
    if (versionIds.length > 0) {
      const { data: versions } = await sb
        .from("project_document_versions")
        .select("id, document_id, plaintext")
        .in("id", versionIds)
        .limit(3);

      if (versions) {
        for (const v of versions) {
          const text = (v.plaintext || "") as string;
          // Extract visual style hints from document text
          const txMatch = text.match(
            /(?:texture|materiality|surface|feel\s+of)(?:\s*:?\s*)([^.\n]{10,})/i,
          );
          if (txMatch && !style.texture_materiality) {
            style.texture_materiality = txMatch[1].trim();
          }

          const envMatch = text.match(
            /(?:environment|setting|location|world\s+feels)(?:\s*:?\s*)([^.\n]{10,})/i,
          );
          if (envMatch && !style.environment_realism) {
            style.environment_realism = envMatch[1].trim();
          }

          const camMatch = text.match(
            /(?:camera|cinematography|visual\s+style)(?:\s*:?\s*)([^.\n]{10,})/i,
          );
          if (camMatch && !style.camera_philosophy) {
            style.camera_philosophy = camMatch[1].trim();
          }
        }
      }
    }
  }

  // 3. LLM fallback — if 3+ visual fields are still empty and functionBase provided
  if (functionBase) {
    const visualFields = [
      style.period,
      style.lighting_philosophy,
      style.camera_philosophy,
      style.composition_philosophy,
      style.texture_materiality,
      style.color_response,
      style.environment_realism,
    ];
    const emptyCount = visualFields.filter((f) => !f || f.trim().length === 0).length;

    if (emptyCount >= 3) {
      const { data: canon } = await sb
        .from("project_canon")
        .select("canon_json")
        .eq("project_id", projectId)
        .maybeSingle();

      const canonText = canon?.canon_json
        ? JSON.stringify(canon.canon_json).slice(0, 4000)
        : "";

      if (canonText) {
        try {
          const gateway = resolveGateway();
          const result = await callLLM({
            apiKey: gateway.apiKey,
            model: MODELS.FAST,
            system: `You are a visual style analyst. Given project canon information, derive visual style fields. Return ONLY valid JSON with these keys: period, lighting_philosophy, camera_philosophy, composition_philosophy, texture_materiality, color_response, environment_realism, cultural_context. Each value must be a concise string (1-2 sentences max). No markdown, no commentary.`,
            user: `Project canon:\n\n${canonText}\n\nDerive visual style fields based on this project's world rules and setting.`,
            temperature: 0.2,
            maxTokens: 2000,
            retries: 1,
          });

          const reply = result.content;
          // Extract JSON safely
          let jsonStart = reply.indexOf("{");
          let jsonEnd = reply.lastIndexOf("}");
          if (jsonStart >= 0 && jsonEnd > jsonStart) {
            const jsonStr = reply.slice(jsonStart, jsonEnd + 1);
            const llmStyle = JSON.parse(jsonStr);
            // Only fill empty fields — never overwrite regex-derived ones
            if (!style.period && llmStyle.period) style.period = llmStyle.period;
            if (!style.lighting_philosophy && llmStyle.lighting_philosophy) style.lighting_philosophy = llmStyle.lighting_philosophy;
            if (!style.camera_philosophy && llmStyle.camera_philosophy) style.camera_philosophy = llmStyle.camera_philosophy;
            if (!style.composition_philosophy && llmStyle.composition_philosophy) style.composition_philosophy = llmStyle.composition_philosophy;
            if (!style.texture_materiality && llmStyle.texture_materiality) style.texture_materiality = llmStyle.texture_materiality;
            if (!style.color_response && llmStyle.color_response) style.color_response = llmStyle.color_response;
            if (!style.environment_realism && llmStyle.environment_realism) style.environment_realism = llmStyle.environment_realism;
            if (!style.cultural_context && llmStyle.cultural_context) style.cultural_context = llmStyle.cultural_context;
          }
        } catch (e: any) {
          console.error("LLM fallback for deriveStyleFromCanon failed:", e.message);
          // Non-blocking — continue with regex-derived fields
        }
      }
    }
  }

  return style;
}

// ─── Location Handler ───

async function handleLocation(
  sb: any,
  projectId: string,
  locationName: string,
  mode: string,
): Promise<Response> {
  const report: DNAReport = {
    project_id: projectId,
    target: `location:${locationName}`,
    mode,
    created: 0,
    skipped: 0,
    updated: 0,
    blocked: 0,
    low_confidence: 0,
    errors: [],
  };

  // Check entity_visual_states for existing location entries
  const { data: existingStates } = await sb
    .from("entity_visual_states")
    .select("id, state_key, active")
    .eq("project_id", projectId)
    .eq("entity_type", "location")
    .eq("entity_name", locationName)
    .limit(10);

  // Check location_visual_datasets
  const { data: existingDS } = await sb
    .from("location_visual_datasets")
    .select("id, dataset_version")
    .eq("project_id", projectId)
    .eq("location_name", locationName)
    .eq("is_current", true)
    .maybeSingle();

  const hasExisting = !!existingDS || (existingStates && existingStates.length > 0);

  if (mode === "generate_missing" && hasExisting) {
    report.skipped++;
    return respond(report);
  }

  if (mode === "preview_only") {
    const { data: canon } = await sb
      .from("project_canon")
      .select("canon_json")
      .eq("project_id", projectId)
      .maybeSingle();

    const locationData = canon?.canon_json?.locations
      ? (canon.canon_json.locations as any[]).find(
          (l: any) => (l.name || "").toLowerCase() === locationName.toLowerCase(),
        )
      : null;

    report.preview = [{
      target: locationName,
      target_type: "location",
      would_create: !hasExisting,
      would_update: !!existingDS,
      canon_data: locationData,
    }];
    return respond(report);
  }

  // Generate location entity_visual_states from canon
  const { data: canon } = await sb
    .from("project_canon")
    .select("canon_json")
    .eq("project_id", projectId)
    .maybeSingle();

  const locationData = canon?.canon_json?.locations
    ? (canon.canon_json.locations as any[]).find(
        (l: any) => (l.name || "").toLowerCase() === locationName.toLowerCase(),
      )
    : null;

  // Create entity_visual_states for the location
    if (locationData) {
      const stateKey = `location_${locationName.toLowerCase().replace(/\s+/g, "_")}`;
      const description = typeof locationData === "string"
        ? locationData
        : locationData.description || locationData.summary || "";

      const { error: evsError } = await sb
        .from("entity_visual_states")
        .upsert({
          project_id: projectId,
          entity_type: "location",
          entity_name: locationName,
          state_key: stateKey,
          state_label: locationName,
          state_category: "location",
          canonical_description: typeof description === "string" ? description.slice(0, 2000) : "",
          source_reason: "generated from canon",
          confidence: "proposed",
          active: true,
        }, {
          onConflict: "project_id, entity_type, entity_name, state_key",
        });

      if (evsError) {
        report.errors.push(`entity_visual_states insert failed: ${evsError.message}`);
      } else {
        report.created++;
      }

      // ── G3: Enrich location_visual_datasets from canon context ──
      try {
        const locationContext = typeof locationData === "object"
          ? JSON.stringify(locationData, null, 2).slice(0, 3000)
          : description.slice(0, 2000);

        const { apiKey: llmApiKey } = resolveGateway();

        const enrichResult = await callLLM({
          apiKey: llmApiKey,
          model: MODELS.FAST,
          system: `You are a Production Designer AI assistant for film/TV.
Your task: Enrich the location data with structured Production Design truth fields
for the location_visual_datasets table.

Output ONLY valid JSON in this exact schema:
{
  "structural_substrate": {"primary": ["arr1","arr2"], "secondary": [], "notes": "..."},
  "surface_condition": {"primary": ["arr1","arr2"], "secondary": [], "notes": "..."},
  "atmosphere_behavior": {"primary": ["arr1","arr2"], "secondary": [], "notes": "..."},
  "spatial_character": {"primary": ["arr1","arr2"], "secondary": [], "notes": "..."},
  "contextual_dressing": {"primary": ["arr1","arr2"], "secondary": [], "notes": "..."},
  "material_notes": "...",
  "density_notes": "..."
}

Rules:
- "primary" = the most dominant visual traits (1-3 items)
- "secondary" = background/less dominant traits (0-3 items)
- "notes" = brief architectural or production design note (1-2 sentences)
- Be specific, not generic. "Weathered oak floorboards" not just "wood floor"
- If data is absent, use empty arrays with notes noting "insufficient canon"`,
          user: `Enrich Production Design truth for location "${locationName}" from this canon data:\n\n${locationContext}`,
          temperature: 0.2,
          maxTokens: 3000,
        });

        const enrichJson = JSON.parse(extractJSON(enrichResult.content));
        if (enrichJson && typeof enrichJson === "object") {
          const { data: canonLoc } = await sb
            .from("canon_locations")
            .select("id, canonical_name")
            .eq("project_id", projectId)
            .eq("active", true)
            .ilike("normalized_name", locationName.toLowerCase().replace(/[^a-z0-9]+/g, '_'))
            .limit(1)
            .maybeSingle();

          const { error: dsError } = await sb
            .from("location_visual_datasets")
            .upsert({
              project_id: projectId,
              canon_location_id: canonLoc?.id || null,
              location_name: locationName,
              source_mode: "reverse_engineered",
              completeness_score: 0.70,
              is_current: true,
              location_class: "primary_space",
              structural_substrate: enrichJson.structural_substrate || { primary: [], secondary: [], notes: "" },
              surface_condition: enrichJson.surface_condition || { primary: [], secondary: [], notes: "" },
              atmosphere_behavior: enrichJson.atmosphere_behavior || { primary: [], secondary: [], notes: "" },
              spatial_character: enrichJson.spatial_character || { primary: [], secondary: [], notes: "" },
              contextual_dressing: enrichJson.contextual_dressing || { primary: [], secondary: [], notes: "" },
              slot_establishing: enrichJson.structural_substrate
                ? { primary_truths: (enrichJson.structural_substrate.primary || []).slice(0, 3), secondary_truths: (enrichJson.structural_substrate.secondary || []).slice(0, 2), contextual: [], forbidden_dominance: [], hard_negatives: [], notes: enrichJson.structural_substrate.notes || "" }
                : undefined,
              slot_atmosphere: enrichJson.atmosphere_behavior
                ? { primary_truths: (enrichJson.atmosphere_behavior.primary || []).slice(0, 3), secondary_truths: (enrichJson.atmosphere_behavior.secondary || []).slice(0, 2), contextual: [], forbidden_dominance: [], hard_negatives: [], notes: enrichJson.atmosphere_behavior.notes || "" }
                : undefined,
              provenance: {
                generated_at: new Date().toISOString(),
                source: "generate-visual-dna-from-canon::handleLocation",
                method: "llm_enrichment",
              },
            }, {
              onConflict: "project_id, location_name, is_current",
            });

          if (dsError) {
            report.errors.push(`location_visual_datasets upsert failed: ${dsError.message}`);
          } else {
            report.updated = (report.updated || 0) + 1;
          }
        }
      } catch (enrichErr: any) {
        report.errors.push(`Location dataset enrichment failed: ${enrichErr.message}`);
      }
    } else {
      report.skipped++;
    report.errors.push(`Location "${locationName}" not found in project canon`);
  }

  return respond(report);
}

// ─── Entity Handler ───

async function handleEntity(
  sb: any,
  functionBase: string,
  projectId: string,
  entityName: string,
  entityType: "character" | "location" | "object",
  mode: string,
): Promise<Response> {
  // Route to the correct handler based on entity_type
  if (entityType === "character") {
    return await handleCharacter(sb, functionBase, projectId, entityName, mode);
  } else if (entityType === "location") {
    return await handleLocation(sb, projectId, entityName, mode);
  }

  // Object type — check entity_visual_states
  const report: DNAReport = {
    project_id: projectId,
    target: `entity:${entityName} (${entityType})`,
    mode,
    created: 0,
    skipped: 0,
    updated: 0,
    blocked: 0,
    low_confidence: 0,
    errors: [],
  };

  const { data: existingStates } = await sb
    .from("entity_visual_states")
    .select("id, state_key, active")
    .eq("project_id", projectId)
    .eq("entity_type", entityType)
    .eq("entity_name", entityName)
    .limit(5);

  if (mode === "generate_missing" && existingStates && existingStates.length > 0) {
    report.skipped++;
    return respond(report);
  }

  if (mode === "preview_only") {
    report.preview = [{
      target: entityName,
      target_type: entityType,
      would_create: !(existingStates && existingStates.length > 0),
    }];
    return respond(report);
  }

  // Create basic entity_visual_states entry
  const stateKey = `${entityType}_${entityName.toLowerCase().replace(/\s+/g, "_")}`;
  const { error: evsError } = await sb
    .from("entity_visual_states")
    .upsert({
      project_id: projectId,
      entity_type: entityType,
      entity_name: entityName,
      state_key: stateKey,
      state_label: entityName,
      state_category: entityType,
      canonical_description: "",
      source_reason: "generated from canon",
      confidence: "proposed",
      active: true,
    }, {
      onConflict: "project_id, entity_type, entity_name, state_key",
    });

  if (evsError) {
    report.errors.push(`entity_visual_states insert failed: ${evsError.message}`);
  } else {
    report.created++;
  }

  return respond(report);
}

// ─── Batch "all" Handler ───

/**
 * handleBatchAll — Orchestrate all DNA generation handlers in a single call.
 * Calls handleAllCharacters (with suppressGovernance=true), handleProjectStyle,
 * and processes all canon locations. Then calls evaluate-visual-governance once.
 * Returns aggregated BatchResult.
 */
async function handleBatchAll(
  sb: any,
  functionBase: string,
  projectId: string,
  mode: string,
): Promise<Response> {
  const batchResult: BatchResult = {
    characters: { created: 0, skipped: 0, updated: 0, blocked: 0, low_confidence: 0, errors: [] },
    style: { created: 0, skipped: 0, updated: 0, blocked: 0, low_confidence: 0, errors: [] },
    locations: { created: 0, skipped: 0, updated: 0, blocked: 0, low_confidence: 0, errors: [] },
    stale_count: 0,
    location_names: [],
  };

  // 1. Check stale count
  const staleInfo = await staleRowCount(sb, projectId);
  batchResult.stale_count = staleInfo.count;

  // 2. Process all characters (suppress governance — we'll call it once at the end)
  try {
    const charResponse = await handleAllCharacters(sb, functionBase, projectId, mode, true);
    const charData = await charResponse.json();
    batchResult.characters.created = charData.created || 0;
    batchResult.characters.skipped = charData.skipped || 0;
    batchResult.characters.updated = charData.updated || 0;
    batchResult.characters.blocked = charData.blocked || 0;
    batchResult.characters.low_confidence = charData.low_confidence || 0;
    if (charData.errors) {
      batchResult.characters.errors = charData.errors.slice(0, 20);
    }
  } catch (e: any) {
    batchResult.characters.errors.push(`handleAllCharacters threw: ${e.message}`);
  }

  // 3. Process project style (with LLM fallback via functionBase)
  try {
    const styleResponse = await handleProjectStyle(sb, projectId, mode);
    const styleData = await styleResponse.json();
    batchResult.style.created = styleData.created || 0;
    batchResult.style.skipped = styleData.skipped || 0;
    batchResult.style.updated = styleData.updated || 0;
    batchResult.style.blocked = styleData.blocked || 0;
    batchResult.style.low_confidence = styleData.low_confidence || 0;
    if (styleData.errors) {
      batchResult.style.errors = styleData.errors.slice(0, 10);
    }
  } catch (e: any) {
    batchResult.style.errors.push(`handleProjectStyle threw: ${e.message}`);
  }

  // 4. Process all locations from canon
  const locationNames = await scanCanonLocations(sb, projectId);
  batchResult.location_names = locationNames;

  for (const locName of locationNames) {
    try {
      const locResponse = await handleLocation(sb, projectId, locName, mode);
      const locData = await locResponse.json();
      batchResult.locations.created += locData.created || 0;
      batchResult.locations.skipped += locData.skipped || 0;
      batchResult.locations.updated += locData.updated || 0;
      batchResult.locations.blocked += locData.blocked || 0;
      batchResult.locations.low_confidence += locData.low_confidence || 0;
      if (locData.errors) {
        batchResult.locations.errors.push(...locData.errors.slice(0, 5).map((e: string) => `${locName}: ${e}`));
      }
    } catch (e: any) {
      batchResult.locations.errors.push(`${locName}: ${e.message}`);
    }
  }

  // 5. Call evaluate-visual-governance once at the end (if any real work was done)
  const totalCreated =
    batchResult.characters.created +
    batchResult.style.created +
    batchResult.locations.created;
  const totalUpdated =
    batchResult.characters.updated +
    batchResult.style.updated +
    batchResult.locations.updated;

  let governanceResult: any = null;
  if (mode !== "preview_only" && (totalCreated > 0 || totalUpdated > 0)) {
    try {
      const governanceUrl = `${functionBase}/evaluate-visual-governance`;
      const govResponse = await fetch(governanceUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        },
        body: JSON.stringify({ projectId }),
      });

      if (govResponse.ok) {
        governanceResult = await govResponse.json();
      }
    } catch (e: any) {
      // Non-blocking — governance failures don't break the batch
      console.error("evaluate-visual-governance in handleBatchAll failed:", e.message);
    }
  }

  return respond({
    characters: batchResult.characters,
    style: batchResult.style,
    locations: batchResult.locations,
    stale_count: batchResult.stale_count,
    location_names: batchResult.location_names,
    governance_result: governanceResult,
  });
}

// ─── Shared Utilities ───

/**
 * Count how many character_visual_dna rows have created_at older than
 * the project_canon.updated_at for this project (i.e. stale DNA).
 */
async function staleRowCount(sb: any, projectId: string): Promise<{ count: number; total: number }> {
  const { data: projectCanon } = await sb
    .from("project_canon")
    .select("updated_at")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!projectCanon?.updated_at) return { count: 0, total: 0 };

  const canonUpdated = new Date(projectCanon.updated_at).getTime();

  const { data: dnaRows } = await sb
    .from("character_visual_dna")
    .select("created_at")
    .eq("project_id", projectId)
    .eq("is_current", true);

  if (!dnaRows || dnaRows.length === 0) return { count: 0, total: 0 };

  let staleCount = 0;
  for (const row of dnaRows) {
    const dnaCreated = new Date(row.created_at).getTime();
    if (dnaCreated < canonUpdated) staleCount++;
  }

  return { count: staleCount, total: dnaRows.length };
}

/**
 * Scan project_canon.canon_json.locations and return an array of location names.
 */
async function scanCanonLocations(sb: any, projectId: string): Promise<string[]> {
  const { data: canon } = await sb
    .from("project_canon")
    .select("canon_json")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!canon?.canon_json) return [];

  const cj = canon.canon_json as Record<string, any>;
  const locations = cj.locations || [];
  if (!Array.isArray(locations)) return [];

  return locations
    .map((l: any) => (typeof l === "string" ? l : l.name || ""))
    .filter((n: string) => n.length > 0);
}

/**
 * Call the existing extract-visual-dna edge function via HTTP.
 * This keeps extraction logic in one place — no duplication.
 */
async function callExtractDNA(
  functionBase: string,
  projectId: string,
  characterName: string,
): Promise<Record<string, any>> {
  const url = `${functionBase}/extract-visual-dna`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
      },
      body: JSON.stringify({
        project_id: projectId,
        character_name: characterName,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { error: `extract-visual-dna returned ${response.status}: ${errText.slice(0, 200)}`, traits: [], marker_candidates: [], evidence_sources: [] };
    }

    return await response.json();
  } catch (e: any) {
    return { error: `extract-visual-dna fetch failed: ${e.message}`, traits: [], marker_candidates: [], evidence_sources: [] };
  }
}

/**
 * Deep merge two identity signatures.
 * New traits overwrite matching keys; novel keys appended.
 * Preserves binding_markers, evidence_traits, transient_states.
 */
function mergeIdentitySignatures(
  existing: Record<string, any>,
  incoming: Record<string, any>,
): Record<string, any> {
  const result = { ...existing };

  // Merge top-level fields
  for (const [key, value] of Object.entries(incoming)) {
    if (!value) continue;
    if (key === "signature" && typeof value === "object") {
      result.signature = { ...(result.signature || {}), ...value };
    } else if (key === "binding_markers" && Array.isArray(value)) {
      // Append novel binding markers
      const existingMarkers = result.binding_markers || [];
      const existingLabels = new Set(existingMarkers.map((m: any) => m.label));
      const novel = value.filter((m: any) => !existingLabels.has(m.label));
      result.binding_markers = [...existingMarkers, ...novel];
    } else if (key === "evidence_traits" && Array.isArray(value)) {
      const existingTraits = result.evidence_traits || [];
      const existingLabels = new Set(existingTraits.map((t: any) => t.label));
      const novel = value.filter((t: any) => !existingLabels.has(t.label));
      result.evidence_traits = [...existingTraits, ...novel];
    } else if (typeof value === "object" && !Array.isArray(value) && value !== null) {
      result[key] = { ...(result[key] || {}), ...value };
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * buildStructuredIdentityFromTraits — Quality-hardened identity extraction
 * with generic-value rejection, label normalization, inference classification,
 * non-human entity awareness, and legacy backfill from identity_signature JSON.
 *
 * Category → column mapping:
 *   age        → age_range
 *   gender     → biological_sex (+ gender_presentation)
 *   build      → body_type
 *   height     → height_class
 *   face       → facial_archetype
 *   voice      → voice_quality
 *   clothing   → wardrobe_signals (JSONB, per-item)
 *   ethnicity  → ethnicity (TEXT[])
 *   role       → role_archetype
 *   social_class → social_class
 *   skin/hair/posture/marker/other → preserved in JSON only (no new column)
 */
function buildStructuredIdentityFromTraits(
  traits: any[],
  strength: string,
): Record<string, any> {
  if (!traits || traits.length === 0) return {};

  // High-confidence trait matchers for known identity categories
  const sexLabels = ["male", "female"];
  const genderLabels = ["male", "female", "non-binary", "masculine", "feminine", "androgynous"];

  const result: Record<string, any> = {};

  // Per-field accumulators
  let biologicalSex: string | undefined;
  let genderPresentation: string | undefined;
  let ageRange: string | undefined;
  let ethnicity: string[] | undefined;
  let bodyType: string | undefined;
  let heightClass: string | undefined;
  let facialArchetype: string | undefined;
  let voiceQuality: string | undefined;
  let wardrobeSignals: Record<string, any> = {};
  let socialClass: string | undefined;
  let roleArchetype: string | undefined;

  // Per-field confidence tracking
  const confidence: Record<string, string> = {};
  const evidence: Record<string, string[]> = {};
  const inferenceTypes: Record<string, string> = {};

  /**
   * Known generic labels that are just the category name repeated.
   * These represent extraction failures where the LLM said "age" instead of
   * "40s weathered", "eyes" instead of "hazel eyes", etc.
   */
  const GENERIC_LABELS = new Set([
    "age", "ages", "eyes", "appearance", "appearances",
    "build", "body", "face", "facial", "skin", "hair",
    "height", "voice", "ethnicity", "social class", "role",
    "look", "looks", "feature", "features", "type", "style",
  ]);

  function isGenericLabel(value: string): boolean {
    const clean = value.toLowerCase().replace(/[^a-z\s-]/g, "").trim();
    // Pure generic match
    if (GENERIC_LABELS.has(clean)) return true;
    // Single word that is a known generic
    if (!clean.includes(" ") && GENERIC_LABELS.has(clean)) return true;
    return false;
  }

  /**
   * Normalize a raw identity value by stripping category suffix noise.
   * E.g.:
   *   "40s age" → "40s"
   *   "male gender" → "male"
   *   "rugged build" → "rugged"
   *   "tired appearance" → "tired"
   *   "appears in 30s" → "30s"
   *   "huge monstrous figure" → "huge monstrous figure" (kept as-is — specific)
   */
const CATEGORY_SUFFIXES = [
    /^(.*?)\s+(age|ages|gender|build|body|figure|appearance|look|looks|type|description|feature|features)\s*$/i,
    /^(.*?)\s+(years old|year old|years of age)\s*$/i,
    /^appears?\s+(?:to\s+be\s+)?(?:in\s+)?(?:their\s+)?(.+)$/i,
    /^(?:a\s+|an\s+)?(.+)$/i,
  ];

  function normalizeValue(raw: string, category: string): string {
    if (!raw) return "";
    let value = raw.trim();
    if (!value) return "";

    // Reject generic labels outright
    if (isGenericLabel(value)) return "";

    // Strip descriptive prefixes
    value = value.replace(/^appears?\s+(?:to\s+be\s+)?(?:in\s+)?(?:their\s+)?/i, "").trim();
    value = value.replace(/^(?:a\s+|an\s+)/i, "").trim();

    // Strip known category suffixes
    for (const pattern of CATEGORY_SUFFIXES) {
      const match = value.match(pattern);
      if (match && match[1] && match[1].trim()) {
        const stripped = match[1].trim();
        const suffix = (match[2] || "").toLowerCase();
        // Allow stripping when suffix matches category, is a known generic,
        // or matches one of the descriptive suffixes like "appearance", "looks"
        const descriptorSuffixes = new Set(["appearance", "look", "looks", "type", "description", "feature"]);
        if (!suffix || suffix === category.toLowerCase() || descriptorSuffixes.has(suffix)) {
          value = stripped;
          break;
        }
      }
    }

    // Collapse whitespace
    value = value.replace(/\s+/g, " ").trim();

    // Final check: if after stripping we're left with a generic, reject
    if (isGenericLabel(value)) return "";

    return value;
  }

  /**
   * Normalize age range values to canonical bands.
   * "40s" → "40s", "twenty years old" → "20s", "appears in 30s" → "30s"
   */
  function normalizeAgeRange(raw: string): string {
    if (!raw) return "";

    // Parse "appears in 30s" → "30s"
    const appearsMatch = raw.match(/appears?\s+(?:to\s+be\s+)?(?:in\s+)?(?:their\s+)?(\d+)s?/i);
    if (appearsMatch) return appearsMatch[1] + "s";

    // Parse "child" → "child"
    const knownAgeBands = new Set([
      "child", "teen", "teenager", "young adult", "adult",
      "middle-aged", "middle aged", "elderly", "senior",
      "ancient", "ageless",
    ]);
    const clean = raw.toLowerCase().replace(/[^a-z\s-]/g, "").trim();
    if (knownAgeBands.has(clean)) return clean;

    // Parse "20 years old" → "20s"
    const yearsOldMatch = raw.match(/(\d+)\s*(?:years?\s*)?old/i);
    if (yearsOldMatch) {
      const age = parseInt(yearsOldMatch[1], 10);
      if (age >= 0 && age <= 12) return "child";
      if (age >= 13 && age <= 19) return "teen";
      if (age >= 20 && age <= 29) return "20s";
      if (age >= 30 && age <= 39) return "30s";
      if (age >= 40 && age <= 49) return "40s";
      if (age >= 50 && age <= 59) return "50s";
      if (age >= 60) return "60s+";
    }

    // Parse "25-35" age range pattern
    const rangeMatch = raw.match(/(\d+)\s*[–\-]\s*(\d+)/);
    if (rangeMatch) {
      const low = parseInt(rangeMatch[1], 10);
      const high = parseInt(rangeMatch[2], 10);
      return `${low}-${high}`;
    }

    // Parse "40s" shorthand
    const decadeMatch = raw.match(/(\d+)s/);
    if (decadeMatch) return decadeMatch[1] + "s";

    // Return normalized value if it passed generic check
    return raw;
  }

  /**
   * Classify whether an identity value was explicitly stated in canon,
   * strongly implied, inferred from available evidence, or unknown.
   */
  function classifyInferenceType(
    category: string,
    rawLabel: string,
    traitConfidence: string,
  ): string {
    // High confidence + specific value → explicit canon
    if (traitConfidence === "high" && rawLabel.length > 3) return "explicit_canon";

    // High confidence + short but meaningful → strongly implied
    if (traitConfidence === "high") return "strongly_implied";

    // Medium confidence → inferred style
    if (traitConfidence === "medium") return "inferred_style";

    // Low confidence or missing → unknown
    return "unknown";
  }

  /**
   * Extra-specific rejection: biological_sex should only be "male", "female",
   * or not set. Normalize "male gender" → "male", "female gender" → "female".
   */
  function normalizeBiologicalSex(raw: string): string | undefined {
    if (!raw) return undefined;
    const clean = raw.toLowerCase().replace(/[^a-z]/g, "").trim();
    if (clean === "male" || clean === "female") return clean;
    if (clean === "malegender" || clean === "malegendered") return "male";
    if (clean === "femalegender" || clean === "femalegendered") return "female";
    return undefined; // Reject ambiguous
  }

  /**
   * Detect if a character is non-human / mythic / divine entity.
   * These entities should not be forced into human identity categories.
   */
const NON_HUMAN_MARKERS = [
    /\b(?:ten|forty|fifty|hundred|thousand)\s+(?:feet?|meters?)\s+tall\b/i,
    /\b(?:divine|alien|mythical|mythic|supernatural|demonic|angelic|celestial|regal|otherworldly)\b/i,
    /\b(?:ram[\-\s]like|horn|claw|tentacle|wing|hoof|tail|fang)\b/i,
    /\b(?:colossal|gigantic|massive|monstrous|giant)\s+(?:form|figure|being|creature|size|stature)\b/i,
    /\bnon[- ]?human\b/i,
    /\b(?:polished\s+)?(?:obsidian|stone-like|metallic|crystalline)\s+skin\b/i,
    /\bglowing\s+(?:eyes?|aura|presence)\b/i,
  ];

  function isNonHumanEntity(traits: any[]): boolean {
    if (!traits) return false;
    let nonHumanScore = 0;
    for (const t of traits) {
      const combined = `${t.label || ""} ${t.value || ""} ${t.category || ""}`;
      for (const pattern of NON_HUMAN_MARKERS) {
        if (pattern.test(combined)) {
          nonHumanScore++;
          break;
        }
      }
    }
    return nonHumanScore >= 2; // Two or more non-human markers
  }

  const entityIsNonHuman = isNonHumanEntity(traits);

  // Track the highest-confidence evidence per category
  // NOTE: traitConfidence and evidenceSource are declared outside the loop below so that
  // updateField's closure can access them. Using const/let inside the for-of
  // body creates a block scope that the outer closure can't reach.
  let traitConfidence: string;
  let evidenceSource: string = '';
  let category: string;
  let label: string;
  const updateField = (fieldName: string, fieldValue: string | string[]) => {
    if (!fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0)) return;
    const confScore = traitConfidence === "high" ? 3 : traitConfidence === "medium" ? 2 : 1;
    const existingScore = (confidence[fieldName] === "high" ? 3 : confidence[fieldName] === "medium" ? 2 : 0);

    if (confScore >= existingScore) {
      confidence[fieldName] = traitConfidence;
      evidence[fieldName] = [...(evidence[fieldName] || []), evidenceSource];
      inferenceTypes[fieldName] = classifyInferenceType(category, label, traitConfidence);
    }
  };

  for (const trait of traits) {
    category = (trait.category || "").toLowerCase().trim();
    const rawLabel = (trait.label || "").trim();
    label = rawLabel.toLowerCase().trim();
    const value = (trait.value || trait.label || "").trim();
    traitConfidence = (trait.confidence || "low").toLowerCase().trim();
    evidenceSource = trait.evidence_source || trait.source || `extract-visual-dna`;

    // Skip if label is generic (just the category name)
    if (isGenericLabel(label)) continue;

    // Normalize the value
    const normalized = normalizeValue(value, category);
    if (!normalized) continue;

    switch (category) {
      case "gender": {
        if (entityIsNonHuman) break; // Non-human entities don't get forced sex

        const cleanLabel = label.replace(/[^a-z\s-]/g, "").trim();
        const matchedSex = normalizeBiologicalSex(cleanLabel);

        // biological_sex: only for explicit male/female
        if (matchedSex && !biologicalSex) {
          biologicalSex = matchedSex;
          updateField("biological_sex", biologicalSex);
        }

        // gender_presentation: broader, but only if meaningful
        const matchedGender = genderLabels.find(g => new RegExp(`\\b${g}\\b`, 'i').test(cleanLabel));
        if (matchedGender && !genderPresentation) {
          genderPresentation = matchedGender;
          updateField("gender_presentation", genderPresentation);

          // Infer biological_sex from presentation when not explicit
          if (!biologicalSex && (matchedGender === "male" || matchedGender === "female")) {
            biologicalSex = matchedGender;
            updateField("biological_sex", biologicalSex);
          }
        }
        break;
      }

      case "age": {
        if (ageRange) break; // Already have best value
        const normalizedAge = normalizeAgeRange(normalized);
        if (normalizedAge && !isGenericLabel(normalizedAge)) {
          ageRange = normalizedAge;
          updateField("age_range", ageRange);
        }
        break;
      }

      case "build": {
        if (!bodyType) {
          bodyType = normalized.slice(0, 80);
          updateField("body_type", bodyType);
        }
        break;
      }

      case "height": {
        if (!heightClass) {
          heightClass = normalized.slice(0, 60);
          updateField("height_class", heightClass);
        }
        break;
      }

      case "face": {
        if (!facialArchetype) {
          facialArchetype = normalized.slice(0, 100);
          updateField("facial_archetype", facialArchetype);
        }
        break;
      }

      case "voice": {
        if (!voiceQuality) {
          voiceQuality = normalized.slice(0, 60);
          updateField("voice_quality", voiceQuality);
        }
        break;
      }

      case "clothing": {
        const cleanKey = rawLabel.replace(/[^a-zA-Z0-9\s_-]/g, "").trim();
        if (cleanKey && !wardrobeSignals[cleanKey]) {
          wardrobeSignals[cleanKey] = {
            value: normalized,
            source: evidenceSource,
            confidence: traitConfidence,
          };
        }
        break;
      }

      case "ethnicity": {
        const cleanEth = normalized.replace(/[^a-zA-Z\s\/-]/g, "").trim();
        if (cleanEth && cleanEth.length > 2 && !isGenericLabel(cleanEth)) {
          if (!ethnicity?.includes(cleanEth)) {
            ethnicity = [...(ethnicity || []), cleanEth];
            updateField("ethnicity", cleanEth);
          }
        }
        break;
      }

      case "social_class": {
        if (!socialClass && !isGenericLabel(normalized)) {
          socialClass = normalized.slice(0, 60);
          updateField("social_class", socialClass);
        }
        break;
      }

      case "role": {
        if (!roleArchetype && !isGenericLabel(normalized)) {
          roleArchetype = normalized.slice(0, 60);
          updateField("role_archetype", roleArchetype);
        }
        break;
      }

      default:
        // skin, hair, posture, marker, other → stay in JSON only
        break;
    }
  }

  // Build result — only set fields we found
  if (biologicalSex) result.biological_sex = biologicalSex;
  if (genderPresentation) result.gender_presentation = genderPresentation;
  if (ageRange) result.age_range = ageRange;
  if (ethnicity && ethnicity.length > 0) result.ethnicity = ethnicity;
  if (bodyType) result.body_type = bodyType;
  if (heightClass) result.height_class = heightClass;
  if (facialArchetype) result.facial_archetype = facialArchetype;
  if (voiceQuality) result.voice_quality = voiceQuality;
  if (Object.keys(wardrobeSignals).length > 0) result.wardrobe_signals = wardrobeSignals;
  if (socialClass) result.social_class = socialClass;
  if (roleArchetype) result.role_archetype = roleArchetype;

  // Evidence tracking JSON
  result.identity_evidence = {};
  for (const [field, sources] of Object.entries(evidence)) {
    result.identity_evidence[field] = [...new Set(sources)].join("; ");
  }

  result.identity_confidence = { ...confidence };

  result.identity_inference_type = {};
  for (const field of Object.keys(confidence)) {
    if (!result.identity_inference_type[field]) {
      result.identity_inference_type[field] = inferenceTypes[field] || "ai_extraction";
    }
  }

  return result;
}

/**
 * Backfill structured identity fields from legacy identity_signature JSON.
 * Called when the identity_signature contains evidence not captured by the
 * AI extraction pipeline (e.g., legacy flat-format signatures with embedded
 * ethnicity, height, voice data).
 *
 * NEVER overwrites an existing non-null value (first-write-wins).
 */
function backfillIdentityFromSignature(
  identitySignature: any,
  existingStructured: Record<string, any>,
): Record<string, any> {
  if (!identitySignature) return {};

  const result: Record<string, any> = {};
  const sig = identitySignature;

  // Helper: get value if field is null/undefined/existing
  const needsFill = (field: string) =>
    existingStructured[field] === null || existingStructured[field] === undefined;

  // Format D: { signature: { age: {...}, gender: {...}, ... } }
  // Legacy Format B: flat fields directly in the top-level object
  const inner = sig.signature || sig;

  // Age — check all possible locations
  if (needsFill("age_range") && !result.age_range) {
    if (typeof inner.age === "string" && inner.age.length > 2) result.age_range = inner.age;
    else if (typeof inner.age === "object" && inner.age) {
      const ageVal = inner.age.value || inner.age.label || "";
      if (ageVal.length > 2) result.age_range = ageVal;
    }
    else if (sig.age && typeof sig.age === "string") result.age_range = sig.age;
  }

  // Gender/sex — explicit value or label
  if (needsFill("biological_sex") && !result.biological_sex) {
    const genderRaw = inner.gender || sig.gender || "";
    const genderVal = typeof genderRaw === "string" ? genderRaw.toLowerCase() :
      typeof genderRaw === "object" ? (genderRaw.value || genderRaw.label || "") : "";
    const clean = genderVal.replace(/[^a-z]/g, "").trim();
    if (clean === "male" || clean === "female") result.biological_sex = clean;
  }

  // Ethnicity — from various signature paths
  if (needsFill("ethnicity") && !result.ethnicity) {
    const ethRaw = inner.ethnicity || sig.ethnicity || "";
    if (Array.isArray(ethRaw) && ethRaw.length > 0) {
      result.ethnicity = ethRaw.filter((e: any) => typeof e === "string" && e.length > 1);
    } else if (typeof ethRaw === "string" && ethRaw.length > 2) {
      result.ethnicity = [ethRaw];
    }
  }

  // Height — from signature's body sub-object or direct height field
  if (needsFill("height_class") && !result.height_class) {
    const bodyHeight = inner.body?.height || inner.body?.height_estimate || sig.height || "";
    const bodyHeightVal = typeof bodyHeight === "string" ? bodyHeight :
      typeof bodyHeight === "object" ? (bodyHeight.value || bodyHeight.label || "") : "";
    if (bodyHeightVal && bodyHeightVal.length > 2) result.height_class = bodyHeightVal;
  }

  // Body type — from signature's body sub-object or direct build field
  if (needsFill("body_type") && !result.body_type) {
    const bodyVal = inner.body?.build || inner.body?.type ||
      inner.build || sig.build || "";
    const bodyStr = typeof bodyVal === "string" ? bodyVal :
      typeof bodyVal === "object" ? (bodyVal.value || bodyVal.label || "") : "";
    if (bodyStr && bodyStr.length > 2) result.body_type = bodyStr;
  }

  // Voice — from signature
  if (needsFill("voice_quality") && !result.voice_quality) {
    const voiceRaw = inner.voice || sig.voice || "";
    const voiceVal = typeof voiceRaw === "string" ? voiceRaw :
      typeof voiceRaw === "object" ? (voiceRaw.value || voiceRaw.label || "") : "";
    if (voiceVal && voiceVal.length > 2) result.voice_quality = voiceVal;
  }

  // Social class
  if (needsFill("social_class") && !result.social_class) {
    const classRaw = inner.social_class || sig.social_class || "";
    const classVal = typeof classRaw === "string" ? classRaw :
      typeof classRaw === "object" ? (classRaw.value || classRaw.label || "") : "";
    if (classVal && classVal.length > 2) result.social_class = classVal;
  }

  // Role archetype
  if (needsFill("role_archetype") && !result.role_archetype) {
    const roleRaw = inner.role || sig.role || "";
    const roleVal = typeof roleRaw === "string" ? roleRaw :
      typeof roleRaw === "object" ? (roleRaw.value || roleRaw.label || "") : "";
    if (roleVal && roleVal.length > 2) result.role_archetype = roleVal;
  }

  // Face archetype
  if (needsFill("facial_archetype") && !result.facial_archetype) {
    const faceRaw = inner.face || sig.face || "";
    const faceObj = typeof faceRaw === "object" ? faceRaw : null;
    if (faceObj) {
      // Try to extract a meaningful summary from face object
      const faceParts = [
        faceObj.shape || faceObj.type || faceObj.archetype || "",
        faceObj.eyes || "",
        faceObj.nose || "",
        faceObj.jaw || "",
      ].filter(Boolean);
      if (faceParts.length > 0) {
        result.facial_archetype = faceParts.join(", ").slice(0, 100);
      }
    } else if (typeof faceRaw === "string" && faceRaw.length > 2) {
      result.facial_archetype = faceRaw;
    }
  }

  return result;
}

/**
 * Extract identity_signature from any row format (Format B legacy flat,
 * Format D with evidence_traits, or mixed).
 */
function extractIdentitySignature(row: any): any {
  if (!row) return null;
  // Prefer the dedicated identity_signature JSONB column
  if (row.identity_signature) return row.identity_signature;
  // Fallback: construct from available structured fields
  const sig: any = {};
  if (row.age_range) sig.age = row.age_range;
  if (row.biological_sex) sig.gender = row.biological_sex;
  if (row.body_type) sig.build = row.body_type;
  if (row.ethnicity) sig.ethnicity = row.ethnicity;
  if (row.height_class) sig.height = row.height_class;
  if (Object.keys(sig).length === 0) return null;
  return { signature: sig };
}

function respond(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}