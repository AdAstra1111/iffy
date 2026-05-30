/**
 * Large-Risk Document Router — Single Source of Truth
 *
 * Determines whether a doc_type is "large-risk" (prone to LLM summarization)
 * and provides the correct chunking strategy + chunk plan.
 *
 * Used by: generate-document, dev-engine-v2, auto-run.
 * ALL generation/rewrite paths MUST consult this before single-pass operations.
 */
import type { SequenceGroup, ScenePlanEntry } from "./ncpTypes.ts";
import { isKeyTurningPoint, defaultPurposeForPosition } from "./ncpTypes.ts";

// ── Strategy Types ──
// ── Large-Risk Doc Type Registry ──
const EPISODIC_DOC_TYPES = new Set([
  "episode_grid",
  "episode_beats",
  "vertical_episode_beats",
  "episode_script",
  "season_scripts_bundle",
  "season_master_script",
  "season_script"
]);
const SECTIONED_DOC_TYPES = new Set([
  "screenplay_draft",
  "long_treatment",
  "treatment",
  "story_outline",
  "beat_sheet"
]);
const SCENE_INDEXED_DOC_TYPES = new Set([
  // feature_script now routes to sequence_indexed (see strategyFor)
]);
export const SEQUENCE_INDEXED_DOC_TYPES = new Set([
  "feature_script",
]);

const BEAT_SEQUENTIAL_DOC_TYPES = new Set([
  "production_draft",
]);
const ALL_LARGE_RISK = new Set([
  ...EPISODIC_DOC_TYPES,
  ...SECTIONED_DOC_TYPES,
  ...SCENE_INDEXED_DOC_TYPES,
  ...SEQUENCE_INDEXED_DOC_TYPES,
  ...BEAT_SEQUENTIAL_DOC_TYPES
]);
// ── Standard Save the Cat beat-to-act boundary mapping ─────────────────
// Used by feature_script chunk plan to partition beats into parallel act groups.
// Act 1: beats 1-15 (Opening Image → Break into Two)
// Act 2a: beats 16-25 (B Story → Midpoint)
// Act 2b: beats 26-40 (Bad Guys Close In → Dark Night of the Soul)
// Act 3: beats 41+ (Break into Three → Final Image)
export const BEAT_ACT_BOUNDARIES = [
  {
    act: 1,
    maxBeatNumber: 15
  },
  {
    act: 2,
    maxBeatNumber: 25
  },
  {
    act: 3,
    maxBeatNumber: 40
  },
  {
    act: 4,
    maxBeatNumber: Infinity
  }
];
/** Resolve which act a beat belongs to based on its number. */ export function resolveBeatAct(beatNumber) {
  for (const boundary of BEAT_ACT_BOUNDARIES){
    if (beatNumber <= boundary.maxBeatNumber) return boundary.act;
  }
  return 4; // Fallback: last act
}
/**
 * Returns true if this doc_type is large-risk and MUST use chunked generation/rewrite.
 * Single-pass LLM calls are NEVER allowed for these types.
 */ export function isLargeRiskDocType(docType) {
  return ALL_LARGE_RISK.has(docType);
}
/**
 * Returns the chunking strategy for a doc_type.
 * Throws if the doc_type is not large-risk.
 */ export function strategyFor(docType) {
  if (EPISODIC_DOC_TYPES.has(docType)) return "episodic_indexed";
  if (BEAT_SEQUENTIAL_DOC_TYPES.has(docType)) return "beat_sequential";
  if (SECTIONED_DOC_TYPES.has(docType)) return "sectioned";
  if (SEQUENCE_INDEXED_DOC_TYPES.has(docType)) return "sequence_indexed";
  if (SCENE_INDEXED_DOC_TYPES.has(docType)) return "scene_indexed";
  throw new Error(`[largeRiskRouter] ${docType} is not a large-risk doc type`);
}
/**
 * Episodic docs execute one episode per unit.
 * This is the authoritative default for episode-indexed generation + rewrite.
 */ const DEFAULT_EPISODIC_BATCH_SIZE = 1;
