/**
 * beat-sheet-dedup-fix.test.ts
 *
 * Validates P0-4: Beat sheet section dedup by label (NOT sk).
 *
 * The dedup block (added after line 11806 in dev-engine-v2/index.ts) removes
 * duplicate act sections by comparing sec.label.toUpperCase() against
 * ["ACT 1", "ACT 2A", "ACT 2B", "ACT 3"].
 *
 * Invariants:
 * 1. Keeps only LAST occurrence of each known label
 * 2. Non-beat-sheet labels pass through unchanged
 * 3. Case-insensitive label matching
 * 4. Honors "ACT 2A" and "ACT 2B" as distinct labels
 * 5. Empty sections array → empty result
 */
import { describe, it, expect } from 'vitest';

interface Section {
  header: string;
  content: string;
  label: string;
  sk: string;
}

// ── Pure logic extractor — mirrors the dedup added at line 11807-11834 ──
function dedupBeatSheetSections(sections: Section[]): Section[] {
  const bsLabels = new Set(['ACT 1', 'ACT 2A', 'ACT 2B', 'ACT 3']);
  const seenLabels = new Set<string>();
  const deduped: Section[] = [];

  for (let i = sections.length - 1; i >= 0; i--) {
    const sec = sections[i];
    const labelUpper = (sec.label || '').toUpperCase();
    if (bsLabels.has(labelUpper)) {
      if (!seenLabels.has(labelUpper)) {
        seenLabels.add(labelUpper);
        deduped.unshift(sec);
      }
    } else {
      deduped.unshift(sec);
    }
  }

  return deduped;
}

// ── Tests ──

describe('P0-4: Beat sheet section dedup by label', () => {
  it('deduplicates duplicate ACT 1 labels, keeps last', () => {
    const sections: Section[] = [
      { header: '## ACT 1', content: 'old act 1', label: 'ACT 1', sk: 'beat_sheet_act' },
      { header: '## ACT 2A', content: 'act 2a', label: 'ACT 2A', sk: 'beat_sheet_act' },
      { header: '## ACT 1', content: 'new act 1', label: 'ACT 1', sk: 'beat_sheet_act' },
    ];
    const result = dedupBeatSheetSections(sections);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('act 2a');  // first in result order (unshift preserves insertion from reverse)
    expect(result[1].content).toBe('new act 1'); // last occurrence wins
  });

  it('non-beat-sheet labels pass through', () => {
    const sections: Section[] = [
      { header: '## ACT 1', content: 'act 1', label: 'ACT 1', sk: 'beat_sheet_act' },
      { header: '## PREAMBLE', content: 'preamble text', label: 'PREAMBLE', sk: 'preamble' },
    ];
    const result = dedupBeatSheetSections(sections);
    expect(result).toHaveLength(2);
  });

  it('case-insensitive matching', () => {
    const sections: Section[] = [
      { header: '## act 1', content: 'lowercase', label: 'act 1', sk: 'beat_sheet_act' },
      { header: '## ACT 1', content: 'uppercase', label: 'ACT 1', sk: 'beat_sheet_act' },
    ];
    const result = dedupBeatSheetSections(sections);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('uppercase'); // last wins
  });

  it('ACT 2A and ACT 2B are distinct', () => {
    const sections: Section[] = [
      { header: '## ACT 2A', content: '2a', label: 'ACT 2A', sk: 'beat_sheet_act' },
      { header: '## ACT 2B', content: '2b', label: 'ACT 2B', sk: 'beat_sheet_act' },
    ];
    const result = dedupBeatSheetSections(sections);
    expect(result).toHaveLength(2);
  });

  it('ACT 3 preserved through dedup', () => {
    const sections: Section[] = [
      { header: '## ACT 3', content: 'act 3', label: 'ACT 3', sk: 'beat_sheet_act' },
    ];
    const result = dedupBeatSheetSections(sections);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('ACT 3');
  });

  it('empty sections → empty result', () => {
    expect(dedupBeatSheetSections([])).toHaveLength(0);
  });

  it('unknown label not dropped', () => {
    const sections: Section[] = [
      { header: '## ACT 1', content: 'act 1', label: 'ACT 1', sk: 'beat_sheet_act' },
      { header: '## CUSTOM', content: 'custom', label: 'CUSTOM LABEL', sk: 'custom' },
    ];
    const result = dedupBeatSheetSections(sections);
    expect(result).toHaveLength(2);
  });
});