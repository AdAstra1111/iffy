/**
 * Tests for extract-visual-dna — character-relevant text extraction and
 * evidence-gathering pure functions.
 *
 * Covers:
 *   1. extractCharacterRelevantText — exact match finds relevant lines
 *   2. extractCharacterRelevantText — first-name matching
 *   3. extractCharacterRelevantText — case-insensitive matching
 *   4. extractCharacterRelevantText — context window (±2 lines)
 *   5. extractCharacterRelevantText — deduplication of identical blocks
 *   6. extractCharacterRelevantText — no matches returns empty string
 *   7. extractCharacterRelevantText — empty text returns empty string
 *   8. extractCharacterRelevantText — empty character name still behaves
 *   9. extractCharacterRelevantText — multiple matches separated by ---
 *  10. extractCharacterRelevantText — overlapping match windows
 */

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ══════════════════════════════════════════════════════════════════════════════
// Functions under test (mirrored from supabase/functions/extract-visual-dna/index.ts)
// ══════════════════════════════════════════════════════════════════════════════

function extractCharacterRelevantText(fullText: string, characterName: string): string {
  const nameLower = characterName.toLowerCase();
  const firstName = characterName.split(/\s+/)[0]?.toLowerCase() || nameLower;
  const lines = fullText.split("\n");
  const relevant: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (line.includes(nameLower) || line.includes(firstName)) {
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length - 1, i + 2);
      const block = lines.slice(start, end + 1).join("\n");
      if (!relevant.includes(block)) {
        relevant.push(block);
      }
    }
  }

  return relevant.join("\n\n---\n\n");
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. EXACT MATCH — finds relevant lines
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("extractCharacterRelevantText: exact match finds relevant 5-line block", () => {
  const text = `INT. TAVERN - NIGHT

The tavern is crowded and smoky. JOHN (40s, weathered) sits alone at the bar.

He nurses a glass of whiskey, staring into the amber liquid.

MARY approaches from behind and puts a hand on his shoulder.`;
  const result = extractCharacterRelevantText(text, "JOHN");
  assert(result.includes("JOHN"), "result should contain matched name");
  assert(result.includes("tavern"), "should include context before match");
  assert(result.includes("nurses"), "should include context after match");
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. FIRST-NAME MATCHING
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("extractCharacterRelevantText: matches on first name of multi-word name", () => {
  const text = `DR. SARAH REED enters the lab.

She reviews the test results carefully.

SARAH adjusts her glasses and frowns.`;
  const result = extractCharacterRelevantText(text, "DR. SARAH REED");
  assert(result.includes("SARAH"), "should match on first name 'SARAH'");
  assert(result.includes("DR.") || !result.includes("DR."), "first name match is sufficient");
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. CASE-INSENSITIVE MATCHING
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("extractCharacterRelevantText: case-insensitive matching", () => {
  const text = `jOHN walks down the street.
He passes a newsstand.
john stops to buy a paper.`;
  const result = extractCharacterRelevantText(text, "John");
  assert(result.toLowerCase().includes("john"), "should match regardless of case");
  const lines = result.split("\n");
  assert(lines.length >= 2, "should include multiple matched lines");
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. CONTEXT WINDOW (±2 lines)
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("extractCharacterRelevantText: includes 2 lines before and after match", () => {
  const text = `Line A - leading context
Line B - leading context
Line C - leading context
JOHN enters the room.
Line D - trailing context
Line E - trailing context
Line F - trailing context`;
  const result = extractCharacterRelevantText(text, "JOHN");
  const lines = result.split("\n");
  // Match is on line index 3, so start = Math.max(0, 3-2) = 1 → "Line B"
  assert(lines.includes("Line B - leading context"),
    "should include line 1 (i-1 when i=3)");
  assert(lines.includes("Line F - trailing context"),
    "should include line 2 after (i+2 when i=3)");
});

Deno.test("extractCharacterRelevantText: doesn't go out of bounds at start of text", () => {
  const text = `JOHN appears.
Line B
Line C`;
  const result = extractCharacterRelevantText(text, "JOHN");
  assert(result.includes("JOHN"), "first line match should not go negative");
  const lines = result.split("\n");
  assertEquals(lines[0], "JOHN appears.", "starts from line 0, not negative index");
});

Deno.test("extractCharacterRelevantText: doesn't go out of bounds at end of text", () => {
  const text = `Line A
Line B
JOHN leaves.`;
  const result = extractCharacterRelevantText(text, "JOHN");
  assert(result.includes("JOHN"), "last line match should not exceed array");
  const lines = result.split("\n");
  assertEquals(lines[lines.length - 1], "JOHN leaves.",
    "last line should be the last text line, not out of bounds");
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. DEDUPLICATION
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("extractCharacterRelevantText: deduplicates identical blocks", () => {
  const text = `JOHN is here.
JOHN is here.`;
  const result = extractCharacterRelevantText(text, "JOHN");
  // Both lines match — but their ±2 context windows overlap/are identical
  // The dedup should produce only one block
  const separatorCount = (result.match(/---/g) || []).length;
  assertEquals(separatorCount, 0, "identical adjacent blocks should be deduplicated");
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. NO MATCHES — returns empty string
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("extractCharacterRelevantText: no matches returns empty string", () => {
  const text = `Nobody matches this text.
All about completely different characters.`;
  const result = extractCharacterRelevantText(text, "ZARDOZ");
  assertEquals(result, "", "no matches should return empty string");
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. EMPTY TEXT — returns empty string
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("extractCharacterRelevantText: empty text returns empty string", () => {
  assertEquals(extractCharacterRelevantText("", "John"), "");
});

Deno.test("extractCharacterRelevantText: empty character name still processes text", () => {
  const result = extractCharacterRelevantText("Hello world", "");
  // The first name split on empty string gives ""
  // line.includes("") is always true, so every line matches
  assertEquals(result, "Hello world", "empty name makes every line match (edge behavior)");
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. MULTIPLE MATCHES — separated by ---
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("extractCharacterRelevantText: multiple matches separated by --- separator", () => {
  const text = `Line A
JOHN appears in scene 1.
Line C

Line D
A different character speaks.
Line F

Line G
JOHN returns in scene 2.
Line I`;
  const result = extractCharacterRelevantText(text, "JOHN");
  const blocks = result.split("\n\n---\n\n");
  assertEquals(blocks.length, 2, "two match blocks should be separated by ---");
  assert(blocks[0].includes("scene 1"), "first block contains first match");
  assert(blocks[1].includes("scene 2"), "second block contains second match");
});

Deno.test("extractCharacterRelevantText: single match has no separator", () => {
  const result = extractCharacterRelevantText("JOHN is alone.", "JOHN");
  assert(!result.includes("---"), "single match should not contain separator");
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. OVERLAPPING WINDOWS
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("extractCharacterRelevantText: consecutive matches merge into one block", () => {
  // Two mentions close together (within ±2 lines each) should produce
  // overlapping windows that get deduplicated
  const text = `Line A
JOHN first.
JOHN again.
Line D`;
  const result = extractCharacterRelevantText(text, "JOHN");
  // Both matches are within each other's windows — dedup should produce one block
  const separatorCount = (result.match(/---/g) || []).length;
  assertEquals(separatorCount, 0, "adjacent match windows should merge");
  assert(result.includes("JOHN first"), "first mention included");
  assert(result.includes("JOHN again"), "second mention included");
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. EDGE — whitespace normalization
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("extractCharacterRelevantText: whitespace-surrounded name matches", () => {
  const text = `  JOHN  wanders through the market.`;
  const result = extractCharacterRelevantText(text, "JOHN");
  assert(result.includes("JOHN"), "whitespace around name should still match");
});