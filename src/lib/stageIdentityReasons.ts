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

// ---------------------------------------------------------------------------
// Concept Brief canon comparison
// ---------------------------------------------------------------------------

function extractField(text: string, fieldName: string): string | null {
  const match = text.match(new RegExp(`^${fieldName}\\n([^\\n].*?)(?=\\n\\n|\\n[A-Z]{2,}|\\n#|$)`, 'm'));
  return match ? match[1].trim() : null;
}

/**
 * Extract ALL proper nouns / named entities from a block of text.
 * More robust than targeted regex for specific roles.
 */
function extractAllNamedEntities(text: string): string[] {
  // CamelCase multi-word names: "Bill Blackstone", "Heinrich Klausman"
  const camelCase = [...text.matchAll(/(?:[A-Z][a-z]+){2,4}/g)].map(m => m[0]);
  // Quoted names: 'Abzu Engine'
  const quoted = [...text.matchAll(/'([^']+)'/g)].map(m => m[1]);
  // All caps acronyms: MI6, OSS, SS, CIA
  const acronyms = [...text.matchAll(/\b(MI6|OSS|SS|CIA|Abwehr|Nazi SS|British Secret Service)\b/g)].map(m => m[1]);
  // Combine and deduplicate
  const all = [...camelCase, ...quoted, ...acronyms];
  const unique = [...new Set(all)];
  // Filter obvious false positives (short words, common terms)
  const stopWords = new Set(['The', 'This', 'That', 'These', 'Those', 'World', 'Story', 'Film', 'Series', 'Character', 'Chapter', 'Scene', 'Action', 'Adventure', 'Ancient', 'Modern', 'Hidden', 'Unknown', 'Forgotten', 'Unknown', 'Mythology', 'Secret', 'Kingdom', 'Power', 'History']);
  return unique.filter(n => n.length >= 3 && !stopWords.has(n) && !/^\d+$/.test(n));
}

/**
 * Check named entities in the concept brief that don't appear in the Idea text.
 */
function findMissingEntities(cbText: string, ideaText: string): string[] {
  const entities = extractAllNamedEntities(cbText);
  const missing: string[] = [];
  const ideaLower = ideaText.toLowerCase();
  for (const entity of entities) {
    if (!ideaLower.includes(entity.toLowerCase())) {
      missing.push(entity);
    }
  }
  return missing;
}

/**
 * Compare a Concept Brief plaintext against the current Idea plaintext and
 * return granular, specific contradictions.
 */
