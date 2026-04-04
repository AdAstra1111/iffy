/**
 * sceneDemoPlanner.test.ts — Tests for the Scene Demo Planning System.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveScenePurpose,
  resolveWardrobeStateForScenePurpose,
  validateSceneDemoReadiness,
  buildSceneDemoPlan,
  getSceneDemoPlanInputs,
  getLockedSceneDemoDependencies,
  summarizeSceneDemoPlans,
  SCENE_DEMO_PLANNER_VERSION,
  type SceneVersionInput,
  type CharacterBinding,
  type LockedLookSetRef,
  type LockedVisualSetRef,
  type SceneDemoPlan,
} from '../sceneDemoPlanner';
import type { WardrobeStateDefinition } from '../characterWardrobeExtractor';

// ── Fixtures ──

const WORK_STATE: WardrobeStateDefinition = {
  state_key: 'work',
  label: 'Work / Labor',
  rationale: 'Explicit',
  explicit_or_inferred: 'explicit',
  trigger_conditions: ['work', 'labor', 'craft', 'workshop'],
  garment_adjustments: ['practical'],
  fabric_adjustments: ['sturdy'],
  silhouette_adjustments: ['loose'],
  accessory_adjustments: ['apron'],
  grooming_adjustments: ['tied back'],
  continuity_notes: [],
};

const CEREMONIAL_STATE: WardrobeStateDefinition = {
  state_key: 'ceremonial',
  label: 'Ceremonial',
  rationale: 'Inferred',
  explicit_or_inferred: 'inferred',
  trigger_conditions: ['ceremony', 'ritual', 'wedding'],
  garment_adjustments: ['ceremonial'],
  fabric_adjustments: ['finest'],
  silhouette_adjustments: ['prescribed'],
  accessory_adjustments: ['ritual objects'],
  grooming_adjustments: ['formal'],
  continuity_notes: [],
};

const DOMESTIC_STATE: WardrobeStateDefinition = {
  state_key: 'domestic',
  label: 'Domestic / Private',
  rationale: 'Inferred',
  explicit_or_inferred: 'inferred',
  trigger_conditions: ['home', 'domestic', 'private', 'chamber'],
  garment_adjustments: ['informal'],
  fabric_adjustments: ['soft'],
  silhouette_adjustments: ['relaxed'],
  accessory_adjustments: ['minimal'],
  grooming_adjustments: ['natural'],
  continuity_notes: [],
};

const ALL_STATES = [WORK_STATE, CEREMONIAL_STATE, DOMESTIC_STATE];

function makeScene(overrides?: Partial<SceneVersionInput>): SceneVersionInput {
  return {
    scene_id: 'scene-1',
    scene_key: 'sc_001',
    slugline: 'INT. WORKSHOP - DAY',
    summary: 'Hana works at her kiln.',
    content: 'Hana shapes clay in the workshop. The morning light falls on her tools.',
    characters_present: ['Hana'],
    canon_location_id: 'loc-1',
    location: 'Workshop',
    time_of_day: 'day',
    purpose: null,
    ...overrides,
  };
}

const BINDING: CharacterBinding = {
  character_key: 'hana',
  actor_id: 'actor-1',
  actor_version_id: 'ver-1',
};

const LOCKED_LOOK: LockedLookSetRef = {
  character_key: 'hana',
  wardrobe_state_key: 'work',
  set_id: 'look-1',
  status: 'locked',
};

const LOCKED_LOCATION: LockedVisualSetRef = {
  domain: 'production_design_location',
  set_id: 'loc-set-1',
  target_name: 'Workshop',
  target_id: 'loc-1',
  status: 'locked',
};

const LOCKED_ATMOSPHERE: LockedVisualSetRef = {
  domain: 'production_design_atmosphere',
  set_id: 'atm-set-1',
  target_name: 'Workshop',
  target_id: 'loc-1',
  status: 'locked',
};

const LOCKED_MOTIF: LockedVisualSetRef = {
  domain: 'production_design_motif',
  set_id: 'motif-set-1',
  target_name: 'Clay Motif',
  target_id: null,
  status: 'locked',
};

// ── Purpose Resolution ──

describe('resolveScenePurpose', () => {
  it('returns explicit purpose when set', () => {
    const result = resolveScenePurpose(makeScene({ purpose: 'labor_process' }));
    expect(result.purpose).toBe('labor_process');
    expect(result.basis).toBe('explicit');
  });

  it('infers labor_process from workshop content', () => {
    const result = resolveScenePurpose(makeScene({ purpose: null }));
    expect(result.purpose).toBe('labor_process');
    expect(result.basis).toBe('inferred');
  });

  it('infers ritual_or_ceremony from ceremony content', () => {
    const result = resolveScenePurpose(makeScene({
      purpose: null,
      slugline: 'INT. TEMPLE - DAY',
      summary: 'The wedding ceremony begins at the temple.',
      content: 'Guests gather for the ritual offering.',
    }));
    expect(result.purpose).toBe('ritual_or_ceremony');
  });

  it('infers confrontation', () => {
    const result = resolveScenePurpose(makeScene({
      purpose: null,
      slugline: 'INT. HALL - NIGHT',
      summary: 'A tense confrontation between rivals.',
      content: 'She confronts him about the betrayal.',
    }));
    expect(result.purpose).toBe('confrontation');
  });

  it('defaults to character_identity_intro when characters present but no keyword match', () => {
    const result = resolveScenePurpose(makeScene({
      purpose: null,
      slugline: 'INT. ROOM - DAY',
      summary: 'A quiet moment.',
      content: 'Nothing specific.',
      characters_present: ['Hana'],
    }));
    expect(result.purpose).toBe('character_identity_intro');
    expect(result.basis).toBe('inferred');
  });

  it('defaults to environmental_storytelling when no characters', () => {
    const result = resolveScenePurpose(makeScene({
      purpose: null,
      slugline: 'EXT. HILL - DAWN',
      summary: 'A quiet moment.',
      content: 'Nothing specific.',
      characters_present: [],
    }));
    expect(result.purpose).toBe('environmental_storytelling');
  });
});

// ── Wardrobe State Resolution ──

describe('resolveWardrobeStateForScenePurpose', () => {
  it('maps labor_process → work state', () => {
    const result = resolveWardrobeStateForScenePurpose('labor_process', ALL_STATES);
    expect(result.state_key).toBe('work');
  });

  it('maps ritual_or_ceremony → ceremonial state', () => {
    const result = resolveWardrobeStateForScenePurpose('ritual_or_ceremony', ALL_STATES);
    expect(result.state_key).toBe('ceremonial');
  });

  it('falls back to first available when preferred missing', () => {
    const result = resolveWardrobeStateForScenePurpose('travel_transition', ALL_STATES);
    // travel not in ALL_STATES, falls back through order to 'work'
    expect(result.state_key).toBe('work');
    expect(result.basis).toBe('inferred');
  });

  it('resolves from scene text triggers', () => {
    const result = resolveWardrobeStateForScenePurpose(
      'character_identity_intro', // maps to core_default which isn't in ALL_STATES
      ALL_STATES,
      'She works in her workshop, shaping clay.',
    );
    expect(result.state_key).toBe('work');
    expect(result.basis).toBe('explicit');
  });

  it('returns core_default for empty state list', () => {
    const result = resolveWardrobeStateForScenePurpose('labor_process', []);
    expect(result.state_key).toBe('core_default');
    expect(result.basis).toBe('inferred');
  });
});

// ── Plan Builder ──

describe('buildSceneDemoPlan', () => {
  it('builds a ready plan with all locked deps', () => {
    const plan = buildSceneDemoPlan(
      makeScene(),
      [BINDING],
      [LOCKED_LOOK],
      [LOCKED_LOCATION, LOCKED_ATMOSPHERE, LOCKED_MOTIF],
      { hana: ALL_STATES },
    );
    expect(plan.readiness_status).toBe('ready');
    expect(plan.blocking_reasons).toHaveLength(0);
    expect(plan.characters).toHaveLength(1);
    expect(plan.characters[0].actor_id).toBe('actor-1');
    expect(plan.characters[0].wardrobe_state_key).toBe('work');
    expect(plan.characters[0].costume_look_locked).toBe(true);
    expect(plan.location_set_locked).toBe(true);
    expect(plan.atmosphere_set_locked).toBe(true);
    expect(plan.motif_set_ids).toHaveLength(1);
    expect(plan.version).toBe(SCENE_DEMO_PLANNER_VERSION);
  });

  it('blocks when actor binding missing', () => {
    const plan = buildSceneDemoPlan(
      makeScene(),
      [], // no bindings
      [LOCKED_LOOK],
      [LOCKED_LOCATION],
      { hana: ALL_STATES },
    );
    expect(plan.readiness_status).toBe('blocked');
    expect(plan.characters[0].blocking_reasons).toContain('No approved actor binding');
  });

  it('blocks when costume look missing', () => {
    const plan = buildSceneDemoPlan(
      makeScene(),
      [BINDING],
      [], // no looks
      [LOCKED_LOCATION],
      { hana: ALL_STATES },
    );
    expect(plan.readiness_status).toBe('blocked');
    expect(plan.characters[0].costume_look_set_id).toBeNull();
  });

  it('blocks when costume look not locked', () => {
    const plan = buildSceneDemoPlan(
      makeScene(),
      [BINDING],
      [{ ...LOCKED_LOOK, status: 'curating' }],
      [LOCKED_LOCATION],
      { hana: ALL_STATES },
    );
    expect(plan.readiness_status).toBe('blocked');
    expect(plan.characters[0].costume_look_locked).toBe(false);
  });

  it('marks partial when some characters ready and others blocked', () => {
    const plan = buildSceneDemoPlan(
      makeScene({ characters_present: ['Hana', 'Kenji'] }),
      [BINDING], // only Hana bound
      [LOCKED_LOOK],
      [LOCKED_LOCATION],
      { hana: ALL_STATES },
    );
    expect(plan.readiness_status).toBe('partial');
  });

  it('handles scene with no characters', () => {
    const plan = buildSceneDemoPlan(
      makeScene({ characters_present: [], slugline: 'EXT. HILL - DAWN', summary: 'Empty landscape at dawn.', content: 'Silence.' }),
      [],
      [],
      [LOCKED_LOCATION],
      {},
    );
    expect(plan.characters).toHaveLength(0);
    expect(plan.scene_purpose).toBe('environmental_storytelling');
    expect(plan.readiness_status).toBe('ready');
  });
});

// ── Readiness Validation ──

describe('validateSceneDemoReadiness', () => {
  it('returns ready for fully locked plan', () => {
    const plan = buildSceneDemoPlan(
      makeScene(),
      [BINDING],
      [LOCKED_LOOK],
      [LOCKED_LOCATION, LOCKED_ATMOSPHERE],
      { hana: ALL_STATES },
    );
    const result = validateSceneDemoReadiness(plan);
    expect(result.ready).toBe(true);
    expect(result.blocking_reasons).toHaveLength(0);
  });

  it('returns blocking reasons for missing actor', () => {
    const plan = buildSceneDemoPlan(makeScene(), [], [], [], {});
    const result = validateSceneDemoReadiness(plan);
    expect(result.ready).toBe(false);
    expect(result.blocking_reasons.length).toBeGreaterThan(0);
  });
});

// ── Seam Helpers ──

describe('getSceneDemoPlanInputs', () => {
  it('extracts actor and set IDs', () => {
    const plan = buildSceneDemoPlan(
      makeScene(),
      [BINDING],
      [LOCKED_LOOK],
      [LOCKED_LOCATION, LOCKED_MOTIF],
      { hana: ALL_STATES },
    );
    const inputs = getSceneDemoPlanInputs(plan);
    expect(inputs.actor_ids).toContain('actor-1');
    expect(inputs.costume_look_set_ids).toContain('look-1');
    expect(inputs.location_set_id).toBe('loc-set-1');
    expect(inputs.motif_set_ids).toHaveLength(1);
  });
});

describe('getLockedSceneDemoDependencies', () => {
  it('separates locked from unlocked', () => {
    const plan = buildSceneDemoPlan(
      makeScene(),
      [BINDING],
      [LOCKED_LOOK],
      [LOCKED_LOCATION, { ...LOCKED_ATMOSPHERE, status: 'curating' }],
      { hana: ALL_STATES },
    );
    const deps = getLockedSceneDemoDependencies(plan);
    expect(deps.locked.length).toBeGreaterThan(0);
    expect(deps.unlocked).toContain('atm-set-1');
  });
});

describe('summarizeSceneDemoPlans', () => {
  it('summarizes mixed plans', () => {
    const ready = buildSceneDemoPlan(
      makeScene(),
      [BINDING],
      [LOCKED_LOOK],
      [LOCKED_LOCATION],
      { hana: ALL_STATES },
    );
    const blocked = buildSceneDemoPlan(
      makeScene({ scene_id: 'scene-2', characters_present: ['Unknown'] }),
      [],
      [],
      [],
      {},
    );
    const summary = summarizeSceneDemoPlans([ready, blocked]);
    expect(summary.total).toBe(2);
    expect(summary.ready).toBe(1);
    expect(summary.blocked).toBe(1);
    expect(summary.unique_characters).toBeGreaterThanOrEqual(1);
  });
});

// ── Plan Shape ──

describe('plan serialization shape', () => {
  it('has stable shape', () => {
    const plan = buildSceneDemoPlan(
      makeScene(),
      [BINDING],
      [LOCKED_LOOK],
      [LOCKED_LOCATION],
      { hana: ALL_STATES },
    );
    expect(plan).toHaveProperty('scene_demo_id');
    expect(plan).toHaveProperty('scene_id');
    expect(plan).toHaveProperty('scene_purpose');
    expect(plan).toHaveProperty('purpose_basis');
    expect(plan).toHaveProperty('characters');
    expect(plan).toHaveProperty('location_set_id');
    expect(plan).toHaveProperty('atmosphere_set_id');
    expect(plan).toHaveProperty('motif_set_ids');
    expect(plan).toHaveProperty('readiness_status');
    expect(plan).toHaveProperty('blocking_reasons');
    expect(plan).toHaveProperty('version');

    const char = plan.characters[0];
    expect(char).toHaveProperty('character_key');
    expect(char).toHaveProperty('actor_id');
    expect(char).toHaveProperty('wardrobe_state_key');
    expect(char).toHaveProperty('wardrobe_state_label');
    expect(char).toHaveProperty('state_basis');
    expect(char).toHaveProperty('costume_look_set_id');
    expect(char).toHaveProperty('costume_look_locked');
    expect(char).toHaveProperty('blocking_reasons');
  });
});
