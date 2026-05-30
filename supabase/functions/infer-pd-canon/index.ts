// @ts-nocheck
/**
 * infer-pd-canon — Production Design Canon Inference Engine.
 *
 * Given project evidence (canon_json, scene_index, atoms, project metadata),
 * infers Production Design canonical truth into the certified PD canon tables:
 *
 *   pd_world_rules, pd_design_templates, pd_location_design,
 *   pd_creature_design, pd_location_props
 *
 * Phases (sequential — each depends on previous):
 *   0. Gather evidence from all available sources
 *   1. Infer pd_world_rules
 *   2. Infer pd_design_templates
 *   3. Infer pd_location_design (per unique location)
 *   4. Infer pd_creature_design (guarded — only if creatures exist)
 *   5. Infer pd_location_props (guarded — only if props mentioned)
 *   6. Call evaluate-visual-governance to reconcile
 *
 * Explicit script/canon truth wins. Inference fills gaps.
 * Inference may elaborate. Inference may not contradict.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveGateway, MODELS, extractJSON } from "../_shared/llm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ProjectEvidence {
  canonJson: Record<string, any>;
  sceneLocations: string[];
  sceneCounts: Record<string, number>;
  locationSceneTexts: Record<string, string[]>;
  projectMeta: Record<string, any>;
  creatureAtoms: any[];
  genreAtoms: any[];
  toneAtoms: any[];
  characterCount: number;
}

interface InferenceReport {
  world_rules_created: boolean;
  templates_created: number;
  locations_created: number;
  creatures_created: number;
  props_created: number;
  errors: string[];
  governance_result?: any;
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const projectId = body?.projectId as string | undefined;
    const mode = body?.mode || "full";

    if (!projectId) {
      return jsonRes({ error: "projectId is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const gateway = resolveGateway();
    const report: InferenceReport = {
      world_rules_created: false,
      templates_created: 0,
      locations_created: 0,
      creatures_created: 0,
      props_created: 0,
      errors: [],
    };

    // ── Phase 0: Gather evidence ──
    const evidence = await gatherEvidence(sb, projectId, report);
    if (report.errors.length > 0 && !evidence) {
      return jsonRes(report, 400);
    }

    // ── Phase 1: World Rules ──
    if (mode === "full" || mode === "world_rules_only") {
      await inferWorldRules(sb, projectId, evidence, gateway, report);
    }

    // ── Phase 2: Design Templates ──
    if ((mode === "full" || mode === "templates_only") && !report.errors.some(e => e.includes("world_rules"))) {
      await inferDesignTemplates(sb, projectId, evidence, gateway, report);
    }

    // ── Phase 3: Location Design ──
    if ((mode === "full" || mode === "locations_only") && !report.errors.some(e => e.includes("templates"))) {
      await inferLocationDesigns(sb, projectId, evidence, gateway, report);
    }

    // ── Phase 4: Creature Design (guarded) ──
    if ((mode === "full" || mode === "creatures_only") && evidence.creatureAtoms.length > 0) {
      await inferCreatureDesigns(sb, projectId, evidence, gateway, report);
    }

    // ── Phase 5: Props (guarded — from scene_index & canon) ──
    if (mode === "full") {
      await inferProps(sb, projectId, evidence, gateway, report);
    }

    // ── Phase 6: Governance reconciliation ──
    if (mode === "full") {
      try {
        const govUrl = `${supabaseUrl}/functions/v1/evaluate-visual-governance`;
        const govRes = await fetch(govUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ projectId }),
        });
        if (govRes.ok) {
          report.governance_result = await govRes.json();
        } else {
          report.errors.push(`evaluate-visual-governance returned ${govRes.status}`);
        }
      } catch (e: any) {
        report.errors.push(`evaluate-visual-governance failed: ${e.message}`);
      }
    }

    return jsonRes({ project_id: projectId, mode, ...report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonRes({ error: message }, 500);
  }
});

// ── Phase 0: Evidence gathering ──

async function gatherEvidence(
  sb: any,
  projectId: string,
  report: InferenceReport,
): Promise<ProjectEvidence | null> {
  try {
    // Parallel fetch all evidence sources
    const [
      { data: canonRow },
      { data: sceneIndexRows },
      { data: projMeta },
      { data: creatureAtoms },
      { data: genreAtoms },
      { data: toneAtoms },
      { data: sceneVersions },
    ] = await Promise.all([
      sb.from("project_canon").select("canon_json").eq("project_id", projectId).maybeSingle(),
      sb.from("scene_index").select("location_key, scene_number, title, character_keys").eq("project_id", projectId),
      sb.from("projects").select("title, format, logline, genres, premise, budget_range").eq("id", projectId).maybeSingle(),
      sb.from("atoms").select("canonical_name, attributes").eq("project_id", projectId).eq("atom_type", "creature"),
      sb.from("atoms").select("canonical_name, attributes").eq("project_id", projectId).eq("atom_type", "genre"),
      sb.from("atoms").select("canonical_name, attributes").eq("project_id", projectId).eq("atom_type", "tone"),
      sb.from("scene_graph_versions").select("slugline, summary, content, location").eq("project_id", projectId).limit(50),
    ]);

    const canonJson = (canonRow as any)?.canon_json || {};
    const scenes = (sceneIndexRows as any[]) || [];
    const projectMeta = (projMeta as any) || {};
    const creatureList = (creatureAtoms as any[]) || [];
    const genreList = (genreAtoms as any[]) || [];
    const toneList = (toneAtoms as any[]) || [];
    const sceneVersionList = (sceneVersions as any[]) || [];

    // Extract unique locations from scene_index
    const locationKeys = [...new Set(scenes.map((s: any) => s.location_key?.split(".")[0] || s.location_key || ""))].filter(Boolean);

    // Count scenes per location
    const sceneCounts: Record<string, number> = {};
    const locationSceneTexts: Record<string, string[]> = {};
    for (const s of scenes) {
      const loc = s.location_key?.split(".")[0] || s.location_key || "";
      if (!loc) continue;
      sceneCounts[loc] = (sceneCounts[loc] || 0) + 1;
      if (!locationSceneTexts[loc]) locationSceneTexts[loc] = [];
    }

    // Match scene descriptions to locations
    for (const sv of sceneVersionList) {
      const loc = (sv.location || "").toLowerCase().trim();
      if (!loc) continue;
      // Match scene version to a location key
      for (const locKey of locationKeys) {
        if (loc.includes(locKey.toLowerCase()) || locKey.toLowerCase().includes(loc)) {
          const text = sv.summary || sv.content || "";
          if (text && !locationSceneTexts[locKey].includes(text)) {
            locationSceneTexts[locKey] = locationSceneTexts[locKey].slice(0, 2);
            locationSceneTexts[locKey].push(text.slice(0, 300));
          }
          break;
        }
      }
    }

    // Also try matching from scene slugline/title
    for (const s of scenes) {
      const loc = s.location_key?.split(".")[0] || "";
      if (!loc || locationSceneTexts[loc]?.length >= 2) continue;
      const match = sceneVersionList.find((sv: any) =>
        s.title && sv.slugline && (
          sv.slugline.toLowerCase().includes(s.title.toLowerCase()) ||
          s.title.toLowerCase().includes(sv.slugline.toLowerCase())
        )
      );
      if (match) {
        const text = match.summary || match.content || "";
        if (text && !locationSceneTexts[loc].includes(text)) {
          locationSceneTexts[loc].push(text.slice(0, 300));
        }
      }
    }

    const charCount = scenes.reduce((max: number, s: any) =>
      Math.max(max, (s.character_keys || []).length), 0);

    return {
      canonJson,
      sceneLocations: locationKeys,
      sceneCounts,
      locationSceneTexts,
      projectMeta,
      creatureAtoms: creatureList,
      genreAtoms: genreList,
      toneAtoms: toneList,
      characterCount: charCount,
    };
  } catch (e: any) {
    report.errors.push(`Evidence gathering failed: ${e.message}`);
    return null;
  }
}

// ── Phase 1: World Rules ──

async function inferWorldRules(
  sb: any,
  projectId: string,
  ev: ProjectEvidence,
  gateway: { url: string; apiKey: string },
  report: InferenceReport,
) {
  try {
    // Skip if world rules already exist
    const { data: existing } = await sb.from("pd_world_rules").select("id").eq("project_id", projectId).maybeSingle();
    if (existing) {
      report.errors.push("pd_world_rules already exists — skipped (use mode=force to overwrite)");
      return;
    }

    const proj = ev.projectMeta;
    const locationsList = ev.sceneLocations.join(", ");
    const canonWorldRules = ev.canonJson.world_rules || "";
    const canonThemes = ev.canonJson.themes || "";
    const genres = proj.genres || ev.genreAtoms.map((g: any) => g.canonical_name).join(", ") || "";
    const tone = proj.tone || ev.toneAtoms.map((t: any) => t.canonical_name).join(", ") || "";

    const systemPrompt = `You are a production design architect for film and television.
Given project evidence, infer the Production Design World Rules as structured JSON.
Explicit script/canon truth wins. Inference fills gaps.
Do NOT inject period, genre, or setting assumptions unless supported by the project evidence.`;

    const userPrompt = `Infer Production Design World Rules for this project:

PROJECT TITLE: ${proj.title || ""}
FORMAT: ${proj.format || ""}
GENRES: ${genres}
TONE: ${tone}
LOGLINE: ${proj.logline || ""}
PREMISE: ${proj.premise || ""}
BUDGET: ${proj.budget_range || ""}

LOCATIONS: ${locationsList || "(none yet)"}

CANON WORLD RULES: ${canonWorldRules ? (typeof canonWorldRules === "string" ? canonWorldRules : JSON.stringify(canonWorldRules).slice(0, 2000)) : "(not defined)"}

CANON THEMES: ${canonThemes ? (typeof canonThemes === "string" ? canonThemes : JSON.stringify(canonThemes).slice(0, 1000)) : "(not defined)"}

Output ONLY valid JSON with these fields:
{
  "architectural_philosophy": "One paragraph describing the architectural style defining this world.",
  "material_philosophy": "Primary construction materials and why.",
  "wear_philosophy": "How age, use, and environment show on surfaces.",
  "lighting_philosophy": "Natural vs artificial light sources, key light quality.",
  "color_philosophy": "Dominant color palette and emotional intent.",
  "technology_level": "Technology era and how it manifests in design.",
  "creature_philosophy": "How creature design relates to world rules (empty if no creatures).",
  "prop_philosophy": "How props relate to character and world.",
  "era_influences": ["list of historical/architectural influences"],
  "climate_considerations": "How climate affects design decisions.",
  "cultural_influences": ["list of cultural references"],
  "design_constraints": ["budget-driven", "period-accurate", "practical"]
}`;

    const result = await callLLM(sb, gateway, systemPrompt, userPrompt);
    const rulesJson = JSON.parse(extractJSON(result));

    const { error } = await sb.from("pd_world_rules").upsert({
      project_id: projectId,
      design_philosophy: rulesJson.architectural_philosophy || "",
      period: typeof rulesJson.era_influences === 'string' ? rulesJson.era_influences : Array.isArray(rulesJson.era_influences) ? rulesJson.era_influences.join(", ") : "",
      architectural_language: rulesJson.architectural_philosophy || "",
      material_philosophy: rulesJson.material_philosophy || "",
      color_philosophy: rulesJson.color_philosophy || "",
      lighting_philosophy: rulesJson.lighting_philosophy || "",
      cultural_influences: Array.isArray(rulesJson.cultural_influences) ? rulesJson.cultural_influences : rulesJson.cultural_influences ? [rulesJson.cultural_influences] : [],
      wear_and_age_rule: rulesJson.wear_philosophy || "",
      creature_philosophy: rulesJson.creature_philosophy || "",
    }, { onConflict: "project_id" });

    if (error) throw error;
    report.world_rules_created = true;
    console.log("✓ pd_world_rules created");
  } catch (e: any) {
    report.errors.push(`World rules inference failed: ${e.message}`);
  }
}

// ── Phase 2: Design Templates ──

async function inferDesignTemplates(
  sb: any,
  projectId: string,
  ev: ProjectEvidence,
  gateway: { url: string; apiKey: string },
  report: InferenceReport,
) {
  try {
    const { data: existing } = await sb.from("pd_design_templates").select("id").eq("project_id", projectId).limit(1);
    if (existing && existing.length > 0) {
      report.errors.push("pd_design_templates already exist — skipped");
      return;
    }

    // Group locations by architectural type
    const locationNames = ev.sceneLocations;
    const locationSummary = locationNames.map(l => {
      const count = ev.sceneCounts[l] || 0;
      return `${l} (${count} scenes)`;
    }).join("\n");

    // Determine template count based on location variety
    const maxTemplates = Math.min(Math.max(Math.ceil(locationNames.length / 2), 1), 8);
    const maxTemplatesStr = String(maxTemplates);

    const systemPrompt = `You are a production design architect. Given project evidence and locations, infer reusable Production Design Templates as structured JSON. Each template represents a reusable architectural/design package.`;

    const userPrompt = `Infer Production Design Templates for this project.

LOCATIONS:
${locationSummary || "(none yet)"}

Total locations: ${locationNames.length}
Generate ${maxTemplatesStr} templates maximum — one per distinct architectural type.

Output ONLY valid JSON object with a "templates" array:
{
  "templates": [
    {
      "display_name": "Human-readable name e.g. Urban Brownstone",
      "description": "One paragraph describing the template",
      "location_type": "The type of location this template applies to",
      "design_json": {
        "architectural_style": "style description",
        "primary_materials": ["material1", "material2"],
        "color_palette": ["color1", "color2"],
        "lighting_approach": "description",
        "shape_language": "description",
        "climate_response": "how design responds to climate"
      }
    }
  ]
}`;

    const result = await callLLM(sb, gateway, systemPrompt, userPrompt);
    const parsed = JSON.parse(extractJSON(result));
    const templateArray = Array.isArray(parsed) ? parsed : (parsed.templates || []);

    let created = 0;
    // Fallback: if LLM returned no templates, create one generic template
    let templatesToCreate = templateArray.slice(0, maxTemplates);
    if (templatesToCreate.length === 0 && locationNames.length > 0) {
      templatesToCreate = [{
        display_name: "Generic Urban Location",
        description: "Default template for a modern urban setting.",
        location_type: "urban",
        design_json: {
          architectural_style: "Contemporary urban architecture",
          primary_materials: ["steel", "concrete", "glass", "brick"],
          color_palette: ["urban grey", "steel blue", "warm amber", "shadow black"],
          lighting_approach: "natural daylight and artificial urban lighting",
          shape_language: "functional angular forms",
          climate_response: "standard urban climate adaptation"
        }
      }];
    }
    for (const tmpl of templatesToCreate) {
      const insertResult = await sb.from("pd_design_templates").insert({
        project_id: projectId,
        template_name: tmpl.display_name || "Untitled Template",
        parent_template: null,
        architectural_style: tmpl.design_json?.architectural_style || "",
        primary_materials: Array.isArray(tmpl.design_json?.primary_materials) ? tmpl.design_json.primary_materials : [],
        construction_method: "",
        color_palette: Array.isArray(tmpl.design_json?.color_palette) ? tmpl.design_json.color_palette : [],
        climate_adaptation: tmpl.design_json?.climate_response || "",
        lighting_natural: tmpl.design_json?.lighting_approach || "",
        lighting_artificial: "",
        condition_default: "",
        shape_language: tmpl.design_json?.shape_language || "",
        cultural_motifs: Array.isArray(tmpl.design_json?.cultural_motifs) ? tmpl.design_json.cultural_motifs : [],
      });
      if (!insertResult.error) created++;
    }
    report.templates_created = created;
    // Safety: if no templates were created, create one default
    if (created === 0 && locationNames.length > 0) {
      const fallback = await sb.from("pd_design_templates").insert({
        project_id: projectId,
        template_name: "Generic Urban Location",
        parent_template: null,
        architectural_style: "Contemporary urban architecture",
        primary_materials: ["steel", "concrete", "glass", "brick"],
        construction_method: "",
        color_palette: ["urban grey", "steel blue", "warm amber", "shadow black"],
        climate_adaptation: "standard urban",
        lighting_natural: "natural daylight and artificial lighting",
        lighting_artificial: "",
        condition_default: "",
        shape_language: "functional angular forms",
        cultural_motifs: ["urban", "contemporary"],
      });
      if (!fallback.error) {
        report.templates_created = 1;
        created = 1;
      }
    }
    console.log(`✓ ${created} pd_design_templates created`);
  } catch (e: any) {
    report.errors.push(`Design templates inference failed: ${e.message}`);
  }
}

// ── Phase 3: Location Design ──

async function inferLocationDesigns(
  sb: any,
  projectId: string,
  ev: ProjectEvidence,
  gateway: { url: string; apiKey: string },
  report: InferenceReport,
) {
  try {
    const { data: existing } = await sb.from("pd_location_design").select("id").eq("project_id", projectId).limit(1);
    if (existing && existing.length > 0) {
      report.errors.push("pd_location_design already exist — skipped");
      return;
    }

    // Fetch templates for inheritance
    const { data: templates } = await sb.from("pd_design_templates").select("template_key, display_name, design_json, location_type").eq("project_id", projectId);

    const templateSummary = (templates || []).map((t: any) =>
      `${t.template_key}: ${t.display_name} (${t.location_type})`
    ).join("\n");

    // Process each location
    let created = 0;
    for (const locKey of ev.sceneLocations) {
      const sceneCount = ev.sceneCounts[locKey] || 0;
      const sceneTexts = ev.locationSceneTexts[locKey] || [];
      const sceneText = sceneTexts.join("\n\n").slice(0, 2000);

      const systemPrompt = `You are a production design architect. Given project evidence and a specific location, infer the location's Production Design as structured JSON.`;

      const userPrompt = `Infer Production Design for this location:

LOCATION KEY: ${locKey}
SCENE COUNT: ${sceneCount}

AVAILABLE TEMPLATES:
${templateSummary || "(none — infer from scratch)"}

SCENE DESCRIPTIONS:
${sceneText || "(no scene descriptions available — infer from location name and project context)"}

Output ONLY valid JSON:
{
  "architecture": "Architectural description for this specific location",
  "materials": ["primary", "materials"],
  "color_palette": ["dominant", "colors"],
  "lighting_conditions": ["day", "night", "artificial"],
  "condition": "pristine | weathered | ruined | under_construction",
  "shape_language": "Shape and form description",
  "cultural_motifs": ["relevant motifs"],
  "key_visual_features": ["must include", "in every frame"],
  "template_inheritance": {
    "template_key": "matching template key or empty string",
    "deviations": ["deviations from template"]
  }
}`;

      const result = await callLLM(sb, gateway, systemPrompt, userPrompt);
      const design = JSON.parse(extractJSON(result));

      // Find best template match
      let templateId = null;
      if (design.template_inheritance?.template_key && templates) {
        const match = templates.find((t: any) => t.template_key === design.template_inheritance.template_key);
        if (match) templateId = match.id;
      }

      const { error } = await sb.from("pd_location_design").upsert({
        project_id: projectId,
        location_key: locKey,
        display_name: locKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        template_id: templateId,
        scene_count: sceneCount,
        architectural_overrides: design.architecture || "",
        unique_features: Array.isArray(design.key_visual_features) ? design.key_visual_features : design.key_visual_features ? [design.key_visual_features] : [],
        color_overrides: Array.isArray(design.color_palette) ? design.color_palette : design.color_palette ? [design.color_palette] : [],
        lighting_overrides: Array.isArray(design.lighting_conditions) ? design.lighting_conditions : design.lighting_conditions ? [design.lighting_conditions] : [],
        condition: design.condition || "",
        narrative_function: "",
      }, { onConflict: "project_id, location_key" });

      if (!error) created++;
    }
    report.locations_created = created;
    console.log(`✓ ${created} pd_location_design entries created`);
  } catch (e: any) {
    report.errors.push(`Location design inference failed: ${e.message}`);
  }
}

// ── Phase 4: Creature Design (guarded) ──

async function inferCreatureDesigns(
  sb: any,
  projectId: string,
  ev: ProjectEvidence,
  gateway: { url: string; apiKey: string },
  report: InferenceReport,
) {
  try {
    const { data: existing } = await sb.from("pd_creature_design").select("id").eq("project_id", projectId).limit(1);
    if (existing && existing.length > 0) {
      report.errors.push("pd_creature_design already exist — skipped");
      return;
    }

    let created = 0;
    for (const atom of ev.creatureAtoms) {
      const attrs = (atom.attributes || {}) as any;
      const systemPrompt = `You are a creature design supervisor. Given project evidence and a creature atom, infer a Production Design creature entry as structured JSON.`;

      const userPrompt = `Infer Production Design for this creature:

CREATURE: ${atom.canonical_name}
TYPE: ${attrs.creature_type || "unknown"}
BEHAVIOUR: ${attrs.behaviour_class || "unknown"}
DESCRIPTION: ${attrs.physical_description || ""}
ROLE: ${attrs.role_in_story || ""}
CGI: ${attrs.CGI_requirements || ""}

Output ONLY valid JSON:
{
  "silhouette": "Silhouette description",
  "mass": "Size and mass description",
  "locomotion": "How it moves",
  "skin_texture": "Skin/fur/scale description",
  "anatomy": "Key anatomical features",
  "color_pattern": "Color pattern description",
  "visual_language": "How this creature's design relates to the world",
  "production_notes": "Practical production considerations",
  "reference_keywords": ["keywords", "for", "reference", "images"]
}`;

      const result = await callLLM(sb, gateway, systemPrompt, userPrompt);
      const design = JSON.parse(extractJSON(result));

      const { error } = await sb.from("pd_creature_design").upsert({
        project_id: projectId,
        creature_name: atom.canonical_name,
        creature_type: attrs.creature_type || "unknown",
        anatomy: design.anatomy || "",
        scale: design.mass || "",
        materials: design.skin_texture || "",
        color_pattern: design.color_pattern || "",
        behaviour_indicators: design.locomotion || "",
        ecological_role: design.visual_language || "",
        narrative_function: "",
      }, { onConflict: "project_id, creature_name" });

      if (!error) created++;
    }
    report.creatures_created = created;
    console.log(`✓ ${created} pd_creature_design entries created`);
  } catch (e: any) {
    report.errors.push(`Creature design inference failed: ${e.message}`);
  }
}

// ── Phase 5: Props (guarded) ──

async function inferProps(
  sb: any,
  projectId: string,
  ev: ProjectEvidence,
  gateway: { url: string; apiKey: string },
  report: InferenceReport,
) {
  try {
    const { data: existing } = await sb.from("pd_location_props").select("id").eq("project_id", projectId).limit(1);
    if (existing && existing.length > 0) {
      return; // Props already exist — skip silently (not an error)
    }

    // Find props mentioned in canon_json
    const canonProps = ev.canonJson.props || ev.canonJson.weapons || ev.canonJson.vehicles || [];
    const propList = Array.isArray(canonProps) ? canonProps : [];

    // Find props mentioned in scene descriptions
    const allSceneTexts = Object.values(ev.locationSceneTexts).flat().join(" ");
    const propKeywords = ["gun", "rifle", "knife", "sword", "key", "map", "book", "phone", "radio",
      "lamp", "briefcase", "bag", "case", "device", "machine", "artifact", "relic",
      "scroll", "letter", "photograph", "painting", "statue", "box", "container",
      "weapon", "tool", "instrument", "vehicle", "car", "truck", "boat"];

    const mentionedProps: string[] = [];
    for (const kw of propKeywords) {
      if (allSceneTexts.toLowerCase().includes(kw)) {
        mentionedProps.push(kw);
      }
    }

    const allProps = [...new Set([...propList, ...mentionedProps])].slice(0, 10);
    if (allProps.length === 0) return; // No props found — skip

    const systemPrompt = `You are a prop designer for film. Given project evidence, infer Production Design prop entries as structured JSON. Only create props that have narrative significance.`;

    const userPrompt = `Infer Production Design props for this project:

PROJECT: ${ev.projectMeta.title || ""}
LOCATIONS: ${ev.sceneLocations.join(", ")}

PROPS MENTIONED: ${allProps.join(", ")}

Output ONLY valid JSON object with a "props" array:
{
  "props": [
    {
      "prop_key": "unique_slug",
      "display_name": "Readable name",
      "location_key": "which location this prop belongs to (or '' if general)",
      "design_json": {
        "construction": "How it's built or sourced",
        "materials": ["material1"],
        "wear": "Age and use description",
        "significance": "Narrative significance",
        "visual_style": "How it fits the visual world"
      }
    }
  ]
}`;

    const result = await callLLM(sb, gateway, systemPrompt, userPrompt);
    const parsed = JSON.parse(extractJSON(result));
    const props = Array.isArray(parsed) ? parsed : (parsed.props || [parsed]);

    let created = 0;
    for (const prop of props.slice(0, 10)) {
      if (!prop.prop_key) continue;
      const { error } = await sb.from("pd_location_props").upsert({
        project_id: projectId,
        location_key: prop.location_key || "",
        prop_name: prop.display_name || prop.prop_key,
        prop_type: prop.design_json?.construction || "",
        location_binding: prop.location_key || "",
        character_binding: "",
        materials: Array.isArray(prop.design_json?.materials) ? prop.design_json.materials : [],
        manufacture: prop.design_json?.construction || "",
        condition: prop.design_json?.wear || "",
        narrative_significance: prop.design_json?.significance || "",
        first_scene: null,
        last_scene: null,
      }, { onConflict: "project_id, prop_name" });
      if (!error) created++;
    }
    report.props_created = created;
    console.log(`✓ ${created} pd_location_props created`);
  } catch (e: any) {
    report.errors.push(`Prop inference failed: ${e.message}`);
  }
}

// ── LLM call helper ──

async function callLLM(
  sb: any,
  gateway: { url: string; apiKey: string },
  system: string,
  user: string,
): Promise<string> {
  const response = await fetch(gateway.url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${gateway.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://iffy-analysis.vercel.app",
      "X-Title": "IFFY PD Canon Inference",
    },
    body: JSON.stringify({
      model: MODELS.FAST,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM call failed (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}
