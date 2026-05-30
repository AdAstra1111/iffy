/**
 * Scene Architecture — Phase 2B.2
 *
 * Deterministic conversion of the Dramatic Architecture Blueprint (DAB)
 * into numbered scene slots that the Scene Plan LLM must fill.
 *
 * The DAB answers: "What must this story deliver?"
 * Scene Architecture answers: "What exact scene slots are needed to deliver it?"
 *
 * Pipeline position:
 * DAB → Scene Architecture (this module) → Scene Plan + NCP
 *
 * NO LLM calls. Pure deterministic algorithm.
 */
import type {
  DramaticArchitectureBlueprint,
  DramaticMovement,
  SceneArchitecture,
  SceneArchitectureSlot,
  SceneArchitectureSequence,
  SceneWeight,
  PacingMode,
  SpectacleSetPieceEntry,
} from "./ncpTypes.ts";

// ── Weight mapping ──

const PAGE_ESTIMATES: Record<string, number> = {
  "light": 1,
  "light-medium": 2,
  "medium": 3,
  "medium-heavy": 4,
  "heavy": 5,
};

const FUNCTION_WEIGHT_MAP: Record<string, SceneWeight> = {
  "climax": "heavy",
  "confrontation": "medium-heavy",
  "spectacle": "medium-heavy",
  "revelation": "medium",
  "reversal": "medium-heavy",
  "payoff": "medium-heavy",
  "loss": "medium",
  "decision": "medium",
  "intimacy": "medium",
  "investigation": "medium",
  "pursuit": "light-medium",
  "escalation": "light-medium",
  "discovery": "light-medium",
  "reaction": "light",
  "reflection": "light",
  "setup": "light",
  "transition": "light",
  "preparation": "light-medium",
  "resolution": "light-medium",
  "disturbance": "light-medium",
};

/** Default weight for unmapped functions */
const DEFAULT_WEIGHT: SceneWeight = "medium";

/** Determine SceneWeight from function type */
function weightForFunction(fn: string): SceneWeight {
  return FUNCTION_WEIGHT_MAP[fn.toLowerCase()] || DEFAULT_WEIGHT;
}

/** Determine estimated pages from weight */
function pagesForWeight(weight: SceneWeight): number {
  return PAGE_ESTIMATES[weight] || 2;
}

/** Determine if a function is spectacle-type */
function isSpectacleFunction(fn: string): boolean {
  return ["climax", "confrontation", "spectacle", "reversal", "payoff"].includes(fn.toLowerCase());
}

/** Normalize pacing string to PacingMode */
function normalizePacing(p: string): PacingMode {
  const pLow = p.toLowerCase().trim();
  const valid: PacingMode[] = ["slow", "medium", "fast", "escalating", "de-escalating", "oscillating"];
  if (valid.includes(pLow as PacingMode)) return pLow as PacingMode;
  return "medium";
}

// ── Validation ──

export interface SceneArchitectureValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a Scene Architecture for completeness and correctness.
 */
