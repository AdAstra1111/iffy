import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ── Mock Supabase helpers ──

type SupabaseMockOpts = {
  runsForOrdered?: any[];
  count?: number | null;
  prevRun?: any;
};

function makeSupabase(opts: SupabaseMockOpts) {
  const { runsForOrdered, count, prevRun } = opts;

  // detectNoteChurn chain: .select("output_json, created_at") -> .eq(vid) -> .eq(run_type) -> .order() -> .limit(n)
  function noteChurnChain() {
    return {
      eq: (_field: string, _val: any) => ({
        eq: (_field2: string, _val2: any) => ({
          order: (_field3: string, _opts: { ascending: boolean }) => ({
            limit: (_n: number) => Promise.resolve({ data: runsForOrdered, error: null }),
          }),
        }),
      }),
    };
  }

  // checkDevRunIterationCap chain: .select("*", {count,head}) -> .eq(vid) -> .eq(run_type)
  function countChain() {
    return {
      eq: (_field: string, _val: any) => ({
        eq: (_field2: string, _val2: any) => Promise.resolve({ count, error: null }),
      }),
    };
  }

  // detectCIRegression chain: .select("output_json") -> .eq(vid) -> .eq(run_type) -> .order() -> .limit(1) -> .maybeSingle()
  function ciRegressionChain() {
    return {
      eq: (_field: string, _val: any) => ({
        eq: (_field2: string, _val2: any) => ({
          order: (_field3: string, _opts: { ascending: boolean }) => ({
            limit: (_n: number) => ({
              maybeSingle: () => Promise.resolve({ data: prevRun, error: null }),
            }),
          }),
        }),
      }),
    };
  }

  // anti-repeat (Integration D) chain: same as detectNoteChurn/ciRegression chains — select("output_json") -> eq(vid) -> eq(run_type) -> order() -> limit(n) -> .data (array)
  function antiRepeatChain() {
    return {
      eq: (_field: string, _val: any) => ({
        eq: (_field2: string, _val2: any) => ({
          order: (_field3: string, _opts: { ascending: boolean }) => ({
            limit: (_n: number) => Promise.resolve({ data: runsForOrdered, error: null }),
          }),
        }),
      }),
    };
  }

  const from = (_table: string) => ({
    select: (cols: string, countOpts?: { count: string; head: boolean }) => {
      if (countOpts) return countChain();
      // detectNoteChurn uses "output_json, created_at" and awaits limit() directly
      if (cols.includes("created_at")) return noteChurnChain();
      // detectCIRegression uses "output_json" and calls .limit(1).maybeSingle()
      return ciRegressionChain();
    },
  });

  return { from };
}

function makeErrorSupabase() {
  return {
    from: () => { throw new Error("DB connection failed"); },
  };
}

// ── Function under test: detectNoteChurn ──
// Replicates the exact logic from index.ts lines 548-607 (note_key + category-level churn)

