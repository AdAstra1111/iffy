import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Classification Patterns (mirrors locationDatasetBuilder.ts) ──────────────

const WORKSHOP_KEYWORDS = ['workshop', 'studio', 'forge', 'smithy', 'kiln', 'atelier', 'workroom', 'foundry', 'pottery'];
const STORAGE_KEYWORDS = ['storage', 'storeroom', 'cellar', 'warehouse', 'pantry', 'larder', 'granary'];
const PASSAGE_KEYWORDS = ['corridor', 'hallway', 'passage', 'bridge', 'path', 'gate', 'entrance'];
const COURTYARD_KEYWORDS = ['courtyard', 'garden', 'yard', 'plaza', 'square'];

const STRUCTURAL_TERMS: Record<string, string[]> = {
  wood: ['timber', 'wooden', 'cedar', 'cypress', 'oak', 'pine', 'bamboo', 'planks', 'beams', 'rafters'],
  stone: ['stone', 'granite', 'limestone', 'cobble', 'rock', 'boulder', 'flagstone', 'masonry'],
  earth: ['earth', 'mud', 'adobe', 'clay', 'earthen', 'packed earth', 'rammed earth'],
  plaster: ['plaster', 'stucco', 'whitewash', 'lime', 'rendered'],
  metal: ['iron', 'steel', 'copper', 'bronze', 'metal', 'wrought iron'],
  thatch: ['thatch', 'straw', 'reed', 'grass roof'],
};

const STATUS_PATTERNS: Array<{ signal: string; keywords: string[] }> = [
  { signal: 'wealth through scale', keywords: ['grand', 'vast', 'towering', 'imposing', 'monumental', 'expansive'] },
  { signal: 'wealth through finish', keywords: ['polished', 'lacquered', 'gilded', 'inlaid', 'carved', 'ornate', 'refined'] },
  { signal: 'wealth through order', keywords: ['meticulous', 'pristine', 'immaculate', 'ordered', 'symmetrical', 'formal'] },
  { signal: 'poverty through wear', keywords: ['worn', 'patched', 'crumbling', 'decaying', 'dilapidated', 'shabby'] },
  { signal: 'poverty through sparseness', keywords: ['sparse', 'bare', 'empty', 'austere', 'humble', 'simple', 'plain'] },
  { signal: 'power through restraint', keywords: ['restrained', 'understated', 'severe', 'disciplined', 'minimal', 'stark'] },
];

const ATMOSPHERE_TERMS = [
  'misty', 'foggy', 'hazy', 'smoky', 'steamy', 'dusty',
  'golden', 'warm light', 'cool light', 'harsh', 'soft light', 'dappled',
  'dawn', 'dusk', 'twilight', 'moonlit', 'candlelit', 'lantern',
  'overcast', 'stormy', 'rain', 'snow', 'wind', 'humid',
];

// ── Socio-Economic Hierarchy (mirrors locationHierarchy.ts) ──────────────────

const IMPERIAL_KEYWORDS = [
  'castle', 'palace', 'throne', 'imperial', 'royal', 'emperor', 'shogun',
  'daimyo', 'court', 'fortress', 'citadel', 'keep', 'stronghold',
];
const ELITE_KEYWORDS = [
  'estate', 'manor', 'mansion', 'villa', 'noble', 'aristocrat', 'lord',
  'samurai', 'elite', 'upper class', 'wealthy', 'refined', 'opulent',
  'grand hall', 'reception', 'formal', 'lavish',
];
const POOR_KEYWORDS = [
  'village', 'hut', 'hovel', 'slum', 'poor', 'peasant', 'humble',
  'shack', 'lean-to', 'commoner', 'impoverished', 'poverty', 'shanty',
  'modest', 'rough dwelling',
];
const WORKING_KW = [
  'workshop', 'forge', 'market', 'inn', 'tavern', 'shop', 'merchant',
  'dock', 'harbor', 'farmstead', 'mill', 'bakery', 'stable', 'barracks',
  'studio', 'atelier', 'smithy', 'kiln',
];

