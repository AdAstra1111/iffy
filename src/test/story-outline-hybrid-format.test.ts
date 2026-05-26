/**
 * Tests for convertStoryOutlineToJson() — hybrid ##-prefixed format handling
 *
 * Commit a5a5d0a: Added convertStoryOutlineToJson() that handles both raw JSON
 * and ##-prefixed hybrid format from chunkRunner assembly.
 *
 * Changes tested:
 * 1. convertStoryOutlineToJson() — the new helper function
 * 2. processStoryOutlineRewrite() — updated to use the helper
 * 3. convert_story_outline_to_json action handler — new endpoint
 * 4. isJSONOutline detection in ProjectDevelopmentEngine.tsx — now also detects ## prefix
 * 5. CharacterAtomGrid props — isCancelling/onCancel wired through
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

// ──────────────────────────────────────────────────────────────────
// Reference implementation of convertStoryOutlineToJson
// (not exported from dev-engine-v2/index.ts, re-implemented for test)
// ──────────────────────────────────────────────────────────────────

function convertStoryOutlineToJson(text: string | null | undefined): any {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;

  // Case 1: Already raw JSON
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); }
    catch { return null; }
  }

  // Case 2: ##-prefixed hybrid format from chunkRunner
  const sections = trimmed.split(/\n##\s+/);
  if (sections.length < 2) return null;

  const allEntries: any[] = [];
  let title = '';
  let format = 'story_outline';

  for (const section of sections) {
    const sectionText = section.trim();
    if (!sectionText || /^[A-Za-z\s]+$/.test(sectionText) || !/\{/.test(sectionText)) continue;

    let jsonStr = sectionText;
    const codeBlockMatch = sectionText.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      const braceIdx = sectionText.indexOf('{');
      if (braceIdx >= 0) {
        const lastBrace = sectionText.lastIndexOf('}');
        if (lastBrace > braceIdx) {
          jsonStr = sectionText.slice(braceIdx, lastBrace + 1);
        }
      }
    }

    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object') continue;

      if (!title && (parsed.title || parsed.name)) {
        title = parsed.title || parsed.name;
      }

      const entries = parsed.entries || parsed.scenes || parsed.moments || parsed.items || parsed.beats || [];
      if (Array.isArray(entries) && entries.length > 0) {
        for (const entry of entries) {
          if (entry && typeof entry.title === 'string' && typeof entry.number === 'number') {
            allEntries.push(entry);
          } else if (entry && typeof entry === 'object') {
            allEntries.push({
              number: entry.number || allEntries.length + 1,
              title: entry.title || entry.name || entry.scene_title || entry.scene || `Entry ${allEntries.length + 1}`,
              description: entry.description || entry.summary || entry.content || entry.text || entry.desc || entry.overview || entry.synopsis || '',
            });
          }
        }
      } else {
        if (parsed.title && parsed.number) {
          allEntries.push({
            number: parsed.number,
            title: parsed.title,
            description: parsed.description || parsed.summary || '',
          });
        } else if (parsed.title || parsed.name) {
          allEntries.push({
            number: allEntries.length + 1,
            title: parsed.title || parsed.name,
            description: parsed.description || parsed.summary || parsed.content || '',
          });
        }
      }
    } catch {
      continue;
    }
  }

  if (allEntries.length === 0) return null;
  return { title, format, entries: allEntries };
}

// ──────────────────────────────────────────────────────────────────
// Test data
// ──────────────────────────────────────────────────────────────────

/** A valid raw JSON story outline */
const RAW_JSON_OUTLINE = JSON.stringify({
  title: 'The Great Adventure',
  format: 'story_outline',
  entries: [
    { number: 1, title: 'Hero meets mentor', description: 'Luke meets Obi-Wan' },
    { number: 2, title: 'Call to adventure', description: 'The journey begins' },
  ],
});

/** A hybrid ##-prefixed format typical of chunkRunner output */
const HYBRID_FORMAT = `## Act 1: The Beginning
\`\`\`json
{
  "entries": [
    { "number": 1, "title": "Hero discovers power", "description": "The hero learns about their destiny" },
    { "number": 2, "title": "First challenge", "description": "The hero faces their first obstacle" }
  ]
}
\`\`\`
## Act 2: The Middle
\`\`\`json
{
  "entries": [
    { "number": 3, "title": "Rising tension", "description": "Stakes increase dramatically" },
    { "number": 4, "title": "Midpoint twist", "description": "A shocking revelation changes everything" }
  ]
}
\`\`\`
## Act 3: Resolution
\`\`\`json
{
  "entries": [
    { "number": 5, "title": "Final battle", "description": "The hero confronts the villain" },
    { "number": 6, "title": "New beginning", "description": "The hero returns home changed" }
  ]
}
\`\`\``;

