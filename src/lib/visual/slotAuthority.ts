/**
 * slotAuthority — Canonical visual-governance layer for prompt assembly.
 *
 * Determines what truth classes are allowed/forbidden for each visual slot,
 * AND at what priority level (primary / secondary / background / forbidden).
 *
 * This influences prompt STRUCTURE, not just text filtering.
 * Every environment-first slot gets explicit subject hierarchy directives
 * injected before any suppression block.
 *
 * Reusable across Production Design, LookBook, and all generation paths.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type SlotAuthority =
  | 'world_location'
  | 'atmosphere_lighting'
  | 'texture_material'
  | 'surface_language'
  | 'motif_symbolic'
  | 'costume_garment'
  | 'character_identity'
  | 'action_expression'
  | 'workshop_interior';

export type VisualPriority = 'primary' | 'secondary' | 'background' | 'forbidden';

export type TruthClass =
  | 'architecture_space'
  | 'atmosphere_light'
  | 'material_surface'
  | 'occupation_craft'
  | 'narrative_action'
  | 'character_identity';

// ── Priority Matrix ──────────────────────────────────────────────────────────

const PRIORITY_MATRIX: Record<SlotAuthority, Record<TruthClass, VisualPriority>> = {
  world_location: {
    architecture_space: 'primary',
    atmosphere_light: 'secondary',
    material_surface: 'secondary',
    occupation_craft: 'forbidden',
    narrative_action: 'forbidden',
    character_identity: 'forbidden',
  },
  atmosphere_lighting: {
    architecture_space: 'primary',
    atmosphere_light: 'primary',
    material_surface: 'background',
    occupation_craft: 'forbidden',
    narrative_action: 'forbidden',
    character_identity: 'forbidden',
  },
  texture_material: {
    architecture_space: 'background',
    atmosphere_light: 'background',
    material_surface: 'primary',
    occupation_craft: 'forbidden',
    narrative_action: 'forbidden',
    character_identity: 'forbidden',
  },
  surface_language: {
    architecture_space: 'secondary',
    atmosphere_light: 'secondary',
    material_surface: 'primary',
    occupation_craft: 'forbidden',
    narrative_action: 'forbidden',
    character_identity: 'forbidden',
  },
  motif_symbolic: {
    architecture_space: 'secondary',
    atmosphere_light: 'secondary',
    material_surface: 'primary',
    occupation_craft: 'secondary', // Motif objects may derive from craft materials (pottery, ceramic, wood)
    narrative_action: 'forbidden',
    character_identity: 'forbidden',
  },
  costume_garment: {
    architecture_space: 'forbidden',
    atmosphere_light: 'background',
    material_surface: 'primary',
    occupation_craft: 'secondary', // Costume may reflect occupation through fabric/construction
    narrative_action: 'forbidden',
    character_identity: 'forbidden', // World-level costume, not character-specific
  },
  character_identity: {
    architecture_space: 'background',
    atmosphere_light: 'background',
    material_surface: 'background',
    occupation_craft: 'background',
    narrative_action: 'forbidden',
    character_identity: 'primary',
  },
  action_expression: {
    architecture_space: 'secondary',
    atmosphere_light: 'background',
    material_surface: 'background',
    occupation_craft: 'primary',
    narrative_action: 'primary',
    character_identity: 'primary',
  },
  workshop_interior: {
    architecture_space: 'primary',
    atmosphere_light: 'secondary',
    material_surface: 'secondary',
    occupation_craft: 'secondary',
    narrative_action: 'forbidden',
    character_identity: 'forbidden',
  },
};

// ── Occupation & Action Term Lists ───────────────────────────────────────────

const OCCUPATION_TERMS = [
  'pottery', 'potter', 'ceramic', 'ceramics', 'kiln', 'clay', 'glazing',
  'crafting', 'craftsman', 'craftswoman', 'artisan', 'workshop activity',
  'forge', 'forging', 'blacksmith', 'smithing', 'anvil',
  'cooking', 'chef', 'baking', 'baker', 'brewing',
  'weaving', 'weaver', 'loom', 'spinning wheel',
  'sculpting', 'sculptor', 'carving', 'woodworking',
  'sewing', 'seamstress', 'tailor', 'knitting',
  'painting canvas', 'easel', 'calligraphy brush in hand',
  'performing surgery', 'medical procedure',
  'plowing', 'harvesting crops', 'tilling',
];

const OCCUPATION_VERB_PATTERNS = [
  /\b(making|creating|crafting|shaping|molding|throwing|firing|glazing)\b/gi,
  /\b(forging|hammering|welding|smelting)\b/gi,
  /\b(cooking|baking|brewing|fermenting|kneading)\b/gi,
  /\b(weaving|spinning|stitching|sewing|knitting)\b/gi,
  /\b(sculpting|carving|chiseling|whittling)\b/gi,
  /\bhands\s+(stained|covered|working|shaping|molding)\b/gi,
  /\bperforming\s+(their|his|her)\s+(trade|craft|art|work)\b/gi,
];

const ACTION_TERMS = [
  'fighting', 'confrontation', 'argument', 'dramatic gesture',
  'running', 'chasing', 'attacking', 'defending',
  'performing', 'practicing', 'training with',
];

const OCCUPATION_MATERIALS = new Set([
  'ceramic', 'clay', 'kiln', 'glaze', 'porcelain',
  'anvil', 'bellows',
  'loom', 'spindle',
  'easel', 'canvas',
]);

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the full visual priority map for a slot authority.
 */
