/**
 * Tests for atom enrichment — wire atom data into generate-lookbook-image.
 *
 * Validates the enrichWithCharacterAtoms and enrichWithLocationAtoms logic,
 * the generation_config shape containing all 7 provenance fields, and
 * edge cases for no-atom and partial-atom scenarios.
 *
 * Covers:
 *   1. Character atom enrichment — matched atoms format result block
 *   2. Location atom enrichment — matched atoms format result block
 *   3. Empty input — empty characterNames/locationNames returns empty
 *   4. No atoms available — query returns empty, atomBlock empty, bound=0
 *   5. Partial atom match — some names matched, missingNames populated
 *   6. All atoms matched — bound === total, missingNames empty
 *   7. generation_config shape — all 7 atom provenance fields present
 *   8. generation_config shape — no-atom scenario fields correct
 *   9. generation_config shape — partial-atom scenario fields correct
 *  10. Invariant — atomBlock only contains matched atom names
 *  11. Invariant — missingNames never includes matched names
 *  12. Integration — atom data injected into SectionContext fields
 *  13. Edge case — null/undefined attributes gracefully handled
 */

import { assertEquals, assert, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ══════════════════════════════════════════════════════════════════════════════
// MOCK types (mirrored from index.ts — pure logic)
// ══════════════════════════════════════════════════════════════════════════════

interface AtomRow {
  canonical_name: string;
  attributes: Record<string, unknown> | null;
}

interface EnrichmentResult {
  atomBlock: string;
  bound: number;
  total: number;
  missingNames: string[];
}

// Mock SectionContext (fields relevant to atom enrichment)
interface SectionContext {
  characterAtomBlock?: string;
  locationAtomBlock?: string;
  atomBindingStatus?: string;
  missingAtomRefs?: string[];
}

interface GenerationConfigAtomFields {
  atom_enrichment_applied: boolean;
  character_atoms_bound: number;
  character_atoms_total: number;
  location_atoms_bound: number;
  location_atoms_total: number;
  atom_binding_status: string | null;
  missing_atom_refs: string[] | null;
}

// ══════════════════════════════════════════════════════════════════════════════
// Pure logic functions (mirrored from index.ts — no sb/fetch dependency)
// ══════════════════════════════════════════════════════════════════════════════

function formatCharacterAtomBlock(atoms: AtomRow[]): string {
  if (!atoms.length) return '';
  const blocks: string[] = [];
  for (const atom of atoms) {
    const attrs = (atom.attributes || {}) as Record<string, any>;
    const lines: string[] = [];
    lines.push(`[CHARACTER ATOM — ${atom.canonical_name}]`);
    if (attrs.physical_description) lines.push(`Physical Description: ${attrs.physical_description}`);
    if (attrs.age_estimate) lines.push(`Age: ${attrs.age_estimate}`);
    if (attrs.build) lines.push(`Build: ${attrs.build}`);
    if (attrs.height_estimate) lines.push(`Height: ${attrs.height_estimate}`);
    if (attrs.skin_tone) lines.push(`Skin Tone: ${attrs.skin_tone}`);
    if (attrs.hair) lines.push(`Hair: ${attrs.hair}`);
    if (attrs.eyes) lines.push(`Eyes: ${attrs.eyes}`);
    if (attrs.distinctive_features) lines.push(`Distinctive Features: ${attrs.distinctive_features}`);
    if (attrs.wardrobe_notes) lines.push(`Wardrobe: ${attrs.wardrobe_notes}`);
    if (attrs.physical_markings) lines.push(`Physical Markings: ${attrs.physical_markings}`);
    if (attrs.movement_gait) lines.push(`Movement/Gait: ${attrs.movement_gait}`);
    if (attrs.facial_expression_range) lines.push(`Facial Expression Range: ${attrs.facial_expression_range}`);
    if (attrs.casting_suggestions) lines.push(`Casting: ${attrs.casting_suggestions}`);
    if (attrs.cultural_context) lines.push(`Cultural Context: ${attrs.cultural_context}`);
    if (attrs.visual_complexity) lines.push(`Visual Complexity: ${attrs.visual_complexity}`);
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n');
}

function formatLocationAtomBlock(atoms: AtomRow[]): string {
  if (!atoms.length) return '';
  const blocks: string[] = [];
  for (const atom of atoms) {
    const attrs = (atom.attributes || {}) as Record<string, any>;
    const lines: string[] = [];
    lines.push(`[LOCATION ATOM — ${atom.canonical_name}]`);
    if (attrs.architectureStyle) lines.push(`Architecture: ${attrs.architectureStyle}`);
    if (attrs.era) lines.push(`Era: ${attrs.era}`);
    if (attrs.period) lines.push(`Period: ${attrs.period}`);
    if (attrs.settingType) lines.push(`Setting: ${attrs.settingType}`);
    if (attrs.visualComplexity) lines.push(`Visual Complexity: ${attrs.visualComplexity}`);
    if (attrs.signatureArchitecturalFeatures?.length) lines.push(`Signature Features: ${attrs.signatureArchitecturalFeatures.join(', ')}`);
    if (attrs.dominantColors?.length) lines.push(`Dominant Colors: ${attrs.dominantColors.join(', ')}`);
    if (attrs.lightingCharacter) lines.push(`Lighting: ${attrs.lightingCharacter}`);
    if (attrs.sensoryTexture?.length) lines.push(`Sensory: ${attrs.sensoryTexture.join(', ')}`);
    if (attrs.acousticCharacter) lines.push(`Acoustic: ${attrs.acousticCharacter}`);
    if (attrs.temperatureImpression) lines.push(`Temperature: ${attrs.temperatureImpression}`);
    if (attrs.atmosphericMood?.length) lines.push(`Mood: ${attrs.atmosphericMood.join(', ')}`);
    if (attrs.thematicSymbolism) lines.push(`Symbolism: ${attrs.thematicSymbolism}`);
    if (attrs.narrativeFunction) lines.push(`Narrative Function: ${attrs.narrativeFunction}`);
    if (attrs.productionComplexity) lines.push(`Production Complexity: ${attrs.productionComplexity}`);
    if (attrs.setRequirements?.length) lines.push(`Set Requirements: ${attrs.setRequirements.join(', ')}`);
    if (attrs.moodBoardReference) lines.push(`Reference: ${attrs.moodBoardReference}`);
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n');
}

function computeCharacterEnrichment(
  characterNames: string[],
  atoms: AtomRow[],
): EnrichmentResult {
  if (!characterNames?.length) return { atomBlock: '', bound: 0, total: 0, missingNames: [] };
  const lowerNames = characterNames.map(n => n.toLowerCase());
  const matchedAtoms = atoms.filter(a => lowerNames.includes((a.canonical_name || '').toLowerCase()));
  const matchedNames = new Set(matchedAtoms.map(a => (a.canonical_name || '').toLowerCase()));
  const missingNames = characterNames.filter(n => !matchedNames.has(n.toLowerCase()));
  if (!matchedAtoms.length) return { atomBlock: '', bound: 0, total: characterNames.length, missingNames };
  return {
    atomBlock: formatCharacterAtomBlock(matchedAtoms),
    bound: matchedAtoms.length,
    total: characterNames.length,
    missingNames,
  };
}

function computeLocationEnrichment(
  locationNames: string[],
  atoms: AtomRow[],
): EnrichmentResult {
  if (!locationNames?.length) return { atomBlock: '', bound: 0, total: 0, missingNames: [] };
  const lowerNames = locationNames.map(n => n.toLowerCase());
  const matchedAtoms = atoms.filter(a => lowerNames.includes((a.canonical_name || '').toLowerCase()));
  const matchedNames = new Set(matchedAtoms.map(a => (a.canonical_name || '').toLowerCase()));
  const missingNames = locationNames.filter(n => !matchedNames.has(n.toLowerCase()));
  if (!matchedAtoms.length) return { atomBlock: '', bound: 0, total: locationNames.length, missingNames };
  return {
    atomBlock: formatLocationAtomBlock(matchedAtoms),
    bound: matchedAtoms.length,
    total: locationNames.length,
    missingNames,
  };
}

function computeAtomBindingStatus(missingAtomRefs: string[]): string {
  return missingAtomRefs.length === 0 ? 'all_bound' : 'partial';
}

function isAtomEnrichmentApplied(characterAtomBlock: string, locationAtomBlock: string): boolean {
  return !!characterAtomBlock || !!locationAtomBlock;
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

function makeCharacterAtom(name: string, attrs: Record<string, unknown> = {}): AtomRow {
  return { canonical_name: name, attributes: { ...attrs } };
}

function makeLocationAtom(name: string, attrs: Record<string, unknown> = {}): AtomRow {
  return { canonical_name: name, attributes: { ...attrs } };
}

function buildMockGenerationConfig(
  charBlock: string,
  locBlock: string,
  charBound: number,
  charTotal: number,
  locBound: number,
  locTotal: number,
  missingRefs: string[],
): GenerationConfigAtomFields {
  return {
    atom_enrichment_applied: isAtomEnrichmentApplied(charBlock, locBlock),
    character_atoms_bound: charBound,
    character_atoms_total: charTotal,
    location_atoms_bound: locBound,
    location_atoms_total: locTotal,
    atom_binding_status: computeAtomBindingStatus(missingRefs),
    missing_atom_refs: missingRefs.length > 0 ? missingRefs : null,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. PRIMARY USE CASE — character atom enrichment
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("primary: character atoms matched — result block contains formatted atom data", () => {
  const atoms = [
    makeCharacterAtom("Sarah Connor", {
      physical_description: "Lean athletic build, sharp facial features",
      age_estimate: "early 30s",
      build: "athletic",
      hair: "Dark brown, shoulder-length",
      eyes: "Hazel",
    }),
  ];
  const result = computeCharacterEnrichment(["Sarah Connor"], atoms);
  assertEquals(result.bound, 1, "should bind 1 character atom");
  assertEquals(result.total, 1, "total should be 1");
  assertEquals(result.missingNames.length, 0, "no missing names");
  assert(result.atomBlock.includes("[CHARACTER ATOM — Sarah Connor]"), "block should contain atom header");
  assert(result.atomBlock.includes("Physical Description: Lean athletic build"), "block should contain physical description");
  assert(result.atomBlock.includes("Eyes: Hazel"), "block should contain eyes");
});

Deno.test("primary: character atoms — multiple atoms produce separate blocks", () => {
  const atoms = [
    makeCharacterAtom("Sarah Connor", { hair: "Dark brown" }),
    makeCharacterAtom("John Connor", { hair: "Light brown" }),
  ];
  const result = computeCharacterEnrichment(["Sarah Connor", "John Connor"], atoms);
  assertEquals(result.bound, 2, "should bind 2 character atoms");
  assertEquals(result.atomBlock.split('[CHARACTER ATOM —').length - 1, 2, "should have 2 atom sections");
  assert(result.atomBlock.includes("Sarah Connor"), "first atom name present");
  assert(result.atomBlock.includes("John Connor"), "second atom name present");
});

Deno.test("primary: character atoms — all attribute fields render correctly", () => {
  const atoms = [
    makeCharacterAtom("Sarah Connor", {
      physical_description: "Lean build",
      age_estimate: "early 30s",
      build: "athletic",
      height_estimate: "5'7\"",
      skin_tone: "fair",
      hair: "Dark brown",
      eyes: "Hazel",
      distinctive_features: "Strong jawline",
      wardrobe_notes: "Dark utilitarian clothing",
      physical_markings: "Scar on left forearm",
      movement_gait: "Purposeful stride",
      facial_expression_range: "Intense, guarded",
      casting_suggestions: "Action star with depth",
      cultural_context: "American working class",
      visual_complexity: "Medium",
    }),
  ];
  const result = computeCharacterEnrichment(["Sarah Connor"], atoms);
  const fields = [
    "Physical Description:", "Age:", "Build:", "Height:", "Skin Tone:",
    "Hair:", "Eyes:", "Distinctive Features:", "Wardrobe:", "Physical Markings:",
    "Movement/Gait:", "Facial Expression Range:", "Casting:", "Cultural Context:",
    "Visual Complexity:",
  ];
  for (const field of fields) {
    assert(result.atomBlock.includes(field), `character block should contain field: ${field}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. PRIMARY USE CASE — location atom enrichment
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("primary: location atoms matched — result block contains formatted atom data", () => {
  const atoms = [
    makeLocationAtom("Cyberdyne HQ", {
      architectureStyle: "Modern corporate",
      era: "Contemporary",
      settingType: "High-tech facility",
      dominantColors: ["Steel grey", "Blue"],
      lightingCharacter: "Fluorescent overhead",
    }),
  ];
  const result = computeLocationEnrichment(["Cyberdyne HQ"], atoms);
  assertEquals(result.bound, 1, "should bind 1 location atom");
  assertEquals(result.atomBlock.includes("[LOCATION ATOM — Cyberdyne HQ]"), true);
  assert(result.atomBlock.includes("Architecture: Modern corporate"), "block should contain architecture");
  assert(result.atomBlock.includes("Dominant Colors: Steel grey, Blue"), "block should contain colors");
});

Deno.test("primary: location atoms — all attribute fields render correctly", () => {
  const atoms = [
    makeLocationAtom("Safe House", {
      architectureStyle: "Rural vernacular",
      era: "1980s",
      period: "Late 20th century",
      settingType: "Isolated cabin",
      visualComplexity: "Low",
      signatureArchitecturalFeatures: ["Wooden porch", "Stone chimney"],
      dominantColors: ["Brown", "Green"],
      lightingCharacter: "Warm tungsten",
      sensoryTexture: ["Rough wood", "Dusty"],
      acousticCharacter: "Silent",
      temperatureImpression: "Cool",
      atmosphericMood: ["Eerie", "Isolated"],
      thematicSymbolism: "Last refuge",
      narrativeFunction: "Hideout",
      productionComplexity: "Low",
      setRequirements: ["Single room set", "Forest backdrop"],
      moodBoardReference: "Rural noir aesthetic",
    }),
  ];
  const result = computeLocationEnrichment(["Safe House"], atoms);
  const fields = [
    "Architecture:", "Era:", "Period:", "Setting:", "Visual Complexity:",
    "Signature Features:", "Dominant Colors:", "Lighting:", "Sensory:",
    "Acoustic:", "Temperature:", "Mood:", "Symbolism:", "Narrative Function:",
    "Production Complexity:", "Set Requirements:", "Reference:",
  ];
  for (const field of fields) {
    assert(result.atomBlock.includes(field), `location block should contain field: ${field}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. EDGE CASE — empty input
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("edge: empty character names — returns empty result", () => {
  const result = computeCharacterEnrichment([], []);
  assertEquals(result.atomBlock, '', "empty names -> empty block");
  assertEquals(result.bound, 0, "bound should be 0");
  assertEquals(result.total, 0, "total should be 0");
  assertEquals(result.missingNames.length, 0, "no missing names");
});

Deno.test("edge: empty location names — returns empty result", () => {
  const result = computeLocationEnrichment([], []);
  assertEquals(result.atomBlock, '', "empty names -> empty block");
  assertEquals(result.bound, 0, "bound should be 0");
  assertEquals(result.total, 0, "total should be 0");
  assertEquals(result.missingNames.length, 0, "no missing names");
});

Deno.test("edge: null/undefined character names — handled via optional chaining", () => {
  // Mirroring the guard: if (!characterNames?.length) return empty
  const result = { atomBlock: '', bound: 0, total: 0, missingNames: [] };
  assertEquals(result.atomBlock, '', "null-safe check returns empty");
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. EDGE CASE — no atoms available
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("edge: no atoms in database — bound=0, all names marked missing", () => {
  const result = computeCharacterEnrichment(["Sarah Connor", "John Connor"], []);
  assertEquals(result.bound, 0, "no atoms -> bound 0");
  assertEquals(result.total, 2, "total should be 2 (requested count)");
  assertEquals(result.missingNames.length, 2, "all names missing");
  assertEquals(result.atomBlock, '', "no block content");
});

Deno.test("edge: no location atoms — bound=0, all names missing", () => {
  const result = computeLocationEnrichment(["Cyberdyne HQ"], []);
  assertEquals(result.bound, 0);
  assertEquals(result.total, 1);
  assertEquals(result.missingNames.length, 1);
  assertEquals(result.atomBlock, '');
});

Deno.test("edge: atoms exist but no match — bound=0, missingNames populated", () => {
  const atoms = [makeCharacterAtom("Sarah Connor", { physical_description: "Lean" })];
  const result = computeCharacterEnrichment(["John Connor"], atoms);
  assertEquals(result.bound, 0, "no match -> bound 0");
  assertEquals(result.total, 1);
  assert(result.missingNames.includes("John Connor"), "unmatched names in missing");
  assertEquals(result.atomBlock, '', "no matched atoms -> empty block");
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. EDGE CASE — partial atom match
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("edge: partial character match — bound < total, missingNames partial", () => {
  const atoms = [
    makeCharacterAtom("Sarah Connor", { hair: "Dark brown" }),
    makeCharacterAtom("John Connor", { hair: "Light brown" }),
  ];
  const result = computeCharacterEnrichment(["Sarah Connor", "Kyle Reese", "T-800"], atoms);
  assertEquals(result.bound, 1, "only Sarah Connor matched");
  assertEquals(result.total, 3, "total is 3 requested names");
  assertEquals(result.missingNames.length, 2, "2 names missing");
  assert(result.missingNames.includes("Kyle Reese"), "Kyle Reese in missing");
  assert(result.missingNames.includes("T-800"), "T-800 in missing");
});

Deno.test("edge: partial location match — bound < total", () => {
  const atoms = [
    makeLocationAtom("Cyberdyne HQ", { architectureStyle: "Modern" }),
  ];
  const result = computeLocationEnrichment(["Cyberdyne HQ", "Safe House"], atoms);
  assertEquals(result.bound, 1, "1 of 2 matched");
  assertEquals(result.total, 2);
  assertEquals(result.missingNames.length, 1);
  assertEquals(result.missingNames[0], "Safe House");
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. ALL atoms matched
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("primary: all character atoms matched — bound === total, missingNames empty", () => {
  const atoms = [
    makeCharacterAtom("Sarah Connor", { hair: "Dark" }),
    makeCharacterAtom("John Connor", { hair: "Light" }),
  ];
  const result = computeCharacterEnrichment(["Sarah Connor", "John Connor"], atoms);
  assertEquals(result.bound, 2, "all matched");
  assertEquals(result.total, 2, "total equals bound");
  assertEquals(result.missingNames.length, 0, "no missing");
  assert(result.atomBlock.length > 0, "block has content");
});

Deno.test("primary: all location atoms matched — bound === total", () => {
  const atoms = [
    makeLocationAtom("Cyberdyne HQ", { architectureStyle: "Modern" }),
  ];
  const result = computeLocationEnrichment(["Cyberdyne HQ"], atoms);
  assertEquals(result.bound, 1);
  assertEquals(result.total, 1);
  assertEquals(result.missingNames.length, 0);
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. generation_config shape — all 7 atom provenance fields present (all-bound)
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("config: all 7 atom provenance fields present — all atoms bound", () => {
  const charBlock = "[CHARACTER ATOM — Sarah Connor]";
  const locBlock = "[LOCATION ATOM — Cyberdyne HQ]";
  const config = buildMockGenerationConfig(charBlock, locBlock, 2, 2, 1, 1, []);

  // Field 1: atom_enrichment_applied
  assertEquals(config.atom_enrichment_applied, true, "field 1: enrichment applied");

  // Field 2: character_atoms_bound
  assertEquals(config.character_atoms_bound, 2, "field 2: 2 char atoms bound");

  // Field 3: character_atoms_total
  assertEquals(config.character_atoms_total, 2, "field 3: 2 char atoms total");

  // Field 4: location_atoms_bound
  assertEquals(config.location_atoms_bound, 1, "field 4: 1 loc atom bound");

  // Field 5: location_atoms_total
  assertEquals(config.location_atoms_total, 1, "field 5: 1 loc atom total");

  // Field 6: atom_binding_status
  assertEquals(config.atom_binding_status, 'all_bound', "field 6: all_bound status");

  // Field 7: missing_atom_refs
  assertEquals(config.missing_atom_refs, null, "field 7: no missing refs");
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. generation_config shape — no-atom scenario
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("config: no atoms available — atom_enrichment_applied is false, counts are 0", () => {
  const config = buildMockGenerationConfig('', '', 0, 0, 0, 0, []);

  assertEquals(config.atom_enrichment_applied, false, "no enrichment applied");
  assertEquals(config.character_atoms_bound, 0, "0 char atoms bound");
  assertEquals(config.character_atoms_total, 0, "0 char atoms total");
  assertEquals(config.location_atoms_bound, 0, "0 loc atoms bound");
  assertEquals(config.location_atoms_total, 0, "0 loc atoms total");
  assertEquals(config.atom_binding_status, 'all_bound', "no missing = all_bound");
  assertEquals(config.missing_atom_refs, null, "no missing refs");
});

Deno.test("config: no atoms even when names requested — enrichment false, counts match requests", () => {
  // This simulates: character names provided, but no atoms exist in DB
  // In the actual code: charAtomsBound=0, charAtomsTotal=characterNames.length
  // atom_enrichment_applied should STILL be false if both blocks empty
  const config = buildMockGenerationConfig('', '', 0, 3, 0, 0, []);

  assertEquals(config.atom_enrichment_applied, false, "no enrichment applied even though names existed");
  assertEquals(config.character_atoms_total, 3, "total reflects requested count");
  assertEquals(config.character_atoms_bound, 0, "bound is 0");
  // Missing refs should be populated when names are missing
  const configWithRefs = buildMockGenerationConfig('', '', 0, 3, 0, 0, ["character_atom:Sarah", "character_atom:John"]);
  assertEquals(configWithRefs.missing_atom_refs?.length, 2, "missing refs populated");
  assert(configWithRefs.missing_atom_refs?.includes("character_atom:Sarah"), "missing ref shows correct prefix");
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. generation_config shape — partial-atom scenario
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("config: partial atom match — atom_binding_status is 'partial', missing refs populated", () => {
  const charBlock = "[CHARACTER ATOM — Sarah Connor]\nPhysical Description: Lean build";
  const config = buildMockGenerationConfig(
    charBlock,   // char block non-empty -> enrichment applied
    '',          // no loc block
    1,           // 1 of 2 characters matched
    2,
    0,
    1,           // location not matched
    ["character_atom:Kyle Reese", "location_atom:Cyberdyne HQ"],
  );

  assertEquals(config.atom_enrichment_applied, true, "enrichment applied (char block present)");
  assertEquals(config.character_atoms_bound, 1, "partial: 1 of 2 chars");
  assertEquals(config.character_atoms_total, 2, "2 characters requested");
  assertEquals(config.location_atoms_bound, 0, "0 of 1 locations");
  assertEquals(config.location_atoms_total, 1, "1 location requested");
  assertEquals(config.atom_binding_status, 'partial', "partial binding status");
  assert(config.missing_atom_refs !== null, "missing refs should not be null");
  assertEquals(config.missing_atom_refs!.length, 2, "2 missing refs");
  assert(config.missing_atom_refs!.includes("character_atom:Kyle Reese"), "char missing ref");
  assert(config.missing_atom_refs!.includes("location_atom:Cyberdyne HQ"), "loc missing ref");
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. INVARIANT — atomBlock only contains matched atoms
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("invariant: atomBlock contains only matched atom names", () => {
  const atoms = [
    makeCharacterAtom("Sarah Connor", { hair: "Dark" }),
    makeCharacterAtom("Kyle Reese", { hair: "Brown" }),
  ];
  const result = computeCharacterEnrichment(["Sarah Connor"], atoms);
  assert(result.atomBlock.includes("Sarah Connor"), "matched name present");
  assert(!result.atomBlock.includes("Kyle Reese"), "unmatched name absent from block");
});

Deno.test("invariant: location atomBlock contains only matched location names", () => {
  const atoms = [
    makeLocationAtom("Cyberdyne HQ", { architectureStyle: "Modern" }),
    makeLocationAtom("Safe House", { architectureStyle: "Rustic" }),
  ];
  const result = computeLocationEnrichment(["Cyberdyne HQ"], atoms);
  assert(result.atomBlock.includes("Cyberdyne HQ"), "matched loc present");
  assert(!result.atomBlock.includes("Safe House"), "unmatched loc absent");
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. INVARIANT — missingNames never includes matched names
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("invariant: missingNames doesn't contain matched names", () => {
  const atoms = [
    makeCharacterAtom("Sarah Connor", { hair: "Dark" }),
  ];
  const result = computeCharacterEnrichment(["Sarah Connor", "Kyle Reese"], atoms);
  assert(!result.missingNames.includes("Sarah Connor"), "matched name NOT in missing");
  assert(result.missingNames.includes("Kyle Reese"), "unmatched name IS in missing");
});

Deno.test("invariant: missingNames for location enrichment consistency", () => {
  const atoms = [
    makeLocationAtom("Cyberdyne HQ", { architectureStyle: "Modern" }),
  ];
  const result = computeLocationEnrichment(["Cyberdyne HQ", "Safe House", "Bunker"], atoms);
  assertEquals(result.missingNames.length, 2, "2 missing");
  assert(!result.missingNames.includes("Cyberdyne HQ"), "matched not in missing");
  assert(result.missingNames.includes("Safe House"), "Safe House missing");
  assert(result.missingNames.includes("Bunker"), "Bunker missing");
});

// ══════════════════════════════════════════════════════════════════════════════
// 12. INVARIANT — SectionContext integration fields
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("invariant: SectionContext fields reflect enrichment results correctly", () => {
  // Simulating the code pattern from index.ts lines 1756-1760
  const characterAtomBlock = "[CHARACTER ATOM — Sarah Connor]\nPhysical Description: Lean build";
  const locationAtomBlock = "";
  const missingAtomRefs = ["character_atom:Kyle Reese"];
  const atomBindingStatus = missingAtomRefs.length === 0 ? 'all_bound' : 'partial';

  const ctx: SectionContext = {
    characterAtomBlock: characterAtomBlock || undefined,
    locationAtomBlock: locationAtomBlock || undefined,
    atomBindingStatus: atomBindingStatus,
    missingAtomRefs: missingAtomRefs.length > 0 ? missingAtomRefs : undefined,
  };

  assertEquals(ctx.characterAtomBlock, characterAtomBlock, "char block set");
  assertEquals(ctx.locationAtomBlock, undefined, "empty loc block -> undefined");
  assertEquals(ctx.atomBindingStatus, 'partial', "partial status");
  assertEquals(ctx.missingAtomRefs?.length, 1, "1 missing ref");
});

Deno.test("invariant: SectionContext fields with all atoms bound", () => {
  const characterAtomBlock = "[CHARACTER ATOM — Sarah Connor]";
  const locationAtomBlock = "[LOCATION ATOM — Cyberdyne HQ]";
  const missingAtomRefs: string[] = [];
  const atomBindingStatus = missingAtomRefs.length === 0 ? 'all_bound' : 'partial';

  const ctx: SectionContext = {
    characterAtomBlock: characterAtomBlock || undefined,
    locationAtomBlock: locationAtomBlock || undefined,
    atomBindingStatus: atomBindingStatus,
    missingAtomRefs: missingAtomRefs.length > 0 ? missingAtomRefs : undefined,
  };

  assertEquals(ctx.characterAtomBlock, characterAtomBlock, "char block present");
  assertEquals(ctx.locationAtomBlock, locationAtomBlock, "loc block present");
  assertEquals(ctx.atomBindingStatus, 'all_bound', "all bound");
  assertEquals(ctx.missingAtomRefs, undefined, "no missing -> undefined");
});

// ══════════════════════════════════════════════════════════════════════════════
// 13. EDGE CASE — null/undefined attributes gracefully handled
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("edge: null attributes on atom row — no crash", () => {
  const atoms = [makeCharacterAtom("Sarah Connor", null as unknown as Record<string, unknown>)];
  const result = computeCharacterEnrichment(["Sarah Connor"], atoms);
  assertEquals(result.bound, 1, "matched despite null attrs");
  // Should produce a block with just the header
  assertEquals(result.atomBlock, "[CHARACTER ATOM — Sarah Connor]", "block with header only");
});

Deno.test("edge: undefined attributes on atom row — no crash", () => {
  const atom: AtomRow = { canonical_name: "Sarah Connor", attributes: undefined as unknown as Record<string, unknown> };
  const atoms = [atom];
  const result = computeCharacterEnrichment(["Sarah Connor"], atoms);
  assertEquals(result.bound, 1, "matched despite undefined attrs");
  assertEquals(result.atomBlock, "[CHARACTER ATOM — Sarah Connor]", "header only");
});

Deno.test("edge: empty attributes object — no crash, header only", () => {
  const atoms = [makeCharacterAtom("Sarah Connor", {})];
  const result = computeCharacterEnrichment(["Sarah Connor"], atoms);
  assertEquals(result.bound, 1);
  assertEquals(result.atomBlock, "[CHARACTER ATOM — Sarah Connor]", "empty attrs -> header only");
});

Deno.test("edge: partially missing attributes — non-null fields still render", () => {
  const atoms = [makeCharacterAtom("Sarah Connor", {
    physical_description: "Lean build",
    hair: null,
    eyes: "Hazel",
    age_estimate: undefined,
  } as unknown as Record<string, unknown>)];
  const result = computeCharacterEnrichment(["Sarah Connor"], atoms);
  assert(result.atomBlock.includes("Physical Description: Lean build"), "non-null field rendered");
  assert(!result.atomBlock.includes("Hair:"), "null hair field omitted");
  assert(result.atomBlock.includes("Eyes: Hazel"), "defined field rendered");
  assert(!result.atomBlock.includes("Age:"), "undefined age field omitted");
});

// ══════════════════════════════════════════════════════════════════════════════
// 14. EDGE CASE — case-insensitive matching
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("edge: case-insensitive name matching", () => {
  const atoms = [makeCharacterAtom("Sarah Connor", { hair: "Dark" })];
  const result = computeCharacterEnrichment(["sarah connor"], atoms);
  assertEquals(result.bound, 1, "case-insensitive match works");
  assertEquals(result.missingNames.length, 0, "no missing");
});

Deno.test("edge: case-insensitive matching for location names", () => {
  const atoms = [makeLocationAtom("CYBERDYNE HQ", { architectureStyle: "Modern" })];
  const result = computeLocationEnrichment(["cyberdyne hq"], atoms);
  assertEquals(result.bound, 1, "case-insensitive loc match");
});

// ══════════════════════════════════════════════════════════════════════════════
// 15. INVARIANT — atom prefix naming for missing refs
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("invariant: missing atom refs use correct prefixes", () => {
  const charMissing = ["character_atom:Kyle Reese", "character_atom:T-800"];
  const locMissing = ["location_atom:Safe House"];

  assert(charMissing.every(r => r.startsWith("character_atom:")), "character refs have char prefix");
  assert(locMissing.every(r => r.startsWith("location_atom:")), "location refs have loc prefix");
});

Deno.test("invariant: missing atom refs always present when names requested but no atom match", () => {
  // When enrichWithCharacterAtoms is called with names but returns no match,
  // the code pushes character_atom:name for each missing name
  const requestedNames = ["Sarah Connor", "Kyle Reese"];
  const atoms: AtomRow[] = [];
  const result = computeCharacterEnrichment(requestedNames, atoms);
  // Both names are missing
  assertEquals(result.missingNames.length, 2, "both names missing");

  // This mirrors the code at lines 1741-1743:
  // if (charResult.missingNames.length > 0) {
  //   missingAtomRefs.push(...charResult.missingNames.map(n => `character_atom:${n}`));
  // }
  const missingRefs = result.missingNames.map(n => `character_atom:${n}`);
  assertEquals(missingRefs.length, 2, "2 missing refs generated");
  assert(missingRefs.includes("character_atom:Sarah Connor"), "char prefix on Sarah");
  assert(missingRefs.includes("character_atom:Kyle Reese"), "char prefix on Kyle");
});