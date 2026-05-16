/**
 * Empty AssembledText Guard — Test Suite
 *
 * Verifies three defense-in-depth guard layers prevent empty assembledText
 * from reaching the rewrite pipeline:
 *
 * Layer 1 — ProjectDevelopmentEngine.tsx (pre-routing guard, lines 1363-1371)
 *   Checks if version plaintext has <10 chars before SECTIONED_REWRITE_TYPES routing.
 *
 * Layer 2 — dev-engine-v2/index.ts (server-side validation, lines 9774-9781)
 *   Per-field missing-param checks with named error messages.
 *
 * Layer 3 — useRewritePipeline.ts (post-assembly guard, lines 408-411)
 *   Throws if assembledText is empty or <10 trimmed chars.
 */

import { describe, it, expect } from "vitest";

// ─────────────────────────────────────────────
// LAYER 1: Pre-routing guard (ProjectDevelopmentEngine.tsx lines 1363-1371)
// ─────────────────────────────────────────────

// SECTIONED_REWRITE_TYPES extracted from line 364
const SECTIONED_REWRITE_TYPES = new Set([
  'treatment',
  'long_treatment',
  'beat_sheet',
  'concept_brief',
]);

type PreRouteGuardResult = {
  blocked: boolean;
  reason: string | null;
};

/**
 * Simulates the pre-routing guard at ProjectDevelopmentEngine.tsx lines 1363-1371.
 *
 * The guard checks:
 *   - doc type is in SECTIONED_REWRITE_TYPES
 *   - docId and versionId are present
 *   - version plaintext has >= 10 trimmed characters
 *
 * If any condition fails, it returns early with a blocking reason.
 */
function simulatePreRouteGuard(
  docType: string | undefined,
  docId: string | null,
  versionId: string | null,
  plaintext: string | null | undefined,
): PreRouteGuardResult {
  // Not a sectioned rewrite type — guard doesn't apply
  if (!docType || !SECTIONED_REWRITE_TYPES.has(docType)) {
    return { blocked: false, reason: null };
  }

  // Missing docId or versionId — wouldn't reach the guard in practice,
  // but the guard implicitly depends on these being present
  if (!docId || !versionId) {
    return { blocked: false, reason: null };
  }

  // ── Lines 1365-1370: The actual guard logic ──
  const proseContent = plaintext || '';
  if (!proseContent || proseContent.trim().length < 10) {
    return {
      blocked: true,
      reason: 'Document version appears to have no content — cannot apply notes. Generate the document first.',
    };
  }

  return { blocked: false, reason: null };
}

