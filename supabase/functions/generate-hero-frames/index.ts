import { createClient } from "jsr:@supabase/supabase-js@2";
import { resolveImageGenerationConfig, buildImageRepositoryMeta } from "../_shared/imageGenerationResolver.ts";
import { computeEdgeQualityGate } from "../_shared/edgeQualityGate.ts";
import { resolveEffectiveWardrobe, resolveTemporalTruthFromCanon } from "../_shared/effectiveWardrobeNormalizer.ts";

// ── Inline visual style resolver (no external dependency) ────────────────────
async function resolveVisualStyleProfile(sb: any, projectId: string): Promise<{ promptBlock: string | null }> {
  try {
    const { data } = await sb
      .from("project_visual_language")
      .select("style_profile_json")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data?.style_profile_json) return { promptBlock: null };
    const profile = data.style_profile_json as Record<string, unknown>;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(profile)) {
      if (v && typeof v === "string") parts.push(`${k}: ${v}`);
    }
    return { promptBlock: parts.length ? parts.join("\n") : null };
  } catch {
    return { promptBlock: null };
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Photoreal enforcement ────────────────────────────────────────────────────

const PHOTOREAL_DIRECTIVES =
  "Photorealistic cinematic imagery. Live-action film still. Shot on ARRI Alexa with premium anamorphic lenses (Panavision C-Series or Cooke S7). Real-world materials, textures, surfaces. Believable natural or motivated cinematic lighting. Real lens behaviour including subtle flares, bokeh, and depth of field. Premium theatrical realism. Film grain present. Imperfect real-world skin texture with pores and natural variation. No illustration, no concept art, no digital painting, no CGI render look. MUST be landscape orientation with cinematic width.";

const PHOTOREAL_NEGATIVES =
  "painterly, illustrative, cartoon, anime, graphic-novel style, concept art, abstract, surreal, watercolor, oil painting, sketch, line art, cel-shaded, digital painting, CGI render, stock photo, 3D render, Unreal Engine, video game screenshot, airbrushed skin, poster layout, typography, text overlay, title card, slate, clapperboard, credits, watermark, logo, collage, grid layout, multi-panel, composite image, portrait orientation, vertical framing, square format, 1:1 aspect ratio, moodboard, contact sheet";

// ── Scene Index Types ────────────────────────────────────────────────────────

interface SceneIndexEntry {
  scene_number: string;
  title: string;
  location_key: string;
  character_keys: string[];
  wardrobe_state_map: Record<string, string> | null;
}

// ── Character DNA + Actor Anchor resolution ──────────────────────────────────

interface CharacterTruth {
  name: string;
  traits: string;
  dnaVersionId: string | null;
  actorBound: boolean;
  actorName: string | null;
  actorVersionId: string | null;
  anchorCount: number;
  referenceImageUrls: string[];
}

async function resolveCharacterTruth(sb: any, projectId: string): Promise<CharacterTruth[]> {
  const { data: dnaRows } = await sb
    .from("character_visual_dna")
    .select("id, character_name, locked_invariants, identity_signature")
    .eq("project_id", projectId)
    .eq("is_current", true)
    .order("character_name")
    .limit(10);

  if (!dnaRows?.length) return [];

  const characterNames = dnaRows.map((d: any) => d.character_name.toLowerCase().trim().replace(/\s+/g, " "));
  const { data: castBindings } = await sb
    .from("project_ai_cast")
    .select("character_key, ai_actor_id, ai_actor_version_id")
    .eq("project_id", projectId)
    .in("character_key", characterNames);

  const bindMap = new Map<string, { actorId: string; versionId: string }>();
  for (const b of (castBindings || [])) {
    if (b.ai_actor_version_id) {
      bindMap.set(b.character_key, { actorId: b.ai_actor_id, versionId: b.ai_actor_version_id });
    }
  }

  const actorIds = [...new Set([...bindMap.values()].map(b => b.actorId))];
  const versionIds = [...new Set([...bindMap.values()].map(b => b.versionId))];

  let actorNameMap = new Map<string, string>();
  let anchorCountMap = new Map<string, number>();
  let refUrlMap = new Map<string, string[]>();

  if (actorIds.length > 0) {
    const { data: actors } = await sb
      .from("ai_actors")
      .select("id, name")
      .in("id", actorIds);
    for (const a of (actors || [])) actorNameMap.set(a.id, a.name);
  }

  if (versionIds.length > 0) {
    const { data: assets } = await sb
      .from("ai_actor_assets")
      .select("actor_version_id, asset_type, public_url")
      .in("actor_version_id", versionIds)
      .in("asset_type", ["reference_image", "reference_headshot", "reference_full_body"]);
    for (const a of (assets || [])) {
      anchorCountMap.set(a.actor_version_id, (anchorCountMap.get(a.actor_version_id) || 0) + 1);
      if (a.public_url) {
        if (!refUrlMap.has(a.actor_version_id)) refUrlMap.set(a.actor_version_id, []);
        refUrlMap.get(a.actor_version_id)!.push(a.public_url);
      }
    }
  }

  // FALLBACK: For UNBOUND characters, resolve project_images identity anchors
  const unboundNames = characterNames.filter((n: string) => !bindMap.has(n));
  const identityAnchorMap = new Map<string, string[]>();

  if (unboundNames.length > 0) {
    const nameToOriginal = new Map<string, string>();
    for (const d of dnaRows) {
      nameToOriginal.set(d.character_name.toLowerCase().trim().replace(/\s+/g, " "), d.character_name);
    }

    const originalNames = unboundNames.map((n: string) => nameToOriginal.get(n) || n);

    const { data: identityImages } = await sb
      .from("project_images")
      .select("subject, shot_type, storage_path, storage_bucket")
      .eq("project_id", projectId)
      .eq("generation_purpose", "character_identity")
      .eq("is_primary", true)
      .eq("curation_state", "active")
      .in("shot_type", ["identity_headshot", "identity_full_body"])
      .in("subject", originalNames);

    if (identityImages?.length) {
      for (const img of identityImages) {
        const normName = img.subject.toLowerCase().trim().replace(/\s+/g, " ");
        const bucket = img.storage_bucket || "project-posters";
        const { data: signedData } = await sb.storage
          .from(bucket)
          .createSignedUrl(img.storage_path, 3600);
        if (signedData?.signedUrl) {
          if (!identityAnchorMap.has(normName)) identityAnchorMap.set(normName, []);
          identityAnchorMap.get(normName)!.push(signedData.signedUrl);
        }
      }
    }
  }

  return dnaRows.map((dna: any) => {
    const sig = dna.identity_signature as Record<string, unknown> | null;
    const locked = dna.locked_invariants as Record<string, unknown> | null;
    const parts: string[] = [];
    if (sig) {
      for (const k of ["face", "body", "silhouette", "wardrobe"]) {
        if (sig[k]) parts.push(`${k}: ${typeof sig[k] === "string" ? sig[k] : JSON.stringify(sig[k])}`);
      }
    }
    if (locked) {
      const entries = Object.entries(locked).filter(([_, v]) => v);
      if (entries.length) parts.push(`Locked: ${entries.map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("; ")}`);
    }

    const normKey = dna.character_name.toLowerCase().trim().replace(/\s+/g, " ");
    const binding = bindMap.get(normKey);

    const refUrls = binding
      ? (refUrlMap.get(binding.versionId) || [])
      : (identityAnchorMap.get(normKey) || []);

    return {
      name: dna.character_name,
      traits: parts.join(". ") || dna.character_name,
      dnaVersionId: dna.id,
      actorBound: !!binding,
      actorName: binding ? (actorNameMap.get(binding.actorId) || null) : null,
      actorVersionId: binding ? binding.versionId : null,
      anchorCount: binding ? (anchorCountMap.get(binding.versionId) || 0) : refUrls.length,
      referenceImageUrls: refUrls,
    };
  });
}

// ── Location Visual Dataset resolution ───────────────────────────────────────

interface LocationDatasetTruth {
  datasetId: string;
  locationId: string;
  locationName: string;
  structuralSubstrate: string;
  surfaceCondition: string;
  atmosphereBehavior: string;
  spatialIntent: string;
  contextualDressing: string;
  materialHierarchy: string;
  densityProfile: string;
  promptBlock: string;
}

async function resolveLocationDataset(
  sb: any,
  projectId: string,
  locationKey: string,
): Promise<LocationDatasetTruth | null> {
  // Normalize key for matching
  const normKey = locationKey.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  // Try canon_locations first
  const { data: canonLoc } = await sb
    .from("canon_locations")
    .select("id, canonical_name, description, geography, interior_or_exterior, location_type")
    .eq("project_id", projectId)
    .eq("normalized_name", normKey)
    .eq("active", true)
    .maybeSingle();

  if (!canonLoc) {
    // Fuzzy match: try partial name match
    const { data: fuzzyLoc } = await sb
      .from("canon_locations")
      .select("id, canonical_name")
      .eq("project_id", projectId)
      .eq("active", true)
      .ilike("normalized_name", `%${normKey}%`)
      .limit(1)
      .maybeSingle();
    if (!fuzzyLoc) return null;
    // Recurse with found ID
    return resolveLocationDatasetById(sb, projectId, fuzzyLoc.id, fuzzyLoc.canonical_name);
  }

  return resolveLocationDatasetById(sb, projectId, canonLoc.id, canonLoc.canonical_name, canonLoc);
}

async function resolveLocationDatasetById(
  sb: any,
  projectId: string,
  canonLocationId: string,
  locationName: string,
  canonLoc?: any,
): Promise<LocationDatasetTruth | null> {
  const { data: dataset } = await sb
    .from("location_visual_datasets")
    .select("*")
    .eq("project_id", projectId)
    .eq("canon_location_id", canonLocationId)
    .eq("is_current", true)
    .maybeSingle();

  const extractJsonLabel = (obj: any): string => {
    if (!obj || typeof obj !== 'object') return '';
    const parts: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.trim()) parts.push(`${k}: ${v}`);
      else if (Array.isArray(v)) parts.push(`${k}: ${v.filter((s: any) => typeof s === 'string').join(', ')}`);
    }
    return parts.join('. ');
  };

  const structural = dataset ? extractJsonLabel(dataset.structural_substrate) : '';
  const surface = dataset ? extractJsonLabel(dataset.surface_condition) : '';
  const atmosphere = dataset ? extractJsonLabel(dataset.atmosphere_behavior) : '';
  const spatial = dataset ? extractJsonLabel(dataset.spatial_intent) : '';
  const dressing = dataset ? extractJsonLabel(dataset.contextual_dressing) : '';
  const materials = dataset ? extractJsonLabel(dataset.material_hierarchy) : '';
  const density = dataset ? extractJsonLabel(dataset.density_profile) : '';

  // Build prompt block from PD dataset
  const promptParts: string[] = [`[LOCATION — PRODUCTION DESIGN TRUTH]`, `Location: ${locationName}`];
  if (canonLoc?.description) promptParts.push(`Description: ${canonLoc.description}`);
  if (canonLoc?.interior_or_exterior) promptParts.push(`Setting: ${canonLoc.interior_or_exterior}`);
  if (canonLoc?.geography) promptParts.push(`Geography: ${canonLoc.geography}`);
  if (structural) promptParts.push(`Structure: ${structural}`);
  if (surface) promptParts.push(`Surface: ${surface}`);
  if (atmosphere) promptParts.push(`Atmosphere: ${atmosphere}`);
  if (spatial) promptParts.push(`Spatial Intent: ${spatial}`);
  if (dressing) promptParts.push(`Dressing: ${dressing}`);
  if (materials) promptParts.push(`Materials: ${materials}`);
  if (density) promptParts.push(`Density: ${density}`);

  return {
    datasetId: dataset?.id || '',
    locationId: canonLocationId,
    locationName,
    structuralSubstrate: structural,
    surfaceCondition: surface,
    atmosphereBehavior: atmosphere,
    spatialIntent: spatial,
    contextualDressing: dressing,
    materialHierarchy: materials,
    densityProfile: density,
    promptBlock: promptParts.join('\n'),
  };
}

