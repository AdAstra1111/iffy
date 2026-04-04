/**
 * locationHierarchy — Deterministic socio-economic hierarchy inference
 * for Location Visual Datasets.
 *
 * Infers status_tier, material_privilege, craft_level, density_profile,
 * spatial_intent, and material_hierarchy from canon/style inputs.
 *
 * Cross-product, not tuned to any single project.
 * No LLM usage — pure keyword heuristics.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type StatusTier = 'poor' | 'working' | 'elite' | 'imperial';
export type CraftLevel = 'rough' | 'functional' | 'refined' | 'ceremonial';
export type ClutterLevel = 'low' | 'medium' | 'high';
export type ObjectDensity = 'sparse' | 'balanced' | 'dense';
export type NegativeSpace = 'none' | 'moderate' | 'dominant';
export type SpatialPurpose = 'utilitarian' | 'lived_in' | 'curated' | 'symbolic';
export type Symmetry = 'none' | 'loose' | 'strong';
export type Flow = 'organic' | 'structured' | 'ritualized';

export interface MaterialPrivilege {
  allowed: string[];
  restricted: string[];
  signature: string[];
}

export interface DensityProfile {
  clutter: ClutterLevel;
  object_density: ObjectDensity;
  negative_space: NegativeSpace;
}

export interface SpatialIntent {
  purpose: SpatialPurpose;
  symmetry: Symmetry;
  flow: Flow;
}

export interface MaterialHierarchy {
  primary: string[];
  secondary: string[];
  forbidden: string[];
}

export interface LocationHierarchyResult {
  status_tier: StatusTier;
  material_privilege: MaterialPrivilege;
  craft_level: CraftLevel;
  density_profile: DensityProfile;
  spatial_intent: SpatialIntent;
  material_hierarchy: MaterialHierarchy;
}

// ── Status Tier Detection ────────────────────────────────────────────────────

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
const WORKING_KEYWORDS = [
  'workshop', 'forge', 'market', 'inn', 'tavern', 'shop', 'merchant',
  'dock', 'harbor', 'farmstead', 'mill', 'bakery', 'stable', 'barracks',
  'studio', 'atelier', 'smithy', 'kiln',
];

function inferStatusTier(combined: string): StatusTier {
  if (IMPERIAL_KEYWORDS.some(k => combined.includes(k))) return 'imperial';
  if (ELITE_KEYWORDS.some(k => combined.includes(k))) return 'elite';
  if (POOR_KEYWORDS.some(k => combined.includes(k))) return 'poor';
  if (WORKING_KEYWORDS.some(k => combined.includes(k))) return 'working';
  return 'working';
}

// ── Material Privilege Rules ─────────────────────────────────────────────────

const MATERIAL_PRIVILEGE_BY_TIER: Record<StatusTier, MaterialPrivilege> = {
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

// ── Craft Level Detection ────────────────────────────────────────────────────

function inferCraftLevel(combined: string, statusTier: StatusTier): CraftLevel {
  if (statusTier === 'imperial') return 'ceremonial';
  if (statusTier === 'elite') return 'refined';
  if (statusTier === 'poor') return 'rough';

  // Working tier — check for refinement signals
  if (['master', 'fine', 'skilled', 'expert', 'precise'].some(k => combined.includes(k))) return 'refined';
  if (['crude', 'rough', 'makeshift', 'improvised'].some(k => combined.includes(k))) return 'rough';
  return 'functional';
}

// ── Density Profile Detection ────────────────────────────────────────────────

function inferDensityProfile(combined: string, statusTier: StatusTier, locationClass: string): DensityProfile {
  // Workshops/storage are inherently dense
  if (locationClass === 'workshop' || locationClass === 'storage') {
    return { clutter: 'high', object_density: 'dense', negative_space: 'none' };
  }
  // Passages are sparse
  if (locationClass === 'passage') {
    return { clutter: 'low', object_density: 'sparse', negative_space: 'dominant' };
  }
  // Courtyards/exteriors have moderate-to-dominant negative space
  if (locationClass === 'courtyard' || locationClass === 'exterior') {
    return { clutter: 'low', object_density: 'sparse', negative_space: 'dominant' };
  }

  // Tier-driven defaults
  switch (statusTier) {
    case 'imperial':
      return { clutter: 'low', object_density: 'sparse', negative_space: 'dominant' };
    case 'elite':
      return { clutter: 'low', object_density: 'balanced', negative_space: 'moderate' };
    case 'poor':
      return { clutter: 'medium', object_density: 'sparse', negative_space: 'moderate' };
    case 'working':
    default:
      return { clutter: 'medium', object_density: 'balanced', negative_space: 'moderate' };
  }
}

// ── Spatial Intent Detection ─────────────────────────────────────────────────

function inferSpatialIntent(combined: string, statusTier: StatusTier, locationClass: string): SpatialIntent {
  if (locationClass === 'workshop' || locationClass === 'storage') {
    return { purpose: 'utilitarian', symmetry: 'none', flow: 'organic' };
  }
  if (locationClass === 'passage') {
    return { purpose: 'utilitarian', symmetry: 'loose', flow: 'structured' };
  }

  switch (statusTier) {
    case 'imperial':
      return { purpose: 'symbolic', symmetry: 'strong', flow: 'ritualized' };
    case 'elite':
      return { purpose: 'curated', symmetry: 'strong', flow: 'structured' };
    case 'poor':
      return { purpose: 'lived_in', symmetry: 'none', flow: 'organic' };
    case 'working':
    default:
      if (['temple', 'shrine', 'monastery', 'sacred'].some(k => combined.includes(k))) {
        return { purpose: 'symbolic', symmetry: 'strong', flow: 'ritualized' };
      }
      return { purpose: 'lived_in', symmetry: 'loose', flow: 'organic' };
  }
}

// ── Material Hierarchy Builder ───────────────────────────────────────────────

function buildMaterialHierarchy(
  structuralMaterials: string[],
  statusTier: StatusTier,
  privilege: MaterialPrivilege,
): MaterialHierarchy {
  // Primary = structural materials that are allowed for this tier
  const primary = structuralMaterials.filter(m =>
    !privilege.restricted.some(r => m.toLowerCase().includes(r.toLowerCase())),
  );

  // Secondary = allowed contextual materials from tier privilege
  const secondary = privilege.allowed.filter(a =>
    !primary.some(p => p.toLowerCase() === a.toLowerCase()),
  ).slice(0, 5);

  // Forbidden = restricted materials for this tier
  const forbidden = [...privilege.restricted];

  return {
    primary: primary.length > 0 ? primary : privilege.signature.slice(0, 3),
    secondary,
    forbidden,
  };
}

// ── Main Inference Function ──────────────────────────────────────────────────

/**
 * Infer the full socio-economic hierarchy for a location.
 * Deterministic — no LLM, no scoring, pure keyword heuristics.
 */
