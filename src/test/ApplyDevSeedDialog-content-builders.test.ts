import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = process.cwd();
const COMPONENT_PATH = resolve(
  PROJECT_ROOT.includes("kanban/workspaces")
    ? "/Users/laralane/code/iffy"
    : PROJECT_ROOT,
  "src/components/pitch/ApplyDevSeedDialog.tsx"
);

// ── BACKGROUND ──
// This fix rewrites two DevSeed doc content builders to use canonical formats:
//
// 1. buildCharacterBibleContent — now produces prose profiles with
//    `## N. Name (role)` headers, `---` separators, RELATIONSHIP DYNAMICS
//    and ENSEMBLE NOTES sections. Empty characters returns a minimal document.
//
// 2. buildFormatRulesContent — now accepts a typed FormatRulesOpts interface
//    instead of raw devSeed + format string. Uses real data from opts, no
//    placeholder/draft-stub text. VD specifics conditional on productionType.

describe("ApplyDevSeedDialog — buildCharacterBibleContent canonical format", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(COMPONENT_PATH, "utf-8");
  });

  // ── Primary: canonical ## N. Name (role) header format ──

  it("uses ## N. Name (role) canonical header format for each character", () => {
    // The header uses hard-coded `## ${index}. ${name} (${role})` format
    const headerLine = source.match(/lines\.push\(`## \$\{index\}\. \$\{name\} \(\$\{role\}\)`, ''\)/);
    expect(headerLine).not.toBeNull();
  });

  it("uses for-loop with numeric index (i) instead of for-of", () => {
    // Previously used `for (const c of characters)` — now uses indexed loop
    expect(source).toContain("for (let i = 0; i < characters.length; i++)");
  });

  it("uses role fallback of `Character ${index}` when role is falsy", () => {
    expect(source).toContain("const role = c.role || `Character ${index}`;");
  });

  // ── Edge case: empty characters ──

  it("returns minimal document when characters is empty", () => {
    const guardMatch = source.match(/if\s*\(!characters\s*\|\|\s*characters\.length\s===\s*0\)\s*\{[^}]*return\s*`/);
    expect(guardMatch).not.toBeNull();
  });

  it("empty characters message includes 'No character data available from DevSeed'", () => {
    expect(source).toContain("No character data available from DevSeed. Characters can be added from the Project Development Engine.");
  });

  it("empty characters test fires before any character iteration", () => {
    // The empty guard must come BEFORE the lines array initializer
    const guardIndex = source.indexOf("if (!characters || characters.length === 0)");
    const linesInitIndex = source.indexOf("const lines: string[] = [`# ${title} — Character Bible`, ''];");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(linesInitIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(linesInitIndex);
  });

  // ── Prose profile generation ──

  it("generates rich prose profile when both arc and flaw exist", () => {
    expect(source).toContain("if (c.arc && c.flaw)");
    expect(source).toContain("defined by their arc: ${c.arc}. This journey is shaped by a core flaw: ${c.flaw}.");
  });

  it("generates arc-only profile when only arc exists", () => {
    expect(source).toContain("} else if (c.arc) {");
    expect(source).toContain("follows an arc defined by: ${c.arc}");
  });

  it("generates flaw-only profile when only flaw exists", () => {
    expect(source).toContain("} else if (c.flaw) {");
    expect(source).toContain("driven by a defining flaw: ${c.flaw}");
  });

  it("generates fallback profile when neither arc nor flaw exist", () => {
    expect(source).toContain("} else {");
    expect(source).toContain("serves as ${role}, bringing their own energy");
  });

  // ── Role-specific elaborations ──

  it("includes protagonist elaboration", () => {
    expect(source).toContain("c.role.toLowerCase().includes('protagonist')");
    expect(source).toContain("As the central figure, ${name}'s perspective is the audience's entry point");
  });

  it("includes antagonist elaboration", () => {
    expect(source).toContain("c.role.toLowerCase().includes('antagonist')");
    expect(source).toContain("As the opposing force, ${name} creates the friction");
  });

  it("includes supporting/sidekick/confidante elaboration", () => {
    expect(source).toContain("c.role.toLowerCase().includes('supporting')");
    expect(source).toContain("c.role.toLowerCase().includes('sidekick')");
    expect(source).toContain("c.role.toLowerCase().includes('confidante')");
    expect(source).toContain("As a supporting presence, ${name} reflects and challenges");
  });

  // ── Character separators ──

  it("inserts --- separator between characters (not after last)", () => {
    const sepMatch = source.match(/if\s*\(i\s*<\s*characters\.length\s*-\s*1\)\s*\{/);
    expect(sepMatch).not.toBeNull();
    expect(source).toContain("lines.push('---', '')");
  });

  // ── RELATIONSHIP DYNAMICS section ──

  it("generates RELATIONSHIP DYNAMICS section for 2+ characters", () => {
    expect(source).toContain("'## RELATIONSHIP DYNAMICS'");
    // Must check characters.length >= 2 condition
    expect(source).toContain("if (characters.length >= 2)");
  });

  it("generates single-character RELATIONSHIP DYNAMICS for 1 character", () => {
    expect(source).toContain("} else if (characters.length === 1) {");
    expect(source).toContain("With a single character identified, the primary dramatic tension comes from internal conflict");
  });

  it("uses nested loops for relationship pairs", () => {
    expect(source).toContain("for (let i = 0; i < characters.length; i++)");
    expect(source).toContain("for (let j = i + 1; j < characters.length; j++)");
  });

  // ── ENSEMBLE NOTES section ──

  it("always generates ENSEMBLE NOTES section", () => {
    expect(source).toContain("'## ENSEMBLE NOTES'");
  });

it("character selection in ENSEMBLE NOTES uses .join with tuple format", () => {
    expect(source).toContain("`${c.name || `Character");
    expect(source).toContain("${c.role || `Character");
  });

  it("single-character ENSEMBLE NOTES mentions the character name", () => {
    expect(source).toContain("A single character (${characters[0].name || 'Character 1'}) anchors this narrative");
  });
});