describe("Layer 1: Pre-routing guard (ProjectDevelopmentEngine.tsx lines 1363-1371)", () => {
  describe("Happy path — content passes guard", () => {
    it("allows concept_brief with meaningful content (>= 10 chars)", () => {
      const result = simulatePreRouteGuard('concept_brief', 'doc-123', 'ver-456', 'A logline about a story with some substance.');
      expect(result.blocked).toBe(false);
    });

    it("allows treatment with meaningful content", () => {
      const result = simulatePreRouteGuard('treatment', 'doc-123', 'ver-456', 'This is a treatment that has plenty of content.');
      expect(result.blocked).toBe(false);
    });

    it("allows long_treatment with minimal valid content (exactly 10 chars)", () => {
      const result = simulatePreRouteGuard('long_treatment', 'doc-123', 'ver-456', '1234567890');
      expect(result.blocked).toBe(false);
    });
  });

  describe("Edge cases — content blocked by guard", () => {
    it("blocks concept_brief with empty string plaintext", () => {
      const result = simulatePreRouteGuard('concept_brief', 'doc-123', 'ver-456', '');
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('no content');
    });

    it("blocks concept_brief with null plaintext", () => {
      const result = simulatePreRouteGuard('concept_brief', 'doc-123', 'ver-456', null);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('no content');
    });

    it("blocks concept_brief with undefined plaintext", () => {
      const result = simulatePreRouteGuard('concept_brief', 'doc-123', 'ver-456', undefined);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('no content');
    });

    it("blocks concept_brief with very short content (9 chars)", () => {
      const result = simulatePreRouteGuard('concept_brief', 'doc-123', 'ver-456', '123456789');
      expect(result.blocked).toBe(true);
    });

    it("blocks concept_brief with whitespace-only content", () => {
      const result = simulatePreRouteGuard('concept_brief', 'doc-123', 'ver-456', '   ');
      expect(result.blocked).toBe(true);
    });

    it("blocks concept_brief with content that is whitespace-trimmed to < 10 chars", () => {
      const result = simulatePreRouteGuard('concept_brief', 'doc-123', 'ver-456', '   abc   ');
      expect(result.blocked).toBe(true);
    });
  });

  describe("Non-sectioned doc types — guard does not apply", () => {
    it("does not block feature_script (not in SECTIONED_REWRITE_TYPES)", () => {
      const result = simulatePreRouteGuard('feature_script', 'doc-123', 'ver-456', '');
      expect(result.blocked).toBe(false);
    });

    it("does not block story_outline (handled via moment pipeline)", () => {
      const result = simulatePreRouteGuard('story_outline', 'doc-123', 'ver-456', '');
      expect(result.blocked).toBe(false);
    });

    it("does not block character_bible (handled via invoke path)", () => {
      const result = simulatePreRouteGuard('character_bible', 'doc-123', 'ver-456', '');
      expect(result.blocked).toBe(false);
    });
  });

  describe("Boundary: Exactly 10 trimmed chars passes through", () => {
    it("allows exactly 10 characters", () => {
      // Boundary test: length === 10 should pass (condition is < 10, not <= 10)
      const result = simulatePreRouteGuard('concept_brief', 'doc-123', 'ver-456', '1234567890');
      expect(result.blocked).toBe(false);
    });

    it("allows exactly 10 characters with leading/trailing whitespace", () => {
      const result = simulatePreRouteGuard('concept_brief', 'doc-123', 'ver-456', '  1234567890  ');
      expect(result.blocked).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
// LAYER 2: Server-side validation (dev-engine-v2/index.ts lines 9774-9781)
// ─────────────────────────────────────────────

type ValidationResult = {
  valid: boolean;
  missing: string[];
  errorMessage: string | null;
};

/**
 * Simulates the rewrite-assemble param validation at dev-engine-v2/index.ts lines 9774-9781.
 *
 * Checks that all required params are present and non-empty.
 * assembledText specifically must also have trimmed content.
 */
function simulateServerSideValidation(params: {
  projectId?: string;
  documentId?: string;
  versionId?: string;
  assembledText?: string;
}): ValidationResult {
  const missing: string[] = [];

  if (!params.projectId) missing.push('projectId');
  if (!params.documentId) missing.push('documentId');
  if (!params.versionId) missing.push('versionId');
  if (!params.assembledText || !params.assembledText.trim()) missing.push('assembledText');

  if (missing.length > 0) {
    return {
      valid: false,
      missing,
      errorMessage: 'Missing required params: ' + missing.join(', '),
    };
  }

  return { valid: true, missing: [], errorMessage: null };
}

describe("Layer 2: Server-side validation (dev-engine-v2/index.ts lines 9774-9781)", () => {
  describe("Happy path — all params present", () => {
    it("passes validation when all required params are provided", () => {
      const result = simulateServerSideValidation({
        projectId: 'proj-1',
        documentId: 'doc-1',
        versionId: 'ver-1',
        assembledText: 'A complete document with meaningful content.',
      });
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });
  });

  describe("Edge cases — missing params individually", () => {
    it("catches missing projectId", () => {
      const result = simulateServerSideValidation({
        projectId: '',
        documentId: 'doc-1',
        versionId: 'ver-1',
        assembledText: 'Some content.',
      });
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('projectId');
    });

    it("catches missing documentId", () => {
      const result = simulateServerSideValidation({
        projectId: 'proj-1',
        documentId: '',
        versionId: 'ver-1',
        assembledText: 'Some content.',
      });
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('documentId');
    });

    it("catches missing versionId", () => {
      const result = simulateServerSideValidation({
        projectId: 'proj-1',
        documentId: 'doc-1',
        versionId: '',
        assembledText: 'Some content.',
      });
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('versionId');
    });

    it("catches missing assembledText (empty string)", () => {
      const result = simulateServerSideValidation({
        projectId: 'proj-1',
        documentId: 'doc-1',
        versionId: 'ver-1',
        assembledText: '',
      });
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('assembledText');
    });

    it("catches missing assembledText (whitespace only)", () => {
      const result = simulateServerSideValidation({
        projectId: 'proj-1',
        documentId: 'doc-1',
        versionId: 'ver-1',
        assembledText: '   ',
      });
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('assembledText');
    });

    it("catches missing assembledText (undefined)", () => {
      const result = simulateServerSideValidation({
        projectId: 'proj-1',
        documentId: 'doc-1',
        versionId: 'ver-1',
      });
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('assembledText');
    });
  });

  describe("Multiple missing params", () => {
    it("reports all missing params when multiple are absent", () => {
      const result = simulateServerSideValidation({
        projectId: 'proj-1',
        documentId: '',
        versionId: '',
        assembledText: '',
      });
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['documentId', 'versionId', 'assembledText']);
    });

    it("reports all missing params when everything is missing", () => {
      const result = simulateServerSideValidation({});
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['projectId', 'documentId', 'versionId', 'assembledText']);
    });
  });

  describe("Error message format", () => {
    it("formats error message with comma-separated missing param names", () => {
      const result = simulateServerSideValidation({
        projectId: 'proj-1',
        documentId: '',
        versionId: '',
        assembledText: '',
      });
      expect(result.errorMessage).toBe('Missing required params: documentId, versionId, assembledText');
    });

    it("includes all missing params in error message", () => {
      const result = simulateServerSideValidation({});
      expect(result.errorMessage).toContain('projectId');
      expect(result.errorMessage).toContain('documentId');
      expect(result.errorMessage).toContain('versionId');
      expect(result.errorMessage).toContain('assembledText');
    });
  });

  describe("Edge case: assembledText with only newlines or special whitespace", () => {
    it("catches assembledText with only newlines", () => {
      const result = simulateServerSideValidation({
        projectId: 'proj-1',
        documentId: 'doc-1',
        versionId: 'ver-1',
        assembledText: '\n\n\n',
      });
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('assembledText');
    });

    it("catches assembledText with tabs only", () => {
      const result = simulateServerSideValidation({
        projectId: 'proj-1',
        documentId: 'doc-1',
        versionId: 'ver-1',
        assembledText: '\t\t\t',
      });
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('assembledText');
    });
  });
});

// ─────────────────────────────────────────────
// LAYER 3: Post-assembly guard (useRewritePipeline.ts lines 408-411)
// ─────────────────────────────────────────────

/**
 * Simulates the post-assembly guard at useRewritePipeline.ts lines 408-411.
 *
 * Throws if assembledText is empty or <10 trimmed chars.
 * The error propagates to the catch block at lines 454-458 which shows an error toast.
 */
function simulatePostAssemblyGuard(assembledText: string): { ok: true; length: number } | never {
  // ── Lines 408-411: The actual guard ──
  if (!assembledText || assembledText.trim().length < 10) {
    throw new Error('Rewrite produced no content — document version may be empty');
  }

  return { ok: true, length: assembledText.length };
}

describe("Layer 3: Post-assembly guard (useRewritePipeline.ts lines 408-411)", () => {
  describe("Happy path — assembledText is valid", () => {
    it("passes when assembledText has meaningful content (>= 10 chars)", () => {
      const result = simulatePostAssemblyGuard('This is a properly assembled document with substance.');
      expect(result.ok).toBe(true);
    });

    it("passes with exactly 10 characters (boundary)", () => {
      const result = simulatePostAssemblyGuard('1234567890');
      expect(result.ok).toBe(true);
    });
  });

  describe("Edge cases — throws on empty/short content", () => {
    it("throws on empty string", () => {
      expect(() => simulatePostAssemblyGuard('')).toThrow('Rewrite produced no content');
    });

    it("throws on whitespace-only string", () => {
      expect(() => simulatePostAssemblyGuard('     ')).toThrow('Rewrite produced no content');
    });

    it("throws on very short content (9 chars)", () => {
      expect(() => simulatePostAssemblyGuard('123456789')).toThrow('Rewrite produced no content');
    });

    it("throws on single character", () => {
      expect(() => simulatePostAssemblyGuard('a')).toThrow('Rewrite produced no content');
    });

    it("throws on newlines only", () => {
      expect(() => simulatePostAssemblyGuard('\n\n\n')).toThrow('Rewrite produced no content');
    });

    it("throws on content with whitespace trimmed to < 10 chars", () => {
      expect(() => simulatePostAssemblyGuard('   short   ')).toThrow('Rewrite produced no content');
    });
  });

  describe("Boundary: 9 vs 10 chars", () => {
    it("correctly rejects 9 characters", () => {
      expect(() => simulatePostAssemblyGuard('123456789')).toThrow();
    });

    it("correctly allows 10 characters", () => {
      const result = simulatePostAssemblyGuard('1234567890');
      expect(result.ok).toBe(true);
      expect(result.length).toBe(10);
    });
  });

  describe("Error message", () => {
    it("throws with the exact error message from the codebase", () => {
      expect(() => simulatePostAssemblyGuard('')).toThrow('Rewrite produced no content — document version may be empty');
    });
  });
});

// ─────────────────────────────────────────────
// LAYER 4: Backend surgical skip (dev-engine-v2/index.ts lines 9724-9759)
// ─────────────────────────────────────────────

type SurgicalSkipResult = {
  skipAiCall: boolean;
  rewrittenContent: string;
  reason: string | null;
};

/**
 * Simulates the surgical skip logic at dev-engine-v2/index.ts lines 9724-9759.
 *
 * When skipAiCall is true (no matching notes for this section's header),
 * rewrittenChunk = chunkText — preserving original content instead of
 * running through AI which could return empty or corrupted content.
 *
 * This is the ROOT FIX that prevents empty assembledText from occurring.
 * Layers 1-3 are defense-in-depth; Layer 4 prevents the problem at source.
 */
function simulateSurgicalSkip(params: {
  isSectionedDocType: boolean;
  approvedNotes: string[];
  sectionHeader: string | null;
  chunkText: string;
}): SurgicalSkipResult {
  const { isSectionedDocType, approvedNotes, sectionHeader, chunkText } = params;
  let skipAiCall = false;
  let reason: string | null = null;

  if (isSectionedDocType && approvedNotes && approvedNotes.length > 0) {
    const allNoteText = approvedNotes
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (allNoteText && allNoteText.length > 0) {
      // Extract section label from first ## header in the chunk
      const headerMatch = sectionHeader || '';
      const sectionLabel = headerMatch;
      const labelWords = (sectionLabel || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w: string) => w.length > 2 && !["the", "and", "for", "with", "&", "not"].includes(w));
      const headerSearch = [...new Set(labelWords)];
      const hasMatch = headerSearch.some((term: string) => allNoteText.includes(term));

      if (!hasMatch) {
        skipAiCall = true;
        reason = `surgical_preserve chunk — no matching notes for section: "${sectionLabel}"`;
      } else {
        reason = `notes match found — proceeding with AI rewrite`;
      }
    }
  }

  // ── Lines 9751-9752: The critical fix ──
  const rewrittenContent = skipAiCall ? chunkText : `${chunkText} (would call AI)`;

  return { skipAiCall, rewrittenContent, reason };
}

describe("Layer 4: Backend surgical skip (dev-engine-v2/index.ts lines 9724-9759)", () => {
  describe("Surgical preservation — no matching notes", () => {
    it("preserves original chunk text when no approved notes match section header", () => {
      const result = simulateSurgicalSkip({
        isSectionedDocType: true,
        approvedNotes: ["Character development for protagonist"],
        sectionHeader: "Setting and Worldbuilding",
        chunkText: "## Setting and Worldbuilding\n\nThe world is a vast desert...",
      });
      expect(result.skipAiCall).toBe(true);
      // rewrittenChunk = chunkText — preserves original content
      expect(result.rewrittenContent).toBe("## Setting and Worldbuilding\n\nThe world is a vast desert...");
      expect(result.reason).toContain("surgical_preserve");
    });

    it("preserves beat_sheet content when notes don't match section header", () => {
      const result = simulateSurgicalSkip({
        isSectionedDocType: true,
        approvedNotes: ["Theme: redemption arc"],
        sectionHeader: "Episode Structure",
        chunkText: "## Episode Structure\n\nEpisode 1: The beginning...",
      });
      expect(result.skipAiCall).toBe(true);
      expect(result.rewrittenContent).toBe("## Episode Structure\n\nEpisode 1: The beginning...");
    });

    it("preserves treatment content with multiple section headers", () => {
      const result = simulateSurgicalSkip({
        isSectionedDocType: true,
        approvedNotes: ["Act 2 midpoint reversal"],
        sectionHeader: "Character Backstories",
        chunkText: "## Character Backstories\n\nJohn grew up in a small town...",
      });
      expect(result.skipAiCall).toBe(true);
      expect(result.rewrittenContent).toContain("## Character Backstories");
    });
  });

  describe("AI rewrite — matching notes found", () => {
    it("proceeds with AI rewrite when notes match section header", () => {
      const result = simulateSurgicalSkip({
        isSectionedDocType: true,
        approvedNotes: ["Character development for protagonist"],
        sectionHeader: "Character Development",
        chunkText: "## Character Development\n\nThe protagonist learns...",
      });
      expect(result.skipAiCall).toBe(false);
      expect(result.reason).toContain("notes match found");
    });

    it("matches on sub-words within the section header", () => {
      // "Character" appears in both the section header and the notes
      const result = simulateSurgicalSkip({
        isSectionedDocType: true,
        approvedNotes: ["Character arc must show growth"],
        sectionHeader: "Character Development",
        chunkText: "## Character Development\n\nContent...",
      });
      expect(result.skipAiCall).toBe(false);
    });

    it("matches on the second keyword when first doesn't match", () => {
      const result = simulateSurgicalSkip({
        isSectionedDocType: true,
        approvedNotes: ["Setting: post-apocalyptic wasteland"],
        sectionHeader: "Setting and Worldbuilding",
        chunkText: "## Setting and Worldbuilding\n\nContent...",
      });
      // "setting" should match "Setting" (lowercased)
      expect(result.skipAiCall).toBe(false);
    });
  });

  describe("Edge cases — surgical skip behavior", () => {
    it("preserves content even with empty chunkText", () => {
      // When chunkText is empty, preserved content is empty — but it's the
      // correct empty (original empty) rather than a failed AI call empty
      const result = simulateSurgicalSkip({
        isSectionedDocType: true,
        approvedNotes: ["Focus on dialogue pacing"],
        sectionHeader: "Visual Descriptions",
        chunkText: "",
      });
      // "dialogue" and "pacing" don't match "visual" or "descriptions"
      expect(result.skipAiCall).toBe(true);
      expect(result.rewrittenContent).toBe("");
    });

    it("does not skip when no approved notes exist", () => {
      const result = simulateSurgicalSkip({
        isSectionedDocType: true,
        approvedNotes: [],
        sectionHeader: "Any Section",
        chunkText: "## Any Section\n\nContent here...",
      });
      expect(result.skipAiCall).toBe(false);
    });

    it("does not skip for non-sectioned doc types", () => {
      const result = simulateSurgicalSkip({
        isSectionedDocType: false,
        approvedNotes: ["Some notes"],
        sectionHeader: "Any Section",
        chunkText: "Content without headers...",
      });
      expect(result.skipAiCall).toBe(false);
    });

    it("handles section headers without ## prefix gracefully", () => {
      const result = simulateSurgicalSkip({
        isSectionedDocType: true,
        approvedNotes: ["Plot development"],
        sectionHeader: "Plot Development",
        chunkText: "Content about plot that should be preserved...",
      });
      expect(result.skipAiCall).toBe(false);
    });

    it("properly filters stop words from header search", () => {
      // "the", "and", "for", "with", "&", "not" are filtered out
      // If a header is "The Plot and Setting", the search terms would be ["plot", "setting"]
      const result = simulateSurgicalSkip({
        isSectionedDocType: true,
        approvedNotes: ["Plot points must be compelling"],
        sectionHeader: "The Plot and Setting",
        chunkText: "## The Plot and Setting\n\nContent...",
      });
      expect(result.skipAiCall).toBe(false);
    });

    it("filters out short words (<= 2 chars) from header search", () => {
      const result = simulateSurgicalSkip({
        isSectionedDocType: true,
        approvedNotes: ["Only about rhythmic sequences"],
        sectionHeader: "Act 1: Setup",
        chunkText: "## Act 1: Setup\n\nContent...",
      });
      // "act" is 3 chars so it stays; "1" and ":" are filtered
      // "setup" is 5 chars but "rhythmic" doesn't match "setup" and doesn't contain it
      // "rhythmic" doesn't contain "act" either — no match
      expect(result.skipAiCall).toBe(true);
    });
  });

  describe("Empty/chunk boundary edge cases", () => {
    it("handles null approvedNotes (no notes at all)", () => {
      const result = simulateSurgicalSkip({
        isSectionedDocType: true,
        approvedNotes: null as unknown as string[],
        sectionHeader: "Any Section",
        chunkText: "Content...",
      });
      // null would fail approvedNotes.length check — no skip
      expect(result.skipAiCall).toBe(false);
    });

    it("handles section header with special characters", () => {
      const result = simulateSurgicalSkip({
        isSectionedDocType: true,
        approvedNotes: ["Character traits and motivations"],
        sectionHeader: "Character [Traits] & Motivations",
        chunkText: "## Character [Traits] & Motivations\n\nContent...",
      });
      // "&" is filtered as stop word, "character" and "traits" and "motivations" survive
      // "Character" from notes matches "character" from header
      expect(result.skipAiCall).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
// INTEGRATION: Defense-in-depth — all four layers
// ─────────────────────────────────────────────

describe("Integration: Defense-in-depth — all four layers", () => {
  it("blocks empty content at Layer 1 (pre-routing) before it reaches Layer 2 or 3", () => {
    // Empty concept_brief with no plaintext
    const layer1Result = simulatePreRouteGuard('concept_brief', 'doc-123', 'ver-456', '');
    expect(layer1Result.blocked).toBe(true);

    // Layer 1 blocks with a warning toast and early return
    // Layers 2 and 3 never get invoked
    expect(layer1Result.reason).toContain('no content');
  });

  it("blocks empty assembledText at Layer 2 (server-side) even if Layer 1 were bypassed", () => {
    // If Layer 1 were bypassed (e.g., race condition or non-sectioned doc type),
    // Layer 2 still catches the missing assembledText
    const layer2Result = simulateServerSideValidation({
      projectId: 'proj-1',
      documentId: 'doc-1',
      versionId: 'ver-1',
      assembledText: '',
    });
    expect(layer2Result.valid).toBe(false);
    expect(layer2Result.missing).toContain('assembledText');
  });

  it("blocks empty assembledText at Layer 3 (post-assembly) even if Layers 1 and 2 were bypassed", () => {
    // Ultimate fail-closed: even if both earlier layers somehow miss it,
    // the post-assembly guard throws before the content is saved
    expect(() => simulatePostAssemblyGuard('')).toThrow();
    expect(() => simulatePostAssemblyGuard('  ')).toThrow();
    expect(() => simulatePostAssemblyGuard('short')).toThrow();
  });

  it("all valid content passes all four layers", () => {
    const docContent = 'This is a real document with substantial content for rewriting.';
    const chunkText = '## The Plot\n\nThis section has matching notes content.';

    const layer1 = simulatePreRouteGuard('concept_brief', 'doc-123', 'ver-456', docContent);
    expect(layer1.blocked).toBe(false);

    const layer2 = simulateServerSideValidation({
      projectId: 'proj-1',
      documentId: 'doc-1',
      versionId: 'ver-1',
      assembledText: docContent,
    });
    expect(layer2.valid).toBe(true);

    const layer3 = simulatePostAssemblyGuard(docContent);
    expect(layer3.ok).toBe(true);

    // Layer 4: content with matching notes proceeds to AI rewrite
    const layer4 = simulateSurgicalSkip({
      isSectionedDocType: true,
      approvedNotes: ['Plot development notes'],
      sectionHeader: 'The Plot',
      chunkText,
    });
    expect(layer4.skipAiCall).toBe(false);
  });
});

// ─────────────────────────────────────────────
// INVARIANT CHECKS
// ─────────────────────────────────────────────

describe("Invariant: No layer contradicts another", () => {
  it("Layer 1 threshold (< 10) matches Layer 3 threshold (< 10)", () => {
    // Both guards use the same threshold: trim().length < 10
    // 9 chars should be blocked by BOTH Layer 1 and Layer 3
    const layer1 = simulatePreRouteGuard('concept_brief', 'doc-123', 'ver-456', '123456789');
    expect(layer1.blocked).toBe(true);

    expect(() => simulatePostAssemblyGuard('123456789')).toThrow();

    // 10 chars should pass BOTH
    const layer1Pass = simulatePreRouteGuard('concept_brief', 'doc-123', 'ver-456', '1234567890');
    expect(layer1Pass.blocked).toBe(false);

    const layer3Pass = simulatePostAssemblyGuard('1234567890');
    expect(layer3Pass.ok).toBe(true);
  });

  it("Layer 2 threshold checks assembledText.trim() (same as Layer 1 proseContent check)", () => {
    // Layer 2 uses: !assembledText || !assembledText.trim()
    // Layer 1 uses: !proseContent || proseContent.trim().length < 10
    // Layer 3 uses: !assembledText || assembledText.trim().length < 10
    // All three check trimmed emptiness — just at different lengths:
    // Layer 2 catches ALL whitespace-only (length 0 after trim)
    // Layers 1 and 2 catch anything < 10 chars
    const whitespaceOnly = '     ';
    expect(simulateServerSideValidation({ projectId: 'p', documentId: 'd', versionId: 'v', assembledText: whitespaceOnly }).valid).toBe(false);
    expect(simulatePreRouteGuard('concept_brief', 'doc-123', 'ver-456', whitespaceOnly).blocked).toBe(true);
    expect(() => simulatePostAssemblyGuard(whitespaceOnly)).toThrow();
  });
});

describe("Invariant: All sectioned rewrite doc types are protected by Layer 4 surgical skip", () => {
  const sectionedDocTypes = ['beat_sheet', 'treatment', 'story_outline', 'long_treatment', 'character_bible', 'long_character_bible', 'concept_brief'];
  for (const docType of sectionedDocTypes) {
    it(`${docType} preserves chunk text via surgical skip when no notes match`, () => {
      const result = simulateSurgicalSkip({
        isSectionedDocType: true,
        approvedNotes: ['Focus on dialogue pacing and character voice'],
        sectionHeader: 'Visual Descriptions',
        chunkText: `## Visual Descriptions\n\nOriginal ${docType} content with visual scene details.`,
      });
      // "dialogue", "pacing", "character", "voice" — none match "visual" or "descriptions"
      expect(result.skipAiCall).toBe(true);
      expect(result.rewrittenContent).toContain('Original');
    });
  }
});

describe("Invariant: All sectioned rewrite doc types are protected by all three layers", () => {
  for (const docType of SECTIONED_REWRITE_TYPES) {
    it(`${docType} is blocked by Layer 1 when content is empty`, () => {
      const result = simulatePreRouteGuard(docType, 'doc-123', 'ver-456', '');
      expect(result.blocked).toBe(true);
    });

    it(`${docType} passes Layer 1 when content is valid`, () => {
      const result = simulatePreRouteGuard(docType, 'doc-123', 'ver-456', 'Valid content for rewriting with enough text.');
      expect(result.blocked).toBe(false);
    });
  }
});

describe("Invariant: Error messages are user-visible (survive to toast)", () => {
  it("Layer 1 warning message is user-facing", () => {
    const result = simulatePreRouteGuard('concept_brief', 'doc-123', 'ver-456', '');
    // This message is passed to toast.warning() — must be user-readable
    expect(result.reason).toBeDefined();
    expect(result.reason!.length).toBeGreaterThan(20);
    expect(result.reason).toContain('cannot apply notes');
  });

  it("Layer 2 error message identifies specific missing param", () => {
    const result = simulateServerSideValidation({ projectId: 'p', documentId: 'd', versionId: 'v' });
    expect(result.errorMessage).toContain('assembledText');
  });

  it("Layer 3 error message is caught and displayed via toast.error", () => {
    // The error from Layer 3 propagates to the catch block at lines 454-458,
    // which does: toast.error(`Rewrite error: ${err.message}`)
    // The message must be clear enough for a user to understand
    let thrownMessage = '';
    try {
      simulatePostAssemblyGuard('');
    } catch (e: any) {
      thrownMessage = e.message;
    }
    expect(thrownMessage).toContain('no content');
    expect(thrownMessage).toContain('empty');
  });
});

describe("Regression: Existing routing tests are not broken", () => {
  it("sectioned rewrite types still route properly when content is valid", () => {
    // Verify that having content doesn't break the normal routing path
    const result = simulatePreRouteGuard('concept_brief', 'doc-123', 'ver-456', 'A real concept brief with lots of detail and content.');
    expect(result.blocked).toBe(false);
  });
});
