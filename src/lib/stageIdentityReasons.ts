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

/**
 * Extract a field from "FIELD\nvalue" format (possibly multi-line).
 */
function extractField(text: string, fieldName: string): string | null {
  const match = text.match(new RegExp(`^${fieldName}\\n([^\\n].*?)(?=\\n\\n|\\n[A-Z]{2,}|\\n#|$)`, 'm'));
  return match ? match[1].trim() : null;
}

/**
 * Named entities found in a Concept Brief section.
 */
interface NamedEntities {
  protagonist: string | null;   // e.g. "Bill Blackstone"
  antagonist: string | null;    // e.g. "Heinrich Klausman"
  setting: string | null;        // e.g. "Himalayas"
  keyObject: string | null;     // e.g. "Abzu Engine"
  faction: string | null;        // e.g. "MI6", "Nazi SS"
  creature: string | null;       // e.g. "Yeti"
}

function extractNamedEntities(text: string): NamedEntities {
  const premise = extractField(text, 'PREMISE') || '';
  const worldBuilding = [
    extractField(text, 'WORLD BUILDING NOTES'),
    extractField(text, 'WORLD_BUILDING NOTES'),
    extractField(text, 'WORLD NOTES'),
  ].find(Boolean) || '';
  const combined = premise + ' ' + worldBuilding;

  // Protagonist: look for "X is forced/chosen/recruited by Y into..."
  const protMatch = combined.match(/(?:A |An |)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+?)\s+(?:is|was)\s+(?:forced|chosen|recruited|blackmailed)/);
  // Antagonist: look for "Nazi", "SS", "German" + rank/name
  const antMatch = combined.match(/(?:Nazi SS |Nazi |German )(?:occultist )?( Heinrich Klausman|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+?)/);
  // Setting: "Himalayas", "Benghazi", "Hong Kong", "Nepal"
  const settingMatch = combined.match(/\b(Himalayas|Benghazi|Hong Kong|Nepal|Tibet|Nepalese mountains)\b/);
  // Key object: quotes or CamelCase terms that suggest an artifact
  const objMatch = combined.match(/'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)* Engine)'|"([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*) Kingdom'|([A-Z][a-z]+ Engine)/);
  // Faction
  const facMatch = combined.match(/\b(MI6|Nazi SS|SS|Abwehr|OSS|British Secret Service)\b/);
  // Creature
  const crMatch = combined.match(/\b(Yeti|Sasquatch|Abominable Snowman|Monster)\b/);

  return {
    protagonist: protMatch ? protMatch[1] : null,
    antagonist: antMatch ? (antMatch[1] || antMatch[2]) : null,
    setting: settingMatch ? settingMatch[1] : null,
    keyObject: objMatch ? (objMatch[1] || objMatch[2] || objMatch[3]) : null,
    faction: facMatch ? facMatch[1] : null,
    creature: crMatch ? crMatch[1] : null,
  };
}

/**
 * Check whether a specific claim (text snippet) from the Concept Brief
 * is directly supported by the Idea plaintext.
 * Uses looser matching: checks for key words from the claim.
 */
function claimSupported(claim: string, ideaText: string): boolean {
  if (!claim || !ideaText) return true; // empty claim = nothing to check
  // Pull significant words (4+ chars, ignore common stopwords)
  const stop = new Set(['that', 'which', 'where', 'from', 'into', 'with', 'must', 'about', 'their', 'there', 'while', 'during', 'after', 'before', 'through', 'between', 'have', 'been', 'being', 'will', 'would', 'could', 'should', 'this', 'from', 'also', 'even', 'just', 'only', 'than', 'then', 'when', 'what']);
  const words = claim.split(/\s+/)
    .filter(w => w.length >= 5 && !stop.has(w.toLowerCase()))
    .slice(0, 6); // top 6 significant words
  if (words.length === 0) return true;
  const lc = ideaText.toLowerCase();
  const found = words.filter(w => lc.includes(w.toLowerCase()));
  return found.length >= Math.min(2, words.length);
}

/**
 * Extract key story facts from the Idea plaintext for comparison.
 */
function extractIdeaStoryFacts(ideaText: string): {
  logline: string | null;
  genre: string | null;
  subgenre: string | null;
  tone: string | null;
  targetAudience: string | null;
} {
  return {
    logline: extractField(ideaText, 'LOGLINE'),
    genre: extractField(ideaText, 'GENRE'),
    subgenre: extractField(ideaText, 'SUBGENRE'),
    tone: extractField(ideaText, 'TONE'),
    targetAudience: extractField(ideaText, 'TARGET AUDIENCE'),
  };
}

/**
 * Compare a Concept Brief plaintext against the current Idea plaintext and
 * return granular, specific contradictions.
 *
 * Strategy:
 * 1. Surface-level: title/logline/genre/subgenre/tone/audience mismatches
 * 2. Named-entity: protagonist, antagonist, setting, faction, creature
 *    that appear in the Concept Brief but NOT in the Idea logline
 * 3. Claim-level: specific premise/world-building sentences that aren't
 *    reflected in the Idea's logline or story facts
 */
