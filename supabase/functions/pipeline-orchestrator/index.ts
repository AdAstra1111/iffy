// @ts-nocheck
/**
 * pipeline-orchestrator — State machine orchestrator for the production stills pipeline.
 *
 * Chains: atoms_to_dna → resolve_visual_set → generate_identity → generate_references
 *         → generate_world → generate_key_moments → generate_visual_language
 *
 * State persisted in projects.pipeline_state JSONB column.
 * Uses self-chaining to progress through phases asynchronously.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Phase definitions ──

const PIPELINE_PHASES = [
  "atoms_to_dna",
  "resolve_visual_set",
  "generate_identity",
  "generate_references",
  "generate_world",
  "generate_key_moments",
  "generate_visual_language",
] as const;

type PipelinePhase = (typeof PIPELINE_PHASES)[number];

interface PipelineState {
  current_phase: string;
  completed_phases: string[];
  status: "idle" | "running" | "complete" | "complete_with_failures" | "budget_exhausted";
  failed_items: Array<{
    phase: string;
    entity: string;
    call: string;
    error: string;
    error_detail: string;
    attempts: number;
    last_attempt_at: string;
  }>;
  phase_failures: Record<string, {
    status: "failed" | "complete_with_failures";
    total_calls: number;
    failed_calls: number;
    failure_reason: string;
  }>;
  budget_exhausted: boolean;
  budget_reached_at: string | null;
  generation_count: number;
  started_at: string;
}

const DEFAULT_STATE: PipelineState = {
  current_phase: "",
  completed_phases: [],
  status: "idle",
  failed_items: [],
  phase_failures: {},
  budget_exhausted: false,
  budget_reached_at: null,
  generation_count: 0,
  started_at: "",
};

const MAX_GENERATIONS_DEFAULT = 10;
const ENRICH_FN = "enrich-visual-dna-from-atoms";
const GENERATE_FN = "generate-lookbook-image";
// Stale-lock TTL for concurrency guard (5 minutes)
const STALE_LOCK_TTL_MS = 5 * 60 * 1000;

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, project_id, phases, max_generations } = body;

    if (!project_id) {
      return respond({ error: "project_id required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);
    const functionUrl = `${supabaseUrl}/functions/v1/pipeline-orchestrator`;

    switch (action) {
      case "status":
        return await handleStatus(sb, project_id);

      case "start":
      case "run":
        return await handleRun(sb, project_id, functionUrl, phases || PIPELINE_PHASES, max_generations || MAX_GENERATIONS_DEFAULT);

      default:
        return respond({ error: `Unknown action: ${action}. Supported: status, start, run` }, 400);
    }
  } catch (e: any) {
    console.error("pipeline-orchestrator error:", e);
    return respond({ error: e.message }, 500);
  }
});

// ── Handlers ──

/**
 * Handle status action — return current pipeline state.
 */
async function handleStatus(sb: any, projectId: string): Promise<Response> {
  const state = await readPipelineState(sb, projectId);
  return respond({ pipeline_state: state });
}

/**
 * Handle run action — execute the pipeline.
 * Synchronously runs the current phase, then self-chains to continue.
 */
