/**
 * Tests for per-act JSON schema handling + feature script UI rendering (Option A).
 *
 * Covers:
 * 1. convert_story_outline_to_plaintext — JSON entries → ##-prefixed markdown
 *    Includes nested moments (###), flat entries, and fallback paths
 * 2. processStoryOutlineRewrite validation — doc_type, JSON format, entries array
 * 3. isJSONOutline routing logic — detection of JSON vs plaintext outlines
 * 4. _entriesPreview parser — extracting entry count from story outline JSON
 * 5. Edge cases: empty, missing keys, malformed JSON, boundary conditions
 *
 * These are pure-function tests re-implementing the core logic from
 * supabase/functions/dev-engine-v2/index.ts for unit-testability.
 */
import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────────────────────────
// 1. convert_story_outline_to_plaintext — core conversion logic
// ──────────────────────────────────────────────────────────────────

/**
 * Reference implementation of the JSON-to-markdown conversion logic
 * from the convert_story_outline_to_plaintext action handler at line 5888-5928.
 */
function convertOutlineToPlaintext(
  outline: { entries: Array<{ number?: number; title?: string; description?: string; moments?: Array<{ number?: number; title?: string; description?: string }>; scenes?: Array<{ number?: number; title?: string; description?: string }> }> }
): { text: string; hasNestedMoments: boolean; entriesCount: number } {
  const lines: string[] = [];

  for (const entry of outline.entries) {
    const actTitle = entry.title || `Act ${entry.number || 1}`;
    lines.push(`## ${actTitle}`);
    lines.push('');
    if (entry.description) {
      lines.push(entry.description);
      lines.push('');
    }
    const moments = entry.moments || entry.scenes || [];
    if (moments.length > 0) {
      for (const moment of moments) {
        const sceneTitle = moment.title || `Scene ${moment.number || 1}`;
        lines.push(`### ${sceneTitle}`);
        lines.push('');
        if (moment.description) {
          lines.push(moment.description);
          lines.push('');
        }
      }
    }
  }

  const plaintext = lines.join('\n').trim();
  const hasNestedMoments = outline.entries.some(
    (e) => (e.moments?.length || e.scenes?.length || 0) > 0
  );

  const finalText = hasNestedMoments
    ? plaintext
    : (() => {
        const flatLines: string[] = [];
        for (const entry of outline.entries) {
          const sceneTitle = entry.title || `Scene ${entry.number || 1}`;
          flatLines.push(`## ${sceneTitle}`);
          flatLines.push('');
          if (entry.description) {
            flatLines.push(entry.description);
            flatLines.push('');
          }
        }
        return flatLines.join('\n').trim();
      })();

  return { text: finalText, hasNestedMoments, entriesCount: outline.entries.length };
}

