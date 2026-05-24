/**
 * Tests for: SceneIndexedProgress — render content in card layout with screenplay formatting
 *
 * Commit: 8a5c27e fix: SceneIndexedProgress — render content in card layout with screenplay formatting
 *
 * Changes under test:
 * 1. formatScreenplayContent helper — sluglines bold, character names blue-400,
 *    parentheticals italic, dialogue indented, SCENE markers hidden, action lines normal
 * 2. cleanSceneContent helper — metadata preamble stripping (up to 15 lines)
 * 3. cleanScenePreview helper — plain-text preview for line-clamp-3, truncation at 400 chars
 * 4. formatSceneLabel — scene range "SC01-SC05" → "Scenes 1–5", fallback formatting
 * 5. Card/card content layout with expandable screenplay content
 * 6. Distinct visual states: done (expandable), running (pulse), pending (opacity),
 *    retryable (amber border + retry button), skipped (destructive border)
 * 7. Retry mechanism: marks chunk needs_regen + invokes generate-document
 * 8. Empty/missing content fallback states
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Pure function tests
// These mirror the exact logic in SceneIndexedProgress.tsx but are re-implemented
// here because the source functions are not exported.
// ─────────────────────────────────────────────────────────────────────────────

function formatScreenplayContent(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let afterCharacter = false;

  lines.forEach((line, i) => {
    const trimmed = line.trimEnd();

    // Scene markers → invisible (skip entirely)
    if (/^SCENE\s+\d+/i.test(trimmed)) return;

    // Sluglines (INT., EXT., INT/EXT., I/E.) → bold
    if (/^(INT|EXT|INT\.?\/EXT|I\.?\/E)\b/i.test(trimmed)) {
      result.push(
        <p key={i} className="text-xs font-bold text-foreground">
          {trimmed}
        </p>,
      );
      afterCharacter = false;
      return;
    }

    // Parentheticals → italic, indented
    if (/^\(.+\)$/.test(trimmed)) {
      result.push(
        <p key={i} className="text-xs italic text-muted-foreground/80 pl-4">
          {trimmed}
        </p>,
      );
      afterCharacter = false;
      return;
    }

    // Character names: all-caps standalone line (not a slugline, not a parenthetical)
    if (/^[A-Z][A-Z\s\.'-]{0,50}$/.test(trimmed) && trimmed.length > 1) {
      result.push(
        <p key={i} className="text-xs text-blue-400 font-medium">
          {trimmed}
        </p>,
      );
      afterCharacter = true;
      return;
    }

    // Dialogue (immediately after a character name)
    if (afterCharacter && trimmed.length > 0) {
      result.push(
        <p key={i} className="text-xs text-foreground/80 pl-4">
          {trimmed}
        </p>,
      );
      afterCharacter = false;
      return;
    }

    // Action lines
    if (trimmed) {
      result.push(
        <p key={i} className="text-xs text-foreground/70">
          {trimmed}
        </p>,
      );
    } else {
      result.push(<br key={i} />);
    }
    afterCharacter = false;
  });

  return result;
}

function cleanSceneContent(raw: string): string {
  const lines = raw.split('\n');
  let startIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i].trim();
    if (
      !line ||
      /^#+\s/.test(line) ||
      /^(SCENE\s+\d+|Deliverable|Completion|Completeness|Status|Section|Type)\s*(Type|Status|Check)?:/i.test(line)
    ) {
      startIdx = i + 1;
    } else {
      break;
    }
  }
  return lines.slice(startIdx).join('\n').trim();
}

function cleanScenePreview(raw: string): string {
  const prose = cleanSceneContent(raw);
  const preview = prose.slice(0, 400);
  return preview + (prose.length > 400 ? '…' : '');
}

function formatSceneLabel(chunkKey: string, metaLabel?: string): string {
  if (metaLabel) return metaLabel;
  const match = chunkKey.match(/^SC(\d+)-SC(\d+)$/);
  if (match) {
    const start = parseInt(match[1], 10);
    const end = parseInt(match[2], 10);
    return `Scenes ${start}–${end}`;
  }
  return chunkKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const RETRYABLE_STATUSES = new Set(['failed', 'failed_validation', 'error', 'needs_regen']);

function isRetryable(status: string): boolean {
  return RETRYABLE_STATUSES.has(status);
}

function getStatusIconType(status: string): string {
  if (status === 'done') return 'CheckCircle';
  if (status === 'running') return 'Loader2';
  if (isRetryable(status)) return 'AlertTriangle';
  if (['failed', 'failed_validation', 'error', 'skipped'].includes(status)) return 'XCircle';
  return 'Clock';
}

// ═════════════════════════════════════════════════════════════════════════════
// formatScreenplayContent tests
// ═════════════════════════════════════════════════════════════════════════════

describe('formatScreenplayContent', () => {
  it('formats sluglines (INT./EXT.) as bold text', () => {
    const result = formatScreenplayContent('INT. OFFICE - DAY');
    expect(result).toHaveLength(1);
    const element = result[0] as React.ReactElement;
    expect(element.props.className).toContain('font-bold');
    expect(element.props.className).toContain('text-foreground');
    expect(element.props.children).toBe('INT. OFFICE - DAY');
  });

  it('formats EXT. sluglines correctly', () => {
    const result = formatScreenplayContent('EXT. BEACH - SUNSET');
    const element = result[0] as React.ReactElement;
    expect(element.props.className).toContain('font-bold');
  });

  it('formats INT/EXT. sluglines correctly', () => {
    const result = formatScreenplayContent('INT/EXT. CAR - NIGHT');
    expect(result).toHaveLength(1);
    const element = result[0] as React.ReactElement;
    expect(element.props.className).toContain('font-bold');
  });

  it('formats I/E. sluglines correctly', () => {
    const result = formatScreenplayContent('I/E. TUNNEL - DARK');
    expect(result).toHaveLength(1);
  });

  it('formats parentheticals as italic indented text', () => {
    const result = formatScreenplayContent('(beat)\n(sighs)');
    expect(result).toHaveLength(2);
    result.forEach((node) => {
      const el = node as React.ReactElement;
      expect(el.props.className).toContain('italic');
      expect(el.props.className).toContain('pl-4');
    });
  });

  it('formats character names as blue-400 text', () => {
    const result = formatScreenplayContent('JOHN\nMCKENZIE\nDR. SMITH');
    expect(result).toHaveLength(3);
    result.forEach((node) => {
      const el = node as React.ReactElement;
      expect(el.props.className).toContain('text-blue-400');
    });
  });

  it('formats dialogue lines after character names', () => {
    const input = 'JOHN\nI\'ll be there in five minutes.\nMARY\nOkay, see you then.';
    const result = formatScreenplayContent(input);
    expect(result).toHaveLength(4);
    // John's line (character name)
    expect((result[0] as React.ReactElement).props.className).toContain('text-blue-400');
    // John's dialogue
    expect((result[1] as React.ReactElement).props.className).toContain('pl-4');
    expect((result[1] as React.ReactElement).props.className).toContain('text-foreground/80');
    // Mary's line
    expect((result[2] as React.ReactElement).props.className).toContain('text-blue-400');
    // Mary's dialogue
    expect((result[3] as React.ReactElement).props.className).toContain('pl-4');
  });

  it('formats action lines as normal text', () => {
    const result = formatScreenplayContent('He walks slowly to the window.');
    expect(result).toHaveLength(1);
    const el = result[0] as React.ReactElement;
    expect(el.props.className).toContain('text-foreground/70');
  });

  it('skips SCENE markers entirely', () => {
    const result = formatScreenplayContent('SCENE 1\nINT. HOUSE - DAY\nJohn enters.');
    expect(result).toHaveLength(2); // only slugline + action line
    expect((result[0] as React.ReactElement).props.children).toBe('INT. HOUSE - DAY');
    expect((result[1] as React.ReactElement).props.children).toBe('John enters.');
  });

  it('converts blank lines to <br/> elements', () => {
    const result = formatScreenplayContent('Action line.\n\nMore action.');
    expect(result).toHaveLength(3);
    // Middle should be a br element (string key for br is '' or undefined)
    const middle = result[1] as React.ReactElement;
    expect(middle.type).toBe('br');
  });

  it('handles empty string gracefully', () => {
    const result = formatScreenplayContent('');
    // Empty string splits to [''] → one <br> element
    expect(result).toHaveLength(1);
    const el = result[0] as React.ReactElement;
    expect(el.type).toBe('br');
  });

  it('handles text with only SCENE markers', () => {
    const result = formatScreenplayContent('SCENE 1\nSCENE 2\nSCENE 3');
    expect(result).toHaveLength(0);
  });

  it('handles standalone character name with apostrophe', () => {
    const result = formatScreenplayContent("O'BRIEN\nHello there.");
    expect(result).toHaveLength(2);
    expect((result[0] as React.ReactElement).props.className).toContain('text-blue-400');
  });

  it('handles character name with period', () => {
    const result = formatScreenplayContent('DR. SMITH\nWhat brings you here?');
    expect(result).toHaveLength(2);
    expect((result[0] as React.ReactElement).props.className).toContain('text-blue-400');
  });

  it('resets afterCharacter flag after action line', () => {
    const input = 'JOHN\nHello.\nHe waves.\nMARY\nHi.';
    const result = formatScreenplayContent(input);
    // John (char) + "Hello." (dialogue) + "He waves." (action) + Mary (char) + "Hi." (dialogue)
    expect(result).toHaveLength(5);
    // "He waves." should be action, not dialogue
    expect((result[2] as React.ReactElement).props.className).toContain('text-foreground/70');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// cleanSceneContent tests
// ═════════════════════════════════════════════════════════════════════════════

describe('cleanSceneContent', () => {
  it('strips metadata lines with colon format (Status:, Section:, SCENE N:)', () => {
    const input = 'Status: Complete\nSection: Scene 1\n\nINT. OFFICE - DAY';
    const result = cleanSceneContent(input);
    expect(result).toBe('INT. OFFICE - DAY');
  });

  it('strips metadata lines: Deliverable Type:', () => {
    const input = 'Deliverable Type: Screenplay\nCompletion Status: Draft\nINT. OFFICE - DAY';
    const result = cleanSceneContent(input);
    expect(result).toBe('INT. OFFICE - DAY');
  });

  it('strips metadata lines: Status Check:', () => {
    const input = 'Section: Scene 1\nType: Dialogue\nStatus Check: Pass\nINT. OFFICE - DAY';
    const result = cleanSceneContent(input);
    expect(result).toBe('INT. OFFICE - DAY');
  });

  it('strips SCENE N: with colon (colon-format scene headers)', () => {
    const input = 'SCENE 1: Opening\nStatus: Complete\n\nINT. OFFICE - DAY';
    const result = cleanSceneContent(input);
    expect(result).toBe('INT. OFFICE - DAY');
  });

  it('does NOT strip "SCENE 1" without colon (the regex requires colon)', () => {
    const input = 'SCENE 1\nStatus: Complete\n\nINT. OFFICE - DAY\nJohn sits at his desk.';
    const result = cleanSceneContent(input);
    // "SCENE 1" has no colon → does NOT match the regex → stripping stops immediately
    expect(result).toBe(input.trim());
  });

  it('strips markdown heading lines', () => {
    const input = '# Scene 1\n## Opening\nINT. OFFICE - DAY';
    const result = cleanSceneContent(input);
    expect(result).toBe('INT. OFFICE - DAY');
  });

  it('strips empty lines before content', () => {
    const input = '\n\n\n\nINT. OFFICE - DAY';
    const result = cleanSceneContent(input);
    expect(result).toBe('INT. OFFICE - DAY');
  });

  it('strips up to 15 metadata lines', () => {
    // Use colon-format scene headers which DO match the regex
    // 15 lines of metadata + 1 content line = 16 lines total
    // Loop checks min(lines.length, 15) = 15 lines, strips all 15 metadata lines
    const input = Array(15).fill('SCENE 1: Opening').join('\n') + '\nINT. OFFICE - DAY';
    const result = cleanSceneContent(input);
    // After stripping 15 metadata lines (indices 0-14), slice(15) gives "INT. OFFICE - DAY"
    expect(result.startsWith('INT. OFFICE - DAY')).toBe(true);
  });

  it('returns full content when no metadata is present', () => {
    const input = 'INT. OFFICE - DAY\nJohn enters.\nHe looks around.';
    const result = cleanSceneContent(input);
    expect(result).toBe(input.trim());
  });

  it('returns empty string for empty input', () => {
    expect(cleanSceneContent('')).toBe('');
  });

  it('stops stripping at first non-metadata line', () => {
    // "SCENE 1" has no colon → is not metadata → stops immediately
    const input = 'SCENE 1: Opening\nStatus: Complete\nINT. OFFICE - DAY\nSCENE 2\nEXT. PARK - DAY';
    const result = cleanSceneContent(input);
    // After stripping "SCENE 1: Opening" (colon-present → matches) and "Status: Complete" (matches),
    // next line is "INT. OFFICE - DAY" which doesn't match → stop
    expect(result).toBe('INT. OFFICE - DAY\nSCENE 2\nEXT. PARK - DAY');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// cleanScenePreview tests
// ═════════════════════════════════════════════════════════════════════════════

describe('cleanScenePreview', () => {
  it('returns cleaned content up to 400 chars', () => {
    const input = 'Status: Complete\n' + 'A'.repeat(300);
    const result = cleanScenePreview(input);
    expect(result.length).toBeLessThanOrEqual(400);
    expect(result).not.toContain('Status:');
    expect(result).toMatch(/^A+/);
    expect(result).not.toContain('…'); // No ellipsis since 300 < 400
  });

  it('adds ellipsis when content exceeds 400 chars', () => {
    const input = 'Status: Complete\nINT. OFFICE - DAY\n' + 'A'.repeat(500);
    const result = cleanScenePreview(input);
    expect(result).toContain('…');
    expect(result.length).toBe(401); // 400 + ellipsis
  });

  it('handles empty input', () => {
    expect(cleanScenePreview('')).toBe('');
  });

  it('handles input with only colon-format metadata', () => {
    const result = cleanScenePreview('Status: Complete\nSection: Scene 1\n');
    expect(result).toBe('');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// formatSceneLabel tests
// ═════════════════════════════════════════════════════════════════════════════

describe('formatSceneLabel', () => {
  it('returns metaLabel when provided', () => {
    expect(formatSceneLabel('SC01-SC05', 'Opening Sequence')).toBe('Opening Sequence');
  });

  it('formats SC01-SC05 as "Scenes 1–5"', () => {
    expect(formatSceneLabel('SC01-SC05')).toBe('Scenes 1–5');
  });

  it('formats SC10-SC20 as "Scenes 10–20"', () => {
    expect(formatSceneLabel('SC10-SC20')).toBe('Scenes 10–20');
  });

  it('formats act-based keys as capitalized words', () => {
    expect(formatSceneLabel('act_1')).toBe('Act 1');
  });

  it('formats underscore-separated keys', () => {
    expect(formatSceneLabel('opening_scene')).toBe('Opening Scene');
  });

  it('handles non-standard chunk keys', () => {
    expect(formatSceneLabel('batch_01')).toBe('Batch 01');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// isRetryable tests
// ═════════════════════════════════════════════════════════════════════════════

describe('isRetryable', () => {
  it('returns true for "failed"', () => expect(isRetryable('failed')).toBe(true));
  it('returns true for "failed_validation"', () => expect(isRetryable('failed_validation')).toBe(true));
  it('returns true for "error"', () => expect(isRetryable('error')).toBe(true));
  it('returns true for "needs_regen"', () => expect(isRetryable('needs_regen')).toBe(true));
  it('returns false for "done"', () => expect(isRetryable('done')).toBe(false));
  it('returns false for "running"', () => expect(isRetryable('running')).toBe(false));
  it('returns false for "pending"', () => expect(isRetryable('pending')).toBe(false));
  it('returns false for "skipped"', () => expect(isRetryable('skipped')).toBe(false));
  it('returns false for unknown status', () => expect(isRetryable('unknown')).toBe(false));
  it('returns false for empty string', () => expect(isRetryable('')).toBe(false));
});

// ═════════════════════════════════════════════════════════════════════════════
// getStatusIconType tests
// ═════════════════════════════════════════════════════════════════════════════

describe('getStatusIconType', () => {
  it('returns "CheckCircle" for "done"', () => expect(getStatusIconType('done')).toBe('CheckCircle'));
  it('returns "Loader2" for "running"', () => expect(getStatusIconType('running')).toBe('Loader2'));
  it('returns "AlertTriangle" for "failed"', () => expect(getStatusIconType('failed')).toBe('AlertTriangle'));
  it('returns "AlertTriangle" for "failed_validation"', () => expect(getStatusIconType('failed_validation')).toBe('AlertTriangle'));
  it('returns "AlertTriangle" for "error"', () => expect(getStatusIconType('error')).toBe('AlertTriangle'));
  it('returns "AlertTriangle" for "needs_regen"', () => expect(getStatusIconType('needs_regen')).toBe('AlertTriangle'));
  it('returns "XCircle" for "skipped"', () => expect(getStatusIconType('skipped')).toBe('XCircle'));
  it('returns "Clock" for "pending"', () => expect(getStatusIconType('pending')).toBe('Clock'));
  it('returns "Clock" for unknown status', () => expect(getStatusIconType('unknown')).toBe('Clock'));
});

// ═════════════════════════════════════════════════════════════════════════════
// Component-level integration tests
// ═════════════════════════════════════════════════════════════════════════════

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mock supabase ───────────────────────────────────────────────────────────────

const mockSupabaseSelect = vi.fn();
const mockSupabaseUpdate = vi.fn();
const mockSupabaseInvoke = vi.fn();
const mockToast = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: (...args: any[]) => ({
        eq: (...eqArgs: any[]) => ({
          order: (...orderArgs: any[]) => 
            Promise.resolve(mockSupabaseSelect(...args, ...eqArgs, ...orderArgs)),
        }),
      }),
      update: (...args: any[]) => ({
        eq: (...eqArgs: any[]) => 
          Promise.resolve(mockSupabaseUpdate(...args, ...eqArgs)),
      }),
    }),
    functions: {
      invoke: (...args: any[]) => mockSupabaseInvoke(...args),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: any[]) => mockToast('success', ...args),
    error: (...args: any[]) => mockToast('error', ...args),
  },
}));

// ── Helper ─────────────────────────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function makeChunk(overrides: Partial<{
  id: string;
  chunk_index: number;
  chunk_key: string;
  status: string;
  content: string | null;
  char_count: number | null;
  meta_json: Record<string, any> | null;
}> = {}) {
  return {
    id: overrides.id ?? 'chunk-1',
    chunk_index: overrides.chunk_index ?? 0,
    chunk_key: overrides.chunk_key ?? 'SC01-SC05',
    status: overrides.status ?? 'done',
    content: overrides.content ?? 'INT. OFFICE - DAY\nJohn enters.\nHe sits down.',
    char_count: overrides.char_count ?? 42,
    meta_json: overrides.meta_json ?? { label: 'Opening Scene' },
  };
}

function mockSelectResult(data: any[], error: any = null) {
  mockSupabaseSelect.mockResolvedValue({
    data,
    error,
  });
}

// ── Component import ───────────────────────────────────────────────────────────

// Dynamically import the component to avoid hoisting issues
let SceneIndexedProgress: any;

beforeEach(async () => {
  vi.clearAllMocks();
  // Reset module registry and re-import
  vi.resetModules();
  const mod = await import('@/components/devengine/SceneIndexedProgress');
  SceneIndexedProgress = mod.SceneIndexedProgress;
});

describe('SceneIndexedProgress component', () => {
  it('shows loading state when data is loading', () => {
    // Don't resolve the query immediately
    mockSupabaseSelect.mockReturnValue(new Promise(() => {})); // never resolves
    render(
      React.createElement(createWrapper(), {}, 
        React.createElement(SceneIndexedProgress, { versionId: 'v1' })
      ),
    );
    expect(screen.getByText('Loading scene status…')).toBeTruthy();
  });

  it('shows starting state when no chunks exist', async () => {
    mockSelectResult([]);
    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1' })
      ),
    );
    await waitFor(() => {
      expect(screen.getByText('Starting scene generation…')).toBeTruthy();
    });
  });

  it('renders scene batch cards for done chunks', async () => {
    const chunks = [
      makeChunk({ id: 'c1', chunk_key: 'SC01-SC05', status: 'done', content: 'INT. OFFICE - DAY\nHello.', char_count: 20, meta_json: { label: 'Opening Scene' } }),
      makeChunk({ id: 'c2', chunk_key: 'SC06-SC10', status: 'done', content: 'EXT. PARK - DAY\nNice weather.', char_count: 25, meta_json: { label: 'Climax' } }),
    ];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1' })
      ),
    );

    await waitFor(() => {
      expect(screen.getByText('Opening Scene')).toBeTruthy();
      expect(screen.getByText('Climax')).toBeTruthy();
    });
  });

  it('shows Complete badge when all chunks are done', async () => {
    const chunks = [
      makeChunk({ id: 'c1', chunk_key: 'SC01-SC05', status: 'done' }),
    ];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1' })
      ),
    );

    await waitFor(() => {
      expect(screen.getByText('Complete')).toBeTruthy();
    });
  });

  it('shows Live badge when chunks are still running', async () => {
    const chunks = [
      makeChunk({ id: 'c1', status: 'done' }),
      makeChunk({ id: 'c2', chunk_key: 'SC06-SC10', status: 'running', content: null, char_count: null, meta_json: null }),
    ];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1' })
      ),
    );

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeTruthy();
    });
  });

  it('shows Pending status for pending chunks', async () => {
    const chunks = [
      makeChunk({ id: 'c1', status: 'done' }),
      makeChunk({ id: 'c2', chunk_key: 'SC06-SC10', status: 'pending', content: null, char_count: null, meta_json: null }),
    ];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1' })
      ),
    );

    await waitFor(() => {
      const pendings = screen.getAllByText('Pending');
      expect(pendings.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows Generating… for running chunks', async () => {
    const chunks = [
      makeChunk({ id: 'c1', chunk_key: 'SC01-SC05', status: 'running', content: null, char_count: null, meta_json: null }),
    ];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1' })
      ),
    );

    await waitFor(() => {
      expect(screen.getByText(/Generating/i)).toBeTruthy();
    });
  });

  it('shows Skipped label for skipped chunks', async () => {
    const chunks = [
      makeChunk({ id: 'c1', chunk_key: 'SC01-SC05', status: 'skipped', content: null, char_count: null, meta_json: null }),
    ];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1' })
      ),
    );

    await waitFor(() => {
      expect(screen.getByText('Skipped')).toBeTruthy();
    });
  });

  it('shows retry button for retryable failed chunks', async () => {
    const chunks = [
      makeChunk({ id: 'c1', chunk_key: 'SC01-SC05', status: 'failed', content: null, char_count: null, meta_json: { label: 'Opening Scene' } }),
    ];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1', projectId: 'p1', documentId: 'd1' })
      ),
    );

    await waitFor(() => {
      expect(screen.getByText('Retry batch')).toBeTruthy();
    });
  });

  it('shows "may recover automatically" for retryable failure when still active', async () => {
    const chunks = [
      makeChunk({ id: 'c1', chunk_key: 'SC01-SC05', status: 'failed' }),
      makeChunk({ id: 'c2', chunk_key: 'SC06-SC10', status: 'running', content: null, char_count: null, meta_json: null }),
    ];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1', projectId: 'p1', documentId: 'd1' })
      ),
    );

    await waitFor(() => {
      expect(screen.getByText(/may recover automatically/i)).toBeTruthy();
    });
  });

  it('hides retry button when projectId/documentId are missing', async () => {
    const chunks = [
      makeChunk({ id: 'c1', chunk_key: 'SC01-SC05', status: 'failed', content: null, char_count: null, meta_json: null }),
    ];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1' })
      ),
    );

    await waitFor(() => {
      // The retry message should be visible
      expect(screen.getByText(/Batch failed/i)).toBeTruthy();
      // But the retry button should not exist
      expect(screen.queryByText('Retry batch')).toBeNull();
    });
  });

  it('shows plain-text preview when done chunk has content (collapsed)', async () => {
    const chunks = [
      { id: 'c1', chunk_index: 0, chunk_key: 'SC01-SC05', status: 'done', content: 'INT. OFFICE - DAY\nJohn enters.\nHe sits down.', char_count: 42, meta_json: { label: 'Opening Scene' } },
    ];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1' })
      ),
    );

    // The preview text should appear (collapsed by default)
    await waitFor(() => {
      expect(screen.getByText(/INT\. OFFICE - DAY/)).toBeTruthy();
    });
  });

  it('shows char_count for done chunks', async () => {
    const chunks = [
      makeChunk({ id: 'c1', status: 'done', char_count: 1234 }),
    ];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1' })
      ),
    );

    await waitFor(() => {
      expect(screen.getByText('1,234 chars')).toBeTruthy();
    });
  });

  it('shows Partially complete badge when some chunks failed but some succeeded', async () => {
    const chunks = [
      makeChunk({ id: 'c1', status: 'done' }),
      makeChunk({ id: 'c2', chunk_key: 'SC06-SC10', status: 'failed', content: null, char_count: null, meta_json: null }),
    ];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1' })
      ),
    );

    await waitFor(() => {
      expect(screen.getByText('Partially complete')).toBeTruthy();
    });
  });

  it('shows correct progress percentage', async () => {
    const chunks = [
      makeChunk({ id: 'c1', status: 'done' }),
      makeChunk({ id: 'c2', chunk_key: 'SC06-SC10', status: 'done' }),
      makeChunk({ id: 'c3', chunk_key: 'SC11-SC15', status: 'running', content: null, char_count: null, meta_json: null }),
      makeChunk({ id: 'c4', chunk_key: 'SC16-SC20', status: 'pending', content: null, char_count: null, meta_json: null }),
    ];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1' })
      ),
    );

    await waitFor(() => {
      expect(screen.getByText('2 / 4 scene batches')).toBeTruthy();
    });
  });

  it('renders without versionId gracefully', async () => {
    // When versionId is falsy, the query is disabled, so no mock needed
    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: '' })
      ),
    );

    await waitFor(() => {
      expect(screen.getByText('Starting scene generation…')).toBeTruthy();
    });
  });

  it('shows fallback text when done chunk has null content', async () => {
    const chunks = [
      { id: 'c1', chunk_index: 0, chunk_key: 'SC01-SC05', status: 'done', content: null, char_count: null, meta_json: { label: 'Opening Scene' } },
    ];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1' })
      ),
    );

    await waitFor(() => {
      // The char_count is null, so no "N chars" shown
      // Content is null, so no preview text
      // At least one "Complete" element should exist (badge or fallback text)
      const completeElements = screen.getAllByText(/Complete/);
      expect(completeElements.length).toBeGreaterThanOrEqual(1);
    }, { timeout: 3000 });
  });

  it('shows correct docType label for feature_script', async () => {
    const chunks = [makeChunk({ id: 'c1', status: 'done' })];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1', docType: 'feature_script' })
      ),
    );

    await waitFor(() => {
      expect(screen.getByText(/Generating Feature Script/)).toBeTruthy();
    });
  });

  it('shows correct docType label for production_draft', async () => {
    const chunks = [makeChunk({ id: 'c1', status: 'done' })];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1', docType: 'production_draft' })
      ),
    );

    await waitFor(() => {
      expect(screen.getByText(/Generating Production Draft/)).toBeTruthy();
    });
  });

  it('shows needs_regen status message correctly', async () => {
    const chunks = [
      makeChunk({ id: 'c1', chunk_key: 'SC01-SC05', status: 'needs_regen', content: null, char_count: null, meta_json: null }),
    ];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1', projectId: 'p1', documentId: 'd1' })
      ),
    );

    await waitFor(() => {
      expect(screen.getByText(/Queued for regeneration/)).toBeTruthy();
    });
  });

  it('shows failed_validation message correctly', async () => {
    const chunks = [
      makeChunk({ id: 'c1', chunk_key: 'SC01-SC05', status: 'failed_validation', content: null, char_count: null, meta_json: null }),
    ];
    mockSelectResult(chunks);

    render(
      React.createElement(createWrapper(), {},
        React.createElement(SceneIndexedProgress, { versionId: 'v1', projectId: 'p1', documentId: 'd1' })
      ),
    );

    await waitFor(() => {
      expect(screen.getByText(/Validation issue/)).toBeTruthy();
    });
  });
});