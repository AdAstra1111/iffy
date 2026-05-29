/**
 * countTreatmentActSections + Fallback — P3 test suite
 *
 * Tests the countTreatmentActSections function (generate-document/index.ts lines 168-172)
 * and the fallback injection logic (lines 478-497).
 *
 * Scenarios:
 *   1. countTreatmentActSections with all 4 acts — returns {found: 4, total: 4}
 *   2. Missing act sections — returns correct count
 *   3. No act sections — returns {found: 0, total: 4}
 *   4. Threshold: < 3 acts triggers fallback injection
 *   5. 3+ acts is OK (no fallback)
 *   6. Empty treatment text — returns {found: 0, total: 4}
 *
 * Run: deno test countTreatmentActSections_test.ts --allow-none
 */

import { assertEquals, assertStringIncludes, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ── Inlined from generate-document/index.ts lines 168-172 ──

function countTreatmentActSections(treatmentText: string): { found: number; total: number; foundActs: string[] } {
  const actHeaders = ["## Act 1:", "## Act 2A:", "## Act 2B:", "## Act 3:"];
  const foundActs = actHeaders.filter(h => treatmentText.includes(h));
  return { found: foundActs.length, total: actHeaders.length, foundActs };
}

// ── Inlined fallback injection logic from lines 478-497 ──

function injectFallbackIfNeeded(docType: string, upstreamBlocks: Map<string, string>, upstreamContent: string): { injected: boolean; content: string } {
  if (docType === "story_outline") {
    const treatmentText = upstreamBlocks.get("treatment") || "";
    if (treatmentText) {
      const { found, total, foundActs } = countTreatmentActSections(treatmentText);
      if (found < 3) {
        // Inject fallback
        const fallback = `\n\n### TREATMENT ACT STRUCTURE FALLBACK\nThe upstream treatment may be missing some act sections. The project should follow a standard 4-act structure:\n` +
          `- Act 1: Setup — introduces characters, world, and central conflict\n` +
          `- Act 2A: Rising Action — complications escalate, stakes increase\n` +
          `- Act 2B: Complications — midpoint turn, darkest moment, preparing for climax\n` +
          `- Act 3: Climax & Resolution — final confrontation and resolution\n` +
          `Use the available treatment content as the primary source. Fill structural gaps with this fallback guide.`;
        return { injected: true, content: upstreamContent + fallback };
      }
    }
  }
  return { injected: false, content: upstreamContent };
}

// ═══════════════════════════════════════════════════════════════
// 1. countTreatmentActSections — standard cases
// ═══════════════════════════════════════════════════════════════

const TREATMENT_ALL_4 = `## Treatment: My Story

## Act 1: Setup
The hero begins their journey.

## Act 2A: Rising Action
The stakes increase.

## Act 2B: Complications
Everything falls apart.

## Act 3: Climax & Resolution
The final confrontation.`;

const TREATMENT_MISSING_ACT2B = `## Treatment: My Story

## Act 1: Setup
The hero begins their journey.

## Act 2A: Rising Action
The stakes increase.

## Act 3: Climax & Resolution
The final confrontation.`;

const TREATMENT_NO_ACTS = `## Treatment: My Story
Some general narrative description here. No act headers present.`;

Deno.test({
  name: "countTreatmentActSections — all 4 acts present returns found=4",
  fn() {
    const result = countTreatmentActSections(TREATMENT_ALL_4);
    assertEquals(result.found, 4);
    assertEquals(result.total, 4);
    assertEquals(result.foundActs.length, 4);
  },
});

Deno.test({
  name: "countTreatmentActSections — 3 acts (missing Act 2B) returns found=3",
  fn() {
    const result = countTreatmentActSections(TREATMENT_MISSING_ACT2B);
    assertEquals(result.found, 3);
    assertEquals(result.total, 4);
    assertEquals(result.foundActs, ["## Act 1:", "## Act 2A:", "## Act 3:"]);
  },
});

Deno.test({
  name: "countTreatmentActSections — 2 acts returns found=2",
  fn() {
    const twoActs = `## Treatment: My Story

## Act 1: Setup
Content.

## Act 2A: Rising Action
Content.`;
    const result = countTreatmentActSections(twoActs);
    assertEquals(result.found, 2);
    assertEquals(result.total, 4);
  },
});

Deno.test({
  name: "countTreatmentActSections — only 1 act returns found=1",
  fn() {
    const oneAct = `## Treatment: My Story

## Act 1: Setup
Only Act 1 content.`;
    const result = countTreatmentActSections(oneAct);
    assertEquals(result.found, 1);
    assertEquals(result.total, 4);
  },
});

Deno.test({
  name: "countTreatmentActSections — no act headers returns found=0",
  fn() {
    const result = countTreatmentActSections(TREATMENT_NO_ACTS);
    assertEquals(result.found, 0);
    assertEquals(result.total, 4);
    assertEquals(result.foundActs.length, 0);
  },
});

Deno.test({
  name: "countTreatmentActSections — empty string returns found=0",
  fn() {
    const result = countTreatmentActSections("");
    assertEquals(result.found, 0);
    assertEquals(result.total, 4);
  },
});

// ═══════════════════════════════════════════════════════════════
// 2. countTreatmentActSections — edge cases
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "countTreatmentActSections — acts with extra whitespace still detected",
  fn() {
    const spaced = `## Act 1:  Setup
Content.
## Act 2A:   Rising Action
Content.`;
    const result = countTreatmentActSections(spaced);
    // The function uses .includes() so "## Act 1:" matches "## Act 1:  Setup"
    assertEquals(result.found, 2, "should detect headers even with extra whitespace after colon");
  },
});

