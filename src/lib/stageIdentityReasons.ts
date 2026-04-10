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
/**
 * Compare Concept Brief against the current Idea.
 *
 * CORRECT DIRECTION: The CB is intentionally an EXPANSION of the Idea.
 * CB is ALLOWED to have more characters, more world detail, more plot.
 * Only flag where the Idea's CORE IDENTITY changed in a way the CB doesn't reflect:
 *   - Logline changed
 *   - Genre changed
 *   - Subgenre changed
 *   - Tone changed
 *   - Target audience changed
 *   - Year/era conflict in core fields
 *
 * Do NOT flag entities in CB that aren't in the Idea — that's expected expansion.
 */
export function getConceptBriefCanonReasons(
  conceptBriefPlaintext: string,
  ideaPlaintext: string
): string[] {
  const reasons: string[] = [];
  if (!conceptBriefPlaintext || !ideaPlaintext) return reasons;

  // Field-level mismatches only — CB expanding beyond Idea is not a contradiction
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
    reasons.push(`Logline: CB has “${cbLogline.slice(0, 80)}” → Idea now reads “${ideaLogline.slice(0, 80)}”`);
  }
  if (cbGenre && ideaGenre && cbGenre.toLowerCase() !== ideaGenre.toLowerCase()) {
    reasons.push(`Genre: was “${cbGenre}” → now “${ideaGenre}”`);
  }
  if (cbSubgenre && ideaSubgenre && cbSubgenre.toLowerCase() !== ideaSubgenre.toLowerCase()) {
    reasons.push(`Subgenre: was “${cbSubgenre}” → now “${ideaSubgenre}”`);
  }
  if (cbTone && ideaTone && cbTone.toLowerCase() !== ideaTone.toLowerCase()) {
    reasons.push(`Tone: was “${cbTone}” → now “${ideaTone}”`);
  }
  if (cbAudience && ideaAudience && cbAudience !== ideaAudience) {
    reasons.push(`Target audience: was “${cbAudience.slice(0, 80)}” → now “${ideaAudience.slice(0, 80)}”`);
  }

  // Year/era conflict — only from core fields, not entity extraction
  const cbLoglineYear = (cbLogline || '').match(/\b(19\d{2}|20\d{2})\b/);
  const ideaLoglineYear = (ideaLogline || '').match(/\b(19\d{2}|20\d{2})\b/);
  if (cbLoglineYear && ideaLoglineYear && cbLoglineYear[0] !== ideaLoglineYear[0]) {
    reasons.push(`Era: CB references ${cbLoglineYear[0]}, Idea now references ${ideaLoglineYear[0]}`);
  }

  // No narrative conflicts found — staleness is from a Canon configuration update, not a content change
  if (reasons.length === 0) {
    reasons.push(`Canon configuration updated since this was generated — no narrative conflicts detected`);
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
 * Correct direction for beat_sheet / treatment / character_bible / long_synopsis:
 *
 * The child is an EXPANSION of the parent — it's allowed to have MORE.
 * Staleness means the PARENT changed after the child was generated.
 *
 * So: find named entities in the CURRENT PARENT that are NOT in the STALE DOC.
 * These are things the parent now defines that the child hasn't absorbed yet.
 *
 * Also flag: named entities in the stale doc that appear to CONTRADICT the parent
 * (e.g. stale doc says "Connor Blake" but parent says "Bill Blackstone" — same role, different name).
 * This is hard to detect automatically without LLM, so for now we flag structural field mismatches
 * and rely on the "parent has new entities not in child" signal as the primary indicator.
 */
function getUpstreamEntityReasons(
  stalePlaintext: string,
  parentPlaintext: string,
  parentLabel: string,
): string[] {
  const reasons: string[] = [];
  const staleLower = stalePlaintext.toLowerCase();
  const parentEntities = extractNamedEntities(parentPlaintext);
  const seen = new Set<string>();

  for (const entity of parentEntities) {
    if (seen.has(entity)) continue;
    if (entity.length < 4) continue;
    const entityLower = entity.toLowerCase();
    // Entity is defined in current parent but NOT reflected in the stale child
    if (!staleLower.includes(entityLower)) {
      const isFaction = FACTOR_TERMS.has(entity);
      const isLocation = /\b(Himalayas|Benghazi|Hong Kong|Nepal|Tibet|Nepalese|Berlin|London|Cairo)\b/i.test(entity);
      const isArtifact = /Engine|Kingdom|Lost Civilization|Device|Weapon/i.test(entity);
      const isNamedChar = /^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(entity) && !isFaction && !isArtifact && !isLocation;
      if (isNamedChar) {
        reasons.push(`Character "${entity}" now in ${parentLabel} — not yet reflected in this doc`);
        seen.add(entity);
      } else if (isFaction) {
        reasons.push(`Faction "${entity}" now in ${parentLabel} — not yet reflected in this doc`);
        seen.add(entity);
      } else if (isLocation) {
        reasons.push(`Location "${entity}" now in ${parentLabel} — not yet reflected in this doc`);
        seen.add(entity);
      } else if (isArtifact) {
        reasons.push(`World element "${entity}" now in ${parentLabel} — not yet reflected in this doc`);
        seen.add(entity);
      }
    }
  }

  if (reasons.length === 0) {
    reasons.push(`Canon configuration updated since this was generated — no narrative conflicts detected`);
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