export function validateSceneArchitecture(sa: any): SceneArchitectureValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!sa) {
    return { valid: false, errors: ["SceneArchitecture is null or undefined"], warnings: [] };
  }

  if (typeof sa.total_slots !== "number" || sa.total_slots < 1) {
    errors.push("total_slots must be a positive number");
  }

  if (!Array.isArray(sa.slots) || sa.slots.length === 0) {
    errors.push("slots must be a non-empty array");
  } else {
    const seenSlots = new Set<number>();
    for (let i = 0; i < sa.slots.length; i++) {
      const s = sa.slots[i];
      if (typeof s.slot_number !== "number") errors.push(`slots[${i}].slot_number is required`);
      if (typeof s.act !== "number") errors.push(`slots[${i}].act is required`);
      if (typeof s.movement_number !== "number") errors.push(`slots[${i}].movement_number is required`);
      if (!s.function_type) errors.push(`slots[${i}].function_type is required`);
      if (!s.dramatic_reason) errors.push(`slots[${i}].dramatic_reason is required`);

      // Check for sluglines or scene plan fields
      const forbidden = ["slugline", "scene_number", "characters_present", "summary", "scene_turn", "scene_outcome"];
      for (const f of forbidden) {
        if (s[f] !== undefined) errors.push(`slots[${i}].${f} is not allowed in Scene Architecture`);
      }

      if (seenSlots.has(s.slot_number)) errors.push(`duplicate slot_number: ${s.slot_number}`);
      seenSlots.add(s.slot_number);
    }

    // Check slot numbers are sequential 1..N
    for (let sn = 1; sn <= sa.total_slots; sn++) {
      if (!seenSlots.has(sn)) errors.push(`missing slot_number: ${sn}`);
    }
  }

  if (!sa.slots_by_movement || typeof sa.slots_by_movement !== "object") {
    warnings.push("slots_by_movement should be present");
  }

  if (!sa.per_act || typeof sa.per_act !== "object") {
    warnings.push("per_act should be present");
  }

  if (!Array.isArray(sa.sequence_hints)) {
    warnings.push("sequence_hints should be an array");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Scene Architecture Builder ──

/**
 * Build Scene Architecture from a Dramatic Architecture Blueprint.
 *
 * This is the primary deterministic conversion: DAB movements → numbered scene slots.
 *
 * @param dab - The validated Dramatic Architecture Blueprint
 * @returns SceneArchitecture with sequential numbered slots
 */
export function buildSceneArchitecture(dab: DramaticArchitectureBlueprint): SceneArchitecture {
  const movements = dab.dramatic_movements;
  if (!movements || movements.length === 0) {
    throw new Error("Cannot build Scene Architecture: DAB has no dramatic movements");
  }

  // Sort movements by movement_number to ensure deterministic order
  const sortedMovements = [...movements].sort((a, b) => a.movement_number - b.movement_number);

  const slots: SceneArchitectureSlot[] = [];
  const slotsByMovement: Record<number, number[]> = {};
  const perAct: Record<number, number> = {};
  let globalSlotNumber = 0;

  for (const movement of sortedMovements) {
    const movementNum = movement.movement_number;
    const cluster = movement.scene_cluster || [];
    const act = movement.act;

    if (!slotsByMovement[movementNum]) {
      slotsByMovement[movementNum] = [];
    }

    // Sort cluster by slot_in_movement
    const sortedCluster = [...cluster].sort((a, b) => a.slot_in_movement - b.slot_in_movement);

    // Determine if this movement is referenced by a spectacle set piece
    const isSpectacleMovement = isMovementSpectacle(movement, dab);

    for (const clusterSlot of sortedCluster) {
      globalSlotNumber++;
      const functionType = clusterSlot.function || "transition";
      const weight = weightForFunction(functionType);

      // Determine required_by_dab_section
      const requiredBy = determineRequiredBySection(functionType, movement, isSpectacleMovement);

      // Determine emotional target from emotional_architecture if available
      const emotion = resolveEmotionalTarget(movementNum, dab);

      slots.push({
        slot_number: globalSlotNumber,
        act,
        movement_number: movementNum,
        movement_name: movement.name || `Movement ${movementNum}`,
        source_reference: movement.source_reference || "",
        function_type: functionType,
        scene_weight: weight,
        pacing: normalizePacing(movement.pacing || "medium"),
        emotional_target: emotion,
        dramatic_reason: clusterSlot.purpose || "",
        breathing_room_after: movement.breathing_room_required_after || false,
        spectacle_flag: isSpectacleMovement || isSpectacleFunction(functionType),
        required_by_dab_section: requiredBy,
        estimated_pages: pagesForWeight(weight),
      });

      slotsByMovement[movementNum].push(globalSlotNumber);
      perAct[act] = (perAct[act] || 0) + 1;
    }
  }

  // Build sequence hints from movement groupings
  const sequenceHints = buildSequenceHints(sortedMovements, slotsByMovement);

  return {
    total_slots: globalSlotNumber,
    slots,
    slots_by_movement: slotsByMovement,
    per_act: perAct,
    sequence_hints: sequenceHints,
  };
}

// ── Helpers ──

/** Check if a movement is referenced by a spectacle set piece */
function isMovementSpectacle(movement: DramaticMovement, dab: DramaticArchitectureBlueprint): boolean {
  const setPieces = dab.spectacle_setpiece_architecture || [];
  const name = (movement.name || "").toLowerCase();
  const ref = (movement.source_reference || "").toLowerCase();
  return setPieces.some(sp =>
    name.includes((sp.name || "").toLowerCase()) ||
    ref.includes((sp.name || "").toLowerCase()),
  );
}

/** Determine which DAB section required this scene slot */
function determineRequiredBySection(
  functionType: string,
  movement: DramaticMovement,
  isSpectacle: boolean,
): string {
  if (isSpectacle) return "spectacle_setpiece_architecture";
  if (movement.breathing_room_required_after && functionType === "reflection") return "breathing_room_architecture";
  if (["setup", "decision", "reaction"].includes(functionType)) return "character_transformation_architecture";
  if (["intimacy", "betrayal"].includes(functionType)) return "relationship_architecture";
  if (["revelation", "discovery", "investigation"].includes(functionType)) return "mystery_information_architecture";
  if (["climax", "confrontation"].includes(functionType)) return "spectacle_setpiece_architecture";
  return "dramatic_movements";
}

/** Resolve emotional target from DAB emotional_architecture if available */
function resolveEmotionalTarget(movementNum: number, dab: DramaticArchitectureBlueprint): string {
  const seq = dab.emotional_architecture?.sequence;
  if (!seq || seq.length === 0) return "";

  for (const entry of seq) {
    const rangeStr = entry.movement_range || "";
    // Parse "Movements 1-3" or "Movements 1,2,3" or "movement 1"
    const match = rangeStr.match(/(\d+)\s*(?:-|,|to)\s*(\d+)/i);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = parseInt(match[2], 10);
      if (movementNum >= start && movementNum <= end) {
        return entry.dominant_emotion || "";
      }
    }
    // Single movement reference
    const singleMatch = rangeStr.match(/(\d+)/);
    if (singleMatch && parseInt(singleMatch[1], 10) === movementNum) {
      return entry.dominant_emotion || "";
    }
  }
  return "";
}

