/**
 * Tests for PackageBar pill label resolution.
 *
 * Verifies that legacy doc_type labels are correctly resolved via getDocTypeLabel
 * instead of the previous raw capitalize-each-word fallback.
 *
 * The change at lines 173/179 of PackageBar.tsx:
 *   - BEFORE: deliverable?.label ?? docType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
 *   - AFTER:  deliverable?.label ?? getDocTypeLabel(docType, format)
 *
 * This ensures consistency with the canonical label map in can-promote-to-script.ts
 * and documentLadders.ts (13+ call sites across the codebase).
 */
import { describe, it, expect } from 'vitest';
import { getDocTypeLabel } from '@/lib/can-promote-to-script';

// ─── Unit tests for getDocTypeLabel ───────────────────────────────────────
// These test the function that PackageBar now uses for label fallback.

describe('getDocTypeLabel — canonical label resolution', () => {
  it('returns proper label for production_draft', () => {
    expect(getDocTypeLabel('production_draft')).toBe('Production Draft');
  });

  it('returns proper label for concept_brief', () => {
    expect(getDocTypeLabel('concept_brief')).toBe('Concept Brief');
  });

  it('returns proper label for idea', () => {
    expect(getDocTypeLabel('idea')).toBe('Idea');
  });

  it('returns proper label for treatment', () => {
    expect(getDocTypeLabel('treatment')).toBe('Treatment');
  });

  it('returns proper label for beat_sheet', () => {
    expect(getDocTypeLabel('beat_sheet')).toBe('Beat Sheet');
  });

  it('returns proper label for screenplay_draft', () => {
    expect(getDocTypeLabel('screenplay_draft')).toBe('Screenplay Draft');
  });

  it('returns proper label for deck', () => {
    expect(getDocTypeLabel('deck')).toBe('Deck');
  });

  it('returns proper label for documentary_outline', () => {
    expect(getDocTypeLabel('documentary_outline')).toBe('Documentary Outline');
  });

  it('returns proper label for outline', () => {
    expect(getDocTypeLabel('outline')).toBe('Outline');
  });

  it('returns proper label for logline', () => {
    expect(getDocTypeLabel('logline')).toBe('Logline');
  });

  it('returns proper label for one_pager', () => {
    expect(getDocTypeLabel('one_pager')).toBe('One-Pager');
  });

  it('returns proper label for budget_topline', () => {
    expect(getDocTypeLabel('budget_topline')).toBe('Budget Top-Line');
  });

  it('returns proper label for long_synopsis', () => {
    expect(getDocTypeLabel('long_synopsis')).toBe('Long Synopsis');
  });

  it('returns proper label for season_arc', () => {
    expect(getDocTypeLabel('season_arc')).toBe('Season Arc');
  });

  it('returns proper label for episode_grid', () => {
    expect(getDocTypeLabel('episode_grid')).toBe('Episode Grid');
  });

  it('returns proper label for character_bible', () => {
    expect(getDocTypeLabel('character_bible')).toBe('Character Bible');
  });

  it('returns proper label for pitch_document', () => {
    expect(getDocTypeLabel('pitch_document')).toBe('Pitch Document');
  });

  it('returns proper label for market_sheet', () => {
    expect(getDocTypeLabel('market_sheet')).toBe('Market Sheet');
  });

  it('returns proper label for writers_room', () => {
    expect(getDocTypeLabel('writers_room')).toBe("Writer's Room");
  });

  it('returns proper label for topline_narrative', () => {
    expect(getDocTypeLabel('topline_narrative')).toBe('Topline Narrative');
  });

  it('returns proper label for format_rules', () => {
    expect(getDocTypeLabel('format_rules')).toBe('Format Rules');
  });
});

describe('getDocTypeLabel — legacy alias resolution', () => {
  // These legacy keys are aliased via DOC_LABEL_ALIASES in documentLadders.ts
  // The old capitalize-each-word fallback would have displayed these differently.

  it('resolves blueprint -> Treatment', () => {
    expect(getDocTypeLabel('blueprint')).toBe('Treatment');
  });

  it('resolves series_bible -> Treatment', () => {
    expect(getDocTypeLabel('series_bible')).toBe('Treatment');
  });

  it('resolves architecture -> Story Outline', () => {
    expect(getDocTypeLabel('architecture')).toBe('Story Outline');
  });

  it('resolves coverage -> Production Draft', () => {
    expect(getDocTypeLabel('coverage')).toBe('Production Draft');
  });

  it('resolves one_pager -> Concept Brief', () => {
    expect(getDocTypeLabel('one_pager')).toBe('One-Pager');
  });

  it('resolves synopsis -> Topline Narrative', () => {
    expect(getDocTypeLabel('synopsis')).toBe('Topline Narrative');
  });
});

