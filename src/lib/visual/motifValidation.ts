/**
 * motifValidation.ts — Canonical Motif Validation + Lineage Enforcement Module
 *
 * Provides:
 * 1. Motif Family Fingerprint model
 * 2. Motif-specific validation rubric (6 scoring dimensions + hard fail gate)
 * 3. Slot expectation enforcement
 * 4. Family anchoring + lineage scoring
 * 5. IEL-style fail-closed invariants
 *
 * Design principle: A motif is a repeated physical consequence of life in the world.
 * It is NOT a symbol first. It is an object/surface that recurs because of how people
 * live, work, age, break, and repair things.
 *
 * World Validation Mode integration: Hard fail detection and scoring are
 * mode-aware via the shared WorldValidationRules. In fantastical projects,
 * symbolic constructs may be allowed; in grounded projects they are hard fails.
 */

import type { WorldValidationRules } from './worldValidationMode';

// ── Motif Family Fingerprint ────────────────────────────────────────────────

export type MaterialFamily =
  | 'clay_ceramic'
  | 'wood'
  | 'stone'
  | 'metal'
  | 'textile_fabric'
  | 'paper'
  | 'glass'
  | 'lacquer'
  | 'mixed'
  | 'unknown';

export type ObjectFamily =
  | 'vessel'
  | 'tool'
  | 'joinery_fastener'
  | 'wall_surface'
  | 'floor_surface'
  | 'textile_object'
  | 'container'
  | 'furniture_fragment'
  | 'architectural_fragment'
  | 'repair_seam'
  | 'fracture_pattern'
  | 'unknown';

export type ConditionFamily =
  | 'intact'
  | 'worn'
  | 'chipped'
  | 'cracked'
  | 'broken'
  | 'repaired'
  | 'stained'
  | 'weathered'
  | 'patinated'
  | 'unknown';

export type UseTraceFamily =
  | 'handled'
  | 'worked'
  | 'carried'
  | 'stored'
  | 'repaired'
  | 'craft_labor'
  | 'weather_exposed'
  | 'domestic_wear'
  | 'ritualized'
  | 'unknown';

export interface MotifFamilyFingerprint {
  material_family: MaterialFamily;
  object_family: ObjectFamily;
  condition_family: ConditionFamily;
  use_trace_family: UseTraceFamily;
}

// ── Fingerprint normalization from text ──────────────────────────────────────

const MATERIAL_PATTERNS: Array<[RegExp, MaterialFamily]> = [
  [/\b(clay|ceramic|pottery|porcelain|stoneware|earthenware|terracotta|kiln|glaze)\b/i, 'clay_ceramic'],
  [/\b(wood|timber|lumber|plank|beam|grain|bark|bamboo|carved wood|wooden)\b/i, 'wood'],
  [/\b(stone|marble|granite|slate|limestone|sandstone|cobble|flagstone|masonry)\b/i, 'stone'],
  [/\b(metal|iron|steel|copper|bronze|brass|tin|forge|anvil|rust)\b/i, 'metal'],
  [/\b(textile|fabric|cloth|silk|cotton|linen|wool|hemp|weave|woven|thread|yarn)\b/i, 'textile_fabric'],
  [/\b(paper|parchment|scroll|rice paper|washi)\b/i, 'paper'],
  [/\b(glass|glazed|blown glass|window pane)\b/i, 'glass'],
  [/\b(lacquer|lacquered|varnish|shellac)\b/i, 'lacquer'],
];

const OBJECT_PATTERNS: Array<[RegExp, ObjectFamily]> = [
  [/\b(vessel|bowl|cup|jar|pot|vase|pitcher|jug|urn|gourd)\b/i, 'vessel'],
  [/\b(tool|implement|chisel|hammer|tongs|blade|awl|needle|spindle|wheel)\b/i, 'tool'],
  [/\b(join|joint|dovetail|mortise|tenon|lash|bind|nail|peg|dowel|rivet|stitch|seam)\b/i, 'joinery_fastener'],
  [/\b(wall|plaster|render|daub|wattle|partition|screen)\b/i, 'wall_surface'],
  [/\b(floor|tile|flagstone|board|tatami|mat|threshold)\b/i, 'floor_surface'],
  [/\b(cloth|curtain|banner|tapestry|rug|blanket|cushion)\b/i, 'textile_object'],
  [/\b(box|chest|crate|basket|barrel|sack|bundle)\b/i, 'container'],
  [/\b(furniture|chair|table|shelf|bench|stool|cabinet|drawer)\b/i, 'furniture_fragment'],
  [/\b(column|beam|lintel|bracket|corbel|arch|rafter|eave|cornice)\b/i, 'architectural_fragment'],
  [/\b(repair|patch|mend|kintsugi|reinforc|brace|splice|graft)\b/i, 'repair_seam'],
  [/\b(crack|fracture|chip|break|shatter|split|fissure|scar)\b/i, 'fracture_pattern'],
];