/** Build sequence hints from movement groupings */
function buildSequenceHints(
  movements: DramaticMovement[],
  slotsByMovement: Record<number, number[]>,
): SceneArchitectureSequence[] {
  const sequences: SceneArchitectureSequence[] = [];
  const seqSizeTarget = 5; // Target 5 slots per sequence
  let seqNumber = 0;
  let currentSeqMovements: number[] = [];
  let currentSeqSlotStart = 0;
  let currentSeqSlotCount = 0;
  let currentSeqAct = 0;
  let currentSeqPacing: PacingMode[] = [];
  let firstMovement = true;

  const allSlotNumbers = Object.values(slotsByMovement).flat().sort((a, b) => a - b);

  for (const movement of movements) {
    const mn = movement.movement_number;
    const slotNums = slotsByMovement[mn] || [];
    const act = movement.act;

    if (firstMovement) {
      currentSeqSlotStart = slotNums[0] || 1;
      currentSeqAct = act;
      firstMovement = false;
    }

    // Start new sequence if:
    // 1. Act boundary
    // 2. Already at or past target size
    const startNew = (
      (act !== currentSeqAct && currentSeqMovements.length > 0) ||
      (currentSeqSlotCount >= seqSizeTarget && currentSeqMovements.length >= 1)
    );

    if (startNew && currentSeqMovements.length > 0) {
      seqNumber++;
      const pacingStr = dominantPacing(currentSeqPacing) || "medium";
      sequences.push({
        number: seqNumber,
        movement_numbers: [...currentSeqMovements],
        slot_range: [currentSeqSlotStart, currentSeqSlotStart + currentSeqSlotCount - 1],
        slot_count: currentSeqSlotCount,
        act: currentSeqAct,
        purpose: resolveSeqPurpose(currentSeqMovements, movements),
        pacing_directive: pacingStr,
      });
      currentSeqMovements = [];
      currentSeqSlotStart = slotNums[0] || 1;
      currentSeqSlotCount = 0;
      currentSeqAct = act;
      currentSeqPacing = [];
    }

    currentSeqMovements.push(mn);
    currentSeqSlotCount += slotNums.length;
    currentSeqPacing.push(normalizePacing(movement.pacing || "medium"));
    currentSeqAct = act;
  }

  // Final sequence
  if (currentSeqMovements.length > 0) {
    seqNumber++;
    const pacingStr = dominantPacing(currentSeqPacing) || "medium";
    sequences.push({
      number: seqNumber,
      movement_numbers: [...currentSeqMovements],
      slot_range: [currentSeqSlotStart, currentSeqSlotStart + currentSeqSlotCount - 1],
      slot_count: currentSeqSlotCount,
      act: currentSeqAct,
      purpose: resolveSeqPurpose(currentSeqMovements, movements),
      pacing_directive: pacingStr,
    });
  }

  return sequences;
}

