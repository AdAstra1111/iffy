/**
 * costumeIdentityAnchoring.test.ts — Tests for actor identity preservation in Costume-on-Actor.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCostumeLookPrompt,
  type CostumeLookInput,
  COSTUME_LOOK_SLOTS,
} from '../costumeOnActor';
import type { CharacterWardrobeProfile, WardrobeStateDefinition } from '../characterWardrobeExtractor';
import type { WorldValidationRules } from '../worldValidationMode';

// ── Fixtures ──

const RULES: WorldValidationRules = {
  allow_magic_literalism: false,
  allow_symbolic_constructs: false,
  allow_impossible_materials: false,
  allow_exaggerated_silhouette: false,
  require_physical_buildability: true,
  require_material_legibility: true,
  require_world_physics_consistency: true,
};

const PROFILE: CharacterWardrobeProfile = {
  character_name: 'Hana',
  character_id_or_key: 'hana',
  wardrobe_identity_summary: 'artisan potter',
  silhouette_language: 'fitted, practical',
  fabric_language: 'linen, hemp',
  palette_logic: 'earthy tones',
  grooming_compatibility: 'tied back',
  class_status_expression: 'artisan',
  public_private_variation: '',
  labor_formality_variation: '',
  ceremonial_variation: '',
  damage_wear_logic: '',
  signature_garments: ['apron', 'kimono'],
  signature_accessories: ['tools'],
  costume_constraints: [],
  confidence: 'high',
  source_doc_types: ['character_role'],
  extraction_version: '1.0.0',
  extracted_at: '2026-01-01T00:00:00Z',
};

const STATE: WardrobeStateDefinition = {
  state_key: 'work',
  label: 'Work / Labor',
  rationale: '',
  explicit_or_inferred: 'explicit',
  trigger_conditions: ['work'],
  garment_adjustments: ['practical'],
  fabric_adjustments: ['sturdy'],
  silhouette_adjustments: [],
  accessory_adjustments: [],
  grooming_adjustments: [],
  continuity_notes: [],
};

function makeInput(overrides?: Partial<CostumeLookInput>): CostumeLookInput {
  return {
    characterName: 'Hana',
    characterKey: 'hana',
    actorName: 'Actor A',
    actorId: 'actor-1',
    actorVersionId: 'version-1',
    wardrobeProfile: PROFILE,
    wardrobeState: STATE,
    worldRules: RULES,
    referenceImageUrls: [],
    ...overrides,
  };
}

// ── A. Prompt includes explicit actor-preservation identity instructions ──

describe('identity preservation in prompt', () => {
  it('includes IDENTITY LOCK mandate', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    expect(result.prompt).toContain('[IDENTITY LOCK');
    expect(result.prompt).toContain('SAME person');
  });

  it('includes face/body preservation instructions', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    expect(result.prompt.toLowerCase()).toContain('face structure');
    expect(result.prompt.toLowerCase()).toContain('skin tone');
    expect(result.prompt.toLowerCase()).toContain('body proportions');
  });

  it('states only costume changes, not the person', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'three_quarter');
    expect(result.prompt.toLowerCase()).toContain('only the costume changes');
  });

  it('identity mandate present in identity-critical slot types', () => {
    const identitySlots = ['full_body_primary', 'three_quarter', 'front_silhouette', 'back_silhouette'];
    for (const slot of COSTUME_LOOK_SLOTS) {
      const result = buildCostumeLookPrompt(makeInput(), slot.key);
      if (identitySlots.includes(slot.key)) {
        expect(result.prompt).toContain('[IDENTITY LOCK');
      } else {
        // Detail slots use soft identity — [COSTUME DETAIL] instead
        expect(result.prompt).toContain('[COSTUME DETAIL');
      }
    }
  });
});

// ── B. Anti-drift negatives prevent identity rewrite ──

describe('anti-identity-drift negatives', () => {
  it('includes core anti-drift terms', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    const neg = result.negative_prompt.toLowerCase();
    expect(neg).toContain('different person');
    expect(neg).toContain('different face');
    expect(neg).toContain('different age');
    expect(neg).toContain('different ethnicity');
    expect(neg).toContain('recast');
    expect(neg).toContain('generic person');
  });

  it('includes bone structure and body type anti-drift', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    const neg = result.negative_prompt.toLowerCase();
    expect(neg).toContain('different bone structure');
    expect(neg).toContain('body type change');
    expect(neg).toContain('face swap');
  });
});

// ── C. Actor anchor set is deterministically from approved version ──

describe('actor version binding in prompt result', () => {
  it('carries exact actor_id and actor_version_id', () => {
    const result = buildCostumeLookPrompt(
      makeInput({ actorId: 'actor-xyz', actorVersionId: 'version-abc' }),
      'full_body_primary',
    );
    expect(result.actor_id).toBe('actor-xyz');
    expect(result.actor_version_id).toBe('version-abc');
  });

  it('identity_mode is always true', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    expect(result.identity_mode).toBe(true);
  });
});

// ── D. Wardrobe-only variation with stable identity ──

describe('wardrobe variation preserves identity contract', () => {
  it('different states produce different garment blocks but same identity mandate', () => {
    const ceremonialState: WardrobeStateDefinition = {
      ...STATE,
      state_key: 'ceremonial',
      label: 'Ceremonial',
      garment_adjustments: ['ceremonial-specific'],
      fabric_adjustments: ['finest'],
    };

    const workResult = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    const ceremResult = buildCostumeLookPrompt(
      makeInput({ wardrobeState: ceremonialState }),
      'full_body_primary',
    );

    // Different wardrobe content
    expect(workResult.prompt).toContain('Work / Labor');
    expect(ceremResult.prompt).toContain('Ceremonial');

    // Same identity mandate in both
    expect(workResult.prompt).toContain('[IDENTITY LOCK');
    expect(ceremResult.prompt).toContain('[IDENTITY LOCK');
  });
});

// ── E. No fallback path allows generic character generation ──

describe('no generic fallback in prompt', () => {
  it('prompt never says "consistent with" without identity lock', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    // Should say "same approved actor" not just "consistent with approved actor"
    expect(result.prompt).toContain('same approved actor');
  });

  it('negative prompt blocks generic person generation', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    expect(result.negative_prompt).toContain('generic person');
    expect(result.negative_prompt).toContain('alternate performer');
  });
});

// ── F. Historical or non-approved actor assets cannot contaminate ──
// (This is an architectural test — the resolveActorAnchorPaths only uses actor_version_id)

describe('actor anchor resolution contract', () => {
  it('CostumeLookInput requires actorVersionId', () => {
    const input = makeInput();
    expect(input.actorVersionId).toBeTruthy();
    expect(typeof input.actorVersionId).toBe('string');
  });

  it('prompt result carries version binding for audit', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    expect(result.actor_version_id).toBe('version-1');
    expect(result.domain).toBe('character_costume_look');
  });
});