const CONDITION_PATTERNS: Array<[RegExp, ConditionFamily]> = [
  [/\b(repaired|mended|patched|restored|fixed|reinforced|kintsugi|re-joined)\b/i, 'repaired'],
  [/\b(broken|shattered|fractured|split|collapsed)\b/i, 'broken'],
  [/\b(cracked|fissured|crazed)\b/i, 'cracked'],
  [/\b(chipped|nicked|notched)\b/i, 'chipped'],
  [/\b(worn|abraded|eroded|rubbed|thinned|faded)\b/i, 'worn'],
  [/\b(stained|discolored|marked|spotted|soiled)\b/i, 'stained'],
  [/\b(weathered|sun-bleached|rain-worn|exposed)\b/i, 'weathered'],
  [/\b(patina|patinated|oxidized|tarnished|aged|antique)\b/i, 'patinated'],
  [/\b(intact|pristine|new|clean|unblemished|perfect)\b/i, 'intact'],
];

const USE_TRACE_PATTERNS: Array<[RegExp, UseTraceFamily]> = [
  [/\b(repaired|mended|patched|restored|kintsugi)\b/i, 'repaired'],
  [/\b(craft|labor|making|shap|mold|throw|firing|forg|weav|carv|whittle|sawing)\b/i, 'craft_labor'],
  [/\b(handled|gripped|fingerprint|hand-worn|palm-smoothed|touched)\b/i, 'handled'],
  [/\b(worked|shaped|filed|ground|honed|polished by use)\b/i, 'worked'],
  [/\b(carried|transported|slung|dragged|lifted)\b/i, 'carried'],
  [/\b(stored|shelved|stacked|piled|hung|racked)\b/i, 'stored'],
  [/\b(weather|rain|sun|frost|wind|outdoor|exposed|eroded)\b/i, 'weather_exposed'],
  [/\b(domestic|kitchen|hearth|daily|everyday|household)\b/i, 'domestic_wear'],
  [/\b(ritual|ceremony|offering|sacred|shrine|altar|staged)\b/i, 'ritualized'],
];

function matchFirst<T>(text: string, patterns: Array<[RegExp, T]>, fallback: T): T {
  for (const [re, val] of patterns) {
    if (re.test(text)) return val;
  }
  return fallback;
}

/**
 * Count all material matches in text and return sorted by frequency for stable derivation.
 * This prevents word-order-dependent classification in mixed-material prompts.
 */
function matchAllWithCounts<T extends string>(text: string, patterns: Array<[RegExp, T]>, fallback: T): T {
  const counts = new Map<T, number>();
  for (const [re, val] of patterns) {
    const matches = text.match(new RegExp(re.source, 'gi'));
    if (matches && matches.length > 0) {
      counts.set(val, (counts.get(val) || 0) + matches.length);
    }
  }
  if (counts.size === 0) return fallback;
  if (counts.size === 1) return counts.keys().next().value!;

  // Sort by count descending, then alphabetically for tie-breaking
  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });

  // If top two are equal count, return 'mixed' for materials
  if (sorted.length >= 2 && sorted[0][1] === sorted[1][1]) {
    // Check if fallback supports 'mixed' — only materials does
    if (fallback === 'unknown' && patterns === (MATERIAL_PATTERNS as any)) {
      return 'mixed' as T;
    }
  }
  return sorted[0][0];
}

/**
 * Derive a motif family fingerprint from available text (prompt, description, metadata).
 * Deterministic — no LLM. Uses regex pattern matching with frequency-based disambiguation.
 */
