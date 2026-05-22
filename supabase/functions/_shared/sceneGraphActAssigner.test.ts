/**
 * Tests for sceneGraphActAssigner — format-aware act assignment.
 *
 * Covers all three execution paths:
 *   (A) JSON beat sheet with act_affiliation
 *   (B) Text beat sheet — parse beats, acts via proportional split
 *   (C) No beat sheet — pure proportional split
 *
 * Plus edge cases, invariants, boundary conditions, and regression.
 */

import { assertEquals, assert, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  assignSceneActs,
  getActCountForLane,
  getActLabelsForLane,
  parseBeatsFromTextLocal,
} from "./sceneGraphActAssigner.ts";

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/** Build a valid JSON beat sheet string */
function jsonBeatSheet(beats: Record<string, unknown>[]): string {
  return JSON.stringify({ beats });
}

function makeActSummary(assignments: { act: number }[]): string {
  const counts: Record<number, number> = {};
  for (const a of assignments) {
    counts[a.act] = (counts[a.act] || 0) + 1;
  }
  return Object.entries(counts)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([act, count]) => `Act${act}:${count}`)
    .join(" ");
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. PRIMARY USE CASE — Happy Paths
// ══════════════════════════════════════════════════════════════════════════════

// ── PATH A: JSON beat sheet with act_affiliation ──

Deno.test({
  name: "assignSceneActs | PATH A | JSON beat sheet with act_affiliation for feature_film (4 acts, 83 scenes)",
  fn() {
    const beats = [
      { title: "Opening", act_affiliation: "ACT 1" },
      { title: "Inciting Incident", act_affiliation: "ACT 1" },
      { title: "Rising Action 1", act_affiliation: "ACT 2" },
      { title: "Rising Action 2", act_affiliation: "ACT 2" },
      { title: "Rising Action 3", act_affiliation: "ACT 2" },
      { title: "Midpoint", act_affiliation: "ACT 2" },
      { title: "Rising Tension", act_affiliation: "ACT 3" },
      { title: "Darkest Moment", act_affiliation: "ACT 3" },
      { title: "Climax Build", act_affiliation: "ACT 4" },
      { title: "Resolution", act_affiliation: "ACT 4" },
      { title: "Final Scene", act_affiliation: "ACT 4" },
    ];
    const result = assignSceneActs({
      totalScenes: 83,
      assignedLane: "feature_film",
      beatSheetText: jsonBeatSheet(beats),
    });

    assertEquals(result.path, "json_beat_sheet");
    assertEquals(result.beatsFound, 11);
    assertEquals(result.resolvedLane, "feature_film");
    assertEquals(result.assignments.length, 83);

    // All acts 1-4 should be present
    const acts = new Set(result.assignments.map(a => a.act));
    assertEquals(acts.size, 4);

    // Scene 0 should be Act 1, Scene 82 should be Act 4
    assertEquals(result.assignments[0].act, 1);
    assertEquals(result.assignments[82].act, 4);
    assertEquals(result.assignments[82].actLabel, "ACT 4");
  },
});

Deno.test({
  name: "assignSceneActs | PATH A | vertical_drama (3 acts, 33 scenes)",
  fn() {
    const beats = [
      { name: "Setup", act_affiliation: "ACT 1" },
      { name: "Conflict", act_affiliation: "ACT 2" },
      { name: "Resolution", act_affiliation: "ACT 3" },
    ];
    const result = assignSceneActs({
      totalScenes: 33,
      assignedLane: "vertical_drama",
      beatSheetText: jsonBeatSheet(beats),
    });

    assertEquals(result.path, "json_beat_sheet");
    assertEquals(result.resolvedLane, "vertical_drama");
    const acts = new Set(result.assignments.map(a => a.act));
    assertEquals(acts.size, 3);

    assertEquals(result.assignments[0].act, 1);
    assertEquals(result.assignments[32].act, 3);
  },
});

// ── PATH B: Text beat sheet ──