// ── Wardrobe State resolution ────────────────────────────────────────────────

interface WardrobeResolution {
  characterName: string;
  stateKey: string;
  promptBlock: string;
}

function resolveWardrobePromptBlocks(
  wardrobeStateMap: Record<string, string> | null,
  canonJson: Record<string, unknown> | null,
): WardrobeResolution[] {
  if (!wardrobeStateMap || Object.keys(wardrobeStateMap).length === 0) return [];

  const wardrobeProfiles = (canonJson as any)?.character_wardrobe_profiles;
  const profiles = wardrobeProfiles?.profiles || [];
  const stateMatrix = wardrobeProfiles?.state_matrix || {};

  // Resolve canonical temporal truth for garment exclusion
  const temporalTruth = resolveTemporalTruthFromCanon(canonJson as Record<string, any>);

  const results: WardrobeResolution[] = [];

  for (const [charKey, stateKey] of Object.entries(wardrobeStateMap)) {
    const normCharKey = charKey.toLowerCase().trim().replace(/\s+/g, '_');

    // Find profile for this character
    const profile = profiles.find((p: any) => {
      const profileKey = (p.character_id_or_key || p.character_name || '').toLowerCase().trim().replace(/\s+/g, '_');
      return profileKey === normCharKey || profileKey.includes(normCharKey) || normCharKey.includes(profileKey);
    });

    const parts: string[] = [];
    parts.push(`[WARDROBE — ${charKey.toUpperCase()}]`);
    parts.push(`State: ${stateKey}`);

    if (profile) {
      // IEL: Scene-explicit garments do NOT bypass temporal exclusion (parity sealed).
      // resolveEffectiveWardrobe already handles exclusion — pass scene garments
      // for provenance tracking only (contradiction_demoted diagnostics).
      const charStates = stateMatrix[normCharKey] || [];
      const stateMatch = charStates.find((s: any) => s.state_key === stateKey);
      const sceneExplicitGarments = stateMatch?.explicit_or_inferred === 'explicit'
        ? (stateMatch.garment_adjustments || [])
        : [];

      // Resolve effective wardrobe through canonical normalizer
      const effective = resolveEffectiveWardrobe(profile, temporalTruth, sceneExplicitGarments);

      if (effective.effective_identity_summary) parts.push(`Identity: ${effective.effective_identity_summary}`);
      if (profile.fabric_language) parts.push(`Fabrics: ${profile.fabric_language}`);
      if (profile.palette_logic) parts.push(`Palette: ${profile.palette_logic}`);
      if (profile.silhouette_language) parts.push(`Silhouette: ${profile.silhouette_language}`);
      if (profile.damage_wear_logic) parts.push(`Condition: ${profile.damage_wear_logic}`);
      if (effective.effective_signature_garments.length) parts.push(`Key Garments: ${effective.effective_signature_garments.join(', ')}`);

      // State-specific adjustments — filter through temporal truth to prevent
      // forbidden garments from re-entering via raw state adjustments.
      // IEL: garment_adjustments must not bypass canonical wardrobe exclusion.
      if (stateMatch) {
        const filteredGarmentAdj = (stateMatch.garment_adjustments || []).filter((g: string) => {
          const lower = g.toLowerCase().replace(/[·.\-–—()\[\]]/g, '').replace(/scene$/, '').trim();
          return !temporalTruth || !temporalTruth.forbidden_garment_families.some(
            (f: string) => f.toLowerCase() === lower
          );
        });
        if (filteredGarmentAdj.length) parts.push(`Garment Adjustments: ${filteredGarmentAdj.join(', ')}`);
        if (stateMatch.fabric_adjustments?.length) parts.push(`Fabric Adjustments: ${stateMatch.fabric_adjustments.join(', ')}`);
        if (stateMatch.grooming_adjustments?.length) parts.push(`Grooming: ${stateMatch.grooming_adjustments.join(', ')}`);
      }
    } else {
      // No profile found — state adjustments only, still filter through temporal truth
      const charStates = stateMatrix[normCharKey] || [];
      const stateMatch = charStates.find((s: any) => s.state_key === stateKey);
      if (stateMatch) {
        const filteredGarmentAdj = (stateMatch.garment_adjustments || []).filter((g: string) => {
          const lower = g.toLowerCase().replace(/[·.\-–—()\[\]]/g, '').replace(/scene$/, '').trim();
          return !temporalTruth || !temporalTruth.forbidden_garment_families.some(
            (f: string) => f.toLowerCase() === lower
          );
        });
        if (filteredGarmentAdj.length) parts.push(`Garment Adjustments: ${filteredGarmentAdj.join(', ')}`);
        if (stateMatch.fabric_adjustments?.length) parts.push(`Fabric Adjustments: ${stateMatch.fabric_adjustments.join(', ')}`);
        if (stateMatch.grooming_adjustments?.length) parts.push(`Grooming: ${stateMatch.grooming_adjustments.join(', ')}`);
      }
    }

    results.push({
      characterName: charKey,
      stateKey,
      promptBlock: parts.join('\n'),
    });
  }

  return results;
}

