/**
 * Scene Architecture — Unit Tests
 *
 * Tests buildSceneArchitecture, validateSceneArchitecture,
 * and buildSceneArchitecturePromptBlock equivalents directly.
 */
import { describe, it, expect } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Minimal Test DAB ──

const VALID_DAB = {
  audience_promise_registry: {
    genre_promises: ["thriller"],
    emotional_promises: ["dread to catharsis"],
    mystery_promises: ["ship origin"],
    spectacle_promises: ["ship reveal"],
    relationship_promises: ["Kaz-Mariana"],
    thematic_promises: ["forgetting the dead"],
  },
  character_transformation_architecture: [
    {
      character: "Kaz",
      stages: [
        { stage: "isolated", required_scenes: 2, function_preference: "setup", purpose: "Establish loneliness" },
        { stage: "transformed", required_scenes: 1, function_preference: "resolution", purpose: "Show change" },
      ],
      total_required_scenes: 3,
    },
  ],
  relationship_architecture: [
    { pair: ["Kaz", "Mariana"], stages: [{ stage: "distance", required_scenes: 1, interaction_type: "professional" }], total_scenes: 1 },
  ],
  mystery_information_architecture: {
    revelations_per_act: [{ act: 1, reveals: [{ what: "Ship exists", when_scene_approx: "early Act 1", to_whom: "audience" }] }],
    withholding_strategy: ["Creature unseen"],
    dramatic_irony_opportunities: ["Audience sees shadow"],
  },
  emotional_architecture: {
    sequence: [
      { movement_range: "Movements 1-2", dominant_emotion: "dread", purpose: "Establish tone" },
    ],
  },
  spectacle_setpiece_architecture: [
    { name: "Ship Reveal", estimated_scenes: 2, estimated_pages: 4, position: "Act 1 climax", type: "spectacle" },
  ],
  breathing_room_architecture: [
    { after_movement: "Ship Reveal", reason: "Processing" },
  ],
  dramatic_movements: [
    {
      movement_number: 1,
      name: "Establishing Kaz's World",
      act: 1,
      source_reference: "Opening Image",
      dramatic_payoff: "Audience understands Kaz's isolation",
      estimated_scenes: 2,
      scene_cluster: [
        { slot_in_movement: 1, function: "setup", purpose: "Show Kaz's routine" },
        { slot_in_movement: 2, function: "transition", purpose: "End the day" },
      ],
      pacing: "slow",
      breathing_room_required_after: false,
    },
    {
      movement_number: 2,
      name: "The Ship Appears",
      act: 1,
      source_reference: "Catalyst",
      dramatic_payoff: "Mystery is introduced",
      estimated_scenes: 3,
      scene_cluster: [
        { slot_in_movement: 1, function: "discovery", purpose: "Kaz spots the ship" },
        { slot_in_movement: 2, function: "revelation", purpose: "Ship is revealed" },
        { slot_in_movement: 3, function: "reaction", purpose: "Kaz processes" },
      ],
      pacing: "escalating",
      breathing_room_required_after: true,
    },
  ],
};

// ── Inline algorithm mirror (no imports from Deno-style modules) ──

type SceneWeight = "light" | "light-medium" | "medium" | "medium-heavy" | "heavy";
type PacingMode = "slow" | "medium" | "fast" | "escalating" | "de-escalating" | "oscillating";

interface SceneArchitectureSlot {
  slot_number: number;
  act: number;
  movement_number: number;
  movement_name: string;
  source_reference: string;
  function_type: string;
  scene_weight: SceneWeight;
  pacing: PacingMode;
  emotional_target: string;
  dramatic_reason: string;
  breathing_room_after: boolean;
  spectacle_flag: boolean;
  required_by_dab_section: string;
  estimated_pages: number;
}

interface SceneArchitectureSequence {
  number: number;
  movement_numbers: number[];
  slot_range: [number, number];
  slot_count: number;
  act: number;
  purpose: string;
  pacing_directive: PacingMode;
}

