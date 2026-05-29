/**
 * Per-entry JSON Schema Validation — P1 test suite
 *
 * Tests the per-entry validation logic in chunkRunner.ts (lines 1064-1078):
 * each entry in the story outline's "entries" array must have number, title, and description.
 * Missing fields produce granular error messages identifying exactly which entry and field.
 *
 * Run: deno test chunkRunnerPerEntrySchema_test.ts --allow-none
 */

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ── Types (mirrored from chunkRunner.ts validationResult) ──

interface ValidationFailure {
  type: string;
  detail: string;
}

interface ValidationResult {
  pass: boolean;
  failures: ValidationFailure[];
  missingIndices: number[];
  missingSections: string[];
  bannedPhraseHits: string[];
  repairAction: string;
}

// ── Inlined validation logic from chunkRunner.ts lines 1054-1097 ──

function validateStoryOutlineAssembly(assembledContent: string): ValidationResult {
  try {
    const parsed = JSON.parse(assembledContent);
    const failures: ValidationFailure[] = [];
    if (!parsed || !Array.isArray(parsed.entries)) {
      failures.push({ type: "invalid_json", detail: "story_outline assembly failed — missing entries array" });
    } else if (parsed.entries.length === 0) {
      failures.push({ type: "invalid_json", detail: "story_outline assembly produced empty entries array" });
    } else {
      // Per-entry JSON schema validation — each entry must have {number, title, description}
      for (let ei = 0; ei < parsed.entries.length; ei++) {
        const e = parsed.entries[ei];
        const missing: string[] = [];
        if (e.number == null) missing.push("number");
        if (!e.title) missing.push("title");
        if (!e.description) missing.push("description");
        if (missing.length > 0) {
          failures.push({
            type: "invalid_entry_schema",
            detail: `Entry ${ei + 1} (number=${e.number ?? "undefined"}) missing required fields: ${missing.join(", ")}`,
          });
        }
      }
    }
    const pass = failures.length === 0;
    return {
      pass,
      failures,
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

// ── Helper: valid entry factory ──

function makeEntry(number: number, title: string, description: string) {
  return { number, title, description };
}

const validEntry = makeEntry(1, "The Beginning", "A lone figure walks through a dark forest.");

// ═══════════════════════════════════════════════════════════════
// 1. Happy Path — all fields present
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "happy path — all entries have number, title, description — passes validation",
  fn() {
    const json = JSON.stringify({
      entries: [
        makeEntry(1, "Opening", "World establishment."),
        makeEntry(2, "Inciting Incident", "Something happens that changes everything."),
        makeEntry(3, "Decision", "The hero decides to act."),
      ],
    });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, true, "all fields present should pass");
    assertEquals(result.failures.length, 0);
    assertEquals(result.repairAction, "none");
  },
});

Deno.test({
  name: "happy path — entries with extra fields still pass per-entry schema",
  fn() {
    const json = JSON.stringify({
      entries: [
        { number: 1, title: "A", description: "D", scene_count: 3, characters: ["Hero", "Villain"] },
      ],
    });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, true, "extra fields should not fail per-entry schema");
  },
});

// ═══════════════════════════════════════════════════════════════
// 2. Per-entry: missing single fields
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "per-entry — missing 'number' field produces granular error",
  fn() {
    const json = JSON.stringify({
      entries: [{ title: "Missing Number", description: "Entry has no number field." }],
    });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, false);
    assertEquals(result.failures.length, 1);
    assertEquals(result.failures[0].type, "invalid_entry_schema");
    assertStringIncludes(result.failures[0].detail, "missing required fields: number");
    assertStringIncludes(result.failures[0].detail, "Entry 1");
  },
});

Deno.test({
  name: "per-entry — missing 'title' field produces granular error",
  fn() {
    const json = JSON.stringify({
      entries: [{ number: 1, description: "Entry has no title." }],
    });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, false);
    assertEquals(result.failures[0].type, "invalid_entry_schema");
    assertStringIncludes(result.failures[0].detail, "missing required fields: title");
  },
});

Deno.test({
  name: "per-entry — missing 'description' field produces granular error",
  fn() {
    const json = JSON.stringify({
      entries: [{ number: 1, title: "No Desc" }],
    });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, false);
    assertEquals(result.failures[0].type, "invalid_entry_schema");
    assertStringIncludes(result.failures[0].detail, "missing required fields: description");
  },
});

// ═══════════════════════════════════════════════════════════════
// 3. Per-entry: multiple missing fields
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "per-entry — missing multiple fields lists all of them",
  fn() {
    const json = JSON.stringify({
      entries: [{ number: null, title: "", description: "" }],
    });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, false);
    assertEquals(result.failures.length, 1);
    // number is null → missing; title is falsy → missing; description is falsy → missing
    assertStringIncludes(result.failures[0].detail, "number");
    assertStringIncludes(result.failures[0].detail, "title");
    assertStringIncludes(result.failures[0].detail, "description");
  },
});

