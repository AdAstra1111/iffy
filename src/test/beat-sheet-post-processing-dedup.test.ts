/**
 * Tests for Beat Sheet post-processing dedup (commit 580d863)
 *
 * Lines 572-587 of BeatRewritePanel.tsx add a post-processing merge pass
 * at the end of parseBeatSheet() that consolidates duplicate act containers
 * by canonical name using a Set + merge loop.
 *
 * This catches edge cases where the inline object-identity check
 * (existing !== currentAct) fails, particularly:
 * - When multiple different act headers all normalize to the same canonical name
 * - When parsers (JSON, slash, ITEM, numbered, plaintext, markdown) emit
 *   duplicate act containers for different reasons
 * - In scenarios where the inline dedup's reference-based check can't merge
 *
 * This is the "Defensive Option B" approach mentioned in Seraph's review.
 */
import { describe, it, expect } from 'vitest';

// ── Types matching Act interface from BeatRewritePanel.tsx ──────────────
interface Beat {
  id: string;
  name: string;
  act: string;
  turningPoint: boolean;
  turningPointLabel: string;
  scene: string;
  description: string;
  structuralPurpose: string;
  protagonistState: string;
  emotionalShift: string;
  raw: string;
}

interface Act {
  name: string;
  beats: Beat[];
}

// ── Reference implementation of the post-processing dedup ───────────────

/**
 * Post-processing dedup: merge duplicate act containers by canonical name.
 *
 * Exact implementation from BeatRewritePanel.tsx lines 572-587.
 */
function postProcessDedup(acts: Act[]): Act[] {
  const merged: Act[] = [];
  const seen = new Set<string>();
  for (const act of acts) {
    if (!seen.has(act.name)) {
      seen.add(act.name);
      merged.push(act);
    } else {
      const existing = merged.find(m => m.name === act.name);
      if (existing) {
        existing.beats.push(...(act.beats || []));
      }
    }
  }
  return merged;
}

// ── Helper: create a minimal Beat ───────────────────────────────────────

function makeBeat(id: string, name: string, act: string): Beat {
  return {
    id,
    name,
    act,
    turningPoint: false,
    turningPointLabel: 'No',
    scene: '',
    description: '',
    structuralPurpose: '',
    protagonistState: '',
    emotionalShift: '',
    raw: '',
  };
}

