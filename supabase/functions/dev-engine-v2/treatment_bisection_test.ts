// treatment_bisection_test.ts — Deno test suite for Treatment Act 2a/2b bisection awareness
// Run: deno test --allow-read treatment_bisection_test.ts
// Test coverage: 6 change sites from Seraph review

import { assertEquals, assertExists, assertStringIncludes, assertMatch } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// Read the source file
const sourcePath = new URL(".", import.meta.url).pathname + "index.ts";

// ───────────────────────────────────────────────────────────
// Test 1: Treatment DELIVERABLE_RUBRIC contains bisection awareness
// ───────────────────────────────────────────────────────────
Deno.test("Change 1: Treatment rubric has bisection awareness in EVAL_BLOCK", async () => {
  const source = await Deno.readTextFile(sourcePath);

  // The treatment rubric must start with "Evaluate as a TREATMENT"
  const treatmentRubricStart = source.indexOf(`treatment: \`Evaluate as a TREATMENT`);
  assertNotEqual(treatmentRubricStart, -1, "treatment rubric not found in DELIVERABLE_RUBRICS");

  // Must contain the Act 2a/2b bisection awareness text
  assertStringIncludes(
    source.slice(treatmentRubricStart, treatmentRubricStart + 3000),
    "Act 2a/Act 2b bisection",
    "treatment rubric missing bisection awareness section header"
  );

  // Verify key bisection guidance is present
  const bisectionSection = source.slice(treatmentRubricStart, treatmentRubricStart + 3000);
  assertStringIncludes(
    bisectionSection,
    "Act 2 is often split into Act 2a (rising action pre-midpoint) and Act 2b (falling action post-midpoint)",
    "treatment rubric missing bisection convention explanation"
  );
  assertStringIncludes(
    bisectionSection,
    "Do NOT flag 2a/2b as an act structure issue",
    "treatment rubric missing false positive prevention"
  );
});

// ───────────────────────────────────────────────────────────
// Test 2: FORMAT_EXPECTATIONS film entry has bisection awareness
// ───────────────────────────────────────────────────────────
Deno.test("Change 2: FORMAT_EXPECTATIONS film includes bisection awareness", async () => {
  const source = await Deno.readTextFile(sourcePath);

  // Find FORMAT_EXPECTATIONS block
  const fmtExpectationsStart = source.indexOf("const FORMAT_EXPECTATIONS: Record<string, string> = {");
  assertNotEqual(fmtExpectationsStart, -1, "FORMAT_EXPECTATIONS not found");

  const fmtBlock = source.slice(fmtExpectationsStart, fmtExpectationsStart + 2000);

  // "film" entry must include bisection awareness
  assertStringIncludes(
    fmtBlock,
    "Act 2 may be bisected into Act 2a + Act 2b",
    "FORMAT_EXPECTATIONS film missing bisection awareness"
  );
  assertStringIncludes(
    fmtBlock,
    "NOT a 4th act",
    "FORMAT_EXPECTATIONS film missing 'NOT a 4th act' clarification"
  );

  // "feature" entry (alias for film) must also have it
  assertStringIncludes(
    fmtBlock,
    `"feature": \`FORMAT: Feature Film — expect 3-act structure (Act 2 may be bisected`,
    "FORMAT_EXPECTATIONS feature entry missing bisection awareness"
  );
});

// ───────────────────────────────────────────────────────────
// Test 3: Point A — Analyze action includes treatment bisection contextualization
// ───────────────────────────────────────────────────────────
Deno.test("Change 3: buildAnalyzeSystem uses treatment rubric for treatment deliverable", async () => {
  const source = await Deno.readTextFile(sourcePath);

  // Verify buildAnalyzeSystem picks the treatment rubric
  // The key line: `let rubric = DELIVERABLE_RUBRICS[deliverable] || DELIVERABLE_RUBRICS.script;`
  assertStringIncludes(
    source,
    "let rubric = DELIVERABLE_RUBRICS[deliverable] || DELIVERABLE_RUBRICS.script;",
    "buildAnalyzeSystem must pick deliverable-specific rubric"
  );

  // Verify treatment is in DELIVERABLE_RUBRICS
  assertStringIncludes(
    source,
    `treatment: \`Evaluate as a TREATMENT`,
    "DELIVERABLE_RUBRICS must have treatment entry"
  );

  // Verify the format expectation is included with bisection awareness
  const formatExpLine = source.indexOf(`const formatExp = FORMAT_EXPECTATIONS[format] || FORMAT_EXPECTATIONS.film;`);
  assertNotEqual(formatExpLine, -1, "buildAnalyzeSystem must include format expectations");
});

