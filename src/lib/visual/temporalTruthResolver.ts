/**
 * temporalTruthResolver.ts — Canonical upstream temporal/era truth resolution.
 *
 * Extracts, classifies, and exposes time-period truth from project sources.
 * This is the single canonical temporal resolution layer consumed by:
 * - Source Truth dashboard
 * - Wardrobe world-context inference
 * - Location truth
 * - Production Design readiness
 * - Prompt construction
 *
 * IEL: No downstream system should independently derive era/period truth.
 * All temporal reasoning must flow through this resolver.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type TemporalClassification =
  | 'ancient'
  | 'medieval'
  | 'feudal'
  | 'renaissance'
  | 'victorian'
  | 'noir'
  | 'western'
  | 'modern'
  | 'contemporary'
  | 'futuristic'
  | 'ambiguous';

export type TemporalFamily = 'historical' | 'modern' | 'futuristic' | 'ambiguous';

export type TemporalConfidence = 'high' | 'medium' | 'low';
export type TemporalProvenance = 'explicit' | 'inferred';

export interface TemporalEvidence {
  source: string;       // e.g. 'project_canon.world_rules', 'logline', 'scene_index'
  text_snippet: string; // the matched fragment (truncated)
  matched_era: TemporalClassification;
  strength: 'strong' | 'supporting';
}

export interface TemporalContradiction {
  era_a: TemporalClassification;
  era_b: TemporalClassification;
  detail: string;
  severity: 'high' | 'medium' | 'low';
}

export interface TemporalTruth {
  /** Resolved primary era classification */
  era: TemporalClassification;
  /** Era family: historical | modern | futuristic | ambiguous */
  family: TemporalFamily;
  /** Display label for the era */
  label: string;
  /** Whether explicit in sources or inferred from signals */
  provenance: TemporalProvenance;
  /** Confidence in the resolution */
  confidence: TemporalConfidence;
  /** All evidence found across sources */
  evidence: TemporalEvidence[];
  /** Source families that contributed */
  contributing_sources: string[];
  /** Detected contradictions */
  contradictions: TemporalContradiction[];
  /** Garments appropriate to this era (from era signals) */
  era_garments: string[];
  /** Garments inappropriate for this era (cross-family) */
  forbidden_garment_families: string[];
  /** Summary description for UI */
  summary: string;
}

// ── Era Classification Data ─────────────────────────────────────────────────

const ERA_FAMILY_MAP: Record<TemporalClassification, TemporalFamily> = {
  ancient: 'historical',
  medieval: 'historical',
  feudal: 'historical',
  renaissance: 'historical',
  victorian: 'historical',
  noir: 'modern',
  western: 'modern',
  modern: 'modern',
  contemporary: 'modern',
  futuristic: 'futuristic',
  ambiguous: 'ambiguous',
};

const ERA_LABELS: Record<TemporalClassification, string> = {
  ancient: 'Ancient / Classical',
  medieval: 'Medieval',
  feudal: 'Feudal / East Asian Historical',
  renaissance: 'Renaissance',
  victorian: 'Victorian / 19th Century',
  noir: 'Noir / Mid-20th Century',
  western: 'Western / Frontier',
  modern: 'Modern (20th Century)',
  contemporary: 'Contemporary (21st Century)',
  futuristic: 'Futuristic / Sci-Fi',
  ambiguous: 'Ambiguous / Mixed',
};