Deno.test({
  name: "per-entry — entry with only title fails (missing number AND description)",
  fn() {
    const json = JSON.stringify({
      entries: [{ title: "Only Title" }],
    });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, false);
    assertStringIncludes(result.failures[0].detail, "number");
    assertStringIncludes(result.failures[0].detail, "description");
  },
});

// ═══════════════════════════════════════════════════════════════
// 4. Per-entry: falsy values
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "per-entry — number=0 is valid (falsy but not null/undefined)",
  fn() {
    const json = JSON.stringify({
      entries: [{ number: 0, title: "Zero", description: "Entry with number 0." }],
    });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, true, "number=0 should pass (not null)");
  },
});

Deno.test({
  name: "per-entry — empty string title fails",
  fn() {
    const json = JSON.stringify({
      entries: [{ number: 1, title: "", description: "Empty title." }],
    });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, false);
    assertStringIncludes(result.failures[0].detail, "title");
  },
});

Deno.test({
  name: "per-entry — empty string description fails",
  fn() {
    const json = JSON.stringify({
      entries: [{ number: 1, title: "Empty Desc", description: "" }],
    });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, false);
    assertStringIncludes(result.failures[0].detail, "description");
  },
});

Deno.test({
  name: "per-entry — whitespace-only title is NOT caught (real code uses !e.title, not trim)",
  fn() {
    // NOTE: The real chunkRunner code checks `!e.title`, and `"   "` is truthy
    // because it's a non-empty string. Whitespace-only titles are NOT caught
    // by this check. This test documents the current behavior.
    const json = JSON.stringify({
      entries: [{ number: 1, title: "   ", description: "Whitespace title." }],
    });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, true, "whitespace-only title is truthy — passes current check");
  },
});

// ═══════════════════════════════════════════════════════════════
// 5. Multi-entry: mix of valid and invalid
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "multi-entry — one invalid entry among many produces error only for that entry",
  fn() {
    const json = JSON.stringify({
      entries: [
        makeEntry(1, "Valid One", "First valid entry."),
        { number: 2, description: "Missing title on purpose." },
        makeEntry(3, "Valid Two", "Third valid entry."),
      ],
    });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, false);
    assertEquals(result.failures.length, 1, "only entry 2 should fail");
    assertStringIncludes(result.failures[0].detail, "Entry 2");
    assertStringIncludes(result.failures[0].detail, "title");
  },
});

Deno.test({
  name: "multi-entry — two invalid entries produce two granular errors",
  fn() {
    const json = JSON.stringify({
      entries: [
        { number: 1, description: "Missing title." },
        { number: 2, title: "No description" },
      ],
    });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, false);
    assertEquals(result.failures.length, 2, "two entries should each fail");
    assertStringIncludes(result.failures[0].detail, "Entry 1");
    assertStringIncludes(result.failures[1].detail, "Entry 2");
  },
});

// ═══════════════════════════════════════════════════════════════
// 6. Edge: global structure failures still caught
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "edge — missing entries array still caught before per-entry check",
  fn() {
    const json = JSON.stringify({ not_entries: [validEntry] });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, false);
    assertEquals(result.failures[0].type, "invalid_json");
    assertStringIncludes(result.failures[0].detail, "missing entries array");
  },
});

Deno.test({
  name: "edge — empty entries array fails with specific message",
  fn() {
    const json = JSON.stringify({ entries: [] });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, false);
    assertEquals(result.failures[0].type, "invalid_json");
    assertStringIncludes(result.failures[0].detail, "empty entries array");
  },
});

Deno.test({
  name: "edge — unparseable JSON is caught at parse level",
  fn() {
    const result = validateStoryOutlineAssembly("{{{ not json }}}");
    assertEquals(result.pass, false);
    assertEquals(result.failures[0].type, "invalid_json");
    assertStringIncludes(result.failures[0].detail, "unparseable JSON");
  },
});

// ═══════════════════════════════════════════════════════════════
// 7. Invariant: repair actions
// ═══════════════════════════════════════════════════════════════

Deno.test({
  name: "invariant — per-entry failure triggers regen_all repair action",
  fn() {
    const json = JSON.stringify({
      entries: [{ number: 1, title: "Valid", description: "Desc" }, { number: 2, title: "" }],
    });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, false);
    assertEquals(result.repairAction, "regen_all");
  },
});

Deno.test({
  name: "invariant — all valid entries produce repairAction=none",
  fn() {
    const json = JSON.stringify({
      entries: [
        makeEntry(1, "A", "Desc A"),
        makeEntry(2, "B", "Desc B"),
        makeEntry(3, "C", "Desc C"),
      ],
    });
    const result = validateStoryOutlineAssembly(json);
    assertEquals(result.pass, true);
    assertEquals(result.repairAction, "none");
  },
});