/**
 * visualCanonExtractor.ts — Canonical extraction engine for Visual Canon Primitives.
 *
 * Extracts cinematic visual grammar from project canon documents:
 * material systems, ritual systems, communication systems, power systems,
 * intimacy systems, surface conditions, recurrent symbolic objects,
 * and environment-behavior pairings.
 *
 * Deterministic heuristic extraction — no LLM dependency.
 * Reusable across all IFFY projects.
 *
 * v1.1.0 — Broadened patterns for modern/non-feudal settings,
 *           improved field harvesting, finer provenance.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface VisualCanonPrimitive {
  key: string;
  label: string;
  evidence_text: string;
  source_excerpt: string;
  source_doc_type: string;
  confidence: 'high' | 'medium' | 'low';
  tags: string[];
  linked_characters: string[];
  linked_locations: string[];
  thematic_functions: string[];
  visual_functions: string[];
}

export interface VisualCanonExtractionResult {
  material_systems: VisualCanonPrimitive[];
  ritual_systems: VisualCanonPrimitive[];
  communication_systems: VisualCanonPrimitive[];
  power_systems: VisualCanonPrimitive[];
  intimacy_systems: VisualCanonPrimitive[];
  surface_condition_systems: VisualCanonPrimitive[];
  recurrent_symbolic_objects: VisualCanonPrimitive[];
  environment_behavior_pairings: VisualCanonPrimitive[];
  extraction_version: string;
  extracted_at: string;
  source_doc_types: string[];
}

export type VisualCanonCategory = keyof Omit<VisualCanonExtractionResult,
  'extraction_version' | 'extracted_at' | 'source_doc_types'>;

export const VISUAL_CANON_CATEGORIES: { key: VisualCanonCategory; label: string; description: string }[] = [
  { key: 'material_systems', label: 'Material Systems', description: 'Core physical materials and craft traditions' },
  { key: 'ritual_systems', label: 'Ritual Systems', description: 'Ceremonial, social, and cultural rituals' },
  { key: 'communication_systems', label: 'Communication Systems', description: 'How characters exchange meaning through objects and actions' },
  { key: 'power_systems', label: 'Power Systems', description: 'How authority, control, and hierarchy are physically expressed' },
  { key: 'intimacy_systems', label: 'Intimacy Systems', description: 'Physical closeness, touch, and private gesture' },
  { key: 'surface_condition_systems', label: 'Surface Conditions', description: 'Wear, damage, patina, and material aging' },
  { key: 'recurrent_symbolic_objects', label: 'Recurrent Objects', description: 'Objects that carry meaning through repetition' },
  { key: 'environment_behavior_pairings', label: 'Environment–Behavior', description: 'Locations paired with characteristic activities' },
];

const EXTRACTION_VERSION = '1.1.0';

// ── Canon Input Shape ────────────────────────────────────────────────────────

interface CanonInput {
  characters?: Array<{
    name?: string;
    role?: string;
    traits?: string;
    goals?: string;
    secrets?: string;
    relationships?: string;
    backstory?: string;
    description?: string;
    [key: string]: unknown;
  }>;
  logline?: string;
  premise?: string;
  tone_style?: string;
  tone?: string;
  world_rules?: string | string[];
  locations?: string | string[];
  setting?: string;
  timeline?: string;
  timeline_notes?: string | string[];
  ongoing_threads?: string;
  format_constraints?: string;
  forbidden_changes?: string;
  themes?: string | string[];
  world_description?: string;
  genre?: string;
  format?: string;
  title?: string;
  comparables?: unknown;
  seed_draft?: unknown;
  seed_intel_pack?: unknown;
  [key: string]: unknown;
}

// ── Provenance-Aware Field Harvesting ────────────────────────────────────────

interface SourceField {
  text: string;
  docType: string;
}

function safeStr(val: unknown): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.filter(v => typeof v === 'string').join('\n');
  if (val && typeof val === 'object') {
    return Object.values(val).filter(v => typeof v === 'string').join('\n');
  }
  return '';
}

/**
 * Deep-extract all string values from an arbitrarily nested object.
 * Used for seed_draft, seed_intel_pack, comparables, etc.
 */
function deepExtractStrings(val: unknown): string[] {
  if (typeof val === 'string') return val.trim() ? [val] : [];
  if (Array.isArray(val)) return val.flatMap(deepExtractStrings);
  if (val && typeof val === 'object') {
    return Object.values(val).flatMap(deepExtractStrings);
  }
  return [];
}

function harvestSourceFields(canon: CanonInput): SourceField[] {
  const fields: SourceField[] = [];

  // Core narrative fields
  if (canon.logline) fields.push({ text: safeStr(canon.logline), docType: 'logline' });
  if (canon.premise) fields.push({ text: safeStr(canon.premise), docType: 'premise' });
  if (canon.tone_style) fields.push({ text: safeStr(canon.tone_style), docType: 'tone_style' });
  if (canon.tone) fields.push({ text: safeStr(canon.tone), docType: 'tone' });
  if (canon.genre) fields.push({ text: safeStr(canon.genre), docType: 'genre' });

  // World fields
  if (canon.world_rules) fields.push({ text: safeStr(canon.world_rules), docType: 'world_rules' });
  if (canon.world_description) fields.push({ text: safeStr(canon.world_description), docType: 'world_description' });
  if (canon.locations) fields.push({ text: safeStr(canon.locations), docType: 'locations' });
  if (canon.setting) fields.push({ text: safeStr(canon.setting), docType: 'setting' });

  // Timeline & threads
  if (canon.timeline) fields.push({ text: safeStr(canon.timeline), docType: 'timeline' });
  if (canon.timeline_notes) fields.push({ text: safeStr(canon.timeline_notes), docType: 'timeline' });
  if (canon.ongoing_threads) fields.push({ text: safeStr(canon.ongoing_threads), docType: 'ongoing_threads' });
  if (canon.themes) fields.push({ text: safeStr(canon.themes), docType: 'themes' });

  // Format
  if (canon.format_constraints) fields.push({ text: safeStr(canon.format_constraints), docType: 'format_constraints' });
  if (canon.forbidden_changes) fields.push({ text: safeStr(canon.forbidden_changes), docType: 'forbidden_changes' });

  // Characters — each character is its own provenance unit
  for (const c of (canon.characters || [])) {
    const charText = [c.name, c.role, c.traits, c.goals, c.secrets, c.relationships, c.backstory, c.description]
      .filter(Boolean).join(' ');
    if (charText.trim()) {
      fields.push({ text: charText, docType: `character:${c.name || 'unknown'}` });
    }
  }

  // Seed draft — deep extract all string content
  if (canon.seed_draft) {
    const seedTexts = deepExtractStrings(canon.seed_draft);
    if (seedTexts.length > 0) {
      fields.push({ text: seedTexts.join('\n'), docType: 'seed_draft' });
    }
  }

  // Seed intel pack
  if (canon.seed_intel_pack) {
    const intelTexts = deepExtractStrings(canon.seed_intel_pack);
    if (intelTexts.length > 0) {
      fields.push({ text: intelTexts.join('\n'), docType: 'seed_intel_pack' });
    }
  }

  // Comparables
  if (canon.comparables) {
    const compTexts = deepExtractStrings(canon.comparables);
    if (compTexts.length > 0) {
      fields.push({ text: compTexts.join('\n'), docType: 'comparables' });
    }
  }

  // Catch-all: any remaining top-level string fields not already harvested
  const harvested = new Set([
    'logline', 'premise', 'tone_style', 'tone', 'genre', 'format', 'title',
    'world_rules', 'world_description', 'locations', 'setting',
    'timeline', 'timeline_notes', 'ongoing_threads', 'themes',
    'format_constraints', 'forbidden_changes', 'characters',
    'seed_draft', 'seed_intel_pack', 'comparables',
    'visual_canon_primitives', 'autopilot',
  ]);
  for (const [key, val] of Object.entries(canon)) {
    if (harvested.has(key)) continue;
    const s = safeStr(val);
    if (s.trim().length > 10) {
      fields.push({ text: s, docType: `canon_field:${key}` });
    }
  }

  return fields;
}