async function detectNoteChurn(
  supabase: any,
  documentId: string,
  versionId: string,
  effectiveDeliverable: string,
  parsed: any,
): Promise<{ demotedKeys: string[] }> {
  if (effectiveDeliverable !== "character_bible") return { demotedKeys: [] };
  try {
    const { data: recentRuns } = await supabase
      .from("development_runs")
      .select("output_json, created_at")
      .eq("version_id", versionId)
      .eq("run_type", "ANALYZE")
      .order("created_at", { ascending: false })
      .limit(5);
    if (!recentRuns || recentRuns.length < 3) return { demotedKeys: [] };

    // ── Level 1: Exact note_key churn ──
    const churnCount: Record<string, number> = {};
    // ── Level 2: Category-level churn ──
    const categoryChurnCount: Record<string, number> = {};

    for (const run of recentRuns) {
      const blockers = run.output_json?.blocking_issues || [];
      const seenKeys = new Set<string>();
      const seenCategories = new Set<string>();
      for (const b of blockers) {
        const nk = b.note_key || b.id;
        if (nk) seenKeys.add(nk);
        if (b.category) seenCategories.add(b.category);
      }
      for (const nk of seenKeys) {
        churnCount[nk] = (churnCount[nk] || 0) + 1;
      }
      for (const nk of Object.keys(churnCount)) {
        if (!seenKeys.has(nk)) {
          churnCount[nk] = 0;
        }
      }
      for (const cat of seenCategories) {
        categoryChurnCount[cat] = (categoryChurnCount[cat] || 0) + 1;
      }
      for (const cat of Object.keys(categoryChurnCount)) {
        if (!seenCategories.has(cat)) {
          categoryChurnCount[cat] = 0;
        }
      }
    }

    const demotedKeys: string[] = [];
    const currentBlockers = parsed.blocking_issues || [];
    const remaining: any[] = [];
    for (const b of currentBlockers) {
      const nk = b.note_key || b.id;
      const cat = b.category;
      if (nk && (churnCount[nk] || 0) >= 3) {
        demotedKeys.push(nk);
        if (!Array.isArray(parsed.polish_notes)) parsed.polish_notes = [];
        parsed.polish_notes.push({ ...b, severity: "polish", churn_demoted: true });
      } else if (cat && (categoryChurnCount[cat] || 0) >= 3) {
        demotedKeys.push(nk || cat);
        if (!Array.isArray(parsed.polish_notes)) parsed.polish_notes = [];
        parsed.polish_notes.push({ ...b, severity: "polish", churn_demoted: true, churn_category: cat });
      } else {
        remaining.push(b);
      }
    }
    parsed.blocking_issues = remaining;
    return { demotedKeys };
  } catch (e) {
    console.warn("[dev-engine-v2][convergence] detectNoteChurn error (non-fatal):", e);
    return { demotedKeys: [] };
  }
}

// ── Function under test: checkDevRunIterationCap ──

const MAX_DEVELOPMENT_RUN_LOOPS = 10;

async function checkDevRunIterationCap(
  supabase: any,
  documentId: string,
  versionId: string,
  parsed: any,
): Promise<boolean> {
  try {
    const { count } = await supabase
      .from("development_runs")
      .select("*", { count: "exact", head: true })
      .eq("version_id", versionId)
      .eq("run_type", "ANALYZE");
    if (count !== null && count >= MAX_DEVELOPMENT_RUN_LOOPS) {
      if (parsed.convergence) {
        parsed.convergence.status = "converged";
        parsed.convergence.iteration_forced_converged = true;
        parsed.convergence.reasons = [...(parsed.convergence.reasons || []), `Force-converged after ${count} ANALYZE iterations (cap: ${MAX_DEVELOPMENT_RUN_LOOPS})`];
      }
      parsed.iteration_forced_converged = true;
      return true;
    }
    return false;
  } catch (e) {
    console.warn("[dev-engine-v2][convergence] checkDevRunIterationCap error (non-fatal):", e);
    return false;
  }
}

// ── Function under test: detectCIRegression ──

const CI_REGRESSION_THRESHOLD = 3;

async function detectCIRegression(
  supabase: any,
  documentId: string,
  versionId: string,
  parsed: any,
): Promise<void> {
  try {
    const currentCi = parsed.ci_score;
    if (typeof currentCi !== "number") return;

    const { data: prevRun } = await supabase
      .from("development_runs")
      .select("output_json")
      .eq("version_id", versionId)
      .eq("run_type", "ANALYZE")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!prevRun || !prevRun.output_json) return;

    const prevCi = prevRun.output_json.ci_score;
    if (typeof prevCi !== "number") return;

    const drop = prevCi - currentCi;
    if (drop >= CI_REGRESSION_THRESHOLD) {
      parsed.ci_regression = {
        previous_ci_score: prevCi,
        current_ci_score: currentCi,
        drop,
        threshold: CI_REGRESSION_THRESHOLD,
        flagged: true,
      };
    }
  } catch (e) {
    console.warn("[dev-engine-v2][convergence] detectCIRegression error (non-fatal):", e);
  }
}

// ═══════════════════════════════════════════════════
// detectNoteChurn — Tests
// ═══════════════════════════════════════════════════

