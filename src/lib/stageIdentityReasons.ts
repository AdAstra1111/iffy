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

const FACTOR_TERMS = new Set(['Nazi SS', 'Nazi', 'SS', 'MI6', 'OSS', 'CIA', 'Abwehr', 'British Secret Service']);

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
  const stopWords = new Set(['The', 'This', 'That', 'These', 'Those', 'World', 'Story', 'Film', 'Series', 'Character', 'Chapter', 'Scene', 'Action', 'Adventure', 'Ancient', 'Modern', 'Hidden', 'Forgotten', 'Unknown', 'Mythology', 'Secret', 'Power', 'History', 'Global', 'Personal', 'Nature', 'Ancient Civilizations', 'Ancient Power', 'Forgotten History', 'Mythical Beasts', 'True Cost', 'Ancient Civilization', 'Technologically Advanced', 'Advanced Ancient', 'Hidden Advanced', 'Primeval Creature', 'Ancient Mystery', 'Mythical Beast', 'Desperate Fight', 'Profound Personal', 'Cynical Government', 'Conspiracy Far', 'Treasonous', 'Ancient Power', 'Monstrous Power', 'Nazis From', 'Diverse Team', 'German Forces', 'Government Cover']);
  // Factions to exclude from Character bucket
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
    if (entity.length < 4) continue;
    if (!ideaLower.includes(entityLower)) {
      const isFaction = FACTOR_TERMS.has(entity);
      const isLocation = /\b(Himalayas|Benghazi|Hong Kong|Nepal|Tibet|Nepalese)\b/i.test(entity);
      const isArtifact = /Engine|Kingdom|Lost Civilization/i.test(entity);
      const isNamedChar = /^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(entity) && !isFaction && !isArtifact && !isLocation;
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
    if (seen.has(text)) continue; // skip already found by entity extraction
    if (cbLower.includes(text.toLowerCase()) && !ideaLower.includes(text.toLowerCase())) {
      reasons.push(`${type} "${text}" in Concept Brief — not in current Idea`);
      seen.add(text);
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
 * Universal stale reason detection for any foundation doc type.
 * Compares named entities in the stale doc against its current parent doc(s).
 *
 * parentPlaintexts: map of doc_type -> current plaintext
 *   e.g. { idea: '...', concept_brief: '...' }
 *
 * Dependency map:
 *   concept_brief   → idea
 *   beat_sheet      → concept_brief
 *   treatment       → concept_brief
 *   character_bible → concept_brief + idea
 *   long_synopsis   → idea
 */
export function getStaleDocReasons(
  docType: string,
  stalePlaintext: string,
  parentPlaintexts: Record<string, string>,
): string[] {
  if (!stalePlaintext) return [];

  switch (docType) {
    case 'concept_brief': {
      const ideaText = parentPlaintexts['idea'] || '';
      if (!ideaText) return [`Concept Brief out of sync — current Idea not loaded`];
      return getConceptBriefCanonReasons(stalePlaintext, ideaText);
    }

    case 'beat_sheet':
    case 'treatment': {
      const cbText = parentPlaintexts['concept_brief'] || '';
      if (!cbText) return [`${docType.replace('_', ' ')} out of sync — current Concept Brief not loaded`];
      return getUpstreamEntityReasons(stalePlaintext, cbText, 'Concept Brief');
    }

    case 'character_bible': {
      const cbText = parentPlaintexts['concept_brief'] || '';
      const ideaText = parentPlaintexts['idea'] || '';
      const parentText = cbText || ideaText;
      const parentLabel = cbText ? 'Concept Brief' : 'Idea';
      if (!parentText) return [`Character Bible out of sync — parent docs not loaded`];
      return getUpstreamEntityReasons(stalePlaintext, parentText, parentLabel);
    }

    case 'long_synopsis': {
      const ideaText = parentPlaintexts['idea'] || '';
      if (!ideaText) return [`Long Synopsis out of sync — current Idea not loaded`];
      return getUpstreamEntityReasons(stalePlaintext, ideaText, 'Idea');
    }

    case 'idea':
      return getIdeaStaleReasons(stalePlaintext);

    default:
      return [];
  }
}

/**
 * Finds named entities in a stale doc that are NOT present in the parent doc.
 * Used for beat_sheet, treatment, character_bible, long_synopsis.
 */
function getUpstreamEntityReasons(
  stalePlaintext: string,
  parentPlaintext: string,
  parentLabel: string,
): string[] {
  const reasons: string[] = [];
  const parentLower = parentPlaintext.toLowerCase();
  const staleEntities = extractNamedEntities(stalePlaintext);
  const seen = new Set<string>();

  for (const entity of staleEntities) {
    if (seen.has(entity)) continue;
    if (entity.length < 4) continue;
    const entityLower = entity.toLowerCase();
    // Entity is in stale doc but NOT in parent — it was in an older version of parent
    if (!parentLower.includes(entityLower)) {
      const isFaction = FACTOR_TERMS.has(entity);
      const isLocation = /\b(Himalayas|Benghazi|Hong Kong|Nepal|Tibet|Nepalese|Berlin|London|Cairo)\b/i.test(entity);
      const isArtifact = /Engine|Kingdom|Lost Civilization|Device|Weapon/i.test(entity);
      const isNamedChar = /^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(entity) && !isFaction && !isArtifact && !isLocation;
      if (isNamedChar) {
        reasons.push(`Character "${entity}" referenced — not in current ${parentLabel}`);
        seen.add(entity);
      } else if (isFaction) {
        reasons.push(`Faction "${entity}" referenced — not in current ${parentLabel}`);
        seen.add(entity);
      } else if (isLocation) {
        reasons.push(`Location "${entity}" referenced — not in current ${parentLabel}`);
        seen.add(entity);
      } else if (isArtifact) {
        reasons.push(`World element "${entity}" referenced — not in current ${parentLabel}`);
        seen.add(entity);
      }
    }
  }

  if (reasons.length === 0) {
    reasons.push(`${parentLabel.replace('_', ' ')} out of sync — regenerate to reconcile`);
  }

  return reasons;
}

/**
 * Returns specific, human-readable reasons why a document is considered stale.
 * Legacy entry point — use getStaleDocReasons() for full universal detection.
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
