/**
 * castingNoteInterpreter — Canonical semantic note interpreter for casting.
 * 
 * Converts free-text casting notes into structured hard constraints and soft preferences.
 * Single source of truth: all note surfaces (per-character notes, Casting Assistant,
 * Auto-Cast notes) flow through this interpreter before reaching the prompt builder.
 */

import { parseLikenessReferences, type LikenessParseResult } from './likenessParser';

// ── Output shape ─────────────────────────────────────────────────────────────

export interface CastingHardConstraints {
  gender?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  ethnicity?: string[];
  nationalityStyle?: string[];
}

export interface CastingSoftPreferences {
  attractiveness?: string | null;
  build?: string | null;
  skinTone?: string | null;
  hair?: string | null;
  vibe?: string[];
  classSignals?: string[];
  energy?: string[];
}

export interface CastingNoteInterpretation {
  hardConstraints: CastingHardConstraints;
  softPreferences: CastingSoftPreferences;
  likeness: LikenessParseResult;
  remainingNotes: string;
  normalizedSummary: string;
}

// ── Gender detection ─────────────────────────────────────────────────────────

const GENDER_PATTERNS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\b(?:female|woman|girl|she|her)\b/i, value: 'female' },
  { pattern: /\b(?:male|man|boy|he|him)\b/i, value: 'male' },
  { pattern: /\b(?:non-?binary|enby|androgynous|gender-?fluid)\b/i, value: 'non-binary' },
];

// ── Ethnicity detection ──────────────────────────────────────────────────────

const ETHNICITY_MAP: Array<{ patterns: RegExp[]; label: string }> = [
  { patterns: [/\bchinese\b/i], label: 'Chinese' },
  { patterns: [/\bjapanese\b/i], label: 'Japanese' },
  { patterns: [/\bkorean\b/i], label: 'Korean' },
  { patterns: [/\beast\s*asian\b/i, /\basian\b/i], label: 'East Asian' },
  { patterns: [/\bsouth\s*asian\b/i, /\bindian\b/i, /\bdesi\b/i], label: 'South Asian' },
  { patterns: [/\bsoutheast\s*asian\b/i, /\bfilipino\b/i, /\bvietnamese\b/i, /\bthai\b/i], label: 'Southeast Asian' },
  { patterns: [/\bblack\b/i, /\bafrican\s*american\b/i, /\bafro\b/i], label: 'Black' },
  { patterns: [/\blatino?\b/i, /\blatina\b/i, /\blatinx\b/i, /\bhispanic\b/i], label: 'Latino/Hispanic' },
  { patterns: [/\bmiddle\s*eastern\b/i, /\barab\b/i, /\bpersian\b/i], label: 'Middle Eastern' },
  { patterns: [/\bnative\s*american\b/i, /\bindigenous\b/i, /\bfirst\s*nations\b/i], label: 'Indigenous' },
  { patterns: [/\bpacific\s*islander\b/i, /\bpolynesian\b/i, /\bmaori\b/i], label: 'Pacific Islander' },
  { patterns: [/\bcaucasian\b/i, /\bwhite\b/i, /\beuropean\b/i], label: 'Caucasian/European' },
  { patterns: [/\bmixed\s*race\b/i, /\bbiracial\b/i, /\bmultiracial\b/i], label: 'Mixed Race' },
  { patterns: [/\bmediterranean\b/i, /\bitalian\b/i, /\bgreek\b/i, /\bspanish\b/i], label: 'Mediterranean' },
  { patterns: [/\bscandinavian\b/i, /\bnordic\b/i], label: 'Scandinavian' },
  { patterns: [/\bslavic\b/i, /\brussian\b/i, /\bukrainian\b/i], label: 'Slavic/Eastern European' },
  { patterns: [/\birish\b/i], label: 'Irish' },
  { patterns: [/\bbritish\b/i, /\benglish\b/i], label: 'British' },
  { patterns: [/\bfrench\b/i], label: 'French' },
  { patterns: [/\bgerman\b/i], label: 'German' },
  { patterns: [/\bbrazilian\b/i], label: 'Brazilian' },
  { patterns: [/\bturkish\b/i], label: 'Turkish' },
  { patterns: [/\bethiopian\b/i, /\bnigerian\b/i, /\bwest\s*african\b/i, /\beast\s*african\b/i], label: 'African' },
];