export function deriveMotifFingerprint(text: string): MotifFamilyFingerprint {
  const t = text.toLowerCase();
  return {
    material_family: matchAllWithCounts(t, MATERIAL_PATTERNS, 'unknown'),
    object_family: matchFirst(t, OBJECT_PATTERNS, 'unknown'),
    condition_family: matchFirst(t, CONDITION_PATTERNS, 'unknown'),
    use_trace_family: matchFirst(t, USE_TRACE_PATTERNS, 'unknown'),
  };
}

/**
 * Serialize fingerprint into a comparable string key.
 */
export function fingerprintKey(fp: MotifFamilyFingerprint): string {
  return `${fp.material_family}|${fp.object_family}|${fp.condition_family}|${fp.use_trace_family}`;
}

// ── Motif Validation Scores ─────────────────────────────────────────────────

export interface MotifValidationScores {
  physical_plausibility: number; // 0-100
  material_legibility: number;   // 0-100
  use_trace: number;             // 0-100
  world_embeddedness: number;    // 0-100
  motif_lineage: number;         // 0-100
}

export type MotifHardFailCode =
  | 'symbolic_installation'
  | 'abstract_sculpture'
  | 'mythic_imagery'
  | 'fantasy_creature'
  | 'magical_glow'
  | 'allegorical_tableau'
  | 'ceremonial_icon_staging'
  | 'concept_art_composition'
  | 'no_material_nouns'
  | 'no_physical_object';

export type MotifAdvisoryCode =
  | 'pristine_no_use_trace'
  | 'gallery_isolation'
  | 'weak_material_legibility'
  | 'showroom_framing'
  | 'lineage_material_mismatch'
  | 'lineage_object_mismatch'
  | 'damage_not_visible'
  | 'repair_not_visible'
  | 'variant_unrelated';

export interface MotifSlotExpectation {
  slot_key: string;
  expects_anchor: boolean;
  expects_same_family: boolean;
  required_condition?: ConditionFamily[];
  required_use_trace?: UseTraceFamily[];
  label: string;
}

export const MOTIF_SLOT_EXPECTATIONS: Record<string, MotifSlotExpectation> = {
  motif_primary: {
    slot_key: 'motif_primary',
    expects_anchor: true,
    expects_same_family: false,
    label: 'Material Motif',
  },
  motif_variant: {
    slot_key: 'motif_variant',
    expects_anchor: false,
    expects_same_family: true,
    label: 'Condition Variant',
  },
  motif_damage: {
    slot_key: 'motif_damage',
    expects_anchor: false,
    expects_same_family: true,
    required_condition: ['cracked', 'chipped', 'broken', 'worn', 'weathered', 'stained'],
    label: 'Damage Motif',
  },
  motif_repair: {
    slot_key: 'motif_repair',
    expects_anchor: false,
    expects_same_family: true,
    required_use_trace: ['repaired'],  // craft_labor alone is NOT sufficient — must show actual repair
    required_condition: ['repaired'],
    label: 'Repair Motif',
  },
};

// ── Hard Fail Detection ─────────────────────────────────────────────────────

const SYMBOLIC_FAIL_PATTERNS: Array<[RegExp, MotifHardFailCode]> = [
  [/\b(symbolic installation|ceremonial installation)\b/i, 'symbolic_installation'],
  [/\b(abstract sculpture|modern sculpture|conceptual sculpture)\b/i, 'abstract_sculpture'],
  [/\b(mythic|mythical|legendary beast|ancient spirit|deity|divine)\b/i, 'mythic_imagery'],
  [/\b(dragon|phoenix|griffin|unicorn|spirit animal|magical creature)\b/i, 'fantasy_creature'],
  [/\b(magical glow|ethereal light|spirit light|supernatural|enchanted)\b/i, 'magical_glow'],
  [/\b(allegor|parable|fable scene|moral tableau)\b/i, 'allegorical_tableau'],
  [/\b(representing|embodying|spirit of|essence of|symboliz)\b/i, 'ceremonial_icon_staging'],
  [/\b(concept art|moodboard|mood board|inspiration board|visual concept)\b/i, 'concept_art_composition'],
];

const MATERIAL_NOUN_PATTERN = /\b(clay|ceramic|wood|stone|metal|iron|steel|copper|bronze|silk|cotton|fabric|textile|paper|glass|plaster|mortar|brick|tile|bamboo|straw|thatch|lacquer|leather|porcelain|earthenware|timber)\b/i;

