/**
 * semanticRoleInterpreter — Generalized Production Design Semantic Interpretation Layer.
 *
 * Converts raw canon/style/location language into interpreted visual roles,
 * NOT direct prompt subjects. Prevents contextual nouns (pottery, books, tools,
 * flowers, food, weapons, etc.) from becoming dominant image subjects when they
 * should be contextual dressing.
 *
 * This is a universal, cross-product system — not tuned to any single project.
 */

// ── Visual Roles ─────────────────────────────────────────────────────────────

export type VisualRole =
  | 'structural_substrate'    // architecture, walls, floors, ceilings, beams
  | 'surface_condition'       // wear, aging, patina, moisture, damage
  | 'atmosphere_behavior'     // light, weather, air quality, time of day
  | 'contextual_dressing'     // objects that belong to a space but don't define it
  | 'occupation_trace'        // evidence of trade/craft/profession
  | 'status_signal'           // wealth, class, power indicators
  | 'symbolic_motif'          // recurring visual symbols, thematic objects
  | 'unclassified';           // safe fallback — treated as contextual

// ── Role Dominance per Slot Type ─────────────────────────────────────────────

export type RoleDominance = 'primary' | 'secondary' | 'contextual' | 'forbidden';

/**
 * Defines what role dominance is allowed for each PD slot purpose.
 * This is the canonical authority for what may dominate in any given visual.
 */
const ROLE_DOMINANCE_BY_SLOT: Record<string, Record<VisualRole, RoleDominance>> = {
  world_location: {
    structural_substrate: 'primary',
    surface_condition: 'secondary',
    atmosphere_behavior: 'secondary',
    contextual_dressing: 'contextual',
    occupation_trace: 'forbidden',
    status_signal: 'contextual',
    symbolic_motif: 'contextual',
    unclassified: 'contextual',
  },
  atmosphere_lighting: {
    structural_substrate: 'secondary',
    surface_condition: 'contextual',
    atmosphere_behavior: 'primary',
    contextual_dressing: 'contextual',
    occupation_trace: 'forbidden',
    status_signal: 'contextual',
    symbolic_motif: 'contextual',
    unclassified: 'contextual',
  },
  surface_language: {
    structural_substrate: 'primary',
    surface_condition: 'primary',
    atmosphere_behavior: 'contextual',
    contextual_dressing: 'contextual',
    occupation_trace: 'forbidden',
    status_signal: 'contextual',
    symbolic_motif: 'contextual',
    unclassified: 'contextual',
  },
  motif_symbolic: {
    structural_substrate: 'primary',
    surface_condition: 'primary',
    atmosphere_behavior: 'contextual',
    contextual_dressing: 'secondary',
    occupation_trace: 'secondary',
    status_signal: 'contextual',
    symbolic_motif: 'secondary',
    unclassified: 'contextual',
  },
  workshop_interior: {
    structural_substrate: 'primary',
    surface_condition: 'secondary',
    atmosphere_behavior: 'secondary',
    contextual_dressing: 'secondary',
    occupation_trace: 'secondary', // allowed but never primary
    status_signal: 'contextual',
    symbolic_motif: 'contextual',
    unclassified: 'contextual',
  },
  character_identity: {
    structural_substrate: 'contextual',
    surface_condition: 'contextual',
    atmosphere_behavior: 'contextual',
    contextual_dressing: 'contextual',
    occupation_trace: 'contextual',
    status_signal: 'secondary',
    symbolic_motif: 'contextual',
    unclassified: 'contextual',
  },
  action_expression: {
    structural_substrate: 'secondary',
    surface_condition: 'contextual',
    atmosphere_behavior: 'contextual',
    contextual_dressing: 'contextual',
    occupation_trace: 'primary',
    status_signal: 'contextual',
    symbolic_motif: 'contextual',
    unclassified: 'contextual',
  },
};

// ── Term Classification ──────────────────────────────────────────────────────

/**
 * Domain-specific term patterns that map nouns/phrases to visual roles.
 * This is extensible — new domains (medical, military, scholarly, etc.)
 * are added here, not in per-project code.
 */