const MATERIAL_PRIVILEGE_BY_TIER: Record<string, { allowed: string[]; restricted: string[]; signature: string[] }> = {
  poor: {
    allowed: ['rough wood', 'packed earth', 'thatch', 'clay', 'straw', 'hemp', 'unfinished stone'],
    restricted: ['silk', 'lacquer', 'polished stone', 'gold', 'silver', 'marble', 'porcelain', 'glass', 'bronze ornament'],
    signature: ['weathered wood', 'packed earth', 'worn thatch'],
  },
  working: {
    allowed: ['wood', 'stone', 'clay', 'iron', 'copper', 'leather', 'rough fabric', 'brick', 'plaster'],
    restricted: ['silk', 'gold', 'marble', 'lacquer', 'gilded surfaces', 'precious metals'],
    signature: ['functional wood', 'fired clay', 'iron fittings'],
  },
  elite: {
    allowed: ['polished wood', 'cut stone', 'marble', 'silk', 'lacquer', 'copper', 'bronze', 'glass', 'porcelain', 'fine plaster'],
    restricted: ['rough thatch', 'packed earth', 'raw clay', 'hemp rope', 'corrugated materials'],
    signature: ['lacquered wood', 'polished stone', 'silk panels'],
  },
  imperial: {
    allowed: ['marble', 'gold leaf', 'silk', 'lacquer', 'jade', 'precious stone', 'bronze', 'polished granite', 'carved hardwood', 'porcelain'],
    restricted: ['rough wood', 'packed earth', 'thatch', 'raw clay', 'hemp', 'corrugated materials', 'industrial metal'],
    signature: ['gilded surfaces', 'carved stone', 'ceremonial silk', 'jade inlay'],
  },
};

function matchesWord(text: string, word: string): boolean {
  // Word-boundary match to prevent 'villa' matching 'village'
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  return re.test(text);
}

function inferStatusTier(combined: string): string {
  if (IMPERIAL_KEYWORDS.some(k => matchesWord(combined, k))) return 'imperial';
  if (ELITE_KEYWORDS.some(k => matchesWord(combined, k))) return 'elite';
  if (POOR_KEYWORDS.some(k => matchesWord(combined, k))) return 'poor';
  if (WORKING_KW.some(k => matchesWord(combined, k))) return 'working';
  return 'working';
}

function inferCraftLevel(combined: string, tier: string): string {
  if (tier === 'imperial') return 'ceremonial';
  if (tier === 'elite') return 'refined';
  if (tier === 'poor') return 'rough';
  if (['master', 'fine', 'skilled', 'expert'].some(k => combined.includes(k))) return 'refined';
  if (['crude', 'rough', 'makeshift'].some(k => combined.includes(k))) return 'rough';
  return 'functional';
}

function inferDensityProfile(tier: string, locClass: string) {
  if (locClass === 'workshop' || locClass === 'storage') return { clutter: 'high', object_density: 'dense', negative_space: 'none' };
  if (locClass === 'passage' || locClass === 'courtyard' || locClass === 'exterior') return { clutter: 'low', object_density: 'sparse', negative_space: 'dominant' };
  if (tier === 'imperial') return { clutter: 'low', object_density: 'sparse', negative_space: 'dominant' };
  if (tier === 'elite') return { clutter: 'low', object_density: 'balanced', negative_space: 'moderate' };
  if (tier === 'poor') return { clutter: 'medium', object_density: 'sparse', negative_space: 'moderate' };
  return { clutter: 'medium', object_density: 'balanced', negative_space: 'moderate' };
}

function inferSpatialIntent(combined: string, tier: string, locClass: string) {
  if (locClass === 'workshop' || locClass === 'storage') return { purpose: 'utilitarian', symmetry: 'none', flow: 'organic' };
  if (locClass === 'passage') return { purpose: 'utilitarian', symmetry: 'loose', flow: 'structured' };
  if (tier === 'imperial') return { purpose: 'symbolic', symmetry: 'strong', flow: 'ritualized' };
  if (tier === 'elite') return { purpose: 'curated', symmetry: 'strong', flow: 'structured' };
  if (tier === 'poor') return { purpose: 'lived_in', symmetry: 'none', flow: 'organic' };
  if (['temple', 'shrine', 'monastery', 'sacred'].some(k => combined.includes(k))) return { purpose: 'symbolic', symmetry: 'strong', flow: 'ritualized' };
  return { purpose: 'lived_in', symmetry: 'loose', flow: 'organic' };
}

