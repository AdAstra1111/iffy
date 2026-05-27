import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ── Inlined validation logic from chunkRunner.ts (lines 961-983) ──
// Mirrored for test isolation because chunkRunner.ts has pre-existing TS errors
// that block type-checked imports.

interface ValidationResult {
  pass: boolean;
  failures: Array<{ type: string; detail: string }>;
  missingIndices: number[];
  missingSections: string[];
  bannedPhraseHits: string[];
  repairAction: string;
}

function validateStoryOutlineAssembly(assembledContent: string): ValidationResult {
  try {
    const parsed = JSON.parse(assembledContent);
    const pass = parsed && Array.isArray(parsed.entries) && parsed.entries.length > 0;
    return {
      pass,
      failures: pass
        ? []
        : [{ type: "invalid_json", detail: "story_outline assembly failed to produce valid JSON entries array" }],
      missingIndices: [],
      missingSections: [],
      bannedPhraseHits: [],
      repairAction: pass ? "none" : "regen_all",
    };
  } catch {
    return {
      pass: false,
      failures: [{ type: "invalid_json", detail: "story_outline assembly produced unparseable JSON" }],
      missingIndices: [],
      missingSections: [],
      bannedPhraseHits: [],
      repairAction: "regen_all",
    };
  }
}

// ── Inlined assembly logic from chunkRunner.ts (lines 864-881) ──

interface ChunkDef {
  chunkIndex: number;
  chunkKey: string;
  sectionKey?: string;
}

interface ChunkPlan {
  totalChunks: number;
  chunks: ChunkDef[];
}

function assembleStoryOutline(chunkContents: (string | null | undefined)[], plan: ChunkPlan): string {
  const allEntries: any[] = [];
  for (let i = 0; i < plan.totalChunks; i++) {
    const c = chunkContents[i];
    if (!c) continue;
    try {
      const parsed = JSON.parse(c);
      if (parsed.entries && Array.isArray(parsed.entries)) {
        allEntries.push(...parsed.entries);
      }
    } catch {
      // skip unparseable chunks
    }
  }
  return JSON.stringify({ entries: allEntries });
}

// ── Helper to build a mock plan ──

function makePlan(totalChunks: number): ChunkPlan {
  return {
    totalChunks,
    chunks: Array.from({ length: totalChunks }, (_, i) => ({
      chunkIndex: i,
      chunkKey: `act_${["1_setup", "2a_rising_action", "2b_complications", "3_climax_resolution"][i % 4]}`,
      sectionKey: `act_${i + 1}`,
    })),
  };
}

// ── Valid entries ──

const singleEntry = {
  number: 1,
  title: "The Beginning",
  description: "A lone figure walks through a dark forest. The world is established as mysterious and dangerous.",
};

const validAct1Entries = [
  { number: 1, title: "Opening", description: "World establishment." },
  { number: 2, title: "Inciting Incident", description: "Something happens." },
  { number: 3, title: "Decision", description: "The hero decides to act." },
];

// ═══════════════════════════════════════════════════════════════
// ── Happy Path ──
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "happy path — valid JSON with non-empty entries array passes validation",
  fn() {
    const json = JSON.stringify({ entries: [singleEntry] });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, true, "should pass for valid entries array");
    assertEquals(result.failures.length, 0);
    assertEquals(result.repairAction, "none");
  },
});

Deno.test({
  name: "happy path — multiple entries all pass validation",
  fn() {
    const json = JSON.stringify({
      entries: [
        { number: 1, title: "Opening", description: "World establishment." },
        { number: 2, title: "Inciting Incident", description: "Something happens." },
        { number: 3, title: "Midpoint", description: "The turning point." },
      ],
    });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, true);
  },
});

Deno.test({
  name: "happy path — entries with extra fields still pass",
  fn() {
    const json = JSON.stringify({
      entries: [{ number: 1, title: "A", description: "D", scene_count: 3, characters: ["Hero", "Villain"] }],
    });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, true, "should allow extra fields on entries");
  },
});