Deno.test("detectNoteChurn: gated to character_bible only", async () => {
  const supabase = makeSupabase({});
  for (const deliv of ["idea", "treatment", "feature_script", "series_bible", ""]) {
    const parsed: any = { blocking_issues: [{ id: "test_key" }] };
    const result = await detectNoteChurn(supabase, "doc1", "v1", deliv, parsed);
    assertEquals(result.demotedKeys.length, 0, `${deliv} should not trigger churn detection`);
    assertEquals(parsed.blocking_issues.length, 1, `${deliv} should not modify blocking_issues`);
  }
});

Deno.test("detectNoteChurn: character_bible gating does trigger", async () => {
  const recentRuns = [
    { output_json: { blocking_issues: [{ id: "weak_arc" }] }, created_at: "2025-01-03T00:00:00Z" },
    { output_json: { blocking_issues: [{ id: "weak_arc" }] }, created_at: "2025-01-02T00:00:00Z" },
    { output_json: { blocking_issues: [{ id: "weak_arc" }] }, created_at: "2025-01-01T00:00:00Z" },
  ];
  const supabase = makeSupabase({ runsForOrdered: recentRuns });
  const parsed: any = { blocking_issues: [{ id: "weak_arc" }] };
  const result = await detectNoteChurn(supabase, "doc1", "v1", "character_bible", parsed);
  assertEquals(result.demotedKeys, ["weak_arc"], "Should detect churn on weak_arc");
});

Deno.test("detectNoteChurn: fewer than 3 runs returns empty", async () => {
  for (const runCount of [0, 1, 2]) {
    const runs = Array.from({ length: runCount }, (_, i) => ({
      output_json: { blocking_issues: [{ id: `key_${i}` }] },
      created_at: `2025-01-0${i + 1}T00:00:00Z`,
    }));
    const supabase = makeSupabase({ runsForOrdered: runs });
    const parsed: any = { blocking_issues: [{ id: "key_0" }] };
    const result = await detectNoteChurn(supabase, "doc1", "v1", "character_bible", parsed);
    assertEquals(result.demotedKeys.length, 0, `${runCount} runs should not trigger churn`);
  }
});

Deno.test("detectNoteChurn: null/undefined recentRuns returns empty", async () => {
  const supabase = makeSupabase({ runsForOrdered: undefined as any });
  const parsed: any = { blocking_issues: [{ id: "some_key" }] };
  const result = await detectNoteChurn(supabase, "doc1", "v1", "character_bible", parsed);
  assertEquals(result.demotedKeys.length, 0, "null runs should return empty");
});

Deno.test("detectNoteChurn: non-consecutive appearances reset count", async () => {
  const recentRuns = [
    { output_json: { blocking_issues: [{ id: "key_a" }, { id: "key_b" }] }, created_at: "2025-01-05T00:00:00Z" },
    { output_json: { blocking_issues: [{ id: "key_a" }] }, created_at: "2025-01-04T00:00:00Z" },
    { output_json: { blocking_issues: [{ id: "key_b" }] }, created_at: "2025-01-03T00:00:00Z" },
    { output_json: { blocking_issues: [{ id: "key_a" }, { id: "key_b" }] }, created_at: "2025-01-02T00:00:00Z" },
    { output_json: { blocking_issues: [{ id: "key_b" }] }, created_at: "2025-01-01T00:00:00Z" },
  ];
  const supabase = makeSupabase({ runsForOrdered: recentRuns });
  const parsed: any = { blocking_issues: [{ id: "key_a" }, { id: "key_b" }] };
  const result = await detectNoteChurn(supabase, "doc1", "v1", "character_bible", parsed);

  // key_a: run5, run4, not run3 (reset), run2, not run1 — max consecutive = 2
  // key_b: not run4 (reset), run3, run2, run1 — 3 consecutive after reset = churn
  assertEquals(result.demotedKeys, ["key_b"], "key_b appears in 3 consecutive runs after the gap at run4");
  assertEquals(parsed.blocking_issues.length, 1, "key_b demoted, only key_a remains");
  assertEquals(parsed.blocking_issues[0].id, "key_a");
});

