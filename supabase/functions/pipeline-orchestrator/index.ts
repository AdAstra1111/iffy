/**
 * pipeline-orchestrator — Phase 2 orchestrator for the production stills pipeline.
 *
 * Manages the pipeline from atoms to images across these phases, in order:
 *   atoms_to_dna -> resolve_visual_set -> generate_identity ->
 *   generate_references -> generate_world -> generate_key_moments ->
 *   generate_visual_language
 *
 * State is persisted in projects.pipeline_state (JSONB).
 *
 * Actions:
 *   start         -- Initialize pipeline, begin atoms_to_dna phase
 *   status        -- Return current pipeline state
 *   retry_phase   -- Reset a specific phase to pending, restart pipeline
 *   _continue     -- Internal action; self-chain continuation (advance phases)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// -- Constants -----------------------------------------------------------------

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

// -- Types ---------------------------------------------------------------------

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

// -- Helpers -------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function anonClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
}

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

// -- State I/O -----------------------------------------------------------------

async function readPipelineState(
  supabase: any,
  projectId: string,
): Promise<PipelineState | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("pipeline_state")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    console.error(`[pipeline-orchestrator] Error reading pipeline_state: ${error.message}`);
    throw new Error(`Failed to read pipeline state: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Project ${projectId} not found`);
  }

  return (data.pipeline_state as PipelineState) || null;
}

async function writePipelineState(
  supabase: any,
  projectId: string,
  state: PipelineState,
): Promise<void> {
  state.last_updated = timestamp();

  const { error } = await supabase
    .from("projects")
    .update({ pipeline_state: state })
    .eq("id", projectId);

  if (error) {
    console.error(`[pipeline-orchestrator] Error writing pipeline_state: ${error.message}`);
    throw new Error(`Failed to write pipeline state: ${error.message}`);
  }
}

// -- Self-Chain ----------------------------------------------------------------

function getPipelineBaseUrl(): string {
  return Deno.env.get("SUPABASE_URL")!;
}

async function selfChainContinue(
  projectId: string,
  token: string,
): Promise<void> {
  try {
    const url = `${getPipelineBaseUrl()}/functions/v1/pipeline-orchestrator`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "_continue", project_id: projectId }),
    });
  } catch (err) {
    console.error(
      `[pipeline-orchestrator] Self-chain error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function waitUntilSafe(p: Promise<unknown>): boolean {
  try {
    // @ts-ignore -- EdgeRuntime is a Supabase Deno runtime global
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(p);
      return true;
    }
  } catch {
    // not available
  }
  return false;
}

// -- Budget Check --------------------------------------------------------------

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

// -- Phase Runners -------------------------------------------------------------

/**
 * Phase 1: atoms_to_dna
 * Calls enrich-visual-dna-from-atoms for both character and location entity types.
 */
