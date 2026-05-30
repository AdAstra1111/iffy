/**
 * cipExtractor.ts — Canon Identity Profile Extraction
 *
 * Phase 4.3 P0: Deterministic rule-based CIP extraction from upstream documents.
 * Extracts Facts, Payload, Theme, and Shape from approved Concept Brief,
 * Treatment, Character Bible, Story Outline, and Beat Sheet.
 *
 * Rule-based (not LLM) ensures determinism — same documents → same CIP every time.
 * ~50 lines of extraction logic. No external dependencies beyond document text.
 */
import type { StoredCIP } from "./ncpTypes.ts";

// ── Helpers ──

function extractCharacterNames(text: string): Array<{ name: string; role: string }> {
  if (!text) return [];
  const chars: Array<{ name: string; role: string }> = [];
  // Pattern 1: "**Name:** Description" or "NAME: Description"
  const namePattern = /(?:\*\*)?([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)(?:\*\*)?\s*:\s*(.+?)(?:\n|$)/g;
  let match;
  while ((match = namePattern.exec(text)) !== null) {
    const name = match[1].trim();
    const desc = match[2].trim().toLowerCase();
    if (name.length > 1 && name.length < 40) {
      let role = "supporting";
      if (/protagonist|lead|main|hero|heroine/i.test(desc)) role = "protagonist";
      else if (/antagonist|villain|enemy|opponent/i.test(desc)) role = "antagonist";
      chars.push({ name, role });
    }
  }
  return chars.slice(0, 12); // Max 12 characters
}

function extractKeyEvents(text: string): Array<{ description: string }> {
  if (!text) return [];
  const events: Array<{ description: string }> = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Bullet points or numbered events
    if (/^[-•*]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
      const clean = trimmed.replace(/^[-•*\d]+[.)]\s*/, "").trim();
      if (clean.length > 10 && clean.length < 200) {
        events.push({ description: clean });
      }
    }
  }
  return events.slice(0, 20);
}

function extractSetting(text: string): { world: string; time_period: string } {
  if (!text) return { world: "", time_period: "" };
  const lower = text.toLowerCase();
  let world = "";
  let time_period = "";

  const worldMatch = lower.match(/set(?:ting)?\s*(?:in|on)\s+([^.\n]+)/i);
  if (worldMatch) world = worldMatch[1].trim();

  const timeMatch = lower.match(/(?:time\s*period|era|year\s+|century)\s*[:\s]+([^.\n]+)/i);
  if (timeMatch) time_period = timeMatch[1].trim();
  else if (/(?:present|contemporary|202\d|modern)/i.test(lower)) time_period = "Contemporary";
  else if (/(?:past|historical|19\d\d|18\d\d)/i.test(lower)) time_period = "Historical";
  else if (/(?:future|futuristic|2[1-9]\d\d)/i.test(lower)) time_period = "Future";

  return { world, time_period };
}

function extractThemeQuestion(text: string): string {
  if (!text) return "Not specified";
  // Look for theme section
  const themeSection = text.match(/theme[^:]*:\s*([^.\n]{10,})/i);
  if (themeSection) return themeSection[1].trim();
  // Fall back to dramatic question
  const questionMatch = text.match(/(?:question|dramatic\s*question|what\s+if)\s*[:\s]\s*([^.\n]{10,})/i);
  if (questionMatch) return questionMatch[1].trim();
  return "Not specified";
}

function extractThreeSentenceSummary(text: string): string {
  if (!text) return "";
  // Look for logline or premise
  const loglineMatch = text.match(/(?:logline|premise|summary)\s*:\s*([^]{50,300})/i);
  if (loglineMatch) return loglineMatch[1].trim().slice(0, 300);
  return text.slice(0, 300).trim();
}

function countBeatSheetScenes(beatSheetText: string): number {
  if (!beatSheetText) return 85;
  const beatCount = beatSheetText.split(/\n/).filter(l => /^\d+[.)]/.test(l.trim())).length;
  return Math.max(40, Math.min(130, beatCount * 3));
}

function extractActDistribution(beatSheetText: string): Array<{ act: number; estimated_scenes: number }> {
  if (!beatSheetText) return [{ act: 1, estimated_scenes: 25 }, { act: 2, estimated_scenes: 45 }, { act: 3, estimated_scenes: 20 }];
  const total = countBeatSheetScenes(beatSheetText);
  return [
    { act: 1, estimated_scenes: Math.round(total * 0.3) },
    { act: 2, estimated_scenes: Math.round(total * 0.5) },
    { act: 3, estimated_scenes: Math.round(total * 0.2) },
  ];
}

function extractTrajectory(treatmentText: string): string {
  if (!treatmentText) return "rising_falling";
  const lower = treatmentText.toLowerCase();
  if (/oscillat/i.test(lower)) return "oscillating";
  if (/relentless|ever.rising|constant/i.test(lower)) return "rising";
  return "rising_falling";
}

