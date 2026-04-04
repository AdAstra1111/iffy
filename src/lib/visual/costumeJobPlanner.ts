/**
 * costumeJobPlanner.ts — Deterministic run planner for governed parallel generation.
 *
 * The planner runs ONCE before any generation starts. It:
 * 1. Resolves all eligible characters, states, and slots
 * 2. Builds the final custom_prompt per slot via the canonical chain
 * 3. Creates an immutable, ordered job list for the run
 *
 * No worker may invent jobs ad hoc. No worker may rebuild prompt truth.
 * The planner is the ONLY place where job scope is decided.
 *
 * v1.0.0
 */

import type { CostumeRunManifest, CostumeGenerationMode } from './costumeRunManifest';
import { createRunManifest, computeCastScopeHash } from './costumeRunManifest';
import {
  COSTUME_LOOK_SLOTS,
  COSTUME_REQUIRED_SLOT_KEYS,
  COSTUME_ON_ACTOR_DOMAIN,
  buildCostumeLookPrompt,
  buildCostumeSlotBrief,
  resolveStateWardrobePackage,
  isValidCostumeSlotKey,
  sortSlotsForGeneration,
  type CostumeLookInput,
} from './costumeOnActor';
import { deriveCanonInputsFromProfile } from './stateWardrobeReconstructor';
import { resolveSlotScoringPolicy, type SlotScoringPolicy } from './costumeConvergenceScoring';
import type { CharacterWardrobeProfile, WardrobeStateDefinition } from './characterWardrobeExtractor';
import type { WorldValidationRules } from './worldValidationMode';
import type { DEFAULT_JOB_SORT_ORDER } from './costumeParallelConfig';

// ── Types ──

export type CostumeJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'admitted'
  | 'rejected'
  | 'skipped'
  | 'superseded';

export interface CostumeJobPlan {
  /** Unique job ID within the run */
  job_id: string;
  /** Run this job belongs to */
  run_id: string;
  /** Project context */
  project_id: string;
  /** Character/state/slot coordinates */
  character_key: string;
  character_name: string;
  state_key: string;
  state_label: string;
  slot_key: string;
  slot_label: string;
  /** Attempt index within this slot (0-based) */
  attempt_index: number;
  /** Is this a required slot? */
  is_required: boolean;
  /** Priority sort key (lower = higher priority) */
  priority: number;
  /** Pre-built prompt from canonical chain */
  custom_prompt: string;
  negative_prompt: string;
  shot_type: string;
  /** Scoring policy resolved at plan time */
  scoring_policy: SlotScoringPolicy;
  /** Actor identity context */
  actor_id: string;
  actor_version_id: string;
  /** Generation mode */
  generation_mode: CostumeGenerationMode;
  /** Visual set ID for this character×state */
  set_id: string;
  /** Slot DB ID */
  slot_id: string;
  /** Planner fingerprint for traceability */
  planner_version: string;
  planner_timestamp: string;
  /** Runtime state (mutable during execution) */
  status: CostumeJobStatus;
  started_at: string | null;
  finished_at: string | null;
  result_image_id: string | null;
  error: string | null;
  /** Admission result (set after generation) */
  admission_result: 'pending' | 'admitted' | 'rejected' | 'hard_fail' | null;
  final_score: number | null;
}

export interface CostumeRunPlan {
  run_id: string;
  project_id: string;
  manifest: CostumeRunManifest;
  jobs: CostumeJobPlan[];
  /** Planning metadata */
  planned_at: string;
  planner_version: string;
  cast_scope_hash: string;
  /** Summary counts (immutable after planning) */
  total_jobs: number;
  total_characters: number;
  total_states: number;
  total_required_jobs: number;
  total_optional_jobs: number;
}

// ── Planner Input ──

export interface PlannerCharacterInput {
  characterKey: string;
  characterName: string;
  actorId: string;
  actorVersionId: string;
  profile: CharacterWardrobeProfile;
  states: WardrobeStateDefinition[];
  /** Per-state: visual set info if it already exists */
  existingSets: Record<string, { id: string; status: string } | null>;
  /** Per-state×slot: existing slot info */
  existingSlots: Record<string, Array<{
    id: string;
    slot_key: string;
    slot_label: string;
    state: string;
    is_required: boolean;
    best_candidate_id: string | null;
    best_score: number | null;
    attempt_count: number | null;
  }>>;
}

export interface PlannerInput {
  projectId: string;
  characters: PlannerCharacterInput[];
  worldRules: WorldValidationRules;
  castBindings: Array<{ character_key: string; ai_actor_id: string; ai_actor_version_id: string }>;
  mode: CostumeGenerationMode;
  /** Only generate for these character keys (if provided) */
  targetCharacterKeys?: string[];
}

