/**
 * stateWardrobePanelContract.test.ts — Proves the panel contract:
 * - state rows render displayGarments (canonical resolved)
 * - reconstruction metadata is available
 * - collapse diagnostics surface at threshold
 * - distinct states produce distinct garment sets
 * - profile residue does not dominate reconstructed states
 */

import { describe, it, expect } from 'vitest';
import { resolveStateWardrobe } from '../costumeOnActor';
import { detectStateCollapse } from '../stateWardrobeReconstructor';
import type { CharacterWardrobeProfile, WardrobeStateDefinition } from '../characterWardrobeExtractor';
import type { TemporalTruth } from '../temporalTruthResolver';

// ── Fixtures ────────────────────────────────────────────────────────────────

const CONTEMPORARY: TemporalTruth = {
  era: 'contemporary',
  family: 'modern',
  label: 'Contemporary',
  provenance: 'explicit',
  confidence: 'high',
  evidence: [],
  contributing_sources: ['canon'],
  contradictions: [],
  era_garments: ['shirt', 'jeans', 'jacket'],
  forbidden_garment_families: ['tunic', 'cloak', 'robe', 'gown', 'cape', 'doublet', 'toga'],
  summary: 'Contemporary',
};

function makeProfile(overrides: Partial<CharacterWardrobeProfile> = {}): CharacterWardrobeProfile {
  return {
    character_name: 'TestChar',
    character_id_or_key: 'testchar',
    wardrobe_identity_summary: 'A working-class character in tunic and cloak',
    silhouette_language: 'fitted',
    fabric_language: 'cotton, linen',
    palette_logic: 'earth tones',
    grooming_compatibility: 'practical',
    class_status_expression: 'working class',
    public_private_variation: 'Minimal variation',
    labor_formality_variation: 'Work defined by manual labor',
    ceremonial_variation: 'Limited ceremonial context',
    damage_wear_logic: 'Regular wear expected',
    // These will be mostly excluded in contemporary era
    signature_garments: ['tunic', 'cloak', 'boots'],
    signature_accessories: [],
    costume_constraints: [],
    confidence: 'high',
    source_doc_types: ['canon'],
    extraction_version: '1.3.0',
    extracted_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeState(overrides: Partial<WardrobeStateDefinition> = {}): WardrobeStateDefinition {
  return {
    state_key: 'default',
    label: 'Default',
    rationale: 'Base state',
    explicit_or_inferred: 'inferred',
    trigger_conditions: [],
    garment_adjustments: [],
    fabric_adjustments: [],
    silhouette_adjustments: [],
    accessory_adjustments: [],
    grooming_adjustments: [],
    continuity_notes: [],
    ...overrides,
  };
}

// ── Panel Contract Tests ────────────────────────────────────────────────────

describe('Panel contract: resolved state wardrobe', () => {
  it('resolveStateWardrobe returns all panel-required fields', () => {
    const profile = makeProfile();
    const resolved = resolveStateWardrobe(profile, makeState({ label: 'Work / Labor' }), CONTEMPORARY);

    // All fields the panel reads must exist
    expect(resolved).toHaveProperty('displayGarments');
    expect(resolved).toHaveProperty('displayFabrics');
    expect(resolved).toHaveProperty('garmentSources');
    expect(resolved).toHaveProperty('fabricSources');
    expect(resolved).toHaveProperty('exclusions');
    expect(resolved).toHaveProperty('stateCategory');
    expect(resolved).toHaveProperty('usedStateReconstruction');
    expect(resolved).toHaveProperty('degradationDiagnostic');
    expect(resolved).toHaveProperty('isSceneDerived');
    expect(resolved).toHaveProperty('sceneKeys');

    // Type checks
    expect(Array.isArray(resolved.displayGarments)).toBe(true);
    expect(Array.isArray(resolved.displayFabrics)).toBe(true);
    expect(typeof resolved.stateCategory).toBe('string');
    expect(typeof resolved.usedStateReconstruction).toBe('boolean');
    expect(typeof resolved.degradationDiagnostic).toBe('string');
  });

  it('garmentSources has same length as displayGarments', () => {
    const profile = makeProfile();
    const resolved = resolveStateWardrobe(profile, makeState({ label: 'Work / Labor' }), CONTEMPORARY);

    // Each display garment should have a source entry
    expect(resolved.garmentSources.length).toBe(resolved.displayGarments.length);
  });
});

describe('Panel contract: state differentiation', () => {
  const DISTINCT_STATES = [
    makeState({ label: 'Work / Labor', state_key: 'work' }),
    makeState({ label: 'Ceremonial Dress', state_key: 'ceremony' }),
    makeState({ label: 'Distress / Aftermath', state_key: 'distress' }),
    makeState({ label: 'Public / Formal', state_key: 'public' }),
    makeState({ label: 'Domestic / Private', state_key: 'domestic' }),
    makeState({ label: 'Travel', state_key: 'travel' }),
  ];

  it('at least 4 distinct garment arrays across 6 distinct state categories', () => {
    const profile = makeProfile();
    const fingerprints = new Set<string>();

    for (const state of DISTINCT_STATES) {
      const resolved = resolveStateWardrobe(profile, state, CONTEMPORARY);
      const fp = [...resolved.displayGarments].sort().join('|').toLowerCase();
      fingerprints.add(fp);
    }

    // With proper state reconstruction, we should have at least 4 distinct arrays
    expect(fingerprints.size).toBeGreaterThanOrEqual(4);
  });

  it('work and ceremonial never produce identical garments', () => {
    const profile = makeProfile();
    const work = resolveStateWardrobe(profile, makeState({ label: 'Work / Labor' }), CONTEMPORARY);
    const ceremony = resolveStateWardrobe(profile, makeState({ label: 'Ceremonial Dress' }), CONTEMPORARY);

    const workFp = [...work.displayGarments].sort().join('|').toLowerCase();
    const ceremFp = [...ceremony.displayGarments].sort().join('|').toLowerCase();
    expect(workFp).not.toBe(ceremFp);
  });

  it('distress and public/formal never produce identical garments', () => {
    const profile = makeProfile();
    const distress = resolveStateWardrobe(profile, makeState({ label: 'Distress / Aftermath' }), CONTEMPORARY);
    const formal = resolveStateWardrobe(profile, makeState({ label: 'Public / Formal' }), CONTEMPORARY);

    const distressFp = [...distress.displayGarments].sort().join('|').toLowerCase();
    const formalFp = [...formal.displayGarments].sort().join('|').toLowerCase();
    expect(distressFp).not.toBe(formalFp);
  });
});

describe('Panel contract: profile residue not dominating', () => {
  it('reconstructed states do not contain profile residue when reconstruction fires', () => {
    const profile = makeProfile(); // tunic + cloak (excluded) + boots (surviving profile residue)
    const resolved = resolveStateWardrobe(
      profile,
      makeState({ label: 'Ceremonial Dress', state_key: 'ceremony' }),
      CONTEMPORARY,
    );

    if (resolved.usedStateReconstruction) {
      // When reconstruction fires, profile-sourced garments should not dominate
      const profileSourced = resolved.garmentSources.filter(s => s.source === 'profile');
      const inferredSourced = resolved.garmentSources.filter(s => s.source === 'inferred');
      // Inferred (reconstructed) should outnumber or equal profile residue
      expect(inferredSourced.length).toBeGreaterThanOrEqual(profileSourced.length);
    }
  });

  it('profile residue (e.g. boots) does not appear as only garment across all states', () => {
    const profile = makeProfile();
    const states = [
      makeState({ label: 'Work / Labor', state_key: 'work' }),
      makeState({ label: 'Ceremonial Dress', state_key: 'ceremony' }),
      makeState({ label: 'Distress / Aftermath', state_key: 'distress' }),
    ];

    for (const state of states) {
      const resolved = resolveStateWardrobe(profile, state, CONTEMPORARY);
      // No state should resolve to just ['boots'] alone
      expect(resolved.displayGarments.length).toBeGreaterThan(1);
    }
  });
});

describe('Panel contract: collapse detection integration', () => {
  it('detectStateCollapse catches N-state collapse at threshold 3', () => {
    // Simulate a truly collapsed scenario (all same garments)
    const collapsed = detectStateCollapse([
      { stateKey: 'a', label: 'A', displayGarments: ['boots'] },
      { stateKey: 'b', label: 'B', displayGarments: ['boots'] },
      { stateKey: 'c', label: 'C', displayGarments: ['boots'] },
    ]);
    expect(collapsed.collapsed).toBe(true);
    expect(collapsed.diagnostic).toContain('collapsed');
  });

  it('collapse does NOT trigger with reconstructed differentiated states', () => {
    const profile = makeProfile();
    const states = [
      makeState({ label: 'Work / Labor', state_key: 'work' }),
      makeState({ label: 'Ceremonial Dress', state_key: 'ceremony' }),
      makeState({ label: 'Distress / Aftermath', state_key: 'distress' }),
      makeState({ label: 'Public / Formal', state_key: 'public' }),
    ];

    const resolved = states.map(s => ({
      stateKey: s.state_key,
      label: s.label,
      displayGarments: resolveStateWardrobe(profile, s, CONTEMPORARY).displayGarments,
    }));

    const collapse = detectStateCollapse(resolved);
    // After reconstruction, should NOT collapse
    expect(collapse.collapsed).toBe(false);
  });
});

describe('Panel contract: forbidden garments never appear', () => {
  it('no forbidden garment in any reconstructed state display array', () => {
    const profile = makeProfile();
    const forbiddenSet = new Set(CONTEMPORARY.forbidden_garment_families.map(g => g.toLowerCase()));

    const states = [
      makeState({ label: 'Work / Labor' }),
      makeState({ label: 'Ceremonial Dress' }),
      makeState({ label: 'Distress / Aftermath' }),
      makeState({ label: 'Public / Formal' }),
      makeState({ label: 'Domestic / Private' }),
      makeState({ label: 'Travel' }),
      makeState({ label: 'Disguise / Concealment' }),
      makeState({ label: 'Weather-Adapted' }),
    ];

    for (const state of states) {
      const resolved = resolveStateWardrobe(profile, state, CONTEMPORARY);
      for (const g of resolved.displayGarments) {
        for (const word of g.toLowerCase().split(/\s+/)) {
          expect(forbiddenSet.has(word)).toBe(false);
        }
      }
    }
  });
});
