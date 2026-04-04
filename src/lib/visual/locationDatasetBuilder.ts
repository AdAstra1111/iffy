/**
 * locationDatasetBuilder — Reverse-engineers structured Location Visual Datasets
 * from existing canon, style, and location data.
 *
 * This is the canonical reverse-engineering pipeline for existing projects.
 * For future projects, Dev Engine will emit these natively during canon stabilization.
 *
 * Cross-product, not tuned to any single project.
 */

import { normalizeCanonText } from '@/lib/lookbook/normalizeCanonText';
import type { CanonLocation } from '@/hooks/useCanonLocations';
import {
  inferLocationHierarchy,
  type LocationHierarchyResult,
  type StatusTier,
  type MaterialPrivilege,
  type CraftLevel,
  type DensityProfile,
  type SpatialIntent,
  type MaterialHierarchy,
} from './locationHierarchy';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RoleLayer {
  primary: string[];
  secondary: string[];
  notes: string;
}

export interface SlotData {
  primary_truths: string[];
  secondary_truths: string[];
  contextual: string[];
  forbidden_dominance: string[];
  hard_negatives: string[];
  notes: string;
}

export interface LocationVisualDatasetDraft {
  location_name: string;
  canon_location_id: string | null;
  location_class: 'primary_space' | 'sub_space' | 'workshop' | 'storage' | 'passage' | 'exterior' | 'courtyard';
  parent_location_id: string | null;
  inherits_from_parent: boolean;
  non_inheritable_traits: string[];

  structural_substrate: RoleLayer;
  surface_condition: RoleLayer;
  atmosphere_behavior: RoleLayer;
  spatial_character: RoleLayer;
  status_signal: RoleLayer;
  contextual_dressing: RoleLayer;
  occupation_trace: RoleLayer & { forbidden_as_dominant: boolean };
  symbolic_motif: RoleLayer;

  slot_establishing: SlotData;
  slot_atmosphere: SlotData;
  slot_architectural_detail: SlotData;
  slot_time_variant: SlotData;
  slot_surface_language: SlotData;
  slot_motif: SlotData;

  status_expression_mode: 'spatial' | 'material' | 'ornamental' | 'austere' | 'mixed';
  status_expression_notes: string;

  // Socio-economic hierarchy fields
  status_tier: StatusTier;
  material_privilege: MaterialPrivilege;
  craft_level: CraftLevel;
  density_profile: DensityProfile;
  spatial_intent: SpatialIntent;
  material_hierarchy: MaterialHierarchy;

  completeness_score: number;
  provenance: Record<string, string>;
}

// ── Classification Patterns ──────────────────────────────────────────────────

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

// ── Location Class Detection ─────────────────────────────────────────────────

function detectLocationClass(name: string, description: string): LocationVisualDatasetDraft['location_class'] {
  const combined = `${name} ${description}`.toLowerCase();
  if (WORKSHOP_KEYWORDS.some(k => combined.includes(k))) return 'workshop';
  if (STORAGE_KEYWORDS.some(k => combined.includes(k))) return 'storage';
  if (PASSAGE_KEYWORDS.some(k => combined.includes(k))) return 'passage';
  if (COURTYARD_KEYWORDS.some(k => combined.includes(k))) return 'courtyard';
  if (['ext', 'exterior'].some(k => combined.includes(k))) return 'exterior';
  return 'primary_space';
}

// ── Status Expression Detection ──────────────────────────────────────────────