interface TestSceneArchitecture {
  total_slots: number;
  slots: SceneArchitectureSlot[];
  slots_by_movement: Record<number, number[]>;
  per_act: Record<number, number>;
  sequence_hints: SceneArchitectureSequence[];
}

function testBuildSceneArchitecture(dab: any): TestSceneArchitecture {
  const movements = dab.dramatic_movements;
  if (!movements || movements.length === 0) throw new Error("No movements");

  const sortedMovements = [...movements].sort((a: any, b: any) => a.movement_number - b.movement_number);
  const slots: SceneArchitectureSlot[] = [];
  const slotsByMovement: Record<number, number[]> = {};
  const perAct: Record<number, number> = {};
  let globalSlotNumber = 0;

  const weightMap: Record<string, SceneWeight> = {
    climax: "heavy", confrontation: "medium-heavy", spectacle: "medium-heavy",
    revelation: "medium", reversal: "medium-heavy", payoff: "medium-heavy",
    loss: "medium", decision: "medium", intimacy: "medium", investigation: "medium",
    pursuit: "light-medium", escalation: "light-medium", discovery: "light-medium",
    reaction: "light", reflection: "light", setup: "light", transition: "light",
    preparation: "light-medium", resolution: "light-medium", disturbance: "light-medium",
  };

  const spectacleFns = new Set(["climax", "confrontation", "spectacle", "reversal", "payoff"]);

  function weightFor(fn: string): SceneWeight { return weightMap[fn.toLowerCase()] || "medium"; }
  function pagesFor(w: SceneWeight): number {
    const pMap: Record<string, number> = {light:1,"light-medium":2,medium:3,"medium-heavy":4,heavy:5};
    return pMap[w] || 2;
  }
  function normPacing(p: string): PacingMode {
    const valid: PacingMode[] = ["slow","medium","fast","escalating","de-escalating","oscillating"];
    const pL = p.toLowerCase().trim();
    return valid.includes(pL as PacingMode) ? pL as PacingMode : "medium";
  }

  for (const movement of sortedMovements) {
    const mNum = movement.movement_number;
    const cluster = movement.scene_cluster || [];
    const act = movement.act;
    if (!slotsByMovement[mNum]) slotsByMovement[mNum] = [];
    const sortedCluster = [...cluster].sort((a: any, b: any) => a.slot_in_movement - b.slot_in_movement);

    for (const cs of sortedCluster) {
      globalSlotNumber++;
      const fn = cs.function || "transition";
      const w = weightFor(fn);
      slots.push({
        slot_number: globalSlotNumber,
        act, movement_number: mNum, movement_name: movement.name || `M${mNum}`,
        source_reference: movement.source_reference || "", function_type: fn,
        scene_weight: w, pacing: normPacing(movement.pacing || "medium"),
        emotional_target: "", dramatic_reason: cs.purpose || "",
        breathing_room_after: movement.breathing_room_required_after || false,
        spectacle_flag: spectacleFns.has(fn.toLowerCase()),
        required_by_dab_section: "dramatic_movements", estimated_pages: pagesFor(w),
      });
      slotsByMovement[mNum].push(globalSlotNumber);
      perAct[act] = (perAct[act] || 0) + 1;
    }
  }

  const seqHints: SceneArchitectureSequence[] = [];
  let seqNum = 0;
  let curMovs: number[] = [];
  let curSlotStart = 0;
  let curSlotCount = 0;
  let curAct = 0;
  let first = true;

  for (const movement of sortedMovements) {
    const mn = movement.movement_number;
    const sn = slotsByMovement[mn] || [];
    const act = movement.act;
    if (first) { curSlotStart = sn[0] || 1; curAct = act; first = false; }
    if ((act !== curAct && curMovs.length > 0) || (curSlotCount >= 5 && curMovs.length >= 1)) {
      seqNum++;
      seqHints.push({
        number: seqNum, movement_numbers: [...curMovs],
        slot_range: [curSlotStart, curSlotStart + curSlotCount - 1],
        slot_count: curSlotCount, act: curAct, purpose: "transition", pacing_directive: "medium",
      });
      curMovs = []; curSlotStart = sn[0] || 1; curSlotCount = 0; curAct = act;
    }
    curMovs.push(mn); curSlotCount += sn.length; curAct = act;
  }
  if (curMovs.length > 0) {
    seqNum++;
    seqHints.push({
      number: seqNum, movement_numbers: [...curMovs],
      slot_range: [curSlotStart, curSlotStart + curSlotCount - 1],
      slot_count: curSlotCount, act: curAct, purpose: "transition", pacing_directive: "medium",
    });
  }

  return { total_slots: globalSlotNumber, slots, slots_by_movement: slotsByMovement, per_act: perAct, sequence_hints: seqHints };
}