Deno.test({
  name: "countTreatmentActSections — lowercase 'act' in '## act 1:' NOT detected (case-sensitive)",
  fn() {
    const lower = `## act 1: setup
Content here.`;
    const result = countTreatmentActSections(lower);
    assertEquals(result.found, 0, "case-sensitive match — '## act 1:' should NOT match '## Act 1:'");
  },
});

Deno.test({
  name: "countTreatmentActSections — content mentioning 'Act 1' outside heading NOT counted",
  fn() {
    const text = `The treatment summary mentions Act 1 events but has no heading.`;
    const result = countTreatmentActSections(text);
    assertEquals(result.found, 0, "content-level 'Act 1' without '## ' prefix should not match");
  },
});

Deno.test({
  name: "countTreatmentActSections — headers with colon variant: '## Act 1 —' NOT detected",
  fn() {
    const emDash = `## Act 1 — Setup
Content.`;
    const result = countTreatmentActSections(emDash);
    // "## Act 1:" explicitly checks for colon after the act name
    assertEquals(result.found, 0, "'## Act 1 — Setup' should not match '## Act 1:'");
  },
});

// ═══════════════════════════════════════════════════════════════
// 3. Fallback injection logic
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "fallback — treatment with 4 acts (>=3) does NOT inject fallback",
  fn() {
    const blocks = new Map<string, string>();
    blocks.set("treatment", TREATMENT_ALL_4);
    const result = injectFallbackIfNeeded("story_outline", blocks, "existing content");
    assertEquals(result.injected, false);
    assertEquals(result.content, "existing content", "content should remain unchanged");
  },
});

Deno.test({
  name: "fallback — treatment with 3 acts (= threshold) does NOT inject fallback",
  fn() {
    const blocks = new Map<string, string>();
    blocks.set("treatment", TREATMENT_MISSING_ACT2B);
    const result = injectFallbackIfNeeded("story_outline", blocks, "existing content");
    assertEquals(result.injected, false, "3 acts is at threshold, no fallback needed");
  },
});

Deno.test({
  name: "fallback — treatment with 2 acts (<3) injects fallback content",
  fn() {
    const blocks = new Map<string, string>();
    blocks.set("treatment", `## Act 1: Setup\nContent.\n## Act 2A: Rising Action\nContent.`);
    const result = injectFallbackIfNeeded("story_outline", blocks, "existing content");
    assertEquals(result.injected, true);
    assertStringIncludes(result.content, "### TREATMENT ACT STRUCTURE FALLBACK");
    assertStringIncludes(result.content, "Act 1: Setup");
    assertStringIncludes(result.content, "Act 2A: Rising Action");
    assertStringIncludes(result.content, "Act 2B: Complications");
    assertStringIncludes(result.content, "Act 3: Climax & Resolution");
    assertStringIncludes(result.content, "existing content");
  },
});

Deno.test({
  name: "fallback — treatment with 0 acts injects fallback content",
  fn() {
    const blocks = new Map<string, string>();
    blocks.set("treatment", TREATMENT_NO_ACTS);
    const result = injectFallbackIfNeeded("story_outline", blocks, "base content here");
    assertEquals(result.injected, true);
    assertStringIncludes(result.content, "### TREATMENT ACT STRUCTURE FALLBACK");
    assertStringIncludes(result.content, "base content here");
  },
});

Deno.test({
  name: "fallback — no treatment content at all does NOT inject fallback",
  fn() {
    const blocks = new Map<string, string>();
    const result = injectFallbackIfNeeded("story_outline", blocks, "existing content");
    // Empty treatment text means the treatmentText variable is "" which is falsy
    // so the function skips the check entirely
    assertEquals(result.injected, false);
    assertEquals(result.content, "existing content");
  },
});

Deno.test({
  name: "fallback — non-story_outline docTypes skip the check entirely",
  fn() {
    const blocks = new Map<string, string>();
    blocks.set("treatment", TREATMENT_NO_ACTS);
    const result = injectFallbackIfNeeded("beat_sheet", blocks, "beat sheet content");
    assertEquals(result.injected, false, "non-story_outline should skip treatment section check");
    assertEquals(result.content, "beat sheet content");
  },
});

Deno.test({
  name: "fallback — treatment with exactly 1 act section injects fallback",
  fn() {
    const blocks = new Map<string, string>();
    blocks.set("treatment", `## Act 1: Setup\nIntroductory content.`);
    const result = injectFallbackIfNeeded("story_outline", blocks, "upstream");
    assertEquals(result.injected, true);
    assertStringIncludes(result.content, "TREATMENT ACT STRUCTURE FALLBACK");
  },
});

// ═══════════════════════════════════════════════════════════════
// 4. Invariant: upstream content preserved
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "invariant — fallback appends to existing upstream content, does not replace",
  fn() {
    const blocks = new Map<string, string>();
    blocks.set("treatment", `## Act 1: Setup\nOnly one act.`);
    const upstream = "=== PREVIOUS UPSTREAM CONTENT ===\nImportant context here.";
    const result = injectFallbackIfNeeded("story_outline", blocks, upstream);
    assertEquals(result.injected, true);
    assert(
      result.content.startsWith(upstream),
      "fallback should append to, not replace, upstream content"
    );
    // Upstream content should come first
    assert(
      result.content.indexOf(upstream) < result.content.indexOf("TREATMENT ACT STRUCTURE FALLBACK"),
      "upstream content should appear before fallback"
    );
  },
});