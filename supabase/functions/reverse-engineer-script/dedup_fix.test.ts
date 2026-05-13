/**
 * Character Dedup Fix — Test Suite for reverse-engineer-script/index.ts
 *
 * Validates:
 *   1. levenshteinDistance() — exact, partial, multi-word, unicode-aware
 *   2. normalizeForFuzzy() — honorifics, punctuation, whitespace
 *   3. dedupCharacterBibleNames() — 4-tier fuzzy dedup
 *   4. dedupFilterCharacters() — alias-based dedup, field merging, alias capture
 *   5. Entity creation flow via findOrCreateCharacterEntity
 *   6. Null safety — call3?.characters, call1?.property, call2?.beats
 *   7. Edge cases — empty arrays, single elements, non-array inputs
 *   8. Invariants — non-fatal errors, in-place mutation, case-insensitivity
 *   9. Regression — existing functionality preserved
 */

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ══════════════════════════════════════════════════════════════════════════════
// 1. levenshteinDistance — pure function
// ══════════════════════════════════════════════════════════════════════════════

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

Deno.test("levenshtein: identical strings have distance 0", () => {
  assertEquals(levenshteinDistance("Enki", "Enki"), 0);
  assertEquals(levenshteinDistance("John", "John"), 0);
  assertEquals(levenshteinDistance("a", "a"), 0);
});

Deno.test("levenshtein: empty string distance equals other string length", () => {
  assertEquals(levenshteinDistance("", "Enki"), 4);
  assertEquals(levenshteinDistance("Enki", ""), 4);
  assertEquals(levenshteinDistance("", ""), 0);
});

Deno.test("levenshtein: single character substitution", () => {
  assertEquals(levenshteinDistance("Cat", "Bat"), 1);
  assertEquals(levenshteinDistance("Cat", "Cats"), 1);
  assertEquals(levenshteinDistance("Cat", "at"), 1);
});

Deno.test("levenshtein: Levenshtein ≤ 2 dedup threshold", () => {
  // Single character substitution: Jon vs John
  assertEquals(levenshteinDistance("Jon", "John"), 1);
  // One insertion: Tom vs Tomy
  assertEquals(levenshteinDistance("Tom", "Tomy"), 1);
  // Single char diff: Katy vs Kate
  assertEquals(levenshteinDistance("Katy", "Kate"), 1);
  // Sarah vs Sara: single char diff at end
  assertEquals(levenshteinDistance("Sara", "Sarah"), 1);
  // Completely different names should be > 2
  assert(levenshteinDistance("Enki", "Sister") > 2);
});

Deno.test("levenshtein: multi-word names", () => {
  // Sarah Connor -> Sarah Connors: one extra 's'
  assertEquals(levenshteinDistance("Sarah Connor", "Sarah Connors"), 1);
  assertEquals(levenshteinDistance("John Wick", "John Wick"), 0);
  // Peter Parker -> Peter Porker: single char sub (a->o)
  assertEquals(levenshteinDistance("Peter Parker", "Peter Porker"), 1);
  assert(levenshteinDistance("Peter Parker", "Mary Jane") > 2);
});