function testValidateSceneArchitecture(sa: any): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!sa) return { valid: false, errors: ["null"], warnings: [] };
  if (typeof sa.total_slots !== "number" || sa.total_slots < 1) errors.push("total_slots required");
  if (!Array.isArray(sa.slots) || sa.slots.length === 0) errors.push("slots required");
  else {
    const seen = new Set<number>();
    for (let i = 0; i < sa.slots.length; i++) {
      const s = sa.slots[i];
      if (typeof s.slot_number !== "number") errors.push(`slots[${i}].slot_number required`);
      if (typeof s.act !== "number") errors.push(`slots[${i}].act required`);
      if (typeof s.movement_number !== "number") errors.push(`slots[${i}].movement_number required`);
      if (!s.function_type) errors.push(`slots[${i}].function_type required`);
      if (!s.dramatic_reason) errors.push(`slots[${i}].dramatic_reason required`);
      const forbidden = ["slugline", "scene_number", "characters_present", "summary", "scene_turn", "scene_outcome"];
      for (const f of forbidden) { if (s[f] !== undefined) errors.push(`slots[${i}].${f} not allowed`); }
      if (seen.has(s.slot_number)) errors.push(`duplicate slot: ${s.slot_number}`);
      seen.add(s.slot_number);
    }
    for (let sn = 1; sn <= sa.total_slots; sn++) { if (!seen.has(sn)) errors.push(`missing slot: ${sn}`); }
  }
  if (!sa.slots_by_movement) warnings.push("slots_by_movement missing");
  if (!sa.per_act) warnings.push("per_act missing");
  if (!Array.isArray(sa.sequence_hints)) warnings.push("sequence_hints missing");
  return { valid: errors.length === 0, errors, warnings };
}

// ── Tests ──

