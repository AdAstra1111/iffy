/**
 * Large-Risk Document Router — Single Source of Truth
 *
 * Determines whether a doc_type is "large-risk" (prone to LLM summarization)
 * and provides the correct chunking strategy + chunk plan.
 *
 * Used by: generate-document, dev-engine-v2, auto-run.
 * ALL generation/rewrite paths MUST consult this before single-pass operations.
 */ // ── Strategy Types ──
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
  "feature_script",
]);

const BEAT_SEQUENTIAL_DOC_TYPES = new Set([
  "production_draft",
]);

]);
const ALL_LARGE_RISK = new Set([
  ...EPISODIC_DOC_TYPES,
  ...SECTIONED_DOC_TYPES,
  ...SCENE_INDEXED_DOC_TYPES,
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
    // feature_script: one chunk per beat from the beat sheet
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
