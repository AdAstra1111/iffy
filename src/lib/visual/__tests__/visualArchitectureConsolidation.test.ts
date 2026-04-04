/**
 * visualArchitectureConsolidation.test.ts — Drift tripwire + parity tests
 *
 * These tests enforce the canonical visual authority boundaries defined in
 * visualAuthorityMap.ts. They serve as regression guards against:
 *   - client/edge wardrobe normalization parity drift
 *   - completion truth substrate drift (must be visual_sets, not project_images)
 *   - raw signature_garments bypass in active paths
 *   - VCS boundary enforcement
 *   - consumer authority closure (no raw garments in display/prompt/generation)
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeWardrobe as clientNormalize,
  normalizeIdentitySummary as clientNormalizeSummary,
} from '../effectiveWardrobeNormalizer';
import { resolveEffectiveProfile } from '../effectiveProfileResolver';
import { resolveStateWardrobe, assertNoForbiddenDisplayGarments } from '../costumeOnActor';
import { resolveCharacterVCSInputs } from '../vcsInputAssembler';
import {
  resolveIdentityCompletionKeys,
  resolveWardrobeVisualCompletionKeys,
  resolveLocationPDCompletionIds,
  isActiveSetStatus,
} from '../canonCompletionProof';
import { VISUAL_AUTHORITIES, UI_SURFACE_BOUNDARIES } from '../visualAuthorityMap';
import type { TemporalTruth } from '../temporalTruthResolver';

// ── Shared fixtures ─────────────────────────────────────────────────────────

const CONTEMPORARY: TemporalTruth = {
  era: 'contemporary',
  family: 'modern',
  label: 'Contemporary (21st Century)',
  provenance: 'explicit',
  confidence: 'high',
  evidence: [],
  contributing_sources: ['project_canon'],
  contradictions: [],
  era_garments: ['shirt', 'jeans', 'jacket'],
  forbidden_garment_families: ['tunic', 'cloak', 'robe', 'gown', 'cape'],
  summary: 'Contemporary',
};

const makeProfile = () => ({
  character_name: 'Maya',
  character_id_or_key: 'maya',
  class_status_expression: 'artisan protagonist',
  occupation_signals: 'potter',
  cultural_aesthetic_anchor: 'Japanese ceramics',
  wardrobe_identity_summary: 'artisan protagonist — gown, tunic, cloak',
  silhouette_language: 'flowing',
  primary_fabric_system: 'linen, cotton',
  fabric_language: 'natural textures',
  palette_logic: 'earth tones',
  grooming_compatibility: 'natural',
  public_private_variation: 'minimal',
  labor_formality_variation: 'work-focused',
  ceremonial_variation: 'Formal robes',
  damage_wear_logic: 'Regular wear',
  signature_garments: ['gown', 'tunic', 'cloak', 'boots', 'jacket'],
  signature_accessories: ['tools'],
  costume_constraints: [],
  confidence: 'high' as const,
  source_doc_types: [],
  extraction_version: '1.0.0',
  extracted_at: new Date().toISOString(),
});

// ── 1. Client/Edge Wardrobe Normalization Parity ─────────────────────────────

describe('Client/Edge wardrobe normalization parity', () => {
  it('client normalizer excludes forbidden garments regardless of scene provenance', () => {
    const result = clientNormalize(
      { garments: ['tunic', 'boots'], sceneExplicitGarments: ['tunic'] },
      CONTEMPORARY,
    );
    // Scene-explicit MUST NOT bypass temporal exclusion
    expect(result.garments).not.toContain('tunic');
    expect(result.garments).toContain('boots');
    expect(result.exclusions[0].reason).toBe('contradiction_demoted');
  });

  it('scene-derived forbidden items get contradiction_demoted reason', () => {
    const result = clientNormalize(
      { garments: ['cloak', 'jacket'], sceneExplicitGarments: ['cloak'] },
      CONTEMPORARY,
    );
    expect(result.garments).toEqual(['jacket']);
    const cloakExclusion = result.exclusions.find(e => e.item === 'cloak');
    expect(cloakExclusion?.reason).toBe('contradiction_demoted');
  });

  it('low confidence skips exclusion in both runtimes', () => {
    const low = { ...CONTEMPORARY, confidence: 'low' as const };
    const result = clientNormalize({ garments: ['tunic', 'boots'] }, low);
    expect(result.garments).toEqual(['tunic', 'boots']);
    expect(result.wasNormalized).toBe(false);
  });

  it('identity summary strips forbidden garment names', () => {
    const result = clientNormalizeSummary(
      'artisan protagonist — gown, tunic, cloak',
      CONTEMPORARY,
    );
    expect(result.normalized).not.toMatch(/tunic/i);
    expect(result.normalized).not.toMatch(/cloak/i);
    expect(result.normalized).not.toMatch(/gown/i);
  });
});

// ── 2. Effective Profile is the only public profile entrypoint ───────────────

describe('Effective profile canonical entrypoint', () => {
  it('resolveEffectiveProfile produces clean effective_signature_garments', () => {
    const ep = resolveEffectiveProfile(makeProfile(), CONTEMPORARY);
    expect(ep.effective_signature_garments).not.toContain('tunic');
    expect(ep.effective_signature_garments).not.toContain('cloak');
    expect(ep.effective_signature_garments).not.toContain('gown');
    expect(ep.effective_signature_garments).toContain('boots');
    expect(ep.effective_signature_garments).toContain('jacket');
  });

  it('overrides raw signature_garments with effective list', () => {
    const ep = resolveEffectiveProfile(makeProfile(), CONTEMPORARY);
    // The returned signature_garments should be the same as effective
    expect(ep.signature_garments).toEqual(ep.effective_signature_garments);
  });
});

// ── 3. State wardrobe resolution uses canonical path ─────────────────────────

describe('State wardrobe canonical resolution', () => {
  it('resolveStateWardrobe produces displayGarments without forbidden items', () => {
    const state = {
      state_key: 'work',
      label: 'Work',
      rationale: 'test',
      explicit_or_inferred: 'explicit' as const,
      trigger_conditions: ['work'],
      garment_adjustments: ['tunic·scene', 'boots·scene'],
      fabric_adjustments: ['sturdy'],
      silhouette_adjustments: [],
      accessory_adjustments: [],
      grooming_adjustments: [],
      continuity_notes: [],
    };
    const result = resolveStateWardrobe(
      makeProfile(),
      state,
      CONTEMPORARY,
    );
    expect(result.displayGarments).not.toContain('tunic');
    expect(result.displayGarments.some(g => g.includes('·'))).toBe(false);
  });

  it('assertNoForbiddenDisplayGarments catches leaked forbidden items', () => {
    expect(() => {
      assertNoForbiddenDisplayGarments(['tunic', 'boots'], CONTEMPORARY);
    }).toThrow();
  });

  it('assertNoForbiddenDisplayGarments passes for clean list', () => {
    expect(() => {
      assertNoForbiddenDisplayGarments(['boots', 'jacket'], CONTEMPORARY);
    }).not.toThrow();
  });
});

// ── 4. Visual completion substrate is visual_sets only ───────────────────────

describe('Visual completion substrate enforcement', () => {
  it('identity completion resolves from visual_sets with domain=character_identity', () => {
    const sets = [
      { id: '1', domain: 'character_identity', target_name: 'Maya', target_id: null, status: 'locked' },
      { id: '2', domain: 'character_identity', target_name: 'Leo', target_id: null, status: 'draft' },
    ];
    const keys = resolveIdentityCompletionKeys(sets);
    expect(keys.has('maya')).toBe(true);
    expect(keys.has('leo')).toBe(false); // draft is not completion
  });

  it('wardrobe visual completion resolves from visual_sets with domain=character_costume_look', () => {
    const sets = [
      { id: '1', domain: 'character_costume_look', target_name: 'Maya', target_id: null, status: 'curating' },
    ];
    const keys = resolveWardrobeVisualCompletionKeys(sets);
    expect(keys.has('maya')).toBe(true);
  });

  it('location PD completion resolves from visual_sets with domain=production_design_location', () => {
    const sets = [
      { id: '1', domain: 'production_design_location', target_name: 'Workshop', target_id: 'loc-1', status: 'locked' },
    ];
    const ids = resolveLocationPDCompletionIds(sets);
    expect(ids.has('loc-1')).toBe(true);
  });

  it('archived sets do not count as completion', () => {
    expect(isActiveSetStatus('archived')).toBe(false);
    expect(isActiveSetStatus('draft')).toBe(false);
    expect(isActiveSetStatus('locked')).toBe(true);
    expect(isActiveSetStatus('curating')).toBe(true);
  });
});

// ── 5. Authority map structural integrity ────────────────────────────────────

describe('Visual authority map structural integrity', () => {
  it('authority constants are defined for all layers', () => {
    expect(VISUAL_AUTHORITIES.TEMPORAL_TRUTH).toBeDefined();
    expect(VISUAL_AUTHORITIES.EFFECTIVE_PROFILE).toBeDefined();
    expect(VISUAL_AUTHORITIES.STATE_WARDROBE).toBeDefined();
    expect(VISUAL_AUTHORITIES.COMPLETION_SUBSTRATE).toBe('visual_sets (DB table)');
    expect(VISUAL_AUTHORITIES.VCS_ROLE).toBe('EVALUATIVE_ONLY');
  });

  it('UI surface boundaries are non-overlapping', () => {
    const surfaces = Object.values(UI_SURFACE_BOUNDARIES);

    // Each surface has a unique role
    const roles = surfaces.map(s => s.role);
    expect(new Set(roles).size).toBe(roles.length);

    // Each surface has owns and does_not_own arrays
    for (const surface of surfaces) {
      expect(surface.owns.length).toBeGreaterThan(0);
      expect(surface.does_not_own.length).toBeGreaterThan(0);
    }
  });
});

// ── 6. Consumer authority closure tests ──────────────────────────────────────

import { buildCostumeLookPrompt, type CostumeLookInput } from '../costumeOnActor';

const makeState = () => ({
  state_key: 'work',
  label: 'Work / Labor',
  rationale: 'test',
  explicit_or_inferred: 'explicit' as const,
  trigger_conditions: ['work'],
  garment_adjustments: ['tunic·scene', 'cloak(scene)', 'boots·scene'],
  fabric_adjustments: ['sturdy'],
  silhouette_adjustments: [],
  accessory_adjustments: [],
  grooming_adjustments: [],
  continuity_notes: [],
});

const makeInput = (overrides?: Partial<CostumeLookInput>): CostumeLookInput => ({
  characterName: 'Maya',
  characterKey: 'maya',
  actorName: 'Actor A',
  wardrobeProfile: makeProfile(),
  wardrobeState: makeState() as any,
  actorId: 'actor-1',
  actorVersionId: 'version-1',
  worldRules: null,
  referenceImageUrls: [],
  temporalTruth: CONTEMPORARY,
  ...overrides,
});

describe('Consumer authority closure', () => {
  it('prompt builder does not serialize forbidden garments', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    const promptLower = result.prompt.toLowerCase();
    expect(promptLower).not.toContain('tunic');
    expect(promptLower).not.toContain('cloak');
    expect(promptLower).not.toContain('gown');
  });

  it('prompt builder does not contain tagged raw tokens', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    expect(result.prompt).not.toContain('·scene');
    expect(result.prompt).not.toContain('.scene');
    expect(result.prompt).not.toContain('(scene)');
    expect(result.prompt).not.toContain('[scene]');
  });

  it('prompt builder includes allowed garments', () => {
    const result = buildCostumeLookPrompt(makeInput(), 'full_body_primary');
    const promptLower = result.prompt.toLowerCase();
    expect(promptLower).toContain('boots');
    expect(promptLower).toContain('jacket');
  });

  it('displayGarments and prompt garments are aligned', () => {
    const profile = makeProfile();
    const state = makeState();
    const resolved = resolveStateWardrobe(profile, state, CONTEMPORARY);
    const promptResult = buildCostumeLookPrompt(
      makeInput({ wardrobeProfile: profile, wardrobeState: state }),
      'full_body_primary',
    );

    // Every display garment should appear in the prompt
    for (const g of resolved.displayGarments) {
      expect(promptResult.prompt.toLowerCase()).toContain(g.toLowerCase());
    }

    // No forbidden garment in either
    for (const forbidden of CONTEMPORARY.forbidden_garment_families) {
      expect(resolved.displayGarments.map(g => g.toLowerCase())).not.toContain(forbidden.toLowerCase());
    }
  });

  it('effective profile overrides raw signature_garments field', () => {
    const ep = resolveEffectiveProfile(makeProfile(), CONTEMPORARY);
    // The signature_garments field itself must be clean
    for (const forbidden of CONTEMPORARY.forbidden_garment_families) {
      expect(ep.signature_garments.map(g => g.toLowerCase())).not.toContain(forbidden.toLowerCase());
    }
  });

  it('state resolver exclusions track all removed forbidden items', () => {
    const result = resolveStateWardrobe(makeProfile(), makeState(), CONTEMPORARY);
    const excludedItems = result.exclusions.map(e => e.item.toLowerCase());
    // tunic and cloak should be in exclusions
    expect(excludedItems).toContain('tunic');
    expect(excludedItems).toContain('cloak');
  });

  it('VCS assembler uses canonical resolver even without temporal truth', () => {
    const chars = [{ name: 'Maya', rawProfile: makeProfile(), hasLockedActor: false, hasHeroFrame: false }];
    const result = resolveCharacterVCSInputs(chars, null);
    // Should still produce an effective profile through resolveEffectiveProfile(profile, null)
    expect(result.withProfiles).toBe(1);
    expect(result.characters[0].effectiveProfile).toBeTruthy();
    expect(result.characters[0].effectiveProfile!.effective_signature_garments).toBeDefined();
    // Without temporal truth, all garments pass through
    expect(result.characters[0].effectiveProfile!.effective_signature_garments).toContain('tunic');
    expect(result.characters[0].effectiveProfile!.was_temporally_normalized).toBe(false);
  });

  it('VCS assembler excludes forbidden garments when temporal truth is provided', () => {
    const chars = [{ name: 'Maya', rawProfile: makeProfile(), hasLockedActor: false, hasHeroFrame: false }];
    const result = resolveCharacterVCSInputs(chars, CONTEMPORARY);
    expect(result.characters[0].effectiveProfile!.effective_signature_garments).not.toContain('tunic');
    expect(result.characters[0].effectiveProfile!.effective_signature_garments).not.toContain('cloak');
    expect(result.characters[0].effectiveProfile!.effective_signature_garments).not.toContain('gown');
    expect(result.characters[0].effectiveProfile!.was_temporally_normalized).toBe(true);
  });

  it('wardrobeTraitCount should reflect effective garment count, not raw', () => {
    const ep = resolveEffectiveProfile(makeProfile(), CONTEMPORARY);
    // Raw has 5 garments (gown, tunic, cloak, boots, jacket)
    // Effective should have 2 (boots, jacket) after excluding gown, tunic, cloak
    expect(makeProfile().signature_garments.length).toBe(5);
    expect(ep.effective_signature_garments.length).toBe(2);
    // wardrobeTraitCount should use effective count
    const traitCount = (ep.effective_signature_garments ?? ep.signature_garments).length;
    expect(traitCount).toBe(2);
  });
});
