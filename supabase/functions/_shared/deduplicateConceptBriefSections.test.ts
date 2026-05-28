/**
 * Unit tests for deduplicateConceptBriefSections — regex-based section dedup.
 *
 * Key scenarios:
 * - ## Protagonistic Villain should NOT match protagonist section key
 * - ## Tonal Shifts should NOT match tone_and_style section key
 * - ## Thematic Throughline should NOT match themes section key
 * - ## Stakes and Consequences SHOULD match stakes (semantically correct)
 * - All valid headings still match: ## Protagonist, ## Stakes, ## Tone & Atmosphere, ## Themes
 * - Dedup keeps last occurrence of each section key
 * - Unmatched ## headings are folded into preceding valid section content
 * - Empty or invalid input returns unchanged
 * - Non-concept_brief doc types pass through unchanged
 *
 * Note about folding: unmatched headings are folded into the preceding valid
 * section's content. Their heading text still appears VERBATIM in the output
 * (preserved as sub-text inside the section). Tests check section-level
 * dedup behavior, not post-folding output layout.
 */

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { deduplicateConceptBriefSections } from "./deduplicateConceptBriefSections.ts";

// ─── Helpers ───

/** Count exact heading occurrences in output using regex (multiline, anchored). */
function countHeading(heading: string, text: string): number {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("^" + escaped + "$", "m");
  return (text.match(re) || []).length;
}

// ─── 1. Edge case: empty / null / non-string input ───

Deno.test("dedup: empty string returns empty string", () => {
  assertEquals(deduplicateConceptBriefSections(""), "");
});

Deno.test("dedup: null returns null", () => {
  assertEquals(deduplicateConceptBriefSections(null as unknown as string), null);
});

Deno.test("dedup: undefined returns undefined", () => {
  assertEquals(deduplicateConceptBriefSections(undefined as unknown as string), undefined);
});

Deno.test("dedup: non-string type returns unchanged", () => {
  const result = deduplicateConceptBriefSections(42 as unknown as string);
  assertEquals(result, 42);
});

// ─── 2. No ## headings — pass through ───

Deno.test("dedup: no ## headings returns unchanged", () => {
  const text = "# Logline\n\nSome content here.\n\n# Genre\n\nMore content.";
  assertEquals(deduplicateConceptBriefSections(text), text);
});

Deno.test("dedup: plain text with no headings returns unchanged", () => {
  const text = "Plain text with no markdown headings at all.\nJust some narrative content.";
  assertEquals(deduplicateConceptBriefSections(text), text);
});

// ─── 3. Primary use case — single occurrence of each valid heading ───

Deno.test("dedup: single occurrence of each valid heading passes through intact", () => {
  const text = [
    "## Logline", "A hero rises.",
    "",
    "## Genre & Subgenre", "Sci-fi action.",
    "",
    "## Premise", "What if everyone had superpowers?",
    "",
    "## Protagonist", "John Doe, the reluctant hero.",
    "",
    "## Opposition", "The evil corporation.",
    "",
    "## Key Relationships", "Family ties.",
    "",
    "## World Building", "Futuristic city.",
    "",
    "## Central Conflict", "Man vs machine.",
    "",
    "## Stakes", "The fate of humanity.",
    "",
    "## Tone & Atmosphere", "Dark and gritty.",
    "",
    "## Themes", "Identity and belonging.",
    "",
    "## Audience & Market", "Young adults.",
    "",
    "## Unique Hook", "Time travel twist.",
    "",
    "## Visual & Sensory Palette", "Neon and chrome.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## Logline", result), 1);
  assertEquals(countHeading("## Genre & Subgenre", result), 1);
  assertEquals(countHeading("## Protagonist", result), 1);
  assertEquals(countHeading("## Opposition", result), 1);
  assertEquals(countHeading("## Stakes", result), 1);
  assertEquals(countHeading("## Tone & Atmosphere", result), 1);
  assertEquals(countHeading("## Themes", result), 1);
  assertEquals(countHeading("## Audience & Market", result), 1);
});

// ─── 4. Protagonistic Villain should NOT match protagonist ───