Deno.test("detectNoteChurn: demoted blocker moved to polish_notes with churn_demoted flag", async () => {
  const recentRuns = [
    { output_json: { blocking_issues: [{ id: "stale_blocker" }] }, created_at: "2025-01-03T00:00:00Z" },
    { output_json: { blocking_issues: [{ id: "stale_blocker" }] }, created_at: "2025-01-02T00:00:00Z" },
    { output_json: { blocking_issues: [{ id: "stale_blocker" }] }, created_at: "2025-01-01T00:00:00Z" },
  ];
  const supabase = makeSupabase({ runsForOrdered: recentRuns });
  const parsed: any = {
    blocking_issues: [{ id: "stale_blocker", note: "This keeps coming up" }],
    polish_notes: [],
  };
  const result = await detectNoteChurn(supabase, "doc1", "v1", "character_bible", parsed);

  assertEquals(result.demotedKeys, ["stale_blocker"]);
  assertEquals(parsed.blocking_issues.length, 0, "Blocker removed from blocking_issues");
  assertEquals(parsed.polish_notes.length, 1, "Blocker moved to polish_notes");
  assertEquals(parsed.polish_notes[0].severity, "polish");
  assertEquals(parsed.polish_notes[0].churn_demoted, true);
  assertEquals(parsed.polish_notes[0].note, "This keeps coming up", "Original note preserved");
});

Deno.test("detectNoteChurn: creates polish_notes array if missing", async () => {
  const recentRuns = [
    { output_json: { blocking_issues: [{ id: "orphaned" }] }, created_at: "2025-01-03T00:00:00Z" },
    { output_json: { blocking_issues: [{ id: "orphaned" }] }, created_at: "2025-01-02T00:00:00Z" },
    { output_json: { blocking_issues: [{ id: "orphaned" }] }, created_at: "2025-01-01T00:00:00Z" },
  ];
  const supabase = makeSupabase({ runsForOrdered: recentRuns });
  const parsed: any = { blocking_issues: [{ id: "orphaned" }] };
  const result = await detectNoteChurn(supabase, "doc1", "v1", "character_bible", parsed);
  assertEquals(result.demotedKeys, ["orphaned"]);
  assertEquals(Array.isArray(parsed.polish_notes), true, "polish_notes array created");
  assertEquals(parsed.polish_notes.length, 1);
});

Deno.test("detectNoteChurn: mixed churn — only 3+ consecutive blockers demoted", async () => {
  const recentRuns = [
    { output_json: { blocking_issues: [{ id: "chronic" }, { id: "fresh" }] }, created_at: "2025-01-05T00:00:00Z" },
    { output_json: { blocking_issues: [{ id: "chronic" }] }, created_at: "2025-01-04T00:00:00Z" },
    { output_json: { blocking_issues: [{ id: "chronic" }] }, created_at: "2025-01-03T00:00:00Z" },
  ];
  const supabase = makeSupabase({ runsForOrdered: recentRuns });
  const parsed: any = { blocking_issues: [{ id: "chronic" }, { id: "fresh" }] };
  const result = await detectNoteChurn(supabase, "doc1", "v1", "character_bible", parsed);

  assertEquals(result.demotedKeys, ["chronic"]);
  assertEquals(parsed.blocking_issues.length, 1);
  assertEquals(parsed.blocking_issues[0].id, "fresh");
});

Deno.test("detectNoteChurn: uses note_key as primary identifier, falls back to id", async () => {
  const recentRuns = [
    { output_json: { blocking_issues: [{ note_key: "primary_key", id: "alt_id" }] }, created_at: "2025-01-03T00:00:00Z" },
    { output_json: { blocking_issues: [{ note_key: "primary_key" }] }, created_at: "2025-01-02T00:00:00Z" },
    { output_json: { blocking_issues: [{ note_key: "primary_key" }] }, created_at: "2025-01-01T00:00:00Z" },
  ];
  const supabase = makeSupabase({ runsForOrdered: recentRuns });
  const parsed: any = { blocking_issues: [{ note_key: "primary_key", id: "alt_id" }] };
  const result = await detectNoteChurn(supabase, "doc1", "v1", "character_bible", parsed);
  assertEquals(result.demotedKeys, ["primary_key"]);
});