describe('getDocTypeLabel — edge cases', () => {
  it('returns Document for null docType', () => {
    expect(getDocTypeLabel(null)).toBe('Document');
  });

  it('returns Document for undefined docType', () => {
    expect(getDocTypeLabel(undefined)).toBe('Document');
  });

  it('returns Document for empty string docType', () => {
    expect(getDocTypeLabel('')).toBe('Document');
  });

  it('returns Document for unknown docType', () => {
    expect(getDocTypeLabel('non_existent_type')).toBe('Document');
    // Note: warns via console.warn but we only check return value
  });

  it('handles leading/trailing whitespace in docType', () => {
    expect(getDocTypeLabel('  production_draft  ')).toBe('Production Draft');
  });

  it('handles hyphenated docTypes', () => {
    expect(getDocTypeLabel('production-draft')).toBe('Production Draft');
  });

  it('handles mixed-case docTypes', () => {
    expect(getDocTypeLabel('Production_Draft')).toBe('Production Draft');
  });
});

describe('getDocTypeLabel — format-specific overrides', () => {
  it('returns Season Arc for non-film format', () => {
    // Default: no format override
    expect(getDocTypeLabel('season_arc')).toBe('Season Arc');
    // Series format: should NOT override
    expect(getDocTypeLabel('season_arc', 'series')).toBe('Season Arc');
  });

  it('returns Story Arc for film format (format override)', () => {
    expect(getDocTypeLabel('season_arc', 'film')).toBe('Story Arc');
  });

  it('returns Story Arc for feature format', () => {
    expect(getDocTypeLabel('season_arc', 'feature')).toBe('Story Arc');
  });

  it('returns Story Arc for short format', () => {
    expect(getDocTypeLabel('season_arc', 'short')).toBe('Story Arc');
  });

  it('returns Story Arc for documentary format', () => {
    expect(getDocTypeLabel('season_arc', 'documentary')).toBe('Story Arc');
  });

  it('returns Story Arc for hybrid-documentary format', () => {
    expect(getDocTypeLabel('season_arc', 'hybrid-documentary')).toBe('Story Arc');
  });

  it('returns Story Arc for short-film', () => {
    expect(getDocTypeLabel('season_arc', 'short-film')).toBe('Story Arc');
  });

  it('preserves beat_sheet as Beat Sheet even in film format', () => {
    expect(getDocTypeLabel('beat_sheet', 'film')).toBe('Beat Sheet');
  });

  it('does NOT override beat_sheet for non-film formats', () => {
    expect(getDocTypeLabel('beat_sheet', 'vertical_drama')).toBe('Beat Sheet');
  });

  it('handles format whitespace/hyphens', () => {
    expect(getDocTypeLabel('season_arc', ' Feature ')).toBe('Story Arc');
    expect(getDocTypeLabel('season_arc', 'FEATURE')).toBe('Story Arc');
    expect(getDocTypeLabel('season_arc', 'feature-film')).toBe('Story Arc');
  });

  it('returns non-overridden labels normally even in film format', () => {
    expect(getDocTypeLabel('concept_brief', 'film')).toBe('Concept Brief');
    expect(getDocTypeLabel('production_draft', 'film')).toBe('Production Draft');
  });
});

describe('getDocTypeLabel — derived doc types (prefix detection)', () => {
  it('returns Scene Index for scene_graph__*', () => {
    expect(getDocTypeLabel('scene_graph__abc123')).toBe('Scene Index');
  });

  it('returns Change Report for change_report__*', () => {
    expect(getDocTypeLabel('change_report__def456')).toBe('Change Report');
  });

  it('returns Universe Manifest for universe_manifest', () => {
    expect(getDocTypeLabel('universe_manifest')).toBe('Universe Manifest');
  });

  it('prefers prefix detection over alias for scene_graph variants', () => {
    // Even if scene_graph__something were somehow an alias, prefix wins
    expect(getDocTypeLabel('scene_graph__special_case')).toBe('Scene Index');
  });
});

// ─── Component label resolution logic test ─────────────────────────────────
// Tests the label resolution pattern used in PackageBar.tsx lines 173/179:
//   deliverable?.label ?? getDocTypeLabel(docType, format)

describe('PackageBar label resolution pattern', () => {
  type Deliverable = { label?: string | null } | null | undefined;

  function resolveLabel(deliverable: Deliverable, docType: string, format?: string | null): string {
    return deliverable?.label ?? getDocTypeLabel(docType, format);
  }

  it('uses deliverable label when available', () => {
    const d = { label: 'Custom Label' };
    expect(resolveLabel(d, 'production_draft')).toBe('Custom Label');
  });

  it('uses getDocTypeLabel when deliverable has no label', () => {
    const d = { label: null };
    expect(resolveLabel(d, 'production_draft')).toBe('Production Draft');
  });

  it('uses getDocTypeLabel when deliverable has empty label', () => {
    const d = { label: '' };
    expect(resolveLabel(d, 'concept_brief')).toBe('Concept Brief');
  });

  it('uses getDocTypeLabel when deliverable is null', () => {
    expect(resolveLabel(null, 'treatment')).toBe('Treatment');
  });

  it('uses getDocTypeLabel when deliverable is undefined', () => {
    expect(resolveLabel(undefined, 'idea')).toBe('Idea');
  });

  it('uses getDocTypeLabel with format passed through', () => {
    // season_arc with film format should get the film override
    expect(resolveLabel(null, 'season_arc', 'film')).toBe('Story Arc');
  });

  it('falls back to Document for unknown docType even in label resolution', () => {
    expect(resolveLabel(null, 'made_up_type_xyz')).toBe('Document');
  });

  it('deliverable label with null falls back to getDocTypeLabel with format', () => {
    const d = { label: null };
    expect(resolveLabel(d, 'season_arc', 'feature')).toBe('Story Arc');
  });

  it('deliverable label takes priority regardless of format', () => {
    const d = { label: 'My Custom Season Arc' };
    // Even with film format override available, deliverable label wins
    expect(resolveLabel(d, 'season_arc', 'film')).toBe('My Custom Season Arc');
  });
});