function buildMaterialHierarchy(structural: string[], tier: string, privilege: { allowed: string[]; restricted: string[]; signature: string[] }) {
  const primary = structural.filter(m => !privilege.restricted.some(r => m.toLowerCase().includes(r.toLowerCase())));
  const secondary = privilege.allowed.filter(a => !primary.some(p => p.toLowerCase() === a.toLowerCase())).slice(0, 5);
  return {
    primary: primary.length > 0 ? primary : privilege.signature.slice(0, 3),
    secondary,
    forbidden: [...privilege.restricted],
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectLocationClass(name: string, description: string): string {
  const combined = `${name} ${description}`.toLowerCase();
  if (WORKSHOP_KEYWORDS.some(k => combined.includes(k))) return 'workshop';
  if (STORAGE_KEYWORDS.some(k => combined.includes(k))) return 'storage';
  if (PASSAGE_KEYWORDS.some(k => combined.includes(k))) return 'passage';
  if (COURTYARD_KEYWORDS.some(k => combined.includes(k))) return 'courtyard';
  if (['ext', 'exterior'].some(k => combined.includes(k))) return 'exterior';
  return 'primary_space';
}

function extractTerms(text: string, termList: string[]): string[] {
  const lower = text.toLowerCase();
  return termList.filter(t => lower.includes(t));
}

function extractStructuralMaterials(text: string): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const [category, terms] of Object.entries(STRUCTURAL_TERMS)) {
    if (terms.some(t => lower.includes(t))) found.push(category);
  }
  return found;
}

function detectStatusExpression(text: string): { mode: string; notes: string } {
  const lower = text.toLowerCase();
  const matches: string[] = [];
  for (const { signal, keywords } of STATUS_PATTERNS) {
    if (keywords.some(k => lower.includes(k))) matches.push(signal);
  }
  if (matches.length === 0) return { mode: 'mixed', notes: '' };
  const hasAustere = matches.some(m => m.includes('sparseness') || m.includes('restraint'));
  const hasOrnamental = matches.some(m => m.includes('finish') && lower.includes('ornate'));
  const hasMaterial = matches.some(m => m.includes('finish'));
  const hasSpatial = matches.some(m => m.includes('scale') || m.includes('restraint'));
  if (hasAustere) return { mode: 'austere', notes: matches.join('; ') };
  if (hasOrnamental) return { mode: 'ornamental', notes: matches.join('; ') };
  if (hasMaterial) return { mode: 'material', notes: matches.join('; ') };
  if (hasSpatial) return { mode: 'spatial', notes: matches.join('; ') };
  return { mode: 'mixed', notes: matches.join('; ') };
}

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(i => String(i ?? '')).join(', ');
  return JSON.stringify(value);
}

// ── Hash computation (must match client-side datasetCanonHash.ts) ────────────

