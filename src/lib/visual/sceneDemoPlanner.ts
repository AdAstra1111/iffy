/**
 * sceneDemoPlanner.ts — Canonical Scene Demo Planning System.
 *
 * Deterministic planning layer that assembles locked upstream truth
 * (actor bindings, costume looks, locations, atmosphere, motifs)
 * into reviewable scene demo plans — NO image generation.
 *
 * v1.0.0
 */

import type { WardrobeStateDefinition } from './characterWardrobeExtractor';

// ── Constants ───────────────────────────────────────────────────────────────

export const SCENE_DEMO_PLANNER_VERSION = '1.0.0';

// ── Scene Purpose Types ─────────────────────────────────────────────────────

export type SceneDemoPurpose =
  | 'character_identity_intro'
  | 'labor_process'
  | 'ritual_or_ceremony'
  | 'intimacy_or_private_moment'
  | 'public_formality'
  | 'travel_transition'
  | 'distress_aftermath'
  | 'confrontation'
  | 'environmental_storytelling'
  | 'motif_insert'
  | 'class_status_display';

export const SCENE_DEMO_PURPOSES: { key: SceneDemoPurpose; label: string }[] = [
  { key: 'character_identity_intro', label: 'Character Identity Introduction' },
  { key: 'labor_process', label: 'Labor / Work Process' },
  { key: 'ritual_or_ceremony', label: 'Ritual or Ceremony' },
  { key: 'intimacy_or_private_moment', label: 'Intimacy / Private Moment' },
  { key: 'public_formality', label: 'Public Formality' },
  { key: 'travel_transition', label: 'Travel / Transition' },
  { key: 'distress_aftermath', label: 'Distress / Aftermath' },
  { key: 'confrontation', label: 'Confrontation' },
  { key: 'environmental_storytelling', label: 'Environmental Storytelling' },
  { key: 'motif_insert', label: 'Motif Insert' },
  { key: 'class_status_display', label: 'Class / Status Display' },
];

// ── Wardrobe State → Purpose Mapping ────────────────────────────────────────

/** Deterministic mapping from scene purpose to preferred wardrobe state key.
 *  Used when scene doesn't explicitly specify a state. */
const PURPOSE_TO_STATE: Record<SceneDemoPurpose, string> = {
  character_identity_intro: 'core_default',
  labor_process: 'work',
  ritual_or_ceremony: 'ceremonial',
  intimacy_or_private_moment: 'intimate_private',
  public_formality: 'public_formal',
  travel_transition: 'travel',
  distress_aftermath: 'distress_aftermath',
  confrontation: 'core_default',
  environmental_storytelling: 'core_default',
  motif_insert: 'core_default',
  class_status_display: 'public_formal',
};

/** Fallback ordering if preferred state unavailable */
const STATE_FALLBACK_ORDER = [
  'core_default', 'work', 'domestic', 'public_formal',
  'ceremonial', 'travel', 'intimate_private',
  'distress_aftermath', 'disguise_concealment', 'weather_adapted', 'night_rest',
];

// ── Input / Output Types ────────────────────────────────────────────────────

export interface SceneVersionInput {
  scene_id: string;
  scene_key: string | null;
  slugline: string | null;
  summary: string | null;
  content: string;
  characters_present: string[];
  canon_location_id: string | null;
  location: string | null;
  time_of_day: string | null;
  purpose: string | null;
}

export interface CharacterBinding {
  character_key: string;
  actor_id: string;
  actor_version_id: string;
}

export interface LockedLookSetRef {
  character_key: string;
  wardrobe_state_key: string;
  set_id: string;
  status: string;
}

export interface LockedVisualSetRef {
  domain: string;
  set_id: string;
  target_name: string;
  target_id: string | null;
  status: string;
}

export interface CharacterDemoPlan {
  character_key: string;
  actor_id: string;
  actor_version_id: string;
  wardrobe_state_key: string;
  wardrobe_state_label: string;
  state_basis: 'explicit' | 'inferred';
  costume_look_set_id: string | null;
  costume_look_locked: boolean;
  blocking_reasons: string[];
}

export interface SceneDemoPlan {
  scene_demo_id: string;
  scene_id: string;
  scene_key: string | null;
  slugline: string | null;
  scene_purpose: SceneDemoPurpose;
  purpose_basis: 'explicit' | 'inferred';
  characters: CharacterDemoPlan[];
  location_set_id: string | null;
  location_set_locked: boolean;
  atmosphere_set_id: string | null;
  atmosphere_set_locked: boolean;
  motif_set_ids: string[];
  planning_rationale: string;
  readiness_status: 'ready' | 'blocked' | 'partial';
  blocking_reasons: string[];
  version: string;
}