/**
 * Default sections for non-episodic large-risk docs.
 */ const TREATMENT_SECTIONS = [
  "act_1_setup",
  "act_2a_rising_action",
  "act_2b_complications",
  "act_3_climax_resolution"
];
const SCRIPT_SECTIONS = [
  "act_1",
  "act_2a",
  "act_2b",
  "act_3"
];
// CHARACTER_BIBLE uses per-character generation (not sectioned/chunked)
// See generate-document/index.ts for the dedicated pathway.
// Story outline: 4-act structure (Act 1 | Act 2a | Act 2b | Act 3)
// Used for both feature and vertical drama to ensure consistent act-by-act chunking
// and prevent Act 3 from being silently dropped during rewrite.
const STORY_OUTLINE_SECTIONS = [
  "act_1_setup",
  "act_2a_rising_action",
  "act_2b_complications",
  "act_3_climax_resolution"
];
// Feature beat sheet: 4 structural acts, each with 10-15 named beats (~40-60 total)
const BEAT_SHEET_SECTIONS = [
  "act_1_beats",
  "act_2a_beats",
  "act_2b_beats",
  "act_3_beats"
];
/**
 * Build a deterministic chunk plan for a large-risk doc type.
 *
 * @param docType - the document type
 * @param context - project context needed to build the plan
 * @returns ChunkPlan with ordered chunk entries
 */ export function chunkPlanFor(docType, context = {}) {
  const strategy = strategyFor(docType);
  if (strategy === "episodic_indexed") {
    const episodeCount = context.episodeCount;
    if (!episodeCount || episodeCount < 1) {
      throw new Error(`[largeRiskRouter] episodic doc type "${docType}" requires episodeCount > 0, got ${episodeCount}`);
    }
    const batchSize = context.batchSize || DEFAULT_EPISODIC_BATCH_SIZE;
    const chunks = [];
    let chunkIndex = 0;
    for(let start = 1; start <= episodeCount; start += batchSize){
      const end = Math.min(start + batchSize - 1, episodeCount);
      const isSingleEpisodeUnit = start === end;
      chunks.push({
        chunkIndex,
        chunkKey: isSingleEpisodeUnit ? `E${String(start).padStart(2, "0")}` : `E${String(start).padStart(2, "0")}-E${String(end).padStart(2, "0")}`,
        label: isSingleEpisodeUnit ? `Episode ${start}` : `Episodes ${start}–${end}`,
        episodeStart: start,
        episodeEnd: end
      });
      chunkIndex++;
    }
    return {
      strategy,
      chunks,
      totalChunks: chunks.length,
      docType,
      episodeCount
    };
  }
  if (strategy === "sectioned") {
    let sections;
    if (docType === "treatment" || docType === "long_treatment") {
      sections = TREATMENT_SECTIONS;
    } else if (docType === "story_outline") {
      sections = STORY_OUTLINE_SECTIONS;
    } else if (docType === "beat_sheet") {
      sections = BEAT_SHEET_SECTIONS;
    } else {
      // Scripts: act-based
      sections = SCRIPT_SECTIONS;
    }
    const chunks = sections.map((sec, i)=>({
        chunkIndex: i,
        chunkKey: sec,
        label: sec.replace(/_/g, " ").replace(/\b\w/g, (c)=>c.toUpperCase()),
        sectionId: sec
      }));
    return {
      strategy,
      chunks,
      totalChunks: chunks.length,
      docType
    };
  }
  if (strategy === "beat_sequential") {
    // feature_script: one chunk per beat from the beat sheet
    if (docType === "production_draft") {
      // production_draft: one chunk per scene from scene_graph
      const scenes = context.scenes;
      if (!scenes || scenes.length < 1) {
        throw new Error(`[largeRiskRouter] beat_sequential doc type "${docType}" requires scenes > 0, got ${scenes?.length ?? 0}`);
      }
      const chunks = scenes.map((scene, i)=>({
          chunkIndex: i,
          chunkKey: `scene_${String(scene.number).padStart(3, "0")}`,
          label: `Scene ${scene.number}: ${scene.heading}`
        }));
      return {
        strategy,
        chunks,
        totalChunks: chunks.length,
        docType
      };
    }
    // legacy feature_script beat path (should not be hit since feature_script routes to sequence_indexed)
    const beats = context.beats;
    if (!beats || beats.length < 1) {
      throw new Error(`[largeRiskRouter] beat_sequential doc type "${docType}" requires beats > 0, got ${beats?.length ?? 0}`);
    }
    const chunks = beats.map((beat, i)=>({
        chunkIndex: i,
        chunkKey: `beat_${String(beat.number).padStart(2, "0")}`,
        label: `Beat ${beat.number}: ${beat.title}`,
        actNumber: resolveBeatAct(beat.number)
      }));
    return {
      strategy,
      chunks,
      totalChunks: chunks.length,
      docType
    };
  }
  if (strategy === "scene_indexed") {
    if (!context.sceneCount || context.sceneCount < 1) {
      // Fall back to sectioned strategy if no real scene count from DB
      console.warn(`[largeRiskRouter] scene_indexed requested for "${docType}" but no sceneCount — falling back to sectioned`);
      const sections = SCRIPT_SECTIONS;
      const chunks = sections.map((sec, i)=>({
          chunkIndex: i,
          chunkKey: sec,
          label: sec.replace(/_/g, " ").replace(/\b\w/g, (c)=>c.toUpperCase()),
          sectionId: sec
        }));
      return {
        strategy: "sectioned",
        chunks,
        totalChunks: chunks.length,
        docType
      };
    }
    const sceneCount = context.sceneCount;
    const batchSize = context.batchSize || 1;
    const chunks = [];
    let chunkIndex = 0;
    for(let start = 1; start <= sceneCount; start += batchSize){
      const end = Math.min(start + batchSize - 1, sceneCount);
      chunks.push({
        chunkIndex,
        chunkKey: `SC${String(start).padStart(2, "0")}-SC${String(end).padStart(2, "0")}`,
        label: `Scenes ${start}–${end}`
      });
      chunkIndex++;
    }
    return {
      strategy: "scene_indexed",
      chunks,
      totalChunks: chunks.length,
      docType
    };
  }
  // ── Phase 2A: sequence_indexed strategy ──
  // Groups scenes into sequences of 4-7 for coherent sequence-aware generation.
  if (strategy === "sequence_indexed") {
    const scenes = context.scenes;
    const sceneCount = context.sceneCount;
    if ((!scenes || scenes.length === 0) && (!sceneCount || sceneCount < 1)) {
      // Fall back to scene_indexed (legacy per-scene) if no scene data
      console.warn(`[largeRiskRouter] sequence_indexed requested for "${docType}" but no scene data — falling back to scene_indexed`);
      return chunkPlanFor(docType, { ...context, sceneCount: sceneCount || 50 });
    }

    // Generate sequences: use sequence_map from NCP if provided, otherwise derive
    let sequences: SequenceGroup[];
    if (context.sequenceMap && Array.isArray(context.sequenceMap) && context.sequenceMap.length > 0) {
      // Use NCP-provided sequence map
      sequences = context.sequenceMap.map((sm: any, i: number) => ({
        number: i + 1,
        name: sm.name || `Sequence ${i + 1}`,
        purpose: sm.purpose || "transition",
        scene_range: sm.scene_range || [1, 1],
        beat_range: sm.beat_range || [1, 1],
        scene_count: sm.scene_count || 1,
        act: sm.act || 1,
        function_description: sm.function_description || "",
        pacing_directive: sm.pacing_directive || "medium",
      }));
    } else if (scenes && Array.isArray(scenes) && scenes.length > 0) {
      // Deterministic grouping from Scene Plan data
      sequences = groupScenesIntoSequences(scenes);
    } else {
      // Fall back to scene_indexed with per-scene chunks
      console.warn(`[largeRiskRouter] sequence_indexed: no scenes array, falling back to scene_indexed`);
      return chunkPlanFor(docType, { ...context, sceneCount: sceneCount || 50 });
    }

    const chunks = [];
    for (let i = 0; i < sequences.length; i++) {
      const seq = sequences[i];
      const [startScene, endScene] = seq.scene_range;
      chunks.push({
        chunkIndex: i,
        chunkKey: `SEQ${String(seq.number).padStart(2, "0")}-SC${String(startScene).padStart(2, "0")}-SC${String(endScene).padStart(2, "0")}`,
        label: `Sequence ${seq.number}: ${seq.name} (Scenes ${startScene}–${endScene})`,
        sequenceNumber: seq.number,
        sequenceName: seq.name,
        sequencePurpose: seq.purpose,
        sequenceSceneRange: seq.scene_range,
        sequenceBeatRange: seq.beat_range,
        sequenceAct: seq.act,
        sequencePacingDirective: seq.pacing_directive,
        sequenceFunctionDescription: seq.function_description,
      });
    }

    return {
      strategy: "sequence_indexed",
      chunks,
      totalChunks: chunks.length,
      docType,
      sequences,
    };
  }
  throw new Error(`[largeRiskRouter] Unknown strategy: ${strategy}`);
}
/**
 * Check if a doc_type is episodic (requires episode count).
 */ export function isEpisodicDocType(docType) {
  return EPISODIC_DOC_TYPES.has(docType);
}
/**
 * Check if a doc_type uses beat_sequential strategy.
 */ export function isBeatSequentialDocType(docType) {
  return BEAT_SEQUENTIAL_DOC_TYPES.has(docType);
}
/** Check if a doc_type uses sequence_indexed strategy. */
export function isSequenceIndexedDocType(docType) {
  return SEQUENCE_INDEXED_DOC_TYPES.has(docType);
}