export function getVisualPriorities(authority: SlotAuthority): Record<TruthClass, VisualPriority> {
  return { ...PRIORITY_MATRIX[authority] };
}

/**
 * Check if a specific truth class is forbidden for this authority.
 */
export function isForbidden(authority: SlotAuthority, truthClass: TruthClass): boolean {
  return PRIORITY_MATRIX[authority][truthClass] === 'forbidden';
}

/**
 * Filter text content by stripping forbidden-class terms for the given authority.
 */
export function filterTextForSlot(text: string, authority: SlotAuthority): string {
  if (!text) return text;
  const priorities = PRIORITY_MATRIX[authority];
  let filtered = text;

  // Strip occupation/craft content if forbidden
  if (priorities.occupation_craft === 'forbidden') {
    for (const pattern of OCCUPATION_VERB_PATTERNS) {
      filtered = filtered.replace(pattern, '');
    }
    for (const term of OCCUPATION_TERMS) {
      const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      filtered = filtered.replace(re, '');
    }
  }

  // Strip narrative action content if forbidden
  if (priorities.narrative_action === 'forbidden') {
    for (const term of ACTION_TERMS) {
      const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      filtered = filtered.replace(re, '');
    }
  }

  // Strip character identity references if forbidden
  if (priorities.character_identity === 'forbidden') {
    // Remove character name patterns like "Hana", "Kenji" — but this must be caller-supplied
    // We strip obvious protagonist-phrasing here
    filtered = filtered.replace(/\b(protagonist|main character|hero|heroine)\s+(is|was|has|had)\b/gi, '');
  }

  // Clean up residual whitespace
  filtered = filtered.replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim();
  return filtered;
}

/**
 * Filter material lists by removing occupation-specific materials
 * unless the authority permits occupation content.
 */
export function filterMaterialsForSlot(materials: string[], authority: SlotAuthority): string[] {
  const priorities = PRIORITY_MATRIX[authority];
  if (priorities.occupation_craft !== 'forbidden') return materials;
  return materials.filter(m => !OCCUPATION_MATERIALS.has(m.toLowerCase()));
}

/**
 * Get hard negative prompt terms for a slot authority.
 */
export function getSlotNegatives(authority: SlotAuthority): string[] {
  const priorities = PRIORITY_MATRIX[authority];
  const negatives: string[] = [];

  if (priorities.occupation_craft === 'forbidden') {
    negatives.push(
      'pottery', 'ceramics', 'craft activity', 'artisan workshop',
      'forge', 'kiln', 'loom', 'spinning wheel', 'anvil',
      'hands working', 'trade labor', 'occupation activity',
      'protagonist performing their trade',
    );
  }

  if (priorities.narrative_action === 'forbidden') {
    negatives.push(
      'fighting', 'confrontation', 'dramatic gesture',
      'action scene', 'character performance',
    );
  }

  if (priorities.character_identity === 'forbidden') {
    negatives.push(
      'people', 'characters', 'figures', 'faces', 'portraits',
      'character-centered composition',
    );
  }

  // Surface language authority: suppress textile/fabric bias
  if (authority === 'surface_language') {
    negatives.push(
      'fabric catalogue', 'textile display', 'material board', 'swatch',
      'fabric stack', 'draped fabric', 'isolated cloth', 'fashion textile',
      'Pinterest board', 'decorative samples', 'fabric shop',
    );
  }

  return negatives;
}