// ── World binding ────────────────────────────────────────────────────────────

function resolveWorldBlock(canonJson: any): string {
  if (!canonJson) return "";
  const parts: string[] = [];
  if (canonJson.era || canonJson.period) parts.push(`Era: ${canonJson.era || canonJson.period}`);
  if (canonJson.geography) parts.push(`Geography: ${canonJson.geography}`);
  if (canonJson.architecture) parts.push(`Architecture: ${canonJson.architecture}`);
  if (canonJson.costume_language || canonJson.wardrobe) parts.push(`Costume: ${canonJson.costume_language || canonJson.wardrobe}`);
  if (canonJson.technology_level) parts.push(`Technology: ${canonJson.technology_level}`);
  if (canonJson.cultural_markers || canonJson.culture) parts.push(`Culture: ${canonJson.cultural_markers || canonJson.culture}`);
  if (!parts.length) return "";
  return `[WORLD FOUNDATION]\n${parts.join("\n")}`;
}

// ── Visual Canon Primitives resolution ───────────────────────────────────────

function resolveVisualCanonBlock(canonJson: any): string {
  if (!canonJson) return "";
  const vcp = canonJson.visual_canon_primitives;
  if (!vcp || typeof vcp !== "object") return "";
  
  const parts: string[] = [];
  
  const addSystem = (key: string, label: string) => {
    const items = vcp[key];
    if (Array.isArray(items) && items.length > 0) {
      const descriptions = items
        .slice(0, 4)
        .map((item: any) => typeof item === "string" ? item : (item.label || item.name || item.description || JSON.stringify(item)))
        .filter(Boolean);
      if (descriptions.length) parts.push(`${label}: ${descriptions.join("; ")}`);
    }
  };
  
  addSystem("material_systems", "Material Language");
  addSystem("ritual_systems", "Ritual Systems");
  addSystem("communication_systems", "Communication");
  addSystem("power_systems", "Power Dynamics");
  addSystem("surface_condition_systems", "Surface Conditions");
  addSystem("recurrent_symbolic_objects", "Symbolic Objects");
  addSystem("environment_behavior_pairings", "Environment Behaviors");
  
  if (!parts.length) return "";
  return `[VISUAL CANON — PROJECT-SPECIFIC VISUAL TRUTH]\n${parts.join("\n")}`;
}

// ── Narrative Function Types ─────────────────────────────────────────────────

type NarrativeFunction =
  | 'world_setup'
  | 'protagonist_intro'
  | 'inciting_disruption'
  | 'key_relationship'
  | 'escalation_pressure'
  | 'reversal_midpoint'
  | 'collapse_loss'
  | 'confrontation'
  | 'climax_transformation'
  | 'aftermath_iconic'
  | 'ensemble_dynamic'
  | 'atmosphere_mood'
  | 'unassigned';

const NARRATIVE_FUNCTION_GUIDANCE: Record<NarrativeFunction, string> = {
  world_setup: "NARRATIVE NOTE: This frame establishes the world. Favour environmental framing.",
  protagonist_intro: "NARRATIVE NOTE: This frame introduces the protagonist in their world.",
  inciting_disruption: "NARRATIVE NOTE: This frame captures the moment of disruption.",
  key_relationship: "NARRATIVE NOTE: This frame shows the central relationship dynamic.",
  escalation_pressure: "NARRATIVE NOTE: This frame conveys rising stakes and urgency.",
  reversal_midpoint: "NARRATIVE NOTE: This frame captures a dramatic shift or revelation.",
  collapse_loss: "NARRATIVE NOTE: This frame conveys loss or consequence. Emotionally heavy.",
  confrontation: "NARRATIVE NOTE: This frame shows direct confrontation between forces.",
  climax_transformation: "NARRATIVE NOTE: This is the peak dramatic moment of the story.",
  aftermath_iconic: "NARRATIVE NOTE: This is the lingering final image — resolution or reflection.",
  ensemble_dynamic: "NARRATIVE NOTE: This frame shows the ensemble dynamic.",
  atmosphere_mood: "NARRATIVE NOTE: This is a pure atmosphere/mood frame — visual poetry.",
  unassigned: "",
};

// ── Scene Index Resolution ───────────────────────────────────────────────────

async function loadSceneIndex(sb: any, projectId: string): Promise<SceneIndexEntry[]> {
  const { data, error } = await sb
    .from("scene_index")
    .select("scene_number, title, location_key, character_keys, wardrobe_state_map")
    .eq("project_id", projectId)
    .order("scene_number");

  if (error) {
    console.error("[hero-frames] scene_index query error:", error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    scene_number: String(row.scene_number),
    title: row.title || '',
    location_key: row.location_key || '',
    character_keys: Array.isArray(row.character_keys) ? row.character_keys : [],
    wardrobe_state_map: row.wardrobe_state_map && typeof row.wardrobe_state_map === 'object'
      ? row.wardrobe_state_map as Record<string, string>
      : null,
  }));
}

