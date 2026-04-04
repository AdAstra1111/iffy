/**
 * costumeValidation.ts — Deterministic costume validation for Production Design.
 *
 * Validates that costume slot candidates contain concrete garment nouns,
 * fabric/material nouns, and physically wearable constructs consistent
 * with the project's World Validation Mode.
 *
 * Parallel to motifValidation.ts — same architecture, costume-specific rules.
 */

import type { WorldValidationRules } from './worldValidationMode';

// ── Patterns ────────────────────────────────────────────────────────────────

/** Concrete garment/wearable nouns the validator recognizes */
export const GARMENT_NOUN_PATTERN = /\b(robe|kimono|hakama|obi|haori|kosode|juban|tabi|geta|zori|waraji|tunic|shirt|blouse|vest|jacket|coat|cloak|cape|mantle|shawl|sash|apron|skirt|trousers|pants|breeches|leggings|stockings|gloves|boots|sandals|shoes|slippers|hat|cap|hood|veil|headwrap|turban|scarf|stole|wrap|dress|gown|frock|toga|sarong|dhoti|kurta|sari|caftan|tabard|surcoat|doublet|bodice|corset|jerkin|smock|coverall|uniform|armor|armour|gauntlet|helm|helmet|greaves|breastplate|cuirass|pauldron|gorget|belt|girdle|collar|cuff|sleeve|hem|skirtpanel|overskirt|underskirt|petticoat|loincloth|fundoshi)\b/gi;

/** Fabric/material nouns for costume validation */
export const FABRIC_NOUN_PATTERN = /\b(silk|cotton|linen|hemp|wool|felt|leather|suede|fur|hide|brocade|damask|satin|velvet|taffeta|muslin|gauze|organza|chiffon|crepe|denim|canvas|burlap|tweed|serge|flannel|chambray|voile|tulle|lace|netting|mesh|homespun|undyed|raw|bleached|indigo|dyed|woven|knit|knitted|felted|quilted|padded|layered|lined|unlined|starched|oiled|waxed|treated|tanned|cured)\b/gi;

/** Construction/detail nouns */
export const CONSTRUCTION_PATTERN = /\b(stitch|stitching|seam|hem|pleat|dart|gather|tuck|fold|drape|ruching|smocking|embroidery|applique|patchwork|quilting|binding|piping|lacing|tie|clasp|button|buckle|hook|eyelet|grommet|toggle|knot|tassel|fringe|trim|braid|cord|ribbon|closure|fastening|collar|lapel|cuff|yoke|gusset|panel|gore|insert|facing|lining|interlining|padding|boning|welt|pocket|placket)\b/gi;

/** Wear/condition terms for costume slots */
export const COSTUME_WEAR_PATTERN = /\b(worn|faded|frayed|threadbare|patched|mended|darned|stained|soiled|sun-bleached|sun.?faded|sweat.?stained|mud.?stained|blood.?stained|torn|ripped|tattered|ragged|moth.?eaten|pilled|stretched|shrunk|discolored|yellowed|aged|weathered|distressed|repaired|re.?stitched|re.?sewn|reinforced|re.?dyed|altered|let.?out|taken.?in)\b/gi;

/** Forbidden fashion/editorial framing terms */
const FASHION_EDITORIAL_PATTERN = /\b(runway|fashion\s*show|haute\s*couture|editorial|lookbook|catalog|photoshoot|model\s*pose|styling|styled|trend|trendy|designer|brand|collection|season\s*(spring|summer|fall|autumn|winter)\s*\d{4}|vogue|glamour|chic|avant.?garde|conceptual\s*fashion|deconstructed\s*fashion|fashion\s*forward|statement\s*piece)\b/gi;

/** Fantasy/impossible costume constructs */
const IMPOSSIBLE_COSTUME_PATTERN = /\b(floating\s*garment|self.?weaving|enchanted\s*robe|magical\s*cloth|glowing\s*fabric|ethereal\s*dress|living\s*armor|shape.?shifting\s*cloak|invisible\s*cloak|phantom\s*garment|teleporting|holographic\s*clothing|nano.?fiber|force.?field|energy\s*shield)\b/gi;