function allTextFields(canon: CanonInput): string {
  return harvestSourceFields(canon).map(f => f.text).join('\n');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function excerpt(fullText: string, term: string, radius = 80): string {
  const lower = fullText.toLowerCase();
  const idx = lower.indexOf(term.toLowerCase());
  if (idx < 0) return '';
  const start = Math.max(0, idx - radius);
  const end = Math.min(fullText.length, idx + term.length + radius);
  return fullText.slice(start, end).replace(/\n/g, ' ').trim();
}

function findProvenance(sourceFields: SourceField[], term: string): string {
  const t = term.toLowerCase();
  for (const sf of sourceFields) {
    if (sf.text.toLowerCase().includes(t)) return sf.docType;
  }
  return 'canon_json';
}

function makePrimitive(
  key: string, label: string, evidence: string, excerptText: string,
  opts: Partial<VisualCanonPrimitive> = {},
): VisualCanonPrimitive {
  return {
    key,
    label,
    evidence_text: evidence,
    source_excerpt: excerptText,
    source_doc_type: 'canon_json',
    confidence: 'medium',
    tags: [],
    linked_characters: [],
    linked_locations: [],
    thematic_functions: [],
    visual_functions: [],
    ...opts,
  };
}

function findCharacterForTerm(canon: CanonInput, term: string): string[] {
  if (!canon.characters) return [];
  const t = term.toLowerCase();
  return canon.characters
    .filter(c => {
      const text = [c.name, c.role, c.traits, c.goals, c.secrets, c.backstory, c.relationships, c.description]
        .filter(Boolean).join(' ').toLowerCase();
      return text.includes(t);
    })
    .map(c => c.name || '')
    .filter(Boolean);
}

// ── Material System Extraction ───────────────────────────────────────────────

const MATERIAL_PATTERNS: Array<{ pattern: RegExp; key: string; label: string; tags: string[] }> = [
  // Traditional craft materials
  { pattern: /\b(clay|ceramic|potter[yi]|earthenware|stoneware|kiln|glaz[ei]|porcelain)\b/i, key: 'clay_ceramic', label: 'Clay / Ceramic', tags: ['craft', 'tactile'] },
  { pattern: /\b(lacquer|urushi|varnish)\b/i, key: 'lacquer', label: 'Lacquer / Varnish', tags: ['finish', 'traditional'] },
  { pattern: /\b(silk|brocade|satin|velvet|chiffon|lace|tulle)\b/i, key: 'silk_textile', label: 'Fine Textile', tags: ['luxury', 'status'] },
  { pattern: /\b(wood|timber|cedar|cypress|hinoki|bamboo|mahogany|oak|pine|plywood)\b/i, key: 'wood', label: 'Wood', tags: ['structural', 'natural'] },
  { pattern: /\b(stone|granite|slate|marble|cobblestone|flagstone)\b/i, key: 'stone', label: 'Stone', tags: ['permanent', 'weight'] },
  { pattern: /\b(iron|steel|blade|sword|forge|metal|chrome|alumin)/i, key: 'metal', label: 'Metal', tags: ['industrial', 'authority'] },
  { pattern: /\b(paper|washi|scroll|parchment|cardboard|stationery)\b/i, key: 'paper', label: 'Paper', tags: ['communication', 'tradition'] },
  { pattern: /\b(ink|calligraphy|brush\s*stroke|pen)\b/i, key: 'ink', label: 'Ink / Writing', tags: ['mark-making', 'authority'] },
  { pattern: /\b(gold|gilt|golden)\b/i, key: 'gold', label: 'Gold / Gilt', tags: ['status', 'sacred'] },
  { pattern: /\b(copper|bronze)\b/i, key: 'copper_bronze', label: 'Copper / Bronze', tags: ['warmth', 'age'] },
  { pattern: /\b(leather|hide|tanned|suede)\b/i, key: 'leather', label: 'Leather', tags: ['utilitarian', 'worn'] },
  { pattern: /\b(straw|thatch|hemp|rope|burlap|jute)\b/i, key: 'straw_hemp', label: 'Straw / Hemp', tags: ['rural', 'humble'] },
  { pattern: /\b(plaster|mortar|whitewash|stucco|concrete|cement)\b/i, key: 'plaster_concrete', label: 'Plaster / Concrete', tags: ['surface', 'urban'] },
  { pattern: /\b(glass|blown\s*glass|neon|mirror)\b/i, key: 'glass', label: 'Glass', tags: ['fragile', 'light'] },
  // Modern / culinary / tech
  { pattern: /\b(flour|dough|batter|pastry|bread|cake|dessert|sugar|cream|chocolate|fondant)\b/i, key: 'culinary', label: 'Culinary Materials', tags: ['food', 'craft', 'sensory'] },
  { pattern: /\b(screen|monitor|display|pixel|hologram|interface|LED|LCD)\b/i, key: 'digital_surface', label: 'Digital / Screen', tags: ['tech', 'modern', 'light'] },
  { pattern: /\b(fabric|cotton|denim|linen|wool|knit|thread|yarn)\b/i, key: 'everyday_textile', label: 'Everyday Textile', tags: ['tactile', 'domestic'] },
  { pattern: /\b(paint|canvas|pigment|watercolor|acrylic|oil\s*paint)\b/i, key: 'paint', label: 'Paint / Pigment', tags: ['art', 'expression'] },
  { pattern: /\b(plastic|acrylic|synthetic|vinyl|rubber)\b/i, key: 'synthetic', label: 'Synthetic / Plastic', tags: ['modern', 'artificial'] },
  { pattern: /\b(ceramic\s*tile|tile[sd]?|mosaic)\b/i, key: 'tile', label: 'Tile / Mosaic', tags: ['surface', 'pattern'] },
  { pattern: /\b(wax|candle\s*wax|beeswax)\b/i, key: 'wax', label: 'Wax', tags: ['light', 'ritual'] },
];

function extractMaterialSystems(canon: CanonInput, fullText: string, sourceFields: SourceField[]): VisualCanonPrimitive[] {
  const results: VisualCanonPrimitive[] = [];
  const seen = new Set<string>();

  for (const mat of MATERIAL_PATTERNS) {
    const match = fullText.match(mat.pattern);
    if (match && !seen.has(mat.key)) {
      seen.add(mat.key);
      const chars = findCharacterForTerm(canon, match[0]);
      results.push(makePrimitive(
        mat.key, mat.label,
        `Material "${match[0]}" found in project canon`,
        excerpt(fullText, match[0]),
        {
          tags: mat.tags,
          linked_characters: chars,
          confidence: chars.length > 0 ? 'high' : 'medium',
          visual_functions: ['texture', 'production_design'],
          source_doc_type: findProvenance(sourceFields, match[0]),
        },
      ));
    }
  }
  return results;
}

// ── Ritual System Extraction ─────────────────────────────────────────────────

const RITUAL_PATTERNS: Array<{ pattern: RegExp; key: string; label: string; thematic: string[] }> = [
  // Traditional
  { pattern: /\btea\s+ceremon[yi]/i, key: 'tea_ceremony', label: 'Tea Ceremony', thematic: ['control', 'intimacy', 'ritual'] },
  { pattern: /\bkimono\s+(fitting|dressing|tying|layering)/i, key: 'kimono_fitting', label: 'Kimono Fitting / Dressing', thematic: ['identity', 'status', 'transformation'] },
  { pattern: /\bshrine\s+(offering|visit|prayer|pilgrimage)/i, key: 'shrine_offering', label: 'Shrine Offering', thematic: ['devotion', 'communication', 'sacred'] },
  { pattern: /\b(betrothal|engagement|marriage|wedding)\s+(scroll|ceremon|rite|ritual|vow)/i, key: 'betrothal_ceremony', label: 'Betrothal / Marriage Ritual', thematic: ['contract', 'alliance', 'status'] },
  { pattern: /\b(court|formal)\s+(audience|reception|presentation)/i, key: 'court_audience', label: 'Court Audience', thematic: ['power', 'hierarchy', 'performance'] },
  { pattern: /\b(funeral|burial|mourning)\s*(rite|ceremon|ritual)?/i, key: 'funeral_rite', label: 'Funeral / Mourning Rite', thematic: ['loss', 'transition', 'memory'] },
  { pattern: /\b(festival|celebration|feast|matsuri|gala|party|banquet)\b/i, key: 'festival', label: 'Festival / Celebration', thematic: ['community', 'spectacle', 'mask'] },
  { pattern: /\b(sword|blade)\s*(ceremon|present|bestow)/i, key: 'sword_ceremony', label: 'Sword Ceremony', thematic: ['authority', 'honor', 'violence'] },
  { pattern: /\b(bow|kneeling|prostrat|kowtow)/i, key: 'formal_obeisance', label: 'Formal Obeisance', thematic: ['submission', 'hierarchy'] },
  { pattern: /\b(purification|cleansing|ablution)/i, key: 'purification', label: 'Purification Ritual', thematic: ['transition', 'renewal', 'sacred'] },
  { pattern: /\b(calligraphy|writing)\s*(lesson|practice|ceremon)/i, key: 'calligraphy_practice', label: 'Calligraphy Practice', thematic: ['discipline', 'identity'] },
  // Modern / universal
  { pattern: /\b(cooking|baking|prepar\w+)\s+(together|ritual|ceremon|lesson|class|competition|challenge)/i, key: 'cooking_ritual', label: 'Cooking / Baking Ritual', thematic: ['creation', 'intimacy', 'tradition'] },
  { pattern: /\b(meal|dinner|lunch|breakfast|supper|dining)\s+(together|date|ritual|ceremon)?/i, key: 'shared_meal', label: 'Shared Meal', thematic: ['alliance', 'intimacy', 'judgment'] },
  { pattern: /\b(tasting|food\s+review|critic\w*\s+review|taste\s+test)/i, key: 'tasting_review', label: 'Tasting / Review Ritual', thematic: ['judgment', 'power', 'vulnerability'] },
  { pattern: /\b(coffee|tea)\s+(break|ritual|moment|together|date|shop|meeting)/i, key: 'coffee_tea_ritual', label: 'Coffee / Tea Ritual', thematic: ['pause', 'connection', 'routine'] },
  { pattern: /\b(dress\w*\s+up|getting\s+ready|makeover|style\s+session|outfit\s+change)/i, key: 'dressing_ritual', label: 'Dressing / Style Ritual', thematic: ['identity', 'transformation', 'performance'] },
  { pattern: /\b(audition|performance|concert|recital|showcase|rehearsal)\b/i, key: 'performance', label: 'Performance / Showcase', thematic: ['display', 'judgment', 'vulnerability'] },
  { pattern: /\b(training|practice|workout|spar\w*|exercise|drill)\b/i, key: 'training', label: 'Training / Practice', thematic: ['discipline', 'mastery', 'vulnerability'] },
  { pattern: /\b(graduation|commencement|promotion|ceremony)\b/i, key: 'graduation_ceremony', label: 'Graduation / Ceremony', thematic: ['transition', 'achievement', 'status'] },
  { pattern: /\b(launch\s+event|launch\s+party|product\s+launch|debut|premiere|opening\s+night)/i, key: 'launch_event', label: 'Launch / Debut Event', thematic: ['spectacle', 'vulnerability', 'success'] },
  { pattern: /\b(interview|press\s+conference|presentation|pitch|meeting)\b/i, key: 'formal_presentation', label: 'Formal Presentation', thematic: ['performance', 'power', 'judgment'] },
];

function extractRitualSystems(canon: CanonInput, fullText: string, sourceFields: SourceField[]): VisualCanonPrimitive[] {
  const results: VisualCanonPrimitive[] = [];
  const seen = new Set<string>();

  for (const rit of RITUAL_PATTERNS) {
    const match = fullText.match(rit.pattern);
    if (match && !seen.has(rit.key)) {
      seen.add(rit.key);
      const chars = findCharacterForTerm(canon, match[0]);
      results.push(makePrimitive(
        rit.key, rit.label,
        `Ritual "${match[0]}" identified in canon`,
        excerpt(fullText, match[0]),
        {
          tags: ['ritual', 'staging'],
          linked_characters: chars,
          thematic_functions: rit.thematic,
          visual_functions: ['set_piece', 'blocking', 'atmosphere'],
          confidence: 'high',
          source_doc_type: findProvenance(sourceFields, match[0]),
        },
      ));
    }
  }
  return results;
}

// ── Communication System Extraction ──────────────────────────────────────────

const COMM_PATTERNS: Array<{ pattern: RegExp; key: string; label: string }> = [
  { pattern: /\b(hidden|secret)\s+(mark|sign|symbol|message|signal)\b/i, key: 'hidden_marks', label: 'Hidden Marks / Signals' },
  { pattern: /\bcarved?\s+(token|figure|bird|symbol|seal)\b/i, key: 'carved_token', label: 'Carved Token' },
  { pattern: /\b(crack|chip|break|fracture)\w*\s+(bowl|cup|vessel|pot)/i, key: 'damaged_vessel_message', label: 'Damaged Vessel as Message' },
  { pattern: /\b(bowl|cup|vessel|pot)\s+.{0,30}(crack|chip|break|fracture)/i, key: 'damaged_vessel_message_alt', label: 'Damaged Vessel as Message' },
  { pattern: /\b(coded|secret)\s+(exchange|pass|deliver|object|gift)/i, key: 'coded_exchange', label: 'Coded Object Exchange' },
  { pattern: /\b(placement|position|arrangement)\s+.{0,20}(offering|flower|object|stone)/i, key: 'deliberate_placement', label: 'Deliberate Object Placement' },
  { pattern: /\b(offering|flower|object|stone)\s+.{0,20}(placement|position|arrangement)/i, key: 'deliberate_placement_alt', label: 'Deliberate Object Placement' },
  { pattern: /\bscroll\s+.{0,30}(deliver|present|hide|conceal|secret)/i, key: 'scroll_communication', label: 'Scroll Communication' },
  { pattern: /\b(letter|note|message)\s+(hidden|secret|concealed)/i, key: 'hidden_letter', label: 'Hidden Written Message' },
  { pattern: /\b(fan|sleeve|gesture)\s+.{0,20}(signal|communicate|indicate)/i, key: 'gestural_signal', label: 'Gestural Signal' },
  // Modern
  { pattern: /\b(text|message|DM|email|chat)\s+.{0,20}(secret|hidden|delete|private)/i, key: 'digital_secret_message', label: 'Secret Digital Message' },
  { pattern: /\b(phone|call|voicemail|video\s*call)\s+.{0,15}(secret|hidden|private|midnight)/i, key: 'secret_call', label: 'Secret Phone Call' },
  { pattern: /\b(glitch|bug|error|algorithm|code)\s+.{0,20}(reveal|expose|match|signal)/i, key: 'tech_signal', label: 'Tech Glitch as Signal' },
  { pattern: /\b(recipe|dish|food|dessert|cake)\s+.{0,20}(message|meaning|communicat|express)/i, key: 'food_as_communication', label: 'Food as Communication' },
];

function extractCommunicationSystems(canon: CanonInput, fullText: string, sourceFields: SourceField[]): VisualCanonPrimitive[] {
  const results: VisualCanonPrimitive[] = [];
  const seen = new Set<string>();

  for (const comm of COMM_PATTERNS) {
    const match = fullText.match(comm.pattern);
    const normKey = comm.key.replace(/_alt$/, '');
    if (match && !seen.has(normKey)) {
      seen.add(normKey);
      results.push(makePrimitive(
        normKey, comm.label,
        `Communication system: "${match[0]}"`,
        excerpt(fullText, match[0]),
        {
          tags: ['communication', 'prop', 'subtext'],
          linked_characters: findCharacterForTerm(canon, match[0]),
          thematic_functions: ['secrecy', 'alliance', 'resistance'],
          visual_functions: ['close_up', 'insert_shot', 'motif'],
          confidence: 'high',
          source_doc_type: findProvenance(sourceFields, match[0]),
        },
      ));
    }
  }
  return results;
}

// ── Power System Extraction ──────────────────────────────────────────────────

const POWER_PATTERNS: Array<{ pattern: RegExp; key: string; label: string; thematic: string[] }> = [
  { pattern: /\bguard[s]?\s+(at|in|by|block|stand|watch|threshold|door|gate)/i, key: 'guards_threshold', label: 'Guards at Thresholds', thematic: ['control', 'containment'] },
  { pattern: /\b(surveillance|watching|observed|monitor|spy|spying)\b/i, key: 'surveillance', label: 'Surveillance / Observation', thematic: ['control', 'paranoia'] },
  { pattern: /\b(hierarch|rank|status)\w*\s*(spacing|seating|position|arrangement|order|system)/i, key: 'hierarchical_spacing', label: 'Hierarchical Ordering', thematic: ['rank', 'display'] },
  { pattern: /\b(public|open)\s+(humiliat|sham|punish|display|degradat|embarra)/i, key: 'public_humiliation', label: 'Public Humiliation', thematic: ['domination', 'spectacle'] },
  { pattern: /\b(kneel|prostrat|submis)\w*/i, key: 'ritualized_submission', label: 'Ritualized Submission', thematic: ['hierarchy', 'obedience'] },
  { pattern: /\b(isolat|confine|imprison|detain|restrict|cage|trap)\w*/i, key: 'confinement', label: 'Confinement / Restriction', thematic: ['control', 'punishment'] },
  { pattern: /\b(inspect|examin)\w*\s*.{0,20}(work|craft|goods|product|quality)/i, key: 'inspection', label: 'Work Inspection', thematic: ['authority', 'judgment'] },
  { pattern: /\b(brandish|display|raise)\w*\s*(sword|blade|weapon|fist)/i, key: 'weapon_display', label: 'Weapon Display', thematic: ['threat', 'authority'] },
  // Modern power
  { pattern: /\b(rival|competi|competitor|enemy|opponent|adversar)\w*/i, key: 'rivalry', label: 'Rivalry / Competition', thematic: ['conflict', 'status'] },
  { pattern: /\b(domina|control|manipulat|exploit|sabotag|intimidat|blackmail)\w*/i, key: 'manipulation', label: 'Manipulation / Control', thematic: ['power', 'deception'] },
  { pattern: /\b(corporate|business|company)\s*(espionage|rival|war|battle|takeover)/i, key: 'corporate_power', label: 'Corporate Power Play', thematic: ['ambition', 'conflict'] },
  { pattern: /\b(critic\w*|review|judge|judg\w+|scath\w+|dismiss)\b/i, key: 'judgment_authority', label: 'Judgment / Critical Authority', thematic: ['power', 'vulnerability'] },
  { pattern: /\b(arrogant|condescend|superior|contempt|scorn|sneer|dismiss)\w*/i, key: 'social_dominance', label: 'Social Dominance', thematic: ['status', 'hierarchy'] },
  { pattern: /\b(expose|reveal|uncover|unmask|betray)\w*\s*.{0,20}(secret|truth|identity|lie|deception)/i, key: 'exposure_threat', label: 'Exposure Threat', thematic: ['vulnerability', 'control'] },
  { pattern: /\b(pretend|fake|pretense|charade|act|deception)\w*\s*.{0,20}(date|dating|relationship|love|couple|marriage)/i, key: 'fake_relationship', label: 'Fake Relationship Power', thematic: ['control', 'vulnerability', 'deception'] },
];

function extractPowerSystems(canon: CanonInput, fullText: string, sourceFields: SourceField[]): VisualCanonPrimitive[] {
  const results: VisualCanonPrimitive[] = [];
  const seen = new Set<string>();

  for (const p of POWER_PATTERNS) {
    const match = fullText.match(p.pattern);
    if (match && !seen.has(p.key)) {
      seen.add(p.key);
      results.push(makePrimitive(
        p.key, p.label,
        `Power dynamic: "${match[0]}"`,
        excerpt(fullText, match[0]),
        {
          tags: ['power', 'staging', 'blocking'],
          linked_characters: findCharacterForTerm(canon, match[0]),
          thematic_functions: p.thematic,
          visual_functions: ['blocking', 'composition', 'spatial_hierarchy'],
          confidence: 'medium',
          source_doc_type: findProvenance(sourceFields, match[0]),
        },
      ));
    }
  }
  return results;
}

// ── Intimacy System Extraction ───────────────────────────────────────────────

const INTIMACY_PATTERNS: Array<{ pattern: RegExp; key: string; label: string }> = [
  // Physical contact
  { pattern: /\b(hand|finger)\s*(touch|brush|linger|reach|grasp|hold|press|intertwine)/i, key: 'hand_touch', label: 'Hand Touch / Contact' },
  { pattern: /\b(sleeve|hem|fabric|collar|tie|hair)\s*(adjust|straighten|smooth|pull|tug|fix|tuck)/i, key: 'adjustment_touch', label: 'Adjustment Touch' },
  { pattern: /\b(exchange|pass|give|offer|share)\w*\s+.{0,15}(object|token|gift|bowl|cup|ring|necklace|flower|food|dessert)/i, key: 'exchanged_object', label: 'Exchanged Object' },
  // Gaze / look
  { pattern: /\b(glance|gaze|look|eye)\s*(linger|hold|meet|lock|averted|lowered|contact)/i, key: 'meaningful_glance', label: 'Meaningful Glance' },
  { pattern: /\beye\s*contact\b/i, key: 'eye_contact', label: 'Eye Contact' },
  { pattern: /\blinger\w*\s*(eye|gaze|look|glance|stare|watch)/i, key: 'lingering_look', label: 'Lingering Look' },
  { pattern: /\b(stare|staring|watching)\s*.{0,15}(across|from|at|into)/i, key: 'staring_across', label: 'Staring Across Space' },
  // Proximity / tension
  { pattern: /\b(pause|breath|hesitat|still)\w*\s*.{0,15}(close|near|proximity|beside)/i, key: 'charged_pause', label: 'Charged Pause / Proximity' },
  { pattern: /\b(close|near|proximi)\w*\s*.{0,15}(forc|reluctan|awkward|sudden|unexpect)/i, key: 'forced_proximity', label: 'Forced Proximity' },
  { pattern: /\b(accidental|unexpected|sudden)\s*(touch|bump|collision|contact|brush|stumble)/i, key: 'accidental_touch', label: 'Accidental Touch' },
  { pattern: /\b(tension|chemistry|electric|spark|charge[sd]?)\s*.{0,20}(between|moment|air|argument|look)/i, key: 'charged_tension', label: 'Charged Tension' },
  // Verbal / vocal
  { pattern: /\b(whisper|murmur|low\s+voice|speak\s+softly|hushed)/i, key: 'whispered_exchange', label: 'Whispered Exchange' },
  { pattern: /\b(argument|bicker|fight|clash|quarrel)\s*.{0,20}(passion|intense|heated|charged)/i, key: 'passionate_argument', label: 'Passionate Argument' },
  { pattern: /\b(charged|heated|intense|passionate)\s+(argument|bicker|fight|clash|quarrel|debate|exchange)/i, key: 'passionate_argument_alt', label: 'Passionate Argument' },
  // Face / body
  { pattern: /\b(hair|face|cheek|chin|jaw|lip)\s*(touch|brush|stroke|cup|cradle|tilt|wipe)/i, key: 'face_touch', label: 'Face / Hair Touch' },
  { pattern: /\b(private|secret|hidden|stolen)\s*(gesture|touch|signal|meeting|moment|kiss)/i, key: 'private_gesture', label: 'Private / Stolen Moment' },
  { pattern: /\b(tear|crying|weeping|sob)\b/i, key: 'tears', label: 'Tears / Weeping' },
  { pattern: /\b(embrace|hug|hold|cling|press\s+close)/i, key: 'embrace', label: 'Embrace / Hold' },
  { pattern: /\b(kiss|kissing|kissed)\b/i, key: 'kiss', label: 'Kiss' },
  { pattern: /\b(blush|flush|red\s+face|cheek\w*\s+red|embarrass)\w*/i, key: 'blush', label: 'Blush / Flush' },
  // Shared / domestic
  { pattern: /\b(shar\w+|together)\s+(meal|food|drink|coffee|tea|umbrella|jacket|blanket)/i, key: 'shared_object', label: 'Shared Object / Space' },
  { pattern: /\b(walk|rain|night|evening)\s*(together|side\s*by\s*side|home)/i, key: 'walking_together', label: 'Walking Together' },
  { pattern: /\b(spill|splash|mess|accident)\s*.{0,20}(on|over|together)/i, key: 'accidental_spill', label: 'Accidental Spill / Mess' },
];

function extractIntimacySystems(canon: CanonInput, fullText: string, sourceFields: SourceField[]): VisualCanonPrimitive[] {
  const results: VisualCanonPrimitive[] = [];
  const seen = new Set<string>();

  for (const pat of INTIMACY_PATTERNS) {
    const match = fullText.match(pat.pattern);
    const normKey = pat.key.replace(/_alt$/, '');
    if (match && !seen.has(normKey)) {
      seen.add(normKey);
      results.push(makePrimitive(
        normKey, pat.label,
        `Intimacy cue: "${match[0]}"`,
        excerpt(fullText, match[0]),
        {
          tags: ['intimacy', 'gesture', 'character_interaction'],
          linked_characters: findCharacterForTerm(canon, match[0]),
          thematic_functions: ['connection', 'vulnerability', 'desire'],
          visual_functions: ['close_up', 'shallow_depth', 'insert_shot'],
          confidence: 'medium',
          source_doc_type: findProvenance(sourceFields, match[0]),
        },
      ));
    }
  }
  return results;
}

// ── Surface Condition Extraction ─────────────────────────────────────────────

const SURFACE_PATTERNS: Array<{ pattern: RegExp; key: string; label: string; visual: string[] }> = [
  { pattern: /\b(crack|cracked|fracture[sd]?)\b/i, key: 'crack', label: 'Crack / Fracture', visual: ['detail', 'texture', 'motif'] },
  { pattern: /\b(stain|stained|discolor|spill)/i, key: 'stain', label: 'Stain / Discoloration', visual: ['detail', 'texture'] },
  { pattern: /\b(wear|worn|weathered|faded|aged)\b/i, key: 'wear', label: 'Wear / Weathering', visual: ['texture', 'patina'] },
  { pattern: /\b(patina|tarnish)\b/i, key: 'patina', label: 'Patina / Tarnish', visual: ['aging', 'texture'] },
  { pattern: /\b(bruised?\s+flower|wilted|crushed\s+petal|withered)/i, key: 'bruised_flower', label: 'Bruised / Wilted Flower', visual: ['motif', 'decay'] },
  { pattern: /\b(dust|dusty|grime|soot|dirty)\b/i, key: 'dust', label: 'Dust / Grime', visual: ['atmosphere', 'neglect'] },
  { pattern: /\b(glaze|glazed)\s*(irregular|uneven|drip|run)/i, key: 'irregular_glaze', label: 'Irregular Glaze', visual: ['craft', 'imperfection'] },
  { pattern: /\b(scar|scarred|gouge|nick)\b/i, key: 'scar', label: 'Scar / Damage Mark', visual: ['detail', 'violence'] },
  { pattern: /\b(rust|corroded|oxidiz)\w*/i, key: 'rust', label: 'Rust / Corrosion', visual: ['decay', 'time'] },
  { pattern: /\b(moss|lichen|ivy|overgrown)\b/i, key: 'organic_growth', label: 'Organic Growth', visual: ['nature', 'time'] },
  { pattern: /\b(chip|chipped)\b/i, key: 'chip', label: 'Chip / Chipped', visual: ['damage', 'use'] },
  { pattern: /\b(mend|mended|repair|repaired|kintsugi|patch|patched)\b/i, key: 'repair', label: 'Repair / Mending', visual: ['resilience', 'motif'] },
  // Modern surfaces
  { pattern: /\b(scratch|scratched|scuff|scuffed)\b/i, key: 'scratch', label: 'Scratch / Scuff', visual: ['wear', 'use'] },
  { pattern: /\b(peel|peeling|flakin|flaked)\w*/i, key: 'peeling', label: 'Peeling / Flaking', visual: ['decay', 'time'] },
  { pattern: /\b(steam|fog|mist|condensat|frosted|frost)\w*/i, key: 'steam_condensation', label: 'Steam / Condensation', visual: ['atmosphere', 'warmth'] },
  { pattern: /\b(flour|powder|dust)\s*(covered|coated|stained|dusted)/i, key: 'powder_coat', label: 'Powder / Flour Coating', visual: ['craft', 'labor'] },
];

function extractSurfaceConditions(canon: CanonInput, fullText: string, sourceFields: SourceField[]): VisualCanonPrimitive[] {
  const results: VisualCanonPrimitive[] = [];
  const seen = new Set<string>();

  for (const s of SURFACE_PATTERNS) {
    const match = fullText.match(s.pattern);
    if (match && !seen.has(s.key)) {
      seen.add(s.key);
      results.push(makePrimitive(
        s.key, s.label,
        `Surface condition: "${match[0]}"`,
        excerpt(fullText, match[0]),
        {
          tags: ['surface', 'condition', 'materiality'],
          thematic_functions: ['time', 'imperfection', 'history'],
          visual_functions: s.visual,
          confidence: 'medium',
          source_doc_type: findProvenance(sourceFields, match[0]),
        },
      ));
    }
  }
  return results;
}

// ── Recurrent Symbolic Object Extraction ─────────────────────────────────────

const SYMBOLIC_OBJECT_PATTERNS: Array<{ pattern: RegExp; key: string; label: string; thematic: string[] }> = [
  { pattern: /\btea\s*(bowl|cup)\b/i, key: 'tea_bowl', label: 'Tea Bowl', thematic: ['ceremony', 'fracture', 'communication'] },
  { pattern: /\bcarved?\s*(bird|crane|heron|sparrow)\b/i, key: 'carved_bird', label: 'Carved Bird', thematic: ['freedom', 'message', 'hope'] },
  { pattern: /\bcamellia\b/i, key: 'camellia', label: 'Camellia', thematic: ['beauty', 'transience', 'devotion'] },
  { pattern: /\bserpen[t]?\b/i, key: 'serpent', label: 'Serpent', thematic: ['danger', 'wisdom', 'transformation'] },
  { pattern: /\b(silver|golden?)\s*comb\b/i, key: 'precious_comb', label: 'Precious Comb', thematic: ['status', 'gift', 'identity'] },
  { pattern: /\bscroll\b/i, key: 'scroll', label: 'Scroll', thematic: ['authority', 'knowledge', 'contract'] },
  { pattern: /\bfan\b/i, key: 'fan', label: 'Fan', thematic: ['signal', 'identity', 'concealment'] },
  { pattern: /\bsword\b/i, key: 'sword', label: 'Sword', thematic: ['authority', 'violence', 'honor'] },
  { pattern: /\b(dagger|knife|tanto)\b/i, key: 'blade', label: 'Short Blade / Dagger', thematic: ['secrecy', 'protection', 'threat'] },
  { pattern: /\b(mirror|looking\s*glass)\b/i, key: 'mirror', label: 'Mirror', thematic: ['truth', 'vanity', 'identity'] },
  { pattern: /\b(lantern|lamp|candle)\b/i, key: 'lantern', label: 'Lantern / Light Source', thematic: ['guidance', 'signal', 'hope'] },
  { pattern: /\b(mask|disguise)\b/i, key: 'mask', label: 'Mask / Disguise', thematic: ['identity', 'deception', 'performance'] },
  { pattern: /\b(ring|seal\s*ring|engagement\s*ring)\b/i, key: 'ring', label: 'Ring / Seal', thematic: ['bond', 'authority', 'identity'] },
  { pattern: /\b(flower|blossom|petal|bloom|sakura|cherry\s+blossom)\b/i, key: 'flower', label: 'Flower / Blossom', thematic: ['beauty', 'transience', 'offering'] },
  { pattern: /\b(key|lock|padlock)\b/i, key: 'key_lock', label: 'Key / Lock', thematic: ['access', 'secrecy', 'control'] },
  // Modern / food / tech
  { pattern: /\b(phone|smartphone|mobile|device)\b/i, key: 'phone', label: 'Phone / Device', thematic: ['connection', 'barrier', 'surveillance'] },
  { pattern: /\b(laptop|computer|screen|tablet)\b/i, key: 'computer', label: 'Computer / Screen', thematic: ['work', 'barrier', 'creation'] },
  { pattern: /\b(apron|chef\s*coat|uniform)\b/i, key: 'apron', label: 'Apron / Uniform', thematic: ['identity', 'labor', 'status'] },
  { pattern: /\b(recipe\s*book|cookbook|notebook|journal|diary)\b/i, key: 'recipe_book', label: 'Recipe Book / Journal', thematic: ['legacy', 'knowledge', 'identity'] },
  { pattern: /\b(cake|dessert|pastry|cheesecake|tart|macaron|cookie)\b/i, key: 'signature_dessert', label: 'Signature Dessert', thematic: ['creation', 'identity', 'offering'] },
  { pattern: /\b(coffee\s*cup|mug|teacup|wine\s*glass|cocktail)\b/i, key: 'drink_vessel', label: 'Drink Vessel', thematic: ['ritual', 'comfort', 'status'] },
  { pattern: /\b(photograph|photo|picture|portrait)\b/i, key: 'photograph', label: 'Photograph', thematic: ['memory', 'evidence', 'identity'] },
  { pattern: /\b(letter|card|postcard|invitation)\b/i, key: 'letter', label: 'Letter / Card', thematic: ['communication', 'emotion', 'formality'] },
  { pattern: /\b(necklace|bracelet|earring|pendant|jewel)\w*/i, key: 'jewelry', label: 'Jewelry', thematic: ['status', 'gift', 'identity'] },
  { pattern: /\b(umbrella|parasol)\b/i, key: 'umbrella', label: 'Umbrella', thematic: ['shelter', 'proximity', 'romance'] },
  { pattern: /\b(guitar|violin|piano|instrument|drum|bass|microphone)\b/i, key: 'instrument', label: 'Musical Instrument', thematic: ['expression', 'identity', 'passion'] },
  { pattern: /\b(suit|designer\s+suit|tuxedo|business\s+attire)\b/i, key: 'suit', label: 'Designer Suit / Formal Wear', thematic: ['status', 'power', 'identity'] },
];

function extractRecurrentSymbolicObjects(canon: CanonInput, fullText: string, sourceFields: SourceField[]): VisualCanonPrimitive[] {
  const results: VisualCanonPrimitive[] = [];
  const seen = new Set<string>();

  for (const obj of SYMBOLIC_OBJECT_PATTERNS) {
    const matches = fullText.match(new RegExp(obj.pattern.source, 'gi'));
    if (!matches || seen.has(obj.key)) continue;
    seen.add(obj.key);

    const recurrence = matches.length;
    const confidence = recurrence >= 3 ? 'high' : recurrence >= 2 ? 'medium' : 'low';

    results.push(makePrimitive(
      obj.key, obj.label,
      `Object "${matches[0]}" appears ${recurrence}x in canon`,
      excerpt(fullText, matches[0]),
      {
        tags: ['object', 'recurrent', 'prop'],
        linked_characters: findCharacterForTerm(canon, matches[0]),
        thematic_functions: obj.thematic,
        visual_functions: ['insert_shot', 'close_up', 'motif', 'prop'],
        confidence,
        source_doc_type: findProvenance(sourceFields, matches[0]),
      },
    ));
  }

  return results.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.confidence] - order[b.confidence];
  });
}