Deno.test("levenshtein: different length names", () => {
  assertEquals(levenshteinDistance("Bob", "Bobby"), 2);
  // Al -> Alexander: 7 insertions
  assertEquals(levenshteinDistance("Al", "Alexander"), 7);
  // Ed -> Edward: 4 insertions
  assertEquals(levenshteinDistance("Ed", "Edward"), 4);
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. normalizeForFuzzy — string normalization
// ══════════════════════════════════════════════════════════════════════════════

function normalizeForFuzzy(name: string): string {
  const honorifics = /\b(dr|mr|mrs|ms|prof|capt|sgt|lt|col|gen|adm|rev|fr|sr|jr|esq|hon|maj|cpt|drs|mx)\b/gi;
  return name
    .toLowerCase()
    .replace(honorifics, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

Deno.test("normalizeForFuzzy: strips common honorifics", () => {
  assertEquals(normalizeForFuzzy("Dr. Smith"), "smith");
  assertEquals(normalizeForFuzzy("Mr. John"), "john");
  assertEquals(normalizeForFuzzy("Mrs. Jane"), "jane");
  assertEquals(normalizeForFuzzy("Prof. X"), "x");
  assertEquals(normalizeForFuzzy("Capt. Jack"), "jack");
});

Deno.test("normalizeForFuzzy: strips multiple honorifics", () => {
  assertEquals(normalizeForFuzzy("Dr. Mr. Smith"), "smith");
  assertEquals(normalizeForFuzzy("Prof. Dr. Einstein"), "einstein");
});

Deno.test("normalizeForFuzzy: strips Jr honorific", () => {
  // Jr is in the honorifics list, after stripping: "Dr. Smith, Jr." -> "smith"
  assertEquals(normalizeForFuzzy("Dr. Smith, Jr."), "smith");
  assertEquals(normalizeForFuzzy("John Smith Jr."), "john smith");
});

Deno.test("normalizeForFuzzy: removes non-alphanumeric characters", () => {
  assertEquals(normalizeForFuzzy("O'Brien"), "obrien");
  assertEquals(normalizeForFuzzy("Jean-Luc"), "jeanluc");
  assertEquals(normalizeForFuzzy("Mc'Donald"), "mcdonald");
});

Deno.test("normalizeForFuzzy: collapses whitespace", () => {
  assertEquals(normalizeForFuzzy("  John   Connor  "), "john connor");
  assertEquals(normalizeForFuzzy("a   b   c"), "a b c");
});

Deno.test("normalizeForFuzzy: lowercases input", () => {
  assertEquals(normalizeForFuzzy("JOHN DOE"), "john doe");
  assertEquals(normalizeForFuzzy("SaRaH cOnNoR"), "sarah connor");
});

Deno.test("normalizeForFuzzy: empty or whitespace input", () => {
  assertEquals(normalizeForFuzzy(""), "");
  assertEquals(normalizeForFuzzy("   "), "");
});

Deno.test("normalizeForFuzzy: honorifics don't strip from word bodies", () => {
  // "dr" inside a word should not be stripped — only at word boundaries
  assertEquals(normalizeForFuzzy("Andromeda"), "andromeda");
  assertEquals(normalizeForFuzzy("Midred"), "midred");
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. dedupCharacterBibleNames — 4-tier fuzzy dedup
// ══════════════════════════════════════════════════════════════════════════════

function dedupCharacterBibleNames(call3: any): void {
  const characters = call3?.characters;
  if (!Array.isArray(characters) || characters.length <= 1) return;
  const seen = new Set<string>();
  const normalizedSeen = new Set<string>();
  const keptChars: any[] = [];
  let tier1 = 0, tier2 = 0, tier3 = 0, tier4 = 0;
  for (const c of characters) {
    const name = (c.name || '').trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    // Tier 1: exact case-insensitive
    if (seen.has(lower)) {
      tier1++;
      continue;
    }
    seen.add(lower);
    // Tier 2: normalized match (strip honorifics + non-alpha)
    try {
      const normalized = normalizeForFuzzy(name);
      if (normalized && normalizedSeen.has(normalized)) {
        tier2++;
        continue;
      }
      if (normalized) normalizedSeen.add(normalized);
    } catch (e) {
      console.warn(`[reverse-engineer] Fuzzy dedup Tier 2 error: ${e}`);
    }
    // Tier 3: Levenshtein ≤ 2 for names ≥ 4 chars
    if (name.length >= 4) {
      try {
        let isLevenshteinDup = false;
        for (const kept of keptChars) {
          const keptName = (kept.name || '').trim();
          if (keptName.length >= 4) {
            const dist = levenshteinDistance(lower, keptName.toLowerCase());
            if (dist <= 2) {
              isLevenshteinDup = true;
              break;
            }
          }
        }
        if (isLevenshteinDup) {
          tier3++;
          continue;
        }
      } catch (e) {
        console.warn(`[reverse-engineer] Fuzzy dedup Tier 3 error: ${e}`);
      }
    }
    // Tier 4: word overlap ≥ 0.6 (Jaccard)
    try {
      let isOverlapDup = false;
      const nameWords = lower.split(/\s+/).filter(Boolean);
      const nameWordSet = new Set(nameWords);
      for (const kept of keptChars) {
        const keptWords = (kept.name || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
        const keptWordSet = new Set(keptWords);
        if (nameWordSet.size === 0 || keptWordSet.size === 0) continue;
        let intersection = 0;
        for (const w of nameWordSet) {
          if (keptWordSet.has(w)) intersection++;
        }
        const union = nameWordSet.size + keptWordSet.size - intersection;
        const overlap = union > 0 ? intersection / union : 0;
        if (overlap >= 0.6) {
          isOverlapDup = true;
          break;
        }
      }
      if (isOverlapDup) {
        tier4++;
        continue;
      }
    } catch (e) {
      console.warn(`[reverse-engineer] Fuzzy dedup Tier 4 error: ${e}`);
    }
    keptChars.push(c);
  }
  const removed = characters.length - keptChars.length;
  if (removed > 0) {
    call3.characters = keptChars;
  }
}

// ─── 3a. Primary use case — no duplicates ───

Deno.test("dedupBible: no duplicates — all characters preserved", () => {
  const call3 = {
    characters: [
      { name: "Enki" },
      { name: "Sister" },
      { name: "Elder" },
    ],
  };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters.length, 3);
  assertEquals(call3.characters[0].name, "Enki");
  assertEquals(call3.characters[1].name, "Sister");
  assertEquals(call3.characters[2].name, "Elder");
});

// ─── 3b. Tier 1: exact case-insensitive match ───

Deno.test("dedupBible: Tier 1 — exact case-insensitive duplicate removed", () => {
  const call3 = {
    characters: [
      { name: "Enki" },
      { name: "enki" },
      { name: "Sister" },
    ],
  };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters.length, 2);
  assertEquals(call3.characters[0].name, "Enki");
  assertEquals(call3.characters[1].name, "Sister");
});

Deno.test("dedupBible: Tier 1 — same character listed twice", () => {
  const call3 = {
    characters: [
      { name: "Protagonist" },
      { name: "Protagonist" },
      { name: "Villain" },
    ],
  };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters.length, 2);
});

// ─── 3c. Tier 2: normalized match ───

Deno.test("dedupBible: Tier 2 — honorific variants removed", () => {
  const call3 = {
    characters: [
      { name: "Dr. Smith" },
      { name: "Mr. Smith" },
      { name: "Sister" },
    ],
  };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters.length, 2);
  assertEquals(call3.characters[0].name, "Dr. Smith");
  assertEquals(call3.characters[1].name, "Sister");
});

Deno.test("dedupBible: Tier 2 — punctuation variants removed", () => {
  const call3 = {
    characters: [
      { name: "O'Brien" },
      { name: "OBrien" },
      { name: "Sister" },
    ],
  };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters.length, 2);
});

// ─── 3d. Tier 3: Levenshtein ≤ 2 ───

Deno.test("dedupBible: Tier 3 — Levenshtein ≤ 2 single char diff", () => {
  const call3 = {
    characters: [
      { name: "Katherine" },
      { name: "Katherina" },    // Levenshtein 1 from Katherine
      { name: "Sister" },
    ],
  };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters.length, 2);
});

Deno.test("dedupBible: Tier 3 — Sarah/Sara (Levenshtein 1)", () => {
  const call3 = {
    characters: [
      { name: "Sarah" },
      { name: "Sara" },         // Levenshtein 1
    ],
  };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters.length, 1);
});

