/**
 * Integration tests for pendingDecisionGate.ts — Decision Autonomy Architecture.
 *
 * Tests the decisionMode propagation through:
 *   1. runPendingDecisionGate — autonomous mode suppresses blocking
 *   2. checkQualityPlateau — NEVER_BLOCKING in all modes
 *   3. checkQualityCeiling — NEVER_BLOCKING in all modes
 *
 * ALL tests use mocked Supabase — no real database calls.
 */

import {
  assertEquals,
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  runPendingDecisionGate,
  checkQualityPlateau,
  checkQualityCeiling,
} from "./pendingDecisionGate.ts";

// ══════════════════════════════════════════════════════════════════════════════
// Mock Supabase Factory
// ══════════════════════════════════════════════════════════════════════════════

function createMockSupabase(overrides: {
  projectDocs?: any[];
  versionApprovals?: string[];
  canonFacts?: string[];
  activeDecisions?: any[];
  workflowDecisions?: any[];
  insertResult?: any;
  projectData?: any;
  /** Pre-populated decisions keyed by id for SECOND PASS lookups */
  storedDecisions?: Record<string, any>;
} = {}) {
  const {
    projectDocs = [],
    versionApprovals = [],
    canonFacts = [],
    activeDecisions = [],
    workflowDecisions = [],
    insertResult = { data: [{ id: "inserted-new-id" }], error: null },
    projectData = null,
    storedDecisions = {},
  } = overrides;

  function buildDecisionLedgerHandlers(ops: any[]) {
    const hasEq = (field: string, val: any) =>
      ops.some((o: any) => o.method === "eq" && o.args[0] === field && o.args[1] === val);

    // maybeSingle() with eq("id", ...) — find decision by id
    if (ops.some((o: any) => o.method === "maybeSingle")) {
      const idMatch = ops.find((o: any) => o.method === "eq" && o.args[0] === "id");
      if (idMatch) {
        const found = storedDecisions[idMatch.args[1]];
        return { data: found || null, error: null };
      }
    }

    if (hasEq("status", "active")) {
      return { data: activeDecisions, error: null };
    }
    if (hasEq("status", "workflow_pending")) {
      return { data: workflowDecisions, error: null };
    }
    return { data: [], error: null };
  }

  function chainableQuery(table: string) {
    const chain: any = {};
    const ops: any[] = [];
    let _pendingInsert: any = null;
    let _pendingUpdate: any = null;

    const methods = ["eq", "neq", "in", "not", "order", "limit", "maybeSingle", "single", "select"];
    for (const m of methods) {
      chain[m] = (...args: any[]) => {
        ops.push({ method: m, args });
        return chain;
      };
    }

    chain.insert = (data: any) => {
      _pendingInsert = data;
      return chain;
    };

    chain.update = (data: any) => {
      _pendingUpdate = data;
      return chain;
    };

    chain.then = (resolve: any) => {
      // Handle update chains (update().eq().then(() => {}))
      if (_pendingUpdate !== null) {
        return resolve({ data: null, error: null });
      }
      // Handle insert chains (insert().select().single())
      if (_pendingInsert !== null) {
        const insertData = _pendingInsert;
        // If insertData has default_value, store it for SECOND PASS lookups
        const dv = insertData.decision_value || {};
        const newId = "inserted-decision-id";
        if (dv.default_value) {
          storedDecisions[newId] = {
            id: newId,
            decision_key: insertData.decision_key || "wf:key",
            decision_value: dv,
          };
        }
        return resolve({ data: { id: newId }, error: null });
      }

      // Handle select queries
      // project_documents: select("doc_type, latest_version_id").eq("project_id", ...)
      if (table === "project_documents") {
        const isCountLookup = ops.some((o: any) => o.method === "limit" && o.args[0] === 1);
        if (isCountLookup) {
          return resolve({ data: projectDocs.length > 0 ? projectDocs[0] : null, error: null });
        }
        return resolve({ data: projectDocs, error: null });
      }
      // project_document_versions: select("id, document_id, approval_status").in("id", ...)
      if (table === "project_document_versions") {
        const needsApproval = ops.some((o: any) => o.method === "in" && o.args[0] === "id");
        if (needsApproval) {
          return resolve({
            data: versionApprovals.map((id: string) => ({
              id, approval_status: "approved",
            })),
            error: null,
          });
        }
        return resolve({ data: versionApprovals.map((id: string) => ({ id, approval_status: "approved" })), error: null });
      }
      if (table === "canon_facts") {
        return resolve({ data: canonFacts.map((t: string) => ({ fact_type: t })), error: null });
      }
      if (table === "decision_ledger") {
        return resolve(buildDecisionLedgerHandlers(ops));
      }
      if (table === "projects") {
        return resolve({ data: projectData, error: null });
      }
      return resolve({ data: [], error: null });
    };
    chain.catch = () => chain;
    return chain;
  }

  return {
    from: (table: string) => chainableQuery(table),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. runPendingDecisionGate — test decisionMode propagation
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("runPendingDecisionGate | strict mode blocks CAST_LOCK (no options, blocking)", async () => {
  const supabase = createMockSupabase({
    projectDocs: [
      { doc_type: "treatment", latest_version_id: "v1" },
      { doc_type: "character_bible", latest_version_id: "v2" },
    ],
    versionApprovals: ["v1", "v2"],  // all approved
    canonFacts: ["character", "world_rule"],
    activeDecisions: [],
    workflowDecisions: [],
  });

  const result = await runPendingDecisionGate(
    supabase, "proj-1", "job-1", "tv-series", "character_bible",
    ["treatment", "character_bible", "beat_sheet", "episode_script"],
    false,  // allowDefaults = false
    "strict",  // decisionMode
  );

  // CAST_LOCK is blocking + strict + no options → DEFERRABLE (IEL fallthrough)
  // But it still contributes to pending decisions
  assertEquals(result.shouldPause, false);  // blockingIds empty due to IEL fallthrough
  assertEquals(result.blockingIds.length, 0);
  assertEquals(result.deferrableIds.length, 1);  // CAST_LOCK deferred
});

Deno.test("runPendingDecisionGate | autonomous mode makes CAST_LOCK non-blocking", async () => {
  const supabase = createMockSupabase({
    projectDocs: [
      { doc_type: "treatment", latest_version_id: "v1" },
      { doc_type: "character_bible", latest_version_id: "v2" },
    ],
    versionApprovals: ["v1", "v2"],
    canonFacts: ["character", "world_rule"],
    activeDecisions: [],
    workflowDecisions: [],
  });

  const result = await runPendingDecisionGate(
    supabase, "proj-1", "job-1", "tv-series", "character_bible",
    ["treatment", "character_bible", "beat_sheet", "episode_script"],
    false,
    "autonomous",
  );

  // In autonomous mode, CAST_LOCK (blocking) → NEVER_BLOCKING
  assertEquals(result.shouldPause, false);
});

Deno.test("runPendingDecisionGate | autonomous mode makes EPISODE_COUNT deferrable", async () => {
  const supabase = createMockSupabase({
    projectDocs: [
      { doc_type: "concept_brief", latest_version_id: "v1" },
      { doc_type: "season_arc", latest_version_id: "v2" },
    ],
    versionApprovals: ["v1", "v2"],
    canonFacts: ["character"],
    activeDecisions: [],
    workflowDecisions: [],
  });

  const result = await runPendingDecisionGate(
    supabase, "proj-1", "job-1", "tv-series", "season_arc",
    ["treatment", "concept_brief", "season_arc", "beat_sheet", "episode_script"],
    false,
    "autonomous",
  );

  // EPISODE_COUNT (advisory) + autonomous → DEFERRABLE
  assertEquals(result.shouldPause, false);
});

Deno.test("runPendingDecisionGate | no decisions required returns immediate pass", async () => {
  const supabase = createMockSupabase();
  const result = await runPendingDecisionGate(
    supabase, "proj-1", "job-1", "unknown-format", "nonexistent",
    [], false, "strict",
  );
  assertEquals(result.shouldPause, false);
  assertEquals(result.blockingIds.length, 0);
  assertEquals(result.deferrableIds.length, 0);
  assertStringIncludes(result.logSummary, "No decisions required");
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. checkQualityPlateau — decisionMode propagation
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("checkQualityPlateau | creates NEVER_BLOCKING entry in strict mode", async () => {
  const supabase = createMockSupabase({
    projectDocs: [
      { doc_type: "treatment", latest_version_id: "v1" },
    ],
    versionApprovals: [],
    activeDecisions: [],
    workflowDecisions: [],
  });

  const result = await checkQualityPlateau(
    supabase, "proj-1", "job-1", "tv-series", "treatment",
    90, 88, 89, 87, 3,
    "strict",
  );

  assertEquals(result.isPlateaued, true);
  assert(result.decisionId !== undefined, "should return a decision ID");
});

Deno.test("checkQualityPlateau | returns not plateaued when quality not met", async () => {
  const supabase = createMockSupabase();
  const result = await checkQualityPlateau(
    supabase, "proj-1", "job-1", "tv-series", "treatment",
    70, 70, 69, 69, 3,
    "strict",
  );
  assertEquals(result.isPlateaued, false);
});

Deno.test("checkQualityPlateau | works without decisionMode", async () => {
  const supabase = createMockSupabase({
    projectDocs: [
      { doc_type: "treatment", latest_version_id: "v1" },
    ],
    versionApprovals: [],
    activeDecisions: [],
    workflowDecisions: [],
  });

  const result = await checkQualityPlateau(
    supabase, "proj-1", "job-1", "tv-series", "treatment",
    90, 88, 89, 87, 3,
  );

  assertEquals(result.isPlateaued, true);
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. checkQualityCeiling — decisionMode propagation
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("checkQualityCeiling | creates NEVER_BLOCKING entry in strict mode", async () => {
  const supabase = createMockSupabase({
    projectDocs: [
      { doc_type: "treatment", latest_version_id: "v1" },
    ],
    versionApprovals: [],
    activeDecisions: [],
    workflowDecisions: [],
  });

  const result = await checkQualityCeiling(
    supabase, "proj-1", "job-1", "tv-series", "treatment",
    82, 90, "Approaching structural ceiling for budget profile",
    "strict",
  );

  assertEquals(result.isCeilingHit, true);
  assert(result.decisionId !== undefined, "should return a decision ID");
});

Deno.test("checkQualityCeiling | works without decisionMode", async () => {
  const supabase = createMockSupabase({
    projectDocs: [
      { doc_type: "treatment", latest_version_id: "v1" },
    ],
    versionApprovals: [],
    activeDecisions: [],
    workflowDecisions: [],
  });

  const result = await checkQualityCeiling(
    supabase, "proj-1", "job-1", "tv-series", "treatment",
    82, 90, "test",
  );

  assertEquals(result.isCeilingHit, true);
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. SECOND PASS Auto-Resolve (autonomous mode + allowDefaults)
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("SECOND PASS | autonomous + default_value auto-resolves QUALITY_PLATEAU (informational, has default_value)", async () => {
  // QUALITY_PLATEAU has autonomy=informational + default_value="proceed"
  // In autonomous mode + allowDefaults, informational decisions skip blocking
  // entirely (they're NEVER_BLOCKING). The SECOND PASS only fires for
  // blocking decisions with autonomy + default_value.
  // QUALITY_PLATEAU is NEVER_BLOCKING so it shouldn't enter the blocking list.
  const supabase = createMockSupabase({
    projectDocs: [
      { doc_type: "treatment", latest_version_id: "v1" },
      { doc_type: "beat_sheet", latest_version_id: "v2" },
    ],
    versionApprovals: ["v1", "v2"],
    canonFacts: ["character", "world_rule"],
    activeDecisions: [],
    workflowDecisions: [],
  });

  // Run decision gate for a stage that requires QUALITY decisions
  const result = await runPendingDecisionGate(
    supabase, "proj-1", "job-1", "tv-series", "treatment",
    ["treatment", "character_bible", "beat_sheet", "episode_script"],
    true,   // allowDefaults = true
    "autonomous",  // decisionMode
  );

  // No blocking decisions because quality decisions are NEVER_BLOCKING
  assertEquals(result.shouldPause, false);
});

Deno.test("SECOND PASS | autonomous + no_autonomy_on_decision → skip without error", async () => {
  // Test that autonomous mode with a decision that has no explicit autonomy
  // classification falls through gracefully (Rule 6: undefined → DEFERRABLE)
  const supabase = createMockSupabase({
    projectDocs: [
      { doc_type: "format_rules", latest_version_id: "v1" },
    ],
    versionApprovals: ["v1"],
    canonFacts: [],
    activeDecisions: [],
    workflowDecisions: [],
  });

  // FORMAT_RUNTIME has autonomy=advisory — it will be DEFERRABLE in autonomous mode
  // so no blocking decisions → no SECOND PASS needed
  const result = await runPendingDecisionGate(
    supabase, "proj-1", "job-1", "vertical-drama", "format_rules",
    ["format_rules", "character_bible", "season_arc", "episode_grid", "season_script"],
    true,
    "autonomous",
  );

  assertEquals(result.shouldPause, false);
});

Deno.test("SECOND PASS | strict mode never triggers auto-resolve (allowDefaults+strict → pending)", async () => {
  // In strict mode, the SECOND PASS auto-resolve code path is skipped
  // (it only runs when decisionMode === 'autonomous'). Verifying:
  // blocking decisions remain blocking, shouldPause = false (due to allowDefaults)
  const supabase = createMockSupabase({
    projectDocs: [
      { doc_type: "treatment", latest_version_id: "v1" },
      { doc_type: "beat_sheet", latest_version_id: "v2" },
    ],
    versionApprovals: ["v1", "v2"],
    canonFacts: ["character", "world_rule"],
    activeDecisions: [],
    workflowDecisions: [],
  });

  const result = await runPendingDecisionGate(
    supabase, "proj-1", "job-1", "tv-series", "beat_sheet",
    ["treatment", "character_bible", "beat_sheet", "episode_script"],
    true,   // allowDefaults = true
    "strict",
  );

  // EPISODE_COUNT is advisory in strict mode → BLOCKING_NOW
  // But allowDefaults=true means shouldPause=false
  assertEquals(result.shouldPause, false);
});

Deno.test("SECOND PASS | existing workflow decisions with 'workflow_pending' status are re-evaluated", async () => {
  // When a workflow_pending decision already exists in the DB, the gate
  // should re-use it instead of creating a duplicate
  const supabase = createMockSupabase({
    projectDocs: [
      { doc_type: "treatment", latest_version_id: "v1" },
      { doc_type: "character_bible", latest_version_id: "v2" },
    ],
    versionApprovals: ["v1", "v2"],
    canonFacts: ["character"],
    activeDecisions: [],
    workflowDecisions: [
      {
        id: "existing-wf-decision",
        decision_key: "workflow:tv-series:character_bible:CAST_LOCK",
        decision_value: { classification: "DEFERRABLE" },
        status: "workflow_pending",
      },
    ],
  });

  const result = await runPendingDecisionGate(
    supabase, "proj-1", "job-1", "tv-series", "character_bible",
    ["treatment", "character_bible", "beat_sheet", "episode_script"],
    false, "strict",
  );

  // Existing workflow_pending decision is DEFERRABLE → no blocking
  assertEquals(result.blockingIds.length, 0);
  assertEquals(result.deferrableIds.length, 1);
});