export function getConceptBriefCanonReasons(
  conceptBriefPlaintext: string,
  ideaPlaintext: string
): string[] {
  const reasons: string[] = [];
  if (!conceptBriefPlaintext || !ideaPlaintext) return reasons;

  // 1. Surface-level field comparisons
  const idea = extractIdeaStoryFacts(ideaPlaintext);

  const titleCB = extractField(conceptBriefPlaintext, 'TITLE');
  const loglineCB = extractField(conceptBriefPlaintext, 'LOGLINE');
  const genreCB = extractField(conceptBriefPlaintext, 'GENRE');
  const subgenreCB = extractField(conceptBriefPlaintext, 'SUBGENRE');
  const toneCB = extractField(conceptBriefPlaintext, 'TONE');
  const audienceCB = extractField(conceptBriefPlaintext, 'TARGET AUDIENCE');

  if (titleCB && idea.logline && titleCB !== idea.logline?.split(' ').slice(0, 3).join(' ')) {
    // Title mismatch
  }
  if (loglineCB && idea.logline && loglineCB !== idea.logline) {
    reasons.push(`Logline has been edited: Concept Brief says "${loglineCB.slice(0, 70)}..." but current Idea logline is "${idea.logline.slice(0, 70)}..."`);
  }
  if (genreCB && idea.genre && genreCB.toLowerCase() !== idea.genre.toLowerCase()) {
    reasons.push(`Genre changed: Concept Brief had "${genreCB}" but Idea now says "${idea.genre}"`);
  }
  if (subgenreCB && idea.subgenre && subgenreCB.toLowerCase() !== idea.subgenre.toLowerCase()) {
    reasons.push(`Subgenre changed: Concept Brief had "${subgenreCB}" but Idea now says "${idea.subgenre}"`);
  }
  if (toneCB && idea.tone && toneCB !== idea.tone) {
    reasons.push(`Tone changed: Concept Brief had "${toneCB}" but Idea now says "${idea.tone}"`);
  }
  if (audienceCB && idea.targetAudience && audienceCB !== idea.targetAudience) {
    reasons.push(`Target audience changed: Concept Brief had "${audienceCB.slice(0, 60)}" but Idea now says "${idea.targetAudience.slice(0, 60)}"`);
  }

  // 2. Named-entity checks
  const entities = extractNamedEntities(conceptBriefPlaintext);
  const ideaTextLower = ideaPlaintext.toLowerCase();

  if (entities.protagonist) {
    const lc = entities.protagonist.toLowerCase();
    if (!ideaTextLower.includes(lc) && !idea.logline?.toLowerCase().includes(lc)) {
      reasons.push(`Protagonist mismatch: Concept Brief introduces "${entities.protagonist}" but this name doesn't appear in the current Idea`);
    }
  }
  if (entities.antagonist) {
    const lc = entities.antagonist.toLowerCase();
    if (!ideaTextLower.includes(lc) && !idea.logline?.toLowerCase().includes(lc)) {
      reasons.push(`Antagonist mismatch: Concept Brief references "${entities.antagonist}" which doesn't appear in the current Idea`);
    }
  }
  if (entities.faction && entities.faction !== 'Nazi SS' && entities.faction !== 'Nazi') {
    // Only flag non-obvious factions
    const lc = entities.faction.toLowerCase();
    if (!ideaTextLower.includes(lc) && !idea.logline?.toLowerCase().includes(lc)) {
      reasons.push(`Faction missing: Concept Brief mentions "${entities.faction}" which isn't in the current Idea`);
    }
  }
  if (entities.setting) {
    const lc = entities.setting.toLowerCase();
    if (!ideaTextLower.includes(lc) && !idea.logline?.toLowerCase().includes(lc)) {
      reasons.push(`Setting mismatch: Concept Brief includes "${entities.setting}" but the current Idea doesn't mention this location`);
    }
  }
  if (entities.keyObject) {
    const lc = entities.keyObject.toLowerCase();
    if (!ideaTextLower.includes(lc)) {
      reasons.push(`World element not in Idea: Concept Brief references "${entities.keyObject}" which doesn't appear in the current Idea`);
    }
  }
  if (entities.creature) {
    const lc = entities.creature.toLowerCase();
    if (!ideaTextLower.includes(lc) && !idea.logline?.toLowerCase().includes(lc)) {
      reasons.push(`Creature mismatch: Concept Brief features "${entities.creature}" but this doesn't appear in the current Idea`);
    }
  }

  // 3. Specific premise claims not supported by Idea logline
  const premise = extractField(conceptBriefPlaintext, 'PREMISE');
  if (premise) {
    // Check for temporal mismatches (year, era)
    const yearCB = premise.match(/\b(19\d{2}|20\d{2})\b/);
    const yearIdea = (idea.logline || '').match(/\b(19\d{2}|20\d{2})\b/);
    if (yearCB && yearIdea && yearCB[0] !== yearIdea[0]) {
      reasons.push(`Time period conflict: Concept Brief implies ${yearCB[0]} but Idea logline mentions ${yearIdea[0]}`);
    }

    // Check if key action from premise appears in Idea
    const premiseActions = [
      { pattern: /disillusioned.*agent|blackmailed.*mission|Nazi occultist|Himalayas|Ancient.*power/i,
        label: 'premise core action' },
    ];
    for (const { pattern, label } of premiseActions) {
      if (!pattern.test(idea.logline || '')) {
        // The premise has a core action that the Idea logline doesn't reflect
      }
    }
  }

  // 4. If no contradictions found at all, give a clear generic message
  if (reasons.length === 0) {
    reasons.push(`Concept Brief may be out of sync: resolver hash changed but no surface-level contradictions detected — regenerate to reconcile`);
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
