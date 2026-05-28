/**
 * Tests for enrich-visual-dna-from-atoms — deepMergeIdentity and data mapping pure functions.
 *
 * Covers:
 *   1. deepMergeIdentity — simple key overwrite
 *   2. deepMergeIdentity — nested object merge (shallow merge of sub-objects)
 *   3. deepMergeIdentity — atom traits overwrite matching keys
 *   4. deepMergeIdentity — novel keys append, existing preserved
 *   5. deepMergeIdentity — null/undefined atom values are skipped
 *   6. deepMergeIdentity — Date string update for derived_at
 *   7. deepMergeIdentity — source always set to "atom_enrichment"
 *   8. deepMergeIdentity — non-object primitives replace entirely
 *   9. deepMergeIdentity — empty object atom returns existing unchanged
 *  10. deepMergeIdentity — array values replace (not merged)
 *  11. Status mode mapping — visualComplexity > status_expression_mode
 *  12. Status mode mapping — edge: missing/empty complexity defaults to "spatial"
 */

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ══════════════════════════════════════════════════════════════════════════════
// Types (mirrored from index.ts)
// ══════════════════════════════════════════════════════════════════════════════

interface IdentitySignature {
  face: Record<string, any>;
  body: Record<string, any>;
  silhouette: Record<string, any>;
  wardrobe: Record<string, any>;
  derived_at: string;
  source: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Functions under test (mirrored from index.ts)
// ══════════════════════════════════════════════════════════════════════════════

function deepMergeIdentity(existing: Record<string, any>, atom: Record<string, any>): Record<string, any> {
  const result = { ...existing };
  for (const [key, value] of Object.entries(atom)) {
    if (!value) continue;
    if (typeof value === "object" && !Array.isArray(value) && value !== null) {
      result[key] = { ...(result[key] || {}), ...value };
    } else {
      result[key] = value;
    }
  }
  result.derived_at = atom.derived_at || new Date().toISOString();
  result.source = "atom_enrichment";
  return result;
}

function deriveStatusExpressionMode(visualComplexity: string | undefined): string {
  const clean = (visualComplexity || "").toLowerCase();
  if (clean.includes("high") || clean.includes("complex")) return "ornamental";
  if (clean.includes("medium") || clean.includes("moderate")) return "material";
  if (clean.includes("austere") || clean.includes("minimal")) return "austere";
  return "spatial";
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

function makeExisting(overrides: Partial<IdentitySignature> = {}): IdentitySignature {
  return {
    face: { eyes: "brown", skin_tone: "fair" },
    body: { build: "athletic", height_estimate: "6ft" },
    silhouette: { physical_markings: null },
    wardrobe: { wardrobe_notes: "casual" },
    derived_at: "2025-01-01T00:00:00Z",
    source: "previous_extraction",
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. deepMergeIdentity — simple key overwrite
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("deepMergeIdentity: simple string value overwrites existing key", () => {
  const existing = { name: "old", age: "30s" };
  const atom = { name: "new" };
  const result = deepMergeIdentity(existing, atom);
  assertEquals(result.name, "new", "atom value should overwrite");
  assertEquals(result.age, "30s", "other keys preserved");
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. deepMergeIdentity — nested object merge
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("deepMergeIdentity: nested object merges shallowly", () => {
  const existing = { face: { eyes: "brown", skin_tone: "fair" } };
  const atom = { face: { eyes: "blue", distinctive_features: "scar" } };
  const result = deepMergeIdentity(existing, atom);
  assertEquals(result.face.eyes, "blue", "atom eyes overwrites existing eyes");
  assertEquals(result.face.skin_tone, "fair", "skin_tone preserved from existing");
  assertEquals(result.face.distinctive_features, "scar", "novel key appended");
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. deepMergeIdentity — atom overwrites matching keys
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("deepMergeIdentity: full signature merge with overwrite", () => {
  const existing = makeExisting();
  const atomSig: Partial<IdentitySignature> = {
    face: { eyes: "hazel", skin_tone: "olive", facial_expression_range: "expressive" },
    body: { build: "slim" },
  };
  const result = deepMergeIdentity(existing as any, atomSig as any);
  assertEquals(result.face.eyes, "hazel", "eyes overwritten");
  assertEquals(result.face.skin_tone, "olive", "skin_tone overwritten");
  assertEquals(result.face.facial_expression_range, "expressive", "new face key added");
  assertEquals(result.body.build, "slim", "body.build overwritten");
  assertEquals(result.body.height_estimate, "6ft", "height_estimate preserved");
  assertEquals(result.wardrobe.wardrobe_notes, "casual", "wardrobe unchanged");
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. deepMergeIdentity — novel keys append
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("deepMergeIdentity: novel keys from atom are appended", () => {
  const existing = { a: 1 };
  const atom = { b: 2, c: 3 };
  const result = deepMergeIdentity(existing, atom);
  assertEquals(result.a, 1, "existing key preserved");
  assertEquals(result.b, 2, "novel key appended");
  assertEquals(result.c, 3, "novel key appended");
});

Deno.test("deepMergeIdentity: new nested key added when existing has undefined for that key", () => {
  const existing: Record<string, any> = { body: { build: "athletic" } };
  const atom = { body: { movement_gait: "graceful" } };
  const result = deepMergeIdentity(existing, atom);
  assert(result.body, "body exists");
  assertEquals(result.body.build, "athletic");
  assertEquals(result.body.movement_gait, "graceful");
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. deepMergeIdentity — null/undefined atom values are skipped
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("deepMergeIdentity: null atom value is skipped", () => {
  const existing = { name: "existing" };
  const atom = { name: null, other: null };
  const result = deepMergeIdentity(existing, atom);
  assertEquals(result.name, "existing", "null value should not overwrite");
});

Deno.test("deepMergeIdentity: undefined atom value is skipped", () => {
  const existing = { name: "existing" };
  const atom: Record<string, any> = { name: undefined };
  const result = deepMergeIdentity(existing, atom);
  assertEquals(result.name, "existing", "undefined should not overwrite");
});

Deno.test("deepMergeIdentity: empty string atom value is skipped", () => {
  const existing = { name: "existing" };
  const atom = { name: "" };
  const result = deepMergeIdentity(existing, atom);
  assertEquals(result.name, "existing", "empty string is falsy, skipped");
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. deepMergeIdentity — derived_at and source always updated
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("deepMergeIdentity: derived_at updated from atom if provided", () => {
  const existing = { name: "test", derived_at: "old-date" };
  const atom = { derived_at: "2025-06-01T00:00:00Z" };
  const result = deepMergeIdentity(existing, atom);
  assertEquals(result.derived_at, "2025-06-01T00:00:00Z", "derived_at from atom");
});

Deno.test("deepMergeIdentity: derived_at set to ISO string if not in atom", () => {
  const existing = { name: "test", derived_at: "old-date" };
  const atom = { name: "new" };
  const result = deepMergeIdentity(existing, atom);
  assert(typeof result.derived_at === "string", "derived_at is a string");
  assert(result.derived_at.length > 0, "derived_at is non-empty");
  // Should be a date string from new Date().toISOString()
  assert(result.derived_at.includes("T") || result.derived_at.length > 10, "looks like ISO date");
});

Deno.test("deepMergeIdentity: source always set to atom_enrichment", () => {
  const existing = { source: "old_source" };
  const result = deepMergeIdentity(existing, {});
  assertEquals(result.source, "atom_enrichment");
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. deepMergeIdentity — non-object primitives replace entirely
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("deepMergeIdentity: number value replaces", () => {
  const existing = { score: 5 };
  const atom = { score: 10 };
  const result = deepMergeIdentity(existing, atom);
  assertEquals(result.score, 10);
});

Deno.test("deepMergeIdentity: boolean value replaces", () => {
  const existing = { active: false };
  const atom = { active: true };
  const result = deepMergeIdentity(existing, atom);
  assertEquals(result.active, true);
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. deepMergeIdentity — empty object atom
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("deepMergeIdentity: empty atom returns existing with updated derived_at/source", () => {
  const existing = { name: "test", derived_at: "old", source: "old" };
  const result = deepMergeIdentity(existing, {});
  assertEquals(result.name, "test", "existing values preserved");
  assertEquals(result.source, "atom_enrichment", "source overwritten");
  assert(result.derived_at !== "old", "derived_at updated");
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. deepMergeIdentity — array values replace (not merged)
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("deepMergeIdentity: array value replaces existing value entirely", () => {
  const existing = { tags: ["a", "b"] };
  const atom = { tags: ["c", "d", "e"] };
  const result = deepMergeIdentity(existing, atom);
  assertEquals(result.tags, ["c", "d", "e"], "arrays replace, not merge");
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. Status mode mapping — visualComplexity to status_expression_mode
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("statusMode: 'high' complexity produces 'ornamental'", () => {
  assertEquals(deriveStatusExpressionMode("high"), "ornamental");
  assertEquals(deriveStatusExpressionMode("highly detailed"), "ornamental");
  assertEquals(deriveStatusExpressionMode("complex architecture"), "ornamental");
});

Deno.test("statusMode: 'medium' complexity produces 'material'", () => {
  assertEquals(deriveStatusExpressionMode("medium"), "material");
  assertEquals(deriveStatusExpressionMode("moderate detail"), "material");
});

Deno.test("statusMode: 'austere' complexity produces 'austere'", () => {
  assertEquals(deriveStatusExpressionMode("austere"), "austere");
  assertEquals(deriveStatusExpressionMode("minimal design"), "austere");
});

Deno.test("statusMode: missing/empty complexity defaults to 'spatial'", () => {
  assertEquals(deriveStatusExpressionMode(undefined), "spatial");
  assertEquals(deriveStatusExpressionMode(""), "spatial");
  assertEquals(deriveStatusExpressionMode("unknown"), "spatial");
  assertEquals(deriveStatusExpressionMode("lush"), "spatial");
});

Deno.test("statusMode: case-insensitive matching", () => {
  assertEquals(deriveStatusExpressionMode("HIGH"), "ornamental");
  assertEquals(deriveStatusExpressionMode("Medium"), "material");
  assertEquals(deriveStatusExpressionMode("AUSTERE"), "austere");
  assertEquals(deriveStatusExpressionMode("MINIMAL"), "austere");
});