function extractKeyPositions(beatSheetText: string): Array<{ label: string; estimated_scene: number }> {
  if (!beatSheetText) return [];
  const positions: Array<{ label: string; estimated_scene: number }> = [];
  const keyBeatPatterns = [
    { pattern: /opening/i, label: "Opening Image" },
    { pattern: /inciting/i, label: "Inciting Incident" },
    { pattern: /lock.?in|break.?into.?2/i, label: "Lock In" },
    { pattern: /midpoint/i, label: "Midpoint" },
    { pattern: /all.?is.?lost/i, label: "All Is Lost" },
    { pattern: /dark.?night/i, label: "Dark Night of the Soul" },
    { pattern: /break.?into.?3|final.?push/i, label: "Break Into Three" },
    { pattern: /climax/i, label: "Climax" },
    { pattern: /final.?image|denouement/i, label: "Final Image" },
  ];
  const lines = beatSheetText.split("\n");
  const totalBeats = lines.filter(l => /^\d+[.)]/.test(l.trim())).length;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    for (const kbp of keyBeatPatterns) {
      if (kbp.pattern.test(trimmed) && !positions.find(p => p.label === kbp.label)) {
        const scenePos = Math.round(((i + 1) / Math.max(1, lines.length)) * totalBeats * 3);
        positions.push({ label: kbp.label, estimated_scene: Math.max(1, scenePos) });
      }
    }
  }
  return positions;
}

function extractGenre(conceptBrief: string, treatment: string): string {
  const text = `${conceptBrief || ""} ${treatment || ""}`;
  const genreMatch = text.match(/genre[^:]*:\s*([^.\n]+)/i);
  if (genreMatch) return genreMatch[1].trim().split(/[,/]/)[0].trim();
  return "Unknown";
}

function extractPrimitives(treatment: string, characterBible: string): StoredCIP["payload"]["primitives"] {
  const text = `${treatment || ""} ${characterBible || ""}`.toLowerCase();
  const primitives: StoredCIP["payload"]["primitives"] = {};
  if (/\b(pressure|stakes|tension|urgent|escalat)\b/.test(text)) primitives.pressure = "Escalation-driven pressure";
  if (/\b(transform|change|growth|evolve|becomes?\s+)\b/.test(text)) primitives.transformation = "Internal character change";
  if (/\b(connect|relationship|bond|trust|love|friend)\b/.test(text)) primitives.connection = "Relational dynamics";
  if (/\b(wonder|awe|mystery|discover|reveal|secret|unveil)\b/.test(text)) primitives.wonder = "Discovery-driven wonder";
  if (/\b(meaning|purpose|significance|understand|lesson|truth)\b/.test(text)) primitives.meaning = "Thematic resonance";
  return primitives;
}

// ── Main Extraction ──

/**
 * Extract a Canon Identity Profile from upstream documents.
 * Deterministic: same input always produces the same output.
 *
 * @returns StoredCIP object or null if insufficient data.
 */
export function extractCIP(
  conceptBrief: string | null,
  treatment: string | null,
  characterBible: string | null,
  storyOutline: string | null,
  beatSheet: string | null,
  projectGenre?: string,
): StoredCIP | null {
  // Require at minimum treatment + beat sheet (two most critical docs)
  if (!treatment && !beatSheet) return null;

  const characters = characterBible ? extractCharacterNames(characterBible) : [];
  const keyEvents = storyOutline ? extractKeyEvents(storyOutline) : [];
  const setting = extractSetting(treatment || characterBible || "");
  const genre = projectGenre || extractGenre(conceptBrief || "", treatment || "");
  const primitives = extractPrimitives(treatment || "", characterBible || "");
  const totalScenes = countBeatSheetScenes(beatSheet || "");
  const actDist = extractActDistribution(beatSheet || "");

  return {
    version: 1,
    extracted_at: new Date().toISOString(),
    extracted_from: {
      concept_brief_version_id: undefined,
      treatment_version_id: "",
      character_bible_version_id: "",
      story_outline_version_id: "",
      beat_sheet_version_id: "",
    },
    facts: {
      characters: characters.slice(0, 12),
      key_events: keyEvents.slice(0, 20),
      relationships: [],
      setting,
    },
    payload: {
      genre,
      primitives,
    },
    theme: {
      central_question: extractThemeQuestion(treatment || characterBible || ""),
    },
    narrative_shape: {
      total_estimated_scenes: totalScenes,
      act_distribution: actDist,
      trajectory: extractTrajectory(treatment || ""),
      key_positions: extractKeyPositions(beatSheet || ""),
      three_sentence_summary: extractThreeSentenceSummary(treatment || conceptBrief || ""),
    },
  };
}

/**
 * Count populated fields in a CIP object for telemetry.
 */
export function countCIPSize(cip: StoredCIP): number {
  let count = 0;
  count += cip.facts.characters.length;
  count += cip.facts.key_events.length;
  count += cip.facts.relationships.length;
  count += cip.facts.setting.world ? 1 : 0;
  count += cip.facts.setting.time_period ? 1 : 0;
  count += cip.payload.genre ? 1 : 0;
  count += Object.keys(cip.payload.primitives).length;
  count += cip.theme.central_question ? 1 : 0;
  count += cip.narrative_shape.key_positions.length;
  count += cip.narrative_shape.three_sentence_summary ? 1 : 0;
  return count;
}