// ── Types ────────────────────────────────────────────────────────────────────

export interface CostumeSlotExpectation {
  slot_key: string;
  expects_anchor: boolean;
  expects_same_family: boolean;
  expects_wear: boolean;
  expects_repair: boolean;
  expects_class_signal: boolean;
  expects_ceremonial: boolean;
}

export interface CostumeFamilyFingerprint {
  fabric_family: string;
  garment_family: string;
  construction_family: string;
  class_signal: string;
}

export interface CostumeValidationResult {
  slot_key: string;
  fingerprint: CostumeFamilyFingerprint;
  fingerprint_key: string;
  scores: {
    garment_specificity: number;
    fabric_legibility: number;
    construction_detail: number;
    wearability: number;
    class_coherence: number;
  };
  overall_score: number;
  passed: boolean;
  hard_fail_codes: string[];
  advisory_codes: string[];
  slot_expectation_met: boolean;
  slot_expectation_failures: string[];
  scoring_model: string;
  validation_version: string;
}

// ── Slot Expectations ────────────────────────────────────────────────────────

export const COSTUME_SLOT_EXPECTATIONS: Record<string, CostumeSlotExpectation> = {
  // Fabric / Material System
  fabric_primary: {
    slot_key: 'fabric_primary',
    expects_anchor: true,
    expects_same_family: false,
    expects_wear: false,
    expects_repair: false,
    expects_class_signal: false,
    expects_ceremonial: false,
  },
  fabric_variant: {
    slot_key: 'fabric_variant',
    expects_anchor: false,
    expects_same_family: true,
    expects_wear: false,
    expects_repair: false,
    expects_class_signal: false,
    expects_ceremonial: false,
  },
  fabric_wear: {
    slot_key: 'fabric_wear',
    expects_anchor: false,
    expects_same_family: true,
    expects_wear: true,
    expects_repair: false,
    expects_class_signal: false,
    expects_ceremonial: false,
  },
  fabric_repair: {
    slot_key: 'fabric_repair',
    expects_anchor: false,
    expects_same_family: true,
    expects_wear: false,
    expects_repair: true,
    expects_class_signal: false,
    expects_ceremonial: false,
  },
  // Silhouette / Construction System
  silhouette_primary: {
    slot_key: 'silhouette_primary',
    expects_anchor: true,
    expects_same_family: false,
    expects_wear: false,
    expects_repair: false,
    expects_class_signal: false,
    expects_ceremonial: false,
  },
  silhouette_variant: {
    slot_key: 'silhouette_variant',
    expects_anchor: false,
    expects_same_family: true,
    expects_wear: false,
    expects_repair: false,
    expects_class_signal: false,
    expects_ceremonial: false,
  },
  layering_system: {
    slot_key: 'layering_system',
    expects_anchor: false,
    expects_same_family: true,
    expects_wear: false,
    expects_repair: false,
    expects_class_signal: false,
    expects_ceremonial: false,
  },
  closure_system: {
    slot_key: 'closure_system',
    expects_anchor: false,
    expects_same_family: true,
    expects_wear: false,
    expects_repair: false,
    expects_class_signal: false,
    expects_ceremonial: false,
  },
  // Class / Role Expression
  working_class: {
    slot_key: 'working_class',
    expects_anchor: false,
    expects_same_family: false,
    expects_wear: true,
    expects_repair: false,
    expects_class_signal: true,
    expects_ceremonial: false,
  },
  artisan_class: {
    slot_key: 'artisan_class',
    expects_anchor: false,
    expects_same_family: false,
    expects_wear: false,
    expects_repair: false,
    expects_class_signal: true,
    expects_ceremonial: false,
  },
  elite_class: {
    slot_key: 'elite_class',
    expects_anchor: false,
    expects_same_family: false,
    expects_wear: false,
    expects_repair: false,
    expects_class_signal: true,
    expects_ceremonial: false,
  },
  ceremonial_variant: {
    slot_key: 'ceremonial_variant',
    expects_anchor: false,
    expects_same_family: false,
    expects_wear: false,
    expects_repair: false,
    expects_class_signal: false,
    expects_ceremonial: true,
  },
};

