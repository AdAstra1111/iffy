/**
 * Scene Expansion Engine — Phase 2A.5
 *
 * DETERMINISTIC scene count computation, act distribution, beat allocation,
 * scene function assignment, and sequence grouping.
 *
 * Sits between Beat Sheet and generateScenePlanAndNCP().
 * NO LLM calls. Pure algorithm.
 *
 * Pipeline: Beat Sheet → SPO → scene slots → Scene Plan + NCP → Feature Script
 */
import type {
  SceneExpansionPlan,
  ActSceneBudget,
  BeatSceneAllocation,
  ExpansionSequence,
  ExpansionSceneSlot,
  ProjectMetadata,
  SequencePurpose,
  PacingDirective,
} from "./ncpTypes.ts";

// ── Constants ──

/** Default scene density: scenes per minute of runtime */
const DEFAULT_DENSITY = 0.85;

/** Scene range clamp */
const MIN_SCENES = 75;
const MAX_SCENES = 130;

/** Genre modifiers */
const GENRE_MODIFIERS: Record<string, number> = {
  thriller: 1.0,
  horror: 0.95,
  action: 1.05,
  drama: 0.85,
  comedy: 0.9,
  sci_fi: 1.0,
  adventure: 1.05,
  historical: 0.9,
  romance: 0.85,
  mystery: 1.1,
};

/** Act distribution percentages (sums to 100%) */
const ACT_DISTRIBUTION: { act: number; label: string; pct: number }[] = [
  { act: 1, label: "Act 1: Setup", pct: 18 },
  { act: 2, label: "Act 2A: Rising Action", pct: 30 },
  { act: 3, label: "Act 2B: Complications", pct: 32 },
  { act: 4, label: "Act 3: Climax & Resolution", pct: 20 },
];

/** Beat categories with expansion weights */
const MAJOR_BEAT_KEYWORDS = [
  "inciting", "catalyst", "break into two", "break into 2",
  "midpoint", "all is lost", "break into three", "break into 3",
  "finale", "climax",
];

const BOOKEND_BEAT_KEYWORDS = [
  "opening image", "final image",
];

const REACTION_BEAT_KEYWORDS = [
  "debate", "dark night", "reflection",
];

/** Scene function catalogue (20 types) distributed across acts */
const SCENE_FUNCTIONS_BY_ACT: Record<number, string[]> = {
  1: ["setup", "disturbance", "reaction", "decision", "transition", "intimacy", "investigation"],
  2: ["investigation", "escalation", "revelation", "decision", "consequence", "pursuit", "intimacy", "discovery", "transition", "reversal"],
  3: ["revelation", "consequence", "confrontation", "loss", "reflection", "transition", "escalation", "discovery", "pursuit"],
  4: ["preparation", "payoff", "climax", "resolution", "transition", "reflection"],
};

/**
 * 20 scene function types for scene slot labelling.
 */
export const SCENE_FUNCTIONS = [
  "setup",          // Establish characters, world, status quo
  "disturbance",    // Something disrupts the ordinary world
  "reaction",       // Character processes/disagrees with disturbance
  "investigation",  // Gathering information, following leads
  "escalation",     // Stakes rise, obstacles appear
  "revelation",     // New information changes understanding
  "decision",       // Character makes a choice
  "consequence",    // Results of a previous action
  "confrontation",  // Protagonist vs antagonist directly
  "reversal",       // Status quo flips (midpoint)
  "reflection",     // Character processes, reassesses
  "transition",     // Bridge between sections
  "pursuit",        // Chase, escape, hunt
  "intimacy",       // Relationship development, emotional connection
  "loss",           // Something is lost (death, hope, faith)
  "discovery",      // Physical discovery (clue, object, location)
  "preparation",    // Characters gear up for final confrontation
  "payoff",         // A setup pays off
  "climax",         // The peak confrontation
  "resolution",     // Loose ends tied, new status quo
];

// ── Public API ──

/**
 * Main entry point: compute the Scene Expansion Plan for a feature film.
 * Fully deterministic — same inputs always produce same output.
 */
