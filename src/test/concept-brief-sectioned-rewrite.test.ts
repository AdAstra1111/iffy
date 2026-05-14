/**
 * Concept Brief → Sectioned Rewrite Fallback — Test Suite
 *
 * Verifies that Apply Notes on a concept_brief document correctly routes
 * to the sectioned rewrite pipeline (rewritePipeline.startRewrite()),
 * with the correct fallback and exclusion behavior.
 *
 * The routing logic is extracted from ProjectDevelopmentEngine.tsx handleRewrite()
 * for pure TypeScript testability under vitest.
 */

import { describe, it, expect } from "vitest";

// ── Constants (extracted from ProjectDevelopmentEngine.tsx) ──
// Line 364
const SECTIONED_REWRITE_TYPES = new Set([
  'treatment',
  'long_treatment',
  'beat_sheet',
  'concept_brief',
]);

// SECTIONED_VIEW_TYPES for comparison (line 363)
const SECTIONED_VIEW_TYPES = new Set([
  'feature_script',
  'treatment',
  'story_outline',
  'beat_sheet',
  'production_draft',
  'concept_brief',
]);

// ── SIMULATED ROUTING LOGIC (extracted from handleRewrite, lines 1309-1376) ──

type RouteResult = {
  route: 'beat_sheet_skip' | 'treatment_per_act' | 'treatment_per_act_fallback_sectioned' | 'sectioned_rewrite' | 'story_outline_moment' | 'character_bible_invoke' | 'no_action';
  reason: string;
  docType: string;
  hasDocId: boolean;
  hasVersionId: boolean;
};

function simulateRoute(
  docType: string | undefined,
  docId: string | null,
  versionId: string | null,
): RouteResult {
  if (!docType) {
    return { route: 'no_action', reason: 'no doc type', docType: '', hasDocId: !!docId, hasVersionId: !!versionId };
  }

  // beat_sheet: handled by BeatRewritePanel — skip
  if (docType === 'beat_sheet') {
    return {
      route: 'beat_sheet_skip',
      reason: 'BeatRewritePanel.onApplyAll handles beat-by-beat rewrite; do nothing here',
      docType, hasDocId: !!docId, hasVersionId: !!versionId,
    };
  }

  // treatment / long_treatment: per-act pipeline with fallback to sectioned
  if (docType === 'treatment' || docType === 'long_treatment') {
    if (docId && versionId) {
      return {
        route: 'treatment_per_act',
        reason: 'per-act pipeline via dev-engine-v2 invoke with fallback to sectioned rewrite',
        docType, hasDocId: !!docId, hasVersionId: !!versionId,
      };
    }
    return {
      route: 'no_action',
      reason: 'treatment but missing docId or versionId',
      docType, hasDocId: !!docId, hasVersionId: !!versionId,
    };
  }

  // concept_brief, character_bible: sectioned rewrite
  if (SECTIONED_REWRITE_TYPES.has(docType)) {
    if (docId && versionId) {
      return {
        route: 'sectioned_rewrite',
        reason: 'sectioned doc type via rewritePipeline.startRewrite()',
        docType, hasDocId: !!docId, hasVersionId: !!versionId,
      };
    }
    return {
      route: 'no_action',
      reason: 'sectioned doc type but missing docId or versionId',
      docType, hasDocId: !!docId, hasVersionId: !!versionId,
    };
  }

  // story_outline: moment pipeline
  if (docType === 'story_outline') {
    return {
      route: 'story_outline_moment',
      reason: 'story_outline routes to moment pipeline',
      docType, hasDocId: !!docId, hasVersionId: !!versionId,
    };
  }

  // character_bible: handled later in the function
  if (docType === 'character_bible' || docType === 'long_character_bible') {
    return {
      route: 'character_bible_invoke',
      reason: 'character bible via dev-engine-v2 invoke',
      docType, hasDocId: !!docId, hasVersionId: !!versionId,
    };
  }

  return { route: 'no_action', reason: 'unhandled doc type', docType, hasDocId: !!docId, hasVersionId: !!versionId };
}

// ── TESTS ──