function detectStatusExpression(text: string): { mode: LocationVisualDatasetDraft['status_expression_mode']; notes: string } {
  const lower = text.toLowerCase();
  const matches: string[] = [];

  for (const { signal, keywords } of STATUS_PATTERNS) {
    if (keywords.some(k => lower.includes(k))) {
      matches.push(signal);
    }
  }

  if (matches.length === 0) return { mode: 'mixed', notes: '' };

  const hasSpatial = matches.some(m => m.includes('scale') || m.includes('restraint'));
  const hasMaterial = matches.some(m => m.includes('finish'));
  const hasOrnamental = matches.some(m => m.includes('finish') && lower.includes('ornate'));
  const hasAustere = matches.some(m => m.includes('sparseness') || m.includes('restraint'));

  if (hasAustere) return { mode: 'austere', notes: matches.join('; ') };
  if (hasOrnamental) return { mode: 'ornamental', notes: matches.join('; ') };
  if (hasMaterial) return { mode: 'material', notes: matches.join('; ') };
  if (hasSpatial) return { mode: 'spatial', notes: matches.join('; ') };
  return { mode: 'mixed', notes: matches.join('; ') };
}

// ── Term Extraction Helpers ──────────────────────────────────────────────────

function extractTerms(text: string, termList: string[]): string[] {
  const lower = text.toLowerCase();
  return termList.filter(t => lower.includes(t));
}

function extractStructuralMaterials(text: string): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const [category, terms] of Object.entries(STRUCTURAL_TERMS)) {
    if (terms.some(t => lower.includes(t))) {
      found.push(category);
    }
  }
  return found;
}

// ── Main Builder ─────────────────────────────────────────────────────────────

/**
 * Build a structured visual dataset for a single location from canon sources.
 */