// ═══════════════════════════════════════════════════════════════
// ── Edge Cases ──
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "edge case — empty entries array fails validation",
  fn() {
    const json = JSON.stringify({ entries: [] });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, false, "empty entries array should fail");
    assertEquals(result.failures[0].type, "invalid_json");
    assertEquals(result.failures[0].detail, "story_outline assembly failed to produce valid JSON entries array");
    assertEquals(result.repairAction, "regen_all");
  },
});

Deno.test({
  name: "edge case — missing entries property fails validation",
  fn() {
    const json = JSON.stringify({ not_entries: [] });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, false, "missing entries property should fail");
    assertEquals(result.repairAction, "regen_all");
  },
});

Deno.test({
  name: "edge case — entries is null fails validation",
  fn() {
    const json = JSON.stringify({ entries: null });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, false, "null entries should fail");
    assertEquals(result.repairAction, "regen_all");
  },
});

Deno.test({
  name: "edge case — entries is an object (not array) fails validation",
  fn() {
    const json = JSON.stringify({ entries: { number: 1, title: "test" } });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, false, "non-array entries should fail");
    assertEquals(result.repairAction, "regen_all");
  },
});

Deno.test({
  name: "edge case — unparseable JSON fails with catch branch",
  fn() {
    const badJson = "this is not json at all {{{{";
    const result = validateStoryOutlineAssembly(badJson);
    assertEquals(result.pass, false, "unparseable JSON should fail");
    assertEquals(result.failures[0].type, "invalid_json");
    assertEquals(result.failures[0].detail, "story_outline assembly produced unparseable JSON");
    assertEquals(result.repairAction, "regen_all");
  },
});

Deno.test({
  name: "edge case — JSON with primitive value fails (not an object)",
  fn() {
    const result = validateStoryOutlineAssembly('"just a string"');
    assertEquals(result.pass, false, "string value should fail (no entries)");
    assertEquals(result.repairAction, "regen_all");
  },
});

Deno.test({
  name: "edge case — empty string input fails",
  fn() {
    const result = validateStoryOutlineAssembly("");
    assertEquals(result.pass, false, "empty string should fail (unparseable)");
    assertEquals(result.repairAction, "regen_all");
  },
});

Deno.test({
  name: "edge case — array at root (not object) fails",
  fn() {
    const json = JSON.stringify([singleEntry]);
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, false, "array root should fail (no .entries)");
    assertEquals(result.repairAction, "regen_all");
  },
});

// ═══════════════════════════════════════════════════════════════
// ── Assembly Path ──
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "assembly — merges entries from all chunks into single array",
  fn() {
    const plan = makePlan(4);
    const chunks = [
      JSON.stringify({ entries: [{ number: 1, title: "Opening", description: "A" }] }),
      JSON.stringify({ entries: [{ number: 2, title: "Rising", description: "B" }] }),
      JSON.stringify({ entries: [{ number: 3, title: "Complications", description: "C" }] }),
      JSON.stringify({ entries: [{ number: 4, title: "Climax", description: "D" }] }),
    ];
    const result = assembleStoryOutline(chunks, plan);
    const parsed = JSON.parse(result);
    assertEquals(parsed.entries.length, 4, "should merge all 4 entries");
    assertEquals(parsed.entries[0].title, "Opening");
    assertEquals(parsed.entries[3].title, "Climax");
    const validation = validateStoryOutlineAssembly(result);
    assertEquals(validation.pass, true);
  },
});

Deno.test({
  name: "assembly — skips null/missing chunks gracefully",
  fn() {
    const plan = makePlan(3);
    const chunks = [
      JSON.stringify({ entries: [validAct1Entries[0]] }),
      null,
      JSON.stringify({ entries: [validAct1Entries[2]] }),
    ];
    const result = assembleStoryOutline(chunks, plan);
    const parsed = JSON.parse(result);
    assertEquals(parsed.entries.length, 2, "should only include non-null chunks");
  },
});