// ── Environment–Behavior Pairing Extraction ──────────────────────────────────

const ENV_BEHAVIOR_PATTERNS: Array<{
  env: RegExp; behavior: RegExp;
  key: string; label: string; thematic: string[];
}> = [
  // Traditional
  { env: /workshop/i, behavior: /\b(shap|mold|build|craft|fir[ei]|throw|glaz[ei]|carv|hammer|weld)/i, key: 'workshop_making', label: 'Workshop + Making / Shaping', thematic: ['creation', 'labor', 'identity'] },
  { env: /garden/i, behavior: /\b(meet|secret|whisper|tryst|rendezv|conspir|walk|stroll|sit)/i, key: 'garden_secret_meeting', label: 'Garden + Secret Meeting', thematic: ['intimacy', 'conspiracy', 'escape'] },
  { env: /\b(court|throne|audience)\b/i, behavior: /\b(surveil|watch|observ|judg|assess|scheming|power)/i, key: 'court_surveillance', label: 'Court + Surveillance', thematic: ['power', 'paranoia', 'performance'] },
  { env: /shrine/i, behavior: /\b(offer|pray|signal|leave|deposit|place|visit)/i, key: 'shrine_offering_signal', label: 'Shrine + Offering / Signal', thematic: ['sacred', 'communication', 'hope'] },
  { env: /\b(corridor|passage|hallway|alley)\b/i, behavior: /\b(observ|watch|follow|intercept|whisper|pass|chase|escape)/i, key: 'corridor_observation', label: 'Corridor + Observation', thematic: ['surveillance', 'transition', 'danger'] },
  { env: /\b(market|street|village\s+square|plaza|shopping)\b/i, behavior: /\b(exchange|trade|gossip|gather|display|browse|walk|bump)/i, key: 'market_exchange', label: 'Market / Street + Exchange', thematic: ['community', 'commerce', 'encounter'] },
  { env: /\b(kitchen|hearth|fire|bakery|cafe|restaurant|bar)\b/i, behavior: /\b(cook|prepar|nourish|feed|gather|warm|bake|serve|taste|brew)/i, key: 'kitchen_creation', label: 'Kitchen / Cafe + Creation', thematic: ['care', 'sustenance', 'craft'] },
  { env: /\b(gate|door|threshold|entrance|lobby|foyer)\b/i, behavior: /\b(wait|guard|block|welcome|deny|enter|arrive|greet)/i, key: 'threshold_gatekeeping', label: 'Threshold + Gatekeeping', thematic: ['control', 'transition', 'permission'] },
  { env: /\b(river|stream|water|pond|lake|ocean|beach|rain)\b/i, behavior: /\b(wash|cleans|purif|reflect|contempl|walk|swim|wet)/i, key: 'water_reflection', label: 'Water + Reflection', thematic: ['renewal', 'transition', 'contemplation'] },
  { env: /\b(bedroom|chamber|private\s+room|hotel\s+room)\b/i, behavior: /\b(confid|reveal|confes|intima|secret|sleep|rest|cry)/i, key: 'chamber_confession', label: 'Private Chamber + Confession', thematic: ['vulnerability', 'truth', 'intimacy'] },
  // Modern
  { env: /\b(office|boardroom|conference|workspace|desk|cubicle)\b/i, behavior: /\b(present|pitch|compet|rival|negoti|argue|debate|meeting|confront)/i, key: 'office_confrontation', label: 'Office + Confrontation', thematic: ['power', 'ambition', 'conflict'] },
  { env: /\b(stage|concert\s+hall|studio|rehearsal|practice\s+room|auditorium)\b/i, behavior: /\b(perform|play|sing|danc|rehearse|practice|audition)/i, key: 'stage_performance', label: 'Stage + Performance', thematic: ['display', 'vulnerability', 'mastery'] },
  { env: /\b(school|academy|classroom|campus|dormitor|library)\b/i, behavior: /\b(study|learn|teach|bully|confront|discover|secret|compete)/i, key: 'school_discovery', label: 'School + Discovery', thematic: ['growth', 'rivalry', 'identity'] },
  { env: /\b(roof|rooftop|balcony|terrace|veranda)\b/i, behavior: /\b(confess|reveal|contemplat|look\s+out|view|secret|escape|alone)/i, key: 'rooftop_confession', label: 'Rooftop / Balcony + Confession', thematic: ['vulnerability', 'escape', 'perspective'] },
  { env: /\b(car|taxi|train|bus|elevator|lift)\b/i, behavior: /\b(confin|trap|alone|together|close|silence|awkward|tension)/i, key: 'enclosed_space_tension', label: 'Enclosed Space + Tension', thematic: ['proximity', 'vulnerability', 'intimacy'] },
];