// ── Fingerprint Derivation ──────────────────────────────────────────────────

export function deriveCostumeFingerprint(promptText: string): CostumeFamilyFingerprint {
  const text = promptText.toLowerCase();

  // Fabric family
  const fabricMatches = text.match(FABRIC_NOUN_PATTERN) || [];
  const fabricSet = [...new Set(fabricMatches.map(f => f.toLowerCase()))];
  const fabric_family = fabricSet.length > 0 ? fabricSet[0] : 'unknown';

  // Garment family
  const garmentMatches = text.match(GARMENT_NOUN_PATTERN) || [];
  const garmentSet = [...new Set(garmentMatches.map(g => g.toLowerCase()))];
  const garment_family = garmentSet.length > 0 ? garmentSet[0] : 'unknown';

  // Construction family
  const constructionMatches = text.match(CONSTRUCTION_PATTERN) || [];
  const constructionSet = [...new Set(constructionMatches.map(c => c.toLowerCase()))];
  const construction_family = constructionSet.length > 0 ? constructionSet[0] : 'unknown';

  // Class signal
  const classSignals: string[] = [];
  if (/\b(working|labor|peasant|commoner|servant|field|rough)\b/i.test(text)) classSignals.push('working');
  if (/\b(artisan|craftsman|craftswoman|merchant|skilled|trade)\b/i.test(text)) classSignals.push('artisan');
  if (/\b(elite|noble|aristocrat|lord|lady|court|imperial|royal|samurai|daimyo|shogun)\b/i.test(text)) classSignals.push('elite');
  if (/\b(ceremonial|ritual|sacred|formal|wedding|funeral|coronation|festival|temple)\b/i.test(text)) classSignals.push('ceremonial');
  const class_signal = classSignals[0] || 'unspecified';

  return { fabric_family, garment_family, construction_family, class_signal };
}

export function costumeFingerprintKey(fp: CostumeFamilyFingerprint): string {
  return `${fp.fabric_family}|${fp.garment_family}|${fp.construction_family}|${fp.class_signal}`;
}

// ── Hard Fail Detection ─────────────────────────────────────────────────────

function detectCostumeHardFails(
  promptText: string,
  slotKey: string,
  worldRules?: WorldValidationRules | null,
): string[] {
  const fails: string[] = [];
  const text = promptText.toLowerCase();

  // Must have at least one garment noun
  if (!GARMENT_NOUN_PATTERN.test(text)) {
    // Reset regex lastIndex
    GARMENT_NOUN_PATTERN.lastIndex = 0;
    fails.push('no_garment_noun');
  }
  GARMENT_NOUN_PATTERN.lastIndex = 0;

  // Must have at least one fabric/material noun
  if (!FABRIC_NOUN_PATTERN.test(text)) {
    FABRIC_NOUN_PATTERN.lastIndex = 0;
    fails.push('no_fabric_noun');
  }
  FABRIC_NOUN_PATTERN.lastIndex = 0;

  // Fashion/editorial framing
  if (FASHION_EDITORIAL_PATTERN.test(text)) {
    FASHION_EDITORIAL_PATTERN.lastIndex = 0;
    fails.push('fashion_editorial');
  }
  FASHION_EDITORIAL_PATTERN.lastIndex = 0;

  // Impossible costume constructs — respect world validation mode
  const blockImpossible = worldRules ? worldRules.require_physical_buildability : true;
  if (blockImpossible && IMPOSSIBLE_COSTUME_PATTERN.test(text)) {
    IMPOSSIBLE_COSTUME_PATTERN.lastIndex = 0;
    fails.push('impossible_costume');
  }
  IMPOSSIBLE_COSTUME_PATTERN.lastIndex = 0;

  return fails;
}

// ── Score Functions ─────────────────────────────────────────────────────────

function scoreGarmentSpecificity(text: string): number {
  GARMENT_NOUN_PATTERN.lastIndex = 0;
  const matches = text.match(GARMENT_NOUN_PATTERN) || [];
  GARMENT_NOUN_PATTERN.lastIndex = 0;
  if (matches.length === 0) return 0;
  if (matches.length === 1) return 0.6;
  return Math.min(1, 0.6 + matches.length * 0.1);
}

