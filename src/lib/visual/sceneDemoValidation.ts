/**
 * sceneDemoValidation.ts — Canonical Scene Demo Validation System.
 *
 * Evaluates generated scene demo images against locked upstream dependencies.
 * Enforces actor continuity, costume continuity, environment/atmosphere adherence,
 * purpose compliance, world validation mode, and character dropout detection.
 *
 * v1.0.0
 */

import type { SceneDemoPlan, CharacterDemoPlan } from './sceneDemoPlanner';
import { getSceneDemoPlanInputs } from './sceneDemoPlanner';

// ── Constants ───────────────────────────────────────────────────────────────

export const SCENE_DEMO_VALIDATION_VERSION = '1.0.0';

// ── Hard Fail Codes ─────────────────────────────────────────────────────────

export const HARD_FAIL_CODES = [
  'ACTOR_IDENTITY_LOST',
  'COSTUME_WRONG_STATE',
  'CHARACTER_DROPOUT',
  'WRONG_LOCATION',
  'WORLD_MODE_VIOLATION',
  'DEPENDENCY_UNLOCKED',
  'PLAN_NOT_READY',
] as const;

export type HardFailCode = typeof HARD_FAIL_CODES[number];

// ── Advisory Codes ──────────────────────────────────────────────────────────

export const ADVISORY_CODES = [
  'ATMOSPHERE_DRIFT',
  'MOTIF_ABSENT',
  'EDITORIAL_DRIFT',
  'MINOR_COSTUME_DEVIATION',
  'FRAMING_SUBOPTIMAL',
  'LIGHTING_INCONSISTENT',
] as const;

export type AdvisoryCode = typeof ADVISORY_CODES[number];

// ── Validation Types ────────────────────────────────────────────────────────

export interface SceneDemoSlotValidation {
  slot_key: string;
  passed: boolean;
  overall_score: number;
  scores: {
    actor_continuity: number;
    costume_continuity: number;
    environment_continuity: number;
    atmosphere_continuity: number;
    purpose_adherence: number;
    world_mode_compliance: number;
    character_presence: number;
    editorial_fidelity: number;
  };
  hard_fail_codes: HardFailCode[];
  advisory_codes: AdvisoryCode[];
  validation_version: string;
  scoring_model: string;
  source_plan_id: string;
  upstream_dependency_ids: string[];
}

export interface SceneDemoRunValidation {
  run_id: string;
  plan_id: string;
  all_passed: boolean;
  slot_validations: SceneDemoSlotValidation[];
  aggregate_score: number;
  hard_fail_count: number;
  advisory_count: number;
  lock_eligible: boolean;
  blocking_reasons: string[];
  stale: boolean;
  stale_reasons: string[];
  validation_version: string;
}

// ── Slot Validation Inputs ──────────────────────────────────────────────────

export interface SlotValidationInput {
  slot_key: string;
  prompt_used: string | null;
  generation_config: Record<string, unknown>;
  plan: SceneDemoPlan;
  world_mode: string;
}

// ── Slot-Level Validation ───────────────────────────────────────────────────

/**
 * Validate a single scene demo slot against its plan.
 * Deterministic scoring based on generation config matching plan truth.
 */
