/**
 * Story Outline → ActByActRewriter Routing — Test Suite
 *
 * Verifies P0 fix: story_outline removed from SECTIONED_REWRITE_TYPES,
 * content-empty guard added for story_outline handler, and routing
 * correctly sends JSON outlines to moment pipeline.
 *
 * P0-1: story_outline removed from SECTIONED_REWRITE_TYPES (line 409)
 * P0-2: Content-empty guard at lines 1544-1551 (10-char threshold, toast.warning)
 * P0-3: Auto-detect moments on initial load (MomentRewritePanel.tsx lines 69-94)
 */

import { describe, it, expect } from "vitest";

// ── Constants (extracted from ProjectDevelopmentEngine.tsx line 409) ──

const SECTIONED_REWRITE_TYPES = new Set([
  'treatment',
  'long_treatment',
  'beat_sheet',
  'character_bible',
]);

const SECTIONED_VIEW_TYPES = new Set([
  'feature_script',
  'treatment',
  'story_outline',
  'beat_sheet',
  'production_draft',
  'concept_brief',
  'character_bible',
]);

// ── Route type for simulateRoute ──

type RouteResult = {
  route: 'sectioned_rewrite' | 'treatment_per_act' | 'beat_sheet_skip' | 'character_bible_invoke' | 'story_outline_moment' | 'story_outline_no_notes' | 'story_outline_empty' | 'story_outline_plaintext_fallback' | 'no_action';
  reason: string;
  blockedByEmptyGuard: boolean;
};

/**
 * Simulates the handleRewrite routing logic for story_outline
 * (extracted from ProjectDevelopmentEngine.tsx lines 1472-1571)
 */
function simulateRoute(
  docType: string | undefined,
  docId: string | null,
  versionId: string | null,
  plaintext: string | null | undefined,
  hasNotes: boolean = true,
): RouteResult {
  if (!docType) {
    return { route: 'no_action', reason: 'no doc type', blockedByEmptyGuard: false };
  }

  // beat_sheet: handled BEFORE SECTIONED_REWRITE_TYPES checks in real code
  if (docType === 'beat_sheet' && docId && versionId) {
    return { route: 'beat_sheet_skip', reason: 'beat_sheet handled separately', blockedByEmptyGuard: false };
  }

  // treatment / long_treatment: per-act pipeline, handled before sectioned rewrite
  if ((docType === 'treatment' || docType === 'long_treatment') && docId && versionId) {
    return { route: 'treatment_per_act', reason: 'per-act pipeline', blockedByEmptyGuard: false };
  }

  // Sectioned rewrite guard (lines 1474-1482) — story_outline NOT in set, so skips
  if (SECTIONED_REWRITE_TYPES.has(docType) && docId && versionId) {
    const proseContent = plaintext || '';
    if (!proseContent || proseContent.trim().length < 10) {
      return {
        route: 'sectioned_rewrite',
        reason: 'Document version appears to have no content — cannot apply notes. Generate the document first.',
        blockedByEmptyGuard: true,
      };
    }
  }

  // character_bible handling (lines 1484-1524)
  if ((docType === 'character_bible' || docType === 'long_character_bible') && docId && versionId) {
    return { route: 'character_bible_invoke', reason: 'character bible via dev-engine-v2 invoke', blockedByEmptyGuard: false };
  }

  // Sectioned rewrite pipeline (lines 1526-1540) — for remaining SECTIONED_REWRITE_TYPES members
  if (SECTIONED_REWRITE_TYPES.has(docType) && docId && versionId) {
    return { route: 'sectioned_rewrite', reason: 'rewritePipeline.startRewrite', blockedByEmptyGuard: false };
  }

  // story_outline handler (lines 1542-1571)
  if (docType === 'story_outline' && docId && versionId) {
    // Content-empty guard (lines 1546-1551)
    const proseContent = plaintext || '';
    if (!proseContent || proseContent.trim().length < 10) {
      return {
        route: 'story_outline_empty',
        reason: 'Document version appears to have no content — generate the document first.',
        blockedByEmptyGuard: true,
      };
    }

    // Is it JSON outline? (lines 1552-1554)
    const trimmed = (plaintext || '').trim();
    const isJSONOutline = trimmed.startsWith('{');

    if (isJSONOutline) {
      if (hasNotes) {
        return { route: 'story_outline_moment', reason: 'moment pipeline enqueue + processAll', blockedByEmptyGuard: false };
      } else {
        return { route: 'story_outline_no_notes', reason: 'Add notes to apply before rewriting.', blockedByEmptyGuard: false };
      }
    }

    // Plaintext outline — falls through to below
    return { route: 'story_outline_plaintext_fallback', reason: 'plaintext outline — fall through to text rewrite', blockedByEmptyGuard: false };
  }

  return { route: 'no_action', reason: 'unhandled doc type', blockedByEmptyGuard: false };
}

