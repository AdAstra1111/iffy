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
  mode: "preview_only" | "generate_missing" | "refresh_stale";
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

    const validModes = ["preview_only", "generate_missing", "refresh_stale"];
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
    .select("id, version_number, identity_strength, identity_signature, is_current")
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

  if (isApprovedOrStrong && mode !== "refresh_stale") {
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

  if (!canon?.canon_json) {
    report.errors.push("No project_canon found for this project");
    return respond(report, 400);
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
    const name = c.name || c.character_name || "";
    if (name) allCharNames.add(name);
  }
  if (projChars) {
    for (const pc of projChars) {
      if (pc.name) allCharNames.add(pc.name);
    }
  }

  const charNames = Array.from(allCharNames);

  // Process each character
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

  // ── Phase 2: Call evaluate-visual-governance after successful generation ──
  if (!suppressGovernance && mode !== "preview_only" && (report.created > 0 || report.updated > 0)) {
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

function respond(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}