function extractEnvironmentBehaviorPairings(canon: CanonInput, fullText: string, sourceFields: SourceField[]): VisualCanonPrimitive[] {
  const results: VisualCanonPrimitive[] = [];
  const seen = new Set<string>();

  for (const ebp of ENV_BEHAVIOR_PATTERNS) {
    if (ebp.env.test(fullText) && ebp.behavior.test(fullText) && !seen.has(ebp.key)) {
      seen.add(ebp.key);
      const envMatch = fullText.match(ebp.env);
      const matchTerm = envMatch ? envMatch[0] : '';
      results.push(makePrimitive(
        ebp.key, ebp.label,
        `Environment-behavior pairing detected: ${ebp.label}`,
        matchTerm ? excerpt(fullText, matchTerm) : '',
        {
          tags: ['environment', 'behavior', 'staging'],
          thematic_functions: ebp.thematic,
          visual_functions: ['establishing_shot', 'atmosphere', 'blocking'],
          confidence: 'medium',
          source_doc_type: matchTerm ? findProvenance(sourceFields, matchTerm) : 'canon_json',
        },
      ));
    }
  }
  return results;
}

// ── Main Extractor ───────────────────────────────────────────────────────────

export function extractVisualCanon(canon: CanonInput): VisualCanonExtractionResult {
  const sourceFields = harvestSourceFields(canon);
  const fullText = sourceFields.map(f => f.text).join('\n');

  // Collect unique source doc types used
  const docTypes = new Set<string>();
  for (const sf of sourceFields) {
    docTypes.add(sf.docType.split(':')[0]); // normalize character:Name → character
  }

  return {
    material_systems: extractMaterialSystems(canon, fullText, sourceFields),
    ritual_systems: extractRitualSystems(canon, fullText, sourceFields),
    communication_systems: extractCommunicationSystems(canon, fullText, sourceFields),
    power_systems: extractPowerSystems(canon, fullText, sourceFields),
    intimacy_systems: extractIntimacySystems(canon, fullText, sourceFields),
    surface_condition_systems: extractSurfaceConditions(canon, fullText, sourceFields),
    recurrent_symbolic_objects: extractRecurrentSymbolicObjects(canon, fullText, sourceFields),
    environment_behavior_pairings: extractEnvironmentBehaviorPairings(canon, fullText, sourceFields),
    extraction_version: EXTRACTION_VERSION,
    extracted_at: new Date().toISOString(),
    source_doc_types: Array.from(docTypes),
  };
}

