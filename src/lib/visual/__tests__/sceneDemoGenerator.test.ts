/**
 * sceneDemoGenerator.test.ts — Tests for Scene Demo Generation System.
 */

import { describe, it, expect } from 'vitest';
import {
  gateGenerationReadiness,
  buildSceneDemoGenerationPlan,
  getSceneDemoSlots,
  summarizeGenerationPlan,
  SCENE_DEMO_SLOTS,
  SCENE_DEMO_GENERATOR_VERSION,
  type SceneDemoGenerationInput,
} from '../sceneDemoGenerator';
import type { SceneDemoPlan } from '../sceneDemoPlanner';

// ── Fixtures ──

function makeReadyPlan(overrides: Partial<SceneDemoPlan> = {}): SceneDemoPlan {
  return {
    scene_demo_id: 'sdp_test_1',
    scene_id: 'scene-001',
    scene_key: 'sc_01',
    slugline: 'INT. WORKSHOP - DAY',
    scene_purpose: 'labor_process',
    purpose_basis: 'inferred',
    characters: [
      {
        character_key: 'thomas',
        actor_id: 'actor-001',
        actor_version_id: 'av-001',
        wardrobe_state_key: 'work',
        wardrobe_state_label: 'Work / Labor',
        state_basis: 'inferred',
        costume_look_set_id: 'cls-001',
        costume_look_locked: true,
        blocking_reasons: [],
      },
    ],
    location_set_id: 'loc-001',
    location_set_locked: true,
    atmosphere_set_id: 'atm-001',
    atmosphere_set_locked: true,
    motif_set_ids: ['mot-001'],
    planning_rationale: 'Test plan',
    readiness_status: 'ready',
    blocking_reasons: [],
    version: '1.0.0',
    ...overrides,
  };
}

function makeInput(plan: SceneDemoPlan): SceneDemoGenerationInput {
  return {
    plan,
    projectId: 'proj-001',
    actorReferenceUrls: { 'actor-001': ['https://example.com/actor.png'] },
    costumeLookUrls: { 'cls-001': ['https://example.com/costume.png'] },
    locationUrls: { 'loc-001': ['https://example.com/location.png'] },
    atmosphereUrls: { 'atm-001': ['https://example.com/atmosphere.png'] },
    worldMode: 'grounded_period',
    canonBlock: '[CANON CONSTRAINTS]',
    negativePrompt: 'blurry, low quality',
  };
}

// ── Tests ──

describe('gateGenerationReadiness', () => {
  it('passes for a ready plan', () => {
    const plan = makeReadyPlan();
    const result = gateGenerationReadiness(plan);
    expect(result.passed).toBe(true);
    expect(result.blocking_reasons).toEqual([]);
  });

  it('fails for a blocked plan', () => {
    const plan = makeReadyPlan({ readiness_status: 'blocked' });
    const result = gateGenerationReadiness(plan);
    expect(result.passed).toBe(false);
    expect(result.blocking_reasons[0]).toContain('not "ready"');
  });

  it('fails for a partial plan', () => {
    const plan = makeReadyPlan({ readiness_status: 'partial' });
    const result = gateGenerationReadiness(plan);
    expect(result.passed).toBe(false);
  });

  it('fails when locked set IDs are provided but dependency missing', () => {
    const plan = makeReadyPlan();
    const lockedIds = new Set(['loc-001', 'atm-001']); // Missing cls-001
    const result = gateGenerationReadiness(plan, lockedIds);
    expect(result.passed).toBe(false);
    expect(result.blocking_reasons.some(r => r.includes('no longer locked'))).toBe(true);
  });

  it('passes when all locked set IDs present', () => {
    const plan = makeReadyPlan();
    const lockedIds = new Set(['cls-001', 'loc-001', 'atm-001']);
    const result = gateGenerationReadiness(plan, lockedIds);
    expect(result.passed).toBe(true);
  });

  it('fails when character has no actor binding', () => {
    const plan = makeReadyPlan();
    plan.characters[0].actor_id = '';
    const result = gateGenerationReadiness(plan);
    expect(result.passed).toBe(false);
  });

  it('fails when costume look not locked', () => {
    const plan = makeReadyPlan();
    plan.characters[0].costume_look_locked = false;
    plan.characters[0].blocking_reasons = ['Costume not locked'];
    const result = gateGenerationReadiness(plan);
    expect(result.passed).toBe(false);
  });
});