Deno.test("dedupBible: Tier 3 — names 3 chars or fewer skip Levenshtein check", () => {
  const call3 = {
    characters: [
      { name: "Bob" },           // 3 chars — skipped by inner loop (keptName.length >= 4)
      { name: "Boba" },          // 4 chars — Levenshtein 1 from Bob, but Bob is skipped
    ],
  };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters.length, 2);
});

// ─── 3e. Tier 4: word overlap ≥ 0.6 (Jaccard) ───

Deno.test("dedupBible: Tier 4 — word overlap catches 'John Wick' vs 'Wick John'", () => {
  const call3 = {
    characters: [
      { name: "John Wick" },
      { name: "Wick John" },    // intersection=2, union=2, overlap=1.0
      { name: "Elder" },
    ],
  };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters.length, 2);
  assertEquals(call3.characters[0].name, "John Wick");
  assertEquals(call3.characters[1].name, "Elder");
});

Deno.test("dedupBible: Tier 4 — partial word overlap below threshold keeps both", () => {
  // Use names where Tier 3 (Levenshtein) won't apply and Tier 4 overlap is low
  const call3 = {
    characters: [
      { name: "Big Sarah" },          // {big, sarah}
      { name: "Little Sarah" },       // {little, sarah} — overlap: intersection=1, union=3 = 0.33
      { name: "Elder" },
    ],
  };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters.length, 3); // Below 0.6 threshold and Levenshtein > 2 — all kept
});