export function buildSceneExpansionPlan(
  beats: { number: number; title: string }[],
  meta: ProjectMetadata,
  densityFactor?: number,
): SceneExpansionPlan {
  const density = densityFactor ?? DEFAULT_DENSITY;

  // 1. Compute total scene count
  const totalScenes = computeTargetSceneCount(meta, density);

  // 2. Distribute across acts
  const actBudgets = computeActDistribution(totalScenes);

  // 3. Classify each beat
  const classifiedBeats = classifyBeats(beats);

  // 4. Allocate scenes to beats
  const beatAllocations = allocateScenesToBeats(classifiedBeats, actBudgets);

  // 5. Create scene slots
  const sceneSlots = createSceneSlots(beatAllocations, totalScenes);

  // 6. Group into sequences
  const sequences = groupSceneSlotsIntoSequences(sceneSlots, beatAllocations);

  // 7. Verify integrity
  verifyPlanIntegrity(totalScenes, actBudgets, beatAllocations, sequences, sceneSlots);

  return {
    total_scenes: totalScenes,
    per_act: actBudgets,
    per_beat: beatAllocations,
    sequences,
    scene_slots: sceneSlots,
  };
}

// ── Step 1: Target Scene Count ──

export function computeTargetSceneCount(
  meta: ProjectMetadata,
  density: number = DEFAULT_DENSITY,
): number {
  const runtime = meta.runtime_minutes || 100;
  const genre = (meta.genre || "thriller").toLowerCase();

  // Base: runtime × density
  let count = runtime * density;

  // Genre modifier
  const genreMod = GENRE_MODIFIERS[genre] ?? 1.0;
  count *= genreMod;

  // Character complexity
  const majorChars = meta.major_character_count ?? 4;
  if (majorChars <= 2) count *= 0.9;
  else if (majorChars >= 5) count *= (1.0 + (majorChars - 4) * 0.04);

  // Worldbuilding complexity
  if (meta.complex_worldbuilding) count *= 1.1;

  // Mystery density
  if (meta.high_mystery_density) count *= 1.1;

  // Subplot scenes
  const subplotCount = meta.subplot_count ?? 0;
  if (subplotCount >= 2) count += subplotCount * 4;

  // Clamp
  return Math.round(Math.max(MIN_SCENES, Math.min(MAX_SCENES, count)));
}

// ── Step 2: Act Distribution ──

export function computeActDistribution(totalScenes: number): ActSceneBudget[] {
  const budgets: ActSceneBudget[] = [];
  let allocated = 0;

  for (let i = 0; i < ACT_DISTRIBUTION.length; i++) {
    const { act, label, pct } = ACT_DISTRIBUTION[i];
    let count: number;

    if (i < ACT_DISTRIBUTION.length - 1) {
      count = Math.round(totalScenes * pct / 100);
      allocated += count;
    } else {
      // Last act gets remainder to ensure exact total
      count = totalScenes - allocated;
    }

    budgets.push({ act, label, scene_count: count, percentage: pct });
  }

  return budgets;
}

// ── Step 3: Beat Classification ──

export interface ClassifiedBeat {
  number: number;
  title: string;
  act: number;
  category: "major" | "normal" | "bookend" | "reaction";
  weight: number;
}

export function classifyBeats(beats: { number: number; title: string }[]): ClassifiedBeat[] {
  return beats.map(beat => {
    const lower = (beat.title || "").toLowerCase();

    let category: "major" | "normal" | "bookend" | "reaction";
    let weight: number;

    if (MAJOR_BEAT_KEYWORDS.some(k => lower.includes(k))) {
      category = "major";
      weight = 1.5;
    } else if (BOOKEND_BEAT_KEYWORDS.some(k => lower.includes(k))) {
      category = "bookend";
      weight = 0.6;
    } else if (REACTION_BEAT_KEYWORDS.some(k => lower.includes(k))) {
      category = "reaction";
      weight = 0.8;
    } else {
      category = "normal";
      weight = 1.0;
    }

    return {
      number: beat.number,
      title: beat.title,
      act: resolveBeatAct(beat.number),
      category,
      weight,
    };
  });
}