function scoreFabricLegibility(text: string): number {
  FABRIC_NOUN_PATTERN.lastIndex = 0;
  const matches = text.match(FABRIC_NOUN_PATTERN) || [];
  FABRIC_NOUN_PATTERN.lastIndex = 0;
  if (matches.length === 0) return 0;
  if (matches.length === 1) return 0.6;
  return Math.min(1, 0.6 + matches.length * 0.1);
}

function scoreConstructionDetail(text: string): number {
  CONSTRUCTION_PATTERN.lastIndex = 0;
  const matches = text.match(CONSTRUCTION_PATTERN) || [];
  CONSTRUCTION_PATTERN.lastIndex = 0;
  if (matches.length === 0) return 0.3;
  if (matches.length <= 2) return 0.6;
  return Math.min(1, 0.6 + matches.length * 0.08);
}

function scoreWearability(text: string, worldRules?: WorldValidationRules | null): number {
  // Check for physically wearable language
  const wearable = /\b(wear|worn|dressed|clothed|donned|fitted|draped|wrapped|tied|belted|buckled|fastened|laced|layered)\b/gi;
  const hasWearable = wearable.test(text);

  const requireBuildability = worldRules ? worldRules.require_physical_buildability : true;
  if (!requireBuildability) return 0.8; // Less strict in fantastical mode

  IMPOSSIBLE_COSTUME_PATTERN.lastIndex = 0;
  const hasImpossible = IMPOSSIBLE_COSTUME_PATTERN.test(text);
  IMPOSSIBLE_COSTUME_PATTERN.lastIndex = 0;

  if (hasImpossible) return 0.1;
  if (hasWearable) return 0.9;
  return 0.6;
}

function scoreClassCoherence(text: string, slotKey: string): number {
  const exp = COSTUME_SLOT_EXPECTATIONS[slotKey];
  if (!exp) return 0.5;

  if (exp.expects_class_signal) {
    // Must have class/status signals
    const hasClass = /\b(working|labor|peasant|commoner|artisan|craftsman|merchant|elite|noble|court|imperial|samurai|daimyo)\b/i.test(text);
    return hasClass ? 0.8 : 0.3;
  }
  if (exp.expects_ceremonial) {
    const hasCeremony = /\b(ceremonial|ritual|sacred|formal|wedding|funeral|coronation|festival|temple|shrine)\b/i.test(text);
    return hasCeremony ? 0.8 : 0.3;
  }
  return 0.6;
}

// ── Slot Expectation Checks ─────────────────────────────────────────────────

function checkCostumeSlotExpectations(
  text: string,
  slotKey: string,
): { met: boolean; failures: string[] } {
  const exp = COSTUME_SLOT_EXPECTATIONS[slotKey];
  if (!exp) return { met: true, failures: [] };
  const failures: string[] = [];

  if (exp.expects_wear) {
    COSTUME_WEAR_PATTERN.lastIndex = 0;
    if (!COSTUME_WEAR_PATTERN.test(text)) {
      failures.push('missing_wear_evidence');
    }
    COSTUME_WEAR_PATTERN.lastIndex = 0;
  }

  if (exp.expects_repair) {
    const repairPattern = /\b(patched|mended|darned|repaired|re.?stitched|re.?sewn|reinforced|re.?dyed|altered|let.?out|taken.?in)\b/i;
    if (!repairPattern.test(text)) {
      failures.push('missing_repair_evidence');
    }
  }

  if (exp.expects_class_signal) {
    const hasClass = /\b(working|labor|peasant|commoner|artisan|craftsman|merchant|elite|noble|court|imperial|samurai|daimyo|servant|lord|lady|royal)\b/i.test(text);
    if (!hasClass) {
      failures.push('missing_class_signal');
    }
  }

  if (exp.expects_ceremonial) {
    const hasCeremony = /\b(ceremonial|ritual|sacred|formal|wedding|funeral|coronation|festival|temple|shrine|processional)\b/i.test(text);
    if (!hasCeremony) {
      failures.push('missing_ceremonial_context');
    }
  }

  return { met: failures.length === 0, failures };
}

