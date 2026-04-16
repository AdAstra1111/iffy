/**
 * scene-enrichment-engine
 *
 * Phase 3 — Narrative Enrichment Engine (Pass 1)
 *
 * Computes per-scene emotional, tension, and relationship signals
 * from existing canonical stores (scene_graph, entity_links, relations, beat_sheet).
 *
 * Deterministic rule-based extraction — NO AI inference.
 * Idempotent — can be re-run without full cascade.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ─────────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────────── */

interface SceneEnrichmentRecord {
  tension_level: number;
  emotional_register: string;
  protagonist_emotional_state: { primary: string; secondary: string | null; valence: number };
  emotional_arc_direction: string;
  relationship_context: Array<{ character: string; role: string; relationship_type: string | null }>;
  thematic_weight: number;
  narrative_beat: string | null;
  narrative_momentum: string;
  thematic_tags: string[];
}

interface EnrichmentResult {
  scene_key: string;
  sceneId: string;  // scene_graph_versions.id — forwarded for Phase 3.1 cache population
  enrichment: SceneEnrichmentRecord;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/* ─────────────────────────────────────────────────────────────────
   Word / Signal Dictionaries
   ───────────────────────────────────────────────────────────────── */

const CONFLICT_WORD_SET = new Set([
  "FIGHT", "WAR", "BATTLE", "ATTACK", "DEFEAT", "ENEMY", "RIVAL", "HOSTILE",
  "KILL", "MURDER", "THREATEN", "BETRAY", "DOUBT", "CONFRONT", "ARGUE", "DISAGREE",
  "VIOLENCE", "VIOLENT", "GUN", "SHOT", "BLOOD", "DEAD", "DESTROY", "CRUEL"
]);

const INTIMATE_WORD_SET = new Set([
  "LOVE", "KISS", "EMBRACE", "INTIMATE", "TRUST", "CONFIDE", "WHISPER", "HOLD",
  "TENDER", "AFFECTION", "DEVOTION", "ROMANCE", "CARESSE"
]);

const ACTION_WORD_SET = new Set([
  "RUN", "CHASE", "FLEE", "JUMP", "CLIMB", "SWIM", "DIVE", "RACE",
  "ATTACK", "STRIKE", "DASH", "RUSH", "SPRINT", "LEAP", "PURSUIT"
]);

const CONTEMPLATIVE_WORD_SET = new Set([
  "THINK", "WONDER", "REMEMBER", "DREAM", "REFLECT", "CONSIDER",
  "REALIZE", "UNDERSTAND", "KNOW", "BELIEVE", "HOPE", "FEAR", "DREAD"
]);

const MOURNFUL_WORD_SET = new Set([
  "DEAD", "DIE", "LOSS", "GRIEF", "MOURN", "SORROW", "GRIEVING", "FUNERAL",
  "TEARS", "CRY", "WEEP", "TRAGEDY", "TRAGIC", "FAREWELL", "GOODBYE"
]);

const EUPHORIC_WORD_SET = new Set([
  "VICTORY", "WIN", "TRIUMPH", "CELEBRATE", "LAUGH", "JOY", "HAPPY",
  "EXCITED", "EXULTANT", "Triumph", "SUCCESS", "WON", "CHEER"
]);

const MORALLY_GREY_WORD_SET = new Set([
  "KILL", "MURDER", "BETRAY", "CORRUPT", "DARK", "EVI", "SIN", "GUILT",
  "SHAME", "CRIME", "CRIMINAL", "LAWLESS", "MORAL", "ETHIC", "WRONG"
]);

const POWER_VERB_SET = new Set([
  "ORDER", "COMMAND", "FORCE", "DEMAND", "COMPEL", "COERCE", "MANDATE"
]);

const DECISION_WORD_SET = new Set([
  "CHOOSE", "DECIDE", "SACRIFICE", "FORFEIT", "GIVE UP", "ACCEPT",
  "COMMIT", "DEDICATE", "RESIGN", "RELEASE", "SURRENDER"
]);

const REVELATION_WORD_SET = new Set([
  "DISCOVER", "LEARN", "REALIZE", "REVEAL", "EXPOSE", "UNCOVER",
  "TRUTH", "SECRET", "HIDDEN", "FIND OUT", "CLUE"
]);

const EMOTION_WORD_SETS: Record<string, Set<string>> = {
  ANGRY: new Set([
    "ANGRY", "RAGE", "FURIOUS", "FURY", "WRATH", "ENRAGED", "OUTRAGED",
    "HOSTILE", "FURY", "INFURIATED", "MAD", "LIVID"
  ]),
  FEARFUL: new Set([
    "AFRAID", "FEAR", "SCARED", "TERRIFIED", "FRIGHTENED", "FEARFUL",
    "PANIC", "ANXIOUS", "DREAD", "WORRIED", "NERVOUS", "UNEASY"
  ]),
  SAD: new Set([
    "SAD", "SORROW", "GRIEF", "MOURN", "DEPRESSED", "HOPELESS",
    "DESPAIR", "MELANCHOLY", "GLOOMY", "HEARTBROKEN"
  ]),
  JOYFUL: new Set([
    "HAPPY", "JOY", "EXCITED", "DELIGHTED", "CHEERFUL", "PLEASED",
    "GRATEFUL", "CONTENT", "ELATED", "ECSTATIC"
  ]),
  SURPRISED: new Set([
    "SHOCK", "SURPRISE", "STARTLED", "STUNNED", "AMAZED", "ASTONISHED",
    "STAGGERED", "BLINK", "CONFUSED"
  ]),
  DISGUSTED: new Set([
    "DISGUST", "REVOLTED", "SICKENED", "REPULSED", "NAUSEATED",
    "DISTASTE", "ABHOR", "LOATHE"
  ]),
};

const THEMATIC_DICTIONARY: Record<string, string[]> = {
  sacrifice: ["SACRIFICE", "SACRIFICIAL", "GIVE UP", "FORFEIT", "SURRENDER", "GIVE IN"],
  loyalty: ["LOYAL", "LOYALTY", "ALLEGIANCE", "FAITHFUL", "DEVOTION", "PATRIOT"],
  betrayal: ["BETRAY", "TREACHERY", "DISLOYAL", "TRAITOR", "TREACHEROUS", "BACKSTAB"],
  power: ["POWER", "CONTROL", "AUTHORITY", "DOMINATE", "RULE", "SUPREME", "DOMINANCE"],
  redemption: ["REDEMPTION", "FORGIVE", "ATONE", "SECOND CHANCE", "REDEEM", "PENANCE"],
  identity: ["IDENTITY", "WHO AM I", "DISCOVER WHO", "BECOME", "SELF", "TRUE SELF"],
  survival: ["SURVIVE", "SURVIVAL", "ESCAPE", "LIFE OR DEATH", "STAY ALIVE"],
  justice: ["JUSTICE", "INNOCENT", "GUILTY", "LAW", "COURT", "VERDICT", "JUDGE"],
  freedom: ["FREE", "FREEDOM", "LIBERTY", "INDEPENDENCE", "BREAK FREE", "OPEN"],
  destiny: ["DESTINY", "FATE", "PROPHECY", "FOREORDAINED", "INEVITABLE"],
  trust: ["TRUST", "BELIEVE", "FAITH", "CREDUL", "DOUBT", "SKEPTICAL"],
  war: ["WAR", "ARMY", "SOLDIER", "BATTLE", "FIGHT", "COMBAT", "MILITARY"],
  family: ["FAMILY", "BROTHER", "SISTER", "MOTHER", "FATHER", "SON", "DAUGHTER", "KIN"],
  corruption: ["CORRUPT", "BRIBE", "FRAUD", "DECEIT", "DECEIVE", "DECEPTION"],
  revenge: ["REVENGE", "AVENGE", "PAYBACK", "RETRIBUTION", "RETALIATE"],
};

/* ─────────────────────────────────────────────────────────────────
   Signal Extraction Helpers
   ───────────────────────────────────────────────────────────────── */

function countOccurrences(text: string, wordSet: Set<string>): number {
  const upper = text.toUpperCase();
  let count = 0;
  for (const word of wordSet) {
    if (upper.includes(word)) count++;
  }
  return count;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function extractDialogueBlocks(text: string, speaker?: string): string[] {
  // Split by speaker header pattern: SPEAKER (parenthetical)\n
  // Simple approach: find blocks between speaker headers
  const lines = text.split('\n');
  const blocks: string[] = [];
  let currentBlock: string[] = [];
  let inDialogue = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const speakerMatch = trimmed.match(/^([A-Z][A-Z'\s.]{1,30})(\s*\(.*?\))?$/);
    if (speakerMatch) {
      const detectedSpeaker = speakerMatch[1].trim();
      if (inDialogue && currentBlock.length > 0) {
        blocks.push(currentBlock.join(' '));
        currentBlock = [];
      }
      if (!speaker || detectedSpeaker.toUpperCase().includes(speaker.toUpperCase())) {
        inDialogue = true;
      } else {
        inDialogue = false;
      }
    } else if (inDialogue && trimmed.length > 0) {
      currentBlock.push(trimmed);
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join(' '));
  }

  return blocks;
}

function avgWordsPerSentence(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length === 0) return 0;
  const totalWords = sentences.reduce((acc, s) => acc + s.trim().split(/\s+/).filter(w => w.length > 0).length, 0);
  return totalWords / sentences.length;
}

function getSceneTextContent(scene: any): string {
  return ((scene.content || "") + " " + (scene.slugline || "")).toUpperCase();
}

/* ─────────────────────────────────────────────────────────────────
   Enrichment Computation Functions
   ───────────────────────────────────────────────────────────────── */

function computeTensionLevel(content: string): number {
  const upper = content.toUpperCase();
  const wc = Math.max(wordCount(content), 1);

  const dialogueLineMatches = upper.match(/^[A-Z][A-Z'\s.]{1,30}$/gm) || [];
  const totalLines = upper.split('\n').filter(l => l.trim().length > 0).length;
  const dialogueRatio = totalLines > 0 ? dialogueLineMatches.length / totalLines : 0;

  const exclamationDensity = ((upper.match(/!/g) || []).length / wc) * 100;
  const questionDensity = ((upper.match(/\?/g) || []).length / wc) * 100;
  const ellipsisDensity = ((upper.match(/\.{2,}/g) || []).length / wc) * 100;

  const conflictScore = countOccurrences(upper, CONFLICT_WORD_SET) / Math.max(wc, 1) * 100;
  const powerVerbScore = countOccurrences(upper, POWER_VERB_SET) / Math.max(wc, 1) * 100;
  const mournfulScore = countOccurrences(upper, MOURNFUL_WORD_SET) / Math.max(wc, 1) * 100;

  const avgSentLen = avgWordsPerSentence(content);
  const shortSentenceBonus = avgSentLen < 10 ? 2 : avgSentLen > 25 ? -1 : 0;

  const score =
    (dialogueRatio * 2.5) +
    (Math.min(exclamationDensity * 4, 4)) +
    (Math.min(questionDensity * 2, 2)) +
    (Math.min(ellipsisDensity * 3, 2)) +
    (conflictScore * 3) +
    (powerVerbScore * 5) +
    (mournfulScore * 2) +
    shortSentenceBonus;

  return Math.max(1, Math.min(10, Math.round(score)));
}

function classifyEmotionalRegister(content: string): string {
  const upper = content.toUpperCase();
  const wc = Math.max(wordCount(content), 1);

  const conflictScore = countOccurrences(upper, CONFLICT_WORD_SET);
  const intimateScore = countOccurrences(upper, INTIMATE_WORD_SET);
  const actionScore = countOccurrences(upper, ACTION_WORD_SET);
  const contemplativeScore = countOccurrences(upper, CONTEMPLATIVE_WORD_SET);
  const mournfulScore = countOccurrences(upper, MOURNFUL_WORD_SET);
  const euphoricScore = countOccurrences(upper, EUPHORIC_WORD_SET);
  const morallyGreyScore = countOccurrences(upper, MORALLY_GREY_WORD_SET);

  // Dialogue exchange ratio: count back-and-forth
  const dialogueLines = upper.match(/^[A-Z][A-Z'\s.]{1,30}$/gm) || [];
  const uniqueSpeakers = new Set(dialogueLines.map(l => l.trim())).size;
  const dialogueExchangeRatio = uniqueSpeakers > 2 ? 1 : 0;

  if (conflictScore >= 3) return "CONFLICT";
  if (mournfulScore >= 2) return "MOURNFUL";
  if (euphoricScore >= 2) return "EUPHORIC";
  if (intimateScore >= 2) return "INTIMATE";
  if (contemplativeScore >= 3) return "CONTEMPLATIVE";
  if (actionScore >= 4 && conflictScore < 2) return "ACTION";
  if (morallyGreyScore >= 2) return "MORALLY_GREY";
  if (conflictScore >= 1) return "TENSE";
  if (dialogueExchangeRatio && uniqueSpeakers >= 3) return "EXPOSITORY";
  return "EXPOSITORY";
}

function detectDominantEmotion(text: string): string {
  const upper = text.toUpperCase();
  let maxScore = 0;
  let dominant = "NEUTRAL";

  for (const [emotion, wordSet] of Object.entries(EMOTION_WORD_SETS)) {
    const score = countOccurrences(upper, wordSet);
    if (score > maxScore) {
      maxScore = score;
      dominant = emotion;
    }
  }
  return dominant;
}

function computeValence(text: string): number {
  const upper = text.toUpperCase();
  const positiveWords = new Set(["JOY", "LOVE", "HAPPY", "EXCITED", "GOOD", "BEST", "GREAT", "WON", "SUCCESS", "VICTORY"]);
  const negativeWords = new Set(["HATE", "ANGRY", "SAD", "FEAR", "BAD", "WORST", "TERRIBLE", "FAIL", "DEAD", "KILL", "LOST"]);

  let score = 0;
  for (const word of positiveWords) {
    if (upper.includes(word)) score++;
  }
  for (const word of negativeWords) {
    if (upper.includes(word)) score--;
  }

  return Math.max(-3, Math.min(3, score));
}

function extractProtagonistState(
  content: string,
  protagonistName: string | null
): { primary: string; secondary: string | null; valence: number } {
  if (!protagonistName) {
    return { primary: "UNKNOWN", secondary: null, valence: 0 };
  }

  const dialogueBlocks = extractDialogueBlocks(content, protagonistName);
  if (dialogueBlocks.length === 0) {
    return { primary: "UNKNOWN", secondary: null, valence: 0 };
  }

  const firstBlock = dialogueBlocks[0].toUpperCase();
  const primary = detectDominantEmotion(firstBlock);
  const valence = computeValence(firstBlock);

  // Secondary emotion from second block if present
  let secondary: string | null = null;
  if (dialogueBlocks.length >= 2) {
    const secondBlock = dialogueBlocks[1].toUpperCase();
    const secondEmotion = detectDominantEmotion(secondBlock);
    if (secondEmotion !== primary) {
      secondary = secondEmotion;
    }
  }

  return { primary, secondary, valence };
}

function computeEmotionalArcDirection(content: string): string {
  const upper = content.toUpperCase();
  const len = upper.length;
  if (len < 200) return "FLAT";

  const firstThird = upper.slice(0, Math.floor(len / 3));
  const lastThird = upper.slice(-Math.floor(len / 3));
  const midStart = Math.floor(len / 3);
  const midEnd = Math.floor(len * 2 / 3);
  const mid = upper.slice(midStart, midEnd);

  const firstTension = computeTensionLevel(firstThird);
  const midTension = computeTensionLevel(mid);
  const lastTension = computeTensionLevel(lastThird);

  const diff = lastTension - firstTension;

  if (diff >= 2) return "ESCALATING";
  if (diff <= -2) return "DEESCALATING";

  // Check for turning: mid is different from both
  const turningFromFirst = Math.abs(midTension - firstTension) >= 2;
  const turningToLast = Math.abs(lastTension - midTension) >= 2;
  if (turningFromFirst && turningToLast && (midTension > firstTension) !== (midTension > lastTension)) {
    return "TURNING";
  }

  // Check for complex: multiple reversals
  if (Math.abs(firstTension - midTension) >= 2 && Math.abs(midTension - lastTension) >= 2) {
    return "COMPLEX";
  }

  return "FLAT";
}

function buildRelationshipContext(
  charactersPresent: string[],
  entityRelations: Array<{ from_entity: string; to_entity: string; relation_type: string; relation_subtype?: string }>
): Array<{ character: string; role: string; relationship_type: string | null }> {
  const context: Array<{ character: string; role: string; relationship_type: string | null }> = [];

  for (const character of charactersPresent) {
    const upperChar = character.toUpperCase();
    // Find direct relation involving this character
    const relation = entityRelations.find(
      r => r.from_entity.toUpperCase().includes(upperChar) ||
           r.to_entity.toUpperCase().includes(upperChar) ||
           upperChar.includes(r.from_entity.toUpperCase()) ||
           upperChar.includes(r.to_entity.toUpperCase())
    );

    context.push({
      character,
      role: relation?.relation_type || "UNKNOWN",
      relationship_type: relation?.relation_subtype || null,
    });
  }

  return context;
}

function computeThematicWeight(
  content: string,
  beatPosition: string | null
): number {
  const upper = content.toUpperCase();
  const wc = Math.max(wordCount(content), 1);

  let weight = 0;

  // Thematic signals
  const decisionSignals = countOccurrences(upper, DECISION_WORD_SET);
  const revelationSignals = countOccurrences(upper, REVELATION_WORD_SET);
  const conflictSignals = countOccurrences(upper, CONFLICT_WORD_SET);

  weight += Math.min(decisionSignals * 1.5, 3);
  weight += Math.min(revelationSignals * 1.2, 2);
  weight += Math.min(conflictSignals * 0.5, 2);

  // Beat position bonus
  const criticalBeats = ["midpoint", "climax", "crisis", "dark moment", "break into three", "break into two"];
  if (beatPosition && criticalBeats.some(b => beatPosition.toLowerCase().includes(b))) {
    weight += 2;
  }

  return Math.max(1, Math.min(10, Math.round(weight)));
}

function inferNarrativeBeat(
  sceneIndex: number,
  totalScenes: number,
  beatSheet: any,
  content: string
): string | null {
  if (beatSheet?.beats?.length) {
    // Match scene content to beat by entity overlap
    const upperContent = content.toUpperCase();
    const sceneEntities = [...upperContent.match(/[A-Z][A-Z]{2,}/g) || []];

    let bestMatch = { beat: null as any, overlap: 0 };
    for (const beat of beatSheet.beats) {
      const beatText = ((beat.description || "") + " " + (beat.name || "")).toUpperCase();
      const beatEntities = [...beatText.match(/[A-Z][A-Z]{2,}/g) || []];
      const overlap = sceneEntities.filter(e => beatEntities.includes(e)).length;
      if (overlap > bestMatch.overlap) {
        bestMatch = { beat, overlap };
      }
    }

    if (bestMatch.overlap >= 2) {
      return bestMatch.beat.name || bestMatch.beat.title || "named_beat";
    }
  }

  // Fallback: infer from scene position in script
  const position = totalScenes > 0 ? sceneIndex / totalScenes : 0;
  if (position < 0.1) return "setup";
  if (position < 0.15) return "inciting_incident";
  if (position < 0.25) return "rising_action";
  if (position < 0.5) return "midpoint";
  if (position < 0.75) return "falling_action";
  if (position < 0.9) return "crisis";
  return "climax";
}

function computeNarrativeMomentum(
  tensionLevel: number,
  arcDirection: string,
  positionInScript: number
): string {
  if (arcDirection === "ESCALATING") return "BUILDING";
  if (arcDirection === "DEESCALATING") return "RELEASING";
  if (arcDirection === "TURNING") return "TURNING";
  if (positionInScript > 0.8 && tensionLevel >= 7) return "BUILDING";
  if (positionInScript > 0.8 && tensionLevel <= 3) return "RELEASING";
  return "HOLDING";
}

function extractThematicTags(content: string): string[] {
  const upper = content.toUpperCase();
  const tags: string[] = [];

  for (const [tag, words] of Object.entries(THEMATIC_DICTIONARY)) {
    if (words.some(w => upper.includes(w))) {
      tags.push(tag);
    }
  }

  return tags;
}

/* ─────────────────────────────────────────────────────────────────
   Main Scene Enrichment
   ───────────────────────────────────────────────────────────────── */

async function enrichScene(
  scene: any,
  sceneIndex: number,
  totalScenes: number,
  protagonistName: string | null,
  charactersInScene: string[],
  entityRelations: Array<{ from_entity: string; to_entity: string; relation_type: string; relation_subtype?: string }>,
  beatSheet: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  projectId: string,
  sceneId: string  // scene_graph_versions.id — passed through to caller for cache population
): Promise<EnrichmentResult> {
  const content = getSceneTextContent(scene);
  const tension_level = computeTensionLevel(content);
  const emotional_register = classifyEmotionalRegister(content);
  const protagonist_emotional_state = extractProtagonistState(content, protagonistName);
  const emotional_arc_direction = computeEmotionalArcDirection(content);
  const relationship_context = buildRelationshipContext(charactersInScene, entityRelations);
  const narrative_beat = inferNarrativeBeat(sceneIndex, totalScenes, beatSheet, content);
  const thematic_weight = computeThematicWeight(content, narrative_beat);
  const thematic_tags = extractThematicTags(content);
  const positionInScript = totalScenes > 0 ? sceneIndex / totalScenes : 0;
  const narrative_momentum = computeNarrativeMomentum(tension_level, emotional_arc_direction, positionInScript);

  return {
    scene_key: scene.scene_key,
    sceneId,
    enrichment: {
      tension_level,
      emotional_register,
      protagonist_emotional_state,
      emotional_arc_direction,
      relationship_context,
      thematic_weight,
      narrative_beat,
      narrative_momentum,
      thematic_tags,
    },
  };
}

/* ─────────────────────────────────────────────────────────────────
   Fetch Helpers
   ───────────────────────────────────────────────────────────────── */

async function fetchSceneGraph(
  supabaseUrl: string,
  serviceRoleKey: string,
  projectId: string
): Promise<any[]> {
  try {
    const headers = {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    const scenesRes = await fetch(
      `${supabaseUrl}/rest/v1/scene_graph_scenes?project_id=eq.${projectId}&select=id,scene_key&order=scene_key.asc`,
      { headers }
    );
    const scenes: Array<{ id: string; scene_key: string }> = await scenesRes.json();
    if (!scenes?.length) return [];

    const sceneIds = scenes.map(s => s.id);
    const versionsRes = await fetch(
      `${supabaseUrl}/rest/v1/scene_graph_versions?project_id=eq.${projectId}&scene_id=in.(${sceneIds.join(",")})&status=eq.draft&select=id,scene_id,slugline,location,time_of_day,characters_present,content,version_number&order=version_number.desc`,
      { headers }
    );
    const versions: any[] = await versionsRes.json();

    // Deduplicate: keep highest version_number per scene_id
    const versionMap = new Map<string, any>();
    for (const v of versions) {
      if (!versionMap.has(v.scene_id) || v.version_number > versionMap.get(v.scene_id).version_number) {
        versionMap.set(v.scene_id, v);
      }
    }
    // Log first version for debugging
    console.log(`[fetchSceneGraph] scenes=${scenes.length} sceneIds=${sceneIds.length} versions=${versions?.length ?? 0} versionMap_size=${versionMap.size}`);

    return scenes.map(s => {
      const version = versionMap.get(s.id);
      return {
        scene_key: s.scene_key,
        scene_uuid: s.id,                        // scene_graph_scenes.id
        scene_graph_version_id: version?.id,      // scene_graph_versions.id (current version)
        slugline: version?.slugline || "",
        location: version?.location || "",
        time_of_day: version?.time_of_day || "",
        characters_present: version?.characters_present || [],
        content: version?.content || "",
        version_number: version?.version_number ?? 0,
      };
    });
  } catch {
    return [];
  }
}

async function fetchEntityRelations(
  supabaseUrl: string,
  serviceRoleKey: string,
  projectId: string
): Promise<Array<{ from_entity: string; to_entity: string; relation_type: string; relation_subtype?: string }>> {
  try {
    const headers = {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };
    const res = await fetch(
      `${supabaseUrl}/rest/v1/narrative_entity_relations?project_id=eq.${projectId}&select=from_entity,to_entity,relation_type,relation_subtype`,
      { headers }
    );
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchBeatSheet(
  supabaseUrl: string,
  serviceRoleKey: string,
  projectId: string
): Promise<any> {
  try {
    const headers = {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };

    const docRes = await fetch(
      `${supabaseUrl}/rest/v1/project_documents?project_id=eq.${projectId}&doc_type=eq.beat_sheet&select=id`,
      { headers }
    );
    const docs: any[] = await docRes.json();
    if (!docs?.length) return null;
    const docId = docs[0].id;

    const versionRes = await fetch(
      `${supabaseUrl}/rest/v1/project_document_versions?document_id=eq.${docId}&is_current=eq.true&select=plaintext`,
      { headers }
    );
    const versions: any[] = await versionRes.json();
    if (!versions?.length || !versions[0].plaintext) return null;

    try {
      return JSON.parse(versions[0].plaintext);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

async function fetchAllCharacters(
  supabaseUrl: string,
  serviceRoleKey: string,
  projectId: string
): Promise<Map<string, { id: string; canonical_name: string; entity_type: string; meta_json: Record<string, unknown> | null }>> {
  try {
    const headers = {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };
    const res = await fetch(
      `${supabaseUrl}/rest/v1/narrative_entities?project_id=eq.${projectId}&entity_type=eq.character&select=id,canonical_name,entity_type,meta_json&limit=200`,
      { headers }
    );
    const entities: Array<{ id: string; canonical_name: string; entity_type: string; meta_json: Record<string, unknown> | null }> = await res.json();
    const map = new Map<string, { id: string; canonical_name: string; entity_type: string; meta_json: Record<string, unknown> | null }>();
    for (const e of entities) {
      map.set(e.canonical_name?.toLowerCase() ?? "", e);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function fetchProtagonistName(
  supabaseUrl: string,
  serviceRoleKey: string,
  projectId: string
): Promise<string | null> {
  try {
    const headers = {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    };
    const res = await fetch(
      `${supabaseUrl}/rest/v1/narrative_entities?project_id=eq.${projectId}&entity_type=eq.character&select=canonical_name&limit=20`,
      { headers }
    );
    const entities: any[] = await res.json();
    // First entity or the one with most scene links is likely the protagonist
    // For now, return the first character entity as protagonist
    // TODO: use narrative_entity_relations to find explicit protagonist role
    return entities?.[0]?.canonical_name || null;
  } catch {
    return null;
  }
}

interface CscSceneData {
  scene_key: string;
  scene_uuid: string;
  scene_graph_version_id: string;
  slugline: string;
  version_number: number;
}

async function upsertCharacterSceneContexts(
  supabaseUrl: string,
  serviceRoleKey: string,
  projectId: string,
  scene: CscSceneData,
  enrichment: SceneEnrichmentRecord,
  protagonistName: string | null,
  charactersByName: Map<string, { id: string; canonical_name: string; entity_type: string; meta_json: Record<string, unknown> | null }>,
): Promise<number> {
  try {
    const headers = {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
    };

    // Collect all unique character names involved in this scene
    const characterNames = new Set<string>();
    const alliesMap = new Map<string, string[]>();
    const antagonistsMap = new Map<string, string[]>();

    for (const rel of enrichment.relationship_context ?? []) {
      const charName = rel.character;
      if (!charName) continue;
      characterNames.add(charName);

      const isAlly = rel.relationship_type === "ally_of" || rel.relationship_type === "co_occurs";
      const isAntagonist = rel.relationship_type === "antagonist_of";

      if (isAlly) {
        alliesMap.set(charName, [...(alliesMap.get(charName) ?? []), charName]);
      }
      if (isAntagonist) {
        antagonistsMap.set(charName, [...(antagonistsMap.get(charName) ?? []), charName]);
      }
    }

    const contentHash = `v${scene.version_number}`; // version-based hash for staleness detection
    const protagonistEntityKey = protagonistName
      ? [...charactersByName.entries()].find(([, v]) => v.canonical_name === protagonistName)?.[0] ?? ""
      : "";

    let upserted = 0;
    for (const charName of characterNames) {
      const entity = charactersByName.get(charName.toLowerCase());
      if (!entity) continue;

      const metaJson = entity.meta_json ?? {};
      const isProtagonist =
        entity.entity_type === "character" &&
        (entity.canonical_name?.toLowerCase() === protagonistName?.toLowerCase() ||
          String(metaJson.isProtagonist) === "true" ||
          entity.canonical_name?.toLowerCase().includes("protagonist"));

      const allies = [...new Set(alliesMap.get(charName) ?? [])];
      const antagonists = [...new Set(antagonistsMap.get(charName) ?? [])];

      // Primary emotional state from protagonist_emotional_state or relationship_context
      const primaryState = enrichment.protagonist_emotional_state?.primary ?? "";
      const emotionalState = primaryState || enrichment.emotional_register || "";

      const contextRecord = {
        project_id: projectId,
        character_id: entity.id,
        scene_id: scene.scene_graph_version_id, // current scene_graph_versions.id
        character_name: entity.canonical_name,
        is_protagonist: isProtagonist,
        protagonist_name: isProtagonist ? null : (protagonistName ?? null),
        emotional_state: emotionalState,
        emotional_arc: enrichment.emotional_arc_direction || "",
        tension_level: enrichment.tension_level ?? 5,
        relationship_context: enrichment.relationship_context
          ?.filter(r => r.character === charName)
          .map(r => `${r.character} (${r.role}${r.relationship_type ? ` — ${r.relationship_type}` : ""})`)
          .join("; ") || null,
        thematic_tags: enrichment.thematic_tags ?? [],
        allies_in_scene: allies,
        antagonists_in_scene: antagonists,
        protagonist_id: isProtagonist ? entity.id : null,
        protagonist_name_ref: isProtagonist ? null : (protagonistName ?? null),
        emotional_beat: enrichment.narrative_beat ?? null,
        scene_number: scene.scene_key.match(/^\d+/)?.[0] ?? null,
        content_hash: contentHash,
        cached_at: new Date().toISOString(),
      };

      // Upsert — insert or update on conflict
      const upsertRes = await fetch(
        `${supabaseUrl}/rest/v1/character_scene_contexts`,
        {
          method: "POST",
          headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
          body: JSON.stringify(contextRecord),
        }
      );
      if (upsertRes.ok || upsertRes.status === 201) upserted++;
    }
    return upserted;
  } catch (err) {
    console.error("[upsertCharacterSceneContexts] error:", err);
    return 0;
  }
}

async function upsertSceneEnrichment(
  supabaseUrl: string,
  serviceRoleKey: string,
  projectId: string,
  results: EnrichmentResult[]
): Promise<number> {
  try {
    const headers = {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
    };

    let upserted = 0;
    for (const result of results) {
      // Mark existing as not current
      await fetch(
        `${supabaseUrl}/rest/v1/scene_enrichment?project_id=eq.${projectId}&scene_key=eq.${result.scene_key}&is_current=eq.true`,
        { method: "PATCH", headers, body: JSON.stringify({ is_current: false }) }
      );

      // Insert new current record
      const insertRes = await fetch(
        `${supabaseUrl}/rest/v1/scene_enrichment`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            project_id: projectId,
            scene_key: result.scene_key,
            is_current: true,
            tension_level: result.enrichment.tension_level,
            emotional_register: result.enrichment.emotional_register,
            protagonist_emotional_state: result.enrichment.protagonist_emotional_state,
            emotional_arc_direction: result.enrichment.emotional_arc_direction,
            relationship_context: result.enrichment.relationship_context,
            thematic_weight: result.enrichment.thematic_weight,
            narrative_beat: result.enrichment.narrative_beat,
            narrative_momentum: result.enrichment.narrative_momentum,
            thematic_tags: result.enrichment.thematic_tags,
            inputs_used: {
              computed_at: new Date().toISOString(),
              version: "1.0",
            },
          }),
        }
      );
      if (insertRes.ok) upserted++;
    }
    return upserted;
  } catch (err) {
    console.error("[upsert] error:", err);
    return 0;
  }
}

/* ─────────────────────────────────────────────────────────────────
   Main Handler
   ───────────────────────────────────────────────────────────────── */

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, sceneKeys, forceRefresh } = await req.json();

    if (!projectId) {
      return new Response(JSON.stringify({ error: "projectId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Fetch all upstream data ──
    const [scenes, entityRelations, beatSheet, protagonistName, charactersByName] = await Promise.all([
      fetchSceneGraph(supabaseUrl, serviceRoleKey, projectId),
      fetchEntityRelations(supabaseUrl, serviceRoleKey, projectId),
      fetchBeatSheet(supabaseUrl, serviceRoleKey, projectId),
      fetchProtagonistName(supabaseUrl, serviceRoleKey, projectId),
      fetchAllCharacters(supabaseUrl, serviceRoleKey, projectId),
    ]);

    if (!scenes || scenes.length === 0) {
      return new Response(JSON.stringify({ error: "No scenes found for project" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter to specific scenes if requested
    const targetScenes = sceneKeys?.length
      ? scenes.filter(s => sceneKeys.includes(s.scene_key))
      : scenes;

    // ── Enrich each scene ──
    const results: EnrichmentResult[] = [];
    let cscUpserted = 0;
    for (let i = 0; i < targetScenes.length; i++) {
      const scene = targetScenes[i];

      // Characters present: use characters_present from scene_graph_versions if available
      let charactersInScene: string[] = [];
      if (scene.characters_present && Array.isArray(scene.characters_present)) {
        charactersInScene = scene.characters_present;
      } else {
        // Fallback: extract from content
        const dialogueLines = (scene.content || "").match(/^[A-Z][A-Z'\s.]{1,30}$/gm) || [];
        charactersInScene = [...new Set(dialogueLines.map(l => l.trim()))];
      }

      const result = await enrichScene(
        scene,
        i,
        targetScenes.length,
        protagonistName,
        charactersInScene,
        entityRelations,
        beatSheet,
        supabaseUrl,
        serviceRoleKey,
        projectId,
        (scene as any).scene_graph_version_id ?? "",
      );

      results.push(result);

      // ── Phase 3.1: populate character_scene_contexts cache ──
      // sceneId forwarded from enrichScene via (scene as any).scene_graph_version_id
      const sceneForCsc: CscSceneData = {
        scene_key: (scene as any).scene_key ?? "",
        scene_uuid: (scene as any).scene_uuid ?? "",
        scene_graph_version_id: result.sceneId ?? "",
        slugline: (scene as any).slugline ?? "",
        version_number: (scene as any).version_number ?? 0,
      };
      if (sceneForCsc.scene_graph_version_id) {
        const before = cscUpserted;
        cscUpserted += await upsertCharacterSceneContexts(
          supabaseUrl,
          serviceRoleKey,
          projectId,
          sceneForCsc,
          result.enrichment,
          protagonistName,
          charactersByName,
        );
        if (cscUpserted === before) {
          console.error(`[csc] scene=${result.scene_key} version_id=${sceneForCsc.scene_graph_version_id} chars=${result.enrichment.relationship_context?.length ?? 0} — upsert returned 0`);
        }
      } else {
        console.error(`[csc] MISSING scene_graph_version_id for scene=${result.scene_key}`);
      }
    }

    // ── Persist to scene_enrichment table ──
    const upserted = await upsertSceneEnrichment(supabaseUrl, serviceRoleKey, projectId, results);

    return new Response(JSON.stringify({
      projectId,
      scenesEnriched: results.length,
      upserted,
      cscUpserted,  // character_scene_contexts rows written
      // DEBUG: show first scene's IDs from fetchSceneGraph
      debugSceneIds: scenes[0] ? { scene_key: scenes[0].scene_key, scene_uuid: scenes[0].scene_uuid, scene_graph_version_id: (scenes[0] as any)['scene_graph_version_id'], version_number: (scenes[0] as any).version_number, slugline: scenes[0].slugline } : null,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