// ── Purpose Resolution ──────────────────────────────────────────────────────

const PURPOSE_KEYWORDS: Record<SceneDemoPurpose, RegExp> = {
  character_identity_intro: /\b(introduction|introduce|first\s*appear|establish|meet|arrival)\b/i,
  labor_process: /\b(work|labor|craft|forge|kiln|loom|workshop|studio|garden|farm|field)\b/i,
  ritual_or_ceremony: /\b(ceremony|ritual|wedding|funeral|coronation|festival|procession|offering|blessing|prayer)\b/i,
  intimacy_or_private_moment: /\b(intimate|lover|embrace|private|tender|kiss|bed|chamber|alone\s*together)\b/i,
  public_formality: /\b(court|audience|formal|public|reception|banquet|feast|official|presentation)\b/i,
  travel_transition: /\b(travel|journey|road|ride|riding|departure|arrival|march|passage|flee|escape)\b/i,
  distress_aftermath: /\b(wound|blood|torn|injured|attack|aftermath|disaster|battle|grief|shock|destruction)\b/i,
  confrontation: /\b(confront|argument|fight|clash|duel|standoff|threaten|accuse|betray|demand)/i,
  environmental_storytelling: /\b(empty\s*room|landscape|dawn|sunset|ruin|abandoned|silence|nature|weather|storm)\b/i,
  motif_insert: /\b(motif|symbol|recurring|object|talisman|keepsake|token|emblem)\b/i,
  class_status_display: /\b(wealth|poverty|class|status|hierarchy|power|display|contrast|inequality)\b/i,
};

/**
 * Resolve scene purpose from scene metadata.
 */
export function resolveScenePurpose(
  scene: SceneVersionInput,
): { purpose: SceneDemoPurpose; basis: 'explicit' | 'inferred' } {
  // 1. Check explicit purpose field
  if (scene.purpose) {
    const explicit = SCENE_DEMO_PURPOSES.find(p => p.key === scene.purpose);
    if (explicit) return { purpose: explicit.key, basis: 'explicit' };
  }

  // 2. Infer from content/summary/slugline
  const text = [scene.summary, scene.content, scene.slugline].filter(Boolean).join(' ');

  // Score each purpose by keyword hits — deterministic priority by array order
  for (const p of SCENE_DEMO_PURPOSES) {
    const re = PURPOSE_KEYWORDS[p.key];
    if (re.test(text)) {
      return { purpose: p.key, basis: 'inferred' };
    }
  }

  // 3. Default: character_identity_intro for character scenes, environmental for others
  if (scene.characters_present.length > 0) {
    return { purpose: 'character_identity_intro', basis: 'inferred' };
  }
  return { purpose: 'environmental_storytelling', basis: 'inferred' };
}

// ── Wardrobe State Resolution ───────────────────────────────────────────────

/**
 * Resolve wardrobe state for a character in a scene demo.
 * Uses purpose mapping + available states from wardrobe matrix.
 */
export function resolveWardrobeStateForScenePurpose(
  purpose: SceneDemoPurpose,
  availableStates: WardrobeStateDefinition[],
  sceneText?: string,
): { state_key: string; label: string; basis: 'explicit' | 'inferred' } {
  const stateKeys = new Set(availableStates.map(s => s.state_key));

  // 1. Try direct purpose → state mapping
  const preferred = PURPOSE_TO_STATE[purpose];
  if (stateKeys.has(preferred)) {
    const found = availableStates.find(s => s.state_key === preferred)!;
    return { state_key: preferred, label: found.label, basis: 'inferred' };
  }

  // 2. Check scene text for explicit state triggers
  if (sceneText) {
    for (const state of availableStates) {
      // Use the state's trigger conditions to check scene text
      const triggers = state.trigger_conditions || [];
      for (const trigger of triggers) {
        if (sceneText.toLowerCase().includes(trigger.toLowerCase())) {
          return { state_key: state.state_key, label: state.label, basis: 'explicit' };
        }
      }
    }
  }

  // 3. Deterministic fallback order
  for (const fallback of STATE_FALLBACK_ORDER) {
    if (stateKeys.has(fallback)) {
      const found = availableStates.find(s => s.state_key === fallback)!;
      return { state_key: fallback, label: found.label, basis: 'inferred' };
    }
  }

  // 4. First available
  if (availableStates.length > 0) {
    const first = availableStates[0];
    return { state_key: first.state_key, label: first.label, basis: 'inferred' };
  }

  return { state_key: 'core_default', label: 'Core Default', basis: 'inferred' };
}

