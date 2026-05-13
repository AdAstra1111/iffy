
import { deduplicateConceptBriefSections } from "./deduplicateConceptBriefSections.ts";

// Test 1: Protagonistic Villain
const t1 = [
  "## Protagonist", "John Doe is our hero.",
  "",
  "## Protagonistic Villain", "This antagonist seems heroic.",
  "",
  "## Stakes", "The fate of the world.",
].join("\n");
const r1 = deduplicateConceptBriefSections(t1);
console.log("=== T1 output ===");
console.log(r1);
console.log("---");
console.log("Lines:");
r1.split("\n").forEach((l, i) => console.log(i + ": " + JSON.stringify(l)));

// Test 2: Tonal Shifts
const t2 = [
  "## Tone & Atmosphere", "Dark and moody.",
  "",
  "## Tonal Shifts", "The story moves from comedy to tragedy.",
].join("\n");
const r2 = deduplicateConceptBriefSections(t2);
console.log("\n=== T2 output ===");
console.log(r2);
console.log("---");
r2.split("\n").forEach((l, i) => console.log(i + ": " + JSON.stringify(l)));

// Test 3: Thematic Throughline
const t3 = [
  "## Themes", "Identity, belonging.",
  "",
  "## Thematic Throughline", "The journey from innocence to experience.",
].join("\n");
const r3 = deduplicateConceptBriefSections(t3);
console.log("\n=== T3 output ===");
console.log(r3);

// Test 4: Protagonist's Allies
const t4 = [
  "## Protagonist", "Main character details.",
  "",
  "## Protagonist's Allies", "Sidekick info.",
  "",
  "## Stakes", "What's at risk.",
].join("\n");
const r4 = deduplicateConceptBriefSections(t4);
console.log("\n=== T4 output ===");
console.log(r4);

// Test 5: Thematic Elements
const t5 = [
  "## Themes", "Love and loss.",
  "",
  "## Thematic Elements", "Recurring motifs.",
].join("\n");
const r5 = deduplicateConceptBriefSections(t5);
console.log("\n=== T5 output ===");
console.log(r5);
