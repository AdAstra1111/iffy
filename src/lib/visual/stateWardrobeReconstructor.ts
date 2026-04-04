/**
 * stateWardrobeReconstructor.ts — State-semantic garment reconstruction.
 *
 * When temporal exclusion removes forbidden garments, this module derives
 * state-specific replacement garments from the character profile's semantic
 * fields (class, labor variation, ceremonial variation, etc.) and temporal truth.
 *
 * ARCHITECTURE:
 * - Pure, deterministic, no DB/LLM calls
 * - Consumes CharacterWardrobeProfile semantic fields + TemporalTruth
 * - Returns state-appropriate garment suggestions, never forbidden items
 * - Does NOT replace scene-explicit concrete garments
 * - Precedence: profile semantics > era vocabulary > generic fallback
 *
 * ═══ VISUAL AUTHORITY BOUNDARY ═══
 * This module is the ONLY state-semantic reconstruction authority.
 * It MUST consume character-specific profile fields, not just era vocabularies.
 * If output is primarily era-fallback, it MUST flag this in diagnostics.
 * IEL: No forbidden garments may be returned. All outputs are
 * validated against temporal truth before return.
 */

import type { CharacterWardrobeProfile, WardrobeStateDefinition } from './characterWardrobeExtractor';
import type { TemporalTruth } from './temporalTruthResolver';

// ── Canon-First Upstream Inputs ─────────────────────────────────────────────

export interface WorldConstraints {
  /** e.g. 'medieval', '1920s', 'futuristic' */
  period?: string;
  /** e.g. 'Japanese', 'Victorian English', 'West African' */
  culture?: string;
  /** e.g. 'arid', 'tropical', 'arctic' */
  climate?: string;
}

export interface CharacterContext {
  /** e.g. 'elite', 'working', 'military', 'artisan' */
  class?: string;
  /** e.g. 'blacksmith', 'detective', 'merchant' */
  occupation?: string;
  /** e.g. 'nomadic', 'urban professional', 'rural farmer' */
  lifestyle?: string;
}

export interface CanonWardrobeInputs {
  /** Explicit garment references extracted from script/canon */
  scriptWardrobeHints?: string[];
  /** Scene/circumstance context strings */
  sceneContext?: string[];
  /** World-level constraints */
  worldConstraints?: WorldConstraints;
  /** Character identity context */
  characterContext?: CharacterContext;
}

// ── Baseline Wardrobe ───────────────────────────────────────────────────────

export interface BaselineWardrobe {
  baseGarments: string[];
  baseFabrics: string[];
  baseSilhouette: string;
  /** What drove the baseline: 'script', 'canon_character', 'profile', 'era_fallback' */
  baselineSource: 'script' | 'canon_character' | 'profile' | 'era_fallback';
}

// ── Period Plausibility ─────────────────────────────────────────────────────

const PERIOD_FORBIDDEN: Record<string, RegExp> = {
  medieval: /\b(jeans|t-shirt|hoodie|sneakers|blazer|jumpsuit|tactical vest|combat boots|polo|cardigan|loafers)\b/i,
  ancient: /\b(jeans|t-shirt|hoodie|sneakers|blazer|jumpsuit|tactical vest|combat boots|polo|cardigan|loafers|suit|jacket|trousers)\b/i,
  victorian: /\b(jeans|t-shirt|hoodie|sneakers|jumpsuit|tactical vest|combat boots|polo|hoodie)\b/i,
  futuristic: /\b(toga|loincloth|doublet|hose|surcoat|gambeson|breeches|petticoat|cravat)\b/i,
};

function filterByPeriodPlausibility(garments: string[], period?: string): string[] {
  if (!period) return garments;
  const periodLower = period.toLowerCase();
  // Find matching forbidden set
  for (const [key, re] of Object.entries(PERIOD_FORBIDDEN)) {
    if (periodLower.includes(key)) {
      return garments.filter(g => !re.test(g));
    }
  }
  return garments;
}

// ── Climate Modifiers ───────────────────────────────────────────────────────

function resolveClimateModifier(climate?: string): string {
  if (!climate) return '';
  const c = climate.toLowerCase();
  if (/arctic|cold|frozen|tundra|winter/i.test(c)) return 'heavy insulated';
  if (/arid|desert|dry|hot/i.test(c)) return 'light breathable';
  if (/tropical|humid|monsoon/i.test(c)) return 'light loose-weave';
  if (/temperate|moderate/i.test(c)) return '';
  return '';
}

/**
 * resolveBaselineWardrobe — Canon-first baseline garment resolution.
 *
 * PRECEDENCE:
 * 1. scriptWardrobeHints (HIGHEST — explicit script evidence)
 * 2. characterContext class/occupation + profile identity
 * 3. profile signature garments
 * 4. era vocabulary (LOWEST)
 *
 * DETERMINISTIC: No randomness, no DB, no LLM.
 */