export function inferLocationHierarchy(params: {
  locationName: string;
  description: string;
  locationClass: string;
  worldDescription: string;
  setting: string;
  structuralMaterials: string[];
}): LocationHierarchyResult {
  const combined = `${params.locationName} ${params.description} ${params.worldDescription} ${params.setting}`.toLowerCase();

  const status_tier = inferStatusTier(combined);
  const material_privilege = MATERIAL_PRIVILEGE_BY_TIER[status_tier];
  const craft_level = inferCraftLevel(combined, status_tier);
  const density_profile = inferDensityProfile(combined, status_tier, params.locationClass);
  const spatial_intent = inferSpatialIntent(combined, status_tier, params.locationClass);
  const material_hierarchy = buildMaterialHierarchy(params.structuralMaterials, status_tier, material_privilege);

  return {
    status_tier,
    material_privilege,
    craft_level,
    density_profile,
    spatial_intent,
    material_hierarchy,
  };
}

// ── Prompt Block Builder ─────────────────────────────────────────────────────

/**
 * Build a structured prompt injection block from hierarchy data.
 * This block goes into every location prompt to enforce visual separation.
 */
export function buildHierarchyPromptBlock(h: LocationHierarchyResult): string {
  const lines: string[] = [];

  lines.push(`[SOCIO-ECONOMIC HIERARCHY — STATUS: ${h.status_tier.toUpperCase()}]`);

  // Material hierarchy
  if (h.material_hierarchy.primary.length > 0) {
    lines.push(`PRIMARY MATERIALS (must dominate): ${h.material_hierarchy.primary.join(', ')}`);
  }
  if (h.material_hierarchy.secondary.length > 0) {
    lines.push(`SECONDARY MATERIALS (may appear): ${h.material_hierarchy.secondary.join(', ')}`);
  }
  if (h.material_hierarchy.forbidden.length > 0) {
    lines.push(`FORBIDDEN MATERIALS (must NOT appear): ${h.material_hierarchy.forbidden.join(', ')}`);
  }

  // Density + spatial
  lines.push(`SPATIAL INTENT: ${h.spatial_intent.purpose} | Symmetry: ${h.spatial_intent.symmetry} | Flow: ${h.spatial_intent.flow}`);
  lines.push(`OBJECT DENSITY: ${h.density_profile.object_density} | Clutter: ${h.density_profile.clutter} | Negative Space: ${h.density_profile.negative_space}`);
  lines.push(`CRAFT LEVEL: ${h.craft_level}`);

  // Status expression guidance
  switch (h.status_tier) {
    case 'imperial':
      lines.push('STATUS EXPRESSION: Power through scale, order, and spatial dominance. Restraint over accumulation. Empty space is authority.');
      break;
    case 'elite':
      lines.push('STATUS EXPRESSION: Wealth through finish quality, material refinement, and controlled composition. Never clutter.');
      break;
    case 'poor':
      lines.push('STATUS EXPRESSION: Scarcity through simplicity, wear, and material honesty. No ornament. Beauty through use.');
      break;
    case 'working':
      lines.push('STATUS EXPRESSION: Function over decoration. Materials shaped by use. Organized by necessity, not aesthetics.');
      break;
  }

  return lines.join('\n');
}

/**
 * Get hard negatives derived from tier-based cross-location isolation.
 */
export function getHierarchyNegatives(h: LocationHierarchyResult): string[] {
  const negatives: string[] = [];

  // Cross-tier material negatives
  for (const mat of h.material_hierarchy.forbidden) {
    negatives.push(mat);
  }

  // Density-based negatives
  if (h.density_profile.clutter === 'low') {
    negatives.push('cluttered room', 'stacked objects', 'crowded shelves', 'piled goods');
  }
  if (h.density_profile.negative_space === 'dominant') {
    negatives.push('busy composition', 'dense objects', 'crowded frame');
  }

  // Status-specific negatives
  if (h.status_tier === 'poor' || h.status_tier === 'working') {
    negatives.push('ornate decoration', 'gilded surfaces', 'luxury items', 'precious materials');
  }
  if (h.status_tier === 'imperial' || h.status_tier === 'elite') {
    negatives.push('rough construction', 'makeshift repairs', 'poverty signals', 'crude materials');
  }

  return [...new Set(negatives)];
}