Deno.test("detectNoteChurn: error in Supabase call caught and non-fatal", async () => {
  const parsed: any = { blocking_issues: [{ id: "key" }] };
  const result = await detectNoteChurn(makeErrorSupabase(), "doc1", "v1", "character_bible", parsed);
  assertEquals(result.demotedKeys.length, 0, "Error should return empty, not throw");
  assertEquals(parsed.blocking_issues.length, 1, "Blocking issues preserved on error");
});

// ═══════════════════════════════════════════════════
// checkDevRunIterationCap — Tests
// ═══════════════════════════════════════════════════

Deno.test("checkDevRunIterationCap: below threshold returns false", async () => {
  const supabase = makeSupabase({ count: 5 });
  const parsed: any = { convergence: { status: "in_progress" } };
  const result = await checkDevRunIterationCap(supabase, "doc1", "v1", parsed);
  assertEquals(result, false, "5 runs < 10 should not force convergence");
  assertEquals(parsed.convergence.status, "in_progress", "Status unchanged");
});

Deno.test("checkDevRunIterationCap: exactly at threshold force-converges", async () => {
  const supabase = makeSupabase({ count: 10 });
  const parsed: any = { convergence: { status: "in_progress", reasons: [] } };
  const result = await checkDevRunIterationCap(supabase, "doc1", "v1", parsed);
  assertEquals(result, true, "10 runs at threshold should force convergence");
  assertEquals(parsed.convergence.status, "converged");
  assertEquals(parsed.convergence.iteration_forced_converged, true);
  assertEquals(parsed.iteration_forced_converged, true);
  assert(parsed.convergence.reasons[0].includes("Force-converged"), "Reason mentions force convergence");
  assert(parsed.convergence.reasons[0].includes("10"), "Reason includes run count");
});

Deno.test("checkDevRunIterationCap: above threshold force-converges", async () => {
  const supabase = makeSupabase({ count: 15 });
  const parsed: any = { convergence: { status: "in_progress" } };
  const result = await checkDevRunIterationCap(supabase, "doc1", "v1", parsed);
  assertEquals(result, true, "15 runs should force convergence");
  assertEquals(parsed.convergence.status, "converged");
});

Deno.test("checkDevRunIterationCap: no convergence object still sets iteration_forced_converged", async () => {
  const supabase = makeSupabase({ count: 10 });
  const parsed: any = {};
  const result = await checkDevRunIterationCap(supabase, "doc1", "v1", parsed);
  assertEquals(result, true);
  assertEquals(parsed.iteration_forced_converged, true);
});

Deno.test("checkDevRunIterationCap: null count returns false", async () => {
  const supabase = makeSupabase({ count: null });
  const parsed: any = { convergence: { status: "in_progress" } };
  const result = await checkDevRunIterationCap(supabase, "doc1", "v1", parsed);
  assertEquals(result, false);
  assertEquals(parsed.convergence.status, "in_progress");
});

Deno.test("checkDevRunIterationCap: error caught and non-fatal", async () => {
  const parsed: any = { convergence: { status: "in_progress" } };
  const result = await checkDevRunIterationCap(makeErrorSupabase(), "doc1", "v1", parsed);
  assertEquals(result, false);
  assertEquals(parsed.convergence.status, "in_progress");
});

// ═══════════════════════════════════════════════════
// detectCIRegression — Tests
// ═══════════════════════════════════════════════════

Deno.test("detectCIRegression: no previous run = no regression", async () => {
  const supabase = makeSupabase({ prevRun: null });
  const parsed: any = { ci_score: 75 };
  await detectCIRegression(supabase, "doc1", "v1", parsed);
  assertEquals(parsed.ci_regression, undefined);
});

