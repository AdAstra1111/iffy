/**
 * stateWardrobeReconstruction.test.ts — Proves state-semantic reconstruction
 * prevents collapse of distinct states into identical generic garment arrays.
 */

import { describe, it, expect } from 'vitest';
import { resolveStateWardrobe } from '../costumeOnActor';
import { reconstructStateGarments, classifyStateCategory, detectStateCollapse } from '../stateWardrobeReconstructor';
import type { CharacterWardrobeProfile, WardrobeStateDefinition } from '../characterWardrobeExtractor';
import type { TemporalTruth } from '../temporalTruthResolver';

// ── Fixtures ────────────────────────────────────────────────────────────────

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
  forbidden_garment_families: ['tunic', 'cloak', 'robe', 'gown', 'cape', 'doublet', 'toga'],
  summary: 'Contemporary',
};

const WESTERN: TemporalTruth = {
  era: 'western',
  family: 'historical',
  label: 'Old West (1860s-1890s)',
  provenance: 'explicit',
  confidence: 'high',
  evidence: [],
  contributing_sources: ['project_canon'],
  contradictions: [],
  era_garments: ['shirt', 'trousers', 'boots', 'hat'],
  forbidden_garment_families: ['kimono', 'toga', 'jumpsuit', 'hoodie', 'sneakers', 't-shirt'],
  summary: 'Old West',
};

const MEDIEVAL: TemporalTruth = {
  era: 'medieval',
  family: 'historical',
  label: 'Medieval',
  provenance: 'explicit',
  confidence: 'high',
  evidence: [],
  contributing_sources: ['project_canon'],
  contradictions: [],
  era_garments: ['tunic', 'cloak', 'boots'],
  forbidden_garment_families: ['jeans', 't-shirt', 'sneakers', 'hoodie', 'jumpsuit'],
  summary: 'Medieval',
};

