/**
 * screenplayParser.ts — Canonical Shared Screenplay Parser
 *
 * Single authoritative screenplay parser for all IFFY extraction paths.
 * Replaces 5 inline parsers across: dev-engine-v2, story-ingestion-engine,
 * extract-scene-index, nel-orchestrator, and export-package.
 *
 * ── Design ─────────────────────────────────────────────────────────────────
 * - Pure function: no DB calls, no side effects, no async
 * - Handles all edge cases from all 5 previous parsers
 * - Returns typed records with confidence scoring, offsets, and provenance
 * - Parser version tracked for migration detection
 *
 * ── Heading Patterns Supported ──────────────────────────────────────────────
 * - INT./EXT./INT/EXT./I/E. with optional scene number prefixes
 * - COLD OPEN, TEASER, EPILOGUE, PROLOGUE, END CREDITS
 * - SCENE N — description markers
 * - Bare INT.MOUNTAIN (no space after prefix)
 * - Orphaned scene numbers on preceding line ("1\nINT. HOUSE — DAY")
 * - Embedded numbers ("1 1 EXT.", "44 INT.")
 * - Forced scene headings (leading dot: ".SCENE TITLE")
 *
 * ── Accuracy Targets ────────────────────────────────────────────────────────
 * - Scene boundary detection: ≥99%
 * - Slugline parsing: ≥99%
 * - Action line extraction: ≥95%
 * - Character name extraction: ≥95%
 * - Dialogue extraction: ≥90%
 * - Parenthetical detection: ≥85%
 * - Characters present: ≥90%
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   import { parseScreenplay, type CanonicalSceneRecord } from '../_shared/screenplayParser.ts';
 *
 *   const result = parseScreenplay(scriptText, {
 *     sourceDocumentVersionId: 'uuid',
 *     projectId: 'uuid',
 *   });
 *   // result.scenes: CanonicalSceneRecord[]
 *   // result.metadata: ParseMetadata
 *
 * @version 1.0.0
 */

// ── Types ───────────────────────────────────────────────────────────────────

export const PARSER_VERSION = '1.0.0';

export interface ScreenplayParseOptions {
  /** Unique ID of the source document version being parsed */
  sourceDocumentVersionId?: string;
  /** Project ID for provenance */
  projectId?: string;
}

export interface DialogueBlock {
  character: string;
  parenthetical: string | null;
  dialogue: string;
}

export interface Parenthetical {
  character: string;
  direction: string;
}

export interface CanonicalSceneRecord {
  // Identity
  scene_number: number;
  scene_key: string;

  // From slugline
  slugline: string;
  location_raw: string;
  location_key: string;
  time_of_day: string;
  interior_exterior: 'INT' | 'EXT' | 'INT/EXT' | '';

  // Full scene content (MANDATORY)
  full_scene_text: string;

  // Parsed components
  action_lines: string[];
  dialogue_blocks: DialogueBlock[];
  parentheticals: Parenthetical[];
  characters_present: string[];

  // Offset tracking
  scene_start_offset: number;
  scene_end_offset: number;

  // Provenance
  extraction_confidence: 'high' | 'medium' | 'low';
  extraction_method: 'regex';
  parser_version: string;
  source_hash: string;
  warnings: string[];
}

export interface ParseMetadata {
  scene_count: number;
  slugline_count: number;
  parse_method: 'slugline_deterministic' | 'fallback_single_scene';
  parse_quality: 'high' | 'medium' | 'low';
  warnings: string[];
  text_length: number;
  parser_version: string;
}

export interface ScreenplayParseResult {
  scenes: CanonicalSceneRecord[];
  metadata: ParseMetadata;
}

// ── Constants ───────────────────────────────────────────────────────────────

const SCENE_PREFIXES = /^(INT\.|EXT\.|INT\.\/EXT\.|INT\/EXT\.|I\/E\.?)/i;

const SCENE_HEADING_CLEAN = /^(?:INT\.|EXT\.|INT\.\/EXT\.|INT\/EXT\.|I\/E\.?)\s*(.+?)(?:\s*[-–—]\s*(.+))?$/i;

const SCENE_HEADING_BARE = /^(?:INT\.|EXT\.|INT\.\/EXT\.|INT\/EXT\.|I\/E\.?)(.+)$/i;

const SPECIAL_HEADING = /^(COLD OPEN|TEASER|EPILOGUE|PROLOGUE|END CREDITS)\b/i;

const SCENE_MARKER = /^SCENE\s+(\d+)\s*[-–—:]\s*(.+)/i;

