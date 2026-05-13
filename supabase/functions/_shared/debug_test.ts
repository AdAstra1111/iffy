/**
 * Debug script for deduplicateConceptBriefSections failures
 */
import { deduplicateConceptBriefSections } from "./deduplicateConceptBriefSections.ts";

// Test: content before first ## heading
console.log("=== CONTENT BEFORE FIRST HEADING ===");
const text = `# Concept Brief

Some introductory paragraph about the project.

## Logline
A hero emerges.

## Stakes
The fate of everything.`;

const result = deduplicateConceptBriefSections(text);
console.log("OUTPUT length:", result.length);
console.log("starts with # Concept Brief:", result.startsWith("# Concept Brief"));
console.log("includes 'Some introductory':", result.includes("Some introductory paragraph"));

// Test: case variations
console.log("\n=== CASE VARIATIONS ===");
const text2 = [
  "## protagonist",
  "Lowercase protagonist content.",
  "",
  "## STAKES",
  "Uppercase stakes content.",
  "",
  "## Premise",
  "Normal case premise.",
  "",
  "## TONE & ATMOSPHERE",
  "Loud and clear.",
].join("\n");
const result2 = deduplicateConceptBriefSections(text2);
console.log("OUTPUT:", JSON.stringify(result2));
console.log("includes 'lowercase protagonist content':", result2.includes("lowercase protagonist content"));
console.log("includes 'uppercase stakes content':", result2.includes("uppercase stakes content"));

// Test: ## Protagonistic Villain
console.log("\n=== PROTAGONISTIC VILLAIN ===");
const text3 = [
  "## Protagonist",
  "John Doe is our hero.",
  "",
  "## Protagonistic Villain",
  "This antagonist seems heroic.",
  "",
  "## Stakes",
  "The fate of the world.",
].join("\n");
const result3 = deduplicateConceptBriefSections(text3);
console.log("OUTPUT:", JSON.stringify(result3));
const protoCount = (result3.match(/^## Protagonist$/m) || []).length;
console.log("## Protagonist count:", protoCount);

// Test: 14 valid headings
console.log("\n=== 14 VALID HEADINGS ===");
const headingTexts = [
  "## Logline", "## Genre & Subgenre", "## Premise",
  "## Protagonist", "## Opposition",
  "## Key Relationships", "## World Building",
  "## Central Conflict", "## Stakes",
  "## Tone & Atmosphere", "## Themes",
  "## Audience & Market", "## Unique Hook",
  "## Visual & Sensory Palette",
];
const sections = headingTexts.map(h => h + "\n" + "Content for this section.");
const text4 = sections.join("\n\n");
const result4 = deduplicateConceptBriefSections(text4);
for (const h of headingTexts) {
  const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const count = (result4.match(new RegExp("^" + escaped + "$", "m")) || []).length;
  const status = count === 1 ? "OK" : "FAIL";
  console.log(`${h}: count=${count} -> ${status}`);
}

// Test: ## Tone matches tone_and_style (alias)
console.log("\n=== TONE ALIAS ===");
const text5 = [
  "## Tone & Atmosphere",
  "Dark and brooding.",
  "",
  "## Tone",
  "Moody and atmospheric.",
].join("\n");
const result5 = deduplicateConceptBriefSections(text5);
console.log("OUTPUT:", JSON.stringify(result5));
const toneCount = (result5.match(/^## Tone & Atmosphere$/m) || []).length;
const toneAliasCount = (result5.match(/^## Tone$/m) || []).length;
console.log("## Tone & Atmosphere count:", toneCount);
console.log("## Tone count:", toneAliasCount);
console.log("includes 'Moody and atmospheric':", result5.includes("Moody and atmospheric"));
