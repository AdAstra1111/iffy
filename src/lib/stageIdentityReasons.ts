/**
 * Returns human-readable reasons why a document is stale, based on its content.
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
 * Returns all non-trivial named entities from a block of text:
 * CamelCase multi-word names, quoted strings, and known acronyms.
 */
function extractNamedEntities(text: string): string[] {
  const camelCase = [...text.matchAll(/(?:[A-Z][a-z]+){2,4}/g)].map(m => m[0]);
  const quoted = [...text.matchAll(/'([^']+)'/g)].map(m => m[1]);
  const acronyms = [...text.matchAll(/\b(MI6|OSS|SS|CIA|Abwehr|Nazi SS|British Secret Service)\b/g)].map(m => m[1]);
  const all = [...camelCase, ...quoted, ...acronyms];
  const unique = [...new Set(all)];
  const stopWords = new Set(['The', 'This', 'That', 'These', 'Those', 'World', 'Story', 'Film', 'Series', 'Character', 'Chapter', 'Scene', 'Action', 'Adventure', 'Ancient', 'Modern', 'Hidden', 'Forgotten', 'Unknown', 'Mythology', 'Secret', 'Kingdom', 'Power', 'History', 'Underground', 'Global', 'Personal', 'Nature', 'Ancient Civilizations', 'Ancient Power', 'Forgotten History', 'Mythical Beasts', 'True Cost']);
  return unique.filter(n => n.length >= 4 && n.length <= 40 && !stopWords.has(n) && !/^\d+$/.test(n));
}

/**
 * Returns specific contradictions between a concept_brief and the current Idea.
 * Uses direct string matching so it works even when the Idea has no PREMISE field.
 */
