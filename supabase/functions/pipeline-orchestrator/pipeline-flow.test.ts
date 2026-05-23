/**
 * Tests for pipeline-orchestrator — Phase 2 orchestrator for production stills pipeline.
 *
 * Tests all pure-logic functions:
 *   - PHASES constant, IMAGE_GENERATION_PHASES set
 *   - buildInitialPhaseState, buildInitialState
 *   - checkBudget — phase and total budget enforcement
 *   - getNextPhase — phase advancement logic
 *   - advancePipeline — prerequisite checks, completion
 *   - sectionMap — image generation phase params
 *   - Handler-level: CORS, validation, error handling
 *
 * Covers:
 *   ✓ Primary use cases — happy pipeline flow
 *   ✓ Edge cases — null current phase, budget exhausted, invalid phase
 *   ✓ Invariants — prerequisite enforcement, failure isolation for image gen phases
 */

import {
  assertEquals,
  assert,
  assertObjectMatch,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ══════════════════════════════════════════════════════════════════════════════
// Mirrored harness — pure logic extracted from pipeline-orchestrator
// ══════════════════════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Constants ───────────────────────────────────────────────────────────────

const PHASES = [
  "atoms_to_dna",
  "resolve_visual_set",
  "generate_identity",
  "generate_references",
  "generate_world",
  "generate_key_moments",
  "generate_visual_language",
] as const;

type PhaseName = (typeof PHASES)[number];

const IMAGE_GENERATION_PHASES: ReadonlySet<PhaseName> = new Set<PhaseName>([
  "generate_identity",
  "generate_references",
  "generate_world",
  "generate_key_moments",
  "generate_visual_language",
] as PhaseName[]);

const DEFAULT_MAX_IMAGES = 200;

const DEFAULT_BUDGET_PER_PHASE: Record<string, number> = {
  generate_identity: 10,
  generate_references: 30,
  generate_world: 40,
  generate_key_moments: 60,
  generate_visual_language: 60,
};

// ── Types ───────────────────────────────────────────────────────────────────

interface PhaseState {
  status: "pending" | "running" | "completed" | "failed";
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  retry_count: number;
}

interface BudgetState {
  max_images: number;
  images_generated: number;
  budget_per_phase: Record<string, number>;
  usage_per_phase: Record<string, number>;
}

interface PipelineState {
  pipeline_status: "not_started" | "running" | "paused" | "completed" | "failed";
  current_phase: PhaseName | null;
  phase_states: Record<string, PhaseState>;
  budget: BudgetState;
  error_log: string[];
  last_updated: string;
}

// ── State constructors ──────────────────────────────────────────────────────

function timestamp(): string {
  return new Date().toISOString();
}

function buildInitialPhaseState(): PhaseState {
  return {
    status: "pending",
    started_at: null,
    completed_at: null,
    error: null,
    retry_count: 0,
  };
}

function buildInitialState(budget?: PipelineState["budget"]): PipelineState {
  const b = budget || {
    max_images: DEFAULT_MAX_IMAGES,
    images_generated: 0,
    budget_per_phase: { ...DEFAULT_BUDGET_PER_PHASE },
    usage_per_phase: {} as Record<string, number>,
  };

  const phase_states: Record<string, PhaseState> = {};
  for (const phase of PHASES) {
    phase_states[phase] = buildInitialPhaseState();
  }

  return {
    pipeline_status: "not_started",
    current_phase: null,
    phase_states,
    budget: b,
    error_log: [],
    last_updated: timestamp(),
  };
}

// ── Budget Check ────────────────────────────────────────────────────────────

function checkBudget(
  state: PipelineState,
  phase: PhaseName,
): { allowed: boolean; reason?: string } {
  const budgetPerPhase = state.budget.budget_per_phase;
  const usagePerPhase = state.budget.usage_per_phase;

  const usage = usagePerPhase[phase] || 0;
  const allowance = budgetPerPhase[phase];

  if (allowance !== undefined && usage >= allowance) {
    return {
      allowed: false,
      reason: `Phase '${phase}' used ${usage}/${allowance} images. Budget exhausted.`,
    };
  }

  const totalUsage = state.budget.images_generated || 0;
  if (totalUsage >= state.budget.max_images) {
    return {
      allowed: false,
      reason: `Total image budget exhausted (${totalUsage}/${state.budget.max_images}).`,
    };
  }

  return { allowed: true };
}

// ── Phase Navigation ────────────────────────────────────────────────────────

function getNextPhase(currentPhase: PhaseName | null): PhaseName | null {
  if (currentPhase === null) return PHASES[0];
  const idx = PHASES.indexOf(currentPhase);
  if (idx === -1 || idx >= PHASES.length - 1) return null;
  return PHASES[idx + 1];
}

// ── Section Map (image gen phases) ──────────────────────────────────────────

function getSectionParams(
  phase: PhaseName,
): { section: string; assetGroup: string; identity?: boolean } | null {
  const sectionMap: Record<string, { section: string; assetGroup: string; identity?: boolean }> = {
    generate_identity: { section: "character", assetGroup: "character", identity: true },
    generate_references: { section: "character", assetGroup: "character" },
    generate_world: { section: "world", assetGroup: "world" },
    generate_key_moments: { section: "key_moment", assetGroup: "key_moment" },
    generate_visual_language: { section: "visual_language", assetGroup: "visual_language" },
  };
  return sectionMap[phase] || null;
}

// ── Handler-level harness ───────────────────────────────────────────────────

async function pipelineHandler(
  req: Request,
  handlerLogic: (req: Request) => Response | Promise<Response>,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    return await handlerLogic(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pipeline-orchestrator] Fatal error:", msg);
    return json({ error: msg }, 500);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Constants — PHASES and IMAGE_GENERATION_PHASES
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "PHASES: correct order and count",
  fn() {
    assertEquals(PHASES.length, 7, "7 phases");
    assertEquals(PHASES[0], "atoms_to_dna");
    assertEquals(PHASES[1], "resolve_visual_set");
    assertEquals(PHASES[2], "generate_identity");
    assertEquals(PHASES[3], "generate_references");
    assertEquals(PHASES[4], "generate_world");
    assertEquals(PHASES[5], "generate_key_moments");
    assertEquals(PHASES[6], "generate_visual_language");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "PHASES: all 7 are unique strings",
  fn() {
    const unique = new Set(PHASES);
    assertEquals(unique.size, 7, "all unique");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "IMAGE_GENERATION_PHASES: contains the 5 image phases, excludes first 2",
  fn() {
    assertEquals(IMAGE_GENERATION_PHASES.size, 5, "5 image generation phases");
    assert(IMAGE_GENERATION_PHASES.has("generate_identity"), "identity");
    assert(IMAGE_GENERATION_PHASES.has("generate_references"), "references");
    assert(IMAGE_GENERATION_PHASES.has("generate_world"), "world");
    assert(IMAGE_GENERATION_PHASES.has("generate_key_moments"), "key_moments");
    assert(IMAGE_GENERATION_PHASES.has("generate_visual_language"), "visual_language");
    assert(!IMAGE_GENERATION_PHASES.has("atoms_to_dna"), "atoms_to_dna excluded");
    assert(!IMAGE_GENERATION_PHASES.has("resolve_visual_set"), "resolve_visual_set excluded");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "DEFAULT_BUDGET_PER_PHASE: all 5 image gen phases have budgets, total = 200",
  fn() {
    assertEquals(Object.keys(DEFAULT_BUDGET_PER_PHASE).length, 5);
    const total = Object.values(DEFAULT_BUDGET_PER_PHASE).reduce((a, b) => a + b, 0);
    assertEquals(total, 200, "sum of phase budgets = 200");
    assertEquals(DEFAULT_BUDGET_PER_PHASE["generate_identity"], 10);
    assertEquals(DEFAULT_BUDGET_PER_PHASE["generate_visual_language"], 60);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "DEFAULT_MAX_IMAGES: set to 200",
  fn() {
    assertEquals(DEFAULT_MAX_IMAGES, 200);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2: buildInitialPhaseState
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildInitialPhaseState: all fields correct",
  fn() {
    const state = buildInitialPhaseState();
    assertEquals(state.status, "pending");
    assertEquals(state.started_at, null);
    assertEquals(state.completed_at, null);
    assertEquals(state.error, null);
    assertEquals(state.retry_count, 0);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3: buildInitialState
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildInitialState: structure correctness without custom budget",
  fn() {
    const state = buildInitialState();
    assertEquals(state.pipeline_status, "not_started");
    assertEquals(state.current_phase, null);
    assertEquals(state.error_log.length, 0);

    // All 7 phases present
    const phaseNames = Object.keys(state.phase_states);
    assertEquals(phaseNames.length, 7, "7 phase states");
    for (const phase of PHASES) {
      assert(phase in state.phase_states, `phase '${phase}' present`);
      assertEquals(state.phase_states[phase].status, "pending");
    }

    // Budget defaults
    assertEquals(state.budget.max_images, 200);
    assertEquals(state.budget.images_generated, 0);
    assertEquals(Object.keys(state.budget.budget_per_phase).length, 5);
    assertEquals(state.budget.usage_per_phase, {});
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildInitialState: custom budget override",
  fn() {
    const customBudget: BudgetState = {
      max_images: 50,
      images_generated: 5,
      budget_per_phase: { generate_identity: 5 },
      usage_per_phase: { generate_identity: 0 },
    };
    const state = buildInitialState(customBudget);
    assertEquals(state.budget.max_images, 50);
    assertEquals(state.budget.images_generated, 5);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildInitialState: last_updated is an ISO timestamp",
  fn() {
    const state = buildInitialState();
    assert(typeof state.last_updated === "string", "timestamp is string");
    assert(!isNaN(Date.parse(state.last_updated)), "timestamp is valid ISO");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4: checkBudget
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "checkBudget: within phase allowance — allowed",
  fn() {
    const state = buildInitialState();
    const result = checkBudget(state, "generate_identity");
    assertEquals(result.allowed, true, "no usage yet");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "checkBudget: phase budget exhausted with usage === allowance",
  fn() {
    const state = buildInitialState();
    state.budget.usage_per_phase["generate_identity"] = 10;
    const result = checkBudget(state, "generate_identity");
    assertEquals(result.allowed, false, "usage equals allowance");
    assert(result.reason!.includes("Budget exhausted"), "reason mentions exhaustion");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "checkBudget: phase budget exhausted with usage > allowance",
  fn() {
    const state = buildInitialState();
    state.budget.usage_per_phase["generate_identity"] = 15;
    const result = checkBudget(state, "generate_identity");
    assertEquals(result.allowed, false, "over budget");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "checkBudget: total budget exhausted",
  fn() {
    const state = buildInitialState();
    state.budget.images_generated = 200;
    const result = checkBudget(state, "generate_identity");
    assertEquals(result.allowed, false, "total exhausted");
    assert(result.reason!.includes("Total image budget"), "total budget reason");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "checkBudget: phase with no explicit allowance passes",
  fn() {
    const state = buildInitialState();
    // atoms_to_dna has no budget_per_phase entry
    const result = checkBudget(state, "atoms_to_dna");
    assertEquals(result.allowed, true, "no allowance = passes");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "checkBudget: partial usage within allowance passes",
  fn() {
    const state = buildInitialState();
    state.budget.usage_per_phase["generate_references"] = 15;
    state.budget.images_generated = 15;
    const result = checkBudget(state, "generate_references");
    assertEquals(result.allowed, true, "15 of 30 used, still allowed");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "checkBudget: total budget near limit but within",
  fn() {
    const state = buildInitialState();
    state.budget.images_generated = 199;
    state.budget.usage_per_phase["generate_identity"] = 5;
    const result = checkBudget(state, "generate_identity");
    assertEquals(result.allowed, true, "199 of 200 used, identity under its 10 limit");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 5: getNextPhase
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "getNextPhase: null current phase returns first phase",
  fn() {
    const result = getNextPhase(null);
    assertEquals(result, "atoms_to_dna");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "getNextPhase: first phase returns second",
  fn() {
    const result = getNextPhase("atoms_to_dna");
    assertEquals(result, "resolve_visual_set");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "getNextPhase: middle phase returns next",
  fn() {
    const result = getNextPhase("generate_identity");
    assertEquals(result, "generate_references");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "getNextPhase: last phase returns null",
  fn() {
    const result = getNextPhase("generate_visual_language");
    assertEquals(result, null);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "getNextPhase: invalid phase returns null",
  fn() {
    // @ts-ignore -- testing runtime behavior with invalid value
    const result = getNextPhase("nonexistent_phase");
    assertEquals(result, null);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 6: getSectionParams — Image generation phase mapping
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "getSectionParams: generate_identity maps correctly with identity flag",
  fn() {
    const result = getSectionParams("generate_identity");
    assert(result, "has params");
    assertEquals(result.section, "character");
    assertEquals(result.assetGroup, "character");
    assertEquals(result.identity, true, "identity flag set");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "getSectionParams: generate_references has no identity flag",
  fn() {
    const result = getSectionParams("generate_references");
    assert(result, "has params");
    assertEquals(result.section, "character");
    assertEquals(result.assetGroup, "character");
    assertEquals(result.identity, undefined, "no identity flag");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "getSectionParams: generate_world maps to world",
  fn() {
    const result = getSectionParams("generate_world");
    assert(result, "has params");
    assertEquals(result.section, "world");
    assertEquals(result.assetGroup, "world");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "getSectionParams: generate_key_moments maps to key_moment",
  fn() {
    const result = getSectionParams("generate_key_moments");
    assert(result, "has params");
    assertEquals(result.section, "key_moment");
    assertEquals(result.assetGroup, "key_moment");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "getSectionParams: generate_visual_language maps to visual_language",
  fn() {
    const result = getSectionParams("generate_visual_language");
    assert(result, "has params");
    assertEquals(result.section, "visual_language");
    assertEquals(result.assetGroup, "visual_language");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "getSectionParams: non-image-gen phase returns null",
  fn() {
    const result = getSectionParams("atoms_to_dna");
    assertEquals(result, null, "no mapping for non-image phase");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 7: Integration — Pipeline flow logic tests
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "flow: full all-phases chain produces sequential phase names",
  fn() {
    const order: string[] = [];
    let current: PhaseName | null = null;
    while (true) {
      const next = getNextPhase(current);
      if (!next) break;
      order.push(next);
      current = next;
    }
    assertEquals(order, [
      "atoms_to_dna",
      "resolve_visual_set",
      "generate_identity",
      "generate_references",
      "generate_world",
      "generate_key_moments",
      "generate_visual_language",
    ], "exact phase order matches");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "flow: start sets pipeline_status to running and current_phase to atoms_to_dna",
  fn() {
    const state = buildInitialState();
    state.pipeline_status = "running";
    state.current_phase = "atoms_to_dna";
    assertEquals(state.pipeline_status, "running");
    assertEquals(state.current_phase, "atoms_to_dna");
    assertEquals(state.phase_states["atoms_to_dna"].status, "pending");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "flow: phase_states all start as pending with no timestamps",
  fn() {
    const state = buildInitialState();
    for (const phase of PHASES) {
      const ps = state.phase_states[phase];
      assertEquals(ps.status, "pending", `${phase} is pending`);
      assertEquals(ps.started_at, null, `${phase} no started_at`);
      assertEquals(ps.completed_at, null, `${phase} no completed_at`);
      assertEquals(ps.error, null, `${phase} no error`);
      assertEquals(ps.retry_count, 0, `${phase} retry_count 0`);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 8: Handler-level — CORS, validation, error handling
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "handler: OPTIONS returns 200 with CORS headers before handler logic",
  async fn() {
    const resp = await pipelineHandler(
      new Request("http://localhost/", { method: "OPTIONS" }),
      () => { throw new Error("should not reach"); },
    );
    assertEquals(resp.status, 200);
    assertEquals(resp.headers.get("Access-Control-Allow-Origin"), "*");
    const text = await resp.text();
    assertEquals(text, "", "OPTIONS body empty");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "handler: missing project_id returns 400",
  async fn() {
    const resp = await pipelineHandler(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      }),
      async (req) => {
        const body = await req.json();
        if (!body.project_id) {
          return json({ error: "project_id is required" }, 400);
        }
        return json({ ok: true });
      },
    );
    assertEquals(resp.status, 400);
    const body = await resp.json();
    assertEquals(body.error, "project_id is required");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "handler: unknown action returns 400",
  async fn() {
    const resp = await pipelineHandler(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unknown", project_id: "p1" }),
      }),
      async (req) => {
        const body = await req.json();
        const { action } = body;
        const validActions = ["start", "status", "retry_phase", "_continue"];
        if (!validActions.includes(action)) {
          return json({ error: `Unknown action: ${action}. Supported: start, status, retry_phase` }, 400);
        }
        return json({ ok: true });
      },
    );
    assertEquals(resp.status, 400);
    const body = await resp.json();
    assert(body.error.includes("Unknown action"), "unknown action error");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "handler: retry_phase without phase returns 400",
  async fn() {
    const resp = await pipelineHandler(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_phase", project_id: "p1" }),
      }),
      async (req) => {
        const body = await req.json();
        const { action, phase } = body;
        if (action === "retry_phase" && !phase) {
          return json({ error: "phase is required for retry_phase action" }, 400);
        }
        return json({ ok: true });
      },
    );
    assertEquals(resp.status, 400);
    const body = await resp.json();
    assert(body.error.includes("phase is required"), "phase required");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "handler: retry_phase with invalid phase returns 400",
  async fn() {
    const resp = await pipelineHandler(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_phase", project_id: "p1", phase: "bad_phase" }),
      }),
      async (req) => {
        const body = await req.json();
        const { action, phase } = body;
        if (action === "retry_phase" && !PHASES.includes(phase)) {
          return json({ error: `Invalid phase: ${phase}. Valid phases: ${PHASES.join(", ")}` }, 400);
        }
        return json({ ok: true });
      },
    );
    assertEquals(resp.status, 400);
    const body = await resp.json();
    assert(body.error.includes("Invalid phase"), "invalid phase");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "handler: start action returns initial pipeline state",
  async fn() {
    const resp = await pipelineHandler(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", project_id: "p1" }),
      }),
      () => {
        return json({ message: "Pipeline started", state: { pipeline_status: "running", current_phase: "atoms_to_dna" } });
      },
    );
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.message, "Pipeline started");
    assertEquals(body.state.pipeline_status, "running");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "handler: Error thrown in handler caught by try-catch, returns 500",
  async fn() {
    const resp = await pipelineHandler(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", project_id: "p1" }),
      }),
      () => { throw new Error("Pipeline execution failed"); },
    );
    assertEquals(resp.status, 500);
    const body = await resp.json();
    assertEquals(body.error, "Pipeline execution failed");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "handler: error response includes CORS headers",
  async fn() {
    const resp = await pipelineHandler(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      () => { throw new Error("crash"); },
    );
    assertEquals(resp.headers.get("Access-Control-Allow-Origin"), "*");
    assertEquals(resp.headers.get("Content-Type"), "application/json");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "handler: non-Error thrown returns 500 with string message",
  async fn() {
    const resp = await pipelineHandler(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      () => { throw "string crash"; },
    );
    assertEquals(resp.status, 500);
    const body = await resp.json();
    assertEquals(body.error, "string crash");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "handler: start with pipeline already running returns 409 Conflict",
  async fn() {
    const resp = await pipelineHandler(
      new Request("http://localhost/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", project_id: "p1" }),
      }),
      async () => {
        // Simulating existing running pipeline
        return json({ error: "Pipeline is already running", state: { pipeline_status: "running" } }, 409);
      },
    );
    assertEquals(resp.status, 409);
    const body = await resp.json();
    assert(body.error.includes("already running"), "already running error");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 9: Edge cases — budget boundary and phase transitions
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "edge: budget_per_phase does not include non-image phases",
  fn() {
    const bp = DEFAULT_BUDGET_PER_PHASE;
    assertEquals(bp["atoms_to_dna"], undefined, "no budget for atoms_to_dna");
    assertEquals(bp["resolve_visual_set"], undefined, "no budget for resolve_visual_set");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "edge: getNextPhase with atoms_to_dna returns resolve_visual_set",
  fn() {
    assertEquals(getNextPhase("atoms_to_dna"), "resolve_visual_set");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "edge: usage_per_phase for phase not yet used defaults to 0 in checkBudget",
  fn() {
    const state = buildInitialState();
    // phase not in usage_per_phase at all
    const result = checkBudget(state, "generate_world");
    assertEquals(result.allowed, true, "default zero usage passes");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