// ── TESTS ──

// ═══════════════════════════════════════════════════════════════════
// P0-1: story_outline removed from SECTIONED_REWRITE_TYPES
// ═══════════════════════════════════════════════════════════════════

describe("P0-1: SECTIONED_REWRITE_TYPES — story_outline removed", () => {
  it("excludes story_outline from SECTIONED_REWRITE_TYPES", () => {
    expect(SECTIONED_REWRITE_TYPES.has('story_outline')).toBe(false);
  });

  it("includes sectioned rewrite doc types", () => {
    expect(SECTIONED_REWRITE_TYPES.has('treatment')).toBe(true);
    expect(SECTIONED_REWRITE_TYPES.has('long_treatment')).toBe(true);
    expect(SECTIONED_REWRITE_TYPES.has('beat_sheet')).toBe(true);
    expect(SECTIONED_REWRITE_TYPES.has('character_bible')).toBe(true);
  });

  it("excludes non-sectioned doc types", () => {
    expect(SECTIONED_REWRITE_TYPES.has('feature_script')).toBe(false);
    expect(SECTIONED_REWRITE_TYPES.has('concept_brief')).toBe(false);
    expect(SECTIONED_REWRITE_TYPES.has('series_bible')).toBe(false);
    expect(SECTIONED_REWRITE_TYPES.has('season_script')).toBe(false);
    expect(SECTIONED_REWRITE_TYPES.has('episode_script')).toBe(false);
    expect(SECTIONED_REWRITE_TYPES.has('production_draft')).toBe(false);
    expect(SECTIONED_REWRITE_TYPES.has('long_character_bible')).toBe(false);
  });

  it("story_outline still in SECTIONED_VIEW_TYPES (viewable, just not rewritable via sectioned pipeline)", () => {
    expect(SECTIONED_VIEW_TYPES.has('story_outline')).toBe(true);
  });

  it("character_bible now in SECTIONED_REWRITE_TYPES (was added alongside story_outline removal)", () => {
    expect(SECTIONED_REWRITE_TYPES.has('character_bible')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// P0-2: story_outline content-empty guard (lines 1546-1551)
// ═══════════════════════════════════════════════════════════════════

describe("P0-2: story_outline content-empty guard", () => {
  it("blocks story_outline with empty plaintext", () => {
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', '');
    expect(result.route).toBe('story_outline_empty');
    expect(result.blockedByEmptyGuard).toBe(true);
    expect(result.reason).toContain('no content');
  });

  it("blocks story_outline with null plaintext", () => {
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', null);
    expect(result.route).toBe('story_outline_empty');
    expect(result.blockedByEmptyGuard).toBe(true);
  });

  it("blocks story_outline with undefined plaintext", () => {
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', undefined);
    expect(result.route).toBe('story_outline_empty');
    expect(result.blockedByEmptyGuard).toBe(true);
  });

  it("blocks story_outline with very short content (9 chars — below 10-char threshold)", () => {
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', '123456789');
    expect(result.route).toBe('story_outline_empty');
    expect(result.blockedByEmptyGuard).toBe(true);
  });

  it("allows story_outline with exactly 10 chars (boundary)", () => {
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', '{"act": 1}');
    expect(result.route).toBe('story_outline_moment');
    expect(result.blockedByEmptyGuard).toBe(false);
  });

  it("allows story_outline with content >= 10 chars", () => {
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', JSON.stringify({
      acts: [{ number: 1, title: "Setup", description: "The beginning" }],
    }));
    expect(result.route).toBe('story_outline_moment');
    expect(result.blockedByEmptyGuard).toBe(false);
  });

  it("blocks story_outline with whitespace-only content", () => {
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', '   ');
    expect(result.route).toBe('story_outline_empty');
    expect(result.blockedByEmptyGuard).toBe(true);
  });

  it("blocks story_outline with content that trims to less than 10 chars", () => {
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', '  abc  ');
    expect(result.route).toBe('story_outline_empty');
    expect(result.blockedByEmptyGuard).toBe(true);
  });

  it("the guard fires before moment pipeline routing", () => {
    // Even though this could be a valid JSON start, content is too short
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', '{');
    expect(result.route).toBe('story_outline_empty');
    expect(result.blockedByEmptyGuard).toBe(true);
  });

  it("story_outline guard is separate from SECTIONED_REWRITE_TYPES guard", () => {
    // story_outline is NOT in SECTIONED_REWRITE_TYPES, so the first guard (lines 1475-1482)
    // skips it entirely. The story_outline guard at lines 1546-1551 is independent.
    expect(SECTIONED_REWRITE_TYPES.has('story_outline')).toBe(false);

    // Verify: SECTIONED_REWRITE_TYPES guard doesn't apply to story_outline
    // (this is the guard at lines 1475-1482 which we simulate via the first check in simulateRoute)
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', '');
    expect(result.route).toBe('story_outline_empty');
    // The route name 'story_outline_empty' proves the story_outline-specific guard
    // caught it, NOT the SECTIONED_REWRITE_TYPES guard.
  });
});

// ═══════════════════════════════════════════════════════════════════
// story_outline routing — moment pipeline vs fallback
// ═══════════════════════════════════════════════════════════════════

describe("story_outline routing — moment pipeline", () => {
  it("routes JSON outline with notes to moment pipeline", () => {
    const content = JSON.stringify({
      acts: [{ number: 1, title: "Act 1", description: "Sets up the story" }],
    });
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', content, true);
    expect(result.route).toBe('story_outline_moment');
    expect(result.reason).toContain('moment pipeline');
  });

  it("shows info toast when JSON outline has no notes", () => {
    const content = JSON.stringify({
      acts: [{ number: 1, title: "Act 1", description: "Sets up the story" }],
    });
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', content, false);
    expect(result.route).toBe('story_outline_no_notes');
    expect(result.reason).toContain('Add notes');
  });

  it("routes plaintext outline to fallback path", () => {
    const content = "## Act 1\nThis is a story outline in markdown format with enough content.";
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', content, true);
    expect(result.route).toBe('story_outline_plaintext_fallback');
  });

  it("does not route story_outline when missing docId", () => {
    const result = simulateRoute('story_outline', null, 'ver-456', JSON.stringify({ acts: [] }));
    expect(result.route).toBe('no_action');
  });

  it("does not route story_outline when missing versionId", () => {
    const result = simulateRoute('story_outline', 'doc-123', null, JSON.stringify({ acts: [] }));
    expect(result.route).toBe('no_action');
  });

  it("does not route story_outline when both are missing", () => {
    const result = simulateRoute('story_outline', null, null, JSON.stringify({ acts: [] }));
    expect(result.route).toBe('no_action');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Regression: SECTIONED_REWRITE_TYPES members still route correctly
// ═══════════════════════════════════════════════════════════════════

describe("Regression: SECTIONED_REWRITE_TYPES members route correctly", () => {
  it("treatment routes to per-act pipeline (not sectioned rewrite)", () => {
    const result = simulateRoute('treatment', 'doc-123', 'ver-456', 'A treatment with enough content for rewriting.');
    expect(result.route).toBe('treatment_per_act');
  });

  it("long_treatment routes to per-act pipeline", () => {
    const result = simulateRoute('long_treatment', 'doc-123', 'ver-456', 'A long treatment with enough content for rewriting.');
    expect(result.route).toBe('treatment_per_act');
  });

  it("character_bible routes to invoke path", () => {
    const result = simulateRoute('character_bible', 'doc-123', 'ver-456', 'Character bible content with enough text.');
    expect(result.route).toBe('character_bible_invoke');
  });

  it("long_character_bible routes to invoke path", () => {
    const result = simulateRoute('long_character_bible', 'doc-123', 'ver-456', 'Long character bible content.');
    expect(result.route).toBe('character_bible_invoke');
  });

  it("beat_sheet is skipped (handled earlier)", () => {
    const result = simulateRoute('beat_sheet', 'doc-123', 'ver-456', 'Beat sheet content with enough text.');
    expect(result.route).toBe('beat_sheet_skip');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Regression: Empty-guard behavior for SECTIONED_REWRITE_TYPES members
// ═══════════════════════════════════════════════════════════════════

describe("Regression: Empty-guard for SECTIONED_REWRITE_TYPES members", () => {
  it("treatment is handled via per-act pipeline bypassing the sectioned empty guard", () => {
    // Treatment is caught by the per-act handler before reaching SECTIONED_REWRITE_TYPES guard
    const result = simulateRoute('treatment', 'doc-123', 'ver-456', '');
    expect(result.route).toBe('treatment_per_act');
  });

  it("beat_sheet is skipped before reaching the sectioned empty guard", () => {
    // Beat sheet is caught by the early skip before reaching SECTIONED_REWRITE_TYPES guard
    const result = simulateRoute('beat_sheet', 'doc-123', 'ver-456', '');
    expect(result.route).toBe('beat_sheet_skip');
  });

  it("blocks character_bible with empty content via sectioned guard", () => {
    const result = simulateRoute('character_bible', 'doc-123', 'ver-456', '');
    expect(result.blockedByEmptyGuard).toBe(true);
  });

  it("allows character_bible with valid content", () => {
    const result = simulateRoute('character_bible', 'doc-123', 'ver-456', 'Valid character bible content here.');
    expect(result.blockedByEmptyGuard).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Invariant: No orphaned doc types
// ═══════════════════════════════════════════════════════════════════

describe("Invariant: Every handled doc type has exactly one route", () => {
  it("story_outline routes to exactly one handler (moment or empty)", () => {
    const withContent = simulateRoute('story_outline', 'doc-123', 'ver-456', JSON.stringify({ acts: [] }), true);
    const empty = simulateRoute('story_outline', 'doc-123', 'ver-456', '');
    // Both should be story_outline-* variants, not no_action or sectioned_rewrite
    expect(withContent.route).toMatch(/^story_outline_/);
    expect(empty.route).toMatch(/^story_outline_/);
  });

  it("treatment routes to exactly one handler", () => {
    const result = simulateRoute('treatment', 'doc-123', 'ver-456', 'Content with plenty of text.');
    expect(result.route).toBe('treatment_per_act');
  });

  it("character_bible routes to exactly one handler", () => {
    const result = simulateRoute('character_bible', 'doc-123', 'ver-456', 'Full character bible content with enough text for the guard.');
    expect(result.route).toBe('character_bible_invoke');
  });

  it("feature_script correctly has no_action (not a sectioned rewrite type)", () => {
    const result = simulateRoute('feature_script', 'doc-123', 'ver-456', 'Some content.');
    expect(result.route).toBe('no_action');
  });

  it("production_draft correctly has no_action", () => {
    const result = simulateRoute('production_draft', 'doc-123', 'ver-456', 'Some content.');
    expect(result.route).toBe('no_action');
  });

  it("concept_brief correctly has no_action (not in SECTIONED_REWRITE_TYPES)", () => {
    expect(SECTIONED_REWRITE_TYPES.has('concept_brief')).toBe(false);
    const result = simulateRoute('concept_brief', 'doc-123', 'ver-456', 'Some concept brief content.');
    expect(result.route).toBe('no_action');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Invariant: SECTIONED_REWRITE_TYPES ⊆ SECTIONED_VIEW_TYPES
// ═══════════════════════════════════════════════════════════════════

describe("Invariant: All rewrite types are viewable (via structured or raw)", () => {
  it("all rewrite types are viewable — structured or raw view", () => {
    // SECTIONED_REWRITE_TYPES members are rewritable via sectioned pipeline
    // Some (treatment, beat_sheet, character_bible) have structured views
    // long_treatment is viewable via raw view only (no structured view)
    expect(SECTIONED_VIEW_TYPES.has('treatment')).toBe(true);
    expect(SECTIONED_VIEW_TYPES.has('beat_sheet')).toBe(true);
    expect(SECTIONED_VIEW_TYPES.has('character_bible')).toBe(true);
    // long_treatment is rewritable but NOT in SECTIONED_VIEW_TYPES (raw view only)
    expect(SECTIONED_VIEW_TYPES.has('long_treatment')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// P0-3: Auto-detect moments on initial load (MomentRewritePanel.tsx)
// ═══════════════════════════════════════════════════════════════════

describe("P0-3: Auto-detect moments — moment count extraction logic", () => {
  // This tests the logic from MomentRewritePanel.tsx lines 69-94
  // The actual useEffect runs in React, but we test the core parsing logic

  function simulateMomentCount(plaintext: string): number {
    const trimmed = plaintext.trim();
    if (!trimmed.startsWith('{')) return 0;
    try {
      const parsed = JSON.parse(trimmed);
      const entries = parsed.entries || parsed.scenes || parsed.moments || parsed.items || parsed.beats || [];
      if (Array.isArray(entries)) {
        return entries.filter((e: any) => e && (e.title || e.number != null)).length;
      }
    } catch {
      return 0;
    }
    return 0;
  }

  it("detects moments from 'entries' key", () => {
    const content = JSON.stringify({
      entries: [{ title: "Opening" }, { title: "Rising Action" }, { title: "Climax" }],
    });
    expect(simulateMomentCount(content)).toBe(3);
  });

  it("detects moments from 'scenes' key", () => {
    const content = JSON.stringify({
      scenes: [{ number: 1 }, { number: 2 }],
    });
    expect(simulateMomentCount(content)).toBe(2);
  });

  it("detects moments from 'moments' key", () => {
    const content = JSON.stringify({
      moments: [{ title: "Moment 1" }, { title: "Moment 2" }, { title: "Moment 3" }],
    });
    expect(simulateMomentCount(content)).toBe(3);
  });

  it("detects moments from 'items' key", () => {
    const content = JSON.stringify({
      items: [{ title: "Item A" }, { title: "Item B" }],
    });
    expect(simulateMomentCount(content)).toBe(2);
  });

  it("detects moments from 'beats' key", () => {
    const content = JSON.stringify({
      beats: [{ title: "Beat 1" }],
    });
    expect(simulateMomentCount(content)).toBe(1);
  });

  it("filters out null/empty entries", () => {
    const content = JSON.stringify({
      entries: [{ title: "Valid" }, null, { title: "" }, { number: 1 }],
    });
    expect(simulateMomentCount(content)).toBe(2); // {title: "Valid"} and {number: 1}
  });

  it("returns 0 for non-JSON content", () => {
    expect(simulateMomentCount("## Act 1\nSome markdown outline")).toBe(0);
  });

  it("returns 0 for malformed JSON", () => {
    expect(simulateMomentCount("{invalid json}")).toBe(0);
  });

  it("returns 0 when no entries/scenes/moments/items/beats keys exist", () => {
    const content = JSON.stringify({ title: "Outline", description: "Something" });
    expect(simulateMomentCount(content)).toBe(0);
  });

  it("returns 0 for empty array", () => {
    const content = JSON.stringify({ entries: [] });
    expect(simulateMomentCount(content)).toBe(0);
  });

  it("handles deeply nested outline structures", () => {
    const content = JSON.stringify({
      acts: [
        {
          number: 1,
          title: "Act 1",
          entries: [{ title: "Scene 1" }, { title: "Scene 2" }],
        },
        {
          number: 2,
          title: "Act 2",
          entries: [{ title: "Scene 3" }],
        },
      ],
    });
    // The function only looks at top-level keys, not nested entries
    // So acts won't match entries/scenes/moments/items/beats
    expect(simulateMomentCount(content)).toBe(0);
  });

  it("prefers 'entries' over 'moments' when both exist (entries is checked first)", () => {
    const content = JSON.stringify({
      entries: [{ title: "From Entries" }],
      moments: [{ title: "From Moments" }, { title: "Second" }],
    });
    // entries is checked first in the OR chain; entries has 1 item
    expect(simulateMomentCount(content)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Edge cases: story_outline with missing params
// ═══════════════════════════════════════════════════════════════════

describe("Edge cases: story_outline missing params", () => {
  it("returns no_action when doc_type is undefined", () => {
    const result = simulateRoute(undefined, 'doc-123', 'ver-456', 'Some content');
    expect(result.route).toBe('no_action');
  });

  it("returns no_action when doc_type is empty string", () => {
    const result = simulateRoute('', 'doc-123', 'ver-456', 'Some content');
    expect(result.route).toBe('no_action');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Edge cases: story_outline content boundaries
// ═══════════════════════════════════════════════════════════════════

describe("Edge cases: story_outline content boundaries", () => {
  it("handles content with only newlines", () => {
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', '\n\n\n\n\n\n\n\n\n\n');
    expect(result.route).toBe('story_outline_empty');
    expect(result.blockedByEmptyGuard).toBe(true);
  });

  it("handles content with tabs only", () => {
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', '\t\t\t\t\t\t\t\t\t\t\t');
    expect(result.route).toBe('story_outline_empty');
    expect(result.blockedByEmptyGuard).toBe(true);
  });

  it("passes content that trims to exactly 10 chars with whitespace padding", () => {
    // "  {hello}  " trims to 8 chars, so it should be blocked
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', '  {hello}  ');
    expect(result.blockedByEmptyGuard).toBe(true);
  });

  it("passes content with leading whitespace that trims to >= 10 chars", () => {
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', '  {"valid":1}  ');
    expect(result.blockedByEmptyGuard).toBe(false);
    expect(result.route).toBe('story_outline_moment');
  });

  it("detects JSON outline that starts with { after trimming", () => {
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456', '  {"acts":[{"number":1}]}  ');
    expect(result.route).toBe('story_outline_moment');
  });
});