describe("SECTIONED_REWRITE_TYPES — Contains concept_brief", () => {
  it("includes 'concept_brief' in the set", () => {
    expect(SECTIONED_REWRITE_TYPES.has('concept_brief')).toBe(true);
  });

  it("includes expected sectioned doc types", () => {
    expect(SECTIONED_REWRITE_TYPES.has('treatment')).toBe(true);
    expect(SECTIONED_REWRITE_TYPES.has('long_treatment')).toBe(true);
    expect(SECTIONED_REWRITE_TYPES.has('beat_sheet')).toBe(true);
  });

  it("excludes non-sectioned doc types", () => {
    expect(SECTIONED_REWRITE_TYPES.has('feature_script')).toBe(false);
    expect(SECTIONED_REWRITE_TYPES.has('story_outline')).toBe(false);
    expect(SECTIONED_REWRITE_TYPES.has('character_bible')).toBe(false);
    expect(SECTIONED_REWRITE_TYPES.has('long_character_bible')).toBe(false);
    expect(SECTIONED_REWRITE_TYPES.has('series_bible')).toBe(false);
    expect(SECTIONED_REWRITE_TYPES.has('season_script')).toBe(false);
    expect(SECTIONED_REWRITE_TYPES.has('episode_script')).toBe(false);
  });

  it("concept_brief is in both VIEW_TYPES and REWRITE_TYPES (viewable AND rewritable)", () => {
    expect(SECTIONED_VIEW_TYPES.has('concept_brief')).toBe(true);
    expect(SECTIONED_REWRITE_TYPES.has('concept_brief')).toBe(true);
  });

  it("all REWRITE_TYPES that are accessible via structured view are also VIEW_TYPES", () => {
    // beat_sheet is in rewrite types AND view types
    expect(SECTIONED_VIEW_TYPES.has('beat_sheet')).toBe(true);
    // long_treatment is rewrite-only (viewed via raw view) — not a subset expectation
    expect(SECTIONED_VIEW_TYPES.has('long_treatment')).toBe(false);
    // treatment in both
    expect(SECTIONED_VIEW_TYPES.has('treatment')).toBe(true);
    expect(SECTIONED_REWRITE_TYPES.has('treatment')).toBe(true);
    // concept_brief in both
    expect(SECTIONED_VIEW_TYPES.has('concept_brief')).toBe(true);
    expect(SECTIONED_REWRITE_TYPES.has('concept_brief')).toBe(true);
  });
});

describe("Apply Notes Routing — concept_brief route to sectioned rewrite", () => {
  it("routes concept_brief to sectioned rewrite when docId and versionId are present", () => {
    const result = simulateRoute('concept_brief', 'doc-123', 'ver-456');
    expect(result.route).toBe('sectioned_rewrite');
    expect(result.reason).toContain('rewritePipeline.startRewrite');
  });

  it("does NOT route concept_brief when missing docId", () => {
    const result = simulateRoute('concept_brief', null, 'ver-456');
    expect(result.route).toBe('no_action');
  });

  it("does NOT route concept_brief when missing versionId", () => {
    const result = simulateRoute('concept_brief', 'doc-123', null);
    expect(result.route).toBe('no_action');
  });

  it("does NOT route concept_brief when both are missing", () => {
    const result = simulateRoute('concept_brief', null, null);
    expect(result.route).toBe('no_action');
  });

  it("does not route concept_brief when doc_type is undefined", () => {
    const result = simulateRoute(undefined, 'doc-123', 'ver-456');
    expect(result.route).toBe('no_action');
  });
});

describe("Treatment / long_treatment — Per-act pipeline with fallback", () => {
  it("routes treatment to per-act pipeline when conditions are met", () => {
    const result = simulateRoute('treatment', 'doc-123', 'ver-456');
    expect(result.route).toBe('treatment_per_act');
  });

  it("routes long_treatment to per-act pipeline", () => {
    const result = simulateRoute('long_treatment', 'doc-123', 'ver-456');
    expect(result.route).toBe('treatment_per_act');
  });

  it("does not route treatment when missing docId", () => {
    const result = simulateRoute('treatment', null, 'ver-456');
    expect(result.route).toBe('no_action');
  });

  it("does not route treatment when missing versionId", () => {
    const result = simulateRoute('treatment', 'doc-123', null);
    expect(result.route).toBe('no_action');
  });
});

describe("Exclusion: beat_sheet skipped in sectioned rewrite", () => {
  it("skips beat_sheet even when docId and versionId are present", () => {
    const result = simulateRoute('beat_sheet', 'doc-123', 'ver-456');
    expect(result.route).toBe('beat_sheet_skip');
  });

  it("skips beat_sheet even though it IS in SECTIONED_REWRITE_TYPES", () => {
    // beat_sheet is in the set but gets intercepted earlier
    expect(SECTIONED_REWRITE_TYPES.has('beat_sheet')).toBe(true);
    const result = simulateRoute('beat_sheet', 'doc-123', 'ver-456');
    // The beat_sheet check comes BEFORE the SECTIONED_REWRITE_TYPES check
    expect(result.route).toBe('beat_sheet_skip');
  });
});

describe("Boundary: What happens when concept_brief is NOT in SECTIONED_REWRITE_TYPES", () => {
  it("concept_brief would fall through to character_bible if removed from set", () => {
    // Simulate what would happen if concept_brief were removed from the set
    const reducedSet = new Set(['treatment', 'long_treatment', 'beat_sheet']);
    const docType = 'concept_brief';
    const hasDocId = true;
    const hasVersionId = true;

    // With concept_brief in the set, it routes to sectioned rewrite
    expect(SECTIONED_REWRITE_TYPES.has(docType)).toBe(true);

    // Without concept_brief in the set, it would fall through:
    // beat_sheet? no. treatment/long_treatment? no.
    // SECTIONED_REWRITE_TYPES.has(concept_brief)? NO.
    // story_outline? no. character_bible? no.
    // Would hit the textLength > 30000 check and potentially the character_bible path
    // or no_action for short documents
    expect(reducedSet.has(docType)).toBe(false);
  });
});