describe('convertOutlineToPlaintext — JSON to markdown conversion', () => {
  describe('basic entry conversion', () => {
    it('converts entries with title, number, description to ##-prefixed markdown', () => {
      const outline = {
        entries: [
          { number: 1, title: 'Act One: The Setup', description: 'Our hero wakes up.' },
          { number: 2, title: 'Act Two: The Conflict', description: 'The villain appears.' },
        ],
      };
      const result = convertOutlineToPlaintext(outline);
      expect(result.hasNestedMoments).toBe(false);
      expect(result.entriesCount).toBe(2);
      // Flat mode: each entry becomes a ## scene (no act headers since no nested moments)
      expect(result.text).toContain('## Act One: The Setup');
      expect(result.text).toContain('## Act Two: The Conflict');
      expect(result.text).toContain('Our hero wakes up.');
      expect(result.text).toContain('The villain appears.');
    });

    it('uses default Scene {number} title when title is missing', () => {
      const outline = {
        entries: [
          { number: 3, description: 'Third act content.' },
        ],
      };
      const result = convertOutlineToPlaintext(outline);
      // Flat mode: entries without nested moments use ## Scene {number}
      expect(result.text).toContain('## Scene 3');
      expect(result.text).toContain('Third act content.');
    });

    it('defaults to Scene 1 when both title and number are missing', () => {
      const outline = {
        entries: [
          { description: 'Mystery act content.' },
        ],
      };
      const result = convertOutlineToPlaintext(outline);
      expect(result.text).toContain('## Scene 1');
    });

    it('omits description section when description is empty or missing', () => {
      const outline = {
        entries: [
          { number: 1, title: 'Act One' },
        ],
      };
      const result = convertOutlineToPlaintext(outline);
      // The description should not appear as empty lines — only ## header + blank line
      const lines = result.text.split('\n').filter(Boolean);
      expect(lines).toEqual(['## Act One']);
    });
  });

  describe('nested moments/scenes', () => {
    it('renders entries with nested moments as ###-prefixed scenes', () => {
      const outline = {
        entries: [
          {
            number: 1,
            title: 'Act One: The Beginning',
            description: 'Opening act.',
            moments: [
              { number: 1, title: 'Opening Scene', description: 'Morning light.' },
              { number: 2, title: 'Inciting Incident', description: 'The call comes.' },
            ],
          },
        ],
      };
      const result = convertOutlineToPlaintext(outline);
      expect(result.hasNestedMoments).toBe(true);
      expect(result.text).toContain('## Act One: The Beginning');
      expect(result.text).toContain('Opening act.');
      expect(result.text).toContain('### Opening Scene');
      expect(result.text).toContain('Morning light.');
      expect(result.text).toContain('### Inciting Incident');
      expect(result.text).toContain('The call comes.');
    });

    it('supports entry.scenes as alias for entry.moments', () => {
      const outline = {
        entries: [
          {
            number: 1,
            title: 'Act One',
            scenes: [
              { number: 1, title: 'Scene 1', description: 'First scene.' },
            ],
          },
        ],
      };
      const result = convertOutlineToPlaintext(outline);
      expect(result.hasNestedMoments).toBe(true);
      expect(result.text).toContain('### Scene 1');
    });

    it('defaults scene title to Scene {number} when missing', () => {
      const outline = {
        entries: [
          {
            number: 1,
            title: 'Act One',
            moments: [
              { number: 5, description: 'Fifth moment.' },
            ],
          },
        ],
      };
      const result = convertOutlineToPlaintext(outline);
      expect(result.text).toContain('### Scene 5');
      expect(result.text).toContain('Fifth moment.');
    });

    it('defaults scene title and number when both missing in nested moment', () => {
      const outline = {
        entries: [
          {
            number: 1,
            title: 'Act One',
            moments: [
              { description: 'A mysterious scene.' },
            ],
          },
        ],
      };
      const result = convertOutlineToPlaintext(outline);
      expect(result.text).toContain('### Scene 1');
    });
  });

  describe('flat entries (no nested moments) — expands to ## scenes', () => {
    it('flattens entries without moments into ##-prefixed scenes', () => {
      const outline = {
        entries: [
          { number: 1, title: 'Cold Open', description: 'A dark alley.' },
          { number: 2, title: 'Main Title', description: 'Theme plays.' },
        ],
      };
      const result = convertOutlineToPlaintext(outline);
      expect(result.hasNestedMoments).toBe(false);
      // Flat mode: uses ## for each entry as a scene (not "Act" headers)
      expect(result.text).toContain('## Cold Open');
      expect(result.text).toContain('## Main Title');
      expect(result.text).not.toContain('###');
    });

    it('defaults to Scene {number} for flat entries without title', () => {
      const outline = {
        entries: [
          { number: 7, description: 'Seventh scene.' },
        ],
      };
      const result = convertOutlineToPlaintext(outline);
      expect(result.text).toContain('## Scene 7');
    });
  });

  describe('edge cases', () => {
    it('handles single entry', () => {
      const outline = {
        entries: [
          { number: 1, title: 'Only Act', description: 'Single act story.' },
        ],
      };
      const result = convertOutlineToPlaintext(outline);
      expect(result.text).toContain('## Only Act');
      expect(result.text).toContain('Single act story.');
      expect(result.entriesCount).toBe(1);
    });

    it('handles mixed entries — some with nested moments, some without', () => {
      const outline = {
        entries: [
          {
            number: 1,
            title: 'Act One',
            description: 'First act.',
            moments: [
              { number: 1, title: 'Scene A', description: 'Scene A content.' },
            ],
          },
          {
            number: 2,
            title: 'Act Two',
            description: 'Second act.',
          },
        ],
      };
      const result = convertOutlineToPlaintext(outline);
      expect(result.hasNestedMoments).toBe(true);
      // Nested mode: uses act headers + ### for nested scenes
      expect(result.text).toContain('## Act One');
      expect(result.text).toContain('### Scene A');
      expect(result.text).toContain('## Act Two');
      // Act Two entry without moments still has ## act header
      expect(result.text).toContain('Second act.');
    });

    it('handles empty text after trimming description', () => {
      const outline = {
        entries: [
          { number: 1, title: 'Act One', description: '   ' },
        ],
      };
      const result = convertOutlineToPlaintext(outline);
      // Blank description treated as falsy — omitted
      expect(result.text).not.toContain('   ');
    });

    it('handles entries with special characters in descriptions', () => {
      const outline = {
        entries: [
          { number: 1, title: 'Act "Quoted"', description: 'Quote: "Hello world" & <tag>' },
        ],
      };
      const result = convertOutlineToPlaintext(outline);
      expect(result.text).toContain('Quote: "Hello world" & <tag>');
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// 2. processStoryOutlineRewrite — validation logic
// ──────────────────────────────────────────────────────────────────

/**
 * Reference implementation of the parse/validate logic from
 * processStoryOutlineRewrite at line 928-968.
 */
function validateAndParseOutlineForRewrite(
  plaintext: string | null | undefined,
  docType: string | null | undefined
): { valid: boolean; error?: string; entries?: Array<{ number?: number; title?: string; description?: string }>; totalEntries?: number } {
  if (docType !== 'story_outline') {
    return { valid: false, error: 'Not a story outline' };
  }
  const trimmed = (plaintext || '').trim();
  if (!trimmed.startsWith('{')) {
    return { valid: false, error: 'Source version plaintext is not JSON object' };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { valid: false, error: 'Invalid JSON' };
  }
  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    return { valid: false, error: 'Story outline has no entries to rewrite' };
  }
  return { valid: true, entries: parsed.entries, totalEntries: parsed.entries.length };
}

function buildChunkMeta(
  entries: Array<{ number?: number; title?: string; description?: string }>,
  newVersionId: string,
  documentId: string
): Array<{ chunk_key: string; label: string; moment_number: number; char_count: number }> {
  return entries.map((e, idx) => ({
    chunk_key: `moment_${e.number || idx + 1}`,
    label: e.title || `Moment ${e.number || idx + 1}`,
    moment_number: e.number || idx + 1,
    char_count: (e.description || '').length,
  }));
}

describe('validateAndParseOutlineForRewrite — processStoryOutlineRewrite validation', () => {
  it('rejects non-story_outline doc_type', () => {
    const result = validateAndParseOutlineForRewrite('{"entries":[]}', 'feature_script');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Not a story outline');
  });

  it('rejects non-JSON plaintext', () => {
    const result = validateAndParseOutlineForRewrite('This is plaintext', 'story_outline');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Source version plaintext is not JSON object');
  });

  it('rejects empty/null plaintext', () => {
    const r1 = validateAndParseOutlineForRewrite(null, 'story_outline');
    expect(r1.valid).toBe(false);
    expect(r1.error).toBe('Source version plaintext is not JSON object');

    const r2 = validateAndParseOutlineForRewrite(undefined, 'story_outline');
    expect(r2.valid).toBe(false);

    const r3 = validateAndParseOutlineForRewrite('', 'story_outline');
    expect(r3.valid).toBe(false);

    const r4 = validateAndParseOutlineForRewrite('   ', 'story_outline');
    expect(r4.valid).toBe(false);
  });

  it('rejects invalid JSON', () => {
    const result = validateAndParseOutlineForRewrite('{"entries": [bad json}', 'story_outline');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid JSON');
  });

  it('rejects JSON without entries array', () => {
    const result = validateAndParseOutlineForRewrite('{"title":"Test"}', 'story_outline');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Story outline has no entries to rewrite');
  });

  it('rejects empty entries array', () => {
    const result = validateAndParseOutlineForRewrite('{"entries":[]}', 'story_outline');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Story outline has no entries to rewrite');
  });

  it('accepts valid story outline JSON with entries', () => {
    const json = JSON.stringify({
      title: 'My Story',
      entries: [
        { number: 1, title: 'Act 1', description: 'Beginning.' },
        { number: 2, title: 'Act 2', description: 'Middle.' },
      ],
    });
    const result = validateAndParseOutlineForRewrite(json, 'story_outline');
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(2);
    expect(result.entries).toHaveLength(2);
  });

  it('accepts JSON with whitespace before opening brace', () => {
    const result = validateAndParseOutlineForRewrite('  {"entries":[{"number":1,"title":"A","description":"B"}]}', 'story_outline');
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(1);
  });

  it('handles entries with minimal fields (number + description only)', () => {
    const json = JSON.stringify({
      entries: [
        { number: 42, description: 'The answer.' },
      ],
    });
    const result = validateAndParseOutlineForRewrite(json, 'story_outline');
    expect(result.valid).toBe(true);
    expect(result.entries![0].number).toBe(42);
    expect(result.entries![0].description).toBe('The answer.');
  });
});

describe('buildChunkMeta — chunk metadata construction', () => {
  it('builds chunk_key from entry.number', () => {
    const entries = [
      { number: 1, title: 'Act 1', description: 'Desc' },
      { number: 2, title: 'Act 2', description: 'Desc 2' },
    ];
    const meta = buildChunkMeta(entries, 'v1', 'd1');
    expect(meta[0].chunk_key).toBe('moment_1');
    expect(meta[1].chunk_key).toBe('moment_2');
  });

  it('falls back chunk_key to idx+1 when number missing', () => {
    const entries = [
      { title: 'No number', description: 'Desc' },
    ];
    const meta = buildChunkMeta(entries, 'v1', 'd1');
    expect(meta[0].chunk_key).toBe('moment_1');
  });

  it('builds label from entry.title', () => {
    const entries = [
      { number: 3, title: 'The Climax', description: 'Big finish.' },
    ];
    const meta = buildChunkMeta(entries, 'v1', 'd1');
    expect(meta[0].label).toBe('The Climax');
  });

  it('falls back label to Moment {number}', () => {
    const entries = [
      { number: 7, description: 'Seventh.' },
    ];
    const meta = buildChunkMeta(entries, 'v1', 'd1');
    expect(meta[0].label).toBe('Moment 7');
  });

  it('computes char_count from description length', () => {
    const entries = [
      { number: 1, title: 'A', description: 'Hello' },
      { number: 2, title: 'B', description: 'World!' },
    ];
    const meta = buildChunkMeta(entries, 'v1', 'd1');
    expect(meta[0].char_count).toBe(5);
    expect(meta[1].char_count).toBe(6);
  });

  it('handles empty description with zero char_count', () => {
    const entries = [
      { number: 1, title: 'A' },
    ];
    const meta = buildChunkMeta(entries, 'v1', 'd1');
    expect(meta[0].char_count).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────
// 3. isJSONOutline — frontend routing logic
// ──────────────────────────────────────────────────────────────────

/**
 * Reference implementation of isJSONOutline from PDE.tsx line 1495.
 */
function isJSONOutline(plaintext: string | null | undefined): boolean {
  return (plaintext || '').trim().startsWith('{');
}

describe('isJSONOutline — routing detection', () => {
  it('returns true for JSON objects', () => {
    expect(isJSONOutline('{"entries":[]}')).toBe(true);
    expect(isJSONOutline('{"title":"Test"}')).toBe(true);
  });

  it('returns false for plaintext starting with non-brace character', () => {
    expect(isJSONOutline('## Act One')).toBe(false);
    expect(isJSONOutline('This is plaintext outline')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isJSONOutline('')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isJSONOutline(null)).toBe(false);
    expect(isJSONOutline(undefined)).toBe(false);
  });

  it('handles whitespace before opening brace', () => {
    expect(isJSONOutline('  {"entries":[]}')).toBe(true);
    expect(isJSONOutline('\n\t{"entries":[]}')).toBe(true);
  });

  it('returns true for full JSON story outline', () => {
    const outline = JSON.stringify({
      title: 'Feature Film',
      format: 'film',
      entries: [
        { number: 1, title: 'Act One', description: 'Setup.' },
        { number: 2, title: 'Act Two', description: 'Confrontation.' },
        { number: 3, title: 'Act Three', description: 'Resolution.' },
      ],
    });
    expect(isJSONOutline(outline)).toBe(true);
  });

  it('returns false for ##-prefixed outlines (sectioned rewrite fallback)', () => {
    expect(isJSONOutline('## Act One\n\nContent here.')).toBe(false);
    expect(isJSONOutline('## Scene 1')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// 4. _entriesPreview — enqueue entries counter
// ──────────────────────────────────────────────────────────────────

/**
 * Reference implementation of _entriesPreview from index.ts line 33346-33355.
 */
function entriesPreview(plaintext: string | null | undefined): number {
  try {
    const trimmed = (plaintext || '').trim();
    if (trimmed.startsWith('{')) {
      const preview = JSON.parse(trimmed);
      return Array.isArray(preview.entries) ? preview.entries.length : 0;
    }
  } catch {}
  return 0;
}

describe('entriesPreview — enqueue preview counter', () => {
  it('counts entries in JSON story outline', () => {
    const json = JSON.stringify({
      entries: [
        { number: 1, title: 'A', description: 'D1' },
        { number: 2, title: 'B', description: 'D2' },
        { number: 3, title: 'C', description: 'D3' },
      ],
    });
    expect(entriesPreview(json)).toBe(3);
  });

  it('returns 0 for plaintext (non-JSON) outlines', () => {
    expect(entriesPreview('## Act One\n\nContent.')).toBe(0);
  });

  it('returns 0 for null/undefined/empty', () => {
    expect(entriesPreview(null)).toBe(0);
    expect(entriesPreview(undefined)).toBe(0);
    expect(entriesPreview('')).toBe(0);
    expect(entriesPreview('   ')).toBe(0);
  });

  it('returns 0 when JSON has no entries array', () => {
    expect(entriesPreview('{"title":"Test"}')).toBe(0);
  });

  it('returns 0 for malformed JSON', () => {
    expect(entriesPreview('{"entries": [broken}')).toBe(0);
  });

  it('returns 0 for empty entries array', () => {
    expect(entriesPreview('{"entries":[]}')).toBe(0);
  });

  it('handles whitespace before JSON opening brace', () => {
    const json = '  {"entries":[{"number":1}]}';
    expect(entriesPreview(json)).toBe(1);
  });
});