// ── Constants ──

const PLANNER_VERSION = '1.0.0';
let _jobCounter = 0;

function generateJobId(runId: string): string {
  _jobCounter++;
  return `cjob_${runId}_${_jobCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

// ── Planner ──

/**
 * Plan a complete costume generation run.
 * This is deterministic — same inputs always produce the same job set (modulo IDs).
 * MUST complete before any generation starts.
 */
export function planCostumeRun(input: PlannerInput): CostumeRunPlan {
  const castHash = computeCastScopeHash(input.castBindings);
  const allSlotKeys = input.mode === 'required_only'
    ? COSTUME_REQUIRED_SLOT_KEYS
    : COSTUME_LOOK_SLOTS.map(s => s.key);

  const manifest = createRunManifest(
    input.targetCharacterKeys?.[0] || '__all__',
    '__parallel_plan__',
    input.mode,
    allSlotKeys,
    castHash,
  );

  const jobs: CostumeJobPlan[] = [];
  const now = new Date().toISOString();
  let priorityCounter = 0;

  // Filter to target characters if specified
  const characters = input.targetCharacterKeys
    ? input.characters.filter(c => input.targetCharacterKeys!.includes(c.characterKey))
    : input.characters;

  // Sort characters deterministically
  const sortedChars = [...characters].sort((a, b) =>
    a.characterKey.localeCompare(b.characterKey)
  );

  for (const char of sortedChars) {
    // Sort states: explicit scene-backed first, then explicit, then inferred
    const sortedStates = [...char.states].sort((a, b) => {
      const aScene = a.explicit_or_inferred === 'explicit' && a.trigger_conditions.some(t => t.startsWith('scene:'));
      const bScene = b.explicit_or_inferred === 'explicit' && b.trigger_conditions.some(t => t.startsWith('scene:'));
      if (aScene && !bScene) return -1;
      if (!aScene && bScene) return 1;
      if (a.explicit_or_inferred !== b.explicit_or_inferred) {
        return a.explicit_or_inferred === 'explicit' ? -1 : 1;
      }
      return 0;
    });

    for (const state of sortedStates) {
      const existingSet = char.existingSets[state.state_key];

      // Skip locked sets
      if (existingSet?.status === 'locked') continue;

      // Skip if no set ID (will be created during execution — but we need it for planning)
      // For planning, we use a placeholder that will be resolved at execution time
      const setId = existingSet?.id || `pending_set_${char.characterKey}_${state.state_key}`;

      // Get existing slots for this state
      const existingSlotList = char.existingSlots[state.state_key] || [];

      // Build canonical inputs for slot brief
      const canonInputs = deriveCanonInputsFromProfile(char.profile);
      const input_for_prompt: CostumeLookInput = {
        characterName: char.characterName,
        characterKey: char.characterKey,
        actorName: char.characterName,
        actorId: char.actorId,
        actorVersionId: char.actorVersionId,
        wardrobeProfile: char.profile,
        wardrobeState: state,
        worldRules: input.worldRules,
        referenceImageUrls: [],
        canonWardrobeInputs: canonInputs,
      };

      // Resolve state package once per state
      const statePackage = resolveStateWardrobePackage(char.profile, state, undefined, canonInputs);

      // Get slot definitions for this mode
      const slotDefs = input.mode === 'required_only'
        ? COSTUME_LOOK_SLOTS.filter(s => s.required)
        : COSTUME_LOOK_SLOTS;

      // Sort required first
      const sortedSlotDefs = sortSlotsForGeneration(
        slotDefs.map(s => ({ slot_key: s.key, is_required: s.required } as any))
      );

      for (const slotRef of sortedSlotDefs) {
        const slotDef = COSTUME_LOOK_SLOTS.find(s => s.key === slotRef.slot_key);
        if (!slotDef) continue;

        // Validate slot key
        if (!isValidCostumeSlotKey(slotDef.key)) continue;

        // Check existing slot state
        const existingSlot = existingSlotList.find(s => s.slot_key === slotDef.key);
        if (existingSlot?.state === 'approved' || existingSlot?.state === 'locked') continue;

        // Slot brief gating
        const slotBrief = buildCostumeSlotBrief(statePackage, slotDef.key, char.profile, state);
        if (!slotBrief.generatable) continue;

        // Build prompt at plan time
        const promptResult = buildCostumeLookPrompt(input_for_prompt, slotDef.key);

        // Resolve scoring policy
        const scoringPolicy = resolveSlotScoringPolicy(slotDef.key, state.state_key);

        // Determine slot ID
        const slotId = existingSlot?.id || `pending_slot_${char.characterKey}_${state.state_key}_${slotDef.key}`;

        // Create job
        const job: CostumeJobPlan = {
          job_id: generateJobId(manifest.run_id),
          run_id: manifest.run_id,
          project_id: input.projectId,
          character_key: char.characterKey,
          character_name: char.characterName,
          state_key: state.state_key,
          state_label: state.label,
          slot_key: slotDef.key,
          slot_label: slotDef.label,
          attempt_index: 0,
          is_required: slotDef.required,
          priority: priorityCounter++,
          custom_prompt: promptResult.prompt,
          negative_prompt: promptResult.negative_prompt,
          shot_type: promptResult.shot_type,
          scoring_policy: scoringPolicy,
          actor_id: char.actorId,
          actor_version_id: char.actorVersionId,
          generation_mode: input.mode,
          set_id: setId,
          slot_id: slotId,
          planner_version: PLANNER_VERSION,
          planner_timestamp: now,
          status: 'queued',
          started_at: null,
          finished_at: null,
          result_image_id: null,
          error: null,
          admission_result: null,
          final_score: null,
        };

        jobs.push(job);
      }
    }
  }

  // Count summary
  const characterKeys = new Set(jobs.map(j => j.character_key));
  const stateKeys = new Set(jobs.map(j => `${j.character_key}|${j.state_key}`));

  return {
    run_id: manifest.run_id,
    project_id: input.projectId,
    manifest,
    jobs,
    planned_at: now,
    planner_version: PLANNER_VERSION,
    cast_scope_hash: castHash,
    total_jobs: jobs.length,
    total_characters: characterKeys.size,
    total_states: stateKeys.size,
    total_required_jobs: jobs.filter(j => j.is_required).length,
    total_optional_jobs: jobs.filter(j => !j.is_required).length,
  };
}

// ── Run Plan Queries ──

export function getJobsByCharacter(plan: CostumeRunPlan, characterKey: string): CostumeJobPlan[] {
  return plan.jobs.filter(j => j.character_key === characterKey);
}

export function getJobsByState(plan: CostumeRunPlan, characterKey: string, stateKey: string): CostumeJobPlan[] {
  return plan.jobs.filter(j => j.character_key === characterKey && j.state_key === stateKey);
}

export function getJobsByStatus(plan: CostumeRunPlan, status: CostumeJobStatus): CostumeJobPlan[] {
  return plan.jobs.filter(j => j.status === status);
}

export function getPlanProgress(plan: CostumeRunPlan): {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  admitted: number;
  rejected: number;
  skipped: number;
  percent: number;
} {
  const total = plan.total_jobs;
  const queued = plan.jobs.filter(j => j.status === 'queued').length;
  const running = plan.jobs.filter(j => j.status === 'running').length;
  const succeeded = plan.jobs.filter(j => j.status === 'succeeded').length;
  const failed = plan.jobs.filter(j => j.status === 'failed').length;
  const admitted = plan.jobs.filter(j => j.admission_result === 'admitted').length;
  const rejected = plan.jobs.filter(j => j.admission_result === 'rejected' || j.admission_result === 'hard_fail').length;
  const skipped = plan.jobs.filter(j => j.status === 'skipped').length;
  const done = succeeded + failed + skipped;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, queued, running, succeeded, failed, admitted, rejected, skipped, percent };
}

export function getCharacterProgress(plan: CostumeRunPlan): Array<{
  character_key: string;
  character_name: string;
  total: number;
  done: number;
  admitted: number;
  failed: number;
  percent: number;
}> {
  const charMap = new Map<string, { name: string; total: number; done: number; admitted: number; failed: number }>();

  for (const job of plan.jobs) {
    let entry = charMap.get(job.character_key);
    if (!entry) {
      entry = { name: job.character_name, total: 0, done: 0, admitted: 0, failed: 0 };
      charMap.set(job.character_key, entry);
    }
    entry.total++;
    if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'skipped') entry.done++;
    if (job.admission_result === 'admitted') entry.admitted++;
    if (job.status === 'failed') entry.failed++;
  }

  return Array.from(charMap.entries()).map(([key, v]) => ({
    character_key: key,
    character_name: v.name,
    total: v.total,
    done: v.done,
    admitted: v.admitted,
    failed: v.failed,
    percent: v.total > 0 ? Math.round((v.done / v.total) * 100) : 0,
  }));
}