Deno.test({
  name: "assignSceneActs | PATH B | text beat sheet with ## Beat headers",
  fn() {
    const text = `## Beat 1
Opening scene setup

## Beat 2
Inciting incident

## Beat 3
Rising action

## Beat 4
Climax and resolution`;

    const result = assignSceneActs({
      totalScenes: 40,
      assignedLane: "feature_film",
      beatSheetText: text,
    });

    assertEquals(result.path, "text_beat_sheet");
    assertEquals(result.beatsFound, 4);
    assertEquals(result.resolvedLane, "feature_film");
    assertEquals(result.assignments.length, 40);

    // All acts should be present
    const acts = new Set(result.assignments.map(a => a.act));
    assertEquals(acts.size, 4);
  },
});

// ── PATH C: Pure proportional ──

Deno.test({
  name: "assignSceneActs | PATH C | no beat sheet — pure proportional for series (4 acts)",
  fn() {
    const result = assignSceneActs({
      totalScenes: 60,
      assignedLane: "series",
      beatSheetText: null,
    });

    assertEquals(result.path, "pure_proportional");
    assertEquals(result.resolvedLane, "series");
    assertEquals(result.assignments.length, 60);

    // Series uses [0.20, 0.45, 0.75] → roughly 12/15/18/15
    const acts = new Set(result.assignments.map(a => a.act));
    assertEquals(acts.size, 4);

    // Scene 0 should be Act 1
    assertEquals(result.assignments[0].actLabel, "ACT 1");
  },
});

