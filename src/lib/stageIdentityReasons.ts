/**
 * Returns human-readable reasons why a document is stale, based on its content.
 * Mirrors the logic in supabase/functions/_shared/stageIdentityContracts.ts
 */

const IDEA_MAX_CHARS = 4000;
const IDEA_MAX_WORDS = 600;
const IDEA_MAX_SECTIONS = 6;

function countSections(plaintext: string): number {
  const headingMatches = plaintext.match(/^#{1,6}\s+.+$/gm);
  if (headingMatches && headingMatches.length >= 3) return headingMatches.length;
  return plaintext.split(/\n\s*\n/).filter(b => b.trim().length > 0).length;
}

function getIdeaStaleReasons(plaintext: string): string[] {
  const reasons: string[] = [];
  if (!plaintext) return reasons;
  const charCount = plaintext.length;
  const wordCount = plaintext.trim().split(/\s+/).filter(Boolean).length;
  const sectionCount = countSections(plaintext);
  if (charCount > IDEA_MAX_CHARS) reasons.push(`Char count ${charCount.toLocaleString()} exceeds idea max ${IDEA_MAX_CHARS.toLocaleString()}`);
  if (wordCount > IDEA_MAX_WORDS) reasons.push(`Word count ${wordCount.toLocaleString()} exceeds idea max ${IDEA_MAX_WORDS.toLocaleString()}`);
  if (sectionCount > IDEA_MAX_SECTIONS) reasons.push(`Section count ${sectionCount} exceeds idea max ${IDEA_MAX_SECTIONS}`);
  const screenplayIndicators = [
    { pattern: /^((INT|EXT|EST|INT\.\/EXT)\.?\s)/im, label: "Scene headings (INT./EXT.)" },
    { pattern: /\b(V\.O\.|O\.S\.|VO|OS)\b/, label: "V.O./O.S. annotations" },
    { pattern: /\([a-z]+\s+CONT'D\)/i, label: "CONT'D dialogue markers" },
    { pattern: /^\s{20,}/m, label: "Parenthetical directions" },
    { pattern: /\bCUT TO:|\bFADE IN:|\bFADE OUT:|\bDISSOLVE TO:/i, label: "Screenplay format cues" },
  ];
  for (const { pattern, label } of screenplayIndicators) {
    if (pattern.test(plaintext)) reasons.push(`Contains ${label}`);
  }
  return reasons;
}

/**
 * Extract key fields from a concept_brief plaintext.
 */
interface ConceptBriefFields {
  title: string | null;
  logline: string | null;
  comparables: string | null;
  genre: string | null;
  premise: string | null;
}

function extractConceptBriefFields(text: string): ConceptBriefFields {
  // Plain "FIELD\nvalue" format (possibly multi-line, until blank line or next uppercase field)
  const titleMatch = text.match(/^TITLE\n([^\n].*?)(?=\n\n|\n[A-Z]{2,}|\n#|$)/m);
  const loglineMatch = text.match(/^LOGLINE\n([^\n].*?)(?=\n\n|\n[A-Z]{2,}|\n#|$)/m);
  const comparablesMatch = text.match(/^COMPARABLES?\n([^\n].*?)(?=\n\n|\n[A-Z]{2,}|\n#|$)/m);
  const genreMatch = text.match(/^GENRE\n([^\n].*?)(?=\n\n|\n[A-Z]{2,}|\n#|$)/m);
  const premiseMatch = text.match(/^PREMISE\n([^\n].*?)(?=\n\n|\n[A-Z]{2,}|\n#|$)/m);
  return {
    title: titleMatch ? titleMatch[1].trim() : null,
    logline: loglineMatch ? loglineMatch[1].trim() : null,
    comparables: comparablesMatch ? comparablesMatch[1].trim() : null,
    genre: genreMatch ? genreMatch[1].trim() : null,
    premise: premiseMatch ? premiseMatch[1].trim().slice(0, 200) : null,
  };
}

/**
 * Extract key fields from an Idea plaintext.
 */
interface IdeaFields {
  title: string | null;
  logline: string | null;
  comparables: string | null;
  genre: string | null;
}

function extractIdeaFields(text: string): IdeaFields {
  // Plain "FIELD\nvalue" format (possibly multi-line, until blank line or next uppercase field)
  const titleMatch = text.match(/^TITLE\n([^\n].*?)(?=\n\n|\n[A-Z]{2,}|\n#|$)/m);
  const loglineMatch = text.match(/^LOGLINE\n([^\n].*?)(?=\n\n|\n[A-Z]{2,}|\n#|$)/m);
  const comparablesMatch = text.match(/^COMPARABLES?\n([^\n].*?)(?=\n\n|\n[A-Z]{2,}|\n#|$)/m);
  const genreMatch = text.match(/^GENRE\n([^\n].*?)(?=\n\n|\n[A-Z]{2,}|\n#|$)/m);
  return {
    title: titleMatch ? titleMatch[1].trim() : null,
    logline: loglineMatch ? loglineMatch[1].trim() : null,
    comparables: comparablesMatch ? comparablesMatch[1].trim() : null,
    genre: genreMatch ? genreMatch[1].trim() : null,
  };
}

/**
 * Compare concept_brief against the current Idea canon and return specific contradictions.
 * Called by ProjectDevelopmentEngine with ideaFields fetched separately.
 */
export function getConceptBriefCanonReasons(
  conceptBriefPlaintext: string,
  ideaFields: IdeaFields
): string[] {
  const reasons: string[] = [];
  if (!conceptBriefPlaintext || !ideaFields) return reasons;

  const cb = extractConceptBriefFields(conceptBriefPlaintext);

  if (cb.title && ideaFields.title && cb.title !== ideaFields.title) {
    reasons.push(`Title mismatch: concept brief has "${cb.title.slice(0, 60)}" but Idea now says "${ideaFields.title.slice(0, 60)}"`);
  }
  if (cb.logline && ideaFields.logline && cb.logline !== ideaFields.logline) {
    reasons.push(`Logline mismatch: concept brief has "${cb.logline.slice(0, 80)}" but Idea logline is different`);
  }
  if (cb.genre && ideaFields.genre && cb.genre !== ideaFields.genre) {
    reasons.push(`Genre mismatch: concept brief has "${cb.genre}" but Idea now says "${ideaFields.genre}"`);
  }
  if (cb.comparables && ideaFields.comparables && cb.comparables !== ideaFields.comparables) {
    reasons.push(`Comparables mismatch: concept brief has "${cb.comparables.slice(0, 60)}" but Idea comparables have changed`);
  }

  if (reasons.length === 0) {
    reasons.push(`Concept Brief is out of sync with current Idea (resolver hash changed)`);
  }

  return reasons;
}

/**
 * Returns specific, human-readable reasons why a document is considered stale.
 * Returns empty array if the doc is not stale or reasons cannot be determined.
 */
export function getStaleReasons(docType: string, plaintext: string | null | undefined): string[] {
  if (!plaintext) return [];
  switch (docType) {
    case 'idea':
      return getIdeaStaleReasons(plaintext);
    default:
      return [];
  }
}
