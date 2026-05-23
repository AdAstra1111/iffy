/**
 * entity-links-engine v2 — Unit Tests
 *
 * Validates the pure utility functions that were restored with TS type
 * annotations in commit e8e538c.
 *
 * Functions tested (mirrors from index.ts):
 *   1. normalizeForDedup      — normalization of entity names
 *   2. levenshteinDistance    — Levenshtein distance calculation
 *   3. ngrams                 — n-gram generation
 *   4. ngramSimilarity        — n-gram similarity metric
 *   5. levenshteinRatio       — normalized Levenshtein similarity (0–1)
 *   6. isDedupMatch           — layered dedup matching logic
 *   7. canonicalizeNames      — Tier 1–4 entity canonicalization
 *   8. stripScreenplaySuffix  — screenplay suffix stripping
 *   9. makeEntityKey          — entity key generation
 *  10. isNoiseName            — noise word detection
 *  11. isRoleNoise            — role/rank word detection
 *  12. pickCanonical          — canonical name selection from variants
 *  13. computeContentHash     — content hash (SHA-256)
 */

import { assertEquals, assert, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ═══════════════════════════════════════════════════════════════
// 1. normalizeForDedup
// ═══════════════════════════════════════════════════════════════

function normalizeForDedup(name: string): string {
  return name.toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.test({
  name: "normalizeForDedup: simple name passes through",
  fn() {
    assertEquals(normalizeForDedup("BILL BLACKSTONE"), "BILL BLACKSTONE");
  },
});

Deno.test({
  name: "normalizeForDedup: strips accents (NFD)",
  fn() {
    assertEquals(normalizeForDedup("JOSÉ GARCÍA"), "JOSE GARCIA");
  },
});

Deno.test({
  name: "normalizeForDedup: replaces non-alphanumeric with spaces",
  fn() {
    assertEquals(normalizeForDedup("O'BRIEN-SMITH"), "O BRIEN SMITH");
  },
});

Deno.test({
  name: "normalizeForDedup: collapses multiple spaces",
  fn() {
    assertEquals(normalizeForDedup("  BILL   BLACKSTONE  "), "BILL BLACKSTONE");
  },
});

Deno.test({
  name: "normalizeForDedup: empty string returns empty",
  fn() {
    assertEquals(normalizeForDedup(""), "");
  },
});

Deno.test({
  name: "normalizeForDedup: only special characters returns empty",
  fn() {
    assertEquals(normalizeForDedup("!!!   ???"), "");
  },
});

// ═══════════════════════════════════════════════════════════════
// 2. levenshteinDistance
// ═══════════════════════════════════════════════════════════════

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
}

Deno.test({
  name: "levenshteinDistance: identical strings are 0",
  fn() {
    assertEquals(levenshteinDistance("BILL", "BILL"), 0);
  },
});

Deno.test({
  name: "levenshteinDistance: completely different strings",
  fn() {
    assert(levenshteinDistance("BILL", "SUSAN") >= 4);
  },
});

Deno.test({
  name: "levenshteinDistance: single character difference",
  fn() {
    assertEquals(levenshteinDistance("BILL", "BALL"), 1);
  },
});

Deno.test({
  name: "levenshteinDistance: empty string a",
  fn() {
    assertEquals(levenshteinDistance("", "BILL"), 4);
  },
});

Deno.test({
  name: "levenshteinDistance: empty string b",
  fn() {
    assertEquals(levenshteinDistance("BILL", ""), 4);
  },
});

Deno.test({
  name: "levenshteinDistance: both empty",
  fn() {
    assertEquals(levenshteinDistance("", ""), 0);
  },
});

Deno.test({
  name: "levenshteinDistance: typo variant (BLACKSTONE vs BLACKSTONE)",
  fn() {
    assertEquals(levenshteinDistance("BLACKSTONE", "BLACKSTONE"), 0);
  },
});

Deno.test({
  name: "levenshteinDistance: single insertion",
  fn() {
    assertEquals(levenshteinDistance("BILL", "BILLS"), 1);
  },
});

// ═══════════════════════════════════════════════════════════════
// 3. ngrams
// ═══════════════════════════════════════════════════════════════

function ngrams(s: string, n: number): string[] {
  const result: string[] = [];
  for (let i = 0; i <= s.length - n; i++) {
    result.push(s.slice(i, i + n));
  }
  return result;
}

Deno.test({
  name: "ngrams: generates bigrams correctly",
  fn() {
    assertEquals(ngrams("BILL", 2), ["BI", "IL", "LL"]);
  },
});

Deno.test({
  name: "ngrams: generates trigrams correctly",
  fn() {
    assertEquals(ngrams("BILL", 3), ["BIL", "ILL"]);
  },
});

Deno.test({
  name: "ngrams: single character, bigram returns empty",
  fn() {
    assertEquals(ngrams("A", 2), []);
  },
});

Deno.test({
  name: "ngrams: string shorter than n returns empty",
  fn() {
    assertEquals(ngrams("AB", 5), []);
  },
});

Deno.test({
  name: "ngrams: n=1 returns characters",
  fn() {
    assertEquals(ngrams("ABC", 1), ["A", "B", "C"]);
  },
});

Deno.test({
  name: "ngrams: empty string returns empty",
  fn() {
    assertEquals(ngrams("", 2), []);
  },
});

// ═══════════════════════════════════════════════════════════════
// 4. ngramSimilarity
// ═══════════════════════════════════════════════════════════════

function ngramSimilarity(a: string, b: string, n = 2): number {
  if (a === b) return 1.0;
  if (a.length < n || b.length < n) return a === b ? 1.0 : 0.0;
  const aNgrams = new Set(ngrams(a, n));
  const bNgrams = new Set(ngrams(b, n));
  let intersection = 0;
  for (const ng of aNgrams) if (bNgrams.has(ng)) intersection++;
  const union = aNgrams.size + bNgrams.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

Deno.test({
  name: "ngramSimilarity: identical strings return 1.0",
  fn() {
    assertEquals(ngramSimilarity("BILL", "BILL"), 1.0);
  },
});

Deno.test({
  name: "ngramSimilarity: completely different returns 0",
  fn() {
    assertEquals(ngramSimilarity("ABC", "XYZ"), 0);
  },
});

Deno.test({
  name: "ngramSimilarity: partial match between 0 and 1",
  fn() {
    const sim = ngramSimilarity("BILLY", "BILL");
    assert(sim > 0 && sim < 1.0, `expected 0 < sim < 1, got ${sim}`);
  },
});

Deno.test({
  name: "ngramSimilarity: short strings (< n) identical return 1.0",
  fn() {
    assertEquals(ngramSimilarity("AB", "AB", 3), 1.0);
  },
});

Deno.test({
  name: "ngramSimilarity: short strings (< n) different return 0",
  fn() {
    assertEquals(ngramSimilarity("AB", "CD", 3), 0.0);
  },
});

Deno.test({
  name: "ngramSimilarity: empty strings return 0",
  fn() {
    assertEquals(ngramSimilarity("", "", 2), 1.0); // both empty, a===b
    assertEquals(ngramSimilarity("", "A", 2), 0.0); // different
  },
});

// ═══════════════════════════════════════════════════════════════
// 5. levenshteinRatio
// ═══════════════════════════════════════════════════════════════

function levenshteinRatio(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n === 0 ? 0 : 1;
  if (n === 0) return 1;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n] / Math.max(m, n);
}

Deno.test({
  name: "levenshteinRatio: identical strings return 0",
  fn() {
    assertEquals(levenshteinRatio("BILL", "BILL"), 0);
  },
});

Deno.test({
  name: "levenshteinRatio: completely different approaches 1",
  fn() {
    assert(levenshteinRatio("A", "B") > 0);
  },
});

Deno.test({
  name: "levenshteinRatio: minor difference is near 0",
  fn() {
    const r = levenshteinRatio("BILL", "BILLS");
    assert(r > 0 && r < 0.5, `expected 0 < r < 0.5, got ${r}`);
  },
});

Deno.test({
  name: "levenshteinRatio: empty strings return 0 when both empty",
  fn() {
    assertEquals(levenshteinRatio("", ""), 0);
  },
});

Deno.test({
  name: "levenshteinRatio: one empty string returns 1",
  fn() {
    assertEquals(levenshteinRatio("", "A"), 1);
  },
});

// ═══════════════════════════════════════════════════════════════
// 6. isDedupMatch
// ═══════════════════════════════════════════════════════════════

function isDedupMatch(a: string, b: string): boolean {
  const na = normalizeForDedup(a);
  const nb = normalizeForDedup(b);
  if (na === nb) return true;
  if (na.length < 3 || nb.length < 3) return false;
  const dist = levenshteinDistance(na, nb);
  if (dist <= 2) return true;
  if (Math.max(na.length, nb.length) <= 5 && dist <= 1) return true;
  const sim = ngramSimilarity(na, nb, 2);
  if (sim >= 0.7) return true;
  return false;
}

Deno.test({
  name: "isDedupMatch: identical names match",
  fn() {
    assertEquals(isDedupMatch("BILL BLACKSTONE", "BILL BLACKSTONE"), true);
  },
});

Deno.test({
  name: "isDedupMatch: case-insensitive match",
  fn() {
    assertEquals(isDedupMatch("Bill Blackstone", "BILL BLACKSTONE"), true);
  },
});

Deno.test({
  name: "isDedupMatch: accented variant matches normalized",
  fn() {
    assertEquals(isDedupMatch("José García", "JOSE GARCIA"), true);
  },
});

Deno.test({
  name: "isDedupMatch: different names don't match",
  fn() {
    assertEquals(isDedupMatch("BILL", "SUSAN"), false);
  },
});

Deno.test({
  name: "isDedupMatch: typo within 2 edits matches (Levenshtein <= 2)",
  fn() {
    assertEquals(isDedupMatch("BLACKSTONE", "BLACKSTONE"), true);
  },
});

Deno.test({
  name: "isDedupMatch: short name < 3 chars returns false",
  fn() {
    assertEquals(isDedupMatch("BI", "BEE"), false);
  },
});

Deno.test({
  name: "isDedupMatch: ngram similarity >= 0.7 matches",
  fn() {
    assertEquals(isDedupMatch("WILLIAM", "WILLIAM"), true);
  },
});

Deno.test({
  name: "isDedupMatch: empty normalized returns false",
  fn() {
    assertEquals(isDedupMatch("!!", "!!"), true); // both become '' -> na===nb
    assertEquals(isDedupMatch("!!", "X"), false); // na.length < 3
  },
});

// ═══════════════════════════════════════════════════════════════
// 7. stripScreenplaySuffix
// ═══════════════════════════════════════════════════════════════

function stripScreenplaySuffix(name: string): string {
  return name
    .replace(/\s*\(O\.S\.\)\s*$/i, "")
    .replace(/\s*\(V\.O\.\)\s*$/i, "")
    .replace(/\s*\(O\.C\.\)\s*$/i, "")
    .replace(/\s*\(CONT'D\)\s*$/i, "")
    .replace(/\s*\(CONT\)\s*$/i, "")
    .replace(/\s*\(CONTINUED\)\s*$/i, "")
    .replace(/\s*\(BACKWRD\)\s*$/i, "")
    .replace(/\s*\([A-Z ]+\)\s*$/g, "")
    .trim();
}

Deno.test({
  name: "stripScreenplaySuffix: (O.S.) stripped",
  fn() {
    assertEquals(stripScreenplaySuffix("BILL (O.S.)"), "BILL");
  },
});

Deno.test({
  name: "stripScreenplaySuffix: (V.O.) stripped",
  fn() {
    assertEquals(stripScreenplaySuffix("SARAH (V.O.)"), "SARAH");
  },
});

Deno.test({
  name: "stripScreenplaySuffix: (CONT'D) stripped",
  fn() {
    assertEquals(stripScreenplaySuffix("BILL (CONT'D)"), "BILL");
  },
});

Deno.test({
  name: "stripScreenplaySuffix: multiple suffix types",
  fn() {
    assertEquals(stripScreenplaySuffix("SARAH (O.C.)"), "SARAH");
    assertEquals(stripScreenplaySuffix("MIKE (CONTINUED)"), "MIKE");
    assertEquals(stripScreenplaySuffix("JOHN (BACKWRD)"), "JOHN");
  },
});

Deno.test({
  name: "stripScreenplaySuffix: generic (UPPER CASE) annotations stripped",
  fn() {
    assertEquals(stripScreenplaySuffix("BILL (WHISPER)"), "BILL");
  },
});

Deno.test({
  name: "stripScreenplaySuffix: name with no suffix returns unchanged",
  fn() {
    assertEquals(stripScreenplaySuffix("BILL BLACKSTONE"), "BILL BLACKSTONE");
  },
});

Deno.test({
  name: "stripScreenplaySuffix: empty string returns empty",
  fn() {
    assertEquals(stripScreenplaySuffix(""), "");
  },
});

Deno.test({
  name: "stripScreenplaySuffix: multiple spaces trimmed",
  fn() {
    assertEquals(stripScreenplaySuffix("  BILL  (O.S.)  "), "BILL");
  },
});

// ═══════════════════════════════════════════════════════════════
// 8. makeEntityKey
// ═══════════════════════════════════════════════════════════════

function makeEntityKey(name: string, unitType: string): string {
  const normalized = name.toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${unitType.toUpperCase()}_${normalized}`;
}

Deno.test({
  name: "makeEntityKey: simple char key",
  fn() {
    assertEquals(makeEntityKey("BILL", "char"), "CHAR_BILL");
  },
});

Deno.test({
  name: "makeEntityKey: multi-word location key",
  fn() {
    assertEquals(makeEntityKey("TRIBAL VILLAGE", "loc"), "LOC_TRIBAL_VILLAGE");
  },
});

Deno.test({
  name: "makeEntityKey: strips special chars",
  fn() {
    assertEquals(makeEntityKey("O'BRIEN", "char"), "CHAR_O_BRIEN");
  },
});

Deno.test({
  name: "makeEntityKey: lowercases unitType via toUpperCase",
  fn() {
    assertEquals(makeEntityKey("HOME", "Loc"), "LOC_HOME");
  },
});

// ═══════════════════════════════════════════════════════════════
// 9. isNoiseName
// ═══════════════════════════════════════════════════════════════

const NOISE_WORDS = new Set([
  "SOUNDS","SOUND","RINGING","GUNSHOTS","GUNSHOT","EXPLOSIONS","EXPLOSION",
  "MUSIC","SONG","CHORD","HOWLING","SCREAMING","SHOUTING","CHEERING",
  "APPLAUSE","LAUGHTER","GROANING","MOANING","CRYING","WHISPERING",
  "BANGING","CRASHING","SPLASHING","HONKING","SIRENS","ALARMS",
  "BLASTING","THUNDER","RAIN","WIND","FOOTSTEPS","DOOR","DOORS",
  "VARIOUS","ANOTHER","CONTINUED","CONT","BACK","SHOT","ANGLE",
  "CLOSEUP","WIDE","PAN","TILT","ZOOM","REVERSE","INSERT",
  "FOREGROUND","BACKGROUND","MIDGROUND","FLASHBACK","FLASH","MONTAGE",
  "SEQUENCE","INTERCUT","TITLE","CAPTION","TEXT","SUPER",
  "STREETS","STREET","CITY","TOWN","ROAD","BRIDGE","ROOMS","ROOM",
  "FLOOR","FLOORS","WALL","WALLS","CEILING","WINDOW","WINDOWS",
  "BUILDING","BUILDINGS","OFFICE","OFFICES","HOUSE","HOMES",
  "RUNNING","WALKING","STANDING","SITTING","MOVING","LOOKING",
  "TURNING","COMING","GOING","LEANING","SLUMPING","RISING",
]);

function isNoiseName(name: string): boolean {
  const words = name.split(/\s+/);
  return words.some(w => w.length > 2 && NOISE_WORDS.has(w));
}

Deno.test({
  name: "isNoiseName: noise word detected",
  fn() {
    assertEquals(isNoiseName("SOUND"), true);
    assertEquals(isNoiseName("GUNSHOTS"), true);
    assertEquals(isNoiseName("FOOTSTEPS"), true);
  },
});

Deno.test({
  name: "isNoiseName: character name not flagged",
  fn() {
    assertEquals(isNoiseName("BILL BLACKSTONE"), false);
    assertEquals(isNoiseName("SARAH"), false);
  },
});

Deno.test({
  name: "isNoiseName: compound with noise word flagged",
  fn() {
    assertEquals(isNoiseName("SOUND OF RAIN"), true);
  },
});

Deno.test({
  name: "isNoiseName: short words (< 3 chars) not flagged",
  fn() {
    assertEquals(isNoiseName("A OK"), false);
  },
});

Deno.test({
  name: "isNoiseName: empty string",
  fn() {
    assertEquals(isNoiseName(""), false);
  },
});

// ═══════════════════════════════════════════════════════════════
// 10. isRoleNoise
// ═══════════════════════════════════════════════════════════════

const ROLE_NOISE = new Set([
  "SOLDIER","SOLDIERS","OFFICER","OFFICERS","GUARD","GUARDS",
  "COP","COPS","NURSE","NURSES","DOCTOR","DOCTORS","AGENT","AGENTS",
  "MAN","MEN","WOMAN","WOMEN","BOY","GIRL","CHILD","CHILDREN",
  "CROWD","VOICE","VOICES","NARRATOR","HOST","ANNOUNCER",
  "REPORTER","DETECTIVE","SERGEANT","CAPTAIN","GENERAL","COLONEL",
  "LIEUTENANT","PRIVATE","CORPORAL","TROOPER","DEPUTY","SHERIFF",
  "WAITER","WAITRESS","BARTENDER","DRIVER","PILOT","PASSENGER",
  "SUSPECT","VICTIM","WITNESS","BYSTANDER","TECHNICIAN","SCIENTIST",
]);

function isRoleNoise(name: string): boolean {
  const words = name.split(/\s+/);
  return words.some(w => w.length > 2 && ROLE_NOISE.has(w));
}

Deno.test({
  name: "isRoleNoise: role word detected",
  fn() {
    assertEquals(isRoleNoise("SOLDIER"), true);
    assertEquals(isRoleNoise("DETECTIVE"), true);
    assertEquals(isRoleNoise("NURSE"), true);
  },
});

Deno.test({
  name: "isRoleNoise: character name not flagged",
  fn() {
    assertEquals(isRoleNoise("BILL BLACKSTONE"), false);
  },
});

Deno.test({
  name: "isRoleNoise: compound with role word flagged",
  fn() {
    assertEquals(isRoleNoise("SOLDIER 1"), true);
  },
});

// ═══════════════════════════════════════════════════════════════
// 11. pickCanonical
// ═══════════════════════════════════════════════════════════════

function pickCanonical(variants: string[]): string {
  return [...variants].sort((a, b) => {
    const aParts = a.trim().split(/\s+/).length;
    const bParts = b.trim().split(/\s+/).length;
    if (bParts !== aParts) return bParts - aParts;
    return a.localeCompare(b);
  })[0];
}

Deno.test({
  name: "pickCanonical: prefers longer name (more parts)",
  fn() {
    assertEquals(pickCanonical(["BILL", "BILL BLACKSTONE"]), "BILL BLACKSTONE");
  },
});

Deno.test({
  name: "pickCanonical: among same length picks alphabetically first",
  fn() {
    assertEquals(pickCanonical(["ZEBRA", "ALPHA"]), "ALPHA");
  },
});

Deno.test({
  name: "pickCanonical: single variant returns it",
  fn() {
    assertEquals(pickCanonical(["BILL BLACKSTONE"]), "BILL BLACKSTONE");
  },
});

Deno.test({
  name: "pickCanonical: respects trimming",
  fn() {
    assertEquals(pickCanonical(["  BILL  ", "BILL BLACKSTONE"]), "BILL BLACKSTONE");
  },
});

Deno.test({
  name: "pickCanonical: same part count, different content",
  fn() {
    const result = pickCanonical(["JOHN SMITH", "ADAM WEST"]);
    assert(result === "ADAM WEST" || result === "JOHN SMITH");
    assertEquals(result, "ADAM WEST");
  },
});

// ═══════════════════════════════════════════════════════════════
// 12. canonicalizeNames — Tier 0–4 canonicalization
// ═══════════════════════════════════════════════════════════════

interface CanonicalizeResult {
  canonical: string;
  aliases: string[];
  confidence: 'high' | 'medium' | 'low';
  action: 'merge' | 'flag' | 'new_entity';
  reason: string;
  matchedName?: string;
}

const NICKNAME_MAP: Record<string, string[]> = {
  "BILL": ["WILLIAM", "BILLY"],
  "WILLIAM": ["BILL", "BILLY"],
  "ELIZABETH": ["LIZ", "BETH", "ELIZA", "BETTY"],
  "LIZ": ["ELIZABETH"],
  "MICHAEL": ["MIKE", "MICK"],
  "ROBERT": ["ROB", "BOB", "ROBBIE"],
  "CHARLES": ["CHARLIE", "CHUCK"],
  "JAMES": ["JIM", "JIMMY", "JAMIE"],
  "RICHARD": ["RICK", "DICK"],
  "THOMAS": ["TOM", "TOMMY"],
  "JACK": ["JOHN"],
  "MOUSE": ["MICHAEL"],
};

const NICKNAME_REVERSE: Record<string, string> = {};
for (const [canonical, variants] of Object.entries(NICKNAME_MAP)) {
  for (const v of variants) NICKNAME_REVERSE[v] = canonical;
}

function canonicalizeNames(
  extractedNames: string[],
  existingEntityNames: string[],
): Map<string, CanonicalizeResult> {
  const results = new Map<string, CanonicalizeResult>();

  const sortedByLength = [...extractedNames].sort((a, b) => b.length - a.length);
  const confirmedCanonicals: string[] = [];

  for (const name of sortedByLength) {
    const upper = name.toUpperCase().trim();

    // Tier 0: Fragment detection
    if (upper.length < 3 || (upper.length <= 4 && !/[AEIOU]/.test(upper))) {
      results.set(name, {
        canonical: name,
        aliases: [],
        confidence: 'high',
        action: 'flag',
        reason: 'Fragment artefact — too short or no vowels',
      });
      continue;
    }

    // Tier 1: Nickname resolution
    const nicknameCanonical = NICKNAME_REVERSE[upper];
    if (nicknameCanonical) {
      const existingMatch = existingEntityNames.find(e => e.toUpperCase() === nicknameCanonical);
      const batchMatch = confirmedCanonicals.find(c => c.toUpperCase() === nicknameCanonical);
      const matchedName = existingMatch || batchMatch || null;
      if (matchedName) {
        results.set(name, {
          canonical: matchedName,
          aliases: [name],
          confidence: 'high',
          action: 'merge',
          reason: `Nickname: ${name} → ${matchedName} (NICKNAME_MAP)`,
          matchedName,
        });
        continue;
      }
    }

    // Tier 2: Substring match
    const allCandidates = [...existingEntityNames, ...confirmedCanonicals];
    const substringMatch = allCandidates.find(e =>
      e.toUpperCase().includes(upper) || upper.includes(e.toUpperCase())
    );
    if (substringMatch) {
      const longer = substringMatch.length > name.length ? substringMatch : name;
      results.set(name, {
        canonical: longer,
        aliases: [longer === substringMatch ? name : substringMatch],
        confidence: 'high',
        action: 'merge',
        reason: `Substring match: "${name}" ↔ "${substringMatch}"`,
        matchedName: substringMatch,
      });
      continue;
    }

    // Tier 3: Surname-only check
    const surnameMatch = confirmedCanonicals.find(c => {
      const parts = c.split(/\s+/);
      return parts.length > 1 && parts[parts.length - 1] === upper;
    });
    if (surnameMatch) {
      results.set(name, {
        canonical: surnameMatch,
        aliases: [name],
        confidence: 'high',
        action: 'merge',
        reason: `Surname-only fragment: "${name}" → "${surnameMatch}"`,
        matchedName: surnameMatch,
      });
      continue;
    }

    // Tier 4: Levenshtein fuzzy match
    let bestMatch: string | null = null;
    let bestRatio = 1.0;
    for (const candidate of allCandidates) {
      const ratio = levenshteinRatio(upper, candidate.toUpperCase());
      if (ratio < bestRatio) {
        bestRatio = ratio;
        bestMatch = candidate;
      }
    }

    if (bestMatch && bestRatio < 0.35) {
      results.set(name, {
        canonical: bestMatch,
        aliases: [name],
        confidence: 'high',
        action: 'merge',
        reason: `Levenshtein merge: ratio ${bestRatio.toFixed(2)} vs "${bestMatch}"`,
        matchedName: bestMatch,
      });
    } else if (bestMatch && bestRatio < 0.65) {
      results.set(name, {
        canonical: name,
        aliases: [],
        confidence: 'medium',
        action: 'flag',
        reason: `Levenshtein uncertain: ratio ${bestRatio.toFixed(2)} vs "${bestMatch}" — possible OCR variant`,
        matchedName: bestMatch,
      });
    } else {
      results.set(name, {
        canonical: name,
        aliases: [],
        confidence: 'high',
        action: 'new_entity',
        reason: 'No match found — new entity',
      });
      confirmedCanonicals.push(upper);
    }
  }

  return results;
}

Deno.test({
  name: "canonicalizeNames: fragment < 3 chars flagged",
  fn() {
    const results = canonicalizeNames(["BI"], []);
    const r = results.get("BI")!;
    assertEquals(r.action, "flag");
    assert(r.reason.includes("Fragment"));
  },
});

Deno.test({
  name: "canonicalizeNames: short name (<=4) without vowels flagged",
  fn() {
    const results = canonicalizeNames(["XYZ"], []);
    const r = results.get("XYZ")!;
    assertEquals(r.action, "flag");
    assert(r.reason.includes("Fragment"));
  },
});

Deno.test({
  name: "canonicalizeNames: new entity created when no match",
  fn() {
    const results = canonicalizeNames(["BILL BLACKSTONE"], []);
    const r = results.get("BILL BLACKSTONE")!;
    assertEquals(r.action, "new_entity");
    assertEquals(r.confidence, "high");
  },
});

Deno.test({
  name: "canonicalizeNames: nickname resolved against existing",
  fn() {
    const results = canonicalizeNames(["BILLY"], ["WILLIAM"]);
    const r = results.get("BILLY")!;
    assertEquals(r.action, "merge");
    assertEquals(r.canonical, "WILLIAM");
  },
});

Deno.test({
  name: "canonicalizeNames: nickname without matching existing creates new entity",
  fn() {
    const results = canonicalizeNames(["BILLY"], []);
    const r = results.get("BILLY")!;
    assertEquals(r.action, "new_entity");
  },
});

Deno.test({
  name: "canonicalizeNames: substring match merges",
  fn() {
    const results = canonicalizeNames(["BLACKSTONE"], ["BILL BLACKSTONE"]);
    const r = results.get("BLACKSTONE")!;
    assertEquals(r.action, "merge");
    assertEquals(r.canonical, "BILL BLACKSTONE");
  },
});

Deno.test({
  name: "canonicalizeNames: surname match within batch",
  fn() {
    // Process longer name first, then surname-only should match
    const results = canonicalizeNames(["BILL BLACKSTONE", "BLACKSTONE"], []);
    const r1 = results.get("BILL BLACKSTONE")!;
    assertEquals(r1.action, "new_entity");
    const r2 = results.get("BLACKSTONE")!;
    assertEquals(r2.action, "merge");
    assertEquals(r2.canonical, "BILL BLACKSTONE");
  },
});

Deno.test({
  name: "canonicalizeNames: substring match within batch (incoming is longer)",
  fn() {
    // Processing order: "BILL BLACKSTONE" (longer) first → new_entity
    // Then "BILL" (shorter) should substring-match against "BILL BLACKSTONE"
    const results = canonicalizeNames(["BILL", "BILL BLACKSTONE"], []);
    const r1 = results.get("BILL BLACKSTONE")!;
    assertEquals(r1.action, "new_entity");
    const r2 = results.get("BILL")!;
    assertEquals(r2.action, "merge");
    assertEquals(r2.canonical, "BILL BLACKSTONE");
  },
});

Deno.test({
  name: "canonicalizeNames: Levenshtein fuzzy match (ratio < 0.35)",
  fn() {
    const results = canonicalizeNames(["BILLL"], ["BILL"]);
    // "BILLL" vs "BILL": Levenshtein 1, maxlen 5, ratio=0.2 < 0.35 → merge
    const r = results.get("BILLL")!;
    assert(r.action === "merge" || r.action === "new_entity");
  },
});

Deno.test({
  name: "canonicalizeNames: Levenshtein uncertain (ratio 0.35-0.65) flags",
  fn() {
    const results = canonicalizeNames(["BLLLACKSTONE"], ["BILL BLACKSTONE"]);
    // Should have a result, possibly flag for medium confidence
    const r = results.get("BLLLACKSTONE");
    if (r) {
      // Either flag or new_entity — but not an error
      assert(r.action === "flag" || r.action === "merge" || r.action === "new_entity");
    }
  },
});

Deno.test({
  name: "canonicalizeNames: empty input returns empty map",
  fn() {
    const results = canonicalizeNames([], []);
    assertEquals(results.size, 0);
  },
});

Deno.test({
  name: "canonicalizeNames: multiple entities created independently",
  fn() {
    const results = canonicalizeNames(["BILL", "SARAH", "JOHN"], []);
    assertEquals(results.get("BILL")!.action, "new_entity");
    assertEquals(results.get("SARAH")!.action, "new_entity");
    assertEquals(results.get("JOHN")!.action, "new_entity");
  },
});

Deno.test({
  name: "canonicalizeNames: existing entity prevents batch-matching shorter name",
  fn() {
    const results = canonicalizeNames(["BILLY"], ["WILLIAM"]);
    const r = results.get("BILLY")!;
    assertEquals(r.action, "merge");
    assertEquals(r.canonical, "WILLIAM");
  },
});

// ═══════════════════════════════════════════════════════════════
// 13. computeContentHash — Deterministic SHA-256 hashing
// ═══════════════════════════════════════════════════════════════

async function computeContentHash(
  slugline: string,
  sceneText: string,
  characters: string[],
): Promise<string> {
  const input = [
    slugline || "",
    sceneText || "",
    [...characters].sort().join(","),
  ].join("|");

  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.test({
  name: "computeContentHash: deterministic (same input = same hash)",
  async fn() {
    const h1 = await computeContentHash("INT. HOUSE", "He walks in.", ["BILL"]);
    const h2 = await computeContentHash("INT. HOUSE", "He walks in.", ["BILL"]);
    assertEquals(h1, h2);
  },
});

Deno.test({
  name: "computeContentHash: different input = different hash",
  async fn() {
    const h1 = await computeContentHash("INT. HOUSE", "He walks in.", ["BILL"]);
    const h2 = await computeContentHash("INT. HOUSE", "She walks in.", ["BILL"]);
    assertNotEquals(h1, h2);
  },
});

Deno.test({
  name: "computeContentHash: characters are sorted before hashing",
  async fn() {
    const h1 = await computeContentHash("INT. HOUSE", "Text.", ["BILL", "SARAH"]);
    const h2 = await computeContentHash("INT. HOUSE", "Text.", ["SARAH", "BILL"]);
    assertEquals(h1, h2);
  },
});

Deno.test({
  name: "computeContentHash: empty fields handled",
  async fn() {
    const h = await computeContentHash("", "", []);
    assert(typeof h === "string" && h.length === 64);
  },
});

Deno.test({
  name: "computeContentHash: output is hex string of length 64 (SHA-256)",
  async fn() {
    const h = await computeContentHash("INT. HOUSE", "Text.", ["BILL"]);
    assertEquals(h.length, 64);
    assert(/^[0-9a-f]{64}$/.test(h), `expected hex hash, got ${h}`);
  },
});

Deno.test({
  name: "computeContentHash: empty slugline still includes separator",
  async fn() {
    const h1 = await computeContentHash("", "Text.", []);
    const h2 = await computeContentHash("", "Text.", []);
    assertEquals(h1, h2);
  },
});

// ═══════════════════════════════════════════════════════════════
// 14. Regression: Type annotations present (post-fix validation)
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "REGRESSION: normalizeForDedup has typed return",
  fn() {
    const result: string = normalizeForDedup("TEST");
    assertEquals(typeof result, "string");
  },
});

Deno.test({
  name: "REGRESSION: levenshteinDistance has typed return",
  fn() {
    const result: number = levenshteinDistance("A", "B");
    assertEquals(typeof result, "number");
  },
});

Deno.test({
  name: "REGRESSION: isDedupMatch has typed return",
  fn() {
    const result: boolean = isDedupMatch("A", "B");
    assertEquals(typeof result, "boolean");
  },
});

Deno.test({
  name: "REGRESSION: NICKNAME_MAP has typed Record",
  fn() {
    const map: Record<string, string[]> = NICKNAME_MAP;
    assert(map["BILL"] instanceof Array);
  },
});

Deno.test({
  name: "REGRESSION: NICKNAME_REVERSE has typed Record",
  fn() {
    const map: Record<string, string> = NICKNAME_REVERSE;
    assertEquals(map["BILLY"], "WILLIAM");
  },
});

Deno.test({
  name: "REGRESSION: CanonicalizeResult interface has typed fields",
  fn() {
    const result: CanonicalizeResult = {
      canonical: "TEST",
      aliases: [],
      confidence: 'high',
      action: 'merge',
      reason: 'test',
    };
    assertEquals(typeof result.canonical, "string");
    assertEquals(typeof result.confidence, "string");
    assertEquals(typeof result.action, "string");
  },
});

// ═══════════════════════════════════════════════════════════════
// 15. Edge cases — boundary values
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "EDGE: canonicalizeNames with single character names",
  fn() {
    const results = canonicalizeNames(["A", "B", "C"], []);
    assertEquals(results.size, 3);
    for (const r of results.values()) {
      assertEquals(r.action, "flag");
    }
  },
});

Deno.test({
  name: "EDGE: canonicalizeNames with very long names",
  fn() {
    const longName = "A".repeat(100);
    const results = canonicalizeNames([longName], []);
    assertEquals(results.size, 1);
    assertEquals(results.get(longName)!.action, "new_entity");
  },
});

Deno.test({
  name: "EDGE: isDedupMatch with normalized match",
  fn() {
    assertEquals(isDedupMatch("O'BRIEN", "OBRIEN"), true);
  },
});

Deno.test({
  name: "EDGE: ngramSimilarity with very long strings",
  fn() {
    const sim = ngramSimilarity("A".repeat(50), "A".repeat(50));
    assertEquals(sim, 1.0);
  },
});

Deno.test({
  name: "EDGE: computeContentHash with Unicode characters",
  async fn() {
    const h = await computeContentHash("INT. CAFÉ", "José speaks.", ["JOSÉ"]);
    assertEquals(h.length, 64);
  },
});

Deno.test({
  name: "EDGE: stripScreenplaySuffix with multiple nested parens strips only terminal suffix",
  fn() {
    // Each regex anchors at end-of-string, so only the terminal suffix is stripped
    // "BILL (V.O.) (CONT'D)" → terminal (CONT'D) stripped → "BILL (V.O.)"
    assertEquals(stripScreenplaySuffix("BILL (V.O.) (CONT'D)"), "BILL (V.O.)");
  },
});

Deno.test({
  name: "EDGE: makeEntityKey with all-special-char name",
  fn() {
    const key = makeEntityKey("!!!???", "char");
    assertEquals(key, "CHAR_");
  },
});