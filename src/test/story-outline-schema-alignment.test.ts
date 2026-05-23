/**
 * STORY OUTLINE JSON SCHEMA ALIGNMENT TEST
 *
 * Validates that all 3 prompt sources for story_outline generation agree
 * on the flat JSON {number, title, description} schema with NO per-act variation.
 *
 * Prompt sources under test:
 * 1. supabase/functions/_shared/docTypeTemplates.ts — the canonical template
 * 2. supabase/functions/_shared/chunkRunner.ts — per-act length targets for chunked gen
 * 3. supabase/functions/generate-document/index.ts — the storyOutlineRule injected into system prompt
 *
 * Root cause: 3 contradictory instruction sources caused the LLM to hallucinate
 * varying JSON schemas per act. Fix aligns all 3 to demand 5-8 flat JSON entries
 * per act (25-32 total), with explicit uniform-schema prohibition.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Helper: read source files ──

const REPO_ROOT = resolve(__dirname, '../../');
const DOC_TYPE_TEMPLATES_PATH = resolve(REPO_ROOT, 'supabase/functions/_shared/docTypeTemplates.ts');
const CHUNK_RUNNER_PATH = resolve(REPO_ROOT, 'supabase/functions/_shared/chunkRunner.ts');
const GENERATE_DOC_PATH = resolve(REPO_ROOT, 'supabase/functions/generate-document/index.ts');

function readSource(relPath: string): string {
  const abs = resolve(REPO_ROOT, relPath);
  return readFileSync(abs, 'utf-8');
}

// ── Constants: expected invariants ──

const FLAT_SCHEMA = '{"number", "title", "description"}';
const PER_ACT_RANGE = '5-8';
const TOTAL_RANGE = '25-32';
const NO_VARIATION_PHRASE = 'NO per-act schema variation';
const SAME_FLAT_STRUCTURE = 'every entry follows the exact same flat structure';
const EVERY_ENTRY_THIS_SCHEMA = 'EVERY entry follows THIS EXACT schema';
const DO_NOT_ADD_NESTED = 'Do NOT add nested objects';
const NO_SLUGLINES = 'No INT./EXT. sluglines';
const NO_CHARACTER_CUES = 'No character cues';
const NO_DIALOGUE_FORMATTING = 'No dialogue formatting';

// ── Negative patterns (must NOT appear in story_outline context) ──
// NOTE: 'slugline' alone is NOT included here — all 3 sources use it as a
// prohibition (e.g. "No sluglines" or "Do NOT use sluglines"), so the word
// itself appears legitimately. The OLD_SCENE_TERMS check targets specific
// instruction patterns, not the word "slugline" on its own.

const OLD_SCENE_COUNTS = ['12-18', '12–18', '50-80', '50–80', '14-18', '14–18', '10-14'];
const OLD_SCENE_TERMS = ['slug line', 'slug lines', 'scene: slug line', 'scene: slugline'];
const OLD_PROSE_TERMS = ['prose scenes', 'prose scene'];

// ══════════════════════════════════════════════════════════════════════════════
// 1. docTypeTemplates.ts — the canonical story_outline template
// ══════════════════════════════════════════════════════════════════════════════

describe('docTypeTemplates.ts — story_outline template', () => {
  const source = readSource('supabase/functions/_shared/docTypeTemplates.ts');
  const templateMatch = source.match(/case "story_outline":\s*return `([\s\S]*?)`;/);
  const template = templateMatch ? templateMatch[1] : '';

  beforeAll(() => {
    expect(template).not.toBe('');
  });

  it('exists as a template case', () => {
    expect(source).toContain('case "story_outline":');
  });

  it('has flat JSON {number, title, description} schema in the example', () => {
    expect(template).toContain(FLAT_SCHEMA);
  });

  it('demands 5-8 entries per act (not 7-8)', () => {
    expect(template).toContain(PER_ACT_RANGE);
  });

  it('declares a total of 25-32 entries', () => {
    expect(template).toContain(TOTAL_RANGE);
  });

  it('explicitly prohibits per-act schema variation', () => {
    expect(template).toContain(NO_VARIATION_PHRASE);
  });

  it('states every entry follows the same flat structure', () => {
    expect(template).toContain(SAME_FLAT_STRUCTURE);
  });

  it('forbids adding nested objects or per-act structural changes', () => {
    expect(template).toContain(DO_NOT_ADD_NESTED);
  });

  it('prohibits INT./EXT. sluglines', () => {
    expect(template).toContain(NO_SLUGLINES);
  });

  it('prohibits character cues', () => {
    expect(template).toContain(NO_CHARACTER_CUES);
  });

  it('prohibits dialogue formatting', () => {
    expect(template).toContain(NO_DIALOGUE_FORMATTING);
  });

  it('does NOT contain old prose scene counts (12-18, 50-80) for story_outline', () => {
    for (const pattern of OLD_SCENE_COUNTS) {
      expect(template).not.toContain(pattern);
    }
  });

  it('does NOT contain old instruction slugline terminology', () => {
    for (const term of OLD_SCENE_TERMS) {
      expect(template).not.toContain(term);
    }
  });

  it('does NOT mention prose scenes', () => {
    for (const term of OLD_PROSE_TERMS) {
      expect(template).not.toContain(term);
    }
  });

  it('outputs as VALID JSON ONLY', () => {
    expect(template).toContain('OUTPUT AS VALID JSON ONLY');
  });

  it('JSON example structure is flat (entries array of {number, title, description})', () => {
    // The example JSON in the template must show the flat structure
    expect(template).toContain('"entries"');
    expect(template).toContain('"number": 1');
    expect(template).toContain('"title"');
    expect(template).toContain('"description"');
    // Must NOT have nested per-act objects in the JSON example
    expect(template).not.toContain('"act_1"');
    expect(template).not.toContain('"act_2"');
    expect(template).not.toContain('"act_3"');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. chunkRunner.ts — per-act length targets for story outline chunked gen
// ══════════════════════════════════════════════════════════════════════════════

describe('chunkRunner.ts — story_outline length guidance', () => {
  const source = readSource('supabase/functions/_shared/chunkRunner.ts');

  // Extract the story_outline block by finding the PER_ACT_TARGETS section + lengthGuidance template
  // In chunkRunner.ts, the story_outline block spans from `else if (docType === "story_outline")`
  // through the lengthGuidance template literal. The closing `}` of the else-if is implicit
  // (it closes the preceding if-else chain). Extract from the docType check to `\`;\n` (closing template).
  const storyOutlineSection = source.match(
    /\/\/\s*──\s*Story Outline[\s\S]*?else if \(docType === "story_outline"\)\s*\{([\s\S]*?)\n\s*`;\n/
  );
  // Use the lengthGuidance block directly as the most reliable extraction
  const lengthGuidanceMatch = source.match(
    /STORY OUTLINE LENGTH[^`]*`/
  );
  const guidanceText = lengthGuidanceMatch ? lengthGuidanceMatch[0] : '';

  beforeAll(() => {
    expect(guidanceText).not.toBe('');
  });

  it('has a story_outline branch', () => {
    expect(source).toContain('docType === "story_outline"');
  });

  describe('per-act targets', () => {
    it('act_1_setup demands 5-8 JSON entries', () => {
      expect(source).toMatch(/act_1_setup.*5\\u20138 JSON entries/);
    });

    it('act_2a_complication demands 5-8 JSON entries', () => {
      expect(source).toMatch(/act_2a_complication.*5\\u20138 JSON entries/);
    });

    it('act_2b_crisis demands 5-8 JSON entries', () => {
      expect(source).toMatch(/act_2b_crisis.*5\\u20138 JSON entries/);
    });

    it('act_3_resolution demands 5-8 JSON entries', () => {
      expect(source).toMatch(/act_3_resolution.*5\\u20138 JSON entries/);
    });

    it('all 4 acts use the SAME 5-8 JSON entry template (no per-act variation in count)', () => {
      // Extract the count patterns from the PER_ACT_TARGETS block
      const perActBlock = source.match(
        /else if \(docType === "story_outline"\)\s*\{[^}]*PER_ACT_TARGETS[^}]*\}/
      );
      expect(perActBlock).not.toBeNull();
      if (perActBlock) {
        // Source uses \u2013 Unicode escape for the en-dash (e.g. 5\u20138 JSON entries)
        const counts = perActBlock[0].match(/\d+\\u2013\d+ JSON entries/g);
        expect(counts).not.toBeNull();
        if (counts) {
          for (const c of counts) {
            expect(c).toMatch(/5\\u20138 JSON entries/);
          }
        }
      }
    });
  });

  it('declares total of 25-32 entries across all acts', () => {
    // Source uses \u2013 Unicode escape (25\u201332 entries), not a literal en-dash
    const has25upTo32 = guidanceText.includes('25') && guidanceText.includes('32 entries');
    expect(has25upTo32).toBe(true);
  });

  it('defines each entry as {number, title, description} JSON object', () => {
    // Use the unescaped form: the actual TS source has escaped quotes
    expect(source).toContain('{"number", "title", "description"}') || expect(guidanceText).toContain('"number", "title", "description"');
  });

  it('prohibits sluglines', () => {
    expect(guidanceText).toContain('Do NOT use sluglines');
  });

  it('prohibits character cues', () => {
    expect(guidanceText).toContain('character cues');
  });

  it('prohibits dialogue formatting', () => {
    expect(guidanceText).toContain('dialogue formatting');
  });

  it('forbids summarising multiple moments into one entry', () => {
    expect(guidanceText).toContain('Every moment is its own entry');
  });

  it('does NOT contain old prose scene counts (12-18, 50-80, 14-18, 10-14) for story_outline', () => {
    for (const pattern of OLD_SCENE_COUNTS) {
      expect(guidanceText).not.toContain(pattern);
    }
  });

  it('does NOT mention old instruction slugline terminology', () => {
    for (const term of OLD_SCENE_TERMS) {
      expect(guidanceText).not.toContain(term);
    }
  });

  it('default fallback target is also JSON entries, not scenes', () => {
    expect(source).toMatch(/docType === "story_outline"[\s\S]*?\?\?\s*"[^"]*JSON entries/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. generate-document/index.ts — storyOutlineRule in system prompt
// ══════════════════════════════════════════════════════════════════════════════

describe('generate-document/index.ts — storyOutlineRule', () => {
  const source = readSource('supabase/functions/generate-document/index.ts');
  const ruleMatch = source.match(
    /const storyOutlineRule = \(docType === "story_outline".*?\)\s*\n\s*\?\s*`## STORY OUTLINE FORMAT[^`]*`/
  );
  const ruleText = ruleMatch ? ruleMatch[0] : '';

  beforeAll(() => {
    expect(ruleText).not.toBe('');
  });

  it('has a storyOutlineRule for story_outline and architecture', () => {
    expect(source).toContain('docType === "story_outline" || docType === "architecture"');
  });

  it('demands 5-8 individual moments per act', () => {
    expect(ruleText).toContain('5-8 individual moments');
  });

  it('states total ~25-32 moments across all acts', () => {
    expect(ruleText).toContain(TOTAL_RANGE);
  });

  it('declares EVERY entry follows THIS EXACT schema', () => {
    expect(ruleText).toContain(EVERY_ENTRY_THIS_SCHEMA);
  });

  it('prohibits per-act schema variation', () => {
    expect(ruleText).toContain('NO per-act schema variation is permitted');
  });

  it('defines each moment as {number, title, description} entry', () => {
    expect(ruleText).toContain('"number"') && expect(ruleText).toContain('"title"') && expect(ruleText).toContain('"description"');
  });

  it('prohibits sluglines', () => {
    expect(ruleText).toContain('No sluglines');
  });

  it('prohibits character cues', () => {
    expect(ruleText).toContain('No character cues');
  });

  it('prohibits dialogue formatting', () => {
    expect(ruleText).toContain('No dialogue formatting');
  });

  it('requires OUTPUT AS JSON', () => {
    expect(ruleText).toContain('OUTPUT AS JSON');
  });

  it('does NOT contain old prose scene counts (12-18, 50-80) in the rule', () => {
    for (const pattern of OLD_SCENE_COUNTS) {
      expect(ruleText).not.toContain(pattern);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Cross-source consistency — all 3 must agree on the contract
// ══════════════════════════════════════════════════════════════════════════════

describe('Cross-source contract consistency', () => {
  const templateSrc = readSource('supabase/functions/_shared/docTypeTemplates.ts');
  const chunkSrc = readSource('supabase/functions/_shared/chunkRunner.ts');
  const genDocSrc = readSource('supabase/functions/generate-document/index.ts');

  // Extract just the story_outline portions
  const templateMatch = templateSrc.match(/case "story_outline":\s*return `([\s\S]*?)`;/);
  const template = templateMatch ? templateMatch[1] : '';

  // Use the lengthGuidance block for chunkRunner story_outline content
  const chunkGuidanceMatch = chunkSrc.match(/STORY OUTLINE LENGTH[^`]*`/);
  const chunkGuidance = chunkGuidanceMatch ? chunkGuidanceMatch[0] : '';

  const genDocMatch = genDocSrc.match(
    /const storyOutlineRule = \(docType === "story_outline".*?\)\s*\n\s*\?\s*`## STORY OUTLINE FORMAT[^`]*`/
  );
  const genDocRule = genDocMatch ? genDocMatch[0] : '';

  beforeAll(() => {
    expect(template).not.toBe('');
    expect(chunkGuidance).not.toBe('');
    expect(genDocRule).not.toBe('');
  });

  it('ALL 3 sources have {number, title, description} flat schema', () => {
    expect(template).toContain(FLAT_SCHEMA);
    expect(chunkGuidance).toContain('"number"');
    expect(genDocRule).toContain('"number"');
  });

  it('ALL 3 sources demand 5-8 entries per act', () => {
    expect(template).toContain(PER_ACT_RANGE);
    // Source uses \u2013 Unicode escape, match on broader pattern
    expect(chunkSrc).toMatch(/else if \(docType === "story_outline"\)[\s\S]*?act_1_setup[\s\S]*?5.*?JSON entries/);
    expect(genDocRule).toContain('5-8');
  });

  it('ALL 3 sources state 25-32 total entries', () => {
    expect(template).toContain(TOTAL_RANGE);
    // Source uses \u2013 Unicode escape (25\u201332 entries), check for "25" and "32 entries"
    const chunkHasTotal = chunkGuidance.includes('25') && chunkGuidance.includes('32 entries');
    expect(chunkHasTotal).toBe(true);
    expect(genDocRule).toContain(TOTAL_RANGE);
  });

  it('ALL 3 sources prohibit per-act schema variation', () => {
    expect(template).toContain('NO per-act schema variation');
    expect(chunkGuidance).toContain('Each entry is one {"number", "title", "description"}');
    expect(genDocRule).toContain('NO per-act schema variation');
  });

  it('ALL 3 sources prohibit sluglines', () => {
    expect(template).toContain('No INT./EXT. sluglines');
    expect(chunkGuidance).toContain('Do NOT use sluglines');
    expect(genDocRule).toContain('No sluglines');
  });

  it('ALL 3 sources prohibit character cues', () => {
    expect(template).toContain('No character cues');
    expect(chunkGuidance).toContain('character cues');
    expect(genDocRule).toContain('No character cues');
  });

  it('ALL 3 sources prohibit dialogue formatting', () => {
    expect(template).toContain('No dialogue formatting');
    expect(chunkGuidance).toContain('dialogue formatting');
    expect(genDocRule).toContain('No dialogue formatting');
  });

  it('NONE of the 3 sources contain old prose scene counts for story_outline', () => {
    for (const pattern of OLD_SCENE_COUNTS) {
      // For genDocRule scope: storyOutlineRule is only in story_outline branch
      expect(template).not.toContain(pattern);
      expect(chunkGuidance).not.toContain(pattern);
      expect(genDocRule).not.toContain(pattern);
    }
  });
});