/**
 * Regex Extraction Module — Scene Intelligence Package v1.2
 *
 * Layer 1 extraction: deterministic regex on scene_graph_versions.content
 * No LLM. Pure functions. Testable in isolation.
 */

// ── Regex patterns ──────────────────────────────────────────────────────────

const SLUGLINE = /^(INT|EXT|INT\/EXT|INT\.\/EXT)\.?\s+.+$/m;
const CHARACTER_NAME = /^([A-Z][A-Z .'À-ÿ]+)(?:\s*\(.*\))?$/m;
const GAZE_VERB = /\b(looks at|stares at|glances at|eyes on|gazes at|meets?\s+[\w\s]+\s+eyes?|holds?\s+[\w\s]+\s+gaze|fixes?\s+[\w\s]+\s+eyes?)\b/i;
const BODY_POSTURE = /\b(sits|stands|kneels|crouches|leans|paces|rises|enters|exits|turns|walks|runs|crawls|ducks|hides|slumps|straightens|spins|stumbles|collapses|springs|creeps|strides)\b/i;
const BLOCKING_PREP = /\b(across from|beside|behind|in front of|near|opposite|toward|away from|next to|alongside|beneath|above|between)\b/i;
const EMOTIONAL_MARKER = /\b(angry|frightened|determined|hesitant|desperate|triumphant|guarded|defiant|cold|warm|cautious|eager|terrified|calm|agitated|suspicious|relieved|anxious|defeated|hopeful|resigned|impatient|contemptuous|bewildered|composed|furious|terrified|uncertain|smirks|frowns|grins|narrows.*eyes|raises.*eyebrow|clenches|relaxes|shakes|nods)\b/i;
const POWER_VERB = /\b(commands|submits|pleads|threatens|controls|dominates|obeys|defies|surrenders|resists|challenges|interrogates|interrogates|pressures|coerces|blackmails|manipulates|outranks|outmatches)\b/i;
const DIALOGUE_PREFIX = /^([A-Z][A-Z .'À-ÿ]+)\s*$/m;
const PARENTHETICAL = /\(([^)]+)\)/g;
const ACTION_LINE = /^(?!INT|EXT|INT\/EXT|INT\.\/EXT)(?!^[A-Z][A-Z .'À-ÿ]+$)(?!^$)(.+)$/m;

// ── Types ───────────────────────────────────────────────────────────────────

export interface RegexExtractionResult {
  slugline: string | null;
  scene_action: string[];
  blocking_entries: BlockingEntry[];
  gaze_entries: GazeEntry[];
  body_entries: BodyEntry[];
  emotional_markers: EmotionalMarker[];
  power_verbs: string[];
  characters_detected: string[];
  evidence_lines: string[];
  dialogue_blocks: DialogueBlock[];
  parentheticals: Parenthetical[];
}

export interface BlockingEntry {
  character: string;
  position: string;
  body_posture: string;
  evidence: string;
}

export interface GazeEntry {
  subject: string;
  target: string;
  intensity: string;
  evidence: string;
}

export interface BodyEntry {
  character: string;
  posture: string;
  gesture: string;
}

export interface EmotionalMarker {
  character: string;
  emotion: string;
  evidence: string;
}

export interface DialogueBlock {
  character: string;
  text: string;
}

export interface Parenthetical {
  character: string;
  direction: string;
  evidence: string;
}

// ── Main extractor ──────────────────────────────────────────────────────────

export function extractFromContent(content: string): RegexExtractionResult {
  const lines = content.split('\n');
  
  const result: RegexExtractionResult = {
    slugline: null,
    scene_action: [],
    blocking_entries: [],
    gaze_entries: [],
    body_entries: [],
    emotional_markers: [],
    power_verbs: [],
    characters_detected: [],
    evidence_lines: [],
    dialogue_blocks: [],
    parentheticals: [],
  };

  // 1. Extract slugline
  const slugMatch = content.match(SLUGLINE);
  if (slugMatch) result.slugline = slugMatch[0].trim();

  // 2. Parse line by line
  let currentCharacter: string | null = null;
  let currentDialogue: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for character name (ALL CAPS, before dialogue)
    const charMatch = line.match(/^([A-Z][A-Z .'À-ÿ]+)(?:\s*\(.*\))?$/);
    if (charMatch && line.length < 50 && !line.includes('.')) {
      if (currentCharacter && currentDialogue.length > 0) {
        result.dialogue_blocks.push({
          character: currentCharacter,
          text: currentDialogue.join('\n'),
        });
        currentDialogue = [];
      }
      currentCharacter = charMatch[1].trim();
      if (!result.characters_detected.includes(currentCharacter)) {
        result.characters_detected.push(currentCharacter);
      }
      continue;
    }

    // If dialogue follows a character name
    if (currentCharacter && line.startsWith('(')) {
      // Parenthetical
      const parenth = line.match(/^\(([^)]+)\)/);
      if (parenth) {
        result.parentheticals.push({
          character: currentCharacter,
          direction: parenth[1],
          evidence: line,
        });
        result.evidence_lines.push(line);
      }
      continue;
    }

    if (currentCharacter && !line.match(/^(INT|EXT|INT\/EXT)/) && !line.match(/^[A-Z][A-Z .'À-ÿ]+$/)) {
      currentDialogue.push(line);
      // Check for gaze in dialogue context
      checkGaze(line, currentCharacter, result);
      checkEmotion(line, currentCharacter, result);
      continue;
    }

    // Action lines (not slugline, not character name, not dialogue)
    if (!line.match(/^(INT|EXT|INT\/EXT)/) && !line.match(/^[A-Z][A-Z .'À-ÿ]+$/) && !currentCharacter) {
      result.scene_action.push(line);
      result.evidence_lines.push(line);
      
      // Extract blocking
      checkBlocking(line, result);
      // Extract gaze
      checkGaze(line, null, result);
      // Extract body posture
      checkBodyPosture(line, result);
      // Extract emotional markers
      checkEmotion(line, null, result);
      // Extract power verbs
      checkPowerVerbs(line, result);
    }
  }

  // Flush last dialogue block
  if (currentCharacter && currentDialogue.length > 0) {
    result.dialogue_blocks.push({
      character: currentCharacter,
      text: currentDialogue.join('\n'),
    });
  }

  // 3. Check content-level gaze/blocking outside line loop
  const gazeMatches = content.match(GAZE_VERB);
  if (gazeMatches && result.gaze_entries.length === 0) {
    // Content-level gaze found but couldn't assign characters
    for (const match of gazeMatches) {
      result.evidence_lines.push(match);
    }
  }

  return result;
}

// ── Helper checks ───────────────────────────────────────────────────────────

function checkGaze(line: string, speakingChar: string | null, result: RegexExtractionResult): void {
  const gazeMatch = line.match(GAZE_VERB);
  if (!gazeMatch) return;

  const verb = gazeMatch[0];
  const subject = speakingChar || 'unknown_character';

  // Try to find target after the gaze verb
  const afterVerb = line.substring(line.indexOf(verb) + verb.length);
  const targetMatch = afterVerb.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/);
  const target = targetMatch ? targetMatch[1] : 'unknown_target';

  result.gaze_entries.push({
    subject,
    target,
    intensity: inferIntensity(verb),
    evidence: line.trim(),
  });
  result.evidence_lines.push(line.trim());
}

function checkBlocking(line: string, result: RegexExtractionResult): void {
  const prepMatch = line.match(BLOCKING_PREP);
  if (!prepMatch) return;

  // Find characters near the blocking preposition
  const chars = line.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/g);
  if (chars && chars.length >= 1) {
    const postureMatch = line.match(BODY_POSTURE);
    result.blocking_entries.push({
      character: chars[0],
      position: prepMatch[0],
      body_posture: postureMatch ? postureMatch[0] : 'unknown',
      evidence: line.trim(),
    });
  }
}

function checkBodyPosture(line: string, result: RegexExtractionResult): void {
  const postureMatches = line.match(BODY_POSTURE);
  if (!postureMatches) return;

  const chars = line.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/g);
  if (chars && chars.length >= 1) {
    for (const posture of postureMatches) {
      result.body_entries.push({
        character: chars[0],
        posture,
        gesture: line.trim().substring(0, 100),
      });
    }
  }
}

function checkEmotion(line: string, speakingChar: string | null, result: RegexExtractionResult): void {
  const emMatches = line.match(EMOTIONAL_MARKER);
  if (!emMatches) return;

  const char = speakingChar || 'unknown_character';
  for (const emotion of emMatches) {
    result.emotional_markers.push({
      character: char,
      emotion,
      evidence: line.trim(),
    });
  }
}

function checkPowerVerbs(line: string, result: RegexExtractionResult): void {
  const pvMatches = line.match(POWER_VERB);
  if (!pvMatches) return;
  result.power_verbs.push(...pvMatches);
}

function inferIntensity(verb: string): string {
  const intense = /\b(stares intently|glare|piercing|locked|fixed|boring into)\b/i;
  const moderate = /\b(looks at|watches|observes|studies|examines)\b/i;
  const brief = /\b(glances|peeks|glimpses|catches.*eye)\b/i;
  
  if (intense.test(verb)) return 'intense';
  if (moderate.test(verb)) return 'moderate';
  if (brief.test(verb)) return 'brief';
  return 'moderate';
}