Deno.test("dedup: ## Protagonistic Villain does NOT match protagonist section key", () => {
  const text = [
    "## Protagonist", "John Doe is our hero.",
    "",
    "## Protagonistic Villain", "This antagonist seems heroic.",
    "",
    "## Stakes", "The fate of the world.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  // "## Protagonist" appears exactly once (not deduped by Protagonistic Villain)
  assertEquals(countHeading("## Protagonist", result), 1);
  // Content preserved
  assertEquals(result.includes("John Doe is our hero."), true);
  assertEquals(result.includes("This antagonist seems heroic"), true);
  // "## Protagonistic Villain" was correctly NOT matched as protagonist key
  // It was folded into the protagonist section (its text is preserved in content)
  assertEquals(result.includes("Protagonistic Villain"), true);
});

// ─── 5. Tonal Shifts should NOT match tone_and_style ───

Deno.test("dedup: ## Tonal Shifts does NOT match tone_and_style section key", () => {
  const text = [
    "## Tone & Atmosphere", "Dark and moody with flashes of hope.",
    "",
    "## Tonal Shifts", "The story moves from comedy to tragedy.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## Tone & Atmosphere", result), 1);
  assertEquals(result.includes("Tonal Shifts"), true);
  assertEquals(result.includes("The story moves from comedy to tragedy"), true);
  // "## Tonal Shifts" was folded — not treated as a duplicate tone_and_style section
  assertEquals(result.includes("Dark and moody"), true);
});

// ─── 6. Thematic Throughline should NOT match themes ───

Deno.test("dedup: ## Thematic Throughline does NOT match themes section key", () => {
  const text = [
    "## Themes", "Identity, belonging, and transformation.",
    "",
    "## Thematic Throughline", "The journey from innocence to experience.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## Themes", result), 1);
  assertEquals(result.includes("Thematic Throughline"), true);
  assertEquals(result.includes("Identity, belonging"), true);
});

// ─── 7. Stakes and Consequences SHOULD match stakes ───

Deno.test("dedup: ## Stakes and Consequences matches stakes key (semantically correct)", () => {
  const text = [
    "## Stakes", "The world hangs in the balance.",
    "",
    "## Stakes and Consequences", "Every action has a price.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## Stakes and Consequences", result), 1);
  assertEquals(countHeading("## Stakes", result), 0);
  assertEquals(result.includes("Every action has a price"), true);
  assertEquals(result.includes("The world hangs in the balance"), false);
});

// ─── 8. Dedup keeps LAST occurrence of each section key ───

Deno.test("dedup: duplicate ## Stakes keeps LAST occurrence header and content", () => {
  const text = [
    "## Stakes", "OLD: The fate of humanity.",
    "",
    "## Stakes", "NEW: The fate of the entire galaxy.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## Stakes", result), 1);
  assertEquals(result.includes("entire galaxy"), true);
  assertEquals(result.includes("OLD: The fate of humanity"), false);
});

Deno.test("dedup: duplicate ## Protagonist keeps LAST occurrence content", () => {
  const text = [
    "## Premise", "What if everyone had powers?",
    "",
    "## Protagonist", "OLD: John Doe.",
    "",
    "## Protagonist", "NEW: Jane Smith.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## Protagonist", result), 1);
  assertEquals(result.includes("Jane Smith"), true);
  assertEquals(result.includes("OLD: John Doe"), false);
});

Deno.test("dedup: duplicate ## Themes keeps LAST occurrence content", () => {
  const text = [
    "## Premise", "Some premise.",
    "",
    "## Themes", "OLD: Redemption.",
    "",
    "## Themes", "NEW: Sacrifice.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## Themes", result), 1);
  assertEquals(result.includes("Sacrifice"), true);
  assertEquals(result.includes("OLD: Redemption"), false);
});

// ─── 9. Complex scenario — multiple duplicates, interleaving ───

Deno.test("dedup: multiple duplicate sections with interleaving", () => {
  const text = [
    "## Protagonist", "First protagonist version.",
    "",
    "## Stakes", "First stakes version.",
    "",
    "## Protagonist", "Second protagonist version — should win.",
    "",
    "## Themes", "First themes version.",
    "",
    "## Stakes", "Second stakes version — should win.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## Protagonist", result), 1);
  assertEquals(countHeading("## Stakes", result), 1);
  assertEquals(countHeading("## Themes", result), 1);
  assertEquals(result.includes("Second protagonist version"), true);
  assertEquals(result.includes("Second stakes version"), true);
  assertEquals(result.includes("First protagonist"), false);
  assertEquals(result.includes("First stakes"), false);
});

// ─── 10. Unmatched heading folded into preceding valid section ───

Deno.test("dedup: ## Tonal Shifts folded into preceding Tone & Atmosphere section", () => {
  const text = [
    "## Tone & Atmosphere", "Dark and gritty.",
    "",
    "## Tonal Shifts", "How the mood changes.",
    "",
    "## Stakes", "Life or death.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## Tone & Atmosphere", result), 1);
  assertEquals(countHeading("## Stakes", result), 1);
  // Content of Tonal Shifts is preserved inside Tone & Atmosphere section
  assertEquals(result.includes("Tonal Shifts"), true);
  assertEquals(result.includes("How the mood changes"), true);
});

