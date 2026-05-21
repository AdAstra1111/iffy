/**
 * Tests for episodeBeatsChunked — verifies completeness, ordering, and repair.
 */
import { describe, it, expect } from "vitest";
import {
  parseEpisodeBlocks,
  mergeByEpisodeNumber,
  findMissing,
  buildMetaJsonUpdate,
} from "./episodeBeatsChunkedTestHelpers";

// ── parseEpisodeBlocks ──

describe("parseEpisodeBlocks", () => {
  it("parses standard ## EPISODE N headers", () => {
    const raw = `## EPISODE 1
Hook: Something happens
Beat 1: ...

## EPISODE 2
Hook: Another thing
Beat 1: ...`;

    const blocks = parseEpisodeBlocks(raw);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].episodeNumber).toBe(1);
    expect(blocks[1].episodeNumber).toBe(2);
    expect(blocks[0].text).toContain("Something happens");
  });

  it("handles EP shorthand and # heading levels", () => {
    const raw = `# EP 10
Beats here

### Episode 20
More beats`;

    const blocks = parseEpisodeBlocks(raw);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].episodeNumber).toBe(10);
    expect(blocks[1].episodeNumber).toBe(20);
  });

  it("returns empty for no episode headers", () => {
    expect(parseEpisodeBlocks("Just some text without episodes")).toHaveLength(0);
  });
});

// ── mergeByEpisodeNumber ──

describe("mergeByEpisodeNumber", () => {
  it("merges two sets with numeric sorting (not lexical)", () => {
    const a = [
      { episodeNumber: 1, text: "ep1" },
      { episodeNumber: 10, text: "ep10" },
      { episodeNumber: 2, text: "ep2" },
    ];
    const b = [
      { episodeNumber: 3, text: "ep3" },
      { episodeNumber: 20, text: "ep20" },
    ];

    const merged = mergeByEpisodeNumber(a, b);
    expect(merged.map(m => m.episodeNumber)).toEqual([1, 2, 3, 10, 20]);
  });

  it("proves lexical sort would fail (numeric sort passes)", () => {
    const blocks = [
      { episodeNumber: 1, text: "ep1" },
      { episodeNumber: 2, text: "ep2" },
      { episodeNumber: 10, text: "ep10" },
      { episodeNumber: 11, text: "ep11" },
      { episodeNumber: 9, text: "ep9" },
    ];

    const merged = mergeByEpisodeNumber(blocks, []);
    const order = merged.map(m => m.episodeNumber);
    // Lexical would give: [1, 10, 11, 2, 9] — wrong!
    expect(order).toEqual([1, 2, 9, 10, 11]);
  });

  it("last-wins on duplicate episode numbers", () => {
    const a = [{ episodeNumber: 5, text: "old" }];
    const b = [{ episodeNumber: 5, text: "new" }];
    const merged = mergeByEpisodeNumber(a, b);
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe("new");
  });
});

// ── findMissing ──