// ── Main Validator ──────────────────────────────────────────────────────────

const COSTUME_SCORING_MODEL = 'costume_v1';
const COSTUME_VALIDATION_VERSION = '1.0.0';
const COSTUME_PASS_THRESHOLD = 0.45;

/**
 * Validate a costume candidate.
 */
export function validateCostumeCandidate(
  promptText: string,
  slotKey: string,
  anchorFingerprint: CostumeFamilyFingerprint | null,
  worldRules?: WorldValidationRules | null,
): CostumeValidationResult {
  const text = promptText.toLowerCase();
  const fingerprint = deriveCostumeFingerprint(text);
  const fpKey = costumeFingerprintKey(fingerprint);

  const hard_fail_codes = detectCostumeHardFails(text, slotKey, worldRules);
  const advisory_codes: string[] = [];

  // Advisory: fashion editorial detected (but not hard fail in fantastical)
  if (worldRules && !worldRules.require_physical_buildability) {
    FASHION_EDITORIAL_PATTERN.lastIndex = 0;
    if (FASHION_EDITORIAL_PATTERN.test(text)) {
      advisory_codes.push('fashion_editorial_advisory');
    }
    FASHION_EDITORIAL_PATTERN.lastIndex = 0;
  }

  // Score
  const garment_specificity = scoreGarmentSpecificity(text);
  const fabric_legibility = scoreFabricLegibility(text);
  const construction_detail = scoreConstructionDetail(text);
  const wearability = scoreWearability(text, worldRules);
  const class_coherence = scoreClassCoherence(text, slotKey);

  const overall_score = (
    garment_specificity * 0.25 +
    fabric_legibility * 0.25 +
    construction_detail * 0.15 +
    wearability * 0.20 +
    class_coherence * 0.15
  );

  // Slot expectations
  const { met: slot_expectation_met, failures: slot_expectation_failures } = checkCostumeSlotExpectations(text, slotKey);

  // Lineage check (for family-dependent slots)
  if (anchorFingerprint && COSTUME_SLOT_EXPECTATIONS[slotKey]?.expects_same_family) {
    if (fingerprint.fabric_family !== anchorFingerprint.fabric_family && fingerprint.fabric_family !== 'unknown') {
      advisory_codes.push('fabric_family_mismatch');
    }
  }

  const passed = hard_fail_codes.length === 0
    && overall_score >= COSTUME_PASS_THRESHOLD
    && slot_expectation_met;

  return {
    slot_key: slotKey,
    fingerprint,
    fingerprint_key: fpKey,
    scores: {
      garment_specificity,
      fabric_legibility,
      construction_detail,
      wearability,
      class_coherence,
    },
    overall_score,
    passed,
    hard_fail_codes,
    advisory_codes,
    slot_expectation_met,
    slot_expectation_failures,
    scoring_model: COSTUME_SCORING_MODEL,
    validation_version: COSTUME_VALIDATION_VERSION,
  };
}

/**
 * Serialize costume diagnostics for persistence in generation_config.
 */
export function serializeCostumeDiagnostics(
  result: CostumeValidationResult,
  selectionStatus: string,
  anchorRef: string | null,
  anchorGarmentNoun: string | null,
): Record<string, unknown> {
  return {
    costume_validation: {
      slot_key: result.slot_key,
      fingerprint: result.fingerprint,
      fingerprint_key: result.fingerprint_key,
      scores: result.scores,
      overall_score: result.overall_score,
      passed: result.passed,
      hard_fail_codes: result.hard_fail_codes,
      advisory_codes: result.advisory_codes,
      slot_expectation_met: result.slot_expectation_met,
      slot_expectation_failures: result.slot_expectation_failures,
      selection_status: selectionStatus,
      anchor_ref: anchorRef,
      anchor_garment_noun: anchorGarmentNoun,
      scoring_model: result.scoring_model,
      validation_version: result.validation_version,
    },
  };
}