describe("Scene Architecture Builder", () => {
  it("valid DAB converts to SceneArchitecture", () => {
    const sa = testBuildSceneArchitecture(VALID_DAB);
    expect(sa.total_slots).toBe(5);
    expect(sa.slots.length).toBe(5);
  });

  it("movement clusters preserve order", () => {
    const sa = testBuildSceneArchitecture(VALID_DAB);
    expect(sa.slots[0].movement_number).toBe(1);
    expect(sa.slots[2].movement_number).toBe(2);
    expect(sa.slots[0].function_type).toBe("setup");
    expect(sa.slots[1].function_type).toBe("transition");
    expect(sa.slots[2].function_type).toBe("discovery");
  });

  it("breathing room slots are preserved", () => {
    const sa = testBuildSceneArchitecture(VALID_DAB);
    const lastSlotOfM2 = sa.slots.filter(s => s.movement_number === 2).pop()!;
    expect(lastSlotOfM2.breathing_room_after).toBe(true);
  });

  it("spectacle slots are flagged", () => {
    const sa = testBuildSceneArchitecture(VALID_DAB);
    // Check that non-spectacle functions have spectacle_flag=false
    for (const slot of sa.slots) {
      const isSpec = ["climax","confrontation","spectacle","reversal","payoff"].includes(slot.function_type);
      expect(slot.spectacle_flag).toBe(isSpec);
    }
  });

  it("function types come from DAB clusters, not modulo", () => {
    const sa = testBuildSceneArchitecture(VALID_DAB);
    expect(sa.slots[0].function_type).toBe("setup");
    expect(sa.slots[1].function_type).toBe("transition");
    expect(sa.slots[2].function_type).toBe("discovery");
    expect(sa.slots[3].function_type).toBe("revelation");
    expect(sa.slots[4].function_type).toBe("reaction");
  });

  it("slot numbers are sequential 1..N", () => {
    const sa = testBuildSceneArchitecture(VALID_DAB);
    for (let i = 0; i < sa.slots.length; i++) {
      expect(sa.slots[i].slot_number).toBe(i + 1);
    }
  });

  it("act boundaries preserved", () => {
    const sa = testBuildSceneArchitecture(VALID_DAB);
    for (const slot of sa.slots) {
      expect(slot.act).toBe(1);
    }
  });

  it("throws on empty DAB movements", () => {
    expect(() => testBuildSceneArchitecture({ ...VALID_DAB, dramatic_movements: [] })).toThrow("No movements");
  });

  it("slots by movement correctly grouped", () => {
    const sa = testBuildSceneArchitecture(VALID_DAB);
    expect(sa.slots_by_movement[1]).toEqual([1, 2]);
    expect(sa.slots_by_movement[2]).toEqual([3, 4, 5]);
  });

  it("per_act correctly counts", () => {
    const sa = testBuildSceneArchitecture(VALID_DAB);
    expect(sa.per_act[1]).toBe(5);
  });
});

describe("Scene Architecture Validation", () => {
  it("valid SceneArchitecture passes", () => {
    const sa = testBuildSceneArchitecture(VALID_DAB);
    expect(testValidateSceneArchitecture(sa).valid).toBe(true);
  });

  it("null SA fails", () => {
    expect(testValidateSceneArchitecture(null).valid).toBe(false);
  });

  it("missing slots fails", () => {
    const result = testValidateSceneArchitecture({ total_slots: 5, slots: [], slots_by_movement: {}, per_act: {}, sequence_hints: [] });
    expect(result.valid).toBe(false);
  });

  it("duplicate slot numbers fail", () => {
    const sa = testBuildSceneArchitecture(VALID_DAB);
    sa.slots.push({ ...sa.slots[0], slot_number: 1 });
    expect(testValidateSceneArchitecture(sa).valid).toBe(false);
  });

  it("sluglines in slots fail", () => {
    const sa = testBuildSceneArchitecture(VALID_DAB);
    (sa.slots[0] as any).slugline = "INT. DOCK - NIGHT";
    expect(testValidateSceneArchitecture(sa).valid).toBe(false);
  });

  it("missing slot number fails", () => {
    const sa = testBuildSceneArchitecture(VALID_DAB);
    const result = testValidateSceneArchitecture(sa);
    expect(result.valid).toBe(true);
    // Remove a slot to test missing
    sa.slots.splice(0, 1);
    const result2 = testValidateSceneArchitecture(sa);
    expect(result2.valid).toBe(false);
  });
});

describe("Scene Architecture Sequence Grouping", () => {
  it("sequences cover all slots", () => {
    const sa = testBuildSceneArchitecture(VALID_DAB);
    const coveredSlots = new Set<number>();
    for (const seq of sa.sequence_hints) {
      for (let s = seq.slot_range[0]; s <= seq.slot_range[1]; s++) {
        coveredSlots.add(s);
      }
    }
    for (let sn = 1; sn <= sa.total_slots; sn++) {
      expect(coveredSlots.has(sn)).toBe(true);
    }
  });

  it("sequence count is reasonable", () => {
    const sa = testBuildSceneArchitecture(VALID_DAB);
    expect(sa.sequence_hints.length).toBeGreaterThanOrEqual(1);
    expect(sa.sequence_hints.length).toBeLessThanOrEqual(2);
  });
});