export function buildLocationVisualDataset(
  location: CanonLocation,
  canonJson: Record<string, unknown> | null,
  styleProfile: { period?: string; lighting_philosophy?: string; texture_materiality?: string; color_response?: string } | null,
  materialPalette: string[],
): LocationVisualDatasetDraft {
  const desc = location.description || '';
  const worldDesc = normalizeCanonText(canonJson?.world_description);
  const setting = normalizeCanonText(canonJson?.setting);
  const toneStyle = normalizeCanonText(canonJson?.tone_style);
  const combinedContext = `${desc} ${worldDesc} ${setting}`;
  const period = styleProfile?.period || location.era_relevance || '';
  const locClass = detectLocationClass(location.canonical_name, desc);

  // Structural
  const structuralMaterials = extractStructuralMaterials(combinedContext);
  const globalMaterials = extractStructuralMaterials(materialPalette.join(' '));
  const allStructural = [...new Set([...structuralMaterials, ...globalMaterials])];

  // Socio-economic hierarchy inference
  const hierarchy = inferLocationHierarchy({
    locationName: location.canonical_name,
    description: desc,
    locationClass: locClass,
    worldDescription: worldDesc,
    setting,
    structuralMaterials: allStructural,
  });

  // Atmosphere
  const atmosphereTerms = extractTerms(combinedContext, ATMOSPHERE_TERMS);
  const lightingPhilosophy = styleProfile?.lighting_philosophy || '';

  // Status
  const { mode: statusMode, notes: statusNotes } = detectStatusExpression(combinedContext);

  // Occupation trace
  const isWorkshop = locClass === 'workshop';
  const occupationTerms = extractTerms(desc, [
    'pottery', 'forge', 'kiln', 'loom', 'anvil', 'workbench',
    'tools', 'craft', 'artisan', 'workshop',
  ]);

  // Build role layers
  const structural_substrate: RoleLayer = {
    primary: allStructural.length > 0 ? allStructural : ['wood', 'stone'],
    secondary: period ? [`${period} construction methods`] : [],
    notes: location.geography ? `Geography: ${location.geography}` : '',
  };

  const surface_condition: RoleLayer = {
    primary: extractTerms(combinedContext, ['weathered', 'worn', 'aged', 'patina', 'polished', 'lacquered', 'rough', 'smooth']),
    secondary: extractTerms(combinedContext, ['cracked', 'peeling', 'faded', 'stained', 'rusted', 'mossy']),
    notes: '',
  };

  const atmosphere_behavior: RoleLayer = {
    primary: atmosphereTerms.slice(0, 3),
    secondary: atmosphereTerms.slice(3),
    notes: lightingPhilosophy,
  };

  const spatial_character: RoleLayer = {
    primary: extractTerms(combinedContext, ['vast', 'intimate', 'narrow', 'open', 'enclosed', 'towering', 'cramped', 'expansive']),
    secondary: extractTerms(combinedContext, ['symmetrical', 'organic', 'layered', 'ordered', 'chaotic']),
    notes: location.interior_or_exterior || '',
  };

  const status_signal: RoleLayer = {
    primary: [],
    secondary: [],
    notes: statusNotes,
  };
  for (const { signal, keywords } of STATUS_PATTERNS) {
    if (keywords.some(k => combinedContext.toLowerCase().includes(k))) {
      status_signal.primary.push(signal);
    }
  }

  const contextual_dressing: RoleLayer = {
    primary: [],
    secondary: extractTerms(desc, ['scroll', 'candle', 'lantern', 'vase', 'cushion', 'screen', 'partition']),
    notes: isWorkshop ? 'Workshop dressing only — no transfer to other locations' : '',
  };

  const occupation_trace: RoleLayer & { forbidden_as_dominant: boolean } = {
    primary: isWorkshop ? occupationTerms : [],
    secondary: isWorkshop ? [] : occupationTerms.slice(0, 1),
    notes: isWorkshop ? 'Craft traces are secondary to architecture even in workshop' : 'Craft traces forbidden as dominant',
    forbidden_as_dominant: !isWorkshop,
  };

  const symbolic_motif: RoleLayer = {
    primary: extractTerms(combinedContext, ['fracture', 'repair', 'mend', 'broken', 'worn', 'patina', 'aged', 'weathered', 'cracked', 'chipped', 'restored', 'mended']),
    secondary: extractTerms(combinedContext, ['threshold', 'boundary', 'gate', 'door', 'path', 'bridge']),
    notes: 'Motifs must be physically real objects or surfaces — no abstract symbols',
  };

  // Build slot-specific data
  const commonForbidden = isWorkshop
    ? ['craft activity as primary subject']
    : ['craft activity', 'occupation tools', 'trade labor'];
  // Add tier-based forbidden materials to slot forbidden lists
  const tierForbiddenMaterials = hierarchy.material_hierarchy.forbidden.slice(0, 5);
  const commonNegatives = [
    ...(isWorkshop
      ? ['artisan at work', 'hands working', 'character labor']
      : ['pottery', 'forge', 'kiln', 'loom', 'anvil', 'craft activity', 'artisan at work']),
    ...tierForbiddenMaterials,
  ];

  const slot_establishing: SlotData = {
    primary_truths: [`Full architecture of ${location.canonical_name}`, ...allStructural.map(m => `${m} construction`)],
    secondary_truths: atmosphereTerms.slice(0, 2),
    contextual: status_signal.primary.slice(0, 2),
    forbidden_dominance: [...commonForbidden, 'interior details in exterior shot'],
    hard_negatives: [...commonNegatives, 'people', 'characters', 'figures'],
    notes: `${period ? period + ' era.' : ''} ${location.interior_or_exterior === 'exterior' ? 'Exterior establishing.' : 'Interior establishing.'}`,
  };

  const slot_atmosphere: SlotData = {
    primary_truths: atmosphereTerms.length > 0 ? atmosphereTerms : ['natural light', 'ambient atmosphere'],
    secondary_truths: spatial_character.primary,
    contextual: allStructural.slice(0, 2),
    forbidden_dominance: [...commonForbidden, 'architectural detail as primary'],
    hard_negatives: [...commonNegatives, 'people'],
    notes: lightingPhilosophy,
  };

  const slot_architectural_detail: SlotData = {
    primary_truths: allStructural.map(m => `${m} surface detail`),
    secondary_truths: surface_condition.primary,
    contextual: status_signal.primary.slice(0, 1),
    forbidden_dominance: commonForbidden,
    hard_negatives: [...commonNegatives, 'people'],
    notes: '',
  };

  const slot_time_variant: SlotData = {
    primary_truths: ['different time of day', 'seasonal variation', 'light transformation'],
    secondary_truths: atmosphereTerms,
    contextual: allStructural.slice(0, 2),
    forbidden_dominance: commonForbidden,
    hard_negatives: [...commonNegatives, 'people'],
    notes: '',
  };

  const slot_surface_language: SlotData = {
    primary_truths: allStructural.map(m => `${m} as architectural surface`),
    secondary_truths: surface_condition.primary,
    contextual: ['contextual textile if embedded in space'],
    forbidden_dominance: [...commonForbidden, 'textile as primary subject', 'fabric catalogue', 'material board'],
    hard_negatives: [...commonNegatives, 'isolated fabric', 'textile display', 'swatch', 'people'],
    notes: styleProfile?.texture_materiality || '',
  };

  const slot_motif: SlotData = {
    primary_truths: allStructural.length > 0
      ? [`Real ${allStructural[0]} objects showing use and age`, ...symbolic_motif.primary.slice(0, 3)]
      : ['recurring physical objects', 'material evidence of use and time'],
    secondary_truths: occupation_trace.primary.slice(0, 2),
    contextual: atmosphereTerms.slice(0, 1),
    forbidden_dominance: [...commonForbidden, 'abstract symbolism', 'fantasy constructs', 'symbolic installations', 'decorative concept art'],
    hard_negatives: [...commonNegatives, 'people', 'abstract sculpture', 'symbolic installation', 'mythic imagery', 'dragon', 'fantasy creature', 'magic', 'spirit', 'ethereal'],
    notes: 'Motifs must be physically real — buildable by props/art department. No abstract or symbolic imagery.',
  };

  // Completeness scoring
  let score = 0;
  const checks = [
    allStructural.length > 0,
    atmosphereTerms.length > 0,
    surface_condition.primary.length > 0,
    spatial_character.primary.length > 0,
    status_signal.primary.length > 0,
    !!period,
    !!location.interior_or_exterior,
    !!location.geography,
    desc.length > 20,
  ];
  score = checks.filter(Boolean).length / checks.length;

  return {
    location_name: location.canonical_name,
    canon_location_id: location.id,
    location_class: locClass,
    parent_location_id: null,
    inherits_from_parent: false,
    non_inheritable_traits: isWorkshop ? ['occupation_trace', 'contextual_dressing'] : [],

    structural_substrate,
    surface_condition,
    atmosphere_behavior,
    spatial_character,
    status_signal,
    contextual_dressing,
    occupation_trace,
    symbolic_motif,

    slot_establishing,
    slot_atmosphere,
    slot_architectural_detail,
    slot_time_variant,
    slot_surface_language,
    slot_motif,

    status_expression_mode: statusMode,
    status_expression_notes: statusNotes,

    // Socio-economic hierarchy
    status_tier: hierarchy.status_tier,
    material_privilege: hierarchy.material_privilege,
    craft_level: hierarchy.craft_level,
    density_profile: hierarchy.density_profile,
    spatial_intent: hierarchy.spatial_intent,
    material_hierarchy: hierarchy.material_hierarchy,

    completeness_score: Math.round(score * 100) / 100,
    provenance: {
      source: 'reverse_engineered',
      canon_location_id: location.id,
      canon_fields: ['description', 'geography', 'era_relevance', 'interior_or_exterior'].filter(f => !!(location as any)[f]).join(','),
      style_profile_used: styleProfile ? 'yes' : 'no',
      world_description_used: worldDesc.length > 5 ? 'yes' : 'no',
      status_tier: hierarchy.status_tier,
    },
  };
}

/**
 * Build datasets for all locations in a project.
 */
export function buildAllLocationDatasets(
  locations: CanonLocation[],
  canonJson: Record<string, unknown> | null,
  styleProfile: { period?: string; lighting_philosophy?: string; texture_materiality?: string; color_response?: string } | null,
  materialPalette: string[],
): LocationVisualDatasetDraft[] {
  return locations
    .filter(loc => loc.active)
    .map(loc => buildLocationVisualDataset(loc, canonJson, styleProfile, materialPalette));
}
