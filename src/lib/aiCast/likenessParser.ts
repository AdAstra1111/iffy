/**
 * likenessParser — Detects and normalizes "looks like X" / "a mix of X and Y"
 * reference-person phrasing from casting notes into structured guidance.
 *
 * Used in: per-character notes, Casting Assistant, Auto-Cast notes.
 * Output feeds into candidate generation prompts as weighted likeness guidance.
 */

export interface LikenessReference {
  /** Raw matched text from user notes */
  raw_match: string;
  /** Normalized reference people (names only, trimmed) */
  reference_people: string[];
  /** How to apply: 'likeness_guidance' = soft visual direction, never a claim of identity */
  reference_mode: 'likeness_guidance';
  /** Strength: 'subtle' for vague phrasing, 'strong' for explicit "looks like" */
  reference_strength: 'subtle' | 'moderate' | 'strong';
}

export interface LikenessParseResult {
  /** Detected references */
  references: LikenessReference[];
  /** Notes text with reference phrases removed (for remaining free-text prompt use) */
  remaining_notes: string;
  /** Whether any references were detected */
  has_references: boolean;
}

// ── Patterns ────────────────────────────────────────────────────────────────

// Name segment: uppercase-starting word (case-sensitive check done in clean step)
const NAME_SEG = `[A-Z][a-zA-Z'\\-]+`;
const NAME_CHAIN = `${NAME_SEG}(?:\\s+${NAME_SEG}){0,3}`;

// Strong: "looks like X", "someone like X", "think X" — trigger is case-insensitive, names are case-sensitive
const STRONG_SINGLE = new RegExp(`\\b(?:[Ll]ooks?\\s+[Ll]ike|[Ss]omeone\\s+[Ll]ike|[Tt]hink\\s+(?:[Oo]f\\s+)?|[Rr]esembles?|[Cc]hanneling|[Cc]hannel)\\s+(${NAME_CHAIN})`, 'g');

// Strong: "a mix of X and Y", "cross between X and Y", "blend of X and Y"
const STRONG_MIX = new RegExp(`\\b(?:a\\s+)?(?:mix|cross|blend|combination|hybrid)\\s+(?:of|between)\\s+(${NAME_CHAIN})\\s+and\\s+(${NAME_CHAIN})`, 'gi');

// Moderate: "feels like X", "vibe of X", etc. — trigger case-insensitive, names case-sensitive
const MODERATE_SINGLE = new RegExp(`\\b(?:[Ff]eels?\\s+[Ll]ike|[Vv]ibe\\s+[Oo]f|[Ee]nergy\\s+[Oo]f|[Pp]resence\\s+(?:[Ll]ike|[Oo]f)|[Ss]pirit\\s+[Oo]f|[Aa]ura\\s+[Oo]f)\\s+(${NAME_CHAIN})`, 'g');

// Subtle: "X type", "X-esque", "X-ish"
const SUBTLE_SUFFIX = new RegExp(`\\b(${NAME_CHAIN})\\s*(?:-esque|-ish|-type|type)\\b`, 'g');

// ── Blocklist (common false positives) ──
const NAME_BLOCKLIST = new Set([
  'someone', 'something', 'anyone', 'anything', 'everybody',
  'nobody', 'person', 'character', 'actor', 'actress',
  'man', 'woman', 'boy', 'girl', 'guy', 'lady',
  'the', 'this', 'that', 'more', 'less', 'very',
  'young', 'old', 'tall', 'short', 'dark', 'light',
  'big', 'small', 'strong', 'soft', 'hard',
  'hollywood', 'bollywood', 'korean', 'japanese', 'british', 'american',
]);

function isValidName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 3) return false;
  if (NAME_BLOCKLIST.has(trimmed.toLowerCase())) return false;
  // Must start with uppercase (proper noun signal)
  if (!/^[A-Z]/.test(trimmed)) return false;
  // No more than 4 words
  if (trimmed.split(/\s+/).length > 4) return false;
  return true;
}