// ── Age detection ────────────────────────────────────────────────────────────

const AGE_RANGE_PATTERN = /\b(\d{1,2})\s*[-–—to]+\s*(\d{1,2})\b/;
const AGE_SINGLE_PATTERN = /\b(?:around|about|approximately|roughly|circa)?\s*(\d{1,2})\s*(?:years?\s*old|yo|y\.o\.?)\b/i;
const AGE_WORD_MAP: Array<{ pattern: RegExp; min: number; max: number }> = [
  { pattern: /\bteen(?:age)?r?\b/i, min: 13, max: 19 },
  { pattern: /\byoung\s*adult\b/i, min: 20, max: 30 },
  { pattern: /\bearly\s*(?:twenties|20s)\b/i, min: 20, max: 24 },
  { pattern: /\bmid\s*(?:twenties|20s)\b/i, min: 24, max: 27 },
  { pattern: /\blate\s*(?:twenties|20s)\b/i, min: 27, max: 30 },
  { pattern: /\bearly\s*(?:thirties|30s)\b/i, min: 30, max: 34 },
  { pattern: /\bmid\s*(?:thirties|30s)\b/i, min: 34, max: 37 },
  { pattern: /\blate\s*(?:thirties|30s)\b/i, min: 37, max: 40 },
  { pattern: /\bearly\s*(?:forties|40s)\b/i, min: 40, max: 44 },
  { pattern: /\bmid\s*(?:forties|40s)\b/i, min: 44, max: 47 },
  { pattern: /\blate\s*(?:forties|40s)\b/i, min: 47, max: 50 },
  { pattern: /\bearly\s*(?:fifties|50s)\b/i, min: 50, max: 54 },
  { pattern: /\bmid\s*(?:fifties|50s)\b/i, min: 54, max: 57 },
  { pattern: /\blate\s*(?:fifties|50s)\b/i, min: 57, max: 60 },
  { pattern: /\belder(?:ly)?\b/i, min: 60, max: 80 },
  { pattern: /\bmiddle[\s-]*aged?\b/i, min: 40, max: 55 },
  { pattern: /\bmature\b/i, min: 45, max: 60 },
];

// ── Soft preference patterns ─────────────────────────────────────────────────

const ATTRACTIVENESS_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(?:extremely|very|stunningly?|exceptionally|incredibly)\s+(?:beautiful|gorgeous|attractive|handsome|good[\s-]*looking)\b/i, label: 'very beautiful' },
  { pattern: /\b(?:beautiful|gorgeous|attractive|handsome|good[\s-]*looking|pretty|striking)\b/i, label: 'attractive' },
  { pattern: /\b(?:plain|ordinary|unremarkable|average[\s-]*looking)\b/i, label: 'plain' },
  { pattern: /\b(?:rugged(?:ly)?\s+(?:handsome|attractive))\b/i, label: 'ruggedly handsome' },
];

const BUILD_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(?:slim|slender|thin|lean|wiry|lithe)\b/i, label: 'slim' },
  { pattern: /\b(?:athletic|fit|toned|muscular)\b/i, label: 'athletic' },
  { pattern: /\b(?:stocky|broad|heavyset|heavy|large|big|burly)\b/i, label: 'stocky/heavy' },
  { pattern: /\b(?:petite|small|tiny|diminutive)\b/i, label: 'petite' },
  { pattern: /\b(?:tall|lanky|gangly)\b/i, label: 'tall' },
  { pattern: /\b(?:short|compact)\b/i, label: 'short' },
];

const SKIN_TONE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(?:fair[\s-]*skinned?|pale|porcelain)\b/i, label: 'fair' },
  { pattern: /\b(?:olive[\s-]*skinned?|olive\s+complexion)\b/i, label: 'olive' },
  { pattern: /\b(?:dark[\s-]*skinned?|deep\s+(?:brown|dark)\s+skin)\b/i, label: 'dark' },
  { pattern: /\b(?:tan(?:ned)?|sun[\s-]*kissed|bronze[d]?)\b/i, label: 'tan' },
  { pattern: /\b(?:light[\s-]*skinned?|light\s+complexion)\b/i, label: 'light' },
  { pattern: /\b(?:brown[\s-]*skinned?|medium\s+(?:brown|dark))\b/i, label: 'brown' },
];