export function resolveBaselineWardrobe(
  profile: CharacterWardrobeProfile,
  canonInputs?: CanonWardrobeInputs,
  temporalTruth?: TemporalTruth | null,
): BaselineWardrobe {
  const period = canonInputs?.worldConstraints?.period;
  const climate = canonInputs?.worldConstraints?.climate;
  const characterClass = canonInputs?.characterContext?.class || profile.class_status_expression || '';
  const occupation = canonInputs?.characterContext?.occupation || '';

  // ── 1. Script hints — highest priority ──
  if (canonInputs?.scriptWardrobeHints && canonInputs.scriptWardrobeHints.length >= 2) {
    const garments = filterByPeriodPlausibility(canonInputs.scriptWardrobeHints, period);
    if (garments.length >= 2) {
      const climatePrefix = resolveClimateModifier(climate);
      return {
        baseGarments: garments,
        baseFabrics: profile.fabric_language ? profile.fabric_language.split(',').map(s => s.trim()).filter(Boolean) : [],
        baseSilhouette: climatePrefix
          ? `${climatePrefix}, ${profile.silhouette_language || 'role-appropriate'}`
          : (profile.silhouette_language || 'role-appropriate'),
        baselineSource: 'script',
      };
    }
  }

  // ── 2. Character context (class + occupation) → derive from profile + context ──
  const classMod = resolveClassModifier(characterClass);
  const profileGarments = extractGarmentsFromProse(
    [profile.wardrobe_identity_summary, profile.labor_formality_variation, profile.public_private_variation, occupation].filter(Boolean).join('. '),
  );

  if (profileGarments.length >= 2 || (canonInputs?.scriptWardrobeHints?.length === 1 && profileGarments.length >= 1)) {
    // Merge script hint (if single) with profile garments
    let merged = canonInputs?.scriptWardrobeHints?.length === 1
      ? [...canonInputs.scriptWardrobeHints, ...profileGarments.filter(g => g.toLowerCase() !== canonInputs.scriptWardrobeHints![0].toLowerCase())]
      : [...profileGarments];

    // Also merge signature_garments that aren't already present (preserves extractor output)
    for (const sg of profile.signature_garments) {
      if (!merged.some(g => g.toLowerCase() === sg.toLowerCase())) {
        merged.push(sg);
      }
    }

    const garments = filterByPeriodPlausibility(merged, period);

    // Apply class quality prefix
    if (classMod.quality_prefix && garments.length > 0 && !garments[0].includes(classMod.quality_prefix)) {
      garments[0] = `${classMod.quality_prefix} ${garments[0]}`;
    }

    const climatePrefix = resolveClimateModifier(climate);
    return {
      baseGarments: garments,
      baseFabrics: classMod.material_bias
        ? classMod.material_bias.split(',').map(s => s.trim()).filter(Boolean)
        : (profile.fabric_language ? profile.fabric_language.split(',').map(s => s.trim()).filter(Boolean) : []),
      baseSilhouette: climatePrefix
        ? `${climatePrefix}, ${profile.silhouette_language || 'role-appropriate'}`
        : (profile.silhouette_language || 'role-appropriate'),
      baselineSource: 'canon_character',
    };
  }

  // ── 3. Profile signature garments ──
  if (profile.signature_garments.length >= 2) {
    const garments = filterByPeriodPlausibility([...profile.signature_garments], period);
    if (classMod.quality_prefix && garments.length > 0 && !garments[0].includes(classMod.quality_prefix)) {
      garments[0] = `${classMod.quality_prefix} ${garments[0]}`;
    }
    return {
      baseGarments: garments,
      baseFabrics: profile.fabric_language ? profile.fabric_language.split(',').map(s => s.trim()).filter(Boolean) : [],
      baseSilhouette: profile.silhouette_language || 'role-appropriate',
      baselineSource: 'profile',
    };
  }

  // ── 4. Era vocabulary fallback ──
  // IEL: 'ambiguous' and missing era default to 'contemporary', never 'medieval' or other historical
  const eraFamily = temporalTruth?.family || 'modern';
  const era = temporalTruth?.era || 'contemporary';
  const vocab = ERA_VOCABULARIES[era] || ERA_VOCABULARIES[eraFamily] || ERA_VOCABULARIES['contemporary'];
  const eraGarments = [...vocab.default];
  if (classMod.quality_prefix && eraGarments.length > 0 && !eraGarments[0].includes(classMod.quality_prefix)) {
    eraGarments[0] = `${classMod.quality_prefix} ${eraGarments[0]}`;
  }
  return {
    baseGarments: eraGarments,
    baseFabrics: classMod.material_bias
      ? classMod.material_bias.split(',').map(s => s.trim()).filter(Boolean)
      : [],
    baseSilhouette: profile.silhouette_language || 'role-appropriate',
    baselineSource: 'era_fallback',
  };
}

// ── State Category Classification ───────────────────────────────────────────

export type StateCategory =
  | 'work_labor'
  | 'domestic_private'
  | 'public_formal'
  | 'ceremonial'
  | 'travel'
  | 'distress_aftermath'
  | 'disguise_concealment'
  | 'weather_adapted'
  | 'combat_action'
  | 'rest_leisure'
  | 'default';

const STATE_CATEGORY_PATTERNS: Array<{ category: StateCategory; patterns: RegExp[] }> = [
  {
    category: 'work_labor',
    patterns: [/\bwork/i, /\blabor/i, /\boccupation/i, /\btrade/i, /\bcraft/i, /\bduty/i, /\bprofession/i],
  },
  {
    category: 'domestic_private',
    patterns: [/\bdomestic/i, /\bprivate/i, /\bhome/i, /\bintimate/i, /\bindoor/i, /\brelax/i, /\bsleep/i, /\bnight/i, /\bmorning/i],
  },
  {
    category: 'public_formal',
    patterns: [/\bpublic/i, /\bformal/i, /\bofficial/i, /\bcourt/i, /\bsocial/i, /\bgathering/i, /\bmeeting/i, /\bdiploma/i],
  },
  {
    category: 'ceremonial',
    patterns: [/\bceremon/i, /\britual/i, /\bfestiv/i, /\bwedding/i, /\bfuneral/i, /\bcelebrat/i, /\bsacred/i, /\breligious/i],
  },
  {
    category: 'travel',
    patterns: [/\btravel/i, /\bjourney/i, /\broad/i, /\bmarch/i, /\bexpedition/i, /\bwander/i],
  },
  {
    category: 'distress_aftermath',
    patterns: [/\bdistress/i, /\baftermath/i, /\bwound/i, /\bdamage/i, /\btorn/i, /\binjur/i, /\bgrief/i, /\bflight/i, /\bescape/i],
  },
  {
    category: 'disguise_concealment',
    patterns: [/\bdisguise/i, /\bconceal/i, /\bhidden/i, /\bundercover/i, /\bincognito/i],
  },
  {
    category: 'weather_adapted',
    patterns: [/\bweather/i, /\brain/i, /\bstorm/i, /\bcold/i, /\bheat/i, /\bwinter/i, /\bsummer/i, /\bsnow/i],
  },
  {
    category: 'combat_action',
    patterns: [/\bcombat/i, /\bfight/i, /\bbattle/i, /\baction/i, /\bchase/i, /\bconfront/i],
  },
  {
    category: 'rest_leisure',
    patterns: [/\brest/i, /\bleisure/i, /\brecovery/i, /\bidle/i],
  },
];

/**
 * Classify a state into a semantic category from its label and trigger conditions.
 */
export function classifyStateCategory(state: WardrobeStateDefinition): StateCategory {
  const searchText = [state.label, state.state_key, ...state.trigger_conditions, state.rationale].join(' ');
  for (const { category, patterns } of STATE_CATEGORY_PATTERNS) {
    if (patterns.some(p => p.test(searchText))) {
      return category;
    }
  }
  return 'default';
}

// ── Intelligence Source Tracking ────────────────────────────────────────────