function cleanName(raw: string): string {
  return raw.trim()
    .replace(/[.,;:!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse user-provided casting notes for likeness references.
 */
export function parseLikenessReferences(notes: string): LikenessParseResult {
  if (!notes || !notes.trim()) {
    return { references: [], remaining_notes: '', has_references: false };
  }

  const references: LikenessReference[] = [];
  const matchedSpans: Array<[number, number]> = [];

  // ── Strong mix patterns (highest priority) ──
  STRONG_MIX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = STRONG_MIX.exec(notes)) !== null) {
    const name1 = cleanName(m[1]);
    const name2 = cleanName(m[2]);
    const people = [name1, name2].filter(isValidName);
    if (people.length >= 2) {
      references.push({
        raw_match: m[0].trim(),
        reference_people: people,
        reference_mode: 'likeness_guidance',
        reference_strength: 'strong',
      });
      matchedSpans.push([m.index, m.index + m[0].length]);
    }
  }

  // ── Strong single patterns ──
  STRONG_SINGLE.lastIndex = 0;
  while ((m = STRONG_SINGLE.exec(notes)) !== null) {
    const name = cleanName(m[1]);
    if (isValidName(name) && !isOverlapping(m.index, m.index + m[0].length, matchedSpans)) {
      references.push({
        raw_match: m[0].trim(),
        reference_people: [name],
        reference_mode: 'likeness_guidance',
        reference_strength: 'strong',
      });
      matchedSpans.push([m.index, m.index + m[0].length]);
    }
  }

  // ── Moderate patterns ──
  MODERATE_SINGLE.lastIndex = 0;
  while ((m = MODERATE_SINGLE.exec(notes)) !== null) {
    const name = cleanName(m[1]);
    if (isValidName(name) && !isOverlapping(m.index, m.index + m[0].length, matchedSpans)) {
      references.push({
        raw_match: m[0].trim(),
        reference_people: [name],
        reference_mode: 'likeness_guidance',
        reference_strength: 'moderate',
      });
      matchedSpans.push([m.index, m.index + m[0].length]);
    }
  }

  // ── Subtle suffix patterns ──
  SUBTLE_SUFFIX.lastIndex = 0;
  while ((m = SUBTLE_SUFFIX.exec(notes)) !== null) {
    const name = cleanName(m[1]);
    if (isValidName(name) && !isOverlapping(m.index, m.index + m[0].length, matchedSpans)) {
      references.push({
        raw_match: m[0].trim(),
        reference_people: [name],
        reference_mode: 'likeness_guidance',
        reference_strength: 'subtle',
      });
      matchedSpans.push([m.index, m.index + m[0].length]);
    }
  }

  // Deduplicate by reference people
  const seen = new Set<string>();
  const deduped = references.filter(ref => {
    const key = ref.reference_people.map(n => n.toLowerCase()).sort().join('+');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Build remaining notes (remove matched spans)
  let remaining = notes;
  // Sort spans descending by start index so removals don't shift indices
  const sorted = [...matchedSpans].sort((a, b) => b[0] - a[0]);
  for (const [start, end] of sorted) {
    remaining = remaining.slice(0, start) + remaining.slice(end);
  }
  remaining = remaining.replace(/\s{2,}/g, ' ').trim();

  return {
    references: deduped,
    remaining_notes: remaining,
    has_references: deduped.length > 0,
  };
}

/**
 * Convert parsed likeness references into prompt directives for image generation.
 */
export function likenessToPromptDirective(references: LikenessReference[]): string {
  if (references.length === 0) return '';

  const parts: string[] = [];

  for (const ref of references) {
    const people = ref.reference_people.join(' and ');
    const strengthMap = {
      strong: 'Visual reference direction',
      moderate: 'Soft visual reference',
      subtle: 'Subtle aesthetic influence',
    };
    const prefix = strengthMap[ref.reference_strength];

    if (ref.reference_people.length > 1) {
      parts.push(`${prefix}: Blend the visual qualities of ${people} — combine their distinctive features, presence, and energy into a unique individual.`);
    } else {
      parts.push(`${prefix}: Channel the visual quality, presence, and energy of ${people} — similar type, not a copy.`);
    }
  }

  parts.push('This is casting direction only — generate a unique individual inspired by these references, not a likeness or portrait.');

  return parts.join(' ');
}

function isOverlapping(start: number, end: number, spans: Array<[number, number]>): boolean {
  return spans.some(([s, e]) => start < e && end > s);
}