const ORPHANED_NUMBER = /^\s*(\d+)\s*[\.\)\s]*$/;

const LEADING_NUMBERS = /^(?:\d+\s*[\.\)\s]*)+/;

const ALL_CAPS_CHARACTER = /^[A-Z][A-Z .'À-ÿ]{0,40}(?:\s*\(.+\))?$/;

const TRANSITION_PATTERN = /^(FADE OUT\.|FADE IN:|CUT TO:|SMASH CUT TO:|DISSOLVE TO:|MATCH CUT TO:|JUMP CUT TO:|FADE TO BLACK\.|END\.)$/i;

const TRANSITION_TO = /^TO:$/i;

const SKIP_CHARACTER = /^(FADE|CUT|DISSOLVE|SMASH|INTERCUT|CONTINUED|CONT'D|THE END|TITLE|SUPER|V\.O\.|O\.S\.|BACK TO|FLASHBACK|END OF|MONTAGE|SERIES OF|BEGIN|MORE|ANGLE|CLOSE|WIDE|PAN|INSERT|TRANSITION)$/i;

const INDENTED_DIALOGUE = /^[ ]{10,}([A-Z][A-Z\s\.\-']{1,30})(?:\s*\(.*?\))?\s*$/;

const PARENTHETICAL = /^\(([^)]+)\)/;

const EM_DASH = /\s*[-–—]\s*/;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute a simple hash of a string for provenance tracking.
 * Not cryptographically secure — used for change detection.
 */
function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  // Ensure non-negative and hex-encode
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Normalize a location string to a stable key.
 * "BILL'S APARTMENT" → "bills_apartment"
 * "INT. HOUSE — DAY" → "house"
 */
function normalizeLocationKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .replace(/_+/g, '_');
}

/**
 * Generate a scene key from a 1-based index.
 * 1 → SCENE_001, 12 → SCENE_012, 123 → SCENE_123, 1234 → SCENE_1234
 */
function sceneKeyFromIndex(index: number): string {
  const n = index + 1;
  return `SCENE_${String(n).padStart(n > 999 ? 4 : 3, '0')}`;
}

/**
 * Detect if a line is likely a character name (ALL CAPS, short, no period).
 */
function isCharacterName(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 2 || trimmed.length > 50) return false;
  if (trimmed.includes('.')) return false;
  if (SKIP_CHARACTER.test(trimmed.toUpperCase())) return false;
  return /^[A-Z][A-Z\s\.\-'À-ÿ]{0,40}$/.test(trimmed);
}

/**
 * Detect if a line starts with a scene heading prefix.
 * Handles leading numbers, whitespace, and forced headings.
 */
function isSceneHeading(line: string): boolean {
  const trimmed = line.trim();
  // Forced scene heading (leading dot)
  if (/^\.[A-Z]/.test(trimmed)) return true;
  // Strip leading numbers and check for INT./EXT.
  const stripped = trimmed.replace(LEADING_NUMBERS, '');
  return SCENE_PREFIXES.test(stripped);
}

/** Check if a raw line matches scene prefix without stripping numbers */
function startsWithScenePrefix(line: string): boolean {
  return SCENE_PREFIXES.test(line.trim());
}

/** Check if line starts with scene prefix but no space after (e.g. "INT.MOUNTAIN") */
function startsWithScenePrefixNoSpace(line: string): boolean {
  return SCENE_PREFIXES.test(line.trim());
}

/**
 * Find character names using indented dialogue cue pattern (used by story-ingestion-engine).
 */
function extractCharacterCuesFromText(text: string): string[] {
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(INDENTED_DIALOGUE.source, 'gm');
  while ((m = re.exec(text)) !== null) {
    const name = m[1].trim();
    if (!SKIP_CHARACTER.test(name) && name.length > 1 && name.length < 30) {
      names.add(name);
    }
  }
  return Array.from(names).sort();
}

// ── Slugline Parser ─────────────────────────────────────────────────────────

export interface ParsedSlugline {
  slugline: string;
  location_raw: string;
  location_key: string;
  time_of_day: string;
  interior_exterior: 'INT' | 'EXT' | 'INT/EXT' | '';
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Parse a single slugline/heading line into structured components.
 *
 * Handles:
 * - Standard: "INT. HOUSE — DAY"
 * - Dash variants: "EXT. FIELD – NIGHT", "INT. CAR — DAY"
 * - Bare: "INT.MOUNTAIN" (no space)
 * - Orphaned numbers merged: "1\nINT. HOUSE — DAY" (headingLine = "1\nINT. HOUSE — DAY")
 * - Leading numbers: "1 1 EXT.", "44 INT."
 * - Special: "COLD OPEN", "TEASER", "SCENE 1 — Description"
 */
export function parseSlugline(headingLine: string): ParsedSlugline {
  // Handle merged headingLines with newlines (orphaned scene numbers)
  const parts = headingLine.split('\n');
  let sluglineText = headingLine.trim();

  for (const part of parts) {
    const trimmed = part.trim();
    // Skip lines that are just scene numbers
    if (/^\d+\s*[\.\)\s]*$/.test(trimmed)) continue;
    sluglineText = trimmed;
    break;
  }

  // Strip ALL leading scene numbers — script headings can have the scene
  // number appear twice: "1 1 EXT.", "2 2 INT.", "44 INT."
  const cleaned = sluglineText.replace(LEADING_NUMBERS, '').trim();

  // Check for special headings
  const specialMatch = cleaned.match(SPECIAL_HEADING);
  if (specialMatch) {
    return {
      slugline: cleaned.toUpperCase(),
      location_raw: specialMatch[1],
      location_key: normalizeLocationKey(specialMatch[1]),
      time_of_day: '',
      interior_exterior: '',
      confidence: 'high',
    };
  }

  // Check for SCENE N — Description markers
  const sceneMarkerMatch = cleaned.match(SCENE_MARKER);
  if (sceneMarkerMatch) {
    return {
      slugline: cleaned,
      location_raw: sceneMarkerMatch[2].trim(),
      location_key: normalizeLocationKey(sceneMarkerMatch[2]),
      time_of_day: '',
      interior_exterior: '',
      confidence: 'medium',
    };
  }

  // Standard slugline: "INT. HOUSE — DAY"
  const standardMatch = cleaned.match(SCENE_HEADING_CLEAN);
  if (standardMatch) {
    const prefix = (cleaned.match(SCENE_PREFIXES)?.[1] || '').toUpperCase();
    const iex = prefix.replace(/\./g, '').replace(/\//g, '/') as 'INT' | 'EXT' | 'INT/EXT';
    const location = (standardMatch[1] || '').trim();
    return {
      slugline: cleaned,
      location_raw: location,
      location_key: normalizeLocationKey(location),
      time_of_day: (standardMatch[2] || '').trim(),
      interior_exterior: iex,
      confidence: 'high',
    };
  }

  // Bare: "INT.MOUNTAIN" (no space after INT.)
  const bareMatch = cleaned.match(SCENE_HEADING_BARE);
  if (bareMatch) {
    const prefix = (cleaned.match(SCENE_PREFIXES)?.[1] || '').toUpperCase();
    const iex = prefix.replace(/\./g, '').replace(/\//g, '/') as 'INT' | 'EXT' | 'INT/EXT';
    const locationPart = bareMatch[1].trim();
    const timeMatch = locationPart.split(EM_DASH);
    const location = timeMatch ? locationPart.replace(/\s*[-–—]\s*.*$/, '').trim() : locationPart;
    return {
      slugline: cleaned,
      location_raw: location,
      location_key: normalizeLocationKey(location),
      time_of_day: timeMatch && timeMatch[1] ? timeMatch[1].trim() : '',
      interior_exterior: iex,
      confidence: 'medium',
    };
  }

  // Fallback: bare line with no INT./EXT. pattern
  return {
    slugline: cleaned || sluglineText,
    location_raw: '',
    location_key: '',
    time_of_day: '',
    interior_exterior: '',
    confidence: 'low',
  };
}

// ── Main Parser ─────────────────────────────────────────────────────────────

/**
 * Parse a full screenplay text into structured scene records.
 *
 * Algorithm:
 * 1. Normalize input text
 * 2. Detect scene boundaries using unified heading patterns
 * 3. For each scene chunk:
 *    a. Parse slugline into components
 *    b. Extract full scene text
 *    c. Parse dialogue blocks (character → parenthetical → dialogue)
 *    d. Extract characters_present
 *    e. Compute offsets
 * 4. Return CanonicalSceneRecord[] with parse metadata
 */
export function parseScreenplay(
  text: string,
  options: ScreenplayParseOptions = {},
): ScreenplayParseResult {
  const warnings: string[] = [];
  const textLength = text.length;
  const sourceHash = simpleHash(text);

  // ── Step 1: Normalize input ─────────────────────────────────────────────
  let normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const lines = normalized.split('\n');

  // ── Step 2: Detect scene boundaries ──────────────────────────────────────
  interface SceneBreak {
    startLine: number;
    headingLine: string;
  }

  const sceneBreaks: SceneBreak[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let headingLine: string | null = null;

    // Case 1: Line starts with INT./EXT. (standard heading)
    if (startsWithScenePrefix(line)) {
      headingLine = line;
      // Check for orphaned number on previous line
      if (i > 0 && ORPHANED_NUMBER.test(lines[i - 1])) {
        headingLine = `${lines[i - 1].trim().replace(/[\.\)]+$/, '')}\n${line}`;
      }
    }
    // Case 2: Special heading (COLD OPEN, TEASER, etc.)
    else if (SPECIAL_HEADING.test(line.trim())) {
      headingLine = line;
    }
    // Case 3: SCENE N — Description marker
    else if (SCENE_MARKER.test(line.trim())) {
      headingLine = line;
    }
    // Case 4: Forced scene heading (leading dot)
    else if (/^\.[A-Z]/.test(line.trim())) {
      headingLine = line.trim();
    }
    // Case 5: Embedded scene numbers ("1 1 EXT.", "44 INT.")
    else if (isSceneHeading(line)) {
      // Strip the leading numbers so parseSlugline can parse the slugline part
      headingLine = line.replace(/^[\s\d]+/, '');
    }

    if (headingLine !== null) {
      sceneBreaks.push({
        startLine: i,
        headingLine,
      });
    }
  }

  // ── Step 3: Fallback if no headings found ────────────────────────────────
  let parseMethod: ParseMetadata['parse_method'] = 'slugline_deterministic';

  if (sceneBreaks.length === 0) {
    warnings.push('No heading markers found (INT./EXT./COLD OPEN/SCENE) — falling back to single-scene parse');
    sceneBreaks.push({
      startLine: 0,
      headingLine: 'SCENE 1',
    });
    parseMethod = 'fallback_single_scene';
  }

  // ── Step 4: Extract character cues from full text ────────────────────────
  // Used as a supplementary source for characters_present
  const allCharacterCues = extractCharacterCuesFromText(normalized);

  // ── Step 5: Build scene records ──────────────────────────────────────────
  const scenes: CanonicalSceneRecord[] = [];

  for (let i = 0; i < sceneBreaks.length; i++) {
    const brk = sceneBreaks[i];
    const startLineIndex = brk.startLine;
    const endLineIndex = i + 1 < sceneBreaks.length
      ? sceneBreaks[i + 1].startLine
      : lines.length;

    // Compute character offsets
    let startOffset = 0;
    for (let j = 0; j < startLineIndex; j++) {
      startOffset += lines[j].length + 1; // +1 for newline
    }
    let endOffset = startOffset;
    for (let j = startLineIndex; j < endLineIndex; j++) {
      endOffset += lines[j].length + 1;
    }

    // Extract full scene text
    const sceneText = lines.slice(startLineIndex, endLineIndex).join('\n').trim();

    // Parse slugline
    const parsed = parseSlugline(brk.headingLine);

    // Parse scene content for dialogue blocks, action lines, characters
    const sceneLines = sceneText.split('\n');
    const actionLines: string[] = [];
    const dialogueBlocks: DialogueBlock[] = [];
    const parentheticals: Parenthetical[] = [];
    const charactersInScene = new Set<string>();

    let currentChar: string | null = null;
    let currentDialogue: string[] = [];

    // Also add characters from slugline-derived character cues
    for (const cue of allCharacterCues) {
      // Only include if character appears in this scene's text
      if (sceneText.toUpperCase().includes(cue.toUpperCase())) {
        charactersInScene.add(cue);
      }
    }

    // Track if we saw a line that could count as "action" (not dialogue metadata)
    let inActionBlock = true;

    for (let l = 1; l < sceneLines.length; l++) {
      const line = sceneLines[l];
      const trimmed = line.trim();

      if (!trimmed) {
        // Blank line — flush pending dialogue
        if (currentChar && currentDialogue.length > 0) {
          dialogueBlocks.push({
            character: currentChar,
            parenthetical: null,
            dialogue: currentDialogue.join('\n'),
          });
          currentDialogue = [];
        } else if (currentChar) {
          // character declared but no dialogue yet — character might be a heading
          currentChar = null;
        }
        inActionBlock = true;
        continue;
      }

      // Skip heading lines within scene content
      if (l > 0 && (
        startsWithScenePrefix(trimmed) ||
        SPECIAL_HEADING.test(trimmed) ||
        /^\.[A-Z]/.test(trimmed)
      )) {
        // This is the next scene's heading — stop parsing
        break;
      }

      // Parenthetical: "(whispering)", "(angry)"
      const parenMatch = trimmed.match(PARENTHETICAL);
      if (parenMatch && currentChar) {
        parentheticals.push({
          character: currentChar,
          direction: parenMatch[1],
        });
        continue;
      }

      // Character name: ALL CAPS, short, no period
      // Must be followed by parenthetical or dialogue (not another character name)
      const isChar = isCharacterName(trimmed) && trimmed === trimmed.trim();
      if (isChar) {
        // Flush previous character's dialogue
        if (currentChar && currentDialogue.length > 0) {
          dialogueBlocks.push({
            character: currentChar,
            parenthetical: null,
            dialogue: currentDialogue.join('\n'),
          });
          currentDialogue = [];
        }
        currentChar = trimmed;
        charactersInScene.add(trimmed);
        inActionBlock = false;
        continue;
      }

      // If we have a current character and this isn't a transition or heading, it's dialogue
      if (currentChar && !TRANSITION_PATTERN.test(trimmed) && !TRANSITION_TO.test(trimmed)) {
        currentDialogue.push(trimmed);
        inActionBlock = false;
        continue;
      }

      // Transitions
      if (TRANSITION_PATTERN.test(trimmed) || (TRANSITION_TO.test(trimmed) && trimmed === trimmed.trim().toUpperCase())) {
        continue; // Skip transition markers
      }

      // Action lines (non-dialogue, non-character, non-heading text)
      actionLines.push(trimmed);
      inActionBlock = true;
    }

    // Flush final dialogue
    if (currentChar && currentDialogue.length > 0) {
      dialogueBlocks.push({
        character: currentChar,
        parenthetical: null,
        dialogue: currentDialogue.join('\n'),
      });
    }

    // Compute extraction confidence
    let confidence: 'high' | 'medium' | 'low' = 'high';
    if (parsed.confidence === 'low') {
      confidence = 'low';
    } else if (parsed.location_raw === '' && parsed.time_of_day === '') {
      confidence = 'medium';
    } else if (dialogueBlocks.length === 0 && actionLines.length === 0) {
      confidence = 'low';
    }

    if (i === 0 && sceneBreaks.length === 1 && parseMethod === 'fallback_single_scene') {
      warnings.push('Single scene fallback — scene boundaries may be inaccurate');
    }

    scenes.push({
      scene_number: i + 1,
      scene_key: `SCENE_${String(i + 1).padStart(3, '0')}`,
      slugline: parsed.slugline,
      location_raw: parsed.location_raw,
      location_key: parsed.location_key,
      time_of_day: parsed.time_of_day,
      interior_exterior: parsed.interior_exterior,
      full_scene_text: sceneText,
      action_lines: actionLines,
      dialogue_blocks: dialogueBlocks,
      parentheticals: parentheticals,
      characters_present: Array.from(charactersInScene).sort(),
      scene_start_offset: startOffset,
      scene_end_offset: endOffset,
      extraction_confidence: confidence,
      extraction_method: 'regex',
      parser_version: PARSER_VERSION,
      source_hash: sourceHash,
      warnings: parsed.confidence === 'low' ? [`Low confidence slugline parse: "${parsed.slugline}"`] : [],
    });
  }

  // ── Step 6: Compute parse quality ────────────────────────────────────────
  let parseQuality: ParseMetadata['parse_quality'] = 'high';
  if (warnings.length > 2) {
    parseQuality = 'low';
  } else if (warnings.length > 0 || scenes.length < 5 && textLength > 5000) {
    parseQuality = 'medium';
  }

  return {
    scenes,
    metadata: {
      scene_count: scenes.length,
      slugline_count: sceneBreaks.length,
      parse_method: parseMethod,
      parse_quality: parseQuality,
      warnings,
      text_length: textLength,
      parser_version: PARSER_VERSION,
    },
  };
}

/**
 * Parse character cues from screenplay text using indented dialogue detection.
 * Standalone utility for systems that need character names without full parse.
 */
export function extractDialogueCharacterCues(text: string): string[] {
  return extractCharacterCuesFromText(text);
}

/**
 * Normalize a location string to a stable key.
 * Standalone export for systems that need location normalization.
 */
export { normalizeLocationKey };

/**
 * Determine if a line is a screenplay scene heading.
 * Standalone export for systems that need heading detection.
 */
export { isSceneHeading };

/**
 * Generate a scene key from a 1-based index.
 * Standalone export for key generation.
 */
export { sceneKeyFromIndex };