export type IntelligenceSource =
  | 'profile_labor_variation'
  | 'profile_ceremonial_variation'
  | 'profile_public_private_variation'
  | 'profile_damage_wear_logic'
  | 'profile_class_expression'
  | 'profile_identity_summary'
  | 'profile_costume_constraints'
  | 'profile_fabric_language'
  | 'era_vocabulary'
  | 'generic_fallback';

// ── Profile Semantic Extraction ─────────────────────────────────────────────

const GARMENT_EXTRACT_RE = /\b(robe|kimono|hakama|obi|haori|kosode|tunic|shirt|blouse|vest|jacket|coat|cloak|cape|shawl|sash|apron|skirt|trousers|pants|dress|gown|toga|sarong|caftan|tabard|doublet|bodice|corset|smock|uniform|armor|armour|boots|sandals|shoes|slippers|hat|cap|hood|veil|turban|scarf|wrap|belt|gloves|headwrap|suit|blazer|jeans|t-shirt|sweater|cardigan|hoodie|sneakers|heels|loafers|shorts|jumpsuit|overalls|breeches|stockings|petticoat|cravat|waistcoat|frock\s*coat|duster|poncho|sheath|shift|chemise|undergarment|nightgown|dressing\s*gown|work\s*shirt|work\s*boots|riding\s*boots|work\s*tunic|tool\s*belt|leather\s*apron|heavy\s*cloak|travel\s*cloak|fur-lined\s*cloak)\b/gi;

/**
 * Extract concrete garment nouns from a prose description.
 * Used to mine profile semantic fields for character-specific garments.
 */
function extractGarmentsFromProse(text: string): string[] {
  if (!text) return [];
  const matches = text.match(GARMENT_EXTRACT_RE) || [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of matches) {
    const norm = m.toLowerCase().trim();
    if (!seen.has(norm)) {
      seen.add(norm);
      result.push(norm);
    }
  }
  return result;
}

/**
 * Extract quality/condition modifiers from a prose description.
 */
function extractModifiersFromProse(text: string): string[] {
  if (!text) return [];
  const modifiers: string[] = [];
  const modPatterns: Array<{ re: RegExp; mod: string }> = [
    { re: /\b(fine|elegant|refined|luxurious|opulent|rich)\b/i, mod: 'fine' },
    { re: /\b(rough|coarse|worn|weathered|faded|patched|mended)\b/i, mod: 'worn' },
    { re: /\b(plain|simple|humble|modest|unadorned)\b/i, mod: 'plain' },
    { re: /\b(ornate|embroidered|decorated|adorned|brocaded|gilded)\b/i, mod: 'ornate' },
    { re: /\b(sturdy|reinforced|heavy-duty|durable|thick)\b/i, mod: 'sturdy' },
    { re: /\b(tattered|ripped|torn|bloodied|stained|mud-caked|soiled)\b/i, mod: 'damaged' },
    { re: /\b(crisp|pressed|starched|immaculate|pristine)\b/i, mod: 'pristine' },
    { re: /\b(loose|flowing|layered|draped|gathered)\b/i, mod: 'flowing' },
    { re: /\b(tight|fitted|tailored|structured|cinched)\b/i, mod: 'fitted' },
  ];
  for (const { re, mod } of modPatterns) {
    if (re.test(text)) modifiers.push(mod);
  }
  return modifiers;
}

// ── Category-Specific Profile Field Mapping ─────────────────────────────────

interface ProfileSemanticResult {
  garments: string[];
  modifiers: string[];
  sources: IntelligenceSource[];
}

/**
 * Extract character-specific garments and modifiers from profile semantic fields
 * relevant to the given state category.
 *
 * PRECEDENCE: Profile semantics > era vocabulary.
 * This is where character identity enters reconstruction.
 */
function extractProfileSemanticsForCategory(
  profile: CharacterWardrobeProfile,
  category: StateCategory,
): ProfileSemanticResult {
  const garments: string[] = [];
  const modifiers: string[] = [];
  const sources: IntelligenceSource[] = [];

  // ── Category-specific field consumption ──

  if (category === 'work_labor' && profile.labor_formality_variation) {
    const extracted = extractGarmentsFromProse(profile.labor_formality_variation);
    const mods = extractModifiersFromProse(profile.labor_formality_variation);
    if (extracted.length > 0 || mods.length > 0) {
      garments.push(...extracted);
      modifiers.push(...mods);
      sources.push('profile_labor_variation');
    }
  }

  if (category === 'ceremonial' && profile.ceremonial_variation) {
    const extracted = extractGarmentsFromProse(profile.ceremonial_variation);
    const mods = extractModifiersFromProse(profile.ceremonial_variation);
    if (extracted.length > 0 || mods.length > 0) {
      garments.push(...extracted);
      modifiers.push(...mods);
      sources.push('profile_ceremonial_variation');
    }
  }

  if ((category === 'public_formal' || category === 'domestic_private') && profile.public_private_variation) {
    const extracted = extractGarmentsFromProse(profile.public_private_variation);
    const mods = extractModifiersFromProse(profile.public_private_variation);
    if (extracted.length > 0 || mods.length > 0) {
      garments.push(...extracted);
      modifiers.push(...mods);
      sources.push('profile_public_private_variation');
    }
  }

  if (category === 'distress_aftermath' && profile.damage_wear_logic) {
    const extracted = extractGarmentsFromProse(profile.damage_wear_logic);
    const mods = extractModifiersFromProse(profile.damage_wear_logic);
    if (extracted.length > 0 || mods.length > 0) {
      garments.push(...extracted);
      modifiers.push(...mods);
      sources.push('profile_damage_wear_logic');
    }
  }

  // ── Cross-category: identity summary (always available, lower priority) ──
  if (garments.length === 0 && profile.wardrobe_identity_summary) {
    const extracted = extractGarmentsFromProse(profile.wardrobe_identity_summary);
    if (extracted.length > 0) {
      garments.push(...extracted);
      sources.push('profile_identity_summary');
    }
  }

  // ── Cross-category: class expression ──
  if (profile.class_status_expression) {
    const mods = extractModifiersFromProse(profile.class_status_expression);
    if (mods.length > 0) {
      modifiers.push(...mods);
      sources.push('profile_class_expression');
    }
  }

  // ── Cross-category: costume constraints (negative/positive) ──
  if (profile.costume_constraints && profile.costume_constraints.length > 0) {
    const constraintText = profile.costume_constraints.join(' ');
    const constraintGarments = extractGarmentsFromProse(constraintText);
    if (constraintGarments.length > 0) {
      // Constraints that mention garments may indicate what TO wear or NOT wear.
      // We only add if the constraint is affirmative (not "never" / "no" / "avoid").
      for (const g of constraintGarments) {
        const ctx = constraintText.toLowerCase();
        const gIdx = ctx.indexOf(g.toLowerCase());
        if (gIdx >= 0) {
          const prefix = ctx.slice(Math.max(0, gIdx - 20), gIdx);
          if (!/\b(never|no|avoid|not|without|forbid)\b/i.test(prefix)) {
            garments.push(g);
          }
        }
      }
      if (garments.length > 0) sources.push('profile_costume_constraints');
    }
  }

  // Deduplicate
  const seenG = new Set<string>();
  const uniqueG = garments.filter(g => {
    const k = g.toLowerCase();
    if (seenG.has(k)) return false;
    seenG.add(k);
    return true;
  });

  return { garments: uniqueG, modifiers: [...new Set(modifiers)], sources: [...new Set(sources)] };
}