// ── Phase 2A: Deterministic Sequence Grouping ────────────────────────────

/**
 * Group scenes into sequences deterministically.
 *
 * Rules:
 * - Acts boundaries are hard breaks (scenes never span acts)
 * - Beat boundaries are preserved (scenes from the same beat are never split)
 * - Key turning points (midpoint, climax, inciting incident) start new sequences
 * - Target 4-7 scenes per sequence (minimum 3, maximum 8)
 * - Never drops or duplicates scenes
 *
 * Input: ScenePlanEntry[] (55-90 scenes)
 * Output: SequenceGroup[] (10-15 sequences)
 *
 * Fully deterministic — same input always produces same output.
 * No LLM calls, no randomness.
 */
export function groupScenesIntoSequences(scenes: ScenePlanEntry[]): SequenceGroup[] {
  if (!scenes || scenes.length === 0) return [];

  const sorted = [...scenes].sort((a, b) => a.scene_number - b.scene_number);

  // 1. Group by beat number
  const beatMap = new Map<number, ScenePlanEntry[]>();
  for (const scene of sorted) {
    const bn = scene.source_beat_number;
    if (!beatMap.has(bn)) beatMap.set(bn, []);
    beatMap.get(bn)!.push(scene);
  }

  // 2. Sort beat numbers
  const beatNumbers = [...beatMap.keys()].sort((a, b) => a - b);

  // 3. Determine hard break beats (where a new sequence must start)
  const hardBreakBeats = new Set<number>();
  for (let i = 0; i < beatNumbers.length; i++) {
    const bn = beatNumbers[i];
    const scenes = beatMap.get(bn)!;
    const title = (scenes[0]?.source_beat_title || "").toLowerCase();
    const act = resolveBeatAct(bn);

    // Act transition → always hard break
    if (i > 0) {
      const prevAct = resolveBeatAct(beatNumbers[i - 1]);
      if (prevAct !== act) hardBreakBeats.add(bn);
    }

    // Key turning point → always hard break
    if (isKeyTurningPoint(title)) hardBreakBeats.add(bn);

    // First beat of the entire screenplay → start a new sequence
    if (i === 0) hardBreakBeats.add(bn);
  }

  // 4. Group beats into sequences
  const sequences: SequenceGroup[] = [];
  let currentBeats: number[] = [];
  let currentSceneCount = 0;
  let currentAct = beatNumbers.length > 0 ? resolveBeatAct(beatNumbers[0]) : 1;

  for (const bn of beatNumbers) {
    const beatScenes = beatMap.get(bn)!;
    const beatAct = resolveBeatAct(bn);

    // Determine if we should break before this beat
    const isHardBreak = hardBreakBeats.has(bn);
    const isActChange = beatAct !== currentAct && currentBeats.length > 0;
    const isTooLarge = currentSceneCount + beatScenes.length > 7 && currentSceneCount >= 4;

    if ((isHardBreak || isActChange || isTooLarge) && currentBeats.length > 0) {
      sequences.push(buildSequence(sequences.length + 1, currentBeats, beatMap, currentAct));
      currentBeats = [];
      currentSceneCount = 0;
    }

    currentBeats.push(bn);
    currentSceneCount += beatScenes.length;
    currentAct = beatAct;
  }

  // Handle remaining beats
  if (currentBeats.length > 0) {
    sequences.push(buildSequence(sequences.length + 1, currentBeats, beatMap, currentAct));
  }

  // 5. Ensure no sequence has < 3 scenes — merge small sequences with neighbors
  return mergeSmallSequences(sequences, beatMap);
}