async function handleRun(
  sb: any,
  projectId: string,
  functionUrl: string,
  phases: string[],
  maxGenerations: number,
): Promise<Response> {
  let state = await readPipelineState(sb, projectId);

  // Concurrency guard: if status is "running" and not stale, don't start a new run
  if (state.status === "running" && !isStaleLock(state.started_at)) {
    return respond({ pipeline_state: state, message: "Pipeline already running" });
  }

  // Initialize or resume state
  if (state.status !== "running") {
    state = {
      ...DEFAULT_STATE,
      started_at: new Date().toISOString(),
      status: "running",
      current_phase: phases[0] || PIPELINE_PHASES[0],
    };
    await writePipelineState(sb, projectId, state);
  }

  // Determine which phases to run
  const remainingPhases = phases.filter((p) => !state.completed_phases.includes(p));
  let currentPhase = remainingPhases[0] || state.current_phase;

  if (!remainingPhases.length) {
    state.status = "complete";
    state.current_phase = "";
    await writePipelineState(sb, projectId, state);
    return respond({ pipeline_state: state, message: "All phases already complete" });
  }

  // Execute current phase
  state.current_phase = currentPhase;
  await writePipelineState(sb, projectId, state);

  const phaseResult = await executePhase(sb, projectId, currentPhase, state, maxGenerations);

  // Update state with phase results
  state.completed_phases.push(currentPhase);
  state.failed_items.push(...phaseResult.failedItems);
  state.generation_count += phaseResult.generationsUsed;

  // Track phase failures
  if (phaseResult.failedCalls > 0 && phaseResult.totalCalls > 0) {
    state.phase_failures[currentPhase] = {
      status: phaseResult.failedCalls > phaseResult.totalCalls / 2 ? "failed" : "complete_with_failures",
      total_calls: phaseResult.totalCalls,
      failed_calls: phaseResult.failedCalls,
      failure_reason: `${currentPhase}: ${phaseResult.failedCalls}/${phaseResult.totalCalls} calls failed`,
    };
  }

  // Check budget
  if (state.generation_count >= maxGenerations) {
    state.budget_exhausted = true;
    state.budget_reached_at = currentPhase;
    state.status = "budget_exhausted";
    state.current_phase = "";
    await writePipelineState(sb, projectId, state);

    const nextRemaining = remainingPhases.slice(1);
    return respond({
      pipeline_state: state,
      message: `Budget exhausted at phase "${currentPhase}" — ${nextRemaining.length} phases remaining. Re-invoke with phases: ${JSON.stringify(nextRemaining)}`,
    });
  }

  // Check if more phases remain
  const nextPhases = remainingPhases.slice(1);
  if (nextPhases.length === 0) {
    // All phases complete
    const anyFailures = Object.values(state.phase_failures).some((pf) => pf.status === "failed");
    state.status = anyFailures ? "complete_with_failures" : "complete";
    state.current_phase = "";
    await writePipelineState(sb, projectId, state);
    return respond({ pipeline_state: state, message: "Pipeline complete" });
  }

  // Self-chain to next phase (fire-and-forget via background fetch)
  state.current_phase = nextPhases[0] || "";
  await writePipelineState(sb, projectId, state);

  // Return current state immediately — the self-chain continues async
  // The frontend can poll with action: "status" to track progress
  selfChainNext(functionUrl, project_id, nextPhases, maxGenerations);

  return respond({
    pipeline_state: state,
    message: `Phase "${currentPhase}" complete. Continuing to "${nextPhases[0] || "finalize"}"`,
  });
}

// ── Phase Execution ──

interface PhaseResult {
  failedItems: PipelineState["failed_items"];
  generationsUsed: number;
  totalCalls: number;
  failedCalls: number;
}

async function executePhase(
  sb: any,
  projectId: string,
  phase: string,
  state: PipelineState,
  maxGenerations: number,
): Promise<PhaseResult> {
  const result: PhaseResult = { failedItems: [], generationsUsed: 0, totalCalls: 0, failedCalls: 0 };

  switch (phase) {
    case "atoms_to_dna":
      return await executeAtomsToDNA(sb, projectId, state);

    case "resolve_visual_set":
      return await executeResolveVisualSet(sb, projectId);

    case "generate_identity":
      return await executeGenerateForType(sb, projectId, "character", ["identity_headshot", "identity_profile", "identity_full_body"], state, maxGenerations);

    case "generate_references":
      return await executeGenerateForType(sb, projectId, "character", ["close_up", "medium", "full_body", "profile", "emotional_variant"], state, maxGenerations);

    case "generate_world":
      return await executeGenerateForType(sb, projectId, "world", ["wide", "atmospheric", "detail", "time_variant"], state, maxGenerations);

    case "generate_key_moments":
      return await executeKeyMoments(sb, projectId, state, maxGenerations);

    case "generate_visual_language":
      return await executeGenerateForType(sb, projectId, "visual_language", ["lighting_ref", "texture_ref", "composition_ref", "color_ref"], state, maxGenerations);

    default:
      console.warn(`Unknown phase: ${phase}`);
      return result;
  }
}

/**
 * Phase: atoms_to_dna — enrich visual DNA from completed atoms.
 */