const ROLE_PATTERNS: Array<{ role: VisualRole; terms: RegExp }> = [
  // Structural substrate
  {
    role: 'structural_substrate',
    terms: /\b(wall|floor|ceiling|beam|column|pillar|arch|doorway|window|roof|foundation|corridor|staircase|gate|fence|bridge|threshold|lintel|rafter|joist|timber frame|stone wall|plaster wall|earthen wall|brick wall|wooden floor|tatami|shoji|fusuma)\b/gi,
  },
  // Surface condition
  {
    role: 'surface_condition',
    terms: /\b(weathered|worn|aged|patina|cracked|peeling|faded|stained|rusted|corroded|moss|lichen|soot|char|scorch|damp|moisture|mold|dust|tarnished|polished|lacquered|burnished|rough|smooth|grain|knot|warp)\b/gi,
  },
  // Atmosphere behavior
  {
    role: 'atmosphere_behavior',
    terms: /\b(fog|mist|haze|smoke|steam|dust motes|shaft of light|dappled light|golden hour|blue hour|dawn|dusk|twilight|overcast|stormy|rain|snow|wind|humidity|dry heat|diffused light|harsh light|candlelight|firelight|lantern light|moonlight)\b/gi,
  },
  // Occupation/trade traces — UNIVERSAL, not pottery-specific
  {
    role: 'occupation_trace',
    terms: /\b(pottery|potter|ceramic|kiln|clay|glaze|wheel|loom|spindle|anvil|forge|bellows|hammer|tongs|chisel|lathe|easel|canvas|palette|brush|needle|thread|scalpel|stethoscope|microscope|test tube|beaker|mortar|pestle|plow|sickle|harvest|fishing net|rope|tackle|sword rack|weapon rack|armor stand|quiver|bow rack|lectern|scroll|ink stone|calligraphy|abacus|ledger|cooking pot|cauldron|oven|hearth fire|cutting board|mill|grindstone|press|distillery|still|workbench|tool rack|vise|clamp)\b/gi,
  },
  // Status / class signals
  {
    role: 'status_signal',
    terms: /\b(gold leaf|gilded|ornate|carved detail|inlay|marquetry|tapestry|silk curtain|velvet|brocade|lacquerware|porcelain display|crystal|chandelier|throne|dais|crest|coat of arms|family seal|mon|insignia|humble|rough-hewn|utilitarian|sparse|austere|opulent|lavish|sumptuous|refined|elegant)\b/gi,
  },
  // Production motif — physically real recurring objects/surfaces
  {
    role: 'symbolic_motif',
    terms: /\b(recurring|motif|pattern|repeated|fracture|repair|mend|broken|cracked|chipped|worn|patina|weathered|aged|restored|mended|repurposed|salvaged|threshold|boundary|gate|door|window frame|bridge|path|hearth|vessel|bowl|jar|pot|kiln|tool|instrument)\b/gi,
  },
  // Contextual dressing — objects that belong but don't define
  {
    role: 'contextual_dressing',
    terms: /\b(shelf|shelves|rack|basket|crate|barrel|jug|pot|bowl|plate|cup|lantern|candle|incense|vase|flower arrangement|scroll rack|book shelf|bookshelf|weapon display|trophy|ornament|figurine|clock|mirror|rug|mat|cushion|pillow|blanket|curtain|drape|screen|partition|stool|bench|table|chest|cabinet|drawer|wardrobe|trunk)\b/gi,
  },
];

// ── Classified Term ──────────────────────────────────────────────────────────

export interface ClassifiedTerm {
  original: string;
  role: VisualRole;
  /** Where in the source text this was found */
  source: 'canon' | 'style' | 'material' | 'location' | 'note';
}

// ── Interpreted Canon ────────────────────────────────────────────────────────

export interface InterpretedCanon {
  /** Terms grouped by visual role */
  byRole: Record<VisualRole, string[]>;
  /** All classified terms with provenance */
  classified: ClassifiedTerm[];
  /** Terms that could not be classified */
  unclassified: string[];
}

/**
 * Classify a text string into visual role terms.
 * Returns terms grouped by their visual role.
 */
export function classifyCanonText(
  text: string,
  source: ClassifiedTerm['source'] = 'canon',
): InterpretedCanon {
  const classified: ClassifiedTerm[] = [];
  const byRole: Record<VisualRole, string[]> = {
    structural_substrate: [],
    surface_condition: [],
    atmosphere_behavior: [],
    contextual_dressing: [],
    occupation_trace: [],
    status_signal: [],
    symbolic_motif: [],
    unclassified: [],
  };
  const matched = new Set<string>();

  for (const { role, terms } of ROLE_PATTERNS) {
    let match: RegExpExecArray | null;
    terms.lastIndex = 0;
    while ((match = terms.exec(text)) !== null) {
      const term = match[0].toLowerCase();
      if (!matched.has(term)) {
        matched.add(term);
        classified.push({ original: match[0], role, source });
        byRole[role].push(match[0]);
      }
    }
  }

  return { byRole, classified, unclassified: [] };
}

/**
 * Classify a material palette list into visual roles.
 */
export function classifyMaterials(
  materials: string[],
): InterpretedCanon {
  const combined = materials.join(', ');
  return classifyCanonText(combined, 'material');
}

// ── Role-Based Prompt Assembly ───────────────────────────────────────────────

/**
 * Get the role dominance map for a given slot purpose.
 * Falls back to world_location if unknown.
 */
export function getRoleDominance(slotPurpose: string): Record<VisualRole, RoleDominance> {
  return ROLE_DOMINANCE_BY_SLOT[slotPurpose] || ROLE_DOMINANCE_BY_SLOT.world_location;
}