// ── Era-Aware Garment Vocabularies ──────────────────────────────────────────

interface EraVocabulary {
  work_labor: string[];
  domestic_private: string[];
  public_formal: string[];
  ceremonial: string[];
  travel: string[];
  distress_aftermath: string[];
  disguise_concealment: string[];
  weather_adapted: string[];
  combat_action: string[];
  rest_leisure: string[];
  default: string[];
}

/** Garment vocabularies keyed by era family. Deterministic, no LLM. */
const ERA_VOCABULARIES: Record<string, EraVocabulary> = {
  modern: {
    work_labor: ['work shirt', 'sturdy trousers', 'work boots', 'tool belt'],
    domestic_private: ['casual shirt', 'comfortable trousers', 'house shoes'],
    public_formal: ['suit jacket', 'dress shirt', 'dress trousers', 'polished shoes'],
    ceremonial: ['formal suit', 'dress shirt', 'tie', 'dress shoes'],
    travel: ['jacket', 'durable trousers', 'travel boots', 'shoulder bag'],
    distress_aftermath: ['torn shirt', 'stained trousers', 'scuffed boots'],
    disguise_concealment: ['nondescript jacket', 'plain cap', 'dark trousers'],
    weather_adapted: ['heavy coat', 'weatherproof boots', 'layered clothing'],
    combat_action: ['tactical vest', 'reinforced trousers', 'combat boots'],
    rest_leisure: ['soft shirt', 'loose trousers', 'comfortable shoes'],
    default: ['shirt', 'trousers', 'shoes'],
  },
  western: {
    work_labor: ['work shirt', 'denim trousers', 'worn boots', 'leather gloves'],
    domestic_private: ['undershirt', 'loose trousers', 'suspenders'],
    public_formal: ['frock coat', 'waistcoat', 'pressed trousers', 'polished boots'],
    ceremonial: ['best coat', 'clean shirt', 'string tie', 'dress boots'],
    travel: ['duster coat', 'trail-worn trousers', 'riding boots', 'saddlebag'],
    distress_aftermath: ['bloodied shirt', 'torn trousers', 'dusty boots'],
    disguise_concealment: ['borrowed coat', 'pulled-down hat', 'bandana'],
    weather_adapted: ['sheepskin coat', 'heavy boots', 'wool-lined hat'],
    combat_action: ['gun belt', 'reinforced vest', 'sturdy boots'],
    rest_leisure: ['open-collar shirt', 'loose trousers', 'bare feet'],
    default: ['shirt', 'trousers', 'boots', 'hat'],
  },
  medieval: {
    work_labor: ['work tunic', 'rough trousers', 'leather apron', 'sturdy shoes'],
    domestic_private: ['shift', 'loose breeches', 'house shoes'],
    public_formal: ['fine doublet', 'tailored hose', 'leather belt', 'polished boots'],
    ceremonial: ['embroidered surcoat', 'formal belt', 'ceremonial shoes'],
    travel: ['travel cloak', 'layered tunic', 'walking boots', 'pack'],
    distress_aftermath: ['torn tunic', 'muddied trousers', 'bare feet'],
    disguise_concealment: ['hooded cloak', 'plain tunic', 'common sandals'],
    weather_adapted: ['fur-lined cloak', 'heavy tunic', 'thick boots'],
    combat_action: ['gambeson', 'leather bracers', 'armored boots'],
    rest_leisure: ['soft shift', 'loose breeches', 'bare feet'],
    default: ['tunic', 'trousers', 'belt', 'boots'],
  },
  victorian: {
    work_labor: ['work shirt', 'sturdy waistcoat', 'heavy trousers', 'work boots'],
    domestic_private: ['dressing gown', 'nightshirt', 'slippers'],
    public_formal: ['tailcoat', 'starched shirt', 'cravat', 'top hat'],
    ceremonial: ['morning coat', 'silk waistcoat', 'formal trousers', 'gloves'],
    travel: ['overcoat', 'sturdy suit', 'travel case', 'walking boots'],
    distress_aftermath: ['disheveled shirt', 'loosened collar', 'scuffed shoes'],
    disguise_concealment: ['common workman clothes', 'flat cap', 'worn boots'],
    weather_adapted: ['heavy overcoat', 'muffler', 'galoshes', 'umbrella'],
    combat_action: ['reinforced coat', 'leather boots', 'belt'],
    rest_leisure: ['smoking jacket', 'comfortable trousers', 'house slippers'],
    default: ['shirt', 'waistcoat', 'trousers', 'boots'],
  },
  ancient: {
    work_labor: ['work loincloth', 'rough sandals', 'leather belt'],
    domestic_private: ['simple wrap', 'loose linen shift'],
    public_formal: ['draped toga', 'fine sandals', 'golden brooch'],
    ceremonial: ['ceremonial robe', 'ritual jewelry', 'ornate sandals'],
    travel: ['travelling cloak', 'sturdy sandals', 'shoulder satchel'],
    distress_aftermath: ['torn garment', 'bare feet', 'rope marks'],
    disguise_concealment: ['hooded cloak', 'common sandals', 'plain wrap'],
    weather_adapted: ['heavy cloak', 'layered wraps', 'fur-lined sandals'],
    combat_action: ['leather cuirass', 'greaves', 'war sandals'],
    rest_leisure: ['light linen shift', 'bare feet'],
    default: ['tunic', 'sandals', 'belt'],
  },
  futuristic: {
    work_labor: ['utility jumpsuit', 'reinforced boots', 'tool harness'],
    domestic_private: ['soft bodysuit', 'lightweight shoes'],
    public_formal: ['tailored jacket', 'slim trousers', 'polished boots'],
    ceremonial: ['ceremonial uniform', 'rank insignia', 'formal boots'],
    travel: ['travel suit', 'sealed boots', 'pack module'],
    distress_aftermath: ['damaged suit', 'emergency patches', 'scuffed boots'],
    disguise_concealment: ['stealth suit', 'face shield', 'dark boots'],
    weather_adapted: ['environmental suit', 'sealed boots', 'thermal layer'],
    combat_action: ['tactical suit', 'armored vest', 'combat boots'],
    rest_leisure: ['leisure suit', 'comfortable shoes'],
    default: ['jumpsuit', 'boots'],
  },
  // IEL: 'contemporary' is the safe default when no era evidence exists.
  // Must exist as a standalone vocabulary — never silently fall to 'modern'.
  contemporary: {
    work_labor: ['work shirt', 'chinos', 'sneakers', 'lanyard'],
    domestic_private: ['t-shirt', 'sweatpants', 'socks'],
    public_formal: ['blazer', 'dress shirt', 'tailored trousers', 'loafers'],
    ceremonial: ['suit', 'dress shirt', 'tie', 'polished shoes'],
    travel: ['jacket', 'jeans', 'comfortable shoes', 'backpack'],
    distress_aftermath: ['torn shirt', 'stained jeans', 'scuffed sneakers'],
    disguise_concealment: ['hoodie', 'cap', 'dark jeans', 'sunglasses'],
    weather_adapted: ['puffer jacket', 'waterproof boots', 'layered clothing'],
    combat_action: ['tactical vest', 'cargo trousers', 'combat boots'],
    rest_leisure: ['hoodie', 'joggers', 'slippers'],
    default: ['shirt', 'jeans', 'sneakers'],
  },
  // IEL: 'ambiguous' maps to contemporary — unknown era never defaults to historical.
  ambiguous: {
    work_labor: ['work shirt', 'chinos', 'sneakers', 'lanyard'],
    domestic_private: ['t-shirt', 'sweatpants', 'socks'],
    public_formal: ['blazer', 'dress shirt', 'tailored trousers', 'loafers'],
    ceremonial: ['suit', 'dress shirt', 'tie', 'polished shoes'],
    travel: ['jacket', 'jeans', 'comfortable shoes', 'backpack'],
    distress_aftermath: ['torn shirt', 'stained jeans', 'scuffed sneakers'],
    disguise_concealment: ['hoodie', 'cap', 'dark jeans', 'sunglasses'],
    weather_adapted: ['puffer jacket', 'waterproof boots', 'layered clothing'],
    combat_action: ['tactical vest', 'cargo trousers', 'combat boots'],
    rest_leisure: ['hoodie', 'joggers', 'slippers'],
    default: ['shirt', 'jeans', 'sneakers'],
  },
};