// ─── 11. Unmatched heading before first valid section is kept as-is ───

Deno.test("dedup: unmatched heading before first valid section preserved", () => {
  const text = [
    "## Preamble Header", "Some notes before the real content.",
    "",
    "## Protagonist", "The hero arrives.",
    "",
    "## Stakes", "The danger.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## Preamble Header", result), 1);
  assertEquals(countHeading("## Protagonist", result), 1);
  assertEquals(countHeading("## Stakes", result), 1);
  assertEquals(result.includes("Some notes before"), true);
});

// ─── 12. All valid headings still match correctly ───

Deno.test("dedup: all 14 valid concept_brief headings still match", () => {
  const headingTexts = [
    "## Logline", "## Genre & Subgenre", "## Premise",
    "## Protagonist", "## Opposition",
    "## Key Relationships", "## World Building",
    "## Central Conflict", "## Stakes",
    "## Tone & Atmosphere", "## Themes",
    "## Audience & Market", "## Unique Hook",
    "## Visual & Sensory Palette",
  ];
  const sections = headingTexts.map(h => h + "\nContent for this section.");
  const text = sections.join("\n\n");
  const result = deduplicateConceptBriefSections(text);

  for (const heading of headingTexts) {
    assertEquals(
      countHeading(heading, result),
      1,
      `Expected exactly 1 occurrence of "${heading}"`,
    );
  }
});

// ─── 13. Case variations still match valid headings ───

Deno.test("dedup: case variations still match valid headings", () => {
  const text = [
    "## protagonist", "Lowercase protagonist content.",
    "",
    "## STAKES", "Uppercase stakes content.",
    "",
    "## Premise", "Normal case premise.",
    "",
    "## TONE & ATMOSPHERE", "Loud and clear.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## protagonist", result), 1);
  assertEquals(countHeading("## STAKES", result), 1);
  assertEquals(countHeading("## Premise", result), 1);
  assertEquals(countHeading("## TONE & ATMOSPHERE", result), 1);
  assertEquals(result.includes("Lowercase protagonist content"), true);
  assertEquals(result.includes("Uppercase stakes content"), true);
  assertEquals(result.includes("Normal case premise"), true);
  assertEquals(result.includes("Loud and clear"), true);
});

// ─── 14. Invariant: no duplicate section keys survive dedup ───

Deno.test("dedup: invariant — no duplicate section keys after 3 rounds of all sections", () => {
  const headingTexts: Record<string, string> = {
    logline: "## Logline", genre: "## Genre & Subgenre", premise: "## Premise",
    protagonist: "## Protagonist", opposition: "## Opposition",
    key_relationships: "## Key Relationships", world_building_notes: "## World Building",
    central_conflict: "## Central Conflict", stakes: "## Stakes",
    tone_and_style: "## Tone & Atmosphere", themes: "## Themes",
    audience: "## Audience & Market", unique_hook: "## Unique Hook",
    visual_palette: "## Visual & Sensory Palette",
  };
  const parts: string[] = [];
  for (let round = 1; round <= 3; round++) {
    for (const [, heading] of Object.entries(headingTexts)) {
      parts.push(heading + "\nContent from round " + round + ".");
    }
  }
  const text = parts.join("\n\n");
  const result = deduplicateConceptBriefSections(text);

  for (const [, heading] of Object.entries(headingTexts)) {
    assertEquals(
      countHeading(heading, result),
      1,
      "Expected exactly 1 of <" + heading + "> after dedup of 3 rounds",
    );
  }
  assertEquals(result.includes("Content from round 3."), true);
  assertEquals(result.includes("Content from round 1."), false);
});

// ─── 15. Content integrity preserved ───