// ── Readiness Validation ────────────────────────────────────────────────────

/**
 * Validate whether a scene demo plan is ready for generation.
 */
export function validateSceneDemoReadiness(plan: SceneDemoPlan): {
  ready: boolean;
  blocking_reasons: string[];
} {
  const reasons: string[] = [];

  // Character checks
  for (const char of plan.characters) {
    if (!char.actor_id) {
      reasons.push(`${char.character_key}: no approved actor binding`);
    }
    if (!char.costume_look_set_id) {
      reasons.push(`${char.character_key}: no costume look set for state "${char.wardrobe_state_key}"`);
    } else if (!char.costume_look_locked) {
      reasons.push(`${char.character_key}: costume look set not locked for state "${char.wardrobe_state_key}"`);
    }
    reasons.push(...char.blocking_reasons);
  }

  // Location check (only if scene has a location)
  if (plan.location_set_id && !plan.location_set_locked) {
    reasons.push('Location set exists but is not locked');
  }

  // Atmosphere check
  if (plan.atmosphere_set_id && !plan.atmosphere_set_locked) {
    reasons.push('Atmosphere set exists but is not locked');
  }

  return { ready: reasons.length === 0, blocking_reasons: reasons };
}

// ── Plan Builder ────────────────────────────────────────────────────────────

let planIdCounter = 0;

function generatePlanId(sceneId: string): string {
  planIdCounter += 1;
  return `sdp_${sceneId.slice(0, 8)}_${planIdCounter}`;
}

/**
 * Build a scene demo plan from scene data + locked dependencies.
 */
export function buildSceneDemoPlan(
  scene: SceneVersionInput,
  bindings: CharacterBinding[],
  lockedLooks: LockedLookSetRef[],
  lockedSets: LockedVisualSetRef[],
  wardrobeStates: Record<string, WardrobeStateDefinition[]>,
): SceneDemoPlan {
  const { purpose, basis: purposeBasis } = resolveScenePurpose(scene);

  // Resolve character plans
  const sceneText = [scene.summary, scene.content].filter(Boolean).join(' ');
  const normalizeKey = (k: string) => k.toLowerCase().trim().replace(/\s+/g, ' ');

  const characters: CharacterDemoPlan[] = scene.characters_present.map(charName => {
    const charKey = normalizeKey(charName);
    const binding = bindings.find(b => normalizeKey(b.character_key) === charKey);
    const charBlockers: string[] = [];

    if (!binding) {
      charBlockers.push('No approved actor binding');
      return {
        character_key: charKey,
        actor_id: '',
        actor_version_id: '',
        wardrobe_state_key: 'core_default',
        wardrobe_state_label: 'Core Default',
        state_basis: 'inferred' as const,
        costume_look_set_id: null,
        costume_look_locked: false,
        blocking_reasons: charBlockers,
      };
    }

    // Resolve wardrobe state
    const charStates = wardrobeStates[charKey] || [];
    const resolved = resolveWardrobeStateForScenePurpose(purpose, charStates, sceneText);

    // Find locked costume look
    const look = lockedLooks.find(
      l => normalizeKey(l.character_key) === charKey && l.wardrobe_state_key === resolved.state_key
    );

    if (!look) {
      charBlockers.push(`No costume look set for state "${resolved.state_key}"`);
    } else if (look.status !== 'locked') {
      charBlockers.push(`Costume look set not locked (status: ${look.status})`);
    }

    return {
      character_key: charKey,
      actor_id: binding.actor_id,
      actor_version_id: binding.actor_version_id,
      wardrobe_state_key: resolved.state_key,
      wardrobe_state_label: resolved.label,
      state_basis: resolved.basis,
      costume_look_set_id: look?.set_id || null,
      costume_look_locked: look?.status === 'locked',
      blocking_reasons: charBlockers,
    };
  });

  // Resolve location set
  const locationSet = scene.canon_location_id
    ? lockedSets.find(
        s => s.domain === 'production_design_location' && s.target_id === scene.canon_location_id
      )
    : null;

  // Resolve atmosphere set
  const atmosphereSet = scene.canon_location_id
    ? lockedSets.find(
        s => s.domain === 'production_design_atmosphere' && s.target_id === scene.canon_location_id
      )
    : null;

  // Resolve motif sets (project-level, not location-specific)
  const motifSets = lockedSets
    .filter(s => s.domain === 'production_design_motif' && s.status === 'locked')
    .map(s => s.set_id);

  // Aggregate blocking
  const allBlockers: string[] = [];
  for (const c of characters) {
    allBlockers.push(...c.blocking_reasons);
  }
  if (locationSet && locationSet.status !== 'locked') {
    allBlockers.push('Location set not locked');
  }
  if (atmosphereSet && atmosphereSet.status !== 'locked') {
    allBlockers.push('Atmosphere set not locked');
  }

  const readiness: 'ready' | 'blocked' | 'partial' =
    allBlockers.length === 0 ? 'ready' :
    characters.some(c => c.blocking_reasons.length === 0) ? 'partial' : 'blocked';

  const rationaleFragments: string[] = [
    `Purpose: ${purpose} (${purposeBasis})`,
    `Characters: ${characters.length}`,
    locationSet ? `Location: ${locationSet.target_name}` : 'No bound location',
  ];

  return {
    scene_demo_id: generatePlanId(scene.scene_id),
    scene_id: scene.scene_id,
    scene_key: scene.scene_key,
    slugline: scene.slugline,
    scene_purpose: purpose,
    purpose_basis: purposeBasis,
    characters,
    location_set_id: locationSet?.set_id || null,
    location_set_locked: locationSet?.status === 'locked' || false,
    atmosphere_set_id: atmosphereSet?.set_id || null,
    atmosphere_set_locked: atmosphereSet?.status === 'locked' || false,
    motif_set_ids: motifSets,
    planning_rationale: rationaleFragments.join('. '),
    readiness_status: readiness,
    blocking_reasons: allBlockers,
    version: SCENE_DEMO_PLANNER_VERSION,
  };
}