// ── Class-Based Modifiers ───────────────────────────────────────────────────

interface ClassModifier {
  quality_prefix: string;
  material_bias: string;
}

function resolveClassModifier(classExpression: string): ClassModifier {
  const lower = classExpression.toLowerCase();
  if (/elite|noble|aristocrat|wealthy|upper/i.test(lower)) {
    return { quality_prefix: 'fine', material_bias: 'silk, velvet' };
  }
  if (/working|laborer|peasant|servant|lower/i.test(lower)) {
    return { quality_prefix: 'sturdy', material_bias: 'cotton, rough linen' };
  }
  if (/artisan|merchant|middle/i.test(lower)) {
    return { quality_prefix: 'well-made', material_bias: 'good wool, linen' };
  }
  if (/military|soldier|warrior/i.test(lower)) {
    return { quality_prefix: 'regulation', material_bias: 'canvas, leather' };
  }
  return { quality_prefix: '', material_bias: '' };
}

// ── Transformation Axes ─────────────────────────────────────────────────────

/**
 * TransformationAxes — 8 mandatory visual differentiation axes.
 *
 * IEL: Each non-default state MUST produce distinct axis values.
 * States do NOT define clothing — they MODIFY already-derived baseline
 * wardrobe along these axes. Each axis MUST differ across states.
 *
 * This is the ONLY mechanism for ensuring visual distinctness.
 */
export interface TransformationAxes {
  /** e.g. "loose layered", "fitted streamlined", "bulky protective" */
  silhouette: string;
  /** e.g. "worn cotton", "polished leather", "rough canvas" */
  material_finish: string;
  /** e.g. "pristine", "dusty", "mud-caked", "blood-stained" */
  cleanliness: string;
  /** e.g. "structured formal", "loose relaxed", "misfastened" */
  structure_fit: string;
  /** e.g. "heavy layered", "minimal single layer", "protective outer" */
  layering: string;
  /** e.g. "symbolic pendant", "no ornament", "rank insignia" */
  ornament_detail: string;
  /** e.g. "none", "torn seam", "missing buttons", "asymmetric" */
  damage_wear: string;
  /** e.g. "authority projecting", "invisible/anonymous", "approachable" */
  social_readability: string;
}

/**
 * Resolve transformation axes from character identity + state category.
 *
 * IEL: Axes are ALWAYS derived from character class/identity + state semantics.
 * Never from state label alone. Never generic across all characters.
 */