const PHYSICAL_OBJECT_PATTERN = /\b(bowl|pot|jar|vessel|cup|plate|tool|knife|hammer|chisel|wall|floor|tile|beam|column|shelf|box|chest|basket|door|gate|window|stool|bench|table|hearth|oven|kiln|loom|wheel|rack|hook|nail|rope|cloth|curtain|mat|rug|jug|pitcher|bucket|barrel|crate|sack)\b/i;

/**
 * Instruction/negative block patterns that contain the very terms we check for.
 * These must be stripped before hard-fail detection to prevent self-referential false positives.
 */
const INSTRUCTION_BLOCK_PATTERNS = [
  /\[MOTIF GROUNDING[^\]]*\][\s\S]*?(?=\[|$)/gi,
  /\[STRICT\][^\n]*(?:\n[^\n\[]*?)*/gi,
  /This motif MUST NOT be:[\s\S]*?(?=\n\n|\[|$)/gi,
  /No dragons\.[^\n]*/gi,
  /MUST NOT[^\n]*/gi,
  /Do NOT depict:[^\n]*/gi,
  /FORBIDDEN[^\n]*/gi,
  /HARD NEGATIVES[^\n]*/gi,
  /ENVIRONMENT RULES:[^\n]*/gi,
  /WORLD RULES:[\s\S]*?(?=\n\n|\[|$)/gi,
  /ENFORCE:[^\n]*/gi,
  /\[CANONICAL WORLD BINDING[^\]]*\][\s\S]*?(?=\n\n\[|$)/gi,
  /\[PRODUCTION DESIGN[^\]]*\][\s\S]*?(?=\n\n\[|$)/gi,
  /\[VISUAL PRIORITY[^\]]*\][\s\S]*?(?=\n\n\[|$)/gi,
  /\[SEMANTIC ROLE[^\]]*\][\s\S]*?(?=\n\n\[|$)/gi,
];

/**
 * Extract only the descriptive/subject content from a prompt,
 * stripping instruction blocks, negative clauses, and world-binding sections
 * that contain the exact terms being checked (causing self-referential false positives).
 */
export function extractDescriptiveContent(text: string): string {
  let cleaned = text;
  for (const pattern of INSTRUCTION_BLOCK_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  // Collapse whitespace
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Run hard fail detection against prompt or description text.
 * Returns fail codes if any are triggered. Empty array = passed.
 *
 * IMPORTANT: Strips instruction/negative blocks before detection to prevent
 * self-referential false positives from grounding rules that mention the very
 * terms being checked (e.g. "This motif MUST NOT be: a symbolic installation").
 */
export function detectHardFails(text: string, worldRules?: WorldValidationRules | null): MotifHardFailCode[] {
  const fails: MotifHardFailCode[] = [];
  const descriptive = extractDescriptiveContent(text).toLowerCase();

  // Symbolic/fantasy detection is mode-aware
  const allowSymbolic = worldRules?.allow_symbolic_constructs ?? false;
  const allowMagic = worldRules?.allow_magic_literalism ?? false;

  for (const [re, code] of SYMBOLIC_FAIL_PATTERNS) {
    // Skip symbolic/fantasy hard fails if world mode allows them
    if (allowSymbolic && ['symbolic_installation', 'allegorical_tableau', 'ceremonial_icon_staging', 'concept_art_composition'].includes(code)) continue;
    if (allowMagic && ['mythic_imagery', 'fantasy_creature', 'magical_glow'].includes(code)) continue;
    if (re.test(descriptive)) {
      if (!fails.includes(code)) fails.push(code);
    }
  }

  // Material/object checks — only required if world mode demands buildability
  const requireBuildability = worldRules?.require_physical_buildability ?? true;
  const requireMaterialLegibility = worldRules?.require_material_legibility ?? true;

  const t = text.toLowerCase();
  if (requireMaterialLegibility && !MATERIAL_NOUN_PATTERN.test(t)) {
    fails.push('no_material_nouns');
  }

  if (requireBuildability && !PHYSICAL_OBJECT_PATTERN.test(t)) {
    fails.push('no_physical_object');
  }

  return fails;
}

// ── Scoring Functions ───────────────────────────────────────────────────────

/**
 * Score physical plausibility from prompt/description text.
 * Higher = more physically real and buildable.
 */
export function scorePhysicalPlausibility(text: string, worldRules?: WorldValidationRules | null): number {
  const t = text.toLowerCase();
  let score = 50; // baseline

  // Positive: real materials mentioned
  const materialMatches = (t.match(MATERIAL_NOUN_PATTERN) || []).length;
  score += Math.min(materialMatches * 8, 25);

  // Positive: physical object mentioned
  if (PHYSICAL_OBJECT_PATTERN.test(t)) score += 15;

  // Negative: symbolic/fantasy language — softened if world mode allows
  const fantasyPenalty = (worldRules?.allow_magic_literalism || worldRules?.allow_symbolic_constructs) ? 10 : 30;
  if (/\b(symbolic|abstract|ethereal|magical|mythic|spirit|conceptual|surreal)\b/i.test(t)) score -= fantasyPenalty;

  // Negative: impossible geometry — softened if world allows impossible materials
  const impossiblePenalty = worldRules?.allow_impossible_materials ? 5 : 25;
  if (/\b(floating|levitat|impossible|infinite|fractal|dimension)\b/i.test(t)) score -= impossiblePenalty;

  // Positive: buildable language
  if (/\b(built|constructed|carved|fired|thrown|forged|woven|assembled|crafted|made)\b/i.test(t)) score += 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Score material legibility — can you tell what it's made of?
 */
export function scoreMaterialLegibility(text: string): number {
  const t = text.toLowerCase();
  let score = 40;

  const materialMatches = (t.match(MATERIAL_NOUN_PATTERN) || []).length;
  score += Math.min(materialMatches * 12, 35);

  // Positive: specific material descriptors
  if (/\b(grain|glaze|weave|patina|rust|tarnish|texture|surface|finish)\b/i.test(t)) score += 15;

  // Negative: vague/stylized
  if (/\b(stylized|painterly|impressionist|abstract|ambiguous)\b/i.test(t)) score -= 20;

  return Math.max(0, Math.min(100, score));
}

/**
 * Score use/age/trace evidence.
 */
export function scoreUseTrace(text: string): number {
  const t = text.toLowerCase();
  let score = 30;

  const traceTerms = /\b(worn|aged|patina|chip|crack|stain|repair|mend|weather|use mark|grime|soot|scuff|scratch|dent|faded|bleach|eroded|finger|handle|rub|polish|smooth)\b/gi;
  const matches = (t.match(traceTerms) || []).length;
  score += Math.min(matches * 10, 50);

  // Negative: pristine/new
  if (/\b(pristine|brand new|showroom|perfect condition|unblemished|immaculate|mint)\b/i.test(t)) score -= 25;

  // Positive: time markers
  if (/\b(years|decades|generations|inherited|heirloom|ancient|old|time-worn)\b/i.test(t)) score += 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Score world-embeddedness — is it in context or isolated?
 */
export function scoreWorldEmbeddedness(text: string): number {
  const t = text.toLowerCase();
  let score = 40;

  // Positive: environmental context
  if (/\b(shelf|wall|floor|workshop|kitchen|hearth|corner|windowsill|doorway|courtyard|garden|path|workspace|room|interior|beside|among|stack|rack|storage)\b/i.test(t)) score += 20;

  // Positive: use context
  if (/\b(in use|being used|resting|placed|hanging|leaning|stacked|arranged|stored|drying|cooling)\b/i.test(t)) score += 15;

  // Negative: isolated/gallery
  if (/\b(isolated|gallery|display|showcase|museum|pedestal|spotlight|hero shot|centered|featured|floating)\b/i.test(t)) score -= 25;

  // Positive: cinematic context language
  if (/\b(close-up|detail shot|embedded|environmental|production|set|props|art department)\b/i.test(t)) score += 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Score motif lineage consistency against a family anchor fingerprint.
 */
export function scoreMotifLineage(
  candidateFingerprint: MotifFamilyFingerprint,
  anchorFingerprint: MotifFamilyFingerprint | null,
): number {
  if (!anchorFingerprint) return 50; // No anchor = neutral

  let score = 0;

  // Material match is most important (40 points)
  if (candidateFingerprint.material_family === anchorFingerprint.material_family) {
    score += 40;
  } else if (candidateFingerprint.material_family !== 'unknown' && anchorFingerprint.material_family !== 'unknown') {
    score += 5; // Different known materials = low
  } else {
    score += 15; // One unknown = partial credit
  }

  // Object match (30 points)
  if (candidateFingerprint.object_family === anchorFingerprint.object_family) {
    score += 30;
  } else if (candidateFingerprint.object_family !== 'unknown' && anchorFingerprint.object_family !== 'unknown') {
    score += 10;
  } else {
    score += 15;
  }

  // Condition/use trace are allowed to vary (lifecycle)
  // But should still be in reasonable range
  score += 15; // Base credit for condition variation (expected in motif families)
  score += 15; // Base credit for use variation

  return Math.max(0, Math.min(100, score));
}

// ── Full Validation Result ──────────────────────────────────────────────────

export interface MotifValidationResult {
  slot_key: string;
  fingerprint: MotifFamilyFingerprint;
  fingerprint_key: string;
  scores: MotifValidationScores;
  hard_fail_codes: MotifHardFailCode[];
  advisory_codes: MotifAdvisoryCode[];
  passed: boolean;
  family_anchor_ref: string | null;
  slot_expectation_met: boolean;
  slot_expectation_failures: string[];
  overall_score: number;
  scoring_model: string;
  validation_version: string;
}

const SCORING_MODEL = 'motif_physical_v1';
const VALIDATION_VERSION = '1.0.0';

/**
 * Run full motif validation for a candidate.
 *
 * @param promptText - the prompt or description text used to generate the image
 * @param slotKey - the motif slot key (motif_primary, motif_variant, motif_damage, motif_repair)
 * @param anchorFingerprint - the family anchor fingerprint from motif_primary (null if this IS primary)
 * @param worldRules - optional world validation rules for mode-aware enforcement
 */
export function validateMotifCandidate(
  promptText: string,
  slotKey: string,
  anchorFingerprint: MotifFamilyFingerprint | null,
  worldRules?: WorldValidationRules | null,
): MotifValidationResult {
  const fingerprint = deriveMotifFingerprint(promptText);
  const fpKey = fingerprintKey(fingerprint);

  // Scores
  const scores: MotifValidationScores = {
    physical_plausibility: scorePhysicalPlausibility(promptText, worldRules),
    material_legibility: scoreMaterialLegibility(promptText),
    use_trace: scoreUseTrace(promptText),
    world_embeddedness: scoreWorldEmbeddedness(promptText),
    motif_lineage: scoreMotifLineage(fingerprint, anchorFingerprint),
  };

  // Hard fails (mode-aware)
  const hard_fail_codes = detectHardFails(promptText, worldRules);

  // Advisory codes
  const advisory_codes: MotifAdvisoryCode[] = [];
  if (scores.use_trace < 30) advisory_codes.push('pristine_no_use_trace');
  if (scores.world_embeddedness < 30) advisory_codes.push('gallery_isolation');
  if (scores.material_legibility < 35) advisory_codes.push('weak_material_legibility');
  if (/\b(showroom|display|showcase)\b/i.test(promptText)) advisory_codes.push('showroom_framing');

  // Lineage checks for family-dependent slots
  if (anchorFingerprint && slotKey !== 'motif_primary') {
    if (fingerprint.material_family !== anchorFingerprint.material_family
      && fingerprint.material_family !== 'unknown'
      && anchorFingerprint.material_family !== 'unknown') {
      advisory_codes.push('lineage_material_mismatch');
    }
    if (fingerprint.object_family !== anchorFingerprint.object_family
      && fingerprint.object_family !== 'unknown'
      && anchorFingerprint.object_family !== 'unknown') {
      advisory_codes.push('lineage_object_mismatch');
    }
  }

  // Slot expectation enforcement
  const expectation = MOTIF_SLOT_EXPECTATIONS[slotKey];
  const slotExpectationFailures: string[] = [];

  if (expectation) {
    // Damage slot must show damage
    if (expectation.required_condition) {
      const hasRequiredCondition = expectation.required_condition.includes(fingerprint.condition_family);
      if (!hasRequiredCondition && fingerprint.condition_family !== 'unknown') {
        slotExpectationFailures.push(`Expected damage/wear condition, got: ${fingerprint.condition_family}`);
        advisory_codes.push('damage_not_visible');
      }
    }

    // Repair slot must show repair
    if (expectation.required_use_trace) {
      const hasRequiredTrace = expectation.required_use_trace.includes(fingerprint.use_trace_family);
      if (!hasRequiredTrace && fingerprint.use_trace_family !== 'unknown') {
        slotExpectationFailures.push(`Expected repair/mending trace, got: ${fingerprint.use_trace_family}`);
        advisory_codes.push('repair_not_visible');
      }
    }

    // Family-dependent slots must match primary
    if (expectation.expects_same_family && anchorFingerprint) {
      if (scores.motif_lineage < 40) {
        slotExpectationFailures.push('Material/object family does not match primary motif anchor');
        advisory_codes.push('variant_unrelated');
      }
    }
  }

  // Overall score (weighted)
  const overall_score = Math.round(
    scores.physical_plausibility * 0.25 +
    scores.material_legibility * 0.20 +
    scores.use_trace * 0.15 +
    scores.world_embeddedness * 0.15 +
    scores.motif_lineage * 0.25,
  );

  // Pass/fail determination
  const passed = hard_fail_codes.length === 0
    && scores.physical_plausibility >= 35
    && slotExpectationFailures.length === 0;

  return {
    slot_key: slotKey,
    fingerprint,
    fingerprint_key: fpKey,
    scores,
    hard_fail_codes,
    advisory_codes,
    passed,
    family_anchor_ref: anchorFingerprint ? fingerprintKey(anchorFingerprint) : null,
    slot_expectation_met: slotExpectationFailures.length === 0,
    slot_expectation_failures: slotExpectationFailures,
    overall_score,
    scoring_model: SCORING_MODEL,
    validation_version: VALIDATION_VERSION,
  };
}

// ── IEL Invariants ──────────────────────────────────────────────────────────

export type MotifInvariantCode =
  | 'MOTIF_INV_A' // winner must pass physical plausibility + anti-symbolism
  | 'MOTIF_INV_B' // damage slot must show damage
  | 'MOTIF_INV_C' // repair slot must show repair
  | 'MOTIF_INV_D' // family-dependent slots must match primary
  | 'MOTIF_INV_E'; // primary missing = family approval blocked

export interface MotifInvariantViolation {
  code: MotifInvariantCode;
  message: string;
  slot_key: string;
  blocking: boolean;
}

/**
 * Check IEL invariants for a set of motif validation results.
 * Returns violations. Empty array = all invariants pass.
 */
export function checkMotifInvariants(
  results: MotifValidationResult[],
): MotifInvariantViolation[] {
  const violations: MotifInvariantViolation[] = [];

  const primaryResult = results.find(r => r.slot_key === 'motif_primary');

  // Invariant E: primary must exist for family-dependent approval
  if (!primaryResult || !primaryResult.passed) {
    const dependentSlots = results.filter(r =>
      r.slot_key !== 'motif_primary' && MOTIF_SLOT_EXPECTATIONS[r.slot_key]?.expects_same_family,
    );
    if (dependentSlots.length > 0) {
      violations.push({
        code: 'MOTIF_INV_E',
        message: 'Primary motif is missing or invalid — family-dependent slot approval blocked',
        slot_key: 'motif_primary',
        blocking: true,
      });
    }
  }

  for (const result of results) {
    // Invariant A: physical plausibility + anti-symbolism
    if (result.hard_fail_codes.length > 0 || result.scores.physical_plausibility < 35) {
      violations.push({
        code: 'MOTIF_INV_A',
        message: `Motif "${result.slot_key}" fails physical plausibility or anti-symbolism gate: ${result.hard_fail_codes.join(', ') || 'score too low'}`,
        slot_key: result.slot_key,
        blocking: true,
      });
    }

    // Invariant B: damage slot
    if (result.slot_key === 'motif_damage' && result.advisory_codes.includes('damage_not_visible')) {
      violations.push({
        code: 'MOTIF_INV_B',
        message: 'Damage motif does not show visible damage/fracture/wear',
        slot_key: result.slot_key,
        blocking: true,
      });
    }

    // Invariant C: repair slot
    if (result.slot_key === 'motif_repair' && result.advisory_codes.includes('repair_not_visible')) {
      violations.push({
        code: 'MOTIF_INV_C',
        message: 'Repair motif does not show visible repair/mending evidence',
        slot_key: result.slot_key,
        blocking: true,
      });
    }

    // Invariant D: family consistency
    if (result.slot_key !== 'motif_primary' && result.advisory_codes.includes('variant_unrelated')) {
      violations.push({
        code: 'MOTIF_INV_D',
        message: `Motif "${result.slot_key}" is not family-consistent with primary`,
        slot_key: result.slot_key,
        blocking: true,
      });
    }
  }

  return violations;
}

/**
 * Check whether a motif family set is ready for approval.
 * Returns { ready, blocking_reasons }.
 */
export function isMotifFamilyApprovalReady(
  results: MotifValidationResult[],
): { ready: boolean; blocking_reasons: string[] } {
  const violations = checkMotifInvariants(results);
  const blocking = violations.filter(v => v.blocking);
  return {
    ready: blocking.length === 0,
    blocking_reasons: blocking.map(v => v.message),
  };
}

// ── Motif Lineage Status ────────────────────────────────────────────────────

export type MotifLineageStatus =
  | 'anchor'                     // This IS the primary anchor
  | 'match'                      // Lineage matches primary
  | 'mismatch'                   // Lineage does not match primary
  | 'blocked_missing_primary'    // Primary does not exist
  | 'blocked_invalid_primary'    // Primary exists but is invalid
  | 'not_applicable';            // Not a motif slot

export type MotifSelectionStatus =
  | 'selected_valid'
  | 'passed_not_selected'
  | 'rejected_hard_fail'
  | 'rejected_low_physical_plausibility'
  | 'rejected_slot_expectation'
  | 'rejected_lineage_mismatch'
  | 'blocked_missing_primary_anchor'
  | 'blocked_invalid_primary_anchor';

/**
 * Determine lineage status for a motif slot.
 */
export function resolveLineageStatus(
  slotKey: string,
  validation: MotifValidationResult,
  anchorFingerprint: MotifFamilyFingerprint | null,
  primaryExists: boolean,
  primaryValid: boolean,
): MotifLineageStatus {
  if (slotKey === 'motif_primary') return 'anchor';
  if (!primaryExists) return 'blocked_missing_primary';
  if (!primaryValid) return 'blocked_invalid_primary';
  if (!anchorFingerprint) return 'blocked_missing_primary';
  if (validation.scores.motif_lineage >= 40) return 'match';
  return 'mismatch';
}

/**
 * Determine selection status for a motif candidate.
 */
export function resolveMotifSelectionStatus(
  validation: MotifValidationResult,
  lineageStatus: MotifLineageStatus,
): MotifSelectionStatus {
  if (validation.hard_fail_codes.length > 0) return 'rejected_hard_fail';
  if (validation.scores.physical_plausibility < 35) return 'rejected_low_physical_plausibility';
  if (!validation.slot_expectation_met) return 'rejected_slot_expectation';
  if (lineageStatus === 'blocked_missing_primary') return 'blocked_missing_primary_anchor';
  if (lineageStatus === 'blocked_invalid_primary') return 'blocked_invalid_primary_anchor';
  if (lineageStatus === 'mismatch') return 'rejected_lineage_mismatch';
  return 'selected_valid';
}

/**
 * Serialize motif validation into a canonical JSON diagnostics payload
 * suitable for persisting in generation_config or truth_snapshot_json.
 */
export function serializeMotifDiagnostics(
  validation: MotifValidationResult,
  lineageStatus: MotifLineageStatus,
  selectionStatus: MotifSelectionStatus,
  anchorRef?: string | null,
  anchorObjectNoun?: string | null,
): Record<string, unknown> {
  return {
    motif_validation: {
      slot_key: validation.slot_key,
      fingerprint: validation.fingerprint,
      fingerprint_key: validation.fingerprint_key,
      scores: validation.scores,
      hard_fail_codes: validation.hard_fail_codes,
      advisory_codes: validation.advisory_codes,
      slot_expectation_met: validation.slot_expectation_met,
      slot_expectation_failures: validation.slot_expectation_failures,
      overall_score: validation.overall_score,
      passed: validation.passed,
      lineage_status: lineageStatus,
      selection_status: selectionStatus,
      family_anchor_ref: anchorRef || validation.family_anchor_ref,
      scoring_model: validation.scoring_model,
      validation_version: validation.validation_version,
      anchor_object_noun: anchorObjectNoun || null,
    },
  };
}