export function getConceptBriefCanonReasons(
  conceptBriefPlaintext: string,
  ideaPlaintext: string
): string[] {
  const reasons: string[] = [];
  if (!conceptBriefPlaintext || !ideaPlaintext) return reasons;

  // 1. Field-level mismatches
  const cbLogline = extractField(conceptBriefPlaintext, 'LOGLINE');
  const cbGenre = extractField(conceptBriefPlaintext, 'GENRE');
  const cbSubgenre = extractField(conceptBriefPlaintext, 'SUBGENRE');
  const cbTone = extractField(conceptBriefPlaintext, 'TONE');
  const cbAudience = extractField(conceptBriefPlaintext, 'TARGET AUDIENCE');
  const cbTitle = extractField(conceptBriefPlaintext, 'TITLE');

  const ideaLogline = extractField(ideaPlaintext, 'LOGLINE');
  const ideaGenre = extractField(ideaPlaintext, 'GENRE');
  const ideaSubgenre = extractField(ideaPlaintext, 'SUBGENRE');
  const ideaTone = extractField(ideaPlaintext, 'TONE');
  const ideaAudience = extractField(ideaPlaintext, 'TARGET AUDIENCE');

  if (cbLogline && ideaLogline && cbLogline !== ideaLogline) {
    reasons.push(`Logline has been edited: now reads "${ideaLogline.slice(0, 80)}..." (Concept Brief has "${cbLogline.slice(0, 80)}...")`);
  }
  if (cbGenre && ideaGenre && cbGenre.toLowerCase() !== ideaGenre.toLowerCase()) {
    reasons.push(`Genre changed: Concept Brief had "${cbGenre}" → Idea now says "${ideaGenre}"`);
  }
  if (cbSubgenre && ideaSubgenre && cbSubgenre.toLowerCase() !== ideaSubgenre.toLowerCase()) {
    reasons.push(`Subgenre changed: Concept Brief had "${cbSubgenre}" → Idea now says "${ideaSubgenre}"`);
  }
  if (cbTone && ideaTone && cbTone !== ideaTone) {
    reasons.push(`Tone changed: Concept Brief had "${cbTone}" → Idea now says "${ideaTone}"`);
  }
  if (cbAudience && ideaAudience && cbAudience !== ideaAudience) {
    reasons.push(`Target audience changed: Concept Brief had "${cbAudience.slice(0, 60)}" → Idea now says "${ideaAudience.slice(0, 60)}"`);
  }

  // 2. Named-entity cross-check: entities in Concept Brief PREMISE/WORLD_BUILDING that aren't in Idea
  // Extract named entities from Concept Brief's own text
  const cbPremise = extractField(conceptBriefPlaintext, 'PREMISE') || '';
  const cbWorldBuilding = [
    extractField(conceptBriefPlaintext, 'WORLD BUILDING NOTES'),
    extractField(conceptBriefPlaintext, 'WORLD_BUILDING NOTES'),
    extractField(conceptBriefPlaintext, 'WORLD NOTES'),
    extractField(conceptBriefPlaintext, 'WORLD BUILDING'),
  ].find(Boolean) || '';

  // Use the Idea's LOGLINE (or full text) as the reference — the Idea may not have a PREMISE
  const ideaReferenceText = extractField(ideaPlaintext, 'LOGLINE') || ideaPlaintext;
  const ideaReferenceLower = ideaReferenceText.toLowerCase();

  // Extract entities from the CB's own sections and check each against the Idea's text
  const cbSpecificText = cbPremise + ' ' + cbWorldBuilding;
  const missing = findMissingEntities(cbSpecificText, ideaPlaintext);

  if (missing.length > 0) {
    // Categorize by entity type
    const namedChars = missing.filter(e => /^[A-Z][a-z]+\s+[A-Z]/.test(e)); // "Bill Blackstone"
    const factions = missing.filter(e => /\b(MI6|OSS|SS|CIA|Abwehr|Nazi SS|British Secret Service)\b/.test(e));
    const artifacts = missing.filter(e => /Engine|Kingdom|Power|Ancient|Lost/.test(e) && e.length < 30);

    for (const char of namedChars.slice(0, 3)) {
      reasons.push(`Character "${char}" appears in Concept Brief but not in current Idea`);
    }
    for (const fac of factions.slice(0, 2)) {
      reasons.push(`Faction "${fac}" mentioned in Concept Brief but not in current Idea`);
    }
    for (const art of artifacts.slice(0, 2)) {
      reasons.push(`World element "${art}" in Concept Brief doesn't appear in current Idea`);
    }
  }

  // 3. Temporal / era mismatches
  const cbPremiseYear = cbPremise.match(/\b(19\d{2}|20\d{2})\b/);
  const ideaYear = (ideaLogline || '').match(/\b(19\d{2}|20\d{2})\b/);
  if (cbPremiseYear && ideaYear && cbPremiseYear[0] !== ideaYear[0]) {
    reasons.push(`Time period conflict: Concept Brief references ${cbPremiseYear[0]} but Idea logline mentions ${ideaYear[0]}`);
  }

  // 4. Premise summary line vs Idea logline (key plot facts)
  if (cbPremise) {
    // Check if the core plot mechanism is preserved
    const cbActions = [
      { pattern: /Bill Blackstone/i, label: 'protagonist Bill Blackstone' },
      { pattern: /Heinrich Klausman/i, label: 'antagonist Heinrich Klausman' },
      { pattern: /MI6/i, label: 'MI6 involvement' },
      { pattern: /Abzu Engine/i, label: 'Abzu Engine' },
      { pattern: /Underground Kingdom/i, label: 'Underground Kingdom' },
      { pattern: /Benghazi|Hong Kong/i, label: 'specific location (Benghazi/Hong Kong)' },
    ];
    for (const { pattern, label } of cbActions) {
      if (pattern.test(cbPremise) && !pattern.test(ideaPlaintext)) {
        reasons.push(`Plot element "${label}" in Concept Brief is missing from current Idea`);
      }
    }
  }

  // 5. If still nothing found — generic sync message
  if (reasons.length === 0) {
    reasons.push(`Concept Brief may be out of sync: resolver hash changed but no surface contradictions detected — regenerate to reconcile`);
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
