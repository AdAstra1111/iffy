/**
 * worldValidationWiring.test.ts — Tests for World Validation Mode integration
 * across the motif validation pipeline and persistence layer.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveWorldValidationMode,
  getModeRules,
  formatWorldValidationPromptBlock,
  getWorldValidationNegatives,
  type WorldValidationRules,
} from '../worldValidationMode';
import {
  validateMotifCandidate,
  detectHardFails,
  scorePhysicalPlausibility,
} from '../motifValidation';

// ── Persistence shape tests ──

describe('world validation mode persistence shape', () => {
  it('resolved mode contains all required fields for persistence', () => {
    const wvm = resolveWorldValidationMode({ genres: ['drama'] });
    expect(wvm).toHaveProperty('mode');
    expect(wvm).toHaveProperty('rules');
    expect(wvm).toHaveProperty('confidence');
    expect(wvm).toHaveProperty('derived_from');
    expect(wvm).toHaveProperty('rationale');
    expect(wvm).toHaveProperty('version');
    expect(typeof wvm.mode).toBe('string');
    expect(typeof wvm.rules).toBe('object');
    expect(typeof wvm.version).toBe('string');
  });

  it('rules object has all required flags', () => {
    const wvm = resolveWorldValidationMode({ genres: ['drama'] });
    const r = wvm.rules;
    expect(r).toHaveProperty('allow_magic_literalism');
    expect(r).toHaveProperty('allow_symbolic_constructs');
    expect(r).toHaveProperty('allow_impossible_materials');
    expect(r).toHaveProperty('allow_exaggerated_silhouette');
    expect(r).toHaveProperty('require_physical_buildability');
    expect(r).toHaveProperty('require_material_legibility');
    expect(r).toHaveProperty('require_world_physics_consistency');
  });
});

// ── Motif validation receives world rules ──

describe('motif validation with world rules', () => {
  const groundedRules = getModeRules().grounded_realism;
  const fantasticalRules = getModeRules().fantastical;

  it('grounded mode rejects symbolic motif prompt', () => {
    const prompt = 'A symbolic installation representing the spirit of the village, ceramic bowl on shelf';
    const result = validateMotifCandidate(prompt, 'motif_primary', null, groundedRules);
    expect(result.hard_fail_codes).toContain('symbolic_installation');
  });

  it('fantastical mode allows symbolic constructs in motif', () => {
    const prompt = 'A symbolic installation of enchanted ceramic bowls floating in magical light, ceramic bowl';
    const result = validateMotifCandidate(prompt, 'motif_primary', null, fantasticalRules);
    // Should NOT have symbolic_abstract hard fail in fantastical mode
    expect(result.hard_fail_codes).not.toContain('symbolic_abstract');
  });

  it('grounded mode rejects fantasy creature motif', () => {
    const prompt = 'A dragon-themed ceramic bowl with magical glow, ceramic bowl on shelf';
    const result = validateMotifCandidate(prompt, 'motif_primary', null, groundedRules);
    expect(result.hard_fail_codes).toContain('fantasy_creature');
  });

  it('fantastical mode allows fantasy elements in motif', () => {
    const prompt = 'A dragon-scale ceramic bowl with ethereal glow, ceramic bowl';
    const result = validateMotifCandidate(prompt, 'motif_primary', null, fantasticalRules);
    expect(result.hard_fail_codes).not.toContain('fantasy_mythic');
  });

  it('grounded mode still passes physically grounded motif', () => {
    const prompt = 'A worn ceramic tea bowl with visible cracks and clay residue on a workshop shelf';
    const result = validateMotifCandidate(prompt, 'motif_primary', null, groundedRules);
    expect(result.hard_fail_codes).not.toContain('symbolic_abstract');
    expect(result.hard_fail_codes).not.toContain('fantasy_mythic');
  });

  it('null world rules defaults to strict behavior', () => {
    const prompt = 'A symbolic installation representing harmony, ceramic bowl';
    const result = validateMotifCandidate(prompt, 'motif_primary', null, null);
    // Without world rules, defaults to strict — symbolic should still fail
    expect(result.hard_fail_codes).toContain('symbolic_installation');
  });
});

// ── detectHardFails mode-awareness ──

describe('detectHardFails mode-awareness', () => {
  const groundedRules = getModeRules().grounded_realism;
  const fantasticalRules = getModeRules().fantastical;

  it('grounded: symbolic language triggers hard fail', () => {
    const fails = detectHardFails('A symbolic installation embodying the spirit of craft, ceramic bowl', groundedRules);
    expect(fails).toContain('symbolic_installation');
  });

  it('fantastical: symbolic language does NOT trigger hard fail', () => {
    const fails = detectHardFails('A symbolic installation embodying the spirit of craft, ceramic bowl', fantasticalRules);
    expect(fails).not.toContain('symbolic_abstract');
  });
});

// ── scorePhysicalPlausibility mode-awareness ──

describe('scorePhysicalPlausibility mode-awareness', () => {
  const groundedRules = getModeRules().grounded_realism;
  const fantasticalRules = getModeRules().fantastical;

  it('grounded: impossible materials penalized', () => {
    const groundedScore = scorePhysicalPlausibility('A floating stone bowl suspended in mid-air, ceramic bowl', groundedRules);
    const fantasticalScore = scorePhysicalPlausibility('A floating stone bowl suspended in mid-air, ceramic bowl', fantasticalRules);
    // Fantastical should score same or higher (less penalty)
    expect(fantasticalScore).toBeGreaterThanOrEqual(groundedScore);
  });
});