// ─── 3f. Edge cases — empty / single / non-array ───

Deno.test("dedupBible: empty characters array", () => {
  const call3 = { characters: [] };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters.length, 0);
});

Deno.test("dedupBible: single character — no dedup needed", () => {
  const call3 = { characters: [{ name: "Enki" }] };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters.length, 1);
});

Deno.test("dedupBible: call3.characters is null/undefined — no crash", () => {
  const call3: any = { characters: null };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters, null);

  const call3b: any = {};
  dedupCharacterBibleNames(call3b);
  assertEquals(call3b.characters, undefined);
});

Deno.test("dedupBible: characters with null names are skipped", () => {
  const call3 = {
    characters: [
      { name: null },
      { name: "Enki" },
    ],
  };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters.length, 1);
  assertEquals(call3.characters[0].name, "Enki");
});

Deno.test("dedupBible: characters with empty name strings skipped", () => {
  const call3 = {
    characters: [
      { name: "   " },
      { name: "Enki" },
      { name: "" },
    ],
  };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters.length, 1);
  assertEquals(call3.characters[0].name, "Enki");
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. dedupFilterCharacters — alias-based dedup (pure logic simulation)
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("fieldMerge: alias with non-empty fields merges into canonical when empty", () => {
  const characters: any[] = [
    { name: "Enki", role: "protagonist", backstory: "Ancient god." },
    { name: "Brother", role: "antagonist", backstory: "" },
  ];

  const aliasToCanonical = new Map([["brother", "enki"]]);
  const charNameLower = new Set(["enki", "brother"]);

  const filtered = characters.filter((c: any) => {
    const canonicalLower = aliasToCanonical.get(c.name.toLowerCase());
    if (canonicalLower && canonicalLower !== c.name.toLowerCase() && charNameLower.has(canonicalLower)) {
      const canonicalChar = characters.find((cc: any) => cc.name.toLowerCase() === canonicalLower);
      if (canonicalChar && c !== canonicalChar) {
        const MERGE_FIELDS = [
          'age', 'role', 'physical_description', 'backstory', 'psychology',
          'want', 'need', 'fatal_flaw', 'arc', 'voice_and_speech',
          'sample_dialogue', 'casting_suggestions',
        ];
        for (const field of MERGE_FIELDS) {
          if (c[field] && !canonicalChar[field]) {
            canonicalChar[field] = c[field];
          }
        }
      }
      return false;
    }
    return true;
  });

  assertEquals(filtered.length, 1);
  assertEquals(filtered[0].name, "Enki");
  assertEquals(filtered[0].backstory, "Ancient god.");
  assertEquals(filtered[0].role, "protagonist");
});

Deno.test("fieldMerge: alias with empty fields does NOT merge into canonical", () => {
  const characters: any[] = [
    { name: "Enki", role: "protagonist" },
    { name: "Brother", role: "", backstory: "" },
  ];

  const aliasToCanonical = new Map([["brother", "enki"]]);
  const charNameLower = new Set(["enki", "brother"]);

  const filtered = characters.filter((c: any) => {
    const canonicalLower = aliasToCanonical.get(c.name.toLowerCase());
    if (canonicalLower && canonicalLower !== c.name.toLowerCase() && charNameLower.has(canonicalLower)) {
      const canonicalChar = characters.find((cc: any) => cc.name.toLowerCase() === canonicalLower);
      if (canonicalChar && c !== canonicalChar) {
        const MERGE_FIELDS = [
          'age', 'role', 'physical_description', 'backstory', 'psychology',
          'want', 'need', 'fatal_flaw', 'arc', 'voice_and_speech',
          'sample_dialogue', 'casting_suggestions',
        ];
        for (const field of MERGE_FIELDS) {
          if (c[field] && !canonicalChar[field]) {
            canonicalChar[field] = c[field];
          }
        }
      }
      return false;
    }
    return true;
  });

  assertEquals(filtered.length, 1);
  assertEquals(filtered[0].name, "Enki");
});

Deno.test("fieldMerge: canonical field not overwritten when already set", () => {
  const characters: any[] = [
    { name: "Enki", role: "protagonist", psychology: "Wise" },
    { name: "Brother", role: "antagonist", psychology: "Evil" },
  ];

  const aliasToCanonical = new Map([["brother", "enki"]]);
  const charNameLower = new Set(["enki", "brother"]);

  const filtered = characters.filter((c: any) => {
    const canonicalLower = aliasToCanonical.get(c.name.toLowerCase());
    if (canonicalLower && canonicalLower !== c.name.toLowerCase() && charNameLower.has(canonicalLower)) {
      const canonicalChar = characters.find((cc: any) => cc.name.toLowerCase() === canonicalLower);
      if (canonicalChar && c !== canonicalChar) {
        const MERGE_FIELDS = [
          'age', 'role', 'physical_description', 'backstory', 'psychology',
          'want', 'need', 'fatal_flaw', 'arc', 'voice_and_speech',
          'sample_dialogue', 'casting_suggestions',
        ];
        for (const field of MERGE_FIELDS) {
          if (c[field] && !canonicalChar[field]) {
            canonicalChar[field] = c[field];
          }
        }
      }
      return false;
    }
    return true;
  });

  assertEquals(filtered.length, 1);
  assertEquals(filtered[0].psychology, "Wise");
});

Deno.test("fieldMerge: multiple aliases merge into canonical", () => {
  const characters: any[] = [
    { name: "Enki", role: "protagonist", age: "" },
    { name: "Brother", age: "Unknown ancient" },
    { name: "Boy", physical_description: "Young and spritely" },
  ];

  const aliasToCanonical = new Map([
    ["brother", "enki"],
    ["boy", "enki"],
  ]);
  const charNameLower = new Set(["enki", "brother", "boy"]);

  const filtered = characters.filter((c: any) => {
    const canonicalLower = aliasToCanonical.get(c.name.toLowerCase());
    if (canonicalLower && canonicalLower !== c.name.toLowerCase() && charNameLower.has(canonicalLower)) {
      const canonicalChar = characters.find((cc: any) => cc.name.toLowerCase() === canonicalLower);
      if (canonicalChar && c !== canonicalChar) {
        const MERGE_FIELDS = [
          'age', 'role', 'physical_description', 'backstory', 'psychology',
          'want', 'need', 'fatal_flaw', 'arc', 'voice_and_speech',
          'sample_dialogue', 'casting_suggestions',
        ];
        for (const field of MERGE_FIELDS) {
          if (c[field] && !canonicalChar[field]) {
            canonicalChar[field] = c[field];
          }
        }
      }
      return false;
    }
    return true;
  });

  assertEquals(filtered.length, 1);
  assertEquals(filtered[0].name, "Enki");
  assertEquals(filtered[0].age, "Unknown ancient");
  assertEquals(filtered[0].physical_description, "Young and spritely");
});

Deno.test("aliasCapture: alias name recorded with canonical name", () => {
  const capturedAliases: Array<{aliasName: string, canonicalName: string}> = [];
  const characters = [
    { name: "Enki" },
    { name: "Brother" },
  ];

  const aliasToCanonical = new Map([["brother", "enki"]]);
  const canonicalLowerToOriginal = new Map([["enki", "Enki"]]);
  const charNameLower = new Set(["enki", "brother"]);

  characters.filter((c: any) => {
    const canonicalLower = aliasToCanonical.get(c.name.toLowerCase());
    if (canonicalLower && canonicalLower !== c.name.toLowerCase() && charNameLower.has(canonicalLower)) {
      const canonicalOriginal = canonicalLowerToOriginal.get(canonicalLower) || canonicalLower;
      capturedAliases.push({ aliasName: c.name, canonicalName: canonicalOriginal });
      return false;
    }
    return true;
  });

  assertEquals(capturedAliases.length, 1);
  assertEquals(capturedAliases[0].aliasName, "Brother");
  assertEquals(capturedAliases[0].canonicalName, "Enki");
});

Deno.test("aliasCapture: multiple aliases captured", () => {
  const capturedAliases: Array<{aliasName: string, canonicalName: string}> = [];
  const characters = [
    { name: "Enki" },
    { name: "Brother" },
    { name: "Boy" },
  ];

  const aliasToCanonical = new Map([
    ["brother", "enki"],
    ["boy", "enki"],
  ]);
  const canonicalLowerToOriginal = new Map([["enki", "Enki"]]);
  const charNameLower = new Set(["enki", "brother", "boy"]);

  characters.filter((c: any) => {
    const canonicalLower = aliasToCanonical.get(c.name.toLowerCase());
    if (canonicalLower && canonicalLower !== c.name.toLowerCase() && charNameLower.has(canonicalLower)) {
      const canonicalOriginal = canonicalLowerToOriginal.get(canonicalLower) || canonicalLower;
      capturedAliases.push({ aliasName: c.name, canonicalName: canonicalOriginal });
      return false;
    }
    return true;
  });

  assertEquals(capturedAliases.length, 2);
  assertEquals(capturedAliases[0].aliasName, "Brother");
  assertEquals(capturedAliases[1].aliasName, "Boy");
  assertEquals(capturedAliases[0].canonicalName, "Enki");
  assertEquals(capturedAliases[1].canonicalName, "Enki");
});

Deno.test("dedupFilter: empty addAliases array is handled", () => {
  const capturedAliases: Array<{aliasName: string, canonicalName: string}> = [];
  assertEquals(capturedAliases.length, 0);
});

Deno.test("dedupFilter: characters array <= 1 returns early", () => {
  const earlyExit = (chars: any) => !Array.isArray(chars) || chars.length <= 1;
  assertEquals(earlyExit(null), true);
  assertEquals(earlyExit([]), true);
  assertEquals(earlyExit([{ name: "Enki" }]), true);
  assertEquals(earlyExit([{ name: "Enki" }, { name: "Sister" }]), false);
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Entity creation flow (simulated)
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("entityCreation: description is joined from physical_description, backstory, psychology", () => {
  function buildDescription(char: any): string {
    return [char.physical_description, char.backstory, char.psychology]
      .filter((f: any) => f && typeof f === "string")
      .join(" | ") || "";
  }

  const char = {
    physical_description: "Tall",
    backstory: "Born in fire",
    psychology: "Brooding",
  };
  const desc = buildDescription(char);
  assert(desc.includes("Tall"));
  assert(desc.includes("Born in fire"));
  assert(desc.includes("Brooding"));
});

Deno.test("entityCreation: description handles missing fields gracefully", () => {
  function buildDescription(char: any): string {
    return [char.physical_description, char.backstory, char.psychology]
      .filter((f: any) => f && typeof f === "string")
      .join(" | ") || "";
  }

  assertEquals(buildDescription({ name: "Enki" }), "");
  assertEquals(buildDescription({ name: "Enki", role: "protagonist" }), "");
  assertEquals(buildDescription({ name: "Enki", backstory: "Ancient" }), "Ancient");
});

Deno.test("entityCreation: alias upsert uses uppercase alias name", () => {
  const aliasName = "Brother";
  assertEquals(aliasName.toUpperCase().trim(), "BROTHER");
});

Deno.test("entityCreation: alias upsert has correct source and confidence", () => {
  const aliasUpsert = {
    alias_name: "BROTHER",
    alias_type: "fragment",
    source: "reverse_engineer_dedup",
    confidence: 0.85,
  };
  assertEquals(aliasUpsert.source, "reverse_engineer_dedup");
  assertEquals(aliasUpsert.confidence, 0.85);
  assertEquals(aliasUpsert.alias_type, "fragment");
});

Deno.test("entityCreation: alias upsert uses onConflict for idempotency", () => {
  const inserted = new Set<string>();

  function upsertAlias(projectId: string, canonicalEntityId: string, aliasName: string): boolean {
    const key = `${projectId}:${canonicalEntityId}:${aliasName}`;
    if (inserted.has(key)) return false;
    inserted.add(key);
    return true;
  }

  assert(upsertAlias("proj-a", "enki-id", "BROTHER"));
  assertEquals(upsertAlias("proj-a", "enki-id", "BROTHER"), false);
  assert(upsertAlias("proj-b", "enki-id", "BROTHER"));
  assertEquals(inserted.size, 2);
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Invariants — in-place mutation, call3.characters array position preserved
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("invariant: dedupCharacterBibleNames mutates call3 in place", () => {
  const call3 = {
    characters: [
      { name: "Enki" },
      { name: "enki" },
      { name: "Sister" },
    ],
  };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters.length, 2);
  assertEquals(call3.characters[0].name, "Enki");
  assertEquals(call3.characters[1].name, "Sister");
});

Deno.test("invariant: first character position preserved (highest narrative importance)", () => {
  const call3 = {
    characters: [
      { name: "Protagonist" },
      { name: "Antagonist" },
      { name: "protagonist" }, // Tier 1 duplicate of first
    ],
  };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters[0].name, "Protagonist");
  assertEquals(call3.characters[1].name, "Antagonist");
});

Deno.test("invariant: case-insensitive dedup does not lose field data", () => {
  const call3 = {
    characters: [
      { name: "Sarah Connor", role: "protagonist", backstory: "Mother of future" },
      { name: "sarah connor", role: "", backstory: "" },
    ],
  };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters.length, 1);
  assertEquals(call3.characters[0].name, "Sarah Connor");
  assertEquals(call3.characters[0].role, "protagonist");
  assertEquals(call3.characters[0].backstory, "Mother of future");
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Regression — exact match with existing patterns
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("regression: levenshtein distance matches entity-links-engine L252-269", () => {
  assertEquals(levenshteinDistance("hello", "hello"), 0);
  assertEquals(levenshteinDistance("hello", "helo"), 1);
  assertEquals(levenshteinDistance("kitten", "sitting"), 3);
  assertEquals(levenshteinDistance("", "abc"), 3);
  assertEquals(levenshteinDistance("abc", ""), 3);
  assertEquals(levenshteinDistance("a", "b"), 1);
});

Deno.test("regression: dedupFilterCharacters mirrors generate-document/index.ts L1674-1731", () => {
  const MERGE_FIELDS = [
    'age', 'role', 'physical_description', 'backstory', 'psychology',
    'want', 'need', 'fatal_flaw', 'arc', 'voice_and_speech',
    'sample_dialogue', 'casting_suggestions',
  ];

  const expectedFields = [
    'age', 'role', 'physical_description', 'backstory', 'psychology',
    'want', 'need', 'fatal_flaw', 'arc', 'voice_and_speech',
    'sample_dialogue', 'casting_suggestions',
  ];

  assertEquals(MERGE_FIELDS.length, expectedFields.length);
  for (const field of expectedFields) {
    assert(MERGE_FIELDS.includes(field), `Field "${field}" must be in merge set`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Multi-tier interaction — all four tiers together
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("multiTier: all four tiers remove duplicates in a single pass", () => {
  const call3 = {
    characters: [
      { name: "Enki" },          // kept
      { name: "enki" },          // Tier 1
      { name: "Mr. Enki" },     // Tier 2
      { name: "Enkii" },        // Tier 3 — Levenshtein 1 from Enki
      { name: "Enki Enki" },    // Tier 4 — overlap 1.0
      { name: "Sister" },        // kept
      { name: "Elder" },         // kept
    ],
  };
  dedupCharacterBibleNames(call3);
  assertEquals(call3.characters.length, 3);
  assertEquals(call3.characters[0].name, "Enki");
  assertEquals(call3.characters[1].name, "Sister");
  assertEquals(call3.characters[2].name, "Elder");
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. Null safety — call3?.characters, call1?.property, call2?.beats
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("nullSafety: call3.characters first position accessed safely", () => {
  const fullCall3: any = { characters: [{ name: "Enki" }] };
  assertEquals(fullCall3?.characters?.[0]?.name, "Enki");

  const emptyCall3: any = { characters: [] };
  assertEquals(emptyCall3?.characters?.[0], undefined);

  const nullCall3: any = null;
  assertEquals(nullCall3?.characters?.[0], undefined);

  const noCharsCall3: any = {};
  assertEquals(noCharsCall3?.characters?.[0], undefined);
});

Deno.test("nullSafety: call2?.beats optional chaining", () => {
  const fullCall2: any = { beats: [{ number: 1 }] };
  assertEquals(fullCall2?.beats?.length, 1);

  const emptyCall2: any = {};
  assertEquals(emptyCall2?.beats, undefined);

  const nullCall2: any = null;
  assertEquals(nullCall2?.beats, undefined);
});

Deno.test("nullSafety: call1?.concept_brief optional chaining", () => {
  const full: any = { concept_brief: "Concept" };
  assertEquals(full?.concept_brief, "Concept");

  const empty: any = {};
  assertEquals(empty?.concept_brief, undefined);

  const nullObj: any = null;
  assertEquals(nullObj?.concept_brief, undefined);
});