export function resolveTransformationAxes(
  profile: CharacterWardrobeProfile,
  category: StateCategory,
): TransformationAxes {
  const classLower = (profile.class_status_expression || '').toLowerCase();
  const isElite = /elite|noble|aristocrat|wealthy|upper|executive|ceo|tycoon/i.test(classLower);
  const isMilitary = /military|soldier|warrior|tactical|combat|guard|operative|agent/i.test(classLower);
  const isWorking = /working|laborer|peasant|servant|farmer|artisan|craftsman/i.test(classLower);
  const isProfessional = /professional|doctor|lawyer|teacher|journalist|detective/i.test(classLower);

  // Base quality derived from character identity
  const qualityBase = isElite ? 'fine' : isMilitary ? 'regulation' : isWorking ? 'sturdy' : isProfessional ? 'clean' : 'ordinary';
  const materialBase = isElite ? 'silk, wool' : isMilitary ? 'canvas, leather' : isWorking ? 'cotton, rough linen' : isProfessional ? 'cotton, wool' : 'cotton';

  // Category-specific transformations grounded in character identity
  switch (category) {
    case 'work_labor':
      return {
        silhouette: isElite ? 'slightly loosened but quality-cut' : isMilitary ? 'functional streamlined' : 'loose practical',
        material_finish: isWorking ? 'worn rough-textured' : isElite ? 'protected by apron over fine cloth' : `${qualityBase} utilitarian`,
        cleanliness: 'tool-marked, material-stained, honest wear',
        structure_fit: 'relaxed functional, rolled sleeves',
        layering: isWorking ? 'heavy protective layers' : 'minimal functional layers',
        ornament_detail: 'removed or tucked away, practical only',
        damage_wear: 'tool wear, material stains, functional scuffing',
        social_readability: 'occupation-signaling, competence-projecting',
      };
    case 'domestic_private':
      return {
        silhouette: 'soft relaxed, unstructured',
        material_finish: `${qualityBase} soft-textured, comfortable`,
        cleanliness: 'clean but unstaged, natural',
        structure_fit: 'unfastened, loose, draped',
        layering: isElite ? 'quality dressing gown over nightwear' : 'minimal comfortable layers',
        ornament_detail: 'absent or personal-sentimental only',
        damage_wear: 'loved-in softness, pillow marks, natural wear',
        social_readability: 'private, unperformed, authentic',
      };
    case 'public_formal':
      return {
        silhouette: isElite ? 'tailored commanding' : isMilitary ? 'regulation crisp' : 'best-version structured',
        material_finish: isElite ? 'polished luxurious' : `${qualityBase} pressed`,
        cleanliness: 'immaculate, deliberate',
        structure_fit: 'fully fastened, properly fitted',
        layering: isElite ? 'deliberate compositional layers' : 'socially appropriate layers',
        ornament_detail: isElite ? 'status-signaling jewelry or insignia' : isMilitary ? 'rank insignia, medals' : 'minimal tasteful',
        damage_wear: 'none visible',
        social_readability: isElite ? 'authority and wealth projecting' : isMilitary ? 'rank-projecting' : 'respectability-projecting',
      };
    case 'ceremonial':
      return {
        silhouette: 'elevated, occasion-specific, dramatic',
        material_finish: isElite ? 'finest available, luxurious sheen' : `upgraded ${qualityBase}, enhanced finish`,
        cleanliness: 'pristine, ceremonially pure',
        structure_fit: 'formal precise, occasion-structured',
        layering: 'symbolic additional layers, ritual-specific',
        ornament_detail: 'maximal for class — symbolic/ritual elements added',
        damage_wear: 'absolutely none',
        social_readability: 'role-in-ceremony signaling, elevated status display',
      };
    case 'travel':
      return {
        silhouette: 'layered protective, movement-ready',
        material_finish: `${qualityBase} weather-resistant, durable`,
        cleanliness: 'road-dusty, travel-worn',
        structure_fit: 'practical, secured for movement',
        layering: 'weather-responsive, removable outer protection',
        ornament_detail: 'secured or hidden, nothing dangly',
        damage_wear: 'journey accumulation, dust, minor snags',
        social_readability: 'traveler-signaling, origin-hinting',
      };
    case 'distress_aftermath':
      return {
        silhouette: 'disrupted, asymmetric, diminished',
        material_finish: `${qualityBase} but degraded, stained, compromised`,
        cleanliness: 'dirty, stained, possibly blood-marked',
        structure_fit: 'misfastened, torn, structural integrity lost',
        layering: 'reduced — layers lost, torn, or missing',
        ornament_detail: 'lost, broken, or clutched',
        damage_wear: 'heavy — torn seams, missing buttons, material rips',
        social_readability: 'vulnerability signaling, status stripped',
      };
    case 'disguise_concealment':
      return {
        silhouette: 'deliberately altered, class-masking',
        material_finish: isElite ? 'deliberately downgraded materials' : 'nondescript common',
        cleanliness: 'appropriately unnoticeable',
        structure_fit: 'concealing, face-obscuring elements',
        layering: 'concealment layers — hood, scarf, outer wraps',
        ornament_detail: 'identity markers hidden or removed',
        damage_wear: 'staged to match assumed identity',
        social_readability: 'deliberately misread — wrong class or occupation signaled',
      };
    case 'weather_adapted':
      return {
        silhouette: 'bulked by protection, weather-modified',
        material_finish: `${qualityBase} weatherproof, climate-adapted`,
        cleanliness: 'weather-affected — rain-wet, snow-dusted, sun-faded',
        structure_fit: 'sealed, cinched against elements',
        layering: 'heavy weather-responsive, insulating or ventilating',
        ornament_detail: 'hidden under protection',
        damage_wear: 'weather-stress — salt marks, sun bleach, rain stains',
        social_readability: 'reduced by weather gear, class harder to read',
      };
    case 'combat_action':
      return {
        silhouette: isMilitary ? 'tactical streamlined' : 'movement-ready, stripped down',
        material_finish: isMilitary ? 'tactical reinforced' : `${qualityBase} but protective`,
        cleanliness: 'action-marked — sweat, dirt, impact',
        structure_fit: 'secured tight, movement-optimized',
        layering: isMilitary ? 'tactical protective layers' : 'reduced for agility',
        ornament_detail: 'removed or weaponized',
        damage_wear: 'combat accumulation — tears, impacts, blood',
        social_readability: 'threat-signaling or survival-mode',
      };
    case 'rest_leisure':
      return {
        silhouette: 'relaxed unstructured',
        material_finish: `${qualityBase} comfortable soft`,
        cleanliness: 'clean casual',
        structure_fit: 'loose unfastened comfortable',
        layering: 'minimal comfortable',
        ornament_detail: 'personal only — sentimental items',
        damage_wear: 'comfortable wear, softened edges',
        social_readability: 'off-duty, unguarded',
      };
    default:
      return {
        silhouette: isElite ? 'tailored defined' : isMilitary ? 'regulation standard' : 'role-appropriate',
        material_finish: `${qualityBase} standard`,
        cleanliness: 'appropriate to context',
        structure_fit: 'standard role-appropriate',
        layering: 'standard for context',
        ornament_detail: 'standard for class',
        damage_wear: 'none',
        social_readability: 'class-appropriate baseline',
      };
  }
}

// ── Core Reconstruction ─────────────────────────────────────────────────────

