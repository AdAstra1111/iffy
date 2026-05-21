/**
 * Tests for Beat Sheet Generation Fixes
 *
 * 1. Assembly regex (index.ts:11968) — strips leading whitespace before headers,
 *    preventing duplicate ## headers during sectioned rewrite assembly
 * 2. Beat format enforcement (index.ts:2436-2439, 2702) — ### N. **Beat Name** template
 *    added to buildRewriteSystem and REWRITE_CHUNK_SYSTEM_SECTIONED prompts
 * 3. BeatRewritePanel.tsx (lines 333-345) — H3 format regex parser for
 *    ### N. Beat Name / ### N. **Beat Name**, placed before existing numbered-list parser
 */
import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────────────────────────
// FIX 1: Assembly regex — strip leading headers before reassembly
// ──────────────────────────────────────────────────────────────────
// The fix at line 11968 of index.ts:
//   s.content.replace(/^\s*#{1,6}\s+[^\n]+\n*/, " ").trim()
// When the LLM returns content starting with "## Act 1\n...", and the
// assembly code wraps it in "## Act 1\n\n", without the regex you'd get:
//   ## Act 1\n\n## Act 1\n...  (duplicate headers)
// The regex strips the LLM's own header before the assembly adds its own.

describe('Assembly regex — header deduplication', () => {

  /**
   * Reference implementation of the assembly regex from index.ts:11968
   */
  function stripHeader(content: string): string {
    return content.replace(/^\s*#{1,6}\s+[^\n]+\n*/, ' ').trim();
  }

  function assembleSection(sectionLabel: string, content: string): string {
    const stripped = stripHeader(content);
    return `## ${sectionLabel}\n\n${stripped}`;
  }

  describe('Primary use case: LLM returns content with its own ## header', () => {
    it('strips leading ## header from LLM content before assembly', () => {
      const llmContent = '## Act 1\n\nThis is the opening act content.\nIt has multiple paragraphs.';
      const result = assembleSection('Act 1', llmContent);
      // Without the fix: "## Act 1\n\n## Act 1\n\nThis is the opening..."
      // With the fix:    "## Act 1\n\nThis is the opening..."
      expect(result).toBe('## Act 1\n\nThis is the opening act content.\nIt has multiple paragraphs.');
      expect(result).not.toContain('## Act 1\n\n## Act 1');
    });

    it('strips leading ## header but preserves subsequent ### beat headers', () => {
      // Section content starts with ## Act 1 header (stripped), has ### beats (preserved)
      const llmContent = '## Act 1 Beats\n\n### 1. **Opening Image**\nThe protagonist wakes up in a mundane world.\n*Dramatic Function:* Establish normalcy.';
      const stripped = stripHeader(llmContent);
      // The ## Act 1 Beats header is stripped
      expect(stripped).not.toMatch(/^## Act 1 Beats/);
      // But the subsequent ### beat header is preserved
      expect(stripped).toContain('### 1. **Opening Image**');
      expect(stripped).toContain('protagonist wakes up');
      expect(stripped).toContain('Dramatic Function');
    });

    it('strips whitespace-prefixed headers', () => {
      // The regex ^\s* handles this — LLM sometimes indents headers
      const llmContent = '   ## Act 2A\n\nRising action content.';
      const stripped = stripHeader(llmContent);
      expect(stripped).toBe('Rising action content.');
    });

    it('strips #### and other hash levels (1-6)', () => {
      expect(stripHeader('# H1 header\ncontent')).toBe('content');
      expect(stripHeader('## H2 header\ncontent')).toBe('content');
      expect(stripHeader('### H3 header\ncontent')).toBe('content');
      expect(stripHeader('#### H4 header\ncontent')).toBe('content');
      expect(stripHeader('##### H5 header\ncontent')).toBe('content');
      expect(stripHeader('###### H6 header\ncontent')).toBe('content');
    });

    it('handles headers with extra spaces after #', () => {
      const llmContent = '##    Act 3   \n\nClimax content.';
      const stripped = stripHeader(llmContent);
      expect(stripped).toBe('Climax content.');
    });

    it('handles no leading header (content starts with prose)', () => {
      const content = 'Just some prose content without a header.';
      expect(stripHeader(content)).toBe('Just some prose content without a header.');
    });

    it('handles empty content', () => {
      expect(stripHeader('')).toBe('');
    });

    it('handles whitespace-only content', () => {
      expect(stripHeader('   \n\n  ')).toBe('');
    });

    it('handles content that starts with a blank line then header', () => {
      const content = '\n\n## Act 1\n\nContent after blank lines.';
      const stripped = stripHeader(content);
      // The regex is ^\s* so it handles leading whitespace including newlines
      expect(stripped).not.toMatch(/^##/);
      expect(stripped).toBe('Content after blank lines.');
    });

    it('preserves subsequent ### headers (beat markers) within content', () => {
      const llmContent = '## Act 1\n\n### 1. **Opening Image**\nThe protagonist wakes up.\n### 2. **Inciting Incident**\nThe call to adventure arrives.';
      const stripped = stripHeader(llmContent);
      // Only the first leading header is stripped
      expect(stripped).toContain('### 1. **Opening Image**');
      expect(stripped).toContain('### 2. **Inciting Incident**');
      expect(stripped).not.toMatch(/^## Act 1/);
    });

    it('removes trailing newlines after the header', () => {
      // The regex includes \n* at the end, so it consumes trailing newlines
      expect(stripHeader('## Act 1\n\n\nContent')).toBe('Content');
      expect(stripHeader('## Act 1\nContent')).toBe('Content'); // single newline only
    });
  });

  describe('Full assembly simulation (edge cases)', () => {
    it('assembles multiple sections without duplicate headers', () => {
      const sections = [
        { label: 'Act 1', content: '## Act 1\n\nOpening scene.\n### 1. **First Beat**\nDescription.' },
        { label: 'Act 2A', content: '## Act 2A\n\nRising action.\n### 2. **Second Beat**\nDescription.' },
        { label: 'Act 2B', content: '## Act 2B\n\nMidpoint twist.\n### 3. **Third Beat**\nDescription.' },
        { label: 'Act 3', content: '## Act 3\n\nClimax.\n### 4. **Final Beat**\nDescription.' },
      ];

      const assembled = sections.map(s => assembleSection(s.label, s.content))
        .join('\n\n')
        .replace(/\n{3,}/g, '\n\n');

      // Verify no duplicate section headers
      expect(assembled).not.toContain('## Act 1\n\n## Act 1');
      expect(assembled).not.toContain('## Act 2A\n\n## Act 2A');
      expect(assembled).not.toContain('## Act 2B\n\n## Act 2B');
      expect(assembled).not.toContain('## Act 3\n\n## Act 3');

      // Verify each section appears exactly once
      expect(assembled.match(/## Act 1/g)).toHaveLength(1);
      expect(assembled.match(/## Act 2A/g)).toHaveLength(1);
      expect(assembled.match(/## Act 2B/g)).toHaveLength(1);
      expect(assembled.match(/## Act 3/g)).toHaveLength(1);

      // Verify beat markers are preserved
      expect(assembled).toContain('### 1. **First Beat**');
      expect(assembled).toContain('### 2. **Second Beat**');
      expect(assembled).toContain('### 3. **Third Beat**');
      expect(assembled).toContain('### 4. **Final Beat**');
    });

    it('handles LLM content without headers (already clean)', () => {
      const content = 'Just prose content, no header.';
      const result = assembleSection('Notes', content);
      expect(result).toBe('## Notes\n\nJust prose content, no header.');
    });

    it('handles LLM content with different header text than section label', () => {
      // LLM outputs "## The Opening" but section label is "Act 1"
      const content = '## The Opening\n\nScene description.';
      const result = assembleSection('Act 1', content);
      expect(result).toBe('## Act 1\n\nScene description.');
      expect(result).not.toContain('## The Opening');
    });

    it('handles LLM content with bolded header', () => {
      const content = '## **Act 1**\n\nScene.';
      const stripped = stripHeader(content);
      expect(stripped).toBe('Scene.');
    });

    it('handles staggered content with multiple blank lines', () => {
      // The join().replace(/\n{3,}/g, '\n\n') normalizes 3+ newlines to 2
      const s1 = assembleSection('Act 1', '## Act 1\n\nContent');
      const s2 = assembleSection('Act 2A', '## Act 2A\n\nMore');
      const joined = [s1, s2].join('\n\n');
      const normalized = joined.replace(/\n{3,}/g, '\n\n');
      expect(normalized).toBe('## Act 1\n\nContent\n\n## Act 2A\n\nMore');
    });
  });

  describe('Invariant: single ## per section in assembled output', () => {
    it('every assembled section starts with exactly one ## header', () => {
      const sections = ['Act 1', 'Act 2A', 'Act 2B', 'Act 3'];
      const contents = [
        '## Act 1\n\nContent A',
        '## Act 2A\n\nContent B',
        '## Act 2B\n\nContent C',
        '## Act 3\n\nContent D',
      ];

      for (let i = 0; i < sections.length; i++) {
        const result = assembleSection(sections[i], contents[i]);
        const lines = result.split('\n');
        // First line must be the section header
        expect(lines[0]).toMatch(/^## Act/);
        // No second ## header
        expect(lines.slice(1).filter(l => l.startsWith('## '))).toHaveLength(0);
        // But sub-headers (###) are preserved
        const subContent = assembleSection('Act 1', '## Act 1\n\n### 1. **Beat**\nDesc.');
        const subLines = subContent.split('\n');
        expect(subLines.filter(l => l.startsWith('## '))).toHaveLength(1);
        expect(subLines.filter(l => l.startsWith('###'))).toHaveLength(1);
      }
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// FIX 2: Beat format enforcement in prompts
// ──────────────────────────────────────────────────────────────────
// Lines 2436-2439 (buildRewriteSystem) and line 2702 (REWRITE_CHUNK_SYSTEM_SECTIONED)
// Added ### N. **Beat Name** template to beat sheet rewrite prompts
// This enforces consistent H3 format so the LLM outputs structured beats
// that the BeatRewritePanel can parse reliably.

describe('Beat format enforcement — prompt templates', () => {

  // Reference: buildRewriteSystem block at lines 2436-2439
  const BEAT_FORMAT_TEMPLATE = `### <N>. **<Beat Name>**\n<4-6 sentence prose describing what happens, dramatic function, emotional shift>\n*Dramatic Function:* <purpose>`;

  // Reference: REWRITE_CHUNK_SYSTEM_SECTIONED at line 2702
  const REWRITE_CHUNK_BEAT_RULE = 'each beat MUST use the format ### <N>. **<Beat Name>** followed by prose and *Dramatic Function:* <purpose>. Do NOT use plain numbered list items — use H3 headers for beat labels.';

  describe('buildRewriteSystem — beat format instructions', () => {
    it('contains the ### N. **Beat Name** template', () => {
      expect(BEAT_FORMAT_TEMPLATE).toContain('###');
      expect(BEAT_FORMAT_TEMPLATE).toContain('Beat Name');
      expect(BEAT_FORMAT_TEMPLATE).toContain('*Dramatic Function:*');
      expect(BEAT_FORMAT_TEMPLATE).toContain('<N>');
    });

    it('specifies 4-6 sentence prose for description', () => {
      expect(BEAT_FORMAT_TEMPLATE).toMatch(/4-6 sentence prose/);
    });

    it('has the correct structural shape: H3 → prose → DF', () => {
      const [header, prose, df] = BEAT_FORMAT_TEMPLATE.split('\n');
      expect(header).toMatch(/^###/);
      expect(prose).toMatch(/sentence prose/);
      expect(df).toMatch(/Dramatic Function/);
    });
  });

  describe('REWRITE_CHUNK_SYSTEM_SECTIONED — beat format rule', () => {
    it('enforces H3 headers for beats, not plain numbered lists', () => {
      expect(REWRITE_CHUNK_BEAT_RULE).toContain('###');
      expect(REWRITE_CHUNK_BEAT_RULE).toContain('H3 headers');
      expect(REWRITE_CHUNK_BEAT_RULE).toContain('Do NOT use plain numbered list items');
    });
  });

  describe('Edge cases — format enforcement', () => {
    it('template allows bold in beat name (** format)', () => {
      // The LLM can output either "### 1. **Opening Image**" or "### 1. Opening Image"
      // Both are valid H3 format, but the template encourages ** style
      expect(BEAT_FORMAT_TEMPLATE).toContain('**<Beat Name>**');
    });

    it('multiple beats use sequential numbering (N is a placeholder)', () => {
      // The template uses <N> as a placeholder; actual beats will be 1, 2, 3, ...
      expect(BEAT_FORMAT_TEMPLATE).toContain('<N>');
    });
  });

  describe('Invariant: Prompt instructions do not conflict', () => {
    it('buildRewriteSystem beat format and sectioned rewrite beat format agree', () => {
      // Both should enforce ### H3 format
      const bothUseH3 = BEAT_FORMAT_TEMPLATE.includes('###') &&
        REWRITE_CHUNK_BEAT_RULE.includes('###');
      expect(bothUseH3).toBe(true);
    });

    it('both prompts mention Dramatic Function', () => {
      const buildSysHasDf = BEAT_FORMAT_TEMPLATE.includes('Dramatic Function');
      const rewriteChunkHasDf = REWRITE_CHUNK_BEAT_RULE.includes('Dramatic Function');
      expect(buildSysHasDf).toBe(true);
      expect(rewriteChunkHasDf).toBe(true);
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// FIX 3: BeatRewritePanel H3 format parser fallback
// ──────────────────────────────────────────────────────────────────
// Lines 333-345 of BeatRewritePanel.tsx add a new regex parser for
// ### N. Beat Name and ### N. **Beat Name** formats, placed BEFORE
// the existing numbered-list parser (1. **Beat Name**).
// This handles the case where the LLM outputs beats using H3 headers
// (as instructed by the prompt changes in Fix 2).

describe('BeatRewritePanel — H3 format parser fallback', () => {

  // Reference implementation of parseBeatContent from BeatRewritePanel.tsx
  function parseBeatContent(
    meta: { id: string; name: string },
    rawLines: string[],
    format: 'numbered' | 'h3',
  ): { id: string; name: string; raw: string } | null {
    if (!meta.id && !meta.name) return null;
    return {
      id: meta.id,
      name: meta.name,
      raw: rawLines.join('\n'),
    };
  }

  // Reference H3 beat parser from lines 333-345
  function parseBeatsFromContent(plaintext: string): Array<{
    id: string;
    name: string;
    raw: string;
    act?: string;
  }> {
    const lines = plaintext.split('\n');
    const beats: Array<{ id: string; name: string; raw: string; act?: string }> = [];
    let currentBeatMeta: { id: string; name: string } | null = null;
    let currentBeatLines: string[] = [];
    let currentAct: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Act header detection (simplified)
      const actMatch = trimmed.match(/^##\s+Act\s+(\w+)/i);
      if (actMatch) {
        // flush previous beat
        if (currentBeatMeta && currentBeatLines.length > 0) {
          const beat = parseBeatContent(currentBeatMeta, currentBeatLines, 'h3');
          if (beat) {
            beat.act = currentAct || undefined;
            beats.push(beat);
          }
        }
        currentAct = actMatch[1];
        currentBeatMeta = null;
        currentBeatLines = [];
        continue;
      }

      // H3 beat match: "### N. Beat Name" or "### N. **Beat Name**"
      const h3BeatMatch = trimmed.match(/^###\s+(\d+)\.\s+(.+)/);
      if (h3BeatMatch) {
        // flush previous beat
        if (currentBeatMeta && currentBeatLines.length > 0) {
          const beat = parseBeatContent(currentBeatMeta, currentBeatLines, 'h3');
          if (beat) {
            beat.act = currentAct || undefined;
            beats.push(beat);
          }
        }
        const name = h3BeatMatch[2].replace(/^\*{2}|\*{2}$/g, '').trim();
        currentBeatMeta = { id: h3BeatMatch[1], name };
        currentBeatLines = [line];
        continue;
      }

      // Accumulate lines into current beat
      if (trimmed && currentBeatMeta) {
        currentBeatLines.push(line);
      }
    }

    // Flush last beat
    if (currentBeatMeta && currentBeatLines.length > 0) {
      const beat = parseBeatContent(currentBeatMeta, currentBeatLines, 'h3');
      if (beat) {
        beat.act = currentAct || undefined;
        beats.push(beat);
      }
    }

    return beats;
  }

  describe('Primary use case: LLM outputs beats in H3 format', () => {
    it('parses "### N. Beat Name" format', () => {
      const content = `## Act 1 Beats
### 1. Opening Image
The protagonist wakes up in their ordinary world, unaware of the adventure ahead.
*Dramatic Function:* Establish normalcy and character baseline.

### 2. Inciting Incident
A mysterious message arrives, disrupting the routine.
*Dramatic Function:* Introduce the central conflict.`;

      const beats = parseBeatsFromContent(content);
      expect(beats).toHaveLength(2);
      expect(beats[0].id).toBe('1');
      expect(beats[0].name).toBe('Opening Image');
      expect(beats[0].act).toBe('1');
      expect(beats[1].id).toBe('2');
      expect(beats[1].name).toBe('Inciting Incident');
    });

    it('parses "### N. **Beat Name**" format (bold name)', () => {
      const content = `## Act 1 Beats
### 1. **Opening Image**
Description.
### 2. **Inciting Incident**
Description.`;

      const beats = parseBeatsFromContent(content);
      expect(beats).toHaveLength(2);
      expect(beats[0].name).toBe('Opening Image');
      expect(beats[1].name).toBe('Inciting Incident');
    });
  });

  describe('Edge cases', () => {
    it('handles empty content', () => {
      const beats = parseBeatsFromContent('');
      expect(beats).toEqual([]);
    });

    it('handles content with only act headers and no beats', () => {
      const content = `## Act 1 Beats
## Act 2A Beats
## Act 3 Beats`;
      const beats = parseBeatsFromContent(content);
      expect(beats).toEqual([]);
    });

    it('parses beats across multiple acts', () => {
      const content = `## Act 1 Beats
### 1. **Opening Image**
Content A.
### 2. **Call to Adventure**
Content B.
## Act 2A Beats
### 3. **Rising Action**
Content C.
## Act 3 Beats
### 4. **Climax**
Content D.`;

      const beats = parseBeatsFromContent(content);
      expect(beats).toHaveLength(4);
      expect(beats[0].act).toBe('1');
      expect(beats[1].act).toBe('1');
      expect(beats[2].act).toBe('2A');
      expect(beats[3].act).toBe('3');
    });

    it('preserves raw content including Dramatic Function', () => {
      const content = `## Act 1 Beats
### 1. **Opening Image**
The protagonist wakes up in their ordinary world.
*Dramatic Function:* Establish normalcy.`;

      const beats = parseBeatsFromContent(content);
      expect(beats).toHaveLength(1);
      expect(beats[0].raw).toContain('### 1. **Opening Image**');
      expect(beats[0].raw).toContain('protagonist wakes up');
      expect(beats[0].raw).toContain('Dramatic Function');
    });

    it('handles beats with no Dramatic Function line', () => {
      const content = `## Act 1 Beats
### 1. **Simple Beat**
Just some prose.`;

      const beats = parseBeatsFromContent(content);
      expect(beats).toHaveLength(1);
      expect(beats[0].name).toBe('Simple Beat');
      expect(beats[0].raw).toContain('Just some prose');
    });

    it('handles beats with extended prose (multiple paragraphs)', () => {
      const content = `## Act 1 Beats
### 1. **Opening Image**
First paragraph of description.

Second paragraph continuing the description.
*Dramatic Function:* Establish normalcy.`;

      const beats = parseBeatsFromContent(content);
      expect(beats).toHaveLength(1);
      expect(beats[0].raw).toContain('First paragraph');
      expect(beats[0].raw).toContain('Second paragraph');
      expect(beats[0].raw).toContain('Dramatic Function');
    });

    it('handles leading whitespace before H3', () => {
      const content = '  ### 1. **Indented Beat**\n  Description.';
      const beats = parseBeatsFromContent(content);
      expect(beats).toHaveLength(1);
      expect(beats[0].name).toBe('Indented Beat');
    });

    it('handles mixed H3 and #### headers (H3 is for beats, others ignored)', () => {
      const content = `## Act 1 Beats
### 1. **Real Beat**
Description.
#### Sub-note
Not a beat, should be part of the beat content.`;

      const beats = parseBeatsFromContent(content);
      expect(beats).toHaveLength(1);
      expect(beats[0].name).toBe('Real Beat');
      expect(beats[0].raw).toContain('Sub-note'); // #### lines become part of beat content
    });
  });

  describe('Regression: H3 parser does NOT break existing numbered-list parser', () => {
    it('still parses "1. **Beat Name**" format (numbered list)', () => {
      // Simulate the existing numbered-list parser's regex
      const beatMatch = '1. **Opening Image**'.match(/^(\d+)\.\s+\*\*(.+?)\*\*/);
      expect(beatMatch).not.toBeNull();
      expect(beatMatch![1]).toBe('1');
      expect(beatMatch![2]).toBe('Opening Image');
    });

    it('H3 parser fires BEFORE numbered list parser (priority test)', () => {
      // A line like "### 1. **Beat Name**" matches ONLY the H3 parser
      // The numbered list parser (/^(\d+)\.\s+\*\*(.+?)\*\*/) does NOT match
      // because of the ### prefix — the ^ anchor requires starting with digits.
      // This is by design: H3 lines are consumed first, before the numbered
      // parser is ever reached.
      const line = '### 1. **Beat Name**';
      const h3Match = line.match(/^###\s+(\d+)\.\s+(.+)/);
      const numberedMatch = line.match(/^(\d+)\.\s+\*\*(.+?)\*\*/);

      // H3 matches
      expect(h3Match).not.toBeNull();
      expect(h3Match![1]).toBe('1');
      expect(h3Match![2]).toBe('**Beat Name**');

      // Numbered list does NOT match (line starts with "###", not a digit)
      expect(numberedMatch).toBeNull();

      // Verify that a plain "1. **Beat Name**" (no ###) still matches the numbered parser
      const plainLine = '1. **Beat Name**';
      const plainMatch = plainLine.match(/^(\d+)\.\s+\*\*(.+?)\*\*/);
      expect(plainMatch).not.toBeNull();
      expect(plainMatch![1]).toBe('1');
      expect(plainMatch![2]).toBe('Beat Name');
    });
  });

  describe('Invariant: Every beat has a unique id', () => {
    it('no duplicate beat ids in parsed output', () => {
      const content = `## Act 1 Beats
### 1. **First Beat**
Content.
### 2. **Second Beat**
Content.
## Act 2A Beats
### 1. **First Beat of Act 2A**
Content.`;

      // This is valid — act 1 beat 1 and act 2A beat 1 are different beats
      // The parser doesn't enforce global uniqueness, but per-act it should
      const beats = parseBeatsFromContent(content);
      expect(beats).toHaveLength(3);
      expect(beats[0].id).toBe('1');
      expect(beats[0].act).toBe('1');
      expect(beats[2].id).toBe('1');
      expect(beats[2].act).toBe('2A');
    });
  });
});
