/**
 * Inference Engine — Scene Intelligence Package v1.2
 *
 * Layer 2 extraction: combines regex output with atom data
 * to infer narrative fields.
 */

import type { RegexExtractionResult } from './regexExtractor.ts';

export interface NarrativeInferenceResult {
  emotional_turn: string | null;
  tension_level: number | null;
  power_dynamic: string | null;
  dominant_character: string | null;
  vulnerable_character: string | null;
  observer_characters: string[];
  visual_moment_type: string | null;
  camera_intent: string | null;
  performance_direction: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface NarrativeBeatInfo {
  emotionalImpact?: string;
  structuralFunction?: string;
  narrativeMomentum?: string;
  charactersInvolved?: string[];
}

export interface CharacterAtomInfo {
  character_name: string;
  goals?: string[];
  fears?: string[];
  secrets?: string[];
}

export function inferNarrativeFields(
  regex: RegexExtractionResult,
  characterKeys: string[],
  narrativeBeat: NarrativeBeatInfo | null,
  characterAtoms: CharacterAtomInfo[],
): NarrativeInferenceResult {
  const result: NarrativeInferenceResult = {
    emotional_turn: null,
    tension_level: null,
    power_dynamic: null,
    dominant_character: null,
    vulnerable_character: null,
    observer_characters: [],
    visual_moment_type: null,
    camera_intent: null,
    performance_direction: null,
    confidence: 'medium',
  };

  // 1. emotional_turn from narrative beat
  if (narrativeBeat?.emotionalImpact) {
    result.emotional_turn = narrativeBeat.emotionalImpact;
  }

  // 2. tension_level from narrative momentum + emotional marker count
  const markerCount = regex.emotional_markers.length;
  const powerVerbCount = regex.power_verbs.length;
  
  if (narrativeBeat?.narrativeMomentum) {
    switch (narrativeBeat.narrativeMomentum.toLowerCase()) {
      case 'high': result.tension_level = Math.min(8 + Math.floor(markerCount / 2), 10); break;
      case 'medium': result.tension_level = Math.min(5 + Math.floor(markerCount / 2), 8); break;
      case 'low': result.tension_level = Math.max(2, Math.min(5, markerCount)); break;
      default: result.tension_level = Math.min(3 + markerCount + powerVerbCount, 10);
    }
  } else {
    result.tension_level = Math.min(3 + markerCount + powerVerbCount, 10);
  }

  // 3. power_dynamic from power verbs + blocking
  if (powerVerbCount >= 3 && regex.blocking_entries.length >= 2) {
    result.power_dynamic = 'shifting';
  } else if (powerVerbCount >= 2) {
    result.power_dynamic = 'one_dominant';
  } else if (regex.emotional_markers.filter(e => 
    ['defiant', 'angry', 'furious', 'threatens', 'commands'].includes(e.emotion)).length >= 2) {
    result.power_dynamic = 'mutual_hostility';
  } else if (regex.dialogue_blocks.length >= 2) {
    result.power_dynamic = 'equal';
  } else {
    result.power_dynamic = 'equal';
  }

  // 4. dominant_character
  const dominanceCount = new Map<string, number>();
  for (const pv of regex.power_verbs) {
    // Count who's near power verbs
    const nearbyChar = regex.characters_detected.find(c => 
      regex.evidence_lines.some(l => l.includes(c) && l.includes(pv)));
    if (nearbyChar) {
      dominanceCount.set(nearbyChar, (dominanceCount.get(nearbyChar) || 0) + 1);
    }
  }

  let maxDominance = 0;
  for (const [char, count] of dominanceCount) {
    if (count > maxDominance) {
      maxDominance = count;
      result.dominant_character = char;
    }
  }

  // 5. vulnerable_character — character with overwhelmed/frightened emotional markers
  const vulnerabilityMarkers = ['frightened', 'hesitant', 'desperate', 'terrified', 'anxious', 'defeated', 'uncertain'];
  for (const em of regex.emotional_markers) {
    if (vulnerabilityMarkers.includes(em.emotion)) {
      if (!result.vulnerable_character) {
        result.vulnerable_character = em.character;
      }
      break;
    }
  }

  // If no vulnerable found, use character atoms with fears
  if (!result.vulnerable_character && characterAtoms.length > 0) {
    const fearfulChar = characterAtoms.find(c => c.fears && c.fears.length > 0);
    if (fearfulChar) result.vulnerable_character = fearfulChar.character_name;
  }

  // 6. observer_characters — characters in scene but not in any action line
  const actionChars = new Set<string>();
  for (const action of regex.scene_action) {
    for (const char of characterKeys) {
      if (action.includes(char)) actionChars.add(char);
    }
  }
  result.observer_characters = characterKeys.filter(c => !actionChars.has(c));

  // 7. visual_moment_type from narrative function + action patterns
  result.visual_moment_type = classifyVisualMoment(regex, narrativeBeat, powerVerbCount);

  // 8. camera_intent
  result.camera_intent = inferCameraIntent(regex, characterKeys);

  // 9. performance_direction
  result.performance_direction = inferPerformanceDirection(regex, characterAtoms);

  // Confidence
  if (regex.evidence_lines.length >= 5 && regex.scene_action.length >= 2) {
    result.confidence = 'high';
  } else if (regex.evidence_lines.length >= 2) {
    result.confidence = 'medium';
  } else {
    result.confidence = 'low';
  }

  return result;
}

function classifyVisualMoment(
  regex: RegexExtractionResult,
  narrativeBeat: NarrativeBeatInfo | null,
  powerVerbCount: number,
): string {
  const struct = narrativeBeat?.structuralFunction?.toLowerCase() || '';
  
  if (struct.includes('climax') || struct.includes('confrontation')) return 'confrontation';
  if (struct.includes('revelation') || struct.includes('discovery')) return 'discovery';
  if (struct.includes('intimacy') || struct.includes('relationship')) return 'intimacy';
  if (struct.includes('threat') || struct.includes('danger')) return 'threat';
  if (struct.includes('pursuit') || struct.includes('chase')) return 'pursuit';
  if (struct.includes('action') || struct.includes('set_piece')) return 'action';
  if (struct.includes('setup') || struct.includes('atmosphere')) return 'atmosphere';
  if (struct.includes('transition')) return 'transition';
  
  // Fallback from regex
  if (powerVerbCount >= 3) return 'confrontation';
  if (regex.gaze_entries.length >= 3) return 'confrontation';
  if (regex.body_entries.some(b => ['runs', 'crawls', 'ducks', 'hides', 'stumbles'].includes(b.posture))) return 'action';
  if (regex.emotional_markers.some(e => ['terrified', 'frightened', 'anxious'].includes(e.emotion))) return 'threat';
  
  if (characterKeys.length >= 4) return 'ensemble';
  return 'atmosphere';
}

function inferCameraIntent(
  regex: RegexExtractionResult,
  characterKeys: string[],
): string {
  const charCount = characterKeys.length;
  
  if (charCount >= 4) return 'wide_shot_establishing_ensemble';
  if (charCount === 3) return 'medium_three_shot';
  if (charCount === 2) {
    if (regex.power_verbs.length >= 2) return 'two_shot_confrontation';
    if (regex.gaze_entries.length >= 2) return 'two_shot_emotional_beat';
    return 'two_shot';
  }
  // Single character
  if (regex.body_entries.some(b => ['runs', 'walks', 'paces', 'enters', 'exits'].includes(b.posture))) {
    return 'single_character_action';
  }
  return 'single_character_reaction';
}

function inferPerformanceDirection(
  regex: RegexExtractionResult,
  characterAtoms: CharacterAtomInfo[],
): string {
  const directions: string[] = [];
  
  // Use parentheticals as primary performance direction
  for (const p of regex.parentheticals) {
    directions.push(`${p.character}: ${p.direction}`);
  }
  
  // Add emotional markers as performance notes
  for (const em of regex.emotional_markers) {
    if (!directions.some(d => d.includes(em.character + ':') && d.includes(em.emotion))) {
      directions.push(`${em.character}: ${em.emotion} undertone`);
    }
  }

  if (directions.length === 0 && characterAtoms.length > 0) {
    const goals = characterAtoms.filter(c => c.goals && c.goals.length > 0);
    if (goals.length > 0) {
      directions.push(`Active intentions: ${goals.map(g => `${g.character_name} (${g.goals?.[0]})`).join(', ')}`);
    }
  }

  return directions.length > 0 ? directions.join('; ') : null!;
}