function computeCanonHash(location: any, canonJson: any, styleProfile: any, materialPalette: string[]): string {
  const s = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.trim().toLowerCase();
    if (Array.isArray(v)) return v.map(i => String(i)).join(',').toLowerCase();
    return JSON.stringify(v).toLowerCase();
  };

  const inputs = {
    location: {
      canonical_name: s(location.canonical_name),
      description: s(location.description),
      geography: s(location.geography),
      era_relevance: s(location.era_relevance),
      interior_or_exterior: s(location.interior_or_exterior),
      location_type: s(location.location_type),
    },
    canon: {
      world_description: s(canonJson?.world_description),
      setting: s(canonJson?.setting),
      tone_style: s(canonJson?.tone_style),
    },
    style: {
      period: s(styleProfile?.period),
      lighting_philosophy: s(styleProfile?.lighting_philosophy),
      texture_materiality: s(styleProfile?.texture_materiality),
      color_response: s(styleProfile?.color_response),
    },
    materialPalette: [...materialPalette].sort().map(m => m.toLowerCase().trim()),
  };

  const serialized = JSON.stringify(inputs);
  let hash = 5381;
  for (let i = 0; i < serialized.length; i++) {
    hash = ((hash << 5) + hash + serialized.charCodeAt(i)) | 0;
  }
  return `lvd_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

// ── Build single location dataset ────────────────────────────────────────────

function buildLocationDataset(
  location: any,
  canonJson: any,
  styleProfile: any,
  materialPalette: string[],
) {
  const desc = location.description || '';
  const worldDesc = normalizeText(canonJson?.world_description);
  const setting = normalizeText(canonJson?.setting);
  const toneStyle = normalizeText(canonJson?.tone_style);
  const combinedContext = `${desc} ${worldDesc} ${setting}`;
  const period = styleProfile?.period || location.era_relevance || '';
  const locClass = detectLocationClass(location.canonical_name, desc);

  const structuralMaterials = extractStructuralMaterials(combinedContext);
  const globalMaterials = extractStructuralMaterials(materialPalette.join(' '));
  const allStructural = [...new Set([...structuralMaterials, ...globalMaterials])];

  const atmosphereTerms = extractTerms(combinedContext, ATMOSPHERE_TERMS);
  const lightingPhilosophy = styleProfile?.lighting_philosophy || '';
  const { mode: statusMode, notes: statusNotes } = detectStatusExpression(combinedContext);

  const isWorkshop = locClass === 'workshop';
  const occupationTerms = extractTerms(desc, [
    'pottery', 'forge', 'kiln', 'loom', 'anvil', 'workbench', 'tools', 'craft', 'artisan', 'workshop',
  ]);

  const structural_substrate = {
    primary: allStructural.length > 0 ? allStructural : ['wood', 'stone'],
    secondary: period ? [`${period} construction methods`] : [],
    notes: location.geography ? `Geography: ${location.geography}` : '',
  };

  const surface_condition = {
    primary: extractTerms(combinedContext, ['weathered', 'worn', 'aged', 'patina', 'polished', 'lacquered', 'rough', 'smooth']),
    secondary: extractTerms(combinedContext, ['cracked', 'peeling', 'faded', 'stained', 'rusted', 'mossy']),
    notes: '',
  };

  const atmosphere_behavior = {
    primary: atmosphereTerms.slice(0, 3),
    secondary: atmosphereTerms.slice(3),
    notes: lightingPhilosophy,
  };

  const spatial_character = {
    primary: extractTerms(combinedContext, ['vast', 'intimate', 'narrow', 'open', 'enclosed', 'towering', 'cramped', 'expansive']),
    secondary: extractTerms(combinedContext, ['symmetrical', 'organic', 'layered', 'ordered', 'chaotic']),
    notes: location.interior_or_exterior || '',
  };

  const status_signal = { primary: [] as string[], secondary: [] as string[], notes: statusNotes };
  for (const { signal, keywords } of STATUS_PATTERNS) {
    if (keywords.some(k => combinedContext.toLowerCase().includes(k))) {
      status_signal.primary.push(signal);
    }
  }

  const contextual_dressing = {
    primary: [] as string[],
    secondary: extractTerms(desc, ['scroll', 'candle', 'lantern', 'vase', 'cushion', 'screen', 'partition']),
    notes: isWorkshop ? 'Workshop dressing only — no transfer to other locations' : '',
  };

  const occupation_trace = {
    primary: isWorkshop ? occupationTerms : [],
    secondary: isWorkshop ? [] : occupationTerms.slice(0, 1),
    notes: isWorkshop ? 'Craft traces are secondary to architecture even in workshop' : 'Craft traces forbidden as dominant',
    forbidden_as_dominant: !isWorkshop,
  };

  const symbolic_motif = {
    primary: extractTerms(combinedContext, ['threshold', 'boundary', 'mirror', 'shadow', 'flame', 'water', 'mountain', 'circle', 'spiral']),
    secondary: [] as string[],
    notes: '',
  };

  const commonForbidden = isWorkshop
    ? ['craft activity as primary subject']
    : ['craft activity', 'occupation tools', 'trade labor'];
  const commonNegatives = isWorkshop
    ? ['artisan at work', 'hands working', 'character labor']
    : ['pottery', 'forge', 'kiln', 'loom', 'anvil', 'craft activity', 'artisan at work'];

  const slot_establishing = {
    primary_truths: [`Full architecture of ${location.canonical_name}`, ...allStructural.map((m: string) => `${m} construction`)],
    secondary_truths: atmosphereTerms.slice(0, 2),
    contextual: status_signal.primary.slice(0, 2),
    forbidden_dominance: [...commonForbidden, 'interior details in exterior shot'],
    hard_negatives: [...commonNegatives, 'people', 'characters', 'figures'],
    notes: `${period ? period + ' era.' : ''} ${location.interior_or_exterior === 'exterior' ? 'Exterior establishing.' : 'Interior establishing.'}`,
  };

  const slot_atmosphere = {
    primary_truths: atmosphereTerms.length > 0 ? atmosphereTerms : ['natural light', 'ambient atmosphere'],
    secondary_truths: spatial_character.primary,
    contextual: allStructural.slice(0, 2),
    forbidden_dominance: [...commonForbidden, 'architectural detail as primary'],
    hard_negatives: [...commonNegatives, 'people'],
    notes: lightingPhilosophy,
  };

  const slot_architectural_detail = {
    primary_truths: allStructural.map((m: string) => `${m} surface detail`),
    secondary_truths: surface_condition.primary,
    contextual: status_signal.primary.slice(0, 1),
    forbidden_dominance: commonForbidden,
    hard_negatives: [...commonNegatives, 'people'],
    notes: '',
  };

  const slot_time_variant = {
    primary_truths: ['different time of day', 'seasonal variation', 'light transformation'],
    secondary_truths: atmosphereTerms,
    contextual: allStructural.slice(0, 2),
    forbidden_dominance: commonForbidden,
    hard_negatives: [...commonNegatives, 'people'],
    notes: '',
  };

  const slot_surface_language = {
    primary_truths: allStructural.map((m: string) => `${m} as architectural surface`),
    secondary_truths: surface_condition.primary,
    contextual: ['contextual textile if embedded in space'],
    forbidden_dominance: [...commonForbidden, 'textile as primary subject', 'fabric catalogue', 'material board'],
    hard_negatives: [...commonNegatives, 'isolated fabric', 'textile display', 'swatch', 'people'],
    notes: styleProfile?.texture_materiality || '',
  };

  const slot_motif = {
    primary_truths: symbolic_motif.primary.length > 0 ? symbolic_motif.primary : ['recurring environmental pattern'],
    secondary_truths: allStructural.slice(0, 2),
    contextual: atmosphereTerms.slice(0, 1),
    forbidden_dominance: commonForbidden,
    hard_negatives: [...commonNegatives, 'people'],
    notes: '',
  };

  let score = 0;
  const checks = [
    allStructural.length > 0, atmosphereTerms.length > 0, surface_condition.primary.length > 0,
    spatial_character.primary.length > 0, status_signal.primary.length > 0,
    !!period, !!location.interior_or_exterior, !!location.geography, (desc || '').length > 20,
  ];
  score = checks.filter(Boolean).length / checks.length;

  const sourceHash = computeCanonHash(location, canonJson, styleProfile, materialPalette);

  // Socio-economic hierarchy inference — use location-specific text ONLY for tier
  // Global world text (worldDesc, setting) contains cross-location terms like "samurai",
  // "noble" that would promote every location to elite/imperial. Tier must be inferred
  // from the location's own name and description.
  const locationSpecificText = `${location.canonical_name} ${desc}`.toLowerCase();
  const statusTier = inferStatusTier(locationSpecificText);
  // Use broader context for craft/spatial/atmosphere inference (those are less tier-sensitive)
  const hierarchyCombined = `${location.canonical_name} ${desc} ${worldDesc} ${setting}`.toLowerCase();
  const matPrivilege = MATERIAL_PRIVILEGE_BY_TIER[statusTier] || MATERIAL_PRIVILEGE_BY_TIER['working'];
  const craftLvl = inferCraftLevel(hierarchyCombined, statusTier);
  const densityProf = inferDensityProfile(statusTier, locClass);
  const spatialInt = inferSpatialIntent(hierarchyCombined, statusTier, locClass);
  const matHierarchy = buildMaterialHierarchy(allStructural, statusTier, matPrivilege);

  // Add tier-based forbidden materials to slot negatives
  const tierForbiddenSlice = matHierarchy.forbidden.slice(0, 5);
  // Enrich all slot hard_negatives with tier forbidden materials
  for (const slot of [slot_establishing, slot_atmosphere, slot_architectural_detail, slot_time_variant, slot_surface_language, slot_motif]) {
    for (const f of tierForbiddenSlice) {
      if (!slot.hard_negatives.includes(f)) slot.hard_negatives.push(f);
    }
  }

  return {
    location_name: location.canonical_name,
    canon_location_id: location.id,
    location_class: locClass,
    parent_location_id: null,
    inherits_from_parent: false,
    non_inheritable_traits: isWorkshop ? ['occupation_trace', 'contextual_dressing'] : [],
    structural_substrate, surface_condition, atmosphere_behavior, spatial_character,
    status_signal, contextual_dressing, occupation_trace, symbolic_motif,
    slot_establishing, slot_atmosphere, slot_architectural_detail,
    slot_time_variant, slot_surface_language, slot_motif,
    status_expression_mode: statusMode,
    status_expression_notes: statusNotes,
    status_tier: statusTier,
    material_privilege: matPrivilege,
    craft_level: craftLvl,
    density_profile: densityProf,
    spatial_intent: spatialInt,
    material_hierarchy: matHierarchy,
    completeness_score: Math.round(score * 100) / 100,
    source_canon_hash: sourceHash,
    provenance: {
      source: 'reverse_engineered',
      canon_location_id: location.id,
      canon_fields: ['description', 'geography', 'era_relevance', 'interior_or_exterior'].filter((f: string) => !!location[f]).join(','),
      style_profile_used: styleProfile ? 'yes' : 'no',
      world_description_used: (worldDesc || '').length > 5 ? 'yes' : 'no',
      status_tier: statusTier,
      generated_at: new Date().toISOString(),
    },
  };
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { project_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Load canonical inputs server-side
    const [locResult, canonResult, styleResult] = await Promise.all([
      supabase.from("canon_locations").select("*").eq("project_id", project_id).eq("active", true),
      supabase.from("project_canon").select("canon_json").eq("project_id", project_id).maybeSingle(),
      supabase.from("project_visual_style").select("*").eq("project_id", project_id).maybeSingle(),
    ]);

    const locations = locResult.data || [];
    const canonJson = canonResult.data?.canon_json || {};
    const styleProfile = styleResult.data ? {
      period: styleResult.data.period || '',
      lighting_philosophy: styleResult.data.lighting_philosophy || '',
      texture_materiality: styleResult.data.texture_materiality || '',
      color_response: styleResult.data.color_response || '',
    } : null;

    // Extract material palette from canon
    const materialPalette: string[] = [];
    if (canonJson.materials && Array.isArray(canonJson.materials)) {
      materialPalette.push(...canonJson.materials.map((m: unknown) => String(m)));
    }
    if (styleProfile?.texture_materiality) {
      const extra = styleProfile.texture_materiality.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean);
      for (const m of extra) {
        if (!materialPalette.includes(m)) materialPalette.push(m);
      }
    }

    if (locations.length === 0) {
      return new Response(JSON.stringify({
        ok: true, datasets: [], message: "No active canon locations found",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Build all datasets with per-location error handling
    const drafts: any[] = [];
    const buildErrors: Array<{ location: string; error: string }> = [];
    const batchId = crypto.randomUUID();
    const batchTimestamp = new Date().toISOString();

    for (const loc of locations) {
      try {
        const draft = buildLocationDataset(loc, canonJson, styleProfile, materialPalette);
        // Attach batch provenance
        draft.provenance = {
          ...draft.provenance,
          batch_id: batchId,
          batch_timestamp: batchTimestamp,
          batch_location_count: String(locations.length),
        };
        drafts.push(draft);
      } catch (err: any) {
        console.error(`[LVD-REGEN] Failed to build dataset for ${loc.canonical_name}:`, err);
        buildErrors.push({ location: loc.canonical_name, error: err.message || 'Unknown build error' });
      }
    }

    if (drafts.length === 0 && buildErrors.length > 0) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'All location dataset builds failed',
        build_errors: buildErrors,
        summary: { total: 0, failed_count: buildErrors.length, batch_id: batchId, generated_at: batchTimestamp },
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Atomic lifecycle: retire old → insert new
    const { error: retireErr } = await supabase
      .from("location_visual_datasets")
      .update({ is_current: false })
      .eq("project_id", project_id)
      .eq("is_current", true);

    if (retireErr) {
      console.error("[LVD-REGEN] Failed to retire old datasets:", retireErr);
      throw new Error(`Failed to retire old datasets: ${retireErr.message}`);
    }

    // 4. Insert all new datasets
    const rows = drafts.map((draft: any) => ({
      project_id,
      canon_location_id: draft.canon_location_id,
      location_name: draft.location_name,
      source_mode: 'reverse_engineered',
      provenance: draft.provenance,
      completeness_score: draft.completeness_score,
      is_current: true,
      location_class: draft.location_class,
      parent_location_id: draft.parent_location_id,
      inherits_from_parent: draft.inherits_from_parent,
      non_inheritable_traits: draft.non_inheritable_traits,
      structural_substrate: draft.structural_substrate,
      surface_condition: draft.surface_condition,
      atmosphere_behavior: draft.atmosphere_behavior,
      spatial_character: draft.spatial_character,
      status_signal: draft.status_signal,
      contextual_dressing: draft.contextual_dressing,
      occupation_trace: draft.occupation_trace,
      symbolic_motif: draft.symbolic_motif,
      slot_establishing: draft.slot_establishing,
      slot_atmosphere: draft.slot_atmosphere,
      slot_architectural_detail: draft.slot_architectural_detail,
      slot_time_variant: draft.slot_time_variant,
      slot_surface_language: draft.slot_surface_language,
      slot_motif: draft.slot_motif,
      status_expression_mode: draft.status_expression_mode,
      status_expression_notes: draft.status_expression_notes,
      status_tier: draft.status_tier,
      material_privilege: draft.material_privilege,
      craft_level: draft.craft_level,
      density_profile: draft.density_profile,
      spatial_intent: draft.spatial_intent,
      material_hierarchy: draft.material_hierarchy,
      freshness_status: 'fresh',
      stale_reason: null,
      source_canon_hash: draft.source_canon_hash,
      created_by: user.id,
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from("location_visual_datasets")
      .insert(rows)
      .select("id, location_name, canon_location_id, completeness_score, source_canon_hash, location_class");

    if (insertErr) {
      console.error("[LVD-REGEN] Failed to insert datasets:", insertErr);
      throw new Error(`Failed to insert datasets: ${insertErr.message}`);
    }

    console.log(`[LVD-REGEN] Built ${(inserted || []).length} datasets for project ${project_id} (batch: ${batchId})`);

    return new Response(JSON.stringify({
      ok: true,
      datasets: inserted || [],
      summary: {
        total: (inserted || []).length,
        failed_count: buildErrors.length,
        build_errors: buildErrors.length > 0 ? buildErrors : undefined,
        locations: (inserted || []).map((d: any) => d.location_name),
        batch_id: batchId,
        generated_at: batchTimestamp,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[LVD-REGEN] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