export function validateSceneDemoSlot(input: SlotValidationInput): SceneDemoSlotValidation {
  const { slot_key, prompt_used, generation_config, plan, world_mode } = input;
  const hardFails: HardFailCode[] = [];
  const advisories: AdvisoryCode[] = [];

  const scores = {
    actor_continuity: 100,
    costume_continuity: 100,
    environment_continuity: 100,
    atmosphere_continuity: 100,
    purpose_adherence: 100,
    world_mode_compliance: 100,
    character_presence: 100,
    editorial_fidelity: 100,
  };

  const configCharKeys = (generation_config.character_keys as string[]) || [];
  const configActorIds = (generation_config.actor_ids as string[]) || [];
  const configCostumeIds = (generation_config.costume_look_set_ids as string[]) || [];

  // 1. Actor continuity: verify actor IDs match plan
  const planActorIds = plan.characters.map(c => c.actor_id).filter(Boolean);
  if (planActorIds.length > 0) {
    const actorMatch = planActorIds.every(id => configActorIds.includes(id));
    if (!actorMatch) {
      scores.actor_continuity = 0;
      hardFails.push('ACTOR_IDENTITY_LOST');
    }
  }

  // 2. Costume continuity: verify costume set IDs match plan
  const planCostumeIds = plan.characters
    .map(c => c.costume_look_set_id)
    .filter((id): id is string => id !== null);
  if (planCostumeIds.length > 0) {
    const costumeMatch = planCostumeIds.every(id => configCostumeIds.includes(id));
    if (!costumeMatch) {
      scores.costume_continuity = 30;
      hardFails.push('COSTUME_WRONG_STATE');
    }
  }

  // 3. Character presence: verify no dropout in multi-character slots
  const planCharCount = plan.characters.length;
  if (planCharCount > 0 && slot_key !== 'environment_detail') {
    if (configCharKeys.length < planCharCount) {
      scores.character_presence = 0;
      hardFails.push('CHARACTER_DROPOUT');
    }
  }

  // 4. Environment continuity: verify location set ID matches
  const configLocationId = generation_config.location_set_id as string | null;
  if (plan.location_set_id && configLocationId !== plan.location_set_id) {
    scores.environment_continuity = 20;
    hardFails.push('WRONG_LOCATION');
  }

  // 5. Atmosphere continuity
  const configAtmoId = generation_config.atmosphere_set_id as string | null;
  if (plan.atmosphere_set_id && configAtmoId !== plan.atmosphere_set_id) {
    scores.atmosphere_continuity = 50;
    advisories.push('ATMOSPHERE_DRIFT');
  }

  // 6. Purpose adherence: verify scene purpose matches
  const configPurpose = generation_config.scene_purpose as string;
  if (configPurpose !== plan.scene_purpose) {
    scores.purpose_adherence = 40;
  }

  // 7. World mode compliance
  const configWorldMode = generation_config.world_mode as string;
  if (world_mode && configWorldMode && configWorldMode !== world_mode) {
    scores.world_mode_compliance = 0;
    hardFails.push('WORLD_MODE_VIOLATION');
  }

  // 8. Editorial fidelity: check prompt contains [NO CHARACTER DROPOUT]
  if (prompt_used && !prompt_used.includes('[NO CHARACTER DROPOUT]')) {
    scores.editorial_fidelity = 70;
    advisories.push('EDITORIAL_DRIFT');
  }

  // Aggregate
  const weights = {
    actor_continuity: 0.20,
    costume_continuity: 0.15,
    environment_continuity: 0.15,
    atmosphere_continuity: 0.10,
    purpose_adherence: 0.10,
    world_mode_compliance: 0.10,
    character_presence: 0.15,
    editorial_fidelity: 0.05,
  };

  const overall = Object.entries(weights).reduce((sum, [key, weight]) => {
    return sum + (scores[key as keyof typeof scores] * weight);
  }, 0);

  const deps = getSceneDemoPlanInputs(plan);
  const upstreamIds = [
    ...deps.costume_look_set_ids,
    deps.location_set_id,
    deps.atmosphere_set_id,
    ...deps.motif_set_ids,
  ].filter((id): id is string => id !== null);

  return {
    slot_key,
    passed: hardFails.length === 0,
    overall_score: Math.round(overall),
    scores,
    hard_fail_codes: hardFails,
    advisory_codes: advisories,
    validation_version: SCENE_DEMO_VALIDATION_VERSION,
    scoring_model: 'scene_demo_v1',
    source_plan_id: plan.scene_demo_id,
    upstream_dependency_ids: upstreamIds,
  };
}

// ── Run-Level Validation ────────────────────────────────────────────────────

export interface RunValidationInput {
  run_id: string;
  plan: SceneDemoPlan;
  slots: SlotValidationInput[];
  currentLockedSetIds: Set<string>;
  world_mode: string;
}

/**
 * Validate all slots in a scene demo run.
 * Checks dependency drift before approving.
 */