// ── Step 4: Beat Scene Allocation ──

export function allocateScenesToBeats(
  classifiedBeats: ClassifiedBeat[],
  actBudgets: ActSceneBudget[],
): BeatSceneAllocation[] {
  const result: BeatSceneAllocation[] = [];
  const budgetMap = new Map(actBudgets.map(a => [a.act, a.scene_count]));

  // Group beats by act
  const beatsByAct = new Map<number, ClassifiedBeat[]>();
  for (const beat of classifiedBeats) {
    if (!beatsByAct.has(beat.act)) beatsByAct.set(beat.act, []);
    beatsByAct.get(beat.act)!.push(beat);
  }

  for (const [actNum, actBeats] of beatsByAct) {
    const actBudget = budgetMap.get(actNum) ?? 0;
    if (actBeats.length === 0) continue;

    const totalWeight = actBeats.reduce((sum, b) => sum + b.weight, 0);
    let allocated = 0;

    for (let i = 0; i < actBeats.length; i++) {
      const beat = actBeats[i];
      let sceneCount: number;

      if (i < actBeats.length - 1) {
        // Proportional allocation, minimum 1 per beat
        sceneCount = Math.max(1, Math.round(actBudget * beat.weight / totalWeight));
        allocated += sceneCount;
      } else {
        // Last beat gets the remainder
        sceneCount = actBudget - allocated;
        if (sceneCount < 1) sceneCount = 1;
      }

      result.push({
        beat_number: beat.number,
        beat_title: beat.title,
        act: actNum,
        scene_count: sceneCount,
        is_major: beat.category === "major",
      });
    }
  }

  return result;
}

// ── Step 5: Scene Slots ──

export function createSceneSlots(
  beatAllocations: BeatSceneAllocation[],
  totalScenes: number,
): ExpansionSceneSlot[] {
  const slots: ExpansionSceneSlot[] = [];
  let slotNum = 0;
  let seqHint = 0;
  let scenesInSeq = 0;

  for (const beat of beatAllocations) {
    for (let s = 0; s < beat.scene_count; s++) {
      slotNum++;
      scenesInSeq++;

      // New sequence every 4-7 scenes
      if (scenesInSeq > 7 || (scenesInSeq >= 4 && s === beat.scene_count - 1)) {
        seqHint++;
        scenesInSeq = 0;
      } else if (s === 0 && scenesInSeq > 1) {
        // Already accumulating — continue
      }

      if (seqHint === 0) seqHint = 1;

      const functionType = pickFunctionType(slotNum, beat);

      slots.push({
        scene_slot_number: slotNum,
        act: beat.act,
        source_beat_number: beat.beat_number,
        source_beat_title: beat.beat_title,
        function_type: functionType,
        sequence_hint: seqHint,
        estimated_pages: functionType === "climax" ? 4 : functionType === "setup" ? 2 : 2,
      });
    }
  }

  return slots;
}

// ── Step 6: Sequence Grouping ──

export function groupSceneSlotsIntoSequences(
  slots: ExpansionSceneSlot[],
  beatAllocations: BeatSceneAllocation[],
): ExpansionSequence[] {
  if (slots.length === 0) return [];

  const sequences: ExpansionSequence[] = [];
  let currentSeq: ExpansionSceneSlot[] = [];
  const beatMap = new Map(beatAllocations.map(b => [b.beat_number, b]));
  let currentAct = slots[0].act;

  for (const slot of slots) {
    const beat = beatMap.get(slot.source_beat_number);
    const beatAct = beat?.act ?? slot.act;
    const isMajorBeat = beat?.is_major ?? false;

    // Hard break conditions:
    // 1. Act boundary
    // 2. Already have 4+ scenes AND next slot starts a new beat-range
    // 3. Already have 7+ scenes
    const shouldBreak = (
      (beatAct !== currentAct && currentSeq.length > 0) ||
      (currentSeq.length >= 7) ||
      (currentSeq.length >= 4 &&
       slot.sequence_hint !== (currentSeq[0]?.sequence_hint ?? 0) &&
       currentSeq.length >= 4)
    );

    if (shouldBreak && currentSeq.length > 0) {
      sequences.push(buildSeqFromSlots(currentSeq, sequences.length + 1));
      currentSeq = [];
      currentAct = beatAct;
    }

    currentSeq.push(slot);
    currentAct = beatAct;
  }

  // Handle remaining
  if (currentSeq.length > 0) {
    sequences.push(buildSeqFromSlots(currentSeq, sequences.length + 1));
  }

  // Merge very small sequences (< 3 scenes) with neighbor
  return mergeTinySequences(sequences, slots);
}