function buildSequence(
  number: number,
  beatNumbers: number[],
  beatMap: Map<number, ScenePlanEntry[]>,
  act: number,
): SequenceGroup {
  const allScenes: ScenePlanEntry[] = [];
  for (const bn of beatNumbers) {
    const beatScenes = beatMap.get(bn) || [];
    allScenes.push(...beatScenes);
  }
  allScenes.sort((a, b) => a.scene_number - b.scene_number);

  const startScene = allScenes[0]?.scene_number || 1;
  const endScene = allScenes[allScenes.length - 1]?.scene_number || 1;
  const firstBeat = beatNumbers[0];
  const lastBeat = beatNumbers[beatNumbers.length - 1];
  const sceneCount = allScenes.length;

  // Count sequences in this act to determine position
  const seqInAct = countSequencesInActBefore(act, number);

  return {
    number,
    name: deriveSequenceName(beatNumbers, beatMap, number),
    purpose: defaultPurposeForPosition(act, seqInAct),
    scene_range: [startScene, endScene],
    beat_range: [firstBeat, lastBeat],
    scene_count: sceneCount,
    act,
    function_description: deriveSequenceDescription(beatNumbers, beatMap),
    pacing_directive: derivePacingDirective(beatNumbers, beatMap, act),
  };
}

