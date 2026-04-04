/**
 * Edge Function: generate-casting-candidates
 * Generates AI casting candidate images per character using project canon + visual DNA.
 * Supports hard constraint enforcement, exploration mode, and refinement directives.
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Casting archetype variations — base set
const VARIATION_DESCRIPTORS = [
  { style: "naturalistic", mood: "warm and grounded", casting_note: "everyday authenticity" },
  { style: "striking", mood: "intense and magnetic", casting_note: "strong screen presence" },
  { style: "refined", mood: "elegant and composed", casting_note: "classical beauty" },
  { style: "raw", mood: "gritty and real", casting_note: "unconventional casting" },
  { style: "luminous", mood: "soft and radiant", casting_note: "ethereal quality" },
  { style: "commanding", mood: "powerful and assured", casting_note: "authority and gravitas" },
];

// Extended variations for exploration mode
const EXPLORATION_VARIATIONS = [
  ...VARIATION_DESCRIPTORS,
  { style: "enigmatic", mood: "mysterious and layered", casting_note: "unexpected choice" },
  { style: "grounded", mood: "understated and authentic", casting_note: "non-traditional casting" },
  { style: "electric", mood: "vibrant and unpredictable", casting_note: "high energy screen presence" },
  { style: "contemplative", mood: "quiet intensity", casting_note: "internalized power" },
  { style: "primal", mood: "raw physicality and presence", casting_note: "physical actor" },
  { style: "aristocratic", mood: "effortless authority", casting_note: "born-to-lead presence" },
];

// ── Refinement directive types ──
interface RefinementDirectives {
  height?: string;
  build?: string;
  skin_tone?: string;
  hair_color?: string;
  hair_length?: string;
  age_refinement?: string;
  presence_modifiers?: string[];  // e.g. "more intense", "softer"
}

// ── Structured note interpretation (server-side canonical interpreter) ──
interface NoteHardConstraints {
  gender?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  ethnicity?: string[];
  nationalityStyle?: string[];
}

interface NoteSoftPreferences {
  attractiveness?: string | null;
  build?: string | null;
  skinTone?: string | null;
  hair?: string | null;
  vibe?: string[];
  classSignals?: string[];
  energy?: string[];
}

interface NoteInterpretation {
  hardConstraints: NoteHardConstraints;
  softPreferences: NoteSoftPreferences;
  likenessDirective: string;
  remainingNotes: string;
}

function interpretNotes(notes: string): NoteInterpretation {
  const empty: NoteInterpretation = { hardConstraints: {}, softPreferences: {}, likenessDirective: '', remainingNotes: '' };
  if (!notes?.trim()) return empty;

  const text = notes.trim();
  const hc: NoteHardConstraints = {};
  const sp: NoteSoftPreferences = {};

  // Gender
  if (/\b(?:female|woman|girl|she|her)\b/i.test(text)) hc.gender = 'female';
  else if (/\b(?:male|man|boy|he|him)\b/i.test(text)) hc.gender = 'male';
  else if (/\b(?:non-?binary|enby|androgynous)\b/i.test(text)) hc.gender = 'non-binary';

  // Age range
  const rangeM = text.match(/\b(\d{1,2})\s*[-–—to]+\s*(\d{1,2})\b/);
  if (rangeM) { hc.ageMin = parseInt(rangeM[1]); hc.ageMax = parseInt(rangeM[2]); }
  else {
    const singleM = text.match(/\b(?:around|about)?\s*(\d{1,2})\s*(?:years?\s*old|yo)\b/i);
    if (singleM) { const a = parseInt(singleM[1]); hc.ageMin = Math.max(a - 3, 0); hc.ageMax = a + 3; }
    else {
      const ageWords: Array<{ p: RegExp; min: number; max: number }> = [
        { p: /\bteen/i, min: 13, max: 19 }, { p: /\byoung\s*adult/i, min: 20, max: 30 },
        { p: /\bearly\s*(?:twenties|20s)/i, min: 20, max: 24 }, { p: /\bmid\s*(?:twenties|20s)/i, min: 24, max: 27 },
        { p: /\blate\s*(?:twenties|20s)/i, min: 27, max: 30 }, { p: /\bearly\s*(?:thirties|30s)/i, min: 30, max: 34 },
        { p: /\bmid\s*(?:thirties|30s)/i, min: 34, max: 37 }, { p: /\blate\s*(?:thirties|30s)/i, min: 37, max: 40 },
        { p: /\bearly\s*(?:forties|40s)/i, min: 40, max: 44 }, { p: /\bmid\s*(?:forties|40s)/i, min: 44, max: 47 },
        { p: /\blate\s*(?:forties|40s)/i, min: 47, max: 50 }, { p: /\bmiddle[\s-]*aged?/i, min: 40, max: 55 },
        { p: /\bmature\b/i, min: 45, max: 60 }, { p: /\belder/i, min: 60, max: 80 },
      ];
      for (const { p, min, max } of ageWords) {
        if (p.test(text)) { hc.ageMin = min; hc.ageMax = max; break; }
      }
    }
  }

  // Ethnicity
  const ethMap: Array<{ ps: RegExp[]; label: string }> = [
    { ps: [/\bchinese\b/i], label: 'Chinese' },
    { ps: [/\bjapanese\b/i], label: 'Japanese' },
    { ps: [/\bkorean\b/i], label: 'Korean' },
    { ps: [/\beast\s*asian\b/i, /\basian\b/i], label: 'East Asian' },
    { ps: [/\bsouth\s*asian\b/i, /\bindian\b/i], label: 'South Asian' },
    { ps: [/\bblack\b/i, /\bafrican\s*american\b/i], label: 'Black' },
    { ps: [/\blatino?\b/i, /\blatina\b/i, /\bhispanic\b/i], label: 'Latino/Hispanic' },
    { ps: [/\bmiddle\s*eastern\b/i, /\barab\b/i, /\bpersian\b/i], label: 'Middle Eastern' },
    { ps: [/\bcaucasian\b/i, /\bwhite\b/i, /\beuropean\b/i], label: 'Caucasian/European' },
    { ps: [/\bmixed\s*race\b/i, /\bbiracial\b/i], label: 'Mixed Race' },
    { ps: [/\bmediterranean\b/i, /\bitalian\b/i, /\bgreek\b/i], label: 'Mediterranean' },
    { ps: [/\bscandinavian\b/i, /\bnordic\b/i], label: 'Scandinavian' },
    { ps: [/\bsoutheast\s*asian\b/i, /\bfilipino\b/i], label: 'Southeast Asian' },
    { ps: [/\bnative\s*american\b/i, /\bindigenous\b/i], label: 'Indigenous' },
    { ps: [/\bpacific\s*islander\b/i, /\bpolynesian\b/i], label: 'Pacific Islander' },
  ];
  const ethnicities: string[] = [];
  for (const { ps, label } of ethMap) {
    for (const p of ps) { if (p.test(text) && !ethnicities.includes(label)) { ethnicities.push(label); break; } }
  }
  if (ethnicities.length > 0) hc.ethnicity = ethnicities;

  // Soft: attractiveness
  if (/\b(?:extremely|very|stunningly?|incredibly)\s+(?:beautiful|gorgeous|attractive|handsome)\b/i.test(text)) sp.attractiveness = 'very beautiful';
  else if (/\b(?:beautiful|gorgeous|attractive|handsome|striking|pretty)\b/i.test(text)) sp.attractiveness = 'attractive';
  else if (/\b(?:plain|ordinary|unremarkable)\b/i.test(text)) sp.attractiveness = 'plain';

  // Soft: build
  if (/\b(?:slim|slender|thin|lean|wiry)\b/i.test(text)) sp.build = 'slim';
  else if (/\b(?:athletic|fit|toned|muscular)\b/i.test(text)) sp.build = 'athletic';
  else if (/\b(?:stocky|broad|heavyset|heavy|burly)\b/i.test(text)) sp.build = 'stocky/heavy';
  else if (/\b(?:petite|small|diminutive)\b/i.test(text)) sp.build = 'petite';

  // Soft: skin tone
  if (/\b(?:fair[\s-]*skinned?|pale|porcelain)\b/i.test(text)) sp.skinTone = 'fair';
  else if (/\b(?:olive[\s-]*skinned?)\b/i.test(text)) sp.skinTone = 'olive';
  else if (/\b(?:dark[\s-]*skinned?)\b/i.test(text)) sp.skinTone = 'dark';
  else if (/\b(?:tan(?:ned)?|bronze[d]?)\b/i.test(text)) sp.skinTone = 'tan';

  // Soft: hair
  if (/\b(?:blonde?|golden[\s-]*hair)\b/i.test(text)) sp.hair = 'blonde';
  else if (/\b(?:brunette?|dark[\s-]*(?:brown\s+)?hair|brown[\s-]*hair)\b/i.test(text)) sp.hair = 'dark brown hair';
  else if (/\b(?:red[\s-]*hair|redhead|ginger|auburn)\b/i.test(text)) sp.hair = 'red/auburn hair';
  else if (/\b(?:black[\s-]*hair|jet[\s-]*black)\b/i.test(text)) sp.hair = 'black hair';
  else if (/\b(?:bald|shaved\s+head)\b/i.test(text)) sp.hair = 'bald/shaved';

  // Soft: vibes
  const vibeWords = ['dangerous','vulnerable','refined','grounded','intimidating','mysterious','charismatic','charming','warm','cold','brooding','intense','stoic','playful','seductive','innocent','weathered','rugged','polished','elegant','gritty','fierce','gentle','tough','sophisticated','wild','menacing'];
  const vibes = vibeWords.filter(v => new RegExp(`\\b${v}\\b`, 'i').test(text));
  if (vibes.length > 0) sp.vibe = vibes;

  // Soft: class
  const classWords: Array<[RegExp, string]> = [
    [/\bupper[\s-]*class\b/i, 'upper-class'], [/\bworking[\s-]*class\b/i, 'working-class'],
    [/\bblue[\s-]*collar\b/i, 'blue-collar'], [/\bstreet[\s-]*smart\b/i, 'street-smart'],
    [/\brough\b/i, 'rough'], [/\bposh\b/i, 'posh'], [/\baristocratic\b/i, 'aristocratic'],
  ];
  const cls = classWords.filter(([p]) => p.test(text)).map(([, l]) => l);
  if (cls.length > 0) sp.classSignals = cls;

  // Soft: energy
  const energyWords: Array<[RegExp, string]> = [
    [/\bhigh[\s-]*energy\b/i, 'high-energy'], [/\blow[\s-]*key\b/i, 'low-key'],
    [/\bexplosive\b/i, 'explosive'], [/\bquiet\b/i, 'quiet'],
    [/\bcommanding\b/i, 'commanding'], [/\bmagnetic\b/i, 'magnetic'],
    [/\bpowerful\b/i, 'powerful'], [/\bsoft\b/i, 'soft'],
  ];
  const eng = energyWords.filter(([p]) => p.test(text)).map(([, l]) => l);
  if (eng.length > 0) sp.energy = eng;

  // Likeness (reuse existing parser)
  const likenessResult = parseLikenessFromNotes(text);

  return {
    hardConstraints: hc,
    softPreferences: sp,
    likenessDirective: likenessResult.likenessDirective,
    remainingNotes: likenessResult.remainingNotes,
  };
}

interface CharacterInfo {
  name: string;
  traits: string[];
  dna: Record<string, any> | null;
  role?: string;
  // Hard constraints extracted from canon
  gender?: string | null;
  age_range?: string | null;
  ethnicity?: string | null;
}

// ── Hard constraint enforcement ──
interface HardConstraints {
  gender: string | null;
  age_range: string | null;
  ethnicity: string | null;
}

function extractHardConstraints(character: CharacterInfo): HardConstraints {
  let gender: string | null = null;
  let age_range: string | null = null;
  let ethnicity: string | null = null;

  // From DNA identity_signature (highest priority)
  if (character.dna?.identity_signature) {
    const sig = character.dna.identity_signature;
    if (sig.gender) gender = sig.gender;
    if (sig.age) age_range = sig.age;
    if (sig.ethnicity) ethnicity = sig.ethnicity;
  }

  // From canon traits (fallback)
  for (const trait of character.traits) {
    const lower = trait.toLowerCase();
    if (!gender && (lower.startsWith('gender:') || lower.startsWith('sex:'))) {
      gender = trait.split(':')[1]?.trim() || null;
    }
    if (!age_range && lower.startsWith('age:')) {
      age_range = trait.split(':')[1]?.trim() || null;
    }
    if (!ethnicity && (lower.startsWith('ethnicity:') || lower.startsWith('nationality:'))) {
      ethnicity = trait.split(':')[1]?.trim() || null;
    }
  }

  // Override from character-level fields
  if (character.gender) gender = character.gender;
  if (character.age_range) age_range = character.age_range;
  if (character.ethnicity) ethnicity = character.ethnicity;

  return { gender, age_range, ethnicity };
}

async function resolveCharacters(
  supabase: any,
  projectId: string
): Promise<CharacterInfo[]> {
  const charMap = new Map<string, CharacterInfo>();

  // ── PRIMARY SOURCE: project_canon.canon_json (canonical roster) ──
  const { data: canonRow } = await supabase
    .from("project_canon")
    .select("canon_json")
    .eq("project_id", projectId)
    .maybeSingle();

  if (canonRow?.canon_json) {
    const cj = canonRow.canon_json;
    if (Array.isArray(cj.characters)) {
      for (const ch of cj.characters) {
        const name = typeof ch === "string" ? ch.trim() : (ch?.name || ch?.character_name || "").trim();
        if (!name || name === "Unknown") continue;
        const key = name.toLowerCase();
        if (!charMap.has(key)) {
          charMap.set(key, { name, traits: [], dna: null });
        }
        const entry = charMap.get(key)!;
        if (typeof ch === "object") {
          if (ch.role) entry.role = ch.role;
          if (ch.gender) entry.gender = ch.gender;
          if (ch.age) entry.age_range = ch.age;
          if (ch.ethnicity) entry.ethnicity = ch.ethnicity;
          if (ch.traits) entry.traits.push(String(ch.traits));
          if (ch.goals) entry.traits.push(`goals: ${ch.goals}`);
        }
      }
    }
    const profiles = cj.character_wardrobe_profiles?.profiles;
    if (Array.isArray(profiles)) {
      for (const p of profiles) {
        const name = (p?.character_name || p?.character_id_or_key || "").trim();
        if (!name || name === "Unknown") continue;
        const key = name.toLowerCase();
        if (!charMap.has(key)) {
          charMap.set(key, { name, traits: [], dna: null });
        }
      }
    }
  }

  // ── SECONDARY SOURCE: canon_facts (enrichment + fallback) ──
  const { data: canonFacts } = await supabase
    .from("canon_facts")
    .select("subject, predicate, object, value")
    .eq("project_id", projectId)
    .eq("fact_type", "character")
    .eq("is_active", true);

  for (const fact of canonFacts || []) {
    const key = (fact.subject || "").toLowerCase().trim();
    if (!key) continue;
    if (!charMap.has(key)) {
      charMap.set(key, { name: fact.subject, traits: [], dna: null });
    }
    const ch = charMap.get(key)!;
    if (fact.predicate === "role" || fact.predicate === "archetype") {
      ch.role = fact.object || (fact.value as any)?.toString();
    }
    // Extract hard constraint fields from canon_facts
    if (fact.predicate === "gender" && fact.object) {
      ch.gender = fact.object;
    }
    if (fact.predicate === "age" && fact.object) {
      ch.age_range = fact.object;
    }
    if ((fact.predicate === "ethnicity" || fact.predicate === "nationality") && fact.object) {
      ch.ethnicity = fact.object;
    }
    if (fact.object) ch.traits.push(`${fact.predicate}: ${fact.object}`);
  }

  // ── TERTIARY FALLBACK: project_images subjects ──
  if (charMap.size === 0) {
    const { data: imgSubjects } = await supabase
      .from("project_images")
      .select("subject, subject_type")
      .eq("project_id", projectId)
      .not("subject", "is", null);

    for (const row of imgSubjects || []) {
      const name = (row.subject || "").trim();
      const stype = (row.subject_type || "").toLowerCase();
      if (name && stype !== "location") {
        const key = name.toLowerCase();
        if (!charMap.has(key)) {
          charMap.set(key, { name, traits: [], dna: null });
        }
      }
    }
  }

  // Get visual DNA for each character
  for (const [name, info] of charMap) {
    const { data: dna } = await supabase
      .from("character_visual_dna")
      .select("identity_signature, physical_categories, binding_markers")
      .eq("project_id", projectId)
      .ilike("character_name", name)
      .eq("is_current", true)
      .limit(1)
      .maybeSingle();

    if (dna) info.dna = dna;
  }

  return [...charMap.values()];
}

function buildCastingPrompt(
  character: CharacterInfo,
  variation: typeof VARIATION_DESCRIPTORS[0],
  shotType: "headshot" | "full_body",
  projectStyle: string,
  constraints: HardConstraints,
  refinements?: RefinementDirectives | null,
  noteInterp?: NoteInterpretation | null,
): string {
  const parts: string[] = [];

  // Core shot direction
  if (shotType === "headshot") {
    parts.push(`Professional casting headshot photograph. Close-up portrait, shoulders up, neutral background.`);
  } else {
    parts.push(`Professional casting full-body photograph. Standing pose, full figure visible from head to toe, neutral studio background.`);
  }

  // ── HARD CONSTRAINTS: merge canon constraints with note-derived constraints ──
  // Note-derived constraints override canon when more specific
  const effectiveGender = noteInterp?.hardConstraints?.gender || constraints.gender;
  const effectiveEthnicity = noteInterp?.hardConstraints?.ethnicity?.length
    ? noteInterp.hardConstraints.ethnicity.join(', ')
    : constraints.ethnicity;
  const effectiveAge = (noteInterp?.hardConstraints?.ageMin != null && noteInterp?.hardConstraints?.ageMax != null)
    ? `${noteInterp.hardConstraints.ageMin}–${noteInterp.hardConstraints.ageMax} years old`
    : constraints.age_range;

  if (effectiveGender) {
    parts.push(`REQUIRED: ${effectiveGender} person. This is a non-negotiable casting requirement.`);
  }
  if (effectiveAge) {
    parts.push(`REQUIRED age: ${effectiveAge}.`);
  }
  if (effectiveEthnicity) {
    parts.push(`REQUIRED appearance/ethnicity: ${effectiveEthnicity}. The person MUST visually present as ${effectiveEthnicity}. This is a specific, non-negotiable casting requirement.`);
  }

  // ── SOFT PREFERENCES from note interpretation ──
  if (noteInterp?.softPreferences) {
    const sp = noteInterp.softPreferences;
    if (sp.attractiveness) parts.push(`Appearance quality: ${sp.attractiveness}.`);
    if (sp.build) parts.push(`Physical build: ${sp.build}.`);
    if (sp.skinTone) parts.push(`Skin tone: ${sp.skinTone}.`);
    if (sp.hair) parts.push(`Hair: ${sp.hair}.`);
    if (sp.vibe?.length) parts.push(`Character vibe and energy: ${sp.vibe.join(', ')}. These qualities should be evident in expression and bearing.`);
    if (sp.classSignals?.length) parts.push(`Social class feel: ${sp.classSignals.join(', ')}.`);
    if (sp.energy?.length) parts.push(`Presence energy: ${sp.energy.join(', ')}.`);
  }

  // ── LIKENESS DIRECTIVE ──
  if (noteInterp?.likenessDirective) {
    parts.push(noteInterp.likenessDirective);
  }

  // Character identity from DNA
  if (character.dna?.identity_signature) {
    const sig = character.dna.identity_signature;
    if (sig.build && !noteInterp?.softPreferences?.build) parts.push(`Build: ${sig.build}.`);
    if (sig.hair && !noteInterp?.softPreferences?.hair) parts.push(`Hair: ${sig.hair}.`);
    if (sig.face) parts.push(`Face: ${sig.face}.`);
    if (sig.height) parts.push(`Height: ${sig.height}.`);
  }

  // Physical categories from DNA
  if (character.dna?.physical_categories) {
    const pc = character.dna.physical_categories;
    for (const [key, val] of Object.entries(pc)) {
      if (val && typeof val === "object" && (val as any).value) {
        parts.push(`${key}: ${(val as any).value}.`);
      }
    }
  }

  // ── REFINEMENT DIRECTIVES (from Casting Assistant dropdowns) ──
  if (refinements) {
    if (refinements.height) parts.push(`Height preference: ${refinements.height}.`);
    if (refinements.build && !noteInterp?.softPreferences?.build) parts.push(`Build preference: ${refinements.build}.`);
    if (refinements.skin_tone && !noteInterp?.softPreferences?.skinTone) parts.push(`Skin tone: ${refinements.skin_tone}.`);
    if (refinements.hair_color && !noteInterp?.softPreferences?.hair) parts.push(`Hair color: ${refinements.hair_color}.`);
    if (refinements.hair_length) parts.push(`Hair length: ${refinements.hair_length}.`);
    if (refinements.age_refinement && !effectiveAge) parts.push(`Age refinement: ${refinements.age_refinement}.`);
    if (refinements.presence_modifiers?.length) {
      parts.push(`Presence: ${refinements.presence_modifiers.join(", ")}.`);
    }
  }

  // Canon traits (non-constraint)
  const nonConstraintTraits = character.traits.filter(t => {
    const lower = t.toLowerCase();
    return !lower.startsWith('gender:') && !lower.startsWith('sex:') && 
           !lower.startsWith('age:') && !lower.startsWith('ethnicity:') &&
           !lower.startsWith('nationality:');
  });
  if (nonConstraintTraits.length > 0) {
    parts.push(`Character traits: ${nonConstraintTraits.slice(0, 5).join("; ")}.`);
  }

  if (character.role) {
    parts.push(`Character role: ${character.role}.`);
  }

  // Variation
  parts.push(`Casting direction: ${variation.casting_note}. Mood: ${variation.mood}. Style: ${variation.style}.`);

  if (projectStyle) {
    parts.push(`Project visual style: ${projectStyle}.`);
  }

  // Remaining free-text notes (after structured extraction)
  if (noteInterp?.remainingNotes) {
    parts.push(`Additional director note: ${noteInterp.remainingNotes}.`);
  }

  parts.push(`Photorealistic. Professional lighting. Sharp focus. High resolution casting photograph. No text, no watermarks.`);

  return parts.join(" ");
}

// ── Likeness reference parsing (server-side mirror of client-side parser) ──

interface LikenessRef {
  reference_people: string[];
  reference_strength: 'subtle' | 'moderate' | 'strong';
}

function parseLikenessFromNotes(notes: string): {
  references: LikenessRef[];
  likenessDirective: string;
  remainingNotes: string;
} {
  if (!notes?.trim()) return { references: [], likenessDirective: '', remainingNotes: '' };

  const refs: LikenessRef[] = [];
  const spans: Array<[number, number]> = [];

  const BLOCKLIST = new Set([
    'someone', 'something', 'anyone', 'person', 'character', 'actor', 'actress',
    'man', 'woman', 'boy', 'girl', 'guy', 'lady', 'the', 'this', 'that',
    'more', 'less', 'very', 'young', 'old', 'tall', 'short', 'dark', 'light',
  ]);

  function valid(n: string) {
    const t = n.trim();
    return t.length >= 3 && /^[A-Z]/.test(t) && !BLOCKLIST.has(t.toLowerCase()) && t.split(/\s+/).length <= 4;
  }
  function clean(s: string) { return s.trim().replace(/[.,;:!?]+$/, '').replace(/\s+/g, ' ').trim(); }
  function overlaps(s: number, e: number) { return spans.some(([a, b]) => s < b && e > a); }

  // Mix patterns
  const MIX = /\b(?:a\s+)?(?:mix|cross|blend|combination|hybrid)\s+(?:of|between)\s+([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+){0,3})\s+and\s+([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+){0,3})/gi;
  let m: RegExpExecArray | null;
  MIX.lastIndex = 0;
  while ((m = MIX.exec(notes)) !== null) {
    const p = [clean(m[1]), clean(m[2])].filter(valid);
    if (p.length >= 2) { refs.push({ reference_people: p, reference_strength: 'strong' }); spans.push([m.index, m.index + m[0].length]); }
  }

  // Strong single
  const STRONG = /\b(?:looks?\s+like|someone\s+like|think\s+(?:of\s+)?|resembles?|channeling|channel)\s+([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+){0,3})/gi;
  STRONG.lastIndex = 0;
  while ((m = STRONG.exec(notes)) !== null) {
    const n = clean(m[1]);
    if (valid(n) && !overlaps(m.index, m.index + m[0].length)) { refs.push({ reference_people: [n], reference_strength: 'strong' }); spans.push([m.index, m.index + m[0].length]); }
  }

  // Moderate
  const MOD = /\b(?:feels?\s+like|vibe\s+of|energy\s+of|presence\s+(?:like|of)|spirit\s+of)\s+([A-Z][A-Za-z'\-]+(?:\s+[A-Za-z'\-]+){0,3})/gi;
  MOD.lastIndex = 0;
  while ((m = MOD.exec(notes)) !== null) {
    const n = clean(m[1]);
    if (valid(n) && !overlaps(m.index, m.index + m[0].length)) { refs.push({ reference_people: [n], reference_strength: 'moderate' }); spans.push([m.index, m.index + m[0].length]); }
  }

  // Build directive
  let directive = '';
  if (refs.length > 0) {
    const parts: string[] = [];
    for (const ref of refs) {
      const people = ref.reference_people.join(' and ');
      const prefix = ref.reference_strength === 'strong' ? 'Visual reference direction' : ref.reference_strength === 'moderate' ? 'Soft visual reference' : 'Subtle aesthetic influence';
      if (ref.reference_people.length > 1) {
        parts.push(`${prefix}: Blend the visual qualities of ${people} — combine their distinctive features, presence, and energy into a unique individual.`);
      } else {
        parts.push(`${prefix}: Channel the visual quality, presence, and energy of ${people} — similar type, not a copy.`);
      }
    }
    parts.push('This is casting direction only — generate a unique individual inspired by these references, not a likeness or portrait.');
    directive = parts.join(' ');
  }

  // Remaining notes
  let remaining = notes;
  const sorted = [...spans].sort((a, b) => b[0] - a[0]);
  for (const [s, e] of sorted) remaining = remaining.slice(0, s) + remaining.slice(e);
  remaining = remaining.replace(/\s{2,}/g, ' ').trim();

  return { references: refs, likenessDirective: directive, remainingNotes: remaining };
}

// Robust image data URL extraction
function extractImageDataUrl(genResult: any): string | null {
  try {
    const choice = genResult?.choices?.[0]?.message;
    if (!choice) return null;
    const imgUrl = choice.images?.[0]?.image_url?.url;
    if (imgUrl && imgUrl.startsWith("data:image")) return imgUrl;
    if (Array.isArray(choice.content)) {
      for (const part of choice.content) {
        if (part.type === "image_url" && part.image_url?.url?.startsWith("data:image")) return part.image_url.url;
        if (part.type === "image" && part.image?.url?.startsWith("data:image")) return part.image.url;
        if (part.inline_data?.data) {
          const mime = part.inline_data.mime_type || "image/png";
          return `data:${mime};base64,${part.inline_data.data}`;
        }
        if (typeof part === "string" && part.startsWith("data:image")) return part;
        if (typeof part.text === "string" && part.text.startsWith("data:image")) return part.text;
      }
    }
    if (typeof choice.content === "string" && choice.content.startsWith("data:image")) return choice.content;
  } catch (_) {}
  return null;
}

async function generateImage(
  prompt: string,
  apiKey: string
): Promise<string | null> {
  try {
    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`Image gen failed (${resp.status}):`, errText);
      if (resp.status === 429) throw new Error("RATE_LIMITED");
      if (resp.status === 402) throw new Error("CREDITS_EXHAUSTED");
      return null;
    }

    const data = await resp.json();
    return extractImageDataUrl(data);
  } catch (e: any) {
    if (e.message === "RATE_LIMITED" || e.message === "CREDITS_EXHAUSTED")
      throw e;
    console.error("Image generation error:", e);
    return null;
  }
}

async function uploadBase64Image(
  supabase: any,
  base64Url: string,
  path: string
): Promise<string | null> {
  try {
    const base64Data = base64Url.split(",")[1];
    if (!base64Data) return null;

    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const { error } = await supabase.storage
      .from("project-images")
      .upload(path, bytes, {
        contentType: "image/png",
        upsert: true,
      });

    if (error) {
      console.error("Upload error:", error);
      return null;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("project-images").getPublicUrl(path);
    return publicUrl;
  } catch (e) {
    console.error("Upload error:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      projectId,
      candidatesPerCharacter = 4,
      characterFilter,
      explorationMode = false,
      refinements = null,
      existingCandidateIds = [],
      autoCastNotes = null,
      notes = null,
    } = body;

    // Merge notes + autoCastNotes → single effective notes string
    const effectiveNotes = [notes, autoCastNotes].filter(Boolean).join('. ').trim() || null;
    // Canonical note interpretation — single source of truth
    const noteInterp = effectiveNotes ? interpretNotes(effectiveNotes) : null;
    if (noteInterp) {
      console.log(`[NOTE_INTERPRETATION]`, JSON.stringify({
        hardConstraints: noteInterp.hardConstraints,
        softPreferences: noteInterp.softPreferences,
        hasLikeness: !!noteInterp.likenessDirective,
        remaining: noteInterp.remainingNotes,
      }));
    }

    if (!projectId) return jsonRes({ error: "projectId required" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY)
      return jsonRes({ error: "LOVABLE_API_KEY not configured" }, 500);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return jsonRes({ error: "Unauthorized" }, 401);

    // Resolve characters
    let characters = await resolveCharacters(supabase, projectId);
    if (characterFilter) {
      characters = characters.filter((c) =>
        c.name.toLowerCase() === characterFilter.toLowerCase()
      );
    }

    if (characters.length === 0) {
      return jsonRes({ error: "No characters found for project" }, 400);
    }

    // Get project style context
    const { data: project } = await supabase
      .from("projects")
      .select("title, genre, format, tone")
      .eq("id", projectId)
      .maybeSingle();

    const projectStyle = project
      ? [project.genre, project.format, project.tone].filter(Boolean).join(", ")
      : "";

    // Use exploration variations for expanded pool
    const variations = explorationMode ? EXPLORATION_VARIATIONS : VARIATION_DESCRIPTORS;
    const count = explorationMode
      ? Math.min(candidatesPerCharacter * 2, variations.length)
      : Math.min(candidatesPerCharacter, 6);

    // Load existing candidate data for duplicate suppression
    const existingVariations = new Set<string>();
    const existingUrls = new Set<string>();
    if (characterFilter) {
      const { data: existing } = await supabase
        .from("casting_candidates")
        .select("headshot_url, generation_config")
        .eq("project_id", projectId)
        .eq("character_key", characterFilter)
        .in("status", ["generated", "shortlisted"]);
      for (const row of existing || []) {
        if (row.headshot_url) existingUrls.add(row.headshot_url);
        const variation = (row.generation_config as any)?.variation;
        if (variation) existingVariations.add(variation.toLowerCase().trim());
      }
    } else if (existingCandidateIds.length > 0) {
      const { data: existing } = await supabase
        .from("casting_candidates")
        .select("headshot_url, generation_config")
        .in("id", existingCandidateIds);
      for (const row of existing || []) {
        if (row.headshot_url) existingUrls.add(row.headshot_url);
        const variation = (row.generation_config as any)?.variation;
        if (variation) existingVariations.add(variation.toLowerCase().trim());
      }
    }

    const batchId = crypto.randomUUID();
    const results: any[] = [];
    let generated = 0;
    let failed = 0;
    const rejectedConstraints: any[] = [];

    for (const character of characters) {
      const constraints = extractHardConstraints(character);
      
      // Log constraint extraction
      console.log(`[CASTING_CONSTRAINTS] ${character.name}:`, JSON.stringify(constraints));

      // Track used variation indices to avoid duplicates with exploration
      const usedVariationIndices = new Set<number>();

      for (let i = 0; i < count; i++) {
        // For exploration, skip already-used variations
        let variationIdx = i % variations.length;
        if (explorationMode) {
          // Start from different offset to get fresh variations
          variationIdx = (i + VARIATION_DESCRIPTORS.length) % variations.length;
          if (usedVariationIndices.has(variationIdx)) {
            variationIdx = (variationIdx + 1) % variations.length;
          }
        }
        usedVariationIndices.add(variationIdx);
        const variation = variations[variationIdx];

        // ── DUPLICATE SUPPRESSION: skip if this variation style already exists for character ──
        if (existingVariations.has(variation.style.toLowerCase().trim())) {
          console.log(`[DUPLICATE_SUPPRESSED] ${character.name}: skipping variation "${variation.style}" — already exists`);
          continue;
        }

        // Generate headshot
        const headshotPrompt = buildCastingPrompt(
          character,
          variation,
          "headshot",
          projectStyle,
          constraints,
          refinements as RefinementDirectives | null,
          noteInterp,
        );

        let headshotUrl: string | null = null;
        let fullBodyUrl: string | null = null;

        try {
          const headshotBase64 = await generateImage(
            headshotPrompt,
            LOVABLE_API_KEY
          );
          if (headshotBase64) {
            const storagePath = `casting/${projectId}/${batchId}/${character.name.toLowerCase().replace(/\s+/g, "_")}_${i}_headshot.png`;
            headshotUrl = await uploadBase64Image(
              supabase,
              headshotBase64,
              storagePath
            );
          }

          await new Promise((r) => setTimeout(r, 1500));

          // Generate full body
          const fullBodyPrompt = buildCastingPrompt(
            character,
            variation,
            "full_body",
            projectStyle,
            constraints,
            refinements as RefinementDirectives | null,
            noteInterp,
          );
          const fullBodyBase64 = await generateImage(
            fullBodyPrompt,
            LOVABLE_API_KEY
          );
          if (fullBodyBase64) {
            const storagePath = `casting/${projectId}/${batchId}/${character.name.toLowerCase().replace(/\s+/g, "_")}_${i}_full_body.png`;
            fullBodyUrl = await uploadBase64Image(
              supabase,
              fullBodyBase64,
              storagePath
            );
          }
        } catch (e: any) {
          if (e.message === "RATE_LIMITED") {
            console.warn("Rate limited, waiting 10s...");
            await new Promise((r) => setTimeout(r, 10000));
            failed++;
            continue;
          }
          if (e.message === "CREDITS_EXHAUSTED") {
            return jsonRes(
              {
                error: "AI credits exhausted. Please add funds.",
                partial_results: results,
                generated,
                failed,
              },
              402
            );
          }
          failed++;
          continue;
        }

        if (!headshotUrl && !fullBodyUrl) {
          failed++;
          continue;
        }

        // ── POST-GENERATION HARD CONSTRAINT ADMISSION ──
        const noteHasConstraints = !!(noteInterp?.hardConstraints?.gender || noteInterp?.hardConstraints?.ethnicity?.length);
        const admissionStatus = (constraints.gender || noteHasConstraints) ? "constraint_enforced" : "unconstrained";
        console.log(`[ADMISSION] ${character.name} candidate ${i}: ${admissionStatus}`);

        // Insert candidate with constraint + scoring + interpretation metadata
        const mergedConstraints = {
          ...constraints,
          ...(noteInterp?.hardConstraints?.gender && { gender: noteInterp.hardConstraints.gender }),
          ...(noteInterp?.hardConstraints?.ethnicity?.length && { ethnicity: noteInterp.hardConstraints.ethnicity.join(', ') }),
          ...(noteInterp?.hardConstraints?.ageMin != null && { age_range: `${noteInterp.hardConstraints.ageMin}–${noteInterp.hardConstraints.ageMax}` }),
        };

        const { data: inserted, error: insertErr } = await supabase
          .from("casting_candidates")
          .insert({
            project_id: projectId,
            user_id: user.id,
            character_key: character.name,
            batch_id: batchId,
            status: "generated",
            headshot_url: headshotUrl,
            full_body_url: fullBodyUrl,
            generation_config: {
              variation: variation.style,
              casting_note: variation.casting_note,
              mood: variation.mood,
              character_dna_used: !!character.dna,
              model: "google/gemini-3.1-flash-image-preview",
              hard_constraints: mergedConstraints,
              exploration_mode: explorationMode,
              refinements: refinements || null,
              admission_status: admissionStatus,
              auto_cast_notes: autoCastNotes || null,
              user_notes: notes || null,
              note_interpretation: noteInterp ? {
                hard_constraints: noteInterp.hardConstraints,
                soft_preferences: noteInterp.softPreferences,
                has_likeness: !!noteInterp.likenessDirective,
              } : null,
              profile_scoring: {
                physical_constraints_applied: !!(mergedConstraints.gender || mergedConstraints.age_range || mergedConstraints.ethnicity),
                dna_used: !!character.dna,
                role_type: character.role || null,
              },
            },
          })
          .select("id")
          .single();

        // Track this variation as used for duplicate suppression
        existingVariations.add(variation.style.toLowerCase().trim());

        if (insertErr) {
          console.error("Insert error:", insertErr);
          failed++;
        } else {
          results.push({
            id: inserted.id,
            character: character.name,
            variation: variation.style,
          });
          generated++;
        }

        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return jsonRes({
      batch_id: batchId,
      generated,
      failed,
      characters: characters.length,
      results,
      constraints_applied: characters.map(c => ({
        character: c.name,
        constraints: extractHardConstraints(c),
      })),
      exploration_mode: explorationMode,
      rejected_constraints: rejectedConstraints,
    });
  } catch (err: any) {
    console.error("generate-casting-candidates error:", err);

    if (err.message?.includes("RATE_LIMITED")) {
      return jsonRes({ error: "Rate limited. Please try again later." }, 429);
    }
    if (err.message?.includes("CREDITS_EXHAUSTED")) {
      return jsonRes({ error: "AI credits exhausted. Please add funds." }, 402);
    }

    return jsonRes({ error: err.message || "Internal error" }, 500);
  }
});