/**
 * Filter classified terms by role dominance for a given slot.
 * Returns only terms that are allowed (not forbidden) for the slot.
 */
export function filterTermsBySlotPurpose(
  interpreted: InterpretedCanon,
  slotPurpose: string,
): { allowed: ClassifiedTerm[]; suppressed: ClassifiedTerm[] } {
  const dominance = getRoleDominance(slotPurpose);
  const allowed: ClassifiedTerm[] = [];
  const suppressed: ClassifiedTerm[] = [];

  for (const term of interpreted.classified) {
    if (dominance[term.role] === 'forbidden') {
      suppressed.push(term);
    } else {
      allowed.push(term);
    }
  }

  return { allowed, suppressed };
}

/**
 * Build a structured role-based prompt block that instructs the model
 * on what defines the world vs what is contextual dressing vs what is forbidden.
 *
 * This replaces raw material/canon flattening with structured semantic guidance.
 */
export function buildRoleBasedPromptBlock(
  interpreted: InterpretedCanon,
  slotPurpose: string,
): string {
  const dominance = getRoleDominance(slotPurpose);
  const lines: string[] = ['[SEMANTIC ROLE AUTHORITY]'];

  const primaryTerms: string[] = [];
  const secondaryTerms: string[] = [];
  const contextualTerms: string[] = [];
  const forbiddenRoles: VisualRole[] = [];

  for (const [role, level] of Object.entries(dominance) as Array<[VisualRole, RoleDominance]>) {
    const terms = interpreted.byRole[role];
    if (terms.length === 0 && level !== 'forbidden') continue;

    switch (level) {
      case 'primary':
        primaryTerms.push(...terms);
        break;
      case 'secondary':
        secondaryTerms.push(...terms);
        break;
      case 'contextual':
        contextualTerms.push(...terms);
        break;
      case 'forbidden':
        forbiddenRoles.push(role);
        break;
    }
  }

  if (primaryTerms.length > 0) {
    lines.push(`WORLD-DEFINING (must shape the frame): ${primaryTerms.join(', ')}`);
  }
  if (secondaryTerms.length > 0) {
    lines.push(`SUPPORTING (may appear, not focal): ${secondaryTerms.join(', ')}`);
  }
  if (contextualTerms.length > 0) {
    lines.push(`CONTEXTUAL DRESSING (traces only, never dominant): ${contextualTerms.join(', ')}`);
  }
  if (forbiddenRoles.length > 0) {
    const forbiddenLabels = forbiddenRoles.map(r => ROLE_LABELS[r]).filter(Boolean);
    lines.push(`FORBIDDEN AS SUBJECT: ${forbiddenLabels.join('; ')}`);
  }

  return lines.join('\n');
}

const ROLE_LABELS: Record<VisualRole, string> = {
  structural_substrate: 'architectural structure and spatial elements',
  surface_condition: 'surface wear, aging, and material condition',
  atmosphere_behavior: 'atmospheric conditions, light, weather',
  contextual_dressing: 'set dressing objects, furnishings',
  occupation_trace: 'trade/craft/occupation tools, activity, and labor evidence',
  status_signal: 'wealth, class, and power indicators',
  symbolic_motif: 'symbolic and thematic visual motifs',
  unclassified: 'unclassified contextual elements',
};

/**
 * Interpret raw canon/style/material text for a specific slot purpose.
 *
 * This is the main entry point for the semantic interpretation layer.
 * Returns a structured prompt block and suppressed terms.
 */
export function interpretForSlot(
  canonText: string,
  materials: string[],
  slotPurpose: string,
): {
  promptBlock: string;
  suppressedTerms: string[];
  interpretedCanon: InterpretedCanon;
} {
  // Classify everything
  const canonInterpreted = classifyCanonText(canonText, 'canon');
  const materialInterpreted = classifyMaterials(materials);

  // Merge
  const merged: InterpretedCanon = {
    byRole: { ...canonInterpreted.byRole },
    classified: [...canonInterpreted.classified, ...materialInterpreted.classified],
    unclassified: [...canonInterpreted.unclassified, ...materialInterpreted.unclassified],
  };
  for (const role of Object.keys(materialInterpreted.byRole) as VisualRole[]) {
    for (const term of materialInterpreted.byRole[role]) {
      if (!merged.byRole[role].includes(term)) {
        merged.byRole[role].push(term);
      }
    }
  }

  // Filter by slot purpose
  const { suppressed } = filterTermsBySlotPurpose(merged, slotPurpose);

  // Build structured prompt
  const promptBlock = buildRoleBasedPromptBlock(merged, slotPurpose);

  return {
    promptBlock,
    suppressedTerms: suppressed.map(t => t.original),
    interpretedCanon: merged,
  };
}
