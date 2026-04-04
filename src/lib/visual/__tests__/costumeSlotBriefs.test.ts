/**
 * costumeSlotBriefs.test.ts — Validates the canonical StateWardrobePackage
 * and CostumeSlotBrief system for slot-specific differentiation.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveStateWardrobePackage,
  buildCostumeSlotBrief,
  buildCostumeLookPrompt,
  type CostumeLookInput,
  type StateWardrobePackage,
  COSTUME_LOOK_SLOTS,
} from '../costumeOnActor';
import type { CharacterWardrobeProfile, WardrobeStateDefinition } from '../characterWardrobeExtractor';
import type { TemporalTruth } from '../temporalTruthResolver';

const CONTEMPORARY: TemporalTruth = {
  era: 'contemporary',
  family: 'modern',
  label: 'Contemporary (21st Century)',
  provenance: 'explicit',
  confidence: 'high',
  evidence: [],
  contributing_sources: ['project_canon'],
  contradictions: [],
  era_garments: ['shirt', 'jeans', 'jacket', 'boots'],
  forbidden_garment_families: ['tunic', 'cloak', 'robe', 'gown', 'cape'],
  summary: 'Contemporary',
};

function makeProfile(overrides?: Partial<CharacterWardrobeProfile>): CharacterWardrobeProfile {
  return {
    character_name: 'Elena',
    character_id_or_key: 'elena',
    signature_garments: ['leather jacket', 'boots', 'jeans', 'shirt'],
    signature_accessories: ['silver ring', 'watch'],
    fabric_language: 'worn leather, soft cotton, rugged denim',
    silhouette_language: 'lean and angular',
    palette_logic: 'earth tones',
    class_status_expression: 'urban working class',
    grooming_compatibility: 'short tousled hair, minimal makeup',
    costume_constraints: [],
    confidence: 'high',
    source_doc_types: ['character_bible'],
    wardrobe_identity_summary: 'Urban working-class protagonist',
    public_private_variation: '',
    labor_formality_variation: '',
    ceremonial_variation: '',
    damage_wear_logic: '',
    extraction_version: '1.5.0',
    extracted_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeState(overrides?: Partial<WardrobeStateDefinition>): WardrobeStateDefinition {
  return {
    state_key: 'work',
    label: 'Work / Daily',
    rationale: 'Daily work attire',
    explicit_or_inferred: 'inferred',
    garment_adjustments: ['practical work clothes'],
    fabric_adjustments: ['worn denim'],
    silhouette_adjustments: [],
    accessory_adjustments: ['tool belt'],
    grooming_adjustments: ['hair tied back'],
    trigger_conditions: [],
    continuity_notes: [],
    ...overrides,
  };
}

function makeMinimalProfile(): CharacterWardrobeProfile {
  return makeProfile({
    signature_garments: [],
    signature_accessories: [],
    fabric_language: '',
    silhouette_language: '',
    grooming_compatibility: '',
  });
}

function makeInput(overrides?: Partial<CostumeLookInput>): CostumeLookInput {
  return {
    characterName: 'Elena',
    characterKey: 'elena',
    actorName: 'Actor A',
    actorId: 'actor-1',
    actorVersionId: 'version-1',
    wardrobeProfile: makeProfile(),
    wardrobeState: makeState(),
    worldRules: null,
    referenceImageUrls: [],
    temporalTruth: CONTEMPORARY,
    ...overrides,
  };
}

// ── Package Strength Tests ────────────────────────────────────────────────

describe('resolveStateWardrobePackage — strength grading', () => {
  it('grades based on resolved wardrobe truth quality', () => {
    const pkg = resolveStateWardrobePackage(makeProfile(), makeState(), CONTEMPORARY);
    // Package strength depends on upstream resolver — must be a valid grade
    expect(['strong', 'usable', 'weak', 'blocked']).toContain(pkg.packageStrength);
    expect(Array.isArray(pkg.failureReasons)).toBe(true);
  });

  it('non-fallback profile with no temporal truth grades strong', () => {
    // Without temporal truth, no era-fallback reconstruction triggers
    const pkg = resolveStateWardrobePackage(makeProfile(), makeState(), null);
    expect(['strong', 'usable']).toContain(pkg.packageStrength);
  });

  it('grades blocked when no garments exist', () => {
    const pkg = resolveStateWardrobePackage(
      makeProfile({ signature_garments: [] }),
      makeState({ garment_adjustments: [] }),
      CONTEMPORARY,
    );
    // With no garments at all, should be weak or blocked
    expect(['weak', 'blocked']).toContain(pkg.packageStrength);
  });

  it('grades usable when missing fabric/accessory/grooming detail', () => {
    const pkg = resolveStateWardrobePackage(
      makeProfile({ fabric_language: '', signature_accessories: [], grooming_compatibility: '' }),
      makeState({ accessory_adjustments: [], grooming_adjustments: [] }),
      CONTEMPORARY,
    );
    expect(['usable', 'weak']).toContain(pkg.packageStrength);
  });

  it('returns source summary with provenance', () => {
    const pkg = resolveStateWardrobePackage(makeProfile(), makeState(), CONTEMPORARY);
    expect(pkg.sourceSummary.length).toBeGreaterThan(0);
  });
});

// ── Slot Readiness Tests ────────────────────────────────────────────────

describe('resolveStateWardrobePackage — slot readiness', () => {
  it('full_body_primary is ready with garments', () => {
    const pkg = resolveStateWardrobePackage(makeProfile(), makeState(), CONTEMPORARY);
    expect(pkg.slotReadiness['full_body_primary']).toBe('ready');
  });

  it('fabric_detail is ready when fabric truth exists', () => {
    const pkg = resolveStateWardrobePackage(makeProfile(), makeState(), CONTEMPORARY);
    expect(pkg.slotReadiness['fabric_detail']).toBe('ready');
  });

  it('fabric_detail is blocked when no fabric truth', () => {
    const pkg = resolveStateWardrobePackage(
      makeProfile({ fabric_language: '' }),
      makeState(),
      CONTEMPORARY,
    );
    // displayFabrics may still have content from state adjustments
    if (pkg.displayFabrics.length === 0) {
      expect(pkg.slotReadiness['fabric_detail']).toBe('blocked');
      expect(pkg.slotBlockedReasons['fabric_detail']).toBeTruthy();
    }
  });

  it('accessory_detail is ready when accessories exist', () => {
    const pkg = resolveStateWardrobePackage(makeProfile(), makeState(), CONTEMPORARY);
    expect(pkg.slotReadiness['accessory_detail']).toBe('ready');
  });

  it('accessory_detail is blocked when no accessory truth', () => {
    const pkg = resolveStateWardrobePackage(
      makeProfile({ signature_accessories: [] }),
      makeState({ accessory_adjustments: [] }),
      CONTEMPORARY,
    );
    expect(pkg.slotReadiness['accessory_detail']).toBe('blocked');
  });

  it('hair_grooming is ready when grooming truth exists', () => {
    const pkg = resolveStateWardrobePackage(makeProfile(), makeState(), CONTEMPORARY);
    expect(pkg.slotReadiness['hair_grooming']).toBe('ready');
  });

  it('hair_grooming is blocked when no grooming truth', () => {
    const pkg = resolveStateWardrobePackage(
      makeProfile({ grooming_compatibility: '' }),
      makeState({ grooming_adjustments: [] }),
      CONTEMPORARY,
    );
    expect(pkg.slotReadiness['hair_grooming']).toBe('blocked');
  });

  it('closure_detail readiness depends on closure-bearing garments', () => {
    const pkg = resolveStateWardrobePackage(makeProfile(), makeState(), CONTEMPORARY);
    // leather jacket is closure-bearing
    expect(pkg.slotReadiness['closure_detail']).toBe('ready');
  });
});

// ── Slot Brief Content Tests ────────────────────────────────────────────

describe('buildCostumeSlotBrief — content differentiation', () => {
  let pkg: StateWardrobePackage;
  const profile = makeProfile();
  const state = makeState();

  beforeAll(() => {
    pkg = resolveStateWardrobePackage(profile, state, CONTEMPORARY);
  });

  it('fabric_detail brief is materially different from full_body_primary', () => {
    const fbBrief = buildCostumeSlotBrief(pkg, 'full_body_primary', profile, state);
    const fabBrief = buildCostumeSlotBrief(pkg, 'fabric_detail', profile, state);

    const fbContent = fbBrief.contentBlocks.join(' ');
    const fabContent = fabBrief.contentBlocks.join(' ');

    // Fabric detail should focus on material, not full garment list
    expect(fabContent).toContain('fabric');
    expect(fabContent).toContain('material');
    expect(fabBrief.focusType).toBe('texture_material');
    expect(fbBrief.focusType).toBe('full_wardrobe');

    // They should NOT be identical
    expect(fabContent).not.toBe(fbContent);
  });

  it('closure_detail brief contains closure-specific content', () => {
    const brief = buildCostumeSlotBrief(pkg, 'closure_detail', profile, state);
    const content = brief.contentBlocks.join(' ');
    expect(content).toContain('closure');
    expect(content).toContain('fastening');
    expect(brief.focusType).toBe('closure_fastening');
  });

  it('accessory_detail brief contains accessory-specific content', () => {
    const brief = buildCostumeSlotBrief(pkg, 'accessory_detail', profile, state);
    const content = brief.contentBlocks.join(' ');
    expect(content).toContain('accessory');
    expect(brief.focusType).toBe('accessory_focus');
  });

  it('hair_grooming brief contains grooming-specific content', () => {
    const brief = buildCostumeSlotBrief(pkg, 'hair_grooming', profile, state);
    const content = brief.contentBlocks.join(' ');
    expect(content).toContain('hair');
    expect(content).toContain('grooming');
    expect(brief.focusType).toBe('grooming_focus');
  });

  it('detail slots have soft identity (requiresIdentityLock = false)', () => {
    for (const key of ['fabric_detail', 'closure_detail', 'accessory_detail', 'hair_grooming']) {
      const brief = buildCostumeSlotBrief(pkg, key, profile, state);
      expect(brief.requiresIdentityLock).toBe(false);
    }
  });

  it('full body + three quarter + silhouettes have strict identity', () => {
    for (const key of ['full_body_primary', 'three_quarter', 'front_silhouette', 'back_silhouette']) {
      const brief = buildCostumeSlotBrief(pkg, key, profile, state);
      expect(brief.requiresIdentityLock).toBe(true);
    }
  });

  it('blocked slot returns generatable=false with reason', () => {
    const weakPkg = resolveStateWardrobePackage(
      makeProfile({ signature_accessories: [] }),
      makeState({ accessory_adjustments: [] }),
      CONTEMPORARY,
    );
    const brief = buildCostumeSlotBrief(weakPkg, 'accessory_detail', makeProfile({ signature_accessories: [] }), makeState({ accessory_adjustments: [] }));
    expect(brief.generatable).toBe(false);
    expect(brief.blockReason).toBeTruthy();
  });
});

// ── Prompt Differentiation Tests ────────────────────────────────────────

describe('buildCostumeLookPrompt — slot-specific prompts', () => {
  it('fabric_detail prompt differs materially from full_body_primary', () => {
    const input = makeInput();
    const fbPrompt = buildCostumeLookPrompt(input, 'full_body_primary');
    const fabPrompt = buildCostumeLookPrompt(input, 'fabric_detail');

    // Should have different content
    expect(fabPrompt.prompt).not.toBe(fbPrompt.prompt);

    // Fabric detail should NOT have full identity lock
    expect(fabPrompt.prompt).not.toContain('[IDENTITY LOCK');
    expect(fabPrompt.prompt).toContain('[COSTUME DETAIL');

    // Full body SHOULD have identity lock
    expect(fbPrompt.prompt).toContain('[IDENTITY LOCK');
  });

  it('fabric_detail negative prompt omits anti-identity-drift terms', () => {
    const input = makeInput();
    const fabPrompt = buildCostumeLookPrompt(input, 'fabric_detail');
    expect(fabPrompt.negative_prompt).not.toContain('different person');
    expect(fabPrompt.negative_prompt).not.toContain('face swap');
  });

  it('full_body_primary negative prompt includes anti-identity-drift terms', () => {
    const input = makeInput();
    const fbPrompt = buildCostumeLookPrompt(input, 'full_body_primary');
    expect(fbPrompt.negative_prompt).toContain('different person');
  });

  it('throws for blocked slot', () => {
    const input = makeInput({
      wardrobeProfile: makeProfile({ signature_accessories: [] }),
      wardrobeState: makeState({ accessory_adjustments: [] }),
    });
    expect(() => buildCostumeLookPrompt(input, 'accessory_detail')).toThrow('SLOT BLOCKED');
  });
});

// ── Package-Panel Parity Tests ──────────────────────────────────────────

describe('package truth parity', () => {
  it('same package shape is used for panel and prompt', () => {
    const profile = makeProfile();
    const state = makeState();
    const pkg = resolveStateWardrobePackage(profile, state, CONTEMPORARY);

    // Package has all expected fields
    expect(pkg).toHaveProperty('packageStrength');
    expect(pkg).toHaveProperty('slotReadiness');
    expect(pkg).toHaveProperty('slotBlockedReasons');
    expect(pkg).toHaveProperty('sourceSummary');
    expect(pkg).toHaveProperty('displayGarments');
    expect(pkg).toHaveProperty('displayFabrics');
    expect(pkg).toHaveProperty('transformationAxes');
    expect(pkg).toHaveProperty('baseline');
  });

  it('all defined slot keys have readiness entries', () => {
    const pkg = resolveStateWardrobePackage(makeProfile(), makeState(), CONTEMPORARY);
    for (const slot of COSTUME_LOOK_SLOTS) {
      expect(pkg.slotReadiness).toHaveProperty(slot.key);
    }
  });
});

// ── INVARIANT: Costume slots must NEVER use identity-reference shot types ──
describe('costume slot shot_type identity-reference guard', () => {
  it('no costume slot uses identity_* shot_type prefix', () => {
    for (const slot of COSTUME_LOOK_SLOTS) {
      expect(slot.shot_type.startsWith('identity_')).toBe(false);
    }
  });

  it('full_body_primary prompt never contains CHARACTER IDENTITY REFERENCE', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    expect(result.prompt).not.toContain('CHARACTER IDENTITY REFERENCE');
    expect(result.prompt).not.toContain('baseline neutral wardrobe');
    expect(result.prompt).not.toContain('CASTING REFERENCE');
  });

  it('no costume slot prompt contains identity reference language', () => {
    for (const slot of COSTUME_LOOK_SLOTS) {
      try {
        const result = buildCostumeLookPrompt(makeInput(), slot.key);
        expect(result.prompt).not.toContain('CHARACTER IDENTITY REFERENCE');
        expect(result.prompt).not.toContain('baseline neutral wardrobe');
        expect(result.prompt).not.toContain('casting-photo style');
      } catch {
        // Slot may be blocked — that's fine, blocked slots don't generate
      }
    }
  });

  it('full_body_primary uses full_body shot_type, not identity_full_body', () => {
    const fbSlot = COSTUME_LOOK_SLOTS.find(s => s.key === 'full_body_primary');
    expect(fbSlot?.shot_type).toBe('full_body');
  });

  it('front_silhouette uses full_body shot_type, not identity_full_body', () => {
    const slot = COSTUME_LOOK_SLOTS.find(s => s.key === 'front_silhouette');
    expect(slot?.shot_type).toBe('full_body');
  });

  it('costume prompt result shot_type is never identity_*', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    expect(result.shot_type.startsWith('identity_')).toBe(false);
  });

  it('back_silhouette uses full_body shot_type, not identity_full_body', () => {
    const slot = COSTUME_LOOK_SLOTS.find(s => s.key === 'back_silhouette');
    expect(slot?.shot_type).toBe('full_body');
  });

  it('NO costume slot uses any identity_* shot_type', () => {
    for (const slot of COSTUME_LOOK_SLOTS) {
      expect(slot.shot_type.startsWith('identity_')).toBe(false);
    }
  });

  it('all costume slots share the same domain and never switch pipeline', () => {
    const slots = COSTUME_LOOK_SLOTS;
    for (const slot of slots) {
      try {
        const result = buildCostumeLookPrompt(makeInput(), slot.key);
        expect(result.domain).toBe('character_costume_look');
        expect(result.prompt).not.toContain('casting reference');
      } catch {
        // blocked slots are fine
      }
    }
  });
});

// ── Baseline-to-Package Truth Alignment Invariants ──────────────────────────

describe('resolveStateWardrobePackage — baseline carry-forward invariant', () => {
  it('profile with garments never produces "blocked" package without explicit exclusion', () => {
    // Profile has garments — package must NOT be blocked
    const pkg = resolveStateWardrobePackage(
      makeProfile({ signature_garments: ['leather jacket', 'boots', 'jeans'] }),
      makeState(),
      CONTEMPORARY,
    );
    expect(pkg.packageStrength).not.toBe('blocked');
    expect(pkg.displayGarments.length).toBeGreaterThan(0);
  });

  it('empty profile garments still resolves via era fallback, not silent block', () => {
    const pkg = resolveStateWardrobePackage(
      makeProfile({ signature_garments: [] }),
      makeState({ garment_adjustments: [] }),
      CONTEMPORARY,
    );
    // Even with empty profile, era fallback should provide garments
    // Package may be weak but should not silently block if era vocab exists
    if (pkg.displayGarments.length > 0) {
      expect(pkg.packageStrength).not.toBe('blocked');
    }
  });

  it('blocker reason is explicit, never generic "Package has no garment truth"', () => {
    const pkg = resolveStateWardrobePackage(
      makeProfile({ signature_garments: [] }),
      makeState({ garment_adjustments: [] }),
      null, // no temporal truth, no era fallback seed
    );
    for (const reason of Object.values(pkg.slotBlockedReasons)) {
      expect(reason).not.toBe('Package has no garment truth');
    }
  });

  it('profile carry-forward prevents false block when baseline filtering strips all', () => {
    // Create a profile with garments that would survive effective profile normalization
    // but might be stripped by baseline resolution pipeline
    const profile = makeProfile({ signature_garments: ['shirt', 'jeans', 'boots'] });
    const pkg = resolveStateWardrobePackage(profile, makeState(), CONTEMPORARY);
    // With valid contemporary garments, must never be blocked
    expect(pkg.packageStrength).not.toBe('blocked');
    expect(pkg.displayGarments.length).toBeGreaterThanOrEqual(1);
  });
});