/** Resolve sequence purpose from its movements */
function resolveSeqPurpose(movementNums: number[], movements: DramaticMovement[]): string {
  const purposes = movementNums.map(mn => {
    const m = movements.find(mo => mo.movement_number === mn);
    return m?.source_reference || "";
  }).filter(Boolean);

  if (purposes.length === 0) return "transition";
  return purposes[0] + (purposes.length > 1 ? " + more" : "");
}

/** Find most common pacing mode */
function dominantPacing(modes: PacingMode[]): PacingMode {
  if (modes.length === 0) return "medium";
  const counts: Record<string, number> = {};
  for (const m of modes) counts[m] = (counts[m] || 0) + 1;
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as PacingMode) || "medium";
}

// ── Prompt Block Builder ──

/**
 * Build a scene-level architecture prompt block for the Scene Plan LLM.
 * Each slot becomes an explicit instruction to the LLM on what kind of scene to write.
 */
export function buildSceneArchitecturePromptBlock(sa: SceneArchitecture): string {
  const lines: string[] = [];
  lines.push("=== SCENE ARCHITECTURE — DO NOT CHANGE SCENE COUNT OR ORDER ===");
  lines.push(`Total: ${sa.total_slots} scenes across ${sa.sequence_hints.length} sequences`);
  lines.push("");

  // Act distribution
  lines.push("ACT DISTRIBUTION:");
  for (const [act, count] of Object.entries(sa.per_act).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
    lines.push(`  Act ${act}: ${count} scenes`);
  }
  lines.push("");

  // Per-slot instructions
  lines.push("SCENE SLOT INSTRUCTIONS (fill EVERY slot in order):");
  for (const slot of sa.slots) {
    const breathLabel = slot.breathing_room_after ? " [BREATHE AFTER]" : "";
    const spectacleLabel = slot.spectacle_flag ? " [SPECTACLE]" : "";
    lines.push(`  Slot ${slot.slot_number}: ${slot.function_type} (${slot.scene_weight}, ~${slot.estimated_pages}p)${breathLabel}${spectacleLabel}`);
    lines.push(`    Movement ${slot.movement_number}: "${slot.movement_name}" — ${slot.dramatic_reason}`);
    lines.push(`    Pacing: ${slot.pacing} | Emotion: ${slot.emotional_target}`);
  }
  lines.push("");

  // Sequence structure
  lines.push("SEQUENCE STRUCTURE:");
  for (const seq of sa.sequence_hints) {
    const [start, end] = seq.slot_range;
    lines.push(`  Sequence ${seq.number}: Slots ${start}-${end} (${seq.slot_count} slots, ${seq.purpose})`);
  }
  lines.push("");

  // Critical instruction
  lines.push("CRITICAL INSTRUCTION:");
  lines.push(`- Generate EXACTLY ${sa.total_slots} scenes — no more, no fewer.`);
  lines.push("- Each scene must map to its assigned slot_number.");
  lines.push("- Do NOT skip, merge, reorder, or add scenes.");
  lines.push("- Each slot_number determines movement, function type, pacing, and emotional target.");
  lines.push("- The function_type, dramatic_reason, and emotional_target must guide the scene content.");
  lines.push("- Do NOT change the scene architecture. Fill it.");
  lines.push("=== END SCENE ARCHITECTURE ===");

  return lines.join("\n");
}