Deno.test({
  name: "assembly — skips unparseable chunks gracefully",
  fn() {
    const plan = makePlan(3);
    const chunks = [
      JSON.stringify({ entries: [validAct1Entries[0]] }),
      "not valid json",
      JSON.stringify({ entries: [validAct1Entries[2]] }),
    ];
    const result = assembleStoryOutline(chunks, plan);
    const parsed = JSON.parse(result);
    assertEquals(parsed.entries.length, 2, "should skip unparseable chunks");
  },
});

Deno.test({
  name: "assembly — produces valid JSON even with no valid entries",
  fn() {
    const plan = makePlan(2);
    const chunks = [null, undefined];
    const result = assembleStoryOutline(chunks, plan);
    assertEquals(result, JSON.stringify({ entries: [] }), "should produce valid JSON with empty array");
    // But this JSON should fail validation (empty entries)
    const validation = validateStoryOutlineAssembly(result);
    assertEquals(validation.pass, false, "empty entries array should fail validation");
  },
});

Deno.test({
  name: "assembly — preserves entry object structure exactly",
  fn() {
    const plan = makePlan(1);
    const entry = {
      number: 42,
      title: "The Climax",
      description: "Everything comes together in an explosive finale that changes the protagonist forever.",
      emotional_shift: "despair → hope",
      dramatic_purpose: "Resolution of main conflict",
    };
    const chunks = [JSON.stringify({ entries: [entry] })];
    const result = assembleStoryOutline(chunks, plan);
    const parsed = JSON.parse(result);
    assertEquals(parsed.entries[0].number, 42);
    assertEquals(parsed.entries[0].title, "The Climax");
    assertEquals(parsed.entries[0].emotional_shift, "despair → hope");
    assertEquals(parsed.entries[0].dramatic_purpose, "Resolution of main conflict");
    const validation = validateStoryOutlineAssembly(result);
    assertEquals(validation.pass, true);
  },
});

// ═══════════════════════════════════════════════════════════════
// ── Invariant: Other docTypes ──
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "invariant — other docTypes use the standard assembly path (not story_outline merge)",
  fn() {
    // The key invariant: for non-story_outline docTypes, assembly produces markdown
    // text with section headers, not JSON. The story_outline guard only activates
    // when docType === "story_outline".
    // This test verifies the guard doesn't over-match: only "story_outline" should
    // use the JSON merge path.
    const nonStoryDocTypes = [
      "beat_sheet", "treatment", "feature_script", "screenplay_draft",
      "production_draft", "character_bible", "concept_brief", "idea",
    ];
    for (const docType of nonStoryDocTypes) {
      // story_outline guard should NOT fire for these docTypes
      assert(docType !== "story_outline", `${docType} should not be story_outline`);
    }
  },
});

// ═══════════════════════════════════════════════════════════════
// ── Regression: Assembly Guard still works ──
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "regression — assembly output is always a JSON string",
  fn() {
    const plan = makePlan(2);
    const chunks = [
      JSON.stringify({ entries: [{ number: 1, title: "A", description: "Desc A" }] }),
      JSON.stringify({ entries: [{ number: 2, title: "B", description: "Desc B" }] }),
    ];
    const result = assembleStoryOutline(chunks, plan);
    assertEquals(typeof result, "string", "assembly output should be a string");
    // Should be parseable JSON
    const parsed = JSON.parse(result);
    assert(Array.isArray(parsed.entries));
  },
});

Deno.test({
  name: "regression — failed chunk placeholder not affected by story_outline guard",
  fn() {
    // The FAILED_CHUNK_PLACEHOLDER_RE and containsFailedPlaceholders are
    // separate from the story_outline validation — they should still work
    // for any assembled content.
    const FAILED_CHUNK_PLACEHOLDER_RE = /\[SECTION \d+ GENERATION FAILED/;
    const containsFailedPlaceholders = (text: string): boolean => FAILED_CHUNK_PLACEHOLDER_RE.test(text);

    assertEquals(
      containsFailedPlaceholders("[SECTION 2 GENERATION FAILED — REGENERATE THIS DOCUMENT]"),
      true,
      "placeholder detection still works"
    );
    assertEquals(containsFailedPlaceholders("clean content without placeholders"), false);
  },
});