// ── Scene-Level Narrative Classification ─────────────────────────────────────

function classifyNarrativeFunction(summary: string, characters: string[], index: number, total: number): NarrativeFunction {
  const s = summary.toLowerCase();
  const position = total > 1 ? index / (total - 1) : 0.5;
  
  if (/\b(discover|arriv|enter|wake|morning|begin|open)\b/.test(s) && position < 0.2) return 'world_setup';
  if (/\b(introduc|daily|routine|ordinary|normal life|status quo)\b/.test(s) && position < 0.25) return 'protagonist_intro';
  if (/\b(shock|disrupt|sudden|attack|news|letter|call|discover.*body|find.*dead|accident)\b/.test(s) && position < 0.35) return 'inciting_disruption';
  if (/\b(love|kiss|betray|trust|mentor|teach|confid|confess|togeth|bond|relationship)\b/.test(s)) return 'key_relationship';
  if (/\b(chase|pursu|hunt|race|escalat|pressure|search|investig|deadline|ticking)\b/.test(s)) return 'escalation_pressure';
  if (/\b(reveal|twist|reali[sz]|truth|betray|discover.*secret|everything.*chang)\b/.test(s) && position > 0.3 && position < 0.7) return 'reversal_midpoint';
  if (/\b(lose|lost|death|griev|fail|defeat|sacrifice|destroy|collapse|broken|abandon)\b/.test(s) && position > 0.5) return 'collapse_loss';
  if (/\b(confront|face|showdown|standoff|argue|fight|battle|duel|negotiate)\b/.test(s)) return 'confrontation';
  if (/\b(final|climax|transform|overcome|triumph|decisive|ultimate|last stand)\b/.test(s) && position > 0.7) return 'climax_transformation';
  if (/\b(after|resolve|peace|reflect|depart|sunset|ending|epilogue|return|home)\b/.test(s) && position > 0.8) return 'aftermath_iconic';
  if (characters.length >= 3) return 'ensemble_dynamic';
  
  if (position < 0.15) return 'world_setup';
  if (position < 0.3) return 'protagonist_intro';
  if (position > 0.85) return 'aftermath_iconic';
  if (position > 0.7) return 'climax_transformation';
  
  return 'unassigned';
}