export interface StateReconstructionResult {
  garments: string[];
  source: 'state_semantic';
  category: StateCategory;
  /** Whether this is a meaningful reconstruction vs generic fallback */
  isStateSpecific: boolean;
  /** What intelligence sources actually drove the result */
  intelligenceSources: IntelligenceSource[];
  /** Whether the result is primarily fallback-derived (weak upstream truth) */
  isPrimarilyFallback: boolean;
  /** Diagnostic explaining what drove the reconstruction */
  intelligenceDiagnostic: string;
  /** 8-axis transformation modifiers — guaranteed different per non-default state */
  transformationAxes: TransformationAxes;
}

/**
 * Reconstruct state-appropriate garments from profile semantics and temporal truth.
 *
 * PRECEDENCE (character-specific first):
 * 1. Profile semantic fields relevant to the state category
 * 2. Class/quality modifiers from profile
 * 3. Era vocabulary as structural fallback
 * 4. Generic fallback only as last resort
 *
 * IEL: Output is validated against forbidden garments before return.
 */
export function reconstructStateGarments(
  profile: CharacterWardrobeProfile,
  state: WardrobeStateDefinition,
  temporalTruth: TemporalTruth | null | undefined,
): StateReconstructionResult {
  const category = classifyStateCategory(state);
  const era = temporalTruth?.era || '';
  const eraFamily = temporalTruth?.family || 'modern';

  // ── Step 1: Extract character-specific semantics for this category ──
  const profileSemantics = extractProfileSemanticsForCategory(profile, category);
  const intelligenceSources: IntelligenceSource[] = [...profileSemantics.sources];

  // IEL: 'ambiguous' and missing era default to 'contemporary', never historical
  const vocab = ERA_VOCABULARIES[era] || ERA_VOCABULARIES[eraFamily] || ERA_VOCABULARIES['contemporary'];
  const eraBase = [...(vocab[category] || vocab.default)];

  // ── Step 3: Build final garments with profile-first precedence ──
  let finalGarments: string[];
  let isPrimarilyFallback: boolean;

  if (profileSemantics.garments.length >= 2) {
    // Profile semantics are rich enough to drive the result
    finalGarments = [...profileSemantics.garments];

    // Apply profile modifiers as prefixes to first garment
    if (profileSemantics.modifiers.length > 0) {
      const primaryMod = profileSemantics.modifiers[0];
      if (finalGarments[0] && !finalGarments[0].includes(primaryMod)) {
        finalGarments[0] = `${primaryMod} ${finalGarments[0]}`;
      }
    }

    // Fill to minimum 3 items from era base if needed (supporting role only)
    if (finalGarments.length < 3) {
      for (const eg of eraBase) {
        if (finalGarments.length >= 4) break;
        if (!finalGarments.some(fg => fg.toLowerCase() === eg.toLowerCase())) {
          finalGarments.push(eg);
          if (!intelligenceSources.includes('era_vocabulary')) {
            intelligenceSources.push('era_vocabulary');
          }
        }
      }
    }
    isPrimarilyFallback = false;
  } else if (profileSemantics.garments.length === 1) {
    // Partial profile semantics — blend with era vocabulary
    finalGarments = [...profileSemantics.garments];

    // Apply modifiers
    if (profileSemantics.modifiers.length > 0) {
      const primaryMod = profileSemantics.modifiers[0];
      if (!finalGarments[0].includes(primaryMod)) {
        finalGarments[0] = `${primaryMod} ${finalGarments[0]}`;
      }
    }

    // Fill from era base
    for (const eg of eraBase) {
      if (finalGarments.length >= 4) break;
      if (!finalGarments.some(fg => fg.toLowerCase() === eg.toLowerCase())) {
        finalGarments.push(eg);
      }
    }
    intelligenceSources.push('era_vocabulary');
    isPrimarilyFallback = false; // Blended, not purely fallback
  } else {
    // No profile garments extracted — era vocabulary is primary
    finalGarments = [...eraBase];
    intelligenceSources.push('era_vocabulary');
    isPrimarilyFallback = true;

    // Still apply class modifier from profile
    const classMod = resolveClassModifier(profile.class_status_expression || '');
    if (classMod.quality_prefix && finalGarments.length > 0) {
      if (!finalGarments[0].includes(classMod.quality_prefix)) {
        finalGarments[0] = `${classMod.quality_prefix} ${finalGarments[0]}`;
      }
      if (!intelligenceSources.includes('profile_class_expression')) {
        intelligenceSources.push('profile_class_expression');
      }
      // If class modifier was applied, it's not purely generic
      if (classMod.quality_prefix) isPrimarilyFallback = true; // still primarily era vocab
    }

    // Apply profile modifiers even when garments come from era vocab
    if (profileSemantics.modifiers.length > 0 && finalGarments.length > 0) {
      const primaryMod = profileSemantics.modifiers[0];
      if (!finalGarments[0].includes(primaryMod)) {
        finalGarments[0] = `${primaryMod} ${finalGarments[0]}`;
      }
      isPrimarilyFallback = false; // Modifiers make it somewhat character-specific
    }
  }

  // ── Step 4: Filter against forbidden garments (IEL) ──
  if (temporalTruth && temporalTruth.confidence !== 'low' && temporalTruth.forbidden_garment_families.length > 0) {
    const forbiddenSet = new Set(temporalTruth.forbidden_garment_families.map(g => g.toLowerCase()));
    finalGarments = finalGarments.filter(g => {
      const words = g.toLowerCase().split(/\s+/);
      return !words.some(w => forbiddenSet.has(w));
    });
  }

  // ── Step 5: Build diagnostic ──
  const sourceLabels = intelligenceSources.map(s => s.replace(/_/g, ' '));
  const intelligenceDiagnostic = isPrimarilyFallback
    ? `State wardrobe resolved mainly from era vocabulary (${eraFamily}). Profile fields for ${category} are weak or empty. Upstream wardrobe truth needs enrichment.`
    : `State wardrobe driven by: ${sourceLabels.join(', ')}.`;

  // ── Step 6: Resolve transformation axes (identity + state grounded) ──
  const transformationAxes = resolveTransformationAxes(profile, category);

  return {
    garments: finalGarments,
    source: 'state_semantic',
    category,
    isStateSpecific: category !== 'default',
    intelligenceSources,
    isPrimarilyFallback,
    intelligenceDiagnostic,
    transformationAxes,
  };
}

// ── Collapse Detection ──────────────────────────────────────────────────────