async function executeAtomsToDNA(sb: any, projectId: string, state: PipelineState): Promise<PhaseResult> {
  const result: PhaseResult = { failedItems: [], generationsUsed: 0, totalCalls: 0, failedCalls: 0 };

  // Find completed character and location atoms
  const { data: atoms } = await sb
    .from("atoms")
    .select("atom_type, canonical_name")
    .eq("project_id", projectId)
    .eq("generation_status", "complete")
    .in("atom_type", ["character", "location"]);

  if (!atoms || atoms.length === 0) {
    result.totalCalls = 0;
    return result;
  }

  const characterNames = new Set<string>();
  const locationNames = new Set<string>();

  for (const atom of atoms) {
    if (atom.atom_type === "character") characterNames.add(atom.canonical_name);
    else if (atom.atom_type === "location") locationNames.add(atom.canonical_name);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Enrich each character
  for (const name of characterNames) {
    result.totalCalls++;
    try {
      const { error } = await withRetry(`character:${name}`, async () => {
        const res = await fetch(
          `${supabaseUrl}/functions/v1/${ENRICH_FN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
            body: JSON.stringify({ project_id: projectId, entity_name: name, entity_type: "character", mode: "aggressive" }),
          },
        );
        const data = await res.json();
        if (!res.ok || data?.error) throw new Error(data?.error || data?.errors?.[0] || `HTTP ${res.status}`);
        return data;
      }, 3, 2000);
    } catch (err: any) {
      result.failedCalls++;
      result.failedItems.push({
        phase: "atoms_to_dna",
        entity: name,
        call: ENRICH_FN,
        error: "enrichment_failed",
        error_detail: err.message,
        attempts: 3,
        last_attempt_at: new Date().toISOString(),
      });
    }
  }

  // Enrich each location
  for (const name of locationNames) {
    result.totalCalls++;
    try {
      const { error } = await withRetry(`location:${name}`, async () => {
        const res = await fetch(
          `${supabaseUrl}/functions/v1/${ENRICH_FN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
            body: JSON.stringify({ project_id: projectId, entity_name: name, entity_type: "location", mode: "aggressive" }),
          },
        );
        const data = await res.json();
        if (!res.ok || data?.error) throw new Error(data?.error || data?.errors?.[0] || `HTTP ${res.status}`);
        return data;
      }, 3, 2000);
    } catch (err: any) {
      result.failedCalls++;
      result.failedItems.push({
        phase: "atoms_to_dna",
        entity: name,
        call: ENRICH_FN,
        error: "enrichment_failed",
        error_detail: err.message,
        attempts: 3,
        last_attempt_at: new Date().toISOString(),
      });
    }
  }

  return result;
}

/**
 * Phase: resolve_visual_set — compute required visual slots vs existing.
 */
async function executeResolveVisualSet(sb: any, projectId: string): Promise<PhaseResult> {
  // This phase is a validation/reporting step.
  // The actual required visual set resolution happens in generate-lookbook-image.
  // For now, just log the snapshot of what exists vs what might be needed.
  const result: PhaseResult = { failedItems: [], generationsUsed: 0, totalCalls: 0, failedCalls: 0 };

  const { data: characters } = await sb
    .from("project_characters")
    .select("id, name, character_name")
    .eq("project_id", projectId);

  const { data: locations } = await sb
    .from("canon_locations")
    .select("id, name")
    .eq("project_id", projectId);

  console.log(`[pipeline-orchestrator] resolve_visual_set: ${characters?.length || 0} characters, ${locations?.length || 0} locations`);

  // Check DNA readiness
  const { data: dnaEntries } = await sb
    .from("character_visual_dna")
    .select("character_name, identity_strength")
    .eq("project_id", projectId)
    .eq("is_current", true);

  console.log(`[pipeline-orchestrator] resolve_visual_set: ${dnaEntries?.length || 0} DNA entries found`);

  // Check location datasets
  const { data: locDatasets } = await sb
    .from("location_visual_datasets")
    .select("location_name, freshness_status")
    .eq("project_id", projectId)
    .eq("is_current", true);

  console.log(`[pipeline-orchestrator] resolve_visual_set: ${locDatasets?.length || 0} location datasets found`);

  result.totalCalls = 1;
  return result;
}

/**
 * Phase: generate_{type} — generate images for specified shot types.
 */
async function executeGenerateForType(
  sb: any,
  projectId: string,
  section: string,
  shotTypes: string[],
  state: PipelineState,
  maxGenerations: number,
): Promise<PhaseResult> {
  const result: PhaseResult = { failedItems: [], generationsUsed: 0, totalCalls: 0, failedCalls: 0 };
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  // Determine entities based on section type
  let entities: { name: string; type: string }[] = [];

  if (section === "character" || section === "identity" || section === "references") {
    const { data: dnaEntries } = await sb
      .from("character_visual_dna")
      .select("character_name, identity_strength")
      .eq("project_id", projectId)
      .eq("is_current", true);

    if (dnaEntries) {
      entities = dnaEntries.map((d: any) => ({ name: d.character_name, type: "character" }));
    }
  } else if (section === "world") {
    const { data: locDatasets } = await sb
      .from("location_visual_datasets")
      .select("location_name")
      .eq("project_id", projectId)
      .eq("is_current", true);

    // Also try project_canon for location names
    if (!locDatasets?.length) {
      const { data: canon } = await sb
        .from("project_canon")
        .select("canon_json")
        .eq("project_id", projectId)
        .maybeSingle();

      if (canon?.canon_json) {
        const cj = canon.canon_json as Record<string, any>;
        const locs = cj.locations || [];
        entities = (Array.isArray(locs) ? locs : []).map((l: any) => ({
          name: l.name || l.location_name || "",
          type: "location",
        }));
      }
    } else {
      entities = locDatasets.map((l: any) => ({ name: l.location_name, type: "location" }));
    }
  }

  if (entities.length === 0) {
    console.log(`[pipeline-orchestrator] No entities found for section: ${section}`);
    return result;
  }

  // Cap generation count by budget
  const remainingBudget = maxGenerations - state.generation_count;
  let generationsToMake = Math.min(entities.length * Math.min(shotTypes.length, 2), remainingBudget);
  if (generationsToMake <= 0) return result;

  // Generate images — one per entity with the first applicable shot type
  const shotsPerEntity = shotTypes.slice(0, Math.max(1, Math.ceil(generationsToMake / entities.length)));

  for (const entity of entities) {
    if (state.generation_count + result.generationsUsed >= maxGenerations) break;

    for (const shotType of shotsPerEntity) {
      if (state.generation_count + result.generationsUsed >= maxGenerations) break;

      result.totalCalls++;
      try {
        const generateBody: Record<string, any> = {
          project_id: projectId,
          section: section === "identity" ? "character" : section === "references" ? "character" : section,
          shot_plan_context: {
            pipelinePhase: section,
            shotIndex: result.generationsUsed + 1,
            shotCount: generationsToMake,
          },
        };

        if (entity.type === "character") {
          generateBody.character_name = entity.name;
          generateBody.subject_type = "character";
          generateBody.subject = entity.name;
          generateBody.requested_shot_types = [shotType];
        } else if (entity.type === "location") {
          generateBody.location_name = entity.name;
          generateBody.subject_type = "location";
          generateBody.subject = entity.name;
          generateBody.requested_shot_types = [shotType];
        }

        // For identity pack, set identity_locked
        if (section === "identity") {
          generateBody.auto_complete_context = {
            ...(generateBody.auto_complete_context || {}),
          };
        }

        await withRetry(`${entity.name}:${shotType}`, async () => {
          const res = await fetch(
            `${supabaseUrl}/functions/v1/${GENERATE_FN}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
              body: JSON.stringify(generateBody),
            },
          );
          const data = await res.json();
          if (!res.ok || data?.error) throw new Error(data?.error || `HTTP ${res.status}`);
          return data;
        }, 3, 3000);

        result.generationsUsed++;
      } catch (err: any) {
        result.failedCalls++;
        result.failedItems.push({
          phase: section,
          entity: entity.name,
          call: GENERATE_FN,
          error: "generation_failed",
          error_detail: err.message,
          attempts: 3,
          last_attempt_at: new Date().toISOString(),
        });
      }
    }
  }

  return result;
}

/**
 * Phase: generate_key_moments — generate tableau/medium/close_up/wide from scene graph.
 */
async function executeKeyMoments(
  sb: any,
  projectId: string,
  state: PipelineState,
  maxGenerations: number,
): Promise<PhaseResult> {
  const result: PhaseResult = { failedItems: [], generationsUsed: 0, totalCalls: 0, failedCalls: 0 };
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  const remainingBudget = maxGenerations - state.generation_count;
  const keyMomentShots = ["tableau", "medium", "close_up", "wide"];

  // Check scene graph for narrative moments
  const { data: scenes } = await sb
    .from("scene_graph_versions")
    .select("id, slugline, summary, content, scene_role")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!scenes?.length) {
    console.log("[pipeline-orchestrator] No scene graph entries found for key moments");
    return result;
  }

  // Pick top scenes (prioritize climax and payoff)
  const priorityRoles = ["climax", "payoff", "reversal", "reveal"];
  const sortedScenes = [...scenes].sort((a: any, b: any) => {
    const aPri = priorityRoles.indexOf(a.scene_role || "");
    const bPri = priorityRoles.indexOf(b.scene_role || "");
    return (aPri === -1 ? 999 : aPri) - (bPri === -1 ? 999 : bPri);
  });

  const topScenes = sortedScenes.slice(0, Math.min(sortedScenes.length, Math.ceil(remainingBudget / keyMomentShots.length)));

  for (const scene of topScenes) {
    if (state.generation_count + result.generationsUsed >= maxGenerations) break;

    const shotType = keyMomentShots[result.generationsUsed % keyMomentShots.length];
    result.totalCalls++;

    try {
      await withRetry(`scene:${scene.slugline || scene.id}:${shotType}`, async () => {
        const res = await fetch(
          `${supabaseUrl}/functions/v1/${GENERATE_FN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
            body: JSON.stringify({
              project_id: projectId,
              section: "key_moment",
              subject_type: "key_moment",
              shot_plan_context: {
                pipelinePhase: "generate_key_moments",
                shotIndex: result.generationsUsed + 1,
                shotCount: Math.min(topScenes.length, remainingBudget),
                narrativeTarget: scene.slugline || scene.summary?.slice(0, 100),
              },
              requested_shot_types: [shotType],
            }),
          },
        );
        const data = await res.json();
        if (!res.ok || data?.error) throw new Error(data?.error || `HTTP ${res.status}`);
        return data;
      }, 3, 3000);

      result.generationsUsed++;
    } catch (err: any) {
      result.failedCalls++;
      result.failedItems.push({
        phase: "generate_key_moments",
        entity: scene.slugline || scene.id || "unknown_scene",
        call: GENERATE_FN,
        error: "generation_failed",
        error_detail: err.message,
        attempts: 3,
        last_attempt_at: new Date().toISOString(),
      });
    }
  }

  return result;
}

// ── Retry Helper ──

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 2000,
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      console.warn(`[pipeline-orchestrator] Retry ${attempt}/${maxAttempts} for "${label}": ${err.message}`);
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }
  throw lastError || new Error(`Failed after ${maxAttempts} attempts`);
}