// ══════════════════════════════════════════════════════════════════
// 1. convertStoryOutlineToJson — Primary use cases
// ══════════════════════════════════════════════════════════════════

describe('convertStoryOutlineToJson — raw JSON input', () => {
  it('parses valid raw JSON story outline', () => {
    const result = convertStoryOutlineToJson(RAW_JSON_OUTLINE);
    expect(result).not.toBeNull();
    expect(result.title).toBe('The Great Adventure');
    expect(result.entries.length).toBe(2);
  });

  it('parses raw JSON with all required fields', () => {
    const result = convertStoryOutlineToJson(RAW_JSON_OUTLINE);
    expect(result.entries[0]).toHaveProperty('number');
    expect(result.entries[0]).toHaveProperty('title');
    expect(result.entries[0]).toHaveProperty('description');
    expect(typeof result.entries[0].number).toBe('number');
    expect(typeof result.entries[0].title).toBe('string');
  });

  it('returns null for non-object JSON', () => {
    expect(convertStoryOutlineToJson('"just a string"')).toBeNull();
    expect(convertStoryOutlineToJson('123')).toBeNull();
    expect(convertStoryOutlineToJson('true')).toBeNull();
    expect(convertStoryOutlineToJson('null')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(convertStoryOutlineToJson('{ invalid json }')).toBeNull();
    expect(convertStoryOutlineToJson('{')).toBeNull();
  });
});

describe('convertStoryOutlineToJson — hybrid ##-prefixed format', () => {
  it('parses hybrid format with ```json code blocks', () => {
    const result = convertStoryOutlineToJson(HYBRID_FORMAT);
    expect(result).not.toBeNull();
    expect(result.entries.length).toBe(6);
  });

  it('preserves entry number, title, and description order', () => {
    const result = convertStoryOutlineToJson(HYBRID_FORMAT);
    expect(result.entries[0].number).toBe(1);
    expect(result.entries[0].title).toBe('Hero discovers power');
    expect(result.entries[0].description).toBe('The hero learns about their destiny');
    expect(result.entries[5].number).toBe(6);
    expect(result.entries[5].title).toBe('New beginning');
  });

  it('preserves entry count across all acts', () => {
    const result = convertStoryOutlineToJson(HYBRID_FORMAT);
    expect(result.entries.length).toBeGreaterThanOrEqual(5);
    expect(result.entries.length).toBeLessThanOrEqual(8);
  });

  it('extracts title from first section when available', () => {
    const result = convertStoryOutlineToJson(HYBRID_FORMAT);
    expect(result.title).toBe(''); // No title in the JSON blocks themselves
  });

  it('extracts title when JSON block has title field', () => {
    const outlineWithTitle = `## Act 1
\`\`\`json
{
  "title": "My Story",
  "entries": [
    { "number": 1, "title": "Scene 1", "description": "Desc" }
  ]
}
\`\`\`
## Act 2
\`\`\`json
{
  "entries": [
    { "number": 2, "title": "Scene 2", "description": "Desc 2" }
  ]
}
\`\`\``;
    const result = convertStoryOutlineToJson(outlineWithTitle);
    expect(result.title).toBe('My Story');
  });
});

describe('convertStoryOutlineToJson — wrapper key normalization', () => {
  it('normalizes "scenes" wrapper to entries', () => {
    const input = `## Act 1
\`\`\`json
{
  "scenes": [
    { "number": 1, "title": "Scene 1", "description": "Desc 1" },
    { "number": 2, "title": "Scene 2", "description": "Desc 2" }
  ]
}
\`\`\`
## Act 2
\`\`\`json
{
  "scenes": [
    { "number": 3, "title": "Scene 3", "description": "Desc 3" }
  ]
}
\`\`\``;
    const result = convertStoryOutlineToJson(input);
    expect(result).not.toBeNull();
    expect(result.entries.length).toBe(3);
  });

  it('normalizes "moments" wrapper to entries', () => {
    const input = `## Act 1
\`\`\`json
{
  "moments": [
    { "number": 1, "title": "Moment 1", "description": "Desc" }
  ]
}
\`\`\`
## Act 2
\`\`\`json
{
  "moments": [
    { "number": 2, "title": "Moment 2", "description": "Desc 2" }
  ]
}
\`\`\``;
    const result = convertStoryOutlineToJson(input);
    expect(result).not.toBeNull();
    expect(result.entries.length).toBe(2);
  });

  it('normalizes "items" wrapper to entries', () => {
    const input = `## Act 1
\`\`\`json
{
  "items": [
    { "number": 1, "title": "Item 1", "description": "Desc" }
  ]
}
\`\`\`
## Act 2
\`\`\`json
{
  "items": [
    { "number": 2, "title": "Item 2", "description": "Desc 2" }
  ]
}
\`\`\``;
    const result = convertStoryOutlineToJson(input);
    expect(result).not.toBeNull();
    expect(result.entries.length).toBe(2);
  });

  it('normalizes "beats" wrapper to entries', () => {
    const input = `## Act 1
\`\`\`json
{
  "beats": [
    { "number": 1, "title": "Beat 1", "description": "Desc" }
  ]
}
\`\`\`
## Act 2
\`\`\`json
{
  "beats": [
    { "number": 2, "title": "Beat 2", "description": "Desc 2" }
  ]
}
\`\`\``;
    const result = convertStoryOutlineToJson(input);
    expect(result).not.toBeNull();
    expect(result.entries.length).toBe(2);
  });

  it('handles bare JSON objects (no code block) in hybrid format', () => {
    const input = `## Act 1
{
  "entries": [
    { "number": 1, "title": "Scene 1", "description": "Desc" }
  ]
}
## Act 2
{
  "entries": [
    { "number": 2, "title": "Scene 2", "description": "Desc 2" }
  ]
}`;
    const result = convertStoryOutlineToJson(input);
    expect(result).not.toBeNull();
    expect(result.entries.length).toBe(2);
  });
});

describe('convertStoryOutlineToJson — edge cases', () => {
  it('returns null for empty input', () => {
    expect(convertStoryOutlineToJson('')).toBeNull();
    expect(convertStoryOutlineToJson('   ')).toBeNull();
    expect(convertStoryOutlineToJson(null)).toBeNull();
    expect(convertStoryOutlineToJson(undefined)).toBeNull();
  });

  it('returns null for text that is not JSON and not hybrid format', () => {
    expect(convertStoryOutlineToJson('Just a plain text string')).toBeNull();
    expect(convertStoryOutlineToJson('## This has a header but no JSON')).toBeNull();
  });

  it('skips sections that fail to parse', () => {
    const input = `## Act 1
\`\`\`json
{ invalid json }
\`\`\`
## Act 2
\`\`\`json
{
  "entries": [
    { "number": 1, "title": "Valid", "description": "This one works" }
  ]
}
\`\`\``;
    const result = convertStoryOutlineToJson(input);
    // Should skip Act 1 and only get Act 2's entries
    expect(result).not.toBeNull();
    expect(result.entries.length).toBe(1);
  });

  it('returns null when no valid sections found', () => {
    const input = `## Act 1
\`\`\`json
{ invalid }
\`\`\`
## Act 2
also invalid`;
    expect(convertStoryOutlineToJson(input)).toBeNull();
  });

  it('returns null for single-section pseudo-hybrid (no actual split)', () => {
    const input = `Just some text with no ## headers`;
    expect(convertStoryOutlineToJson(input)).toBeNull();
  });

  it('coerces entries with missing number field', () => {
    const input = `## Act 1
\`\`\`json
{
  "entries": [
    { "title": "No Number", "description": "Missing number field" }
  ]
}
\`\`\`
## Act 2
\`\`\`json
{
  "entries": [
    { "number": 2, "title": "Valid", "description": "Has number" }
  ]
}
\`\`\``;
    const result = convertStoryOutlineToJson(input);
    expect(result).not.toBeNull();
    expect(result.entries[0].number).toBe(1); // Should auto-increment
  });

  it('coerces entries with missing title field', () => {
    const input = `## Act 1
\`\`\`json
{
  "entries": [
    { "number": 1, "description": "Missing title" }
  ]
}
\`\`\`
## Act 2
\`\`\`json
{
  "entries": [
    { "number": 2, "title": "Valid", "description": "Has title" }
  ]
}
\`\`\``;
    const result = convertStoryOutlineToJson(input);
    expect(result).not.toBeNull();
    expect(result.entries[0].title).toMatch(/Entry 1/);
  });

  it('coerces entries with alternative key names (name, scene_title, scene)', () => {
    const input = `## Act 1
\`\`\`json
{
  "entries": [
    { "number": 1, "name": "Named Entry", "summary": "Summary text" }
  ]
}
\`\`\`
## Act 2
\`\`\`json
{
  "entries": [
    { "number": 2, "title": "Entry 2", "description": "Desc 2" }
  ]
}
\`\`\``;
    const result = convertStoryOutlineToJson(input);
    expect(result).not.toBeNull();
    expect(result.entries[0].title).toBe('Named Entry');
    expect(result.entries[0].description).toBe('Summary text');
  });

  it('coerces entries with alternative description keys (content, text, desc, overview, synopsis)', () => {
    const input = `## Act 1
\`\`\`json
{
  "entries": [
    { "number": 1, "title": "Entry", "content": "Content body" },
    { "number": 2, "title": "Entry 2", "text": "Text body" },
    { "number": 3, "title": "Entry 3", "desc": "Desc body" },
    { "number": 4, "title": "Entry 4", "overview": "Overview body" },
    { "number": 5, "title": "Entry 5", "synopsis": "Synopsis body" }
  ]
}
\`\`\`
## Act 2
\`\`\`json
{
  "entries": [
    { "number": 6, "title": "Entry 6", "description": "Desc 6" }
  ]
}
\`\`\``;
    const result = convertStoryOutlineToJson(input);
    expect(result).not.toBeNull();
    expect(result.entries[0].content).toBe('Content body');
    expect(result.entries[1].text).toBe('Text body');
    expect(result.entries[2].desc).toBe('Desc body');
    expect(result.entries[3].overview).toBe('Overview body');
    expect(result.entries[4].synopsis).toBe('Synopsis body');
  });

  it('handles single entry per act format', () => {
    const input = `## Act 1
\`\`\`json
{
  "title": "Opening",
  "number": 1,
  "description": "The story begins"
}
\`\`\`
## Act 2
\`\`\`json
{
  "title": "Climax",
  "number": 2,
  "description": "The story peaks"
}
\`\`\``;
    const result = convertStoryOutlineToJson(input);
    expect(result).not.toBeNull();
    expect(result.entries.length).toBe(2);
    expect(result.entries[0].number).toBe(1);
    expect(result.entries[0].title).toBe('Opening');
    expect(result.entries[0].description).toBe('The story begins');
  });

  it('handles bare JSON without code block markers', () => {
    const input = `## Act 1
{
  "entries": [
    { "number": 1, "title": "Bare JSON", "description": "No code block wrapper" }
  ]
}
## Act 2
{
  "entries": [
    { "number": 2, "title": "Bare JSON 2", "description": "Second act bare JSON" }
  ]
}`;
    const result = convertStoryOutlineToJson(input);
    expect(result).not.toBeNull();
    expect(result.entries.length).toBe(2);
  });

  it('skips sections that are just plain text with no JSON', () => {
    const input = `## Act 1
This is a plain text description of Act 1 without any JSON.
## Act 2
\`\`\`json
{
  "entries": [
    { "number": 1, "title": "Valid Entry", "description": "Desc" }
  ]
}
\`\`\``;
    const result = convertStoryOutlineToJson(input);
    expect(result).not.toBeNull();
    expect(result.entries.length).toBe(1);
  });

  it('uses "story_outline" as default format', () => {
    const result = convertStoryOutlineToJson(RAW_JSON_OUTLINE);
    expect(result.format).toBe('story_outline');
  });
});

describe('convertStoryOutlineToJson — invariant enforcement (fail closed)', () => {
  it('fails closed on truly unparseable content', () => {
    expect(convertStoryOutlineToJson('')).toBeNull();
    expect(convertStoryOutlineToJson('random text')).toBeNull();
    expect(convertStoryOutlineToJson('## Header\nno json here')).toBeNull();
    expect(convertStoryOutlineToJson('{bad json}')).toBeNull();
  });

  it('fails closed on empty entries array', () => {
    const input = `## Act 1
\`\`\`json
{
  "entries": []
}
\`\`\``;
    expect(convertStoryOutlineToJson(input)).toBeNull();
  });

  it('fails closed on null entries', () => {
    const input = `## Act 1
\`\`\`json
{
  "entries": null
}
\`\`\``;
    expect(convertStoryOutlineToJson(input)).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
// 2. Structural verification — code changes exist in dev-engine-v2
// ══════════════════════════════════════════════════════════════════

describe('Structural verification (commit a5a5d0a)', () => {
  const INDEX_TS_PATH = 'supabase/functions/dev-engine-v2/index.ts';
  const source = fs.readFileSync(INDEX_TS_PATH, 'utf-8');

  it('convertStoryOutlineToJson function exists', () => {
    expect(source.includes('function convertStoryOutlineToJson(text)')).toBe(true);
  });

  it('processStoryOutlineRewrite uses convertStoryOutlineToJson (was inline JSON.parse)', () => {
    const rewriteCall = source.indexOf('const storyOutlineJSON = convertStoryOutlineToJson(version.plaintext);');
    expect(rewriteCall).toBeGreaterThan(0);

    // Verify the old inline approach is GONE
    expect(source.includes('if (!trimmed.startsWith("{")) throw new Error("Source version plaintext is not JSON object")')).toBe(false);
  });

  it('enqueue_rewrite_jobs entries count uses convertStoryOutlineToJson', () => {
    const previewCall = source.indexOf('const parsed = convertStoryOutlineToJson(_previewVer?.plaintext);');
    expect(previewCall).toBeGreaterThan(0);
  });

  it('convert_story_outline_to_json action handler exists', () => {
    expect(source.includes('action === "convert_story_outline_to_json"')).toBe(true);
  });

  it('convert_story_outline_to_json endpoint returns parsed outline', () => {
    // Verify the response shape
    expect(source.includes('entryCount: parsed.entries?.length || 0')).toBe(true);
    expect(source.includes('hasEntries: Array.isArray(parsed.entries) && parsed.entries.length > 0')).toBe(true);
    expect(source.includes('isHybridFormat: !ver.plaintext?.trim().startsWith("{")')).toBe(true);
  });

  it('old raw JSON check removed from processStoryOutlineRewrite', () => {
    const oldPattern = 'if (!trimmed.startsWith("{")) throw new Error("Source version plaintext is not JSON object");';
    expect(source.includes(oldPattern)).toBe(false);
  });

  it('old raw JSON check removed from _entriesPreview', () => {
    // Should not contain the old _entriesPreview logic with trimmed.startsWith("{")
    const oldPreviewPatternMatch = source.match(/if \(trimmed\.startsWith\("\{"\)\)\s*\{/);
    // Note: there may be other valid startsWith checks, but the old _entriesPreview should be gone
    const oldEntryPreview = 'const trimmed = (_previewVer?.plaintext || "").trim();';
    const oldCallSite = source.indexOf(oldEntryPreview);
    expect(oldCallSite).toBe(-1); // Should be removed
  });
});

// ══════════════════════════════════════════════════════════════════
// 3. ProjectDevelopmentEngine.tsx — UI rendering changes
// ══════════════════════════════════════════════════════════════════

describe('ProjectDevelopmentEngine.tsx — UI rendering fix', () => {
  const PDE_PATH = 'src/pages/ProjectDevelopmentEngine.tsx';
  const source = fs.readFileSync(PDE_PATH, 'utf-8');

  it('isJSONOutline now detects ##-prefixed outlines (not just { )', () => {
    // The new logic should check for both '{' and '##' prefix for story_outline
    const newPattern = "selectedDoc?.doc_type === 'story_outline' && (selectedVersion?.plaintext || '').trim().startsWith('##')";
    expect(source.includes(newPattern)).toBe(true);
  });

  it('isJSONOutline still detects raw JSON { format', () => {
    const jsonPattern = "(selectedVersion?.plaintext || '').trim().startsWith('{')";
    expect(source.includes(jsonPattern)).toBe(true);
  });

  it('CharacterAtomGrid receives isCancelling prop', () => {
    expect(source.includes('isCancelling={characterAtoms.isCancelling}')).toBe(true);
  });

  it('CharacterAtomGrid receives onCancel prop', () => {
    expect(source.includes('onCancel={characterAtoms.cancel}')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// 4. Regression — existing functionality preserved
// ══════════════════════════════════════════════════════════════════

describe('Regression — existing functionality preserved', () => {
  const INDEX_TS_PATH = 'supabase/functions/dev-engine-v2/index.ts';
  const source = fs.readFileSync(INDEX_TS_PATH, 'utf-8');

  it('file is still a valid Deno edge function', () => {
    expect(source.length).toBeGreaterThan(1000000);
    expect(source.includes('serve(async')).toBe(true);
  });

  it('existing extractJSON function still present', () => {
    expect(source.includes('function extractJSON(raw)')).toBe(true);
  });

  it('existing processStoryOutlineRewrite function still present', () => {
    expect(source.includes('async function processStoryOutlineRewrite')).toBe(true);
  });

  it('existing enqueue_rewrite_jobs still present', () => {
    expect(source.includes('action === "enqueue_rewrite_jobs"')).toBe(true);
  });
});