function buildSeqFromSlots(slots: ExpansionSceneSlot[], num: number): ExpansionSequence {
  const first = slots[0];
  const last = slots[slots.length - 1];
  const beatNumbers = [...new Set(slots.map(s => s.source_beat_number))].sort((a, b) => a - b);

  // Infer purpose from content
  const purpose = inferSeqPurpose(slots, num);

  return {
    number: num,
    beat_numbers: beatNumbers,
    scene_range: [first.scene_slot_number, last.scene_slot_number],
    scene_count: slots.length,
    act: first.act,
    purpose,
  };
}

function mergeTinySequences(
  sequences: ExpansionSequence[],
  allSlots: ExpansionSceneSlot[],
): ExpansionSequence[] {
  if (sequences.length <= 1) return sequences;

  const result: ExpansionSequence[] = [];
  let i = 0;

  while (i < sequences.length) {
    let current = sequences[i];

    // Merge if too small (< 3) and not at act boundary
    while (i + 1 < sequences.length && current.scene_count < 3) {
      const next = sequences[i + 1];
      if (next.act !== current.act) break; // Don't merge across acts

      // Merge
      const allBeatNums = [...new Set([...current.beat_numbers, ...next.beat_numbers])].sort((a, b) => a - b);
      const mergedScenes = allSlots.filter(
        s => s.scene_slot_number >= current.scene_range[0] && s.scene_slot_number <= next.scene_range[1]
      );

      current = {
        number: current.number,
        beat_numbers: allBeatNums,
        scene_range: [current.scene_range[0], next.scene_range[1]],
        scene_count: mergedScenes.length,
        act: current.act,
        purpose: current.purpose,
      };
      i++;
    }

    result.push(current);
    i++;
  }

  // Renumber
  return result.map((seq, idx) => ({ ...seq, number: idx + 1 }));
}

// ── Step 7: Integrity Verification ──

function verifyPlanIntegrity(
  totalScenes: number,
  actBudgets: ActSceneBudget[],
  beatAllocations: BeatSceneAllocation[],
  sequences: ExpansionSequence[],
  slots: ExpansionSceneSlot[],
): void {
  // Sum check: act budgets match total
  const sumActs = actBudgets.reduce((s, a) => s + a.scene_count, 0);
  if (sumActs !== totalScenes) {
    console.warn(`[SPO] Act budget sum mismatch: ${sumActs} vs ${totalScenes} — will adjust`);
  }

  // Sum check: beat allocations match total
  const sumBeats = beatAllocations.reduce((s, b) => s + b.scene_count, 0);
  if (sumBeats !== totalScenes) {
    console.warn(`[SPO] Beat allocation sum mismatch: ${sumBeats} vs ${totalScenes}`);
  }

  // Every slot present
  const slotNums = new Set(slots.map(s => s.scene_slot_number));
  for (let sn = 1; sn <= totalScenes; sn++) {
    if (!slotNums.has(sn)) {
      console.warn(`[SPO] Missing scene slot: ${sn}`);
    }
  }

  // No duplicate slot numbers
  if (slotNums.size !== slots.length) {
    console.warn(`[SPO] Duplicate scene slot numbers: ${slots.length} slots, ${slotNums.size} unique`);
  }

  // Sequences cover all scene slots
  const seqSceneNums = new Set<number>();
  for (const seq of sequences) {
    for (let s = seq.scene_range[0]; s <= seq.scene_range[1]; s++) {
      seqSceneNums.add(s);
    }
  }
  for (let sn = 1; sn <= totalScenes; sn++) {
    if (!seqSceneNums.has(sn)) {
      console.warn(`[SPO] Scene slot ${sn} not covered by any sequence`);
    }
  }
}

