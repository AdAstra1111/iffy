/**
 * sceneDemoGenerator.ts — Canonical Scene Demo Generation System.
 *
 * Generates image sets ONLY from SceneDemoPlan records with readiness === 'ready'.
 * Consumes locked upstream dependencies exclusively.
 * No freeform generation. No bypass of planner.
 *
 * v1.0.0
 */

import type { SceneDemoPlan, CharacterDemoPlan, SceneDemoPurpose } from './sceneDemoPlanner';
import { validateSceneDemoReadiness, getSceneDemoPlanInputs } from './sceneDemoPlanner';

// ── Constants ───────────────────────────────────────────────────────────────

export const SCENE_DEMO_GENERATOR_VERSION = '1.0.0';

// ── Scene Demo Slot Definitions ─────────────────────────────────────────────

export interface SceneDemoSlotDef {
  key: string;
  label: string;
  required: boolean;
  shot_type: string;
  multi_character: boolean;
}

/**
 * Deterministic slot set for scene demo generation.
 * Adjusted by purpose if needed but kept canonical.
 */
export const SCENE_DEMO_SLOTS: SceneDemoSlotDef[] = [
  { key: 'establishing_wide', label: 'Establishing Wide', required: true, shot_type: 'wide', multi_character: true },
  { key: 'character_action', label: 'Character Action', required: true, shot_type: 'medium', multi_character: true },
  { key: 'emotional_beat', label: 'Emotional Beat', required: false, shot_type: 'close_up', multi_character: false },
  { key: 'environment_detail', label: 'Environment Detail', required: false, shot_type: 'detail', multi_character: false },
];

// ── Types ────────────────────────────────────────────────────────────────────

export interface SceneDemoGenerationInput {
  plan: SceneDemoPlan;
  projectId: string;
  /** Actor reference image URLs keyed by actor_id */
  actorReferenceUrls: Record<string, string[]>;
  /** Locked costume look image URLs keyed by set_id */
  costumeLookUrls: Record<string, string[]>;
  /** Locked location image URLs keyed by set_id */
  locationUrls: Record<string, string[]>;
  /** Locked atmosphere image URLs keyed by set_id */
  atmosphereUrls: Record<string, string[]>;
  /** World validation mode */
  worldMode: string;
  /** Canon context block */
  canonBlock: string;
  /** Negative prompt from canon */
  negativePrompt: string;
}

export interface SceneDemoSlotPrompt {
  slot_key: string;
  slot_label: string;
  prompt: string;
  negative_prompt: string;
  reference_image_urls: string[];
  generation_config: Record<string, unknown>;
}

export interface SceneDemoGenerationPlan {
  run_id: string;
  scene_id: string;
  plan_snapshot: SceneDemoPlan;
  slots: SceneDemoSlotPrompt[];
  readiness_verified: boolean;
  blocking_reasons: string[];
  version: string;
}

export interface ReadinessGateResult {
  passed: boolean;
  blocking_reasons: string[];
}

// ── Readiness Gate ──────────────────────────────────────────────────────────

/**
 * IEL gate: generation only proceeds if plan is ready AND all dependencies
 * remain locked at generation time.
 */
export function gateGenerationReadiness(
  plan: SceneDemoPlan,
  currentLockedSetIds?: Set<string>,
): ReadinessGateResult {
  const reasons: string[] = [];

  // 1. Plan must be ready
  if (plan.readiness_status !== 'ready') {
    reasons.push(`Plan readiness is "${plan.readiness_status}", not "ready"`);
    return { passed: false, blocking_reasons: reasons };
  }

  // 2. Re-validate
  const recheck = validateSceneDemoReadiness(plan);
  if (!recheck.ready) {
    reasons.push(...recheck.blocking_reasons);
  }

  // 3. If we have current locked set IDs, verify dependencies remain locked
  if (currentLockedSetIds) {
    const deps = getSceneDemoPlanInputs(plan);

    for (const setId of deps.costume_look_set_ids) {
      if (!currentLockedSetIds.has(setId)) {
        reasons.push(`Costume look set ${setId.slice(0, 8)} is no longer locked`);
      }
    }
    if (deps.location_set_id && !currentLockedSetIds.has(deps.location_set_id)) {
      reasons.push(`Location set ${deps.location_set_id.slice(0, 8)} is no longer locked`);
    }
    if (deps.atmosphere_set_id && !currentLockedSetIds.has(deps.atmosphere_set_id)) {
      reasons.push(`Atmosphere set ${deps.atmosphere_set_id.slice(0, 8)} is no longer locked`);
    }
  }

  return { passed: reasons.length === 0, blocking_reasons: reasons };
}

// ── Purpose-aware framing ───────────────────────────────────────────────────

const PURPOSE_FRAMING: Record<SceneDemoPurpose, string> = {
  character_identity_intro: 'character introduction moment, establishing personality and presence',
  labor_process: 'at work, engaged in labor or craft, showing process and skill',
  ritual_or_ceremony: 'ceremonial or ritual context, formal and significant',
  intimacy_or_private_moment: 'private intimate moment, tender and personal',
  public_formality: 'public formal setting, composed and social',
  travel_transition: 'in transit, journeying, movement and passage',
  distress_aftermath: 'aftermath of conflict or distress, emotional weight',
  confrontation: 'confrontation, tension between characters, dramatic stakes',
  environmental_storytelling: 'environment tells the story, atmospheric and spatial',
  motif_insert: 'symbolic detail, motif or recurring visual element',
  class_status_display: 'class and status visible through costume and setting',
};

// ── Prompt Builder ──────────────────────────────────────────────────────────