// ── Seam Helpers ────────────────────────────────────────────────────────────

/**
 * Get all inputs needed for a scene demo plan.
 */
export function getSceneDemoPlanInputs(plan: SceneDemoPlan): {
  actor_ids: string[];
  costume_look_set_ids: string[];
  location_set_id: string | null;
  atmosphere_set_id: string | null;
  motif_set_ids: string[];
} {
  return {
    actor_ids: plan.characters.map(c => c.actor_id).filter(Boolean),
    costume_look_set_ids: plan.characters
      .map(c => c.costume_look_set_id)
      .filter((id): id is string => id !== null),
    location_set_id: plan.location_set_id,
    atmosphere_set_id: plan.atmosphere_set_id,
    motif_set_ids: plan.motif_set_ids,
  };
}

/**
 * Get locked dependency IDs for a plan.
 */
export function getLockedSceneDemoDependencies(plan: SceneDemoPlan): {
  locked: string[];
  unlocked: string[];
} {
  const locked: string[] = [];
  const unlocked: string[] = [];

  for (const c of plan.characters) {
    if (c.costume_look_set_id) {
      (c.costume_look_locked ? locked : unlocked).push(c.costume_look_set_id);
    }
  }
  if (plan.location_set_id) {
    (plan.location_set_locked ? locked : unlocked).push(plan.location_set_id);
  }
  if (plan.atmosphere_set_id) {
    (plan.atmosphere_set_locked ? locked : unlocked).push(plan.atmosphere_set_id);
  }
  locked.push(...plan.motif_set_ids);

  return { locked, unlocked };
}

/**
 * Summarize a set of plans for overview display.
 */
export function summarizeSceneDemoPlans(plans: SceneDemoPlan[]): {
  total: number;
  ready: number;
  blocked: number;
  partial: number;
  unique_characters: number;
  unique_purposes: number;
  all_blocking_reasons: string[];
} {
  const ready = plans.filter(p => p.readiness_status === 'ready').length;
  const blocked = plans.filter(p => p.readiness_status === 'blocked').length;
  const partial = plans.filter(p => p.readiness_status === 'partial').length;
  const chars = new Set(plans.flatMap(p => p.characters.map(c => c.character_key)));
  const purposes = new Set(plans.map(p => p.scene_purpose));
  const reasons = [...new Set(plans.flatMap(p => p.blocking_reasons))];

  return {
    total: plans.length,
    ready,
    blocked,
    partial,
    unique_characters: chars.size,
    unique_purposes: purposes.size,
    all_blocking_reasons: reasons,
  };
}