function scoreDramaticIntensity(summary: string, characters: string[], content: string): number {
  let score = 20;
  const s = (summary + " " + content).toLowerCase();
  
  score += Math.min(characters.length * 8, 24);
  
  const dramaticPatterns = [
    /\b(confront|showdown|climax|reveal|betray|sacrifice|death|kill|murder|escape|rescue)\b/,
    /\b(desperate|rage|fury|terror|grief|ecstasy|shock|stunned|devastat)\b/,
    /\b(gun|knife|blood|fire|explosion|crash|scream|cry|sob|tears)\b/,
    /\b(secret|lie|truth|confess|admit|discover|realize)\b/,
    /\b(kiss|embrace|slap|punch|grab|flee|chase|run)\b/,
  ];
  for (const p of dramaticPatterns) {
    if (p.test(s)) score += 10;
  }
  
  if (summary.length > 100) score += 8;
  if (summary.length > 200) score += 5;
  if (content.length > 300) score += 8;
  
  if (/\b(rain|storm|night|dawn|sunset|fog|smoke|shadow|light|fire|water|mirror)\b/.test(s)) score += 6;
  
  if (/\b(walks to|goes to|arrives at|enters|exits|leaves)\b/.test(s) && summary.length < 60) score -= 15;
  if (/\b(later|meanwhile|next day|time passes)\b/.test(s)) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

// ── Scene Moment Loading (enriched from scene_graph for content) ─────────────

interface SceneBoundMoment {
  sceneNumber: string;
  title: string;
  locationKey: string;
  characterKeys: string[];
  wardrobeStateMap: Record<string, string> | null;
  slugline: string;
  summary: string;
  content: string;
  timeOfDay: string;
  narrativeFunction: NarrativeFunction;
  dramaticIntensity: number;
  locationDataset: LocationDatasetTruth | null;
  wardrobeBlocks: WardrobeResolution[];
}

async function loadSceneBoundMoments(
  sb: any,
  projectId: string,
  canonJson: Record<string, unknown> | null,
  targetCount: number = 13,
): Promise<SceneBoundMoment[]> {
  // 1. Load scene_index as single source of truth
  const sceneEntries = await loadSceneIndex(sb, projectId);
  if (!sceneEntries.length) {
    console.warn("[HERO_SCENE_BOUND] scene_index is empty — no hero frames can be generated");
    return [];
  }

  // 2. Enrich with scene_graph content for prompt depth
  const { data: scenes } = await sb
    .from("scene_graph_scenes")
    .select("id, scene_key")
    .eq("project_id", projectId)
    .is("deprecated_at", null)
    .limit(200);

  const sceneContentMap = new Map<string, { slugline: string; summary: string; content: string; timeOfDay: string; characters: string[] }>();
  
  if (scenes?.length) {
    const { data: versions } = await sb
      .from("scene_graph_versions")
      .select("scene_id, slugline, summary, content, time_of_day, characters_present, version_number")
      .eq("project_id", projectId)
      .in("scene_id", scenes.map((s: any) => s.id))
      .order("version_number", { ascending: false });

    if (versions?.length) {
      const seen = new Set<string>();
      for (const v of versions) {
        if (seen.has(v.scene_id)) continue;
        seen.add(v.scene_id);
        const sceneRow = scenes.find((s: any) => s.id === v.scene_id);
        if (sceneRow) {
          sceneContentMap.set(sceneRow.scene_key, {
            slugline: v.slugline || '',
            summary: v.summary || '',
            content: (v.content || '').slice(0, 600),
            timeOfDay: v.time_of_day || '',
            characters: Array.isArray(v.characters_present) ? v.characters_present : [],
          });
        }
      }
    }
  }

  // 3. Resolve PD location datasets for each unique location_key
  const uniqueLocationKeys = [...new Set(sceneEntries.map(e => e.location_key).filter(Boolean))];
  const locationDatasetMap = new Map<string, LocationDatasetTruth | null>();
  
  for (const key of uniqueLocationKeys) {
    const dataset = await resolveLocationDataset(sb, projectId, key);
    locationDatasetMap.set(key, dataset);
  }

  // 4. Build scene-bound moments
  const total = sceneEntries.length;
  const allMoments: SceneBoundMoment[] = sceneEntries.map((entry, idx) => {
    const sceneContent = sceneContentMap.get(entry.scene_number) || null;
    const summary = sceneContent?.summary || entry.title || '';
    const chars = entry.character_keys.length > 0 ? entry.character_keys : (sceneContent?.characters || []);
    const content = sceneContent?.content || '';

    const wardrobeBlocks = resolveWardrobePromptBlocks(entry.wardrobe_state_map, canonJson);

    return {
      sceneNumber: entry.scene_number,
      title: entry.title,
      locationKey: entry.location_key,
      characterKeys: chars,
      wardrobeStateMap: entry.wardrobe_state_map,
      slugline: sceneContent?.slugline || '',
      summary,
      content,
      timeOfDay: sceneContent?.timeOfDay || '',
      narrativeFunction: classifyNarrativeFunction(summary, chars, idx, total),
      dramaticIntensity: scoreDramaticIntensity(summary, chars, content),
      locationDataset: locationDatasetMap.get(entry.location_key) || null,
      wardrobeBlocks,
    };
  });

  // 5. Select best moments by dramatic intensity, ensuring narrative coverage
  const sortedByIntensity = [...allMoments].sort((a, b) => b.dramaticIntensity - a.dramaticIntensity);

  const functionPriority: NarrativeFunction[] = [
    'world_setup', 'protagonist_intro', 'inciting_disruption', 'key_relationship',
    'escalation_pressure', 'reversal_midpoint', 'collapse_loss', 'confrontation',
    'climax_transformation', 'aftermath_iconic', 'ensemble_dynamic', 'atmosphere_mood',
  ];

  const selected: SceneBoundMoment[] = [];
  const usedScenes = new Set<string>();

  // Phase 1: Best candidate per narrative function (only if scene is strong enough)
  for (const fn of functionPriority) {
    if (selected.length >= targetCount) break;
    const candidate = sortedByIntensity.find(m => m.narrativeFunction === fn && !usedScenes.has(m.sceneNumber));
    if (candidate) {
      selected.push(candidate);
      usedScenes.add(candidate.sceneNumber);
    }
  }

  // Phase 2: Fill remaining with strongest unused scenes — but ONLY if they
  // have meaningful dramatic intensity. Do NOT force-fill weak scenes.
  const MIN_FILLER_INTENSITY = 25;
  for (const m of sortedByIntensity) {
    if (selected.length >= targetCount) break;
    if (!usedScenes.has(m.sceneNumber) && m.dramaticIntensity >= MIN_FILLER_INTENSITY) {
      selected.push(m);
      usedScenes.add(m.sceneNumber);
    }
  }

  if (selected.length < targetCount) {
    console.log(`[HERO_SCENE_BOUND] Returning ${selected.length}/${targetCount} — insufficient hero-worthy moments (remaining scenes below intensity threshold ${MIN_FILLER_INTENSITY})`);
  }

  console.log(`[HERO_SCENE_BOUND] Selected ${selected.length} scene-bound moments: ${selected.map(m => `${m.sceneNumber}:${m.narrativeFunction}(${m.dramaticIntensity})`).join(', ')}`);
  return selected;
}

// ── Hero-Worthiness Gate ─────────────────────────────────────────────────────

interface HeroWorthinessResult {
  worthy: boolean;
  score: number;
  reasons: string[];
}

function assessHeroWorthiness(
  moment: SceneBoundMoment,
  characters: CharacterTruth[],
  canonJson: Record<string, unknown> | null,
): HeroWorthinessResult {
  const reasons: string[] = [];
  let score = 0;

  // 1. Scene grounding (mandatory — from scene_index)
  if (moment.sceneNumber) {
    score += 15;
    reasons.push("scene_index_bound");
  }

  // 2. Scene evidence
  if (moment.summary && moment.summary.length > 30) {
    score += 10;
    reasons.push("scene_summary_present");
  }
  if (moment.content && moment.content.length > 50) {
    score += 5;
    reasons.push("scene_content_available");
  }
  score += Math.min(moment.dramaticIntensity * 0.1, 10);
  if (moment.dramaticIntensity >= 40) reasons.push("high_dramatic_intensity");

  // 3. Location grounding (from PD)
  if (moment.locationKey) {
    score += 5;
    reasons.push("location_key_present");
  }
  if (moment.locationDataset) {
    score += 10;
    reasons.push("pd_location_dataset_bound");
  }

  // 4. Character binding
  if (moment.characterKeys.length > 0) {
    const momentCharNorm = moment.characterKeys.map(c => c.toLowerCase().trim().replace(/\s+/g, " "));
    const boundToThis = characters.filter(c => {
      const normName = c.name.toLowerCase().trim().replace(/\s+/g, " ");
      return momentCharNorm.includes(normName) && c.referenceImageUrls.length > 0;
    });
    if (boundToThis.length > 0) {
      score += 10 + Math.min(boundToThis.length * 5, 10);
      reasons.push(`${boundToThis.length}_characters_with_anchors`);
    }
  }

  // 5. Wardrobe binding
  if (moment.wardrobeBlocks.length > 0) {
    score += 5;
    reasons.push("wardrobe_states_resolved");
  }

  // 6. Canon truth
  if (canonJson) {
    if (canonJson.logline) score += 3;
    if (canonJson.world_rules || canonJson.timeline) score += 3;
    if (canonJson.visual_canon_primitives) score += 4;
    reasons.push("canon_truth_available");
  }

  // 7. Atmosphere/world slots bonus
  if (moment.narrativeFunction === 'atmosphere_mood' || moment.narrativeFunction === 'world_setup') {
    score += 5;
    reasons.push("environment_slot_bonus");
  }

  const HERO_WORTHY_THRESHOLD = 30;

  return {
    worthy: score >= HERO_WORTHY_THRESHOLD,
    score,
    reasons,
  };
}

// ── Prompt builder — SCENE-BOUND PREMIUM ─────────────────────────────────────

function buildHeroFramePrompt(
  projectTitle: string,
  projectLogline: string,
  canonJson: Record<string, unknown> | null,
  characters: CharacterTruth[],
  worldBlock: string,
  visualCanonBlock: string,
  styleBlock: string | null,
  moment: SceneBoundMoment,
): string {
  const lines: string[] = [];

  // ── A. CANON TRUTH ──
  lines.push(`CINEMATIC HERO STILL for "${projectTitle}"`);
  lines.push("");
  
  if (projectLogline) {
    lines.push(`STORY: ${projectLogline}`);
    lines.push("");
  }
  
  if (canonJson?.premise) {
    lines.push(`PREMISE: ${String(canonJson.premise).slice(0, 400)}`);
    lines.push("");
  }

  if (worldBlock) {
    lines.push(worldBlock);
    lines.push("");
  }

  if (canonJson?.tone_style) {
    lines.push(`[TONE & STYLE — FROM PROJECT CANON]`);
    lines.push(String(canonJson.tone_style).slice(0, 300));
    lines.push("");
  }

  // ── B. LOCATION — FROM PRODUCTION DESIGN ──
  if (moment.locationDataset) {
    lines.push(moment.locationDataset.promptBlock);
    lines.push("");
  } else if (moment.locationKey) {
    lines.push(`[LOCATION — SCENE BOUND]`);
    lines.push(`Location: ${moment.locationKey}`);
    lines.push("");
  }

  // ── C. CHARACTER IDENTITY ANCHORS ──
  const momentCharNorm = moment.characterKeys.map(c => c.toLowerCase().trim().replace(/\s+/g, " "));
  const relevantCharacters = momentCharNorm.length > 0
    ? characters.filter(c => momentCharNorm.includes(c.name.toLowerCase().trim().replace(/\s+/g, " ")))
    : [];

  if (relevantCharacters.length > 0) {
    lines.push("[CHARACTER IDENTITY — ANCHOR-CONDITIONED]");
    lines.push("Character identity is conditioned on the attached reference anchors. Maintain strong visual consistency with these references for facial features, bone structure, skin tone, age, ethnicity, body type, and hair.");
    lines.push("");
    
    for (const c of relevantCharacters) {
      lines.push(`${c.name}: ${c.traits}`);
      if (c.referenceImageUrls.length > 0) {
        lines.push(`  → ANCHORS INJECTED (${c.referenceImageUrls.length} refs, source: ${c.actorBound ? 'actor_assets' : 'identity_anchors'}): Use these reference images as the primary visual guide for this character's appearance.`);
      } else {
        lines.push(`  → NO ANCHORS AVAILABLE: Render based on textual description only. Identity conditioning is descriptive, not visually anchored.`);
      }
    }
    lines.push("");
    lines.push("IDENTITY CONDITIONING RULES:");
    lines.push("- Characters should be visually consistent with attached reference anchors across all hero frames");
    lines.push("- Maintain coherent facial features, age presentation, and body type");
    lines.push("- Reference images are the strongest identity signal when available");
    lines.push("");
  }

  // ── D. WARDROBE — FROM SCENE STATE MAP ──
  if (moment.wardrobeBlocks.length > 0) {
    for (const wb of moment.wardrobeBlocks) {
      lines.push(wb.promptBlock);
      lines.push("");
    }
  }

  // ── E. VISUAL CANON ──
  if (visualCanonBlock) {
    lines.push(visualCanonBlock);
    lines.push("");
  }
  
  if (styleBlock) {
    lines.push("[VISUAL STYLE AUTHORITY]");
    lines.push(styleBlock);
    lines.push("");
  }

  // ── F. SCENE GROUNDING ──
  lines.push("[SCENE GROUNDING — SPECIFIC MOMENT FROM THE STORY]");
  lines.push(`Scene: ${moment.sceneNumber}`);
  if (moment.slugline) lines.push(`SCENE: ${moment.slugline}`);
  if (moment.title) lines.push(`SCENE TITLE: ${moment.title}`);
  lines.push(`WHAT IS HAPPENING: ${moment.summary}`);
  if (moment.content) {
    const contentSnippet = moment.content.slice(0, 400).trim();
    if (contentSnippet.length > 30) {
      lines.push(`SCENE DETAIL: ${contentSnippet}`);
    }
  }
  if (moment.characterKeys.length > 0) lines.push(`WHO IS PRESENT: ${moment.characterKeys.join(", ")}`);
  if (moment.locationKey) lines.push(`WHERE: ${moment.locationKey}`);
  if (moment.timeOfDay) lines.push(`TIME OF DAY: ${moment.timeOfDay}`);
  lines.push("Capture this as a real moment — the camera was THERE, capturing this exact beat.");
  lines.push("");

  // ── G. NARRATIVE FUNCTION GUIDANCE ──
  if (moment.narrativeFunction !== 'unassigned') {
    const guidance = NARRATIVE_FUNCTION_GUIDANCE[moment.narrativeFunction];
    if (guidance) {
      lines.push(guidance);
      lines.push("");
    }
  }

  // ── HERO FRAME MANDATE ──
  lines.push("[HERO FRAME MANDATE]");
  lines.push("This is a PREMIUM CINEMATIC HERO STILL — one of the most powerful, emotionally potent frames from this production.");
  lines.push("This image must feel like it belongs on a theatrical poster, a festival jury screener, or a prestige streaming banner.");
  lines.push("");
  lines.push("COMPOSITION: Wide or medium-wide landscape composition. Cinematic 16:9 or 2.39:1 framing.");
  lines.push("CAMERA: ARRI Alexa or RED Monstro. Premium anamorphic lenses. 35mm or 65mm equivalent.");
  lines.push("LIGHTING: Natural or motivated cinematic lighting. Depth through shadow and highlight separation.");
  lines.push("REALISM: This must look like a photograph taken on a real film set with real actors in real locations.");
  lines.push("EMOTION: This single frame must communicate the emotional weight and dramatic stakes of the scene.");
  lines.push("");
  lines.push(PHOTOREAL_DIRECTIVES);
  lines.push("");
  lines.push("ABSOLUTE PROHIBITIONS:");
  lines.push("- No portrait/vertical orientation");
  lines.push("- No text, titles, typography, or watermarks");
  lines.push("- No collage, grid, or multi-image composite");
  lines.push("- No illustration, concept art, or stylized render");
  lines.push("- No poster layout or marketing composition");
  lines.push("- No CGI, 3D render, or Unreal Engine aesthetic");
  lines.push("- No generic stock-photo aesthetics");
  lines.push("- No generic or ungrounded environments — MUST match the specific Production Design location");
  lines.push(`- NEGATIVE: ${PHOTOREAL_NEGATIVES}`);

  return lines.join("\n");
}

// ── Image generation helpers ─────────────────────────────────────────────────

function extractImageDataUrl(result: any): string | null {
  try {
    const choice = result?.choices?.[0]?.message;
    if (!choice) return null;
    const imgUrl = choice.images?.[0]?.image_url?.url;
    if (imgUrl?.startsWith("data:image")) return imgUrl;
    if (Array.isArray(choice.content)) {
      for (const part of choice.content) {
        if (part.type === "image_url" && part.image_url?.url?.startsWith("data:image")) return part.image_url.url;
        if (part.type === "image" && part.image?.url?.startsWith("data:image")) return part.image.url;
        if (part.inline_data?.data) return `data:${part.inline_data.mime_type || "image/png"};base64,${part.inline_data.data}`;
        if (typeof part === "string" && part.startsWith("data:image")) return part;
        if (typeof part.text === "string" && part.text.startsWith("data:image")) return part.text;
      }
    }
    if (typeof choice.content === "string" && choice.content.startsWith("data:image")) return choice.content;
  } catch (_) { /* noop */ }
  return null;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("Invalid data URL");
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function measureImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    if (bytes.length < 24) return null;
    const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    if (w > 0 && h > 0 && w < 20000 && h < 20000) return { width: w, height: h };
  }
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    let off = 2;
    while (off < bytes.length - 8) {
      if (bytes[off] !== 0xFF) { off++; continue; }
      const m = bytes[off + 1];
      if (m === 0xC0 || m === 0xC2) {
        const h = (bytes[off + 5] << 8) | bytes[off + 6];
        const w = (bytes[off + 7] << 8) | bytes[off + 8];
        if (w > 0 && h > 0) return { width: w, height: h };
      }
      off += 2 + ((bytes[off + 2] << 8) | bytes[off + 3]);
    }
  }
  return null;
}