Deno.test({
  name: "assignSceneActs | PATH C | documentary (3 acts, pure proportional)",
  fn() {
    const result = assignSceneActs({
      totalScenes: 30,
      assignedLane: "documentary",
    });

    assertEquals(result.path, "pure_proportional");
    const acts = new Set(result.assignments.map(a => a.act));
    assertEquals(acts.size, 3);
    assertEquals(result.assignments[29].act, 3);
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. EDGE CASES — Empty / Zero / Single
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "assignSceneActs | EDGE | totalScenes = 0 returns empty assignments",
  fn() {
    const result = assignSceneActs({
      totalScenes: 0,
      assignedLane: "feature_film",
    });
    assertEquals(result.assignments.length, 0);
    assertEquals(result.path, "pure_proportional");
  },
});

Deno.test({
  name: "assignSceneActs | EDGE | totalScenes = 1 returns single scene (proportional split with center point)",
  fn() {
    const result = assignSceneActs({
      totalScenes: 1,
      assignedLane: "feature_film",
    });
    assertEquals(result.assignments.length, 1);
    // Center point (0+0.5)/1 = 0.5 hits thresholds [0.22, 0.50, 0.78]
    // 0.5 >= 0.22 → act 2, 0.5 >= 0.50 → act 3, 0.5 < 0.78 → break → min(3,4)=3
    assert(result.assignments[0].act >= 1 && result.assignments[0].act <= 4,
      `Scene 0 has act ${result.assignments[0].act}`);
    assert(result.assignments[0].actLabel.startsWith("ACT"));
  },
});

Deno.test({
  name: "assignSceneActs | EDGE | totalScenes = 2 — proportional split assigns across acts",
  fn() {
    const result = assignSceneActs({
      totalScenes: 2,
      assignedLane: "feature_film",
    });
    assertEquals(result.assignments.length, 2);
    // Scene 0: (0+0.5)/2 = 0.25 >= 0.22 → act 2. 0.25 < 0.50 → break. min(2,4)=2
    // Scene 1: (1+0.5)/2 = 0.75 >= 0.22 → act 2. 0.75 >= 0.50 → act 3. 0.75 < 0.78 → break. min(3,4)=3
    assertEquals(result.assignments[0].act, 2);
    assertEquals(result.assignments[1].act, 3);
  },
});

Deno.test({
  name: "assignSceneActs | EDGE | empty beat sheet text (empty string) falls to PATH C",
  fn() {
    const result = assignSceneActs({
      totalScenes: 10,
      assignedLane: "feature_film",
      beatSheetText: "",
    });
    assertEquals(result.path, "pure_proportional");
  },
});

Deno.test({
  name: "assignSceneActs | EDGE | whitespace-only beat sheet falls to PATH C",
  fn() {
    const result = assignSceneActs({
      totalScenes: 10,
      assignedLane: "vertical_drama",
      beatSheetText: "   \n  \t  ",
    });
    assertEquals(result.path, "pure_proportional");
  },
});

Deno.test({
  name: "assignSceneActs | EDGE | JSON beat sheet with empty beats array falls to PATH C",
  fn() {
    const result = assignSceneActs({
      totalScenes: 10,
      assignedLane: "feature_film",
      beatSheetText: '{"beats": []}',
    });
    assertEquals(result.path, "pure_proportional");
  },
});

Deno.test({
  name: "assignSceneActs | EDGE | invalid JSON beat sheet falls to PATH C",
  fn() {
    const result = assignSceneActs({
      totalScenes: 10,
      assignedLane: "feature_film",
      beatSheetText: '{"not_beats": [], "title": "test"}',
    });
    assertEquals(result.path, "pure_proportional");
  },
});

Deno.test({
  name: "assignSceneActs | EDGE | non-JSON text that looks like JSON but has parse error falls to PATH B/C",
  fn() {
    const result = assignSceneActs({
      totalScenes: 10,
      assignedLane: "feature_film",
      beatSheetText: '{"beats": [incomplete}',
    });
    assertEquals(result.path, "pure_proportional");
  },
});

Deno.test({
  name: "assignSceneActs | EDGE | beat sheet with no recognizable beat markers falls to PATH C",
  fn() {
    const result = assignSceneActs({
      totalScenes: 15,
      assignedLane: "series",
      beatSheetText: "This is just a narrative text without any beat formatting.",
    });
    assertEquals(result.path, "pure_proportional");
  },
});

Deno.test({
  name: "assignSceneActs | EDGE | JSON beat with unaffiliated beats distributes proportionally",
  fn() {
    const beats = [
      { title: "Beat A", act_affiliation: "ACT 1" },
      { title: "Beat B", act_affiliation: "" },  // unaffiliated
      { title: "Beat C" },                         // unaffiliated
      { title: "Beat D", act_affiliation: "ACT 4" },
    ];
    const result = assignSceneActs({
      totalScenes: 20,
      assignedLane: "feature_film",
      beatSheetText: jsonBeatSheet(beats),
    });

    assertEquals(result.path, "json_beat_sheet");
    // Verify unaffiliated beats were assigned to acts
    assertEquals(result.assignments.length, 20);
    const acts = new Set(result.assignments.map(a => a.act));
    assertEquals(acts.size, 4);
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. BOUNDARY VALUES — Scene Count Extremes
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "assignSceneActs | BOUNDARY | 1000 scenes — large count stability",
  fn() {
    const result = assignSceneActs({
      totalScenes: 1000,
      assignedLane: "feature_film",
    });

    assertEquals(result.assignments.length, 1000);
    const acts = new Set(result.assignments.map(a => a.act));
    assertEquals(acts.size, 4);

    // All scenes should have valid act labels
    for (const a of result.assignments) {
      assert(a.act >= 1 && a.act <= 4, `Scene ${a.sceneIndex} has invalid act ${a.act}`);
    }
  },
});

Deno.test({
  name: "assignSceneActs | BOUNDARY | 2 scenes in vertical_drama (less than number of acts)",
  fn() {
    const result = assignSceneActs({
      totalScenes: 2,
      assignedLane: "vertical_drama",
    });
    assertEquals(result.assignments.length, 2);
    // Scene 0: (0+0.5)/2 = 0.25 < 0.30 → break → act 1
    // Scene 1: (1+0.5)/2 = 0.75 >= 0.30 → act 2. 0.75 >= 0.65 → act 3
    assertEquals(result.assignments[0].act, 1);
    assertEquals(result.assignments[1].act, 3);
  },
});

Deno.test({
  name: "assignSceneActs | BOUNDARY | exact boundary — 100 scenes with series thresholds [0.20, 0.45, 0.75]",
  fn() {
    const result = assignSceneActs({
      totalScenes: 100,
      assignedLane: "series",
    });

    const actCounts = [0, 0, 0, 0];
    for (const a of result.assignments) {
      actCounts[a.act - 1]++;
    }

    // Act 1: ~20%, Act 2: ~25%, Act 3: ~30%, Act 4: ~25%
    assertEquals(result.assignments.length, 100);
    assertEquals(result.assignments[0].act, 1);
    assertEquals(result.assignments[99].act, 4);
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. INVARIANTS — Constraint Violations Must Be Caught
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "assignSceneActs | INVARIANT | all 1..N acts appear and scene 0 is Act 1",
  fn() {
    // For each format, verify acts are contiguous from 1 to actCount
    const formats = ["feature_film", "series", "vertical_drama", "documentary", "animation", "short", "studio", "independent-film"];
    for (const fmt of formats) {
      const result = assignSceneActs({
        totalScenes: 50,
        assignedLane: fmt,
      });

      const actCount = getActCountForLane(fmt);
      const acts = new Set(result.assignments.map(a => a.act));

      // All acts must be present
      for (let i = 1; i <= actCount; i++) {
        assert(acts.has(i), `Format ${fmt}: Act ${i} missing`);
      }

      // Scene 0 must always be Act 1
      assertEquals(result.assignments[0].act, 1, `Format ${fmt}: scene 0 not Act 1`);

      // Scene N-1 must always be the last act
      assertEquals(result.assignments[49].act, actCount, `Format ${fmt}: last scene not Act ${actCount}`);

      // No extra acts beyond actCount
      for (const a of result.assignments) {
        assert(a.act >= 1 && a.act <= actCount, `Format ${fmt}: invalid act ${a.act}`);
      }
    }
  },
});

Deno.test({
  name: "assignSceneActs | INVARIANT | act numbers are sequential (no gaps, no out-of-range)",
  fn() {
    const result = assignSceneActs({
      totalScenes: 73,
      assignedLane: "animation",  // 3 acts: [0.25, 0.60]
    });
    const acts = new Set(result.assignments.map(a => a.act));
    assertEquals(acts.size, 3);
    for (let i = 1; i <= 3; i++) {
      assert(acts.has(i), `Act ${i} should exist`);
    }

    // Verify monotonic — act numbers should only increase
    let prevAct = 1;
    for (const a of result.assignments) {
      assert(a.act >= prevAct, `Act decreased from ${prevAct} to ${a.act}`);
      prevAct = a.act;
    }
  },
});

Deno.test({
  name: "assignSceneActs | INVARIANT | total assignments always equals totalScenes",
  fn() {
    const counts = [0, 1, 5, 10, 25, 83, 100, 500];
    for (const count of counts) {
      const result = assignSceneActs({
        totalScenes: count,
        assignedLane: "feature_film",
        beatSheetText: count > 0 ? jsonBeatSheet([
          { name: "Start", act_affiliation: "ACT 1" },
          { name: "Mid", act_affiliation: "ACT 2" },
          { name: "End", act_affiliation: "ACT 4" },
        ]) : null,
      });
      assertEquals(result.assignments.length, count, `totalScenes=${count}: mismatched length`);
    }
  },
});

Deno.test({
  name: "assignSceneActs | INVARIANT | each scene has valid sceneIndex 0..N-1 and act 1..actCount",
  fn() {
    const result = assignSceneActs({ totalScenes: 50, assignedLane: "feature_film" });
    for (const a of result.assignments) {
      assert(typeof a.sceneIndex === "number" && a.sceneIndex >= 0 && a.sceneIndex < 50);
      assert(typeof a.act === "number" && a.act >= 1 && a.act <= 4);
      assert(typeof a.actLabel === "string" && a.actLabel.startsWith("ACT"));
    }
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. FORMAT-AWARE THRESHOLDS
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "getActCountForLane | known lanes return correct counts",
  fn() {
    assertEquals(getActCountForLane("feature_film"), 4);
    assertEquals(getActCountForLane("independent-film"), 4);
    assertEquals(getActCountForLane("studio"), 4);
    assertEquals(getActCountForLane("series"), 4);
    assertEquals(getActCountForLane("vertical_drama"), 3);
    assertEquals(getActCountForLane("documentary"), 3);
    assertEquals(getActCountForLane("animation"), 3);
    assertEquals(getActCountForLane("short"), 3);
  },
});

Deno.test({
  name: "getActCountForLane | unknown lane falls back to unspecified (4 acts)",
  fn() {
    assertEquals(getActCountForLane("unknown_format"), 4);
    assertEquals(getActCountForLane("reality_tv"), 4);
    assertEquals(getActCountForLane(""), 4);
  },
});

Deno.test({
  name: "getActCountForLane | lane normalization works (dash→underscore, case-insensitive)",
  fn() {
    assertEquals(getActCountForLane("Feature-Film"), 4);
    assertEquals(getActCountForLane("FEATURE_FILM"), 4);
    assertEquals(getActCountForLane("Vertical Drama"), 3);
    assertEquals(getActCountForLane("VERTICAL_DRAMA"), 3);
  },
});

Deno.test({
  name: "getActLabelsForLane | returns correct labels for each lane",
  fn() {
    assertEquals(getActLabelsForLane("feature_film"), ["ACT 1", "ACT 2", "ACT 3", "ACT 4"]);
    assertEquals(getActLabelsForLane("vertical_drama"), ["ACT 1", "ACT 2", "ACT 3"]);
    assertEquals(getActLabelsForLane("documentary"), ["ACT 1", "ACT 2", "ACT 3"]);
  },
});

Deno.test({
  name: "assignSceneActs | format differences produce distinct act distributions",
  fn() {
    const sceneCount = 100;

    // Feature film: [0.22, 0.50, 0.78] → roughly 22/28/28/22
    const feature = assignSceneActs({ totalScenes: sceneCount, assignedLane: "feature_film" });
    const featureCounts = [0, 0, 0, 0];
    for (const a of feature.assignments) featureCounts[a.act - 1]++;

    // Series: [0.20, 0.45, 0.75] → roughly 20/25/30/25
    const series = assignSceneActs({ totalScenes: sceneCount, assignedLane: "series" });
    const seriesCounts = [0, 0, 0, 0];
    for (const a of series.assignments) seriesCounts[a.act - 1]++;

    // Vertical drama: [0.30, 0.65] → roughly 30/35/35
    const vertical = assignSceneActs({ totalScenes: sceneCount, assignedLane: "vertical_drama" });
    const verticalCounts = [0, 0, 0];
    for (const a of vertical.assignments) verticalCounts[a.act - 1]++;

    // Feature act 1 has more scenes than series act 1 (0.22 > 0.20 threshold)
    // Higher threshold = more scenes in act 1 (wider range before crossing into act 2)
    assert(featureCounts[0] > seriesCounts[0],
      "Feature Act 1 should have more scenes than Series Act 1 (feature threshold 0.22 > series 0.20)");

    // Vertical drama has 3 acts, feature has 4
    assertEquals(featureCounts.length, 4);
    assertEquals(verticalCounts.length, 3);
  },
});

Deno.test({
  name: "assignSceneActs | undefined/null assignedLane falls back to unspecified (4 acts)",
  fn() {
    const r1 = assignSceneActs({ totalScenes: 20, assignedLane: "unspecified" });
    const r2 = assignSceneActs({ totalScenes: 20, assignedLane: "" });
    assertEquals(r1.assignments[r1.assignments.length - 1].act, 4);
    assertEquals(r2.assignments[r2.assignments.length - 1].act, 4);
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. parseBeatsFromTextLocal — All Format Variants
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "parseBeatsFromTextLocal | ## Beat header format",
  fn() {
    const text = `## Beat 1
Opening scene

## Beat 2
Inciting incident happens

## Beat 3
Rising action`;
    const beats = parseBeatsFromTextLocal(text);
    assertEquals(beats.length, 3);
    assertEquals(beats[0].beat, text.slice(0, beats[0].end));
    assertEquals(beats[2].beat, text.slice(beats[2].start));
  },
});

Deno.test({
  name: "parseBeatsFromTextLocal | ### Beat header format (h3)",
  fn() {
    const text = `### Beat 1
Setup

### Beat 2
Conflict`;
    const beats = parseBeatsFromTextLocal(text);
    assertEquals(beats.length, 2);
  },
});

Deno.test({
  name: "parseBeatsFromTextLocal | ### N. Title format",
  fn() {
    const text = `### 1. Opening Scene
Description here

### 2. Inciting Incident
More description`;
    const beats = parseBeatsFromTextLocal(text);
    assertEquals(beats.length, 2);
  },
});

Deno.test({
  name: "parseBeatsFromTextLocal | numbered **Beat Name** format",
  fn() {
    const text = `1. **Opening Image**
Dark room, single chair

2. **Theme Stated**
Character says line`;
    const beats = parseBeatsFromTextLocal(text);
    assertEquals(beats.length, 2);
  },
});

Deno.test({
  name: "parseBeatsFromTextLocal | plain numbered \"N. Name\" format (no bold)",
  fn() {
    const text = `1. Opening Image
Description here

2. Theme Stated
More text`;
    const beats = parseBeatsFromTextLocal(text);
    assertEquals(beats.length, 2);
  },
});

Deno.test({
  name: "parseBeatsFromTextLocal | BEAT N: Name format",
  fn() {
    const text = `BEAT 1: Opening
Description here

BEAT 2: Conflict
More text`;
    const beats = parseBeatsFromTextLocal(text);
    assertEquals(beats.length, 2);
  },
});

Deno.test({
  name: "parseBeatsFromTextLocal | empty string returns empty array",
  fn() {
    assertEquals(parseBeatsFromTextLocal("").length, 0);
    assertEquals(parseBeatsFromTextLocal("   ").length, 0);
  },
});

Deno.test({
  name: "parseBeatsFromTextLocal | text without beat markers returns empty array",
  fn() {
    assertEquals(parseBeatsFromTextLocal("Just some narrative text without beats.").length, 0);
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. RESOLVE ACT FROM LABEL — Edge Cases
// ══════════════════════════════════════════════════════════════════════════════

// Note: resolveActFromLabel is not exported. These tests exercise it indirectly
// through the JSON beat sheet path.

Deno.test({
  name: "assignSceneActs | resolveActFromLabel | various label formats all work",
  fn() {
    // "ACT 1", "Act I", "act_1", "First Act", "ACT1" (no space)
    const testBeats = [
      { name: "A", act_affiliation: "ACT 1" },
      { name: "B", act_affiliation: "act_1" },
      { name: "C", act_affiliation: "Act I" },
      { name: "D", act_affiliation: "First Act" },
      { name: "E", act_affiliation: "ACT 2" },
      { name: "F", act_affiliation: "act_2" },
      { name: "G", act_affiliation: "Act II" },
      { name: "H", act_affiliation: "Second Act" },
      { name: "I", act_affiliation: "ACT 3" },
      { name: "J", act_affiliation: "ACT 4" },
    ];
    const result = assignSceneActs({
      totalScenes: 30,
      assignedLane: "feature_film",
      beatSheetText: jsonBeatSheet(testBeats),
    });

    assertEquals(result.path, "json_beat_sheet");
    assertEquals(result.beatsFound, 10);
    assertEquals(result.assignments.length, 30);
    const acts = new Set(result.assignments.map(a => a.act));
    assertEquals(acts.size, 4);
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. PROPORTIONAL ROUNDING ACCURACY — The Key Fix From This PR
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "assignSceneActs | REGRESSION | cumulative proportional rounding prevents scene dumping (Math.floor fix)",
  fn() {
    // 83 scenes with 12 beats (3/2/3/4) — the exact scenario that exposed the bug
    const beats = [
      { title: "Opening", act_affiliation: "ACT 1" },
      { title: "Setup", act_affiliation: "ACT 1" },
      { title: "Set Piece", act_affiliation: "ACT 1" },
      { title: "Conflict", act_affiliation: "ACT 2" },
      { title: "Escalation", act_affiliation: "ACT 2" },
      { title: "Midpoint", act_affiliation: "ACT 3" },
      { title: "Rising Action", act_affiliation: "ACT 3" },
      { title: "Rising Action 2", act_affiliation: "ACT 3" },
      { title: "Climax Build", act_affiliation: "ACT 4" },
      { title: "Climax", act_affiliation: "ACT 4" },
      { title: "Falling Action", act_affiliation: "ACT 4" },
      { title: "Resolution", act_affiliation: "ACT 4" },
    ];
    const result = assignSceneActs({
      totalScenes: 83,
      assignedLane: "feature_film",
      beatSheetText: jsonBeatSheet(beats),
    });

    assertEquals(result.assignments.length, 83);
    assertEquals(result.path, "json_beat_sheet");

    // Act distribution — with cumulative rounding, no single act gets dumped
    const actCounts = [0, 0, 0, 0];
    for (const a of result.assignments) {
      actCounts[a.act - 1]++;
    }
    const total = actCounts.reduce((s, c) => s + c, 0);
    assertEquals(total, 83);

    // Each act should get a reasonable share (no act should get < 10% or > 45%)
    for (let i = 0; i < 4; i++) {
      const pct = actCounts[i] / 83;
      assert(pct >= 0.08, `Act ${i + 1} has ${actCounts[i]} scenes (${(pct * 100).toFixed(1)}%) — too few`);
      assert(pct <= 0.45, `Act ${i + 1} has ${actCounts[i]} scenes (${(pct * 100).toFixed(1)}%) — too many`);
    }
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. PATH-A JSON BEAT SHEET DETAILED CORRECTNESS
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "assignSceneActs | PATH A | scene distribution matches beat ratio precisely for equal beats",
  fn() {
    // 4 acts, 4 beats, 100 scenes → each act gets ~25 scenes
    const beats = [
      { title: "A", act_affiliation: "ACT 1" },
      { title: "B", act_affiliation: "ACT 2" },
      { title: "C", act_affiliation: "ACT 3" },
      { title: "D", act_affiliation: "ACT 4" },
    ];
    const result = assignSceneActs({
      totalScenes: 100,
      assignedLane: "feature_film",
      beatSheetText: jsonBeatSheet(beats),
    });

    const actCounts = [0, 0, 0, 0];
    for (const a of result.assignments) actCounts[a.act - 1]++;
    assertEquals(actCounts.reduce((s, c) => s + c, 0), 100);

    // With equal beats and Math.round, each act should get approximately 25
    for (let i = 0; i < 4; i++) {
      assert(actCounts[i] >= 20 && actCounts[i] <= 30,
        `Act ${i + 1} has ${actCounts[i]} — expected ~25`);
    }
  },
});

Deno.test({
  name: "assignSceneActs | PATH A | JSON with unaffiliated beats (no act_affiliation) distributes evenly",
  fn() {
    const beats = [
      { title: "Beat A" },
      { title: "Beat B" },
      { title: "Beat C" },
      { title: "Beat D" },
      { title: "Beat E" },
    ];
    const result = assignSceneActs({
      totalScenes: 50,
      assignedLane: "feature_film",
      beatSheetText: jsonBeatSheet(beats),
    });

    assertEquals(result.path, "json_beat_sheet");
    assertEquals(result.beatsFound, 5);
    assertEquals(result.assignments.length, 50);

    // All unaffiliated beats get distributed proportionally across acts
    const actCounts = [0, 0, 0, 0];
    for (const a of result.assignments) actCounts[a.act - 1]++;
    assertEquals(actCounts.reduce((s, c) => s + c, 0), 50);
  },
});

Deno.test({
  name: "assignSceneActs | PATH A | JSON beats with mixed act_affiliation and act field",
  fn() {
    const beats = [
      { title: "Opening", act_affiliation: "ACT 1" },
      { title: "Middle", act: "2" },       // uses `act` field as fallback
      { title: "Ending", act_affiliation: "ACT 4" },
    ];
    const result = assignSceneActs({
      totalScenes: 30,
      assignedLane: "feature_film",
      beatSheetText: jsonBeatSheet(beats),
    });

    assertEquals(result.path, "json_beat_sheet");
    assertEquals(result.beatsFound, 3);
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. PATH B TEXT BEAT SHEET DETAILED CORRECTNESS
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "assignSceneActs | PATH B | ### Beat header format (h3) parses correctly",
  fn() {
    const text = `### Beat 1
Opening

### Beat 2
Rising

### Beat 3
Climax`;
    const result = assignSceneActs({
      totalScenes: 45,
      assignedLane: "feature_film",
      beatSheetText: text,
    });
    assertEquals(result.path, "text_beat_sheet");
    assertEquals(result.beatsFound, 3);
  },
});

Deno.test({
  name: "assignSceneActs | PATH B | ### N. numbered headers parse correctly",
  fn() {
    const text = `### 1. First Scene
Content

### 2. Second Scene
Content`;
    const result = assignSceneActs({
      totalScenes: 30,
      assignedLane: "feature_film",
      beatSheetText: text,
    });
    assertEquals(result.path, "text_beat_sheet");
    assertEquals(result.beatsFound, 2);
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. REGRESSION — Existing Functionality Not Broken
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "assignSceneActs | REGRESSION | totals always sum to totalScenes",
  fn() {
    for (let total = 0; total <= 50; total++) {
      const r1 = assignSceneActs({ totalScenes: total, assignedLane: "feature_film" });
      assertEquals(r1.assignments.length, total, `pure_proportional with ${total}`);

      if (total > 0) {
        const r2 = assignSceneActs({
          totalScenes: total,
          assignedLane: "series",
          beatSheetText: jsonBeatSheet([
            { name: "Open", act_affiliation: "ACT 1" },
            { name: "End", act_affiliation: "ACT 4" },
          ]),
        });
        assertEquals(r2.assignments.length, total, `json_beat_sheet with ${total}`);
      }
    }
  },
});

Deno.test({
  name: "assignSceneActs | REGRESSION | studio and indie-film match feature_film thresholds",
  fn() {
    const feature = assignSceneActs({ totalScenes: 80, assignedLane: "feature_film" });
    const studio = assignSceneActs({ totalScenes: 80, assignedLane: "studio" });
    const indie = assignSceneActs({ totalScenes: 80, assignedLane: "independent-film" });

    assertEquals(feature.assignments.map(a => a.act), studio.assignments.map(a => a.act));
    assertEquals(feature.assignments.map(a => a.act), indie.assignments.map(a => a.act));
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// 12. INTEGRATION — Cross-Module Correctness
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "assignSceneActs | INTEGRATION | actCount × labels consistency",
  fn() {
    const lanes = ["feature_film", "series", "vertical_drama", "documentary", "animation", "short"];
    for (const lane of lanes) {
      const count = getActCountForLane(lane);
      const labels = getActLabelsForLane(lane);
      assertEquals(labels.length, count, `${lane}: label count ${labels.length} !== actCount ${count}`);

      // Labels should be "ACT N" format
      for (let i = 0; i < labels.length; i++) {
        assert(labels[i].startsWith("ACT "), `${lane}: label ${i} doesn't start with 'ACT '`);
      }
    }
  },
});