/** Strong explicit-match patterns (direct period naming) */
const ERA_EXPLICIT_PATTERNS: Record<TemporalClassification, RegExp> = {
  ancient: /\b(ancient|roman\s*empire|greek\s*antiquity|egyptian\s*dynasty|biblical\s*era|classical\s*period|bronze\s*age|iron\s*age)\b/i,
  medieval: /\b(medieval|middle\s*ages|dark\s*ages|11th|12th|13th|14th\s*century)\b/i,
  feudal: /\b(feudal\s*japan|edo\s*period|sengoku|heian|kamakura|muromachi|shogunate|bakufu)\b/i,
  renaissance: /\b(renaissance|15th\s*century|16th\s*century|tudor|elizabethan|medici)\b/i,
  victorian: /\b(victorian|19th\s*century|1800s|edwardian|regency|industrial\s*revolution|gaslight)\b/i,
  noir: /\b(1930s|1940s|1950s|prohibition|noir|hard-?boiled|post-?war)\b/i,
  western: /\b(wild\s*west|frontier|gold\s*rush|1800s\s*america|old\s*west)\b/i,
  modern: /\b(modern\s*day|20th\s*century|1960s|1970s|1980s|1990s|present\s*day|current\s*day)\b/i,
  contemporary: /\b(contemporary|2000s|2010s|2020s|today|social\s*media|smartphone|gen\s*z|millennial)\b/i,
  futuristic: /\b(futuristic|sci-?fi|science\s*fiction|dystopia|cyberpunk|space\s*station|starship|android|robot|year\s*\d{4,})\b/i,
  ambiguous: /(?!)/,  // never matches — ambiguous is a fallback
};

/** Supporting signal patterns (setting/world cues that imply era) */
const ERA_SUPPORTING_PATTERNS: Record<TemporalClassification, RegExp> = {
  ancient: /\b(pharaoh|senator|gladiator|toga|amphitheater|chariot|legion|oracle|temple|mythology|colosseum)\b/i,
  medieval: /\b(castle|keep|kingdom|plague|crusade|knight|serf|peasant|lord|manor|sword|shield|dungeon|moat|siege|jousting)\b/i,
  feudal: /\b(shogun|samurai|daimyo|ronin|bushido|clan|katana|shrine|tatami|geisha|ninja|warlord)\b/i,
  renaissance: /\b(florence|venice|courtier|patron|cathedral|fresco|merchant\s*prince|silk\s*road)\b/i,
  victorian: /\b(colonial|empire|steam|factory|workhouse|parlor|carriage|telegram|railway|corset|governess)\b/i,
  noir: /\b(detective|gumshoe|femme\s*fatale|speakeasy|gangster|jazz|fedora|trench\s*coat|cigarette|dim\s*lighting)\b/i,
  western: /\b(cowboy|saloon|ranch|outlaw|sheriff|prairie|desert|stagecoach|revolver|horse|cattle)\b/i,
  modern: /\b(apartment|office|car|telephone|television|suburb|highway|university|hospital|corporation)\b/i,
  contemporary: /\b(internet|startup|tech|app|instagram|uber|laptop|drone|streaming|influencer|podcast)\b/i,
  futuristic: /\b(alien|colony|hologram|laser|teleport|warp|cryogenic|neural|implant|simulation|virtual)\b/i,
  ambiguous: /(?!)/,
};

const ERA_GARMENTS: Record<TemporalClassification, string[]> = {
  ancient: ['toga', 'tunic', 'sandals', 'robe', 'chiton', 'stola', 'cloak'],
  medieval: ['tunic', 'cloak', 'boots', 'chain mail', 'tabard', 'surcoat', 'hood'],
  feudal: ['kimono', 'hakama', 'haori', 'obi', 'robe', 'kosode', 'geta'],
  renaissance: ['doublet', 'gown', 'cape', 'boots', 'bodice', 'hose', 'ruff'],
  victorian: ['dress', 'coat', 'vest', 'top hat', 'boots', 'corset', 'cravat', 'bonnet'],
  noir: ['suit', 'coat', 'hat', 'dress', 'heels', 'fedora', 'trench coat'],
  western: ['hat', 'boots', 'vest', 'trousers', 'shirt', 'chaps', 'bandana', 'duster'],
  modern: ['shirt', 'trousers', 'jacket', 'shoes', 'dress', 'skirt', 'tie'],
  contemporary: ['shirt', 'jeans', 'jacket', 'sneakers', 'dress', 'hoodie', 't-shirt'],
  futuristic: ['suit', 'boots', 'jacket', 'uniform', 'jumpsuit', 'visor'],
  ambiguous: [],
};

const HISTORICAL_GARMENT_SET = new Set([
  'tunic', 'cloak', 'robe', 'kimono', 'hakama', 'haori', 'kosode', 'toga', 'tabard',
  'doublet', 'bodice', 'corset', 'gown', 'cape', 'sarong', 'caftan', 'obi', 'chiton',
  'stola', 'chain mail', 'surcoat', 'hose', 'ruff', 'bonnet', 'chaps', 'duster',
]);

