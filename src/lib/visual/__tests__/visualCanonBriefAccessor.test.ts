/**
 * visualCanonBriefAccessor.test.ts — Contract tests for canonical visual canon brief retrieval.
 *
 * Proves:
 * - getVisualCanonBriefContent is the only public retrieval path
 * - present/missing/malformed/empty states produce explicit diagnostics
 * - no silent null-based degradation
 */

import { describe, it, expect } from 'vitest';
import {
  getVisualCanonBriefContent,
  VISUAL_CANON_BRIEF_CANON_KEY,
  type VisualCanonBriefAccessResult,
} from '../visualCanonBriefAccessor';

// ── Contract Key ────────────────────────────────────────────────────────────

describe('Visual Canon Brief Accessor — Contract Key', () => {
  it('canonical key is visual_canon_brief_content', () => {
    expect(VISUAL_CANON_BRIEF_CANON_KEY).toBe('visual_canon_brief_content');
  });
});

// ── Present Content ─────────────────────────────────────────────────────────

describe('Visual Canon Brief Accessor — Present', () => {
  it('returns present status with valid content', () => {
    const canon = { [VISUAL_CANON_BRIEF_CANON_KEY]: '# Visual World Overview\n\nContent here.' };
    const result = getVisualCanonBriefContent(canon);
    expect(result.status).toBe('present');
    expect(result.content).toBe('# Visual World Overview\n\nContent here.');
    expect(result.diagnostic).toContain('retrieved');
    expect(result.diagnostic).toContain('chars');
  });

  it('content length is reported in diagnostic', () => {
    const content = 'A'.repeat(500);
    const canon = { [VISUAL_CANON_BRIEF_CANON_KEY]: content };
    const result = getVisualCanonBriefContent(canon);
    expect(result.diagnostic).toContain('500');
  });
});

// ── Missing Content ─────────────────────────────────────────────────────────

describe('Visual Canon Brief Accessor — Missing', () => {
  it('returns missing when canon is null', () => {
    const result = getVisualCanonBriefContent(null);
    expect(result.status).toBe('missing');
    expect(result.content).toBeNull();
    expect(result.diagnostic).toContain('No project canon');
  });

  it('returns missing when canon is undefined', () => {
    const result = getVisualCanonBriefContent(undefined);
    expect(result.status).toBe('missing');
    expect(result.content).toBeNull();
  });

  it('returns missing when key is absent', () => {
    const result = getVisualCanonBriefContent({ some_other_key: 'value' });
    expect(result.status).toBe('missing');
    expect(result.content).toBeNull();
    expect(result.diagnostic).toContain('does not contain');
    expect(result.diagnostic).toContain(VISUAL_CANON_BRIEF_CANON_KEY);
  });

  it('returns missing when key is null', () => {
    const result = getVisualCanonBriefContent({ [VISUAL_CANON_BRIEF_CANON_KEY]: null });
    expect(result.status).toBe('missing');
    expect(result.content).toBeNull();
  });
});

// ── Malformed Content ───────────────────────────────────────────────────────

describe('Visual Canon Brief Accessor — Malformed', () => {
  it('returns malformed when value is a number', () => {
    const result = getVisualCanonBriefContent({ [VISUAL_CANON_BRIEF_CANON_KEY]: 42 } as any);
    expect(result.status).toBe('malformed');
    expect(result.content).toBeNull();
    expect(result.diagnostic).toContain('number');
    expect(result.diagnostic).toContain('expected string');
  });

  it('returns malformed when value is an object', () => {
    const result = getVisualCanonBriefContent({ [VISUAL_CANON_BRIEF_CANON_KEY]: { nested: true } } as any);
    expect(result.status).toBe('malformed');
    expect(result.content).toBeNull();
    expect(result.diagnostic).toContain('object');
  });

  it('returns malformed when value is a boolean', () => {
    const result = getVisualCanonBriefContent({ [VISUAL_CANON_BRIEF_CANON_KEY]: true } as any);
    expect(result.status).toBe('malformed');
    expect(result.content).toBeNull();
  });

  it('returns malformed when value is an array', () => {
    const result = getVisualCanonBriefContent({ [VISUAL_CANON_BRIEF_CANON_KEY]: ['a', 'b'] } as any);
    expect(result.status).toBe('malformed');
    expect(result.content).toBeNull();
  });
});

// ── Empty Content ───────────────────────────────────────────────────────────

describe('Visual Canon Brief Accessor — Empty', () => {
  it('returns empty when value is empty string', () => {
    const result = getVisualCanonBriefContent({ [VISUAL_CANON_BRIEF_CANON_KEY]: '' });
    expect(result.status).toBe('empty');
    expect(result.content).toBeNull();
    expect(result.diagnostic).toContain('empty string');
  });

  it('returns empty when value is whitespace only', () => {
    const result = getVisualCanonBriefContent({ [VISUAL_CANON_BRIEF_CANON_KEY]: '   \n\t  ' });
    expect(result.status).toBe('empty');
    expect(result.content).toBeNull();
  });
});

// ── No Silent Degradation ───────────────────────────────────────────────────

describe('Visual Canon Brief Accessor — No Silent Degradation', () => {
  it('every status has a non-empty diagnostic', () => {
    const cases: Array<Record<string, unknown> | null> = [
      null,
      {},
      { [VISUAL_CANON_BRIEF_CANON_KEY]: null },
      { [VISUAL_CANON_BRIEF_CANON_KEY]: '' },
      { [VISUAL_CANON_BRIEF_CANON_KEY]: 42 } as any,
      { [VISUAL_CANON_BRIEF_CANON_KEY]: 'valid content' },
    ];

    for (const canon of cases) {
      const result = getVisualCanonBriefContent(canon);
      expect(result.diagnostic.length).toBeGreaterThan(0);
      expect(result.status).toBeTruthy();
    }
  });

  it('all non-present results have null content', () => {
    const nonPresent: VisualCanonBriefAccessResult[] = [
      getVisualCanonBriefContent(null),
      getVisualCanonBriefContent({}),
      getVisualCanonBriefContent({ [VISUAL_CANON_BRIEF_CANON_KEY]: '' }),
      getVisualCanonBriefContent({ [VISUAL_CANON_BRIEF_CANON_KEY]: 42 } as any),
    ];

    for (const result of nonPresent) {
      expect(result.status).not.toBe('present');
      expect(result.content).toBeNull();
    }
  });
});