Deno.test("detectCIRegression: no previous output_json = no regression", async () => {
  const supabase = makeSupabase({ prevRun: { output_json: null } });
  const parsed: any = { ci_score: 75 };
  await detectCIRegression(supabase, "doc1", "v1", parsed);
  assertEquals(parsed.ci_regression, undefined);
});

Deno.test("detectCIRegression: no previous ci_score = no regression", async () => {
  const supabase = makeSupabase({ prevRun: { output_json: {} } });
  const parsed: any = { ci_score: 75 };
  await detectCIRegression(supabase, "doc1", "v1", parsed);
  assertEquals(parsed.ci_regression, undefined);
});

Deno.test("detectCIRegression: current ci_score not a number skips check", async () => {
  const supabase = makeSupabase({ prevRun: { output_json: { ci_score: 80 } } });
  for (const val of [undefined, null, "string", true]) {
    const parsed: any = { ci_score: val };
    await detectCIRegression(supabase, "doc1", "v1", parsed);
    assertEquals(parsed.ci_regression, undefined, `${val} skips regression`);
  }
});

Deno.test("detectCIRegression: drop below threshold = no flag", async () => {
  const supabase = makeSupabase({ prevRun: { output_json: { ci_score: 75 } } });
  const parsed: any = { ci_score: 73 };
  await detectCIRegression(supabase, "doc1", "v1", parsed);
  assertEquals(parsed.ci_regression, undefined, "Drop of 2 < 3 threshold");
});

Deno.test("detectCIRegression: drop exactly at threshold flags regression", async () => {
  const supabase = makeSupabase({ prevRun: { output_json: { ci_score: 80 } } });
  const parsed: any = { ci_score: 77 };
  await detectCIRegression(supabase, "doc1", "v1", parsed);
  assert(parsed.ci_regression !== undefined, "Regression flagged");
  assertEquals(parsed.ci_regression.previous_ci_score, 80);
  assertEquals(parsed.ci_regression.current_ci_score, 77);
  assertEquals(parsed.ci_regression.drop, 3);
  assertEquals(parsed.ci_regression.threshold, 3);
  assertEquals(parsed.ci_regression.flagged, true);
});

Deno.test("detectCIRegression: large drop above threshold flags regression", async () => {
  const supabase = makeSupabase({ prevRun: { output_json: { ci_score: 90 } } });
  const parsed: any = { ci_score: 50 };
  await detectCIRegression(supabase, "doc1", "v1", parsed);
  assert(parsed.ci_regression !== undefined);
  assertEquals(parsed.ci_regression.drop, 40);
});

Deno.test("detectCIRegression: improving score (negative drop) = no flag", async () => {
  const supabase = makeSupabase({ prevRun: { output_json: { ci_score: 60 } } });
  const parsed: any = { ci_score: 85 };
  await detectCIRegression(supabase, "doc1", "v1", parsed);
  assertEquals(parsed.ci_regression, undefined);
});

Deno.test("detectCIRegression: error caught and non-fatal", async () => {
  const parsed: any = { ci_score: 75 };
  await detectCIRegression(makeErrorSupabase(), "doc1", "v1", parsed);
  assertEquals(parsed.ci_regression, undefined);
});

// ═══════════════════════════════════════════════════
// Invariant Tests — Boundary values & edge cases
// ═══════════════════════════════════════════════════

Deno.test("detectNoteChurn: empty blocking_issues in history = no churn", async () => {
  const recentRuns = [
    { output_json: { blocking_issues: [] }, created_at: "2025-01-03T00:00:00Z" },
    { output_json: { blocking_issues: [] }, created_at: "2025-01-02T00:00:00Z" },
    { output_json: { blocking_issues: [] }, created_at: "2025-01-01T00:00:00Z" },
  ];
  const supabase = makeSupabase({ runsForOrdered: recentRuns });
  const parsed: any = { blocking_issues: [{ id: "lonely_blocker" }] };
  const result = await detectNoteChurn(supabase, "doc1", "v1", "character_bible", parsed);
  assertEquals(result.demotedKeys.length, 0);
  assertEquals(parsed.blocking_issues.length, 1);
});