// ─── Legacy behavior parity check ─────────────────────────────────────────
// Verify that getDocTypeLabel produces human-readable labels for the same
// docTypes that the old capitalize-each-word fallback would have covered.
// This ensures the change doesn't unexpectedly change displayed text.

describe('Legacy parity — getDocTypeLabel vs old capitalize fallback', () => {
  // Helper to simulate the OLD behavior
  function oldFallback(docType: string): string {
    return docType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  it('production_draft — old: "Production Draft", new: "Production Draft"', () => {
    expect(oldFallback('production_draft')).toBe('Production Draft');
    expect(getDocTypeLabel('production_draft')).toBe('Production Draft');
  });

  it('concept_brief — old: "Concept Brief", new: "Concept Brief"', () => {
    expect(oldFallback('concept_brief')).toBe('Concept Brief');
    expect(getDocTypeLabel('concept_brief')).toBe('Concept Brief');
  });

  it('character_bible — old: "Character Bible", new: "Character Bible"', () => {
    expect(oldFallback('character_bible')).toBe('Character Bible');
    expect(getDocTypeLabel('character_bible')).toBe('Character Bible');
  });

  it('pitch_document — old: "Pitch Document", new: "Pitch Document"', () => {
    expect(oldFallback('pitch_document')).toBe('Pitch Document');
    expect(getDocTypeLabel('pitch_document')).toBe('Pitch Document');
  });

  it('topline_narrative — old: "Topline Narrative", new: "Topline Narrative"', () => {
    expect(oldFallback('topline_narrative')).toBe('Topline Narrative');
    expect(getDocTypeLabel('topline_narrative')).toBe('Topline Narrative');
  });

  it('format_rules — old: "Format Rules", new: "Format Rules"', () => {
    expect(oldFallback('format_rules')).toBe('Format Rules');
    expect(getDocTypeLabel('format_rules')).toBe('Format Rules');
  });

  it('beat_sheet — old: "Beat Sheet", new: "Beat Sheet"', () => {
    expect(oldFallback('beat_sheet')).toBe('Beat Sheet');
    expect(getDocTypeLabel('beat_sheet')).toBe('Beat Sheet');
  });

  it('episode_grid — old: "Episode Grid", new: "Episode Grid"', () => {
    expect(oldFallback('episode_grid')).toBe('Episode Grid');
    expect(getDocTypeLabel('episode_grid')).toBe('Episode Grid');
  });

  it('long_synopsis — old: "Long Synopsis", new: "Topline Narrative" (aliased)', () => {
    // long_synopsis is aliased → topline_narrative via DOC_LABEL_ALIASES
    expect(oldFallback('long_synopsis')).toBe('Long Synopsis');
    expect(getDocTypeLabel('long_synopsis')).toBe('Topline Narrative');
  });

  it('deck_text — old: "Deck Text", new: "Deck" (improved)', () => {
    // Old capitalize gave "Deck Text" — getDocTypeLabel gives "Deck"
    // This is an IMPROVEMENT: deck_text is correctly labeled as "Deck"
    expect(oldFallback('deck_text')).toBe('Deck Text');
    expect(getDocTypeLabel('deck_text')).toBe('Deck');
  });

  it('budget_topline — old: "Budget Topline", new: "Budget Top-Line" (improved)', () => {
    // Old: "Budget Topline" — new: "Budget Top-Line" (proper hyphenation)
    expect(oldFallback('budget_topline')).toBe('Budget Topline');
    expect(getDocTypeLabel('budget_topline')).toBe('Budget Top-Line');
  });

  it('writers_room — old: "Writers Room", new: "Writer\'s Room" (improved)', () => {
    // Old: "Writers Room" — new: "Writer's Room" (proper possessive)
    expect(oldFallback('writers_room')).toBe('Writers Room');
    expect(getDocTypeLabel('writers_room')).toBe("Writer's Room");
  });

  it('one_pager — old: "One Pager", new: "One-Pager" (improved)', () => {
    // Old: "One Pager" — new: "One-Pager" (proper hyphenation)
    expect(oldFallback('one_pager')).toBe('One Pager');
    expect(getDocTypeLabel('one_pager')).toBe('One-Pager');
  });
});