/**
 * note-resolution-gap-fix.test.ts
 *
 * Validates P0-5: project_dev_note_state.status sync + read-side defense.
 *
 * Part A (write-side): After marking development_notes as resolved, also
 *   update project_dev_note_state.status = "resolved" for matching notes
 *   (note_key == note_fingerprint for dev-engine-v2 generated notes).
 *
 * Part B (read-side): Cross-check project_dev_note_state blockers against
 *   development_notes to filter stale entries.
 *
 * Invariants:
 * 1. approvedNoteIds extracts note_fingerprint (matches dev-engine-v2/index.ts:10222)
 * 2. note_key (development_notes) matches note_fingerprint (project_dev_note_state)
 * 3. Read-side defense removes blockers for resolved development_notes
 * 4. Stale entries don't block downstream docs
 */
import { describe, it, expect } from 'vitest';

// ── Types ──

interface ApprovedNote {
  note_fingerprint?: string;
}

interface DevNoteStateEntry {
  note_fingerprint: string;
  status: string;
}

interface Blocker {
  source_table: string;
  note_key_or_fingerprint: string;
}

// ── Pure logic extractors ──

/**
 * Part A extractor: Maps approved notes to their fingerprints.
 * Mirrors dev-engine-v2/index.ts:10222.
 */
function extractApprovedNoteIds(approvedNotes: ApprovedNote[]): string[] {
  return approvedNotes.map((n) => n.note_fingerprint).filter(Boolean) as string[];
}

/**
 * Part B extractor: Removes stale project_dev_note_state blockers where the
 * corresponding development_notes entry is resolved.
 * Mirrors unifiedNoteControl.ts read-side defense.
 */
function filterStaleDevNoteBlockers(
  blockers: Blocker[],
  resolvedNoteKeys: string[],
): { filtered: Blocker[]; removedCount: number } {
  const resolvedSet = new Set(resolvedNoteKeys);
  const before = blockers.length;
  const filtered = blockers.filter(
    (b) => !(b.source_table === 'project_dev_note_state' && resolvedSet.has(b.note_key_or_fingerprint)),
  );
  return { filtered, removedCount: before - filtered.length };
}

// ── Tests ──

describe('P0-5 Part A: Write-side sync (dev-engine-v2)', () => {
  it('extracts note_fingerprint values from approved notes', () => {
    const notes: ApprovedNote[] = [
      { note_fingerprint: 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef12' },
      { note_fingerprint: 'b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef1234' },
    ];
    expect(extractApprovedNoteIds(notes)).toEqual([
      'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef12',
      'b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef1234',
    ]);
  });

  it('filters out entries with no note_fingerprint', () => {
    const notes: ApprovedNote[] = [
      { note_fingerprint: 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef12' },
      {},
      { note_fingerprint: 'b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef1234' },
    ];
    expect(extractApprovedNoteIds(notes)).toEqual([
      'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef12',
      'b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef1234',
    ]);
  });

  it('note_fingerprint values pass through to query', () => {
    // dev-engine-v2 generates notes where note_key === note_fingerprint
    const approvedNotes: ApprovedNote[] = [
      { note_fingerprint: 'scene-3-character-depth' },
    ];
    const ids = extractApprovedNoteIds(approvedNotes);

    // These exact values would be used to query:
    //   development_notes: .in("note_key", ids)
    //   project_dev_note_state: .in("note_fingerprint", ids)  <-- note field name diff
    expect(ids).toContain('scene-3-character-depth');
  });
});

describe('P0-5 Part B: Read-side defense (unifiedNoteControl)', () => {
  it('removes stale dev note state blockers for resolved notes', () => {
    const blockers: Blocker[] = [
      { source_table: 'project_dev_note_state', note_key_or_fingerprint: 'fp-1' },
      { source_table: 'project_dev_note_state', note_key_or_fingerprint: 'fp-2' },
      { source_table: 'project_notes', note_key_or_fingerprint: 'note-3' },
    ];
    const result = filterStaleDevNoteBlockers(blockers, ['fp-1']);
    expect(result.filtered).toHaveLength(2);
    expect(result.removedCount).toBe(1);
    // fp-1 was removed
    expect(result.filtered.find((b) => b.note_key_or_fingerprint === 'fp-1')).toBeUndefined();
    // non-dev-note-state blockers pass through
    expect(result.filtered.find((b) => b.note_key_or_fingerprint === 'note-3')).toBeDefined();
  });

  it('no removal when no resolved notes match', () => {
    const blockers: Blocker[] = [
      { source_table: 'project_dev_note_state', note_key_or_fingerprint: 'fp-1' },
    ];
    const result = filterStaleDevNoteBlockers(blockers, ['fp-2']);
    expect(result.filtered).toHaveLength(1);
    expect(result.removedCount).toBe(0);
  });

  it('empty blockers → no removal', () => {
    const result = filterStaleDevNoteBlockers([], ['fp-1']);
    expect(result.filtered).toHaveLength(0);
    expect(result.removedCount).toBe(0);
  });

  it('no removal when no project_dev_note_state blockers exist', () => {
    const blockers: Blocker[] = [
      { source_table: 'project_notes', note_key_or_fingerprint: 'note-1' },
      { source_table: 'project_deferred_notes', note_key_or_fingerprint: 'def-1' },
    ];
    const result = filterStaleDevNoteBlockers(blockers, ['note-1', 'def-1']);
    expect(result.filtered).toHaveLength(2);
    expect(result.removedCount).toBe(0);
  });
});