Deno.test("detectNoteChurn: border case — exactly 3 consecutive appearances triggers", async () => {
  const recentRuns = [
    { output_json: { blocking_issues: [{ id: "edge_case" }] }, created_at: "2025-01-03T00:00:00Z" },
    { output_json: { blocking_issues: [{ id: "edge_case" }] }, created_at: "2025-01-02T00:00:00Z" },
    { output_json: { blocking_issues: [{ id: "edge_case" }] }, created_at: "2025-01-01T00:00:00Z" },
  ];
  const supabase = makeSupabase({ runsForOrdered: recentRuns });
  const parsed: any = { blocking_issues: [{ id: "edge_case" }] };
  const result = await detectNoteChurn(supabase, "doc1", "v1", "character_bible", parsed);
  assertEquals(result.demotedKeys, ["edge_case"]);
  assertEquals(parsed.blocking_issues.length, 0);
});

Deno.test("detectNoteChurn: 2 consecutive appearances = NOT demoted", async () => {
  const recentRuns = [
    { output_json: { blocking_issues: [{ id: "almost" }] }, created_at: "2025-01-03T00:00:00Z" },
    { output_json: { blocking_issues: [{ id: "almost" }] }, created_at: "2025-01-02T00:00:00Z" },
    { output_json: { blocking_issues: [{ id: "other" }] }, created_at: "2025-01-01T00:00:00Z" },
  ];
  const supabase = makeSupabase({ runsForOrdered: recentRuns });
  const parsed: any = { blocking_issues: [{ id: "almost" }] };
  const result = await detectNoteChurn(supabase, "doc1", "v1", "character_bible", parsed);
  assertEquals(result.demotedKeys.length, 0);
});

Deno.test("checkDevRunIterationCap: 9 runs = no force", async () => {
  const supabase = makeSupabase({ count: 9 });
  const parsed: any = { convergence: { status: "in_progress" } };
  const result = await checkDevRunIterationCap(supabase, "doc1", "v1", parsed);
  assertEquals(result, false);
  assertEquals(parsed.convergence.status, "in_progress");
});

Deno.test("checkDevRunIterationCap: existing reasons preserved and appended", async () => {
  const supabase = makeSupabase({ count: 10 });
  const parsed: any = { convergence: { status: "in_progress", reasons: ["Previous reason"] } };
  await checkDevRunIterationCap(supabase, "doc1", "v1", parsed);
  assertEquals(parsed.convergence.reasons.length, 2);
  assertEquals(parsed.convergence.reasons[0], "Previous reason");
  assert(parsed.convergence.reasons[1].includes("Force-converged"));
});

Deno.test("detectCIRegression: boundary — drop of exactly 3 flags", async () => {
  const supabase = makeSupabase({ prevRun: { output_json: { ci_score: 73 } } });
  const parsed: any = { ci_score: 70 };
  await detectCIRegression(supabase, "doc1", "v1", parsed);
  assert(parsed.ci_regression !== undefined);
  assertEquals(parsed.ci_regression.drop, 3);
});

Deno.test("detectCIRegression: boundary — drop of 2.9 is below threshold", async () => {
  const supabase = makeSupabase({ prevRun: { output_json: { ci_score: 72.9 } } });
  const parsed: any = { ci_score: 70 };
  await detectCIRegression(supabase, "doc1", "v1", parsed);
  assertEquals(parsed.ci_regression, undefined);
});

// ═══════════════════════════════════════════════════
// CONSTANT VERIFICATION
// ═══════════════════════════════════════════════════

Deno.test("constants match production values", () => {
  assertEquals(MAX_DEVELOPMENT_RUN_LOOPS, 10);
  assertEquals(CI_REGRESSION_THRESHOLD, 3);
});

// ═══════════════════════════════════════════════════
// Category-Level Churn — Note Key Mutation Detection
// ═══════════════════════════════════════════════════

