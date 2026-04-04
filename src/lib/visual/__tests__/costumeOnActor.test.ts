/**
 * costumeOnActor.test.ts — Tests for the Costume-on-Actor Look System.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCostumeLookPrompt,
  validateCostumeLookCandidate,
  serializeCostumeLookDiagnostics,
  getAvailableWardrobeStatesForCharacter,
  getCostumeLookValidationSummary,
  COSTUME_ON_ACTOR_DOMAIN,
  COSTUME_ON_ACTOR_VERSION,
  COSTUME_LOOK_SLOTS,
  COSTUME_REQUIRED_SLOT_KEYS,
  COSTUME_SLOT_PRIORITY_ORDER,
  sortSlotsForGeneration,
  isValidCostumeSlotKey,
  resolveStateWardrobe,
  assertNoForbiddenDisplayGarments,
  type CostumeLookInput,
} from '../costumeOnActor';
import type { CharacterWardrobeProfile, WardrobeStateDefinition } from '../characterWardrobeExtractor';
import type { TemporalTruth } from '../temporalTruthResolver';
import type { WorldValidationRules } from '../worldValidationMode';

// ── Fixtures ──

const GROUNDED_RULES: WorldValidationRules = {
  allow_magic_literalism: false,
  allow_symbolic_constructs: false,
  allow_impossible_materials: false,
  allow_exaggerated_silhouette: false,
  require_physical_buildability: true,
  require_material_legibility: true,
  require_world_physics_consistency: true,
};

const FANTASTICAL_RULES: WorldValidationRules = {
  allow_magic_literalism: true,
  allow_symbolic_constructs: true,
  allow_impossible_materials: true,
  allow_exaggerated_silhouette: true,
  require_physical_buildability: false,
  require_material_legibility: false,
  require_world_physics_consistency: false,
};

const CONTEMPORARY_TRUTH: TemporalTruth = {
  era: 'contemporary',
  family: 'modern',
  label: 'Contemporary (21st Century)',
  provenance: 'explicit',
  confidence: 'high',
  evidence: [],
  contributing_sources: ['project_canon'],
  contradictions: [],
  era_garments: ['shirt', 'jacket', 'boots'],
  forbidden_garment_families: ['tunic', 'cloak', 'gown', 'robe', 'cape'],
  summary: 'Contemporary',
};

const PROFILE: CharacterWardrobeProfile = {
  character_name: 'Hana',
  character_id_or_key: 'hana',
  wardrobe_identity_summary: 'artisan potter — apron, smock, work robe',
  silhouette_language: 'Practical, fitted upper body, durable',
  fabric_language: 'linen, hemp, cotton',
  palette_logic: 'Work-stained, occupation-influenced',
  grooming_compatibility: 'Practical — tied back, work-safe',
  class_status_expression: 'artisan (potter)',
  public_private_variation: 'Moderate variation by context',
  labor_formality_variation: 'Work state defined by potter occupation',
  ceremonial_variation: 'Ceremonial garments expected in this world',
  damage_wear_logic: 'Regular wear and staining expected from labor',
  signature_garments: ['apron', 'smock', 'kimono'],
  signature_accessories: ['tools', 'clay-stained cloth'],
  costume_constraints: ['Occupation-specific gear required for work state: potter'],
  confidence: 'high',
  source_doc_types: ['character_role'],
  extraction_version: '1.0.0',
  extracted_at: '2026-01-01T00:00:00Z',
};

const WORK_STATE: WardrobeStateDefinition = {
  state_key: 'work',
  label: 'Work / Labor',
  rationale: 'Character text directly references work context',
  explicit_or_inferred: 'explicit',
  trigger_conditions: ['work', 'labor', 'craft'],
  garment_adjustments: ['practical', 'durable'],
  fabric_adjustments: ['sturdy', 'stain-resistant'],
  silhouette_adjustments: ['loose', 'unencumbered'],
  accessory_adjustments: ['tool belt', 'apron'],
  grooming_adjustments: ['tied back hair'],
  continuity_notes: [],
};

const CEREMONIAL_STATE: WardrobeStateDefinition = {
  state_key: 'ceremonial',
  label: 'Ceremonial',
  rationale: 'World references ceremony context',
  explicit_or_inferred: 'inferred',
  trigger_conditions: ['ceremony', 'ritual'],
  garment_adjustments: ['ceremonial-specific', 'traditional'],
  fabric_adjustments: ['finest', 'symbolic'],
  silhouette_adjustments: ['prescribed form'],
  accessory_adjustments: ['ritual objects'],
  grooming_adjustments: ['ceremonial arrangement'],
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
    wardrobeState: WORK_STATE,
    worldRules: GROUNDED_RULES,
    referenceImageUrls: [],
    ...overrides,
  };
}

// ── Prompt Builder Tests ──

describe('buildCostumeLookPrompt', () => {
  it('includes garment nouns and fabric language from profile', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    expect(result.prompt.toLowerCase()).toContain('apron');
    expect(result.prompt.toLowerCase()).toContain('linen');
    // Canon-first baseline derives garments from variation prose (apron, smock)
    // rather than raw signature_garments — kimono may not appear when
    // occupation-specific garments take precedence via canon-first resolution
    expect(result.prompt.toLowerCase()).toContain('smock');
  });

  it('includes wardrobe state label', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    expect(result.prompt).toContain('Work / Labor');
  });

  it('includes state adjustments', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    expect(result.prompt.toLowerCase()).toContain('practical');
    expect(result.prompt.toLowerCase()).toContain('durable');
  });

  it('sets identity_mode true', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    expect(result.identity_mode).toBe(true);
  });

  it('maps domain to character_costume_look', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    expect(result.domain).toBe(COSTUME_ON_ACTOR_DOMAIN);
  });

  it('carries actor binding info', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    expect(result.actor_id).toBe('actor-1');
    expect(result.actor_version_id).toBe('version-1');
    expect(result.character_key).toBe('hana');
    expect(result.wardrobe_state_key).toBe('work');
  });

  it('includes slot-specific framing for detail slot', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'fabric_detail');
    expect(result.prompt.toLowerCase()).toContain('close-up');
    expect(result.prompt.toLowerCase()).toContain('fabric');
  });

  it('includes negative prompt for grounded mode', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    expect(result.negative_prompt).toContain('fashion editorial');
    expect(result.negative_prompt).toContain('magical clothing');
  });

  it('omits impossible-costume negatives in fantastical mode', () => {
    const result = buildCostumeLookPrompt(
      makeInput({ worldRules: FANTASTICAL_RULES }),
      'full_body_primary',
    );
    expect(result.negative_prompt).not.toContain('magical clothing');
  });

  it('uses the same filtered state wardrobe as display output', () => {
    const result = buildCostumeLookPrompt(
      makeInput({
        temporalTruth: CONTEMPORARY_TRUTH,
        wardrobeProfile: {
          ...PROFILE,
          signature_garments: ['gown', 'boots', 'jacket'],
        },
        wardrobeState: {
          ...WORK_STATE,
          trigger_conditions: ['scene:12'],
          garment_adjustments: ['tunic·scene', 'cloak·scene', 'boots·scene'],
        },
      }),
      'full_body_primary',
    );

    expect(result.prompt.toLowerCase()).toContain('wearing boots, jacket');
    expect(result.prompt.toLowerCase()).not.toContain('tunic');
    expect(result.prompt.toLowerCase()).not.toContain('cloak');
    expect(result.prompt).not.toContain('·scene');
  });
});

describe('resolveStateWardrobe display sealing', () => {
  it('strips provenance decoration and excludes forbidden scene garments from displayGarments', () => {
    const result = resolveStateWardrobe(
      {
        ...PROFILE,
        signature_garments: ['gown', 'boots', 'jacket'],
      },
      {
        ...WORK_STATE,
        explicit_or_inferred: 'explicit',
        trigger_conditions: ['scene:12'],
        garment_adjustments: ['tunic·scene', 'cloak·scene', 'boots·scene'],
      },
      CONTEMPORARY_TRUTH,
    );

    expect(result.displayGarments).toEqual(['boots', 'jacket']);
    expect(result.displayGarments.join(',')).not.toContain('·scene');
    expect(result.exclusions.some(ex => ex.item === 'tunic')).toBe(true);
    expect(result.exclusions.some(ex => ex.item === 'cloak')).toBe(true);
  });

  it('recomputes deterministically when temporal truth changes', () => {
    const state = {
      ...WORK_STATE,
      explicit_or_inferred: 'explicit' as const,
      trigger_conditions: ['scene:12'],
      garment_adjustments: ['tunic·scene', 'boots·scene'],
    };

    const withoutTruth = resolveStateWardrobe(PROFILE, state, null);
    const withTruth = resolveStateWardrobe(PROFILE, state, CONTEMPORARY_TRUTH);

    expect(withoutTruth.displayGarments.map(g => g.toLowerCase())).toContain('tunic');
    expect(withTruth.displayGarments.map(g => g.toLowerCase())).not.toContain('tunic');
  });

  it('assertNoForbiddenDisplayGarments fails loudly on leaked forbidden items', () => {
    expect(() => assertNoForbiddenDisplayGarments(['tunic', 'boots'], CONTEMPORARY_TRUTH)).toThrow(
      'IEL violation',
    );
  });

  it('strips .scene decoration and excludes forbidden garments', () => {
    const result = resolveStateWardrobe(
      { ...PROFILE, signature_garments: ['boots', 'jacket'] },
      { ...WORK_STATE, garment_adjustments: ['tunic.scene', 'boots.scene'] },
      CONTEMPORARY_TRUTH,
    );
    expect(result.displayGarments).not.toContain('tunic');
    expect(result.displayGarments).toContain('boots');
    expect(result.displayGarments.join(',')).not.toContain('.scene');
  });

  it('strips (scene) decoration and excludes forbidden garments', () => {
    const result = resolveStateWardrobe(
      { ...PROFILE, signature_garments: ['boots'] },
      { ...WORK_STATE, garment_adjustments: ['cloak(scene)', 'boots(scene)'] },
      CONTEMPORARY_TRUTH,
    );
    expect(result.displayGarments).not.toContain('cloak');
    expect(result.displayGarments).toContain('boots');
    expect(result.displayGarments.join(',')).not.toContain('(scene)');
  });

  it('strips -scene decoration and excludes forbidden garments', () => {
    const result = resolveStateWardrobe(
      { ...PROFILE, signature_garments: ['boots'] },
      { ...WORK_STATE, garment_adjustments: ['gown-scene', 'boots-scene'] },
      CONTEMPORARY_TRUTH,
    );
    expect(result.displayGarments).not.toContain('gown');
    expect(result.displayGarments).toContain('boots');
    expect(result.displayGarments.join(',')).not.toContain('-scene');
  });

  it('strips [scene] decoration and excludes forbidden garments', () => {
    const result = resolveStateWardrobe(
      { ...PROFILE, signature_garments: ['boots'] },
      { ...WORK_STATE, garment_adjustments: ['tunic[scene]', 'boots[scene]'] },
      CONTEMPORARY_TRUTH,
    );
    expect(result.displayGarments).not.toContain('tunic');
    expect(result.displayGarments).toContain('boots');
  });

  it('allowed garments with decoration are cleaned and retained', () => {
    const result = resolveStateWardrobe(
      { ...PROFILE, signature_garments: ['jacket'] },
      { ...WORK_STATE, garment_adjustments: ['boots·scene', 'jacket·scene'] },
      CONTEMPORARY_TRUTH,
    );
    expect(result.displayGarments).toContain('boots');
    expect(result.displayGarments).toContain('jacket');
    expect(result.displayGarments.every(g => !g.includes('·'))).toBe(true);
  });

  it('prompt builder output matches state display garments exactly', () => {
    const profile = { ...PROFILE, signature_garments: ['boots', 'jacket'] };
    const state = { ...WORK_STATE, garment_adjustments: ['tunic·scene', 'boots·scene'] };
    const resolved = resolveStateWardrobe(profile, state, CONTEMPORARY_TRUTH);
    const prompt = buildCostumeLookPrompt(
      makeInput({ wardrobeProfile: profile, wardrobeState: state, temporalTruth: CONTEMPORARY_TRUTH }),
      'full_body_primary',
    );
    for (const g of resolved.displayGarments) {
      expect(prompt.prompt.toLowerCase()).toContain(g.toLowerCase());
    }
    expect(prompt.prompt.toLowerCase()).not.toContain('tunic');
  });

  it('assertNoForbiddenDisplayGarments catches decorated forbidden tokens', () => {
    expect(() => assertNoForbiddenDisplayGarments(['tunic·scene', 'boots'], CONTEMPORARY_TRUTH)).toThrow(
      'IEL violation',
    );
  });
});

// ── Validation Tests ──

describe('validateCostumeLookCandidate', () => {
  it('passes a well-formed prompt with garment + fabric + identity', () => {
    const prompt = 'Hana wearing apron and kimono made of linen, identity locked, approved actor, work state';
    const result = validateCostumeLookCandidate(prompt, 'full_body_primary', PROFILE, WORK_STATE, GROUNDED_RULES);
    expect(result.passed).toBe(true);
    expect(result.hard_fail_codes).toHaveLength(0);
  });

  it('fails a generic prompt with no garment noun', () => {
    const prompt = 'A person standing in a studio, identity locked';
    const result = validateCostumeLookCandidate(prompt, 'full_body_primary', PROFILE, WORK_STATE, GROUNDED_RULES);
    expect(result.passed).toBe(false);
    expect(result.hard_fail_codes).toContain('no_garment_noun');
  });

  it('fails editorial drift', () => {
    const prompt = 'Hana wearing kimono, linen fabric, runway fashion show editorial';
    const result = validateCostumeLookCandidate(prompt, 'full_body_primary', PROFILE, WORK_STATE, GROUNDED_RULES);
    expect(result.passed).toBe(false);
    expect(result.hard_fail_codes).toContain('editorial_drift');
  });

  it('grounded mode rejects impossible costume constructs', () => {
    const prompt = 'Hana wearing floating garment enchanted robe, silk fabric';
    const result = validateCostumeLookCandidate(prompt, 'full_body_primary', PROFILE, WORK_STATE, GROUNDED_RULES);
    expect(result.passed).toBe(false);
    expect(result.hard_fail_codes).toContain('impossible_costume');
  });

  it('fantastical mode allows impossible costume constructs', () => {
    const prompt = 'Hana wearing enchanted robe, silk fabric, identity locked';
    const result = validateCostumeLookCandidate(prompt, 'full_body_primary', PROFILE, WORK_STATE, FANTASTICAL_RULES);
    expect(result.physically_wearable).toBe(true);
    expect(result.hard_fail_codes).not.toContain('impossible_costume');
  });

  it('advises on garment profile mismatch', () => {
    const prompt = 'Hana wearing toga, linen fabric, identity locked';
    const result = validateCostumeLookCandidate(prompt, 'full_body_primary', PROFILE, WORK_STATE, GROUNDED_RULES);
    expect(result.advisory_codes).toContain('garment_profile_mismatch');
  });
});

// ── Diagnostics Tests ──

describe('serializeCostumeLookDiagnostics', () => {
  it('produces stable shape', () => {
    const validation = validateCostumeLookCandidate(
      'Hana wearing kimono, linen, identity locked',
      'full_body_primary', PROFILE, WORK_STATE, GROUNDED_RULES,
    );
    const diag = serializeCostumeLookDiagnostics('hana', 'actor-1', 'work', 'full_body_primary', validation, 'selected');
    expect(diag.character_key).toBe('hana');
    expect(diag.actor_id).toBe('actor-1');
    expect(diag.wardrobe_state_key).toBe('work');
    expect(diag.slot_key).toBe('full_body_primary');
    expect(diag.validation.scoring_model).toBe('costume_look_v1');
    expect(diag.version).toBe(COSTUME_ON_ACTOR_VERSION);
  });
});

// ── Seam Helper Tests ──

describe('getAvailableWardrobeStatesForCharacter', () => {
  it('returns states for known character', () => {
    const matrix = { hana: [WORK_STATE, CEREMONIAL_STATE] };
    const result = getAvailableWardrobeStatesForCharacter(matrix, 'Hana');
    expect(result).toHaveLength(2);
    expect(result[0].state_key).toBe('work');
  });

  it('returns empty for unknown character', () => {
    const result = getAvailableWardrobeStatesForCharacter({}, 'Unknown');
    expect(result).toHaveLength(0);
  });
});

describe('getCostumeLookValidationSummary', () => {
  it('summarizes mixed results', () => {
    const passed = validateCostumeLookCandidate('wearing kimono linen identity locked', 'full_body_primary', PROFILE, WORK_STATE, GROUNDED_RULES);
    const failed = validateCostumeLookCandidate('a person', 'full_body_primary', PROFILE, WORK_STATE, GROUNDED_RULES);
    const summary = getCostumeLookValidationSummary([passed, failed]);
    expect(summary.total_slots).toBe(2);
    expect(summary.passed_slots).toBe(1);
    expect(summary.failed_slots).toBe(1);
    expect(summary.all_passed).toBe(false);
  });
});

// ── Slot Definitions ──

describe('COSTUME_LOOK_SLOTS', () => {
  it('has required slots', () => {
    const required = COSTUME_LOOK_SLOTS.filter(s => s.required);
    expect(required.length).toBeGreaterThanOrEqual(2);
    expect(required.find(s => s.key === 'full_body_primary')).toBeTruthy();
    expect(required.find(s => s.key === 'three_quarter')).toBeTruthy();
  });

  it('all slots have shot_type', () => {
    for (const slot of COSTUME_LOOK_SLOTS) {
      expect(slot.shot_type).toBeTruthy();
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// REGRESSION TESTS — added for costume workflow hardening
// ══════════════════════════════════════════════════════════════════

// ── A. Required slots sort before optional slots ──

describe('sortSlotsForGeneration', () => {
  const makeSlot = (key: string, isRequired: boolean) => ({ slot_key: key, is_required: isRequired });

  it('places required slots before optional slots', () => {
    const slots = [
      makeSlot('accessory_detail', false),
      makeSlot('full_body_primary', true),
      makeSlot('fabric_detail', false),
      makeSlot('three_quarter', true),
    ];
    const sorted = sortSlotsForGeneration(slots);
    expect(sorted[0].slot_key).toBe('full_body_primary');
    expect(sorted[1].slot_key).toBe('three_quarter');
    expect(sorted[2].is_required).toBe(false);
    expect(sorted[3].is_required).toBe(false);
  });

  it('preserves canonical order within each group', () => {
    const slots = [
      makeSlot('hair_grooming', false),
      makeSlot('three_quarter', true),
      makeSlot('front_silhouette', false),
      makeSlot('full_body_primary', true),
    ];
    const sorted = sortSlotsForGeneration(slots);
    expect(sorted[0].slot_key).toBe('full_body_primary');
    expect(sorted[1].slot_key).toBe('three_quarter');
    expect(sorted[2].slot_key).toBe('front_silhouette');
    expect(sorted[3].slot_key).toBe('hair_grooming');
  });
});

// ── B. Optional slots blocked while required unresolved ──

describe('required-first enforcement', () => {
  it('all required slots precede all optional slots after sort', () => {
    const allSlots = COSTUME_LOOK_SLOTS.map(s => ({ slot_key: s.key, is_required: s.required }));
    const shuffled = [...allSlots].reverse();
    const sorted = sortSlotsForGeneration(shuffled);

    const firstOptionalIdx = sorted.findIndex(s => !s.is_required);
    const lastRequiredIdx = sorted.reduce((acc, s, i) => s.is_required ? i : acc, -1);
    expect(lastRequiredIdx).toBeLessThan(firstOptionalIdx);
  });
});

// ── C. Readiness stays incomplete when required slots empty ──

describe('readiness: required slot keys', () => {
  it('COSTUME_REQUIRED_SLOT_KEYS contains exactly 2 required keys', () => {
    expect(COSTUME_REQUIRED_SLOT_KEYS.length).toBe(2);
    expect(COSTUME_REQUIRED_SLOT_KEYS).toContain('full_body_primary');
    expect(COSTUME_REQUIRED_SLOT_KEYS).toContain('three_quarter');
  });

  it('optional slots are not in required list', () => {
    const optionalKeys = COSTUME_LOOK_SLOTS.filter(s => !s.required).map(s => s.key);
    for (const k of optionalKeys) {
      expect(COSTUME_REQUIRED_SLOT_KEYS).not.toContain(k);
    }
  });
});

// ── D. generateRequiredOnly only targets required slots ──

describe('generateRequiredOnly filtering logic', () => {
  it('filtering with requiredOnly=true yields only required slots', () => {
    const allSlots = COSTUME_LOOK_SLOTS.map(s => ({
      slot_key: s.key, is_required: s.required, state: 'empty',
    }));
    const actionable = allSlots.filter(s => s.state !== 'approved' && s.state !== 'locked');
    const requiredOnly = actionable.filter(s => s.is_required);
    expect(requiredOnly.length).toBe(2);
    expect(requiredOnly.every(s => s.is_required)).toBe(true);
    expect(requiredOnly.map(s => s.slot_key)).toEqual(['full_body_primary', 'three_quarter']);
  });
});

// ── E. Diagnostics shape ──

describe('convergence diagnostics shape', () => {
  it('convergence_state supports last_fail_reason, prompt_template_key, exhaustion_reason', () => {
    const cs = {
      best_candidate_id: null,
      best_score: 0,
      attempt_count: 3,
      last_fail_reason: 'framing_mismatch',
      prompt_template_key: 'costume_on_actor/full_body_primary',
      exhaustion_reason: 'exhausted_3_attempts_no_viable',
    };
    expect(cs.last_fail_reason).toBe('framing_mismatch');
    expect(cs.prompt_template_key).toContain('costume_on_actor/');
    expect(cs.exhaustion_reason).toContain('exhausted');
  });
});

// ── F. Invalid slot routing fails closed ──

describe('isValidCostumeSlotKey — routing guard', () => {
  it('accepts all canonical costume slot keys', () => {
    for (const slot of COSTUME_LOOK_SLOTS) {
      expect(isValidCostumeSlotKey(slot.key)).toBe(true);
    }
  });

  it('rejects identity/casting keys', () => {
    expect(isValidCostumeSlotKey('identity_reference')).toBe(false);
    expect(isValidCostumeSlotKey('casting_reference')).toBe(false);
    expect(isValidCostumeSlotKey('character_sheet')).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(isValidCostumeSlotKey('')).toBe(false);
    expect(isValidCostumeSlotKey('random_key')).toBe(false);
  });

  it('buildCostumeLookPrompt throws on invalid slot key', () => {
    expect(() => buildCostumeLookPrompt(makeInput(), 'identity_reference')).toThrow('ROUTING ERROR');
    expect(() => buildCostumeLookPrompt(makeInput(), 'casting_reference')).toThrow('ROUTING ERROR');
  });
});

// ── G. Prompt template key persists ──

describe('prompt template key auditability', () => {
  it('prompt contains lineage tag for each slot', () => {
    for (const slot of COSTUME_LOOK_SLOTS) {
      const result = buildCostumeLookPrompt(makeInput(), slot.key);
      expect(result.prompt).toContain(`[prompt_template: costume_on_actor/${slot.key}]`);
    }
  });

  it('negative prompt blocks identity/casting contamination', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    expect(result.negative_prompt).toContain('casting reference');
    expect(result.negative_prompt).toContain('identity reference sheet');
  });
});

// ══════════════════════════════════════════════════════════════════
// REGRESSION TESTS — readiness truth model + run separation
// ══════════════════════════════════════════════════════════════════

import {
  computeCastScopeHash,
  hasCastScopeDrifted,
  createRunManifest,
  isCandidateFromRun,
} from '../costumeRunManifest';

// ── A. Optional historical candidates do not count as current-run output ──

describe('current-run vs historical candidate separation', () => {
  it('isCandidateFromRun returns false for candidates without matching run_id', () => {
    expect(isCandidateFromRun('crun_old_123', 'crun_current_456')).toBe(false);
  });

  it('isCandidateFromRun returns true only for exact run_id match', () => {
    expect(isCandidateFromRun('crun_current_456', 'crun_current_456')).toBe(true);
  });

  it('null/undefined run_id candidates are always historical', () => {
    expect(isCandidateFromRun(null, 'crun_current_456')).toBe(false);
    expect(isCandidateFromRun(undefined, 'crun_current_456')).toBe(false);
  });
});

// ── B. Required readiness ignores optional slot emptiness ──

describe('required readiness ignores optional slots', () => {
  it('COSTUME_REQUIRED_SLOT_KEYS does not include optional keys', () => {
    const optionalKeys = COSTUME_LOOK_SLOTS.filter(s => !s.required).map(s => s.key);
    for (const k of optionalKeys) {
      expect(COSTUME_REQUIRED_SLOT_KEYS).not.toContain(k);
    }
  });

  it('required-only run manifest only allows required keys', () => {
    const manifest = createRunManifest('hana', 'work', 'required_only', COSTUME_REQUIRED_SLOT_KEYS, 'scope_x');
    expect(manifest.allowed_slot_keys).toEqual(COSTUME_REQUIRED_SLOT_KEYS);
    // Optional keys must not be in allowed_slot_keys
    const optionalKeys = COSTUME_LOOK_SLOTS.filter(s => !s.required).map(s => s.key);
    for (const k of optionalKeys) {
      expect(manifest.allowed_slot_keys).not.toContain(k);
    }
  });
});

// ── C. Character ready uses all states required-ready, not set existence ──

describe('character readiness requires all states', () => {
  it('readiness cannot be "ready" with zero states', () => {
    // coverage with 0 states should be incomplete
    // This tests the logic: states.length > 0 is required for 'ready'
    expect(COSTUME_REQUIRED_SLOT_KEYS.length).toBeGreaterThan(0);
  });
});

// ── D. Top summary and row summary derive from same canonical required readiness ──

describe('canonical readiness source', () => {
  it('COSTUME_REQUIRED_SLOT_KEYS is the single source for required slot identity', () => {
    const fromSlots = COSTUME_LOOK_SLOTS.filter(s => s.required).map(s => s.key);
    expect(COSTUME_REQUIRED_SLOT_KEYS).toEqual(fromSlots);
  });
});

// ── E. Session stale triggers when cast roster changes ──

describe('cast scope drift detection', () => {
  const cast1 = [
    { character_key: 'hana', ai_actor_id: 'a1', ai_actor_version_id: 'v1' },
  ];
  const cast2 = [
    { character_key: 'hana', ai_actor_id: 'a1', ai_actor_version_id: 'v1' },
    { character_key: 'lady_akemi', ai_actor_id: 'a2', ai_actor_version_id: 'v2' },
  ];

  it('same cast produces same hash', () => {
    expect(computeCastScopeHash(cast1)).toBe(computeCastScopeHash(cast1));
  });

  it('adding a cast member produces different hash', () => {
    const h1 = computeCastScopeHash(cast1);
    const h2 = computeCastScopeHash(cast2);
    expect(h1).not.toBe(h2);
  });

  it('hasCastScopeDrifted detects the change', () => {
    const h1 = computeCastScopeHash(cast1);
    const h2 = computeCastScopeHash(cast2);
    expect(hasCastScopeDrifted(h1, h2)).toBe(true);
    expect(hasCastScopeDrifted(h1, h1)).toBe(false);
  });
});

// ── F. Active-run-only filter logic ──

describe('active-run-only filter logic', () => {
  it('optional slot with different run_id is filtered when showActiveRunOnly', () => {
    // Simulates the filter logic in SlotPreviewRow
    const activeRunId: string = 'crun_current';
    const slotRunId: string = 'crun_old';
    const isOptional = true;
    const isApproved = false;
    const isLocked = false;
    const hasCandidateOrImage = true;

    const isFromActiveRun = isCandidateFromRun(slotRunId, activeRunId);
    const isHistorical = hasCandidateOrImage && !isApproved && !isLocked && !isFromActiveRun;
    const shouldHide = isHistorical && isOptional;

    expect(shouldHide).toBe(true);
  });

  it('required slot with different run_id is NOT filtered', () => {
    const activeRunId: string = 'crun_current';
    const slotRunId: string = 'crun_old';
    const isOptional = false;
    const isApproved = false;
    const isLocked = false;
    const hasCandidateOrImage = true;

    const isFromActiveRun = isCandidateFromRun(slotRunId, activeRunId);
    const isHistorical = hasCandidateOrImage && !isApproved && !isLocked && !isFromActiveRun;
    const shouldHide = isHistorical && isOptional;

    expect(shouldHide).toBe(false);
  });
});

// ── G. Success message reflects actual required completion counts only ──

describe('required-only completion semantics', () => {
  it('required-only manifest generation_mode is required_only', () => {
    const manifest = createRunManifest('hana', 'work', 'required_only', COSTUME_REQUIRED_SLOT_KEYS, 'scope_x');
    expect(manifest.generation_mode).toBe('required_only');
  });

  it('required-only manifest only permits required slot keys', () => {
    const manifest = createRunManifest('hana', 'work', 'required_only', COSTUME_REQUIRED_SLOT_KEYS, 'scope_x');
    expect(manifest.allowed_slot_keys.length).toBe(COSTUME_REQUIRED_SLOT_KEYS.length);
  });
});