const HAIR_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(?:blonde?|golden[\s-]*hair|flaxen)\b/i, label: 'blonde' },
  { pattern: /\b(?:brunette?|dark[\s-]*(?:brown\s+)?hair|brown[\s-]*hair)\b/i, label: 'dark brown hair' },
  { pattern: /\b(?:red[\s-]*hair|redhead|ginger|auburn)\b/i, label: 'red/auburn hair' },
  { pattern: /\b(?:black[\s-]*hair|jet[\s-]*black)\b/i, label: 'black hair' },
  { pattern: /\b(?:grey|gray|silver)[\s-]*hair\b/i, label: 'grey hair' },
  { pattern: /\b(?:bald|shaved\s+head|shaven)\b/i, label: 'bald/shaved' },
  { pattern: /\b(?:curly|afro|coils|kinky[\s-]*hair)\b/i, label: 'curly hair' },
  { pattern: /\b(?:straight\s+hair)\b/i, label: 'straight hair' },
  { pattern: /\b(?:long[\s-]*hair)\b/i, label: 'long hair' },
  { pattern: /\b(?:short[\s-]*hair|cropped)\b/i, label: 'short hair' },
];

const VIBE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bdangerous\b/i, label: 'dangerous' },
  { pattern: /\bvulnerable\b/i, label: 'vulnerable' },
  { pattern: /\brefined\b/i, label: 'refined' },
  { pattern: /\bgrounded\b/i, label: 'grounded' },
  { pattern: /\bintimidating\b/i, label: 'intimidating' },
  { pattern: /\bmysterious\b/i, label: 'mysterious' },
  { pattern: /\bcharismatic\b/i, label: 'charismatic' },
  { pattern: /\bcharming\b/i, label: 'charming' },
  { pattern: /\bwarm\b/i, label: 'warm' },
  { pattern: /\bcold\b/i, label: 'cold' },
  { pattern: /\bbrooding\b/i, label: 'brooding' },
  { pattern: /\bintense\b/i, label: 'intense' },
  { pattern: /\bstoic\b/i, label: 'stoic' },
  { pattern: /\bplayful\b/i, label: 'playful' },
  { pattern: /\bseductive\b/i, label: 'seductive' },
  { pattern: /\binnocent\b/i, label: 'innocent' },
  { pattern: /\bworldly\b/i, label: 'worldly' },
  { pattern: /\bweathered\b/i, label: 'weathered' },
  { pattern: /\brugged\b/i, label: 'rugged' },
  { pattern: /\bpolished\b/i, label: 'polished' },
  { pattern: /\belegant\b/i, label: 'elegant' },
  { pattern: /\bgritty\b/i, label: 'gritty' },
  { pattern: /\bfierce\b/i, label: 'fierce' },
  { pattern: /\bgentle\b/i, label: 'gentle' },
  { pattern: /\bsensual\b/i, label: 'sensual' },
  { pattern: /\btough\b/i, label: 'tough' },
  { pattern: /\bsophisticated\b/i, label: 'sophisticated' },
  { pattern: /\bwild\b/i, label: 'wild' },
  { pattern: /\bcalm\b/i, label: 'calm' },
  { pattern: /\bmenacing\b/i, label: 'menacing' },
];

const CLASS_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bupper[\s-]*class\b/i, label: 'upper-class' },
  { pattern: /\bworking[\s-]*class\b/i, label: 'working-class' },
  { pattern: /\bmiddle[\s-]*class\b/i, label: 'middle-class' },
  { pattern: /\bblue[\s-]*collar\b/i, label: 'blue-collar' },
  { pattern: /\bwhite[\s-]*collar\b/i, label: 'white-collar' },
  { pattern: /\bstreet[\s-]*(?:smart|wise)\b/i, label: 'street-smart' },
  { pattern: /\bprivileged\b/i, label: 'privileged' },
  { pattern: /\brough\b/i, label: 'rough' },
  { pattern: /\bposh\b/i, label: 'posh' },
  { pattern: /\baristocratic\b/i, label: 'aristocratic' },
];

