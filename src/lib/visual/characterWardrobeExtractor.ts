/**
 * characterWardrobeExtractor.ts — Canonical Character Wardrobe Profile extraction engine.
 *
 * Deterministic heuristic extraction from project canon — no LLM dependency.
 * Extracts per-character wardrobe identity, state matrix, and costume change logic.
 * Every state/change is tagged explicit or inferred.
 *
 * v1.5.0 — Dominant anchor precedence, source-explicit resolution, quality diagnostics
 */

// ── Canonical Resolution Types ──────────────────────────────────────────────

/**
 * IEL: ClassResolution tracks the exact source of class determination.
 * Dominant anchor with medium/high confidence always wins over world fallback.
 */
export interface ClassResolution {
  value: 'elite' | 'military' | 'working' | 'artisan' | 'criminal' | 'religious' | 'professional' | 'creative' | 'unspecified';
  source: 'dominant_anchor' | 'character_regex' | 'occupation' | 'world_fallback';
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

export interface SignatureGarmentResolution {
  garments: string[];
  source_breakdown: Array<{ garment: string; source: 'dominant_anchor' | 'character_text' | 'occupation' | 'world_default' | 'generic_fallback' }>;
  usedDominantAnchor: boolean;
  usedWorldFallback: boolean;
  usedGenericFallback: boolean;
}

export interface VariationFieldResolution {
  value: string;
  source: 'character_specific' | 'class_fallback' | 'generic_fallback';
  evidence: string[];
}

export interface VariationResolution {
  public_private_variation: VariationFieldResolution;
  labor_formality_variation: VariationFieldResolution;
  ceremonial_variation: VariationFieldResolution;
  damage_wear_logic: VariationFieldResolution;
}

export interface ProfileQualityAssessment {
  diagnostics: string[];
  dominant_anchor_lost: boolean;
  generic_signature_dominance: boolean;
  all_variations_generic: boolean;
  class_conflict_with_anchor: boolean;
}

export interface WardrobeExtractionDebugSummary {
  dominant_anchor_class: string;
  dominant_anchor_confidence: string;
  dominant_anchor_evidence: string[];
  class_resolution_value: string;
  class_resolution_source: string;
  class_resolution_evidence: string[];
  signature_garment_sources: string[];
  used_world_fallback: boolean;
  used_generic_fallback: boolean;
  profile_variation_sources: string[];
  quality_flags: string[];
}

// ── Profile & Result Types ──────────────────────────────────────────────────

export interface WardrobeStateDefinition {
  state_key: string;
  label: string;
  rationale: string;
  explicit_or_inferred: 'explicit' | 'inferred';
  trigger_conditions: string[];
  garment_adjustments: string[];
  fabric_adjustments: string[];
  silhouette_adjustments: string[];
  accessory_adjustments: string[];
  grooming_adjustments: string[];
  continuity_notes: string[];
}

export interface CharacterWardrobeProfile {
  character_name: string;
  character_id_or_key: string;
  wardrobe_identity_summary: string;
  silhouette_language: string;
  fabric_language: string;
  palette_logic: string;
  grooming_compatibility: string;
  class_status_expression: string;
  public_private_variation: string;
  labor_formality_variation: string;
  ceremonial_variation: string;
  damage_wear_logic: string;
  signature_garments: string[];
  signature_accessories: string[];
  costume_constraints: string[];
  confidence: 'high' | 'medium' | 'low';
  source_doc_types: string[];
  extraction_version: string;
  extracted_at: string;
  quality_diagnostics?: string[];
  extraction_debug?: WardrobeExtractionDebugSummary;
}

export interface CharacterWardrobeExtractionResult {
  profiles: CharacterWardrobeProfile[];
  state_matrix: Record<string, WardrobeStateDefinition[]>;
  /** Scene-level costume evidence (when scene data was provided) */
  scene_costume_evidence: SceneCostumeEvidenceResult | null;
  extraction_version: string;
  extracted_at: string;
  source_doc_types: string[];
}

const EXTRACTION_VERSION = '1.5.0';

import {
  extractSceneCostumeEvidence,
  mergeSceneEvidenceIntoStateMatrix,
  type SceneTextInput,
  type SceneCostumeEvidenceResult,
} from './sceneCostumeEvidence';

// ── Pattern Tables ──────────────────────────────────────────────────────────

const GARMENT_NOUNS = /\b(robe|kimono|hakama|obi|haori|kosode|tunic|shirt|blouse|vest|jacket|coat|cloak|cape|shawl|sash|apron|skirt|trousers|pants|dress|gown|toga|sarong|caftan|tabard|doublet|bodice|corset|smock|uniform|armor|armour|boots|sandals|shoes|slippers|hat|cap|hood|veil|turban|scarf|wrap|belt|gloves|headwrap|suit|blazer|jeans|t-shirt|sweater|cardigan|hoodie|sneakers|heels|loafers|shorts|tank\s*top|polo)\b/gi;

const FABRIC_NOUNS = /\b(silk|cotton|linen|hemp|wool|felt|leather|suede|fur|brocade|damask|satin|velvet|muslin|gauze|chiffon|canvas|burlap|tweed|homespun|undyed|indigo|woven|knitted|quilted|padded|denim|polyester|nylon|cashmere|jersey|fleece|khaki|chambray)\b/gi;

const ACCESSORY_NOUNS = /\b(comb|hairpin|brooch|necklace|bracelet|ring|earring|pendant|amulet|talisman|fan|parasol|umbrella|pouch|bag|satchel|purse|wallet|dagger|sword|staff|cane|walking\s*stick|spectacles|glasses|watch|medal|badge|pin|token|seal|scroll|pipe|lantern|flask|waterskin|scarf|stole|shawl|handkerchief|gloves|sunglasses|backpack|briefcase|phone|laptop|headphones)\b/gi;

const CLASS_SIGNALS: Record<string, RegExp> = {
  elite: /\b(noble|aristocrat|royal|court|lord|lady|prince|princess|emperor|empress|king|queen|duke|duchess|baron|wealthy|privileged|upper\s*class|high\s*born|patrician|ruling|elite|magistrate|senator|advisor|adviser|counselor|councillor|enforcer|regent|matriarch|patriarch|clan|influence|power\s*broker|envoy|chancellor|steward|governess|ceo|executive|mogul|tycoon|billionaire|heiress|heir|socialite|impeccably\s+groomed|expensive|tailored\s+suits?|designer\s+clothes|authority|elegant|luxury)\b/i,
  artisan: /\b(artisan|craftsman|craftsperson|potter|weaver|smith|blacksmith|carpenter|mason|sculptor|painter|calligrapher|jeweler|goldsmith|silversmith|seamstress|tailor|dyer|tanner|brewer|baker|apothecary|herbalist|healer|midwife|merchant|chef|architect|photographer|musician)\b/i,
  working: /\b(servant|maid|laborer|farmer|peasant|fisherman|fisher|worker|soldier|guard|porter|sailor|stable|cook|washer|cleaner|slave|bonded|indentured|field\s*hand|dock\s*worker|miner|waitress|waiter|bartender|driver|mechanic|janitor|cashier)\b/i,
  military: /\b(soldier|warrior|samurai|knight|guard|captain|general|commander|marshal|officer|ranger|scout|archer|cavalry|infantry|mercenary|ronin|bodyguard|agent|operative|detective|investigator|spy|combat|tactical|surveillance|evasion|protector|captor)\b/i,
  religious: /\b(priest|priestess|monk|nun|shrine|temple|clergy|abbot|abbess|bishop|cardinal|shaman|oracle|seer|mystic|acolyte|deacon|imam|rabbi|holy|sacred)\b/i,
  professional: /\b(doctor|lawyer|professor|teacher|journalist|reporter|scientist|engineer|accountant|banker|analyst|consultant|therapist|nurse|pharmacist|judge|attorney|diplomat|bureaucrat|politician|manager|director)\b/i,
  creative: /\b(writer|author|filmmaker|director|actor|actress|singer|dancer|poet|novelist|screenwriter|playwright|composer|producer|curator|critic)\b/i,
  criminal: /\b(thief|smuggler|pirate|outlaw|bandit|gangster|criminal|con\s*man|hustler|dealer|enforcer|assassin|hitman|mobster|racketeer)\b/i,
};

const OCCUPATION_SIGNALS: Record<string, { garments: string[]; fabrics: string[]; accessories: string[] }> = {
  potter: { garments: ['apron', 'smock', 'work robe'], fabrics: ['linen', 'hemp', 'cotton', 'undyed'], accessories: ['tools', 'clay-stained cloth'] },
  weaver: { garments: ['tunic', 'apron', 'work dress'], fabrics: ['homespun', 'linen', 'cotton'], accessories: ['shuttle', 'thread'] },
  farmer: { garments: ['tunic', 'trousers', 'smock', 'hat'], fabrics: ['hemp', 'linen', 'homespun'], accessories: ['straw hat', 'belt'] },
  soldier: { garments: ['uniform', 'armor', 'boots'], fabrics: ['leather', 'wool', 'padded'], accessories: ['sword', 'belt', 'badge'] },
  noble: { garments: ['robe', 'gown', 'kimono', 'haori'], fabrics: ['silk', 'brocade', 'damask', 'satin'], accessories: ['fan', 'comb', 'hairpin', 'ring'] },
  merchant: { garments: ['coat', 'vest', 'robe'], fabrics: ['cotton', 'wool', 'silk'], accessories: ['pouch', 'seal', 'ring'] },
  priest: { garments: ['robe', 'vestment', 'cloak'], fabrics: ['linen', 'silk', 'undyed'], accessories: ['staff', 'amulet', 'scroll'] },
  samurai: { garments: ['hakama', 'kimono', 'haori', 'armor'], fabrics: ['silk', 'cotton', 'leather'], accessories: ['sword', 'fan', 'seal'] },
  advisor: { garments: ['robe', 'kimono', 'haori', 'shawl'], fabrics: ['silk', 'brocade', 'fine cotton'], accessories: ['fan', 'scroll', 'seal', 'ring'] },
  doctor: { garments: ['coat', 'suit', 'shirt'], fabrics: ['cotton', 'linen'], accessories: ['stethoscope', 'badge', 'glasses'] },
  lawyer: { garments: ['suit', 'blazer', 'dress'], fabrics: ['wool', 'cotton', 'silk'], accessories: ['briefcase', 'watch', 'ring'] },
  detective: { garments: ['coat', 'jacket', 'trousers', 'boots'], fabrics: ['leather', 'wool', 'cotton'], accessories: ['badge', 'holster', 'hat'] },
  journalist: { garments: ['jacket', 'shirt', 'trousers'], fabrics: ['cotton', 'denim'], accessories: ['bag', 'glasses', 'phone'] },
  teacher: { garments: ['shirt', 'cardigan', 'trousers', 'dress'], fabrics: ['cotton', 'wool', 'knitted'], accessories: ['glasses', 'bag', 'watch'] },
};

// ── World Context Resolution ────────────────────────────────────────────────

const HISTORICAL_GARMENT_FAMILY = new Set([
  'tunic', 'cloak', 'robe', 'kimono', 'hakama', 'haori', 'kosode',
  'toga', 'tabard', 'doublet', 'bodice', 'corset', 'gown', 'cape',
  'sarong', 'caftan', 'obi',
]);

const MODERN_GARMENT_FAMILY = new Set([
  'hoodie', 'jeans', 'sneakers', 't-shirt', 'sweater', 'cardigan',
  'blazer', 'polo', 'shorts', 'tank top', 'backpack', 'sunglasses',
  'loafers', 'heels',
]);

const HISTORICAL_ERA_KEYS = new Set(['medieval', 'feudal', 'victorian', 'renaissance', 'ancient']);
const MODERN_ERA_KEYS = new Set(['modern', 'contemporary', 'futuristic', 'noir', 'western']);

export type WorldContextConfidence = 'high' | 'medium' | 'low';

export interface WorldContext {
  era: string | null;
  geography: string | null;
  climate: string | null;
  culture: string | null;
  socialStructure: string | null;
  defaultGarments: string[];
  defaultFabrics: string[];
  defaultAccessories: string[];
  resolutionSource: string;
  confidence: WorldContextConfidence;
  contradicted_by_scene_evidence: boolean;
  demoted_garments: string[];
}

export function detectEraContradiction(
  eraKey: string | null,
  sceneGarments: string[],
): { contradicted: boolean; demoted: string[]; reason: string } {
  if (!eraKey || sceneGarments.length === 0) {
    return { contradicted: false, demoted: [], reason: '' };
  }

  const isHistoricalEra = HISTORICAL_ERA_KEYS.has(eraKey);
  const isModernEra = MODERN_ERA_KEYS.has(eraKey);
  const sceneNorm = sceneGarments.map(g => g.toLowerCase().trim());

  if (isHistoricalEra) {
    const modernInScene = sceneNorm.filter(g => MODERN_GARMENT_FAMILY.has(g));
    if (modernInScene.length > 0) {
      const eraDefaults = ERA_SIGNALS[eraKey]?.garments || [];
      const demoted = eraDefaults.filter(g => HISTORICAL_GARMENT_FAMILY.has(g));
      return { contradicted: true, demoted, reason: `Scene contains modern garments (${modernInScene.join(', ')}) contradicting ${eraKey} era defaults` };
    }
  }

  if (isModernEra) {
    const historicalInScene = sceneNorm.filter(g => HISTORICAL_GARMENT_FAMILY.has(g));
    if (historicalInScene.length > 0) {
      const eraDefaults = ERA_SIGNALS[eraKey]?.garments || [];
      const demoted = eraDefaults.filter(g => MODERN_GARMENT_FAMILY.has(g));
      return { contradicted: true, demoted, reason: `Scene contains historical garments (${historicalInScene.join(', ')}) contradicting ${eraKey} era defaults` };
    }
  }

  return { contradicted: false, demoted: [], reason: '' };
}

const ERA_SIGNALS: Record<string, { era: string; garments: string[]; fabrics: string[]; accessories: string[] }> = {
  medieval: { era: 'medieval', garments: ['tunic', 'cloak', 'boots', 'hat'], fabrics: ['wool', 'linen', 'leather'], accessories: ['belt', 'pouch', 'dagger'] },
  feudal: { era: 'feudal', garments: ['kimono', 'hakama', 'robe'], fabrics: ['silk', 'cotton', 'hemp'], accessories: ['fan', 'sword'] },
  victorian: { era: 'victorian', garments: ['dress', 'coat', 'vest', 'hat', 'boots'], fabrics: ['wool', 'cotton', 'silk', 'velvet'], accessories: ['parasol', 'gloves', 'watch', 'cane'] },
  renaissance: { era: 'renaissance', garments: ['doublet', 'gown', 'cape', 'boots'], fabrics: ['silk', 'velvet', 'brocade', 'linen'], accessories: ['ring', 'brooch', 'hat'] },
  ancient: { era: 'ancient', garments: ['toga', 'tunic', 'sandals', 'robe'], fabrics: ['linen', 'wool', 'cotton'], accessories: ['amulet', 'ring', 'belt'] },
  modern: { era: 'modern', garments: ['shirt', 'trousers', 'jacket', 'shoes', 'dress'], fabrics: ['cotton', 'denim', 'polyester', 'wool'], accessories: ['watch', 'phone', 'bag', 'glasses'] },
  contemporary: { era: 'contemporary', garments: ['shirt', 'jeans', 'jacket', 'sneakers', 'dress'], fabrics: ['cotton', 'denim', 'jersey', 'fleece'], accessories: ['phone', 'backpack', 'sunglasses'] },
  futuristic: { era: 'futuristic', garments: ['suit', 'boots', 'jacket', 'uniform'], fabrics: ['nylon', 'leather', 'canvas'], accessories: ['badge', 'glasses'] },
  western: { era: 'western', garments: ['hat', 'boots', 'vest', 'trousers', 'shirt'], fabrics: ['leather', 'denim', 'cotton', 'wool'], accessories: ['belt', 'holster', 'bandana'] },
  noir: { era: 'noir', garments: ['suit', 'coat', 'hat', 'dress', 'heels'], fabrics: ['wool', 'silk', 'satin'], accessories: ['cigarette case', 'hat', 'gloves'] },
};

const ERA_KEYWORDS: Record<string, RegExp> = {
  medieval: /\b(medieval|middle\s*ages?|feudal|castle|keep|kingdom|plague|crusade|knight|serf|peasant|lord|manor|sword|shield|dungeon)\b/i,
  feudal: /\b(feudal|shogun|samurai|daimyo|edo|meiji|sengoku|ronin|bushido|clan|shogunate)\b/i,
  victorian: /\b(victorian|19th\s*century|1800s|gaslight|industrial\s*revolution|empire|colonial|edwardian|regent|regency)\b/i,
  renaissance: /\b(renaissance|15th|16th\s*century|medici|florence|venice|tudor|elizabethan)\b/i,
  ancient: /\b(ancient|roman|greek|egyptian|biblical|classical|antiquity|empire|pharaoh|senator|gladiator|mythology)\b/i,
  modern: /\b(modern|20th\s*century|1900s|1950s|1960s|1970s|1980s|1990s|contemporary|present\s*day|current|today|urban|city|metropolitan|suburban|apartment|office|corporate|ceo|business|company|wealthy|designer\s+clothes|tailored\s+suits?|penthouse|hotel|kidnap|ransom|thriller|phone|laptop|car|helicopter|surveillance|security)\b/i,
  contemporary: /\b(2000s|2010s|2020s|social\s*media|internet|smartphone|millennial|gen\s*z|startup|tech|influencer|instagram|uber|streaming)\b/i,
  futuristic: /\b(futuristic|sci-fi|science\s*fiction|dystopia|utopia|cyberpunk|space|alien|android|robot|colony|starship)\b/i,
  western: /\b(western|frontier|cowboy|saloon|ranch|outlaw|sheriff|gold\s*rush|prairie|desert)\b/i,
  noir: /\b(noir|hard-?boiled|detective|gumshoe|femme\s*fatale|pulp|1940s|1930s|prohibition|speakeasy)\b/i,
};

const CLIMATE_SIGNALS: Record<string, { fabrics: string[]; garments: string[] }> = {
  tropical: { fabrics: ['linen', 'cotton', 'gauze'], garments: ['wrap', 'sandals', 'hat'] },
  cold: { fabrics: ['wool', 'fur', 'felt', 'quilted'], garments: ['coat', 'boots', 'hat', 'gloves', 'scarf'] },
  arid: { fabrics: ['linen', 'cotton', 'canvas'], garments: ['turban', 'robe', 'sandals', 'wrap'] },
  temperate: { fabrics: ['cotton', 'wool', 'linen'], garments: ['jacket', 'boots', 'hat'] },
};

const CLIMATE_KEYWORDS: Record<string, RegExp> = {
  tropical: /\b(tropical|jungle|humid|monsoon|island|equator|rainforest|swamp|marshland)\b/i,
  cold: /\b(cold|frozen|arctic|winter|snow|ice|tundra|glacial|mountain|highland|north|siberian|nordic|scandinavian)\b/i,
  arid: /\b(desert|arid|dry|sand|dune|oasis|sahara|drought|dusty|scorching|steppe)\b/i,
  temperate: /\b(temperate|mild|countryside|pastoral|meadow|woodland|forest|coast|seaside|coastal)\b/i,
};

/**
 * Resolve world context from canon input.
 * IEL: When canonical TemporalTruth is provided, it MUST be used as the era source.
 * The independent ERA_KEYWORDS regex is ONLY used as a fallback when no canonical
 * temporal truth exists. This prevents duplicate/conflicting era resolution.
 */
function resolveWorldContext(canonInput: CanonInput, canonicalTemporalTruth?: { era: string; family: string } | null): WorldContext {
  const worldText = [
    safeStr(canonInput.logline),
    safeStr(canonInput.premise),
    safeStr(canonInput.tone_style),
    safeStr(canonInput.world_rules),
    safeStr(canonInput.setting),
    safeStr(canonInput.ongoing_threads),
    safeStr(canonInput.format_constraints),
    safeStr(canonInput.locations),
    safeStr(canonInput.timeline),
  ].join(' ');

  let era: string | null = null;
  let eraSignals: typeof ERA_SIGNALS[string] | null = null;

  // IEL: Use canonical temporal truth when available — no duplicate regex resolution
  if (canonicalTemporalTruth && canonicalTemporalTruth.era && canonicalTemporalTruth.era !== 'ambiguous') {
    era = canonicalTemporalTruth.era;
    eraSignals = ERA_SIGNALS[era] || null;
  } else {
    // Fallback: independent regex only when no canonical truth exists
    // Iterate modern/contemporary FIRST to prevent false historical matches
    // from broad words like 'lord', 'kingdom', 'sword' in contemporary contexts
    const orderedEras = [
      'contemporary', 'modern', 'noir', 'western', 'futuristic',
      'medieval', 'feudal', 'victorian', 'renaissance', 'ancient',
    ];
    for (const key of orderedEras) {
      const re = ERA_KEYWORDS[key];
      if (re && re.test(worldText)) {
        era = key;
        eraSignals = ERA_SIGNALS[key] || null;
        break;
      }
    }
  }

  let climate: string | null = null;
  let climateSignals: typeof CLIMATE_SIGNALS[string] | null = null;
  for (const [key, re] of Object.entries(CLIMATE_KEYWORDS)) {
    if (re.test(worldText)) {
      climate = key;
      climateSignals = CLIMATE_SIGNALS[key] || null;
      break;
    }
  }

  const defaultGarments = [...(eraSignals?.garments || []), ...(climateSignals?.garments || [])];
  const defaultFabrics = [...(eraSignals?.fabrics || []), ...(climateSignals?.fabrics || [])];
  const defaultAccessories = [...(eraSignals?.accessories || [])];

  const sources: string[] = [];
  if (era) sources.push(canonicalTemporalTruth ? `era:${era}(canonical)` : `era:${era}(regex)`);
  if (climate) sources.push(`climate:${climate}`);

  return {
    era,
    geography: climate ? `${climate} climate` : null,
    climate,
    culture: era || null,
    socialStructure: null,
    defaultGarments: [...new Set(defaultGarments)],
    defaultFabrics: [...new Set(defaultFabrics)],
    defaultAccessories: [...new Set(defaultAccessories)],
    resolutionSource: sources.length > 0 ? `world_context(${sources.join(', ')})` : 'none',
    confidence: canonicalTemporalTruth ? 'high' as WorldContextConfidence : 'high' as WorldContextConfidence,
    contradicted_by_scene_evidence: false,
    demoted_garments: [],
  };
}

// ── State Templates ─────────────────────────────────────────────────────────

interface StateTemplate {
  state_key: string;
  label: string;
  trigger_keywords: RegExp;
  garment_adj: string[];
  fabric_adj: string[];
  silhouette_adj: string[];
  accessory_adj: string[];
  grooming_adj: string[];
  always_infer: boolean;
}

const STATE_TEMPLATES: StateTemplate[] = [
  {
    state_key: 'work',
    label: 'Work / Labor',
    trigger_keywords: /\b(work|labor|craft|workshop|forge|field|studio|kiln|loom|garden|farm|duty|task|toil|trade)\b/i,
    garment_adj: ['practical', 'durable', 'functional'],
    fabric_adj: ['sturdy', 'stain-resistant', 'utilitarian'],
    silhouette_adj: ['loose', 'unencumbered', 'sleeves rolled'],
    accessory_adj: ['tool belt', 'apron', 'protective gear'],
    grooming_adj: ['tied back hair', 'minimal ornamentation'],
    always_infer: true,
  },
  {
    state_key: 'domestic',
    label: 'Domestic / Private',
    trigger_keywords: /\b(home|domestic|private|chamber|bedroom|quarters|bath|morning|evening|rest|relaxed|informal)\b/i,
    garment_adj: ['informal', 'comfortable', 'simplified layers'],
    fabric_adj: ['soft', 'worn-in', 'lightweight'],
    silhouette_adj: ['relaxed', 'fewer layers', 'unstructured'],
    accessory_adj: ['minimal', 'personal items only'],
    grooming_adj: ['hair down', 'natural state'],
    always_infer: true,
  },
  {
    state_key: 'public_formal',
    label: 'Public / Formal',
    trigger_keywords: /\b(court|audience|formal|public|ceremony|official|presentation|reception|banquet|feast|gala)\b/i,
    garment_adj: ['full formal layers', 'status-appropriate', 'complete ensemble'],
    fabric_adj: ['finest available', 'class-appropriate'],
    silhouette_adj: ['structured', 'full silhouette', 'layered'],
    accessory_adj: ['full complement', 'status markers'],
    grooming_adj: ['formal hair arrangement', 'full presentation'],
    always_infer: true,
  },
  {
    state_key: 'ceremonial',
    label: 'Ceremonial',
    trigger_keywords: /\b(ceremony|ritual|wedding|funeral|coronation|investiture|rite|sacred|blessing|offering|celebration|festival|procession)\b/i,
    garment_adj: ['ceremonial-specific', 'traditional', 'prescribed'],
    fabric_adj: ['finest', 'traditional', 'symbolic'],
    silhouette_adj: ['prescribed form', 'traditional shape'],
    accessory_adj: ['ritual objects', 'ceremonial regalia'],
    grooming_adj: ['ceremonial arrangement', 'traditional styling'],
    always_infer: false,
  },
  {
    state_key: 'travel',
    label: 'Travel',
    trigger_keywords: /\b(travel|journey|road|passage|expedition|voyage|march|ride|riding|horseback|carriage|ship|flee|escape|departure|arrival)\b/i,
    garment_adj: ['practical outer layers', 'weather protection', 'durable'],
    fabric_adj: ['sturdy', 'weatherproof', 'layered for temperature'],
    silhouette_adj: ['movement-friendly', 'compact', 'tied down'],
    accessory_adj: ['travel bag', 'walking aid', 'head covering'],
    grooming_adj: ['practical', 'secured'],
    always_infer: false,
  },
  {
    state_key: 'intimate_private',
    label: 'Intimate / Private',
    trigger_keywords: /\b(intimate|lover|embrace|bed|night|undress|bare|skin|touch|caress|closeness|passion|tender)\b/i,
    garment_adj: ['minimal layers', 'inner garments only', 'partially dressed'],
    fabric_adj: ['soft', 'fine', 'sheer'],
    silhouette_adj: ['minimal', 'revealing', 'natural body shape'],
    accessory_adj: ['none or personal keepsake only'],
    grooming_adj: ['natural', 'unbound', 'intimate state'],
    always_infer: false,
  },
  {
    state_key: 'distress_aftermath',
    label: 'Distress / Aftermath',
    trigger_keywords: /\b(wound|blood|torn|injured|beaten|attack|aftermath|disaster|fire|flood|battle|grief|shock|trauma|collapse|destruction|escape)\b/i,
    garment_adj: ['damaged', 'torn', 'incomplete', 'stained'],
    fabric_adj: ['torn', 'blood-stained', 'mud-stained', 'singed'],
    silhouette_adj: ['disrupted', 'disheveled', 'asymmetric'],
    accessory_adj: ['lost or damaged', 'bandages'],
    grooming_adj: ['disheveled', 'unkempt', 'bloodied'],
    always_infer: false,
  },
  {
    state_key: 'disguise_concealment',
    label: 'Disguise / Concealment',
    trigger_keywords: /\b(disguise|conceal|hidden|secret|incognito|cover|mask|cloak|hood|false|pretend|infiltrate|spy|smuggle|sneak)\b/i,
    garment_adj: ['concealing', 'nondescript', 'borrowed', 'wrong class'],
    fabric_adj: ['common', 'unremarkable', 'mismatched'],
    silhouette_adj: ['concealing', 'shapeless', 'hooded'],
    accessory_adj: ['concealment aids', 'false tokens'],
    grooming_adj: ['altered', 'hidden features', 'covered'],
    always_infer: false,
  },
  {
    state_key: 'weather_adapted',
    label: 'Weather-Adapted',
    trigger_keywords: /\b(rain|snow|storm|cold|heat|wind|monsoon|winter|summer|ice|frost|sun|scorching|wet|drenched|soaked)\b/i,
    garment_adj: ['weather-appropriate layers', 'protective outer layer'],
    fabric_adj: ['waterproof', 'insulated', 'lightweight for heat'],
    silhouette_adj: ['bulkier in cold', 'lighter in heat'],
    accessory_adj: ['weather protection', 'head covering'],
    grooming_adj: ['weather-adapted', 'protected'],
    always_infer: false,
  },
  {
    state_key: 'night_rest',
    label: 'Night / Rest',
    trigger_keywords: /\b(sleep|night|rest|bed|dream|wake|dawn|pajama|nightgown|nightclothes|resting)\b/i,
    garment_adj: ['sleeping garments', 'inner layers only', 'undressed'],
    fabric_adj: ['soft', 'comfortable', 'lightweight'],
    silhouette_adj: ['loose', 'flowing', 'unstructured'],
    accessory_adj: ['none'],
    grooming_adj: ['unbound hair', 'natural state'],
    always_infer: false,
  },
];

// ── Era-Aware Garment Gating ────────────────────────────────────────────────

function gateGarmentsForEra(garments: string[], era: string | null): string[] {
  if (!era) return garments;
  const isModern = MODERN_ERA_KEYS.has(era);
  const isHistorical = HISTORICAL_ERA_KEYS.has(era);
  if (!isModern && !isHistorical) return garments;
  return garments.filter(g => {
    const lower = g.toLowerCase();
    if (isModern && HISTORICAL_GARMENT_FAMILY.has(lower)) return false;
    if (isHistorical && MODERN_GARMENT_FAMILY.has(lower)) return false;
    return true;
  });
}

// ── Safe String Helpers ─────────────────────────────────────────────────────

function safeStr(val: unknown): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.filter(v => typeof v === 'string').join('\n');
  if (val && typeof val === 'object') return Object.values(val).filter(v => typeof v === 'string').join('\n');
  return '';
}

function normalizeKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function matchAll(text: string, pattern: RegExp): string[] {
  const matches = text.match(new RegExp(pattern.source, pattern.flags));
  return [...new Set((matches || []).map(m => m.toLowerCase().trim()))];
}

// ── Character Canon Input ───────────────────────────────────────────────────

interface CharacterInput {
  name?: string;
  role?: string;
  traits?: string;
  goals?: string;
  secrets?: string;
  relationships?: string;
  backstory?: string;
  description?: string;
  [key: string]: unknown;
}

interface CanonInput {
  characters?: CharacterInput[];
  logline?: string;
  premise?: string;
  tone_style?: string;
  world_rules?: string | string[];
  setting?: string;
  ongoing_threads?: string;
  format_constraints?: string;
  locations?: string;
  timeline?: string;
  scene_texts?: SceneTextInput[];
  visual_canon_primitives?: {
    material_systems?: Array<{ key: string; label: string; linked_characters: string[] }>;
    ritual_systems?: Array<{ key: string; label: string; linked_characters: string[] }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ── Dominant Wardrobe Signal Detection ──────────────────────────────────────

/**
 * IEL TRIPWIRE: Dominant wardrobe anchors are detected from CHARACTER-LOCAL text only.
 * World text is NEVER used here — world text is a weak fallback for class detection only.
 * Adjective leakage (e.g., "artistic" → artisan) is explicitly blocked.
 */

interface DominantWardrobeAnchor {
  classAnchor: 'elite' | 'military' | 'working' | 'artisan' | 'criminal' | 'religious' | 'professional' | 'creative' | 'unspecified';
  garmentAnchors: string[];
  stylingAnchors: string[];
  damageAnchors: string[];
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

const DOMINANT_ANCHOR_PATTERNS: Record<string, { class: DominantWardrobeAnchor['classAnchor']; patterns: RegExp; garments: string[]; styling: string[] }> = {
  elite_luxury: {
    class: 'elite',
    patterns: /\b(designer\s+clothes|tailored\s+suits?|expensive\s+suits?|impeccably\s+groomed|elegant|polished\s+perfection|luxury|couture|haute|wealthy|heiress?|socialite|bride|bridal|fiancée?|wedding\s+(?:dress|gown)|penthouse|affluent|refined|high[\s-]fashion|bespoke|prestigious)\b/i,
    garments: ['dress', 'suit', 'heels', 'coat', 'blazer'],
    styling: ['polished', 'elegant', 'luxurious', 'refined'],
  },
  military_tactical: {
    class: 'military',
    patterns: /\b(combat|tactical|surveillance|evasion|operative|close[\s-]quarters|protector|bodyguard|military\s+intelligence|field\s+operations?|tactical\s+gear|duty|reconnaissance|extraction|covert)\b/i,
    garments: ['jacket', 'boots', 'trousers', 'vest'],
    styling: ['practical', 'dark', 'functional', 'utilitarian'],
  },
  corporate_professional: {
    class: 'elite',
    patterns: /\b(corporate|ceo|executive|boardroom|business\s+(?:suit|attire)|authority|power\s+broker|mogul|tycoon|consultant|director|managing\s+partner)\b/i,
    garments: ['suit', 'shirt', 'shoes', 'blazer'],
    styling: ['tailored', 'formal', 'authoritative', 'impeccable'],
  },
  artisan_real: {
    class: 'artisan',
    // IEL: Only TRUE craft/occupation nouns — never adjectives like "artistic"
    patterns: /\b(kiln|clay|pottery|forge|carpenter|seamstress|blacksmith|tailor|workshop(?:\s+interior)?|laborer|weaver|dyer|tanner|glassblower|woodworker|stonemason)\b/i,
    garments: ['apron', 'smock', 'work robe'],
    styling: ['stained', 'worn', 'practical'],
  },
  criminal_direct: {
    class: 'criminal',
    // Only match when the character IS a criminal, not when they're a victim of crime
    patterns: /\b(thief|smuggler|pirate|outlaw|gangster|con\s*man|hustler|dealer|assassin|hitman|mobster|racketeer|fixer|crime\s+boss|drug\s+lord)\b/i,
    garments: ['jacket', 'boots', 'coat'],
    styling: ['dark', 'concealing', 'street-level'],
  },
};

const DAMAGE_ANCHOR_PATTERNS = /\b(torn\s+clothing|smudged\s+makeup|raw\s+desperate|frays?\s+under\s+duress|bloodied|disheveled|bruised|stained|tattered|ripped|shredded|battered)\b/gi;

/**
 * Detect dominant wardrobe signals from character-local text ONLY.
 * IEL: Character-local dominant anchors outrank world-level narrative context.
 */
export function detectDominantWardrobeSignals(char: CharacterInput): DominantWardrobeAnchor {
  const charText = [char.name, char.role, char.traits, char.goals, char.secrets, char.relationships, char.backstory, char.description]
    .filter(Boolean).map(safeStr).join(' ');

  const matches: Array<{ key: string; entry: typeof DOMINANT_ANCHOR_PATTERNS[string]; matchCount: number; evidence: string[] }> = [];

  for (const [key, entry] of Object.entries(DOMINANT_ANCHOR_PATTERNS)) {
    const found = charText.match(new RegExp(entry.patterns.source, 'gi'));
    if (found && found.length > 0) {
      matches.push({ key, entry, matchCount: found.length, evidence: [...new Set(found.map(f => f.toLowerCase().trim()))] });
    }
  }

  const damageFound = charText.match(DAMAGE_ANCHOR_PATTERNS) || [];
  const damageAnchors = [...new Set(damageFound.map(d => d.toLowerCase().trim()))];

  if (matches.length === 0) {
    return {
      classAnchor: 'unspecified',
      garmentAnchors: [],
      stylingAnchors: [],
      damageAnchors,
      confidence: 'low',
      evidence: damageAnchors,
    };
  }

  matches.sort((a, b) => b.matchCount - a.matchCount);
  const best = matches[0];

  return {
    classAnchor: best.entry.class,
    garmentAnchors: best.entry.garments,
    stylingAnchors: best.entry.styling,
    damageAnchors,
    confidence: best.matchCount >= 3 ? 'high' : best.matchCount >= 2 ? 'medium' : 'low',
    evidence: best.evidence,
  };
}

// ── Phase B: Class Resolution (source-explicit) ─────────────────────────────

function detectClass(charText: string): string {
  // IEL TRIPWIRE: "artisan" requires TRUE craft/occupation evidence, not adjectives.
  const priorityOrder = ['military', 'religious', 'criminal', 'elite', 'professional', 'creative', 'working', 'artisan'];
  for (const cls of priorityOrder) {
    if (CLASS_SIGNALS[cls].test(charText)) return cls;
  }
  return 'unspecified';
}

/**
 * IEL: resolveClassWithPrecedence — canonical class resolution with explicit source tracking.
 * Dominant anchor with medium/high confidence ALWAYS wins over world fallback.
 * World fallback is gap-fill only — it can NEVER overwrite a strong character-local anchor.
 */
function resolveClassWithPrecedence(
  charText: string,
  worldText: string,
  dominantAnchor: DominantWardrobeAnchor,
): ClassResolution {
  // 1. Dominant anchor with medium/high confidence wins unconditionally
  if (dominantAnchor.classAnchor !== 'unspecified' && dominantAnchor.confidence !== 'low') {
    return {
      value: dominantAnchor.classAnchor,
      source: 'dominant_anchor',
      confidence: dominantAnchor.confidence,
      evidence: dominantAnchor.evidence,
    };
  }

  // 2. Character-local regex detection
  const charClass = detectClass(charText);
  if (charClass !== 'unspecified') {
    return {
      value: charClass as ClassResolution['value'],
      source: 'character_regex',
      confidence: 'medium',
      evidence: [`character text matched ${charClass} class pattern`],
    };
  }

  // 3. World text as weak fallback — gap-fill only
  const worldClass = detectClass(worldText);
  if (worldClass !== 'unspecified') {
    return {
      value: worldClass as ClassResolution['value'],
      source: 'world_fallback',
      confidence: 'low',
      evidence: [`world text matched ${worldClass} class pattern (weak fallback)`],
    };
  }

  return {
    value: 'unspecified',
    source: 'world_fallback',
    confidence: 'low',
    evidence: ['no class signal detected'],
  };
}

// ── Phase C: Occupation Detection ───────────────────────────────────────────

function detectOccupation(charText: string): string | null {
  const occupationWords = Object.keys(OCCUPATION_SIGNALS);
  const lower = charText.toLowerCase();
  for (const occ of occupationWords) {
    if (lower.includes(occ)) return occ;
  }
  return null;
}

// ── Phase D: Signature Garment Resolution (source-explicit) ─────────────────

/**
 * IEL: resolveSignatureGarmentsWithPrecedence — builds garment list with explicit per-garment source tracking.
 * Dominant anchor garments take precedence. Generic fallback trio (boots/hat/jacket) must NOT
 * dominate when strong anchor evidence exists.
 */
function resolveSignatureGarmentsWithPrecedence(
  dominantAnchor: DominantWardrobeAnchor,
  charText: string,
  occupation: string | null,
  worldCtx: WorldContext,
): SignatureGarmentResolution {
  const sourceBreakdown: SignatureGarmentResolution['source_breakdown'] = [];
  let usedDominantAnchor = false;
  let usedWorldFallback = false;
  let usedGenericFallback = false;

  const seen = new Set<string>();
  const addGarment = (g: string, source: SignatureGarmentResolution['source_breakdown'][0]['source']) => {
    const lower = g.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      sourceBreakdown.push({ garment: lower, source });
    }
  };

  // 1. Dominant anchor garments (highest precedence)
  if (dominantAnchor.garmentAnchors.length > 0) {
    const gated = gateGarmentsForEra(dominantAnchor.garmentAnchors, worldCtx.era);
    gated.forEach(g => { addGarment(g, 'dominant_anchor'); usedDominantAnchor = true; });
  }

  // 2. Character-local garment nouns from text
  const charGarments = gateGarmentsForEra(matchAll(charText, GARMENT_NOUNS), worldCtx.era);
  charGarments.forEach(g => addGarment(g, 'character_text'));

  // 3. Occupation garments
  const occSignals = occupation ? OCCUPATION_SIGNALS[occupation] : null;
  if (occSignals) {
    gateGarmentsForEra(occSignals.garments, worldCtx.era).forEach(g => addGarment(g, 'occupation'));
  }

  // 4. Era-gated world context defaults — ONLY if we have fewer than 2 garments so far
  // IEL TRIPWIRE: World defaults are gap-fill only — cannot dominate when anchor evidence exists
  if (sourceBreakdown.length < 2) {
    worldCtx.defaultGarments.forEach(g => { addGarment(g, 'world_default'); usedWorldFallback = true; });
  }

  // 5. Generic fallback — ONLY when nothing else exists
  if (sourceBreakdown.length === 0) {
    usedGenericFallback = true;
    ['shirt', 'trousers', 'shoes'].forEach(g => addGarment(g, 'generic_fallback'));
  }

  return {
    garments: sourceBreakdown.slice(0, 8).map(sb => sb.garment),
    source_breakdown: sourceBreakdown.slice(0, 8),
    usedDominantAnchor,
    usedWorldFallback,
    usedGenericFallback,
  };
}

// ── Phase E: Variation Field Resolution (source-explicit) ───────────────────

function deriveVariationsWithSource(
  char: CharacterInput,
  classRes: ClassResolution,
  occupation: string | null,
  sigGarments: string[],
  worldCtx: WorldContext,
): VariationResolution {
  const desc = safeStr(char.description).toLowerCase();
  const traits = safeStr(char.traits).toLowerCase();
  const role = safeStr(char.role).toLowerCase();
  const backstory = safeStr(char.backstory).toLowerCase();
  const allCharText = `${desc} ${traits} ${role} ${backstory}`;
  const charClass = classRes.value;

  // ── Public/Private Variation ──
  const formalCues = allCharText.match(/\b(designer\s+clothes|tailored\s+suits?|formal\s+wear|business\s+attire|elegant|polished|immaculate|pristine|luxury|expensive|couture|haute|impeccably\s+groomed|flawless|perfection|authority|power|confident)\b/gi) || [];
  const casualCues = allCharText.match(/\b(casual|informal|relaxed|comfortable|stripped\s+down|disheveled|simple|plain|worn|weathered|practical|functional|raw|desperate|frays|smudged|torn)\b/gi) || [];

  let ppValue: string;
  let ppSource: VariationFieldResolution['source'];
  let ppEvidence: string[] = [];

  if (formalCues.length > 0 && casualCues.length > 0) {
    ppValue = `Strong contrast: public appearance (${formalCues.slice(0, 2).join(', ')}) vs private reality (${casualCues.slice(0, 2).join(', ')})`;
    ppSource = 'character_specific';
    ppEvidence = [...formalCues.slice(0, 2), ...casualCues.slice(0, 2)];
  } else if (formalCues.length > 0) {
    ppValue = `Public persona defined by ${formalCues.slice(0, 3).join(', ')} — private state is stripped back`;
    ppSource = 'character_specific';
    ppEvidence = formalCues.slice(0, 3);
  } else if (casualCues.length > 0) {
    ppValue = `Primarily ${casualCues.slice(0, 2).join(', ')} — formality only when required`;
    ppSource = 'character_specific';
    ppEvidence = casualCues.slice(0, 2);
  } else if (charClass === 'elite') {
    ppValue = 'Strong formal/informal divide — status garments in public, simplified in private';
    ppSource = 'class_fallback';
  } else if (charClass === 'military') {
    ppValue = 'Uniform in duty, minimal personal wardrobe off-duty';
    ppSource = 'class_fallback';
  } else {
    ppValue = 'Moderate variation by context — role-driven transitions';
    ppSource = 'generic_fallback';
  }

  // ── Labor/Formality Variation ──
  let lfValue: string;
  let lfSource: VariationFieldResolution['source'];
  let lfEvidence: string[] = [];

  if (occupation) {
    const occGarments = OCCUPATION_SIGNALS[occupation]?.garments || [];
    lfValue = `Work state defined by ${occupation} occupation — ${occGarments.slice(0, 2).join(', ')} for active work, shifts to role-appropriate when off-duty`;
    lfSource = 'character_specific';
    lfEvidence = [occupation];
  } else {
    const workCues = allCharText.match(/\b(combat|tactical|extraction|protection|investigation|surveillance|office|boardroom|studio|workshop|field|laboratory)\b/gi) || [];
    if (workCues.length > 0) {
      lfValue = `Work/duty mode: ${workCues.slice(0, 3).join(', ')} — shifts between operational and presentational garments`;
      lfSource = 'character_specific';
      lfEvidence = workCues.slice(0, 3);
    } else if (charClass === 'elite') {
      lfValue = 'Formality is default — work contexts require maintained appearance with subtle relaxation';
      lfSource = 'class_fallback';
    } else if (charClass === 'military') {
      lfValue = 'Regulated duty wear vs off-duty informality — rank visible in both';
      lfSource = 'class_fallback';
    } else {
      lfValue = 'General role-based variation — work demands define primary wardrobe';
      lfSource = 'generic_fallback';
    }
  }

  // ── Ceremonial Variation ──
  let cerValue: string;
  let cerSource: VariationFieldResolution['source'];
  let cerEvidence: string[] = [];

  const ceremonialCues = allCharText.match(/\b(wedding|engagement|gala|ceremony|ritual|funeral|celebration|coronation|reception|party|banquet)\b/gi) || [];
  if (ceremonialCues.length > 0) {
    cerValue = `Ceremonial contexts present: ${[...new Set(ceremonialCues)].slice(0, 3).join(', ')} — expects elevated garments (formal dress, suit, or ceremonial attire)`;
    cerSource = 'character_specific';
    cerEvidence = [...new Set(ceremonialCues)].slice(0, 3);
  } else if (charClass === 'elite') {
    cerValue = 'Expected to participate in formal events — finest garments reserved for ceremony';
    cerSource = 'class_fallback';
  } else if (charClass === 'religious') {
    cerValue = 'Ritual vestments prescribed — separate from daily wear';
    cerSource = 'class_fallback';
  } else {
    cerValue = 'Limited ceremonial context — best available garments for special occasions';
    cerSource = 'generic_fallback';
  }

  // ── Damage/Wear Logic ──
  let dmgValue: string;
  let dmgSource: VariationFieldResolution['source'];
  let dmgEvidence: string[] = [];

  const damageCues = allCharText.match(/\b(torn|smudged|stained|bloodied|disheveled|raw|desperate|frayed|damaged|tattered|mud|dirt|worn|weathered|scarred|wounded|injured|beaten)\b/gi) || [];
  if (damageCues.length > 0) {
    dmgValue = `Damage trajectory: ${[...new Set(damageCues)].slice(0, 4).join(', ')} — wardrobe degrades under duress, revealing vulnerability through clothing state`;
    dmgSource = 'character_specific';
    dmgEvidence = [...new Set(damageCues)].slice(0, 4);
  } else if (charClass === 'working' || charClass === 'artisan') {
    dmgValue = 'Regular wear and staining expected from labor — damage is normal state';
    dmgSource = 'class_fallback';
  } else if (charClass === 'elite') {
    dmgValue = 'Damage rare — signals crisis or fall from status, visually dramatic against pristine baseline';
    dmgSource = 'class_fallback';
  } else if (charClass === 'military') {
    dmgValue = 'Combat damage expected — field wear distinct from parade condition';
    dmgSource = 'class_fallback';
  } else {
    dmgValue = 'Moderate wear appropriate to role — damage signals narrative escalation';
    dmgSource = 'generic_fallback';
  }

  return {
    public_private_variation: { value: ppValue, source: ppSource, evidence: ppEvidence },
    labor_formality_variation: { value: lfValue, source: lfSource, evidence: lfEvidence },
    ceremonial_variation: { value: cerValue, source: cerSource, evidence: cerEvidence },
    damage_wear_logic: { value: dmgValue, source: dmgSource, evidence: dmgEvidence },
  };
}

// ── Phase F: Profile Quality Assessment ─────────────────────────────────────

/**
 * IEL: assessWardrobeProfileQuality inspects the final resolved profile against intermediate
 * evidence to flag obviously degraded results. Does NOT block persistence — diagnostics only.
 */
function assessWardrobeProfileQuality(
  dominantAnchor: DominantWardrobeAnchor,
  classRes: ClassResolution,
  garmentRes: SignatureGarmentResolution,
  variationRes: VariationResolution,
): ProfileQualityAssessment {
  const diagnostics: string[] = [];

  // Check: dominant anchor lost
  const anchorLost = dominantAnchor.classAnchor !== 'unspecified' &&
    dominantAnchor.confidence !== 'low' &&
    classRes.value !== dominantAnchor.classAnchor;

  if (anchorLost) {
    diagnostics.push(`dominant_anchor_lost: anchor=${dominantAnchor.classAnchor} but class=${classRes.value}`);
  }

  // Check: class conflict with anchor
  const classConflict = dominantAnchor.classAnchor !== 'unspecified' &&
    classRes.value !== dominantAnchor.classAnchor &&
    classRes.source !== 'dominant_anchor';

  if (classConflict) {
    diagnostics.push(`class_conflict: anchor=${dominantAnchor.classAnchor} resolved_class=${classRes.value} source=${classRes.source}`);
  }

  // Check: generic signature dominance
  const genericGarmentCount = garmentRes.source_breakdown.filter(sb =>
    sb.source === 'generic_fallback' || sb.source === 'world_default'
  ).length;
  const anchorGarmentCount = garmentRes.source_breakdown.filter(sb =>
    sb.source === 'dominant_anchor' || sb.source === 'character_text'
  ).length;
  const genericDominance = genericGarmentCount > anchorGarmentCount && garmentRes.garments.length > 0;

  if (genericDominance) {
    diagnostics.push(`generic_signature_dominance: ${genericGarmentCount}/${garmentRes.garments.length} garments from fallback/world`);
  }

  // Check: all variations generic
  const varSources = [
    variationRes.public_private_variation.source,
    variationRes.labor_formality_variation.source,
    variationRes.ceremonial_variation.source,
    variationRes.damage_wear_logic.source,
  ];
  const allGeneric = varSources.every(s => s === 'generic_fallback');
  if (allGeneric) {
    diagnostics.push('all_variation_fields_generic: no character-specific or class-fallback variation detected');
  }

  return {
    diagnostics,
    dominant_anchor_lost: anchorLost,
    generic_signature_dominance: genericDominance,
    all_variations_generic: allGeneric,
    class_conflict_with_anchor: classConflict,
  };
}

// ── Phase G: Assemble Final Profile ─────────────────────────────────────────

function extractCharacterProfile(
  char: CharacterInput,
  worldText: string,
  canonInput: CanonInput,
  sourceDocs: Set<string>,
  worldCtx: WorldContext,
): CharacterWardrobeProfile {
  const name = char.name || 'Unknown';
  const charKey = normalizeKey(name);

  const charFields = [char.name, char.role, char.traits, char.goals, char.secrets, char.relationships, char.backstory, char.description]
    .filter(Boolean).map(safeStr);
  const charText = charFields.join(' ');
  const allText = charText + ' ' + worldText;

  // ── Phase A: Detect Dominant Wardrobe Signals (character-local ONLY) ──
  // IEL TRIPWIRE: Dominant anchors come from character text exclusively.
  // World text is NEVER passed to detectDominantWardrobeSignals.
  const dominantAnchor = detectDominantWardrobeSignals(char);

  // ── Phase B: Class resolution with explicit source tracking ──
  // IEL TRIPWIRE: Character-local dominant anchor outranks world-level class detection.
  // World text must NEVER outrank a strong character-local anchor.
  const classRes = resolveClassWithPrecedence(charText, worldText, dominantAnchor);

  // ── Phase C: Occupation detection ──
  const occupation = detectOccupation(charText) || detectOccupation(allText);

  // ── Phase D: Signature garment resolution with source tracking ──
  // IEL TRIPWIRE: Dominant garment anchors take precedence over generic regex extraction.
  // If dominant-anchor garments exist, generic fallback trio MUST NOT become the leading output.
  const garmentRes = resolveSignatureGarmentsWithPrecedence(dominantAnchor, charText, occupation, worldCtx);

  // ── Phase E: Variation field resolution with source tracking ──
  const variationRes = deriveVariationsWithSource(char, classRes, occupation, garmentRes.garments, worldCtx);

  // ── Phase F: Quality assessment ──
  const quality = assessWardrobeProfileQuality(dominantAnchor, classRes, garmentRes, variationRes);

  // ── Fabric + Accessory resolution (unchanged logic) ──
  const textFabrics = matchAll(allText, FABRIC_NOUNS);
  const textAccessories = matchAll(allText, ACCESSORY_NOUNS);
  const occSignals = occupation ? OCCUPATION_SIGNALS[occupation] : null;

  const gapFilledFabrics = textFabrics.length >= 1 ? textFabrics
    : [...new Set([...textFabrics, ...worldCtx.defaultFabrics])];
  const gapFilledAccessories = textAccessories.length >= 1 ? textAccessories
    : [...new Set([...textAccessories, ...worldCtx.defaultAccessories])];

  const sigAccessories = [...new Set([...gapFilledAccessories, ...(occSignals?.accessories || [])])].slice(0, 6);
  const fabricList = [...new Set([...gapFilledFabrics, ...(occSignals?.fabrics || [])])];

  // Track provenance
  if (char.role) sourceDocs.add('character_role');
  if (char.traits) sourceDocs.add('character_traits');
  if (char.description) sourceDocs.add('character_description');
  if (worldCtx.resolutionSource !== 'none') sourceDocs.add('world_context');
  if (dominantAnchor.classAnchor !== 'unspecified') sourceDocs.add('dominant_wardrobe_anchor');

  // Build labels
  const classLabel = classRes.value !== 'unspecified' ? classRes.value
    : worldCtx.era ? `${worldCtx.era}-era contextual` : 'contextual';
  const occLabel = occupation
    || (char.role ? safeStr(char.role).split(/[\s,]+/)[0].toLowerCase() : null)
    || 'general';

  const hasWorldContext = worldCtx.era !== null || worldCtx.climate !== null;
  const confidence: 'high' | 'medium' | 'low' =
    (dominantAnchor.confidence === 'high') ? 'high' :
    (garmentRes.garments.length >= 2 && fabricList.length >= 1) ? 'high' :
    (garmentRes.garments.length >= 1 || occupation || hasWorldContext) ? 'medium' : 'low';

  // Linked materials from visual canon
  const linkedMaterials = (canonInput.visual_canon_primitives?.material_systems || [])
    .filter(m => m.linked_characters.some(lc => normalizeKey(lc) === charKey))
    .map(m => m.label);

  // Build identity summary — anchor-driven when available
  const garmentSummary = garmentRes.garments.length > 0
    ? garmentRes.garments.slice(0, 3).join(', ')
    : hasWorldContext
    ? `${worldCtx.era || worldCtx.climate || 'contextual'}-appropriate garments`
    : 'role-appropriate garments';

  // Build debug summary for persistence
  const varSources = [
    variationRes.public_private_variation.source,
    variationRes.labor_formality_variation.source,
    variationRes.ceremonial_variation.source,
    variationRes.damage_wear_logic.source,
  ];

  const debugSummary: WardrobeExtractionDebugSummary = {
    dominant_anchor_class: dominantAnchor.classAnchor,
    dominant_anchor_confidence: dominantAnchor.confidence,
    dominant_anchor_evidence: dominantAnchor.evidence,
    class_resolution_value: classRes.value,
    class_resolution_source: classRes.source,
    class_resolution_evidence: classRes.evidence,
    signature_garment_sources: garmentRes.source_breakdown.map(sb => `${sb.garment}:${sb.source}`),
    used_world_fallback: garmentRes.usedWorldFallback,
    used_generic_fallback: garmentRes.usedGenericFallback,
    profile_variation_sources: varSources,
    quality_flags: quality.diagnostics,
  };

  return {
    character_name: name,
    character_id_or_key: charKey,
    wardrobe_identity_summary: `${classLabel} ${occLabel} — ${garmentSummary}`.trim(),
    silhouette_language: deriveSilhouette(classRes.value),
    fabric_language: fabricList.length > 0 ? fabricList.join(', ') : deriveDefaultFabric(classRes.value),
    palette_logic: derivePalette(classRes.value, occupation),
    grooming_compatibility: deriveGrooming(classRes.value, char),
    class_status_expression: `${classLabel}${occupation ? ` (${occLabel})` : ''}${classRes.source === 'world_fallback' ? ' [world-inferred]' : ''}`,
    public_private_variation: variationRes.public_private_variation.value,
    labor_formality_variation: variationRes.labor_formality_variation.value,
    ceremonial_variation: variationRes.ceremonial_variation.value,
    damage_wear_logic: variationRes.damage_wear_logic.value,
    signature_garments: garmentRes.garments,
    signature_accessories: sigAccessories,
    costume_constraints: buildConstraints(classRes.value, occupation, linkedMaterials),
    confidence,
    source_doc_types: Array.from(sourceDocs),
    extraction_version: EXTRACTION_VERSION,
    extracted_at: new Date().toISOString(),
    quality_diagnostics: quality.diagnostics.length > 0 ? quality.diagnostics : undefined,
    extraction_debug: debugSummary,
  };
}

function deriveSilhouette(charClass: string): string {
  if (charClass === 'elite') return 'Structured, layered, full-length — status expressed through volume and formality';
  if (charClass === 'military' || charClass === 'religious') return 'Prescribed silhouette — uniform or vestment-defined';
  if (charClass === 'artisan') return 'Practical, fitted upper body, durable — craft-appropriate';
  if (charClass === 'working') return 'Functional, unadorned, movement-friendly — labor-defined';
  if (charClass === 'professional') return 'Structured, clean lines — role-appropriate formality';
  if (charClass === 'creative') return 'Expressive, individual — personal style as identity';
  if (charClass === 'criminal') return 'Functional, concealing, adaptable — anonymity or intimidation';
  return 'Moderate structure — role and context dependent';
}

function deriveDefaultFabric(charClass: string): string {
  if (charClass === 'elite') return 'silk, brocade, fine materials';
  if (charClass === 'military') return 'leather, wool, padded cloth';
  if (charClass === 'religious') return 'linen, undyed, simple cloth';
  if (charClass === 'artisan') return 'linen, hemp, cotton';
  if (charClass === 'working') return 'hemp, homespun, coarse linen';
  if (charClass === 'professional') return 'wool, cotton, linen — tailored quality';
  if (charClass === 'creative') return 'varied, expressive — personal choice';
  if (charClass === 'criminal') return 'leather, denim, dark cotton';
  return 'cotton, wool, linen — setting-appropriate';
}

function derivePalette(charClass: string, occupation: string | null): string {
  if (charClass === 'elite') return 'Rich, saturated — status communicated through color depth and variety';
  if (charClass === 'working') return 'Muted, earth-toned — undyed or minimally dyed fabrics';
  if (charClass === 'artisan') return 'Work-stained, occupation-influenced — craft residue as identity marker';
  if (charClass === 'military') return 'Regimented — rank/unit signifiers through controlled color';
  if (charClass === 'religious') return 'Restrained, symbolic — prescribed colors or deliberate absence';
  if (charClass === 'professional') return 'Controlled, conservative — trust and authority through restraint';
  if (charClass === 'creative') return 'Expressive, eclectic — personality expressed through color choice';
  if (charClass === 'criminal') return 'Dark, muted — anonymity, intimidation, or false respectability';
  return 'Moderate palette — context-driven';
}

function deriveGrooming(charClass: string, char: CharacterInput): string {
  const traits = safeStr(char.traits).toLowerCase();
  if (traits.includes('unkempt') || traits.includes('rough')) return 'Rough, practical grooming — minimal ornamentation';
  if (charClass === 'elite') return 'Formal grooming — arranged hair, status ornamentation';
  if (charClass === 'artisan') return 'Practical — tied back, work-safe, possibly stained hands';
  if (charClass === 'working') return 'Minimal — functional only';
  return 'Role-appropriate grooming';
}

function buildConstraints(charClass: string, occupation: string | null, linkedMaterials: string[]): string[] {
  const c: string[] = [];
  if (charClass === 'working') c.push('No luxury fabrics unless disguised');
  if (charClass === 'elite') c.push('Minimum formality floor — never appears in labor garments unless in crisis');
  if (occupation) c.push(`Occupation-specific gear required for work state: ${occupation}`);
  if (linkedMaterials.length > 0) c.push(`Canon-linked materials: ${linkedMaterials.join(', ')}`);
  return c;
}

// ── State Matrix Extraction ─────────────────────────────────────────────────

function extractStatesForCharacter(
  char: CharacterInput,
  worldText: string,
  charClass: string,
): WardrobeStateDefinition[] {
  const charText = [char.name, char.role, char.traits, char.goals, char.secrets, char.relationships, char.backstory, char.description]
    .filter(Boolean).map(safeStr).join(' ');

  const states: WardrobeStateDefinition[] = [];

  for (const tmpl of STATE_TEMPLATES) {
    const explicitMatch = tmpl.trigger_keywords.test(charText);
    const worldMatch = tmpl.trigger_keywords.test(worldText);
    const shouldInclude = explicitMatch || worldMatch || tmpl.always_infer;

    if (!shouldInclude) continue;

    const basis: 'explicit' | 'inferred' = explicitMatch ? 'explicit' : 'inferred';

    states.push({
      state_key: tmpl.state_key,
      label: tmpl.label,
      rationale: explicitMatch
        ? `Character text directly references ${tmpl.state_key} context`
        : worldMatch
        ? `World/setting references ${tmpl.state_key} context`
        : `Inferred as standard for ${charClass} class in this world`,
      explicit_or_inferred: basis,
      trigger_conditions: tmpl.trigger_keywords.source
        .replace(/\\b\(|\)\\b/g, '').split('|').slice(0, 5),
      garment_adjustments: tmpl.garment_adj,
      fabric_adjustments: tmpl.fabric_adj,
      silhouette_adjustments: tmpl.silhouette_adj,
      accessory_adjustments: tmpl.accessory_adj,
      grooming_adjustments: tmpl.grooming_adj,
      continuity_notes: [],
    });
  }

  return states;
}

// ── Main Extraction Function ────────────────────────────────────────────────

/**
 * Extract Character Wardrobe Profiles from project canon.
 * Deterministic heuristic extraction — no LLM.
 * IEL: This is the SOLE canonical extractor. No parallel extraction paths may exist.
 */
export function extractCharacterWardrobes(
  canon: CanonInput,
  canonicalTemporalTruth?: { era: string; family: string } | null,
): CharacterWardrobeExtractionResult {
  const characters = canon.characters || [];
  if (characters.length === 0) {
    return {
      profiles: [],
      state_matrix: {},
      scene_costume_evidence: null,
      extraction_version: EXTRACTION_VERSION,
      extracted_at: new Date().toISOString(),
      source_doc_types: [],
    };
  }

  const worldCtx = resolveWorldContext(canon, canonicalTemporalTruth);

  const worldParts = [
    safeStr(canon.logline),
    safeStr(canon.premise),
    safeStr(canon.tone_style),
    safeStr(canon.world_rules),
    safeStr(canon.setting),
    safeStr(canon.ongoing_threads),
    safeStr(canon.format_constraints),
    safeStr(canon.locations),
    safeStr(canon.timeline),
  ].filter(Boolean);
  const worldText = worldParts.join(' ');

  const allSourceDocs = new Set<string>();
  if (canon.logline) allSourceDocs.add('logline');
  if (canon.premise) allSourceDocs.add('premise');
  if (canon.tone_style) allSourceDocs.add('tone_style');
  if (canon.world_rules) allSourceDocs.add('world_rules');
  if (canon.setting) allSourceDocs.add('setting');
  if (canon.locations) allSourceDocs.add('locations');
  if (canon.timeline) allSourceDocs.add('timeline');
  if (worldCtx.resolutionSource !== 'none') allSourceDocs.add('world_context');

  const profiles: CharacterWardrobeProfile[] = [];
  const stateMatrix: Record<string, WardrobeStateDefinition[]> = {};

  for (const char of characters) {
    if (!char.name) continue;
    const charKey = normalizeKey(char.name);
    const sourceDocs = new Set(allSourceDocs);

    const profile = extractCharacterProfile(char, worldText, canon, sourceDocs, worldCtx);
    profiles.push(profile);

    // State matrix uses resolved class from the profile for consistency
    const charText = [char.name, char.role, char.traits].filter(Boolean).map(safeStr).join(' ');
    const dominantAnchor = detectDominantWardrobeSignals(char);
    const classRes = resolveClassWithPrecedence(charText, worldText, dominantAnchor);
    stateMatrix[charKey] = extractStatesForCharacter(char, worldText, classRes.value);
  }

  // ── Phase 3: Scene/State Costume Evidence Resolution ──
  let sceneEvidence: SceneCostumeEvidenceResult | null = null;
  const sceneTexts = canon.scene_texts || [];

  if (sceneTexts.length > 0) {
    const charNames = characters.map(c => c.name).filter(Boolean) as string[];
    sceneEvidence = extractSceneCostumeEvidence(sceneTexts, charNames);

    if (sceneEvidence.facts.length > 0) {
      const enrichedMatrix = mergeSceneEvidenceIntoStateMatrix(stateMatrix, sceneEvidence);
      Object.assign(stateMatrix, enrichedMatrix);
      allSourceDocs.add('scene_text');
    }
  }

  // ── Phase 3.5: Profile Reinforcement from Scene Evidence ──
  if (sceneEvidence && sceneEvidence.facts.length > 0) {
    for (const profile of profiles) {
      const charKey = profile.character_id_or_key;
      const charFacts = sceneEvidence.facts.filter(f => f.character_key === charKey);
      if (charFacts.length === 0) continue;

      const sceneGarments = [...new Set(charFacts.flatMap(f => f.garments))];
      const sceneFabrics = [...new Set(charFacts.flatMap(f => f.fabrics))];
      const sceneAccessories = [...new Set(charFacts.flatMap(f => f.accessories))];

      let reinforced = false;

      const contradiction = detectEraContradiction(worldCtx.era, sceneGarments);
      if (contradiction.contradicted) {
        const demotedSet = new Set(contradiction.demoted.map(g => g.toLowerCase()));
        profile.signature_garments = profile.signature_garments.filter(
          g => !demotedSet.has(g.toLowerCase())
        );
        reinforced = true;
        worldCtx.contradicted_by_scene_evidence = true;
        worldCtx.confidence = 'low';
        worldCtx.demoted_garments = contradiction.demoted;
      }

      if (sceneGarments.length > 0) {
        const existing = profile.signature_garments.filter(
          g => !sceneGarments.some(sg => sg.toLowerCase() === g.toLowerCase())
        );
        const merged = [...sceneGarments, ...existing].slice(0, 8);
        profile.signature_garments = merged;
        reinforced = true;
      }

      const TRIVIAL_FABRICS = new Set(['woven', 'cotton, linen — class-appropriate', 'cotton, wool, linen — setting-appropriate']);
      if ((!profile.fabric_language || TRIVIAL_FABRICS.has(profile.fabric_language.trim())) && sceneFabrics.length > 0) {
        profile.fabric_language = sceneFabrics.join(', ');
        reinforced = true;
      }

      if (profile.signature_accessories.length === 0 && sceneAccessories.length > 0) {
        profile.signature_accessories = sceneAccessories.slice(0, 6);
        reinforced = true;
      }

      const PLACEHOLDER_RE = /\bundetermined\b|\bunspecified\b|\bgeneric garments\b|\bunknown\b/i;
      const shouldRebuildSummary = contradiction.contradicted
        || (PLACEHOLDER_RE.test(profile.wardrobe_identity_summary) && sceneGarments.length > 0)
        || (sceneGarments.length > 0 && profile.signature_garments.length > 0);

      if (shouldRebuildSummary && sceneGarments.length > 0) {
        const classExpr = profile.class_status_expression?.replace(/\s*\[world-inferred\]/, '') || 'contextual';
        const leadingGarments = profile.signature_garments.slice(0, 3).join(', ');
        const tag = contradiction.contradicted ? '[scene-corrected]' : '[scene-reinforced]';
        profile.wardrobe_identity_summary = `${classExpr} — ${leadingGarments} ${tag}`;
        reinforced = true;
      }

      if (reinforced || charFacts.length > 0) {
        if (profile.confidence === 'low') {
          profile.confidence = 'medium';
        }
        if (!profile.source_doc_types.includes('scene_reinforcement')) {
          profile.source_doc_types.push('scene_reinforcement');
        }
        if (contradiction.contradicted && !profile.source_doc_types.includes('scene_contradiction')) {
          profile.source_doc_types.push('scene_contradiction');
        }
      }
    }
  }

  return {
    profiles,
    state_matrix: stateMatrix,
    scene_costume_evidence: sceneEvidence,
    extraction_version: EXTRACTION_VERSION,
    extracted_at: new Date().toISOString(),
    source_doc_types: Array.from(allSourceDocs),
  };
}

// ── Seam Helpers ────────────────────────────────────────────────────────────

export function getCharacterWardrobeProfile(
  result: CharacterWardrobeExtractionResult,
  characterName: string,
): CharacterWardrobeProfile | null {
  const key = normalizeKey(characterName);
  return result.profiles.find(p => p.character_id_or_key === key) || null;
}

export function getCharacterWardrobeStates(
  result: CharacterWardrobeExtractionResult,
  characterName: string,
): WardrobeStateDefinition[] {
  return result.state_matrix[normalizeKey(characterName)] || [];
}

export function getSignatureGarmentNouns(
  result: CharacterWardrobeExtractionResult,
  characterName: string,
): string[] {
  const profile = getCharacterWardrobeProfile(result, characterName);
  return profile?.signature_garments || [];
}

export function getWardrobeAdjustments(
  result: CharacterWardrobeExtractionResult,
  characterName: string,
  stateKey: string,
): WardrobeStateDefinition | null {
  const states = getCharacterWardrobeStates(result, characterName);
  return states.find(s => s.state_key === stateKey) || null;
}