const MODERN_GARMENT_SET = new Set([
  'hoodie', 'jeans', 'sneakers', 't-shirt', 'sweater', 'cardigan', 'blazer', 'polo',
  'shorts', 'tank top', 'backpack', 'sunglasses', 'loafers', 'heels', 'jumpsuit',
]);

// ── Resolver ────────────────────────────────────────────────────────────────

export interface TemporalSourceInput {
  logline?: string;
  premise?: string;
  setting?: string;
  timeline?: string;
  world_rules?: string;
  tone_style?: string;
  format_constraints?: string;
  locations?: string;
  ongoing_threads?: string;
  /** Treatments, outlines, scripts — already extracted text */
  document_texts?: Array<{ source: string; text: string }>;
  /** Scene index location keys */
  scene_locations?: string[];
  /** Canon location era_relevance fields */
  location_eras?: Array<{ name: string; era: string }>;
}

function safeStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.join(' ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return '';
}

function truncSnippet(text: string, match: RegExpMatchArray): string {
  const idx = match.index ?? 0;
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + match[0].length + 30);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

/**
 * Resolve canonical temporal truth from all available project sources.
 * This is the single deterministic temporal resolution entry point.
 */
export function resolveTemporalTruth(input: TemporalSourceInput): TemporalTruth {
  const evidence: TemporalEvidence[] = [];

  // Collect all source texts with labels
  const sourcePairs: Array<[string, string]> = [];

  const canonFields: Array<[string, unknown]> = [
    ['logline', input.logline],
    ['premise', input.premise],
    ['setting', input.setting],
    ['timeline', input.timeline],
    ['world_rules', input.world_rules],
    ['tone_style', input.tone_style],
    ['format_constraints', input.format_constraints],
    ['locations', input.locations],
    ['ongoing_threads', input.ongoing_threads],
  ];

  for (const [label, val] of canonFields) {
    const s = safeStr(val);
    if (s.length > 3) sourcePairs.push([`project_canon.${label}`, s]);
  }

  for (const doc of input.document_texts || []) {
    if (doc.text.length > 3) sourcePairs.push([doc.source, doc.text]);
  }

  // Scene locations as aggregate
  if (input.scene_locations && input.scene_locations.length > 0) {
    sourcePairs.push(['scene_index.locations', input.scene_locations.join(' ')]);
  }

  // Location eras
  if (input.location_eras && input.location_eras.length > 0) {
    const eraText = input.location_eras.map(l => `${l.name}: ${l.era}`).join('; ');
    sourcePairs.push(['canon_locations.era_relevance', eraText]);
  }

  // Score each era across all sources
  const eraScores = new Map<TemporalClassification, number>();
  const allEras: TemporalClassification[] = [
    'ancient', 'medieval', 'feudal', 'renaissance', 'victorian',
    'noir', 'western', 'modern', 'contemporary', 'futuristic',
  ];

  for (const era of allEras) {
    eraScores.set(era, 0);
  }

  for (const [sourceLabel, text] of sourcePairs) {
    for (const era of allEras) {
      // Explicit match = strong
      const explicitRe = ERA_EXPLICIT_PATTERNS[era];
      const explicitMatch = text.match(explicitRe);
      if (explicitMatch) {
        eraScores.set(era, (eraScores.get(era) || 0) + 3);
        evidence.push({
          source: sourceLabel,
          text_snippet: truncSnippet(text, explicitMatch),
          matched_era: era,
          strength: 'strong',
        });
      }

      // Supporting match = weaker
      const supportRe = ERA_SUPPORTING_PATTERNS[era];
      const supportMatch = text.match(supportRe);
      if (supportMatch) {
        eraScores.set(era, (eraScores.get(era) || 0) + 1);
        // Only add if not already added from explicit for this source+era
        if (!explicitMatch) {
          evidence.push({
            source: sourceLabel,
            text_snippet: truncSnippet(text, supportMatch),
            matched_era: era,
            strength: 'supporting',
          });
        }
      }
    }
  }

  // Determine winning era
  let bestEra: TemporalClassification = 'ambiguous';
  let bestScore = 0;
  let secondScore = 0;

  for (const [era, score] of eraScores.entries()) {
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestEra = era;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  // If no evidence at all, default to contemporary (safe modern default).
  // IEL: NEVER default to historical/medieval — unknown era = contemporary.
  // This prevents cross-project contamination when switching from a historical project.
  if (bestScore === 0) {
    return buildResult('contemporary', 'contemporary', 'low', 'inferred', evidence, sourcePairs);
  }

  // Determine confidence
  const hasExplicit = evidence.some(e => e.strength === 'strong' && e.matched_era === bestEra);
  const provenance: TemporalProvenance = hasExplicit ? 'explicit' : 'inferred';

  let confidence: TemporalConfidence;
  if (hasExplicit && bestScore >= 3 && secondScore < bestScore * 0.5) {
    confidence = 'high';
  } else if (bestScore >= 2 && secondScore < bestScore * 0.7) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  // Detect contradictions
  const contradictions = detectTemporalContradictions(evidence, bestEra);

  // If contradictions are severe, downgrade confidence
  if (contradictions.some(c => c.severity === 'high')) {
    confidence = confidence === 'high' ? 'medium' : 'low';
  }

  return buildResult(bestEra, provenance, confidence, provenance, evidence, sourcePairs, contradictions);
}

function buildResult(
  era: TemporalClassification,
  _provLabel: string,
  confidence: TemporalConfidence,
  provenance: TemporalProvenance,
  evidence: TemporalEvidence[],
  sourcePairs: Array<[string, string]>,
  contradictions: TemporalContradiction[] = [],
): TemporalTruth {
  const family = ERA_FAMILY_MAP[era];
  const contributingSources = [...new Set(evidence.map(e => e.source.split('.')[0]))];

  // Determine forbidden garments by era family
  let forbiddenFamilies: string[] = [];
  if (family === 'historical') {
    forbiddenFamilies = [...MODERN_GARMENT_SET];
  } else if (family === 'modern') {
    forbiddenFamilies = [...HISTORICAL_GARMENT_SET];
  }

  const label = ERA_LABELS[era];
  const summary = confidence === 'low' && era === 'ambiguous'
    ? 'No clear temporal evidence found — era could not be determined from available sources'
    : contradictions.length > 0
      ? `${label} (${provenance}, ${confidence} confidence) — ${contradictions.length} contradiction(s) detected`
      : `${label} (${provenance}, ${confidence} confidence)`;

  return {
    era,
    family,
    label,
    provenance,
    confidence,
    evidence,
    contributing_sources: contributingSources,
    contradictions,
    era_garments: ERA_GARMENTS[era] || [],
    forbidden_garment_families: forbiddenFamilies,
    summary,
  };
}

function detectTemporalContradictions(
  evidence: TemporalEvidence[],
  primaryEra: TemporalClassification,
): TemporalContradiction[] {
  const contradictions: TemporalContradiction[] = [];
  const primaryFamily = ERA_FAMILY_MAP[primaryEra];

  // Find evidence for eras in different families
  const otherFamilyEvidence = evidence.filter(e => {
    const f = ERA_FAMILY_MAP[e.matched_era];
    return f !== primaryFamily && f !== 'ambiguous' && e.matched_era !== primaryEra;
  });

  // Group by era
  const otherEras = new Set(otherFamilyEvidence.map(e => e.matched_era));
  for (const otherEra of otherEras) {
    const otherFamily = ERA_FAMILY_MAP[otherEra];
    const count = otherFamilyEvidence.filter(e => e.matched_era === otherEra).length;
    const hasStrong = otherFamilyEvidence.some(e => e.matched_era === otherEra && e.strength === 'strong');

    contradictions.push({
      era_a: primaryEra,
      era_b: otherEra,
      detail: `Primary era is ${ERA_LABELS[primaryEra]} (${primaryFamily}) but ${count} signal(s) suggest ${ERA_LABELS[otherEra]} (${otherFamily})`,
      severity: hasStrong ? 'high' : count >= 2 ? 'medium' : 'low',
    });
  }

  return contradictions;
}