function makeProfile(overrides: Partial<CharacterWardrobeProfile> = {}): CharacterWardrobeProfile {
  return {
    character_name: 'TestChar',
    character_id_or_key: 'testchar',
    wardrobe_identity_summary: 'A working-class character',
    silhouette_language: 'fitted',
    fabric_language: 'cotton, linen',
    palette_logic: 'earth tones',
    grooming_compatibility: 'practical',
    class_status_expression: 'working class',
    public_private_variation: 'Minimal variation',
    labor_formality_variation: 'Work state defined by manual labor',
    ceremonial_variation: 'Limited ceremonial context',
    damage_wear_logic: 'Regular wear expected',
    signature_garments: ['tunic', 'cloak', 'boots'],  // tunic+cloak will be excluded in contemporary
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

// ── State Category Classification ───────────────────────────────────────────

describe('classifyStateCategory', () => {
  it('classifies work/labor states', () => {
    expect(classifyStateCategory(makeState({ label: 'Work / Labor' }))).toBe('work_labor');
    expect(classifyStateCategory(makeState({ state_key: 'occupation_duty' }))).toBe('work_labor');
  });

  it('classifies ceremonial states', () => {
    expect(classifyStateCategory(makeState({ label: 'Ceremonial Dress' }))).toBe('ceremonial');
    expect(classifyStateCategory(makeState({ label: 'Wedding Attire' }))).toBe('ceremonial');
  });

  it('classifies distress states', () => {
    expect(classifyStateCategory(makeState({ label: 'Distress / Aftermath' }))).toBe('distress_aftermath');
    expect(classifyStateCategory(makeState({ label: 'Wounded Escape' }))).toBe('distress_aftermath');
  });

  it('classifies public/formal states', () => {
    expect(classifyStateCategory(makeState({ label: 'Public / Formal' }))).toBe('public_formal');
  });

  it('classifies domestic/private states', () => {
    expect(classifyStateCategory(makeState({ label: 'Domestic / Private' }))).toBe('domestic_private');
  });

  it('falls back to default for unrecognized labels', () => {
    expect(classifyStateCategory(makeState({ label: 'Ambiguous Thing' }))).toBe('default');
  });
});

// ── State Reconstruction ────────────────────────────────────────────────────

describe('reconstructStateGarments', () => {
  const profile = makeProfile();

  it('produces different garments for different state categories', () => {
    const workResult = reconstructStateGarments(
      profile,
      makeState({ label: 'Work / Labor' }),
      CONTEMPORARY,
    );
    const ceremonialResult = reconstructStateGarments(
      profile,
      makeState({ label: 'Ceremonial Dress' }),
      CONTEMPORARY,
    );
    const distressResult = reconstructStateGarments(
      profile,
      makeState({ label: 'Distress / Aftermath' }),
      CONTEMPORARY,
    );

    // Each should produce state-specific garments
    expect(workResult.isStateSpecific).toBe(true);
    expect(ceremonialResult.isStateSpecific).toBe(true);
    expect(distressResult.isStateSpecific).toBe(true);

    // They should NOT be identical
    const workFp = workResult.garments.sort().join('|');
    const ceremFp = ceremonialResult.garments.sort().join('|');
    const distressFp = distressResult.garments.sort().join('|');

    expect(workFp).not.toBe(ceremFp);
    expect(workFp).not.toBe(distressFp);
    expect(ceremFp).not.toBe(distressFp);
  });

  it('never returns forbidden garments', () => {
    const result = reconstructStateGarments(
      profile,
      makeState({ label: 'Ceremonial Dress' }),
      CONTEMPORARY,
    );
    const forbiddenSet = new Set(CONTEMPORARY.forbidden_garment_families.map(g => g.toLowerCase()));
    for (const g of result.garments) {
      for (const word of g.toLowerCase().split(/\s+/)) {
        expect(forbiddenSet.has(word)).toBe(false);
      }
    }
  });

  it('adapts garments to era family', () => {
    const modernWork = reconstructStateGarments(profile, makeState({ label: 'Work / Labor' }), CONTEMPORARY);
    const westernWork = reconstructStateGarments(profile, makeState({ label: 'Work / Labor' }), WESTERN);

    // Both should be state-specific but era-different
    expect(modernWork.garments.join('|')).not.toBe(westernWork.garments.join('|'));
  });

  it('applies class modifier to primary garment', () => {
    const eliteProfile = makeProfile({ class_status_expression: 'elite aristocrat' });
    const result = reconstructStateGarments(eliteProfile, makeState({ label: 'Public / Formal' }), CONTEMPORARY);
    // Elite should get quality-prefixed garments
    expect(result.garments.some(g => g.includes('fine'))).toBe(true);
  });
});

// ── Collapse Detection ──────────────────────────────────────────────────────

describe('detectStateCollapse', () => {
  it('detects collapse when 3+ states share identical garments', () => {
    const states = [
      { stateKey: 'work', label: 'Work', displayGarments: ['boots', 'hat', 'jacket'] },
      { stateKey: 'ceremony', label: 'Ceremony', displayGarments: ['boots', 'hat', 'jacket'] },
      { stateKey: 'travel', label: 'Travel', displayGarments: ['boots', 'hat', 'jacket'] },
    ];
    const result = detectStateCollapse(states);
    expect(result.collapsed).toBe(true);
    expect(result.collapseCount).toBe(3);
    expect(result.diagnostic).toContain('collapsed');
  });

  it('does not flag when states have different garments', () => {
    const states = [
      { stateKey: 'work', label: 'Work', displayGarments: ['work shirt', 'trousers'] },
      { stateKey: 'ceremony', label: 'Ceremony', displayGarments: ['formal suit', 'dress shoes'] },
      { stateKey: 'travel', label: 'Travel', displayGarments: ['jacket', 'travel boots'] },
    ];
    const result = detectStateCollapse(states);
    expect(result.collapsed).toBe(false);
    expect(result.distinctArrays).toBe(3);
  });
});

// ── Integration: resolveStateWardrobe Non-Collapse ──────────────────────────

describe('resolveStateWardrobe state differentiation', () => {
  it('produces different displayGarments for work vs ceremonial vs distress', () => {
    const profile = makeProfile(); // has tunic+cloak (will be excluded in contemporary) + boots

    const workResolved = resolveStateWardrobe(
      profile,
      makeState({ label: 'Work / Labor', state_key: 'work' }),
      CONTEMPORARY,
    );
    const ceremonialResolved = resolveStateWardrobe(
      profile,
      makeState({ label: 'Ceremonial Dress', state_key: 'ceremony' }),
      CONTEMPORARY,
    );
    const distressResolved = resolveStateWardrobe(
      profile,
      makeState({ label: 'Distress / Aftermath', state_key: 'distress' }),
      CONTEMPORARY,
    );

    // All should have used state reconstruction since profile residue is just 'boots'
    expect(workResolved.usedStateReconstruction || workResolved.displayGarments.length > 1).toBe(true);
    expect(ceremonialResolved.usedStateReconstruction || ceremonialResolved.displayGarments.length > 1).toBe(true);
    expect(distressResolved.usedStateReconstruction || distressResolved.displayGarments.length > 1).toBe(true);

    // They should NOT all be identical
    const workFp = [...workResolved.displayGarments].sort().join('|').toLowerCase();
    const ceremFp = [...ceremonialResolved.displayGarments].sort().join('|').toLowerCase();
    const distressFp = [...distressResolved.displayGarments].sort().join('|').toLowerCase();

    // At least two of three should differ
    const allSame = workFp === ceremFp && ceremFp === distressFp;
    expect(allSame).toBe(false);
  });

  it('does not reintroduce forbidden garments via reconstruction', () => {
    const profile = makeProfile();
    const resolved = resolveStateWardrobe(
      profile,
      makeState({ label: 'Ceremonial Dress', state_key: 'ceremony' }),
      CONTEMPORARY,
    );

    const forbiddenSet = new Set(CONTEMPORARY.forbidden_garment_families.map(g => g.toLowerCase()));
    for (const g of resolved.displayGarments) {
      for (const word of g.toLowerCase().split(/\s+/)) {
        expect(forbiddenSet.has(word)).toBe(false);
      }
    }
  });

  it('explicit scene-backed states retain more specificity', () => {
    const profile = makeProfile();
    const explicitState = makeState({
      label: 'Work / Labor',
      state_key: 'work',
      explicit_or_inferred: 'explicit',
      garment_adjustments: ['leather apron', 'work boots'],
      trigger_conditions: ['scene:sc_5'],
    });
    const inferredState = makeState({
      label: 'Work / Labor',
      state_key: 'work_inferred',
      explicit_or_inferred: 'inferred',
    });

    const explicitResolved = resolveStateWardrobe(profile, explicitState, CONTEMPORARY);
    const inferredResolved = resolveStateWardrobe(profile, inferredState, CONTEMPORARY);

    // Explicit should have scene-derived garments
    expect(explicitResolved.garmentSources.some(s => s.source === 'scene')).toBe(true);
    expect(explicitResolved.isSceneDerived).toBe(true);

    // Inferred should not
    expect(inferredResolved.isSceneDerived).toBe(false);
  });

  it('reports stateCategory and reconstruction status', () => {
    const profile = makeProfile();
    const resolved = resolveStateWardrobe(
      profile,
      makeState({ label: 'Work / Labor' }),
      CONTEMPORARY,
    );
    expect(resolved.stateCategory).toBe('work_labor');
    // Should have metadata about whether reconstruction was used
    expect(typeof resolved.usedStateReconstruction).toBe('boolean');
    expect(typeof resolved.degradationDiagnostic).toBe('string');
  });

  it('collapse detection works across resolved states', () => {
    const profile = makeProfile();
    const states = [
      makeState({ label: 'Work / Labor', state_key: 'work' }),
      makeState({ label: 'Ceremonial Dress', state_key: 'ceremony' }),
      makeState({ label: 'Distress / Aftermath', state_key: 'distress' }),
      makeState({ label: 'Public / Formal', state_key: 'public' }),
    ];

    const results = states.map(s => {
      const resolved = resolveStateWardrobe(profile, s, CONTEMPORARY);
      return { stateKey: s.state_key, label: s.label, displayGarments: resolved.displayGarments };
    });

    const collapse = detectStateCollapse(results);
    // With reconstruction, we should NOT have universal collapse
    expect(collapse.distinctArrays).toBeGreaterThan(1);
  });
});