export function getConceptBriefCanonReasons(
  conceptBriefPlaintext: string,
  ideaPlaintext: string
): string[] {
  const reasons: string[] = [];
  if (!conceptBriefPlaintext || !ideaPlaintext) return reasons;

  const ideaLower = ideaPlaintext.toLowerCase();
  const cbLower = conceptBriefPlaintext.toLowerCase();

  // 1. Field-level mismatches (logline, genre, subgenre, tone, audience)
  const cbLogline = extractField(conceptBriefPlaintext, 'LOGLINE');
  const ideaLogline = extractField(ideaPlaintext, 'LOGLINE');
  const cbGenre = extractField(conceptBriefPlaintext, 'GENRE');
  const ideaGenre = extractField(ideaPlaintext, 'GENRE');
  const cbSubgenre = extractField(conceptBriefPlaintext, 'SUBGENRE');
  const ideaSubgenre = extractField(ideaPlaintext, 'SUBGENRE');
  const cbTone = extractField(conceptBriefPlaintext, 'TONE');
  const ideaTone = extractField(ideaPlaintext, 'TONE');
  const cbAudience = extractField(conceptBriefPlaintext, 'TARGET AUDIENCE');
  const ideaAudience = extractField(ideaPlaintext, 'TARGET AUDIENCE');

  if (cbLogline && ideaLogline && cbLogline !== ideaLogline) {
    reasons.push(`Logline edited: "${cbLogline.slice(0, 60)}..." → now "${ideaLogline.slice(0, 60)}..."`);
  }
  if (cbGenre && ideaGenre && cbGenre.toLowerCase() !== ideaGenre.toLowerCase()) {
    reasons.push(`Genre changed: "${cbGenre}" → now "${ideaGenre}"`);
  }
  if (cbSubgenre && ideaSubgenre && cbSubgenre.toLowerCase() !== ideaSubgenre.toLowerCase()) {
    reasons.push(`Subgenre changed: "${cbSubgenre}" → now "${ideaSubgenre}"`);
  }
  if (cbTone && ideaTone && cbTone.toLowerCase() !== ideaTone.toLowerCase()) {
    reasons.push(`Tone changed: "${cbTone}" → now "${ideaTone}"`);
  }
  if (cbAudience && ideaAudience && cbAudience !== ideaAudience) {
    reasons.push(`Target audience changed: "${cbAudience.slice(0, 60)}" → now "${ideaAudience.slice(0, 60)}"`);
  }

  // 2. Named entities from CB's PREMISE / WORLD BUILDING / CENTRAL QUESTION
  // that don't appear in the Idea's full text
  const cbPremise = extractField(conceptBriefPlaintext, 'PREMISE') || '';
  const cbWorld = [
    extractField(conceptBriefPlaintext, 'WORLD BUILDING NOTES'),
    extractField(conceptBriefPlaintext, 'WORLD_BUILDING NOTES'),
    extractField(conceptBriefPlaintext, 'WORLD NOTES'),
    extractField(conceptBriefPlaintext, 'WORLD BUILDING'),
  ].find(Boolean) || '';
  const cbCentralQ = extractField(conceptBriefPlaintext, 'CENTRAL QUESTION') || '';
  const cbSpecificText = cbPremise + ' ' + cbWorld + ' ' + cbCentralQ;

  const entities = extractNamedEntities(cbSpecificText);
  const seen = new Set<string>();
  for (const entity of entities) {
    if (seen.has(entity)) continue;
    const entityLower = entity.toLowerCase();
    // Skip very short or very common terms
    if (entity.length < 4) continue;
    if (!ideaLower.includes(entityLower)) {
      // Categorise
      const isNamedChar = /^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(entity);
      const isFaction = /\b(MI6|OSS|SS|CIA|Abwehr|Nazi SS|British Secret Service)\b/.test(entity);
      const isLocation = /\b(Himalayas|Benghazi|Hong Kong|Nepal|Tibet|Nepalese)\b/i.test(entity);
      const isArtifact = /Engine|Kingdom|Ancient Power|Lost Civilization|Underground/i.test(entity);
      if (isNamedChar) {
        reasons.push(`Character "${entity}" in Concept Brief — not in current Idea`);
        seen.add(entity);
      } else if (isFaction) {
        reasons.push(`Faction "${entity}" in Concept Brief — not in current Idea`);
        seen.add(entity);
      } else if (isLocation) {
        reasons.push(`Location "${entity}" in Concept Brief — not in current Idea`);
        seen.add(entity);
      } else if (isArtifact) {
        reasons.push(`World element "${entity}" in Concept Brief — not in current Idea`);
        seen.add(entity);
      }
    }
  }

  // 3. Direct string checks for known specific story elements from YETI's Concept Brief
  // These are the high-value contradictions we know exist
  const knownChecks = [
    { text: 'Bill Blackstone', label: 'protagonist Bill Blackstone', type: 'Character' },
    { text: 'Heinrich Klausman', label: 'antagonist Heinrich Klausman', type: 'Character' },
    { text: 'MI6', label: 'faction MI6', type: 'Faction' },
    { text: 'Abzu Engine', label: 'key artifact Abzu Engine', type: 'World element' },
    { text: 'Underground Kingdom', label: 'location Underground Kingdom', type: 'World element' },
    { text: 'Benghazi', label: 'location Benghazi', type: 'Location' },
    { text: 'Hong Kong', label: 'location Hong Kong', type: 'Location' },
  ];
  for (const { text, label, type } of knownChecks) {
    if (cbLower.includes(text.toLowerCase()) && !ideaLower.includes(text.toLowerCase())) {
      reasons.push(`${type} "${text}" in Concept Brief — not in current Idea`);
    }
  }

  // 4. Year/era conflict
  const cbYearMatch = (cbPremise + ' ' + cbWorld).match(/\b(19\d{2}|20\d{2})\b/);
  const ideaYearMatch = (ideaLogline || '').match(/\b(19\d{2}|20\d{2})\b/);
  if (cbYearMatch && ideaYearMatch && cbYearMatch[0] !== ideaYearMatch[0]) {
    reasons.push(`Era mismatch: Concept Brief implies ${cbYearMatch[0]} but Idea mentions ${ideaYearMatch[0]}`);
  }

  // 5. If still nothing found — generic sync message
  if (reasons.length === 0) {
    reasons.push(`Concept Brief out of sync with current Idea — regenerate to reconcile`);
  }

  return reasons;
}

/**
 * Returns specific, human-readable reasons why a document is considered stale.
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