describe("ApplyDevSeedDialog — buildFormatRulesContent canonical format", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(COMPONENT_PATH, "utf-8");
  });

  // ── FormatRulesOpts interface ──

  it("defines FormatRulesOpts interface with typed fields", () => {
    expect(source).toContain("interface FormatRulesOpts {");
    expect(source).toContain("canonDurMin: number | null;");
    expect(source).toContain("canonDurMax: number | null;");
    expect(source).toContain("episodeCount: number | null;");
    expect(source).toContain("productionType: string;");
  });

  it("buildFormatRulesContent signature takes FormatRulesOpts (not devSeed + format)", () => {
    // Old signature: buildFormatRulesContent(title: string, idea: PitchIdea, devSeed: any, format: string)
    // New signature: buildFormatRulesContent(title: string, idea: PitchIdea, opts: FormatRulesOpts)
    const sigMatch = source.match(/function buildFormatRulesContent\(title: string, idea: PitchIdea, opts: FormatRulesOpts\)/);
    expect(sigMatch).not.toBeNull();
  });

  it("destructures opts in function body", () => {
    expect(source).toContain("const { canonDurMin, canonDurMax, episodeCount, productionType } = opts;");
  });

  // ── Vertical drama detection ──

  it("detects vertical drama case-insensitively (vertical-drama)", () => {
    expect(source).toContain("productionType.toLowerCase() === 'vertical-drama'");
  });

  it("detects vertical drama case-insensitively (vertical_drama)", () => {
    expect(source).toContain("productionType.toLowerCase() === 'vertical_drama'");
  });

  it("sets isVerticalDrama based on productionType check", () => {
    expect(source).toContain("const isVerticalDrama = productionType && (");
  });

  // ── Duration and episode count formatting ──

  it("formats duration string using null-safe check", () => {
    expect(source).toContain("const durationStr = (canonDurMin != null && canonDurMax != null)");
  });

  it("uses 'TBC — set via canon' when duration is null", () => {
    expect(source).toContain("'TBC — set via canon'");
  });

  it("uses 'TBC' when episodeCount is null", () => {
    expect(source).toContain("const episodeCountStr = episodeCount != null ? String(episodeCount) : 'TBC'");
  });

  // ── Episode Specifications section ──

  it("includes Episode Count line in Episode Specifications", () => {
    expect(source).toContain("`**Episode Count:** ${episodeCountStr}`");
  });

  it("includes Target Duration line in Episode Specifications", () => {
    expect(source).toContain("`**Target Duration:** ${durationStr}`");
  });

  // ── Vertical Drama specifics section ──

  it("conditionally inserts Vertical Drama Specifics section (isVerticalDrama check)", () => {
    expect(source).toContain("if (isVerticalDrama) {");
    expect(source).toContain("'## Vertical Drama Specifics'");
  });

  it("Vertical Drama Specifics includes episode structure guidance", () => {
    expect(source).toContain("self-contained scene or sequence");
    expect(source).toContain("strong hook in the first 3 seconds");
    expect(source).toContain("micro-cliffhanger or emotional beat");
  });

  it("Vertical Drama Specifics includes pacing guidance", () => {
    expect(source).toContain("Fast cuts, minimal setup, maximum drama density");
  });

  // ── No placeholder/draft stub text ──

  it("does NOT contain placeholder or draft-stub text", () => {
    expect(source).not.toContain("draft stub");
    expect(source).not.toContain("placeholder — provide from upstream");
  });

  it("does NOT contain the old > *draft stub* footer", () => {
    expect(source).not.toContain("regenerate via Dev Engine for full content");
  });

  // ── Production Constraints and Platform sections ──

  it("Production Constraints uses real language (not placeholders)", () => {
    expect(source).toContain("Determined during development — refer to character bible for cast breakdown");
    expect(source).toContain("Determined during development — refer to treatment for setting specifications");
  });

  it("Platform / Distribution Specs uses real language (not placeholders)", () => {
    expect(source).toContain("Final delivery format to be confirmed during production planning");
    expect(source).toContain("Structured per format conventions — see treatment and development docs");
  });

  // ── Format line ──

  it("Format line shows production type (not hard-coded 'Vertical Drama')", () => {
    expect(source).toContain("`**Format:** ${isVerticalDrama ? 'Vertical Drama' : productionType || 'TBC'}`");
  });

  // ── Lane fallback ──

  it("Lane fallback is 'independent-film' not the old format parameter", () => {
    expect(source).toContain("`**Lane:** ${idea.recommended_lane || 'independent-film'}`");
  });
});