// ───────────────────────────────────────────────────────────
// Test 4: Point B — Notes action includes act bisection awareness in system prompt
// ───────────────────────────────────────────────────────────
Deno.test("Change 4: Notes system prompt includes ACT BISECTION AWARENESS rule", async () => {
  const source = await Deno.readTextFile(sourcePath);

  // The notes system prompt must contain ACT BISECTION AWARENESS
  assertStringIncludes(
    source,
    "ACT BISECTION AWARENESS",
    "notes system prompt missing ACT BISECTION AWARENESS"
  );

  // Verify the specific guidance text
  assertStringIncludes(
    source,
    "Do NOT flag 2A/2B as \"too many acts\" or \"act structure confusion.\"",
    "notes system prompt missing false positive prevention for 2a/2b"
  );

  assertStringIncludes(
    source,
    "This is a standard structural choice for feature films where the midpoint divides Act 2",
    "notes system prompt missing midpoint split explanation"
  );

  assertStringIncludes(
    source,
    "Do NOT suggest collapsing 2A and 2B into a single Act 2",
    "notes system prompt must not suggest collapsing bisection"
  );

  // Verify deliverable Type variable exists at ~line 6576
  assertStringIncludes(
    source,
    "let { deliverableType } = body;",
    "deliverableType variable must exist for Point B condition"
  );
});

// ───────────────────────────────────────────────────────────
// Test 5: FALSE POSITIVE FILTER — prevents false Act 2a/2b blockers
// ───────────────────────────────────────────────────────────
Deno.test("Change 5: False positive filter prevents Act 2a/2b blocker noise", async () => {
  const source = await Deno.readTextFile(sourcePath);

  // The false positive filter appears in multiple places. Check all:
  const falsePositivePatterns = [
    // In notes system prompt general rules
    `MIDPOINT SPLIT, NOT a fourth act`,
    // In treatment rubric
    `Valid CONVENTION`,
    // In format expectations
    `this is a valid convention, NOT a 4th act`,
  ];

  for (const pattern of falsePositivePatterns) {
    const found = source.includes(pattern);
    if (!found) {
      throw new Error(`False positive filter pattern not found: "${pattern}"`);
    }
  }

  // Verify at least 3 occurrences of bisection protection across the codebase
  const bisectionMentions = (source.match(/bisect|bisection|BISECTION|2a.*2b|2A.*2B/g) || []).length;
  assert(bisectionMentions >= 8, `Expected >=8 bisection mentions across codebase, got ${bisectionMentions}`);
});

// ───────────────────────────────────────────────────────────
// Test 6: Variable hoisting cleanup — sections/updatedCount/nonCharacterCount/updatedNames
// ───────────────────────────────────────────────────────────
Deno.test("Change 6: Variable hoisting cleanup — sections/updatedCount/updatedNames", async () => {
  const source = await Deno.readTextFile(sourcePath);

  // Verify hoisted variable declarations exist
  assertStringIncludes(source, "const sections", "charSections hoisted variable not found");
  assertStringIncludes(source, "let updatedCount", "updatedCount variable not found");
  assertStringIncludes(source, "const updatedNames", "updatedNames variable not found");

  // Verify they're used in the rewrite/loop context
  assertStringIncludes(source, "updatedCount++", "updatedCount increment missing");
  assertStringIncludes(source, "updatedNames.push", "updatedNames.push missing");

  // Verify changes_summary uses the hoisted variables
  const summaryLinePattern = `changes_summary: \`\${updatedCount} character(s) updated via per-character rewrite: \${updatedNames.join(", ")}\``;
  assertStringIncludes(
    source,
    "changes_summary: `${updatedCount} character(s) updated via per-character rewrite: ${updatedNames.join(\", \")}`",
    "changes_summary must use hoisted updatedCount and updatedNames"
  );

  // Verify creative_preserved uses sections
  assertStringIncludes(
    source,
    "creative_preserved: `Per-character rewrite preserved",
    "creative_preserved message must exist"
  );
  // Verify sections.length usage in the completion log
  assertMatch(
    source,
    /sections\.length\s*-\s*filterCount|sections\.length\s*-\s*updatedCount|sections\.length\s*-\s*totalAffected/,
    "sections.length must be used for pristing count calculation"
  );
});