async function runAtomsToDna(
  supabase: any,
  projectId: string,
): Promise<{ success: boolean; results?: Record<string, unknown>; error?: string }> {
  const results: Record<string, unknown> = {};

  for (const entityType of ["character", "location"] as const) {
    try {
      console.log(`[pipeline-orchestrator] Invoking enrich-visual-dna-from-atoms for ${entityType}`);
      const { data, error: invokeErr } = await supabase.functions.invoke(
        "enrich-visual-dna-from-atoms",
        {
          body: {
            action: "enrich",
            project_id: projectId,
            entity_type: entityType,
          },
        },
      );

      if (invokeErr) {
        throw new Error(`enrich-visual-dna-from-atoms (${entityType}) invoke error: ${invokeErr.message}`);
      }

      results[entityType] = data;
      console.log(
        `[pipeline-orchestrator] enrich-visual-dna-from-atoms (${entityType}) succeeded:`,
        JSON.stringify(data),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[pipeline-orchestrator] enrich-visual-dna-from-atoms (${entityType}) failed: ${msg}`);
      return { success: false, results, error: msg };
    }
  }

  return { success: true, results };
}

/**
 * Phase 2: resolve_visual_set
 * Queries character_visual_dna and canon_locations to determine what needs images.
 */
async function runResolveVisualSet(
  supabase: any,
  projectId: string,
): Promise<{
  success: boolean;
  result?: { characters: string[]; locations: string[] };
  error?: string;
}> {
  try {
    const charDnaQuery = supabase
      .from("character_visual_dna")
      .select("id, character_name, identity_strength, version_number")
      .eq("project_id", projectId)
      .eq("is_current", true)
      .order("character_name");

    const locQuery = supabase
      .from("canon_locations")
      .select("id, canonical_name, location_type, story_importance")
      .eq("project_id", projectId)
      .eq("active", true)
      .order("story_importance", { ascending: true });

    const [charResult, locResult] = await Promise.all([charDnaQuery, locQuery]);

    if (charResult.error) {
      throw new Error(`Failed to query character_visual_dna: ${charResult.error.message}`);
    }
    if (locResult.error) {
      throw new Error(`Failed to query canon_locations: ${locResult.error.message}`);
    }

    const characters = (charResult.data || []).map((c: any) => c.character_name).filter(Boolean);
    const locations = (locResult.data || []).map((l: any) => l.canonical_name).filter(Boolean);

    return {
      success: true,
      result: { characters, locations },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline-orchestrator] resolve_visual_set failed: ${msg}`);
    return { success: false, error: msg };
  }
}

/**
 * Image generation phases (3-7).
 * Calls generate-lookbook-image with section/asset group/identity parameters.
 */
async function runImageGenerationPhase(
  supabase: any,
  projectId: string,
  phase: PhaseName,
  state: PipelineState,
): Promise<{
  success: boolean;
  result?: { images_requested: number; images_generated: number; details?: unknown };
  error?: string;
}> {
  const budgetCheck = checkBudget(state, phase);
  if (!budgetCheck.allowed) {
    return { success: false, error: budgetCheck.reason! };
  }

  const sectionMap: Record<string, { section: string; assetGroup: string; identity?: boolean }> = {
    generate_identity: { section: "character", assetGroup: "character", identity: true },
    generate_references: { section: "character", assetGroup: "character" },
    generate_world: { section: "world", assetGroup: "world" },
    generate_key_moments: { section: "key_moment", assetGroup: "key_moment" },
    generate_visual_language: { section: "visual_language", assetGroup: "visual_language" },
  };

  const params = sectionMap[phase];
  if (!params) {
    return { success: false, error: `Unknown image generation phase: ${phase}` };
  }

  // Resolve characters/locations from DNA/canon tables
  let characterNames: string[] = [];
  let locationNames: string[] = [];
  try {
    const [charDna, locRows] = await Promise.all([
      supabase
        .from("character_visual_dna")
        .select("character_name")
        .eq("project_id", projectId)
        .eq("is_current", true)
        .order("character_name"),
      supabase
        .from("canon_locations")
        .select("canonical_name")
        .eq("project_id", projectId)
        .eq("active", true)
        .order("story_importance", { ascending: true }),
    ]);
    characterNames = (charDna.data || []).map((c: any) => c.character_name).filter(Boolean);
    locationNames = (locRows.data || []).map((l: any) => l.canonical_name).filter(Boolean);
  } catch {
    // Continue with empty sets
  }

  try {
    const body: Record<string, unknown> = {
      project_id: projectId,
      section: params.section,
      asset_group: params.assetGroup,
      budget_check: true,
      remaining_budget:
        (state.budget.max_images || DEFAULT_MAX_IMAGES) - (state.budget.images_generated || 0),
    };

    if (params.identity) {
      body.mode = "identity";
    }

    if (params.assetGroup === "character" && characterNames.length > 0) {
      body.character_names = characterNames;
    }
    if (params.assetGroup === "world" && locationNames.length > 0) {
      body.location_names = locationNames;
    }

    console.log(
      `[pipeline-orchestrator] Invoking generate-lookbook-image for phase '${phase}'`,
      JSON.stringify(body),
    );

    const { data, error: invokeErr } = await supabase.functions.invoke(
      "generate-lookbook-image",
      { body },
    );

    if (invokeErr) {
      throw new Error(`generate-lookbook-image invoke error: ${invokeErr.message}`);
    }

    const results = ((data as any)?.results || []) as Array<{ status: string; image_id: string }>;
    const generatedCount = results.filter((r) => r.status === "ready" || r.image_id).length;
    const requestedCount = results.length;

    // Update budget usage
    const usagePerPhase = state.budget.usage_per_phase;
    usagePerPhase[phase] = (usagePerPhase[phase] || 0) + generatedCount;
    state.budget.images_generated = (state.budget.images_generated || 0) + generatedCount;

    return {
      success: true,
      result: {
        images_requested: requestedCount,
        images_generated: generatedCount,
        details: data,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline-orchestrator] Phase '${phase}' failed: ${msg}`);
    return { success: false, error: msg };
  }
}

// -- Phase Router --------------------------------------------------------------

async function executePhase(
  supabase: any,
  projectId: string,
  phase: PhaseName,
  state: PipelineState,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  console.log(`[pipeline-orchestrator] Executing phase: ${phase}`);

  const phaseState = state.phase_states[phase];
  phaseState.status = "running";
  phaseState.started_at = timestamp();
  phaseState.error = null;
  await writePipelineState(supabase, projectId, state);

  let outcome: { success: boolean; result?: unknown; error?: string };

  switch (phase) {
    case "atoms_to_dna":
      outcome = await runAtomsToDna(supabase, projectId);
      break;
    case "resolve_visual_set":
      outcome = await runResolveVisualSet(supabase, projectId);
      break;
    case "generate_identity":
    case "generate_references":
    case "generate_world":
    case "generate_key_moments":
    case "generate_visual_language":
      outcome = await runImageGenerationPhase(supabase, projectId, phase, state);
      break;
    default:
      outcome = { success: false, error: `Unknown phase: ${phase}` };
  }

  return outcome;
}

async function finalizePhase(
  supabase: any,
  projectId: string,
  phase: PhaseName,
  state: PipelineState,
  outcome: { success: boolean; result?: unknown; error?: string },
): Promise<void> {
  const phaseState = state.phase_states[phase];

  if (outcome.success) {
    phaseState.status = "completed";
    phaseState.completed_at = timestamp();
    console.log(`[pipeline-orchestrator] Phase '${phase}' completed successfully`);
  } else {
    phaseState.status = "failed";
    phaseState.error = outcome.error || "Unknown error";
    state.error_log.push(
      `[${timestamp()}] Phase '${phase}' failed: ${outcome.error || "Unknown error"}`,
    );
    console.error(`[pipeline-orchestrator] Phase '${phase}' failed: ${outcome.error}`);
  }

  await writePipelineState(supabase, projectId, state);
}

function getNextPhase(currentPhase: PhaseName | null): PhaseName | null {
  if (currentPhase === null) return PHASES[0];
  const idx = PHASES.indexOf(currentPhase);
  if (idx === -1 || idx >= PHASES.length - 1) return null;
  return PHASES[idx + 1];
}

async function advancePipeline(
  supabase: any,
  projectId: string,
  state: PipelineState,
  justCompletedPhase?: PhaseName,
): Promise<void> {
  const nextPhase = getNextPhase(justCompletedPhase || state.current_phase);

  if (!nextPhase) {
    state.pipeline_status = "completed";
    state.current_phase = null;
    await writePipelineState(supabase, projectId, state);
    console.log(`[pipeline-orchestrator] Pipeline completed for project ${projectId}`);
    return;
  }

  // Check prerequisites (critical phases must be completed)
  const currentIdx = PHASES.indexOf(nextPhase);
  let allPrereqsDone = true;
  for (let i = 0; i < currentIdx; i++) {
    const prev = PHASES[i];
    if (!IMAGE_GENERATION_PHASES.has(prev)) {
      if (state.phase_states[prev].status !== "completed") {
        allPrereqsDone = false;
        break;
      }
    }
  }

  if (!allPrereqsDone) {
    state.pipeline_status = "failed";
    state.error_log.push(
      `[${timestamp()}] Cannot advance: prerequisite phases not completed before '${nextPhase}'`,
    );
    await writePipelineState(supabase, projectId, state);
    console.error(`[pipeline-orchestrator] Cannot advance to '${nextPhase}' -- prerequisites not met`);
    return;
  }

  // Advance and execute next phase
  state.current_phase = nextPhase;
  await writePipelineState(supabase, projectId, state);

  const outcome = await executePhase(supabase, projectId, nextPhase, state);
  await finalizePhase(supabase, projectId, nextPhase, state, outcome);

  if (outcome.success) {
    await advancePipeline(supabase, projectId, state, nextPhase);
  } else if (IMAGE_GENERATION_PHASES.has(nextPhase)) {
    // Failure isolation: skip failed image gen phase, continue to next
    console.log(
      `[pipeline-orchestrator] Phase '${nextPhase}' failed but has failure isolation. Continuing.`,
    );
    await advancePipeline(supabase, projectId, state, nextPhase);
  } else {
    state.pipeline_status = "failed";
    await writePipelineState(supabase, projectId, state);
    console.error(`[pipeline-orchestrator] Critical phase '${nextPhase}' failed. Pipeline stopped.`);
  }
}

// -- Action Handlers -----------------------------------------------------------

async function handleStart(
  supabase: any,
  _anonSupabase: any,
  projectId: string,
  budget?: PipelineState["budget"],
): Promise<Response> {
  const existingState = await readPipelineState(supabase, projectId);
  if (existingState && existingState.pipeline_status === "running") {
    return json({ error: "Pipeline is already running", state: existingState }, 409);
  }

  const state = buildInitialState(budget);
  state.pipeline_status = "running";
  state.current_phase = "atoms_to_dna";
  await writePipelineState(supabase, projectId, state);

  const token = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const chainPromise = (async () => {
    const outcome = await executePhase(supabase, projectId, "atoms_to_dna", state);
    await finalizePhase(supabase, projectId, "atoms_to_dna", state, outcome);

    if (outcome.success) {
      await advancePipeline(supabase, projectId, state, "atoms_to_dna");
    } else {
      state.pipeline_status = "failed";
      await writePipelineState(supabase, projectId, state);
    }

    await selfChainContinue(projectId, token);
  })();

  waitUntilSafe(chainPromise);

  return json({ message: "Pipeline started", state: { ...state } });
}

async function handleStatus(
  supabase: any,
  projectId: string,
): Promise<Response> {
  const state = await readPipelineState(supabase, projectId);
  if (!state) {
    return json({
      pipeline_status: "not_started",
      message: "Pipeline has not been started for this project",
    });
  }
  return json({ state });
}

async function handleRetryPhase(
  supabase: any,
  _anonSupabase: any,
  projectId: string,
  phase: PhaseName,
): Promise<Response> {
  const state = await readPipelineState(supabase, projectId);
  if (!state) {
    return json({ error: "No pipeline state found. Start the pipeline first." }, 400);
  }

  if (!PHASES.includes(phase)) {
    return json({ error: `Invalid phase: ${phase}. Valid phases: ${PHASES.join(", ")}` }, 400);
  }

  const phaseState = state.phase_states[phase];
  phaseState.status = "pending";
  phaseState.started_at = null;
  phaseState.completed_at = null;
  phaseState.error = null;
  phaseState.retry_count = (phaseState.retry_count || 0) + 1;

  state.pipeline_status = "running";
  state.current_phase = phase;
  await writePipelineState(supabase, projectId, state);

  const token = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const chainPromise = (async () => {
    const outcome = await executePhase(supabase, projectId, phase, state);
    await finalizePhase(supabase, projectId, phase, state, outcome);

    if (outcome.success) {
      await advancePipeline(supabase, projectId, state, phase);
    } else if (IMAGE_GENERATION_PHASES.has(phase)) {
      await advancePipeline(supabase, projectId, state, phase);
    } else {
      state.pipeline_status = "failed";
      await writePipelineState(supabase, projectId, state);
    }

    await selfChainContinue(projectId, token);
  })();

  waitUntilSafe(chainPromise);

  return json({ message: `Phase '${phase}' reset and pipeline restarted`, state });
}

/**
 * Internal continuation action.
 * Checks current pipeline state and continues processing phases.
 */
async function handleContinue(
  supabase: any,
  projectId: string,
): Promise<Response> {
  const state = await readPipelineState(supabase, projectId);
  if (!state) {
    return json({ error: "No pipeline state found" }, 400);
  }

  if (state.pipeline_status === "completed" || state.pipeline_status === "failed") {
    return json({ state, message: "Pipeline already terminal" });
  }

  const currentPhase = state.current_phase;
  if (!currentPhase) {
    state.pipeline_status = "completed";
    await writePipelineState(supabase, projectId, state);
    return json({ state, message: "Pipeline completed (no current phase)" });
  }

  const currentIdx = PHASES.indexOf(currentPhase);

  let nextIncomplete: PhaseName | null = null;
  for (let i = currentIdx; i < PHASES.length; i++) {
    const p = PHASES[i];
    const ps = state.phase_states[p];
    if (ps.status === "pending" || ps.status === "running" || ps.status === "failed") {
      let prereqsOk = true;
      for (let j = 0; j < i; j++) {
        const prev = PHASES[j];
        const prevPs = state.phase_states[prev];
        if (!IMAGE_GENERATION_PHASES.has(prev) && prevPs.status !== "completed") {
          prereqsOk = false;
          break;
        }
      }
      if (prereqsOk) {
        nextIncomplete = p;
        break;
      }
    }
  }

  if (!nextIncomplete) {
    state.pipeline_status = "completed";
    state.current_phase = null;
    await writePipelineState(supabase, projectId, state);
    return json({ state, message: "Pipeline completed" });
  }

  state.current_phase = nextIncomplete;
  await writePipelineState(supabase, projectId, state);

  const outcome = await executePhase(supabase, projectId, nextIncomplete, state);
  await finalizePhase(supabase, projectId, nextIncomplete, state, outcome);

  if (outcome.success) {
    await advancePipeline(supabase, projectId, state, nextIncomplete);
  } else if (IMAGE_GENERATION_PHASES.has(nextIncomplete)) {
    await advancePipeline(supabase, projectId, state, nextIncomplete);
  } else {
    state.pipeline_status = "failed";
    await writePipelineState(supabase, projectId, state);
  }

  const token = Deno.env.get("SUPABASE_ANON_KEY") || "";
  await selfChainContinue(projectId, token);

  return json({ state, message: `Processing phase: ${nextIncomplete}` });
}

// -- Main Handler --------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = adminClient();
    const anonSupabase = anonClient();

    const body = await req.json();
    const { action, project_id, phase, budget } = body;

    if (!project_id) {
      return json({ error: "project_id is required" }, 400);
    }

    console.log(`[pipeline-orchestrator] Action: ${action}, Project: ${project_id}`);

    switch (action) {
      case "start":
        return await handleStart(supabase, anonSupabase, project_id, budget);

      case "status":
        return await handleStatus(supabase, project_id);

      case "retry_phase": {
        if (!phase) {
          return json({ error: "phase is required for retry_phase action" }, 400);
        }
        if (!PHASES.includes(phase)) {
          return json({
            error: `Invalid phase: ${phase}. Valid phases: ${PHASES.join(", ")}`,
          }, 400);
        }
        return await handleRetryPhase(supabase, anonSupabase, project_id, phase as PhaseName);
      }

      case "_continue":
        return await handleContinue(supabase, project_id);

      default:
        return json({
          error: `Unknown action: ${action}. Supported: start, status, retry_phase`,
        }, 400);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline-orchestrator] Fatal error: ${msg}`);
    return json({ error: msg }, 500);
  }
});