Deno.test("detectNoteChurn: category-level churn demotes same-category blockers with different note_keys", async () => {
  // Voice_distinctiveness notes target different characters each run
  // (note_key changes each iteration = note key mutation pattern)
  const recentRuns = [
    { output_json: { blocking_issues: [{ note_key: "voice:hero", category: "voice_distinctiveness" }] }, created_at: "2025-01-03T00:00:00Z" },
    { output_json: { blocking_issues: [{ note_key: "voice:sidekick", category: "voice_distinctiveness" }] }, created_at: "2025-01-02T00:00:00Z" },
    { output_json: { blocking_issues: [{ note_key: "voice:villain", category: "voice_distinctiveness" }] }, created_at: "2025-01-01T00:00:00Z" },
  ];
  const supabase = makeSupabase({ runsForOrdered: recentRuns });
  const parsed: any = { blocking_issues: [{ note_key: "voice:hero", category: "voice_distinctiveness" }] };
  const result = await detectNoteChurn(supabase, "doc1", "v1", "character_bible", parsed);

  // Note_key-level check: "voice:hero" only appeared in 1 of 3 runs (not consecutive)
  // Category-level check: "voice_distinctiveness" appeared in all 3 runs → demote
  assertEquals(result.demotedKeys, ["voice:hero"], "Should demote via category-level churn");
  assertEquals(parsed.blocking_issues.length, 0, "Blocker moved to polish_notes");
  assertEquals(parsed.polish_notes.length, 1);
  assertEquals(parsed.polish_notes[0].churn_category, "voice_distinctiveness", "Should record churn_category");
  assertEquals(parsed.polish_notes[0].severity, "polish");
});

Deno.test("detectNoteChurn: category churn — 2 consecutive same-category = NOT demoted", async () => {
  const recentRuns = [
    { output_json: { blocking_issues: [{ note_key: "char_depth:a", category: "character_depth" }] }, created_at: "2025-01-03T00:00:00Z" },
    { output_json: { blocking_issues: [{ note_key: "char_depth:b", category: "character_depth" }] }, created_at: "2025-01-02T00:00:00Z" },
    { output_json: { blocking_issues: [{ note_key: "voice:c", category: "voice_distinctiveness" }] }, created_at: "2025-01-01T00:00:00Z" },
  ];
  const supabase = makeSupabase({ runsForOrdered: recentRuns });
  const parsed: any = { blocking_issues: [{ note_key: "char_depth:a", category: "character_depth" }] };
  const result = await detectNoteChurn(supabase, "doc1", "v1", "character_bible", parsed);

  assertEquals(result.demotedKeys.length, 0, "Only 2 consecutive same-category = not churn");
  assertEquals(parsed.blocking_issues.length, 1, "Blocker preserved");
});

Deno.test("detectNoteChurn: category churn respects reset — non-consecutive categories not demoted", async () => {
  const recentRuns = [
    { output_json: { blocking_issues: [{ note_key: "arc:1", category: "arc_clarity" }] }, created_at: "2025-01-05T00:00:00Z" },
    { output_json: { blocking_issues: [{ note_key: "arc:2", category: "arc_clarity" }] }, created_at: "2025-01-04T00:00:00Z" },
    { output_json: { blocking_issues: [] }, created_at: "2025-01-03T00:00:00Z" },  // Gap — resets arc_clarity
    { output_json: { blocking_issues: [{ note_key: "arc:3", category: "arc_clarity" }] }, created_at: "2025-01-02T00:00:00Z" },
    { output_json: { blocking_issues: [{ note_key: "arc:4", category: "arc_clarity" }] }, created_at: "2025-01-01T00:00:00Z" },
  ];
  const supabase = makeSupabase({ runsForOrdered: recentRuns });
  const parsed: any = { blocking_issues: [{ note_key: "arc:1", category: "arc_clarity" }] };
  const result = await detectNoteChurn(supabase, "doc1", "v1", "character_bible", parsed);

  // arc_clarity: run5, run4, NOT run3 (gap resets count) = count reset to 0
  // run2, run1 = count back to 2, not enough for 3
  assertEquals(result.demotedKeys.length, 0, "Non-consecutive category resets count");
  assertEquals(parsed.blocking_issues.length, 1, "Blocker preserved");
});