// ── State Persistence ──

async function readPipelineState(sb: any, projectId: string): Promise<PipelineState> {
  const { data, error } = await sb
    .from("projects")
    .select("pipeline_state")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    console.error("[pipeline-orchestrator] Failed to read pipeline_state:", error.message);
    return { ...DEFAULT_STATE };
  }

  const raw = data?.pipeline_state || {};
  return {
    ...DEFAULT_STATE,
    ...(typeof raw === "object" && !Array.isArray(raw) ? raw : {}),
    started_at: raw?.started_at || "",
  };
}

async function writePipelineState(sb: any, projectId: string, state: PipelineState): Promise<void> {
  const { error } = await sb
    .from("projects")
    .update({ pipeline_state: state })
    .eq("id", projectId);

  if (error) {
    console.error("[pipeline-orchestrator] Failed to write pipeline_state:", error.message);
  }
}

/**
 * Self-chain to continue pipeline execution asynchronously.
 * This runs as a fire-and-forget fetch to avoid blocking the response.
 */
function selfChainNext(
  functionUrl: string,
  projectId: string,
  remainingPhases: string[],
  maxGenerations: number,
): void {
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Fire-and-forget — do not await
  fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      action: "run",
      project_id: projectId,
      phases: remainingPhases,
      max_generations: maxGenerations,
    }),
  }).catch((err) => {
    console.error("[pipeline-orchestrator] Self-chain fetch failed:", err.message);
  });
}

/**
 * Check if a lock timestamp is stale (older than TTL).
 */
function isStaleLock(startedAt: string): boolean {
  if (!startedAt) return true;
  const lockTime = new Date(startedAt).getTime();
  if (isNaN(lockTime)) return true;
  return Date.now() - lockTime > STALE_LOCK_TTL_MS;
}

// ── Utilities ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function respond(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}