function buildCharacterBlock(chars: CharacterDemoPlan[]): string {
  if (chars.length === 0) return '';
  return chars.map(c => {
    const parts = [c.character_key];
    parts.push(`in ${c.wardrobe_state_label} state`);
    if (c.costume_look_locked) parts.push('(costume locked)');
    return parts.join(' ');
  }).join('; ');
}

function buildSlotPrompt(
  slot: SceneDemoSlotDef,
  input: SceneDemoGenerationInput,
): SceneDemoSlotPrompt {
  const { plan, canonBlock, negativePrompt } = input;
  const purposeFrame = PURPOSE_FRAMING[plan.scene_purpose] || '';

  const promptParts: string[] = [];

  // Slot framing
  switch (slot.key) {
    case 'establishing_wide':
      promptParts.push('Wide establishing shot');
      break;
    case 'character_action':
      promptParts.push('Medium shot, character action');
      break;
    case 'emotional_beat':
      promptParts.push('Close-up emotional beat');
      break;
    case 'environment_detail':
      promptParts.push('Detail shot of environment');
      break;
    default:
      promptParts.push('Scene reference shot');
  }

  // Purpose
  if (purposeFrame) promptParts.push(purposeFrame);

  // Scene context
  if (plan.slugline) promptParts.push(plan.slugline);

  // Characters (for character-relevant slots)
  const charBlock = buildCharacterBlock(plan.characters);
  if (charBlock && (slot.multi_character || slot.key === 'emotional_beat')) {
    promptParts.push(charBlock);
  }

  // Cinematic quality
  promptParts.push('cinematic lighting, production still quality, natural composition');
  promptParts.push('[NO CHARACTER DROPOUT]');

  // Canon constraints
  if (canonBlock) promptParts.push(canonBlock);

  // Collect reference images
  const refUrls: string[] = [];
  for (const char of plan.characters) {
    // Actor references
    const actorRefs = input.actorReferenceUrls[char.actor_id] || [];
    refUrls.push(...actorRefs);
    // Costume look references
    if (char.costume_look_set_id) {
      const costumeRefs = input.costumeLookUrls[char.costume_look_set_id] || [];
      refUrls.push(...costumeRefs);
    }
  }
  // Location references
  if (plan.location_set_id) {
    refUrls.push(...(input.locationUrls[plan.location_set_id] || []));
  }
  // Atmosphere references
  if (plan.atmosphere_set_id) {
    refUrls.push(...(input.atmosphereUrls[plan.atmosphere_set_id] || []));
  }

  const config: Record<string, unknown> = {
    generator_version: SCENE_DEMO_GENERATOR_VERSION,
    scene_id: plan.scene_id,
    scene_purpose: plan.scene_purpose,
    slot_key: slot.key,
    shot_type: slot.shot_type,
    character_keys: plan.characters.map(c => c.character_key),
    actor_ids: plan.characters.map(c => c.actor_id),
    costume_look_set_ids: plan.characters.map(c => c.costume_look_set_id).filter(Boolean),
    location_set_id: plan.location_set_id,
    atmosphere_set_id: plan.atmosphere_set_id,
    world_mode: input.worldMode,
    reference_count: refUrls.length,
  };

  return {
    slot_key: slot.key,
    slot_label: slot.label,
    prompt: promptParts.filter(Boolean).join('. '),
    negative_prompt: [negativePrompt, 'empty scene without characters', 'wrong costume'].filter(Boolean).join(', '),
    reference_image_urls: refUrls.slice(0, 8), // Limit refs
    generation_config: config,
  };
}

/**
 * Build the full generation plan from a ready SceneDemoPlan.
 * Fails closed if readiness gate doesn't pass.
 */
export function buildSceneDemoGenerationPlan(
  input: SceneDemoGenerationInput,
  runId: string,
  currentLockedSetIds?: Set<string>,
): SceneDemoGenerationPlan {
  const gate = gateGenerationReadiness(input.plan, currentLockedSetIds);

  if (!gate.passed) {
    return {
      run_id: runId,
      scene_id: input.plan.scene_id,
      plan_snapshot: input.plan,
      slots: [],
      readiness_verified: false,
      blocking_reasons: gate.blocking_reasons,
      version: SCENE_DEMO_GENERATOR_VERSION,
    };
  }

  const slots = SCENE_DEMO_SLOTS.map(slot => buildSlotPrompt(slot, input));

  return {
    run_id: runId,
    scene_id: input.plan.scene_id,
    plan_snapshot: input.plan,
    slots,
    readiness_verified: true,
    blocking_reasons: [],
    version: SCENE_DEMO_GENERATOR_VERSION,
  };
}

// ── Seam Helpers ────────────────────────────────────────────────────────────

/**
 * Get the slot definitions for scene demo generation.
 */
export function getSceneDemoSlots(): SceneDemoSlotDef[] {
  return [...SCENE_DEMO_SLOTS];
}

/**
 * Summarize a generation plan for display.
 */
export function summarizeGenerationPlan(plan: SceneDemoGenerationPlan): {
  ready: boolean;
  slot_count: number;
  character_count: number;
  has_location: boolean;
  has_atmosphere: boolean;
  blocking_reasons: string[];
} {
  return {
    ready: plan.readiness_verified,
    slot_count: plan.slots.length,
    character_count: plan.plan_snapshot.characters.length,
    has_location: !!plan.plan_snapshot.location_set_id,
    has_atmosphere: !!plan.plan_snapshot.atmosphere_set_id,
    blocking_reasons: plan.blocking_reasons,
  };
}