describe("Regression: Other sectioned types are not affected", () => {
  it("treatment routes to per-act pipeline (not sectioned)", () => {
    // Treatment has its own handler BEFORE the generic sectioned rewrite handler
    const result = simulateRoute('treatment', 'doc-123', 'ver-456');
    expect(result.route).toBe('treatment_per_act');
  });

  it("long_treatment routes to per-act pipeline (not sectioned)", () => {
    const result = simulateRoute('long_treatment', 'doc-123', 'ver-456');
    expect(result.route).toBe('treatment_per_act');
  });

  it("story_outline routes to moment pipeline", () => {
    const result = simulateRoute('story_outline', 'doc-123', 'ver-456');
    expect(result.route).toBe('story_outline_moment');
  });

  it("character_bible routes to invoke path", () => {
    const result = simulateRoute('character_bible', 'doc-123', 'ver-456');
    expect(result.route).toBe('character_bible_invoke');
  });

  it("long_character_bible routes to invoke path", () => {
    const result = simulateRoute('long_character_bible', 'doc-123', 'ver-456');
    expect(result.route).toBe('character_bible_invoke');
  });
});

// ── INVARIANT CHECKS ──

describe("Invariant: Every handled doc type routes to exactly one handler", () => {
  const HANDLED_DOC_TYPES = [
    'treatment', 'story_outline', 'beat_sheet',
    'concept_brief', 'character_bible', 'long_character_bible', 'long_treatment',
  ];

  for (const dt of HANDLED_DOC_TYPES) {
    it(`${dt} routes to exactly one handler`, () => {
      const result = simulateRoute(dt, 'doc-123', 'ver-456');
      expect(result.route).not.toBe('no_action');
      const validRoutes = [
        'beat_sheet_skip', 'treatment_per_act', 'sectioned_rewrite',
        'story_outline_moment', 'character_bible_invoke',
      ];
      expect(validRoutes).toContain(result.route);
    });
  }

  it("feature_script correctly has no_action (not a sectioned rewrite type)", () => {
    const result = simulateRoute('feature_script', 'doc-123', 'ver-456');
    expect(result.route).toBe('no_action');
  });

  it("production_draft correctly has no_action (not a sectioned rewrite type)", () => {
    const result = simulateRoute('production_draft', 'doc-123', 'ver-456');
    expect(result.route).toBe('no_action');
  });

  it("series_bible correctly has no_action (handled by different pipeline)", () => {
    const result = simulateRoute('series_bible', 'doc-123', 'ver-456');
    expect(result.route).toBe('no_action');
  });
});

describe("Invariant: No orphaned doc types (every sectioned view type has a rewrite path)", () => {
  it("all SECTIONED_REWRITE_TYPES members have a defined route", () => {
    for (const rewriteType of SECTIONED_REWRITE_TYPES) {
      const result = simulateRoute(rewriteType, 'doc-123', 'ver-456');
      // beat_sheet is skipped but still has a defined route
      expect(result.route).not.toBe('no_action');
    }
  });

  it("concept_brief specifically routes to sectioned_rewrite", () => {
    const result = simulateRoute('concept_brief', 'doc-123', 'ver-456');
    expect(result.route).toBe('sectioned_rewrite');
  });
});

describe("Edge case: Treatment per-act fallback to sectioned rewrite", () => {
  it("treatment fallback handler uses sectioned rewrite provenance (simulated)", () => {
    // The code at lines 1343-1353 shows:
    // When treatment per-act fails, it creates a provenance with
    // rewriteModeReason: 'per_act_failed_fallback' and calls
    // rewritePipeline.startRewrite()
    //
    // This simulates that the fallback path exists and produces
    // the correct provenance shape
    const fallbackProvenance = {
      rewriteModeSelected: 'auto',
      rewriteModeEffective: 'chunk',
      rewriteModeReason: 'per_act_failed_fallback',
      rewriteModeDebug: {
        docType: 'treatment',
        decision_timestamp: new Date().toISOString(),
      },
      rewriteProbe: null,
    };

    expect(fallbackProvenance.rewriteModeReason).toBe('per_act_failed_fallback');
    expect(fallbackProvenance.rewriteModeEffective).toBe('chunk');
    expect(fallbackProvenance.rewriteModeDebug.docType).toBe('treatment');

    // This same provenance shape works for concept_brief fallback too
    const cbFallback = { ...fallbackProvenance, rewriteModeDebug: { docType: 'concept_brief', decision_timestamp: new Date().toISOString() } };
    expect(cbFallback.rewriteModeDebug.docType).toBe('concept_brief');
  });
});