const ENERGY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bhigh[\s-]*energy\b/i, label: 'high-energy' },
  { pattern: /\blow[\s-]*key\b/i, label: 'low-key' },
  { pattern: /\bexplosive\b/i, label: 'explosive' },
  { pattern: /\bquiet\b/i, label: 'quiet' },
  { pattern: /\belectric\b/i, label: 'electric' },
  { pattern: /\bcommanding\b/i, label: 'commanding' },
  { pattern: /\bsubtle\b/i, label: 'subtle' },
  { pattern: /\bmagnetic\b/i, label: 'magnetic' },
  { pattern: /\bpowerful\b/i, label: 'powerful' },
  { pattern: /\bsoft\b/i, label: 'soft' },
];

// ── Main interpreter ─────────────────────────────────────────────────────────

function extractAll<T extends { label: string }>(
  text: string,
  patterns: Array<{ pattern: RegExp; label: string }>,
): string[] {
  const found: string[] = [];
  for (const { pattern, label } of patterns) {
    if (pattern.test(text) && !found.includes(label)) {
      found.push(label);
    }
  }
  return found;
}

function extractFirst(
  text: string,
  patterns: Array<{ pattern: RegExp; label: string }>,
): string | null {
  for (const { pattern, label } of patterns) {
    if (pattern.test(text)) return label;
  }
  return null;
}

/**
 * Interpret free-text casting notes into structured hard constraints + soft preferences.
 * Single canonical entry point for all casting note surfaces.
 */
export function interpretCastingNotes(notes: string): CastingNoteInterpretation {
  const empty: CastingNoteInterpretation = {
    hardConstraints: {},
    softPreferences: {},
    likeness: { references: [], remaining_notes: '', has_references: false },
    remainingNotes: '',
    normalizedSummary: '',
  };

  if (!notes?.trim()) return empty;

  const text = notes.trim();

  // 1. Likeness references (reuse existing parser)
  const likeness = parseLikenessReferences(text);
  // Work with remaining text after likeness extraction
  const workingText = likeness.remaining_notes || text;

  // 2. Hard constraints
  const hardConstraints: CastingHardConstraints = {};

  // Gender
  for (const { pattern, value } of GENDER_PATTERNS) {
    if (pattern.test(workingText)) {
      hardConstraints.gender = value;
      break;
    }
  }

  // Age
  const rangeMatch = workingText.match(AGE_RANGE_PATTERN);
  if (rangeMatch) {
    hardConstraints.ageMin = parseInt(rangeMatch[1], 10);
    hardConstraints.ageMax = parseInt(rangeMatch[2], 10);
  } else {
    const singleMatch = workingText.match(AGE_SINGLE_PATTERN);
    if (singleMatch) {
      const age = parseInt(singleMatch[1], 10);
      hardConstraints.ageMin = Math.max(age - 3, 0);
      hardConstraints.ageMax = age + 3;
    } else {
      for (const { pattern, min, max } of AGE_WORD_MAP) {
        if (pattern.test(workingText)) {
          hardConstraints.ageMin = min;
          hardConstraints.ageMax = max;
          break;
        }
      }
    }
  }

  // Ethnicity
  const ethnicities: string[] = [];
  for (const { patterns, label } of ETHNICITY_MAP) {
    for (const p of patterns) {
      if (p.test(workingText) && !ethnicities.includes(label)) {
        ethnicities.push(label);
        break;
      }
    }
  }
  if (ethnicities.length > 0) hardConstraints.ethnicity = ethnicities;

  // 3. Soft preferences
  const softPreferences: CastingSoftPreferences = {};

  softPreferences.attractiveness = extractFirst(workingText, ATTRACTIVENESS_PATTERNS);
  softPreferences.build = extractFirst(workingText, BUILD_PATTERNS);
  softPreferences.skinTone = extractFirst(workingText, SKIN_TONE_PATTERNS);
  softPreferences.hair = extractFirst(workingText, HAIR_PATTERNS);
  
  const vibes = extractAll(workingText, VIBE_PATTERNS);
  if (vibes.length > 0) softPreferences.vibe = vibes;
  
  const classSignals = extractAll(workingText, CLASS_PATTERNS);
  if (classSignals.length > 0) softPreferences.classSignals = classSignals;
  
  const energy = extractAll(workingText, ENERGY_PATTERNS);
  if (energy.length > 0) softPreferences.energy = energy;

  // Clean nulls
  for (const key of Object.keys(softPreferences) as Array<keyof CastingSoftPreferences>) {
    if (softPreferences[key] === null || softPreferences[key] === undefined) {
      delete softPreferences[key];
    }
  }

  // 4. Build normalized summary
  const summaryParts: string[] = [];
  if (hardConstraints.gender) summaryParts.push(`Gender: ${hardConstraints.gender}`);
  if (hardConstraints.ageMin != null && hardConstraints.ageMax != null) {
    summaryParts.push(`Age: ${hardConstraints.ageMin}–${hardConstraints.ageMax}`);
  }
  if (hardConstraints.ethnicity?.length) summaryParts.push(`Ethnicity: ${hardConstraints.ethnicity.join(', ')}`);
  if (softPreferences.attractiveness) summaryParts.push(softPreferences.attractiveness);
  if (softPreferences.build) summaryParts.push(`Build: ${softPreferences.build}`);
  if (softPreferences.skinTone) summaryParts.push(`Skin: ${softPreferences.skinTone}`);
  if (softPreferences.hair) summaryParts.push(`Hair: ${softPreferences.hair}`);
  if (softPreferences.vibe?.length) summaryParts.push(`Vibe: ${softPreferences.vibe.join(', ')}`);
  if (softPreferences.classSignals?.length) summaryParts.push(`Class: ${softPreferences.classSignals.join(', ')}`);
  if (softPreferences.energy?.length) summaryParts.push(`Energy: ${softPreferences.energy.join(', ')}`);
  if (likeness.has_references) {
    for (const ref of likeness.references) {
      summaryParts.push(`Ref: ${ref.reference_people.join(' + ')} (${ref.reference_strength})`);
    }
  }

  return {
    hardConstraints,
    softPreferences,
    likeness,
    remainingNotes: likeness.remaining_notes,
    normalizedSummary: summaryParts.join(' · '),
  };
}