describe("findMissing", () => {
  it("detects no missing when complete", () => {
    const blocks = Array.from({ length: 30 }, (_, i) => ({
      episodeNumber: i + 1,
      text: `ep${i + 1}`,
    }));
    expect(findMissing(blocks, 30)).toEqual([]);
  });

  it("detects gap in middle (episodes 20-29 missing)", () => {
    const blocks = [
      ...Array.from({ length: 19 }, (_, i) => ({ episodeNumber: i + 1, text: `ep${i + 1}` })),
      { episodeNumber: 30, text: "ep30" },
    ];
    const missing = findMissing(blocks, 30);
    expect(missing).toEqual([20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
  });

  it("detects missing at end", () => {
    const blocks = Array.from({ length: 5 }, (_, i) => ({
      episodeNumber: i + 1,
      text: `ep${i + 1}`,
    }));
    const missing = findMissing(blocks, 8);
    expect(missing).toEqual([6, 7, 8]);
  });

  it("works for small N", () => {
    const blocks = [{ episodeNumber: 1, text: "ep1" }];
    expect(findMissing(blocks, 1)).toEqual([]);
    expect(findMissing(blocks, 3)).toEqual([2, 3]);
  });
});

// ── buildMetaJsonUpdate (the .single() destructuring fix) ──

describe("buildMetaJsonUpdate", () => {
  it("preserves bg_started_at when existing version has it", () => {
    const existingRow = {
      meta_json: { bg_started_at: "2024-06-15T10:00:00Z" },
    };
    const result = buildMetaJsonUpdate(existingRow, 30, 15);
    expect(result.bg_started_at).toBe("2024-06-15T10:00:00Z");
    expect(result.bg_generating).toBe(true);
    expect(result.episodes_completed).toBe(15);
    expect(result.episodes_total).toBe(30);
  });

  it("omits bg_started_at when existing version has no meta_json", () => {
    const existingRow = {} as any;
    const result = buildMetaJsonUpdate(existingRow, 20, 10);
    expect(result).not.toHaveProperty("bg_started_at");
    expect(result.bg_generating).toBe(true);
  });

  it("omits bg_started_at when existing version has null meta_json", () => {
    const existingRow = { meta_json: null } as any;
    const result = buildMetaJsonUpdate(existingRow, 10, 5);
    expect(result).not.toHaveProperty("bg_started_at");
  });

  it("omits bg_started_at when bg_started_at is undefined", () => {
    const existingRow = { meta_json: { bg_started_at: undefined } } as any;
    const result = buildMetaJsonUpdate(existingRow, 10, 5);
    expect(result).not.toHaveProperty("bg_started_at");
  });

  it("handles null existing row (no data returned from .single())", () => {
    const result = buildMetaJsonUpdate(null, 24, 12);
    expect(result).not.toHaveProperty("bg_started_at");
    expect(result.bg_generating).toBe(true);
    expect(result.episodes_completed).toBe(12);
  });

  it("correctly simulates the fixed .single() destructuring pattern", () => {
    // This test validates the pattern fix: .single() returns { data, error }
    // not the row directly. Before the fix, the code didn't destructure .data
    // and existingMeta was always the response wrapper, not the row.
    //
    // Simulate the BUGGY behavior:
    const singleResponse = { data: { meta_json: { bg_started_at: "2024-01-01T00:00:00Z" } }, error: null };
    const buggyAccess = (singleResponse as any)?.meta_json?.bg_started_at;  // Response wrapper, not row
    expect(buggyAccess).toBeUndefined();  // This is why bg_started_at was never preserved!

    // Simulate the FIXED behavior:
    const { data: existingVersion } = singleResponse;
    const fixedAccess = existingVersion?.meta_json?.bg_started_at;
    expect(fixedAccess).toBe("2024-01-01T00:00:00Z");  // Now correctly accessed

    // The helper function uses the fixed pattern
    const result = buildMetaJsonUpdate(existingVersion, 30, 15);
    expect(result.bg_started_at).toBe("2024-01-01T00:00:00Z");
  });

  it("passes buildMetaJsonUpdate through the full meta_json shape", () => {
    const existingRow = {
      meta_json: { bg_started_at: "2024-03-10T08:30:00Z" },
    };
    const result = buildMetaJsonUpdate(existingRow, 24, 24);
    expect(result).toEqual({
      bg_generating: true,
      episode_count: 24,
      episodes_total: 24,
      episodes_completed: 24,
      current_episode: 24,
      bg_started_at: "2024-03-10T08:30:00Z",
    });
  });
});

// ── Integration: repair simulation ──

describe("repair simulation", () => {
  it("merge after repair yields complete 1..N", () => {
    // Simulate batch 1 (1-19) + batch 2 (30 only, missing 20-29)
    const batch1 = Array.from({ length: 19 }, (_, i) => ({
      episodeNumber: i + 1,
      text: `ep${i + 1}`,
    }));
    const batch2 = [{ episodeNumber: 30, text: "ep30" }];

    let allBlocks = mergeByEpisodeNumber(batch1, batch2);
    const missing = findMissing(allBlocks, 30);
    expect(missing).toEqual([20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);

    // Simulate repair generating the missing episodes
    const repairBlocks = missing.map(n => ({
      episodeNumber: n,
      text: `ep${n} (repaired)`,
    }));
    allBlocks = mergeByEpisodeNumber(allBlocks, repairBlocks);

    expect(findMissing(allBlocks, 30)).toEqual([]);
    expect(allBlocks).toHaveLength(30);
    expect(allBlocks.map(b => b.episodeNumber)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1)
    );
  });
});
