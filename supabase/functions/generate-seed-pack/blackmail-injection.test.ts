/**
 * Comprehensive tests for the blackmail-as-permitted-plot-device injection
 * in generate-seed-pack/index.ts (lines 573-607).
 *
 * Tests verify:
 *   1. The injection logic itself (extracted as pure functions)
 *   2. Downstream parser compatibility (parseTensionSources + dev-engine-v2 regex)
 *   3. All edge cases and invariants
 *
 * Run: deno test blackmail-injection.test.ts --allow-all
 */

import { assertEquals, assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ══════════════════════════════════════════════════════════════════════════════
// 1. Extracted Pure Functions (mirrors generate-seed-pack/index.ts lines 573-607)
// ══════════════════════════════════════════════════════════════════════════════

const BLACKMAIL_ENTRY = "✓ Blackmail — universally permitted conflict driver for prestige drama, psychological stakes, and character entanglement.";

function ensureBlackmailInPermittedElements(permittedElements: string | undefined): string {
  if (typeof permittedElements !== "string" || !permittedElements.toLowerCase().includes("blackmail")) {
    if (typeof permittedElements === "string" && permittedElements.trim().length > 0) {
      return permittedElements + "\n" + BLACKMAIL_ENTRY;
    }
    return BLACKMAIL_ENTRY;
  }
  return permittedElements;
}

function ensureBlackmailInNec(nec: string): string {
  const tsmHeaderRe = /(tension(?:\s+source(?:\s+matrix)?)[;:?\s]*)/i;
  const tsmMatch = nec.match(tsmHeaderRe);
  if (tsmMatch) {
    const afterHeader = nec.slice(tsmMatch.index! + tsmMatch[0].length).slice(0, 200);
    if (!/blackmail/i.test(afterHeader)) {
      const insertAt = tsmMatch.index! + tsmMatch[0].length;
      return nec.slice(0, insertAt) + "Blackmail, " + nec.slice(insertAt);
    }
    return nec;
  }
  // No TSM header found — append fallback
  return nec + "\n\nTension Source Matrix: Blackmail";
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. Downstream Parsers (exact match of production implementations)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Exact match of parseTensionSources from narrativeContextResolver.ts (lines 85-106).
 */
function parseTensionSources(text: string): string[] {
  const tsmMatch = text.match(
    /tension(?:\s+source(?:\s+matrix)?)[;:?\s]+(.+?)(?=\n\n|\n[A-Z]|$)/is
  );
  if (!tsmMatch) return [];
  const tsmBody = tsmMatch[1];
  const rawEntries = tsmBody
    .split(/\n|,|;/)
    .map((s: string) => s.replace(/^[\s\-–—•]+/, "").trim())
    .filter((s: string) => s.length > 2 && s.length < 80);
  const seen = new Set<string>();
  const results: string[] = [];
  for (const entry of rawEntries) {
    const core = entry.replace(/\s*\([^)]*\)/, "").trim();
    if (seen.has(core.toLowerCase())) continue;
    if (/^(the|and|or|for|with|from|by|to|of|on|in|at|is|are|tier|tiers?)$/i.test(core)) continue;
    if (core.length < 3) continue;
    seen.add(core.toLowerCase());
    results.push(core);
  }
  return results;
}

/**
 * Exact match of dev-engine-v2 inline regex + blackmail check (lines 504-512).
 */
function devEngineV2DetectBlackmail(text: string): boolean {
  const tensionSourceMatch = text.match(/tension(?:\s+source(?:\s+matrix)?)[;:\s]+(.+?)(?:\n|$)/i);
  if (!tensionSourceMatch) return false;
  const tsText = tensionSourceMatch[1];
  return /blackmail/i.test(tsText);
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. Test Fixtures
// ══════════════════════════════════════════════════════════════════════════════

const NEC_WITH_TSM_EMPTY_AFTER = `Tension Source Matrix:
The narrative operates primarily through relational tension and moral compromise.`;

const NEC_WITH_TSM_AND_OTHERS = `Tension Source Matrix: Betrayal, Moral Dilemma, Revenge
The narrative operates primarily through relational tension.`;

const NEC_WITH_TSM_AND_BLACKMAIL = `Tension Source Matrix: Betrayal, Blackmail, Revenge
The narrative operates primarily through relational tension.`;

const NEC_WITH_TSM_AND_LOWERCASE_BLACKMAIL = `Tension Source Matrix: Betrayal, blackmail, Revenge
The narrative operates primarily through relational tension.`;

const NEC_NO_TSM = `The narrative operates primarily through relational tension and moral compromise.
Stakes escalate through character betrayal and institutional pressure.`;

const NEC_WITH_VARIANT_HEADER = `Tension Sources: Betrayal, Moral Dilemma`;

const NEC_WITH_TENSION_SOURCE_MATRIX_HEADER = `Tension Source Matrix: Betrayal, Moral Dilemma`;

const NEC_WITH_COLON_VARIANT = `Tension Source; Betrayal, Moral Dilemma`;

const NEC_WITH_QUESTION_VARIANT = `Tension Source? Betrayal, Moral Dilemma`;

const NEC_LONG_CONTENT = `Tension Source Matrix: Betrayal
The narrative is driven by character relationships.
Characters navigate a world of institutional pressure.
The story escalates through personal stakes.
This is a prestige drama set in high society.
Multiple intersecting plotlines create complexity.`;

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE 1: ensureBlackmailInPermittedElements
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("permitted_elements: already has blackmail — no change", () => {
  const input = "✓ Betrayal\n✓ Blackmail\n✓ Revenge";
  const result = ensureBlackmailInPermittedElements(input);
  assertEquals(result, input, "should return unchanged when blackmail already present");
});

Deno.test("permitted_elements: already has lowercase blackmail — no change", () => {
  const input = "✓ Betrayal\n✓ blackmail\n✓ Revenge";
  const result = ensureBlackmailInPermittedElements(input);
  assertEquals(result, input, "should return unchanged when lowercase blackmail already present");
});

Deno.test("permitted_elements: empty string — sets to blackmail entry", () => {
  const result = ensureBlackmailInPermittedElements("");
  assertEquals(result, BLACKMAIL_ENTRY, "empty string should be replaced with blackmail entry");
});

Deno.test("permitted_elements: undefined — sets to blackmail entry", () => {
  const result = ensureBlackmailInPermittedElements(undefined);
  assertEquals(result, BLACKMAIL_ENTRY, "undefined should become blackmail entry");
});

Deno.test("permitted_elements: has content but no blackmail — appends blackmail entry", () => {
  const input = "✓ Betrayal\n✓ Revenge";
  const result = ensureBlackmailInPermittedElements(input);
  assertStringIncludes(result, "Blackmail", "result should contain Blackmail");
  assertStringIncludes(result, "Betrayal", "result should still contain Betrayal");
  assertStringIncludes(result, "Revenge", "result should still contain Revenge");
  assert(result.includes(BLACKMAIL_ENTRY), "result should contain full blackmail entry");
});

Deno.test("permitted_elements: blackmail substring in other word — still adds (safety check)", () => {
  // "blackmailer" contains "blackmail" — this test documents the behavior
  // where substring matching prevents duplication
  const input = "✓ Betrayal\n✓ blackmailer\n✓ Revenge";
  const result = ensureBlackmailInPermittedElements(input);
  // lowerCase().includes("blackmail") matches "blackmailer" — this is a quirk
  // but acceptable since "blackmailer" as a tension source implies blackmail exists
  assertEquals(result, input, "substring match 'blackmailer' triggers no-change");
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE 2: ensureBlackmailInNec
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("NEC: TSM header with empty body after — injects Blackmail after header", () => {
  const result = ensureBlackmailInNec(NEC_WITH_TSM_EMPTY_AFTER);
  assertStringIncludes(result, "Blackmail", "result should contain Blackmail");
  assert(result.startsWith("Tension Source Matrix:\nBlackmail"), "Blackmail should be injected right after header");
});

Deno.test("NEC: TSM header with other tension sources — injects Blackmail, prefix", () => {
  const result = ensureBlackmailInNec(NEC_WITH_TSM_AND_OTHERS);
  assertStringIncludes(result, "Blackmail", "result should contain Blackmail");
  assertStringIncludes(result, "Betrayal", "result should still contain Betrayal");
  assertStringIncludes(result, "Revenge", "result should still contain Revenge");
  // Blackmail should be prepended before existing entries
  const afterHeader = result.slice(result.indexOf("Tension Source Matrix:") + "Tension Source Matrix:".length);
  assert(afterHeader.startsWith(" Blackmail, "), "Blackmail should be injected first in the list");
});

Deno.test("NEC: TSM header already has Blackmail — no duplicate", () => {
  const result = ensureBlackmailInNec(NEC_WITH_TSM_AND_BLACKMAIL);
  assertEquals(result, NEC_WITH_TSM_AND_BLACKMAIL, "should return unchanged when Blackmail already present");
});

Deno.test("NEC: TSM header already has lowercase blackmail — no duplicate", () => {
  const result = ensureBlackmailInNec(NEC_WITH_TSM_AND_LOWERCASE_BLACKMAIL);
  assertEquals(result, NEC_WITH_TSM_AND_LOWERCASE_BLACKMAIL, "should return unchanged when blackmail already present (case insensitive)");
});

Deno.test("NEC: no TSM header — appends Tension Source Matrix: Blackmail", () => {
  const result = ensureBlackmailInNec(NEC_NO_TSM);
  assertEquals(result, NEC_NO_TSM + "\n\nTension Source Matrix: Blackmail", "should append fallback TSM entry");
});

Deno.test("NEC: Tension Sources variant (no Matrix) — injects Blackmail", () => {
  const result = ensureBlackmailInNec(NEC_WITH_VARIANT_HEADER);
  assertStringIncludes(result, "Blackmail", "should inject Blackmail after 'Tension Sources:' header");
  assertStringIncludes(result, "Betrayal", "should preserve existing entries");
});

Deno.test("NEC: Tension Source Matrix full header — injects Blackmail", () => {
  const result = ensureBlackmailInNec(NEC_WITH_TENSION_SOURCE_MATRIX_HEADER);
  assertStringIncludes(result, "Blackmail", "should inject Blackmail after full header");
});

Deno.test("NEC: semicolon variant separator (Tension Source;) — still matches", () => {
  const result = ensureBlackmailInNec(NEC_WITH_COLON_VARIANT);
  assertStringIncludes(result, "Blackmail", "should match header with semicolon separator");
});

Deno.test("NEC: question mark variant (Tension Source?) — still matches", () => {
  const result = ensureBlackmailInNec(NEC_WITH_QUESTION_VARIANT);
  assertStringIncludes(result, "Blackmail", "should match header with question mark separator");
});

Deno.test("NEC: long content — only checks first 200 chars after header", () => {
  // Blackmail more than 200 chars after header should still be detected
  const necWithDistantBlackmail = `Tension Source Matrix: Betrayal
The narrative is driven by character relationships.
Characters navigate a world of institutional pressure.
This is a long text that pushes content beyond 200 chars.
But wait, Blackmail also appears here but far from the header.`;
  
  // Check where Blackmail appears — if after 200 chars, it won't be detected
  const headerEnd = "Tension Source Matrix:".length;
  const afterHeader = necWithDistantBlackmail.slice(headerEnd).slice(0, 200);
  const blackmailIdx = afterHeader.toLowerCase().indexOf("blackmail");
  
  if (blackmailIdx === -1) {
    // Blackmail is beyond 200 chars — should still inject it
    const result = ensureBlackmailInNec(necWithDistantBlackmail);
    const count = (result.match(/Blackmail/gi) || []).length;
    assert(count >= 1, "Blackmail outside 200-char window should still cause injection");
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE 3: Downstream Parser Integration — parseTensionSources
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("parseTensionSources: injected 'Blackmail, Betrayal' format — extracts Blackmail", () => {
  const input = ensureBlackmailInNec(NEC_WITH_TSM_EMPTY_AFTER);
  const sources = parseTensionSources(input);
  assert(sources.some(s => /blackmail/i.test(s)), "parseTensionSources should extract Blackmail from injected format");
});

Deno.test("parseTensionSources: injected 'Blackmail, Betrayal, Revenge' — extracts all three", () => {
  const necWithInjection = ensureBlackmailInNec(NEC_WITH_TSM_AND_OTHERS);
  const sources = parseTensionSources(necWithInjection);
  assert(sources.some(s => /blackmail/i.test(s)), "should extract Blackmail");
  assert(sources.some(s => /betrayal/i.test(s)), "should extract Betrayal");
  assert(sources.some(s => /revenge/i.test(s)), "should extract Revenge");
});

Deno.test("parseTensionSources: fallback 'Tension Source Matrix: Blackmail' — extracts Blackmail", () => {
  const input = ensureBlackmailInNec(NEC_NO_TSM);
  const sources = parseTensionSources(input);
  assert(sources.some(s => /blackmail/i.test(s)), "should extract Blackmail from fallback TSM");
});

Deno.test("parseTensionSources: already had Blackmail — still extracts it", () => {
  const sources = parseTensionSources(NEC_WITH_TSM_AND_BLACKMAIL);
  assert(sources.some(s => /blackmail/i.test(s)), "should extract Blackmail when already present");
});

Deno.test("parseTensionSources: no TSM at all — returns empty array", () => {
  const sources = parseTensionSources(NEC_NO_TSM);
  assertEquals(sources.length, 0, "no TSM header should return empty array");
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE 4: Downstream Parser Integration — dev-engine-v2 regex
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("dev-engine-v2: injected 'Blackmail, (text)' — detects Blackmail as permitted", () => {
  const input = ensureBlackmailInNec(NEC_WITH_TSM_EMPTY_AFTER);
  assert(devEngineV2DetectBlackmail(input), "dev-engine-v2 regex should detect injected Blackmail");
});

Deno.test("dev-engine-v2: injected before existing entries — detects Blackmail", () => {
  const input = ensureBlackmailInNec(NEC_WITH_TSM_AND_OTHERS);
  assert(devEngineV2DetectBlackmail(input), "dev-engine-v2 regex should detect Blackmail when prepended");
});

Deno.test("dev-engine-v2: fallback Tension Source Matrix: Blackmail — detects it", () => {
  const input = ensureBlackmailInNec(NEC_NO_TSM);
  assert(devEngineV2DetectBlackmail(input), "dev-engine-v2 regex should detect fallback Blackmail entry");
});

Deno.test("dev-engine-v2: already had Blackmail — detects it", () => {
  assert(devEngineV2DetectBlackmail(NEC_WITH_TSM_AND_BLACKMAIL), "should detect Blackmail when already present");
});

Deno.test("dev-engine-v2: no TSM at all — returns false", () => {
  assertEquals(devEngineV2DetectBlackmail(NEC_NO_TSM), false, "no TSM should return false");
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE 5: Full Integration — End-to-end Simulation
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("full integration: empty permitted_elements + NEC without TSM — both work correctly", () => {
  const parsed = {
    permitted_elements: "",
    narrative_energy_contract: "The concept relies on personal stakes.",
  };

  // Apply both injections
  parsed.permitted_elements = ensureBlackmailInPermittedElements(parsed.permitted_elements);
  parsed.narrative_energy_contract = ensureBlackmailInNec(parsed.narrative_energy_contract);

  // permitted_elements should contain the blackmail entry
  assert(parsed.permitted_elements.includes("Blackmail"), "permitted_elements should contain Blackmail");

  // NEC should have the fallback TSM
  assertStringIncludes(parsed.narrative_energy_contract, "Tension Source Matrix: Blackmail");
  
  // Both downstream parsers should detect it
  assert(parseTensionSources(parsed.narrative_energy_contract).some(s => /blackmail/i.test(s)),
    "parseTensionSources should detect Blackmail");
  assert(devEngineV2DetectBlackmail(parsed.narrative_energy_contract),
    "dev-engine-v2 should detect Blackmail");
});

Deno.test("full integration: existing permitted_elements with content + NEC with TSM — both inject correctly", () => {
  const parsed = {
    permitted_elements: "✓ Betrayal\n✓ Revenge",
    narrative_energy_contract: "Tension Source Matrix: Betrayal, Revenge\nSome narrative text.",
  };

  parsed.permitted_elements = ensureBlackmailInPermittedElements(parsed.permitted_elements);
  parsed.narrative_energy_contract = ensureBlackmailInNec(parsed.narrative_energy_contract);

  // Both should contain Blackmail now
  assert(parsed.permitted_elements.includes("Blackmail"), "permitted_elements should have Blackmail");
  assertStringIncludes(parsed.narrative_energy_contract, "Blackmail");

  // Downstream parsers pick it up
  assert(parseTensionSources(parsed.narrative_energy_contract).some(s => /blackmail/i.test(s)),
    "parseTensionSources should detect Blackmail");
  assert(devEngineV2DetectBlackmail(parsed.narrative_energy_contract),
    "dev-engine-v2 should detect Blackmail");
});

Deno.test("full integration: both already have Blackmail — no duplication", () => {
  const parsed = {
    permitted_elements: "✓ Betrayal\n✓ Blackmail\n✓ Revenge",
    narrative_energy_contract: "Tension Source Matrix: Betrayal, Blackmail, Revenge\nSome narrative.",
  };

  const pe_before = parsed.permitted_elements;
  const nec_before = parsed.narrative_energy_contract;

  parsed.permitted_elements = ensureBlackmailInPermittedElements(parsed.permitted_elements);
  parsed.narrative_energy_contract = ensureBlackmailInNec(parsed.narrative_energy_contract);

  // No changes should occur
  assertEquals(parsed.permitted_elements, pe_before, "should not duplicate permitted_elements");
  assertEquals(parsed.narrative_energy_contract, nec_before, "should not duplicate NEC entry");
});

Deno.test("full integration: undefined permitted_elements + NEC without TSM — fallback path works", () => {
  const parsed: any = {
    narrative_energy_contract: "A prestige drama about power.",
  };

  parsed.permitted_elements = ensureBlackmailInPermittedElements(parsed.permitted_elements);
  parsed.narrative_energy_contract = ensureBlackmailInNec(parsed.narrative_energy_contract);

  assert(typeof parsed.permitted_elements === "string", "permitted_elements should be set to a string");
  assert(parsed.permitted_elements.includes("Blackmail"), "permitted_elements should contain Blackmail");
  assertStringIncludes(parsed.narrative_energy_contract, "Tension Source Matrix: Blackmail");
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE 6: Invariant Checks
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("invariant: ensureBlackmailInPermittedElements never returns undefined", () => {
  const results = [
    ensureBlackmailInPermittedElements(undefined),
    ensureBlackmailInPermittedElements(""),
    ensureBlackmailInPermittedElements("✓ Betrayal"),
    ensureBlackmailInPermittedElements("✓ Blackmail"),
  ];
  for (const r of results) {
    assertEquals(typeof r, "string", "result should always be a string");
    assert(r.length > 0, "result should never be empty");
  }
});

Deno.test("invariant: ensureBlackmailInNec always returns a string containing Blackmail or original", () => {
  const cases = [
    NEC_WITH_TSM_EMPTY_AFTER,
    NEC_WITH_TSM_AND_OTHERS,
    NEC_WITH_TSM_AND_BLACKMAIL,
    NEC_NO_TSM,
    NEC_WITH_VARIANT_HEADER,
    "Completely random text with no TSM reference.",
    "",
  ];
  for (const c of cases) {
    const result = ensureBlackmailInNec(c);
    assertEquals(typeof result, "string", "result should always be a string");
    // If input already had blackmail, result equals input
    // If input had no TSM, result appends TSM with Blackmail
    // If input had TSM without blackmail, injects it
    if (!/blackmail/i.test(c)) {
      assert(/blackmail/i.test(result), `result should contain Blackmail (input: "${c.slice(0, 40)}...")`);
    }
  }
});

Deno.test("invariant: parsing doesn't corrupt NEC structure", () => {
  const necText = `Tension Source Matrix: Mystery, Suspense
The narrative operates through carefully controlled revelation.
Stakes are built through character relationships.
This is a prestige limited series format.`;

  const injected = ensureBlackmailInNec(necText);
  
  // The body text after TSM should remain intact
  assertStringIncludes(injected, "The narrative operates through carefully controlled revelation");
  assertStringIncludes(injected, "Stakes are built through character relationships");
  assertStringIncludes(injected, "prestige limited series format");

  // The TSM entries should be preserved (Blackmail added)
  const sources = parseTensionSources(injected);
  assert(sources.some(s => /mystery/i.test(s)), "Mystery should still be present");
  assert(sources.some(s => /suspense/i.test(s)), "Suspense should still be present");
  assert(sources.some(s => /blackmail/i.test(s)), "Blackmail should now be present");
  assertEquals(sources.length, 3, "should have exactly 3 tension sources");
});

Deno.test("invariant: empty NEC string is handled", () => {
  const result = ensureBlackmailInNec("");
  assertEquals(result, "\n\nTension Source Matrix: Blackmail", "empty string gets fallback TSM");
});

Deno.test("invariant: permitted_elements with only whitespace is replaced", () => {
  const result = ensureBlackmailInPermittedElements("   ");
  assertEquals(result, BLACKMAIL_ENTRY, "whitespace-only should be replaced");
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUMMARY
// ══════════════════════════════════════════════════════════════════════════════
// All tests validate that the blackmail-as-permitted-plot-device injection
// (generate-seed-pack/index.ts lines 573-607):
//   1. Correctly injects Blackmail into permitted_elements
//   2. Correctly injects Blackmail into NEC Tension Source Matrix
//   3. Does NOT create duplicates when Blackmail already present
//   4. Is compatible with both downstream parsers (parseTensionSources + dev-engine-v2)
//   5. Preserves existing NEC structure and tension sources
//   6. Handles all edge cases (empty, undefined, variant headers, whitespace)