// ── Priority Directive (Prompt Structure) ────────────────────────────────────

const TRUTH_CLASS_LABELS: Record<TruthClass, { primary: string; secondary: string; background: string }> = {
  architecture_space: {
    primary: 'Architecture, spatial layout, environmental scale, structural design',
    secondary: 'Architectural context, spatial framing',
    background: 'Distant structures, implied space',
  },
  atmosphere_light: {
    primary: 'Atmosphere, lighting mood, color temperature, weather, time of day',
    secondary: 'Ambient light, atmospheric haze, tonal feeling',
    background: 'General illumination',
  },
  material_surface: {
    primary: 'Architectural and environmental surfaces — structural materials (wood, stone, plaster, earth, metal), surface condition (wear, aging, soot, moisture, patina). Surfaces must belong to a real environment. No isolated material studies or fabric catalogues. Textiles only when contextually embedded in the space.',
    secondary: 'Environmental surface accents, weathering, material transition zones',
    background: 'Incidental surfaces',
  },
  occupation_craft: {
    primary: 'Craft activity, trade tools, artisan labor, making/creating',
    secondary: 'Craft traces — residue, tools at rest, evidence of labor (not active)',
    background: 'Subtle craft-world presence — a single tool, a stain, a shelf',
  },
  narrative_action: {
    primary: 'Character action, dramatic gesture, narrative beat',
    secondary: 'Implied motion, aftermath of action',
    background: 'Contextual tension',
  },
  character_identity: {
    primary: 'Character face, body, identity, expression, wardrobe',
    secondary: 'Character presence in environment',
    background: 'Distant anonymous figures',
  },
};

/**
 * Build a structured prompt directive block that instructs the model
 * on subject hierarchy for this slot authority.
 *
 * This goes BEFORE any suppression block — it gives compositional
 * hierarchy rather than just a list of negatives.
 */
export function buildPriorityDirective(authority: SlotAuthority): string {
  const priorities = PRIORITY_MATRIX[authority];
  const primaryItems: string[] = [];
  const secondaryItems: string[] = [];
  const backgroundItems: string[] = [];
  const forbiddenItems: string[] = [];

  for (const [truthClass, priority] of Object.entries(priorities) as Array<[TruthClass, VisualPriority]>) {
    const labels = TRUTH_CLASS_LABELS[truthClass];
    switch (priority) {
      case 'primary':
        primaryItems.push(labels.primary);
        break;
      case 'secondary':
        secondaryItems.push(labels.secondary);
        break;
      case 'background':
        backgroundItems.push(labels.background);
        break;
      case 'forbidden':
        forbiddenItems.push(labels.primary); // Use the primary label to describe what's forbidden
        break;
    }
  }

  const lines = [
    `[VISUAL PRIORITY — SLOT AUTHORITY: ${authority}]`,
  ];

  if (primaryItems.length > 0) {
    lines.push(`PRIMARY SUBJECT (must dominate frame): ${primaryItems.join('; ')}`);
  }
  if (secondaryItems.length > 0) {
    lines.push(`SECONDARY (may appear, not focal): ${secondaryItems.join('; ')}`);
  }
  if (backgroundItems.length > 0) {
    lines.push(`BACKGROUND ONLY (traces permitted, never focal): ${backgroundItems.join('; ')}`);
  }
  if (forbiddenItems.length > 0) {
    lines.push(`FORBIDDEN (must not appear): ${forbiddenItems.join('; ')}`);
  }

  return lines.join('\n');
}

// ── Domain → Authority Resolution ────────────────────────────────────────────

const WORKSHOP_KEYWORDS = [
  'workshop', 'studio', 'forge', 'smithy', 'kiln room', 'atelier',
  'workroom', 'laboratory', 'foundry', 'pottery',
];

/**
 * Resolve slot authority from a PD domain and target name.
 */
export function resolveAuthorityForPDDomain(
  domain: string,
  targetName?: string,
): SlotAuthority {
  switch (domain) {
    case 'production_design_location': {
      const name = (targetName || '').toLowerCase();
      if (WORKSHOP_KEYWORDS.some(kw => name.includes(kw))) {
        return 'workshop_interior';
      }
      return 'world_location';
    }
    case 'production_design_atmosphere':
      return 'atmosphere_lighting';
    case 'production_design_texture':
      return 'surface_language';
    case 'production_design_motif':
      return 'motif_symbolic';
    // World-level costume domains removed — costume is character-driven now
    default:
      return 'world_location';
  }
}