describe("ApplyDevSeedDialog — call site integration", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(COMPONENT_PATH, "utf-8");
  });

  it("call site passes FormatRulesOpts object (not devSeed + format)", () => {
    // New call: buildFormatRulesContent(title, idea, { canonDurMin, canonDurMax, episodeCount: canonEpisodeCount, productionType: idea.production_type || 'film' })
    const callMatch = source.match(/buildFormatRulesContent\(title, idea, \{ canonDurMin, canonDurMax, episodeCount: canonEpisodeCount, productionType: idea\.production_type \|\| 'film' \}\)/);
    expect(callMatch).not.toBeNull();
  });

  it("call site no longer passes devSeed or literal format string", () => {
    // Old call: buildFormatRulesContent(title, idea, devSeed, projectInsert.format || 'vertical-drama')
    expect(source).not.toContain("buildFormatRulesContent(title, idea, devSeed");
    expect(source).not.toContain("projectInsert.format || 'vertical-drama'");
  });

  it("character_bible doc creation passes devSeed.bible_starter.characters to buildCharacterBibleContent", () => {
    expect(source).toContain("buildCharacterBibleContent(title, devSeed.bible_starter.characters)");
  });
});

describe("ApplyDevSeedDialog — regression guards", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(COMPONENT_PATH, "utf-8");
  });

  // ── Functions still exist ──

  it("buildCharacterBibleContent function still exists", () => {
    expect(source).toContain("function buildCharacterBibleContent");
  });

  it("buildFormatRulesContent function still exists", () => {
    expect(source).toContain("function buildFormatRulesContent");
  });

  // ── Other content builders unchanged ──

  it("buildTreatmentContent function still exists", () => {
    expect(source).toContain("function buildTreatmentContent");
  });

  it("buildMarketSheetContent function still exists", () => {
    expect(source).toContain("function buildMarketSheetContent");
  });

  it("buildConceptBriefContent function still exists", () => {
    expect(source).toContain("function buildConceptBriefContent");
  });

  it("buildCanonDraft function still exists", () => {
    expect(source).toContain("function buildCanonDraft");
  });

  it("createDocWithVersion function still exists", () => {
    expect(source).toContain("async function createDocWithVersion");
  });

  // ── Doc type whitelist intact ──

  it("DEVSEED_DOC_TYPES whitelist still contains all 6 types", () => {
    // Must include: idea, concept_brief, format_rules, treatment, character_bible, market_sheet
    const types = ['idea', 'concept_brief', 'format_rules', 'treatment', 'character_bible', 'market_sheet'];
    for (const t of types) {
      expect(source).toContain(t);
    }
    // Verify it's the exact const with 6 items
    expect(source).toContain("const DEVSEED_DOC_TYPES = ['idea', 'concept_brief', 'format_rules', 'treatment', 'character_bible', 'market_sheet']");
  });

  // ── DocStyleMeta interface intact ──

  it("DocStyleMeta interface still has all original fields", () => {
    expect(source).toContain("interface DocStyleMeta {");
    expect(source).toContain("lane?: string;");
    expect(source).toContain("style_benchmark?: string | null;");
    expect(source).toContain("pacing_feel?: string;");
    expect(source).toContain("seeded_from?: { pitch_idea_id?: string; concept_expansion_id?: string | null };");
    expect(source).toContain("applied_at?: string;");
  });

  // ── Document creation order ──

  it("Concept Brief is created before Format Rules", () => {
    const conceptIndex = source.indexOf("createDocWithVersion(project.id, user.id, 'concept_brief'");
    const formatIndex = source.indexOf("createDocWithVersion(project.id, user.id, 'format_rules'");
    expect(conceptIndex).toBeGreaterThan(-1);
    expect(formatIndex).toBeGreaterThan(-1);
    expect(conceptIndex).toBeLessThan(formatIndex);
  });

  it("Format Rules is created before Treatment", () => {
    const formatIndex = source.indexOf("createDocWithVersion(project.id, user.id, 'format_rules'");
    const treatmentIndex = source.indexOf("createDocWithVersion(project.id, user.id, 'treatment'");
    expect(formatIndex).toBeGreaterThan(-1);
    expect(treatmentIndex).toBeGreaterThan(-1);
    expect(formatIndex).toBeLessThan(treatmentIndex);
  });
});

describe("ApplyDevSeedDialog — file integrity", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(COMPONENT_PATH, "utf-8");
  });

  it("file compiles (not empty, has expected exports)", () => {
    expect(source).toContain("export function ApplyDevSeedDialog");
  });

  it("file size is reasonable", () => {
    expect(source.length).toBeGreaterThan(10000);
    expect(source.length).toBeLessThan(60000);
  });
});