describe('buildSceneDemoGenerationPlan', () => {
  it('produces slots for a ready plan', () => {
    const plan = makeReadyPlan();
    const input = makeInput(plan);
    const result = buildSceneDemoGenerationPlan(input, 'run-001');
    expect(result.readiness_verified).toBe(true);
    expect(result.slots.length).toBe(SCENE_DEMO_SLOTS.length);
    expect(result.blocking_reasons).toEqual([]);
    expect(result.version).toBe(SCENE_DEMO_GENERATOR_VERSION);
  });

  it('produces zero slots for a blocked plan', () => {
    const plan = makeReadyPlan({ readiness_status: 'blocked' });
    const input = makeInput(plan);
    const result = buildSceneDemoGenerationPlan(input, 'run-001');
    expect(result.readiness_verified).toBe(false);
    expect(result.slots.length).toBe(0);
    expect(result.blocking_reasons.length).toBeGreaterThan(0);
  });

  it('includes character info in prompts', () => {
    const plan = makeReadyPlan();
    const input = makeInput(plan);
    const result = buildSceneDemoGenerationPlan(input, 'run-001');
    const actionSlot = result.slots.find(s => s.slot_key === 'character_action');
    expect(actionSlot?.prompt).toContain('thomas');
    expect(actionSlot?.prompt).toContain('Work / Labor');
  });

  it('includes reference image URLs', () => {
    const plan = makeReadyPlan();
    const input = makeInput(plan);
    const result = buildSceneDemoGenerationPlan(input, 'run-001');
    const wide = result.slots.find(s => s.slot_key === 'establishing_wide');
    expect(wide?.reference_image_urls.length).toBeGreaterThan(0);
    expect(wide?.reference_image_urls).toContain('https://example.com/actor.png');
    expect(wide?.reference_image_urls).toContain('https://example.com/location.png');
  });

  it('includes canon block in prompts', () => {
    const plan = makeReadyPlan();
    const input = makeInput(plan);
    const result = buildSceneDemoGenerationPlan(input, 'run-001');
    expect(result.slots[0].prompt).toContain('[CANON CONSTRAINTS]');
  });

  it('includes negative prompt', () => {
    const plan = makeReadyPlan();
    const input = makeInput(plan);
    const result = buildSceneDemoGenerationPlan(input, 'run-001');
    expect(result.slots[0].negative_prompt).toContain('blurry');
    expect(result.slots[0].negative_prompt).toContain('wrong costume');
  });

  it('includes slugline in prompts', () => {
    const plan = makeReadyPlan();
    const input = makeInput(plan);
    const result = buildSceneDemoGenerationPlan(input, 'run-001');
    expect(result.slots[0].prompt).toContain('INT. WORKSHOP - DAY');
  });

  it('includes purpose framing in prompts', () => {
    const plan = makeReadyPlan({ scene_purpose: 'ritual_or_ceremony' });
    const input = makeInput(plan);
    const result = buildSceneDemoGenerationPlan(input, 'run-001');
    expect(result.slots[0].prompt).toContain('ceremonial');
  });

  it('includes generation_config with metadata', () => {
    const plan = makeReadyPlan();
    const input = makeInput(plan);
    const result = buildSceneDemoGenerationPlan(input, 'run-001');
    const config = result.slots[0].generation_config;
    expect(config.generator_version).toBe(SCENE_DEMO_GENERATOR_VERSION);
    expect(config.scene_id).toBe('scene-001');
    expect(config.scene_purpose).toBe('labor_process');
    expect(config.slot_key).toBe('establishing_wide');
  });

  it('respects locked set verification', () => {
    const plan = makeReadyPlan();
    const input = makeInput(plan);
    const lockedIds = new Set(['cls-001', 'loc-001', 'atm-001']);
    const result = buildSceneDemoGenerationPlan(input, 'run-001', lockedIds);
    expect(result.readiness_verified).toBe(true);
  });

  it('fails with locked set verification when dependency unlocked', () => {
    const plan = makeReadyPlan();
    const input = makeInput(plan);
    const lockedIds = new Set(['loc-001']); // Missing cls-001, atm-001
    const result = buildSceneDemoGenerationPlan(input, 'run-001', lockedIds);
    expect(result.readiness_verified).toBe(false);
    expect(result.slots.length).toBe(0);
  });

  it('handles multi-character plans', () => {
    const plan = makeReadyPlan();
    plan.characters.push({
      character_key: 'elena',
      actor_id: 'actor-002',
      actor_version_id: 'av-002',
      wardrobe_state_key: 'domestic',
      wardrobe_state_label: 'Domestic',
      state_basis: 'inferred',
      costume_look_set_id: 'cls-002',
      costume_look_locked: true,
      blocking_reasons: [],
    });
    const input = makeInput(plan);
    input.actorReferenceUrls['actor-002'] = ['https://example.com/actor2.png'];
    input.costumeLookUrls['cls-002'] = ['https://example.com/costume2.png'];
    const result = buildSceneDemoGenerationPlan(input, 'run-001');
    expect(result.readiness_verified).toBe(true);
    const charSlot = result.slots.find(s => s.slot_key === 'character_action');
    expect(charSlot?.prompt).toContain('thomas');
    expect(charSlot?.prompt).toContain('elena');
  });
});

describe('getSceneDemoSlots', () => {
  it('returns canonical slot definitions', () => {
    const slots = getSceneDemoSlots();
    expect(slots.length).toBe(4);
    expect(slots[0].key).toBe('establishing_wide');
    expect(slots.find(s => s.required)?.key).toBe('establishing_wide');
  });
});

describe('summarizeGenerationPlan', () => {
  it('summarizes a ready plan', () => {
    const plan = makeReadyPlan();
    const input = makeInput(plan);
    const genPlan = buildSceneDemoGenerationPlan(input, 'run-001');
    const summary = summarizeGenerationPlan(genPlan);
    expect(summary.ready).toBe(true);
    expect(summary.slot_count).toBe(4);
    expect(summary.character_count).toBe(1);
    expect(summary.has_location).toBe(true);
    expect(summary.has_atmosphere).toBe(true);
  });

  it('summarizes a blocked plan', () => {
    const plan = makeReadyPlan({ readiness_status: 'blocked' });
    const input = makeInput(plan);
    const genPlan = buildSceneDemoGenerationPlan(input, 'run-001');
    const summary = summarizeGenerationPlan(genPlan);
    expect(summary.ready).toBe(false);
    expect(summary.slot_count).toBe(0);
    expect(summary.blocking_reasons.length).toBeGreaterThan(0);
  });
});

describe('[NO CHARACTER DROPOUT] constraint', () => {
  it('includes dropout prevention in all character-relevant slots', () => {
    const plan = makeReadyPlan();
    const input = makeInput(plan);
    const result = buildSceneDemoGenerationPlan(input, 'run-001');
    for (const slot of result.slots) {
      expect(slot.prompt).toContain('[NO CHARACTER DROPOUT]');
    }
  });
});