export function validateSceneDemoRun(input: RunValidationInput): SceneDemoRunValidation {
  const { run_id, plan, slots, currentLockedSetIds, world_mode } = input;

  // 1. Dependency drift check
  const staleReasons: string[] = [];
  const deps = getSceneDemoPlanInputs(plan);

  for (const setId of deps.costume_look_set_ids) {
    if (!currentLockedSetIds.has(setId)) {
      staleReasons.push(`Costume look set ${setId.slice(0, 8)} no longer locked`);
    }
  }
  if (deps.location_set_id && !currentLockedSetIds.has(deps.location_set_id)) {
    staleReasons.push(`Location set ${deps.location_set_id.slice(0, 8)} no longer locked`);
  }
  if (deps.atmosphere_set_id && !currentLockedSetIds.has(deps.atmosphere_set_id)) {
    staleReasons.push(`Atmosphere set ${deps.atmosphere_set_id.slice(0, 8)} no longer locked`);
  }

  const isStale = staleReasons.length > 0;

  // 2. Validate each slot
  const slotValidations = slots.map(s => validateSceneDemoSlot({ ...s, world_mode }));

  const allPassed = slotValidations.every(v => v.passed);
  const hardFailCount = slotValidations.reduce((sum, v) => sum + v.hard_fail_codes.length, 0);
  const advisoryCount = slotValidations.reduce((sum, v) => sum + v.advisory_codes.length, 0);
  const aggregateScore = slotValidations.length > 0
    ? Math.round(slotValidations.reduce((sum, v) => sum + v.overall_score, 0) / slotValidations.length)
    : 0;

  // 3. Lock eligibility
  const blockingReasons: string[] = [];
  if (!allPassed) blockingReasons.push('Not all slots passed validation');
  if (isStale) blockingReasons.push('Upstream dependencies have drifted');
  if (plan.readiness_status !== 'ready') blockingReasons.push('Source plan is not ready');

  return {
    run_id,
    plan_id: plan.scene_demo_id,
    all_passed: allPassed && !isStale,
    slot_validations: slotValidations,
    aggregate_score: aggregateScore,
    hard_fail_count: hardFailCount,
    advisory_count: advisoryCount,
    lock_eligible: allPassed && !isStale && blockingReasons.length === 0,
    blocking_reasons: blockingReasons,
    stale: isStale,
    stale_reasons: staleReasons,
    validation_version: SCENE_DEMO_VALIDATION_VERSION,
  };
}

// ── Run Status Types ────────────────────────────────────────────────────────

export type SceneDemoRunStatus =
  | 'queued'
  | 'running'
  | 'partial'
  | 'ready_for_review'
  | 'approved'
  | 'locked'
  | 'failed'
  | 'stale';

export const RUN_STATUS_ORDER: SceneDemoRunStatus[] = [
  'queued', 'running', 'partial', 'ready_for_review', 'approved', 'locked', 'failed', 'stale',
];

// ── Slot Approval Status ────────────────────────────────────────────────────

export type SlotApprovalStatus = 'pending' | 'approved' | 'rejected' | 'redo_requested';

// ── Approval Helpers ────────────────────────────────────────────────────────

/**
 * Check if a slot is safe to approve (passed validation, no hard fails).
 */
export function isSlotApprovable(validation: SceneDemoSlotValidation | null): boolean {
  if (!validation) return false;
  return validation.passed && validation.hard_fail_codes.length === 0;
}

/**
 * Check if all required slots are approved for auto-lock.
 */
export function checkRunLockEligibility(
  slotStatuses: Record<string, SlotApprovalStatus>,
  requiredSlotKeys: string[],
): { eligible: boolean; blocking_reasons: string[] } {
  const reasons: string[] = [];

  for (const key of requiredSlotKeys) {
    const status = slotStatuses[key];
    if (!status || status !== 'approved') {
      reasons.push(`Required slot "${key}" is ${status || 'missing'}`);
    }
  }

  return { eligible: reasons.length === 0, blocking_reasons: reasons };
}

/**
 * Detect stale run from dependency drift.
 */
export function detectRunStaleness(
  planSnapshot: SceneDemoPlan,
  currentLockedSetIds: Set<string>,
): { stale: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const deps = getSceneDemoPlanInputs(planSnapshot);

  for (const setId of deps.costume_look_set_ids) {
    if (!currentLockedSetIds.has(setId)) {
      reasons.push(`Costume set ${setId.slice(0, 8)} drifted`);
    }
  }
  if (deps.location_set_id && !currentLockedSetIds.has(deps.location_set_id)) {
    reasons.push(`Location set drifted`);
  }
  if (deps.atmosphere_set_id && !currentLockedSetIds.has(deps.atmosphere_set_id)) {
    reasons.push(`Atmosphere set drifted`);
  }

  return { stale: reasons.length > 0, reasons };
}

/**
 * Summarize validation for display.
 */
export function summarizeSlotValidation(validation: SceneDemoSlotValidation): string {
  const parts: string[] = [];
  parts.push(`Score: ${validation.overall_score}/100`);
  if (validation.hard_fail_codes.length > 0) {
    parts.push(`Hard fails: ${validation.hard_fail_codes.join(', ')}`);
  }
  if (validation.advisory_codes.length > 0) {
    parts.push(`Advisories: ${validation.advisory_codes.join(', ')}`);
  }
  return parts.join(' | ');
}