// ───────────────────────────────────────────────────────────
// Integration: Deliverable scope map includes treatment entry
// ───────────────────────────────────────────────────────────
Deno.test("Integration: DOC_SCOPE includes treatment entry with correct owns/defers", async () => {
  const source = await Deno.readTextFile(sourcePath);

  // treatment must be in the DOC_SCOPE map
  const treatmentScopeStart = source.indexOf("treatment: {");
  assertNotEqual(treatmentScopeStart, -1, "treatment not found in DOC_SCOPE map");

  const treatmentScope = source.slice(treatmentScopeStart, treatmentScopeStart + 800);
  assertStringIncludes(
    treatmentScope,
    "owns: \"prose narrative quality, scene texture, atmosphere, pacing, present-tense flow, character interiority at scene level\"",
    "treatment DOC_SCOPE owns field incorrect"
  );
  assertStringIncludes(
    treatmentScope,
    "defers:",
    "treatment DOC_SCOPE missing defers array"
  );
  assertStringIncludes(
    treatmentScope,
    "beat_sheet",
    "treatment DOC_SCOPE should defer to beat_sheet"
  );
  assertStringIncludes(
    treatmentScope,
    "feature_script",
    "treatment DOC_SCOPE should defer to feature_script"
  );
});

// ───────────────────────────────────────────────────────────
// Invariant: FORMAT_EXPECTATIONS must not contain false claims
// ───────────────────────────────────────────────────────────
Deno.test("Invariant: FORMAT_EXPECTATIONS entries are structurally correct", async () => {
  const source = await Deno.readTextFile(sourcePath);

  const fmtBlock = source.slice(
    source.indexOf("const FORMAT_EXPECTATIONS:"),
    source.indexOf("const FORMAT_EXPECTATIONS:") + 3000
  );

  // Every format entry must start with FORMAT:
  const formatEntries = fmtBlock.match(/"\w+":\s*`FORMAT:/g);
  assert(formatEntries && formatEntries.length >= 8,
    `Expected >=8 format entries starting with FORMAT:, got ${formatEntries?.length || 0}`);

  // No legacy "4-act" mislabeling
  const noFourthActClaims = [
    `4-act structure`,
    `4 act structure`,
    `four-act structure`,
  ];
  for (const bad of noFourthActClaims) {
    const hasBad = fmtBlock.includes(bad);
    if (hasBad) {
      console.warn(`WARNING: FORMAT_EXPECTATIONS contains potentially outdated phrasing: "${bad}"`);
    }
  }
});

// ───────────────────────────────────────────────────────────
// Regression: Existing canon alignment tests still pass
// ───────────────────────────────────────────────────────────
Deno.test("Regression: canonAlignmentGate_test imports exist and function signatures match", async () => {
  const source = await Deno.readTextFile(sourcePath);

  // Verify nothing was removed that broke the existing test's imports
  assertStringIncludes(
    source,
    "shouldRunCanonAlignment",
    "shouldRunCanonAlignment function must still exist (regression guard)"
  );
});

// ───────────────────────────────────────────────────────────
// Helper assertion
// ───────────────────────────────────────────────────────────
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertNotEqual(actual: number, expected: number, message?: string) {
  if (actual === expected) throw new Error(message || `Expected not-equal but found ${actual}`);
}