Deno.test("dedup: content after heading is preserved in output", () => {
  const text = [
    "## Premise", "What if dogs could talk? They'd demand better snacks.",
    "",
    "## Protagonist", "A golden retriever named Einstein.",
    "",
    "## Stakes", "The Great Bone Shortage of 2024.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(result.includes("What if dogs could talk? They'd demand better snacks."), true);
  assertEquals(result.includes("A golden retriever named Einstein."), true);
  assertEquals(result.includes("The Great Bone Shortage of 2024."), true);
});

// ─── 16. Realistic pipeline output — chunk duplicates ───

Deno.test("dedup: realistic pipeline artifact with chunk duplicates", () => {
  const text = [
    "## Premise", "In a world where emotions are currency...",
    "",
    "## Protagonist", "Chloe, an empathy banker.",
    "",
    "## Stakes", "The emotional economy is collapsing.",
    "",
    "## Protagonist", "Chloe must save the empathy exchange before it crashes.",
    "",
    "## Themes", "Connection, value, humanity.",
    "",
    "## Tone & Atmosphere", "Warm but tense.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## Protagonist", result), 1);
  assertEquals(result.includes("Chloe must save the empathy exchange"), true);
  assertEquals(result.includes("empathy banker"), false);
  assertEquals(countHeading("## Premise", result), 1);
  assertEquals(countHeading("## Stakes", result), 1);
  assertEquals(countHeading("## Themes", result), 1);
  assertEquals(countHeading("## Tone & Atmosphere", result), 1);
});

// ─── 17. ## Thematic does NOT match ## Themes ───

Deno.test("dedup: ## Thematic Elements does NOT match ## Themes, folded correctly", () => {
  const text = [
    "## Themes", "Love and loss.",
    "",
    "## Thematic Elements", "Recurring motifs and symbols throughout the story.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## Themes", result), 1);
  assertEquals(result.includes("Thematic Elements"), true);
  assertEquals(result.includes("Recurring motifs and symbols"), true);
});

// ─── 18. ## Tone as alias for Tone & Atmosphere ───

Deno.test("dedup: ## Tone matches tone_and_style key, last occurrence wins", () => {
  const text = [
    "## Tone & Atmosphere", "Dark and brooding.",
    "",
    "## Tone", "Moody and atmospheric.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## Tone", result), 1);
  assertEquals(countHeading("## Tone & Atmosphere", result), 0);
  assertEquals(result.includes("Moody and atmospheric"), true);
  assertEquals(result.includes("Dark and brooding"), false);
});

// ─── 19. ## Theme (singular) matches themes key ───

Deno.test("dedup: ## Theme (singular) matches themes key", () => {
  const text = [
    "## Themes", "Multiple themes explored.",
    "",
    "## Theme", "A single core theme emerges.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## Theme", result), 1);
  assertEquals(countHeading("## Themes", result), 0);
  assertEquals(result.includes("A single core theme emerges"), true);
});

// ─── 20. ## Genre (bare) matches genre key ───

Deno.test("dedup: ## Genre (bare) matches genre key", () => {
  const text = [
    "## Genre & Subgenre", "Sci-fi thriller.",
    "",
    "## Genre", "Core genre: Science Fiction.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## Genre", result), 1);
  assertEquals(countHeading("## Genre & Subgenre", result), 0);
  assertEquals(result.includes("Core genre: Science Fiction"), true);
});

// ─── 21. Only non-matching headings ───

Deno.test("dedup: only non-matching headings preserved as-is", () => {
  const text = [
    "## Random Heading", "Some content.",
    "",
    "## Another Unknown", "More content.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## Random Heading", result), 1);
  assertEquals(countHeading("## Another Unknown", result), 1);
  assertEquals(result.includes("Some content."), true);
  assertEquals(result.includes("More content."), true);
});

// ─── 22. Code blocks with ## inside ───

Deno.test("dedup: ## inside code blocks are not treated as headings", () => {
  const text = [
    "## Premise", "Here is some code:",
    "```",
    "## this is not a heading",
    'print("hello")',
    "```",
    "",
    "## Stakes", "The danger.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  assertEquals(countHeading("## Premise", result), 1);
  assertEquals(countHeading("## Stakes", result), 1);
  assertEquals(result.includes('print("hello")'), true);
  assertEquals(result.includes("## this is not a heading"), true);
});

// ─── 23. Preamble content before first ## heading is preserved ───

Deno.test("dedup: preamble content before first ## heading is preserved", () => {
  const text = [
    "# Concept Brief",
    "",
    "Some intro text.",
    "",
    "## Logline",
    "A logline.",
    "",
    "## Premise",
    "A premise.",
  ].join("\n");

  const result = deduplicateConceptBriefSections(text);
  // Preamble content (# Concept Brief + intro text) must be preserved
  assertEquals(result.startsWith("# Concept Brief"), true);
  assertEquals(result.includes("Some intro text."), true);
  // Section headings still present
  assertEquals(result.includes("## Logline"), true);
  assertEquals(result.includes("## Premise"), true);
  assertEquals(result.includes("A logline."), true);
  assertEquals(result.includes("A premise."), true);
});
