/**
 * Tests for worldValidationMode.ts — World Validation Mode derivation and rule enforcement.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveWorldValidationMode,
  formatWorldValidationPromptBlock,
  getWorldValidationNegatives,
  getActiveConstraintsSummary,
  getModeRules,
  type WorldValidationModeName,
  type WorldValidationInput,
} from '../worldValidationMode';

// ── Derivation Tests ────────────────────────────────────────────────────────

describe('resolveWorldValidationMode', () => {
  it('resolves grounded_realism for historical drama', () => {
    const result = resolveWorldValidationMode({
      genres: ['drama', 'historical'],
      tone_style: 'gritty, naturalistic, understated',
      world_rules: 'Strict feudal hierarchy. Period accurate.',
    });
    expect(result.mode).toBe('grounded_realism');
    expect(result.confidence).toBe('high');
  });

  it('resolves grounded_realism for crime thriller', () => {
    const result = resolveWorldValidationMode({
      genres: ['crime', 'thriller'],
      tone_style: 'raw, unflinching',
    });
    expect(result.mode).toBe('grounded_realism');
  });

  it('resolves heightened_realism for romantic melodrama', () => {
    const result = resolveWorldValidationMode({
      genres: ['romance', 'melodrama'],
      tone_style: 'passionate, lush, theatrical',
    });
    expect(result.mode).toBe('heightened_realism');
  });

  it('resolves heightened_realism for period romance', () => {
    const result = resolveWorldValidationMode({
      genres: ['period', 'romance'],
      tone_style: 'sweeping, grand',
    });
    expect(result.mode).toBe('heightened_realism');
  });

  it('resolves mythic_symbolic for folkloric project', () => {
    const result = resolveWorldValidationMode({
      genres: ['mythology', 'folkloric'],
      tone_style: 'mythic, ritualistic, timeless',
    });
    expect(result.mode).toBe('mythic_symbolic');
  });

  it('resolves mythic_symbolic for magical realism', () => {
    const result = resolveWorldValidationMode({
      genres: ['magical realism'],
      tone_style: 'spiritual, archetypal',
    });
    expect(result.mode).toBe('mythic_symbolic');
  });

  it('resolves fantastical for high fantasy', () => {
    const result = resolveWorldValidationMode({
      genres: ['high fantasy'],
      tone_style: 'magical, otherworldly',
      world_rules: 'Magic systems, enchanted forests, dragon riders',
    });
    expect(result.mode).toBe('fantastical');
    expect(result.confidence).toBe('high');
  });

  it('resolves fantastical for sci-fi', () => {
    const result = resolveWorldValidationMode({
      genres: ['sci-fi'],
      tone_style: 'cosmic, transcendent',
    });
    expect(result.mode).toBe('fantastical');
  });

  it('defaults to heightened_realism with no signals', () => {
    const result = resolveWorldValidationMode({});
    expect(result.mode).toBe('heightened_realism');
    expect(result.confidence).toBe('low');
  });

  it('respects explicit override', () => {
    const result = resolveWorldValidationMode(
      { genres: ['drama'] },
      'fantastical',
    );
    expect(result.mode).toBe('fantastical');
    expect(result.confidence).toBe('high');
    expect(result.derived_from).toContain('explicit_override');
  });

  it('uses world_rules magic signals to push toward fantastical', () => {
    const result = resolveWorldValidationMode({
      world_rules: 'A world where sorcerers wield arcane power and dragons roam the skies',
    });
    expect(result.mode).toBe('fantastical');
  });

  it('grounded world_rules strengthen grounded_realism', () => {
    const result = resolveWorldValidationMode({
      genres: ['drama'],
      world_rules: 'Real world contemporary setting, no supernatural elements',
    });
    expect(result.mode).toBe('grounded_realism');
  });

  it('includes correct derived_from fields', () => {
    const result = resolveWorldValidationMode({
      genres: ['drama'],
      tone_style: 'gritty',
      world_rules: 'Historical period',
    });
    expect(result.derived_from).toContain('genres');
    expect(result.derived_from).toContain('tone_style');
    expect(result.derived_from).toContain('world_rules');
  });
});

// ── Rule Enforcement Tests ──────────────────────────────────────────────────

describe('mode rule definitions', () => {
  const rules = getModeRules();

  it('grounded_realism disallows all fantasy/symbolic elements', () => {
    const r = rules.grounded_realism;
    expect(r.allow_magic_literalism).toBe(false);
    expect(r.allow_symbolic_constructs).toBe(false);
    expect(r.allow_impossible_materials).toBe(false);
    expect(r.allow_exaggerated_silhouette).toBe(false);
    expect(r.require_physical_buildability).toBe(true);
    expect(r.require_material_legibility).toBe(true);
    expect(r.require_world_physics_consistency).toBe(true);
  });

  it('heightened_realism allows silhouette exaggeration only', () => {
    const r = rules.heightened_realism;
    expect(r.allow_magic_literalism).toBe(false);
    expect(r.allow_symbolic_constructs).toBe(false);
    expect(r.allow_exaggerated_silhouette).toBe(true);
    expect(r.require_physical_buildability).toBe(true);
  });

  it('mythic_symbolic allows symbolic constructs but not magic', () => {
    const r = rules.mythic_symbolic;
    expect(r.allow_magic_literalism).toBe(false);
    expect(r.allow_symbolic_constructs).toBe(true);
    expect(r.require_physical_buildability).toBe(true);
  });

  it('fantastical allows everything', () => {
    const r = rules.fantastical;
    expect(r.allow_magic_literalism).toBe(true);
    expect(r.allow_symbolic_constructs).toBe(true);
    expect(r.allow_impossible_materials).toBe(true);
    expect(r.allow_exaggerated_silhouette).toBe(true);
    expect(r.require_physical_buildability).toBe(false);
    expect(r.require_material_legibility).toBe(false);
    expect(r.require_world_physics_consistency).toBe(false);
  });
});

// ── Prompt Block Tests ──────────────────────────────────────────────────────

describe('formatWorldValidationPromptBlock', () => {
  it('grounded mode includes buildability and anti-magic constraints', () => {
    const wvm = resolveWorldValidationMode({ genres: ['drama'], tone_style: 'gritty' });
    const block = formatWorldValidationPromptBlock(wvm);
    expect(block).toContain('WORLD VALIDATION MODE');
    expect(block).toContain('physically constructible');
    expect(block).toContain('DO NOT depict literal magic');
  });

  it('fantastical mode does NOT include anti-magic constraints', () => {
    const wvm = resolveWorldValidationMode({}, 'fantastical');
    const block = formatWorldValidationPromptBlock(wvm);
    expect(block).not.toContain('DO NOT depict literal magic');
    expect(block).not.toContain('physically constructible');
  });
});

// ── Negative Prompt Tests ───────────────────────────────────────────────────

describe('getWorldValidationNegatives', () => {
  it('grounded mode has substantial negatives', () => {
    const wvm = resolveWorldValidationMode({}, 'grounded_realism');
    const neg = getWorldValidationNegatives(wvm);
    expect(neg).toContain('magical glow');
    expect(neg).toContain('symbolic installation');
    expect(neg).toContain('floating objects');
  });

  it('fantastical mode has minimal negatives', () => {
    const wvm = resolveWorldValidationMode({}, 'fantastical');
    const neg = getWorldValidationNegatives(wvm);
    expect(neg).toBe('');
  });
});

// ── Summary Tests ───────────────────────────────────────────────────────────

describe('getActiveConstraintsSummary', () => {
  it('grounded mode lists restriction constraints', () => {
    const wvm = resolveWorldValidationMode({}, 'grounded_realism');
    const summary = getActiveConstraintsSummary(wvm);
    expect(summary.some(s => s.includes('physically buildable'))).toBe(true);
    expect(summary.some(s => s.includes('No literal magic'))).toBe(true);
  });

  it('fantastical mode lists permission grants', () => {
    const wvm = resolveWorldValidationMode({}, 'fantastical');
    const summary = getActiveConstraintsSummary(wvm);
    expect(summary.some(s => s.includes('Magic and supernatural forces allowed'))).toBe(true);
  });
});