function deriveSequenceName(
  beatNumbers: number[],
  beatMap: Map<number, ScenePlanEntry[]>,
  seqNumber: number,
): string {
  const firstBeatScenes = beatMap.get(beatNumbers[0]) || [];
  const lastBeatScenes = beatMap.get(beatNumbers[beatNumbers.length - 1]) || [];

  const firstTitle = firstBeatScenes[0]?.source_beat_title || "";
  const lastTitle = lastBeatScenes[lastBeatScenes.length - 1]?.source_beat_title || "";

  // If single beat, use beat title
  if (beatNumbers.length === 1 && firstTitle) return firstTitle;

  // Otherwise use range: "Midpoint → All Is Lost"
  const firstShort = firstTitle.split("(")[0].trim();
  const lastShort = lastTitle.split("(")[0].trim();
  return firstShort && lastShort ? `${firstShort} → ${lastShort}` : `Sequence ${seqNumber}`;
}

function deriveSequenceDescription(
  beatNumbers: number[],
  beatMap: Map<number, ScenePlanEntry[]>,
): string {
  const allScenes: ScenePlanEntry[] = [];
  for (const bn of beatNumbers) {
    const beatScenes = beatMap.get(bn) || [];
    allScenes.push(...beatScenes);
  }
  if (allScenes.length === 0) return "";

  const firstSummary = allScenes[0]?.summary || "";
  const lastOutcome = allScenes[allScenes.length - 1]?.scene_outcome || "";
  return firstSummary.length > 80
    ? firstSummary.slice(0, 80).trim() + "… → " + (lastOutcome.slice(0, 40).trim() || "outcome")
    : (firstSummary || "") + (lastOutcome ? " → " + lastOutcome.slice(0, 40).trim() : "");
}

function derivePacingDirective(
  _beatNumbers: number[],
  _beatMap: Map<number, ScenePlanEntry[]>,
  act: number,
): PacingDirective {
  // Default pacing by act: Act 1=medium, Act 2=escalating, Act 3=fast
  if (act === 1) return "medium";
  if (act === 2) return "escalating";
  return "fast";
}

// Derive PacingDirective locally to avoid circular dependency
type PacingDirective = "slow" | "medium" | "fast" | "escalating" | "de-escalating" | "oscillating";

