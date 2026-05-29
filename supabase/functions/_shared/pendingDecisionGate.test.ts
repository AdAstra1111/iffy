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
} = {}) {
  const {
    projectDocs = [],
    versionApprovals = [],
    canonFacts = [],
    activeDecisions = [],
    workflowDecisions = [],
    insertResult = { data: [{ id: "inserted-new-id" }], error: null },
    projectData = null,
  } = overrides;

  function buildDecisionLedgerHandlers(ops: any[]) {
    const hasEq = (field: string, val: any) =>
      ops.some((o: any) => o.method === "eq" && o.args[0] === field && o.args[1] === val);
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

    chain.then = (resolve: any) => {
      // Handle insert chains (insert().select().single())
      if (_pendingInsert !== null) {
        return resolve({ data: { id: "inserted-decision-id" }, error: null });
      }

      // Handle select queries
      // project_documents: select("doc_type, latest_version_id").eq("project_id", ...)
      if (table === "project_documents") {
        const isCountLookup = ops.some((o: any) => o.method === "limit" && o.args[0] === 1);
        if (isCountLookup) {
          // Used for .limit(1).maybeSingle() — return first doc
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
        // Generic query
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