function detectFormat(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return "jpeg";
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return "webp";
  return "png";
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, count = 4, slot_index, target_narrative_function } = await req.json();
    if (!project_id) throw new Error("project_id is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) throw new Error("Server configuration error");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || supabaseKey;
    const { data: { user }, error: authErr } = await createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    }).auth.getUser();
    if (authErr || !user) throw new Error("Not authenticated");

    // ── Resolve all canonical inputs in parallel ──
    const [projectRow, canonRow, characters, styleRes] = await Promise.all([
      supabase.from("projects").select("title, format, genres").eq("id", project_id).single(),
      supabase.from("project_canon").select("canon_json").eq("project_id", project_id).maybeSingle(),
      resolveCharacterTruth(supabase, project_id),
      resolveVisualStyleProfile(supabase, project_id),
    ]);

    if (projectRow.error) {
      console.error("[hero-frames] Project query error:", projectRow.error.message);
    }
    const project = projectRow.data;
    if (!project) throw new Error("Project not found: " + (projectRow.error?.message || "no data returned"));

    const canonJson = (canonRow?.data?.canon_json ?? null) as Record<string, unknown> | null;

    const worldBlock = resolveWorldBlock(canonJson);
    const visualCanonBlock = resolveVisualCanonBlock(canonJson);
    const styleBlock = styleRes.promptBlock || null;

    const title = project.title || "Untitled Project";
    const logline = (canonJson as any)?.logline || "";

    // ── IEL GUARD: SCENE INDEX REQUIRED ──
    const moments = await loadSceneBoundMoments(supabase, project_id, canonJson);

    if (moments.length === 0) {
      console.error("[HERO_SCENE_BOUND_REQUIRED] No scene_index data available for project", project_id);
      return new Response(JSON.stringify({
        error: "[HERO_SCENE_BOUND_REQUIRED] Missing scene grounding. Hero Frames require scene_index to be populated with location_key, character_keys, and wardrobe_state_map. Run script intake pipeline first.",
        code: "HERO_SCENE_BOUND_REQUIRED",
        results: [],
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolver config — use premium for hero frames
    const resolverInput = {
      role: "poster_primary" as const,
      styleMode: "photorealistic_cinematic" as const,
      qualityTarget: "premium" as const,
    };
    const genConfig = resolveImageGenerationConfig(resolverInput);
    const repoMeta = buildImageRepositoryMeta(genConfig, resolverInput);

    const effectiveCount = Math.min(Math.max(count, 1), 16);
    const results: Array<{ image_id: string; status: string; error?: string; diagnostics?: Record<string, unknown> }> = [];

    const GATEWAY_URL = genConfig.gatewayUrl;
    const MODEL = genConfig.model;

    // ── IDENTITY AUDIT LOG ──
    const boundCharacters = characters.filter(c => c.actorBound);
    const unboundCharacters = characters.filter(c => !c.actorBound);
    const unboundWithAnchors = unboundCharacters.filter(c => c.referenceImageUrls.length > 0);
    const totalRefImages = characters.reduce((sum, c) => sum + c.referenceImageUrls.length, 0);
    console.log(`[HERO_SCENE_BOUND] Identity audit:`, JSON.stringify({
      totalCharacters: characters.length,
      boundCount: boundCharacters.length,
      unboundWithAnchorsCount: unboundWithAnchors.length,
      totalReferenceImages: totalRefImages,
      sceneMomentsAvailable: moments.length,
    }));

    const WIDTH = 1344;
    const HEIGHT = 768;

    for (let i = 0; i < effectiveCount; i++) {
      const effectiveSlotIndex = typeof slot_index === 'number' ? slot_index : i;
      const moment = moments[effectiveSlotIndex % moments.length];
      
      // Override narrative function if requested
      if (target_narrative_function) {
        (moment as any).narrativeFunction = target_narrative_function as NarrativeFunction;
      }

      // ── IEL GUARD: Per-slot scene grounding validation ──
      if (!moment.sceneNumber) {
        console.error(`[HERO_SCENE_BOUND_REQUIRED] Slot ${effectiveSlotIndex}: missing scene_number`);
        results.push({
          image_id: "",
          status: "rejected",
          error: "[HERO_SCENE_BOUND_REQUIRED] Slot missing scene_number",
          diagnostics: { slot_index: effectiveSlotIndex, guard: "scene_bound" },
        });
        continue;
      }

      if (!moment.locationKey) {
        console.error(`[HERO_SCENE_BOUND_REQUIRED] Slot ${effectiveSlotIndex}: missing location_key for scene ${moment.sceneNumber}`);
        results.push({
          image_id: "",
          status: "rejected",
          error: "[HERO_SCENE_BOUND_REQUIRED] Slot missing location_key",
          diagnostics: { slot_index: effectiveSlotIndex, scene_number: moment.sceneNumber, guard: "location_bound" },
        });
        continue;
      }

      // ── HERO-WORTHINESS GATE ──
      const worthiness = assessHeroWorthiness(moment, characters, canonJson);

      const slotDiagnostics: Record<string, unknown> = {
        slot_index: effectiveSlotIndex,
        scene_number: moment.sceneNumber,
        location_key: moment.locationKey,
        location_dataset_id: moment.locationDataset?.datasetId || null,
        location_dataset_bound: !!moment.locationDataset,
        character_keys: moment.characterKeys,
        wardrobe_state_map: moment.wardrobeStateMap,
        wardrobe_blocks_count: moment.wardrobeBlocks.length,
        narrative_function: moment.narrativeFunction,
        dramatic_intensity: moment.dramaticIntensity,
        hero_worthiness_score: worthiness.score,
        hero_worthiness_reasons: worthiness.reasons,
        anchor_refs_injected_count: 0,
        canon_evidence_sources: [] as string[],
        generation_status: 'pending',
      };

      // Build canon evidence list
      const canonEvidence: string[] = [];
      if (logline) canonEvidence.push("logline");
      if (canonJson?.premise) canonEvidence.push("premise");
      if (worldBlock) canonEvidence.push("world_block");
      if (visualCanonBlock) canonEvidence.push("visual_canon_primitives");
      if (styleBlock) canonEvidence.push("visual_style_profile");
      if (canonJson?.tone_style) canonEvidence.push("tone_style");
      if (moment.locationDataset) canonEvidence.push("pd_location_dataset");
      if (moment.wardrobeBlocks.length > 0) canonEvidence.push("wardrobe_states");
      slotDiagnostics.canon_evidence_sources = canonEvidence;

      if (!worthiness.worthy) {
        console.warn(`[HERO_SCENE_BOUND] Slot ${effectiveSlotIndex} DEFERRED: hero-worthiness ${worthiness.score}/100 (threshold 30)`);
        slotDiagnostics.generation_status = 'deferred';
        results.push({
          image_id: "",
          status: "deferred",
          error: `Under-supported slot (worthiness: ${worthiness.score}/100)`,
          diagnostics: slotDiagnostics,
        });
        continue;
      }

      const prompt = buildHeroFramePrompt(
        title, logline, canonJson, characters, worldBlock, visualCanonBlock, styleBlock, moment
      );

      console.log(`[HERO_SCENE_BOUND] Generating frame ${i + 1}/${effectiveCount}, scene=${moment.sceneNumber}, location=${moment.locationKey}, model=${MODEL}, worthiness=${worthiness.score}`);

      try {
        // Build content: text prompt + character reference images
        const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
          { type: "text", text: prompt },
        ];
        
        // Inject relevant character anchors (only for characters in THIS scene)
        const momentCharNorm = moment.characterKeys.map(c => c.toLowerCase().trim().replace(/\s+/g, " "));
        const allRefUrls: string[] = [];
        const anchorInjectionLog: Array<{ name: string; count: number; source: string }> = [];
        
        for (const c of characters) {
          if (c.referenceImageUrls.length > 0) {
            const normName = c.name.toLowerCase().trim().replace(/\s+/g, " ");
            // Only inject anchors for characters present in this scene
            if (momentCharNorm.length === 0 || momentCharNorm.includes(normName)) {
              const refs = c.referenceImageUrls.slice(0, 2);
              for (const url of refs) {
                content.push({ type: "image_url", image_url: { url } });
                allRefUrls.push(url);
              }
              anchorInjectionLog.push({
                name: c.name,
                count: refs.length,
                source: c.actorBound ? 'actor_assets' : 'identity_anchors',
              });
            }
          }
        }
        
        slotDiagnostics.anchor_refs_injected_count = allRefUrls.length;
        slotDiagnostics.anchor_injection_detail = anchorInjectionLog;

        if (allRefUrls.length > 0) {
          console.log(`[HERO_SCENE_BOUND] Frame ${i}: injecting ${allRefUrls.length} reference images for scene ${moment.sceneNumber}`);
        }

        const resp = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: "user", content }],
            modalities: ["image", "text"],
            image_size: { width: WIDTH, height: HEIGHT },
          }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          if (resp.status === 429) throw new Error("RATE_LIMIT: " + errText);
          if (resp.status === 402) throw new Error("CREDITS_EXHAUSTED: " + errText);
          throw new Error(`AI gateway [${resp.status}]: ${errText.slice(0, 300)}`);
        }

        const genResult = await resp.json();
        const imageDataUrl = extractImageDataUrl(genResult);
        if (!imageDataUrl) throw new Error("No image returned from AI gateway");

        const rawBytes = dataUrlToBytes(imageDataUrl);
        const format = detectFormat(rawBytes);
        const dims = measureImageDimensions(rawBytes);

        // Orientation gate
        if (dims) {
          const aspectRatio = dims.width / dims.height;
          if (aspectRatio < 1.2) {
            console.warn(`[HERO_SCENE_BOUND] Frame ${i} rejected: aspect ratio ${aspectRatio.toFixed(2)} — not landscape`);
            slotDiagnostics.generation_status = 'rejected_orientation';
            results.push({
              image_id: "",
              status: "rejected_orientation",
              error: `Non-landscape output (${dims.width}×${dims.height})`,
              diagnostics: slotDiagnostics,
            });
            continue;
          }
        }

        const storagePath = `${project_id}/hero-frames/${Date.now()}-frame-${i}.${format}`;
        const { error: uploadErr } = await supabase.storage
          .from("project-posters")
          .upload(storagePath, new Blob([rawBytes], { type: `image/${format}` }), {
            contentType: `image/${format}`,
            upsert: true,
          });
        if (uploadErr) throw new Error(`Storage upload: ${uploadErr.message}`);

        slotDiagnostics.generation_status = 'ready';

        // ── Quality Gate with scene_grounding dimension ──
        const gateResult = computeEdgeQualityGate({
          width: dims?.width ?? null,
          height: dims?.height ?? null,
          model: genConfig.model,
          provider: genConfig.provider,
          prompt_used: prompt,
          subject_type: moment.characterKeys.length > 0 ? 'character' : 'environment',
          asset_group: 'hero_frame',
          shot_type: 'wide',
          location_ref: moment.locationKey,
          generation_config: {
            identity_mode: allRefUrls.length > 0 ? "anchors_injected" : "descriptive_only",
            identity_evidence_count: allRefUrls.length,
            identity_source: allRefUrls.length > 0
              ? (anchorInjectionLog.some(a => a.source === 'actor_assets') ? 'actor_assets' : 'identity_anchors')
              : 'none',
            identity_locked: allRefUrls.length > 0,
            source_feature: "hero_frames_engine",
            scene_number: moment.sceneNumber,
            location_key: moment.locationKey,
            location_dataset_id: moment.locationDataset?.datasetId || null,
            pd_bound: !!moment.locationDataset,
          },
        });
        console.log(`[HERO_SCENE_BOUND] Frame ${i} quality gate:`, JSON.stringify(gateResult));

        const { data: imgRecord, error: insertErr } = await supabase
          .from("project_images")
          .insert({
            project_id,
            role: "hero_variant",
            ...gateResult,
            entity_id: null,
            strategy_key: "hero_frames",
            prompt_used: prompt,
            negative_prompt: PHOTOREAL_NEGATIVES,
            canon_constraints: { source_feature: "hero_frames_engine" },
            storage_path: storagePath,
            storage_bucket: "project-posters",
            width: dims?.width ?? null,
            height: dims?.height ?? null,
            is_primary: false,
            is_active: true,
            source_poster_id: null,
            user_id: user.id,
            created_by: user.id,
            provider: genConfig.provider,
            model: genConfig.model,
            style_mode: "photorealistic_cinematic",
            generation_config: {
              ...repoMeta,
              source_feature: "hero_frames_engine",
              variant_index: i,
              frame_count: effectiveCount,
              landscape_enforced: true,
              requested_width: WIDTH,
              requested_height: HEIGHT,
              actual_width: dims?.width ?? null,
              actual_height: dims?.height ?? null,
              // Scene binding — MANDATORY
              scene_number: moment.sceneNumber,
              location_key: moment.locationKey,
              location_dataset_id: moment.locationDataset?.datasetId || null,
              pd_bound: !!moment.locationDataset,
              character_keys: moment.characterKeys,
              wardrobe_state_map: moment.wardrobeStateMap,
              // Identity — honest provenance
              identity_mode: allRefUrls.length > 0 ? "anchors_injected" : "descriptive_only",
              identity_locked: allRefUrls.length > 0,
              identity_evidence_count: allRefUrls.length,
              identity_source: allRefUrls.length > 0
                ? (anchorInjectionLog.some(a => a.source === 'actor_assets') ? 'actor_assets' : 'identity_anchors')
                : 'none',
              character_count: moment.characterKeys.length,
              characters_bound: anchorInjectionLog,
              reference_images_total: allRefUrls.length,
              // Narrative
              narrative_function: moment.narrativeFunction,
              dramatic_intensity: moment.dramaticIntensity,
              hero_worthiness_score: worthiness.score,
              hero_worthiness_reasons: worthiness.reasons,
              canon_evidence_count: canonEvidence.length,
              prompt_priority_order: "canon_truth > pd_location > character_anchors > wardrobe > visual_canon > scene_evidence > narrative_guidance",
            },
            asset_group: "hero_frame",
            subject: moment.characterKeys.length > 0 ? moment.characterKeys[0] : null,
            shot_type: 'wide',
            curation_state: "candidate",
            subject_type: moment.characterKeys.length > 0 ? 'character' : 'environment',
            subject_ref: null,
            generation_purpose: "hero_frame",
            lane_key: "feature_film",
            prestige_style: "natural_prestige",
            location_ref: moment.locationKey,
            moment_ref: moment.sceneNumber,
          })
          .select("id")
          .single();

        if (insertErr) {
          console.error(`[HERO_SCENE_BOUND] Insert error frame ${i}:`, insertErr.message);
          results.push({ image_id: "", status: "stored_no_repo", error: insertErr.message, diagnostics: slotDiagnostics });
        } else {
          console.log(`[HERO_SCENE_BOUND] Frame ${i} stored: ${imgRecord.id} (scene=${moment.sceneNumber}, location=${moment.locationKey}, worthiness=${worthiness.score})`);
          results.push({ image_id: imgRecord.id, status: "ready", diagnostics: slotDiagnostics });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[HERO_SCENE_BOUND] Frame ${i} failed:`, msg);
        slotDiagnostics.generation_status = 'failed';
        results.push({ image_id: "", status: "failed", error: msg, diagnostics: slotDiagnostics });
      }
    }

    return new Response(JSON.stringify({
      results,
      meta: {
        scene_bound: true,
        scene_moments_used: moments.length,
        characters_total: characters.length,
        characters_actor_bound: boundCharacters.length,
        identity_mode: "scene_bound_anchor_conditioned",
        reference_images_available: totalRefImages,
        style_resolved: !!styleBlock,
        visual_canon_resolved: !!visualCanonBlock,
        model: MODEL,
        prompt_priority: "canon_truth > pd_location > character_anchors > wardrobe > visual_canon > scene_evidence > narrative_guidance",
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[HERO_SCENE_BOUND] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