/**
 * Convenience: get flat list of all primitives across categories.
 */
export function getAllPrimitives(result: VisualCanonExtractionResult): VisualCanonPrimitive[] {
  return [
    ...result.material_systems,
    ...result.ritual_systems,
    ...result.communication_systems,
    ...result.power_systems,
    ...result.intimacy_systems,
    ...result.surface_condition_systems,
    ...result.recurrent_symbolic_objects,
    ...result.environment_behavior_pairings,
  ];
}

/**
 * Convenience: get primitives relevant to motif generation.
 */
export function getMotifRelevantPrimitives(result: VisualCanonExtractionResult): {
  materials: VisualCanonPrimitive[];
  surfaces: VisualCanonPrimitive[];
  objects: VisualCanonPrimitive[];
} {
  return {
    materials: result.material_systems,
    surfaces: result.surface_condition_systems,
    objects: result.recurrent_symbolic_objects,
  };
}

/**
 * Convenience: get primitives relevant to Production Design staging.
 */
export function getPDRelevantPrimitives(result: VisualCanonExtractionResult): {
  rituals: VisualCanonPrimitive[];
  power: VisualCanonPrimitive[];
  intimacy: VisualCanonPrimitive[];
  envBehavior: VisualCanonPrimitive[];
} {
  return {
    rituals: result.ritual_systems,
    power: result.power_systems,
    intimacy: result.intimacy_systems,
    envBehavior: result.environment_behavior_pairings,
  };
}