// ── Helpers ──

function resolveBeatAct(beatNumber: number): number {
  if (beatNumber <= 15) return 1;
  if (beatNumber <= 25) return 2;
  if (beatNumber <= 40) return 3;
  return 4;
}

function pickFunctionType(slotNum: number, beat: BeatSceneAllocation): string {
  const act = beat.act;
  const functions = SCENE_FUNCTIONS_BY_ACT[act] || SCENE_FUNCTIONS_BY_ACT[1];

  // Deterministic selection based on position
  const idx = (slotNum + beat.beat_number) % functions.length;
  return functions[idx];
}

function inferSeqPurpose(slots: ExpansionSceneSlot[], seqNum: number): SequencePurpose {
  const functions = slots.map(s => s.function_type);

  // Check for major beats
  if (functions.some(f => f === "climax")) return "climax";
  if (functions.some(f => f === "reversal")) return "reverse";
  if (functions.some(f => f === "loss")) return "reverse";
  if (functions.some(f => f === "disturbance")) return "catalyst";
  if (functions.some(f => f === "reflection")) return "aftermath";
  if (functions.some(f => f === "setup")) return "establish";
  if (functions.some(f => f === "resolution")) return "resolve";
  if (functions.some(f => f === "preparation")) return "build";
  if (functions.some(f => f === "confrontation")) return "confrontation";
  if (functions.some(f => f === "escalation") || functions.some(f => f === "pursuit")) return "escalate";
  if (functions.some(f => f === "revelation") || functions.some(f => f === "discovery")) return "reveal";
  if (functions.some(f => f === "consequence")) return "complicate";

  return "transition";
}

// ── Format Helper ──

/**
 * Build the human-readable scene expansion block for the LLM prompt.
 * This tells the LLM exactly how many scenes to generate and what each should do.
 */
export function buildExpansionPromptBlock(plan: SceneExpansionPlan): string {
  const lines: string[] = [];

  lines.push(`=== SCENE EXPANSION PLAN ===`);
  lines.push(`Target: ${plan.total_scenes} scenes across ${plan.sequences.length} sequences`);
  lines.push(``);

  for (const act of plan.per_act) {
    lines.push(`${act.label}: ${act.scene_count} scenes (${act.percentage}%)`);
  }

  lines.push(``);
  lines.push(`BEAT BREAKDOWN:`);
  for (const beat of plan.per_beat) {
    const marker = beat.is_major ? "★ " : "  ";
    lines.push(`${marker}Beat ${beat.beat_number}: "${beat.beat_title}" → ${beat.scene_count} scenes`);
  }

  lines.push(``);
  lines.push(`SEQUENCE STRUCTURE:`);
  for (const seq of plan.sequences) {
    const [start, end] = seq.scene_range;
    lines.push(`  Sequence ${seq.number}: Scenes ${start}-${end} (${seq.scene_count} scenes, ${seq.purpose})`);
  }

  lines.push(``);
  lines.push(`CRITICAL INSTRUCTION:`);
  lines.push(`- Generate EXACTLY ${plan.total_scenes} scenes — no more, no fewer.`);
  lines.push(`- Each scene must map to its assigned scene_slot_number.`);
  lines.push(`- Do NOT skip or merge any scene slot.`);
  lines.push(`- Every scene_slot_number from 1 to ${plan.total_scenes} must appear once.`);
  lines.push(`- Each scene_slot_number determines act, beat, and dramatic position.`);
  lines.push(`=== END SCENE EXPANSION PLAN ===`);

  return lines.join("\n");
}