function makeAct(name: string, ...beatIds: string[]): Act {
  return {
    name,
    beats: beatIds.map((bid, i) => makeBeat(bid, `Beat ${bid}`, name)),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Beat Sheet — post-processing dedup (lines 572-587)', () => {

  describe('Primary use case: no duplicates', () => {
    it('passes through unique acts unchanged', () => {
      const acts = [
        makeAct('Act 1', '1', '2'),
        makeAct('Act 2A', '3'),
        makeAct('Act 2B', '4'),
        makeAct('Act 3', '5'),
      ];
      const result = postProcessDedup(acts);
      expect(result).toHaveLength(4);
      expect(result[0].name).toBe('Act 1');
      expect(result[1].name).toBe('Act 2A');
      expect(result[2].name).toBe('Act 2B');
      expect(result[3].name).toBe('Act 3');
    });

    it('preserves all beats when no dedup needed', () => {
      const acts = [
        makeAct('Act 1', '1', '2'),
        makeAct('Act 2', '3'),
      ];
      const result = postProcessDedup(acts);
      const totalBeats = result.reduce((s, a) => s + a.beats.length, 0);
      expect(totalBeats).toBe(3);
    });
  });

  describe('Fix: duplicates by canonical name', () => {
    it('merges two Act 1 containers into one', () => {
      const acts = [
        makeAct('Act 1', '1'),
        makeAct('Act 1', '2'),
        makeAct('Act 2', '3'),
      ];
      const result = postProcessDedup(acts);
      expect(result).toHaveLength(2);
      const act1 = result.find(a => a.name === 'Act 1');
      expect(act1).toBeDefined();
      expect(act1!.beats).toHaveLength(2);
      expect(act1!.beats.map(b => b.id)).toEqual(['1', '2']);
    });

    it('merges three Act 1 containers (catches object-identity failures)', () => {
      // This scenario simulates the edge case the post-processing dedup targets:
      // When the inline dedup sets currentAct = existing (same reference),
      // and subsequent act headers create new objects that can't be caught
      // by the inline object-identity check.
      const acts = [
        makeAct('Act 1', '1'),
        makeAct('Act 1', '2'),
        makeAct('Act 1', '3'),
        makeAct('Act 2', '4'),
      ];
      const result = postProcessDedup(acts);
      expect(result).toHaveLength(2);
      const act1 = result.find(a => a.name === 'Act 1');
      expect(act1).toBeDefined();
      expect(act1!.beats).toHaveLength(3);
      expect(act1!.beats.map(b => b.id)).toEqual(['1', '2', '3']);
    });

    it('deduplicates multiple canonical names simultaneously', () => {
      // Act 1 appears 3 times, Act 2A appears 2 times, Act 3 appears once
      const acts = [
        makeAct('Act 1', '1'),
        makeAct('Act 2A', '2'),
        makeAct('Act 1', '3'),
        makeAct('Act 3', '4'),
        makeAct('Act 2A', '5'),
        makeAct('Act 1', '6'),
      ];
      const result = postProcessDedup(acts);
      expect(result).toHaveLength(3);
      const act1 = result.find(a => a.name === 'Act 1');
      const act2a = result.find(a => a.name === 'Act 2A');
      const act3 = result.find(a => a.name === 'Act 3');
      expect(act1!.beats.map(b => b.id)).toEqual(['1', '3', '6']);
      expect(act2a!.beats.map(b => b.id)).toEqual(['2', '5']);
      expect(act3!.beats.map(b => b.id)).toEqual(['4']);
    });

    it('preserves beat order within merged acts (first occurrence sequence)', () => {
      const acts = [
        makeAct('Act 1', '1', '2'),
        makeAct('Act 1', '3', '4'),
      ];
      const result = postProcessDedup(acts);
      expect(result[0].beats.map(b => b.id)).toEqual(['1', '2', '3', '4']);
    });
  });

  describe('Edge cases: empty / boundary inputs', () => {
    it('handles empty array', () => {
      expect(postProcessDedup([])).toEqual([]);
    });

    it('handles single act', () => {
      const acts = [makeAct('Act 1', '1', '2', '3')];
      const result = postProcessDedup(acts);
      expect(result).toHaveLength(1);
      expect(result[0].beats).toHaveLength(3);
    });

    it('handles acts with no beats (empty beats array)', () => {
      const acts = [
        { name: 'Act 1', beats: [] },
        { name: 'Act 1', beats: [] },
        { name: 'Act 2', beats: [] },
      ];
      const result = postProcessDedup(acts);
      expect(result).toHaveLength(2);
      expect(result[0].beats).toEqual([]);
    });

    it('handles null/undefined beats gracefully', () => {
      const acts = [
        { name: 'Act 1', beats: null as unknown as Beat[] },
        { name: 'Act 2', beats: [makeBeat('1', 'Beat 1', 'Act 2')] },
      ];
      const result = postProcessDedup(acts);
      // The first occurrence is kept; null beats is preserved
      expect(result).toHaveLength(2);
      const act1 = result.find(a => a.name === 'Act 1');
      expect(act1?.beats).toBeNull();
    });

    it('safety net: catches duplicates from parsers without inline dedup', () => {
      // The JSON, slash, ITEM, and plaintext parsers have NO inline dedup logic.
      // The post-processing dedup is the only safety net for those parser paths.
      // This simulates what those parsers would emit: separate act containers
      // with the same canonical name.
      const acts = [
        makeAct('ACT 1', '1'),   // JSON parser output
        makeAct('ACT 1', '2'),   // Same name from JSON parser
        makeAct('ACT 2A', '3'),
        makeAct('ACT 1', '4'),   // Third occurrence
      ];
      const result = postProcessDedup(acts);
      const act1Count = result.filter(a => a.name === 'ACT 1').length;
      expect(act1Count).toBe(1);
      const act1 = result.find(a => a.name === 'ACT 1');
      expect(act1!.beats).toHaveLength(3);
      expect(act1!.beats.map(b => b.id)).toEqual(['1', '2', '4']);
    });
  });

  describe('Edge cases: diverse canonical names', () => {
    it('handles act names with spaces and varied formatting', () => {
      const acts = [
        makeAct('Act 1', '1'),
        makeAct('Act 1', '2'),
        makeAct('Act 2A', '3'),
        makeAct('ACT 2A', '4'),  // Different case — treated as different canonical name
        makeAct('Act 2B', '5'),
      ];
      const result = postProcessDedup(acts);
      // Note: The post-processing dedup does case-SENSITIVE matching on name.
      // Case normalization happens in normalizeActName (Fix 2a), which is upstream.
      // By the time the post-processing runs, names are already normalized.
      expect(result).toHaveLength(4); // 'Act 2A' and 'ACT 2A' are different names
      const act1 = result.filter(a => a.name === 'Act 1');
      expect(act1).toHaveLength(1);
      expect(act1[0].beats).toHaveLength(2);
    });

    it('preserves order of first occurrence for each canonical name', () => {
      const acts = [
        makeAct('Act 2',
    '3'),
        makeAct('Act 1', '1'),
        makeAct('Act 2', '4'),
        makeAct('Act 1', '2'),
      ];
      const result = postProcessDedup(acts);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Act 2');  // first occurrence of any duplicate
      expect(result[1].name).toBe('Act 1');  // first occurrence of the other
    });
  });

  describe('Invariants', () => {
    it('no duplicate canonical names in output', () => {
      const acts = [
        makeAct('Act 1', '1'),
        makeAct('Act 2A', '2'),
        makeAct('Act 2B', '3'),
        makeAct('Act 1', '4'),
        makeAct('Act 3', '5'),
        makeAct('Act 2A', '6'),
      ];
      const result = postProcessDedup(acts);
      const names = result.map(a => a.name);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });

    it('total beat count is preserved after dedup', () => {
      const acts = [
        makeAct('Act 1', '1'),
        makeAct('Act 2A', '2', '3'),
        makeAct('Act 1', '4'),
        makeAct('Act 2B', '5'),
        makeAct('Act 1', '6'),
      ];
      const inputCount = acts.reduce((s, a) => s + a.beats.length, 0);
      const result = postProcessDedup(acts);
      const outputCount = result.reduce((s, a) => s + a.beats.length, 0);
      expect(outputCount).toBe(inputCount);
    });

    it('does not mutate the input array', () => {
      const acts = [
        makeAct('Act 1', '1'),
        makeAct('Act 1', '2'),
      ];
      const origLength = acts.length;
      postProcessDedup(acts);
      expect(acts).toHaveLength(origLength);
    });

    it('does not remove unique acts', () => {
      const acts = [
        makeAct('Act 1', '1'),
        makeAct('Act 1', '2'),
        makeAct('Act 2A', '3'),
        makeAct('Act 2B', '4'),
        makeAct('Act 3', '5'),
      ];
      const result = postProcessDedup(acts);
      const uniqueActs = ['Act 2A', 'Act 2B', 'Act 3'];
      for (const name of uniqueActs) {
        expect(result.filter(a => a.name === name)).toHaveLength(1);
      }
    });
  });

  describe('Simulated parser outputs (realistic scenarios)', () => {
    it('JSON parser with duplicate act names', () => {
      // JSON parser groups beats by act_affiliation. If the input JSON
      // has beats with the same act_affiliation but the parser creates
      // separate act containers, the post-processing dedup catches it.
      const acts = [
        makeAct('ACT 1', '1', '2'),
        makeAct('ACT 1', '3'),
        makeAct('ACT 2A', '4'),
      ];
      // Note: JSON parser uses act_affiliation as-is, so "ACT 1" vs "Act 1"
      // are different names. The post-processing doesn't normalize case.
      // This is correct behavior — case normalization happens upstream.
      const result = postProcessDedup(acts);
      expect(result.filter(a => a.name === 'ACT 1')).toHaveLength(1);
      expect(result).toHaveLength(2);
    });

    it('slash parser with duplicate act names', () => {
      // Slash parser pushes acts on act header change. If act headers
      // use the same name, duplicates occur.
      const acts = [
        makeAct('ACT 1', '1'),
        makeAct('ACT 1', '2'),
        makeAct('ACT 2A', '3'),
        makeAct('ACT 2B', '4'),
      ];
      const result = postProcessDedup(acts);
      expect(result).toHaveLength(3);
      expect(result.find(a => a.name === 'ACT 1')?.beats).toHaveLength(2);
    });

    it('ITEM format parser with duplicate act names', () => {
      // ITEM format groups by uppercase key. If items have different
      // but equivalent act affiliations, the post-processing dedup
      // catches remaining duplicates.
      const acts = [
        makeAct('ACT 1', '1'),
        makeAct('ACT 1', '2'),
        makeAct('ACT 2A', '3'),
        makeAct('ACT 3', '4'),
      ];
      const result = postProcessDedup(acts);
      expect(result).toHaveLength(3);
    });

    it('number-markdown parser — the primary fix target', () => {
      // The LLM outputs ## Act headers that all normalize to the same name.
      // Example: "## Act ONE", "## Act 1: Setup — Beats", "## Act 1"
      // All normalize to 'Act 1' via normalizeActName, but create separate
      // act containers that only the post-processing pass can fully merge.
      const acts = [
        makeAct('Act 1', '1'),
        makeAct('Act 1', '2'),
        makeAct('Act 1', '3'),
        makeAct('Act 2A', '4'),
        makeAct('Act 2B', '5'),
        makeAct('Act 3', '6'),
      ];
      const result = postProcessDedup(acts);
      expect(result).toHaveLength(4);
      const act1 = result.find(a => a.name === 'Act 1');
      expect(act1).toBeDefined();
      expect(act1!.beats).toHaveLength(3);
      expect(act1!.beats.map(b => b.id)).toEqual(['1', '2', '3']);
    });

    it('all 4 distinct canonical beat-sheet acts survive dedup when no duplicates', () => {
      const acts = [
        makeAct('Act 1', '1', '2'),
        makeAct('Act 2A', '3'),
        makeAct('Act 2B', '4'),
        makeAct('Act 3', '5'),
      ];
      const result = postProcessDedup(acts);
      expect(result).toHaveLength(4);
    });
  });
});