export interface CollapseDetectionResult {
  collapsed: boolean;
  collapseCount: number;
  totalStates: number;
  distinctArrays: number;
  /** Diagnostic message when collapse is detected */
  diagnostic: string;
}

/**
 * Detect when N distinct states have collapsed to the same display garments.
 * IEL tripwire: surfaces degradation, does not block generation.
 *
 * @param threshold - minimum number of states sharing identical garments to flag (default 3)
 */
export function detectStateCollapse(
  stateResults: Array<{ stateKey: string; label: string; displayGarments: string[]; transformationAxes?: TransformationAxes }>,
  threshold = 3,
): CollapseDetectionResult {
  if (stateResults.length < threshold) {
    return { collapsed: false, collapseCount: 0, totalStates: stateResults.length, distinctArrays: stateResults.length, diagnostic: '' };
  }

  // Fingerprint each state: garments + transformation axes for full distinctness
  const fingerprints = new Map<string, string[]>();
  for (const sr of stateResults) {
    const garmentFp = [...sr.displayGarments].sort().join('|').toLowerCase();
    // Include transformation axes in fingerprint if available
    const axesFp = sr.transformationAxes
      ? [sr.transformationAxes.silhouette, sr.transformationAxes.material_finish, sr.transformationAxes.cleanliness, sr.transformationAxes.structure_fit, sr.transformationAxes.layering, sr.transformationAxes.damage_wear].join('|').toLowerCase()
      : '';
    const fp = `${garmentFp}::${axesFp}`;
    const existing = fingerprints.get(fp) || [];
    existing.push(sr.label || sr.stateKey);
    fingerprints.set(fp, existing);
  }

  const distinctArrays = fingerprints.size;
  let maxCollapse = 0;
  let collapseLabels: string[] = [];

  for (const [, labels] of fingerprints) {
    if (labels.length > maxCollapse) {
      maxCollapse = labels.length;
      collapseLabels = labels;
    }
  }

  const collapsed = maxCollapse >= threshold;

  return {
    collapsed,
    collapseCount: maxCollapse,
    totalStates: stateResults.length,
    distinctArrays,
    diagnostic: collapsed
      ? `State-specific wardrobe collapsed: ${maxCollapse}/${stateResults.length} states share identical garments (${collapseLabels.join(', ')}). Needs stronger upstream wardrobe truth.`
      : '',
  };
}

// ── Canon Input Derivation from Profile ─────────────────────────────────────

/**
 * deriveCanonInputsFromProfile — Extract CanonWardrobeInputs from existing
 * CharacterWardrobeProfile fields. This bridges the gap between the profile
 * data (already extracted) and the canon-first baseline resolver.
 *
 * ARCHITECTURE: Pure, deterministic, no DB. Uses only fields already present
 * on the profile to construct the structured inputs that resolveBaselineWardrobe
 * consumes at its tier-2 (character context) path.
 *
 * This ensures that even when no explicit canon/script data is passed by the
 * caller, the resolver still gets character identity signals instead of
 * falling through to era-fallback.
 */
export function deriveCanonInputsFromProfile(
  profile: CharacterWardrobeProfile,
  temporalTruth?: TemporalTruth | null,
): CanonWardrobeInputs {
  // ── Extract class from class_status_expression ──
  const classExpr = (profile.class_status_expression || '').toLowerCase();
  let derivedClass: string | undefined;
  const classPatterns: Array<[string, RegExp]> = [
    ['elite', /\b(elite|aristocrat|noble|wealthy|upper.?class|privileged|royal|opulent)\b/i],
    ['military', /\b(military|soldier|warrior|guard|officer|combat|tactical)\b/i],
    ['working', /\b(working|laborer|manual|blue.?collar|servant|peasant|common)\b/i],
    ['artisan', /\b(artisan|craftsman|potter|weaver|blacksmith|carpenter|tailor|artist)\b/i],
    ['professional', /\b(professional|merchant|scholar|academic|doctor|lawyer|bureaucrat)\b/i],
    ['religious', /\b(religious|priest|monk|clergy|spiritual|sacred)\b/i],
    ['criminal', /\b(criminal|thief|smuggler|outlaw|pirate|assassin)\b/i],
    ['creative', /\b(creative|performer|musician|writer|poet|dancer)\b/i],
  ];
  for (const [cls, re] of classPatterns) {
    if (re.test(classExpr)) {
      derivedClass = cls;
      break;
    }
  }

  // ── Extract occupation from labor_formality_variation ──
  let derivedOccupation: string | undefined;
  const laborText = profile.labor_formality_variation || '';
  const occMatch = laborText.match(/\b(potter|weaver|blacksmith|carpenter|tailor|farmer|merchant|detective|soldier|healer|cook|fisherman|miner|hunter|guard|scribe|teacher|shopkeeper)\b/i);
  if (occMatch) {
    derivedOccupation = occMatch[1].toLowerCase();
  }

  // ── Extract garment hints from variation fields ──
  const hintSources = [
    profile.wardrobe_identity_summary,
    profile.labor_formality_variation,
    profile.public_private_variation,
    profile.ceremonial_variation,
  ].filter(Boolean).join('. ');
  const scriptHints = extractGarmentsFromProse(hintSources);

  // ── World constraints from temporal truth ──
  const worldConstraints: WorldConstraints = {};
  if (temporalTruth?.era) {
    worldConstraints.period = temporalTruth.era;
  }

  const characterContext: CharacterContext = {};
  if (derivedClass) characterContext.class = derivedClass;
  if (derivedOccupation) characterContext.occupation = derivedOccupation;

  // ── Lifestyle from identity summary ──
  const idSummary = (profile.wardrobe_identity_summary || '').toLowerCase();
  const lifestylePatterns: Array<[string, RegExp]> = [
    ['nomadic', /\b(nomad|wander|travel|roam)\b/i],
    ['urban professional', /\b(urban|city|office|corporate)\b/i],
    ['rural', /\b(rural|farm|country|village)\b/i],
    ['ceremonial', /\b(ceremonial|ritual|temple|shrine)\b/i],
  ];
  for (const [lifestyle, re] of lifestylePatterns) {
    if (re.test(idSummary)) {
      characterContext.lifestyle = lifestyle;
      break;
    }
  }

  return {
    scriptWardrobeHints: scriptHints.length > 0 ? scriptHints : undefined,
    worldConstraints: Object.keys(worldConstraints).length > 0 ? worldConstraints : undefined,
    characterContext: Object.keys(characterContext).length > 0 ? characterContext : undefined,
  };
}