/**
 * Convert a CastingNoteInterpretation into prompt directives for the image generator.
 * Returns structured prompt segments: hard constraint block, soft preference block, likeness block.
 */
export function interpretationToPromptDirectives(interp: CastingNoteInterpretation): {
  hardConstraintDirective: string;
  softPreferenceDirective: string;
  likenessDirective: string;
  remainingDirective: string;
} {
  const hardParts: string[] = [];
  const softParts: string[] = [];

  // Hard constraints → REQUIRED directives
  const hc = interp.hardConstraints;
  if (hc.gender) hardParts.push(`REQUIRED: ${hc.gender} person. This is a non-negotiable casting requirement.`);
  if (hc.ageMin != null && hc.ageMax != null) {
    hardParts.push(`REQUIRED age range: ${hc.ageMin}–${hc.ageMax} years old.`);
  }
  if (hc.ethnicity?.length) {
    hardParts.push(`REQUIRED appearance/ethnicity: ${hc.ethnicity.join(', ')}. This is a specific casting requirement — the person MUST appear ${hc.ethnicity.join('/')}.`);
  }

  // Soft preferences → weighted directives
  const sp = interp.softPreferences;
  if (sp.attractiveness) softParts.push(`Appearance quality: ${sp.attractiveness}.`);
  if (sp.build) softParts.push(`Physical build: ${sp.build}.`);
  if (sp.skinTone) softParts.push(`Skin tone: ${sp.skinTone}.`);
  if (sp.hair) softParts.push(`Hair: ${sp.hair}.`);
  if (sp.vibe?.length) softParts.push(`Character vibe: ${sp.vibe.join(', ')}.`);
  if (sp.classSignals?.length) softParts.push(`Social class feel: ${sp.classSignals.join(', ')}.`);
  if (sp.energy?.length) softParts.push(`Energy/presence: ${sp.energy.join(', ')}.`);

  // Likeness → use existing converter
  let likenessDirective = '';
  if (interp.likeness.has_references) {
    const { likenessToPromptDirective } = require('./likenessParser');
    likenessDirective = likenessToPromptDirective(interp.likeness.references);
  }

  const remainingDirective = interp.remainingNotes
    ? `Additional casting direction: ${interp.remainingNotes}.`
    : '';

  return {
    hardConstraintDirective: hardParts.join(' '),
    softPreferenceDirective: softParts.join(' '),
    likenessDirective,
    remainingDirective,
  };
}