let _seqInActCache = new Map<string, number>();

function countSequencesInActBefore(act: number, seqNumber: number): number {
  const key = `${act}_${seqNumber}`;
  if (_seqInActCache.has(key)) return _seqInActCache.get(key)!;
  // Simple heuristic: first sequence in an act is position 1
  // We'll count backwards to find the first sequence with this act
  let count = 1;
  _seqInActCache.set(key, count);
  return count;
}

/** Reset the sequence-in-act counter cache. Used in tests. */
export function resetSeqInActCache(): void {
  _seqInActCache = new Map();
}

function mergeSmallSequences(
  sequences: SequenceGroup[],
  beatMap: Map<number, ScenePlanEntry[]>,
): SequenceGroup[] {
  if (sequences.length <= 1) return sequences;

  const result: SequenceGroup[] = [];
  let i = 0;

  while (i < sequences.length) {
    let current = sequences[i];
    const currentBeatScenes: ScenePlanEntry[] = [];
    for (const bn of getBeatNumbersForSequence(current, beatMap)) {
      const bs = beatMap.get(bn) || [];
      currentBeatScenes.push(...bs);
    }
    let currentSceneCount = currentBeatScenes.length;

    // Merge with next if current is too small (< 3 scenes), unless hitting a key turning point
    while (i + 1 < sequences.length && currentSceneCount < 3) {
      const next = sequences[i + 1];
      const nextBeatScenes: ScenePlanEntry[] = [];
      for (const bn of getBeatNumbersForSequence(next, beatMap)) {
        const bs = beatMap.get(bn) || [];
        nextBeatScenes.push(...bs);
      }

      // Don't merge if next sequence starts with a key turning point
      const nextFirstBeatScenes = beatMap.get(next.beat_range[0]) || [];
      const nextFirstTitle = nextFirstBeatScenes[0]?.source_beat_title || "";
      if (isKeyTurningPoint(nextFirstTitle) && currentBeatScenes.length > 0) break;

      // Merge
      const mergedBeatRange: [number, number] = [current.beat_range[0], Math.max(current.beat_range[1], next.beat_range[1])];
      const mergedScenes = [...currentBeatScenes, ...nextBeatScenes].sort((a, b) => a.scene_number - b.scene_number);
      current = {
        number: current.number,
        name: `${current.name.split("→")[0].trim()} → ${next.name.split("→")[next.name.split("→").length - 1].trim()}`,
        purpose: current.purpose,
        scene_range: [current.scene_range[0], Math.max(current.scene_range[1], next.scene_range[1])],
        beat_range: mergedBeatRange,
        scene_count: mergedScenes.length,
        act: current.act,
        function_description: current.function_description || next.function_description,
        pacing_directive: current.pacing_directive,
      };
      currentSceneCount = mergedScenes.length;
      currentBeatScenes.push(...nextBeatScenes);
      i++;
    }

    result.push(current);
    i++;
  }

  // Renumber
  return result.map((seq, idx) => ({ ...seq, number: idx + 1 }));
}

function getBeatNumbersForSequence(seq: SequenceGroup, _beatMap: Map<number, ScenePlanEntry[]>): number[] {
  const result: number[] = [];
  for (let b = seq.beat_range[0]; b <= seq.beat_range[1]; b++) {
    if (_beatMap.has(b)) result.push(b);
  }
  return result;
}

// ── ChunkPlan types ──

/** Re-export for use by other modules */
export interface ChunkPlan {
  strategy: string;
  chunks: ChunkPlanEntry[];
  totalChunks: number;
  docType: string;
  episodeCount?: number;
  sequences?: SequenceGroup[];
}

export interface ChunkPlanEntry {
  chunkIndex: number;
  chunkKey: string;
  label: string;
  episodeStart?: number;
  episodeEnd?: number;
  sectionId?: string;
  actNumber?: number;
  // Phase 2A sequence fields:
  sequenceNumber?: number;
  sequenceName?: string;
  sequencePurpose?: string;
  sequenceSceneRange?: [number, number];
  sequenceBeatRange?: [number, number];
  sequenceAct?: number;
  sequencePacingDirective?: string;
  sequenceFunctionDescription?: string;
}